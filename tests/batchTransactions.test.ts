import assert from "node:assert/strict";
import { test } from "node:test";
import { appendTransactions } from "../src/domain/actions/transactions";
import { accountBalance } from "../src/domain/accountBalances";
import { RATE_SCALE } from "../src/domain/currency";
import { createInitialState } from "../src/domain/seed";
import type { Transaction } from "../src/domain/types";

const TODAY = "2026-09-10";
function transaction(
  id: string,
  fields: Partial<Transaction> = {},
): Transaction {
  return {
    id,
    type: "expense",
    title: id,
    amount: 100,
    date: TODAY,
    category: "other",
    accountId: "card",
    ...fields,
  };
}

test("batch entries retain file order, actual currency amounts and historical valuations without mutating inputs", () => {
  const state = createInitialState(false, TODAY);
  state.accounts[0].currency = "USD";
  state.accounts[0].openingBalance = 10_000;
  state.settings.exchange = {
    automatic: false,
    rates: { USD: { value: 80 * RATE_SCALE, date: TODAY, source: "manual" } },
  };
  state.transactions = [transaction("old", { baseAmount: 8_000 })];
  const entries = [
    transaction("later", { amount: 300 }),
    transaction("earlier", {
      type: "income",
      amount: 1_000,
      baseAmount: 777,
      date: "2026-09-09",
    }),
  ];
  const original = structuredClone({ state, entries });
  const next = appendTransactions(state, entries, TODAY);
  assert.deepEqual(
    next.transactions.map((entry) => entry.id),
    ["later", "earlier", "old"],
  );
  assert.deepEqual(
    next.transactions.map((entry) => entry.baseAmount),
    [24_000, 777, 8_000],
  );
  assert.equal(accountBalance(next, "card", TODAY), 10_600);
  assert.deepEqual({ state, entries }, original);
});

test("a bad later row or duplicate ID rejects the entire independent batch", () => {
  const state = createInitialState(false, TODAY);
  state.accounts[0].openingBalance = 1_000;
  const before = structuredClone(state);
  for (const invalid of [
    transaction("invalid", { amount: 0 }),
    transaction("valid"),
    transaction("invalid", { date: "2026-09-11" }),
    transaction("invalid", {
      splits: [
        { category: "home", amount: 40 },
        { category: "other", amount: 50 },
      ],
    }),
  ]) {
    assert.throws(() =>
      appendTransactions(state, [transaction("valid"), invalid], TODAY),
    );
    assert.deepEqual(state, before);
  }
});

test("independent batches retain the balance precision limit at intermediate steps", () => {
  const state = createInitialState(false, TODAY);
  state.accounts[0].currency = "USD";
  state.accounts[0].openingBalance = 100_000_000_000;
  state.settings.exchange = {
    automatic: false,
    rates: {
      USD: { value: 45_000 * RATE_SCALE, date: TODAY, source: "manual" },
    },
  };
  const before = structuredClone(state);
  const entries = [
    transaction("large-income", {
      type: "income",
      amount: 1_000_000_000,
      baseAmount: 1,
    }),
    transaction("later-expense", { amount: 1_000_000_000, baseAmount: 1 }),
  ];
  assert.throws(
    () => appendTransactions(state, entries, TODAY),
    /остатков слишком велик/,
  );
  assert.deepEqual(state, before);
});

test("dependent batches validate transfers in date order but retain the supplied display order", () => {
  const state = createInitialState(false, TODAY);
  state.accounts[0].openingBalance = 100;
  const next = appendTransactions(
    state,
    [
      transaction("transfer", {
        type: "transfer",
        amount: 800,
        toAccountId: "savings",
      }),
      transaction("income", {
        type: "income",
        amount: 700,
        date: "2026-09-09",
      }),
    ],
    TODAY,
  );
  assert.deepEqual(
    next.transactions.map((entry) => entry.id),
    ["transfer", "income"],
  );
  assert.equal(accountBalance(next, "card", TODAY), 0);
  assert.equal(accountBalance(next, "savings", TODAY), 800);
  assert.equal(state.transactions.length, 0);
});

test("a later receipt cannot hide an earlier violation of the credit limit", () => {
  const state = createInitialState(false, TODAY);
  state.accounts.push({
    ...state.accounts[0],
    id: "credit",
    kind: "credit",
    openingBalance: -900,
    creditLimit: 1_000,
  });
  const before = structuredClone(state);
  assert.throws(
    () =>
      appendTransactions(
        state,
        [
          transaction("expense", { accountId: "credit", amount: 200 }),
          transaction("income", {
            accountId: "credit",
            type: "income",
            amount: 200,
          }),
        ],
        TODAY,
      ),
    /кредитный лимит/,
  );
  assert.deepEqual(state, before);
});
