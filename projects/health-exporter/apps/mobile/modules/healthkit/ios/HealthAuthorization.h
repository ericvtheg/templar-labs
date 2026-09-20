#import <Foundation/Foundation.h>
#import <HealthKit/HealthKit.h>

NS_ASSUME_NONNULL_BEGIN
// HealthKit can raise NSException before invoking its completion. Swift catch cannot handle it.
void HERequestReadAuthorization(HKHealthStore *store, NSSet<HKObjectType *> *types,
                                void (^completion)(BOOL, NSError * _Nullable));
void HERequestObjectAuthorization(HKHealthStore *store, HKObjectType *type,
                                  void (^completion)(BOOL, NSError * _Nullable)) API_AVAILABLE(ios(16.0), macos(13.0));
NS_ASSUME_NONNULL_END
