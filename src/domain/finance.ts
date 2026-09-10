import type {
  CategoryId,
  FinanceState,
  Goal,
  Occurrence,
  Transaction,
} from "./types";

export const MAX_MONEY = 100_000_000_000;
export const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
export const localDate = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export const fromDate = (value: string) => new Date(`${value}T12:00:00`);
export const monthKey = (date = localDate()) => date.slice(0, 7);
export function shiftDate(value: string, days: number) {
  const date = fromDate(value);
  date.setDate(date.getDate() + days);
  return localDate(date);
}
export function shiftMonth(value: string, months: number) {
  const date = fromDate(value);
  return localDate(new Date(date.getFullYear(), date.getMonth() + months, 1));
}
export const daysBetween = (start: string, end: string) =>
  Math.round(
    (Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) /
      86_400_000,
  );
export function validDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(fromDate(value).getTime()) &&
    localDate(fromDate(value)) === value
  );
}
export function dateInMonth(month: string, day: number) {
  const date = fromDate(`${month.slice(0, 7)}-01`);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return `${month.slice(0, 7)}-${String(Math.min(day, last)).padStart(2, "0")}`;
}
export function nextPayday(day: number, today = localDate()) {
  const thisMonth = dateInMonth(today, day);
  return thisMonth > today ? thisMonth : dateInMonth(shiftMonth(today, 1), day);
}
export const dateLabel = (
  date: string,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" },
) => fromDate(date).toLocaleDateString("ru-RU", options);
export const money = (kopecks: number, decimals = false) =>
  `${(kopecks / 100).toLocaleString("ru-RU", { minimumFractionDigits: decimals ? 2 : 0, maximumFractionDigits: decimals ? 2 : 0 })} ₽`;
export const moneyInput = (kopecks: number) =>
  String(kopecks / 100).replace(".", ",");

export function parseMoney(input: string): number | null {
  const clean = input.replace(/[\s\u00a0\u202f₽]/g, "").replace(",", ".");
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(clean)) return null;
  const [whole, decimal = ""] = clean.split(".");
  const amount = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  return Number.isSafeInteger(amount) && amount <= MAX_MONEY ? amount : null;
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
        if (t.type === "transfer" && t.toAccountId === id) sum += t.amount;
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
        if (t.type === "expense") sum.expense += t.amount;
        if (t.type === "income") sum.income += t.amount;
        return sum;
      },
      { income: 0, expense: 0 },
    );
}

export function categorySpending(state: FinanceState, month = monthKey()) {
  return state.categories.map((category) => ({
    ...category,
    spent: state.transactions
      .filter(
        (t) =>
          t.type === "expense" &&
          t.category === category.id &&
          monthKey(t.date) === month &&
          t.date <= localDate(),
      )
      .reduce((sum, t) => sum + t.amount, 0),
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
      .reduce((sum, t) => sum + t.amount, 0)
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
      .reduce((n, t) => n + t.amount, 0);
    return (
      sum +
      Math.max(
        0,
        Math.min(
          goal.target - goalSaved(state, goal, today),
          goal.monthly - contributed,
        ),
      )
    );
  }, 0);
}

export function upcoming(
  state: FinanceState,
  start = localDate(),
  end = shiftDate(start, 31),
): Occurrence[] {
  const result: Occurrence[] = [];
  for (
    let month = `${monthKey(start)}-01`;
    month <= end;
    month = shiftMonth(month, 1)
  ) {
    state.recurring
      .filter((p) => p.active)
      .forEach((payment) => {
        const date = dateInMonth(month, payment.day);
        if (date < start || date >= end) return;
        const paid = state.transactions.some(
          (t) =>
            t.type === "expense" &&
            t.recurringId === payment.id &&
            t.occurrenceDate?.slice(0, 7) === monthKey(date) &&
            t.date <= start,
        );
        result.push({ payment, date, paid });
      });
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}

export function spendable(state: FinanceState, today = localDate()) {
  const payday = nextPayday(state.settings.payday, today);
  const days = daysBetween(today, payday);
  const liquid = state.accounts
    .filter((a) => a.kind === "spending")
    .reduce((sum, a) => sum + accountBalance(state, a.id, today), 0);
  const payments = upcoming(state, today, payday)
    .filter((o) => !o.paid)
    .reduce((sum, o) => sum + o.payment.amount, 0);
  const goals = goalReserve(state, today);
  const raw = liquid - payments - goals - state.settings.buffer;
  return {
    liquid,
    payments,
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
export function parseQuickEntry(input: string): {
  amount: number;
  title: string;
  category: CategoryId;
  type: "expense" | "income";
} | null {
  const matches = [
    ...input.matchAll(/\d+(?:[ \u00a0]\d{3})*(?:[.,]\d{1,2})?/g),
  ];
  if (matches.length !== 1 || /[-−]\s*\d/.test(input)) return null;
  const match = matches[0];
  const amount = parseMoney(match[0]);
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
    category:
      KEYWORDS.find(([, pattern]) => pattern.test(title))?.[0] ?? "other",
    type: /зарплат|доход|аванс|премия/iu.test(title) ? "income" : "expense",
  };
}

export function validateTransaction(
  state: FinanceState,
  transaction: Transaction,
  today = localDate(),
): string | null {
  if (!transaction.title.trim() || transaction.title.length > 120)
    return "Укажите название до 120 символов.";
  if (
    !Number.isSafeInteger(transaction.amount) ||
    transaction.amount <= 0 ||
    transaction.amount > MAX_MONEY
  )
    return "Введите сумму больше нуля, не более 1 млрд ₽.";
  if (!validDate(transaction.date) || transaction.date > today)
    return "Укажите корректную дату, не позднее сегодняшней.";
  if (!state.accounts.some((a) => a.id === transaction.accountId))
    return "Выберите счёт.";
  if (!state.categories.some((c) => c.id === transaction.category))
    return "Выберите категорию.";
  if (transaction.type === "transfer") {
    if (
      transaction.toAccountId === transaction.accountId ||
      !state.accounts.some((a) => a.id === transaction.toAccountId)
    )
      return "Выберите другой счёт для зачисления.";
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
  }
  return null;
}
