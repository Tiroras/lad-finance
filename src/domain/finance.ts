import {
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
  toBase,
  transactionValue,
  type CurrencyCode,
} from "./currency";
import type {
  CategoryId,
  FinanceState,
  Goal,
  Occurrence,
  Recurring,
  Transaction,
} from "./types";
export { MAX_MONEY, money, moneyInput, parseMoney } from "./currency";

export const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
export function nextPayday(day: number, today = localDate()) {
  const thisMonth = dateInMonth(today, day);
  return thisMonth > today ? thisMonth : dateInMonth(shiftMonth(today, 1), day);
}
export function accountBalance(
  state: FinanceState,
  id: string,
  today = localDate(),
) {
  return state.transactions
    .filter((t) => t.date <= today)
    .reduce(
      (sum, t) => {
        if (t.accountId === id)
          sum += t.type === "income" ? t.amount : -t.amount;
        if (t.type === "transfer" && t.toAccountId === id)
          sum += receivedAmount(t);
        return sum;
      },
      state.accounts.find((a) => a.id === id)?.openingBalance ?? 0,
    );
}

export function totals(state: FinanceState, month = monthKey()) {
  return state.transactions
    .filter((t) => monthKey(t.date) === month && t.date <= localDate())
    .reduce(
      (sum, t) => {
        if (t.type === "expense") sum.expense += transactionValue(state, t);
        if (t.type === "income") sum.income += transactionValue(state, t);
        return sum;
      },
      { income: 0, expense: 0 },
    );
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
    if (t.type !== "expense" || monthKey(t.date) !== month || t.date > today)
      continue;
    const root = rootIds.get(t.category)!;
    spent.set(root, (spent.get(root) ?? 0) + transactionValue(state, t));
  }
  return state.categories
    .filter((c) => !c.parentId)
    .map((category) => ({
      ...category,
      budget: category.archived ? 0 : category.budget,
      spent: spent.get(category.id) ?? 0,
    }));
}

export function goalSaved(
  state: FinanceState,
  goal: Goal,
  today = localDate(),
) {
  return (
    goal.initialSaved +
    state.transactions
      .filter(
        (t) => t.type === "transfer" && t.goalId === goal.id && t.date <= today,
      )
      .reduce((sum, t) => sum + receivedAmount(t), 0)
  );
}

export function goalReserve(state: FinanceState, today = localDate()) {
  return state.goals.reduce((sum, goal) => {
    const contributed = state.transactions
      .filter(
        (t) =>
          t.goalId === goal.id &&
          t.type === "transfer" &&
          monthKey(t.date) === monthKey(today) &&
          t.date <= today,
      )
      .reduce((n, t) => n + receivedAmount(t), 0);
    return (
      sum +
      toBase(
        state,
        Math.max(
          0,
          Math.min(
            goal.target - goalSaved(state, goal, today),
            goal.monthly - contributed,
          ),
        ),
        goal.currency,
      )
    );
  }, 0);
}

export function upcoming(
  state: FinanceState,
  start = localDate(),
  end = shiftDate(start, 31),
): Occurrence[] {
  return paymentOccurrences(state, start, end, start);
}

function paymentOccurrences(
  state: FinanceState,
  start: string,
  end: string,
  today: string,
): Occurrence[] {
  const result: Occurrence[] = [];
  const paidMonths = new Set(
    state.transactions
      .filter(
        (t) =>
          t.type === "expense" &&
          t.recurringId &&
          t.occurrenceDate &&
          t.date <= today,
      )
      .map((t) => `${t.recurringId}:${monthKey(t.occurrenceDate!)}`),
  );
  for (
    let month = `${monthKey(start)}-01`;
    month <= end;
    month = shiftMonth(month, 1)
  ) {
    state.recurring
      .filter((p) => p.active)
      .forEach((template) => {
        const payment = paymentForMonth(template, month);
        const date = dateInMonth(month, payment.day);
        if (date < start || date >= end || date < (payment.startsOn ?? start))
          return;
        const paid = paidMonths.has(`${payment.id}:${monthKey(date)}`);
        const skipped =
          payment.skippedMonths?.includes(monthKey(date)) ?? false;
        result.push({ payment, date, paid, skipped });
      });
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}

export function paymentForMonth(payment: Recurring, date: string): Recurring {
  const rule = payment.history
    ?.slice()
    .sort((a, b) => a.untilMonth.localeCompare(b.untilMonth))
    .find((item) => monthKey(date) <= item.untilMonth);
  return rule ? { ...payment, day: rule.day, amount: rule.amount } : payment;
}

export function changedPaymentHistory(
  original: Recurring | undefined,
  amount: number,
  day: number,
  today = localDate(),
) {
  if (!original || (original.amount === amount && original.day === day))
    return original?.history;
  const untilMonth = monthKey(shiftMonth(today, -1));
  const history = original.history ?? [];
  if (history.some((rule) => rule.untilMonth >= untilMonth)) return history;
  return [
    ...history,
    { untilMonth, day: original.day, amount: original.amount },
  ];
}

export function overduePayments(state: FinanceState, today = localDate()) {
  const start = state.recurring
    .filter((p) => p.active)
    .reduce(
      (first, p) => (p.startsOn && p.startsOn < first ? p.startsOn : first),
      today,
    );
  return paymentOccurrences(state, start, today, today).filter(
    (o) => !o.paid && !o.skipped,
  );
}

export function spendable(state: FinanceState, today = localDate()) {
  const payday = nextPayday(state.settings.payday, today);
  const days = daysBetween(today, payday);
  const liquid = state.accounts
    .filter((a) => a.kind === "spending")
    .reduce(
      (sum, a) =>
        sum + accountToBase(state, accountBalance(state, a.id, today), a.id),
      0,
    );
  const overdue = overduePayments(state, today).reduce(
    (sum, o) =>
      sum + accountToBase(state, o.payment.amount, o.payment.accountId),
    0,
  );
  const payments =
    overdue +
    upcoming(state, today, payday)
      .filter((o) => !o.paid && !o.skipped)
      .reduce(
        (sum, o) =>
          sum + accountToBase(state, o.payment.amount, o.payment.accountId),
        0,
      );
  const goals = goalReserve(state, today);
  const raw = liquid - payments - goals - state.settings.buffer;
  return {
    liquid,
    payments,
    overdue,
    goals,
    buffer: state.settings.buffer,
    raw,
    available: Math.max(0, raw),
    daily: Math.floor(Math.max(0, raw) / days),
    days,
    payday,
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
    if (
      state.transactions.some(
        (t) =>
          t.recurringId === transaction.recurringId &&
          t.occurrenceDate?.slice(0, 7) ===
            transaction.occurrenceDate?.slice(0, 7),
      )
    )
      return "Этот месяц уже оплачен.";
  }
  if (transaction.plannedIncomeId) {
    const plan = state.plannedIncomes?.find(
      (p) => p.id === transaction.plannedIncomeId,
    );
    if (
      !plan ||
      transaction.type !== "income" ||
      !transaction.incomeOccurrenceDate ||
      !validDate(transaction.incomeOccurrenceDate)
    )
      return "Неверная связь планируемого дохода.";
    if (
      state.transactions.some(
        (t) =>
          t.plannedIncomeId === plan.id &&
          (plan.repeat === "once" ||
            t.incomeOccurrenceDate?.slice(0, 7) ===
              transaction.incomeOccurrenceDate?.slice(0, 7)),
      )
    )
      return "Это поступление уже записано.";
  }
  return null;
}
