import { categoryLabel } from "./categories";
import {
  CURRENCIES,
  accountCurrency,
  receivedAmount,
  type CurrencyCode,
} from "./currency";
import { localDate, validDate } from "./finance";
import type { FinanceState } from "./types";

export interface CsvExportOptions {
  format: "universal" | "ynab";
  accountId?: string;
  from?: string;
  through?: string;
}
const decimal = (amount: number, currency: CurrencyCode) => {
  const digits = CURRENCIES[currency].digits,
    factor = 10 ** digits;
  return `${amount < 0 ? "-" : ""}${Math.floor(Math.abs(amount) / factor)}${digits ? `.${String(Math.abs(amount) % factor).padStart(digits, "0")}` : ""}`;
};
const quote = (text: string) => `"${text.replace(/"/g, '""')}"`;
// Spreadsheet programs must treat user text as text, including leading controls/spaces.
const safeText = (text: string) =>
  quote(
    /^[\s\u0000-\u001f]*[=+\-@]/u.test(text) || /^[\t\r\n]/.test(text)
      ? `'${text}`
      : text,
  );

export function exportTransactionsCsv(
  state: FinanceState,
  options: CsvExportOptions,
  today = localDate(),
) {
  if (!["universal", "ynab"].includes(options.format))
    throw new Error("Выберите формат CSV.");
  if (
    options.accountId &&
    !state.accounts.some((a) => a.id === options.accountId)
  )
    throw new Error("Счёт не найден.");
  if (options.format === "ynab" && !options.accountId)
    throw new Error("Для YNAB выберите один счёт.");
  if (
    (options.from && !validDate(options.from)) ||
    (options.through && !validDate(options.through)) ||
    (options.from && options.through && options.from > options.through)
  )
    throw new Error(
      "Проверьте период экспорта: ГГГГ-ММ-ДД, начало не позже конца.",
    );
  const transactions = state.transactions
    .filter(
      (t) =>
        t.date <= today &&
        (!options.from || t.date >= options.from) &&
        (!options.through || t.date <= options.through) &&
        (!options.accountId ||
          t.accountId === options.accountId ||
          t.toAccountId === options.accountId),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const account = (id?: string) =>
    state.accounts.find((a) => a.id === id)?.name ?? "";
  const rows = transactions.map((t) => {
    const incoming =
      t.type === "income" ||
      (t.type === "transfer" && t.toAccountId === options.accountId);
    const amount =
      t.type === "transfer" && incoming ? receivedAmount(t) : t.amount;
    const currency = accountCurrency(
      state,
      t.type === "transfer" && incoming ? t.toAccountId : t.accountId,
    );
    if (options.format === "ynab") {
      const memo = [
        t.type === "transfer"
          ? `Перевод: ${account(t.accountId)} → ${account(t.toAccountId)}`
          : categoryLabel(state, t.category),
        t.note,
      ]
        .filter(Boolean)
        .join(" · ");
      return [
        quote(t.date),
        safeText(t.title),
        safeText(memo),
        incoming ? "" : decimal(amount, currency),
        incoming ? decimal(amount, currency) : "",
      ].join(",");
    }
    return [
      quote(t.date),
      quote(t.type),
      decimal(incoming ? amount : -amount, currency),
      currency,
      safeText(t.title),
      safeText(t.type === "expense" ? categoryLabel(state, t.category) : ""),
      safeText(account(options.accountId ?? t.accountId)),
      safeText(account(t.toAccountId)),
      safeText(t.note ?? ""),
      safeText(t.id),
      t.type === "transfer"
        ? decimal(t.amount, accountCurrency(state, t.accountId))
        : "",
      t.type === "transfer" ? accountCurrency(state, t.accountId) : "",
      t.type === "transfer"
        ? decimal(receivedAmount(t), accountCurrency(state, t.toAccountId))
        : "",
      t.type === "transfer" ? accountCurrency(state, t.toAccountId) : "",
      t.type === "transfer" ? safeText(account(t.accountId)) : "",
    ].join(",");
  });
  const header =
    options.format === "ynab"
      ? "Date,Payee,Memo,Outflow,Inflow"
      : "Date,Type,Amount,Currency,Description,Category,Account,ToAccount,Note,ID,FromAmount,FromCurrency,ToAmount,ToCurrency,FromAccount";
  return {
    content: `\uFEFF${[header, ...rows].join("\r\n")}\r\n`,
    count: rows.length,
  };
}
