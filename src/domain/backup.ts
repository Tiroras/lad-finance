import { z } from "zod";
import { checkCurrencyAmounts, checkSavings } from "./actions/validation";
import { validateCategories } from "./categories";
import {
  accountCurrency,
  baseCurrency,
  CURRENCY_CODES,
  currencyRate,
  receivedAmount,
} from "./currency";
import { currencySchema, exchangeSchema } from "./currencySchema";
import { localDate, MAX_MONEY, validDate } from "./finance";
import { scenarioSchema } from "./scenarios";
import { ICON_NAMES, type FinanceState } from "./types";

const amount = z.number().int().min(0).max(MAX_MONEY);
const positiveAmount = amount.min(1);
const id = z.string().min(1).max(100);
const name = z.string().trim().min(1).max(120);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const day = z.number().int().min(1).max(31);
const date = z.string().refine(validDate);
const category = id;
const icon = z.enum(ICON_NAMES);
const schema = z.object({
  version: z
    .union([z.literal(1), z.literal(2), z.literal(3)])
    .transform(() => 3 as const),
  demo: z.boolean(),
  settings: z.object({
    name: z.string().max(40),
    payday: day,
    buffer: amount,
    baseCurrency: currencySchema.optional(),
    exchange: exchangeSchema.optional(),
    reminders: z
      .object({
        enabled: z.boolean(),
        daysBefore: z.union([z.literal(0), z.literal(1), z.literal(3)]),
        hour: z.number().int().min(0).max(23),
      })
      .optional(),
    forecast: z.object({ dailySpending: amount, goalDay: day }).optional(),
  }),
  accounts: z
    .array(
      z.object({
        id,
        name,
        kind: z.enum(["spending", "savings"]),
        currency: currencySchema.optional(),
        openingBalance: z.number().int().min(-MAX_MONEY).max(MAX_MONEY),
        icon,
        color,
      }),
    )
    .min(1)
    .max(30),
  categories: z
    .array(
      z.object({
        id: category,
        name,
        icon,
        color,
        background: color,
        budget: amount,
        parentId: id.optional(),
        archived: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(200),
  scenarios: z.array(scenarioSchema).max(20).default([]),
  goals: z
    .array(
      z.object({
        id,
        name,
        target: positiveAmount,
        initialSaved: amount,
        currency: currencySchema.optional(),
        monthly: amount,
        icon,
        color,
      }),
    )
    .max(100),
  recurring: z
    .array(
      z.object({
        id,
        name,
        amount: positiveAmount,
        day,
        kind: z.enum(["bill", "subscription"]),
        active: z.boolean(),
        icon,
        color,
        category,
        accountId: id,
        startsOn: date
          .refine((d) => d >= "2000-01-01" && d <= "2100-12-31")
          .optional(),
        skippedMonths: z
          .array(z.string().regex(/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/))
          .max(1212)
          .optional(),
        history: z
          .array(
            z.object({
              untilMonth: z.string().regex(/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/),
              amount: positiveAmount,
              day,
            }),
          )
          .max(1212)
          .optional(),
      }),
    )
    .max(200),
  plannedIncomes: z
    .array(
      z.object({
        id,
        name,
        amount: positiveAmount,
        date: date.refine((d) => d >= "2000-01-01" && d <= "2100-12-31"),
        repeat: z.enum(["once", "monthly"]),
        accountId: id,
      }),
    )
    .max(200)
    .optional(),
  transactions: z
    .array(
      z.object({
        id,
        type: z.enum(["expense", "income", "transfer"]),
        title: name,
        amount: positiveAmount,
        date: date.refine((d) => d <= localDate()),
        category,
        accountId: id,
        toAccountId: id.optional(),
        toAmount: positiveAmount.optional(),
        baseAmount: amount.optional(),
        goalId: id.optional(),
        recurringId: id.optional(),
        occurrenceDate: date.optional(),
        note: z.string().max(500).optional(),
        importKey: z.string().max(500).optional(),
        plannedIncomeId: id.optional(),
        incomeOccurrenceDate: date.optional(),
      }),
    )
    .max(20000),
});

export function decodeBackup(raw: string): FinanceState {
  if (raw.length > 5_000_000)
    throw new Error("Файл слишком большой. Максимальный размер — 5 МБ.");
  let state: FinanceState;
  try {
    state = schema.parse(JSON.parse(raw));
  } catch {
    throw new Error(
      "Не удалось прочитать файл. Выберите резервную копию Лада в формате JSON.",
    );
  }
  const unique = (items: { id: string }[]) =>
    new Set(items.map((item) => item.id)).size === items.length;
  if (
    ![
      state.accounts,
      state.categories,
      state.goals,
      state.recurring,
      state.transactions,
      state.plannedIncomes ?? [],
      state.scenarios ?? [],
    ].every(unique)
  )
    throw new Error("В файле есть повторяющиеся записи. Импорт отменён.");
  validateCategories(state.categories);
  if (
    [...state.transactions, ...state.recurring].some(
      (entry) => !state.categories.some((c) => c.id === entry.category),
    )
  )
    throw new Error("Операция или платёж ссылается на неизвестную категорию.");
  const account = (id: string | undefined) =>
    state.accounts.find((a) => a.id === id);
  if (
    !state.accounts.some((a) => a.kind === "spending") ||
    !state.accounts.some((a) => a.kind === "savings")
  )
    throw new Error("В файле отсутствуют основные счета.");
  if (
    state.recurring.some(
      (p) => !account(p.accountId) || account(p.accountId)?.kind !== "spending",
    )
  )
    throw new Error("Платёж ссылается на недоступный счёт.");
  currencyRate(state, baseCurrency(state));
  for (const a of state.accounts) currencyRate(state, a.currency ?? "RUB");
  for (const g of state.goals) currencyRate(state, g.currency ?? "RUB");
  const occurrences = new Set<string>();
  const incomeOccurrences = new Set<string>();
  if (
    state.plannedIncomes?.some((p) => account(p.accountId)?.kind !== "spending")
  )
    throw new Error("Планируемый доход ссылается на недоступный счёт.");
  if (
    state.recurring.some(
      (p) =>
        p.history &&
        new Set(p.history.map((rule) => rule.untilMonth)).size !==
          p.history.length,
    )
  )
    throw new Error("В истории платежа повторяется месяц изменения условий.");
  for (const t of state.transactions) {
    if (t.plannedIncomeId) {
      const plan = state.plannedIncomes?.find(
        (p) => p.id === t.plannedIncomeId,
      );
      if (!plan || t.type !== "income" || !t.incomeOccurrenceDate)
        throw new Error("Неверная связь планируемого дохода.");
      const key = `${plan.id}:${plan.repeat === "once" ? "once" : t.incomeOccurrenceDate.slice(0, 7)}`;
      if (incomeOccurrences.has(key))
        throw new Error("В файле одно поступление отмечено дважды.");
      incomeOccurrences.add(key);
    }
    if (!account(t.accountId))
      throw new Error("Операция ссылается на неизвестный счёт.");
    if (
      t.type === "transfer" &&
      (!account(t.toAccountId) || t.accountId === t.toAccountId)
    )
      throw new Error("Неверные счета перевода.");
    if (
      t.goalId &&
      (t.type !== "transfer" ||
        !state.goals.some((g) => g.id === t.goalId) ||
        account(t.toAccountId)?.kind !== "savings" ||
        account(t.accountId)?.kind !== "spending")
    )
      throw new Error("Неверное пополнение цели.");
    const sourceCurrency = accountCurrency(state, t.accountId);
    if (
      t.baseAmount === undefined &&
      (sourceCurrency !== "RUB" || baseCurrency(state) !== "RUB")
    )
      throw new Error("У операции отсутствует оценка в основной валюте.");
    if (t.type === "transfer") {
      const targetCurrency = accountCurrency(state, t.toAccountId);
      if (
        (sourceCurrency !== targetCurrency && t.toAmount === undefined) ||
        (sourceCurrency === targetCurrency && receivedAmount(t) !== t.amount)
      )
        throw new Error("Неверные суммы валютного перевода.");
      if (
        t.goalId &&
        (state.goals.find((g) => g.id === t.goalId)?.currency ?? "RUB") !==
          targetCurrency
      )
        throw new Error("Валюта цели не совпадает со счётом зачисления.");
    } else if (t.toAmount !== undefined)
      throw new Error("Сумма зачисления допустима только для перевода.");
    if (t.recurringId) {
      if (
        t.type !== "expense" ||
        !t.occurrenceDate ||
        !state.recurring.some((p) => p.id === t.recurringId)
      )
        throw new Error("Неверная связь регулярного платежа.");
      const key = `${t.recurringId}:${t.occurrenceDate.slice(0, 7)}`;
      if (occurrences.has(key))
        throw new Error("В файле один платёж отмечен дважды.");
      occurrences.add(key);
    }
  }
  for (const currency of CURRENCY_CODES) {
    const saved = state.goals
      .filter((g) => (g.currency ?? "RUB") === currency)
      .reduce((sum, goal) => sum + goal.initialSaved, 0);
    const openingSavings = state.accounts
      .filter((a) => a.kind === "savings" && (a.currency ?? "RUB") === currency)
      .reduce((sum, a) => sum + a.openingBalance, 0);
    if (saved > openingSavings)
      throw new Error(
        "Начальные накопления по целям превышают баланс накопительных счетов.",
      );
  }
  checkSavings(state, localDate());
  checkCurrencyAmounts(state, localDate());
  // Older backups have no start boundary. Begin tracking from the month of
  // migration, then persist that date, without inventing earlier arrears.
  return {
    ...state,
    recurring: state.recurring.map((payment) => ({
      ...payment,
      startsOn: payment.startsOn ?? `${localDate().slice(0, 7)}-01`,
    })),
  };
}

export const encodeBackup = (state: FinanceState) =>
  JSON.stringify(state, null, 2);
