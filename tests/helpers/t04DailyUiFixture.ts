import {
  accountAvailability,
  accountBalance,
} from "../../src/domain/accountBalances";
import { decodeBackup, encodeBackup } from "../../src/domain/backup";
import { createInitialState } from "../../src/domain/seed";
import { transactionStatus } from "../../src/domain/transactionStatus";
import { upcoming } from "../../src/domain/payments";
import { incomeReceived } from "../../src/domain/incomes";
import {
  createDraftStore,
  draftStorageKey,
} from "../../src/infrastructure/storage/draftStore";

const KEY = "lad-profile-personal:lad-finance-v1";
let today = "2026-10-15";
let failLedger = false;
let failClear = false;
export const CONTROL = "profile-00000000-0000-4000-8000-000000000004";
function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
export function install(input: {
  today: string;
  mode:
    "empty" | "money" | "edit" | "blocker" | "history" | "plans" | "template";
}) {
  today = input.today;
  if (!sessionStorage.getItem("t04-ui-installed")) {
    const state = createInitialState(false, today);
    state.settings.onboardingCompleted = true;
    state.settings.exchange = { automatic: false, rates: {} };
    if (
      input.mode === "money" ||
      input.mode === "edit" ||
      input.mode === "plans" ||
      input.mode === "template"
    )
      state.accounts[0].openingBalance = 1_000_000;
    if (input.mode === "template") {
      state.version = 5;
      state.accounts.find((account) => account.id === "cash")!.archived = true;
      state.transactionTemplates = [
        {
          id: "t04-template",
          name: "Старый наличный шаблон",
          type: "expense",
          title: "Покупка по шаблону",
          amount: 2500,
          category: "groceries",
          accountId: "cash",
          currency: "RUB",
        },
      ];
    }
    if (input.mode === "edit")
      state.transactions = [
        {
          id: "t04-original",
          type: "expense",
          title: "Исходная операция",
          amount: 1000,
          baseAmount: 1000,
          category: "groceries",
          accountId: "card",
          date: today,
        },
      ];
    if (input.mode === "history") {
      state.accounts[0].openingBalance = 1000;
      state.transactions = [
        {
          id: "t04-history",
          type: "expense",
          title: "Историческая трата",
          amount: 1000,
          baseAmount: 1000,
          date: today,
          accountId: "card",
          category: "groceries",
        },
      ];
    }
    if (input.mode === "plans")
      state.plannedIncomes = [
        {
          id: "t04-income",
          name: "Ожидаемый гонорар",
          amount: 2000,
          date: today,
          repeat: "once",
          accountId: "card",
        },
      ];
    if (input.mode === "blocker" || input.mode === "plans")
      state.recurring = [
        {
          id: "t04-plan",
          name: "Действующее обязательство",
          amount: 1000,
          day: 15,
          kind: "bill",
          active: true,
          category: "home",
          accountId: "card",
          icon: "home-outline",
          color: "#EAF0E8",
          startsOn: today,
        },
      ];
    localStorage.setItem(KEY, encodeBackup(state));
    localStorage.setItem("lad-active-profile-v1", "personal");
    const control = createInitialState(false, today);
    control.settings.onboardingCompleted = true;
    control.settings.exchange = { automatic: false, rates: {} };
    localStorage.setItem(
      `lad-profile-${CONTROL}:lad-finance-v1`,
      encodeBackup(control),
    );
    localStorage.setItem(
      "lad-profiles-v1",
      JSON.stringify({
        version: 1,
        profiles: [
          { id: "personal", name: "Личный" },
          { id: CONTROL, name: "Контрольный Т04" },
        ],
      }),
    );
    sessionStorage.setItem("t04-ui-installed", "yes");
  }
  const original = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    if (this === localStorage && key === KEY && failLedger)
      throw new DOMException(
        "Synthetic ledger write rejection",
        "QuotaExceededError",
      );
    if (
      this === localStorage &&
      key === draftStorageKey("personal") &&
      failClear &&
      JSON.parse(value).transaction?.clearedToken
    )
      throw new DOMException(
        "Synthetic draft cleanup rejection",
        "QuotaExceededError",
      );
    return original.call(this, key, value);
  };
}
export function setLedgerFailure(value: boolean) {
  failLedger = value;
}
export function setClearFailure(value: boolean) {
  failClear = value;
}
export function readState() {
  return decodeBackup(localStorage.getItem(KEY)!, today);
}
export function assertState(input: {
  count: number;
  balance: number;
  held: number;
  statuses?: string[];
  archived?: number;
}) {
  const state = readState();
  check(
    state.transactions.length === input.count,
    "Unexpected transaction count / duplicated movement",
  );
  check(
    accountBalance(state, "card", today) === input.balance,
    "Actual card balance mismatch",
  );
  check(
    accountAvailability(state, "card", today).held === input.held,
    "Pending reserve mismatch",
  );
  if (input.statuses)
    check(
      JSON.stringify(state.transactions.map(transactionStatus).sort()) ===
        JSON.stringify(input.statuses.slice().sort()),
      "Unexpected status set",
    );
  if (input.archived !== undefined)
    check(
      state.accounts.filter((entry) => entry.archived).length ===
        input.archived,
      "Archived account count mismatch",
    );
  return true;
}
export async function draft() {
  const storage = {
    getItem: async (key: string) => localStorage.getItem(key),
    setItem: async (key: string, value: string) =>
      localStorage.setItem(key, value),
    removeItem: async (key: string) => localStorage.removeItem(key),
  };
  return (
    await createDraftStore({
      profile: "personal",
      storage,
      random: (length) => crypto.getRandomValues(new Uint8Array(length)),
    }).load("transaction")
  ).draft;
}
export function changeOriginal() {
  const state = readState();
  const record = state.transactions.find(
    (entry) => entry.id === "t04-original",
  )!;
  record.title = "Актуальная операция";
  record.amount = 2000;
  record.baseAmount = 2000;
  localStorage.setItem(KEY, encodeBackup(state));
}
export function assertPlans(input: { paid: boolean; received: boolean }) {
  const state = readState();
  const occurrence = upcoming(state, today).find(
    (entry) => entry.date === today && entry.payment.id === "t04-plan",
  );
  check(
    occurrence?.paid === input.paid,
    "Payment completion disagrees with actual posting",
  );
  const plan = state.plannedIncomes!.find(
    (entry) => entry.id === "t04-income",
  )!;
  check(
    !!incomeReceived(state, plan, today, today) === input.received,
    "Income completion disagrees with actual posting",
  );
  return true;
}
