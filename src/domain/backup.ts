import { z } from "zod";
import { localDate, MAX_MONEY, validDate } from "./finance";
import type { FinanceState } from "./types";

const amount = z.number().int().min(0).max(MAX_MONEY);
const positiveAmount = amount.min(1);
const id = z.string().min(1).max(100);
const name = z.string().trim().min(1).max(120);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const day = z.number().int().min(1).max(31);
const date = z.string().refine(validDate);
const category = z.enum([
  "groceries",
  "cafe",
  "transport",
  "shopping",
  "fun",
  "health",
  "home",
  "other",
]);
const icon = z.enum([
  "leaf-outline",
  "cafe-outline",
  "car-outline",
  "bag-handle-outline",
  "sparkles-outline",
  "heart-outline",
  "home-outline",
  "grid-outline",
  "airplane-outline",
  "shield-checkmark-outline",
  "wallet-outline",
  "card-outline",
  "cash-outline",
  "musical-notes-outline",
  "cloud-outline",
  "barbell-outline",
  "paper-plane-outline",
  "wifi-outline",
]);
const schema = z.object({
  version: z.literal(1),
  demo: z.boolean(),
  settings: z.object({
    name: z.string().max(40),
    payday: day,
    buffer: amount,
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
      }),
    )
    .length(8),
  goals: z
    .array(
      z.object({
        id,
        name,
        target: positiveAmount,
        initialSaved: amount,
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
    ].every(unique)
  )
    throw new Error("В файле есть повторяющиеся записи. Импорт отменён.");
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
  const saved = state.goals.reduce((sum, goal) => sum + goal.initialSaved, 0);
  const openingSavings = state.accounts
    .filter((a) => a.kind === "savings")
    .reduce((sum, a) => sum + a.openingBalance, 0);
  if (saved > openingSavings)
    throw new Error(
      "Начальные накопления по целям превышают баланс накопительных счетов.",
    );
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
