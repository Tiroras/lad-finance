import { dateInMonth, localDate, uid, validDate } from "../finance";
import { incomeReceived } from "../incomes";
import type { FinanceState, PlannedIncome } from "../types";
import { saveTransaction } from "./transactions";
import { checkAmount, checkName, ensure } from "./validation";

export type IncomeInput = Omit<PlannedIncome, "id"> & { id?: string };
export function savePlannedIncome(
  state: FinanceState,
  input: IncomeInput,
): FinanceState {
  const plans = state.plannedIncomes ?? [],
    original = plans.find((p) => p.id === input.id);
  ensure(!input.id || original, "Планируемый доход уже удалён.");
  ensure(
    original || plans.length < 200,
    "Можно создать не более 200 планируемых доходов.",
  );
  checkName(input.name);
  checkAmount(input.amount);
  ensure(
    validDate(input.date) &&
      input.date >= "2000-01-01" &&
      input.date <= "2100-12-31",
    "Укажите дату дохода от 2000 до 2100 года: ГГГГ-ММ-ДД.",
  );
  ensure(
    state.accounts.some(
      (a) => a.id === input.accountId && a.kind === "spending",
    ),
    "Выберите повседневный счёт.",
  );
  ensure(
    ["once", "monthly"].includes(input.repeat),
    "Выберите периодичность дохода.",
  );
  ensure(
    !original ||
      original.repeat === input.repeat ||
      !state.transactions.some((t) => t.plannedIncomeId === original.id),
    "У дохода уже есть поступления. Для другой периодичности создайте новый план.",
  );
  const plan: PlannedIncome = {
    ...input,
    name: input.name.trim(),
    id: original?.id ?? uid(),
  };
  return {
    ...state,
    plannedIncomes: original
      ? plans.map((p) => (p.id === plan.id ? plan : p))
      : [...plans, plan],
  };
}
export function deletePlannedIncome(
  state: FinanceState,
  id: string,
): FinanceState {
  return {
    ...state,
    plannedIncomes: (state.plannedIncomes ?? []).filter((p) => p.id !== id),
    transactions: state.transactions.map((t) =>
      t.plannedIncomeId === id
        ? { ...t, plannedIncomeId: undefined, incomeOccurrenceDate: undefined }
        : t,
    ),
  };
}
export function receivePlannedIncome(
  state: FinanceState,
  id: string,
  date: string,
  today = localDate(),
  transactionId?: string,
): FinanceState {
  const plan = state.plannedIncomes?.find((p) => p.id === id);
  ensure(plan, "Планируемый доход уже удалён.");
  ensure(
    validDate(date) &&
      date >= plan.date &&
      (plan.repeat === "once"
        ? date === plan.date
        : date === dateInMonth(date, Number(plan.date.slice(-2)))),
    "Дата не соответствует планируемому доходу.",
  );
  if (incomeReceived(state, plan, date, today)) return state;
  if (transactionId) {
    const transaction = state.transactions.find((t) => t.id === transactionId);
    ensure(
      transaction &&
        transaction.type === "income" &&
        !transaction.plannedIncomeId &&
        transaction.amount === plan.amount &&
        transaction.accountId === plan.accountId &&
        transaction.date <= today,
      "Запись больше не подходит для этого поступления.",
    );
    return saveTransaction(
      state,
      { ...transaction, plannedIncomeId: id, incomeOccurrenceDate: date },
      today,
    );
  }
  return saveTransaction(
    state,
    {
      type: "income",
      title: plan.name,
      amount: plan.amount,
      date: today,
      category: "other",
      accountId: plan.accountId,
      plannedIncomeId: id,
      incomeOccurrenceDate: date,
    },
    today,
  );
}
