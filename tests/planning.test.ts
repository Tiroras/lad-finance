import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../src/domain/seed";
import { forecast } from "../src/domain/forecast";
import { planPurchase } from "../src/domain/purchasePlanner";
import { scenarioWarnings } from "../src/domain/scenarios";
import { decodeBackup, encodeBackup } from "../src/domain/backup";
import {
  deletePlannedIncome,
  fundGoal,
  receivePlannedIncome,
  saveScenario,
} from "../src/domain/actions";
import type { SavedScenario } from "../src/domain/types";

const TODAY = "2026-09-10";
function fixture() {
  const state = createInitialState(false, TODAY);
  state.accounts[0].openingBalance = 2000000;
  state.settings.buffer = 500000;
  state.plannedIncomes = [
    {
      id: "salary",
      name: "Зарплата",
      amount: 5000000,
      date: "2026-09-15",
      repeat: "monthly",
      accountId: "card",
    },
  ];
  state.recurring = [
    {
      id: "rent",
      name: "Аренда",
      amount: 3000000,
      day: 18,
      kind: "bill",
      active: true,
      startsOn: TODAY,
      icon: "home-outline",
      color: "#FFFFFF",
      category: "home",
      accountId: "card",
    },
  ];
  return state;
}
const scenario = (patch: Partial<SavedScenario> = {}): SavedScenario => ({
  id: "test",
  name: "Задержка зарплаты",
  horizon: 30,
  changes: [
    {
      source: "income",
      sourceId: "salary",
      name: "Зарплата",
      amount: 5000000,
      delayDays: 7,
    },
  ],
  events: [],
  ...patch,
});
test("purchase planner finds the earliest day using all later obligations and exact reserve boundary", () => {
  const state = fixture(),
    before = encodeBackup(state);
  const base = forecast(state, 30, TODAY);
  const plan = planPurchase(base, 2000000, TODAY);
  assert.equal(plan.maximum, 1500000);
  assert.equal(plan.earliest, "2026-09-15");
  assert.equal(planPurchase(base, 1500000, TODAY).earliest, TODAY);
  const later = planPurchase(base, 3500000, "2026-09-15");
  assert.equal(later.maximum, 3500000);
  assert.equal(later.limitingDay.date, "2026-09-18");
  assert.equal(
    forecast(state, 30, TODAY, { date: "2026-09-15", amount: later.maximum })
      .firstBelowBuffer,
    undefined,
  );
  assert.equal(
    forecast(state, 30, TODAY, {
      date: "2026-09-15",
      amount: later.maximum + 1,
    }).firstBelowBuffer?.date,
    "2026-09-18",
  );
  assert.equal(planPurchase(base, 3500001, TODAY).earliest, undefined);
  assert.throws(() => planPurchase(base, 1, "2026-10-10"));
  assert.equal(encodeBackup(state), before);
});
test("planner refuses to promise safety when the baseline already breaks the reserve", () => {
  const state = fixture();
  state.accounts[0].openingBalance = 0;
  const plan = planPurchase(forecast(state, 90, TODAY), 1, "2026-09-25");
  assert.equal(plan.maximum, 0);
  assert.equal(plan.earliest, undefined);
  assert.equal(plan.existingShortfall?.date, TODAY);
  assert.equal(plan.through, "2026-12-08");
});
test("salary shift reveals a temporary shortfall despite an unchanged closing balance; saving changes no actual money", () => {
  const state = fixture(),
    before = structuredClone(state),
    draft = scenario();
  const base = forecast(state, 30, TODAY),
    alternative = forecast(state, 30, TODAY, undefined, draft);
  assert.equal(base.firstShortfall, undefined);
  assert.equal(alternative.firstShortfall?.date, "2026-09-18");
  assert.equal(alternative.minimum.balance, -1000000);
  assert.equal(alternative.closingBalance, base.closingBalance);
  const saved = saveScenario(state, { ...draft, id: undefined });
  assert.deepEqual(saved.transactions, before.transactions);
  assert.deepEqual(saved.plannedIncomes, before.plannedIncomes);
  assert.deepEqual(state, before);
  assert.deepEqual(decodeBackup(encodeBackup(saved)), saved);
});
test("shifting income across horizon and month boundaries retains receipt identity", () => {
  let state = fixture();
  state.recurring = [];
  state.plannedIncomes![0].date = "2026-01-31";
  state = receivePlannedIncome(state, "salary", "2026-02-28", "2026-02-15");
  const draft = scenario({
    changes: [
      {
        source: "income",
        sourceId: "salary",
        name: "Зарплата",
        amount: 5000000,
        delayDays: 7,
      },
    ],
  });
  const projected = forecast(state, 60, "2026-02-20", undefined, draft);
  const events = projected.days
    .flatMap((d) => d.events)
    .filter((e) => e.type === "income");
  assert.deepEqual(
    events.map((e) => e.occurrenceDate),
    ["2026-03-31"],
  );
  assert.ok(projected.days.find((d) => d.date === "2026-04-07")!.events.length);
  state = fixture();
  state.recurring = [];
  state.plannedIncomes![0] = {
    ...state.plannedIncomes![0],
    date: "2026-10-12",
    repeat: "once",
  };
  draft.changes[0].delayDays = -5;
  assert.equal(forecast(state, 30, TODAY, undefined, draft).income, 5000000);
});
test("scenario combines daily expenses, future bill prices, bounded goal contributions and dated events", () => {
  let state = fixture();
  state.plannedIncomes = [];
  state.settings.forecast = { dailySpending: 0, goalDay: 15 };
  state.goals = [
    {
      id: "trip",
      name: "Поездка",
      target: 50000,
      initialSaved: 0,
      monthly: 10000,
      icon: "airplane-outline",
      color: "#FFFFFF",
    },
  ];
  state = fundGoal(
    state,
    { goalId: "trip", amount: 5000, accountId: "card" },
    TODAY,
  );
  const draft = scenario({
    dailySpending: 11,
    changes: [
      {
        source: "payment",
        sourceId: "rent",
        name: "Аренда",
        amount: 2500000,
        delayDays: 0,
      },
      {
        source: "goal",
        sourceId: "trip",
        name: "Поездка",
        amount: 30000,
        delayDays: 0,
      },
    ],
    events: [
      {
        id: "gift",
        name: "Подарок",
        type: "income",
        amount: 1000000,
        date: "2026-09-12",
      },
    ],
  });
  const result = forecast(state, 60, TODAY, undefined, draft);
  assert.equal(result.income, 1000000);
  assert.deepEqual(
    result.days
      .flatMap((d) => d.events)
      .filter((e) => e.type === "goal")
      .map((e) => e.amount),
    [-25000, -20000],
  );
  assert.equal(result.outflow, 5000000 + 45000 + 59 * 11);
  state.recurring[0].startsOn = "2026-08-01";
  const overdue = forecast(
    state,
    30,
    TODAY,
    undefined,
    draft,
  ).days[0].events.find((e) => e.type === "payment");
  assert.equal(overdue?.amount, -3000000);
});
test("deleted plan references stay visible as warnings and invalid scenario data cannot be saved or restored", () => {
  const draft = scenario();
  const saved = saveScenario(fixture(), { ...draft, id: undefined });
  const next = deletePlannedIncome(saved, "salary");
  assert.equal(scenarioWarnings(next, next.scenarios![0], TODAY).length, 1);
  assert.doesNotThrow(() => decodeBackup(encodeBackup(next)));
  assert.equal(
    forecast(next, 30, TODAY, undefined, next.scenarios![0]).income,
    0,
  );
  for (const bad of [
    { ...draft, horizon: 31 },
    { ...draft, dailySpending: 0.1 },
    { ...draft, changes: [...draft.changes, ...draft.changes] },
    { ...draft, changes: [{ ...draft.changes[0], delayDays: 91 }] },
  ]) {
    assert.throws(() =>
      saveScenario(fixture(), { ...bad, id: undefined } as never),
    );
    assert.throws(() =>
      decodeBackup(JSON.stringify({ ...fixture(), scenarios: [bad] })),
    );
  }
});
