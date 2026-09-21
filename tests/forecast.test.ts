import { test } from "node:test";
import assert from "node:assert/strict";
import { forecast, type ForecastHorizon } from "../src/domain/forecast";
import { createInitialState } from "../src/domain/seed";
import { decodeBackup, encodeBackup } from "../src/domain/backup";
import { shiftDate } from "../src/domain/finance";
import {
  fundGoal,
  payRecurring,
  receivePlannedIncome,
} from "../src/domain/actions";
import type { FinanceState } from "../src/domain/types";

const TODAY = "2026-09-10";
function fixture(): FinanceState {
  const state = createInitialState(false, TODAY);
  state.accounts[0].openingBalance = 100000;
  state.accounts.find((a) => a.kind === "savings")!.openingBalance = 900000;
  state.settings.buffer = 20000;
  state.settings.forecast = { dailySpending: 0, goalDay: 15 };
  return state;
}
function income(
  state: FinanceState,
  date = "2026-09-15",
  repeat: "once" | "monthly" = "monthly",
) {
  state.plannedIncomes = [
    {
      id: "salary",
      name: "Зарплата",
      amount: 50000,
      date,
      repeat,
      accountId: "card",
    },
  ];
  return state;
}
function bill(state: FinanceState, startsOn = "2026-09-01") {
  state.recurring = [
    {
      id: "rent",
      name: "Аренда",
      amount: 40000,
      day: 15,
      startsOn,
      active: true,
      kind: "bill",
      accountId: "card",
      category: "home",
      icon: "home-outline",
      color: "#fff",
    },
  ];
  return state;
}

test("forecast covers exactly 30/60/90 local dates across the year boundary; savings and payday are not income", () => {
  const state = fixture();
  for (const horizon of [30, 60, 90] as ForecastHorizon[]) {
    const result = forecast(state, horizon, "2026-12-20");
    assert.equal(result.days.length, horizon);
    assert.equal(result.days[0].date, "2026-12-20");
    assert.equal(
      result.days.at(-1)!.date,
      shiftDate("2026-12-20", horizon - 1),
    );
    assert.equal(result.openingBalance, 100000);
    assert.equal(result.closingBalance, 100000);
    assert.equal(result.income, 0);
  }
});

test("monthly income clamps February including leap years and returns to the original day in March", () => {
  for (const year of [2024, 2026]) {
    const state = income(fixture(), `${year}-01-31`);
    const result = forecast(state, 90, `${year}-01-31`);
    assert.deepEqual(
      result.days.filter((d) => d.events.length).map((d) => d.date),
      [
        `${year}-01-31`,
        `${year}-02-${year === 2024 ? "29" : "28"}`,
        `${year}-03-31`,
        `${year}-04-30`,
      ].filter((date) => date < shiftDate(`${year}-01-31`, 90)),
    );
  }
});

test("income before the start is not silently postponed; once-only income appears once", () => {
  assert.equal(
    forecast(income(fixture(), "2026-09-09", "once"), 90, TODAY).income,
    0,
  );
  assert.equal(
    forecast(income(fixture(), TODAY, "once"), 90, TODAY).income,
    50000,
  );
  assert.equal(
    forecast(income(fixture(), "2026-11-01", "once"), 30, TODAY).income,
    0,
  );
});

test("received income is in the opening balance and is not projected a second time, including early receipts", () => {
  const state = income(fixture());
  const before = forecast(state, 30, TODAY);
  const next = receivePlannedIncome(state, "salary", "2026-09-15", TODAY);
  const after = forecast(next, 30, TODAY);
  assert.equal(after.openingBalance, before.openingBalance + 50000);
  assert.equal(after.income, 0);
  assert.equal(after.closingBalance, before.closingBalance);
  assert.equal(forecast(next, 60, TODAY).income, 50000);
});

test("paid, skipped and inactive bills are excluded; an overdue bill uses its historic amount once today", () => {
  let state = bill(fixture(), "2026-08-01");
  state.recurring[0].history = [
    { untilMonth: "2026-08", amount: 30000, day: 5 },
  ];
  let result = forecast(state, 60, TODAY);
  assert.equal(result.days[0].balance, 70000);
  assert.equal(result.days[0].events[0].occurrenceDate, "2026-08-05");
  assert.equal(result.outflow, 110000);
  state = payRecurring(state, "rent", "2026-08-05", TODAY);
  state.recurring[0].skippedMonths = ["2026-09"];
  result = forecast(state, 60, TODAY);
  assert.equal(result.days[0].events.length, 0);
  assert.equal(result.outflow, 40000);
  assert.equal(result.closingBalance, 30000);
  state.recurring[0].active = false;
  assert.equal(forecast(state, 60, TODAY).outflow, 0);
});

test("goal contributions subtract this month's actual funding and stop exactly at the target", () => {
  let state = fixture();
  state.goals = [
    {
      id: "trip",
      name: "Поездка",
      target: 45000,
      initialSaved: 0,
      monthly: 20000,
      icon: "airplane-outline",
      color: "#fff",
    },
  ];
  state = fundGoal(
    state,
    { goalId: "trip", amount: 15000, accountId: "card" },
    TODAY,
  );
  const result = forecast(state, 90, TODAY);
  const contributions = result.days
    .flatMap((d) => d.events)
    .filter((e) => e.type === "goal");
  assert.deepEqual(
    contributions.map((e) => [e.occurrenceDate, e.amount]),
    [
      ["2026-09-15", -5000],
      ["2026-10-15", -20000],
      ["2026-11-15", -5000],
    ],
  );
  assert.equal(result.closingBalance, 55000);
});

test("an unfulfilled goal contribution earlier this month is included today; future goal dates clamp month end", () => {
  const state = fixture();
  state.goals = [
    {
      id: "trip",
      name: "Поездка",
      target: 45000,
      initialSaved: 0,
      monthly: 20000,
      icon: "airplane-outline",
      color: "#fff",
    },
  ];
  state.settings.forecast!.goalDay = 5;
  const result = forecast(state, 30, TODAY);
  assert.equal(result.days[0].events[0].amount, -20000);
  assert.equal(result.days[0].events[0].overdue, true);
  state.settings.forecast!.goalDay = 31;
  assert.equal(
    forecast(state, 30, "2026-02-01").days[27].events[0].amount,
    -20000,
  );
});

test("daily spending starts tomorrow, uses exact kopecks, and buffer is a threshold, not an expense", () => {
  const state = fixture();
  state.settings.forecast!.dailySpending = 29;
  state.settings.buffer = 200000;
  const result = forecast(state, 30, TODAY);
  assert.equal(result.days[0].balance, 100000);
  assert.equal(result.closingBalance, 100000 - 29 * 29);
  assert.equal(result.firstBelowBuffer!.date, TODAY);
  assert.equal(result.firstShortfall, undefined);
});

test("purchase affects only its date and subsequent days, detects a one-kopeck shortfall, and never mutates finances", () => {
  const state = income(fixture(), "2026-09-20", "once");
  const snapshot = encodeBackup(state);
  const base = forecast(state, 30, TODAY);
  const after = forecast(state, 30, TODAY, {
    amount: 100001,
    date: "2026-09-15",
  });
  assert.equal(after.days[4].balance, base.days[4].balance);
  assert.equal(after.days[5].balance, -1);
  assert.equal(after.firstShortfall!.date, "2026-09-15");
  assert.equal(after.minimum.balance, -1);
  assert.equal(after.days[10].balance, 49999);
  assert.equal(after.closingBalance, base.closingBalance - 100001);
  assert.equal(encodeBackup(state), snapshot);
  assert.throws(() =>
    forecast(state, 30, TODAY, { amount: 1, date: shiftDate(TODAY, 30) }),
  );
  assert.throws(() => forecast(state, 30, TODAY, { amount: 1.1, date: TODAY }));
});

test("legacy backups need no income migration; new forecast settings, plans and receipt links survive restore", () => {
  const legacy = fixture();
  delete legacy.settings.forecast;
  delete legacy.plannedIncomes;
  assert.equal(
    forecast(decodeBackup(encodeBackup(legacy)), 90, TODAY).income,
    0,
  );
  const state = receivePlannedIncome(
    income(fixture()),
    "salary",
    "2026-09-15",
    TODAY,
  );
  const restored = decodeBackup(encodeBackup(state));
  assert.deepEqual(restored, JSON.parse(JSON.stringify(state)));
  assert.deepEqual(forecast(restored, 60, TODAY), forecast(state, 60, TODAY));
  restored.transactions.push({ ...restored.transactions[0], id: "duplicate" });
  assert.throws(() => decodeBackup(encodeBackup(restored)));
});
