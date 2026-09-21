import {
  CURRENCY_CODES,
  MAX_RATE,
  RATE_SCALE,
  type CurrencyCode,
  type ExchangeRate,
} from "../domain/currency";
import { localDate, validDate } from "../domain/finance";

export const RATES_URL = `https://api.frankfurter.dev/v2/rates?base=USD&quotes=${CURRENCY_CODES.filter((c) => c !== "USD").join(",")}`;
// The public request contains currency codes only, never accounts or transactions.
export function decodeExchangeRates(
  raw: unknown,
  today = localDate(),
): Partial<Record<CurrencyCode, ExchangeRate>> {
  if (!Array.isArray(raw) || raw.length > 30 || raw.length === 0)
    throw new Error("Источник вернул некорректные курсы.");
  const quotes = new Map<CurrencyCode, { rate: number; date: string }>();
  for (const row of raw) {
    if (
      !row ||
      row.base !== "USD" ||
      !CURRENCY_CODES.includes(row.quote) ||
      quotes.has(row.quote) ||
      typeof row.rate !== "number" ||
      !Number.isFinite(row.rate) ||
      row.rate <= 0 ||
      typeof row.date !== "string" ||
      !validDate(row.date) ||
      row.date > today
    )
      throw new Error("Источник вернул некорректные курсы.");
    quotes.set(row.quote, { rate: row.rate, date: row.date });
  }
  const rub = quotes.get("RUB");
  if (!rub) throw new Error("Источник не вернул курс рубля.");
  quotes.set("USD", { rate: 1, date: rub.date });
  const result: Partial<Record<CurrencyCode, ExchangeRate>> = {};
  for (const [code, quote] of quotes) {
    if (code === "RUB") continue;
    const value = Math.round((rub.rate / quote.rate) * RATE_SCALE);
    if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_RATE)
      throw new Error("Источник вернул некорректный курс.");
    result[code] = {
      value,
      date: rub.date < quote.date ? rub.date : quote.date,
      source: "frankfurter",
    };
  }
  return result;
}
export async function fetchExchangeRates(
  today = localDate(),
  signal?: AbortSignal,
) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort);
  if (signal?.aborted) abort();
  const timer = setTimeout(abort, 12000);
  try {
    const response = await fetch(RATES_URL, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok)
      throw new Error("Не удалось загрузить курсы. Повторите позже.");
    const text = await response.text();
    if (text.length > 20000)
      throw new Error("Ответ источника слишком большой.");
    return decodeExchangeRates(JSON.parse(text), today);
  } catch {
    throw new Error(
      "Не удалось обновить курсы. Сохранённые значения доступны офлайн; курс можно ввести вручную.",
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
