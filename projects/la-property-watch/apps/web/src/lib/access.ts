import { allowedEmails } from "./model.ts";

export type AccessUser = {
  readonly email: string;
  readonly emailVerified: boolean;
};

export function canAccessResearch(user: AccessUser): boolean {
  return (
    user.emailVerified &&
    allowedEmails.some((email) => email.toLowerCase() === user.email.trim().toLowerCase())
  );
}

export function sameOrigin(request: Request): boolean {
  return request.headers.get("origin") === new URL(request.url).origin;
}
