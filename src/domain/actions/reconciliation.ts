import { accountBalance } from "../accountBalances";
import { accountSignature } from "../reconciliation";
import { validateCreditAccounts } from "../debts";
import { localDate, validDate } from "../../shared/lib/dates";
import { MAX_MONEY, uid } from "../finance";
import type { FinanceState } from "../types";
import { checkCurrencyAmounts, checkSavings, ensure } from "./validation";

export interface ReconciliationInput {
  accountId: string;
  date: string;
  balance: number;
  note: string;
  adjust: boolean;
  expectedSignature: string;
}

export function reconcileAccount(
  state: FinanceState,
  input: ReconciliationInput,
  today = localDate(),
): FinanceState {
  ensure(
    state.accounts.some((a) => a.id === input.accountId),
    "Счёт уже удалён.",
  );
  ensure(
    validDate(input.date) && input.date <= today && input.date >= "2000-01-01",
    "Укажите прошедшую дату сверки или сегодня.",
  );
  ensure(
    Number.isSafeInteger(input.balance) && Math.abs(input.balance) <= MAX_MONEY,
    "Проверьте остаток в валюте счёта.",
  );
  ensure(
    input.note.length <= 500,
    "Заметка должна быть не длиннее 500 символов.",
  );
  ensure(
    input.expectedSignature ===
      accountSignature(state, input.accountId, input.date),
    "Операции изменились. Проверьте разницу заново.",
  );
  const difference =
    input.balance - accountBalance(state, input.accountId, input.date);
  ensure(
    difference === 0 || input.adjust,
    "Сначала найдите расхождение или подтвердите корректировку.",
  );
  ensure(
    Number.isSafeInteger(difference) && Math.abs(difference) <= MAX_MONEY,
    "Корректировка превышает допустимый лимит.",
  );
  ensure(!difference || input.note.trim(), "Укажите причину корректировки.");
  ensure(
    (state.reconciliations?.length ?? 0) < 1000 &&
      (state.balanceAdjustments?.length ?? 0) < 5000,
    "Достигнут лимит записей сверки.",
  );
  const next: FinanceState = difference
    ? {
        ...state,
        balanceAdjustments: [
          ...(state.balanceAdjustments ?? []),
          {
            id: uid(),
            accountId: input.accountId,
            date: input.date,
            amount: difference,
            note: input.note.trim(),
          },
        ],
      }
    : state;
  checkSavings(next, today);
  validateCreditAccounts(next, today);
  checkCurrencyAmounts(next, today);
  return {
    ...next,
    reconciliations: [
      ...(next.reconciliations ?? []),
      {
        id: uid(),
        accountId: input.accountId,
        date: input.date,
        balance: input.balance,
        note: input.note.trim(),
        signature: accountSignature(next, input.accountId, input.date),
      },
    ],
  };
}
