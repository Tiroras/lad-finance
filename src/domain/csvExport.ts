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
import { CSV_MAX_BYTES, CSV_MAX_ROWS } from "./csv";
import { isPosted } from "./transactionStatus";

export interface CsvExportOptions {
  format: "universal" | "ynab";
  accountId?: string;
  from?: string;
  through?: string;
}
export interface CsvExportPeriod {
  from: string | null;
  through: string | null;
}
export interface CsvExportPart {
  content: string;
  rowCount: number;
  transactionCount: number;
  byteLength: number;
  period: CsvExportPeriod;
}
export interface CsvExportParts {
  parts: CsvExportPart[];
  totals: {
    rowCount: number;
    transactionCount: number;
    partCount: number;
    byteLength: number;
    period: CsvExportPeriod;
  };
}
const decimal = (amount: number, currency: CurrencyCode) => {
  const digits = CURRENCIES[currency].digits,
    factor = 10 ** digits;
  return `${amount < 0 ? "-" : ""}${Math.floor(Math.abs(amount) / factor)}${digits ? `.${String(Math.abs(amount) % factor).padStart(digits, "0")}` : ""}`;
};
function transactionCsvGroups(
  state: FinanceState,
  options: CsvExportOptions,
  today: string,
  requireImportableCells: boolean,
) {
  const quote = (text: string) => {
    if (
      requireImportableCells &&
      (text.length > 2000 ||
        /[\0\uFFFD]/.test(text) ||
        [...text].some((character) => {
          const unit = character.codePointAt(0)!;
          return unit >= 0xd800 && unit <= 0xdfff;
        }))
    )
      throw new Error(
        "Одна из ячеек CSV не помещается в предел 2000 символов или содержит неподдерживаемый символ. Сохраните полную копию профиля.",
      );
    return `"${text.replace(/"/g, '""')}"`;
  };
  // Spreadsheet programs must treat user text as text, including leading controls/spaces.
  const safeText = (text: string) =>
    quote(
      /^[\s\u0000-\u001f]*[=+\-@]/u.test(text) || /^[\t\r\n]/.test(text)
        ? `'${text}`
        : text,
    );
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
        isPosted(t) &&
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
  const groups = transactions.map((t) => {
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
    return {
      id: t.id,
      date: t.date,
      rows: parts.flatMap((part, partIndex) => {
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
      }),
    };
  });
  const header =
    options.format === "ynab"
      ? "Date,Payee,Memo,Outflow,Inflow"
      : "Date,Type,Amount,Currency,Description,Category,Account,ToAccount,Note,ID,FromAmount,FromCurrency,ToAmount,ToCurrency,FromAccount,GroupID,RefundOf";
  return { header, groups };
}

/** Historical single-file API; byte-for-byte output remains compatible. */
export function exportTransactionsCsv(
  state: FinanceState,
  options: CsvExportOptions,
  today = localDate(),
) {
  const { header, groups } = transactionCsvGroups(state, options, today, false);
  const rows = groups.flatMap((group) => group.rows);
  return {
    content: `\uFEFF${[header, ...rows].join("\r\n")}\r\n`,
    count: rows.length,
    transactionCount: groups.length,
  };
}

/** One transaction's rows are indivisible, including splits and split refunds. */
export function exportTransactionsCsvParts(
  state: FinanceState,
  options: CsvExportOptions,
  today = localDate(),
): CsvExportParts {
  const { header, groups } = transactionCsvGroups(state, options, today, true);
  const prefix = `\uFEFF${header}\r\n`;
  const encoder = new TextEncoder();
  const headerBytes = encoder.encode(prefix).length;
  const parts: CsvExportPart[] = [];
  let rows: string[] = [],
    bytes = headerBytes,
    transactionCount = 0;
  let from: string | null = null,
    through: string | null = null;
  const finish = () => {
    if (!transactionCount) return;
    parts.push({
      content: prefix + rows.join(""),
      rowCount: rows.length,
      transactionCount,
      byteLength: bytes,
      period: { from, through },
    });
    rows = [];
    bytes = headerBytes;
    transactionCount = 0;
    from = null;
    through = null;
  };
  for (const group of groups) {
    const groupRows = group.rows.map((row) => `${row}\r\n`);
    const groupBytes = groupRows.reduce(
      (sum, row) => sum + encoder.encode(row).length,
      0,
    );
    if (
      !groupRows.length ||
      groupRows.length > CSV_MAX_ROWS ||
      headerBytes + groupBytes > CSV_MAX_BYTES
    )
      throw new Error(
        "Операция не помещается целиком в CSV-часть: предел 5000 строк и 2 МБ. Сохраните полную копию профиля.",
      );
    if (
      rows.length + groupRows.length > CSV_MAX_ROWS ||
      bytes + groupBytes > CSV_MAX_BYTES
    )
      finish();
    rows.push(...groupRows);
    bytes += groupBytes;
    transactionCount++;
    from ??= group.date;
    through = group.date;
  }
  finish();
  return {
    parts,
    totals: {
      rowCount: parts.reduce((sum, part) => sum + part.rowCount, 0),
      transactionCount: groups.length,
      partCount: parts.length,
      byteLength: parts.reduce((sum, part) => sum + part.byteLength, 0),
      period: {
        from: groups[0]?.date ?? null,
        through: groups.at(-1)?.date ?? null,
      },
    },
  };
}
