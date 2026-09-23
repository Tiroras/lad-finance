import { categoryLabel } from "./categories";
import {
  CURRENCIES,
  accountCurrency,
  receivedAmount,
  type CurrencyCode,
} from "./currency";
import { allocateAmount, expenseContributions } from "./transactionAmounts";
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
      "Проверьте даты периода экспорта: начало должно быть не позже конца.",
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
  const rows = transactions.flatMap((t) => {
    const debt = state.debts?.find((entry) => entry.id === t.debtId);
    const purchase = t.refundOf
      ? state.transactions.find((entry) => entry.id === t.refundOf)
      : undefined;
    const refundParts = purchase?.splits;
    const refundAllocations = refundParts
      ? allocateAmount(
          t.amount,
          expenseContributions(state, t).some((part) => part.amount !== 0)
            ? expenseContributions(state, t).map((part) =>
                Math.abs(part.amount),
              )
            : refundParts.map((part) => part.amount),
        )
      : undefined;
    const parts =
      t.splits ??
      (refundParts
        ? refundParts.map((part, index) => ({
            category: part.category,
            amount: refundAllocations![index],
          }))
        : [{ category: purchase?.category ?? t.category, amount: t.amount }]);
    return parts.flatMap((part, partIndex) => {
      if (part.amount === 0) return [];
      const grouped = parts.length > 1;
      const entryId = grouped ? `${t.id}:part:${partIndex + 1}` : t.id;
      const detail = [
        t.refundOf ? `Возврат покупки ${t.refundOf}` : undefined,
        t.debtId
          ? `Основная сумма долга «${debt?.name ?? t.debtId}»; ${debt?.direction === "lent" ? "мне должны (lent)" : "я должен (borrowed)"}; ${t.debtAction === "repay" ? "возврат (repay)" : debt?.direction === "lent" ? "выдача (issue)" : "получение (issue)"}; ID долга: ${t.debtId}. В Ладе не входит в доходы и расходы.`
          : undefined,
        grouped
          ? `Часть ${partIndex + 1}/${parts.length}; операция ${t.id}`
          : undefined,
      ]
        .filter(Boolean)
        .join(" · ");
      const incoming =
        t.type === "income" ||
        (t.type === "transfer" && t.toAccountId === options.accountId);
      const amount =
        t.type === "transfer" && incoming ? receivedAmount(t) : part.amount;
      const currency = accountCurrency(
        state,
        t.type === "transfer" && incoming ? t.toAccountId : t.accountId,
      );
      if (options.format === "ynab") {
        const memo = [
          t.type === "transfer"
            ? `Перевод: ${account(t.accountId)} → ${account(t.toAccountId)}`
            : categoryLabel(state, part.category),
          t.note,
          detail,
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
        safeText(
          t.type === "expense" || t.refundOf
            ? categoryLabel(state, part.category)
            : "",
        ),
        safeText(account(options.accountId ?? t.accountId)),
        safeText(account(t.toAccountId)),
        safeText([t.note, detail].filter(Boolean).join(" · ")),
        safeText(entryId),
        t.type === "transfer"
          ? decimal(t.amount, accountCurrency(state, t.accountId))
          : "",
        t.type === "transfer" ? accountCurrency(state, t.accountId) : "",
        t.type === "transfer"
          ? decimal(receivedAmount(t), accountCurrency(state, t.toAccountId))
          : "",
        t.type === "transfer" ? accountCurrency(state, t.toAccountId) : "",
        t.type === "transfer" ? safeText(account(t.accountId)) : "",
        safeText(grouped ? t.id : ""),
        safeText(t.refundOf ?? ""),
      ].join(",");
    });
  });
  const header =
    options.format === "ynab"
      ? "Date,Payee,Memo,Outflow,Inflow"
      : "Date,Type,Amount,Currency,Description,Category,Account,ToAccount,Note,ID,FromAmount,FromCurrency,ToAmount,ToCurrency,FromAccount,GroupID,RefundOf";
  return {
    content: `\uFEFF${[header, ...rows].join("\r\n")}\r\n`,
    count: rows.length,
    transactionCount: transactions.length,
  };
}
