const PASSWORD_FORMAT = "templar-pbkdf2-sha256";
const PASSWORD_VERSION = "v1";
const PASSWORD_ITERATIONS = 100_000;
const PASSWORD_SALT_BYTES = 16;
const PASSWORD_HASH_BITS = 256;

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
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function base64Decode(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function arrayBufferFromBytes(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
