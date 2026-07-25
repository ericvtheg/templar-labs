/**
 * Canonical Better Auth user IDs with global Templar administrator access.
 * Changing this set intentionally requires a deploy.
 */
export const platformAdminUserIds = new Set<string>([
  // Add canonical user IDs here after the corresponding account exists.
]);

export function isPlatformAdminId(userId: string): boolean {
  return platformAdminUserIds.has(userId);
}
