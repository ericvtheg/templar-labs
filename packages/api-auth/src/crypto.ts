import { ApiAuthConfigError } from "./errors.ts";

const textEncoder = new TextEncoder();

export type ApiAuthSecret = {
  readonly version: number;
  readonly value: string;
};

export function normalizeApiAuthSecrets(
  secrets: readonly ApiAuthSecret[],
): readonly ApiAuthSecret[] {
  if (secrets.length === 0) {
    throw new ApiAuthConfigError({
      field: "secrets",
      message: "At least one API auth secret is required.",
    });
  }

  const versions = new Set<number>();
  for (const secret of secrets) {
    if (!Number.isInteger(secret.version) || secret.version < 1) {
      throw new ApiAuthConfigError({
        field: "secrets.version",
        message: "Secret versions must be positive integers.",
      });
    }
    if (versions.has(secret.version)) {
      throw new ApiAuthConfigError({
        field: "secrets.version",
        message: `Duplicate secret version: ${secret.version}.`,
      });
    }
    if (textEncoder.encode(secret.value).byteLength < 32) {
      throw new ApiAuthConfigError({
        field: "secrets.value",
        message: "API auth secrets must contain at least 32 bytes.",
      });
    }
    versions.add(secret.version);
  }

  return [...secrets].toSorted((left, right) => right.version - left.version);
}

export function randomSecret(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

export async function digestApiKeySecret(input: {
  readonly audience: string;
  readonly id: string;
  readonly presentedSecret: string;
  readonly serverSecret: string;
}): Promise<string> {
  const key = await importHmacKey(input.serverSecret, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, ownedBuffer(signedValue(input)));
  return base64Url(new Uint8Array(signature));
}

export async function verifyApiKeySecret(input: {
  readonly audience: string;
  readonly id: string;
  readonly presentedSecret: string;
  readonly serverSecret: string;
  readonly expectedDigest: string;
}): Promise<boolean> {
  try {
    const key = await importHmacKey(input.serverSecret, ["verify"]);
    return await crypto.subtle.verify(
      "HMAC",
      key,
      ownedBuffer(fromBase64Url(input.expectedDigest)),
      ownedBuffer(signedValue(input)),
    );
  } catch {
    return false;
  }
}

export function formatApiKey(prefix: string, id: string, secret: string): string {
  return `${prefix}${id}.${secret}`;
}

export function parseApiKey(
  prefix: string,
  presentedKey: string,
): { readonly id: string; readonly secret: string } | null {
  if (!presentedKey.startsWith(prefix)) {
    return null;
  }
  const separator = presentedKey.indexOf(".", prefix.length);
  if (separator === -1) {
    return null;
  }
  const id = presentedKey.slice(prefix.length, separator);
  const secret = presentedKey.slice(separator + 1);
  return id === "" || secret === "" ? null : { id, secret };
}

function signedValue(input: {
  readonly audience: string;
  readonly id: string;
  readonly presentedSecret: string;
}): Uint8Array {
  return textEncoder.encode(`${input.audience}\u0000${input.id}\u0000${input.presentedSecret}`);
}

function importHmacKey(secret: string, usages: readonly ("sign" | "verify")[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [...usages],
  );
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function ownedBuffer(bytes: Uint8Array): ArrayBuffer {
  const owned = new Uint8Array(bytes.byteLength);
  owned.set(bytes);
  return owned.buffer;
}
