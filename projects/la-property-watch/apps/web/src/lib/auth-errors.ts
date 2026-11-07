const messages = {
  missing_transaction:
    "The sign-in cookie did not arrive on the return trip. Allow cookies for this site. Start sign-in again in the same browser tab.",
  expired_transaction:
    "The sign-in attempt expired. Start sign-in again and finish within ten minutes.",
  invalid_transaction: "The sign-in cookie could not be read. Start sign-in again in this browser.",
  invalid_callback:
    "The sign-in return did not match this attempt. Start sign-in again in one tab.",
  provider: "Google sign-in was cancelled or rejected. Start sign-in again to choose your account.",
  exchange:
    "The central sign-in service could not exchange the authorization code. This is a service failure, not an account rejection.",
  verification:
    "The app could not verify the central sign-in response. This is a service configuration or connection failure.",
  session:
    "The app could not create your session. Start sign-in again; if this repeats, report the diagnostic below.",
  access:
    "This Google account is not authorized for Property Watch. Use an approved, verified Google account. If Google signs you in automatically, switch accounts at Google first.",
  unknown:
    "Sign-in did not finish. Start sign-in again; if this repeats, report the diagnostic below.",
} as const;

export function authFailure(search: Record<string, unknown>) {
  if (search["error"] !== "auth") {
    return undefined;
  }
  const candidate = search["auth_reason"];
  const reason =
    typeof candidate === "string" && Object.hasOwn(messages, candidate)
      ? (candidate as keyof typeof messages)
      : "unknown";
  return { reason, message: messages[reason] };
}
