import assert from "node:assert/strict";
import { accountBalances } from "../../src/domain/accountBalances";
import { forecast } from "../../src/domain/forecast";
import {
  periodTotals,
  expenseContributions,
} from "../../src/domain/transactionAmounts";
import { selectTransactionList } from "../../src/domain/transactionList";
import { debtBalance } from "../../src/domain/debts";
import { exportTransactionsCsv } from "../../src/domain/csvExport";
import { parseCsv } from "../../src/domain/csv";
import type { RecurrenceSchedule } from "../../src/domain/recurrence";
import { FIXTURE_TODAY, type PerformanceFixture } from "./fixtures";

const calendar = (date: string) => Date.parse(`${date}T12:00:00Z`);
const dayString = (time: number) => {
  const date = new Date(time);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
};
const plusDays = (date: string, days: number) =>
  dayString(calendar(date) + days * 86400000);

// Independent, small brute-force calendar oracle: no app recurrence/forecast helpers.
function occurs(schedule: RecurrenceSchedule, date: string) {
  if (date < schedule.anchor) return false;
  if (schedule.unit === "day" || schedule.unit === "week")
    return (
      ((calendar(date) - calendar(schedule.anchor)) / 86400000) %
        (schedule.interval * (schedule.unit === "week" ? 7 : 1)) ===
      0
    );
  const anchor = new Date(calendar(schedule.anchor));
  const candidate = new Date(calendar(date));
  const distance =
    (candidate.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
    candidate.getUTCMonth() -
    anchor.getUTCMonth();
  const interval = schedule.interval * (schedule.unit === "year" ? 12 : 1);
  const lastDay = new Date(
    Date.UTC(candidate.getUTCFullYear(), candidate.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return (
    distance % interval === 0 &&
    candidate.getUTCDate() === Math.min(anchor.getUTCDate(), lastDay)
  );
}

export function expectedForecast(fixture: PerformanceFixture) {
  const { state, expected } = fixture;
  const opening =
    expected.balances.r +
    expected.balances.u * 90 +
    expected.balances.j * 60 +
    expected.balances.k * 30;
  let balance = opening,
    income = 0,
    outflow = 0;
  const days: { date: string; balance: number }[] = [];
  for (let offset = 0; offset < 90; offset++) {
    const date = plusDays(FIXTURE_TODAY, offset);
    let incoming = 0,
      outgoing = offset ? 1234 : 0;
    for (const plan of state.plannedIncomes ?? [])
      if (occurs(plan.schedule!, date)) incoming += plan.amount;
    for (const payment of state.recurring) {
      const candidates =
        offset === 0
          ? Array.from({ length: 6 }, (_, i) => plusDays("2026-10-01", i))
          : [date];
      for (const due of candidates)
        if (
          due >= payment.startsOn! &&
          occurs(payment.schedule!, due) &&
          !payment.skippedDates?.includes(due)
        )
          outgoing +=
            payment.amountHistory?.find((rule) => due <= rule.until)?.amount ??
            payment.amount;
    }
    if (date === "2026-10-20") outgoing += expected.debt;
    if (["2026-10-31", "2026-11-30", "2026-12-31"].includes(date))
      outgoing += 100000;
    balance += incoming - outgoing;
    income += incoming;
    outflow += outgoing;
    days.push({ date, balance });
  }
  return { opening, closing: balance, income, outflow, days };
}

export function verifyPerformanceFixture(fixture: PerformanceFixture) {
  const { state, expected } = fixture;
  assert.deepEqual(
    Object.fromEntries(accountBalances(state, FIXTURE_TODAY)),
    expected.balances,
  );
  assert.deepEqual(periodTotals(state, "2000-01-01", FIXTURE_TODAY), {
    income: expected.income,
    expense: expected.expense,
    count: expected.count,
  });
  assert.equal(
    debtBalance(state, state.debts![0], FIXTURE_TODAY),
    expected.debt,
  );
  const categories: Record<string, number> = {};
  for (const transaction of state.transactions)
    for (const part of expenseContributions(state, transaction))
      categories[part.category] =
        (categories[part.category] ?? 0) + part.amount;
  assert.deepEqual(categories, expected.category);
  const selected = selectTransactionList(
    state,
    {
      month: "2026-10",
      period: "all",
      query: "Поиск чай",
      type: "all",
      account: "all",
      category: "all",
    },
    FIXTURE_TODAY,
  );
  assert.equal(selected.transactions.length, expected.searchCount);
  assert.equal(selected.expense, expected.searchExpense);
  assert.equal(selected.income, 0);
  const predicted = forecast(state, 90, FIXTURE_TODAY);
  const reference = expectedForecast(fixture);
  assert.equal(predicted.openingBalance, reference.opening);
  assert.equal(predicted.closingBalance, reference.closing);
  assert.equal(predicted.income, reference.income);
  assert.equal(predicted.outflow, reference.outflow);
  assert.deepEqual(
    predicted.days.map(({ date, balance }) => ({ date, balance })),
    reference.days,
  );
  return reference;
}

/** CSV is intentionally flat: reconcile all currency columns, including both transfer sides. */
export function verifyCsvFixture(fixture: PerformanceFixture) {
  const totals: Record<string, number> = { RUB: 0, USD: 0, JPY: 0, KWD: 0 };
  let receivedUsd = 0,
    rowCount = 0;
  const minor = (value: string, currency: string) => {
    const digits = currency === "JPY" ? 0 : currency === "KWD" ? 3 : 2;
    const negative = value.startsWith("-");
    const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
    return (
      (Number(whole) * 10 ** digits + Number(fraction.padEnd(digits, "0"))) *
      (negative ? -1 : 1)
    );
  };
  // Complete ten-operation blocks retain each refund's purchase; each chunk fits the real CSV parser.
  for (let offset = 0; offset < fixture.count; offset += 1000) {
    const chunk = {
      ...fixture.state,
      transactions: fixture.state.transactions.slice(offset, offset + 1000),
    };
    const exported = exportTransactionsCsv(
      chunk,
      { format: "universal" },
      FIXTURE_TODAY,
    );
    for (const row of parseCsv(exported.content).rows) {
      totals[row[3]] += minor(row[2], row[3]);
      if (row[1] === "transfer") {
        assert.equal(row[11], "RUB");
        assert.equal(row[13], "USD");
        assert.equal(minor(row[10], "RUB"), -minor(row[2], "RUB"));
        receivedUsd += minor(row[12], "USD");
      }
      rowCount++;
    }
  }
  assert.deepEqual(totals, {
    RUB: -82 * fixture.sumUnits,
    USD: -fixture.sumUnits,
    JPY: -fixture.sumUnits,
    KWD: fixture.sumUnits,
  });
  assert.equal(receivedUsd, fixture.sumUnits);
  assert.equal(rowCount, fixture.count * 1.2);
  return { totals, receivedUsd, rowCount };
}
