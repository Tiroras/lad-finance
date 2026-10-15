import {
  dateInMonth,
  daysBetween,
  monthKey,
  shiftDate,
  shiftMonth,
} from "../shared/lib/dates";
import { transactionValue } from "./currency";
import {
  expenseContributions as expenseParts,
  periodTotals,
} from "./transactionAmounts";
import type { FinanceState, Transaction } from "./types";
import { isPosted } from "./transactionStatus";

export interface InsightTransaction {
  transactionId: string;
  title: string;
  date: string;
  amount: number;
}

export interface SpendingChange {
  categoryId: string;
  name: string;
  current: number;
  previous: number;
  difference: number;
  currentTransactions: InsightTransaction[];
  previousTransactions: InsightTransaction[];
}

const normalizeTitle = (value: string) =>
  value
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

function historyStart(state: FinanceState, today: string) {
  let first: string | undefined;
  for (const transaction of state.transactions)
    if (
      isPosted(transaction) &&
      transaction.date <= today &&
      (!first || transaction.date < first)
    )
      first = transaction.date;
  return first;
}

function evidence(
  transaction: Transaction,
  amount: number,
): InsightTransaction {
  return {
    transactionId: transaction.id,
    title: transaction.title,
    date: transaction.date,
    amount,
  };
}

/** Compares the same number of calendar days, including short months. */
export function spendingComparison(
  state: FinanceState,
  month: string,
  today: string,
) {
  const currentStart = `${month}-01`;
  const previousStart = shiftMonth(currentStart, -1);
  const currentLast = dateInMonth(month, 31);
  const previousLast = dateInMonth(previousStart, 31);
  const availableDays =
    currentStart > today
      ? 0
      : Number((currentLast < today ? currentLast : today).slice(-2));
  const days = Math.min(availableDays, Number(previousLast.slice(-2)));
  const currentEnd = days ? dateInMonth(month, days) : currentStart;
  const previousEnd = days ? dateInMonth(previousStart, days) : previousStart;
  const firstDate = historyStart(state, today);
  const hasHistory = !!firstDate && firstDate <= previousStart && days > 0;
  const changes: SpendingChange[] = state.categories
    .filter((category) => !category.parentId)
    .map((category) => ({
      categoryId: category.id,
      name: category.name,
      current: 0,
      previous: 0,
      difference: 0,
      currentTransactions: [],
      previousTransactions: [],
    }));
  const byCategory = new Map(
    changes.map((change) => [change.categoryId, change]),
  );
  const roots = new Map(
    state.categories.map((category) => [
      category.id,
      category.parentId ?? category.id,
    ]),
  );
  if (days)
    for (const transaction of state.transactions) {
      const period =
        transaction.date >= currentStart && transaction.date <= currentEnd
          ? "current"
          : transaction.date >= previousStart && transaction.date <= previousEnd
            ? "previous"
            : undefined;
      if (!period) continue;
      // Several split lines may belong to the same parent: expose the operation once.
      const contributions = new Map<string, number>();
      for (const part of expenseParts(state, transaction)) {
        const root = roots.get(part.category) ?? "other";
        contributions.set(root, (contributions.get(root) ?? 0) + part.amount);
      }
      for (const [categoryId, amount] of contributions) {
        const change = byCategory.get(categoryId);
        if (!change) continue;
        change[period] += amount;
        change[
          period === "current" ? "currentTransactions" : "previousTransactions"
        ].push(evidence(transaction, amount));
      }
    }
  for (const change of changes) {
    change.difference = change.current - change.previous;
    for (const transactions of [
      change.currentTransactions,
      change.previousTransactions,
    ]) {
      transactions.sort(
        (a, b) =>
          Math.abs(b.amount) - Math.abs(a.amount) ||
          b.date.localeCompare(a.date),
      );
    }
  }
  return {
    currentStart,
    currentEnd,
    previousStart,
    previousEnd,
    days,
    firstDate,
    hasHistory,
    current: changes.reduce((sum, change) => sum + change.current, 0),
    previous: changes.reduce((sum, change) => sum + change.previous, 0),
    changes: changes
      .filter(
        (change) =>
          change.currentTransactions.length ||
          change.previousTransactions.length,
      )
      .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference)),
  };
}

/** Empty or partially recorded months are labelled separately from known zero spending. */
export function monthlyOverview(
  state: FinanceState,
  month: string,
  count: 3 | 6 | 12,
  today: string,
) {
  const firstDate = historyStart(state, today);
  return Array.from({ length: count }, (_, index) => {
    const start = shiftMonth(`${month}-01`, index - count + 1);
    const last = dateInMonth(start, 31);
    const end = last < today ? last : today;
    const totals = periodTotals(state, start, end);
    return {
      month: monthKey(start),
      start,
      end,
      ...totals,
      status:
        start > today
          ? ("future" as const)
          : !firstDate || firstDate > end
            ? ("missing" as const)
            : firstDate > start || end < last
              ? ("partial" as const)
              : ("recorded" as const),
    };
  });
}

function belongsToPayment(
  state: FinanceState,
  transaction: Transaction,
): boolean {
  if (transaction.refundOf) {
    const original = state.transactions.find(
      (entry) => entry.id === transaction.refundOf,
    );
    return !!original && belongsToPayment(state, original);
  }
  return (
    !!transaction.recurringId ||
    state.recurring.some(
      (payment) =>
        payment.active &&
        payment.accountId === transaction.accountId &&
        normalizeTitle(payment.name) === normalizeTitle(transaction.title) &&
        Math.abs(payment.amount - transaction.amount) <=
          Math.max(1, Math.round(payment.amount * 0.1)),
    )
  );
}

/** Uses completed days only; filling a forecast draft still requires explicit confirmation. */
export function dailySpendingEstimate(state: FinanceState, today: string) {
  const firstDate = historyStart(state, shiftDate(today, -1));
  const end = shiftDate(today, -1);
  const start =
    firstDate && firstDate > shiftDate(today, -30)
      ? firstDate
      : shiftDate(today, -30);
  const days = firstDate ? Math.max(0, daysBetween(start, end) + 1) : 0;
  const spendingAccounts = new Set(
    state.accounts
      .filter(
        (account) => account.kind === "spending" || account.kind === "credit",
      )
      .map((account) => account.id),
  );
  const candidates = state.transactions.filter(
    (transaction) =>
      transaction.date >= start &&
      transaction.date <= end &&
      spendingAccounts.has(transaction.accountId) &&
      expenseParts(state, transaction).length > 0,
  );
  const expenses = candidates.filter(
    (transaction) => !belongsToPayment(state, transaction),
  );
  const expenseDays = new Set(
    expenses
      .filter((transaction) => transaction.type === "expense")
      .map((transaction) => transaction.date),
  ).size;
  const total = expenses.reduce(
    (sum, transaction) =>
      sum +
      expenseParts(state, transaction).reduce(
        (value, part) => value + part.amount,
        0,
      ),
    0,
  );
  const ready =
    days >= 14 &&
    expenses.filter((transaction) => transaction.type === "expense").length >=
      5 &&
    expenseDays >= 3 &&
    total > 0;
  return {
    start,
    end,
    days,
    total,
    ready,
    daily: ready ? Math.round(total / days) : null,
    count: expenses.length,
    expenseDays,
    excludedPayments: candidates.length - expenses.length,
  };
}

export interface RecurringSuggestion {
  transactionId: string;
  title: string;
  accountId: string;
  amount: number;
  transactions: InsightTransaction[];
}

/** A suggestion needs three consecutive months, one similar payment per month. */
export function recurringSuggestions(
  state: FinanceState,
  today: string,
): RecurringSuggestion[] {
  const start = shiftMonth(today, -3);
  // A refund excludes its purchase even when the refund is outside this window.
  const refundedTransactions = new Set(
    state.transactions.flatMap((transaction) =>
      isPosted(transaction) && transaction.refundOf
        ? [transaction.refundOf]
        : [],
    ),
  );
  const spendingAccounts = new Set(
    state.accounts
      .filter((account) => account.kind === "spending")
      .map((account) => account.id),
  );
  const paymentKey = (accountId: string, title: string) =>
    JSON.stringify([accountId, normalizeTitle(title)]);
  const activePayments = new Set(
    state.recurring
      .filter((payment) => payment.active)
      .map((payment) => paymentKey(payment.accountId, payment.name)),
  );
  const groups = new Map<string, Transaction[]>();
  for (const transaction of state.transactions) {
    if (
      transaction.type !== "expense" ||
      !isPosted(transaction) ||
      !!transaction.debtId ||
      refundedTransactions.has(transaction.id) ||
      transaction.date < start ||
      transaction.date > today ||
      !spendingAccounts.has(transaction.accountId) ||
      (transaction.refundOf
        ? belongsToPayment(state, transaction)
        : !!transaction.recurringId)
    )
      continue;
    const title = normalizeTitle(transaction.title);
    if (!title) continue;
    const key = JSON.stringify([transaction.accountId, title]);
    // An existing plan suppresses the whole suggestion, regardless of its amount.
    if (activePayments.has(key)) continue;
    const group = groups.get(key);
    if (group) group.push(transaction);
    else groups.set(key, [transaction]);
  }
  const suggestions: RecurringSuggestion[] = [];
  for (const transactions of groups.values()) {
    transactions.sort((a, b) => a.date.localeCompare(b.date));
    // Multiple visits to the same shop in one month are not a subscription signal.
    if (
      transactions.length < 3 ||
      new Set(transactions.map((transaction) => monthKey(transaction.date)))
        .size !== transactions.length
    )
      continue;
    const recent = transactions.slice(-3);
    const latest = recent[2];
    if (daysBetween(latest.date, today) > 45) continue;
    if (
      !recent.slice(1).every((transaction, index) => {
        const previous = recent[index];
        const gap = daysBetween(previous.date, transaction.date);
        return (
          monthKey(shiftMonth(previous.date, 1)) ===
            monthKey(transaction.date) &&
          gap >= 20 &&
          gap <= 40 &&
          Math.abs(
            Number(previous.date.slice(-2)) -
              Number(transaction.date.slice(-2)),
          ) <= 5
        );
      })
    )
      continue;
    const amounts = recent
      .map((transaction) => transaction.amount)
      .sort((a, b) => a - b);
    if (amounts[2] - amounts[0] > Math.max(1, Math.round(amounts[1] * 0.1)))
      continue;
    suggestions.push({
      transactionId: latest.id,
      title: latest.title,
      accountId: latest.accountId,
      amount: latest.amount,
      transactions: recent.map((transaction) =>
        evidence(transaction, transactionValue(state, transaction)),
      ),
    });
  }
  return suggestions
    .sort((a, b) =>
      b.transactions.at(-1)!.date.localeCompare(a.transactions.at(-1)!.date),
    )
    .slice(0, 5);
}
