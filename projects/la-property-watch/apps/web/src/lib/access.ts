import { allowedEmail } from "./model.ts";

export type AccessUser = {
  readonly email: string;
  readonly emailVerified: boolean;
};

export function canAccessResearch(user: AccessUser): boolean {
  return user.emailVerified && user.email.trim().toLowerCase() === allowedEmail;
}

export function sameOrigin(request: Request): boolean {
  return request.headers.get("origin") === new URL(request.url).origin;
}
