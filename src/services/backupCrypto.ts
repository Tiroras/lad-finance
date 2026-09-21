import type { BackupCrypto } from "../security/passwordBackup";

// Browser adapter. Use the same wire format as Expo: nonce || ciphertext || tag.
const bytes = (value: Uint8Array) => new Uint8Array(value);
export const backupCrypto: BackupCrypto = {
  random(length) {
    return globalThis.crypto.getRandomValues(new Uint8Array(length));
  },
  async derive(password, salt, iterations) {
    const source = await globalThis.crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    return new Uint8Array(
      await globalThis.crypto.subtle.deriveBits(
        { name: "PBKDF2", hash: "SHA-256", salt: bytes(salt), iterations },
        source,
        256,
      ),
    );
  },
  async seal(plain, key, nonce, context) {
    const aes = await globalThis.crypto.subtle.importKey(
      "raw",
      bytes(key),
      "AES-GCM",
      false,
      ["encrypt"],
    );
    const encrypted = new Uint8Array(
      await globalThis.crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv: bytes(nonce),
          additionalData: bytes(context),
          tagLength: 128,
        },
        aes,
        bytes(plain),
      ),
    );
    const combined = new Uint8Array(nonce.length + encrypted.length);
    combined.set(nonce);
    combined.set(encrypted, nonce.length);
    return combined;
  },
  async open(sealed, key, context) {
    const aes = await globalThis.crypto.subtle.importKey(
      "raw",
      bytes(key),
      "AES-GCM",
      false,
      ["decrypt"],
    );
    return new Uint8Array(
      await globalThis.crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: bytes(sealed.subarray(0, 12)),
          additionalData: bytes(context),
          tagLength: 128,
        },
        aes,
        bytes(sealed.subarray(12)),
      ),
    );
  },
};
