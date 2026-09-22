import { accountBalance, accountBalances } from "./accountBalances";
import { goalReserve, goalSaved } from "./goals";
import { overduePayments, upcoming, paymentOccurrenceKey } from "./payments";
import { forecast, type ForecastHorizon } from "./forecast";
import { incomeOccurrences, incomeOccurrenceKey } from "./incomes";
import { debtObligations } from "./debts";
import { isScheduledDate } from "./recurrence";
import {
  expenseContributions,
  periodTotals,
  transactionAmountsError,
} from "./transactionAmounts";
export { accountBalance } from "./accountBalances";
export { goalReserve, goalSaved } from "./goals";
export {
  upcoming,
  paymentForMonth,
  changedPaymentHistory,
  overduePayments,
} from "./payments";
import {
  localDate,
  monthKey,
  shiftDate,
  shiftMonth,
  daysBetween,
  validDate,
  dateInMonth,
} from "../shared/lib/dates";
export {
  localDate,
  fromDate,
  monthKey,
  shiftDate,
  shiftMonth,
  daysBetween,
  validDate,
  dateInMonth,
  dateLabel,
} from "../shared/lib/dates";
import {
  accountCurrency,
  accountToBase,
  MAX_MONEY,
  parseMoney,
  receivedAmount,
  type CurrencyCode,
} from "./currency";
import type { CategoryId, FinanceState, Transaction } from "./types";
export { MAX_MONEY, money, moneyInput, parseMoney } from "./currency";

export const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
export function nextPayday(day: number, today = localDate()) {
  const thisMonth = dateInMonth(today, day);
  return thisMonth > today ? thisMonth : dateInMonth(shiftMonth(today, 1), day);
}
export function totals(
  state: FinanceState,
  month?: string,
  today = localDate(),
) {
  const selectedMonth = month ?? monthKey(today);
  const last = dateInMonth(selectedMonth, 31);
  const { income, expense } = periodTotals(
    state,
    `${selectedMonth}-01`,
    last < today ? last : today,
  );
  return { income, expense };
}

export function categorySpending(
  state: FinanceState,
  month = monthKey(),
  today = localDate(),
) {
  const rootIds = new Map(
    state.categories.map((c) => [c.id, c.parentId ?? c.id]),
  );
  const spent = new Map<string, number>();
  for (const t of state.transactions) {
    if (monthKey(t.date) !== month || t.date > today) continue;
    for (const part of expenseContributions(state, t)) {
      const root = rootIds.get(part.category)!;
      spent.set(root, (spent.get(root) ?? 0) + part.amount);
    }
  }
  return state.categories
    .filter((c) => !c.parentId)
    .map((category) => ({
      ...category,
      budget: category.archived ? 0 : category.budget,
      spent: spent.get(category.id) ?? 0,
    }));
}

export function spendable(state: FinanceState, today = localDate()) {
  // Use the same occurrence identities as the forecast, including early receipts.
  // An income beyond 90 days is not a dependable boundary for a daily allowance.
  const income = incomeOccurrences(state, today, shiftDate(today, 90)).find(
    ({ plan }) =>
      !state.settings.spendableIncomeId ||
      plan.id === state.settings.spendableIncomeId,
  );
  const payday = income?.date ?? nextPayday(state.settings.payday, today);
  const days = Math.max(1, daysBetween(today, payday));
  const paymentEnd = payday === today ? shiftDate(today, 1) : payday;
  const balances = accountBalances(state, today);
  const liquid = state.accounts
    .filter((a) => a.kind === "spending")
    .reduce(
      (sum, a) => sum + accountToBase(state, balances.get(a.id) ?? 0, a.id),
      0,
    );
  const overdue = overduePayments(state, today).reduce(
    (sum, o) =>
      sum + accountToBase(state, o.payment.amount, o.payment.accountId),
    0,
  );
  const payments =
    overdue +
    upcoming(state, today, paymentEnd)
      .filter((o) => !o.paid && !o.skipped)
      .reduce(
        (sum, o) =>
          sum + accountToBase(state, o.payment.amount, o.payment.accountId),
        0,
      );
  const goals = goalReserve(state, today);
  const debts = debtObligations(state, today, shiftDate(paymentEnd, -1)).reduce(
    (sum, item) => sum + accountToBase(state, item.amount, item.accountId),
    0,
  );
  const beforeProtection =
    liquid - payments - debts - goals - state.settings.buffer;
  const protection = income
    ? spendableProtection(state, today, payday, days)
    : undefined;
  // Both calculations already account for bills, goals and the buffer. Compare
  // their limits rather than subtracting the forecast's obligations a second time.
  const raw = Math.min(beforeProtection, protection?.limit ?? beforeProtection);
  return {
    liquid,
    payments,
    debts,
    overdue,
    goals,
    buffer: state.settings.buffer,
    raw,
    available: Math.max(0, raw),
    daily: Math.floor(Math.max(0, raw) / days),
    days,
    payday,
    income,
    selectedIncomeUnavailable: Boolean(
      state.settings.spendableIncomeId && !income,
    ),
    beforeProtection,
    protectedAmount: beforeProtection - raw,
    protection,
  };
}

function spendableProtection(
  state: FinanceState,
  today: string,
  payday: string,
  days: number,
) {
  const horizon: ForecastHorizon = days < 30 ? 30 : days < 60 ? 60 : 90;
  const dailySpending = state.settings.forecast?.dailySpending ?? 0;
  const withoutDailySpending = forecast(
    {
      ...state,
      settings: {
        ...state.settings,
        forecast: {
          goalDay: state.settings.forecast?.goalDay ?? 31,
          dailySpending: 0,
        },
      },
    },
    horizon,
    today,
  );
  // The allowance funds everyday spending before the chosen income. Reserving
  // that spending here too would double-count it. From the income date onward,
  // retain the user's forecast assumption; today's actual spending is in balance.
  const dailyStart = payday === today ? shiftDate(today, 1) : payday;
  const checked = withoutDailySpending.days.map((day) => ({
    date: day.date,
    available:
      day.balance -
      state.settings.buffer -
      Math.max(0, daysBetween(dailyStart, day.date) + 1) * dailySpending,
  }));
  const minimum = checked.reduce((min, day) =>
    day.available < min.available ? day : min,
  );
  return {
    horizon,
    end: checked[checked.length - 1].date,
    limit: minimum.available,
    date: minimum.date,
    dailySpending,
    dailyStart,
  };
}

export function simulatePurchase(
  state: FinanceState,
  amount: number,
  today = localDate(),
) {
  const base = spendable(state, today);
  const after = base.raw - amount;
  return {
    ...base,
    after,
    dailyAfter: Math.floor(Math.max(0, after) / base.days),
    shortfall: Math.max(0, -after),
    affordable: after >= 0,
  };
}

const KEYWORDS: [CategoryId, RegExp][] = [
  [
    "groceries",
    /продукт|магазин|пятёр|пятер|перекрё|перекре|вкусвилл|магнит|хлеб|молоко/iu,
  ],
  ["cafe", /кофе|кафе|ресторан|обед|ужин|завтрак|пицц|бургер|доставк/iu],
  ["transport", /такси|метро|бензин|транспорт|автобус|парковк|проезд/iu],
  ["health", /аптек|врач|здоров|лекарств|стоматолог/iu],
  ["home", /квартир|аренд|коммун|интернет|дом/iu],
  ["fun", /кино|музык|подписк|концерт|театр/iu],
  ["shopping", /одежд|обув|кроссовк|покуп|озон|ozon|wildberries/iu],
];
export const suggestCategory = (title: string): CategoryId =>
  KEYWORDS.find(([, pattern]) => pattern.test(title))?.[0] ?? "other";
export function parseQuickEntry(
  input: string,
  currency: CurrencyCode = "RUB",
): {
  amount: number;
  title: string;
  category: CategoryId;
  type: "expense" | "income";
} | null {
  const matches = [
    ...input.matchAll(/\d+(?:[ \u00a0]\d{3})*(?:[.,]\d{1,3})?/g),
  ];
  if (matches.length !== 1 || /[-−]\s*\d/.test(input)) return null;
  const match = matches[0];
  const amount = parseMoney(match[0], currency);
  if (!amount) return null;
  const title =
    `${input.slice(0, match.index)} ${input.slice((match.index ?? 0) + match[0].length)}`
      .replace(/₽|руб(?:лей|ля|ль)?\.?/giu, "")
      .replace(/\s+/g, " ")
      .trim();
  if (!title) return null;
  return {
    amount,
    title: title[0].toLocaleUpperCase("ru-RU") + title.slice(1),
    category: suggestCategory(title),
    type: /зарплат|доход|аванс|премия/iu.test(title) ? "income" : "expense",
  };
}

export function validateTransaction(
  state: FinanceState,
  transaction: Transaction,
  today = localDate(),
): string | null {
  if (!["expense", "income", "transfer"].includes(transaction.type))
    return "Неизвестный тип операции.";
  if (!transaction.title.trim() || transaction.title.length > 120)
    return "Укажите название до 120 символов.";
  if (
    !Number.isSafeInteger(transaction.amount) ||
    transaction.amount <= 0 ||
    transaction.amount > MAX_MONEY
  )
    return "Введите положительную сумму в пределах допустимого лимита.";
  if (!validDate(transaction.date) || transaction.date > today)
    return "Укажите корректную дату, не позднее сегодняшней.";
  if (!state.accounts.some((a) => a.id === transaction.accountId))
    return "Выберите счёт.";
  if (!state.categories.some((c) => c.id === transaction.category))
    return "Выберите категорию.";
  const amountsError = transactionAmountsError(state, transaction);
  if (amountsError) return amountsError;
  if ((transaction.note?.length ?? 0) > 500)
    return "Примечание должно быть не длиннее 500 символов.";
  const source = state.accounts.find((a) => a.id === transaction.accountId)!;
  if (transaction.type === "expense" && source.kind === "savings")
    return "Для расхода сначала переведите свободные накопления на обычный счёт.";
  if (
    transaction.baseAmount !== undefined &&
    (!Number.isSafeInteger(transaction.baseAmount) ||
      transaction.baseAmount < 0 ||
      transaction.baseAmount > MAX_MONEY)
  )
    return "Сумма в основной валюте превышает допустимый лимит.";
  if (transaction.type !== "transfer" && transaction.toAmount !== undefined)
    return "Сумма зачисления допустима только для перевода.";
  if (transaction.type === "transfer") {
    if (
      transaction.toAccountId === transaction.accountId ||
      !state.accounts.some((a) => a.id === transaction.toAccountId)
    )
      return "Выберите другой счёт для зачисления.";
    const sameCurrency =
      accountCurrency(state, source.id) ===
      accountCurrency(state, transaction.toAccountId);
    if (
      !Number.isSafeInteger(receivedAmount(transaction)) ||
      receivedAmount(transaction) <= 0 ||
      receivedAmount(transaction) > MAX_MONEY ||
      (!sameCurrency && transaction.toAmount === undefined)
    )
      return "Укажите сумму зачисления в валюте получателя.";
    if (sameCurrency && receivedAmount(transaction) !== transaction.amount)
      return "Суммы перевода в одной валюте должны совпадать.";
    if (
      transaction.goalId &&
      !state.goals.some((g) => g.id === transaction.goalId)
    )
      return "Цель не найдена.";
    if (
      transaction.amount >
      accountBalance(state, transaction.accountId, transaction.date)
    )
      return "На выбранном счёте недостаточно средств.";
    if (
      source.kind === "savings" &&
      (state.accounts.find((a) => a.id === transaction.toAccountId)?.kind !==
        "savings" ||
        !sameCurrency)
    ) {
      const savings = state.accounts
        .filter(
          (a) =>
            a.kind === "savings" &&
            (a.currency ?? "RUB") === (source.currency ?? "RUB"),
        )
        .reduce(
          (sum, a) => sum + accountBalance(state, a.id, transaction.date),
          0,
        );
      const allocated = state.goals
        .filter((g) => (g.currency ?? "RUB") === (source.currency ?? "RUB"))
        .reduce((sum, g) => sum + goalSaved(state, g, transaction.date), 0);
      if (transaction.amount > savings - allocated)
        return "Эти накопления распределены по целям. Сначала освободите средства в целях.";
    }
  }
  if (transaction.goalId) {
    const goal = state.goals.find((g) => g.id === transaction.goalId);
    if (
      !goal ||
      transaction.type !== "transfer" ||
      source.kind !== "spending" ||
      state.accounts.find((a) => a.id === transaction.toAccountId)?.kind !==
        "savings"
    )
      return "Пополнять цель можно только с обычного счёта на накопительный.";
    if (
      (goal.currency ?? "RUB") !==
      accountCurrency(state, transaction.toAccountId)
    )
      return "Валюта накопительного счёта должна совпадать с валютой цели.";
    if (
      goalSaved(state, goal, today) + receivedAmount(transaction) >
      goal.target
    )
      return "Пополнение превышает оставшуюся сумму цели.";
  }
  if (transaction.recurringId) {
    if (
      transaction.type !== "expense" ||
      !transaction.occurrenceDate ||
      !validDate(transaction.occurrenceDate) ||
      !state.recurring.some((p) => p.id === transaction.recurringId)
    )
      return "Неверная связь регулярного платежа.";
    const payment = state.recurring.find(
      (p) => p.id === transaction.recurringId,
    )!;
    if (
      payment.schedule &&
      !isScheduledDate(payment.schedule, transaction.occurrenceDate)
    )
      return "Дата оплаты не соответствует графику.";
    if (
      state.transactions.some(
        (t) =>
          t.recurringId === transaction.recurringId &&
          !!t.occurrenceDate &&
          paymentOccurrenceKey(payment, t.occurrenceDate) ===
            paymentOccurrenceKey(payment, transaction.occurrenceDate!),
      )
    )
      return payment.schedule
        ? "Эта дата уже оплачена."
        : "Этот месяц уже оплачен.";
  }
  if (transaction.plannedIncomeId) {
    const plan = state.plannedIncomes?.find(
      (p) => p.id === transaction.plannedIncomeId,
    );
    if (
      !plan ||
      transaction.type !== "income" ||
      transaction.refundOf ||
      transaction.debtId ||
      !transaction.incomeOccurrenceDate ||
      !validDate(transaction.incomeOccurrenceDate)
    )
      return "Неверная связь планируемого дохода.";
    if (
      plan.schedule &&
      !isScheduledDate(plan.schedule, transaction.incomeOccurrenceDate)
    )
      return "Дата поступления не соответствует графику.";
    if (
      state.transactions.some(
        (t) =>
          t.plannedIncomeId === plan.id &&
          !!t.incomeOccurrenceDate &&
          incomeOccurrenceKey(plan, t.incomeOccurrenceDate) ===
            incomeOccurrenceKey(plan, transaction.incomeOccurrenceDate!),
      )
    )
      return "Это поступление уже записано.";
  }
  return null;
}
