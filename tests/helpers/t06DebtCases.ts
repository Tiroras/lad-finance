import {
  confirmCreditTerms,
  saveAccount,
  saveCreditTermsReminder,
} from "../../src/domain/actions/accounts";
import { editDebtTransaction } from "../../src/domain/actions/debts";
import {
  appendTransaction,
  deleteTransaction,
  postPendingTransaction,
  saveTransaction,
} from "../../src/domain/actions/transactions";
import { accountBalance } from "../../src/domain/accountBalances";
import {
  decodeBackup,
  encodeBackup,
  validateBackupValue,
} from "../../src/domain/backup";
import {
  creditPaymentRemaining,
  debtBalance,
  validateCreditAccounts,
} from "../../src/domain/debts";
import { totals } from "../../src/domain/finance";
import { reminderPlan } from "../../src/domain/reminders";
import { createInitialState } from "../../src/domain/seed";
import type {
  Account,
  FinanceState,
  Transaction,
} from "../../src/domain/types";
import { notificationTarget } from "../../src/application/navigation/notificationTarget";
import {
  readPaymentNotification,
  reminderChanges,
} from "../../src/infrastructure/notifications/notificationPlan";

const TODAY = "2026-10-19";
const KEY = "lad-profile-personal:lad-finance-v1";
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonical(child)]),
    );
  return value;
}
function equal(actual: unknown, expected: unknown, message = "T06 result") {
  if (JSON.stringify(canonical(actual)) !== JSON.stringify(canonical(expected)))
    throw new Error(
      `${message}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`,
    );
}
function rejects(run: () => unknown, pattern: RegExp) {
  try {
    run();
  } catch (error) {
    if (error instanceof Error && pattern.test(error.message)) return;
    throw new Error(`Unexpected rejection: ${String(error)}`);
  }
  throw new Error(`Expected rejection: ${String(pattern)}`);
}
export function creditState(): FinanceState {
  const state = createInitialState(false, TODAY);
  state.settings.onboardingCompleted = true;
  state.settings.exchange = { automatic: false, rates: {} };
  state.accounts[0].openingBalance = 2_000_000;
  state.accounts.push({
    id: "credit",
    name: "Карта Т06",
    kind: "credit",
    currency: "RUB",
    openingBalance: -1_000_000,
    creditLimit: 2_000_000,
    paymentDueAmount: 100_000,
    paymentDueDate: "2026-10-25",
    icon: "card-outline",
    color: "#234B3C",
  });
  state.transactions = [transfer("old-repayment", 20_000, "2026-10-18")];
  return state;
}
const credit = (state: FinanceState) =>
  state.accounts.find((account) => account.id === "credit")!;
function transfer(id: string, amount: number, date = TODAY): Transaction {
  return {
    id,
    title: "Погашение карты",
    type: "transfer",
    amount,
    date,
    accountId: "card",
    toAccountId: "credit",
    category: "other",
  };
}
export function debtState(): FinanceState {
  const state = creditState();
  state.accounts = state.accounts.filter((account) => account.id !== "credit");
  state.debts = [
    {
      id: "debt",
      name: "Долг Т06",
      direction: "borrowed",
      currency: "RUB",
      accountId: "card",
      openingAmount: 0,
      startsOn: "2026-10-01",
    },
  ];
  state.transactions = [
    {
      id: "repay",
      type: "expense",
      amount: 600_000,
      title: "Возврат Т06",
      date: "2026-10-10",
      category: "other",
      accountId: "card",
      debtId: "debt",
      debtAction: "repay",
    },
    {
      id: "issue",
      type: "income",
      amount: 1_000_000,
      title: "Получен долг Т06",
      date: "2026-10-01",
      category: "other",
      accountId: "card",
      debtId: "debt",
      debtAction: "issue",
      baseAmount: 999_999,
      importKey: "t06-debt-import",
      status: "posted",
    },
  ];
  state.version = 5;
  return state;
}
function edit(
  state: FinanceState,
  patch: Partial<{
    amount: number;
    date: string;
    accountId: string;
    title: string;
    note: string;
  }> = {},
) {
  const original = state.transactions.find(
    (transaction) => transaction.id === "issue",
  )!;
  return editDebtTransaction(
    state,
    {
      id: original.id,
      title: original.title,
      amount: original.amount,
      date: original.date,
      accountId: original.accountId,
      expectedOriginal: original,
      ...patch,
    },
    TODAY,
  );
}
export function installDebtUi(kind: "credit" | "debt") {
  if (localStorage.getItem(KEY) === null) {
    localStorage.setItem(
      KEY,
      JSON.stringify(kind === "credit" ? creditState() : debtState()),
    );
    localStorage.setItem("lad-active-profile-v1", "personal");
  }
}
export function readDebtUi(): FinanceState {
  return JSON.parse(localStorage.getItem(KEY)!);
}

export const t06DebtCases = [
  {
    name: "same manual statement amount establishes a new baseline and new repayments reduce it once",
    run() {
      const start = creditState();
      equal(creditPaymentRemaining(start, credit(start), TODAY), 80_000);
      let next = confirmCreditTerms(
        start,
        {
          accountId: "credit",
          paymentDueAmount: 100_000,
          paymentDueDate: "2026-10-25",
        },
        TODAY,
      );
      equal(next.version, 7);
      equal(credit(next).creditTermsConfirmedOn, TODAY);
      equal(credit(next).paymentDueBaselineIds, ["old-repayment"]);
      equal(creditPaymentRemaining(next, credit(next), TODAY), 100_000);
      next = appendTransaction(next, transfer("new-repayment", 30_000), TODAY);
      equal(creditPaymentRemaining(next, credit(next), TODAY), 70_000);
      equal(creditPaymentRemaining(next, credit(next), TODAY), 70_000);
      equal(totals(next, "2026-10"), { income: 0, expense: 0 });
      equal(credit(start).creditTermsConfirmedOn, undefined);
    },
  },
  {
    name: "renaming or reconciling a card and saving its reminder do not confirm old conditions",
    run() {
      const start = creditState();
      const next = saveAccount(
        start,
        { id: "credit", name: "Новое имя", kind: "credit", balance: -980_000 },
        TODAY,
      );
      equal(credit(next).creditTermsConfirmedOn, undefined);
      equal(creditPaymentRemaining(next, credit(next), TODAY), 80_000);
      const reminded = saveCreditTermsReminder(
        next,
        "credit",
        "2026-10-21",
        TODAY,
      );
      equal(reminded.version, 7);
      equal(credit(reminded).creditTermsConfirmedOn, undefined);
      equal(credit(reminded).creditTermsReminderDate, "2026-10-21");
      equal(reminded.transactions, start.transactions);
      equal(creditPaymentRemaining(reminded, credit(reminded), TODAY), 80_000);
      const cleared = saveCreditTermsReminder(reminded, "credit", "", TODAY);
      equal(credit(cleared).creditTermsReminderDate, undefined);
    },
  },
  {
    name: "confirmed terms and baseline survive metadata saves and balance adjustments",
    run() {
      const confirmed = confirmCreditTerms(
        creditState(),
        {
          accountId: "credit",
          paymentDueAmount: 100_000,
          paymentDueDate: "2026-10-25",
          reminderDate: "2026-10-22",
        },
        TODAY,
      );
      const next = saveAccount(
        confirmed,
        {
          id: "credit",
          name: "Карта после сверки",
          kind: "credit",
          balance: -950_000,
        },
        TODAY,
      );
      equal(credit(next).creditTermsConfirmedOn, TODAY);
      equal(credit(next).creditTermsReminderDate, "2026-10-22");
      equal(credit(next).paymentDueBaselineIds, ["old-repayment"]);
      equal(creditPaymentRemaining(next, credit(next), TODAY), 100_000);
      equal(next.balanceAdjustments?.length, 1);
    },
  },
  {
    name: "baseline includes only posted incoming transfers; posting an existing intent pays the new statement",
    run() {
      const start = appendTransaction(
        creditState(),
        {
          ...transfer("intent", 40_000),
          status: "pending",
          expectedDate: TODAY,
        },
        TODAY,
      );
      let next = confirmCreditTerms(
        start,
        {
          accountId: "credit",
          paymentDueAmount: 100_000,
          paymentDueDate: "2026-10-25",
        },
        TODAY,
      );
      equal(credit(next).paymentDueBaselineIds, ["old-repayment"]);
      equal(creditPaymentRemaining(next, credit(next), TODAY), 100_000);
      next = postPendingTransaction(next, "intent", TODAY, TODAY);
      equal(creditPaymentRemaining(next, credit(next), TODAY), 60_000);
      equal(next.version, 7);
    },
  },
  {
    name: "editing or deleting a baseline repayment does not reinterpret the manual due amount",
    run() {
      const confirmed = confirmCreditTerms(
        creditState(),
        {
          accountId: "credit",
          paymentDueAmount: 100_000,
          paymentDueDate: "2026-10-25",
        },
        TODAY,
      );
      const original = confirmed.transactions[0];
      const edited = saveTransaction(
        confirmed,
        { ...original, amount: 10_000 },
        TODAY,
      );
      equal(creditPaymentRemaining(edited, credit(edited), TODAY), 100_000);
      const removed = deleteTransaction(edited, original.id, TODAY);
      equal(credit(removed).paymentDueBaselineIds, [original.id]);
      equal(creditPaymentRemaining(removed, credit(removed), TODAY), 100_000);
      const read = decodeBackup(encodeBackup(removed));
      equal(credit(read).paymentDueBaselineIds, [original.id]);
    },
  },
  {
    name: "a newly entered backdated repayment pays the confirmed statement only once",
    run() {
      let state = confirmCreditTerms(
        creditState(),
        {
          accountId: "credit",
          paymentDueAmount: 100_000,
          paymentDueDate: "2026-10-25",
        },
        TODAY,
      );
      state = appendTransaction(
        state,
        transfer("backdated", 25_000, "2026-10-17"),
        TODAY,
      );
      equal(creditPaymentRemaining(state, credit(state), TODAY), 75_000);
      state = confirmCreditTerms(
        state,
        {
          accountId: "credit",
          paymentDueAmount: 75_000,
          paymentDueDate: "2026-10-25",
        },
        TODAY,
      );
      equal(creditPaymentRemaining(state, credit(state), TODAY), 75_000);
      equal(new Set(credit(state).paymentDueBaselineIds).size, 2);
    },
  },
  {
    name: "invalid confirmation and reminder dates fail without mutation",
    run() {
      const start = creditState();
      const before = JSON.stringify(start);
      rejects(
        () =>
          confirmCreditTerms(
            start,
            { accountId: "credit", paymentDueAmount: 100_000 },
            TODAY,
          ),
        /дату/,
      );
      rejects(
        () => saveCreditTermsReminder(start, "credit", "2026-10-18", TODAY),
        /раньше/,
      );
      rejects(
        () => saveCreditTermsReminder(start, "card", "2026-10-20", TODAY),
        /кредитную/,
      );
      for (const patch of [
        { creditTermsConfirmedOn: "2026-10-20" },
        { creditTermsReminderDate: "2026-02-30" },
      ])
        rejects(
          () =>
            validateCreditAccounts(
              {
                ...start,
                accounts: start.accounts.map((account) =>
                  account.id === "credit" ? { ...account, ...patch } : account,
                ),
              },
              TODAY,
            ),
          /дат|Дата/,
        );
      equal(JSON.stringify(start), before);
    },
  },
  {
    name: "old backups have unknown confirmation dates while format seven round trips new dates",
    run() {
      const old = creditState();
      const restored = validateBackupValue(old, TODAY);
      equal(credit(restored).creditTermsConfirmedOn, undefined);
      equal(credit(restored).creditTermsReminderDate, undefined);
      const next = confirmCreditTerms(
        old,
        {
          accountId: "credit",
          paymentDueAmount: 100_000,
          paymentDueDate: "2026-10-25",
          reminderDate: "2026-10-24",
        },
        TODAY,
      );
      const roundTrip = decodeBackup(encodeBackup(next));
      equal(roundTrip.version, 7);
      equal(credit(roundTrip), credit(next));
      rejects(
        () => validateBackupValue({ ...next, version: 6 }, TODAY),
        /Не удалось прочитать файл/,
      );
    },
  },
  {
    name: "credit reminder shares enable switch and notification cap with payments",
    run() {
      const state = saveCreditTermsReminder(
        creditState(),
        "credit",
        "2026-10-20",
        TODAY,
      );
      const now = new Date("2026-10-19T12:00:00");
      equal(reminderPlan(state, now).items, []);
      state.settings.reminders = { enabled: true, hour: 9, daysBefore: 1 };
      equal(reminderPlan(state, now).items, [
        {
          id: "lad.credit-terms.credit.2026-10-20",
          at: new Date("2026-10-20T09:00:00").getTime(),
          creditAccountId: "credit",
          date: "2026-10-20",
        },
      ]);
      state.recurring = Array.from({ length: 80 }, (_, index) => ({
        id: `payment-${index}`,
        name: "Платёж",
        amount: 100,
        day: 21,
        kind: "bill" as const,
        icon: "card-outline" as const,
        color: "#234B3C",
        category: "other",
        accountId: "card",
        active: true,
        startsOn: TODAY,
      }));
      equal(reminderPlan(state, now).items.length, 60);
      equal(reminderPlan(state, now).truncated, true);
    },
  },
  {
    name: "reminder navigation and cancellation keep profile and active credit identity",
    run() {
      const state = saveCreditTermsReminder(
        creditState(),
        "credit",
        "2026-10-20",
        TODAY,
      );
      const data = readPaymentNotification({
        source: "lad",
        profile: "personal",
        creditAccountId: "credit",
        date: "2026-10-20",
      })!;
      equal(notificationTarget(data, "demo", state), null);
      equal(notificationTarget(data, "personal", state), {
        tab: "plan",
        sheet: { type: "account", id: "credit" },
      });
      equal(
        notificationTarget(
          { ...data, creditAccountId: "card" },
          "personal",
          state,
        )?.sheet,
        null,
      );
      const archived = {
        ...state,
        accounts: state.accounts.map((account) =>
          account.id === "credit" ? { ...account, archived: true } : account,
        ),
      };
      equal(notificationTarget(data, "personal", archived)?.sheet, null);
      state.settings.reminders = { enabled: true, hour: 9, daysBefore: 1 };
      const items = reminderPlan(state, new Date("2026-10-19T12:00:00")).items;
      const changes = reminderChanges(items, [], "personal");
      equal(
        changes.schedule[0].id,
        "lad.personal.credit-terms.credit.2026-10-20",
      );
      const existing = changes.schedule.map((item) => ({
        identifier: item.id,
        content: { data: { profile: "personal", at: item.at } },
      }));
      equal(reminderChanges([], existing, "personal").cancel, [
        changes.schedule[0].id,
      ]);
      equal(reminderChanges([], existing, "demo").cancel, [
        changes.schedule[0].id,
      ]);
    },
  },
  {
    name: "shrinking an early issue below a later repayment is rejected atomically",
    run() {
      const state = debtState();
      const before = JSON.stringify(state);
      rejects(() => edit(state, { amount: 500_000 }), /Возврат превышает/);
      equal(JSON.stringify(state), before);
      equal(debtBalance(state, state.debts![0], TODAY), 400_000);
    },
  },
  {
    name: "a valid issue edit preserves identity, order, category, import and posting status",
    run() {
      const state = debtState();
      const next = edit(state, {
        amount: 700_000,
        title: "Исправленная выдача",
      });
      equal(
        next.transactions.map((entry) => entry.id),
        ["repay", "issue"],
      );
      const row = next.transactions[1];
      equal(
        [
          row.debtId,
          row.debtAction,
          row.type,
          row.category,
          row.importKey,
          row.status,
        ],
        ["debt", "issue", "income", "other", "t06-debt-import", "posted"],
      );
      equal(debtBalance(next, next.debts![0], TODAY), 100_000);
      equal(accountBalance(next, "card", TODAY), 2_100_000);
      equal(totals(next, "2026-10"), { income: 0, expense: 0 });
      equal(debtBalance(state, state.debts![0], TODAY), 400_000);
    },
  },
  {
    name: "every dated balance is checked even when a later issue covers today's total",
    run() {
      const state = debtState();
      state.transactions.unshift({
        ...state.transactions[1],
        id: "late-issue",
        amount: 800_000,
        date: "2026-10-17",
      });
      rejects(() => edit(state, { date: "2026-10-15" }), /Возврат превышает/);
      rejects(() => edit(state, { amount: 100_000 }), /Возврат превышает/);
    },
  },
  {
    name: "metadata edit keeps historical baseAmount and transfer to same-currency account is supported",
    run() {
      const state = debtState();
      const renamed = edit(state, {
        title: "Правильное описание",
        note: "Уточнено",
      });
      equal(renamed.transactions[1].baseAmount, 999_999);
      const next = edit(renamed, { accountId: "cash" });
      equal(next.transactions[1].accountId, "cash");
      equal(debtBalance(next, next.debts![0], TODAY), 400_000);
      equal(accountBalance(next, "card", TODAY), 1_400_000);
      equal(accountBalance(next, "cash", TODAY), 1_000_000);
    },
  },
  {
    name: "stale editor, foreign currency, archived account and invalid dates cannot modify a debt row",
    run() {
      const state = debtState();
      const original = state.transactions[1];
      const changed = edit(state, { title: "Другое название" });
      rejects(
        () =>
          editDebtTransaction(
            changed,
            {
              id: original.id,
              title: original.title,
              amount: original.amount,
              date: original.date,
              accountId: original.accountId,
              expectedOriginal: original,
            },
            TODAY,
          ),
        /изменилась/,
      );
      const foreign: Account = {
        ...state.accounts[0],
        id: "usd",
        currency: "USD",
      };
      state.accounts.push(foreign);
      rejects(() => edit(state, { accountId: "usd" }), /валюте/);
      state.accounts.find((account) => account.id === "cash")!.archived = true;
      rejects(() => edit(state, { accountId: "cash" }), /активный/);
      rejects(() => edit(state, { date: "2026-09-30" }), /между/);
      rejects(() => edit(state, { date: "2026-10-20" }), /между/);
    },
  },
  {
    name: "repayment edits and lent principal preserve direction and reject excess cash outflow",
    run() {
      const state = debtState();
      const repayment = state.transactions[0];
      rejects(
        () =>
          editDebtTransaction(
            state,
            {
              id: repayment.id,
              title: repayment.title,
              amount: 1_100_000,
              accountId: repayment.accountId,
              date: repayment.date,
              expectedOriginal: repayment,
            },
            TODAY,
          ),
        /Возврат превышает/,
      );
      const repaid = editDebtTransaction(
        state,
        {
          id: repayment.id,
          title: repayment.title,
          amount: 400_000,
          accountId: repayment.accountId,
          date: repayment.date,
          expectedOriginal: repayment,
        },
        TODAY,
      );
      equal(debtBalance(repaid, repaid.debts![0], TODAY), 600_000);
      equal(repaid.transactions[0].debtAction, "repay");
      state.debts![0].direction = "lent";
      state.transactions = state.transactions.map((row) => ({
        ...row,
        type: row.debtAction === "issue" ? "expense" : "income",
      }));
      const lent = edit(state, { amount: 900_000 });
      equal(debtBalance(lent, lent.debts![0], TODAY), 300_000);
      equal(lent.transactions[1].type, "expense");
      equal(totals(lent, "2026-10"), { income: 0, expense: 0 });
      rejects(
        () => edit(state, { accountId: "cash", amount: 1_000_001 }),
        /недостаточно/,
      );
    },
  },
  {
    name: "debt edits round trip without reclassifying principal as consumption",
    run() {
      const next = edit(debtState(), { amount: 700_000, note: "Сверено" });
      const restored = decodeBackup(encodeBackup(next));
      equal(restored.transactions, next.transactions);
      equal(debtBalance(restored, restored.debts![0], TODAY), 100_000);
      equal(totals(restored, "2026-10"), { income: 0, expense: 0 });
    },
  },
] as const;
