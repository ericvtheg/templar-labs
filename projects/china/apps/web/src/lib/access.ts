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
export function sameOrigin(request: Request): boolean {
  return request.headers.get("origin") === new URL(request.url).origin;
}
