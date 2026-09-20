#import "authorization.h"

NSString *HEValidateAnchoredQuery(HKSampleType *type) {
  @try {
    (void)[[HKAnchoredObjectQuery alloc] initWithType:type predicate:nil anchor:nil limit:25
      resultsHandler:^(HKAnchoredObjectQuery *query, NSArray *samples, NSArray *deleted, HKQueryAnchor *anchor, NSError *error) {}];
    return nil;
  } @catch (NSException *exception) { return exception.reason; }
}

@interface RejectingObservationStore : HKHealthStore
@property NSInteger mode;
@end
@implementation RejectingObservationStore
- (void)executeQuery:(HKQuery *)query {
  if (self.mode == 0) [NSException raise:NSInvalidArgumentException format:@"Observer execution rejected"];
}
- (void)enableBackgroundDeliveryForType:(HKObjectType *)type frequency:(HKUpdateFrequency)frequency withCompletion:(void (^)(BOOL, NSError *))completion {
  if (self.mode == 0) [NSException raise:NSInvalidArgumentException format:@"Background delivery rejected"];
  else if (self.mode == 1) completion(NO, [NSError errorWithDomain:@"fixture" code:42 userInfo:nil]);
  else completion(YES, nil);
}
@end

void HETestObservationExceptions(void) {
  RejectingObservationStore *store = [RejectingObservationStore new];
  HKSampleType *type = [HKObjectType quantityTypeForIdentifier:HKQuantityTypeIdentifierStepCount];
  NSError *error = nil;
  HKObserverQuery *query = HECreateObserver(type, ^(HKObserverQuery *q, HKObserverQueryCompletionHandler completion, NSError *e) {}, &error);
  NSCAssert(query && !error, @"Supported observer must be created");
  for (NSInteger mode = 0; mode < 3; mode++) {
    store.mode = mode;
    BOOL started = HEStartObserver(store, query, &error);
    NSCAssert(started == (mode != 0), @"Observer registration must return failure instead of crashing");
    NSCAssert((error != nil) == (mode == 0), @"Clear previous errors on success");
    __block NSInteger calls = 0;
    HEEnableBackgroundDelivery(store, type, ^(BOOL success, NSError *failure) {
      calls++;
      NSCAssert(success == (mode == 2), @"Preserve background delivery result");
      if (mode == 0) NSCAssert([failure.domain isEqualToString:@"HealthExporter.Observation"], @"Catch native exceptions");
      else if (mode == 1) NSCAssert(failure.code == 42, @"Preserve ordinary failures");
      else NSCAssert(failure == nil, @"Success has no error");
    });
    NSCAssert(calls == 1, @"Complete each delivery request exactly once");
  }
}
