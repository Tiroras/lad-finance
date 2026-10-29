import assert from "node:assert/strict";
import { createInitialState } from "../../../../src/domain/seed.ts";
import {
  addProfile,
  createDefaultProfiles,
  renameProfile,
  encodeProfileRegistry,
  decodeProfileRegistry,
} from "../../../../src/domain/profiles.ts";
import {
  spendingComparison,
  monthlyOverview,
} from "../../../../src/domain/insights.ts";
import { parseCsv, guessCsvMapping } from "../../../../src/domain/csv.ts";
import { applyCsvImportWithSummary } from "../../../../src/domain/actions/dataTransfer.ts";
import { exportTransactionsCsvParts } from "../../../../src/domain/csvExport.ts";
import { backupCrypto } from "../../../../src/infrastructure/crypto/backupCrypto.ts";
import {
  encryptBackup,
  decryptBackup,
  parsePasswordEnvelope,
} from "../../../../src/infrastructure/crypto/passwordBackup.ts";
import { encodeBackup } from "../../../../src/domain/backup.ts";

const original = createDefaultProfiles();
const id = "profile-11111111-1111-4111-8111-111111111111";
const added = addProfile(original, id, "  Семейный  ");
const renamed = renameProfile(added, id, "Общие расходы");
assert.equal(original.length, 1);
assert.equal(added[1].name, "Семейный");
assert.deepEqual(
  decodeProfileRegistry(encodeProfileRegistry(renamed)),
  renamed,
);
assert.throws(() =>
  addProfile(
    renamed,
    "profile-22222222-2222-4222-8222-222222222222",
    " ОБЩИЕ РАСХОДЫ ",
  ),
);

const a = createInitialState(false, "2026-09-20");
a.categories.push({
  ...a.categories[0],
  id: "delivery",
  name: "Доставка",
  parentId: "groceries",
  budget: 0,
});
a.transactions = [
  {
    id: "history",
    date: "2026-08-01",
    type: "income",
    title: "Начало истории",
    amount: 1000000,
    accountId: "card",
    category: "other",
  },
  {
    id: "purchase",
    date: "2026-08-10",
    type: "expense",
    title: "Покупка",
    amount: 10000,
    accountId: "card",
    category: "groceries",
    splits: [
      { category: "groceries", amount: 6000 },
      { category: "delivery", amount: 2000 },
      { category: "shopping", amount: 2000 },
    ],
  },
  {
    id: "refund",
    date: "2026-09-10",
    type: "income",
    title: "Возврат",
    amount: 4000,
    accountId: "card",
    category: "other",
    refundOf: "purchase",
  },
  {
    id: "transfer",
    date: "2026-09-12",
    type: "transfer",
    title: "Перевод",
    amount: 50000,
    accountId: "card",
    toAccountId: "cash",
    category: "other",
  },
];
const originalAnalytics = JSON.stringify(a);
const comparison = spendingComparison(a, "2026-09", "2026-09-20");
const september = monthlyOverview(a, "2026-09", 3, "2026-09-20").at(-1)!;
assert.equal(comparison.current, -4000);
assert.equal(comparison.previous, 10000);
assert.equal(
  comparison.changes.find((x) => x.categoryId === "groceries")?.current,
  -3200,
);
assert.equal(september.income, 0);
assert.equal(september.expense, -4000);
assert.equal(JSON.stringify(a), originalAnalytics);

const c = createInitialState(false, "2026-10-15");
c.accounts[0].openingBalance = 100000;
const options = (headers: string[]) => ({
  accountId: "card",
  mapping: guessCsvMapping(headers),
  mode: "signed" as const,
  positive: "income" as const,
  dateOrder: "dmy" as const,
});
const initialTable = parseCsv(
  "Date;Description;Amount;ID\n2026-10-15;Old;-10;old",
);
const first = applyCsvImportWithSummary(
  c,
  {
    table: initialTable,
    options: options(initialTable.headers),
    excluded: new Set(),
    overrides: {},
  },
  "2026-10-15",
);
const table = parseCsv(
  "Date;Description;Amount;ID\n2026-10-15;Old;-10;old\n2026-10-16;Future;99;future\n2026-10-15;Excluded;100;excluded\n2026-10-15;Two lines;-20;new\n2026-10-15;Income;50;income",
);
const firstText = encodeBackup(first.state);
const applied = applyCsvImportWithSummary(
  first.state,
  {
    table,
    options: options(table.headers),
    excluded: new Set([2, 3, 4]),
    overrides: {},
  },
  "2026-10-15",
);
assert.deepEqual(applied.summary.csv, {
  sourceRows: 5,
  added: 2,
  skipped: { invalid: 1, duplicate: 1, excluded: 1 },
});
assert.equal(
  applied.summary.after.balances.find((x) => x.accountId === "card")?.balance,
  102000,
);
assert.equal(encodeBackup(first.state), firstText);
const exported = exportTransactionsCsvParts(
  applied.state,
  { format: "universal" },
  "2026-10-15",
);
assert.equal(exported.parts.length, 1);
assert.equal(exported.totals.transactionCount, 3);
assert.equal(exported.parts[0].content.charCodeAt(0), 0xfeff);

const b = applied.state;
b.settings.name = "Контрольный профиль";
const before = encodeBackup(b);
const password = "Синтетический пароль для примера";
const encrypted = await encryptBackup(b, password, backupCrypto);
const envelope = parsePasswordEnvelope(encrypted);
assert.deepEqual(await decryptBackup(encrypted, password, backupCrypto), b);
let wrongPasswordRejected = false;
try {
  await decryptBackup(encrypted, "Другой пароль для примера", backupCrypto);
} catch {
  wrongPasswordRejected = true;
}
assert.equal(wrongPasswordRejected, true);
assert.equal(encodeBackup(b), before);
assert.equal(encrypted.includes(password), false);
assert.equal(encrypted.includes(b.settings.name), false);
console.log(
  JSON.stringify(
    {
      UC01: {
        originalCount: original.length,
        addedName: added[1].name,
        renamedName: renamed[1].name,
        idPreserved: renamed[1].id === id,
        duplicateRejected: true,
        registryRoundTrip: true,
      },
      UC14: {
        comparisonDays: comparison.days,
        currentExpenseMinor: comparison.current,
        previousExpenseMinor: comparison.previous,
        groceriesCurrentMinor: comparison.changes.find(
          (x) => x.categoryId === "groceries",
        )?.current,
        septemberIncomeMinor: september.income,
        septemberExpenseMinor: september.expense,
        stateUnchanged: true,
      },
      UC15: {
        summary: applied.summary.csv,
        transactions: applied.state.transactions.length,
        balanceMinor: 102000,
        exportParts: exported.parts.length,
        exportRows: exported.totals.rowCount,
        hasBOM: true,
        previousStateUnchanged: true,
      },
      UC16: {
        financialVersion: b.version,
        envelopeVersion: envelope.version,
        cipher: envelope.cipher,
        kdf: envelope.kdf,
        iterations: envelope.iterations,
        roundTrip: true,
        wrongPasswordRejected,
        sourceUnchanged: true,
        plaintextNameAbsent: true,
        passwordAbsent: true,
      },
    },
    null,
    2,
  ),
);
