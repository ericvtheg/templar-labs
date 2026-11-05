import { createHash, randomBytes, webcrypto } from "node:crypto";
import type { BrowserContext } from "@playwright/test";

export async function signInLocally(
  context: BrowserContext,
  input: { email: string; verified?: boolean; admin?: boolean },
) {
  const secret = "la-property-watch-local-development-only-not-for-production";
  const key = await webcrypto.subtle.importKey(
    "raw",
    createHash("sha256").update(secret).digest(),
    "AES-GCM",
    false,
    ["encrypt"],
  );
  const iv = randomBytes(12);
  const now = Date.now();
  const payload = JSON.stringify({
    id: `session-${input.email}`,
    userId: `user-${input.email}`,
    name: "Eric Ventor",
    email: input.email,
    emailVerified: input.verified ?? true,
    image: null,
    admin: input.admin ?? false,
    createdAt: now,
    expiresAt: now + 60 * 60 * 1_000,
  });
  const encrypted = await webcrypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(payload),
  );
  await context.addCookies([
    {
      name: "templar.auth.session",
      value: `${iv.toString("base64url")}.${Buffer.from(encrypted).toString("base64url")}`,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
}
