import { accountCurrency, MAX_MONEY } from "./currency";
import { validDate } from "../shared/lib/dates";
import type { FinanceState, ForecastPreferences } from "./types";

export function hasAccountForecast(preferences?: ForecastPreferences) {
  return (
    !!preferences &&
    [
      preferences.dailyAccountId,
      preferences.goalAccounts,
      preferences.repaymentAccounts,
      preferences.transfers,
    ].some((value) => value !== undefined)
  );
}

/** Assignments are plans only: validating or saving them never posts money. */
export function validateAccountForecast(
  state: FinanceState,
  preferences = state.settings.forecast,
) {
  if (!preferences) return;
  const fail = (message: string): never => {
    throw new Error(message);
  };
  const account = (id: string) =>
    state.accounts.find((item) => item.id === id && !item.archived) ??
    fail(
      "Счёт прогноза недоступен. Выберите активный счёт в настройках прогноза.",
    );
  const spending = (id: string) => {
    const item = account(id);
    if (item.kind !== "spending")
      fail("Для расходов прогноза выберите повседневный счёт.");
    return item;
  };
  const sameCurrency = (ids: string[], currency: string) => {
    if (ids.some((id) => accountCurrency(state, id) !== currency))
      fail(
        "Счета взноса или погашения должны иметь валюту обязательства. Обмен запланируйте отдельным переводом.",
      );
  };
  if (preferences.dailyAccountId) spending(preferences.dailyAccountId);
  const goals = preferences.goalAccounts ?? [];
  const repayments = preferences.repaymentAccounts ?? [];
  const transfers = preferences.transfers ?? [];
  if (goals.length > 100 || repayments.length > 230 || transfers.length > 200)
    fail(
      "В прогнозе допустимо 100 назначений целей, 230 погашений и 200 переводов. Удалите ненужные строки.",
    );
  if (
    new Set(goals.map((item) => item.goalId)).size !== goals.length ||
    new Set(repayments.map((item) => `${item.kind}:${item.sourceId}`)).size !==
      repayments.length ||
    new Set(transfers.map((item) => item.id)).size !== transfers.length
  )
    fail(
      "В прогнозе повторяются назначения или переводы. Оставьте по одному назначению для каждого обязательства.",
    );
  for (const assignment of goals) {
    const goal =
      state.goals.find((item) => item.id === assignment.goalId) ??
      fail("Цель прогноза удалена. Обновите назначения счетов.");
    spending(assignment.fromAccountId);
    if (account(assignment.toAccountId).kind !== "savings")
      fail("Для зачисления взноса выберите накопительный счёт.");
    sameCurrency(
      [assignment.fromAccountId, assignment.toAccountId],
      goal.currency ?? "RUB",
    );
  }
  for (const assignment of repayments) {
    spending(assignment.accountId);
    if (assignment.kind !== "credit" && assignment.kind !== "debt")
      fail("Неизвестный вид погашения в прогнозе.");
    const obligation =
      assignment.kind === "credit"
        ? state.accounts.find(
            (item) =>
              item.id === assignment.sourceId &&
              item.kind === "credit" &&
              !item.archived,
          )
        : state.debts?.find(
            (item) =>
              item.id === assignment.sourceId && item.direction === "borrowed",
          );
    if (!obligation)
      fail("Обязательство прогноза удалено. Обновите назначения погашений.");
    const obligationAccount =
      assignment.kind === "credit"
        ? assignment.sourceId
        : (obligation as NonNullable<FinanceState["debts"]>[number]).accountId;
    sameCurrency(
      [assignment.accountId],
      accountCurrency(state, obligationAccount),
    );
  }
  for (const transfer of transfers) {
    if (
      !transfer.id ||
      transfer.id.length > 100 ||
      !transfer.name.trim() ||
      transfer.name.length > 120
    )
      fail("Укажите название планового перевода до 120 символов.");
    if (
      !validDate(transfer.date) ||
      transfer.date < "2000-01-01" ||
      transfer.date > "2100-12-31"
    )
      fail("Дата планового перевода должна быть между 2000 и 2100 годами.");
    if (account(transfer.accountId).kind === "credit")
      fail(
        "Для планового перевода выберите собственные деньги на повседневном или накопительном счёте.",
      );
    account(transfer.toAccountId);
    if (transfer.accountId === transfer.toAccountId)
      fail("Для перевода нужны два разных счёта.");
    const same =
      accountCurrency(state, transfer.accountId) ===
      accountCurrency(state, transfer.toAccountId);
    const received = transfer.toAmount ?? transfer.amount;
    if (
      ![transfer.amount, received].every(
        (value) =>
          Number.isSafeInteger(value) && value > 0 && value <= MAX_MONEY,
      )
    )
      fail(
        "Укажите положительные суммы планового перевода в допустимом диапазоне.",
      );
    if (!same && transfer.toAmount === undefined)
      fail("Для валютного перевода укажите обе фактические суммы.");
    if (same && received !== transfer.amount)
      fail("Суммы перевода в одной валюте должны совпадать.");
  }
}
