import assert from "node:assert/strict";
import { test } from "node:test";
import { saveAccount } from "../src/domain/actions/accounts";
import {
  saveDebt,
  repayDebt,
  deleteDebt,
  repayCredit,
} from "../src/domain/actions/debts";
import {
  deleteTransaction,
  saveTransaction,
} from "../src/domain/actions/transactions";
import { saveCurrencyRate } from "../src/domain/actions/currencies";
import { accountBalance } from "../src/domain/accountBalances";
import {
  debtBalance,
  creditOutstanding,
  creditPaymentRemaining,
  debtObligations,
  validateDebts,
} from "../src/domain/debts";
import {
  expenseContributions,
  transactionIncomeAmount,
} from "../src/domain/transactionAmounts";
import { RATE_SCALE } from "../src/domain/currency";
import { createInitialState } from "../src/domain/seed";
import { forecast } from "../src/domain/forecast";
import { spendable, totals } from "../src/domain/finance";
import { decodeBackup, encodeBackup } from "../src/domain/backup";

const TODAY = "2026-09-20";
function fixture() {
  const state = createInitialState(false, TODAY);
  state.accounts[0].openingBalance = 100_000;
  return state;
}
function borrowed(recordTransaction = true) {
  return saveDebt(
    fixture(),
    {
      name: "Алексей",
      direction: "borrowed",
      accountId: "card",
      amount: 50_000,
      date: "2026-09-01",
      dueDate: "2026-09-25",
      recordTransaction,
    },
    TODAY,
  );
}

test("borrowed principal and partial repayment change cash and debt together without becoming income or consumption", () => {
  const start = fixture();
  const before = JSON.stringify(start);
  let state = saveDebt(
    start,
    {
      name: "Ремонт",
      direction: "borrowed",
      accountId: "card",
      amount: 50_000,
      date: "2026-09-01",
      dueDate: "2026-09-25",
      recordTransaction: true,
    },
    TODAY,
  );
  const debt = state.debts![0];
  assert.equal(accountBalance(state, "card", TODAY), 150_000);
  assert.equal(debtBalance(state, debt, TODAY), 50_000);
  assert.equal(transactionIncomeAmount(state, state.transactions[0]), 0);
  state = repayDebt(
    state,
    { debtId: debt.id, accountId: "card", amount: 20_000, date: TODAY },
    TODAY,
  );
  assert.equal(accountBalance(state, "card", TODAY), 130_000);
  assert.equal(debtBalance(state, debt, TODAY), 30_000);
  assert.deepEqual(expenseContributions(state, state.transactions[0]), []);
  assert.equal(debtObligations(state, TODAY, "2026-09-30")[0].amount, 30_000);
  assert.equal(JSON.stringify(start), before);
});

test("existing debts do not duplicate past cash movements and receivables never promise reliable cash", () => {
  const existing = borrowed(false);
  assert.equal(existing.transactions.length, 0);
  assert.equal(accountBalance(existing, "card", TODAY), 100_000);
  assert.equal(debtBalance(existing, existing.debts![0], "2026-08-31"), 0);
  let lent = saveDebt(
    fixture(),
    {
      name: "Друг",
      direction: "lent",
      accountId: "card",
      amount: 40_000,
      date: "2026-09-01",
      dueDate: "2026-09-19",
      recordTransaction: true,
    },
    TODAY,
  );
  const debt = lent.debts![0];
  assert.equal(accountBalance(lent, "card", TODAY), 60_000);
  assert.deepEqual(debtObligations(lent, TODAY, "2026-12-31"), []);
  lent = repayDebt(
    lent,
    { debtId: debt.id, accountId: "cash", amount: 10_000, date: TODAY },
    TODAY,
  );
  assert.equal(accountBalance(lent, "cash", TODAY), 10_000);
  assert.equal(debtBalance(lent, debt, TODAY), 30_000);
  assert.equal(transactionIncomeAmount(lent, lent.transactions[0]), 0);
});

test("overrepayments, future dates, missing cash and deleting a loan supporting repayments fail without mutation", () => {
  const start = borrowed();
  const debt = start.debts![0];
  const before = JSON.stringify(start);
  assert.throws(
    () =>
      repayDebt(
        start,
        { debtId: debt.id, accountId: "card", amount: 50_001, date: TODAY },
        TODAY,
      ),
    /превышает/,
  );
  assert.throws(
    () =>
      repayDebt(
        start,
        {
          debtId: debt.id,
          accountId: "card",
          amount: 10_000,
          date: "2026-09-21",
        },
        TODAY,
      ),
    /дату/,
  );
  assert.throws(
    () =>
      repayDebt(
        start,
        { debtId: debt.id, accountId: "cash", amount: 10_000, date: TODAY },
        TODAY,
      ),
    /недостаточно/,
  );
  assert.throws(
    () =>
      repayDebt(
        start,
        {
          debtId: debt.id,
          accountId: "card",
          amount: 10_000,
          date: "2026-08-31",
        },
        TODAY,
      ),
    /дату/,
  );
  const repaid = repayDebt(
    start,
    { debtId: debt.id, accountId: "card", amount: 20_000, date: TODAY },
    TODAY,
  );
  assert.throws(
    () => deleteTransaction(repaid, start.transactions[0].id, TODAY),
    /превышает/,
  );
  assert.throws(() => deleteDebt(repaid, debt.id), /движения/);
  assert.throws(
    () =>
      saveTransaction(
        start,
        { ...start.transactions[0], title: "Тест" },
        TODAY,
      ),
    /Долги|долг/,
  );
  const reversed = deleteTransaction(repaid, repaid.transactions[0].id, TODAY);
  assert.equal(debtBalance(reversed, debt, TODAY), 50_000);
  assert.equal(JSON.stringify(start), before);
});

test("debt validation rejects invalid links, foreign-currency reinterpretation and repayments before issue", () => {
  const start = borrowed();
  const wrongLink = structuredClone(start);
  wrongLink.transactions[0].debtId = "missing";
  assert.throws(() => validateDebts(wrongLink, TODAY), /неизвестный долг/);
  const badTimeline = structuredClone(start);
  badTimeline.debts![0].startsOn = "2026-08-01";
  badTimeline.transactions.push({
    ...start.transactions[0],
    id: "earlier",
    date: "2026-08-15",
    type: "expense",
    debtAction: "repay",
    amount: 1,
  });
  assert.throws(() => validateDebts(badTimeline, TODAY), /превышает/);
  const mismatch = structuredClone(start);
  mismatch.accounts[0].currency = "USD";
  assert.throws(() => validateDebts(mismatch, TODAY), /валюте/);
});

function credit() {
  const state = saveAccount(
    fixture(),
    {
      name: "Кредитная",
      kind: "credit",
      balance: -20_000,
      creditLimit: 50_000,
      paymentDueDate: "2026-09-25",
      paymentDueAmount: 10_000,
    },
    TODAY,
  );
  state.accounts.at(-1)!.id = "credit";
  return state;
}

test("credit purchases count once and repayment transfers reduce both the debt and required payment", () => {
  let state = credit();
  const card = state.accounts.at(-1)!;
  state = saveTransaction(
    state,
    {
      type: "expense",
      title: "Книга",
      amount: 5_000,
      date: TODAY,
      category: "shopping",
      accountId: card.id,
    },
    TODAY,
  );
  assert.equal(creditOutstanding(state, card, TODAY), 25_000);
  assert.equal(
    expenseContributions(state, state.transactions[0])[0].amount,
    5_000,
  );
  state = repayCredit(
    state,
    { accountId: card.id, fromAccountId: "card", amount: 6_000, date: TODAY },
    TODAY,
  );
  assert.equal(accountBalance(state, "card", TODAY), 94_000);
  assert.equal(creditOutstanding(state, card, TODAY), 19_000);
  assert.equal(creditPaymentRemaining(state, card, TODAY), 4_000);
  assert.deepEqual(expenseContributions(state, state.transactions[0]), []);
  assert.equal(debtObligations(state, TODAY, "2026-09-30")[0].amount, 4_000);
  assert.throws(
    () =>
      saveTransaction(
        state,
        {
          type: "expense",
          title: "Слишком много",
          amount: 40_000,
          date: TODAY,
          category: "shopping",
          accountId: card.id,
        },
        TODAY,
      ),
    /лимит/,
  );
  assert.throws(
    () =>
      repayCredit(
        state,
        {
          accountId: card.id,
          fromAccountId: "card",
          amount: 20_000,
          date: TODAY,
        },
        TODAY,
      ),
    /превышает/,
  );
});

test("ordinary repayment transfers, deletion and statement refresh never count the same payment twice", () => {
  let state = credit();
  state = saveTransaction(
    state,
    {
      type: "transfer",
      title: "Погашение",
      amount: 3_000,
      accountId: "card",
      toAccountId: "credit",
      date: TODAY,
      category: "other",
    },
    TODAY,
  );
  const transfer = state.transactions[0];
  assert.equal(
    creditPaymentRemaining(state, state.accounts.at(-1)!, TODAY),
    7_000,
  );
  const removed = deleteTransaction(state, transfer.id, TODAY);
  assert.equal(
    creditPaymentRemaining(removed, removed.accounts.at(-1)!, TODAY),
    10_000,
  );
  state = saveAccount(
    state,
    {
      id: "credit",
      name: "Кредитная",
      kind: "credit",
      balance: -17_000,
      creditLimit: 50_000,
      paymentDueDate: "2026-10-25",
      paymentDueAmount: 8_000,
    },
    TODAY,
  );
  const card = state.accounts.at(-1)!;
  assert.deepEqual(card.paymentDueBaselineIds, [transfer.id]);
  assert.equal(creditPaymentRemaining(state, card, TODAY), 8_000);
  state = repayCredit(
    state,
    { accountId: "credit", fromAccountId: "card", amount: 2_000, date: TODAY },
    TODAY,
  );
  assert.equal(creditPaymentRemaining(state, card, TODAY), 6_000);
  const afterDelete = deleteTransaction(state, state.transactions[0].id, TODAY);
  assert.equal(creditPaymentRemaining(afterDelete, card, TODAY), 8_000);
});

test("foreign-card repayment uses actual receiving units for principal and due payment", () => {
  let state = saveCurrencyRate(fixture(), "USD", 90 * RATE_SCALE, TODAY);
  state = saveAccount(
    state,
    {
      name: "USD credit",
      kind: "credit",
      currency: "USD",
      balance: -10_000,
      creditLimit: 50_000,
      paymentDueDate: "2026-09-25",
      paymentDueAmount: 3_000,
    },
    TODAY,
  );
  const card = state.accounts.at(-1)!;
  state = repayCredit(
    state,
    {
      accountId: card.id,
      fromAccountId: "card",
      amount: 90_000,
      toAmount: 1_000,
      date: TODAY,
    },
    TODAY,
  );
  assert.equal(creditOutstanding(state, card, TODAY), 9_000);
  assert.equal(creditPaymentRemaining(state, card, TODAY), 2_000);
  assert.equal(accountBalance(state, "card", TODAY), 10_000);
});

test("editing account balance records a dated correction while retaining opening balance and earlier history", () => {
  const start = fixture();
  const next = saveAccount(
    start,
    { id: "card", name: "Карта", kind: "spending", balance: 90_000 },
    TODAY,
  );
  assert.equal(next.accounts[0].openingBalance, 100_000);
  assert.equal(accountBalance(next, "card", "2026-09-19"), 100_000);
  assert.equal(accountBalance(next, "card", TODAY), 90_000);
  assert.equal(next.balanceAdjustments![0].amount, -10_000);
  assert.equal(next.balanceAdjustments![0].date, TODAY);
  assert.equal(start.balanceAdjustments, undefined);
  const renamed = saveAccount(
    next,
    { id: "card", name: "Имя", kind: "spending", balance: 90_000 },
    TODAY,
  );
  assert.equal(renamed.balanceAdjustments!.length, 1);
});

test("borrowed dues reserve cash in spendable and forecast once; actual repayments reduce both cash and remaining obligation", () => {
  let state = borrowed();
  state.settings.payday = 30;
  const original = forecast(state, 30, TODAY);
  assert.equal(original.openingBalance, 150_000);
  assert.equal(original.outflow, 50_000);
  assert.equal(original.closingBalance, 100_000);
  assert.equal(spendable(state, TODAY).available, 100_000);
  state = repayDebt(
    state,
    {
      debtId: state.debts![0].id,
      accountId: "card",
      amount: 20_000,
      date: TODAY,
    },
    TODAY,
  );
  const after = forecast(state, 30, TODAY);
  assert.equal(after.openingBalance, 130_000);
  assert.equal(after.outflow, 30_000);
  assert.equal(after.closingBalance, 100_000);
  assert.equal(spendable(state, TODAY).available, 100_000);
  assert.deepEqual(totals(state, "2026-09"), { income: 0, expense: 0 });
  state.debts![0].dueDate = "2026-09-19";
  const overdue = forecast(state, 30, TODAY).days[0];
  assert.equal(
    overdue.events.find((event) => event.type === "debt")?.amount,
    -30_000,
  );
  assert.equal(
    overdue.events.find((event) => event.type === "debt")?.overdue,
    true,
  );
});

test("credit limits and expected loan returns do not increase reliable available money", () => {
  let state = credit();
  state.settings.payday = 30;
  const result = forecast(state, 30, TODAY);
  assert.equal(result.openingBalance, 100_000);
  assert.equal(result.closingBalance, 90_000);
  assert.equal(spendable(state, TODAY).available, 90_000);
  state = saveDebt(
    state,
    {
      name: "Мне вернут",
      direction: "lent",
      accountId: "card",
      amount: 1_000_000,
      recordTransaction: false,
      date: "2026-09-01",
      dueDate: "2026-09-21",
    },
    TODAY,
  );
  assert.equal(forecast(state, 30, TODAY).closingBalance, 90_000);
  assert.equal(spendable(state, TODAY).available, 90_000);
});

test("debts, repayments, credit schedules and balance corrections round-trip through financial backups", () => {
  let state = borrowed();
  state = repayDebt(
    state,
    {
      debtId: state.debts![0].id,
      accountId: "card",
      amount: 10_000,
      date: TODAY,
    },
    TODAY,
  );
  state = saveAccount(
    state,
    {
      name: "Кредитная",
      kind: "credit",
      balance: -20_000,
      creditLimit: 50_000,
      paymentDueDate: "2026-09-25",
      paymentDueAmount: 10_000,
    },
    TODAY,
  );
  state = saveAccount(
    state,
    { id: "card", name: "Карта", kind: "spending", balance: 130_000 },
    TODAY,
  );
  const restored = decodeBackup(encodeBackup(state));
  assert.deepEqual(restored.debts, JSON.parse(JSON.stringify(state.debts)));
  assert.deepEqual(restored.balanceAdjustments, state.balanceAdjustments);
  assert.equal(
    forecast(restored, 30, TODAY).closingBalance,
    forecast(state, 30, TODAY).closingBalance,
  );
  const bad = JSON.parse(encodeBackup(state));
  bad.debts[0].currency = "USD";
  assert.throws(() => decodeBackup(JSON.stringify(bad)), /валют/);
});
