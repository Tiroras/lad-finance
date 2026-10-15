import { accountBalances } from "../../src/domain/accountBalances";
import { decodeBackup, encodeBackup } from "../../src/domain/backup";
import { createInitialState } from "../../src/domain/seed";
import type { FinanceState } from "../../src/domain/types";
import {
  readRecoveryRecord,
  RECOVERY_RECORD_PREFIX,
} from "../../src/infrastructure/storage/recoveryLedger";

const PERSONAL = "lad-profile-personal:lad-finance-v1";
const ACTIVE = "lad-active-profile-v1";
const REGISTRY = "lad-profiles-v1";
const BROKEN = "synthetic-t03-damaged-personal-json";
let today = "";
let sourceText = "";
let originalText = "";
let imported: FinanceState;
let failWrites = false;
let attempts: { key: string; succeeded: boolean }[] = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Called only by an init script in Chromium; no financial fixture runs on Node. */
export function installFixture(input: { today: string; broken: boolean }) {
  today = input.today;
  const initial = createInitialState(false, today);
  initial.settings.onboardingCompleted = true;
  initial.settings.exchange = { automatic: false, rates: {} };
  initial.accounts[0].openingBalance = 765400;
  initial.settings.name = "Исходный синтетический учёт";
  originalText = input.broken ? BROKEN : encodeBackup(initial);

  const next = createInitialState(false, today);
  next.settings.onboardingCompleted = true;
  next.settings.exchange = { automatic: false, rates: {} };
  next.settings.name = "Синтетическая копия со связями";
  next.accounts[0].openingBalance = 200000;
  next.accounts[2].openingBalance = 10000;
  next.goals = [
    {
      id: "t03-goal",
      name: "Синтетическая цель",
      target: 100000,
      initialSaved: 10000,
      monthly: 1000,
      icon: "wallet-outline",
      color: "#EAF0E8",
    },
  ];
  next.recurring = [
    {
      id: "t03-payment",
      name: "Синтетический платёж",
      amount: 7000,
      day: 15,
      kind: "bill",
      active: true,
      icon: "home-outline",
      color: "#EAF0E8",
      category: "home",
      accountId: "card",
      startsOn: "2026-10-01",
    },
  ];
  next.plannedIncomes = [
    {
      id: "t03-income-plan",
      name: "Синтетический доход",
      amount: 100000,
      date: today,
      repeat: "once",
      accountId: "card",
    },
  ];
  next.transactions = [
    {
      id: "t03-income",
      type: "income",
      title: "Доход по плану",
      amount: 100000,
      baseAmount: 100000,
      date: today,
      category: "other",
      accountId: "card",
      plannedIncomeId: "t03-income-plan",
      incomeOccurrenceDate: today,
    },
    {
      id: "t03-purchase",
      type: "expense",
      title: "Разделённая покупка",
      amount: 30000,
      baseAmount: 30000,
      date: today,
      category: "groceries",
      accountId: "card",
      splits: [
        { category: "groceries", amount: 10000 },
        { category: "shopping", amount: 20000 },
      ],
    },
    {
      id: "t03-refund",
      type: "income",
      title: "Частичный возврат",
      amount: 5000,
      baseAmount: 5000,
      date: today,
      category: "groceries",
      accountId: "card",
      refundOf: "t03-purchase",
      refundSourceAmount: 5000,
    },
    {
      id: "t03-contribution",
      type: "transfer",
      title: "Взнос в цель",
      amount: 40000,
      toAmount: 40000,
      date: today,
      category: "other",
      accountId: "card",
      toAccountId: "savings",
      goalId: "t03-goal",
    },
    {
      id: "t03-paid",
      type: "expense",
      title: "Оплаченный план",
      amount: 7000,
      baseAmount: 7000,
      date: today,
      category: "home",
      accountId: "card",
      recurringId: "t03-payment",
      occurrenceDate: today,
    },
  ];
  imported = decodeBackup(encodeBackup(next), today);
  sourceText = encodeBackup(imported);

  if (!sessionStorage.getItem("t03-backup-fixture-installed")) {
    localStorage.setItem(PERSONAL, originalText);
    localStorage.setItem(ACTIVE, "personal");
    localStorage.setItem(
      REGISTRY,
      JSON.stringify({
        version: 1,
        profiles: [{ id: "personal", name: "Личный" }],
      }),
    );
    sessionStorage.setItem("t03-backup-fixture-installed", "true");
  }
  const setItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    const ledger = this === localStorage && key.endsWith(":lad-finance-v1");
    if (ledger && failWrites) {
      attempts.push({ key, succeeded: false });
      throw new DOMException(
        "Synthetic T03 recovery write failure",
        "QuotaExceededError",
      );
    }
    const result = setItem.call(this, key, value);
    if (ledger) attempts.push({ key, succeeded: true });
    return result;
  };
}

export function backupText() {
  return sourceText;
}
export function beginObservation() {
  attempts = [];
}
export function setWriteFailure(value: boolean) {
  failWrites = value;
}
export function writeAttempts() {
  return attempts.map((attempt) => ({ ...attempt }));
}
export function activeProfile() {
  return localStorage.getItem(ACTIVE);
}
export function assertOriginalUnchanged() {
  assert(
    localStorage.getItem(PERSONAL) === originalText,
    "Original profile bytes changed",
  );
}
export function assertImported(profile = localStorage.getItem(ACTIVE)) {
  assert(profile, "Active profile is missing");
  const raw = localStorage.getItem(`lad-profile-${profile}:lad-finance-v1`);
  assert(raw, "Imported snapshot was not persisted");
  const actual = raw.startsWith(RECOVERY_RECORD_PREFIX)
    ? readRecoveryRecord(raw).candidate.state
    : decodeBackup(raw, today);
  assert(
    encodeBackup(actual) === sourceText,
    "Full persisted snapshot differs from the selected JSON",
  );
  const balances = accountBalances(actual, today);
  assert(
    balances.get("card") === 228000,
    "Card balance was not restored exactly",
  );
  assert(
    balances.get("savings") === 50000,
    "Goal savings balance was not restored exactly",
  );
  assert(balances.get("cash") === 0, "Cash balance changed");
  assert(
    actual.transactions.length === 5,
    "Transactions were duplicated or lost",
  );
  assert(
    actual.transactions.find((t) => t.id === "t03-refund")?.refundOf ===
      "t03-purchase",
    "Refund link lost",
  );
  assert(
    actual.transactions.find((t) => t.id === "t03-contribution")?.goalId ===
      "t03-goal",
    "Goal link lost",
  );
  assert(
    actual.transactions.find((t) => t.id === "t03-paid")?.recurringId ===
      "t03-payment",
    "Payment link lost",
  );
  assert(
    actual.transactions.find((t) => t.id === "t03-income")?.plannedIncomeId ===
      "t03-income-plan",
    "Income link lost",
  );
  assert(
    actual.transactions.find((t) => t.id === "t03-purchase")?.splits?.length ===
      2,
    "Purchase split lost",
  );
  return { profile, transactions: actual.transactions.length };
}
