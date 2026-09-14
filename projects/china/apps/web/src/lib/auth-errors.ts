export function authFailureMessage(reason: string | null): string {
  switch (reason) {
    case "access":
      return "Google sign-in succeeded, but this account is not an invited, verified crew account. Choose the Google email you gave the groom.";
    case "missing_transaction":
      return "The sign-in cookie didn’t arrive on the return trip. Allow cookies for this site and start sign-in again in the same browser tab.";
    case "expired_transaction":
      return "Sign-in expired. Start again using the button below.";
    case "invalid_transaction":
      return "The sign-in cookie could not be read. Start a fresh sign-in; if this repeats, the app’s auth configuration needs fixing.";
    case "provider":
      return "Google sign-in was cancelled or rejected. Choose your invited Google account and try again.";
    case "invalid_callback":
      return "The sign-in return didn’t match the request. Start again in one tab, rather than reloading an old callback.";
    case "exchange":
      return "The central auth service couldn’t exchange the sign-in code. This is a session-handoff failure, not an email-list rejection. Diagnostic: exchange.";
    case "verification":
      return "The app couldn’t verify the central sign-in token. This is an auth-service configuration or connection failure, not an email-list rejection. Diagnostic: verification.";
    case "session":
      return "The app couldn’t create your session. This needs an app-side fix. Diagnostic: session.";
    default:
      return "Sign-in didn’t finish. Choose your invited Google account below. If it fails again, share the diagnostic shown here—not cookies or sign-in codes.";
  }
}
