import assert from "node:assert/strict";
import { test } from "node:test";
import { reconcileAccount } from "../src/domain/actions/reconciliation";
import { saveTransaction } from "../src/domain/actions/transactions";
import { accountBalance } from "../src/domain/accountBalances";
import { decodeBackup, encodeBackup } from "../src/domain/backup";
import {
  accountSignature,
  reconciliationCurrent,
} from "../src/domain/reconciliation";
import { createInitialState } from "../src/domain/seed";
import { totals } from "../src/domain/finance";
import type { FinanceState } from "../src/domain/types";

const TODAY = "2026-09-10";
function initial() {
  const state = createInitialState(false, TODAY);
  state.accounts[0].openingBalance = 1000000;
  return state;
}
function reconcile(
  state: FinanceState,
  balance: number,
  date = TODAY,
  adjust = true,
) {
  return reconcileAccount(
    state,
    {
      accountId: "card",
      date,
      balance,
      note: "Проверен остаток в банке",
      adjust,
      expectedSignature: accountSignature(state, "card", date),
    },
    TODAY,
  );
}

test("reconciliation records a dated correction without inventing expense/income and roundtrips", () => {
  const state = initial();
  const before = encodeBackup(state);
  const next = reconcile(state, 987655);
  assert.equal(encodeBackup(state), before);
  assert.equal(
    next.accounts[0].openingBalance,
    state.accounts[0].openingBalance,
  );
  assert.equal(next.transactions.length, 0);
  assert.equal(next.balanceAdjustments?.[0].amount, -12345);
  assert.equal(accountBalance(next, "card", "2026-09-09"), 1000000);
  assert.equal(accountBalance(next, "card", TODAY), 987655);
  assert.deepEqual(totals(next, "2026-09"), { income: 0, expense: 0 });
  assert.equal(reconciliationCurrent(next, next.reconciliations![0]), true);
  const restored = decodeBackup(encodeBackup(next));
  assert.deepEqual(restored.balanceAdjustments, next.balanceAdjustments);
  assert.equal(
    reconciliationCurrent(restored, restored.reconciliations![0]),
    true,
  );
  const confirmed = reconcile(next, 987655);
  assert.equal(confirmed.balanceAdjustments!.length, 1);
  assert.equal(confirmed.reconciliations!.length, 2);
});

test("monetary edits invalidate a reconciliation; notes and later operations preserve it; stale commits fail", () => {
  const original = saveTransaction(
    initial(),
    {
      type: "expense",
      title: "Магазин",
      amount: 10000,
      date: "2026-09-08",
      category: "groceries",
      accountId: "card",
    },
    TODAY,
  );
  const signature = accountSignature(original, "card", "2026-09-08");
  const state = reconcile(original, 990000, "2026-09-08", false);
  const item = state.reconciliations![0];
  const renamed = saveTransaction(
    state,
    { ...state.transactions[0], note: "Уточнено название", title: "Продукты" },
    TODAY,
  );
  assert.equal(reconciliationCurrent(renamed, item), true);
  const later = saveTransaction(
    state,
    {
      type: "income",
      title: "Премия",
      amount: 5000,
      date: TODAY,
      category: "other",
      accountId: "card",
    },
    TODAY,
  );
  assert.equal(reconciliationCurrent(later, item), true);
  const changed = saveTransaction(
    state,
    { ...state.transactions[0], amount: 12000 },
    TODAY,
  );
  assert.equal(reconciliationCurrent(changed, item), false);
  assert.throws(
    () =>
      reconcileAccount(
        changed,
        {
          accountId: "card",
          date: "2026-09-08",
          balance: 990000,
          note: "Повтор",
          adjust: true,
          expectedSignature: signature,
        },
        TODAY,
      ),
    /изменились/,
  );
  const refreshed = reconcile(changed, 988000, "2026-09-08", false);
  assert.equal(
    reconciliationCurrent(refreshed, refreshed.reconciliations!.at(-1)!),
    true,
  );
  assert.equal(reconciliationCurrent(refreshed, item), false);
});

test("corrections require explicit confirmation and explanation and respect savings/credit constraints", () => {
  const state = initial();
  assert.throws(
    () => reconcile(state, 900000, TODAY, false),
    /подтвердите корректировку/,
  );
  assert.throws(
    () =>
      reconcileAccount(
        state,
        {
          accountId: "card",
          date: TODAY,
          balance: 900000,
          note: " ",
          adjust: true,
          expectedSignature: accountSignature(state, "card", TODAY),
        },
        TODAY,
      ),
    /причину/,
  );
  assert.throws(() => reconcile(state, 900000, "2026-09-11"), /дату/);
  assert.throws(
    () =>
      reconcileAccount(
        state,
        {
          accountId: "missing",
          date: TODAY,
          balance: 0,
          note: "",
          adjust: false,
          expectedSignature: "",
        },
        TODAY,
      ),
    /удалён/,
  );
  state.accounts.find((account) => account.id === "savings")!.openingBalance =
    100000;
  state.goals = [
    {
      id: "goal",
      name: "Резерв",
      target: 200000,
      initialSaved: 100000,
      monthly: 0,
      icon: "wallet-outline",
      color: "#234B3C",
    },
  ];
  assert.throws(
    () =>
      reconcileAccount(
        state,
        {
          accountId: "savings",
          date: TODAY,
          balance: 50000,
          note: "Банк",
          adjust: true,
          expectedSignature: accountSignature(state, "savings", TODAY),
        },
        TODAY,
      ),
    /распределены/,
  );
  state.accounts.push({
    ...state.accounts[0],
    id: "credit",
    kind: "credit",
    openingBalance: -20000,
    creditLimit: 100000,
  });
  assert.throws(
    () =>
      reconcileAccount(
        state,
        {
          accountId: "credit",
          date: TODAY,
          balance: -100001,
          note: "Долг по банку",
          adjust: true,
          expectedSignature: accountSignature(state, "credit", TODAY),
        },
        TODAY,
      ),
    /кредитный лимит/,
  );
  assert.equal(state.balanceAdjustments, undefined);
});

test("backup rejects duplicate, future and orphaned reconciliation records", () => {
  const state = reconcile(initial(), 900000);
  for (const mutation of [
    (copy: FinanceState) => {
      copy.balanceAdjustments![0].accountId = "missing";
    },
    (copy: FinanceState) => {
      copy.reconciliations!.push({ ...copy.reconciliations![0] });
    },
    (copy: FinanceState) => {
      copy.balanceAdjustments![0].date = "2100-01-01";
    },
    (copy: FinanceState) => {
      copy.reconciliations![0].signature = "broken";
    },
    (copy: FinanceState) => {
      copy.reconciliations![0].balance += 1;
    },
  ]) {
    const copy = structuredClone(state);
    mutation(copy);
    assert.throws(() => decodeBackup(encodeBackup(copy)));
  }
});
