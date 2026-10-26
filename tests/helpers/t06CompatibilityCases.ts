import corpus from "../fixtures/t06LegacyNormalization.json";
import {
  decodeBackup,
  encodeBackup,
  validateBackupValue,
} from "../../src/domain/backup";
import {
  fingerprintFinanceState,
  prepareRestoreCandidate,
} from "../../src/domain/backupRecovery";
import {
  archiveAccount,
  restoreAccount,
} from "../../src/domain/actions/accountArchive";
import {
  appendTransaction,
  appendTransactions,
  cancelPendingTransaction,
  postPendingTransaction,
} from "../../src/domain/actions/transactions";
import {
  saveBudgetPlan,
  scheduleBudgetTransition,
} from "../../src/domain/actions/budgets";
import {
  saveRecurring,
  setRecurringActive,
} from "../../src/domain/actions/recurring";
import {
  moveIncomeOccurrence,
  savePlannedIncome,
  setIncomeCancelled,
  setIncomePaused,
} from "../../src/domain/actions/incomes";
import { createInitialState } from "../../src/domain/seed";
import type { FinanceState, Transaction } from "../../src/domain/types";

const TODAY = corpus.normalizationDate;
type Case = { name: string; run(): void };
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
function equal(actual: unknown, expected: unknown, message: string) {
  if (JSON.stringify(canonical(actual)) !== JSON.stringify(canonical(expected)))
    throw new Error(
      `${message}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`,
    );
}
function rejects(run: () => unknown) {
  try {
    run();
  } catch (error) {
    if (
      error instanceof Error &&
      /Не удалось прочитать файл/.test(error.message)
    )
      return;
    throw error;
  }
  throw new Error("Old format silently accepted new semantics");
}
function base(): FinanceState {
  const state = createInitialState(false, TODAY);
  state.accounts[0].openingBalance = 2_000_000;
  state.settings.exchange = { automatic: false, rates: {} };
  return state;
}
function modernBase(): FinanceState {
  const state = base();
  state.version = 7;
  state.accounts.push({
    id: "credit",
    name: "Карта",
    kind: "credit",
    openingBalance: -100_000,
    creditLimit: 300_000,
    paymentDueAmount: 10_000,
    paymentDueDate: "2026-10-25",
    paymentDueBaselineIds: [],
    creditTermsConfirmedOn: TODAY,
    creditTermsReminderDate: "2026-10-22",
    icon: "card-outline",
    color: "#234B3C",
  });
  return state;
}
function modernLedger(): FinanceState {
  const state = modernBase();
  state.goals = [
    {
      id: "goal",
      name: "Фонд",
      target: 100_000,
      initialSaved: 0,
      monthly: 10_000,
      currency: "RUB",
      icon: "wallet-outline",
      color: "#234B3C",
      versions: [
        {
          id: "goal-v1",
          effectiveFrom: "2026-10-01",
          amount: 10_000,
          day: 17,
          deadline: "2026-12-31",
        },
      ],
    },
  ];
  state.recurring = [
    {
      id: "annual",
      name: "Годовой платёж",
      amount: 100_000,
      day: 25,
      kind: "bill",
      active: true,
      icon: "home-outline",
      color: "#234B3C",
      accountId: "card",
      category: "home",
      startsOn: "2026-10-25",
      schedule: { unit: "year", interval: 1, anchor: "2026-10-25" },
    },
  ];
  state.transactions = [
    {
      id: "payment",
      type: "expense",
      title: "Оплата фонда",
      amount: 100_000,
      date: TODAY,
      accountId: "card",
      category: "home",
      recurringId: "annual",
      occurrenceDate: "2026-10-25",
    },
    {
      id: "return",
      type: "transfer",
      title: "Возврат подготовки",
      amount: 30_000,
      date: TODAY,
      accountId: "savings",
      toAccountId: "card",
      category: "home",
    },
    {
      id: "contribution",
      type: "transfer",
      title: "Взнос фонда",
      amount: 30_000,
      date: "2026-10-17",
      accountId: "card",
      toAccountId: "savings",
      category: "other",
      goalId: "goal",
      goalVersionId: "goal-v1",
      goalOccurrenceDate: "2026-10-17",
    },
  ];
  state.goalFundCycles = [
    {
      id: "cycle",
      goalId: "goal",
      recurringId: "annual",
      recurringVersionId: "legacy",
      occurrenceDate: "2026-10-25",
      createdOn: "2026-10-16",
      status: "paid",
      paidOn: TODAY,
      paymentTransactionId: "payment",
    },
  ];
  state.goalReleases = [
    {
      id: "release",
      goalId: "goal",
      cycleId: "cycle",
      date: TODAY,
      amount: 30_000,
      transferId: "return",
    },
  ];
  return state;
}
function preservesSeven(state: FinanceState, label: string) {
  equal(state.version, 7, `${label}: financial format`);
  equal(
    state.accounts.find((account) => account.id === "credit")
      ?.creditTermsConfirmedOn,
    TODAY,
    `${label}: credit confirmation`,
  );
  equal(
    decodeBackup(encodeBackup(state), TODAY).version,
    7,
    `${label}: decodable format`,
  );
}
function pending(id: string): Transaction {
  return {
    id,
    type: "expense",
    title: "Ожидаемый расход",
    amount: 1_000,
    date: TODAY,
    expectedDate: TODAY,
    status: "pending",
    accountId: "card",
    category: "other",
  };
}

// Immutable Chrome expectations captured from 38a96a2 before the first T06 edit.
const legacyCases: Case[] = corpus.cases.map((entry) => ({
  name: `legacy normalization and recovery: ${entry.id}`,
  run() {
    const state = validateBackupValue(JSON.parse(entry.rawText), TODAY);
    equal(
      encodeBackup(state),
      entry.expectedNormalized.canonicalText,
      "Version 6 canonical bytes changed",
    );
    equal(
      fingerprintFinanceState(state),
      entry.expectedNormalized.fingerprint,
      "Version 6 fingerprint changed",
    );
    const candidate = prepareRestoreCandidate(entry.rawText, {
      normalizationDate: TODAY,
      normalizationVersion: 1,
      targetDemo: false,
      transportMode: "standard",
    });
    equal(
      encodeBackup(candidate.state),
      entry.expectedRecoveryAnchor.canonicalText,
      "Version 6 recovery canonical bytes changed",
    );
    equal(
      candidate.identity,
      entry.expectedRecoveryAnchor.identity,
      "Version 6 recovery identity changed",
    );
    equal(
      state.goals.some((goal) => goal.versions !== undefined),
      false,
      "Reading must not invent goal versions",
    );
    equal(state.goalFundCycles, undefined, "Reading must not invent cycles");
    equal(state.goalReleases, undefined, "Reading must not invent releases");
  },
}));
const newFields: { name: string; patch(state: FinanceState): void }[] = [
  {
    name: "goal versions",
    patch(state) {
      state.goals = modernLedger().goals;
    },
  },
  {
    name: "fund cycles",
    patch(state) {
      state.goalFundCycles = [];
    },
  },
  {
    name: "fund releases",
    patch(state) {
      state.goalReleases = [];
    },
  },
  {
    name: "credit confirmation",
    patch(state) {
      state.accounts = modernBase().accounts.map(
        ({ creditTermsReminderDate: _reminder, ...account }) => account,
      );
    },
  },
  {
    name: "credit reminder",
    patch(state) {
      state.accounts = modernBase().accounts.map(
        ({ creditTermsConfirmedOn: _confirmed, ...account }) => account,
      );
    },
  },
  {
    name: "goal contribution version",
    patch(state) {
      state.transactions = [
        {
          ...pending("goal-link"),
          status: undefined,
          expectedDate: undefined,
          goalVersionId: "goal-v1",
        },
      ];
    },
  },
  {
    name: "goal contribution date",
    patch(state) {
      state.transactions = [
        {
          ...pending("goal-link"),
          status: undefined,
          expectedDate: undefined,
          goalOccurrenceDate: TODAY,
        },
      ];
    },
  },
];
const oldFormatCases: Case[] = [1, 2, 3, 4, 5, 6].flatMap((version) =>
  newFields.map((field) => ({
    name: `format ${version} rejects ${field.name} before stripping`,
    run() {
      const state = base();
      field.patch(state);
      rejects(() => validateBackupValue({ ...state, version }, TODAY));
    },
  })),
);

export const t06CompatibilityCases: readonly Case[] = [
  ...legacyCases,
  ...oldFormatCases,
  {
    name: "format seven round trip preserves conditions, funded payment, release and contribution keys",
    run() {
      const original = modernLedger();
      const read = decodeBackup(encodeBackup(original), TODAY);
      equal(read, original, "New financial semantics were lost on decode");
      equal(
        decodeBackup(encodeBackup(read), TODAY),
        read,
        "Format seven read is not idempotent",
      );
      const candidate = prepareRestoreCandidate(encodeBackup(original), {
        normalizationDate: TODAY,
        normalizationVersion: 1,
        targetDemo: false,
        transportMode: "standard",
      });
      equal(candidate.state, read, "Recovery did not preserve format seven");
      equal(
        candidate.identity.normalizedFingerprint,
        fingerprintFinanceState(read),
        "Recovery fingerprint differs from retained financial state",
      );
    },
  },
  {
    name: "format seven rejects orphaned release, contribution and credit confirmation references",
    run() {
      for (const mutate of [
        (state: FinanceState) => {
          state.goalReleases![0].cycleId = "missing-cycle";
        },
        (state: FinanceState) => {
          state.goalReleases![0].transferId = "missing-transfer";
        },
        (state: FinanceState) => {
          state.goalFundCycles![0].paymentTransactionId = "missing-payment";
        },
        (state: FinanceState) => {
          state.transactions[2].goalVersionId = "missing-version";
        },
        (state: FinanceState) => {
          state.accounts.find(
            (account) => account.id === "credit",
          )!.creditTermsConfirmedOn = "2026-10-20";
        },
      ]) {
        const state = modernLedger();
        mutate(state);
        let failed = false;
        try {
          validateBackupValue(state, TODAY);
        } catch {
          failed = true;
        }
        equal(failed, true, "Format seven accepted an invalid link or date");
      }
    },
  },
  {
    name: "T04 posting, cancelling, batch insertion, archiving and restoring retain format seven",
    run() {
      let state = modernBase();
      state = appendTransaction(state, pending("first"), TODAY);
      preservesSeven(state, "pending insertion");
      state = postPendingTransaction(state, "first", TODAY, TODAY);
      preservesSeven(state, "posting");
      state = appendTransactions(
        state,
        [pending("second"), pending("third")],
        TODAY,
      );
      preservesSeven(state, "pending batch");
      state = cancelPendingTransaction(state, "second", TODAY);
      preservesSeven(state, "cancellation");
      state = archiveAccount(state, "cash", TODAY);
      preservesSeven(state, "archive");
      state = restoreAccount(state, "cash");
      preservesSeven(state, "restore");
    },
  },
  {
    name: "T05 payment changes, stop and resume retain format seven",
    run() {
      let state = modernBase();
      state = saveRecurring(
        state,
        {
          name: "Связь",
          amount: 1_000,
          day: 19,
          category: "home",
          accountId: "card",
          startsOn: "2026-10-01",
        },
        TODAY,
      );
      const rule = state.recurring[0];
      state = saveRecurring(
        state,
        { ...rule, amount: 2_000, effectiveFrom: "2026-10-20" },
        TODAY,
      );
      preservesSeven(state, "payment terms");
      state = setRecurringActive(state, rule.id, false, TODAY);
      preservesSeven(state, "payment stopped");
      state = setRecurringActive(state, rule.id, true, TODAY);
      preservesSeven(state, "payment resumed");
    },
  },
  {
    name: "T05 income change, move, cancellation and pause retain format seven",
    run() {
      let state = modernBase();
      state = savePlannedIncome(
        state,
        {
          name: "Доход",
          amount: 10_000,
          date: "2026-10-19",
          repeat: "monthly",
          accountId: "card",
        },
        TODAY,
      );
      const plan = state.plannedIncomes![0];
      state = savePlannedIncome(
        state,
        { ...plan, amount: 20_000, effectiveFrom: "2026-10-20" },
        TODAY,
      );
      preservesSeven(state, "income terms");
      state = moveIncomeOccurrence(state, plan.id, TODAY, "2026-10-21", TODAY);
      preservesSeven(state, "income move");
      state = setIncomeCancelled(state, plan.id, TODAY, true, TODAY);
      preservesSeven(state, "income cancellation");
      state = setIncomePaused(state, plan.id, true, TODAY);
      preservesSeven(state, "income paused");
      state = setIncomePaused(state, plan.id, false, TODAY);
      preservesSeven(state, "income resumed");
    },
  },
  {
    name: "T05 budget transition and versioned transaction batches retain format seven",
    run() {
      let state = modernBase();
      state = saveBudgetPlan(
        state,
        {
          categoryId: "groceries",
          period: "monthly",
          startDay: 1,
          anchor: "2026-10-01",
          date: TODAY,
          amount: 10_000,
          onlyThisPeriod: false,
          rolloverSurplus: true,
          rolloverDeficit: false,
        },
        TODAY,
      );
      state = scheduleBudgetTransition(
        state,
        {
          categoryId: "groceries",
          period: "weekly",
          amount: 3_000,
          rolloverSurplus: false,
          rolloverDeficit: false,
        },
        TODAY,
      );
      preservesSeven(state, "budget transition");
      state = savePlannedIncome(
        state,
        {
          name: "Получение",
          amount: 1_000,
          date: TODAY,
          repeat: "once",
          accountId: "card",
        },
        TODAY,
      );
      const plan = state.plannedIncomes![0];
      state = appendTransactions(
        state,
        [
          {
            id: "receipt",
            type: "income",
            title: "Получение",
            amount: 1_000,
            date: TODAY,
            accountId: "card",
            category: "other",
            plannedIncomeId: plan.id,
            incomeVersionId: "legacy",
            incomeOccurrenceDate: TODAY,
          },
        ],
        TODAY,
      );
      preservesSeven(state, "versioned transaction batch");
    },
  },
];
