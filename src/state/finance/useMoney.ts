import { useMemo } from "react";
import {
  baseCurrency,
  currencySymbol,
  money,
  moneyInput,
  parseMoney,
  type CurrencyCode,
} from "../../domain/currency";
import { useFinance } from "./FinanceProvider";

export function useMoney() {
  const { state } = useFinance();
  const currency = baseCurrency(state);
  return useMemo(
    () => ({
      currency,
      symbol: currencySymbol(currency),
      money: (
        amount: number,
        decimals = false,
        code: CurrencyCode = currency,
      ) => money(amount, decimals, code),
      moneyInput: (amount: number, code: CurrencyCode = currency) =>
        moneyInput(amount, code),
      parseMoney: (input: string, code: CurrencyCode = currency) =>
        parseMoney(input, code),
    }),
    [currency],
  );
}
