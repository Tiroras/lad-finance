import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deleteGoal,
  deletePlannedIncome,
  deleteRecurring,
  deleteTransaction,
  fundGoal,
  payRecurring,
  receivePlannedIncome,
  saveAccount,
  saveBudget,
  saveForecastPreferences,
  saveGoal,
  savePlannedIncome,
  saveRecurring,
  saveTransaction,
  setPaymentSkipped,
  setRecurringActive,
} from "../src/domain/actions";
import { accountBalance, goalSaved } from "../src/domain/finance";
import { decodeBackup, encodeBackup } from "../src/domain/backup";
import {
  applyCsvImport,
  guessCsvMapping,
  parseCsv,
  previewCsv,
  type CsvOptions,
} from "../src/domain/csv";
import { createInitialState } from "../src/domain/seed";
import type { FinanceState } from "../src/domain/types";

const TODAY = "2026-09-10";
function fixture(): FinanceState {
  const state = createInitialState(false, TODAY);
  state.accounts[0].openingBalance = 1000000;
  state.accounts[2].openingBalance = 200000;
  state.goals = [
    {
      id: "trip",
      name: "Поездка",
      target: 300000,
      initialSaved: 150000,
      monthly: 50000,
      icon: "airplane-outline",
      color: "#FFFFFF",
    },
  ];
  state.recurring = [
    {
      id: "bill",
      name: "Интернет",
      amount: 75000,
      day: 15,
      startsOn: "2026-08-01",
      active: true,
      kind: "bill",
      accountId: "card",
      category: "home",
      icon: "home-outline",
      color: "#FFFFFF",
    },
  ];
  return state;
}
const expense = {
  type: "expense" as const,
  title: " Кофе ",
  amount: 30029,
  date: TODAY,
  category: "cafe" as const,
  accountId: "card",
};
const balances = (state: FinanceState) =>
  state.accounts.map((a) => accountBalance(state, a.id, TODAY));

test("transaction actions validate, trim and preserve existing data without mutating their input", () => {
  const state = fixture(),
    before = structuredClone(state);
  const next = saveTransaction(state, expense, TODAY);
  assert.equal(next.transactions[0].title, "Кофе");
  assert.equal(accountBalance(next, "card", TODAY), 969971);
  for (const fields of [
    { amount: 0 },
    { amount: 1.1 },
    { amount: NaN },
    { date: "2026-09-11" },
    { accountId: "missing" },
    { note: "x".repeat(501) },
  ])
    assert.throws(() =>
      saveTransaction(state, { ...expense, ...fields }, TODAY),
    );
  assert.throws(
    () => saveTransaction(state, { ...expense, id: "deleted" }, TODAY),
    /удалена/,
  );
  const edited = saveTransaction(
    next,
    { ...next.transactions[0], amount: 40000 },
    TODAY,
  );
  assert.equal(edited.transactions.length, 1);
  assert.equal(accountBalance(edited, "card", TODAY), 960000);
  assert.deepEqual(
    balances(deleteTransaction(edited, edited.transactions[0].id, TODAY)),
    balances(state),
  );
  assert.deepEqual(state, before);
});

test("goal funding conserves total money, validates the latest balance and caps the target", () => {
  const state = fixture();
  const next = fundGoal(
    state,
    { goalId: "trip", accountId: "card", amount: 150000 },
    TODAY,
  );
  assert.equal(
    balances(next).reduce((a, b) => a + b),
    balances(state).reduce((a, b) => a + b),
  );
  assert.equal(goalSaved(next, next.goals[0], TODAY), 300000);
  assert.throws(
    () =>
      fundGoal(next, { goalId: "trip", accountId: "card", amount: 1 }, TODAY),
    /оставшуюся/,
  );
  assert.throws(() =>
    fundGoal(state, { goalId: "trip", accountId: "savings", amount: 1 }, TODAY),
  );
  const emptied = saveTransaction(state, { ...expense, amount: 999999 }, TODAY);
  assert.throws(
    () =>
      fundGoal(
        emptied,
        { goalId: "trip", accountId: "card", amount: 2 },
        TODAY,
      ),
    /недостаточно/,
  );
  assert.throws(
    () => saveGoal(next, { ...next.goals[0], target: 299999 }, TODAY),
    /уже накопленного/,
  );
  const removed = deleteGoal(next, "trip");
  assert.equal(removed.transactions[0].goalId, undefined);
  assert.deepEqual(balances(removed), balances(next));
});

test("account correction keeps transactions and cannot spend money reserved for goals", () => {
  const state = saveTransaction(fixture(), expense, TODAY);
  const next = saveAccount(
    state,
    { id: "card", name: "Карта", kind: "spending", balance: 800000 },
    TODAY,
  );
  assert.equal(accountBalance(next, "card", TODAY), 800000);
  assert.deepEqual(next.transactions, state.transactions);
  assert.throws(
    () =>
      saveAccount(
        next,
        { id: "savings", name: "Копилка", kind: "savings", balance: 149999 },
        TODAY,
      ),
    /распредел[её]н/,
  );
  assert.throws(
    () =>
      saveAccount(
        next,
        { id: "savings", name: "Карта", kind: "spending", balance: 200000 },
        TODAY,
      ),
    /Тип/,
  );
});

test("editing or deleting a savings deposit cannot leave goals without backing", () => {
  let state = fixture();
  // A deposit backed a goal contribution while another transfer withdrew free funds.
  state = saveTransaction(
    state,
    { ...expense, type: "income", accountId: "savings", amount: 100000 },
    TODAY,
  );
  const deposit = state.transactions[0];
  state = saveTransaction(
    state,
    {
      ...expense,
      type: "transfer",
      accountId: "savings",
      toAccountId: "card",
      amount: 150000,
    },
    TODAY,
  );
  assert.throws(
    () => deleteTransaction(state, deposit.id, TODAY),
    /распределены/,
  );
  assert.throws(
    () => saveTransaction(state, { ...deposit, amount: 99999 }, TODAY),
    /распределены/,
  );
});

test("manual transfers and CSV use the same free-savings validation; failed batch imports are atomic", () => {
  const state = fixture(),
    before = encodeBackup(state);
  const table = parseCsv(
    "Дата;Описание;Сумма\n10.09.2026;Перевод со своих накоплений;500",
  );
  const options: CsvOptions = {
    accountId: "card",
    mode: "signed",
    positive: "income",
    dateOrder: "dmy",
    mapping: guessCsvMapping(table.headers),
  };
  const overrides = {
    2: { type: "transfer" as const, otherAccountId: "savings" },
  };
  const manual = saveTransaction(
    state,
    {
      ...expense,
      type: "transfer",
      accountId: "savings",
      toAccountId: "card",
      amount: 50000,
    },
    TODAY,
  );
  const imported = applyCsvImport(
    state,
    table,
    options,
    new Set(),
    overrides,
    TODAY,
  );
  assert.deepEqual(balances(imported), balances(manual));
  table.rows[0][2] = "500,01";
  assert.match(
    previewCsv(state, table, options, overrides, TODAY)[0].error!,
    /распределены/,
  );
  assert.throws(
    () =>
      saveTransaction(
        state,
        {
          ...expense,
          type: "transfer",
          accountId: "savings",
          toAccountId: "card",
          amount: 50001,
        },
        TODAY,
      ),
    /распределены/,
  );
  const batch = parseCsv(
    "Дата;Описание;Сумма\n10.09.2026;Перевод первый;400\n10.09.2026;Перевод второй;400",
  );
  assert.throws(() =>
    applyCsvImport(
      state,
      batch,
      options,
      new Set(),
      { ...overrides, 3: overrides[2] },
      TODAY,
    ),
  );
  assert.equal(encodeBackup(state), before);
});

test("recurring payment actions are idempotent and linking a recorded expense never debits twice", () => {
  const state = fixture();
  const paid = payRecurring(state, "bill", "2026-09-15", TODAY);
  assert.equal(paid.transactions.length, 1);
  assert.strictEqual(payRecurring(paid, "bill", "2026-09-15", TODAY), paid);
  assert.throws(
    () => setPaymentSkipped(paid, "bill", "2026-09-15", true, TODAY),
    /Проведённый платёж/,
  );
  const recorded = saveTransaction(state, { ...expense, amount: 75000 }, TODAY);
  const linked = payRecurring(
    recorded,
    "bill",
    "2026-09-15",
    TODAY,
    recorded.transactions[0].id,
  );
  assert.equal(linked.transactions.length, 1);
  assert.deepEqual(balances(linked), balances(recorded));
  const removed = deleteRecurring(linked, "bill");
  assert.equal(removed.transactions[0].recurringId, undefined);
  assert.equal(removed.transactions[0].occurrenceDate, undefined);
  assert.deepEqual(balances(removed), balances(linked));
});

test("skipped and cancelled future occurrences cannot be paid; stopping and editing retain old obligations", () => {
  const state = fixture();
  const skipped = setPaymentSkipped(state, "bill", "2026-09-15", true, TODAY);
  assert.throws(
    () => payRecurring(skipped, "bill", "2026-09-15", TODAY),
    /верните/,
  );
  const stopped = setRecurringActive(state, "bill", false, TODAY);
  assert.throws(
    () => payRecurring(stopped, "bill", "2026-09-15", TODAY),
    /Дата не соответствует/,
  );
  const paidStoppedArrear = payRecurring(stopped, "bill", "2026-08-15", TODAY);
  assert.equal(paidStoppedArrear.transactions[0].amount, 75000);
  assert.equal(paidStoppedArrear.transactions[0].occurrenceDate, "2026-08-15");
  const changed = saveRecurring(
    state,
    { ...state.recurring[0], amount: 100000, day: 20 },
    TODAY,
  );
  assert.throws(
    () => payRecurring(changed, "bill", "2026-09-15", TODAY),
    /Дата/,
  );
  const paid = payRecurring(changed, "bill", "2026-08-15", TODAY);
  assert.equal(paid.transactions[0].amount, 75000);
  assert.equal(paid.transactions[0].occurrenceDate, "2026-08-15");
});

test("planning income changes no balance; receiving, editing and deleting the plan retains actual money", () => {
  const initial = fixture();
  const state = savePlannedIncome(
    initial,
    {
      name: "Зарплата",
      amount: 50000,
      date: "2026-09-15",
      repeat: "monthly",
      accountId: "card",
    },
    TODAY,
  );
  const plan = state.plannedIncomes![0];
  assert.deepEqual(balances(state), balances(initial));
  const received = receivePlannedIncome(state, plan.id, "2026-09-15", TODAY);
  assert.equal(accountBalance(received, "card", TODAY), 1050000);
  assert.strictEqual(
    receivePlannedIncome(received, plan.id, "2026-09-15", TODAY),
    received,
  );
  assert.throws(
    () => savePlannedIncome(received, { ...plan, repeat: "once" }, TODAY),
    /полученные/,
  );
  const transitioned = savePlannedIncome(
    received,
    {
      ...plan,
      repeat: "once",
      date: "2026-09-16",
      effectiveFrom: "2026-09-16",
    },
    TODAY,
  );
  assert.deepEqual(balances(transitioned), balances(received));
  assert.deepEqual(transitioned.transactions, received.transactions);
  assert.equal(
    transitioned.plannedIncomes![0].versions![0].effectiveTo,
    "2026-09-16",
  );
  const edited = saveTransaction(
    transitioned,
    { ...transitioned.transactions[0], amount: 49999 },
    TODAY,
  );
  assert.equal(edited.transactions[0].plannedIncomeId, plan.id);
  const removed = deletePlannedIncome(edited, plan.id);
  assert.equal(removed.plannedIncomes!.length, 0);
  assert.equal(removed.transactions[0].plannedIncomeId, undefined);
  assert.deepEqual(balances(removed), balances(edited));
  assert.deepEqual(
    decodeBackup(encodeBackup(removed)),
    JSON.parse(JSON.stringify(removed)),
  );
});

test("income receipt can link a matching manual/CSV income; mismatches and duplicate links are rejected", () => {
  let state = savePlannedIncome(fixture(), {
    name: "Аванс",
    amount: 50000,
    date: "2026-09-15",
    repeat: "once",
    accountId: "card",
  });
  const plan = state.plannedIncomes![0];
  state = saveTransaction(
    state,
    { ...expense, type: "income", amount: 50000 },
    TODAY,
  );
  const before = balances(state),
    id = state.transactions[0].id;
  const linked = receivePlannedIncome(state, plan.id, plan.date, TODAY, id);
  assert.equal(linked.transactions.length, 1);
  assert.deepEqual(balances(linked), before);
  assert.strictEqual(
    receivePlannedIncome(linked, plan.id, plan.date, TODAY, id),
    linked,
  );
  assert.throws(
    () => receivePlannedIncome(state, plan.id, "2026-09-16", TODAY, id),
    /Дата/,
  );
  const mismatch = saveTransaction(
    state,
    { ...state.transactions[0], amount: 49999 },
    TODAY,
  );
  assert.throws(
    () => receivePlannedIncome(mismatch, plan.id, plan.date, TODAY, id),
    /не подходит/,
  );
  const duplicate = {
    ...linked,
    transactions: [
      ...linked.transactions,
      { ...linked.transactions[0], id: "duplicate" },
    ],
  };
  assert.throws(() => decodeBackup(encodeBackup(duplicate)), /дважды/);
});

test("budget and forecast settings accept zero but reject fractional kopecks and invalid days", () => {
  const state = fixture();
  assert.equal(
    saveBudget(state, "cafe", 0).categories.find((c) => c.id === "cafe")!
      .budget,
    0,
  );
  assert.throws(() => saveBudget(state, "missing", 100), /Категория/);
  assert.throws(() => saveBudget(state, "cafe", 0.5));
  assert.throws(() =>
    saveForecastPreferences(state, { dailySpending: -1, goalDay: 31 }),
  );
  assert.throws(() =>
    saveForecastPreferences(state, { dailySpending: 0, goalDay: 32 }),
  );
  assert.deepEqual(
    saveForecastPreferences(state, { dailySpending: 0, goalDay: 31 }).settings
      .forecast,
    { dailySpending: 0, goalDay: 31 },
  );
});

test("an early or late income from another month can be linked explicitly without creating a duplicate", () => {
  for (const plannedDate of ["2026-08-31", "2026-10-01"]) {
    let state = savePlannedIncome(fixture(), {
      name: "Доход",
      amount: 50000,
      date: plannedDate,
      repeat: "once",
      accountId: "card",
    });
    state = saveTransaction(
      state,
      { ...expense, type: "income", amount: 50000 },
      TODAY,
    );
    const plan = state.plannedIncomes![0],
      actual = state.transactions[0];
    const linked = receivePlannedIncome(
      state,
      plan.id,
      plannedDate,
      TODAY,
      actual.id,
    );
    assert.equal(linked.transactions.length, 1);
    assert.deepEqual(balances(linked), balances(state));
    assert.equal(linked.transactions[0].incomeOccurrenceDate, plannedDate);
  }
});
