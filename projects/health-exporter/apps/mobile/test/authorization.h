#import "../modules/healthkit/ios/HealthAuthorization.h"
#import "../modules/healthkit/ios/HealthObservation.h"
// Exercises Apple's synchronous argument validation without displaying a permission sheet.
NSString * _Nullable HEValidateReadTypes(NSSet<HKObjectType *> * _Nonnull types);
void HETestAuthorizationExceptions(void);
void HETestObservationExceptions(void);
NSString * _Nullable HEValidateAnchoredQuery(HKSampleType * _Nonnull type);
