import { createHash, randomBytes, webcrypto } from "node:crypto";
import type { BrowserContext } from "@playwright/test";

// Hermetic local-only fixture: use the public development cookie secret, never
// a production account, provider login, session bypass, or test-only server route.
export async function signInLocally(context: BrowserContext, user: { id: string; name: string }) {
  const secret = "offscroll-local-development-only-not-for-production";
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
    id: `session-${user.id}`,
    userId: user.id,
    name: user.name,
    email: `${user.id}@example.invalid`,
    emailVerified: true,
    image: null,
    admin: false,
    createdAt: now,
    expiresAt: now + 3600000,
  });
  const encrypted = await webcrypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(payload),
  );
  const value = `${iv.toString("base64url")}.${Buffer.from(encrypted).toString("base64url")}`;
  await context.addCookies([
    {
      name: "templar.auth.session",
      value,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
}
