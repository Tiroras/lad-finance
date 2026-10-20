import assert from "node:assert/strict";
import { test } from "node:test";
import { saveAccount } from "../src/domain/actions/accounts";
import { saveCurrencyRate } from "../src/domain/actions/currencies";
import { saveTransaction } from "../src/domain/actions/transactions";
import { accountBalance } from "../src/domain/accountBalances";
import type { TransactionTemplate } from "../src/domain/automation";
import { RATE_SCALE } from "../src/domain/currency";
import { createInitialState } from "../src/domain/seed";
import type { Transaction } from "../src/domain/types";
import {
  applyQuickEntry,
  applyTransactionTemplate,
  changeTransactionType,
  createTransactionDraft,
  repeatTransaction,
  selectRefund,
  transactionInput,
  transactionTemplateInput,
} from "../src/features/transactions/model/transactionDraft";

const TODAY = "2026-09-20";
const purchase: Transaction = {
  id: "purchase",
  type: "expense",
  title: "Покупка",
  amount: 100_000,
  date: "2026-09-10",
  category: "groceries",
  accountId: "card",
};
const template: TransactionTemplate = {
  id: "split-template",
  name: "Продукты и кафе",
  title: "Покупки",
  type: "expense",
  amount: 30_000,
  category: "groceries",
  accountId: "card",
  currency: "RUB",
  splits: [
    { category: "groceries", amount: 20_000 },
    { category: "cafe", amount: 10_000 },
  ],
};

test("quick entry replaces template splits and clears its selection without changing finance state", () => {
  const state = createInitialState(false, TODAY);
  const before = structuredClone(state);
  const fromTemplate = applyTransactionTemplate(
    state,
    createTransactionDraft(state, TODAY),
    template,
    TODAY,
  );
  const draft = applyQuickEntry(state, fromTemplate, "кофе 320");
  const input = transactionInput(state, draft);
  assert.equal(input.amount, 32_000);
  assert.equal(input.title, "Кофе");
  assert.equal(input.category, "cafe");
  assert.equal(input.splits, undefined);
  assert.equal(draft.templateId, undefined);
  assert.equal(fromTemplate.parts.length, 2);
  assert.deepEqual(state, before);
});

test("quick income after choosing a refund is an ordinary income without stale refund valuation", () => {
  const state = createInitialState(false, TODAY);
  state.transactions = [purchase];
  const refund = selectRefund(
    state,
    createTransactionDraft(state, TODAY),
    purchase,
  );
  const draft = applyQuickEntry(
    state,
    { ...refund, valuation: "99", refundSource: "20" },
    "зарплата 500",
  );
  const input = transactionInput(state, draft);
  assert.equal(input.type, "income");
  assert.equal(input.amount, 50_000);
  assert.equal(input.refundOf, undefined);
  assert.equal(input.refundSourceAmount, undefined);
  assert.equal(draft.valuation, null);
  assert.equal(draft.refundSource, "");
  assert.equal(refund.refundOf, purchase.id);
});

test("template after a refund replaces links and creates independent split fields", () => {
  const state = createInitialState(false, TODAY);
  state.transactions = [purchase];
  const refund = selectRefund(
    state,
    createTransactionDraft(state, TODAY),
    purchase,
  );
  const draft = applyTransactionTemplate(state, refund, template, TODAY);
  const input = transactionInput(state, draft);
  assert.equal(input.refundOf, undefined);
  assert.equal(input.type, "expense");
  assert.equal(input.amount, 30_000);
  assert.deepEqual(input.splits, template.splits);
  draft.parts[0].amount = "1";
  assert.equal(template.splits![0].amount, 20_000);
});

test("selecting a refund offers the remaining amount and discards old split fields", () => {
  const state = createInitialState(false, TODAY);
  state.transactions = [
    purchase,
    {
      id: "refund",
      type: "income",
      title: "Возврат",
      amount: 25_000,
      date: TODAY,
      accountId: "card",
      category: "groceries",
      refundOf: purchase.id,
    },
  ];
  const fromTemplate = applyTransactionTemplate(
    state,
    createTransactionDraft(state, TODAY),
    template,
    TODAY,
  );
  const refund = selectRefund(state, fromTemplate, purchase);
  assert.equal(transactionInput(state, refund).amount, 75_000);
  assert.equal(refund.refundOf, purchase.id);
  assert.equal(refund.splitEnabled, false);
  assert.deepEqual(refund.parts, []);
  assert.equal(refund.templateId, undefined);
  assert.throws(
    () => transactionTemplateInput(state, refund, "Возврат"),
    /без шаблона/,
  );
});

test("leaving refund mode does not restore a hidden purchase link when switching back to income", () => {
  const state = createInitialState(false, TODAY);
  state.transactions = [purchase];
  const refund = selectRefund(
    state,
    createTransactionDraft(state, TODAY),
    purchase,
  );
  const expense = changeTransactionType(refund, "expense");
  const income = changeTransactionType(expense, "income");
  assert.equal(transactionInput(state, income).refundOf, undefined);
  assert.equal(refund.refundOf, purchase.id);
});

for (const purchaseCurrency of ["RUB", "USD"] as const) {
  test(`editing a saved ${purchaseCurrency} purchase refund retains its locked link and source amount across type switches`, () => {
    let state = createInitialState(false, TODAY);
    const foreign = purchaseCurrency !== "RUB";
    let purchaseAccountId = "card";
    if (foreign) {
      state = saveCurrencyRate(state, "USD", 90 * RATE_SCALE, TODAY);
      state = saveAccount(
        state,
        {
          name: "Доллары",
          kind: "spending",
          currency: "USD",
          balance: 10_000,
        },
        TODAY,
      );
      purchaseAccountId = state.accounts.at(-1)!.id;
    }
    state = saveTransaction(
      state,
      {
        ...purchase,
        id: undefined,
        accountId: purchaseAccountId,
        amount: foreign ? 250 : purchase.amount,
      },
      TODAY,
    );
    const source = state.transactions[0];
    state = saveTransaction(
      state,
      {
        type: "income",
        title: "Возврат покупки",
        amount: foreign ? 9_000 : 25_000,
        date: TODAY,
        category: purchase.category,
        accountId: "card",
        refundOf: source.id,
        refundSourceAmount: foreign ? 100 : undefined,
      },
      TODAY,
    );
    const original = state.transactions[0];
    const initialDraft = createTransactionDraft(state, TODAY, original);
    for (const temporaryType of ["expense", "transfer"] as const) {
      const temporary = changeTransactionType(
        initialDraft,
        temporaryType,
        original,
      );
      const restored = changeTransactionType(temporary, "income", original);
      assert.equal(restored.refundOf, source.id);
      assert.equal(restored.refundSource, foreign ? "1" : "");
      const input = transactionInput(state, restored, original);
      assert.equal(input.refundOf, source.id);
      assert.equal(input.refundSourceAmount, original.refundSourceAmount);
      const saved = saveTransaction(state, input, TODAY);
      assert.equal(saved.transactions.length, 2);
      assert.equal(saved.transactions[0].id, original.id);
      assert.equal(saved.transactions[0].refundOf, restored.refundOf);
      assert.equal(
        saved.transactions[0].refundSourceAmount,
        input.refundSourceAmount,
      );
      assert.equal(
        accountBalance(saved, "card", TODAY),
        accountBalance(state, "card", TODAY),
      );
    }
  });
}

test("invalid quick entry leaves its previous draft untouched", () => {
  const state = createInitialState(false, TODAY);
  const draft = applyTransactionTemplate(
    state,
    createTransactionDraft(state, TODAY),
    template,
    TODAY,
  );
  const before = structuredClone(draft);
  assert.throws(
    () => applyQuickEntry(state, draft, "кофе 20 и 30"),
    /одну сумму/,
  );
  assert.deepEqual(draft, before);
});

test("editing preserves historical valuation, while repeating uses today's rate and drops plan links", () => {
  let state = createInitialState(false, TODAY);
  state = saveCurrencyRate(state, "USD", 100 * RATE_SCALE, TODAY);
  state = saveAccount(
    state,
    { name: "Доллары", kind: "spending", currency: "USD", balance: 10_000 },
    TODAY,
  );
  const original: Transaction = {
    ...purchase,
    accountId: state.accounts.at(-1)!.id,
    amount: 250,
    baseAmount: 22_500,
    recurringId: "plan",
    occurrenceDate: "2026-09-10",
  };
  state.transactions = [original];
  const draft = {
    ...createTransactionDraft(state, TODAY, original),
    title: "Новое название",
  };
  // An untouched valuation is resolved from the latest state by the action.
  assert.equal(transactionInput(state, draft, original).baseAmount, undefined);
  const repeated = transactionInput(
    state,
    repeatTransaction(draft, TODAY),
    original,
  );
  assert.equal(repeated.baseAmount, undefined);
  assert.equal(repeated.id, undefined);
  assert.equal(repeated.date, TODAY);
  assert.equal(repeated.recurringId, undefined);
  assert.equal(repeated.occurrenceDate, undefined);
  assert.equal(state.transactions[0].baseAmount, 22_500);
  const saved = saveTransaction({ ...state, transactions: [] }, repeated, TODAY)
    .transactions[0];
  assert.equal(saved.baseAmount, 25_000);
  assert.deepEqual(saved.valuation, { source: "current", date: TODAY });
});

test("transaction and template use the same precise KWD debit and JPY credit", () => {
  let state = createInitialState(false, TODAY);
  state = saveCurrencyRate(state, "KWD", 300 * RATE_SCALE, TODAY);
  state = saveCurrencyRate(state, "JPY", Math.round(0.6 * RATE_SCALE), TODAY);
  state = saveAccount(
    state,
    { name: "Динары", kind: "spending", currency: "KWD", balance: 10_000 },
    TODAY,
  );
  const accountId = state.accounts.at(-1)!.id;
  state = saveAccount(
    state,
    { name: "Иены", kind: "savings", currency: "JPY", balance: 0 },
    TODAY,
  );
  const draft = {
    ...createTransactionDraft(state, TODAY, undefined, "transfer"),
    title: "Обмен",
    accountId,
    toAccountId: state.accounts.at(-1)!.id,
    amount: "1,234",
    received: "523",
  };
  const input = transactionInput(state, draft);
  const savedTemplate = transactionTemplateInput(state, draft, "Обмен валют");
  assert.equal(input.amount, 1234);
  assert.equal(input.toAmount, 523);
  assert.equal(savedTemplate.amount, 1234);
  assert.equal(savedTemplate.toAmount, 523);
  assert.equal(savedTemplate.currency, "KWD");
  assert.equal(savedTemplate.toCurrency, "JPY");
});
