import assert from "node:assert/strict";
import { test } from "node:test";
import {
  changeBaseCurrency,
  deleteTransaction,
  fundGoal,
  mergeCurrencyRates,
  restoreAutomaticRate,
  saveAccount,
  saveCurrencyRate,
  saveGoal,
  savePlannedIncome,
  saveRecurring,
  saveScenario,
  saveTransaction,
} from "../src/domain/actions";
import { decodeBackup, encodeBackup } from "../src/domain/backup";
import {
  applyCsvImport,
  guessCsvMapping,
  parseCsv,
  previewCsv,
  type CsvOptions,
} from "../src/domain/csv";
import { exportTransactionsCsv } from "../src/domain/csvExport";
import {
  accountCurrency,
  baseCurrency,
  convertMoney,
  money,
  moneyInput,
  parseMoney,
  parseRate,
  RATE_SCALE,
  transactionValue,
} from "../src/domain/currency";
import {
  accountBalance,
  categorySpending,
  goalSaved,
  spendable,
  totals,
} from "../src/domain/finance";
import { forecast } from "../src/domain/forecast";
import { createInitialState } from "../src/domain/seed";
import {
  parseScenarioDraft,
  scenarioDraft,
} from "../src/features/scenarios/model/scenarioDraft";
import { decodeExchangeRates } from "../src/infrastructure/exchange-rates/exchangeRates";

const TODAY = "2026-09-10";
function fixture() {
  let state = createInitialState(false, TODAY);
  state.accounts[0].openingBalance = 1_000_000;
  for (const [currency, rate] of [
    ["USD", 90],
    ["EUR", 100],
    ["JPY", 0.6],
    ["KWD", 300],
  ] as const)
    state = saveCurrencyRate(state, currency, rate * RATE_SCALE, TODAY);
  state = saveAccount(
    state,
    { name: "USD wallet", kind: "spending", currency: "USD", balance: 10_000 },
    TODAY,
  );
  state.accounts.at(-1)!.id = "usd";
  state = saveAccount(
    state,
    { name: "EUR savings", kind: "savings", currency: "EUR", balance: 0 },
    TODAY,
  );
  state.accounts.at(-1)!.id = "eur-savings";
  return state;
}
const expense = {
  type: "expense" as const,
  title: "Coffee",
  amount: 250,
  date: TODAY,
  category: "cafe",
  accountId: "usd",
};

test("currency input and conversion respect 0/2/3 minor digits, exact half rounding and bounds", () => {
  const state = fixture();
  assert.equal(parseMoney("123,45", "USD"), 12345);
  assert.equal(parseMoney("123", "JPY"), 123);
  assert.equal(parseMoney("123.01", "JPY"), null);
  assert.equal(parseMoney("1,234", "KWD"), 1234);
  assert.equal(parseMoney("1.2345", "KWD"), null);
  assert.equal(moneyInput(1234, "KWD"), "1,234");
  assert.match(money(1234, true, "KWD"), /1,234 KWD/);
  assert.equal(convertMoney(state, 100, "USD", "RUB"), 9000);
  assert.equal(convertMoney(state, 100, "JPY", "RUB"), 6000);
  assert.equal(convertMoney(state, 1234, "KWD", "RUB"), 37020);
  assert.equal(convertMoney(state, 50, "RUB", "JPY"), 1);
  assert.equal(convertMoney(state, -50, "RUB", "JPY"), -1);
  assert.equal(parseRate("0,00000001"), 1);
  assert.equal(parseRate("0"), null);
  assert.equal(parseRate("1e3"), null);
  assert.equal(parseRate("999999999"), null);
  assert.throws(() => convertMoney(state, 100, "GBP", "RUB"), /курс GBP/);
});

test("current balances revalue while recorded expenses, category budgets and title-only edits keep their valuation", () => {
  let state = saveTransaction(fixture(), expense, TODAY);
  const original = state.transactions[0];
  assert.equal(original.baseAmount, 22500);
  assert.equal(accountBalance(state, "usd", TODAY), 9750);
  assert.equal(totals(state, "2026-09").expense, 22500);
  assert.equal(
    categorySpending(state, "2026-09", TODAY).find((c) => c.id === "cafe")!
      .spent,
    22500,
  );
  state = saveCurrencyRate(state, "USD", 100 * RATE_SCALE, TODAY);
  assert.equal(totals(state, "2026-09").expense, 22500);
  assert.equal(spendable(state, TODAY).liquid, 1_975_000);
  state = saveTransaction(
    state,
    { ...expense, id: original.id, title: "Edited" },
    TODAY,
  );
  assert.equal(state.transactions[0].baseAmount, 22500);
  state = saveTransaction(
    state,
    { ...expense, id: original.id, amount: 300 },
    TODAY,
  );
  assert.equal(state.transactions[0].baseAmount, 30000);
  assert.equal(original.amount, 250);
});

test("an exchange posts two actual amounts and never becomes income/expense; edits and deletion reverse both legs", () => {
  const start = fixture();
  const input = {
    type: "transfer" as const,
    title: "Exchange",
    date: TODAY,
    category: "other",
    accountId: "card",
    toAccountId: "usd",
    amount: 18000,
    toAmount: 195,
  };
  let state = saveTransaction(start, input, TODAY);
  assert.equal(accountBalance(state, "card", TODAY), 982000);
  assert.equal(accountBalance(state, "usd", TODAY), 10195);
  assert.deepEqual(totals(state, "2026-09"), { income: 0, expense: 0 });
  const id = state.transactions[0].id;
  state = saveTransaction(
    state,
    { ...input, id, amount: 9000, toAmount: 100 },
    TODAY,
  );
  assert.equal(accountBalance(state, "usd", TODAY), 10100);
  state = deleteTransaction(state, id, TODAY);
  assert.equal(accountBalance(state, "usd", TODAY), 10000);
  assert.equal(accountBalance(state, "card", TODAY), 1_000_000);
  assert.throws(
    () => saveTransaction(start, { ...input, toAmount: undefined }, TODAY),
    /зачисления/,
  );
  assert.throws(
    () => saveTransaction(start, { ...input, toAccountId: "cash" }, TODAY),
    /совпадать/,
  );
  assert.throws(() =>
    saveTransaction(start, { ...input, toAmount: -1 }, TODAY),
  );
});

test("goal funding uses destination units and reserved savings remain backed in each currency", () => {
  let state = saveGoal(
    fixture(),
    {
      name: "Trip",
      currency: "EUR",
      target: 10000,
      monthly: 2000,
      icon: "airplane-outline",
    },
    TODAY,
  );
  const goal = state.goals.at(-1)!;
  state = fundGoal(
    state,
    {
      goalId: goal.id,
      amount: 1100,
      toAmount: 990,
      accountId: "usd",
      toAccountId: "eur-savings",
    },
    TODAY,
  );
  assert.equal(goalSaved(state, goal, TODAY), 990);
  assert.equal(accountBalance(state, "eur-savings", TODAY), 990);
  assert.equal(spendable(state, TODAY).goals, 101000);
  assert.throws(
    () =>
      saveTransaction(
        state,
        {
          type: "transfer",
          title: "Leave savings",
          amount: 1,
          toAmount: 100,
          accountId: "eur-savings",
          toAccountId: "savings",
          date: TODAY,
          category: "other",
        },
        TODAY,
      ),
    /распределены/,
  );
  assert.throws(
    () =>
      fundGoal(
        state,
        { goalId: goal.id, amount: 100, toAmount: 10000, accountId: "usd" },
        TODAY,
      ),
    /превышает/,
  );
  assert.throws(
    () =>
      fundGoal(
        state,
        {
          goalId: goal.id,
          amount: 100,
          accountId: "usd",
          toAccountId: "savings",
        },
        TODAY,
      ),
    /EUR/,
  );
  assert.equal(goalSaved(state, goal, TODAY), 990);
});

test("base currency changes rebase budgets, history and scenario events while preserving native accounts, goals and overrides", () => {
  let state = saveTransaction(fixture(), expense, TODAY);
  state.settings.buffer = 90000;
  state.categories[0].budget = 180000;
  state.settings.forecast = { dailySpending: 900, goalDay: 15 };
  state = saveScenario(state, {
    name: "Scenario",
    horizon: 30,
    dailySpending: 900,
    changes: [],
    events: [
      { id: "gift", type: "income", name: "Gift", date: TODAY, amount: 9000 },
    ],
  });
  const before = encodeBackup(state);
  const changed = changeBaseCurrency(state, "USD");
  assert.equal(changed.settings.buffer, 1000);
  assert.equal(changed.categories[0].budget, 2000);
  assert.equal(changed.settings.forecast?.dailySpending, 10);
  assert.equal(changed.scenarios?.[0].events[0].amount, 100);
  assert.equal(transactionValue(changed, changed.transactions[0]), 250);
  assert.deepEqual(changed.accounts, state.accounts);
  assert.deepEqual(changed.goals, state.goals);
  assert.equal(encodeBackup(state), before);
  assert.deepEqual(
    decodeBackup(encodeBackup(changed)),
    JSON.parse(encodeBackup(changed)),
  );
});

test("account, goal and saved plan currencies cannot silently reinterpret history", () => {
  let state = fixture();
  assert.throws(
    () =>
      saveAccount(
        state,
        {
          id: "usd",
          name: "USD",
          kind: "spending",
          balance: 100,
          currency: "EUR",
        },
        TODAY,
      ),
    /Валюту/,
  );
  state = savePlannedIncome(state, {
    name: "Salary",
    amount: 1000,
    accountId: "usd",
    date: TODAY,
    repeat: "monthly",
  });
  const income = state.plannedIncomes![0];
  assert.throws(
    () => savePlannedIncome(state, { ...income, accountId: "card" }),
    /валюты/,
  );
  state = saveRecurring(
    state,
    {
      name: "Service",
      amount: 500,
      day: 15,
      accountId: "usd",
      category: "other",
      startsOn: TODAY,
    },
    TODAY,
  );
  assert.throws(
    () =>
      saveRecurring(state, { ...state.recurring[0], accountId: "card" }, TODAY),
    /валюты/,
  );
});

test("forecast converts income, bills, goal reserves and overrides but keeps real balances intact", () => {
  let state = fixture();
  state = savePlannedIncome(state, {
    name: "Salary",
    amount: 1000,
    accountId: "usd",
    date: "2026-09-15",
    repeat: "once",
  });
  state = saveRecurring(
    state,
    {
      name: "Service",
      amount: 500,
      day: 16,
      accountId: "usd",
      category: "other",
      startsOn: TODAY,
    },
    TODAY,
  );
  state = saveGoal(
    state,
    {
      name: "Trip",
      currency: "EUR",
      target: 10000,
      monthly: 2000,
      icon: "airplane-outline",
    },
    TODAY,
  );
  state.settings.forecast = { dailySpending: 0, goalDay: 17 };
  const before = encodeBackup(state);
  const result = forecast(state, 30, TODAY);
  assert.equal(result.openingBalance, 1_900_000);
  assert.equal(result.income, 90000);
  assert.equal(result.outflow, 245000);
  assert.equal(result.closingBalance, 1_745_000);
  const scenario = {
    id: "test",
    name: "More",
    horizon: 30 as const,
    changes: [
      {
        source: "income" as const,
        sourceId: state.plannedIncomes![0].id,
        name: "Salary",
        amount: 2000,
        delayDays: 0,
      },
    ],
    events: [],
  };
  assert.equal(forecast(state, 30, TODAY, undefined, scenario).income, 180000);
  assert.equal(encodeBackup(state), before);
});

test("manual rates survive automatic refresh; restoring automatic uses the latest quote and rejects older responses", () => {
  const start = fixture(),
    before = encodeBackup(start);
  let state = mergeCurrencyRates(
    start,
    { USD: { value: 95 * RATE_SCALE, date: TODAY, source: "frankfurter" } },
    TODAY,
  );
  assert.equal(state.settings.exchange?.rates.USD?.value, 90 * RATE_SCALE);
  state = restoreAutomaticRate(state, "USD");
  assert.equal(state.settings.exchange?.rates.USD?.value, 95 * RATE_SCALE);
  state = mergeCurrencyRates(
    state,
    {
      USD: {
        value: 80 * RATE_SCALE,
        date: "2026-09-09",
        source: "frankfurter",
      },
    },
    TODAY,
  );
  assert.equal(state.settings.exchange?.rates.USD?.value, 95 * RATE_SCALE);
  assert.equal(encodeBackup(start), before);
  assert.throws(() =>
    mergeCurrencyRates(
      state,
      { USD: { value: 0, date: TODAY, source: "frankfurter" } },
      TODAY,
    ),
  );
  assert.throws(() =>
    mergeCurrencyRates(
      state,
      { USD: { value: RATE_SCALE, date: "2026-09-11", source: "frankfurter" } },
      TODAY,
    ),
  );
});

test("exchange service validates response shape, dates, finite quotes and cross-rate calculation", () => {
  const data = [
    { base: "USD", quote: "RUB", rate: 90, date: TODAY },
    { base: "USD", quote: "EUR", rate: 0.9, date: "2026-09-09" },
  ];
  const rates = decodeExchangeRates(data, TODAY);
  assert.equal(rates.USD?.value, 90 * RATE_SCALE);
  assert.equal(rates.EUR?.value, 100 * RATE_SCALE);
  assert.equal(rates.EUR?.date, "2026-09-09");
  for (const bad of [
    null,
    [],
    [data[1]],
    [data[0], data[0]],
    [{ ...data[0], rate: Infinity }],
    [{ ...data[0], rate: -1 }],
    [{ ...data[0], date: "2026-09-11" }],
    [{ ...data[0], base: "EUR" }],
  ])
    assert.throws(() => decodeExchangeRates(bad, TODAY));
});

test("foreign CSV checks account currency, captures valuation and imports exchanges with both actual legs atomically", () => {
  const start = fixture();
  const table = parseCsv(
    "Date,Description,Amount,Currency\n2026-09-10,Coffee,-2.50,USD\n2026-09-10,Exchange,10.00,USD\n2026-09-10,Wrong,-5.00,EUR",
  );
  const options: CsvOptions = {
    accountId: "usd",
    mapping: guessCsvMapping(table.headers),
    mode: "signed",
    positive: "income",
    dateOrder: "dmy",
  };
  const overrides = {
    3: {
      type: "transfer" as const,
      otherAccountId: "card",
      otherAmount: "900",
    },
  };
  const rows = previewCsv(start, table, options, overrides, TODAY);
  assert.equal(rows[0].transaction?.baseAmount, 22500);
  assert.equal(rows[1].transaction?.amount, 90000);
  assert.equal(rows[1].transaction?.toAmount, 1000);
  assert.match(rows[2].error!, /Валюта/);
  assert.match(
    previewCsv(
      start,
      table,
      options,
      { 3: { type: "transfer", otherAccountId: "card" } },
      TODAY,
    )[1].error!,
    /втором счёте/,
  );
  const next = applyCsvImport(
    start,
    table,
    options,
    new Set([4]),
    overrides,
    TODAY,
  );
  assert.equal(accountBalance(next, "usd", TODAY), 10750);
  assert.equal(accountBalance(next, "card", TODAY), 910000);
  assert.equal(totals(next, "2026-09").income, 0);
  assert.throws(
    () => applyCsvImport(next, table, options, new Set([4]), overrides, TODAY),
    /Нет новых/,
  );
  assert.equal(start.transactions.length, 0);
});

test("universal CSV preserves both currencies; destination and YNAB exports use actual received amount", () => {
  const state = saveTransaction(
    fixture(),
    {
      type: "transfer",
      title: "Exchange",
      date: TODAY,
      category: "other",
      accountId: "card",
      toAccountId: "usd",
      amount: 90000,
      toAmount: 990,
    },
    TODAY,
  );
  const all = parseCsv(
    exportTransactionsCsv(state, { format: "universal" }, TODAY).content,
  );
  assert.deepEqual(all.rows[0].slice(2, 4), ["-900.00", "RUB"]);
  assert.deepEqual(all.rows[0].slice(10, 14), ["900.00", "RUB", "9.90", "USD"]);
  const target = parseCsv(
    exportTransactionsCsv(
      state,
      { format: "universal", accountId: "usd" },
      TODAY,
    ).content,
  );
  assert.deepEqual(target.rows[0].slice(2, 4), ["9.90", "USD"]);
  const ynab = parseCsv(
    exportTransactionsCsv(state, { format: "ynab", accountId: "usd" }, TODAY)
      .content,
  );
  assert.deepEqual(ynab.rows[0].slice(3), ["", "9.90"]);
});

test("old RUB backups migrate without reinterpreting money and invalid foreign data fails closed", () => {
  for (const version of [1, 2, 3]) {
    const old = { ...createInitialState(true, TODAY), version };
    const restored = decodeBackup(JSON.stringify(old));
    assert.equal(restored.version, 4);
    assert.equal(baseCurrency(restored), "RUB");
    assert.equal(accountCurrency(restored, "card"), "RUB");
    assert.deepEqual(restored.transactions, old.transactions);
  }
  const state = saveTransaction(fixture(), expense, TODAY);
  assert.deepEqual(
    decodeBackup(encodeBackup(state)),
    JSON.parse(encodeBackup(state)),
  );
  const bad = JSON.parse(encodeBackup(state));
  delete bad.settings.exchange.rates.USD;
  assert.throws(() => decodeBackup(JSON.stringify(bad)), /курс USD/);
  const noValuation = JSON.parse(encodeBackup(state));
  delete noValuation.transactions[0].baseAmount;
  assert.throws(() => decodeBackup(JSON.stringify(noValuation)), /оценк/);
});

test("scenario drafts preserve 3-digit source amounts and base-currency event amounts across save and rebase", () => {
  let state = fixture();
  state = saveAccount(
    state,
    { name: "KWD", kind: "spending", currency: "KWD", balance: 10000 },
    TODAY,
  );
  state = savePlannedIncome(state, {
    name: "KWD salary",
    amount: 1234,
    accountId: state.accounts.at(-1)!.id,
    date: TODAY,
    repeat: "once",
  });
  state = saveScenario(state, {
    name: "Test",
    horizon: 30,
    changes: [
      {
        source: "income",
        sourceId: state.plannedIncomes![0].id,
        amount: 1234,
        name: "KWD salary",
        delayDays: 0,
      },
    ],
    events: [],
  });
  const scenario = state.scenarios![0];
  const draft = scenarioDraft(scenario, state);
  assert.equal(draft.changes[0].amount, "1,234");
  assert.equal(
    parseScenarioDraft(draft, scenario.id, state).changes[0].amount,
    1234,
  );
  const next = changeBaseCurrency(state, "JPY");
  assert.equal(next.scenarios![0].changes[0].amount, 1234);
});

test("CSV reads and exports integer yen and three-place dinar amounts without treating them as cents", () => {
  for (const [currency, text, units] of [
    ["JPY", "123", 123],
    ["KWD", "1.234", 1234],
  ] as const) {
    let state = saveAccount(
      fixture(),
      { name: currency, kind: "spending", currency, balance: 10000 },
      TODAY,
    );
    const accountId = state.accounts.at(-1)!.id;
    const table = parseCsv(
      `Date,Description,Amount,Currency\n${TODAY},Test,-${text},${currency}`,
    );
    const options: CsvOptions = {
      accountId,
      mapping: guessCsvMapping(table.headers),
      mode: "signed",
      positive: "income",
      dateOrder: "dmy",
    };
    state = applyCsvImport(state, table, options, new Set(), {}, TODAY);
    assert.equal(state.transactions[0].amount, units);
    const output = parseCsv(
      exportTransactionsCsv(state, { format: "universal", accountId }, TODAY)
        .content,
    );
    assert.deepEqual(output.rows[0].slice(2, 4), [`-${text}`, currency]);
  }
});

test("migration preserves valid old balances larger than the limit of an individual operation", () => {
  const old = createInitialState(false, TODAY);
  old.version = 2;
  old.transactions = [1, 2, 3].map((n) => ({
    id: String(n),
    title: "Income",
    type: "income",
    amount: 100_000_000_000,
    date: TODAY,
    category: "other",
    accountId: "card",
  }));
  const restored = decodeBackup(encodeBackup(old));
  assert.equal(accountBalance(restored, "card", TODAY), 300_000_000_000);
});

test("choosing an operation's own currency uses its actual amount even after reference rates change", () => {
  let state = saveTransaction(fixture(), expense, TODAY);
  state = saveCurrencyRate(state, "USD", 100 * RATE_SCALE, TODAY);
  state = changeBaseCurrency(state, "USD", TODAY);
  assert.equal(totals(state, "2026-09").expense, 250);
  assert.equal(state.transactions[0].amount, 250);
});

test("version 3 multicurrency backup upgrades to 4 without changing valuations or amounts", () => {
  const state = saveTransaction(fixture(), expense, TODAY);
  const legacy = JSON.parse(encodeBackup(state));
  legacy.version = 3;
  // v3 contained the saved value, but had no field describing its basis.
  for (const transaction of legacy.transactions) delete transaction.valuation;
  const restored = decodeBackup(JSON.stringify(legacy));
  assert.equal(restored.version, 4);
  assert.deepEqual(restored.accounts, legacy.accounts);
  assert.deepEqual(restored.transactions, legacy.transactions);
  assert.deepEqual(restored.settings, legacy.settings);
  assert.equal(restored.categoryRules, undefined);
  assert.equal(restored.balanceAdjustments, undefined);
  assert.equal(restored.debts, undefined);
  assert.deepEqual(decodeBackup(encodeBackup(restored)), restored);
});
