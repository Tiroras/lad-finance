import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInitialState } from "../../../src/domain/seed";
import { checkedBackupContent, decodeBackup } from "../../../src/domain/backup";
import { accountBalances } from "../../../src/domain/accountBalances";
import { backupCrypto } from "../../../src/infrastructure/crypto/backupCrypto";
import {
  decryptBackup,
  encryptBackup,
} from "../../../src/infrastructure/crypto/passwordBackup";

// Public test credential: only synthetic data, never a device key or real password.
const password = "A04-synthetic-2026";
const today = "2026-10-06";
const state = createInitialState(false, today);
state.settings = {
  ...state.settings,
  name: "A04 Synthetic",
  onboardingCompleted: true,
};
state.accounts[0].openingBalance = 1_000_000;
state.goals = [
  {
    id: "a04-goal",
    name: "A04 Goal",
    target: 200_000,
    initialSaved: 0,
    monthly: 0,
    icon: "wallet-outline",
    color: "#EAF0E8",
  },
];
state.transactions = [
  {
    id: "a04-income",
    type: "income",
    title: "A04 Income",
    amount: 50_000,
    baseAmount: 50_000,
    accountId: "card",
    category: "other",
    date: today,
  },
  {
    id: "a04-expense",
    type: "expense",
    title: "A04 Expense",
    amount: 20_000,
    baseAmount: 20_000,
    accountId: "card",
    category: "groceries",
    date: today,
  },
  {
    id: "a04-transfer",
    type: "transfer",
    title: "A04 Goal transfer",
    amount: 100_000,
    toAmount: 100_000,
    accountId: "card",
    toAccountId: "savings",
    goalId: "a04-goal",
    category: "other",
    date: today,
  },
];
const plain = checkedBackupContent(state);
const checked = decodeBackup(plain);
assert.deepEqual(
  [...accountBalances(checked, today)],
  [
    ["card", 930_000],
    ["cash", 0],
    ["savings", 100_000],
  ],
);
assert.equal(checked.transactions[2].goalId, checked.goals[0].id);
const digest = (text: string) =>
  createHash("sha256").update(text).digest("hex");
const directory = resolve("test-results/t01/a04/fixtures");

async function main() {
  if (process.argv[2] === "verify") {
    assert.ok(
      process.argv[3],
      "Pass the exported JSON or .ladbackup file path",
    );
    const raw = await readFile(resolve(process.argv[3]), "utf8");
    const restored =
      JSON.parse(raw).format === "lad-password-backup"
        ? await decryptBackup(raw, password, backupCrypto)
        : decodeBackup(raw);
    assert.deepEqual(restored, checked);
    console.log(
      JSON.stringify({
        result: "passed",
        transactions: restored.transactions.length,
        accounts: 3,
        goals: 1,
        canonicalSha256: digest(checkedBackupContent(restored)),
      }),
    );
    return;
  }
  await mkdir(directory, { recursive: true });
  const encrypted = await encryptBackup(checked, password, backupCrypto);
  assert.deepEqual(
    await decryptBackup(encrypted, password, backupCrypto),
    checked,
  );
  await assert.rejects(
    decryptBackup(encrypted, "A04-wrong-password", backupCrypto),
    /Пароль неверный/,
  );
  const damaged = JSON.parse(encrypted);
  damaged.sealed =
    (damaged.sealed[0] === "0" ? "1" : "0") + damaged.sealed.slice(1);
  await assert.rejects(
    decryptBackup(JSON.stringify(damaged), password, backupCrypto),
    /Пароль неверный/,
  );
  await writeFile(resolve(directory, "a04-valid.json"), plain);
  await writeFile(resolve(directory, "a04-valid.ladbackup"), encrypted);
  await writeFile(
    resolve(directory, "a04-tampered.ladbackup"),
    JSON.stringify(damaged),
  );
  await writeFile(resolve(directory, "a04-malformed.json"), "{invalid-a04");
  const manifest = {
    today,
    mode: "default",
    synthetic: true,
    transactions: 3,
    accounts: 3,
    goals: 1,
    plainBytes: Buffer.byteLength(plain),
    plainSha256: digest(plain),
    canonicalSha256: digest(checkedBackupContent(checked)),
    balancesMinorRUB: { card: 930_000, cash: 0, savings: 100_000 },
    encryptedSha256: digest(encrypted),
  };
  await writeFile(
    resolve(directory, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  console.log(JSON.stringify(manifest, null, 2));
}
void main();
