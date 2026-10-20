import {
  accountAvailability,
  accountBalance,
} from "../../src/domain/accountBalances";
import {
  accountArchiveBlockers,
  activeAccounts,
} from "../../src/domain/accountArchive";
import {
  archiveAccount,
  restoreAccount,
} from "../../src/domain/actions/accountArchive";
import { saveAccount } from "../../src/domain/actions/accounts";
import { saveCsvProfile } from "../../src/domain/actions/automation";
import { changeBaseCurrency } from "../../src/domain/actions/currencies";
import { repayDebt, saveDebt } from "../../src/domain/actions/debts";
import { fundGoal } from "../../src/domain/actions/goals";
import {
  deletePlannedIncome,
  receivePlannedIncome,
  savePlannedIncome,
} from "../../src/domain/actions/incomes";
import { reconcileAccount } from "../../src/domain/actions/reconciliation";
import {
  deleteRecurring,
  payRecurring,
  saveRecurring,
  setPaymentSkipped,
} from "../../src/domain/actions/recurring";
import {
  appendTransaction,
  cancelPendingTransaction,
  deleteTransaction,
  postPendingTransaction,
  sameTransaction,
  saveTransaction,
  type TransactionInput,
} from "../../src/domain/actions/transactions";
import {
  applyCsvProfile,
  templateDraft,
  type CsvSourceProfile,
  type TransactionTemplate,
} from "../../src/domain/automation";
import {
  assertBackupSize,
  backupByteLength,
  encodeBackup,
  MAX_BACKUP_BYTES,
  validateBackupValue,
} from "../../src/domain/backup";
import { prepareRestoreCandidate } from "../../src/domain/backupRecovery";
import { categoryBudget } from "../../src/domain/budgets";
import {
  applyCsvImport,
  guessCsvMapping,
  parseCsv,
  previewCsv,
  type CsvOptions,
} from "../../src/domain/csv";
import { exportTransactionsCsvParts } from "../../src/domain/csvExport";
import {
  creditOutstanding,
  creditPaymentRemaining,
  projectedDebtObligations,
} from "../../src/domain/debts";
import { spendable } from "../../src/domain/finance";
import { forecast } from "../../src/domain/forecast";
import { goalSaved } from "../../src/domain/goals";
import { incomeOccurrences, incomeReceived } from "../../src/domain/incomes";
import { upcoming } from "../../src/domain/payments";
import { planPurchase } from "../../src/domain/purchasePlanner";
import {
  accountSignature,
  reconciliationCurrent,
} from "../../src/domain/reconciliation";
import { createInitialState } from "../../src/domain/seed";
import {
  expenseContributions,
  periodTotals,
} from "../../src/domain/transactionAmounts";
import { selectTransactionList } from "../../src/domain/transactionList";
import { transactionStatus } from "../../src/domain/transactionStatus";
import type {
  FinanceState,
  PlannedIncome,
  Recurring,
  Transaction,
} from "../../src/domain/types";

const TODAY = "2026-10-15";
const NEXT = "2026-10-16";
function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function equal(actual: unknown, expected: unknown, message: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(
      `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
}
function rejects(run: () => unknown, pattern: RegExp) {
  try {
    run();
  } catch (error) {
    check(
      error instanceof Error && pattern.test(error.message),
      `Unexpected error: ${String(error)}`,
    );
    return;
  }
  throw new Error(`Expected rejection ${pattern}`);
}
function ledger(): FinanceState {
  const state = createInitialState(false, TODAY);
  state.accounts[0].openingBalance = 1_000_000;
  return state;
}
function input(overrides: Partial<TransactionInput> = {}): TransactionInput {
  return {
    createId: "intent",
    type: "expense",
    title: "Покупка",
    amount: 200_000,
    date: TODAY,
    accountId: "card",
    category: "other",
    status: "pending",
    expectedDate: NEXT,
    ...overrides,
  };
}
function pending(state = ledger(), overrides: Partial<TransactionInput> = {}) {
  return saveTransaction(state, input(overrides), TODAY);
}
function payment(): Recurring {
  return {
    id: "bill",
    name: "Счёт",
    amount: 200_000,
    day: 16,
    kind: "bill",
    active: true,
    icon: "home-outline",
    color: "#123456",
    category: "home",
    accountId: "card",
    startsOn: TODAY,
  };
}
function income(): PlannedIncome {
  return {
    id: "salary",
    name: "Доход",
    amount: 500_000,
    date: NEXT,
    repeat: "once",
    accountId: "card",
  };
}
function options(headers: string[]): CsvOptions {
  return {
    accountId: "card",
    mapping: guessCsvMapping(headers),
    mode: "signed",
    positive: "income",
    dateOrder: "dmy",
  };
}
function filter(
  state: FinanceState,
  status: "all" | "posted" | "pending" | "cancelled" = "all",
) {
  return selectTransactionList(
    state,
    {
      month: "2026-10",
      query: "",
      type: "all",
      account: "all",
      category: "all",
      status,
    },
    TODAY,
  );
}

// These cases execute the real pure financial actions in Chromium. No platform,
// React, storage, or Node test runtime is needed by this shared case list.
export const t04FinanceCases: readonly {
  name: string;
  run: () => void | Promise<void>;
}[] = [
  {
    name: "pending expense holds once, posts once, and preserves immutable input",
    run() {
      const start = ledger(),
        before = encodeBackup(start),
        state = pending(start);
      equal(encodeBackup(start), before, "Action mutated input");
      equal(state.version, 5, "New semantics must promote format");
      equal(
        accountAvailability(state, "card", TODAY),
        { balance: 1_000_000, held: 200_000, available: 800_000 },
        "Fact vs hold",
      );
      const projection = forecast(state, 30, TODAY);
      equal(
        [
          projection.days[0].balance,
          projection.days[0].held,
          projection.days[0].available,
        ],
        [1_000_000, 200_000, 800_000],
        "Before expected date",
      );
      equal(
        [
          projection.days[1].balance,
          projection.days[1].held,
          projection.days[1].available,
        ],
        [800_000, 0, 800_000],
        "Release and spend atomically",
      );
      const posted = postPendingTransaction(state, "intent", TODAY, TODAY);
      equal(
        accountAvailability(posted, "card", TODAY),
        { balance: 800_000, held: 0, available: 800_000 },
        "Posted fact",
      );
      check(
        postPendingTransaction(posted, "intent", TODAY, TODAY) === posted,
        "Repeat posting changed state",
      );
      equal(posted.transactions.length, 1, "Posting duplicated transaction");
      check(
        posted.transactions[0].expectedDate === undefined,
        "Posted row retained expected date",
      );
      rejects(
        () => cancelPendingTransaction(posted, "intent", TODAY),
        /Проведённый/,
      );
      rejects(
        () =>
          saveTransaction(
            posted,
            { ...posted.transactions[0], status: "pending" },
            TODAY,
          ),
        /статус/,
      );
    },
  },
  {
    name: "cancelled intent releases hold but remains visible without cashflow",
    run() {
      const state = cancelPendingTransaction(pending(), "intent", TODAY);
      equal(
        accountAvailability(state, "card", TODAY),
        { balance: 1_000_000, held: 0, available: 1_000_000 },
        "Cancel fact",
      );
      equal(
        filter(state, "cancelled").transactions.length,
        1,
        "History lost cancelled intent",
      );
      equal(filter(state).expense, 0, "Cancelled expense in totals");
      equal(forecast(state, 30, TODAY).outflow, 0, "Cancelled forecast event");
      check(
        cancelPendingTransaction(state, "intent", TODAY) === state,
        "Repeat cancellation changed state",
      );
      rejects(
        () => postPendingTransaction(state, "intent", TODAY, TODAY),
        /Отменённую/,
      );
      rejects(
        () =>
          saveTransaction(
            state,
            { ...state.transactions[0], title: "Другое" },
            TODAY,
          ),
        /Отменённая/,
      );
      equal(
        deleteTransaction(state, "intent", TODAY).version,
        5,
        "Delete downcast v5",
      );
    },
  },
  ...([undefined, "2027-12-01", "2026-10-14"] as const).map((expectedDate) => ({
    name: `outgoing hold survives absent/far/overdue expected date ${String(expectedDate)}`,
    run() {
      const state = pending(ledger(), { expectedDate }),
        result = forecast(state, 30, TODAY);
      equal(result.openingHeld, 200_000, "Horizon must not drop hold");
      equal(result.days[0].available, 800_000, "Availability is reserved");
      const events = result.days
        .flatMap((day) => day.events)
        .filter((event) => event.pendingId);
      equal(
        events.length,
        expectedDate === "2026-10-14" ? 1 : 0,
        "Projection event timing",
      );
      equal(
        result.closingAvailable,
        800_000,
        "Hold double counted or disappeared",
      );
    },
  })),
  {
    name: "pending income never changes fact and overdue income stops being forecast cash",
    run() {
      const state = pending(ledger(), { type: "income", expectedDate: TODAY });
      equal(
        accountAvailability(state, "card", TODAY),
        { balance: 1_000_000, held: 0, available: 1_000_000 },
        "Income not fact",
      );
      equal(
        forecast(state, 30, TODAY).closingAvailable,
        1_200_000,
        "On-time income projection",
      );
      equal(
        forecast(state, 30, NEXT).income,
        0,
        "Overdue income promised cash",
      );
      const undated = pending(ledger(), {
        type: "income",
        expectedDate: undefined,
      });
      equal(
        forecast(undated, 30, TODAY).income,
        0,
        "Undated income promised cash",
      );
    },
  },
  {
    name: "pending outgoing transfer reserves source and books both sides atomically",
    run() {
      const state = pending(ledger(), {
        type: "transfer",
        toAccountId: "cash",
      });
      equal(
        accountAvailability(state, "cash", TODAY),
        { balance: 0, held: 0, available: 0 },
        "Incoming transfer cannot fund spending today",
      );
      const result = forecast(state, 30, TODAY);
      equal(
        [result.days[0].available, result.days[1].available],
        [800_000, 1_000_000],
        "Internal transfer holds then releases",
      );
      equal(
        result.days[1].events.filter((event) => event.pendingId).length,
        1,
        "Transfer split into double events",
      );
      const posted = postPendingTransaction(state, "intent", TODAY, TODAY);
      equal(
        [
          accountBalance(posted, "card", TODAY),
          accountBalance(posted, "cash", TODAY),
        ],
        [800_000, 200_000],
        "Transfer legs",
      );
    },
  },
  {
    name: "other holds constrain transfer and debt cash but posted ordinary expense may be negative",
    run() {
      const state = pending(ledger(), {
        amount: 900_000,
        expectedDate: undefined,
      });
      rejects(
        () =>
          saveTransaction(
            state,
            input({
              createId: "transfer",
              type: "transfer",
              toAccountId: "cash",
              amount: 100_001,
              status: undefined,
              expectedDate: undefined,
            }),
            TODAY,
          ),
        /недостаточно/,
      );
      rejects(
        () =>
          saveDebt(
            state,
            {
              name: "Выдача",
              direction: "lent",
              accountId: "card",
              amount: 100_001,
              date: TODAY,
              recordTransaction: true,
            },
            TODAY,
          ),
        /недостаточно/,
      );
      const fact = saveTransaction(
        state,
        input({
          createId: "fact",
          amount: 1_100_000,
          status: undefined,
          expectedDate: undefined,
        }),
        TODAY,
      );
      equal(
        accountBalance(fact, "card", TODAY),
        -100_000,
        "Ordinary fact was suppressed by intent",
      );
      equal(
        accountAvailability(fact, "card", TODAY).available,
        -1_000_000,
        "Negative available shows holds",
      );
    },
  },
  {
    name: "overdue incoming transfer stays atomic and never promises spending cash",
    run() {
      const start = ledger();
      start.accounts[2].openingBalance = 500_000;
      const state = pending(start, {
        type: "transfer",
        accountId: "savings",
        toAccountId: "card",
        expectedDate: "2026-10-14",
      });
      const result = forecast(state, 30, TODAY);
      equal(result.income, 0, "Overdue savings transfer promised cash");
      equal(
        result.closingAvailable,
        1_000_000,
        "Overdue incoming transfer increased spending forecast",
      );
      equal(
        accountAvailability(state, "savings", TODAY),
        { balance: 500_000, held: 200_000, available: 300_000 },
        "Source hold disappeared",
      );
      const rescheduled = saveTransaction(
        state,
        { ...state.transactions[0], expectedDate: NEXT },
        TODAY,
      );
      equal(
        forecast(rescheduled, 30, TODAY).closingAvailable,
        1_200_000,
        "Explicit new date did not restore atomic projection",
      );
    },
  },
  {
    name: "posting a transfer releases only its own hold",
    run() {
      let state = pending(ledger(), {
        type: "transfer",
        toAccountId: "cash",
        amount: 600_000,
      });
      state = pending(state, { createId: "other", amount: 300_000 });
      state = postPendingTransaction(state, "intent", TODAY, TODAY);
      equal(
        accountAvailability(state, "card", TODAY),
        { balance: 400_000, held: 300_000, available: 100_000 },
        "Own hold release",
      );
      equal(
        state.transactions.find((t) => t.id === "other")?.status,
        "pending",
        "Other intent changed",
      );
    },
  },
  {
    name: "foreign transfer preserves JPY and KWD amounts and current posting valuation",
    run() {
      let state = ledger();
      state.settings.exchange = {
        rates: {
          JPY: { value: 50_000_000, source: "manual", date: TODAY },
          KWD: { value: 30_000_000_000, source: "manual", date: TODAY },
        },
        automatic: false,
      };
      state.accounts[0].currency = "JPY";
      state.accounts[0].openingBalance = 10_000;
      state.accounts[1].currency = "KWD";
      state = pending(state, {
        type: "transfer",
        toAccountId: "cash",
        amount: 1_000,
        toAmount: 2_000,
      });
      equal(
        accountAvailability(state, "card", TODAY).held,
        1_000,
        "JPY reserve uses minor units",
      );
      state.settings = {
        ...state.settings,
        exchange: {
          ...state.settings.exchange!,
          rates: {
            ...state.settings.exchange!.rates,
            JPY: { value: 60_000_000, source: "manual", date: TODAY },
          },
        },
      };
      const posted = postPendingTransaction(state, "intent", TODAY, TODAY);
      equal(
        [
          accountBalance(posted, "card", TODAY),
          accountBalance(posted, "cash", TODAY),
        ],
        [9_000, 2_000],
        "FX actual leg amounts",
      );
      equal(
        posted.transactions[0].baseAmount,
        60_000,
        "Posting revalues at current FX",
      );
    },
  },
  {
    name: "savings reserve respects goal collateral and ignores pending incoming funds",
    run() {
      const state = ledger();
      state.accounts[2].openingBalance = 100_000;
      state.goals = [
        {
          id: "goal",
          name: "Цель",
          target: 100_000,
          initialSaved: 80_000,
          monthly: 0,
          icon: "home-outline",
          color: "#123456",
        },
      ];
      const held = pending(state, {
        type: "transfer",
        accountId: "savings",
        toAccountId: "card",
        amount: 20_000,
      });
      equal(
        goalSaved(held, held.goals[0], TODAY),
        80_000,
        "Intent changed goal",
      );
      rejects(
        () =>
          pending(held, {
            createId: "excess",
            type: "transfer",
            accountId: "savings",
            toAccountId: "card",
            amount: 1,
          }),
        /цел|накоплен/,
      );
      const incoming = pending(held, {
        createId: "incoming",
        type: "transfer",
        toAccountId: "savings",
        amount: 50_000,
      });
      rejects(
        () =>
          pending(incoming, {
            createId: "excess",
            type: "transfer",
            accountId: "savings",
            toAccountId: "card",
            amount: 1,
          }),
        /цел|накоплен/,
      );
      equal(
        accountBalance(incoming, "savings", TODAY),
        100_000,
        "Incoming intent treated as savings",
      );
    },
  },
  {
    name: "pending credit expense consumes free limit but not outstanding debt",
    run() {
      const state = ledger();
      state.accounts.push({
        id: "credit",
        name: "Кредитная",
        kind: "credit",
        openingBalance: -20_000,
        creditLimit: 100_000,
        paymentDueAmount: 20_000,
        paymentDueDate: NEXT,
        icon: "card-outline",
        color: "#123456",
      });
      const held = pending(state, { accountId: "credit", amount: 80_000 });
      equal(
        creditOutstanding(held, held.accounts[3], TODAY),
        20_000,
        "Intent became debt",
      );
      rejects(
        () =>
          pending(held, { createId: "over", accountId: "credit", amount: 1 }),
        /лимит/,
      );
      const repaying = pending(state, {
        type: "transfer",
        toAccountId: "credit",
        amount: 10_000,
      });
      equal(
        creditPaymentRemaining(repaying, repaying.accounts[3], TODAY),
        20_000,
        "Pending repayment reduced due",
      );
      const posted = postPendingTransaction(repaying, "intent", TODAY, TODAY);
      equal(
        creditPaymentRemaining(posted, posted.accounts[3], TODAY),
        10_000,
        "Posted repayment did not reduce due",
      );
    },
  },
  {
    name: "pending split stays in history but not statistics, budgets or CSV",
    run() {
      let state = pending(ledger(), {
        amount: 101,
        splits: [
          { category: "home", amount: 50 },
          { category: "other", amount: 51 },
        ],
      });
      equal(
        expenseContributions(state, state.transactions[0]),
        [],
        "Intent contributes expense",
      );
      equal(
        filter(state, "pending").transactions.length,
        1,
        "Intent missing from history",
      );
      equal(filter(state, "pending").expense, 0, "Intent in list totals");
      equal(
        periodTotals(state, "2026-10-01", TODAY).expense,
        0,
        "Intent in statistics",
      );
      equal(
        categoryBudget(state, "home", TODAY, TODAY).spent,
        0,
        "Intent in budget",
      );
      equal(
        exportTransactionsCsvParts(state, { format: "universal" }, TODAY).totals
          .transactionCount,
        0,
        "Intent in CSV",
      );
      state = postPendingTransaction(state, "intent", TODAY, TODAY);
      equal(
        expenseContributions(state, state.transactions[0]).map(
          (part) => part.amount,
        ),
        [50, 51],
        "Split exact minor units",
      );
      equal(
        categoryBudget(state, "home", TODAY, TODAY).spent,
        50,
        "Posted split budget",
      );
      equal(
        exportTransactionsCsvParts(state, { format: "universal" }, TODAY).totals
          .rowCount,
        2,
        "Split CSV rows",
      );
    },
  },
  {
    name: "reconciliation is unaffected by intent editing and cancellation, invalidated by posting",
    run() {
      let state = ledger();
      const signature = accountSignature(state, "card", TODAY);
      state = reconcileAccount(
        state,
        {
          accountId: "card",
          date: TODAY,
          balance: 1_000_000,
          note: "",
          adjust: false,
          expectedSignature: signature,
        },
        TODAY,
      );
      const receipt = state.reconciliations![0];
      state = pending(state);
      check(
        reconciliationCurrent(state, receipt),
        "Intent invalidated actual reconciliation",
      );
      state = saveTransaction(
        state,
        { ...state.transactions[0], amount: 250_000 },
        TODAY,
      );
      check(
        reconciliationCurrent(state, receipt),
        "Edited intent invalidated actual reconciliation",
      );
      check(
        reconciliationCurrent(
          cancelPendingTransaction(state, "intent", TODAY),
          receipt,
        ),
        "Cancelled intent invalidated reconciliation",
      );
      check(
        !reconciliationCurrent(
          postPendingTransaction(state, "intent", TODAY, TODAY),
          receipt,
        ),
        "Posting failed to invalidate reconciliation",
      );
    },
  },
  {
    name: "linked payment intent replaces event and pay action posts the same ID",
    run() {
      const start = ledger();
      start.recurring = [payment()];
      let state = pending(start, {
        category: "home",
        recurringId: "bill",
        occurrenceDate: NEXT,
        expectedDate: "2026-10-17",
      });
      equal(
        upcoming(state, TODAY, "2026-10-18")[0].paid,
        false,
        "Pending marked paid",
      );
      const events = forecast(state, 30, TODAY)
        .days.flatMap((day) => day.events)
        .filter((event) => event.pendingId || event.sourceId === "bill");
      equal(events.length, 1, "Plan plus intent double forecast");
      rejects(
        () =>
          pending(state, {
            createId: "duplicate",
            recurringId: "bill",
            occurrenceDate: NEXT,
          }),
        /оплачен/,
      );
      rejects(
        () => setPaymentSkipped(state, "bill", NEXT, true, TODAY),
        /оплачен|операц|ожидан/,
      );
      const before = state.transactions[0];
      state = payRecurring(state, "bill", NEXT, TODAY);
      equal(
        state.transactions.map((t) => t.id),
        [before.id],
        "Pay created another fact",
      );
      check(upcoming(state, TODAY, "2026-10-18")[0].paid, "Posted not paid");
      check(
        payRecurring(state, "bill", NEXT, TODAY) === state,
        "Repeated pay changed state",
      );
    },
  },
  {
    name: "cancelled payment frees occurrence key, plan deletion retains standalone intent",
    run() {
      const start = ledger();
      start.recurring = [payment()];
      const linked = pending(start, {
        recurringId: "bill",
        occurrenceDate: NEXT,
      });
      const cancelled = cancelPendingTransaction(linked, "intent", TODAY);
      const recreated = pending(cancelled, {
        createId: "second",
        recurringId: "bill",
        occurrenceDate: NEXT,
      });
      equal(
        recreated.transactions.length,
        2,
        "Cancelled history lost or key remained occupied",
      );
      const detached = deleteRecurring(linked, "bill");
      equal(
        transactionStatus(detached.transactions[0]),
        "pending",
        "Plan delete posted intent",
      );
      check(
        !detached.transactions[0].recurringId,
        "Deleted plan link retained",
      );
      equal(
        forecast(detached, 30, TODAY)
          .days.flatMap((day) => day.events)
          .filter((event) => event.pendingId).length,
        1,
        "Detached intent vanished",
      );
    },
  },
  {
    name: "linked pending income owns original occurrence and overdue receipt is not resurrected",
    run() {
      const start = ledger();
      start.plannedIncomes = [income()];
      const state = pending(start, {
        type: "income",
        amount: 500_000,
        plannedIncomeId: "salary",
        incomeOccurrenceDate: NEXT,
        expectedDate: "2026-10-18",
      });
      check(
        !incomeReceived(state, income(), NEXT, TODAY),
        "Pending marked received",
      );
      const occurrences = incomeOccurrences(state, TODAY, "2026-10-20", TODAY);
      equal(
        occurrences.map((item) => item.date),
        ["2026-10-18"],
        "Original plan date resurrected",
      );
      const overdue = forecast(state, 30, "2026-10-19");
      equal(overdue.income, 0, "Overdue expected income promised cash");
      const projected = forecast(state, 30, TODAY, undefined, {
        id: "scenario",
        name: "Сдвиг",
        horizon: 30,
        events: [],
        changes: [
          {
            source: "income",
            sourceId: "salary",
            name: "Доход",
            amount: 500_000,
            delayDays: 10,
          },
        ],
      });
      equal(
        projected.days
          .flatMap((day) => day.events)
          .filter((event) => event.pendingId || event.sourceId === "salary")
          .length,
        1,
        "Scenario duplicated intent",
      );
      const posted = receivePlannedIncome(state, "salary", NEXT, TODAY);
      equal(
        posted.transactions.map((t) => t.id),
        ["intent"],
        "Receive created duplicate fact",
      );
      check(
        !!incomeReceived(posted, income(), NEXT, TODAY),
        "Posted income not received",
      );
      check(
        receivePlannedIncome(posted, "salary", NEXT, TODAY) === posted,
        "Repeat receive changed state",
      );
    },
  },
  {
    name: "pending linked plans reject material changes but detached income remains an intent",
    run() {
      const start = ledger();
      start.plannedIncomes = [income()];
      start.recurring = [payment()];
      let state = pending(start, {
        type: "income",
        plannedIncomeId: "salary",
        incomeOccurrenceDate: NEXT,
      });
      rejects(
        () => savePlannedIncome(state, { ...income(), amount: 1 }, TODAY),
        /ожидающие поступления: 2026-10-16/,
      );
      state = pending(state, {
        createId: "bill-intent",
        recurringId: "bill",
        occurrenceDate: NEXT,
      });
      rejects(
        () => saveRecurring(state, { ...payment(), amount: 1 }, TODAY),
        /ожидан/,
      );
      const detached = deletePlannedIncome(state, "salary");
      check(
        !detached.transactions.find((t) => t.id === "intent")?.plannedIncomeId,
        "Income link retained",
      );
      equal(
        transactionStatus(
          detached.transactions.find((t) => t.id === "intent")!,
        ),
        "pending",
        "Delete changed status",
      );
    },
  },
  {
    name: "invalid pending combinations and future fact dates fail before changing state",
    run() {
      for (const fields of [
        { refundOf: "purchase" },
        { debtId: "debt", debtAction: "issue" as const },
        { goalId: "goal" },
      ])
        rejects(() => pending(ledger(), fields), /только как проведённые/);
      rejects(() => pending(ledger(), { date: NEXT }), /не позднее/);
      rejects(() => pending(ledger(), { status: "posted" }), /Ожидаемая дата/);
      const state = pending();
      for (const patch of [
        { status: "future" },
        { status: "posted", expectedDate: NEXT },
        { status: "pending", refundOf: "missing" },
        { date: NEXT },
      ]) {
        const raw = JSON.parse(encodeBackup(state));
        Object.assign(raw.transactions[0], patch);
        rejects(
          () => validateBackupValue(raw, TODAY),
          /статус|формат|дата|будущ|проведённ|чтени|проверк|Файл|файл/,
        );
      }
    },
  },
  {
    name: "pending payment cannot revive skipped, inactive or nonexistent occurrences through actions or backup",
    run() {
      const start = ledger();
      start.recurring = [payment()];
      start.plannedIncomes = [income()];
      for (const rule of [
        { ...payment(), active: false },
        { ...payment(), skippedMonths: ["2026-10"] },
        { ...payment(), startsOn: "2026-10-17" },
      ]) {
        const invalid = { ...start, recurring: [rule] };
        rejects(
          () => pending(invalid, { recurringId: "bill", occurrenceDate: NEXT }),
          /ожидан|обязательств|пропущенный/,
        );
        const raw = pending(start, {
          recurringId: "bill",
          occurrenceDate: NEXT,
        });
        rejects(
          () => validateBackupValue({ ...raw, recurring: [rule] }, TODAY),
          /ожидан|обязательств|пропущенный/,
        );
      }
      rejects(
        () => pending(start, { recurringId: "bill", occurrenceDate: TODAY }),
        /обязательств/,
      );
      rejects(
        () =>
          pending(start, {
            type: "income",
            plannedIncomeId: "salary",
            incomeOccurrenceDate: "2026-10-17",
          }),
        /поступлению/,
      );
      const linked = pending(start, {
        recurringId: "bill",
        occurrenceDate: NEXT,
      });
      rejects(
        () =>
          saveRecurring(
            linked,
            { ...payment(), skippedMonths: ["2026-10"] },
            TODAY,
          ),
        /пропущенный/,
      );
      const cancelled = cancelPendingTransaction(linked, "intent", TODAY);
      const skipped = saveRecurring(
        cancelled,
        { ...payment(), skippedMonths: ["2026-10"] },
        TODAY,
      );
      equal(
        skipped.recurring[0].skippedMonths,
        ["2026-10"],
        "Cancelled intent retained active reservation",
      );
    },
  },
  {
    name: "archive may remove last empty active spending/savings choice, preserves account and history",
    run() {
      let state = ledger();
      state.accounts[0].openingBalance = 0;
      state = saveTransaction(
        state,
        input({
          createId: "income",
          type: "income",
          amount: 100,
          status: undefined,
          expectedDate: undefined,
        }),
        TODAY,
      );
      state = saveTransaction(
        state,
        input({
          createId: "expense",
          amount: 100,
          status: undefined,
          expectedDate: undefined,
        }),
        TODAY,
      );
      const history = JSON.stringify(state.transactions);
      for (const account of state.accounts)
        state = archiveAccount(state, account.id, TODAY);
      equal(
        activeAccounts(state).length,
        0,
        "Last active account artificially retained",
      );
      equal(
        JSON.stringify(state.transactions),
        history,
        "Archive rewrote history",
      );
      const decoded = validateBackupValue(
        JSON.parse(encodeBackup(state)),
        TODAY,
      );
      equal(
        decoded.accounts.filter((account) => account.archived).length,
        3,
        "Archive lost on restore",
      );
      check(
        archiveAccount(state, "card", TODAY) === state,
        "Repeated archive changed state",
      );
      equal(
        restoreAccount(state, "card").accounts[0].archived,
        false,
        "Restore failed",
      );
      equal(restoreAccount(state, "card").version, 5, "Restore downcast v5");
    },
  },
  {
    name: "archive blockers cover balance, either pending leg, active plans and open debts",
    run() {
      const start = ledger();
      check(
        accountArchiveBlockers(start, "card", TODAY).some(
          (item) => item.code === "balance",
        ),
        "Nonzero balance allowed",
      );
      const transfer = pending(start, {
        type: "transfer",
        toAccountId: "cash",
      });
      check(
        accountArchiveBlockers(transfer, "cash", TODAY).some(
          (item) => item.code === "pending",
        ),
        "Incoming intent missing blocker",
      );
      const outgoing = pending(start, { accountId: "cash", amount: 1 });
      check(
        accountArchiveBlockers(outgoing, "cash", TODAY).some(
          (item) => item.code === "pending",
        ),
        "Outgoing intent missing blocker",
      );
      start.recurring = [{ ...payment(), accountId: "cash" }];
      start.plannedIncomes = [{ ...income(), accountId: "cash" }];
      start.debts = [
        {
          id: "lent",
          name: "Мне должны",
          direction: "lent",
          currency: "RUB",
          accountId: "cash",
          openingAmount: 1,
          startsOn: TODAY,
        },
        {
          id: "borrowed",
          name: "Я должен",
          direction: "borrowed",
          currency: "RUB",
          accountId: "cash",
          openingAmount: 1,
          startsOn: TODAY,
        },
      ];
      equal(
        accountArchiveBlockers(start, "cash", TODAY).map((item) => item.code),
        ["payment", "income", "debt", "debt"],
        "Missing plan/debt blockers",
      );
      rejects(() => archiveAccount(start, "cash", TODAY), /платёж/);
      start.recurring = [];
      start.plannedIncomes = [];
      start.debts = start.debts.map((debt) => ({ ...debt, openingAmount: 0 }));
      equal(
        accountArchiveBlockers(start, "cash", TODAY),
        [],
        "Closed debts must remain historical",
      );
    },
  },
  {
    name: "archived account rejects new financial choices and history edits, permits rename",
    run() {
      let state = ledger();
      state.accounts[0].openingBalance = 0;
      state = saveTransaction(
        state,
        input({
          createId: "income",
          type: "income",
          amount: 100,
          status: undefined,
          expectedDate: undefined,
        }),
        TODAY,
      );
      state = saveTransaction(
        state,
        input({
          createId: "expense",
          amount: 100,
          status: undefined,
          expectedDate: undefined,
        }),
        TODAY,
      );
      state = archiveAccount(state, "card", TODAY);
      rejects(() => pending(state), /архив/);
      rejects(
        () =>
          saveTransaction(
            state,
            { ...state.transactions[0], title: "Изменено" },
            TODAY,
          ),
        /архив/,
      );
      rejects(() => deleteTransaction(state, "expense", TODAY), /архив/);
      rejects(
        () => saveRecurring(state, { ...payment(), id: undefined }, TODAY),
        /повседневный счёт/,
      );
      rejects(
        () => savePlannedIncome(state, { ...income(), id: undefined }),
        /повседневный счёт/,
      );
      rejects(
        () =>
          saveDebt(
            state,
            {
              name: "Новый",
              direction: "borrowed",
              accountId: "card",
              amount: 1,
              date: TODAY,
              recordTransaction: false,
            },
            TODAY,
          ),
        /активный/,
      );
      rejects(
        () =>
          saveAccount(
            state,
            { id: "card", name: "Счёт", kind: "spending", balance: 1 },
            TODAY,
          ),
        /архив/,
      );
      const renamed = saveAccount(
        state,
        { id: "card", name: "Архивная карта", kind: "spending", balance: 0 },
        TODAY,
      );
      check(renamed.accounts[0].archived, "Rename restored account implicitly");
      rejects(
        () =>
          reconcileAccount(
            state,
            {
              accountId: "card",
              date: TODAY,
              balance: 1,
              note: "Разница",
              adjust: true,
              expectedSignature: accountSignature(state, "card", TODAY),
            },
            TODAY,
          ),
        /архив/,
      );
      equal(
        reconcileAccount(
          state,
          {
            accountId: "card",
            date: TODAY,
            balance: 0,
            note: "",
            adjust: false,
            expectedSignature: accountSignature(state, "card", TODAY),
          },
          TODAY,
        ).reconciliations!.length,
        1,
        "Read-only archived reconciliation rejected",
      );
    },
  },
  {
    name: "saved templates and CSV profiles survive archive but applying them requires active account",
    run() {
      const start = ledger();
      start.accounts[0].openingBalance = 0;
      const table = parseCsv("Дата;Название;Сумма\n15.10.2026;Покупка;-1.00");
      const template: TransactionTemplate = {
        id: "template",
        name: "Шаблон",
        title: "Покупка",
        type: "expense",
        amount: 100,
        category: "other",
        accountId: "card",
        currency: "RUB",
      };
      const profile: CsvSourceProfile = {
        id: "profile",
        name: "Выписка",
        encoding: "utf8",
        separator: ";",
        headerRow: 1,
        headers: table.headers,
        currency: "RUB",
        options: options(table.headers),
      };
      start.transactionTemplates = [template];
      start.csvProfiles = [profile];
      const state = archiveAccount(start, "card", TODAY);
      const decoded = validateBackupValue(
        JSON.parse(encodeBackup(state)),
        TODAY,
      );
      equal(
        decoded.transactionTemplates?.length,
        1,
        "Historical template missing",
      );
      equal(decoded.csvProfiles?.length, 1, "Historical CSV profile missing");
      rejects(() => templateDraft(state, template, TODAY), /недоступны/);
      rejects(
        () => applyCsvProfile(state, profile, table.headers),
        /недоступны/,
      );
      rejects(
        () => saveCsvProfile(state, { ...profile, id: undefined }),
        /недоступны/,
      );
      rejects(
        () => previewCsv(state, table, options(table.headers), {}, TODAY),
        /повседневный счёт/,
      );
      state.goals = [
        {
          id: "goal",
          name: "Цель",
          target: 100,
          initialSaved: 0,
          monthly: 0,
          icon: "home-outline",
          color: "#123456",
        },
      ];
      const noSavings = archiveAccount(state, "savings", TODAY);
      rejects(
        () =>
          fundGoal(
            noSavings,
            { goalId: "goal", amount: 1, accountId: "cash" },
            TODAY,
          ),
        /накопительный/,
      );
    },
  },
  {
    name: "ordinary posted edit shrinks oversized legacy Unicode without materializing status or promoting format",
    run() {
      const start = ledger();
      start.transactions = Array.from({ length: 9000 }, (_, index) => ({
        id: `legacy-${index}`,
        title: `Старая запись ${index}`,
        type: "expense",
        amount: 100,
        baseAmount: 100,
        date: TODAY,
        category: "other",
        accountId: "card",
        note: "Я".repeat(200),
      }));
      const before = encodeBackup(start),
        beforeBytes = backupByteLength(before);
      check(beforeBytes > MAX_BACKUP_BYTES, "Fixture must exceed byte limit");
      const original = start.transactions[0];
      const next = saveTransaction(
        start,
        {
          ...original,
          status: "posted",
          note: "Я".repeat(199),
          expectedOriginal: original,
        },
        TODAY,
      );
      const content = encodeBackup(next);
      equal(next.version, 4, "Ordinary posted edit promoted legacy format");
      check(
        next.transactions[0].status === undefined,
        "Ordinary posted edit materialized default status",
      );
      equal(
        content,
        before.replace("Я".repeat(200), "Я".repeat(199)),
        "Ordinary edit changed unrelated canonical JSON bytes",
      );
      equal(
        backupByteLength(content),
        beforeBytes - 2,
        "Shorter Unicode note grew by status metadata",
      );
      equal(
        assertBackupSize(content, beforeBytes),
        beforeBytes - 2,
        "Oversized shrinking ledger rejected",
      );
      equal(encodeBackup(start), before, "Editing mutated original snapshot");
    },
  },
  {
    name: "implicit posted create retry stays once-only after v5 promotion and never matches pending or cancelled",
    run() {
      const fields = input({ status: "posted", expectedDate: undefined });
      const first = saveTransaction(ledger(), fields, TODAY);
      equal(first.version, 4, "Ordinary creation promoted format");
      check(
        first.transactions[0].status === undefined,
        "Ordinary creation materialized status",
      );
      const later = pending(first, { createId: "later" });
      equal(later.version, 5, "Pending did not promote format");
      check(
        saveTransaction(later, fields, TODAY) === later,
        "Retry re-applied ordinary fact after version upgrade",
      );
      check(
        saveTransaction(later, { ...fields, status: undefined }, TODAY) ===
          later,
        "Implicit and explicit posted request differed on retry",
      );
      equal(
        later.transactions.length,
        2,
        "Retry created extra financial movement",
      );
      const held = pending();
      rejects(() => saveTransaction(held, fields, TODAY), /ID уже занят/);
      rejects(
        () =>
          saveTransaction(
            cancelPendingTransaction(held, "intent", TODAY),
            fields,
            TODAY,
          ),
        /ID уже занят/,
      );
    },
  },
  {
    name: "an explicit posted receipt survives later ordinary edits and v5 creation remains compact",
    run() {
      const posted = postPendingTransaction(pending(), "intent", TODAY, TODAY);
      const next = saveTransaction(
        posted,
        { ...posted.transactions[0], title: "Исправлено", status: undefined },
        TODAY,
      );
      equal(
        next.transactions[0].status,
        "posted",
        "Editing erased explicit posting receipt",
      );
      equal(next.version, 5, "Posting receipt downcast");
      const fields = input({
        createId: "fresh",
        status: "posted",
        expectedDate: undefined,
      });
      const created = saveTransaction(next, fields, TODAY);
      check(
        created.transactions[0].status === undefined,
        "Ordinary v5 creation added unnecessary status",
      );
      equal(created.version, 5, "Ordinary creation downgraded profile");
      check(
        saveTransaction(created, fields, TODAY) === created,
        "Ordinary v5 retry created duplicate",
      );
    },
  },
  {
    name: "stable creation ID confirms identical S1 after S2 without reapplying or overwriting",
    run() {
      const fields = input({
        type: "transfer",
        toAccountId: "cash",
        amount: 700_000,
        status: undefined,
        expectedDate: undefined,
      });
      const first = saveTransaction(ledger(), fields, TODAY);
      const later = saveTransaction(
        first,
        input({
          createId: "later",
          amount: 500_000,
          status: undefined,
          expectedDate: undefined,
        }),
        TODAY,
      );
      check(
        saveTransaction(later, fields, TODAY) === later,
        "Retry revalidated/reapplied old snapshot",
      );
      equal(
        accountBalance(later, "card", TODAY),
        -200_000,
        "Retry changed balance",
      );
      rejects(
        () => saveTransaction(later, { ...fields, amount: 700_001 }, TODAY),
        /ID уже занят/,
      );
      rejects(
        () => saveTransaction(later, { ...fields, createId: "" }, TODAY),
        /ID/,
      );
      const stored = first.transactions[0] as Transaction & {
        createId?: string;
        expectedOriginal?: Transaction;
      };
      check(
        !("createId" in stored) && !("expectedOriginal" in stored),
        "Form concurrency metadata persisted",
      );
    },
  },
  {
    name: "edit baseline canonical equality accepts key order but rejects actual concurrent change",
    run() {
      const state = pending();
      const original = state.transactions[0];
      const reordered = Object.fromEntries(
        Object.entries(original).reverse(),
      ) as unknown as Transaction;
      check(
        sameTransaction(original, reordered),
        "Canonical comparison depends on key order",
      );
      const next = saveTransaction(
        state,
        { ...original, expectedOriginal: reordered, title: "Новое" },
        TODAY,
      );
      rejects(
        () =>
          saveTransaction(
            next,
            { ...original, expectedOriginal: reordered, amount: 100 },
            TODAY,
          ),
        /изменилась после/,
      );
      equal(
        next.transactions[0].title,
        "Новое",
        "Conflict overwrote newest title",
      );
    },
  },
  {
    name: "version 5 roundtrip preserves statuses; legacy unknown fields stay stripped",
    run() {
      let state = pending();
      state = archiveAccount(state, "cash", TODAY);
      const decoded = validateBackupValue(
        JSON.parse(encodeBackup(state)),
        TODAY,
      );
      equal(decoded.version, 5, "V5 downcast");
      equal(decoded.transactions[0].status, "pending", "Status stripped");
      equal(
        decoded.transactions[0].expectedDate,
        NEXT,
        "Expected date stripped",
      );
      check(decoded.accounts[1].archived, "Archive stripped");
      rejects(() => encodeBackup({ ...state, version: 4 }), /версии 5/);
      const legacy = JSON.parse(encodeBackup(state));
      legacy.version = 4;
      legacy.transactions[0].status = "unknown-old";
      const old = validateBackupValue(legacy, TODAY);
      equal(old.version, 4, "Legacy promoted during read");
      check(
        old.transactions[0].status === undefined &&
          old.transactions[0].expectedDate === undefined &&
          old.accounts[1].archived === undefined,
        "Legacy unknown fields leaked into semantics",
      );
      const invalid = JSON.parse(encodeBackup(state));
      invalid.accounts[0].archived = true;
      rejects(() => validateBackupValue(invalid, TODAY), /Архивный счёт/);
    },
  },
  {
    name: "base currency change upgrades v5 to v8 and preserves pending semantics",
    run() {
      const start = ledger();
      start.settings.exchange = {
        automatic: false,
        rates: {
          USD: { value: 10_000_000_000, source: "manual", date: TODAY },
        },
      };
      const original = pending(start);
      const before = JSON.stringify(original);
      equal(original.version, 5, "Expected a v5 source");
      const state = changeBaseCurrency(original, "USD", TODAY);
      equal(state.version, 8, "Valuation basis requires format 8");
      equal(JSON.stringify(original), before, "Currency action mutated source");
      const restored = validateBackupValue(
        JSON.parse(encodeBackup(state)),
        TODAY,
      );
      equal(restored.version, 8, "Valuation format lost in roundtrip");
      for (const result of [state, restored]) {
        equal(result.transactions[0].status, "pending", "Pending status lost");
        equal(result.transactions[0].expectedDate, NEXT, "Expected date lost");
        equal(result.transactions[0].amount, 200_000, "Native amount changed");
        equal(result.transactions[0].baseAmount, 2_000, "Wrong USD valuation");
      }
      equal(
        restored.transactions[0].valuation,
        { date: TODAY, source: "current" },
        "Valuation basis lost in currency roundtrip",
      );
    },
  },
  {
    name: "recovery source v4 remains immutable while smaller current v5 preserves new semantics",
    run() {
      const start = ledger();
      start.transactions = [
        {
          id: "source",
          title: "Старая запись",
          type: "expense",
          amount: 1,
          date: TODAY,
          accountId: "card",
          category: "other",
          note: "С".repeat(500),
        },
      ];
      const source = encodeBackup(start);
      const anchor = prepareRestoreCandidate(source, {
        normalizationDate: TODAY,
        normalizationVersion: 1,
        targetDemo: false,
        transportMode: "rescue",
      });
      const current: FinanceState = {
        ...anchor.state,
        version: 5,
        transactions: anchor.state.transactions.map((t) => ({
          ...t,
          note: "",
          status: "pending",
          expectedDate: NEXT,
        })),
      };
      const candidate = prepareRestoreCandidate(source, {
        normalizationDate: TODAY,
        normalizationVersion: 1,
        targetDemo: false,
        transportMode: "rescue",
        currentSnapshotText: encodeBackup(current),
      });
      equal(candidate.sourceText, source, "Rescue source changed");
      equal(
        candidate.identity.allowance,
        anchor.identity.allowance,
        "New version increased anchor budget",
      );
      equal(candidate.state.version, 5, "Current snapshot downcast");
      equal(
        candidate.state.transactions[0].status,
        "pending",
        "Current status lost",
      );
    },
  },
  {
    name: "CSV matching excludes pending/cancelled but explicit pending bank ID must be resolved",
    run() {
      const table = parseCsv(
        "Дата;Название;Сумма\n15.10.2026;Покупка;-2000.00",
      );
      const config = options(table.headers);
      const state = pending();
      check(
        !previewCsv(state, table, config, {}, TODAY)[0].duplicate,
        "Pending fingerprint hid posted bank fact",
      );
      const cancelled = cancelPendingTransaction(state, "intent", TODAY);
      check(
        !previewCsv(cancelled, table, config, {}, TODAY)[0].duplicate,
        "Cancelled fingerprint hid bank fact",
      );
      const bank = parseCsv(
        "Дата;Название;Сумма;ID операции\n15.10.2026;Покупка;-2000.00;bank1",
      );
      const bankOptions = options(bank.headers);
      bankOptions.mapping.bankId = 3;
      const proposed = previewCsv(ledger(), bank, bankOptions, {}, TODAY)[0]
        .transaction!;
      check(proposed.importKey, "Bank fixture lacks import key");
      const matching = pending(ledger(), { importKey: proposed.importKey });
      check(
        previewCsv(matching, bank, bankOptions, {}, TODAY)[0].error?.includes(
          "ожидан",
        ),
        "Pending bank ID silently skipped or applied",
      );
      const result = applyCsvImport(
        cancelPendingTransaction(matching, "intent", TODAY),
        bank,
        bankOptions,
        new Set(),
        {},
        TODAY,
      );
      equal(
        result.transactions.filter((t) => transactionStatus(t) === "posted")
          .length,
        1,
        "Cancelled bank ID blocked posted fact",
      );
      check(
        previewCsv(result, bank, bankOptions, {}, TODAY)[0].duplicate,
        "Posted bank ID did not deduplicate",
      );
    },
  },
  {
    name: "another account's debt repayment cannot be deleted or reopened after origin account archive",
    run() {
      let state = ledger();
      state.debts = [
        {
          id: "debt",
          name: "Обязательство",
          direction: "borrowed",
          currency: "RUB",
          accountId: "cash",
          openingAmount: 100_000,
          startsOn: TODAY,
        },
      ];
      state = repayDebt(
        state,
        { debtId: "debt", amount: 100_000, accountId: "card", date: TODAY },
        TODAY,
      );
      const repayment = state.transactions[0];
      state = archiveAccount(state, "cash", TODAY);
      const before = encodeBackup(state);
      rejects(
        () => deleteTransaction(state, repayment.id, TODAY),
        /Архивный счёт.*долг/,
      );
      rejects(
        () =>
          appendTransaction(
            state,
            {
              id: "issue",
              type: "income",
              title: "Новое получение",
              amount: 1,
              date: TODAY,
              accountId: "card",
              category: "other",
              debtId: "debt",
              debtAction: "issue",
            },
            TODAY,
          ),
        /Архивный счёт.*долг/,
      );
      equal(
        encodeBackup(state),
        before,
        "Rejected indirect debt action changed state",
      );
      validateBackupValue(JSON.parse(before), TODAY);
    },
  },
  {
    name: "another account's received income cannot reopen a plan belonging to archived account",
    run() {
      let state = ledger();
      state.plannedIncomes = [{ ...income(), accountId: "cash" }];
      state = receivePlannedIncome(state, "salary", NEXT, TODAY);
      state = saveTransaction(
        state,
        { ...state.transactions[0], accountId: "card" },
        TODAY,
      );
      const receipt = state.transactions[0];
      state = archiveAccount(state, "cash", TODAY);
      const before = encodeBackup(state);
      rejects(
        () => deleteTransaction(state, receipt.id, TODAY),
        /Архивный счёт.*дохода/,
      );
      rejects(
        () => saveTransaction(state, { ...receipt, type: "expense" }, TODAY),
        /Архивный счёт.*дохода/,
      );
      equal(
        encodeBackup(state),
        before,
        "Rejected income action changed state",
      );
      validateBackupValue(JSON.parse(before), TODAY);
    },
  },
  ...([NEXT, undefined, "2027-12-01"] as const).map((expectedDate) => ({
    name: `pending credit repayment replaces covered projected due for ${String(expectedDate)}`,
    run() {
      const start = ledger();
      start.accounts.push({
        id: "credit",
        name: "Кредитная",
        kind: "credit",
        openingBalance: -200_000,
        creditLimit: 500_000,
        paymentDueAmount: 200_000,
        paymentDueDate: NEXT,
        icon: "card-outline",
        color: "#123456",
      });
      const state = pending(start, {
        type: "transfer",
        toAccountId: "credit",
        expectedDate,
      });
      equal(
        creditPaymentRemaining(state, state.accounts[3], TODAY),
        200_000,
        "Pending repayment changed actual due",
      );
      equal(
        projectedDebtObligations(state, TODAY, "2026-11-15"),
        [],
        "Covered due remained projected",
      );
      equal(
        spendable(state, TODAY).debts,
        0,
        "Spendable counted hold and covered due",
      );
      equal(
        forecast(state, 30, TODAY).closingAvailable,
        800_000,
        "Forecast counted repayment twice",
      );
      const cancelled = cancelPendingTransaction(state, "intent", TODAY);
      equal(
        spendable(cancelled, TODAY).debts,
        200_000,
        "Cancelled intent still covered due",
      );
      equal(
        forecast(cancelled, 30, TODAY).closingAvailable,
        800_000,
        "Cancellation lost ordinary due",
      );
      const posted = postPendingTransaction(state, "intent", TODAY, TODAY);
      equal(
        creditPaymentRemaining(posted, posted.accounts[3], TODAY),
        0,
        "Posted repayment did not reduce actual due",
      );
      equal(
        forecast(posted, 30, TODAY).closingAvailable,
        800_000,
        "Posted repayment deducted twice",
      );
    },
  })),
  {
    name: "partial FX credit reservation uses target currency, with no negative projected due",
    run() {
      const start = ledger();
      start.accounts[0].currency = "JPY";
      start.accounts[0].openingBalance = 10_000;
      start.settings.exchange = {
        automatic: false,
        rates: {
          JPY: { value: 50_000_000, source: "manual", date: TODAY },
          USD: { value: 10_000_000_000, source: "manual", date: TODAY },
        },
      };
      start.accounts.push({
        id: "credit",
        name: "Кредитная",
        kind: "credit",
        currency: "USD",
        openingBalance: -1_000,
        creditLimit: 5_000,
        paymentDueAmount: 1_000,
        paymentDueDate: NEXT,
        icon: "card-outline",
        color: "#123456",
      });
      const state = pending(start, {
        type: "transfer",
        toAccountId: "credit",
        amount: 250,
        toAmount: 500,
      });
      equal(
        projectedDebtObligations(state, TODAY, "2026-11-15")[0].amount,
        500,
        "Coverage used source JPY instead of USD credit cents",
      );
      equal(
        spendable(state, TODAY).debts,
        50_000,
        "Remaining due in base currency",
      );
      equal(
        forecast(state, 30, TODAY).closingAvailable,
        437_500,
        "FX repayment and uncovered due projection",
      );
      const covered = pending(state, {
        createId: "second",
        type: "transfer",
        toAccountId: "credit",
        amount: 500,
        toAmount: 1_000,
      });
      equal(
        projectedDebtObligations(covered, TODAY, "2026-11-15"),
        [],
        "Overcoverage produced negative due",
      );
      equal(
        creditPaymentRemaining(covered, covered.accounts[3], TODAY),
        1_000,
        "Reservations changed actual credit due",
      );
    },
  },
  {
    name: "repayment reserved from savings does not also reserve spending money",
    run() {
      const start = ledger();
      start.accounts[2].openingBalance = 300_000;
      start.accounts.push({
        id: "credit",
        name: "Кредитная",
        kind: "credit",
        openingBalance: -200_000,
        creditLimit: 500_000,
        paymentDueAmount: 200_000,
        paymentDueDate: NEXT,
        icon: "card-outline",
        color: "#123456",
      });
      const state = pending(start, {
        type: "transfer",
        accountId: "savings",
        toAccountId: "credit",
      });
      equal(
        accountAvailability(state, "savings", TODAY).held,
        200_000,
        "Savings source was not reserved",
      );
      equal(
        spendable(state, TODAY).debts,
        0,
        "Known savings repayment reserved spending too",
      );
      equal(
        forecast(state, 30, TODAY).closingAvailable,
        1_000_000,
        "Savings repayment reduced spending forecast",
      );
      equal(
        creditOutstanding(state, state.accounts[3], TODAY),
        200_000,
        "Pending savings repayment changed fact",
      );
    },
  },
  {
    name: "spendable and maximum purchase use availability and forecast stays pure",
    run() {
      const state = pending(ledger(), { expectedDate: undefined });
      state.settings.buffer = 100_000;
      const before = encodeBackup(state),
        projected = forecast(state, 30, TODAY);
      equal(
        planPurchase(projected, 1, TODAY).maximum,
        700_000,
        "Maximum ignored hold or double-subtracted it",
      );
      equal(spendable(state, TODAY).held, 200_000, "Spendable missing holds");
      const insufficient = pending(ledger(), {
        amount: 1_100_000,
        expectedDate: undefined,
      });
      check(
        forecast(insufficient, 30, TODAY).firstShortfall,
        "Availability shortfall not detected",
      );
      check(
        planPurchase(forecast(insufficient, 30, TODAY), 1, TODAY).earliest ===
          undefined,
        "Unsafe earliest date promised",
      );
      equal(
        encodeBackup(state),
        before,
        "Forecast/purchase mutated financial state",
      );
    },
  },
];
