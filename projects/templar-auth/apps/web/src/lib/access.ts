/**
 * Email addresses with global Templar administrator access.
 * Changing this set intentionally requires a deploy.
 */
export const platformAdminEmails = new Set<string>(["ericandemma2027@gmail.com"]);

export function isPlatformAdminEmail(email: string): boolean {
  return platformAdminEmails.has(email.trim().toLowerCase());
}
