#import "authorization.h"

NSString *HEValidateReadTypes(NSSet<HKObjectType *> *types) {
  @try {
    [[HKHealthStore new] getRequestStatusForAuthorizationToShareTypes:[NSSet set] readTypes:types
      completion:^(HKAuthorizationRequestStatus status, NSError *error) {}];
    return nil;
  } @catch (NSException *exception) { return exception.reason; }
}

@interface RejectingHealthStore : HKHealthStore
@property NSInteger mode;
@end
@implementation RejectingHealthStore
- (void)respond:(void (^)(BOOL, NSError *))completion {
  if (self.mode == 0) [NSException raise:NSInvalidArgumentException format:@"Rejected permission type"];
  else if (self.mode == 1) completion(NO, [NSError errorWithDomain:@"fixture" code:42 userInfo:nil]);
  else completion(YES, nil);
}
- (void)requestAuthorizationToShareTypes:(NSSet<HKSampleType *> *)share readTypes:(NSSet<HKObjectType *> *)read completion:(void (^)(BOOL, NSError *))completion {
  NSCAssert(share.count == 0, @"Exporter must never request write access");
  [self respond:completion];
}
- (void)requestPerObjectReadAuthorizationForType:(HKObjectType *)type predicate:(NSPredicate *)predicate completion:(void (^)(BOOL, NSError *))completion {
  [self respond:completion];
}
@end

void HETestAuthorizationExceptions(void) {
  RejectingHealthStore *store = [RejectingHealthStore new];
  for (NSInteger mode = 0; mode < 3; mode++) {
    store.mode = mode;
    __block NSInteger calls = 0;
    void (^completion)(BOOL, NSError *) = ^(BOOL success, NSError *error) {
      calls++;
      NSCAssert(success == (mode == 2), @"Success must be preserved");
      if (mode == 0) {
        NSCAssert([error.domain isEqualToString:@"HealthExporter.Authorization"], @"Native exception must become a recoverable error");
        NSCAssert([error.localizedDescription isEqualToString:@"Rejected permission type"], @"Keep the actionable permission error");
      } else if (mode == 1) NSCAssert(error.code == 42, @"Preserve HealthKit errors");
      else NSCAssert(error == nil, @"Success has no error");
    };
    HERequestReadAuthorization(store, [NSSet set], completion);
    HERequestObjectAuthorization(store, [HKObjectType visionPrescriptionType], completion);
    NSCAssert(calls == 2, @"Each request must complete exactly once");
  }
}
