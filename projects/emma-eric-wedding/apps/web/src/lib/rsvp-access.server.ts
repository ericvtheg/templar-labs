const tokenLifetimeMilliseconds = 4 * 60 * 60 * 1000;

export async function createRsvpAccessToken(
  householdId: string,
  secret: string,
  now = Date.now(),
): Promise<string> {
  const payload = `${householdId}.${now + tokenLifetimeMilliseconds}`;
  const encodedPayload = encodeBase64Url(new TextEncoder().encode(payload));
  const signature = await sign(encodedPayload, secret);

  return `${encodedPayload}.${encodeBase64Url(signature)}`;
}

export async function householdIdFromAccessToken(
  token: string,
  secret: string,
  now = Date.now(),
): Promise<string | null> {
  const [encodedPayload, encodedSignature, extra] = token.split(".");

  if (encodedPayload === undefined || encodedSignature === undefined || extra !== undefined) {
    return null;
  }

  try {
    const key = await signingKey(secret, ["verify"]);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      decodeBase64Url(encodedSignature),
      new TextEncoder().encode(encodedPayload),
    );

    if (!valid) {
      return null;
    }

    const payload = new TextDecoder().decode(decodeBase64Url(encodedPayload));
    const separator = payload.lastIndexOf(".");
    const householdId = payload.slice(0, separator);
    const expiresAt = Number(payload.slice(separator + 1));

    return householdId.length > 0 && Number.isFinite(expiresAt) && expiresAt >= now
      ? householdId
      : null;
  } catch {
    return null;
  }
}

async function sign(value: string, secret: string): Promise<ArrayBuffer> {
  const key = await signingKey(secret, ["sign"]);
  return await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
}

async function signingKey(secret: string, usages: readonly KeyUsage[]) {
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages,
  );
}

function encodeBase64Url(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decodeBase64Url(value: string): ArrayBuffer {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);

  return buffer;
}
