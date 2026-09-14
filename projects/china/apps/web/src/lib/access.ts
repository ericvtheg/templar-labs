export function isCrew(email: string, verified: boolean, allowlist: string): boolean {
  return (
    verified &&
    allowlist
      .split(/[\s,;]+/)
      .filter(Boolean)
      .map((value) => value.toLowerCase())
      .includes(email.trim().toLowerCase())
  );
}
export function canAccessChina(
  user: { readonly email: string; readonly emailVerified: boolean; readonly admin?: boolean },
  allowlist: string,
): boolean {
  // The admin claim is issued and verified by central Templar SSO, never supplied by the client.
  return user.emailVerified && (user.admin === true || isCrew(user.email, true, allowlist));
}
export function sameOrigin(request: Request): boolean {
  return request.headers.get("origin") === new URL(request.url).origin;
}
