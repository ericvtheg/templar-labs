#import "../modules/healthkit/ios/HealthAuthorization.h"
// Exercises Apple's synchronous argument validation without displaying a permission sheet.
NSString * _Nullable HEValidateReadTypes(NSSet<HKObjectType *> * _Nonnull types);
void HETestAuthorizationExceptions(void);
