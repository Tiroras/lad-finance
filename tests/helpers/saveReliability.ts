import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { accountBalance } from "../../src/domain/accountBalances";
import { appendTransaction } from "../../src/domain/actions/transactions";
import { decodeBackup, encodeBackup } from "../../src/domain/backup";
import { createInitialState } from "../../src/domain/seed";
import type { FinanceState } from "../../src/domain/types";
import type { VaultDependencies } from "../../src/infrastructure/storage/vault";

export const reliabilityDate = "2026-10-06";
export const reliabilityProfiles = [
  "profile-11111111-1111-4111-8111-111111111111",
  "profile-22222222-2222-4222-8222-222222222222",
] as const;

export function reliabilitySnapshots() {
  const s0 = createInitialState(false, reliabilityDate);
  s0.settings.name = "Синтетический A05";
  s0.accounts[0].openingBalance = 1_000_000;
  const s1 = appendTransaction(
    s0,
    {
      id: "a05-expense-700",
      type: "expense",
      title: "Синтетический расход 700",
      accountId: "card",
      category: "other",
      amount: 70_000,
      date: reliabilityDate,
    },
    reliabilityDate,
  );
  const s2 = appendTransaction(
    s1,
    {
      id: "a05-expense-300",
      type: "expense",
      title: "Синтетический расход 300",
      accountId: "card",
      category: "other",
      amount: 30_000,
      date: reliabilityDate,
    },
    reliabilityDate,
  );
  // Full validation is part of every fixture, not just a balance assertion.
  return [s0, s1, s2].map((state) => decodeBackup(encodeBackup(state)));
}

export function snapshotEvidence(state: FinanceState) {
  return {
    digest: createHash("sha256").update(encodeBackup(state)).digest("hex"),
    transactionIds: state.transactions.map((entry) => entry.id),
    balance: accountBalance(state, "card", reliabilityDate),
  };
}

// Real AES-GCM, but Node crypto, not Expo Crypto / Keychain / Keystore.
export const reliabilityCipher: VaultDependencies["cipher"] = {
  async seal(plain, secret, context) {
    const iv = randomBytes(12);
    const cipher = createCipheriv(
      "aes-256-gcm",
      Buffer.from(secret, "hex"),
      iv,
    );
    cipher.setAAD(Buffer.from(context));
    return Buffer.concat([
      iv,
      cipher.update(plain, "utf8"),
      cipher.final(),
      cipher.getAuthTag(),
    ]).toString("base64");
  },
  async open(sealed, secret, context) {
    const bytes = Buffer.from(sealed, "base64");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      Buffer.from(secret, "hex"),
      bytes.subarray(0, 12),
    );
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(bytes.subarray(-16));
    return Buffer.concat([
      decipher.update(bytes.subarray(12, -16)),
      decipher.final(),
    ]).toString("utf8");
  },
};
