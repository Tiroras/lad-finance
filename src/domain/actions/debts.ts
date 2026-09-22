import { accountBalance } from "../accountBalances";
import { accountCurrency } from "../currency";
import {
  creditOutstanding,
  debtBalance,
  debtTransactionType,
  validateCreditAccounts,
  validateDebts,
  type Debt,
} from "../debts";
import { uid } from "../finance";
import { localDate, validDate } from "../../shared/lib/dates";
import type { FinanceState } from "../types";
import { appendTransaction } from "./transactions";
import {
  checkAmount,
  checkCurrencyAmounts,
  checkName,
  ensure,
} from "./validation";

export interface DebtInput {
  id?: string;
  name: string;
  direction: Debt["direction"];
  accountId: string;
  amount?: number;
  date?: string;
  dueDate?: string;
  note?: string;
  recordTransaction?: boolean;
}

export function saveDebt(
  state: FinanceState,
  input: DebtInput,
  today = localDate(),
): FinanceState {
  const original = state.debts?.find((debt) => debt.id === input.id);
  ensure(!input.id || original, "Долг уже удалён.");
  ensure(
    original || (state.debts?.length ?? 0) < 200,
    "Можно хранить не более 200 долгов.",
  );
  checkName(input.name);
  ensure(
    input.direction === "lent" || input.direction === "borrowed",
    "Выберите вид долга.",
  );
  ensure(
    !original || original.direction === input.direction,
    "Вид существующего долга менять нельзя.",
  );
  const account = state.accounts.find((entry) => entry.id === input.accountId);
  ensure(account?.kind === "spending", "Выберите повседневный счёт для долга.");
  const currency = accountCurrency(state, account.id);
  ensure(
    !original || currency === original.currency,
    "Валюта долга неизменяема. Выберите счёт в той же валюте.",
  );
  const date = original?.startsOn ?? input.date ?? today;
  ensure(
    validDate(date) && date <= today,
    "Укажите дату долга не позднее сегодняшней.",
  );
  ensure(
    !input.dueDate || (validDate(input.dueDate) && input.dueDate >= date),
    "Срок возврата должен быть не раньше начала долга.",
  );
  ensure(
    (input.note?.length ?? 0) <= 500,
    "Заметка должна быть не длиннее 500 символов.",
  );
  if (!original) {
    checkAmount(input.amount ?? 0);
    ensure(
      typeof input.recordTransaction === "boolean",
      "Выберите, нужно ли записать движение денег по счёту.",
    );
  }
  const debt: Debt = {
    id: original?.id ?? uid(),
    name: input.name.trim(),
    direction: input.direction,
    accountId: account.id,
    currency,
    startsOn: date,
    openingAmount:
      original?.openingAmount ?? (input.recordTransaction ? 0 : input.amount!),
    dueDate: input.dueDate || undefined,
    note: input.note?.trim() || undefined,
  };
  let next: FinanceState = {
    ...state,
    debts: original
      ? state.debts!.map((entry) => (entry.id === original.id ? debt : entry))
      : [...(state.debts ?? []), debt],
  };
  if (!original && input.recordTransaction) {
    const type = debtTransactionType(debt, "issue");
    if (type === "expense")
      ensure(
        accountBalance(state, account.id, date) >= input.amount!,
        "На выбранном счёте недостаточно денег для выдачи долга.",
      );
    next = appendTransaction(
      next,
      {
        id: uid(),
        title:
          `${debt.direction === "lent" ? "Выдал в долг" : "Получил в долг"}: ${debt.name}`.slice(
            0,
            120,
          ),
        type,
        date,
        amount: input.amount!,
        accountId: account.id,
        category: "other",
        debtId: debt.id,
        debtAction: "issue",
      },
      today,
    );
  }
  validateDebts(next, today);
  checkCurrencyAmounts(next, today);
  return next;
}

export interface DebtRepaymentInput {
  debtId: string;
  accountId: string;
  amount: number;
  date: string;
}
export function repayDebt(
  state: FinanceState,
  input: DebtRepaymentInput,
  today = localDate(),
): FinanceState {
  const debt = state.debts?.find((entry) => entry.id === input.debtId);
  ensure(debt, "Долг уже удалён.");
  checkAmount(input.amount);
  ensure(
    validDate(input.date) && input.date >= debt.startsOn && input.date <= today,
    "Укажите дату возврата между началом долга и сегодня.",
  );
  ensure(
    input.amount <= debtBalance(state, debt, input.date),
    "Сумма возврата превышает остаток долга на эту дату.",
  );
  const account = state.accounts.find((entry) => entry.id === input.accountId);
  ensure(
    account?.kind === "spending" &&
      accountCurrency(state, account.id) === debt.currency,
    "Выберите повседневный счёт в валюте долга.",
  );
  const type = debtTransactionType(debt, "repay");
  if (type === "expense")
    ensure(
      accountBalance(state, account.id, input.date) >= input.amount,
      "На выбранном счёте недостаточно денег для возврата долга.",
    );
  const next = appendTransaction(
    state,
    {
      id: uid(),
      title: `Возврат долга: ${debt.name}`.slice(0, 120),
      type,
      date: input.date,
      amount: input.amount,
      accountId: account.id,
      category: "other",
      debtId: debt.id,
      debtAction: "repay",
    },
    today,
  );
  validateDebts(next, today);
  return next;
}

export function deleteDebt(state: FinanceState, id: string): FinanceState {
  ensure(
    state.debts?.some((debt) => debt.id === id),
    "Долг уже удалён.",
  );
  ensure(
    !state.transactions.some((transaction) => transaction.debtId === id),
    "У долга есть движения денег. Сначала удалите связанные операции; закрытый долг можно оставить в истории.",
  );
  return { ...state, debts: state.debts!.filter((debt) => debt.id !== id) };
}

export interface CreditRepaymentInput {
  accountId: string;
  fromAccountId: string;
  amount: number;
  toAmount?: number;
  date: string;
}
export function repayCredit(
  state: FinanceState,
  input: CreditRepaymentInput,
  today = localDate(),
): FinanceState {
  const credit = state.accounts.find(
    (account) => account.id === input.accountId,
  );
  const source = state.accounts.find(
    (account) => account.id === input.fromAccountId,
  );
  ensure(credit?.kind === "credit", "Кредитная карта не найдена.");
  ensure(
    source?.kind === "spending",
    "Выберите повседневный счёт для погашения карты.",
  );
  ensure(
    validDate(input.date) && input.date <= today,
    "Укажите дату погашения не позднее сегодняшней.",
  );
  checkAmount(input.amount);
  const sameCurrency =
    accountCurrency(state, credit.id) === accountCurrency(state, source.id);
  ensure(
    sameCurrency || input.toAmount !== undefined,
    "Укажите сумму зачисления в валюте кредитной карты.",
  );
  const received = input.toAmount ?? input.amount;
  checkAmount(received);
  ensure(
    received <= creditOutstanding(state, credit, input.date),
    "Погашение превышает задолженность по карте на эту дату.",
  );
  const next = appendTransaction(
    state,
    {
      id: uid(),
      type: "transfer",
      title: `Погашение: ${credit.name}`.slice(0, 120),
      amount: input.amount,
      toAmount: received,
      date: input.date,
      category: "other",
      accountId: source.id,
      toAccountId: credit.id,
    },
    today,
  );
  validateCreditAccounts(next, today);
  return next;
}
