import { accountCurrency } from "../currency";
import { dateInMonth, localDate, uid, validDate } from "../finance";
import { canLinkIncome, incomeReceived } from "../incomes";
import {
  isScheduledDate,
  scheduleSchema,
  validateSchedules,
} from "../recurrence";
import type { FinanceState, PlannedIncome } from "../types";
import { saveTransaction } from "./transactions";
import {
  checkAmount,
  checkCurrencyAmounts,
  checkName,
  ensure,
} from "./validation";

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
  ensure(
    !original ||
      accountCurrency(state, original.accountId) ===
        accountCurrency(state, input.accountId),
    "Для смены валюты создайте новый план. Валюта существующего плана сохраняется для истории и сценариев.",
  );
  checkName(input.name);
  checkAmount(input.amount);
  ensure(
    !input.schedule || scheduleSchema.safeParse(input.schedule).success,
    "Укажите корректный интервал повторения и дату начала.",
  );
  ensure(
    !original ||
      JSON.stringify(original.schedule) === JSON.stringify(input.schedule),
    "Для другой периодичности создайте новый план дохода, чтобы сохранить историю поступлений.",
  );
  ensure(
    !input.schedule ||
      (input.repeat !== "once" && input.schedule.anchor === input.date),
    "Дата первого поступления должна совпадать с началом повторений.",
  );
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
  const next: FinanceState = {
    ...state,
    plannedIncomes: original
      ? plans.map((p) => (p.id === plan.id ? plan : p))
      : [...plans, plan],
  };

  validateSchedules(next);
  checkCurrencyAmounts(next, localDate());
  return next;
}
export function deletePlannedIncome(
  state: FinanceState,
  id: string,
): FinanceState {
  return {
    ...state,
    settings:
      state.settings.spendableIncomeId === id
        ? { ...state.settings, spendableIncomeId: undefined }
        : state.settings,
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
        : plan.schedule
          ? isScheduledDate(plan.schedule, date)
          : date === dateInMonth(date, Number(plan.date.slice(-2)))),
    "Дата не соответствует планируемому доходу.",
  );
  if (incomeReceived(state, plan, date, today)) return state;
  if (transactionId) {
    const transaction = state.transactions.find((t) => t.id === transactionId);
    ensure(
      transaction && canLinkIncome(transaction, plan, today),
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
