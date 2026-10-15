import { z } from "zod";
import type { CsvOptions } from "./csv";
import { accountCurrency, MAX_MONEY } from "./currency";
import { currencySchema } from "./currencySchema";
import type { FinanceState, Transaction } from "./types";

const id = z.string().min(1).max(100);
const name = z.string().trim().min(1).max(120);
const positive = z.number().int().min(1).max(MAX_MONEY);
const column = z.number().int().min(-1).max(49);
export const categoryRuleSchema = z.object({
  id,
  pattern: name,
  match: z.enum(["exact", "contains"]),
  category: id,
  enabled: z.boolean(),
});
export type CategoryRule = z.infer<typeof categoryRuleSchema>;

export const transactionTemplateSchema = z.object({
  id,
  name,
  title: name,
  type: z.enum(["expense", "income", "transfer"]),
  amount: positive,
  category: id,
  accountId: id,
  currency: currencySchema,
  toAccountId: id.optional(),
  toCurrency: currencySchema.optional(),
  toAmount: positive.optional(),
  note: z.string().max(500).optional(),
  splits: z
    .array(z.object({ category: id, amount: positive }))
    .min(2)
    .max(50)
    .optional(),
});
export type TransactionTemplate = z.infer<typeof transactionTemplateSchema>;

export const csvSourceProfileSchema = z.object({
  id,
  name,
  encoding: z.enum(["auto", "utf8", "windows1251"]),
  separator: z.enum(["auto", ";", ",", "\t"]),
  headerRow: z.number().int().min(1).max(30),
  headers: z.array(z.string().min(1).max(2000)).min(2).max(50),
  currency: currencySchema,
  options: z.object({
    accountId: id,
    mapping: z.object({
      date: column,
      title: column,
      amount: column,
      expense: column,
      income: column,
      currency: column,
      category: column,
      status: column,
      bankId: column,
      type: column,
    }),
    mode: z.enum(["signed", "split"]),
    positive: z.enum(["income", "expense"]),
    dateOrder: z.enum(["dmy", "mdy"]),
  }),
});
export type CsvSourceProfile = z.infer<typeof csvSourceProfileSchema>;

export const normalizeRuleText = (value: string) =>
  value
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ");

// Earlier rules win. Archived categories never become automatic suggestions.
export function matchCategoryRule(state: FinanceState, title: string) {
  const text = normalizeRuleText(title);
  if (!text) return undefined;
  return state.categoryRules?.find((rule) => {
    if (
      !rule.enabled ||
      !state.categories.some((c) => c.id === rule.category && !c.archived)
    )
      return false;
    const pattern = normalizeRuleText(rule.pattern);
    return rule.match === "exact" ? text === pattern : text.includes(pattern);
  });
}

export function templateProblem(
  state: FinanceState,
  template: TransactionTemplate,
): string | undefined {
  const account = state.accounts.find((a) => a.id === template.accountId);
  if (
    !account ||
    account.archived ||
    accountCurrency(state, account.id) !== template.currency
  )
    return "Счёт или валюта шаблона недоступны. Сохраните шаблон заново.";
  if (template.type === "expense" && account.kind === "savings")
    return "Для расхода нужен повседневный счёт.";
  if (!state.categories.some((c) => c.id === template.category && !c.archived))
    return "Категория шаблона в архиве. Выберите активную категорию и обновите шаблон.";
  if (template.splits) {
    if (
      template.type !== "expense" ||
      template.splits.reduce((sum, part) => sum + part.amount, 0) !==
        template.amount
    )
      return "Сумма частей шаблона должна совпадать с расходом.";
    if (
      new Set(template.splits.map((part) => part.category)).size !==
      template.splits.length
    )
      return "Объедините части шаблона с одинаковой категорией.";
    if (
      template.splits.some(
        (part) =>
          !state.categories.some(
            (category) => category.id === part.category && !category.archived,
          ),
      )
    )
      return "Проверьте категории частей шаблона: они должны быть активны.";
  }
  if (template.type === "transfer") {
    const target = state.accounts.find((a) => a.id === template.toAccountId);
    if (
      !target ||
      target.archived ||
      target.id === account.id ||
      accountCurrency(state, target.id) !== template.toCurrency
    )
      return "Проверьте счёт и валюту зачисления в шаблоне.";
    if (template.currency !== template.toCurrency && !template.toAmount)
      return "Укажите сумму зачисления валютного перевода.";
    if (
      template.currency === template.toCurrency &&
      template.toAmount !== undefined &&
      template.amount !== template.toAmount
    )
      return "Суммы перевода в одной валюте должны совпадать.";
  } else if (
    template.toAccountId ||
    template.toAmount !== undefined ||
    template.toCurrency
  )
    return "Счёт зачисления допустим только для перевода.";
  return undefined;
}

export function templateDraft(
  state: FinanceState,
  template: TransactionTemplate,
  today: string,
): Omit<Transaction, "id"> {
  const error = templateProblem(state, template);
  if (error) throw new Error(error);
  return {
    type: template.type,
    title: template.title,
    amount: template.amount,
    category: template.category,
    accountId: template.accountId,
    toAccountId: template.toAccountId,
    toAmount: template.toAmount,
    date: today,
    note: template.note,
    splits: template.splits?.map((part) => ({ ...part })),
  };
}

export function validateProfileMapping(options: CsvOptions, headers: string[]) {
  const values = Object.values(options.mapping).filter((value) => value >= 0);
  const required = [
    options.mapping.date,
    options.mapping.title,
    ...(options.mode === "signed"
      ? [options.mapping.amount]
      : [options.mapping.expense, options.mapping.income]),
  ];
  if (
    required.some((value) => value < 0 || value >= headers.length) ||
    values.some((value) => value >= headers.length)
  )
    throw new Error("Сопоставьте дату, описание и суммы с колонками файла.");
  if (new Set(values).size !== values.length)
    throw new Error("Каждой роли нужна отдельная колонка CSV.");
  if (
    options.mode === "signed"
      ? options.mapping.expense >= 0 || options.mapping.income >= 0
      : options.mapping.amount >= 0
  )
    throw new Error("Уберите неиспользуемые колонки сумм из профиля.");
}

export function applyCsvProfile(
  state: FinanceState,
  profile: CsvSourceProfile,
  headers: string[],
): CsvOptions {
  const account = state.accounts.find(
    (a) => a.id === profile.options.accountId,
  );
  if (
    !account ||
    account.archived ||
    account.kind !== "spending" ||
    accountCurrency(state, account.id) !== profile.currency
  )
    throw new Error(
      "Счёт или валюта профиля недоступны. Настройте импорт заново.",
    );
  if (
    profile.headers.length !== headers.length ||
    profile.headers.some(
      (value, index) =>
        normalizeRuleText(value) !== normalizeRuleText(headers[index]),
    )
  )
    throw new Error(
      "Колонки файла отличаются от сохранённого профиля. Распознайте их заново и обновите профиль.",
    );
  validateProfileMapping(profile.options, headers);
  return { ...profile.options, mapping: { ...profile.options.mapping } };
}

export function validateAutomation(state: FinanceState) {
  const lists = [
    state.categoryRules ?? [],
    state.transactionTemplates ?? [],
    state.csvProfiles ?? [],
  ];
  if (
    lists.some(
      (list) => new Set(list.map((entry) => entry.id)).size !== list.length,
    )
  )
    throw new Error(
      "В правилах, шаблонах или профилях повторяются идентификаторы.",
    );
  const ruleKeys = new Set<string>();
  for (const rule of state.categoryRules ?? []) {
    const key = `${rule.match}:${normalizeRuleText(rule.pattern)}`;
    if (ruleKeys.has(key))
      throw new Error("Правило с таким условием уже существует.");
    ruleKeys.add(key);
    if (!state.categories.some((c) => c.id === rule.category))
      throw new Error("Правило ссылается на неизвестную категорию.");
  }
  const names = new Set<string>();
  for (const template of state.transactionTemplates ?? []) {
    const key = normalizeRuleText(template.name);
    if (names.has(key))
      throw new Error("Названия шаблонов должны различаться.");
    names.add(key);
    // Archived categories remain valid saved references but cannot be used for a new entry.
    const available = {
      ...state,
      categories: state.categories.map((c) => ({ ...c, archived: false })),
      accounts: state.accounts.map((account) => ({
        ...account,
        archived: false,
      })),
    };
    const error = templateProblem(available, template);
    if (error) throw new Error(error);
  }
  names.clear();
  for (const profile of state.csvProfiles ?? []) {
    const key = normalizeRuleText(profile.name);
    if (names.has(key))
      throw new Error("Названия профилей CSV должны различаться.");
    names.add(key);
    applyCsvProfile(
      {
        ...state,
        accounts: state.accounts.map((account) => ({
          ...account,
          archived: false,
        })),
      },
      profile,
      profile.headers,
    );
  }
}
