import { z } from "zod";
import {
  categoryRuleSchema,
  transactionTemplateSchema,
  csvSourceProfileSchema,
  validateAutomation,
} from "./automation";
import {
  adjustmentSchema,
  reconciliationSchema,
  validateReconciliations,
} from "./reconciliation";
import { scheduleSchema, validateSchedules } from "./recurrence";
import { validateTransactionAmountsState } from "./transactionAmounts";
import {
  budgetPlanSchema,
  budgetPlanSchemaV6,
  validateBudgetPlans,
} from "./budgets";
import { debtSchema, validateDebts, validateCreditAccounts } from "./debts";
import { paymentOccurrenceKey } from "./payments";
import { incomeOccurrenceKey } from "./incomes";
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
import {
  assertFinanceVersion,
  transactionStatus,
  transactionStatusError,
} from "./transactionStatus";
import { validateAccountArchives } from "./accountArchive";
import { pendingLinkError } from "./pendingLinks";
import {
  validatePlanHistory,
  paymentLinkValid,
  incomeLinkValid,
} from "./planHistory";
import { validateGoalSchedules } from "./goals";
import { validateGoalFunds } from "./goalFunds";

const amount = z.number().int().min(0).max(MAX_MONEY);
const positiveAmount = amount.min(1);
const id = z.string().min(1).max(100);
const name = z.string().trim().min(1).max(120);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const day = z.number().int().min(1).max(31);
const date = z.string().refine(validDate);
const category = id;
const icon = z.enum(ICON_NAMES);
export const MAX_BACKUP_BYTES = 5_000_000;
const schema = z.object({
  version: z
    .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
    .transform(() => 4 as const),
  demo: z.boolean(),
  settings: z.object({
    name: z.string().max(40),
    payday: day,
    spendableIncomeId: id.optional(),
    onboardingCompleted: z.boolean().optional(),
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
        kind: z.enum(["spending", "savings", "credit"]),
        creditLimit: amount.optional(),
        paymentDueDate: date.optional(),
        paymentDueAmount: amount.optional(),
        paymentDueBaselineIds: z.array(id).max(20000).optional(),
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
  categoryRules: z.array(categoryRuleSchema).max(200).optional(),
  transactionTemplates: z.array(transactionTemplateSchema).max(100).optional(),
  csvProfiles: z.array(csvSourceProfileSchema).max(30).optional(),
  balanceAdjustments: z.array(adjustmentSchema).max(5000).optional(),
  reconciliations: z.array(reconciliationSchema).max(1000).optional(),
  budgetPlans: z.array(budgetPlanSchema).max(200).optional(),
  debts: z.array(debtSchema).max(200).optional(),
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
        schedule: scheduleSchema.optional(),
        skippedDates: z.array(date).max(36890).optional(),
        amountHistory: z
          .array(z.object({ until: date, amount: positiveAmount }))
          .max(5000)
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
        schedule: scheduleSchema.optional(),
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
        date,
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
        splits: z
          .array(z.object({ category, amount: positiveAmount }))
          .min(2)
          .max(50)
          .optional(),
        refundOf: id.optional(),
        refundSourceAmount: positiveAmount.optional(),
        debtId: id.optional(),
        debtAction: z.enum(["issue", "repay"]).optional(),
      }),
    )
    .max(20000),
});

// Preserve the exact legacy normalization (including unknown-field stripping,
// field order and absent optional values) used by existing recovery anchors.
const schemaV5 = schema.extend({
  version: z.literal(5),
  accounts: z
    .array(
      schema.shape.accounts.element.extend({
        archived: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(30),
  transactions: z
    .array(
      schema.shape.transactions.element.extend({
        status: z.enum(["posted", "pending", "cancelled"]).optional(),
        expectedDate: date.optional(),
      }),
    )
    .max(20000),
});

const versionInterval = {
  id,
  effectiveFrom: date.refine((d) => d >= "2000-01-01" && d <= "2100-12-31"),
  effectiveTo: date.optional(),
  legacy: z.literal(true).optional(),
  voided: z.literal(true).optional(),
};
const paymentVersionSchema = schema.shape.recurring.element
  .pick({
    amount: true,
    day: true,
    accountId: true,
    category: true,
    schedule: true,
    history: true,
    amountHistory: true,
    skippedMonths: true,
    skippedDates: true,
  })
  .extend({ ...versionInterval, inactiveLegacy: z.literal(true).optional() });
const incomeVersionSchema = schema.shape.plannedIncomes
  .unwrap()
  .element.pick({
    amount: true,
    accountId: true,
    date: true,
    repeat: true,
    schedule: true,
  })
  .extend(versionInterval);
const schemaV6 = schemaV5.extend({
  version: z.literal(6),
  recurring: z
    .array(
      schema.shape.recurring.element.extend({
        versions: z.array(paymentVersionSchema).min(1).max(200).optional(),
      }),
    )
    .max(200),
  plannedIncomes: z
    .array(
      schema.shape.plannedIncomes.unwrap().element.extend({
        versions: z.array(incomeVersionSchema).min(1).max(200).optional(),
        paused: z.boolean().optional(),
        occurrenceOverrides: z
          .array(
            z.object({
              versionId: id,
              occurrenceDate: date,
              expectedDate: date.optional(),
              cancelled: z.boolean().optional(),
            }),
          )
          .max(5000)
          .optional(),
      }),
    )
    .max(200)
    .optional(),
  transactions: z
    .array(
      schemaV5.shape.transactions.element.extend({
        recurringVersionId: id.optional(),
        incomeVersionId: id.optional(),
      }),
    )
    .max(20000),
  budgetPlans: z.array(budgetPlanSchemaV6).max(200).optional(),
});

const schemaV7 = schemaV6.extend({
  version: z.literal(7),
  accounts: z
    .array(
      schemaV5.shape.accounts.element.extend({
        creditTermsConfirmedOn: date.optional(),
        creditTermsReminderDate: date.optional(),
      }),
    )
    .max(30),
  goals: z
    .array(
      schema.shape.goals.element.extend({
        versions: z
          .array(
            z.object({
              ...versionInterval,
              amount,
              day: day.optional(),
              schedule: scheduleSchema.optional(),
              deadline: date.optional(),
            }),
          )
          .min(1)
          .max(200)
          .optional(),
      }),
    )
    .max(100),
  transactions: z
    .array(
      schemaV6.shape.transactions.element.extend({
        goalVersionId: id.optional(),
        goalOccurrenceDate: date.optional(),
      }),
    )
    .max(20000),
  goalFundCycles: z
    .array(
      z.object({
        id,
        goalId: id,
        recurringId: id.optional(),
        recurringVersionId: id.optional(),
        occurrenceDate: date,
        status: z.enum(["active", "paid", "cancelled"]),
        createdOn: date,
        paidOn: date.optional(),
        paymentTransactionId: id.optional(),
      }),
    )
    .max(5000)
    .optional(),
  goalReleases: z
    .array(
      z.object({
        id,
        goalId: id,
        cycleId: id,
        date,
        amount: positiveAmount,
        transferId: id,
      }),
    )
    .max(5000)
    .optional(),
});

export function decodeBackup(raw: string, today = localDate()): FinanceState {
  // Keep reading older snapshots whose limit was measured in UTF-16 characters.
  // Portable files and new ledgers use the UTF-8 byte limit below. Existing
  // oversized local ledgers remain readable while they are gradually reduced.
  if (raw.length > MAX_BACKUP_BYTES)
    throw new Error("Файл слишком большой. Максимальный размер — 5 МБ.");
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(
      "Не удалось прочитать файл. Выберите резервную копию Лада в формате JSON.",
    );
  }
  return validateBackupValue(value, today);
}

/** Validate a bounded, already parsed value; callers own the input-size boundary. */
export function validateBackupValue(
  value: unknown,
  today: string,
): FinanceState {
  let state: FinanceState;
  try {
    if (!validDate(today)) throw new Error("Invalid validation date");
    if (value && typeof value === "object" && "version" in value) {
      const raw = value as Record<string, unknown>;
      const contains = (name: string, fields: string[]) =>
        Array.isArray(raw[name]) &&
        raw[name].some(
          (entry: unknown) =>
            entry &&
            typeof entry === "object" &&
            fields.some(
              (field) =>
                (entry as Record<string, unknown>)[field] !== undefined,
            ),
        );
      if (
        value.version !== 7 &&
        (raw.goalFundCycles !== undefined ||
          raw.goalReleases !== undefined ||
          contains("goals", ["versions"]) ||
          contains("accounts", [
            "creditTermsConfirmedOn",
            "creditTermsReminderDate",
          ]) ||
          contains("transactions", ["goalVersionId", "goalOccurrenceDate"]))
      )
        throw new Error("Goal history and funds require format 7");
      if (
        value.version !== 6 &&
        value.version !== 7 &&
        (contains("recurring", ["versions"]) ||
          contains("plannedIncomes", [
            "versions",
            "paused",
            "occurrenceOverrides",
          ]) ||
          contains("budgetPlans", ["versions"]) ||
          contains("transactions", ["recurringVersionId", "incomeVersionId"]))
      )
        throw new Error("Plan history requires format 6");
    }
    state = (
      value &&
      typeof value === "object" &&
      "version" in value &&
      (value.version === 5 || value.version === 6 || value.version === 7)
        ? value.version === 7
          ? schemaV7
          : value.version === 6
            ? schemaV6
            : schemaV5
        : schema
    ).parse(value);
    if (state.transactions.some((entry) => entry.date > today))
      throw new Error("Future transaction");
  } catch {
    throw new Error(
      "Не удалось прочитать файл. Выберите резервную копию Лада в формате JSON.",
    );
  }
  // Validate the same normalized calendar that will be returned to the app.
  // Old copies start tracking this month instead of inventing older arrears.
  state = {
    ...state,
    recurring: state.recurring.map((payment) => ({
      ...payment,
      startsOn: payment.startsOn ?? `${today.slice(0, 7)}-01`,
    })),
  };
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
  validateAutomation(state);
  validateReconciliations(state, today);
  validateSchedules(state);
  validatePlanHistory(state);
  validateGoalSchedules(state);
  validateGoalFunds(state, today);
  validateTransactionAmountsState(state);
  validateBudgetPlans(state);
  validateDebts(state, today);
  validateCreditAccounts(state, today);
  if (
    state.settings.spendableIncomeId &&
    !state.plannedIncomes?.some(
      (p) => p.id === state.settings.spendableIncomeId,
    )
  )
    throw new Error("Опорный доход отсутствует в плане.");
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
    const statusError = transactionStatusError(t);
    if (statusError) throw new Error(statusError);
    const linkError = pendingLinkError(state, t);
    if (linkError) throw new Error(linkError);
    if (t.plannedIncomeId) {
      const plan = state.plannedIncomes?.find(
        (p) => p.id === t.plannedIncomeId,
      );
      if (!plan || t.type !== "income" || !t.incomeOccurrenceDate)
        throw new Error("Неверная связь планируемого дохода.");
      if (t.refundOf || t.debtId || !incomeLinkValid(plan, t))
        throw new Error("Неверная связь планируемого дохода.");
      const key = `${plan.id}:${incomeOccurrenceKey(plan, t.incomeOccurrenceDate, t.incomeVersionId)}`;
      if (transactionStatus(t) !== "cancelled" && incomeOccurrences.has(key))
        throw new Error("В файле одно поступление отмечено дважды.");
      if (transactionStatus(t) !== "cancelled") incomeOccurrences.add(key);
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
      const payment = state.recurring.find((p) => p.id === t.recurringId)!;
      if (!paymentLinkValid(payment, t))
        throw new Error("Дата оплаты не соответствует графику.");
      const key = `${t.recurringId}:${paymentOccurrenceKey(payment, t.occurrenceDate, t.recurringVersionId)}`;
      if (transactionStatus(t) !== "cancelled" && occurrences.has(key))
        throw new Error("В файле один платёж отмечен дважды.");
      if (transactionStatus(t) !== "cancelled") occurrences.add(key);
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
  checkSavings(state, today);
  validateAccountArchives(state, today);
  checkCurrencyAmounts(state, today);
  return state;
}

export const encodeBackup = (state: FinanceState) => {
  assertFinanceVersion(state);
  return JSON.stringify(state);
};

export const backupByteLength = (content: string) =>
  new TextEncoder().encode(content).length;

/** Existing oversized ledgers may shrink; portable copies have no allowance. */
export function assertBackupSize(content: string, previousBytes = 0) {
  const bytes = backupByteLength(content);
  if (
    content.length > MAX_BACKUP_BYTES ||
    (bytes > MAX_BACKUP_BYTES && !(bytes < previousBytes))
  )
    throw new Error(
      "Учёт превышает 5 МБ. Изменение не сохранено: уменьшите объём заметок или число операций. Старый большой учёт можно только уменьшать.",
    );
  return bytes;
}

/** Validate a snapshot before replacing durable data or creating a portable copy. */
export function checkedBackupContent(state: FinanceState, previousBytes = 0) {
  const content = encodeBackup(state);
  assertBackupSize(content, previousBytes);
  decodeBackup(content);
  return content;
}
