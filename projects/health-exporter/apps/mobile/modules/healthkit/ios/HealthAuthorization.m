#import "HealthAuthorization.h"

static NSError *AuthorizationException(NSException *exception) {
  return [NSError errorWithDomain:@"HealthExporter.Authorization" code:1 userInfo:@{
    NSLocalizedDescriptionKey: exception.reason ?: @"Apple Health rejected this permission request."
  }];
}

void HERequestReadAuthorization(HKHealthStore *store, NSSet<HKObjectType *> *types,
                                void (^completion)(BOOL, NSError *)) {
  @try {
    [store requestAuthorizationToShareTypes:[NSSet set] readTypes:types completion:completion];
  } @catch (NSException *exception) {
    completion(NO, AuthorizationException(exception));
  }
}

void HERequestObjectAuthorization(HKHealthStore *store, HKObjectType *type,
                                  void (^completion)(BOOL, NSError *)) {
  @try {
    [store requestPerObjectReadAuthorizationForType:type predicate:nil completion:completion];
  } @catch (NSException *exception) {
    completion(NO, AuthorizationException(exception));
  }
}
