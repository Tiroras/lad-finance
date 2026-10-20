import {
  appendTransaction,
  exchangeWithFee,
  postPendingTransaction,
  saveTransaction,
  type ExchangeWithFeeInput,
} from "../../src/domain/actions/transactions";
import {
  changeBaseCurrency,
  saveCurrencyRate,
} from "../../src/domain/actions/currencies";
import { accountBalance } from "../../src/domain/accountBalances";
import {
  decodeBackup,
  encodeBackup,
  validateBackupValue,
} from "../../src/domain/backup";
import {
  convertMoney,
  MAX_MONEY,
  parseMoney,
  RATE_SCALE,
  transactionValue,
} from "../../src/domain/currency";
import {
  applyCsvImport,
  guessCsvMapping,
  parseCsv,
} from "../../src/domain/csv";
import { totals, validateTransaction } from "../../src/domain/finance";
import { createInitialState } from "../../src/domain/seed";
import type { FinanceState, Transaction } from "../../src/domain/types";
import { transactionValuationLabel } from "../../src/domain/transactionValuation";
import {
  createTransactionDraft,
  transactionInput,
} from "../../src/features/transactions/model/transactionDraft";
import { parseStoredTransactionDraft } from "../../src/features/transactions/model/storedTransactionDraft";

const TODAY = "2026-10-20";
const KEY = "lad-profile-personal:lad-finance-v1";
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonical(child)]),
    );
  return value;
}
function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(canonical(actual)) !== JSON.stringify(canonical(expected)))
    throw new Error(
      `${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`,
    );
}
function rejects(run: () => unknown, pattern: RegExp) {
  try {
    run();
  } catch (error) {
    if (error instanceof Error && pattern.test(error.message)) return;
    throw new Error(`Unexpected rejection: ${String(error)}`);
  }
  throw new Error(`Expected rejection: ${String(pattern)}`);
}
export function fxState(): FinanceState {
  const state = createInitialState(false, TODAY);
  state.version = 7;
  state.settings.onboardingCompleted = true;
  state.settings.exchange = {
    automatic: false,
    rates: {
      USD: { value: 90 * RATE_SCALE, date: "2026-10-19", source: "manual" },
      JPY: { value: 0.6 * RATE_SCALE, date: "2026-10-19", source: "manual" },
      KWD: { value: 300 * RATE_SCALE, date: "2026-10-19", source: "manual" },
    },
  };
  state.accounts = [
    {
      ...state.accounts[0],
      id: "card",
      name: "Рубли Т07",
      openingBalance: 2_000_000,
    },
    {
      ...state.accounts[0],
      id: "usd",
      name: "Доллары Т07",
      currency: "USD",
      openingBalance: 0,
    },
    {
      ...state.accounts[0],
      id: "jpy",
      name: "Иены Т07",
      currency: "JPY",
      openingBalance: 1000,
    },
    {
      ...state.accounts[0],
      id: "kwd",
      name: "Динары Т07",
      currency: "KWD",
      openingBalance: 1000,
    },
    ...state.accounts.filter((account) => account.id !== "card"),
  ];
  return state;
}
function expense(fields: Partial<Transaction> = {}): Transaction {
  return {
    id: "foreign",
    title: "Историческая покупка",
    type: "expense",
    amount: 10_000,
    accountId: "usd",
    category: "other",
    date: "2026-10-01",
    ...fields,
  };
}
function exchange(
  fields: Partial<ExchangeWithFeeInput> = {},
): ExchangeWithFeeInput {
  return {
    transfer: {
      createId: "exchange",
      type: "transfer",
      title: "Обмен Т07",
      date: TODAY,
      amount: 900_000,
      toAmount: 10_000,
      accountId: "card",
      toAccountId: "usd",
      category: "other",
    },
    feeAmount: 10_000,
    feeAccountId: "card",
    feeCategory: "other",
    ...fields,
  };
}
export const t07FxCases: { name: string; run: () => void }[] = [
  {
    name: "new foreign expense stores current basis without claiming the transaction date",
    run() {
      const state = appendTransaction(fxState(), expense(), TODAY);
      equal(state.version, 8);
      equal(state.transactions[0].baseAmount, 900_000);
      equal(state.transactions[0].valuation, {
        date: TODAY,
        source: "current",
      });
    },
  },
  {
    name: "manual historical valuation remains fixed when current rate changes",
    run() {
      let state = saveTransaction(
        fxState(),
        {
          ...expense(),
          id: undefined,
          baseAmount: 900_000,
          valuation: { date: "2026-10-01", source: "manual" },
        },
        TODAY,
      );
      state = saveCurrencyRate(state, "USD", 95 * RATE_SCALE, TODAY);
      equal(transactionValue(state, state.transactions[0]), 900_000);
      equal(state.transactions[0].valuation, {
        date: "2026-10-01",
        source: "manual",
      });
      equal(
        decodeBackup(encodeBackup(state), TODAY).transactions,
        state.transactions,
      );
    },
  },
  {
    name: "legacy rename and movement-date edit preserve unknown provenance and value",
    run() {
      const state = fxState();
      state.transactions = [expense({ baseAmount: 800_000 })];
      const next = saveTransaction(
        state,
        {
          ...state.transactions[0],
          title: "Новое название",
          date: "2026-10-02",
        },
        TODAY,
      );
      equal(next.version, 7);
      equal(next.transactions[0].baseAmount, 800_000);
      equal(next.transactions[0].valuation, undefined);
      equal(
        transactionValuationLabel(next.transactions[0]).includes("неизвестно"),
        true,
      );
    },
  },
  {
    name: "amount edit receives a fresh valuation, metadata edit retains its basis",
    run() {
      let state = appendTransaction(fxState(), expense(), TODAY);
      state = saveTransaction(
        state,
        { ...state.transactions[0], title: "Метаданные" },
        TODAY,
      );
      equal(state.transactions[0].valuation, {
        date: TODAY,
        source: "current",
      });
      state = saveTransaction(
        state,
        {
          ...state.transactions[0],
          amount: 5_000,
          baseAmount: undefined,
          valuation: undefined,
        },
        TODAY,
      );
      equal(state.transactions[0].baseAmount, 450_000);
      equal(state.transactions[0].valuation, {
        date: TODAY,
        source: "current",
      });
    },
  },
  {
    name: "posting a foreign expectation replaces the tentative amount and basis",
    run() {
      let state = appendTransaction(
        fxState(),
        expense({
          status: "pending",
          baseAmount: 800_000,
          valuation: { source: "manual", date: "2026-10-01" },
        }),
        TODAY,
      );
      state = saveCurrencyRate(state, "USD", 95 * RATE_SCALE, TODAY);
      state = postPendingTransaction(state, "foreign", TODAY, TODAY);
      equal(state.transactions[0].baseAmount, 950_000);
      equal(state.transactions[0].valuation, {
        date: TODAY,
        source: "current",
      });
    },
  },
  {
    name: "CSV records import day and source while retaining historical movement date",
    run() {
      const table = parseCsv("Дата;Описание;Сумма\n01.10.2026;Покупка;-100");
      const state = applyCsvImport(
        fxState(),
        table,
        {
          accountId: "usd",
          mapping: guessCsvMapping(table.headers),
          mode: "signed",
          positive: "income",
          dateOrder: "dmy",
        },
        new Set(),
        {},
        TODAY,
      );
      equal(state.transactions[0].date, "2026-10-01");
      equal(state.transactions[0].baseAmount, 900_000);
      equal(state.transactions[0].valuation, {
        date: TODAY,
        source: "imported",
      });
      equal(state.version, 8);
    },
  },
  {
    name: "exchange and commission create exactly two facts and only the fee is expense",
    run() {
      const original = fxState(),
        before = JSON.stringify(original);
      const state = exchangeWithFee(original, exchange(), TODAY);
      equal(JSON.stringify(original), before);
      equal(state.version, 8);
      equal(state.transactions.length, 2);
      equal(accountBalance(state, "card", TODAY), 1_090_000);
      equal(accountBalance(state, "usd", TODAY), 10_000);
      equal(totals(state, "2026-10", TODAY).expense, 10_000);
      equal(totals(state, "2026-10", TODAY).income, 0);
    },
  },
  {
    name: "invalid fee amount rolls back the entire exchange",
    run() {
      const state = fxState(),
        before = JSON.stringify(state);
      rejects(
        () => exchangeWithFee(state, exchange({ feeAmount: 0 }), TODAY),
        /положительную сумму/,
      );
      equal(JSON.stringify(state), before);
      equal(state.transactions.length, 0);
    },
  },
  {
    name: "archived fee category rejects both facts",
    run() {
      const state = fxState();
      state.categories.find((c) => c.id === "other")!.archived = true;
      const before = JSON.stringify(state);
      // The transfer category is active, so only the second fact fails.
      const input = exchange();
      input.transfer.category = "groceries";
      rejects(() => exchangeWithFee(state, input, TODAY), /Категория в архиве/);
      equal(JSON.stringify(state), before);
    },
  },
  {
    name: "fee from unavailable account rejects the otherwise valid exchange",
    run() {
      const state = fxState(),
        before = JSON.stringify(state);
      rejects(
        () =>
          exchangeWithFee(state, exchange({ feeAccountId: "missing" }), TODAY),
        /Выберите счёт/,
      );
      equal(JSON.stringify(state), before);
    },
  },
  {
    name: "missing exchange rate rejects both records without a fallback",
    run() {
      const state = fxState();
      delete state.settings.exchange!.rates.USD;
      const before = JSON.stringify(state);
      rejects(() => exchangeWithFee(state, exchange(), TODAY), /курс USD/);
      equal(JSON.stringify(state), before);
    },
  },
  {
    name: "whole package checks capacity before adding either fact",
    run() {
      const state = fxState();
      state.transactions = Array.from({ length: 19_999 }, (_, i) =>
        expense({
          id: `old-${i}`,
          accountId: "card",
          amount: 1,
          baseAmount: 1,
        }),
      );
      const before = JSON.stringify(state);
      rejects(
        () => exchangeWithFee(state, exchange(), TODAY),
        /две свободные записи/,
      );
      equal(JSON.stringify(state), before);
    },
  },
  {
    name: "retry is idempotent and mismatched fee cannot overwrite an earlier package",
    run() {
      const state = exchangeWithFee(fxState(), exchange(), TODAY);
      equal(exchangeWithFee(state, exchange(), TODAY) === state, true);
      rejects(
        () => exchangeWithFee(state, exchange({ feeAmount: 20_000 }), TODAY),
        /ID уже занят/,
      );
      equal(state.transactions.length, 2);
    },
  },
  {
    name: "retry after one fact was removed does not recreate a partial exchange",
    run() {
      const state = exchangeWithFee(fxState(), exchange(), TODAY);
      state.transactions = state.transactions.filter(
        (t) => t.type === "transfer",
      );
      rejects(() => exchangeWithFee(state, exchange(), TODAY), /Часть обмена/);
      equal(state.transactions.length, 1);
    },
  },
  {
    name: "JPY and KWD use their own precision and integer half rounding",
    run() {
      const state = fxState();
      equal(parseMoney("1", "JPY"), 1);
      equal(parseMoney("1,1", "JPY"), null);
      equal(parseMoney("0,001", "KWD"), 1);
      equal(parseMoney("0,0001", "KWD"), null);
      equal(convertMoney(state, 1, "JPY", "KWD"), 2);
      state.settings.exchange!.rates.JPY!.value = 0.15 * RATE_SCALE;
      equal(convertMoney(state, 1, "JPY", "KWD"), 1);
      equal(convertMoney(state, -1, "JPY", "KWD"), -1);
    },
  },
  {
    name: "fee can use a third currency and preserves exact minimal units",
    run() {
      const state = exchangeWithFee(
        fxState(),
        exchange({ feeAmount: 1, feeAccountId: "kwd" }),
        TODAY,
      );
      const fee = state.transactions.find((t) => t.type === "expense")!;
      equal(fee.amount, 1);
      equal(fee.baseAmount, 30);
      equal(fee.valuation, { date: TODAY, source: "current" });
      equal(accountBalance(state, "kwd", TODAY), 999);
      equal(totals(state, "2026-10", TODAY).expense, 30);
    },
  },
  {
    name: "MAX_MONEY boundary and unsafe or over-limit commission fail exactly",
    run() {
      equal(parseMoney("1000000000", "RUB"), MAX_MONEY);
      equal(parseMoney("1000000000,01", "RUB"), null);
      for (const amount of [MAX_MONEY + 1, Number.MAX_SAFE_INTEGER + 1, NaN])
        rejects(
          () =>
            exchangeWithFee(fxState(), exchange({ feeAmount: amount }), TODAY),
          /положительную сумму/,
        );
    },
  },
  {
    name: "backup roundtrip preserves both sides and all provenance",
    run() {
      const state = exchangeWithFee(
        fxState(),
        exchange({ feeAmount: 1, feeAccountId: "kwd" }),
        TODAY,
      );
      equal(decodeBackup(encodeBackup(state), TODAY), state);
    },
  },
  {
    name: "legacy backup cannot smuggle provenance and malformed dates are rejected",
    run() {
      const state = appendTransaction(fxState(), expense(), TODAY);
      rejects(
        () => validateBackupValue({ ...state, version: 7 }, TODAY),
        /8|формат|верс|оцен/i,
      );
      equal(
        validateTransaction(
          fxState(),
          expense({
            baseAmount: 900_000,
            valuation: { source: "manual", date: "2026-10-21" },
          }),
          TODAY,
        )?.includes("дату основания"),
        true,
      );
      rejects(
        () =>
          validateBackupValue(
            {
              ...state,
              transactions: [
                expense({
                  baseAmount: 900_000,
                  valuation: { source: "manual", date: "2026-02-30" },
                }),
              ],
            },
            TODAY,
          ),
        /дат|оцен|данн|формат/i,
      );
    },
  },
  {
    name: "changing base currency explicitly creates a new dated valuation",
    run() {
      const state = appendTransaction(
        fxState(),
        expense({
          baseAmount: 800_000,
          valuation: { source: "manual", date: "2026-10-01" },
        }),
        TODAY,
      );
      const changed = changeBaseCurrency(state, "USD", TODAY);
      equal(changed.transactions[0].baseAmount, 10_000);
      equal(changed.transactions[0].valuation, {
        source: "current",
        date: TODAY,
      });
      equal(changed.transactions[0].amount, 10_000);
    },
  },
  {
    name: "draft persistence retains fee and explicit basis while an untouched old row stays unknown",
    run() {
      const state = fxState(),
        original = expense({ baseAmount: 800_000 });
      const draft = createTransactionDraft(state, TODAY, original);
      equal(transactionInput(state, draft, original).valuation, undefined);
      const manual = {
        ...draft,
        valuation: "9000",
        valuationDate: "2026-09-30",
      };
      equal(transactionInput(state, manual, original).valuation, {
        date: "2026-09-30",
        source: "manual",
      });
      const saved = {
        version: 1,
        createId: "draft",
        draft: {
          ...manual,
          feeEnabled: true,
          feeAmount: "1,001",
          feeAccountId: "kwd",
          feeCategory: "other",
        },
        quick: "",
        templateName: "",
        savedTemplateName: "",
        original,
      };
      equal(parseStoredTransactionDraft(saved), saved);
    },
  },
];

export function installFxFixture() {
  if (sessionStorage.getItem("t07-fx-installed")) return;
  localStorage.setItem(KEY, encodeBackup(fxState()));
  localStorage.setItem("lad-active-profile-v1", "personal");
  localStorage.setItem(
    "lad-profiles-v1",
    JSON.stringify({
      version: 1,
      profiles: [{ id: "personal", name: "Личный" }],
    }),
  );
  sessionStorage.setItem("t07-fx-installed", "true");
}
export function readFxFixture() {
  return decodeBackup(localStorage.getItem(KEY)!, TODAY);
}
