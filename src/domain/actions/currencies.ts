import {
  accountCurrency,
  baseCurrency,
  convertMoney,
  CURRENCY_CODES,
  currencyRate,
  MAX_RATE,
  transactionValue,
  type CurrencyCode,
  type ExchangeRate,
} from "../currency";
import { localDate, validDate } from "../finance";
import { promoteFinanceVersion } from "../financeVersion";
import type { FinanceState } from "../types";
import { checkAmount, checkCurrencyAmounts, ensure } from "./validation";

export function setAutomaticRates(
  state: FinanceState,
  automatic: boolean,
): FinanceState {
  return {
    ...state,
    settings: {
      ...state.settings,
      exchange: { rates: {}, ...state.settings.exchange, automatic },
    },
  };
}
export function saveCurrencyRate(
  state: FinanceState,
  currency: CurrencyCode,
  value: number,
  today = localDate(),
): FinanceState {
  ensure(
    CURRENCY_CODES.includes(currency) && currency !== "RUB",
    "Выберите иностранную валюту.",
  );
  ensure(
    Number.isSafeInteger(value) && value > 0 && value <= MAX_RATE,
    "Введите положительный курс с точностью до 8 знаков.",
  );
  const exchange = state.settings.exchange ?? { automatic: true, rates: {} };
  const old = exchange.rates[currency];
  const rate: ExchangeRate = {
    value,
    date: today,
    source: "manual",
    automaticValue:
      old?.source === "frankfurter" ? old.value : old?.automaticValue,
    automaticDate:
      old?.source === "frankfurter" ? old.date : old?.automaticDate,
  };
  return checked(
    {
      ...state,
      settings: {
        ...state.settings,
        exchange: {
          ...exchange,
          rates: { ...exchange.rates, [currency]: rate },
        },
      },
    },
    today,
  );
}
export function restoreAutomaticRate(
  state: FinanceState,
  currency: CurrencyCode,
  today = localDate(),
): FinanceState {
  const exchange = state.settings.exchange;
  const old = exchange?.rates[currency];
  ensure(
    exchange && old?.automaticValue && old.automaticDate,
    "Сначала загрузите курсы из интернета.",
  );
  return checked(
    {
      ...state,
      settings: {
        ...state.settings,
        exchange: {
          ...exchange,
          rates: {
            ...exchange.rates,
            [currency]: {
              value: old.automaticValue,
              date: old.automaticDate,
              source: "frankfurter",
            },
          },
        },
      },
    },
    today,
  );
}
export function mergeCurrencyRates(
  state: FinanceState,
  incoming: Partial<Record<CurrencyCode, ExchangeRate>>,
  today = localDate(),
): FinanceState {
  const exchange = state.settings.exchange ?? { automatic: true, rates: {} };
  const rates = { ...exchange.rates };
  ensure(Object.keys(incoming).length > 0, "Источник не вернул курсы валют.");
  for (const [code, rate] of Object.entries(incoming)) {
    const currency = code as CurrencyCode;
    ensure(
      CURRENCY_CODES.includes(currency) &&
        currency !== "RUB" &&
        Number.isSafeInteger(rate.value) &&
        rate.value > 0 &&
        rate.value <= MAX_RATE &&
        validDate(rate.date) &&
        rate.date <= today &&
        rate.source === "frankfurter",
      "Источник вернул некорректный курс.",
    );
    const old = rates[currency];
    const oldDate = old?.source === "manual" ? old.automaticDate : old?.date;
    if (oldDate && oldDate > rate.date) continue;
    rates[currency] =
      old?.source === "manual"
        ? { ...old, automaticValue: rate.value, automaticDate: rate.date }
        : { value: rate.value, date: rate.date, source: "frankfurter" };
  }
  return checked(
    {
      ...state,
      settings: {
        ...state.settings,
        exchange: { ...exchange, rates, fetchedOn: today },
      },
    },
    today,
  );
}
export function changeBaseCurrency(
  state: FinanceState,
  currency: CurrencyCode,
  today = localDate(),
): FinanceState {
  currencyRate(state, currency);
  const old = baseCurrency(state);
  if (old === currency) return state;
  const convert = (amount: number) => {
    const next = convertMoney(state, amount, old, currency);
    checkAmount(next, true);
    return next;
  };
  const next: FinanceState = {
    ...state,
    version: promoteFinanceVersion(state.version, 8),
    settings: {
      ...state.settings,
      baseCurrency: currency,
      buffer: convert(state.settings.buffer),
      forecast: state.settings.forecast
        ? {
            ...state.settings.forecast,
            dailySpending: convert(state.settings.forecast.dailySpending),
          }
        : undefined,
    },
    categories: state.categories.map((c) => ({
      ...c,
      budget: convert(c.budget),
    })),
    budgetPlans: state.budgetPlans?.map((plan) => ({
      ...plan,
      ...(plan.versions
        ? {
            versions: plan.versions.map((version) => ({
              ...version,
              changes: version.changes.map((change) => ({
                ...change,
                amount: convert(change.amount),
              })),
              overrides: version.overrides.map((override) => ({
                ...override,
                amount: convert(override.amount),
              })),
            })),
          }
        : {}),
      changes: plan.changes.map((change) => ({
        ...change,
        amount: convert(change.amount),
      })),
      overrides: plan.overrides.map((override) => ({
        ...override,
        amount: convert(override.amount),
      })),
    })),
    transactions: state.transactions.map((t) => ({
      ...t,
      ...(t.type !== "transfer"
        ? { valuation: { source: "current" as const, date: today } }
        : {}),
      baseAmount:
        accountCurrency(state, t.accountId) === currency
          ? t.amount
          : convert(transactionValue(state, t)),
    })),
    scenarios: state.scenarios?.map((s) => ({
      ...s,
      dailySpending:
        s.dailySpending === undefined ? undefined : convert(s.dailySpending),
      events: s.events.map((e) => {
        const amount = convert(e.amount);
        checkAmount(amount);
        return { ...e, amount };
      }),
    })),
  };
  return checked(next, today);
}

function checked(state: FinanceState, today: string): FinanceState {
  checkCurrencyAmounts(state, today);
  return state;
}
