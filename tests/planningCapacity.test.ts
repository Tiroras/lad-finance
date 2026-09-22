import assert from "node:assert/strict";
import { test } from "node:test";
import { createInitialState } from "../src/domain/seed";
import { MAX_MONEY } from "../src/domain/currency";
import { decodeBackup, encodeBackup } from "../src/domain/backup";
import {
  overduePayments,
  validatePaymentCapacity,
} from "../src/domain/payments";
import { checkCurrencyAmounts } from "../src/domain/actions/validation";
import {
  saveRecurring,
  setRecurringActive,
  setPaymentSkipped,
} from "../src/domain/actions/recurring";
import { saveBudgetPlan } from "../src/domain/actions/budgets";
import { validateBudgetCapacity } from "../src/domain/budgets";
import { shiftDate } from "../src/shared/lib/dates";
import type { Recurring } from "../src/domain/types";

const TODAY = "2026-09-10";
function daily(id: string, anchor = TODAY): Recurring {
  return {
    id,
    name: id,
    amount: MAX_MONEY,
    day: 10,
    kind: "bill",
    active: true,
    category: "other",
    icon: "home-outline",
    color: "#EEEEEE",
    accountId: "card",
    startsOn: anchor,
    schedule: { unit: "day", interval: 1, anchor },
  };
}

test("millions of imported overdue dates are rejected before rendering and without changing the snapshot", () => {
  const state = createInitialState(false, TODAY);
  state.recurring = Array.from({ length: 200 }, (_, index) =>
    daily(`p${index}`, "2000-01-01"),
  );
  const snapshot = encodeBackup(state);
  assert.throws(() => decodeBackup(snapshot), /20 000/);
  assert.throws(() => checkCurrencyAmounts(state, TODAY), /20 000/);
  assert.throws(() => overduePayments(state, TODAY), /20 000/);
  assert.equal(encodeBackup(state), snapshot);
});

test("new or re-enabled daily plans cannot overflow the complete year calendar", () => {
  const state = createInitialState(false, TODAY);
  state.recurring = Array.from({ length: 54 }, (_, index) =>
    daily(`p${index}`),
  );
  validatePaymentCapacity(state, TODAY);
  const { id: _id, ...newPlan } = daily("new");
  assert.throws(() => saveRecurring(state, newPlan, TODAY), /20 000/);
  const disabled = {
    ...state,
    recurring: [...state.recurring, { ...daily("off"), active: false }],
  };
  assert.throws(
    () => setRecurringActive(disabled, "off", true, TODAY),
    /20 000/,
  );
  assert.equal(disabled.recurring.at(-1)?.active, false);
  assert.equal(state.recurring.length, 54);
});

test("restoring a skipped past date is validated at the exact global boundary", () => {
  const state = createInitialState(false, TODAY);
  state.recurring = Array.from({ length: 53 }, (_, index) =>
    daily(`p${index}`),
  );
  const anchor = shiftDate(TODAY, -291);
  state.recurring.push({ ...daily("older", anchor), skippedDates: [anchor] });
  validatePaymentCapacity(state, TODAY); // 53×365 + 290 pending past + 365 future = 20,000.
  assert.throws(
    () => setPaymentSkipped(state, "older", anchor, false, TODAY),
    /20 000/,
  );
  assert.deepEqual(state.recurring.at(-1)?.skippedDates, [anchor]);
});

test("paid and skipped historical dates do not consume the unpaid capacity", () => {
  const state = createInitialState(false, TODAY);
  state.recurring = [daily("history", "2000-01-01")];
  state.recurring[0].skippedDates = Array.from({ length: 3_000 }, (_, index) =>
    shiftDate("2000-01-01", index),
  );
  validatePaymentCapacity(state, TODAY);
  const history = overduePayments(state, TODAY);
  assert.ok(history.every((entry) => !entry.skipped && !entry.paid));
  assert.equal(history[0].date, shiftDate("2000-01-01", 3_000));
});

function manyCategories() {
  const state = createInitialState(false, TODAY);
  const category = state.categories[0];
  state.categories = Array.from({ length: 200 }, (_, index) => ({
    ...category,
    id: index === 0 ? "other" : `c${index}`,
    name: `Категория ${index}`,
    budget: 0,
  }));
  return state;
}
test("safe individual carries cannot combine into an unsafe imported budget total", () => {
  const state = manyCategories();
  state.budgetPlans = state.categories.map((category) => ({
    categoryId: category.id,
    period: "weekly",
    startDay: 1,
    anchor: "2000-01-01",
    rolloverSurplus: true,
    rolloverDeficit: false,
    changes: [{ from: "2000-01-01", amount: MAX_MONEY }],
    overrides: [],
  }));
  assert.throws(() => validateBudgetCapacity(state), /Совокупные лимиты/);
  assert.throws(() => decodeBackup(encodeBackup(state)), /Совокупные лимиты/);
});
test("an action rejects a future aggregate overflow while retaining the last safe budget", () => {
  let state = manyCategories(),
    rejected = false;
  for (const category of state.categories) {
    const snapshot = encodeBackup(state);
    try {
      state = saveBudgetPlan(
        state,
        {
          categoryId: category.id,
          period: "weekly",
          startDay: 1,
          anchor: TODAY,
          rolloverSurplus: true,
          rolloverDeficit: false,
          date: TODAY,
          amount: MAX_MONEY,
          onlyThisPeriod: false,
        },
        TODAY,
      );
    } catch (error) {
      assert.match(String(error), /Совокупные лимиты/);
      assert.equal(encodeBackup(state), snapshot);
      rejected = true;
      break;
    }
  }
  assert.equal(rejected, true);
  validateBudgetCapacity(state);
  assert.ok(state.budgetPlans!.length > 0);
});
