import type { FinanceState, Transaction } from "./types";

export const CURRENCY_CODES = [
  "RUB",
  "USD",
  "EUR",
  "GBP",
  "CNY",
  "JPY",
  "CHF",
  "TRY",
  "KZT",
  "AED",
  "BYN",
  "GEL",
  "KWD",
] as const;
export type CurrencyCode = (typeof CURRENCY_CODES)[number];
export const CURRENCIES: Record<
  CurrencyCode,
  { name: string; digits: number; symbol: string }
> = {
  RUB: { name: "Российский рубль", digits: 2, symbol: "₽" },
  USD: { name: "Доллар США", digits: 2, symbol: "USD" },
  EUR: { name: "Евро", digits: 2, symbol: "€" },
  GBP: { name: "Фунт стерлингов", digits: 2, symbol: "GBP" },
  CNY: { name: "Китайский юань", digits: 2, symbol: "CNY" },
  JPY: { name: "Японская иена", digits: 0, symbol: "JPY" },
  CHF: { name: "Швейцарский франк", digits: 2, symbol: "CHF" },
  TRY: { name: "Турецкая лира", digits: 2, symbol: "TRY" },
  KZT: { name: "Казахстанский тенге", digits: 2, symbol: "KZT" },
  AED: { name: "Дирхам ОАЭ", digits: 2, symbol: "AED" },
  BYN: { name: "Белорусский рубль", digits: 2, symbol: "BYN" },
  GEL: { name: "Грузинский лари", digits: 2, symbol: "GEL" },
  KWD: { name: "Кувейтский динар", digits: 3, symbol: "KWD" },
};
export const MAX_MONEY = 100_000_000_000;
export const RATE_SCALE = 100_000_000;
export const MAX_RATE = 1_000_000 * RATE_SCALE;
// Quotes are RUB per one major currency unit, with eight decimal places.
// Keeping a fixed quote currency avoids cumulative rounding when changing display currency.
export interface ExchangeRate {
  value: number;
  date: string;
  source: "manual" | "frankfurter";
  automaticValue?: number;
  automaticDate?: string;
}
export interface ExchangeSettings {
  automatic: boolean;
  rates: Partial<Record<CurrencyCode, ExchangeRate>>;
  fetchedOn?: string;
}
export const baseCurrency = (state: FinanceState): CurrencyCode =>
  state.settings.baseCurrency ?? "RUB";
export const accountCurrency = (
  state: FinanceState,
  id?: string,
): CurrencyCode => {
  const account = state.accounts.find((a) => a.id === id);
  if (!account) throw new Error("Счёт не найден.");
  return account.currency ?? "RUB";
};
export const currencySymbol = (currency: CurrencyCode) =>
  CURRENCIES[currency].symbol;
export const money = (
  amount: number,
  decimals = false,
  currency: CurrencyCode = "RUB",
) =>
  `${(amount / 10 ** CURRENCIES[currency].digits).toLocaleString("ru-RU", { minimumFractionDigits: decimals ? CURRENCIES[currency].digits : 0, maximumFractionDigits: decimals ? CURRENCIES[currency].digits : 0 })} ${currencySymbol(currency)}`;
export const moneyInput = (amount: number, currency: CurrencyCode = "RUB") =>
  String(amount / 10 ** CURRENCIES[currency].digits).replace(".", ",");
export function parseMoney(
  input: string,
  currency: CurrencyCode = "RUB",
): number | null {
  const clean = input.replace(/[\s\u00a0\u202f₽]/g, "").replace(",", ".");
  const digits = CURRENCIES[currency].digits;
  if (
    !new RegExp(`^\\d{1,12}${digits ? `(\\.\\d{1,${digits}})?` : ""}$`).test(
      clean,
    )
  )
    return null;
  const [whole, decimal = ""] = clean.split(".");
  const amount =
    Number(whole) * 10 ** digits + Number(decimal.padEnd(digits, "0"));
  return Number.isSafeInteger(amount) && amount <= MAX_MONEY ? amount : null;
}
export function parseRate(input: string): number | null {
  const clean = input.trim().replace(",", ".");
  if (!/^\d{1,7}(\.\d{1,8})?$/.test(clean)) return null;
  const [whole, decimal = ""] = clean.split(".");
  const rate = Number(whole) * RATE_SCALE + Number(decimal.padEnd(8, "0"));
  return Number.isSafeInteger(rate) && rate > 0 && rate <= MAX_RATE
    ? rate
    : null;
}
export const rateInput = (value: number) =>
  String(value / RATE_SCALE).replace(".", ",");
export function currencyRate(
  state: FinanceState,
  currency: CurrencyCode,
): number {
  if (currency === "RUB") return RATE_SCALE;
  if (!CURRENCY_CODES.includes(currency))
    throw new Error("Неизвестная валюта.");
  const rate = state.settings.exchange?.rates[currency]?.value;
  if (!rate || rate <= 0 || !Number.isSafeInteger(rate) || rate > MAX_RATE)
    throw new Error(
      `Загрузите или укажите курс ${currency} в настройках валют.`,
    );
  return rate;
}
export function convertMoney(
  state: FinanceState,
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
): number {
  if (!Number.isSafeInteger(amount))
    throw new Error("Некорректная сумма для пересчёта.");
  const fromRate = currencyRate(state, from),
    toRate = currencyRate(state, to);
  if (from === to) return amount;
  const numerator =
    BigInt(Math.abs(amount)) *
    BigInt(fromRate) *
    10n ** BigInt(CURRENCIES[to].digits);
  const denominator = BigInt(toRate) * 10n ** BigInt(CURRENCIES[from].digits);
  const value =
    Number((numerator + denominator / 2n) / denominator) * Math.sign(amount);
  if (!Number.isSafeInteger(value))
    throw new Error("Результат пересчёта слишком велик.");
  return value === 0 ? 0 : value;
}
export const toBase = (
  state: FinanceState,
  amount: number,
  currency: CurrencyCode = "RUB",
) => convertMoney(state, amount, currency, baseCurrency(state));
export const accountToBase = (
  state: FinanceState,
  amount: number,
  accountId: string,
) => toBase(state, amount, accountCurrency(state, accountId));
export const receivedAmount = (
  transaction: Pick<Transaction, "amount" | "toAmount">,
) => transaction.toAmount ?? transaction.amount;
// Recorded income/expense valuations are fixed until the amount/account is edited.
export const transactionValue = (
  state: FinanceState,
  transaction: Transaction,
) =>
  transaction.baseAmount ??
  accountToBase(state, transaction.amount, transaction.accountId);

// Forms can show invalid/oversized estimates without throwing during rendering.
export function tryConvertMoney(
  state: FinanceState,
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
): number | null {
  try {
    return convertMoney(state, amount, from, to);
  } catch {
    return null;
  }
}
