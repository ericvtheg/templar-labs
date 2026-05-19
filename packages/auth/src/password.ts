const PASSWORD_FORMAT = "templar-pbkdf2-sha256";
const PASSWORD_VERSION = "v1";
const PASSWORD_ITERATIONS = 100_000;
const PASSWORD_SALT_BYTES = 16;
const PASSWORD_HASH_BITS = 256;
const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

type VerifyPasswordInput = {
  readonly hash: string;
  readonly password: string;
};

export async function hashTemplarPassword(password: string): Promise<string> {
  const salt = new Uint8Array(PASSWORD_SALT_BYTES);
  crypto.getRandomValues(salt);

  const hash = await pbkdf2(password, salt, PASSWORD_ITERATIONS);

  return [
    PASSWORD_FORMAT,
    PASSWORD_VERSION,
    String(PASSWORD_ITERATIONS),
    base64Encode(salt),
    base64Encode(hash),
  ].join(":");
}

export async function verifyTemplarPassword(input: VerifyPasswordInput): Promise<boolean> {
  const parsed = parsePasswordHash(input.hash);

  if (parsed === undefined) {
    return false;
  }

  const candidate = await pbkdf2(input.password, parsed.salt, parsed.iterations);

  return equalBytes(candidate, parsed.hash);
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: arrayBufferFromBytes(salt),
      iterations,
    },
    key,
    PASSWORD_HASH_BITS,
  );

  return new Uint8Array(bits);
}

function parsePasswordHash(hash: string):
  | {
      readonly iterations: number;
      readonly salt: Uint8Array;
      readonly hash: Uint8Array;
    }
  | undefined {
  const [format, version, iterationsValue, saltValue, hashValue, extra] = hash.split(":");

  if (
    format !== PASSWORD_FORMAT ||
    version !== PASSWORD_VERSION ||
    iterationsValue === undefined ||
    saltValue === undefined ||
    hashValue === undefined ||
    extra !== undefined
  ) {
    return undefined;
  }

  const iterations = Number(iterationsValue);

  if (!Number.isSafeInteger(iterations) || iterations < 1) {
    return undefined;
  }

  try {
    return {
      iterations,
      salt: base64Decode(saltValue),
      hash: base64Decode(hashValue),
    };
  } catch {
    return undefined;
  }
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) {
    return false;
  }

  let mismatches = 0;

  for (let index = 0; index < left.byteLength; index += 1) {
    mismatches += left[index] === right[index] ? 0 : 1;
  }

  return mismatches === 0;
}

function base64Encode(bytes: Uint8Array): string {
  let encoded = "";

  for (let index = 0; index < bytes.byteLength; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1] ?? 0;
    const third = bytes[index + 2] ?? 0;
    const hasSecond = index + 1 < bytes.byteLength;
    const hasThird = index + 2 < bytes.byteLength;

    encoded += BASE64_ALPHABET.charAt(first >> 2);
    encoded += BASE64_ALPHABET.charAt(((first & 0x03) << 4) | (second >> 4));
    encoded += hasSecond ? BASE64_ALPHABET.charAt(((second & 0x0f) << 2) | (third >> 6)) : "=";
    encoded += hasThird ? BASE64_ALPHABET.charAt(third & 0x3f) : "=";
  }

  return encoded;
}

function base64Decode(value: string): Uint8Array {
  if (value.length % 4 !== 0) {
    throw new Error("Invalid base64 length.");
  }

  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  const bytes = new Uint8Array((value.length / 4) * 3 - padding);
  let byteIndex = 0;

  for (let index = 0; index < value.length; index += 4) {
    const isLastChunk = index === value.length - 4;
    const first = value.charAt(index);
    const second = value.charAt(index + 1);
    const third = value.charAt(index + 2);
    const fourth = value.charAt(index + 3);

    if (
      first === "=" ||
      second === "=" ||
      (!isLastChunk && (third === "=" || fourth === "=")) ||
      (third === "=" && fourth !== "=")
    ) {
      throw new Error("Invalid base64 padding.");
    }

    const firstValue = decodeBase64Char(first);
    const secondValue = decodeBase64Char(second);
    const thirdValue = third === "=" ? 0 : decodeBase64Char(third);
    const fourthValue = fourth === "=" ? 0 : decodeBase64Char(fourth);

    bytes[byteIndex] = (firstValue << 2) | (secondValue >> 4);
    byteIndex += 1;

    if (byteIndex < bytes.byteLength) {
      bytes[byteIndex] = ((secondValue & 0x0f) << 4) | (thirdValue >> 2);
      byteIndex += 1;
    }

    if (byteIndex < bytes.byteLength) {
      bytes[byteIndex] = ((thirdValue & 0x03) << 6) | fourthValue;
      byteIndex += 1;
    }
  }

  return bytes;
}

function decodeBase64Char(value: string): number {
  const decoded = BASE64_ALPHABET.indexOf(value);

  if (decoded === -1) {
    throw new Error("Invalid base64 character.");
  }

  return decoded;
}

function arrayBufferFromBytes(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
