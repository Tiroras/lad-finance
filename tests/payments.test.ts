import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../src/domain/seed";
import { decodeBackup, encodeBackup } from "../src/domain/backup";
import {
  changedPaymentHistory,
  overduePayments,
  paymentForMonth,
  spendable,
  upcoming,
} from "../src/domain/finance";
import { reminderPlan } from "../src/domain/reminders";

const TODAY = "2026-09-10";
function fixture() {
  const state = createInitialState(false, TODAY);
  state.accounts[0].openingBalance = 1000000;
  state.settings = {
    name: "",
    payday: 25,
    buffer: 0,
    reminders: { enabled: true, daysBefore: 1, hour: 9 },
  };
  state.recurring = [
    {
      id: "bill",
      name: "Интернет",
      day: 5,
      amount: 75000,
      accountId: "card",
      kind: "bill",
      active: true,
      category: "home",
      icon: "wifi-outline",
      color: "#FFFFFF",
      startsOn: "2026-08-01",
    },
  ];
  return state;
}
test("unpaid months remain reserved after their due date and across month boundaries", () => {
  const state = fixture();
  assert.deepEqual(
    overduePayments(state, TODAY).map((o) => o.date),
    ["2026-08-05", "2026-09-05"],
  );
  assert.equal(spendable(state, TODAY).overdue, 150000);
  assert.equal(spendable(state, TODAY).available, 850000);
  assert.equal(overduePayments(state, "2026-10-10").length, 3);
});
test("paying an overdue charge exchanges its reserve for an expense without double subtraction", () => {
  const state = fixture(),
    before = spendable(state, TODAY).available;
  state.transactions.push({
    id: "paid",
    type: "expense",
    amount: 75000,
    title: "Интернет",
    date: TODAY,
    category: "home",
    accountId: "card",
    recurringId: "bill",
    occurrenceDate: "2026-08-05",
  });
  assert.deepEqual(
    overduePayments(state, TODAY).map((o) => o.date),
    ["2026-09-05"],
  );
  assert.equal(spendable(state, TODAY).available, before);
});
test("the start boundary and skipped months prevent phantom debts", () => {
  const state = fixture();
  state.recurring[0].startsOn = TODAY;
  assert.equal(overduePayments(state, TODAY).length, 0);
  assert.equal(upcoming(state, TODAY).length, 1);
  state.recurring[0].startsOn = "2026-08-01";
  state.recurring[0].skippedMonths = ["2026-08", "2026-09"];
  assert.equal(spendable(state, TODAY).payments, 0);
  assert.equal(state.transactions.length, 0);
});
test("legacy backups acquire a stable month boundary, and preserve it on the next read", () => {
  const state = fixture();
  delete state.recurring[0].startsOn;
  const migrated = decodeBackup(encodeBackup(state));
  assert.match(migrated.recurring[0].startsOn!, /^\d{4}-\d{2}-01$/);
  assert.deepEqual(decodeBackup(encodeBackup(migrated)), migrated);
});
test("reminders use the local hour and clamp February; paid and skipped months are excluded", () => {
  const state = fixture();
  state.recurring[0].startsOn = "2026-02-01";
  state.recurring[0].day = 31;
  const now = new Date("2026-02-20T12:00:00");
  let items = reminderPlan(state, now).items;
  assert.equal(items[0].date, "2026-02-28");
  assert.equal(items[0].at, new Date("2026-02-27T09:00:00").getTime());
  state.recurring[0].skippedMonths = ["2026-02"];
  items = reminderPlan(state, now).items;
  assert.equal(
    items.some((i) => i.date === "2026-02-28"),
    false,
  );
});
test("notifications have a bounded queue and no past triggers, with a due-day fallback", () => {
  const state = fixture();
  state.recurring[0].startsOn = TODAY;
  state.recurring[0].day = 12;
  state.settings.reminders!.daysBefore = 3;
  const now = new Date("2026-09-10T12:00:00");
  assert.equal(
    reminderPlan(state, now).items[0].at,
    new Date("2026-09-12T09:00:00").getTime(),
  );
  state.recurring = Array.from({ length: 100 }, (_, i) => ({
    ...state.recurring[0],
    id: `bill${i}`,
  }));
  const plan = reminderPlan(state, now);
  assert.equal(plan.items.length, 60);
  assert.equal(plan.truncated, true);
  assert.ok(plan.items.every((i) => i.at > now.getTime()));
  state.settings.reminders!.enabled = false;
  assert.equal(reminderPlan(state, now).items.length, 0);
});
test("editing a recurring price or day preserves older unpaid months", () => {
  const state = fixture(),
    original = state.recurring[0];
  state.recurring[0] = {
    ...original,
    amount: 90000,
    day: 15,
    history: changedPaymentHistory(original, 90000, 15, TODAY),
  };
  assert.equal(overduePayments(state, TODAY)[0].date, "2026-08-05");
  assert.equal(overduePayments(state, TODAY)[0].payment.amount, 75000);
  assert.equal(upcoming(state, TODAY)[0].payment.amount, 90000);
  assert.equal(spendable(state, TODAY).payments, 165000);
  const edited = state.recurring[0];
  const twice = {
    ...edited,
    amount: 99000,
    history: changedPaymentHistory(edited, 99000, 15, TODAY),
  };
  assert.equal(paymentForMonth(twice, "2026-08-01").amount, 75000);
  assert.equal(twice.history?.length, 1);
  assert.deepEqual(decodeBackup(encodeBackup(state)), state);
});
