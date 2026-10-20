import assert from "node:assert/strict";
import { test } from "node:test";
import { RATE_SCALE } from "../src/domain/currency";
import { createInitialState } from "../src/domain/seed";
import type { Transaction } from "../src/domain/types";
import {
  createTransactionDraft,
  repeatTransaction,
} from "../src/features/transactions/model/transactionDraft";
import { transactionDraftSnapshot } from "../src/features/transactions/model/transactionDraftChanges";

const TODAY = "2026-10-04";
const original: Transaction = {
  id: "purchase",
  accountId: "card",
  date: TODAY,
  amount: 123400,
  category: "groceries",
  title: "Покупка",
  type: "expense",
};

test("formatting, trim, picker metadata and split keys do not make a transaction dirty", () => {
  const state = createInitialState(false, TODAY);
  const purchase = {
    ...original,
    note: "Памятка",
    splits: [{ category: "groceries", amount: 123400 }],
  };
  const draft = createTransactionDraft(state, TODAY, purchase);
  const edited = {
    ...draft,
    title: " Покупка ",
    amount: "1 234,00",
    note: "Памятка ",
    manualCategory: false,
    templateId: "template",
    parts: [{ ...draft.parts[0], key: "different", amount: "1234.00" }],
  };
  assert.equal(
    transactionDraftSnapshot(state, edited, purchase),
    transactionDraftSnapshot(state, draft, purchase),
  );
});

test("incomplete amounts and dates, notes, split edits and repeats are protected without validation or mutation", () => {
  const state = createInitialState(false, TODAY);
  const before = structuredClone(state);
  const draft = createTransactionDraft(state, TODAY, original);
  const initial = transactionDraftSnapshot(state, draft, original);
  for (const edited of [
    { ...draft, amount: "" },
    { ...draft, amount: "1234," },
    { ...draft, date: "04.10." },
    { ...draft, note: "Новая заметка" },
    {
      ...draft,
      splitEnabled: true,
      parts: [{ key: "part", category: "home", amount: "1234" }],
    },
    repeatTransaction(draft, TODAY),
  ])
    assert.notEqual(transactionDraftSnapshot(state, edited, original), initial);
  assert.deepEqual(state, before);
});

test("currency precision and the saved historical valuation are respected when comparing drafts", () => {
  const state = createInitialState(false, TODAY);
  state.accounts[0].currency = "KWD";
  state.accounts[1].currency = "JPY";
  state.settings.exchange = {
    automatic: false,
    rates: {
      KWD: { value: 300 * RATE_SCALE, date: TODAY, source: "manual" },
      JPY: { value: RATE_SCALE, date: TODAY, source: "manual" },
    },
  };
  const purchase = { ...original, amount: 1234, baseAmount: 35000 };
  const draft = createTransactionDraft(state, TODAY, purchase);
  // Explicit entry now records a manual basis: a legacy unknown valuation
  // gains meaningful information even when its amount is unchanged.
  assert.notEqual(
    transactionDraftSnapshot(
      state,
      { ...draft, amount: "1.234", valuation: "350,00" },
      purchase,
    ),
    transactionDraftSnapshot(state, draft, purchase),
  );
  const known = {
    ...purchase,
    valuation: { source: "manual" as const, date: "2026-10-01" },
  };
  const knownDraft = createTransactionDraft(state, TODAY, known);
  assert.equal(
    transactionDraftSnapshot(
      state,
      { ...knownDraft, amount: "1.234", valuation: "350,00" },
      known,
    ),
    transactionDraftSnapshot(state, knownDraft, known),
  );
  assert.notEqual(
    transactionDraftSnapshot(state, { ...draft, amount: "1.235" }, purchase),
    transactionDraftSnapshot(state, draft, purchase),
  );
  const transfer: Transaction = {
    ...original,
    type: "transfer",
    toAccountId: state.accounts[1].id,
    amount: 1234,
    toAmount: 523,
  };
  const exchange = createTransactionDraft(state, TODAY, transfer);
  assert.equal(
    transactionDraftSnapshot(state, { ...exchange, received: "523" }, transfer),
    transactionDraftSnapshot(state, exchange, transfer),
  );
  assert.notEqual(
    transactionDraftSnapshot(
      state,
      { ...exchange, received: "523,1" },
      transfer,
    ),
    transactionDraftSnapshot(state, exchange, transfer),
  );
});
