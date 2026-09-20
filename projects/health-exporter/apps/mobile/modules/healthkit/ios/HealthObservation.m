#import "HealthObservation.h"

static NSError *ObservationException(NSException *exception) {
  return [NSError errorWithDomain:@"HealthExporter.Observation" code:1 userInfo:@{
    NSLocalizedDescriptionKey: exception.reason ?: @"Apple Health does not support updates for this type."
  }];
}

HKObserverQuery *HECreateObserver(HKSampleType *type,
  void (^handler)(HKObserverQuery *, HKObserverQueryCompletionHandler, NSError *), NSError **error) {
  if (error) *error = nil;
  @try {
    return [[HKObserverQuery alloc] initWithSampleType:type predicate:nil updateHandler:handler];
  } @catch (NSException *exception) {
    if (error) *error = ObservationException(exception);
    return nil;
  }
}

BOOL HEStartObserver(HKHealthStore *store, HKObserverQuery *query, NSError **error) {
  if (error) *error = nil;
  @try {
    [store executeQuery:query];
    return YES;
  } @catch (NSException *exception) {
    if (error) *error = ObservationException(exception);
    return NO;
  }
}

void HEEnableBackgroundDelivery(HKHealthStore *store, HKSampleType *type, void (^completion)(BOOL, NSError *)) {
  @try {
    [store enableBackgroundDeliveryForType:type frequency:HKUpdateFrequencyImmediate withCompletion:completion];
  } @catch (NSException *exception) {
    completion(NO, ObservationException(exception));
  }
}
