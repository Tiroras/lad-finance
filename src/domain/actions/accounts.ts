import { accountBalance, localDate, MAX_MONEY, uid } from "../finance";
import type { Account, FinanceState } from "../types";
import { checkAmount, checkName, checkSavings, ensure } from "./validation";

export interface AccountInput {
  id?: string;
  name: string;
  kind: Account["kind"];
  balance: number;
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
  checkName(input.name);
  checkAmount(input.balance, true);
  const openingBalance =
    input.balance -
    (original ? accountBalance(state, original.id, today) : 0) +
    (original?.openingBalance ?? 0);
  ensure(
    Math.abs(openingBalance) <= MAX_MONEY,
    "Корректировка начального остатка превышает 1 млрд ₽.",
  );
  const account: Account = {
    id: original?.id ?? uid(),
    name: input.name.trim(),
    kind: input.kind,
    openingBalance,
    icon:
      original?.icon ??
      (input.kind === "savings" ? "wallet-outline" : "card-outline"),
    color: original?.color ?? "#234B3C",
  };
  const next = {
    ...state,
    accounts: original
      ? state.accounts.map((a) => (a.id === account.id ? account : a))
      : [...state.accounts, account],
  };
  const initialGoals = next.goals.reduce((sum, g) => sum + g.initialSaved, 0);
  ensure(
    next.accounts
      .filter((a) => a.kind === "savings")
      .reduce((sum, a) => sum + a.openingBalance, 0) >= initialGoals,
    "Начальный остаток меньше средств, распределённых по целям.",
  );
  checkSavings(next, today);
  return next;
}
