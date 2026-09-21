import {
  AESEncryptionKey,
  AESSealedData,
  aesDecryptAsync,
  aesEncryptAsync,
  getRandomValues,
} from "expo-crypto";
import type { BackupCrypto } from "../security/passwordBackup";
import { derivePasswordKey } from "../security/passwordKdf";

export const backupCrypto: BackupCrypto = {
  // getRandomBytes has a weak remote-debug fallback in Expo; never use it for backups.
  random: (length) => getRandomValues(new Uint8Array(length)),
  derive: derivePasswordKey,
  async seal(plain, secret, nonce, context) {
    const key = await AESEncryptionKey.import(secret);
    const sealed = await aesEncryptAsync(plain, key, {
      nonce: { bytes: nonce },
      tagLength: 16,
      additionalData: context,
    });
    return sealed.combined();
  },
  async open(sealed, secret, context) {
    const key = await AESEncryptionKey.import(secret);
    return aesDecryptAsync(
      AESSealedData.fromCombined(sealed, { ivLength: 12, tagLength: 16 }),
      key,
      { additionalData: context },
    );
  },
};
