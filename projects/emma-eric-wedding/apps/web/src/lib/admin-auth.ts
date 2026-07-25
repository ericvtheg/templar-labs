export type AdminAccess = "authorized" | "forbidden" | "signed-out";

export function adminAccessForUser(user: { readonly admin?: boolean } | null): AdminAccess {
  if (user === null) {
    return "signed-out";
  }

  return user.admin === true ? "authorized" : "forbidden";
}
