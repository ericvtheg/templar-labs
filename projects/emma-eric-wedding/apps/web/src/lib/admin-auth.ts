export const adminEmail = "ericandemma2027@gmail.com";

export type AdminAccess = "authorized" | "forbidden" | "signed-out";

export function isAdminEmail(email: string): boolean {
  return email.trim().toLowerCase() === adminEmail;
}

export function adminAccessForUser(user: { readonly email: string } | null): AdminAccess {
  if (user === null) {
    return "signed-out";
  }

  return isAdminEmail(user.email) ? "authorized" : "forbidden";
}
