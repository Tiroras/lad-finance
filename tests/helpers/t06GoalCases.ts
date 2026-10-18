import {
  saveGoal,
  fundGoal,
  deleteGoal,
  type GoalInput,
} from "../../src/domain/actions/goals";
import { saveTransaction } from "../../src/domain/actions/transactions";
import { decodeBackup, encodeBackup } from "../../src/domain/backup";
import { createInitialState } from "../../src/domain/seed";
import {
  goalContributions,
  goalContributionOccurrences,
  goalReserve,
  goalSaved,
  goalScheduleSummary,
  validateGoalSchedules,
} from "../../src/domain/goals";
import type { FinanceState } from "../../src/domain/types";
const TODAY = "2026-10-19";
const KEY = "lad-profile-personal:lad-finance-v1";
function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(
      `${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`,
    );
}
function rejects(action: () => unknown, pattern: RegExp) {
  try {
    action();
  } catch (error) {
    if (error instanceof Error && pattern.test(error.message)) return;
    throw error;
  }
  throw new Error(`Expected rejection ${pattern}`);
}
function base(): FinanceState {
  const state = createInitialState(false, TODAY);
  state.settings.onboardingCompleted = true;
  state.settings.exchange = { automatic: false, rates: {} };
  state.settings.forecast = { dailySpending: 0, goalDay: 31 };
  state.accounts.find((entry) => entry.id === "card")!.openingBalance =
    10_000_000;
  state.goals = [];
  return state;
}
function input(patch: Partial<GoalInput> = {}): GoalInput {
  return {
    name: "Отпуск",
    target: 1_000_000,
    monthly: 200_000,
    icon: "airplane-outline",
    currency: "RUB",
    ...patch,
  };
}
function weekly(patch: Partial<GoalInput> = {}) {
  const state = saveGoal(
    base(),
    input({
      schedule: { unit: "week", interval: 1, anchor: "2026-10-20" },
      deadline: "2026-11-17",
      ...patch,
    }),
    TODAY,
  );
  return state;
}
function events(state: FinanceState, today = TODAY, end = "2026-12-01") {
  return goalContributionOccurrences(state, state.goals[0], today, end, today);
}
export const t06GoalCases: { name: string; run: () => void }[] = [
  {
    name: "legacy first transition only starts at nearest next month",
    run() {
      const state = saveGoal(base(), input(), TODAY);
      rejects(
        () =>
          saveGoal(
            state,
            input({
              id: state.goals[0].id,
              day: 23,
              effectiveFrom: "2026-10-20",
            }),
            TODAY,
          ),
        /нового месяца/,
      );
      const next = saveGoal(
        state,
        input({ id: state.goals[0].id, day: 23 }),
        TODAY,
      );
      equal(next.goals[0].versions?.at(-1)?.effectiveFrom, "2026-11-01");
    },
  },
  {
    name: "day interval and annual leap schedule retain exact dates",
    run() {
      let state = weekly({
        schedule: { unit: "day", interval: 3, anchor: "2026-10-20" },
        target: 10_000_000,
      });
      equal(
        events(state, TODAY, "2026-11-01").map((e) => e.occurrenceDate),
        ["2026-10-20", "2026-10-23", "2026-10-26", "2026-10-29"],
      );
      state = weekly({
        schedule: { unit: "year", interval: 1, anchor: "2028-02-29" },
        deadline: undefined,
        target: 10_000_000,
      });
      equal(
        events(state, TODAY, "2031-01-01").map((e) => e.occurrenceDate),
        ["2028-02-29", "2029-02-28", "2030-02-28"],
      );
    },
  },
  {
    name: "legacy overdue and partial monthly reserve retain parity",
    run() {
      let state = saveGoal(base(), input(), TODAY);
      state.settings.forecast!.goalDay = 5;
      state = fundGoal(
        state,
        { goalId: state.goals[0].id, amount: 50_000, accountId: "card" },
        TODAY,
      );
      equal(
        [
          goalReserve(state, TODAY),
          events(state)[0].occurrenceDate,
          events(state)[0].date,
          events(state)[0].amount,
        ],
        [150_000, "2026-10-05", TODAY, 150_000],
      );
      equal(events(state)[1].amount, 200_000);
    },
  },
  {
    name: "legacy read keeps current-month reserve and shared day without materializing history",
    run() {
      const state = saveGoal(base(), input(), TODAY);
      const before = encodeBackup(state);
      equal(
        events(state).map((entry) => [entry.occurrenceDate, entry.amount]),
        [
          ["2026-10-31", 200_000],
          ["2026-11-30", 200_000],
        ],
      );
      equal(goalReserve(state, TODAY), 200_000);
      equal(encodeBackup(state), before);
      equal(state.goals[0].versions, undefined);
    },
  },
  {
    name: "individual weekly deadline uses exact future dates and ceiling",
    run() {
      const state = weekly({ target: 1_000_001 });
      const summary = goalScheduleSummary(state, state.goals[0], TODAY);
      equal(
        [
          state.version,
          summary.remainingDates,
          summary.requiredContribution,
          summary.reachable,
        ],
        [7, 5, 200_001, false],
      );
      equal(
        events(state).map((entry) => entry.occurrenceDate),
        [
          "2026-10-20",
          "2026-10-27",
          "2026-11-03",
          "2026-11-10",
          "2026-11-17",
          "2026-11-24",
        ],
      );
      equal(events(state).at(-1)?.amount, 1);
    },
  },
  {
    name: "last contribution is capped by target remainder",
    run() {
      const state = weekly({ target: 450_000 });
      equal(
        events(state).map((entry) => entry.amount),
        [200_000, 200_000, 50_000],
      );
      equal(
        goalScheduleSummary(state, state.goals[0], TODAY).estimatedDate,
        "2026-11-03",
      );
    },
  },
  {
    name: "zero contribution has required amount but no promised completion",
    run() {
      const state = weekly({ monthly: 0 });
      const summary = goalScheduleSummary(state, state.goals[0], TODAY);
      equal(
        [
          events(state).length,
          summary.requiredContribution,
          summary.reachable,
          summary.estimatedDate,
        ],
        [0, 200_000, false, undefined],
      );
    },
  },
  {
    name: "deadline without future dates is unreachable",
    run() {
      const state = weekly({
        schedule: { unit: "month", interval: 1, anchor: "2026-11-01" },
        deadline: "2026-10-31",
      });
      const summary = goalScheduleSummary(state, state.goals[0], TODAY);
      equal(
        [
          summary.remainingDates,
          summary.requiredContribution,
          summary.reachable,
        ],
        [0, null, false],
      );
    },
  },
  {
    name: "achieved goal has zero reserve and zero required amount",
    run() {
      let state = weekly({ target: 200_000 });
      state = fundGoal(
        state,
        { goalId: state.goals[0].id, amount: 200_000, accountId: "card" },
        TODAY,
      );
      const summary = goalScheduleSummary(state, state.goals[0], TODAY);
      equal(
        [
          events(state).length,
          goalReserve(state, TODAY),
          summary.requiredContribution,
          summary.reachable,
        ],
        [0, 0, 0, true],
      );
    },
  },
  {
    name: "partial early contribution applies only to selected weekly occurrence",
    run() {
      let state = weekly();
      const goal = state.goals[0];
      state = fundGoal(
        state,
        {
          goalId: goal.id,
          amount: 75_000,
          accountId: "card",
          goalVersionId: goal.versions![0].id,
          goalOccurrenceDate: "2026-10-27",
        },
        TODAY,
      );
      equal(
        events(state)
          .slice(0, 3)
          .map((entry) => entry.amount),
        [200_000, 125_000, 200_000],
      );
      equal(goalSaved(state, goal, TODAY), 75_000);
      equal(goalReserve(state, TODAY), 325_000);
    },
  },
  {
    name: "manual unkeyed fact maps deterministically to nearest future date",
    run() {
      let state = weekly();
      state = saveTransaction(
        state,
        {
          type: "transfer",
          title: "Пополнение",
          amount: 50_000,
          date: TODAY,
          category: "other",
          accountId: "card",
          toAccountId: "savings",
          goalId: state.goals[0].id,
        },
        TODAY,
      );
      equal(events(state)[0].amount, 150_000);
      equal(
        goalContributionOccurrences(
          state,
          state.goals[0],
          "2026-10-27",
          "2026-11-04",
          TODAY,
        )[0].amount,
        200_000,
      );
    },
  },
  {
    name: "new schedule freezes legacy day and preserves earlier terms",
    run() {
      let state = saveGoal(base(), input(), TODAY);
      const original = state.goals[0];
      state = saveGoal(
        state,
        input({
          id: original.id,
          day: 23,
          monthly: 100_000,
          effectiveFrom: "2026-11-01",
        }),
        TODAY,
      );
      state.settings.forecast!.goalDay = 5;
      equal(
        state.goals[0].versions!.map((entry) => [
          entry.day,
          entry.effectiveFrom,
          entry.effectiveTo,
        ]),
        [
          [31, "2000-01-01", "2026-11-01"],
          [23, "2026-11-01", undefined],
        ],
      );
      equal(
        events(state).map((entry) => entry.occurrenceDate),
        ["2026-10-31", "2026-11-23"],
      );
    },
  },
  {
    name: "new conditions cannot begin today",
    run() {
      rejects(() => weekly({ effectiveFrom: TODAY }), /не раньше завтра/);
    },
  },
  {
    name: "already funded future event blocks changed conditions atomically",
    run() {
      let state = weekly();
      const goal = state.goals[0];
      state = fundGoal(
        state,
        {
          goalId: goal.id,
          amount: 50_000,
          accountId: "card",
          goalVersionId: goal.versions![0].id,
          goalOccurrenceDate: "2026-11-03",
        },
        TODAY,
      );
      const before = encodeBackup(state);
      rejects(
        () =>
          saveGoal(
            state,
            input({
              id: goal.id,
              monthly: 300_000,
              day: 25,
              effectiveFrom: "2026-10-25",
            }),
            TODAY,
          ),
        /отмеченные взносы/,
      );
      equal(encodeBackup(state), before);
    },
  },
  {
    name: "replacing unstarted terms keeps a voided snapshot",
    run() {
      let state = weekly();
      const goal = state.goals[0];
      state = saveGoal(
        state,
        input({ id: goal.id, monthly: 100_000, day: 25 }),
        TODAY,
      );
      equal(
        state.goals[0].versions!.map((entry) => !!entry.voided),
        [true, false],
      );
      equal(
        events(state).map((entry) => entry.occurrenceDate),
        ["2026-10-25", "2026-11-25"],
      );
    },
  },
  {
    name: "short months and leap year preserve original day",
    run() {
      let state = saveGoal(
        base(),
        input({ day: 31, target: 100_000_000, effectiveFrom: "2028-01-01" }),
        TODAY,
      );
      equal(
        goalContributionOccurrences(
          state,
          state.goals[0],
          "2028-01-01",
          "2028-04-01",
          TODAY,
        ).map((entry) => entry.occurrenceDate),
        ["2028-01-31", "2028-02-29", "2028-03-31"],
      );
    },
  },
  {
    name: "metadata rename preserves version history and format",
    run() {
      const state = weekly();
      const goal = state.goals[0];
      const next = saveGoal(
        state,
        input({
          id: goal.id,
          name: "Путешествие",
          schedule: goal.versions![0].schedule,
          deadline: goal.versions![0].deadline,
        }),
        TODAY,
      );
      equal(next.goals[0].versions, goal.versions);
      equal(next.version, 7);
    },
  },
  {
    name: "goal event references reject wrong schedule and missing version",
    run() {
      const state = weekly();
      const goal = state.goals[0];
      rejects(
        () =>
          fundGoal(
            state,
            {
              goalId: goal.id,
              amount: 1,
              accountId: "card",
              goalVersionId: goal.versions![0].id,
              goalOccurrenceDate: "2026-10-22",
            },
            TODAY,
          ),
        /графику/,
      );
      rejects(
        () =>
          fundGoal(
            state,
            {
              goalId: goal.id,
              amount: 1,
              accountId: "card",
              goalVersionId: "missing",
              goalOccurrenceDate: "2026-10-20",
            },
            TODAY,
          ),
        /Версия/,
      );
    },
  },
  {
    name: "history rejects overlapping intervals and duplicate identifiers",
    run() {
      const state = weekly();
      const first = state.goals[0].versions![0];
      state.goals[0].versions!.push({ ...first, id: "another" });
      rejects(() => validateGoalSchedules(state), /пересекаются/);
      state.goals[0].versions![1].id = first.id;
      rejects(() => validateGoalSchedules(state), /история/);
    },
  },
  {
    name: "backup roundtrip preserves goal versions and event references",
    run() {
      let state = weekly();
      state = fundGoal(
        state,
        { goalId: state.goals[0].id, amount: 50_000, accountId: "card" },
        TODAY,
      );
      const decoded = decodeBackup(encodeBackup(state), TODAY);
      equal(decoded.goals[0].versions, state.goals[0].versions);
      equal(
        [
          decoded.transactions[0].goalVersionId,
          decoded.transactions[0].goalOccurrenceDate,
        ],
        [state.transactions[0].goalVersionId, "2026-10-20"],
      );
      equal(events(decoded), events(state));
    },
  },
  {
    name: "delete removes goal allocation references while keeping transfer money",
    run() {
      let state = weekly();
      state = fundGoal(
        state,
        { goalId: state.goals[0].id, amount: 50_000, accountId: "card" },
        TODAY,
      );
      const next = deleteGoal(state, state.goals[0].id);
      equal(
        [
          next.goals.length,
          next.transactions.length,
          next.transactions[0].goalId,
          next.transactions[0].goalVersionId,
          next.transactions[0].amount,
        ],
        [0, 1, undefined, undefined, 50_000],
      );
    },
  },
  {
    name: "release changes current allocation without deleting historical contributions",
    run() {
      let state = weekly();
      state = fundGoal(
        state,
        { goalId: state.goals[0].id, amount: 50_000, accountId: "card" },
        TODAY,
      );
      state.goalReleases = [
        {
          id: "release",
          cycleId: "cycle",
          goalId: state.goals[0].id,
          amount: 20_000,
          date: "2026-10-20",
          transferId: "return",
        },
      ];
      equal(
        [
          goalContributions(state, "2026-10-20").get(state.goals[0].id)!.total,
          goalSaved(state, state.goals[0], TODAY),
          goalSaved(state, state.goals[0], "2026-10-20"),
        ],
        [50_000, 50_000, 30_000],
      );
    },
  },
];
export function installGoalFixture() {
  if (sessionStorage.getItem("t06-goal-installed")) return;
  const state = saveGoal(base(), input(), TODAY);
  localStorage.setItem(KEY, encodeBackup(state));
  localStorage.setItem("lad-active-profile-v1", "personal");
  localStorage.setItem(
    "lad-profiles-v1",
    JSON.stringify({
      version: 1,
      profiles: [{ id: "personal", name: "Личный" }],
    }),
  );
  sessionStorage.setItem("t06-goal-installed", "true");
}
export function readGoalFixture() {
  return decodeBackup(localStorage.getItem(KEY)!, TODAY);
}
