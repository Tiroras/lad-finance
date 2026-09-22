import { CURRENCY_CODES, currencyRate, type CurrencyCode } from "../currency";
import { accountBalance, localDate, MAX_MONEY, uid } from "../finance";
import type { Account, FinanceState } from "../types";
import { validateCreditAccounts } from "../debts";
import {
  checkAmount,
  checkCurrencyAmounts,
  checkName,
  checkSavings,
  ensure,
} from "./validation";

export interface AccountInput {
  id?: string;
  name: string;
  kind: Account["kind"];
  balance: number;
  currency?: CurrencyCode;
  creditLimit?: number;
  paymentDueDate?: string;
  paymentDueAmount?: number;
}
export function saveAccount(
  state: FinanceState,
  input: AccountInput,
  today = localDate(),
): FinanceState {
  const original = state.accounts.find((a) => a.id === input.id);
  ensure(!input.id || original, "Счёт уже удалён.");
  ensure(
    original || state.accounts.length < 30,
    "Можно создать не более 30 счетов.",
  );
  ensure(
    !original || input.kind === original.kind,
    "Тип существующего счёта менять нельзя.",
  );
  const currency = input.currency ?? original?.currency ?? "RUB";
  ensure(
    !original || (original.currency ?? "RUB") === currency,
    "Валюту существующего счёта менять нельзя. Создайте новый счёт и выполните перевод.",
  );
  currencyRate(state, currency);
  checkName(input.name);
  ensure(
    ["spending", "savings", "credit"].includes(input.kind),
    "Выберите тип счёта.",
  );
  if (input.kind === "credit" || original)
    checkAmount(Math.abs(input.balance), true);
  else checkAmount(input.balance, true);
  const openingBalance = original?.openingBalance ?? input.balance;
  const adjustment = original
    ? input.balance - accountBalance(state, original.id, today)
    : 0;
  ensure(
    Math.abs(adjustment) <= MAX_MONEY,
    "Корректировка остатка превышает допустимый лимит.",
  );
  ensure(
    !adjustment || (state.balanceAdjustments?.length ?? 0) < 5000,
    "Достигнут лимит корректировок остатков.",
  );
  const creditLimit = input.creditLimit ?? original?.creditLimit;
  const paymentDueDate =
    input.paymentDueDate === undefined
      ? original?.paymentDueDate
      : input.paymentDueDate || undefined;
  const paymentDueAmount =
    input.paymentDueAmount ?? original?.paymentDueAmount ?? 0;
  const dueChanged =
    !original ||
    original.paymentDueDate !== paymentDueDate ||
    (original.paymentDueAmount ?? 0) !== paymentDueAmount;
  const account: Account = {
    id: original?.id ?? uid(),
    name: input.name.trim(),
    kind: input.kind,
    openingBalance,
    currency,
    icon:
      original?.icon ??
      (input.kind === "savings" ? "wallet-outline" : "card-outline"),
    color: original?.color ?? "#234B3C",
    ...(input.kind === "credit"
      ? {
          creditLimit,
          paymentDueDate,
          paymentDueAmount,
          paymentDueBaselineIds: dueChanged
            ? state.transactions
                .filter(
                  (transaction) =>
                    transaction.type === "transfer" &&
                    transaction.toAccountId === original?.id &&
                    transaction.date <= today,
                )
                .map((transaction) => transaction.id)
            : (original?.paymentDueBaselineIds ?? []),
        }
      : {}),
  };
  const next: FinanceState = {
    ...state,
    accounts: original
      ? state.accounts.map((a) => (a.id === account.id ? account : a))
      : [...state.accounts, account],
    ...(adjustment
      ? {
          balanceAdjustments: [
            ...(state.balanceAdjustments ?? []),
            {
              id: uid(),
              accountId: account.id,
              date: today,
              amount: adjustment,
              note: "Изменение остатка в настройках",
            },
          ],
        }
      : {}),
  };
  for (const code of CURRENCY_CODES) {
    const initialGoals = next.goals
      .filter((g) => (g.currency ?? "RUB") === code)
      .reduce((sum, g) => sum + g.initialSaved, 0);
    ensure(
      next.accounts
        .filter((a) => a.kind === "savings" && (a.currency ?? "RUB") === code)
        .reduce((sum, a) => sum + a.openingBalance, 0) >= initialGoals,
      "Начальный остаток меньше средств, распределённых по целям.",
    );
  }
  checkSavings(next, today);
  validateCreditAccounts(next, today);
  checkCurrencyAmounts(next, today);
  return next;
}
