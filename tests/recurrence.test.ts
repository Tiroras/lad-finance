import assert from "node:assert/strict";
import { test } from "node:test";
import { scheduleDates } from "../src/domain/recurrence";
import {
  saveRecurring,
  payRecurring,
  setPaymentSkipped,
} from "../src/domain/actions/recurring";
import {
  savePlannedIncome,
  receivePlannedIncome,
} from "../src/domain/actions/incomes";
import {
  upcoming,
  overduePayments,
  annualPreparation,
} from "../src/domain/payments";
import { incomeOccurrences } from "../src/domain/incomes";
import { createInitialState } from "../src/domain/seed";
import { decodeBackup, encodeBackup } from "../src/domain/backup";
import { reminderPlan } from "../src/domain/reminders";
import { forecast } from "../src/domain/forecast";

const TODAY = "2026-09-20";
function fixture() {
  const state = createInitialState(false, TODAY);
  state.accounts[0].openingBalance = 1_000_000;
  return state;
}
function weekly() {
  return saveRecurring(
    fixture(),
    {
      name: "Курс",
      amount: 1_000,
      day: 11,
      kind: "bill",
      category: "other",
      accountId: "card",
      startsOn: "2026-09-11",
      schedule: { unit: "week", interval: 1, anchor: "2026-09-11" },
    },
    TODAY,
  );
}

test("weekly and arbitrary day intervals cross months without drifting", () => {
  assert.deepEqual(
    scheduleDates(
      { unit: "week", interval: 2, anchor: "2026-12-25" },
      "2026-12-26",
      "2027-02-01",
    ),
    ["2027-01-08", "2027-01-22"],
  );
  assert.deepEqual(
    scheduleDates(
      { unit: "day", interval: 3, anchor: "2026-09-29" },
      "2026-09-29",
      "2026-10-07",
    ),
    ["2026-09-29", "2026-10-02", "2026-10-05"],
  );
});
test("month and year intervals keep the original day after short and leap months", () => {
  assert.deepEqual(
    scheduleDates(
      { unit: "month", interval: 1, anchor: "2024-01-31" },
      "2024-01-01",
      "2024-04-01",
    ),
    ["2024-01-31", "2024-02-29", "2024-03-31"],
  );
  assert.deepEqual(
    scheduleDates(
      { unit: "year", interval: 1, anchor: "2024-02-29" },
      "2025-01-01",
      "2029-01-01",
    ),
    ["2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"],
  );
});
test("invalid and zero intervals fail immediately, and old anchors jump straight to the requested range", () => {
  for (const interval of [0, -1, 0.5, 366])
    assert.throws(() =>
      scheduleDates(
        { unit: "day", interval, anchor: "2026-01-01" },
        TODAY,
        "2026-10-01",
      ),
    );
  assert.deepEqual(
    scheduleDates(
      { unit: "day", interval: 1, anchor: "2000-01-01" },
      "2100-12-30",
      "2101-01-01",
    ),
    ["2100-12-30", "2100-12-31"],
  );
});
test("two weekly payments in one month are independent and repeat payment is idempotent", () => {
  let state = weekly();
  const id = state.recurring[0].id;
  state = payRecurring(state, id, "2026-09-11", TODAY);
  state = payRecurring(state, id, "2026-09-18", TODAY);
  assert.equal(state.transactions.length, 2);
  assert.equal(payRecurring(state, id, "2026-09-11", TODAY), state);
  assert.deepEqual(overduePayments(state, TODAY), []);
  assert.equal(
    upcoming(state, TODAY, "2026-10-03").filter((entry) => !entry.paid).length,
    2,
  );
  assert.equal(decodeBackup(encodeBackup(state)).transactions.length, 2);
});
test("skipping a weekly date does not skip other dates that month", () => {
  const start = weekly(),
    id = start.recurring[0].id;
  const skipped = setPaymentSkipped(start, id, "2026-09-11", true, TODAY);
  assert.deepEqual(
    overduePayments(skipped, TODAY).map((entry) => entry.date),
    ["2026-09-18"],
  );
  assert.throws(
    () => payRecurring(skipped, id, "2026-09-11", TODAY),
    /верните/,
  );
  const restored = setPaymentSkipped(skipped, id, "2026-09-11", false, TODAY);
  assert.deepEqual(restored.recurring[0].versions![0].skippedDates, []);
  assert.deepEqual(
    overduePayments(restored, TODAY).map((entry) => entry.date),
    ["2026-09-11", "2026-09-18"],
  );
  assert.throws(
    () => setPaymentSkipped(start, id, "2026-09-12", true, TODAY),
    /Дата/,
  );
});
test("scheduled price and cadence edits start tomorrow and preserve older unpaid obligations", () => {
  const state = weekly(),
    old = state.recurring[0];
  const changed = saveRecurring(state, { ...old, amount: 2_000 }, TODAY);
  assert.deepEqual(
    overduePayments(changed, TODAY).map((entry) => entry.payment.amount),
    [1_000, 1_000],
  );
  assert.equal(upcoming(changed, TODAY, "2026-09-26")[0].payment.amount, 2_000);
  const rescheduled = saveRecurring(
    changed,
    {
      ...changed.recurring[0],
      schedule: { ...old.schedule!, interval: 2 },
    },
    TODAY,
  );
  assert.deepEqual(
    overduePayments(rescheduled, TODAY).map((entry) => [
      entry.date,
      entry.payment.amount,
    ]),
    [
      ["2026-09-11", 1_000],
      ["2026-09-18", 1_000],
    ],
  );
  assert.deepEqual(
    upcoming(rescheduled, TODAY, "2026-10-12").map((entry) => [
      entry.date,
      entry.payment.amount,
    ]),
    [
      ["2026-09-25", 2_000],
      ["2026-10-09", 2_000],
    ],
  );
  assert.equal(rescheduled.recurring[0].versions![0].effectiveTo, "2026-09-21");
  assert.deepEqual(
    decodeBackup(encodeBackup(rescheduled)).recurring[0].versions,
    JSON.parse(JSON.stringify(rescheduled.recurring[0].versions)),
  );
});
test("weekly income receipts are keyed by date and received occurrences leave the projection", () => {
  let state = savePlannedIncome(fixture(), {
    name: "Подработка",
    amount: 1_000,
    accountId: "card",
    date: "2026-09-11",
    repeat: "monthly",
    schedule: { unit: "week", interval: 1, anchor: "2026-09-11" },
  });
  const id = state.plannedIncomes![0].id;
  state = receivePlannedIncome(state, id, "2026-09-11", TODAY);
  state = receivePlannedIncome(state, id, "2026-09-18", TODAY);
  assert.equal(state.transactions.length, 2);
  assert.equal(receivePlannedIncome(state, id, "2026-09-18", TODAY), state);
  assert.deepEqual(
    incomeOccurrences(state, "2026-09-01", "2026-10-01", TODAY).map(
      (entry) => entry.date,
    ),
    ["2026-09-25"],
  );
  assert.equal(decodeBackup(encodeBackup(state)).transactions.length, 2);
  assert.throws(
    () => receivePlannedIncome(state, id, "2026-09-19", TODAY),
    /Дата/,
  );
});
test("annual obligations and notifications use the same schedule and exclude skipped dates", () => {
  let state = saveRecurring(
    fixture(),
    {
      name: "Страховка",
      amount: 24_000,
      day: 30,
      kind: "bill",
      category: "other",
      accountId: "card",
      startsOn: "2026-09-30",
      schedule: { unit: "year", interval: 1, anchor: "2026-09-30" },
    },
    TODAY,
  );
  assert.equal(forecast(state, 90, TODAY).outflow, 24_000);
  state.settings.reminders = { enabled: true, daysBefore: 1, hour: 9 };
  assert.equal(
    reminderPlan(state, new Date("2026-09-25T12:00:00")).items.filter(
      (entry) => entry.paymentId,
    ).length,
    1,
  );
  state = setPaymentSkipped(
    state,
    state.recurring[0].id,
    "2026-09-30",
    true,
    TODAY,
  );
  assert.equal(forecast(state, 90, TODAY).outflow, 0);
  assert.equal(
    reminderPlan(state, new Date("2026-09-25T12:00:00")).items.length,
    0,
  );
});
test("monthly legacy identities and price history retain their original behavior", () => {
  const old = saveRecurring(
    fixture(),
    {
      name: "Интернет",
      amount: 1_000,
      day: 10,
      kind: "bill",
      category: "home",
      accountId: "card",
      startsOn: "2026-08-01",
    },
    TODAY,
  );
  const paid = payRecurring(old, old.recurring[0].id, "2026-09-10", TODAY);
  const edited = saveRecurring(
    paid,
    { ...paid.recurring[0], day: 20, amount: 2_000 },
    TODAY,
  );
  const september = upcoming(edited, "2026-09-01", "2026-10-01");
  assert.equal(september.length, 1);
  assert.equal(september[0].date, "2026-09-10");
  assert.equal(september[0].payment.amount, 1_000);
  // upcoming treats its start as the valuation day; the September 20 receipt
  // is instead verified at TODAY through idempotency and the overdue set.
  assert.equal(
    payRecurring(edited, edited.recurring[0].id, "2026-09-10", TODAY),
    edited,
  );
  assert.deepEqual(upcoming(edited, TODAY, "2026-10-01"), []);
  const october = upcoming(edited, "2026-10-01", "2026-11-01");
  assert.equal(october[0].date, "2026-10-20");
  assert.equal(october[0].payment.amount, 2_000);
  assert.equal(october[0].paid, false);
  assert.deepEqual(
    overduePayments(edited, TODAY).map((entry) => [
      entry.date,
      entry.payment.amount,
    ]),
    [["2026-08-10", 1_000]],
  );
});

test("annual saving guideline skips paid dates, respects leap years and never changes reserves", () => {
  const state = saveRecurring(
    fixture(),
    {
      name: "Страховка",
      amount: 24_000,
      day: 1,
      kind: "bill",
      category: "other",
      accountId: "card",
      startsOn: "2023-03-01",
      schedule: { unit: "year", interval: 1, anchor: "2023-03-01" },
    },
    "2023-03-01",
  );
  const p = state.recurring[0];
  const paid = payRecurring(state, p.id, "2023-03-01", "2023-03-01");
  const guideline = annualPreparation(paid, p, "2023-03-01");
  assert.deepEqual(guideline, {
    date: "2024-03-01",
    months: 12,
    monthly: 2_000,
    amount: 24_000,
  });
  assert.equal(
    annualPreparation(paid, { ...p, active: false }, "2023-03-01"),
    undefined,
  );
  assert.equal(
    annualPreparation(paid, { ...p, schedule: undefined }, "2023-03-01"),
    undefined,
  );
  assert.equal(paid.transactions.length, 1);
});
