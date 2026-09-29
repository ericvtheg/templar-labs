export type EditorAccess = "authorized" | "forbidden" | "signed-out";

export type EditorAccessUser = {
  readonly admin?: boolean;
  readonly email: string;
  readonly emailVerified: boolean;
};

export function parseEditorEmailAllowlist(value: string | undefined): readonly string[] {
  if (value === undefined) {
    return [];
  }

  return [...new Set(value.split(",").map(normalizeEmail).filter(Boolean))];
}

export function editorAccessForUser(
  user: EditorAccessUser | null,
  allowlist: readonly string[],
): EditorAccess {
  if (user === null) {
    return "signed-out";
  }

  if (user.admin === true) {
    return "authorized";
  }

  if (!user.emailVerified) {
    return "forbidden";
  }

  const normalizedAllowlist = new Set(allowlist.map(normalizeEmail));
  return normalizedAllowlist.has(normalizeEmail(user.email)) ? "authorized" : "forbidden";
}

function normalizeEmail(value: string) {
  return value.trim().toLocaleLowerCase("en-US");
}
