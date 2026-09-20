#import <Foundation/Foundation.h>
#import <HealthKit/HealthKit.h>

NS_ASSUME_NONNULL_BEGIN
HKObserverQuery * _Nullable HECreateObserver(HKSampleType *type,
  void (^handler)(HKObserverQuery *, HKObserverQueryCompletionHandler, NSError * _Nullable),
  NSError * _Nullable * _Nullable error);
BOOL HEStartObserver(HKHealthStore *store, HKObserverQuery *query, NSError * _Nullable * _Nullable error);
void HEEnableBackgroundDelivery(HKHealthStore *store, HKSampleType *type,
  void (^completion)(BOOL, NSError * _Nullable));
NS_ASSUME_NONNULL_END
