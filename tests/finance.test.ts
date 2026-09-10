import { test } from "node:test";
import assert from "node:assert/strict";
import {
  accountBalance,
  dateInMonth,
  daysBetween,
  goalReserve,
  goalSaved,
  moneyInput,
  nextPayday,
  parseMoney,
  parseQuickEntry,
  shiftMonth,
  simulatePurchase,
  spendable,
  totals,
  upcoming,
  validDate,
  validateTransaction,
} from "../src/domain/finance";
import { createInitialState } from "../src/domain/seed";
import { decodeBackup, encodeBackup } from "../src/domain/backup";
import type { FinanceState, Transaction } from "../src/domain/types";

const TODAY = "2026-09-10";
function fixture(): FinanceState {
  const state = createInitialState(false);
  state.accounts[0].openingBalance = 10000000;
  state.accounts[1].openingBalance = 1000000;
  state.accounts[2].openingBalance = 5000000;
  state.settings = { name: "", payday: 25, buffer: 1000000 };
  state.goals = [
    {
      id: "goal",
      name: "Море",
      target: 10000000,
      initialSaved: 5000000,
      monthly: 1000000,
      icon: "airplane-outline",
      color: "#EAF0E8",
    },
  ];
  state.recurring = [
    {
      id: "bill",
      name: "Интернет",
      amount: 100000,
      day: 15,
      kind: "bill",
      active: true,
      category: "home",
      icon: "home-outline",
      color: "#EAF0E8",
      accountId: "card",
    },
  ];
  return state;
}
const tx = (fields: Partial<Transaction> = {}): Transaction => ({
  id: "test",
  type: "expense",
  amount: 10000,
  date: TODAY,
  title: "Кофе",
  category: "cafe",
  accountId: "card",
  ...fields,
});

test("money is parsed into exact integer kopecks", () => {
  assert.equal(parseMoney("1 450,50 ₽"), 145050);
  assert.equal(parseMoney("0,29"), 29);
  assert.equal(parseMoney("0"), 0);
  assert.equal(parseMoney("1\u202f000.01"), 100001);
  assert.equal(parseMoney(moneyInput(1234567)), 1234567);
});
test("invalid, negative, overflowing and overprecise amounts are rejected", () => {
  for (const amount of [
    "",
    "-1",
    "NaN",
    "Infinity",
    "12.345",
    "1,5,5",
    "1e6",
    "1000000001",
  ])
    assert.equal(parseMoney(amount), null, amount);
});
test("quick input recognizes Russian merchant categories and income", () => {
  assert.deepEqual(parseQuickEntry("кофе 320"), {
    title: "Кофе",
    amount: 32000,
    category: "cafe",
    type: "expense",
  });
  assert.equal(parseQuickEntry("продукты 1 450,50")?.amount, 145050);
  assert.equal(parseQuickEntry("зарплата 120000")?.type, "income");
  assert.equal(parseQuickEntry("такси 460")?.category, "transport");
});
test("ambiguous quick input requires manual correction", () => {
  for (const text of [
    "320",
    "кофе",
    "кофе -320",
    "кофе 320 и такси 450",
    "кофе 0",
  ])
    assert.equal(parseQuickEntry(text), null, text);
});
test("payday handles short months, leap years and month boundaries", () => {
  assert.equal(nextPayday(31, "2026-02-10"), "2026-02-28");
  assert.equal(nextPayday(31, "2024-02-10"), "2024-02-29");
  assert.equal(nextPayday(25, "2026-12-25"), "2027-01-25");
  assert.equal(dateInMonth("2026-04", 31), "2026-04-30");
  assert.equal(shiftMonth("2026-01-31", 1), "2026-02-01");
  assert.equal(daysBetween("2026-03-28", "2026-03-30"), 2);
  assert.equal(validDate("2026-02-30"), false);
});
test("spendable excludes savings, pending bills, goals and buffer", () => {
  const safe = spendable(fixture(), TODAY);
  assert.equal(safe.liquid, 11000000);
  assert.equal(safe.payments, 100000);
  assert.equal(safe.goals, 1000000);
  assert.equal(safe.available, 8900000);
  assert.equal(safe.days, 15);
  assert.equal(safe.daily, 593333);
});
test("an expense reduces account balance and spendable by exactly its amount", () => {
  const state = fixture(),
    before = spendable(state, TODAY);
  state.transactions.push(tx({ amount: 32029 }));
  assert.equal(accountBalance(state, "card", TODAY), 10000000 - 32029);
  assert.equal(spendable(state, TODAY).available, before.available - 32029);
});
test("goal funding conserves total balance and does not double-reserve this month", () => {
  const state = fixture(),
    before = spendable(state, TODAY);
  state.transactions.push(
    tx({
      type: "transfer",
      amount: 500000,
      goalId: "goal",
      toAccountId: "savings",
    }),
  );
  assert.equal(goalSaved(state, state.goals[0], TODAY), 5500000);
  assert.equal(goalReserve(state, TODAY), 500000);
  assert.equal(
    accountBalance(state, "card", TODAY) +
      accountBalance(state, "savings", TODAY),
    15000000,
  );
  assert.equal(spendable(state, TODAY).available, before.available);
  assert.deepEqual(totals(state, "2026-09"), { income: 0, expense: 0 });
});
test("goal reserves stop at the remaining target", () => {
  const state = fixture();
  state.goals[0].target = 5100000;
  assert.equal(goalReserve(state, TODAY), 100000);
  state.transactions.push(
    tx({
      type: "transfer",
      amount: 100000,
      goalId: "goal",
      toAccountId: "savings",
    }),
  );
  assert.equal(goalReserve(state, TODAY), 0);
});
test("paid recurring charge is not deducted twice, even when paid early", () => {
  const state = fixture(),
    before = spendable(state, TODAY);
  state.transactions.push(
    tx({ amount: 100000, recurringId: "bill", occurrenceDate: "2026-09-15" }),
  );
  assert.equal(spendable(state, TODAY).payments, 0);
  assert.equal(spendable(state, TODAY).available, before.available);
  assert.equal(upcoming(state, TODAY, "2026-09-25")[0].paid, true);
});
test("disabling a subscription changes only its projection", () => {
  const state = fixture();
  const balance = accountBalance(state, "card", TODAY);
  state.recurring[0].active = false;
  assert.equal(spendable(state, TODAY).payments, 0);
  assert.equal(accountBalance(state, "card", TODAY), balance);
  assert.equal(state.transactions.length, 0);
});

test("rescheduling a paid monthly bill does not reserve or accept it twice", () => {
  const state = fixture();
  state.transactions.push(
    tx({ amount: 100000, recurringId: "bill", occurrenceDate: "2026-09-15" }),
  );
  state.recurring[0].day = 20;
  assert.equal(spendable(state, TODAY).payments, 0);
  assert.equal(upcoming(state, TODAY, "2026-09-25")[0].paid, true);
  state.transactions.push(
    tx({
      id: "duplicate-cycle",
      amount: 100000,
      recurringId: "bill",
      occurrenceDate: "2026-09-20",
    }),
  );
  assert.throws(() => decodeBackup(encodeBackup(state)));
});
test("cash-flow horizon includes today and excludes next payday", () => {
  const state = fixture();
  state.recurring[0].day = 10;
  assert.equal(spendable(state, TODAY).payments, 100000);
  state.recurring[0].day = 25;
  assert.equal(spendable(state, TODAY).payments, 0);
});
test("recurring occurrences roll into next month and clamp the last day", () => {
  const state = fixture();
  state.recurring[0].day = 31;
  assert.deepEqual(
    upcoming(state, "2026-02-01", "2026-04-01").map((o) => o.date),
    ["2026-02-28", "2026-03-31"],
  );
});
test("negative availability is reported as a deficit and never a negative allowance", () => {
  const state = fixture();
  state.settings.buffer = 20000000;
  const safe = spendable(state, TODAY);
  assert.ok(safe.raw < 0);
  assert.equal(safe.available, 0);
  assert.equal(safe.daily, 0);
  assert.equal(
    simulatePurchase(state, 10000, TODAY).shortfall,
    -safe.raw + 10000,
  );
});
test("purchase simulator has no side effects and detects exact boundary", () => {
  const state = fixture(),
    raw = encodeBackup(state),
    safe = spendable(state, TODAY);
  assert.equal(simulatePurchase(state, safe.available, TODAY).affordable, true);
  assert.equal(
    simulatePurchase(state, safe.available + 1, TODAY).affordable,
    false,
  );
  assert.equal(simulatePurchase(state, safe.available + 1, TODAY).shortfall, 1);
  assert.equal(encodeBackup(state), raw);
});
test("future transactions do not affect current balances or goal reserves", () => {
  const state = fixture();
  state.transactions.push(tx({ date: "2026-09-11", amount: 9000000 }));
  assert.equal(accountBalance(state, "card", TODAY), 10000000);
});
test("validation prevents invalid dates, zero amounts and impossible transfers", () => {
  const state = fixture();
  assert.ok(validateTransaction(state, tx({ amount: 0 }), TODAY));
  assert.ok(validateTransaction(state, tx({ date: "2026-02-30" }), TODAY));
  assert.ok(validateTransaction(state, tx({ date: "2026-09-11" }), TODAY));
  assert.ok(
    validateTransaction(
      state,
      tx({ type: "transfer", toAccountId: "card" }),
      TODAY,
    ),
  );
  assert.ok(
    validateTransaction(
      state,
      tx({ type: "transfer", toAccountId: "savings", amount: 10000001 }),
      TODAY,
    ),
  );
  assert.equal(validateTransaction(state, tx({ amount: 1 }), TODAY), null);
});
test("backup round-trip preserves demo and personal finances", () => {
  for (const state of [
    createInitialState(true, TODAY),
    createInitialState(false),
    fixture(),
  ])
    assert.deepEqual(decodeBackup(encodeBackup(state)), state);
});
test("backup validation rejects damaged records and unknown references", () => {
  assert.throws(() => decodeBackup("{broken json"));
  assert.throws(() => decodeBackup("{}"));
  let state = fixture();
  state.accounts.push({ ...state.accounts[0] });
  assert.throws(() => decodeBackup(encodeBackup(state)));
  state = fixture();
  state.transactions.push(tx({ accountId: "missing" }));
  assert.throws(() => decodeBackup(encodeBackup(state)));
  state = fixture();
  state.transactions.push(tx({ amount: 1.5 }));
  assert.throws(() => decodeBackup(encodeBackup(state)));
  state = fixture();
  state.goals[0].initialSaved = 999999999;
  assert.throws(() => decodeBackup(encodeBackup(state)));
});
test("backup validation rejects duplicate payments and wrong goal transfers", () => {
  const state = fixture();
  state.transactions.push(
    tx({ recurringId: "bill", occurrenceDate: "2026-09-15" }),
    tx({ id: "test2", recurringId: "bill", occurrenceDate: "2026-09-15" }),
  );
  assert.throws(() => decodeBackup(encodeBackup(state)));
  state.transactions = [tx({ goalId: "goal" })];
  assert.throws(() => decodeBackup(encodeBackup(state)));
});
