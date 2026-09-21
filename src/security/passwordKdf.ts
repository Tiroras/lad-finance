import { pbkdf2Async } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";

export const derivePasswordKey = async (
  password: string,
  salt: Uint8Array,
  iterations: number,
) => {
  const bytes = new TextEncoder().encode(password);
  try {
    return await pbkdf2Async(sha256, bytes, salt, {
      c: iterations,
      dkLen: 32,
      asyncTick: 8,
    });
  } finally {
    bytes.fill(0);
  }
};
