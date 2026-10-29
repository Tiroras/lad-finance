import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { createInitialState } from "../../../../src/domain/seed.ts";
import { spendable } from "../../../../src/domain/finance.ts";
import { forecast } from "../../../../src/domain/forecast.ts";
import { planPurchase } from "../../../../src/domain/purchasePlanner.ts";
import {
  saveScenario,
  copyScenario,
} from "../../../../src/domain/actions/scenarios.ts";
import { t07ForecastCases } from "../../../../tests/helpers/t07ForecastCases.ts";
import { t07ScenarioCases } from "../../../../tests/helpers/t07ScenarioCases.ts";
import type {
  FinanceState,
  SavedScenario,
} from "../../../../src/domain/types.ts";
const TODAY = "2026-10-20";
const s = createInitialState(false, TODAY);
s.version = 9;
s.accounts = [
  {
    id: "a",
    name: "Повседневная карта",
    kind: "spending",
    openingBalance: 3_000_000,
    currency: "RUB",
    icon: "card-outline",
    color: "#000000",
  },
  {
    id: "b",
    name: "Второй счёт",
    kind: "spending",
    openingBalance: 1_000_000,
    currency: "RUB",
    icon: "card-outline",
    color: "#000000",
  },
  {
    id: "s",
    name: "Накопления",
    kind: "savings",
    openingBalance: 5_000_000,
    currency: "RUB",
    icon: "wallet-outline",
    color: "#000000",
  },
];
s.transactions = [];
s.goals = [];
s.debts = [];
s.scenarios = [];
s.settings.buffer = 500_000;
s.settings.baseCurrency = "RUB";
s.settings.exchange = { automatic: false, rates: {} };
s.settings.forecast = {
  dailySpending: 50_000,
  goalDay: 31,
  dailyAccountId: "a",
};
s.plannedIncomes = [
  {
    id: "salary",
    name: "Доход",
    amount: 1_000_000,
    date: "2026-10-25",
    repeat: "once",
    accountId: "a",
  },
];
s.recurring = [
  {
    id: "rent",
    name: "Платёж",
    amount: 1_800_000,
    day: 28,
    active: true,
    accountId: "a",
    category: "home",
    startsOn: TODAY,
    icon: "home-outline",
    color: "#000000",
  },
];
const original = JSON.stringify(s);
const allowance = spendable(s, TODAY);
assert.equal(allowance.liquid, 4_000_000);
assert.equal(allowance.beforeProtection, 3_500_000);
assert.equal(allowance.protection?.limit, 1_450_000);
assert.equal(allowance.available, 1_450_000);
assert.equal(allowance.daily, 290_000);
assert.equal(allowance.payday, "2026-10-25");
assert.equal(allowance.days, 5);
const f = forecast(s, 30, TODAY);
assert.equal(f.days.length, 30);
assert.equal(f.days.at(-1)?.date, "2026-11-18");
assert.equal(f.openingBalance, 4_000_000);
assert.equal(f.closingAvailable, 1_750_000);
assert.equal(f.minimum.available, 1_750_000);
assert.equal(f.minimum.date, "2026-11-18");
assert.equal(
  f.accounts.find((a) => a.accountId === "a")!.days.at(-1)!.available,
  750_000,
);
assert.equal(
  f.accounts.find((a) => a.accountId === "s")!.days.at(-1)!.available,
  5_000_000,
);
assert.equal(f.days[0].events.length, 0);
assert.equal(
  f.days.filter((d) => d.events.some((e) => e.type === "daily")).length,
  29,
);
const p = planPurchase(f, 750_000, TODAY, { state: s, accountId: "a" });
assert.equal(p.maximum, 750_000);
assert.equal(p.earliest, TODAY);
const exact = forecast(s, 30, TODAY, {
  amount: 750_000,
  date: TODAY,
  accountId: "a",
});
assert.equal(exact.closingAvailable, 1_000_000);
assert.equal(exact.accounts[0].minimum.available, 0);
const excess = forecast(s, 30, TODAY, {
  amount: 750_001,
  date: TODAY,
  accountId: "a",
});
assert.equal(excess.accounts[0].firstShortfall?.available, -1);
assert.equal(excess.accounts[0].firstShortfall?.date, "2026-11-18");
assert.equal(
  planPurchase(f, 750_001, TODAY, { state: s, accountId: "a" }).earliest,
  undefined,
);
const noAssignment = structuredClone(s);
delete noAssignment.settings.forecast!.dailyAccountId;
assert.equal(
  planPurchase(forecast(noAssignment, 30, TODAY), 1, TODAY, {
    state: noAssignment,
    accountId: "a",
  }).maximum,
  0,
);
const shortfall = structuredClone(s);
shortfall.settings.buffer = 2_000_000;
assert.equal(
  planPurchase(forecast(shortfall, 30, TODAY), 1, TODAY, {
    state: shortfall,
    accountId: "a",
  }).maximum,
  0,
);
const scenario: SavedScenario = {
  id: "study",
  name: "Перенос дохода и снижение платежа",
  horizon: 30,
  changes: [
    {
      source: "income",
      sourceId: "salary",
      name: "Доход",
      amount: 1_000_000,
      delayDays: 10,
    },
    {
      source: "payment",
      sourceId: "rent",
      name: "Платёж",
      amount: 1_200_000,
      delayDays: 0,
    },
  ],
  events: [
    {
      id: "extra",
      name: "Разовый расход",
      amount: 400_000,
      type: "expense",
      date: "2026-10-23",
      accountId: "a",
    },
    {
      id: "off",
      name: "Выключенный расход",
      amount: 900_000,
      type: "expense",
      date: "2026-10-24",
      accountId: "a",
      enabled: false,
    },
  ],
};
const alternative = forecast(s, 30, TODAY, undefined, scenario);
assert.equal(alternative.closingAvailable, 1_950_000);
assert.equal(alternative.minimum.available, 1_700_000);
assert.equal(alternative.minimum.date, "2026-11-03");
assert.equal(
  alternative.days
    .find((d) => d.date === "2026-11-04")!
    .events.find((e) => e.type === "income")!.occurrenceDate,
  "2026-10-25",
);
assert.equal(
  alternative.days
    .flatMap((d) => d.events)
    .filter((e) => e.id === "scenario:off").length,
  0,
);
const { id, ...input } = scenario;
const saved = saveScenario(s, input);
assert.equal(saved.version, 9);
assert.equal(saved.scenarios!.length, 1);
assert.deepEqual(saved.accounts, s.accounts);
assert.deepEqual(saved.transactions, s.transactions);
assert.deepEqual(saved.plannedIncomes, s.plannedIncomes);
assert.deepEqual(saved.recurring, s.recurring);
const copied = copyScenario(saved, saved.scenarios![0].id);
assert.equal(copied.version, 9);
assert.equal(copied.scenarios!.length, 2);
assert.notEqual(copied.scenarios![0].id, copied.scenarios![1].id);
assert.equal(JSON.stringify(s), original);
const report = {
  date: TODAY,
  units: "RUB minor units (kopecks)",
  UC10: {
    liquid: allowance.liquid,
    payments: allowance.payments,
    goals: allowance.goals,
    buffer: allowance.buffer,
    beforeProtection: allowance.beforeProtection,
    protection: allowance.protection,
    available: allowance.available,
    daily: allowance.daily,
    days: allowance.days,
    payday: allowance.payday,
  },
  UC11: {
    length: f.days.length,
    first: f.days[0].date,
    last: f.days.at(-1)!.date,
    opening: f.openingBalance,
    income: f.income,
    outflow: f.outflow,
    closing: f.closingAvailable,
    minimum: { date: f.minimum.date, available: f.minimum.available },
    accountClosing: f.accounts.map((a) => ({
      id: a.accountId,
      amount: a.days.at(-1)!.available,
    })),
    unallocated: f.unallocatedEvents.length,
    warnings: f.warnings,
  },
  UC12: {
    maximum: p.maximum,
    earliest: p.earliest,
    exactClosing: exact.closingAvailable,
    exactAccountMinimum: exact.accounts[0].minimum.available,
    excessFirstShortfall: excess.accounts[0].firstShortfall,
    noAssignmentMaximum: 0,
    baselineShortfallMaximum: 0,
  },
  UC13: {
    closing: alternative.closingAvailable,
    closingDelta: alternative.closingAvailable - f.closingAvailable,
    minimum: {
      date: alternative.minimum.date,
      available: alternative.minimum.available,
    },
    minimumDelta: alternative.minimum.available - f.minimum.available,
    savedCount: saved.scenarios!.length,
    copiedCount: copied.scenarios!.length,
    financialStateUnchanged: true,
    version: saved.version,
  },
};
const chart = f.days.map((day, index) => ({
  date: day.date,
  baseline: day.available,
  scenario: alternative.days[index].available,
  reserve: s.settings.buffer,
}));
writeFileSync(
  "output/thesis/research/controls/forecast-control-results.json",
  JSON.stringify(
    {
      executedOn: "2026-10-29",
      calculation: "Actual forecast() results; all amounts in RUB minor units",
      report,
      chart,
    },
    null,
    2,
  ) + "\n",
);
console.log(JSON.stringify(report, null, 2));
for (const test of [...t07ForecastCases, ...t07ScenarioCases]) test.run();
console.log(
  `PASS: ${t07ForecastCases.length} forecast helper cases + ${t07ScenarioCases.length} scenario helper cases; all control assertions passed.`,
);
