import {
  createTransactionDraft,
  transactionInput,
} from "../../src/features/transactions/model/transactionDraft";
import { accountBalance } from "../../src/domain/accountBalances";
import { decodeBackup, encodeBackup } from "../../src/domain/backup";
import { forecast } from "../../src/domain/forecast";
import { spendable } from "../../src/domain/finance";
import { accountSignature } from "../../src/domain/reconciliation";
import {
  goalFundCoverage,
  validateGoalFunds,
} from "../../src/domain/goalFunds";
import { goalContributionOccurrences, goalSaved } from "../../src/domain/goals";
import { createInitialState } from "../../src/domain/seed";
import {
  createAnnualFund,
  cancelAnnualFund,
  payFundedPayment,
} from "../../src/domain/actions/goalFunds";
import { deleteGoal, fundGoal } from "../../src/domain/actions/goals";
import {
  payRecurring,
  deleteRecurring,
  saveRecurring,
  setPaymentSkipped,
  setRecurringActive,
} from "../../src/domain/actions/recurring";
import {
  deleteTransaction,
  saveTransaction,
} from "../../src/domain/actions/transactions";
import type { FinanceState } from "../../src/domain/types";
import { reconcileAccount } from "../../src/domain/actions/reconciliation";
import { archiveAccount } from "../../src/domain/actions/accountArchive";

const TODAY = "2026-10-19";
const DUE = "2026-12-10";
function equal(
  actual: unknown,
  expected: unknown,
  message = "Unexpected result",
) {
  const canonical = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value)
              .filter(([, child]) => child !== undefined)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, child]) => [key, canonical(child)]),
          )
        : value;
  if (JSON.stringify(canonical(actual)) !== JSON.stringify(canonical(expected)))
    throw new Error(
      `${message}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`,
    );
}
function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function rejects(run: () => unknown, pattern?: RegExp) {
  let failure: unknown;
  try {
    run();
  } catch (error) {
    failure = error;
  }
  check(failure instanceof Error, "Expected an error");
  if (pattern)
    check(
      pattern.test(failure.message),
      `Unexpected error: ${failure.message}`,
    );
}
export function annualFundFixture(saved = 800_000): FinanceState {
  const state = createInitialState(false, TODAY);
  state.settings.onboardingCompleted = true;
  state.settings.exchange = { automatic: false, rates: {} };
  state.settings.buffer = 0;
  state.settings.forecast = { goalDay: 20, dailySpending: 0 };
  state.settings.reminders = { enabled: false, daysBefore: 1, hour: 9 };
  state.accounts = [
    {
      id: "card",
      name: "Повседневный",
      kind: "spending",
      currency: "RUB",
      openingBalance: 2_000_000,
      icon: "card-outline",
      color: "#EAF0E8",
    },
    {
      id: "savings",
      name: "Подготовленные накопления",
      kind: "savings",
      currency: "RUB",
      openingBalance: saved,
      icon: "wallet-outline",
      color: "#EAF0E8",
    },
  ];
  state.goals = [
    {
      id: "annual-goal",
      name: "Фонд страховки",
      target: 1_200_000,
      initialSaved: saved,
      monthly: 0,
      currency: "RUB",
      icon: "shield-checkmark-outline",
      color: "#EAF0E8",
    },
  ];
  state.transactions = [];
  state.recurring = [
    {
      id: "annual",
      name: "Годовая страховка",
      amount: 1_200_000,
      day: 10,
      kind: "bill",
      active: true,
      icon: "home-outline",
      color: "#EAF0E8",
      category: "home",
      accountId: "card",
      startsOn: TODAY,
      schedule: { unit: "year", interval: 1, anchor: DUE },
    },
  ];
  return state;
}
function linked(saved = 800_000, monthly = 0) {
  return createAnnualFund(
    annualFundFixture(saved),
    {
      recurringId: "annual",
      occurrenceDate: DUE,
      goalId: "annual-goal",
      monthly,
    },
    TODAY,
  );
}
function pay(state: FinanceState, releaseAmount?: number) {
  return payFundedPayment(
    state,
    {
      cycleId: state.goalFundCycles![0].id,
      savingsAccountId: "savings",
      releaseAmount,
    },
    TODAY,
  );
}
export const t06FundCases: readonly { name: string; run(): void }[] = [
  {
    name: "creating one cycle neither creates money nor reassigns another goal",
    run() {
      const state = annualFundFixture();
      const next = createAnnualFund(
        state,
        {
          recurringId: "annual",
          occurrenceDate: DUE,
          goalId: "annual-goal",
          monthly: 0,
        },
        TODAY,
      );
      equal(next.transactions, []);
      equal(next.accounts, state.accounts);
      equal(next.version, 7);
      equal(next.goalFundCycles?.[0].recurringVersionId, "legacy");
      rejects(() =>
        createAnnualFund(
          next,
          { recurringId: "annual", occurrenceDate: DUE },
          TODAY,
        ),
      );
      rejects(() =>
        createAnnualFund(
          next,
          {
            recurringId: "annual",
            occurrenceDate: "2027-12-10",
            goalId: "annual-goal",
          },
          TODAY,
        ),
      );
      equal(state.goalFundCycles, undefined);
    },
  },
  {
    name: "partial fund projects return 8000 and full expense 12000 without another reserve",
    run() {
      const state = linked();
      equal(
        goalFundCoverage(state, state.goalFundCycles![0], TODAY, DUE, false),
        {
          saved: 800_000,
          planned: 0,
          amount: 800_000,
          paymentAmount: 1_200_000,
        },
      );
      const result = forecast(state, 60, TODAY);
      equal(result.closingBalance - result.openingBalance, -400_000);
      const day = result.days.find((entry) => entry.date === DUE)!;
      check(
        day.events.some((event) => event.amount === 800_000),
        "Fund return event missing",
      );
      check(
        day.events.some((event) => event.amount === -1_200_000),
        "Full expense event missing",
      );
    },
  },
  {
    name: "future contributions are counted once and never treated as actual saved cash",
    run() {
      const state = linked(0, 400_000);
      equal(
        goalFundCoverage(state, state.goalFundCycles![0], TODAY, DUE, false)
          .amount,
        0,
      );
      equal(
        goalFundCoverage(state, state.goalFundCycles![0], TODAY).amount,
        400_000,
      );
      const result = forecast(state, 60, TODAY);
      equal(result.closingBalance - result.openingBalance, -1_200_000);
      equal(
        result.days
          .flatMap((day) => day.events)
          .filter((event) => event.type === "goal")
          .reduce((sum, event) => sum + event.amount, 0),
        -400_000,
      );
    },
  },
  {
    name: "early payment atomically releases savings and records full expense",
    run() {
      const state = linked();
      const before = encodeBackup(state);
      const next = pay(state);
      equal(encodeBackup(state), before, "Payment mutated input");
      equal(next.transactions.length, 2);
      equal(next.goalReleases?.[0].amount, 800_000);
      equal(next.goalFundCycles?.[0].status, "paid");
      equal(accountBalance(next, "card", TODAY), 1_600_000);
      equal(accountBalance(next, "savings", TODAY), 0);
      equal(goalSaved(next, next.goals[0], TODAY), 0);
      equal(next.goals[0].initialSaved, 800_000);
      equal(
        next.transactions.find((entry) => entry.type === "expense")?.amount,
        1_200_000,
      );
      equal(
        goalContributionOccurrences(
          next,
          next.goals[0],
          TODAY,
          "2027-01-01",
          TODAY,
        ),
        [],
      );
      equal(forecast(next, 60, TODAY).closingBalance, 1_600_000);
      rejects(() => pay(next), /завершён/);
    },
  },
  {
    name: "empty fund records full payment and no fictitious release",
    run() {
      const next = pay(linked(0));
      equal(next.transactions.length, 1);
      equal(next.goalReleases, undefined);
      equal(accountBalance(next, "card", TODAY), 800_000);
      validateGoalFunds(next, TODAY);
      decodeBackup(encodeBackup(next), TODAY);
    },
  },
  {
    name: "partial release preserves unused allocation and payment history",
    run() {
      let state = linked(400_000);
      state = fundGoal(
        state,
        {
          goalId: "annual-goal",
          amount: 400_000,
          accountId: "card",
          toAccountId: "savings",
        },
        TODAY,
      );
      const contribution = state.transactions[0];
      const next = pay(state, 600_000);
      equal(goalSaved(next, next.goals[0], TODAY), 200_000);
      check(
        next.transactions.some(
          (entry) =>
            entry.id === contribution.id &&
            entry.amount === contribution.amount,
        ),
        "Contribution history disappeared",
      );
      equal(accountBalance(next, "savings", TODAY), 200_000);
    },
  },
  {
    name: "release rejects missing funds, wrong currency, and pending reservation atomically",
    run() {
      const state = linked();
      const before = encodeBackup(state);
      rejects(() => pay(state, 900_000));
      const foreign = {
        ...state,
        accounts: state.accounts.map((entry) =>
          entry.id === "savings"
            ? { ...entry, currency: "USD" as const }
            : entry,
        ),
      };
      rejects(() => pay(foreign), /валют/);
      const held = {
        ...state,
        transactions: [
          {
            id: "hold",
            type: "transfer" as const,
            status: "pending" as const,
            title: "Ожидание",
            amount: 100_000,
            date: TODAY,
            expectedDate: DUE,
            accountId: "savings",
            toAccountId: "card",
            category: "other",
          },
        ],
      };
      rejects(() => pay(held), /недостаточно/);
      equal(encodeBackup(state), before);
    },
  },
  {
    name: "pending payment cannot bypass the atomic annual fund payment",
    run() {
      const state = linked();
      const before = encodeBackup(state);
      rejects(
        () =>
          saveTransaction(
            state,
            {
              type: "expense",
              status: "pending",
              title: "Страховка ожидается",
              amount: 1_200_000,
              date: TODAY,
              expectedDate: DUE,
              accountId: "card",
              category: "home",
              recurringId: "annual",
              occurrenceDate: DUE,
            },
            TODAY,
          ),
        /фонд/,
      );
      equal(accountBalance(state, "card", TODAY), 2_000_000);
      equal(encodeBackup(state), before);
      const next = pay(state);
      equal(
        next.transactions.filter(
          (entry) => entry.type === "expense" && entry.status !== "cancelled",
        ).length,
        1,
      );
    },
  },
  {
    name: "ordinary pay cannot bypass an active fund, unrelated expense remains allowed",
    run() {
      const state = linked();
      rejects(() => payRecurring(state, "annual", DUE, TODAY), /фонд/);
      const next = saveTransaction(
        state,
        {
          type: "expense",
          title: "Продукты",
          amount: 1000,
          date: TODAY,
          accountId: "card",
          category: "groceries",
        },
        TODAY,
      );
      equal(next.transactions.length, 1);
    },
  },
  {
    name: "linked payment interval cannot silently change stop or skip",
    run() {
      const state = linked();
      const payment = state.recurring[0];
      const before = encodeBackup(state);
      rejects(
        () => saveRecurring(state, { ...payment, amount: 1_300_000 }, TODAY),
        /фонд/,
      );
      rejects(
        () => setRecurringActive(state, payment.id, false, TODAY),
        /фонд/,
      );
      rejects(
        () => setPaymentSkipped(state, payment.id, DUE, true, TODAY),
        /фонд/,
      );
      equal(encodeBackup(state), before);
    },
  },
  {
    name: "cancelling link preserves allocated money and permits later plan changes",
    run() {
      const state = linked();
      const next = cancelAnnualFund(state, state.goalFundCycles![0].id, TODAY);
      equal(next.transactions, state.transactions);
      equal(next.goals, state.goals);
      equal(goalSaved(next, next.goals[0], TODAY), 800_000);
      equal(next.goalFundCycles?.[0].status, "cancelled");
      setRecurringActive(next, "annual", false, TODAY);
      equal(
        forecast(next, 60, TODAY).closingBalance -
          forecast(next, 60, TODAY).openingBalance,
        -1_200_000,
      );
    },
  },
  {
    name: "linked paid transfer and expense reject single monetary edits or deletion",
    run() {
      const state = pay(linked());
      for (const transaction of state.transactions) {
        rejects(() => deleteTransaction(state, transaction.id, TODAY), /фонд/);
        rejects(
          () =>
            saveTransaction(
              state,
              { ...transaction, amount: transaction.amount - 1 },
              TODAY,
            ),
          /фонд/,
        );
      }
      const next = saveTransaction(
        state,
        { ...state.transactions[0], note: "Уточнение" },
        TODAY,
      );
      equal(next.transactions[0].note, "Уточнение");
    },
  },
  {
    name: "ordinary transaction form preserves paid fund facts when only metadata changes",
    run() {
      let state = pay(linked());
      for (const original of [...state.transactions]) {
        const draft = createTransactionDraft(state, TODAY, original);
        const input = transactionInput(
          state,
          { ...draft, note: "Уточнение через форму" },
          original,
        );
        state = saveTransaction(state, input, TODAY);
        equal(
          state.transactions.find((entry) => entry.id === original.id)?.note,
          "Уточнение через форму",
        );
      }
    },
  },
  {
    name: "fund returns do not become expected income in the forecast summary",
    run() {
      const result = forecast(linked(), 60, TODAY);
      equal(result.income, 0);
      equal(result.fundReturns, 800_000);
    },
  },
  {
    name: "deleting or correcting earlier cash cannot unback a past fund release",
    run() {
      let state = annualFundFixture(100_000);
      state.goals[0].target = 100_000;
      state.recurring[0].amount = 100_000;
      state.recurring[0].startsOn = "2026-10-01";
      const transfer = (
        id: string,
        date: string,
        from: string,
        to: string,
      ) => ({
        createId: id,
        type: "transfer" as const,
        title: id,
        amount: 100_000,
        date,
        category: "other",
        accountId: from,
        toAccountId: to,
      });
      state = saveTransaction(
        state,
        transfer("early-cash", "2026-10-01", "card", "savings"),
        "2026-10-01",
      );
      state = saveTransaction(
        state,
        transfer("free-withdrawal", "2026-10-02", "savings", "card"),
        "2026-10-02",
      );
      state = createAnnualFund(
        state,
        {
          recurringId: "annual",
          occurrenceDate: DUE,
          goalId: "annual-goal",
          monthly: 0,
        },
        "2026-10-09",
      );
      state = payFundedPayment(
        state,
        { cycleId: state.goalFundCycles![0].id, savingsAccountId: "savings" },
        "2026-10-10",
      );
      state = saveTransaction(
        state,
        transfer("late-cash", "2026-10-15", "card", "savings"),
        TODAY,
      );
      const before = encodeBackup(state);
      rejects(() => deleteTransaction(state, "early-cash", TODAY), /фонд/);
      rejects(
        () =>
          reconcileAccount(
            state,
            {
              accountId: "savings",
              date: "2026-10-03",
              balance: 0,
              note: "Сверка",
              adjust: true,
              expectedSignature: accountSignature(
                state,
                "savings",
                "2026-10-03",
              ),
            },
            TODAY,
          ),
        /фонд/,
      );
      equal(encodeBackup(state), before);
      const corrupted = {
        ...state,
        transactions: state.transactions.filter(
          (entry) => entry.id !== "early-cash",
        ),
      };
      rejects(() => decodeBackup(encodeBackup(corrupted), TODAY));
    },
  },
  {
    name: "same-day next fund cycle preserves an early contribution keyed to tomorrow",
    run() {
      let state = createAnnualFund(
        annualFundFixture(0),
        { recurringId: "annual", occurrenceDate: DUE, monthly: 1_200_000 },
        TODAY,
      );
      const goalId = state.goalFundCycles![0].goalId;
      state = fundGoal(
        state,
        {
          goalId,
          amount: 1_200_000,
          accountId: "card",
          toAccountId: "savings",
        },
        TODAY,
      );
      const contribution = state.transactions.find(
        (entry) => entry.goalId === goalId,
      )!;
      equal(contribution.goalOccurrenceDate, "2026-10-20");
      const originalVersionId = contribution.goalVersionId;
      state = pay(state);
      const before = encodeBackup(state);
      const earlierPayment: FinanceState = {
        ...state,
        recurring: [
          ...state.recurring,
          {
            ...state.recurring[0],
            id: "earlier-annual",
            day: 20,
            schedule: { unit: "year", interval: 1, anchor: "2026-10-20" },
          },
        ],
      };
      const earlierBefore = encodeBackup(earlierPayment);
      rejects(
        () =>
          createAnnualFund(
            earlierPayment,
            {
              recurringId: "earlier-annual",
              occurrenceDate: "2026-10-20",
              goalId,
              monthly: 100_000,
            },
            TODAY,
          ),
        /2026-10-21/,
      );
      equal(encodeBackup(earlierPayment), earlierBefore);
      const next = createAnnualFund(
        state,
        {
          recurringId: "annual",
          occurrenceDate: "2027-12-10",
          goalId,
          monthly: 100_000,
        },
        TODAY,
      );
      equal(
        encodeBackup(state),
        before,
        "Creating the next cycle mutated paid history",
      );
      equal(
        next.goalFundCycles?.map((entry) => entry.status),
        ["paid", "active"],
      );
      equal(
        next.goalFundCycles?.map((entry) => entry.createdOn),
        [TODAY, TODAY],
      );
      equal(next.transactions, state.transactions);
      equal(next.goalReleases, state.goalReleases);
      equal(next.accounts, state.accounts);
      const goal = next.goals.find((entry) => entry.id === goalId)!;
      equal(goal.versions?.at(-1)?.effectiveFrom, "2026-10-21");
      equal(
        goal.versions?.find((entry) => entry.id === originalVersionId)
          ?.effectiveTo,
        "2026-10-21",
      );
      equal(
        goal.versions?.find((entry) => entry.id === originalVersionId)?.voided,
        undefined,
      );
      equal(goalSaved(next, goal, TODAY), 0);
      const restored = decodeBackup(encodeBackup(next), TODAY);
      equal(restored.transactions, next.transactions);
      equal(restored.goalReleases, next.goalReleases);
      equal(restored.goalFundCycles, next.goalFundCycles);
      equal(
        restored.goals.find((entry) => entry.id === goalId)?.versions,
        goal.versions,
      );
    },
  },
  {
    name: "next cycle starts explicitly and paid cycle survives backup",
    run() {
      const state = pay(linked());
      const restored = decodeBackup(encodeBackup(state), TODAY);
      equal(restored.goalReleases, state.goalReleases);
      equal(restored.goalFundCycles, state.goalFundCycles);
      equal(goalSaved(restored, restored.goals[0], TODAY), 0);
      const next = createAnnualFund(
        restored,
        {
          recurringId: "annual",
          occurrenceDate: "2027-12-10",
          goalId: "annual-goal",
          monthly: 100_000,
        },
        TODAY,
      );
      equal(
        next.goalFundCycles?.map((entry) => entry.status),
        ["paid", "active"],
      );
      equal(next.transactions, state.transactions);
      equal(next.goalReleases, state.goalReleases);
    },
  },
  {
    name: "deleting goal retains actual expense and transfers without allocation history",
    run() {
      const state = pay(linked());
      const next = deleteGoal(state, "annual-goal");
      equal(next.goals, []);
      equal(next.transactions, state.transactions);
      equal(next.goalFundCycles, []);
      equal(next.goalReleases, []);
      validateGoalFunds(next, TODAY);
    },
  },
  {
    name: "spendable reserves current-month contributions and only uncovered payment remainder",
    run() {
      const state = annualFundFixture(0);
      state.settings.payday = 31;
      state.recurring[0].schedule!.anchor = "2026-10-30";
      state.recurring[0].day = 30;
      const next = createAnnualFund(
        state,
        {
          recurringId: "annual",
          occurrenceDate: "2026-10-30",
          monthly: 800_000,
        },
        TODAY,
      );
      const available = spendable(next, TODAY);
      equal(
        [available.goals, available.payments, available.beforeProtection],
        [800_000, 400_000, 800_000],
      );
      const saved = annualFundFixture(800_000);
      saved.settings.payday = 31;
      saved.recurring[0].schedule!.anchor = "2026-10-30";
      saved.recurring[0].day = 30;
      // A materialized individual schedule can link within the current month.
      saved.goals[0].versions = [
        { id: "individual", effectiveFrom: TODAY, amount: 0, day: 20 },
      ];
      saved.version = 7;
      const covered = createAnnualFund(
        saved,
        {
          recurringId: "annual",
          occurrenceDate: "2026-10-30",
          goalId: "annual-goal",
          monthly: 0,
        },
        TODAY,
      );
      const result = spendable(covered, TODAY);
      equal(
        [result.goals, result.payments, result.beforeProtection],
        [0, 400_000, 1_600_000],
      );
    },
  },
  {
    name: "deleting a linked plan detaches active and paid cycles while preserving monetary facts",
    run() {
      for (const state of [linked(), pay(linked())]) {
        const next = deleteRecurring(state, "annual");
        equal(next.goalFundCycles![0].recurringId, undefined);
        equal(
          next.goalFundCycles![0].status,
          state.goalFundCycles![0].status === "paid" ? "paid" : "cancelled",
        );
        equal(
          next.transactions.map(
            ({ id, type, amount, date, accountId, toAccountId }) => ({
              id,
              type,
              amount,
              date,
              accountId,
              toAccountId,
            }),
          ),
          state.transactions.map(
            ({ id, type, amount, date, accountId, toAccountId }) => ({
              id,
              type,
              amount,
              date,
              accountId,
              toAccountId,
            }),
          ),
        );
        equal(next.goalReleases, state.goalReleases);
        equal(
          goalSaved(next, next.goals[0], TODAY),
          goalSaved(state, state.goals[0], TODAY),
        );
        decodeBackup(encodeBackup(next), TODAY);
      }
    },
  },
  {
    name: "allocated fund blocks shrinking savings but paid zero savings can archive",
    run() {
      const state = linked();
      const before = encodeBackup(state);
      rejects(
        () =>
          reconcileAccount(
            state,
            {
              accountId: "savings",
              date: TODAY,
              balance: 100_000,
              note: "Проверка",
              adjust: true,
              expectedSignature: accountSignature(state, "savings", TODAY),
            },
            TODAY,
          ),
        /накоплен|цел/,
      );
      rejects(() => archiveAccount(state, "savings", TODAY));
      equal(encodeBackup(state), before);
      const next = archiveAccount(pay(state), "savings", TODAY);
      equal(
        next.accounts.find((entry) => entry.id === "savings")?.archived,
        true,
      );
      decodeBackup(encodeBackup(next), TODAY);
    },
  },
  {
    name: "backup rejects orphan release mismatched transfer and missing full payment",
    run() {
      const state = pay(linked());
      rejects(() =>
        decodeBackup(
          JSON.stringify({
            ...state,
            goalReleases: [{ ...state.goalReleases![0], amount: 900_000 }],
          }),
          TODAY,
        ),
      );
      rejects(() =>
        decodeBackup(
          JSON.stringify({
            ...state,
            transactions: state.transactions.filter(
              (entry) => entry.type !== "expense",
            ),
          }),
          TODAY,
        ),
      );
      rejects(() =>
        decodeBackup(
          JSON.stringify({
            ...state,
            goalFundCycles: [
              { ...state.goalFundCycles![0], goalId: "missing" },
            ],
          }),
          TODAY,
        ),
      );
    },
  },
];

const KEY = "lad-profile-personal:lad-finance-v1";
export function installAnnualFundFixture() {
  if (sessionStorage.getItem("t06-annual-fund-installed")) return;
  localStorage.setItem(KEY, encodeBackup(annualFundFixture()));
  localStorage.setItem("lad-active-profile-v1", "personal");
  sessionStorage.setItem("t06-annual-fund-installed", "yes");
}
export function annualFundUiState() {
  return decodeBackup(localStorage.getItem(KEY)!, TODAY);
}
