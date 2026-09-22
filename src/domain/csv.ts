import { matchCategoryRule } from "./automation";
import { appendTransaction } from "./actions/transactions";
import { activeCategory, categoryLabel } from "./categories";
import {
  CURRENCIES,
  accountCurrency,
  accountToBase,
  receivedAmount,
  type CurrencyCode,
} from "./currency";
import {
  accountBalance,
  localDate,
  parseMoney,
  suggestCategory,
  uid,
  validDate,
  validateTransaction,
} from "./finance";
import type { CategoryId, FinanceState, Transaction } from "./types";

export const CSV_MAX_BYTES = 2_000_000;
export const CSV_MAX_ROWS = 5000;
export type CsvColumn =
  | "date"
  | "title"
  | "amount"
  | "expense"
  | "income"
  | "currency"
  | "category"
  | "status"
  | "bankId"
  | "type";
export type CsvMapping = Record<CsvColumn, number>;
export interface CsvTable {
  headers: string[];
  rows: string[][];
  delimiter: string;
}
export interface CsvOptions {
  accountId: string;
  mapping: CsvMapping;
  mode: "signed" | "split";
  positive: "income" | "expense";
  dateOrder: "dmy" | "mdy";
}
export interface CsvOverride {
  type?: Transaction["type"];
  otherAccountId?: string;
  otherAmount?: string;
  category?: CategoryId;
}
export interface CsvPreviewRow {
  line: number;
  title: string;
  transaction?: Transaction;
  error?: string;
  duplicate: boolean;
  categoryReason?: string;
}

// CSV is parsed as text only; formulas are never evaluated. Quoted delimiters,
// escaped quotes, embedded newlines, BOM, CRLF and trailing empty cells work.
export function parseCsv(raw: string, separator?: string): CsvTable {
  if (raw.length > CSV_MAX_BYTES)
    throw new Error("CSV должен быть не больше 2 МБ.");
  if (raw.includes("\0") || raw.includes("\uFFFD"))
    throw new Error(
      "Не удалось прочитать кодировку файла. Выберите UTF-8 или Windows-1251.",
    );
  const input = raw.replace(/^\uFEFF/, "");
  let delimiter = separator;
  if (!delimiter) {
    const first = input.split(/\r?\n/, 1)[0];
    const counts: Record<string, number> = { ";": 0, ",": 0, "\t": 0 };
    let quoted = false;
    for (let i = 0; i < first.length; i++) {
      if (first[i] === '"') {
        if (quoted && first[i + 1] === '"') i++;
        else quoted = !quoted;
      } else if (!quoted && first[i] in counts) counts[first[i]]++;
    }
    delimiter = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  }
  if (![";", ",", "\t"].includes(delimiter))
    throw new Error(
      "Выберите разделитель: точка с запятой, запятая или табуляция.",
    );
  const records: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  const finishCell = () => {
    row.push(cell.trim());
    cell = "";
    closed = false;
    if (row.length > 50)
      throw new Error("В CSV допустимо не более 50 колонок.");
  };
  const finishRow = () => {
    finishCell();
    if (row.some(Boolean)) records.push(row);
    row = [];
    if (records.length > CSV_MAX_ROWS + 1)
      throw new Error("Импортируйте не более 5000 операций за один раз.");
  };
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += char;
    } else if (char === delimiter) finishCell();
    else if (char === "\n" || char === "\r") {
      finishRow();
      if (char === "\r" && input[i + 1] === "\n") i++;
    } else if (char === '"' && !cell && !closed) quoted = true;
    else if (closed) {
      if (!/\s/.test(char))
        throw new Error("После закрывающей кавычки ожидался разделитель CSV.");
    } else {
      if (char === '"') throw new Error("Проверьте кавычки в CSV.");
      cell += char;
    }
    if (cell.length > 2000)
      throw new Error(
        "Одна из ячеек CSV слишком длинная (больше 2000 символов).",
      );
  }
  if (quoted) throw new Error("В CSV не закрыта кавычка.");
  if (cell || row.length || closed) finishRow();
  if (records.length < 2 || records[0].length < 2)
    throw new Error(
      "Нужна строка заголовков и хотя бы одна операция. Проверьте разделитель.",
    );
  const [headers, ...rows] = records;
  return {
    headers: headers.map((header, i) => header || `Колонка ${i + 1}`),
    rows,
    delimiter,
  };
}

const normalize = (text: string) =>
  text
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]/gu, "");
export function guessCsvMapping(headers: string[]): CsvMapping {
  const aliases: Record<CsvColumn, string[]> = {
    date: ["Дата операции", "Дата платежа", "Дата", "Transaction date", "Date"],
    title: [
      "Описание",
      "Назначение платежа",
      "Наименование операции",
      "Description",
      "Merchant",
      "Название",
    ],
    amount: [
      "Сумма платежа",
      "Сумма в рублях",
      "Сумма операции",
      "Сумма",
      "Amount",
    ],
    expense: ["Расход", "Списание", "Дебет", "Debit", "Expense"],
    income: ["Приход", "Зачисление", "Кредит", "Credit", "Income"],
    currency: ["Валюта платежа", "Валюта операции", "Валюта", "Currency"],
    category: ["Категория", "Category"],
    status: ["Статус", "Status"],
    bankId: ["ID операции", "Номер операции", "Transaction ID", "ID"],
    type: ["Тип операции", "Тип", "Type", "Direction"],
  };
  return Object.fromEntries(
    Object.entries(aliases).map(([key, names]) => {
      const found = names
        .map((name) =>
          headers.findIndex((header) => normalize(header) === normalize(name)),
        )
        .find((i) => i >= 0);
      return [key, found ?? -1];
    }),
  ) as CsvMapping;
}

function csvDate(value: string, order: CsvOptions["dateOrder"]): string | null {
  const iso = /^(\d{4}-\d{2}-\d{2})(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.exec(
    value,
  );
  if (iso) return validDate(iso[1]) ? iso[1] : null;
  const local =
    /^(\d{1,2})([./])(\d{1,2})\2(\d{4})(?:\s+\d{2}:\d{2}(?::\d{2})?)?$/.exec(
      value,
    );
  if (!local) return null;
  const first = local[1].padStart(2, "0"),
    second = local[3].padStart(2, "0");
  const date = `${local[4]}-${local[2] === "." || order === "dmy" ? second : first}-${local[2] === "." || order === "dmy" ? first : second}`;
  return validDate(date) ? date : null;
}
function signedAmount(value: string, currency: CurrencyCode) {
  const clean = value.trim().replace(/^−/, "-");
  const amount = parseMoney(clean.replace(/^[+-]/, ""), currency);
  return amount === null ? null : clean.startsWith("-") ? -amount : amount;
}
const fingerprint = (t: Transaction) =>
  JSON.stringify([
    t.accountId,
    t.toAccountId ?? "",
    t.type,
    t.date,
    t.amount,
    t.type === "transfer" ? receivedAmount(t) : "",
    t.title.toLocaleLowerCase("ru-RU").replace(/\s+/g, " ").trim(),
  ]);

export function previewCsv(
  state: FinanceState,
  table: CsvTable,
  options: CsvOptions,
  overrides: Record<number, CsvOverride> = {},
  today = localDate(),
): CsvPreviewRow[] {
  const { mapping: map } = options;
  const required = [
    map.date,
    map.title,
    ...(options.mode === "signed" ? [map.amount] : [map.expense, map.income]),
  ];
  if (required.some((i) => i < 0 || i >= table.headers.length))
    throw new Error("Сопоставьте дату, описание и колонки сумм.");
  const mapped = Object.values(map).filter((i) => i >= 0);
  if (new Set(mapped).size !== mapped.length)
    throw new Error("Каждой роли нужна отдельная колонка CSV.");
  if (
    !state.accounts.some(
      (a) => a.id === options.accountId && a.kind === "spending",
    )
  )
    throw new Error("Выберите повседневный счёт для выписки.");
  const currency = accountCurrency(state, options.accountId);
  const existing = new Map<string, number>();
  const existingIds = new Map<string, Transaction>();
  state.transactions.forEach((t) => {
    const key = fingerprint(t);
    existing.set(key, (existing.get(key) ?? 0) + 1);
    if (t.importKey) existingIds.set(t.importKey, t);
  });
  const seen = new Map<string, number>(),
    seenIds = new Map<string, string>();
  const conflictingIds = new Set<string>();
  const rows = table.rows.map((cells, index) => {
    const line = index + 2,
      override = overrides[line] ?? {};
    const value = (key: CsvColumn) =>
      map[key] < 0 ? "" : (cells[map[key]] ?? "").trim();
    const title = value("title").replace(/\s+/g, " ");
    const result: CsvPreviewRow = { line, title, duplicate: false };
    const fail = (error: string) => ({ ...result, error });
    if (cells.length !== table.headers.length)
      return fail(
        "Число ячеек не совпадает с заголовками. Проверьте разделитель и кавычки.",
      );
    const date = csvDate(value("date"), options.dateOrder);
    if (!date || date > today || date < "2000-01-01")
      return fail("Некорректная дата или операция из будущего.");
    const rowCurrency = /^(RUR|₽|руб\.?|643)$/i.test(value("currency"))
      ? "RUB"
      : value("currency").toUpperCase();
    if (rowCurrency && rowCurrency !== currency)
      return fail(
        `Валюта строки не совпадает с валютой счёта (${currency}). Выберите соответствующий счёт.`,
      );
    if (
      value("status") &&
      !/^(OK|успешно|исполнено|выполнено|проведено|обработано|completed|posted|success)$/i.test(
        value("status"),
      )
    )
      return fail("Операция не подтверждена банком: проверьте статус.");
    let amount: number | null, type: Transaction["type"];
    if (options.mode === "split") {
      const expense = value("expense")
        ? signedAmount(value("expense"), currency)
        : 0;
      const income = value("income")
        ? signedAmount(value("income"), currency)
        : 0;
      if (
        expense === null ||
        income === null ||
        expense < 0 ||
        income < 0 ||
        !!expense === !!income
      )
        return fail(
          "В строке должна быть одна положительная сумма: приход или расход.",
        );
      amount = income || expense;
      type = income ? "income" : "expense";
    } else {
      const signed = signedAmount(value("amount"), currency);
      if (signed === null || signed === 0)
        return fail(
          `Проверьте сумму: для ${currency} допустимо знаков после запятой: ${CURRENCIES[currency].digits}.`,
        );
      amount = Math.abs(signed);
      type =
        signed > 0
          ? options.positive
          : options.positive === "income"
            ? "expense"
            : "income";
      if (value("type")) {
        const direction = normalize(value("type"));
        if (/^(расход|списание|debit|expense)$/.test(direction))
          type = "expense";
        else if (/^(доход|приход|зачисление|credit|income)$/.test(direction))
          type = "income";
        else if (!override.type)
          return fail("Укажите тип этой операции вручную.");
      }
    }
    if (!amount) return fail("Сумма должна быть больше нуля.");
    if (
      !override.type &&
      /перевод|transfer/iu.test(
        `${title} ${value("category")} ${value("type")}`,
      )
    )
      return fail(
        "Возможный перевод. Укажите: расход, доход или перевод между своими счетами.",
      );
    const incoming = type === "income";
    type = override.type ?? type;
    if (
      type === "transfer" &&
      (!override.otherAccountId ||
        override.otherAccountId === options.accountId)
    )
      return fail("Выберите второй счёт для перевода.");
    const categoryName = normalize(value("category"));
    const matchingCategories = categoryName
      ? state.categories.filter(
          (c) =>
            !c.archived &&
            normalize(categoryLabel(state, c.id)) === categoryName,
        )
      : [];
    if (
      matchingCategories.length > 1 &&
      !override.category &&
      !(type === "expense" && matchCategoryRule(state, title))
    )
      return fail(
        "Название категории неоднозначно. Выберите категорию вручную.",
      );
    const categoryRule =
      type === "expense" ? matchCategoryRule(state, title) : undefined;
    if (!override.category && categoryRule)
      result.categoryReason = `Правило «${categoryRule.pattern}» → ${categoryLabel(state, categoryRule.category)}`;
    const transaction: Transaction = {
      id: `csv-preview-${line}`,
      title,
      amount,
      type,
      date,
      accountId:
        type === "transfer" && incoming
          ? override.otherAccountId!
          : options.accountId,
      ...(type === "transfer"
        ? {
            toAccountId: incoming ? options.accountId : override.otherAccountId,
          }
        : {}),
      category:
        override.category ??
        categoryRule?.category ??
        matchingCategories[0]?.id ??
        activeCategory(state, suggestCategory(title)),
    };
    if (type === "transfer") {
      if (!state.accounts.some((a) => a.id === override.otherAccountId))
        return fail("Выберите второй счёт для перевода.");
      const otherCurrency = accountCurrency(state, override.otherAccountId);
      if (otherCurrency !== currency) {
        const otherAmount = parseMoney(
          override.otherAmount ?? "",
          otherCurrency,
        );
        if (!otherAmount)
          return fail(
            `Укажите фактическую сумму на втором счёте в ${otherCurrency}.`,
          );
        transaction.amount = incoming ? otherAmount : amount;
        transaction.toAmount = incoming ? amount : otherAmount;
      }
    }
    try {
      transaction.baseAmount = accountToBase(
        state,
        transaction.amount,
        transaction.accountId,
      );
    } catch (e) {
      return fail(
        e instanceof Error ? e.message : "Не удалось пересчитать валюту.",
      );
    }
    if (state.categories.find((c) => c.id === transaction.category)?.archived)
      return fail("Категория в архиве. Выберите активную категорию.");
    const error = validateTransaction(state, transaction, today);
    if (error) return fail(error);
    const key = fingerprint(transaction),
      ordinal = (seen.get(key) ?? 0) + 1;
    seen.set(key, ordinal);
    if (value("bankId")) {
      if (value("bankId").length > 120)
        return fail("Слишком длинный ID операции.");
      transaction.importKey = JSON.stringify([
        "csv",
        options.accountId,
        value("bankId"),
      ]);
      const previous = existingIds.get(transaction.importKey);
      const inFile = seenIds.get(transaction.importKey);
      if (
        (previous && fingerprint(previous) !== key) ||
        (inFile && inFile !== key)
      ) {
        conflictingIds.add(transaction.importKey);
        return fail(
          "Один ID банка встречается с разными данными. Проверьте файл.",
        );
      }
      result.duplicate =
        !!previous || !!inFile || (existing.get(key) ?? 0) >= ordinal;
      seenIds.set(transaction.importKey, key);
    } else {
      transaction.importKey = `csv:${key}:${ordinal}`;
      result.duplicate = (existing.get(key) ?? 0) >= ordinal;
    }
    return { ...result, transaction };
  });
  return rows.map((row) =>
    row.transaction?.importKey && conflictingIds.has(row.transaction.importKey)
      ? {
          line: row.line,
          title: row.title,
          duplicate: false,
          error: "Один ID банка встречается с разными данными. Проверьте файл.",
        }
      : row,
  );
}

export function applyCsvImport(
  state: FinanceState,
  table: CsvTable,
  options: CsvOptions,
  excluded: ReadonlySet<number>,
  overrides: Record<number, CsvOverride>,
  today = localDate(),
) {
  const transactions = previewCsv(state, table, options, overrides, today)
    .filter(
      (row) =>
        row.transaction &&
        !row.error &&
        !row.duplicate &&
        !excluded.has(row.line),
    )
    .map((row) => ({ ...row.transaction!, id: uid() }));
  if (!transactions.length)
    throw new Error("Нет новых выбранных операций для импорта.");
  if (state.transactions.length + transactions.length > 20000)
    throw new Error("В учёте допустимо не более 20 000 операций.");
  let next = state;
  for (const transaction of transactions
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))) {
    try {
      next = appendTransaction(next, transaction, today);
    } catch (error) {
      throw new Error(
        `«${transaction.title}»: ${error instanceof Error ? error.message : "Не удалось добавить операцию."}`,
      );
    }
  }
  return { ...state, transactions: [...transactions, ...state.transactions] };
}

export const importedBalance = (
  state: FinanceState,
  accountId: string,
  rows: CsvPreviewRow[],
  excluded: ReadonlySet<number>,
  today = localDate(),
) =>
  accountBalance(
    {
      ...state,
      transactions: [
        ...state.transactions,
        ...rows
          .filter((r) => r.transaction && !r.duplicate && !excluded.has(r.line))
          .map((r) => r.transaction!),
      ],
    },
    accountId,
    today,
  );
