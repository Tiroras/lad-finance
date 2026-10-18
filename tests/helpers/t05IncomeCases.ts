import { createInitialState } from "../../src/domain/seed";
import {
  cancelPendingTransaction,
  saveTransaction,
} from "../../src/domain/actions/transactions";
import {
  deletePlannedIncome,
  moveIncomeOccurrence,
  receivePlannedIncome,
  savePlannedIncome,
  setIncomeCancelled,
  setIncomePaused,
} from "../../src/domain/actions/incomes";
import {
  incomeAccountObligation,
  incomeOccurrenceKey,
  incomeOccurrences,
  incomeReceived,
  incomeVersions,
  resolveIncomeOccurrence,
} from "../../src/domain/incomes";
import { accountBalance } from "../../src/domain/accountBalances";
import { spendable } from "../../src/domain/finance";
import { forecast } from "../../src/domain/forecast";
import { decodeBackup, encodeBackup } from "../../src/domain/backup";
import type { FinanceState, PlannedIncome } from "../../src/domain/types";

const TODAY = "2026-10-18";
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
function equal(actual: unknown, expected: unknown, message: string) {
  if (JSON.stringify(canonical(actual)) !== JSON.stringify(canonical(expected)))
    throw new Error(
      `${message}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`,
    );
}
function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
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
  throw new Error(`Expected rejection: ${pattern}`);
}
function ledger(plan: Partial<PlannedIncome> = {}): FinanceState {
  const state = createInitialState(false, TODAY);
  state.accounts[0].openingBalance = 100_000;
  state.settings.onboardingCompleted = true;
  state.settings.exchange = { automatic: false, rates: {} };
  state.plannedIncomes = [
    {
      id: "salary",
      name: "Гонорар Т05",
      amount: 10_000,
      date: "2026-10-10",
      repeat: "monthly",
      accountId: "card",
      ...plan,
    },
  ];
  return state;
}
function weekly(): FinanceState {
  return ledger({
    date: "2026-10-10",
    schedule: { unit: "week", interval: 1, anchor: "2026-10-10" },
  });
}
function plan(state: FinanceState) {
  return state.plannedIncomes![0];
}
function edit(
  state: FinanceState,
  patch: Partial<Parameters<typeof savePlannedIncome>[1]> = {},
  today = TODAY,
) {
  const original = plan(state);
  return savePlannedIncome(
    state,
    {
      id: original.id,
      name: original.name,
      amount: original.amount,
      date: original.date,
      repeat: original.repeat,
      accountId: original.accountId,
      schedule: original.schedule,
      effectiveFrom: "2026-10-20",
      ...patch,
    },
    today,
  );
}
function dates(
  state: FinanceState,
  from = "2026-10-01",
  to = "2026-11-01",
  today = TODAY,
) {
  return incomeOccurrences(state, from, to, today).map((entry) => [
    entry.occurrenceDate,
    entry.date,
    entry.plan.amount,
  ]);
}
function intent(state: FinanceState, date = "2026-11-10") {
  return saveTransaction(
    state,
    {
      createId: "income-pending",
      type: "income",
      status: "pending",
      title: "Ожидаемое поступление",
      amount: 10_000,
      date: TODAY,
      expectedDate: date,
      category: "other",
      accountId: "card",
      plannedIncomeId: "salary",
      incomeOccurrenceDate: date,
    },
    TODAY,
  );
}
export const t05IncomeCases: readonly { name: string; run(): void }[] = [
  {
    name: "legacy occurrence keys stay month/once/date within their version",
    run() {
      const monthly = plan(ledger());
      equal(
        incomeOccurrenceKey(monthly, "2026-10-01"),
        incomeOccurrenceKey(monthly, "2026-10-31"),
        "Monthly identity",
      );
      const once = { ...monthly, repeat: "once" as const };
      equal(
        incomeOccurrenceKey(once, "2026-10-01"),
        incomeOccurrenceKey(once, "2026-11-01"),
        "Once identity",
      );
      check(
        incomeOccurrenceKey(plan(weekly()), "2026-10-10") !==
          incomeOccurrenceKey(plan(weekly()), "2026-10-17"),
        "Weekly identities distinct",
      );
      check(!monthly.versions, "Reading must not materialize legacy");
    },
  },
  {
    name: "monthly-to-weekly transition keeps old receipt and exact boundary",
    run() {
      let state = receivePlannedIncome(ledger(), "salary", "2026-10-10", TODAY);
      state = edit(state, {
        amount: 20_000,
        date: "2026-10-20",
        schedule: { unit: "week", interval: 1, anchor: "2026-10-20" },
      });
      equal(state.version, 6, "Version promotion");
      equal(
        dates(state),
        [
          ["2026-10-20", "2026-10-20", 20_000],
          ["2026-10-27", "2026-10-27", 20_000],
        ],
        "No duplicate on boundary",
      );
      equal(
        resolveIncomeOccurrence(plan(state), "2026-10-10")?.plan.amount,
        10_000,
        "Old amount preserved",
      );
      check(
        incomeReceived(state, plan(state), "2026-10-10", TODAY),
        "Old receipt preserved",
      );
    },
  },
  {
    name: "legacy loose monthly links protect the canonical future occurrence",
    run() {
      const state = ledger({ date: "2026-10-31" });
      state.transactions = [
        {
          id: "old-link",
          type: "income",
          title: "Старое получение",
          amount: 10_000,
          accountId: "card",
          category: "other",
          date: TODAY,
          plannedIncomeId: "salary",
          incomeOccurrenceDate: "2026-10-01",
        },
      ];
      rejects(() => edit(state, { amount: 20_000 }), /2026-10-31/);
      const once = ledger({ repeat: "once", date: "2026-10-10" });
      once.transactions = [
        { ...state.transactions[0], incomeOccurrenceDate: "2026-11-01" },
      ];
      const changed = edit(once, { repeat: "monthly", amount: 20_000 });
      check(
        incomeReceived(changed, plan(changed), "2026-10-10", TODAY),
        "Legacy once link still closes original event",
      );
    },
  },
  {
    name: "today boundary rejects atomically",
    run() {
      const state = ledger(),
        before = encodeBackup(state);
      rejects(
        () => edit(state, { amount: 20_000, effectiveFrom: TODAY }),
        /не раньше завтра/,
      );
      equal(encodeBackup(state), before, "Rejected transition mutated state");
    },
  },
  {
    name: "future early receipt blocks a crossing boundary",
    run() {
      const state = receivePlannedIncome(
        ledger(),
        "salary",
        "2026-11-10",
        TODAY,
      );
      rejects(() => edit(state, { amount: 20_000 }), /2026-11-10/);
      const next = edit(state, { amount: 20_000, effectiveFrom: "2026-11-11" });
      equal(next.transactions[0].date, TODAY, "Early actual date unchanged");
    },
  },
  {
    name: "future pending blocks boundary while cancelled intention releases it",
    run() {
      const state = intent(ledger());
      rejects(() => edit(state, { amount: 20_000 }), /2026-11-10/);
      const cancelled = cancelPendingTransaction(
        state,
        "income-pending",
        TODAY,
      );
      equal(
        edit(cancelled, { amount: 20_000 }).version,
        6,
        "Cancelled intention releases occurrence",
      );
    },
  },
  {
    name: "future cancellation and move overrides cannot disappear at transition",
    run() {
      const cancelled = setIncomeCancelled(
        ledger(),
        "salary",
        "2026-11-10",
        true,
        TODAY,
      );
      const before = encodeBackup(cancelled);
      rejects(() => edit(cancelled, { amount: 20_000 }), /2026-11-10/);
      equal(
        encodeBackup(cancelled),
        before,
        "Cancelled plan event remains intact",
      );
      const moved = moveIncomeOccurrence(
        ledger(),
        "salary",
        "2026-11-10",
        "2026-11-12",
        TODAY,
      );
      rejects(() => edit(moved, { amount: 20_000 }), /2026-11-10/);
    },
  },
  {
    name: "two moved weekly events remain independent on the same expected date",
    run() {
      let state = moveIncomeOccurrence(
        weekly(),
        "salary",
        "2026-10-10",
        "2026-10-20",
        TODAY,
      );
      state = moveIncomeOccurrence(
        state,
        "salary",
        "2026-10-17",
        "2026-10-20",
        TODAY,
      );
      const occurrences = incomeOccurrences(state, TODAY, "2026-10-22", TODAY);
      equal(
        occurrences.map((entry) => entry.occurrenceDate),
        ["2026-10-10", "2026-10-17"],
        "Separate originals",
      );
      const events = forecast(state, 30, TODAY)
        .days.flatMap((day) => day.events)
        .filter(
          (event) => event.type === "income" && event.occurrenceDate < TODAY,
        );
      equal(
        new Set(events.map((event) => event.id)).size,
        2,
        "Distinct forecast IDs",
      );
      state = setIncomeCancelled(state, "salary", "2026-10-10", true, TODAY);
      equal(
        incomeOccurrences(state, TODAY, "2026-10-22", TODAY).map(
          (entry) => entry.occurrenceDate,
        ),
        ["2026-10-17"],
        "Only selected event cancelled",
      );
    },
  },
  {
    name: "moved receipt uses original identity and actual date without a second credit",
    run() {
      let state = moveIncomeOccurrence(
        ledger(),
        "salary",
        "2026-10-10",
        "2026-10-20",
        TODAY,
      );
      state = receivePlannedIncome(
        state,
        "salary",
        "2026-10-10",
        "2026-10-20",
        undefined,
        "legacy",
      );
      equal(
        state.transactions[0].incomeOccurrenceDate,
        "2026-10-10",
        "Original reference",
      );
      equal(state.transactions[0].date, "2026-10-20", "Actual date");
      equal(
        accountBalance(state, "card", "2026-10-20"),
        110_000,
        "Single receipt",
      );
      check(
        receivePlannedIncome(state, "salary", "2026-10-10", "2026-10-20") ===
          state,
        "Idempotent receipt",
      );
    },
  },
  {
    name: "cancelled selected reference income falls back to profile payday",
    run() {
      let state = ledger({ repeat: "once", date: "2026-10-20" });
      state.settings.spendableIncomeId = "salary";
      equal(spendable(state, TODAY).payday, "2026-10-20", "Selected income");
      state = setIncomeCancelled(state, "salary", "2026-10-20", true, TODAY);
      equal(spendable(state, TODAY).payday, "2026-10-25", "Fallback date");
      check(
        !spendable(state, TODAY).income,
        "Cancelled income is not reliable",
      );
    },
  },
  {
    name: "pause preserves old occurrence and resume leaves the gap empty",
    run() {
      let state = setIncomePaused(weekly(), "salary", true, TODAY);
      equal(
        dates(state).map((entry) => entry[0]),
        ["2026-10-10", "2026-10-17"],
        "Pause keeps generated history",
      );
      state = setIncomePaused(state, "salary", false, "2026-11-02");
      equal(
        dates(state, "2026-10-19", "2026-11-10", "2026-11-02").map(
          (entry) => entry[0],
        ),
        ["2026-11-07"],
        "Original weekly phase without gap fill",
      );
      equal(
        resolveIncomeOccurrence(plan(state), "2026-10-17")?.plan.amount,
        10_000,
        "Historical receipt remains available",
      );
    },
  },
  {
    name: "a not-yet-started income can pause without inventing past events",
    run() {
      let state = setIncomePaused(
        ledger({ date: "2026-11-10" }),
        "salary",
        true,
        TODAY,
      );
      equal(
        dates(state, "2026-10-01", "2026-12-01"),
        [],
        "No event before start or during pause",
      );
      state = setIncomePaused(state, "salary", false, "2026-11-02");
      equal(
        dates(state, "2026-10-01", "2026-12-01", "2026-11-02").map(
          (entry) => entry[0],
        ),
        ["2026-11-10"],
        "Future date retained on resume",
      );
      const changed = edit(ledger({ date: "2026-11-10" }), { amount: 20_000 });
      equal(
        dates(changed, "2026-10-01", "2026-12-01").map((entry) => entry[2]),
        [20_000],
        "Future plan can change before first event",
      );
    },
  },
  {
    name: "pausing cancels not-yet-started versions and resumes only previous conditions",
    run() {
      let state = edit(weekly(), {
        amount: 20_000,
        effectiveFrom: "2026-10-25",
      });
      const futureId = incomeVersions(plan(state)).at(-1)!.id;
      state = setIncomePaused(state, "salary", true, TODAY);
      equal(
        incomeVersions(plan(state)).find((version) => version.id === futureId)
          ?.voided,
        true,
        "Future version remains as voided history",
      );
      check(
        !resolveIncomeOccurrence(plan(state), "2026-10-31", futureId),
        "Voided version cannot generate receipt",
      );
      state = setIncomePaused(state, "salary", false, "2026-11-02");
      equal(
        dates(state, "2026-10-19", "2026-11-10", "2026-11-02"),
        [["2026-11-07", "2026-11-07", 10_000]],
        "Resume uses original terms and phase",
      );
      const restored = decodeBackup(encodeBackup(state), "2026-11-02");
      equal(
        restored.plannedIncomes,
        state.plannedIncomes,
        "Voided history round-trip",
      );
    },
  },
  {
    name: "replacing future terms preserves voided snapshot and rejects its linked receipts",
    run() {
      const first = edit(ledger(), {
        amount: 20_000,
        effectiveFrom: "2026-10-25",
      });
      const futureId = incomeVersions(plan(first)).at(-1)!.id;
      const second = edit(first, {
        amount: 30_000,
        effectiveFrom: "2026-10-20",
      });
      equal(
        incomeVersions(plan(second)).find((version) => version.id === futureId)
          ?.amount,
        20_000,
        "Cancelled future snapshot not overwritten",
      );
      equal(
        incomeVersions(plan(second)).find((version) => version.id === futureId)
          ?.voided,
        true,
        "Future snapshot marked voided",
      );
      equal(
        dates(second, "2026-11-01", "2026-11-20").map((entry) => entry[2]),
        [30_000],
        "Only replacement produces event",
      );
      const received = receivePlannedIncome(
        first,
        "salary",
        "2026-11-10",
        TODAY,
        undefined,
        futureId,
      );
      rejects(
        () => edit(received, { amount: 30_000, effectiveFrom: "2026-10-20" }),
        /2026-11-10/,
      );
    },
  },
  {
    name: "account obligation lookup stops lazily and respects historic account and cancellation",
    run() {
      const daily = ledger({
        date: "2000-01-01",
        schedule: { unit: "day", interval: 1, anchor: "2000-01-01" },
      });
      check(
        incomeAccountObligation(daily, plan(daily), "card", TODAY),
        "Long daily history finds first outstanding event",
      );
      check(
        !incomeAccountObligation(daily, plan(daily), "cash", TODAY),
        "Unrelated account skipped",
      );
      let once = setIncomeCancelled(
        ledger({ repeat: "once", date: "2026-10-20" }),
        "salary",
        "2026-10-20",
        true,
        TODAY,
      );
      check(
        !incomeAccountObligation(once, plan(once), "card", TODAY),
        "Cancelled single event releases account",
      );
      once = setIncomeCancelled(once, "salary", "2026-10-20", false, TODAY);
      check(
        incomeAccountObligation(once, plan(once), "card", TODAY),
        "Restored event blocks archive",
      );
    },
  },
  {
    name: "pause refuses future settled or pending events",
    run() {
      rejects(
        () =>
          setIncomePaused(
            receivePlannedIncome(ledger(), "salary", "2026-11-10", TODAY),
            "salary",
            true,
            TODAY,
          ),
        /2026-11-10/,
      );
      rejects(
        () => setIncomePaused(intent(ledger()), "salary", true, TODAY),
        /2026-11-10/,
      );
    },
  },
  {
    name: "month end and leap-year history keep independent keys across new schedules",
    run() {
      let state = ledger({ date: "2027-12-31" });
      state = edit(
        state,
        {
          amount: 20_000,
          date: "2028-03-01",
          effectiveFrom: "2028-03-01",
          schedule: { unit: "week", interval: 1, anchor: "2028-03-01" },
        },
        "2027-12-01",
      );
      equal(
        dates(state, "2028-01-01", "2028-03-10", "2028-01-01").map(
          (entry) => entry[0],
        ),
        ["2028-01-31", "2028-02-29", "2028-03-01", "2028-03-08"],
        "Leap day and weekly boundary",
      );
    },
  },
  {
    name: "historical account and amount govern receipt after future account change",
    run() {
      let state = edit(ledger(), { amount: 20_000, accountId: "cash" });
      state = receivePlannedIncome(
        state,
        "salary",
        "2026-10-10",
        TODAY,
        undefined,
        "legacy",
      );
      equal(
        [state.transactions[0].accountId, state.transactions[0].amount],
        ["card", 10_000],
        "Old terms used",
      );
      const version = incomeVersions(plan(state)).at(-1)!;
      state = receivePlannedIncome(
        state,
        "salary",
        "2026-11-10",
        TODAY,
        undefined,
        version.id,
      );
      const received = incomeReceived(
        state,
        plan(state),
        "2026-11-10",
        TODAY,
        version.id,
      );
      check(received, "New version has its own linked receipt");
      equal(
        [received.accountId, received.amount],
        ["cash", 20_000],
        "New terms used",
      );
    },
  },
  {
    name: "linking a historical received income preserves money and original transaction date",
    run() {
      let state = edit(ledger(), { amount: 20_000, accountId: "cash" });
      state = saveTransaction(
        state,
        {
          createId: "actual",
          type: "income",
          title: "Исторический доход",
          amount: 10_000,
          accountId: "card",
          category: "other",
          date: "2026-10-12",
        },
        TODAY,
      );
      const balance = accountBalance(state, "card", TODAY);
      state = receivePlannedIncome(
        state,
        "salary",
        "2026-10-10",
        TODAY,
        "actual",
        "legacy",
      );
      equal(state.transactions.length, 1, "No extra transaction");
      equal(state.transactions[0].date, "2026-10-12", "Actual date unchanged");
      equal(accountBalance(state, "card", TODAY), balance, "No second credit");
    },
  },
  {
    name: "format six round-trip preserves version and override identities",
    run() {
      let state = moveIncomeOccurrence(
        ledger(),
        "salary",
        "2026-10-10",
        "2026-10-21",
        TODAY,
      );
      state = edit(state, { amount: 20_000 });
      state = receivePlannedIncome(state, "salary", "2026-10-10", TODAY);
      const restored = decodeBackup(encodeBackup(state), TODAY);
      equal(
        restored.plannedIncomes,
        state.plannedIncomes,
        "Versions and override survive",
      );
      equal(
        restored.transactions,
        state.transactions,
        "Versioned links survive",
      );
    },
  },
  {
    name: "pending and received events cannot be silently moved or cancelled",
    run() {
      const pending = intent(ledger());
      rejects(
        () =>
          moveIncomeOccurrence(
            pending,
            "salary",
            "2026-11-10",
            "2026-11-12",
            TODAY,
          ),
        /проведите или отмените/,
      );
      const received = receivePlannedIncome(
        ledger(),
        "salary",
        "2026-10-10",
        TODAY,
      );
      rejects(
        () => setIncomeCancelled(received, "salary", "2026-10-10", true, TODAY),
        /уже получен/,
      );
    },
  },
  {
    name: "unknown version or paused date cannot create a receipt",
    run() {
      const state = setIncomePaused(weekly(), "salary", true, TODAY),
        before = encodeBackup(state);
      rejects(
        () => receivePlannedIncome(state, "salary", "2026-10-24", TODAY),
        /Дата/,
      );
      rejects(
        () =>
          receivePlannedIncome(
            state,
            "salary",
            "2026-10-17",
            TODAY,
            undefined,
            "missing",
          ),
        /Дата/,
      );
      equal(encodeBackup(state), before, "Invalid links are atomic");
    },
  },
  {
    name: "deleting a versioned plan keeps facts and clears every plan reference",
    run() {
      let state = edit(ledger(), { amount: 20_000 });
      state = receivePlannedIncome(state, "salary", "2026-10-10", TODAY);
      const next = deletePlannedIncome(state, "salary");
      equal(
        accountBalance(next, "card", TODAY),
        accountBalance(state, "card", TODAY),
        "Facts retained",
      );
      check(
        !next.transactions[0].plannedIncomeId &&
          !next.transactions[0].incomeVersionId &&
          !next.transactions[0].incomeOccurrenceDate,
        "Links removed",
      );
    },
  },
];

// UI setup also executes in Chromium; the Playwright host only bundles this file.
export function installIncomeUi() {
  if (sessionStorage.getItem("t05-incomes-installed")) return;
  const state = weekly();
  state.settings.spendableIncomeId = "salary";
  localStorage.setItem(
    "lad-profile-personal:lad-finance-v1",
    encodeBackup(state),
  );
  sessionStorage.setItem("t05-incomes-installed", "true");
}
export function readIncomeUi(): FinanceState {
  return decodeBackup(
    localStorage.getItem("lad-profile-personal:lad-finance-v1") ?? "",
    TODAY,
  );
}
