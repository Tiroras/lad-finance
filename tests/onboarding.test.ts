import assert from "node:assert/strict";
import { test } from "node:test";
import {
  acceptDemo,
  completeOnboarding,
  type OnboardingInput,
} from "../src/domain/actions/onboarding";
import { accountBalance } from "../src/domain/accountBalances";
import { decodeBackup, encodeBackup } from "../src/domain/backup";
import { RATE_SCALE } from "../src/domain/currency";
import { createInitialState } from "../src/domain/seed";

const TODAY = "2026-09-10";
const input: OnboardingInput = {
  name: "Тест",
  accountName: "Моя карта",
  currency: "RUB",
  balance: 1000000,
  savings: 200000,
  buffer: 100000,
  incomeName: "Зарплата",
  incomeAmount: 500000,
  incomeDate: "2026-09-15",
  billName: "Жильё",
  billAmount: 250000,
  billDate: "2026-09-18",
};

test("onboarding atomically replaces demo with actual balances and future plans, never booked income", () => {
  const demo = createInitialState(true, TODAY);
  const before = encodeBackup(demo);
  const state = completeOnboarding(demo, input, TODAY);
  assert.equal(encodeBackup(demo), before);
  assert.equal(state.demo, false);
  assert.equal(state.settings.onboardingCompleted, true);
  assert.equal(state.settings.name, "Тест");
  assert.equal(state.settings.buffer, 100000);
  assert.equal(state.settings.payday, 15);
  assert.equal(
    state.accounts.find((account) => account.id === "card")?.name,
    "Моя карта",
  );
  assert.equal(accountBalance(state, "card", TODAY), 1000000);
  assert.equal(accountBalance(state, "savings", TODAY), 200000);
  assert.deepEqual(state.transactions, []);
  assert.deepEqual(state.goals, []);
  assert.equal(state.plannedIncomes?.[0].date, input.incomeDate);
  assert.equal(state.recurring[0].startsOn, input.billDate);
  assert.equal(state.recurring[0].amount, input.billAmount);
  assert.deepEqual(
    decodeBackup(encodeBackup(state)),
    JSON.parse(encodeBackup(state)),
  );
  assert.throws(() => completeOnboarding(state, input, TODAY), /уже начат/);
});

test("zero-valued optional plans can be skipped, demo choice preserves records, custom currency preserves minor units", () => {
  const demo = createInitialState(true, TODAY);
  const accepted = acceptDemo(demo);
  assert.equal(accepted.demo, true);
  assert.equal(accepted.settings.onboardingCompleted, true);
  assert.deepEqual(accepted.transactions, demo.transactions);
  assert.equal(demo.settings.onboardingCompleted, undefined);
  demo.settings.exchange = {
    automatic: false,
    rates: { JPY: { value: RATE_SCALE, source: "manual", date: TODAY } },
  };
  const state = completeOnboarding(
    demo,
    {
      ...input,
      currency: "JPY",
      balance: 12345,
      savings: 500,
      buffer: 10,
      incomeAmount: 0,
      billAmount: 0,
      incomeDate: "",
      billDate: "",
    },
    TODAY,
  );
  assert.equal(state.settings.baseCurrency, "JPY");
  assert.ok(state.accounts.every((account) => account.currency === "JPY"));
  assert.equal(accountBalance(state, "card", TODAY), 12345);
  assert.equal(state.recurring.length, 0);
  assert.equal(state.plannedIncomes?.length ?? 0, 0);
  assert.deepEqual(state.settings.exchange, demo.settings.exchange);
});

test("invalid onboarding fails without replacing any demo data", () => {
  const demo = createInitialState(true, TODAY);
  const before = encodeBackup(demo);
  for (const patch of [
    { balance: -1 },
    { savings: NaN },
    { accountName: " " },
    { incomeDate: "2026-09-09" },
    { billDate: "2026-02-30" },
    { name: "a".repeat(41) },
    { incomeName: "" },
    { currency: "USD" as const },
  ])
    assert.throws(() =>
      completeOnboarding(demo, { ...input, ...patch }, TODAY),
    );
  assert.equal(encodeBackup(demo), before);
});
