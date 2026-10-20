import { validateScenarioCurrencies } from "./scenarios";
import {
  accountToBase,
  accountCurrency,
  baseCurrency,
  convertMoney,
  MAX_MONEY,
  receivedAmount,
  toBase,
  type CurrencyCode,
} from "./currency";
import { hasAccountForecast } from "./accountForecastSettings";
import { accountBalances } from "./accountBalances";
import { goalContributionOccurrences, goalSaved } from "./goals";
import { goalFundCycleForPayment } from "./goalFunds";
import { overduePayments, paymentPending, upcoming } from "./payments";
import { localDate, shiftDate, validDate } from "../shared/lib/dates";
import { incomeOccurrences } from "./incomes";
import { projectedDebtObligations } from "./debts";
import type { FinanceState, ForecastPreferences, SavedScenario } from "./types";
import {
  forecastAccounts,
  spendingLegAmount,
  type AccountForecast,
  type ForecastLeg,
} from "./accountForecast";
import {
  pendingProjection,
  spendingHeld,
  pendingHolds,
  transactionStatus,
} from "./transactionStatus";

export type ForecastHorizon = 30 | 60 | 90;
export const DEFAULT_FORECAST: ForecastPreferences = {
  dailySpending: 0,
  goalDay: 31,
};
export interface PurchaseScenario {
  amount: number;
  date: string;
  /** With an account, amount is expressed in that account's currency. */
  accountId?: string;
}
export interface ForecastEvent {
  id: string;
  type:
    | "income"
    | "payment"
    | "goal"
    | "fund"
    | "daily"
    | "purchase"
    | "expense"
    | "debt"
    | "credit"
    | "transfer";
  name: string;
  // Signed change in the balance of spending accounts, in base-currency minor units.
  amount: number;
  sourceId?: string;
  occurrenceDate: string;
  versionId?: string;
  overdue?: boolean;
  pendingId?: string;
  releaseHeld?: number;
  legs?: ForecastLeg[];
  unallocated?: boolean;
  goalAllocation?: { currency: CurrencyCode; amount: number };
}
export interface ForecastDay {
  date: string;
  openingBalance: number;
  balance: number;
  projectedBalance: number;
  held: number;
  available: number;
  events: ForecastEvent[];
  /** Cumulative signed influence of events without an account assignment. */
  unallocated: number;
  accountAvailable: number;
  valuationRounding: number;
}
export interface ForecastResult {
  days: ForecastDay[];
  openingBalance: number;
  closingBalance: number;
  openingHeld: number;
  openingAvailable: number;
  closingAvailable: number;
  minimum: ForecastDay;
  firstShortfall?: ForecastDay;
  firstBelowBuffer?: ForecastDay;
  buffer: number;
  income: number;
  fundReturns: number;
  outflow: number;
  accounts: AccountForecast[];
  unallocatedEvents: ForecastEvent[];
  warnings: string[];
  accountBased: boolean;
}

/** End-of-day projection; it never posts transactions or changes goal balances. */
export function forecast(
  state: FinanceState,
  horizon: ForecastHorizon,
  today = localDate(),
  purchase?: PurchaseScenario,
  scenario?: SavedScenario,
  options: { dailyStart?: string } = {},
): ForecastResult {
  if (![30, 60, 90].includes(horizon) || !validDate(today))
    throw new Error(
      "Укажите период прогноза 30, 60 или 90 дней и корректную дату.",
    );
  if (scenario) validateScenarioCurrencies(state, scenario);
  if (options.dailyStart && !validDate(options.dailyStart))
    throw new Error("Укажите корректную дату начала повседневных расходов.");
  const end = shiftDate(today, horizon);
  if (
    today < "2000-01-01" ||
    !validDate(shiftDate(end, -1)) ||
    shiftDate(end, -1) > "2100-12-31"
  )
    throw new Error(
      "Прогноз выходит за 31 декабря 2100 года. Для выбранной даты этот горизонт недоступен.",
    );
  if (
    purchase &&
    (!Number.isSafeInteger(purchase.amount) ||
      purchase.amount <= 0 ||
      purchase.amount > MAX_MONEY ||
      !validDate(purchase.date) ||
      purchase.date < today ||
      purchase.date >= end)
  )
    throw new Error(
      "Укажите положительную стоимость и дату покупки внутри прогноза.",
    );
  if (
    purchase?.accountId &&
    !state.accounts.some(
      (account) =>
        account.id === purchase.accountId &&
        account.kind === "spending" &&
        !account.archived,
    )
  )
    throw new Error("Для покупки выберите действующий повседневный счёт.");

  const preferences = state.settings.forecast ?? DEFAULT_FORECAST;
  const accountBased = state.version >= 8 || hasAccountForecast(preferences);
  const change = (source: "income" | "payment" | "goal", id: string) =>
    scenario?.changes.find(
      (c) => c.enabled !== false && c.source === source && c.sourceId === id,
    );
  const dailySpending = scenario?.dailySpending ?? preferences.dailySpending;
  const byDate = new Map<string, ForecastEvent[]>();
  const add = (date: string, event: ForecastEvent) => {
    if (date >= today && date < end) {
      const events = byDate.get(date);
      if (events) events.push(event);
      else byDate.set(date, [event]);
    }
  };
  // Keep original occurrence identity when shifting dates, including early receipts.
  for (const {
    plan,
    date,
    occurrenceDate,
    versionId,
    pending,
  } of incomeOccurrences(
    state,
    scenario ? shiftDate(today, -90) : today,
    scenario ? shiftDate(end, 90) : end,
    today,
  )) {
    if (pending) continue;
    const override = change("income", plan.id);
    const amount = override?.amount ?? plan.amount;
    if (amount === 0) continue;
    add(shiftDate(date, override?.delayDays ?? 0), {
      id: `income:${plan.id}:${versionId}:${occurrenceDate}`,
      type: "income",
      name: plan.name,
      amount: accountToBase(state, amount, plan.accountId),
      legs: [{ accountId: plan.accountId, amount }],
      sourceId: plan.id,
      occurrenceDate,
      versionId,
    });
  }
  const goalEvents = new Map(
    state.goals.map((goal) => [
      goal.id,
      goalContributionOccurrences(state, goal, today, end, today, {
        legacyDay: preferences.goalDay,
        amount: change("goal", goal.id)?.amount,
      }),
    ]),
  );
  for (const { payment, date, versionId, paid, skipped } of [
    ...overduePayments(state, today),
    ...upcoming(state, today, end),
  ]) {
    if (paid || skipped || paymentPending(state, payment, date, versionId))
      continue;
    const overdue = date < today;
    // A future price change must not rewrite existing arrears.
    const amount = overdue
      ? payment.amount
      : (change("payment", payment.id)?.amount ?? payment.amount);
    if (amount === 0) continue;
    const cycle = goalFundCycleForPayment(state, payment.id, date, versionId);
    const goal =
      cycle?.status === "active"
        ? state.goals.find((entry) => entry.id === cycle.goalId)
        : undefined;
    if (goal) {
      // Contributions are separate outflows. Return only the allocation available
      // by this exact obligation; the full expense remains below.
      const prepared =
        goalSaved(state, goal, today) +
        (goalEvents.get(goal.id) ?? [])
          .filter((entry) => entry.date <= (overdue ? today : date))
          .reduce((sum, entry) => sum + entry.amount, 0);
      const returned = Math.min(amount, Math.max(0, prepared));
      if (returned)
        add(overdue ? today : date, {
          id: `fund:${cycle!.id}`,
          type: "fund",
          name: `Из фонда: ${goal.name}`,
          amount: accountToBase(state, returned, payment.accountId),
          sourceId: payment.id,
          occurrenceDate: date,
          versionId,
          overdue,
          goalAllocation: {
            currency: goal.currency ?? "RUB",
            amount: -returned,
          },
          legs: preferences.goalAccounts?.find(
            (assignment) => assignment.goalId === goal.id,
          )
            ? [
                {
                  accountId: preferences.goalAccounts.find(
                    (assignment) => assignment.goalId === goal.id,
                  )!.toAccountId,
                  amount: -returned,
                },
                { accountId: payment.accountId, amount: returned },
              ]
            : undefined,
          unallocated: !preferences.goalAccounts?.some(
            (assignment) => assignment.goalId === goal.id,
          ),
        });
    }
    add(overdue ? today : date, {
      id: `payment:${payment.id}:${versionId ?? "legacy"}:${date}`,
      type: "payment",
      name: payment.name,
      amount: -accountToBase(state, amount, payment.accountId),
      sourceId: payment.id,
      occurrenceDate: date,
      versionId,
      overdue,
      legs: [{ accountId: payment.accountId, amount: -amount }],
    });
  }

  // Linked intentions replace the original plan event, including an undated
  // or late income that must not reappear as a reliable planned receipt.
  const spending = new Set(
    state.accounts
      .filter((account) => account.kind === "spending")
      .map((account) => account.id),
  );
  for (const transaction of state.transactions) {
    if (transactionStatus(transaction) !== "pending") continue;
    const date = pendingProjection(transaction, today);
    if (!date) continue;
    const outgoing =
      transaction.type !== "income" && spending.has(transaction.accountId)
        ? accountToBase(state, transaction.amount, transaction.accountId)
        : 0;
    const incoming =
      transaction.type === "income" && spending.has(transaction.accountId)
        ? accountToBase(state, transaction.amount, transaction.accountId)
        : transaction.type === "transfer" &&
            transaction.toAccountId &&
            spending.has(transaction.toAccountId)
          ? accountToBase(
              state,
              receivedAmount(transaction),
              transaction.toAccountId,
            )
          : 0;
    // An overdue incoming transfer is not reliable spending money. Keep the
    // source reservation and both legs together until a new date or a fact.
    if (
      transaction.type === "transfer" &&
      transaction.expectedDate! < today &&
      outgoing === 0 &&
      incoming > 0
    )
      continue;
    add(date, {
      id: `pending:${transaction.id}`,
      pendingId: transaction.id,
      type:
        transaction.type === "transfer"
          ? "transfer"
          : transaction.type === "income" || incoming > outgoing
            ? "income"
            : "expense",
      name: transaction.title,
      amount: incoming - outgoing,
      releaseHeld: outgoing,
      sourceId: transaction.id,
      occurrenceDate:
        transaction.occurrenceDate ??
        transaction.incomeOccurrenceDate ??
        transaction.expectedDate!,
      overdue: transaction.expectedDate! < today,
      legs: [
        {
          accountId: transaction.accountId,
          amount:
            transaction.type === "income"
              ? transaction.amount
              : -transaction.amount,
          releaseHeld: transaction.type === "income" ? 0 : transaction.amount,
        },
        ...(transaction.type === "transfer" && transaction.toAccountId
          ? [
              {
                accountId: transaction.toAccountId,
                amount: receivedAmount(transaction),
              },
            ]
          : []),
      ],
    });
  }

  for (const obligation of projectedDebtObligations(
    state,
    today,
    shiftDate(end, -1),
  )) {
    const assignment = preferences.repaymentAccounts?.find(
      (entry) =>
        entry.kind === obligation.kind && entry.sourceId === obligation.id,
    );
    const plannedCoverage =
      obligation.kind === "credit"
        ? (preferences.transfers ?? [])
            .filter(
              (transfer) =>
                transfer.toAccountId === obligation.id &&
                transfer.date >= today &&
                transfer.date <=
                  (obligation.date < today ? today : obligation.date),
            )
            .reduce((sum, transfer) => sum + receivedAmount(transfer), 0)
        : 0;
    const amount = Math.max(0, obligation.amount - plannedCoverage);
    if (!amount) continue;
    add(obligation.date < today ? today : obligation.date, {
      id: `${obligation.kind}:${obligation.id}`,
      type: obligation.kind,
      name: obligation.name,
      amount: -accountToBase(state, amount, obligation.accountId),
      sourceId: obligation.id,
      occurrenceDate: obligation.date,
      overdue: obligation.date < today,
      legs: assignment
        ? [
            { accountId: assignment.accountId, amount: -amount },
            ...(obligation.kind === "credit"
              ? [{ accountId: obligation.id, amount }]
              : []),
          ]
        : undefined,
      unallocated: !assignment,
    });
  }

  for (const goal of state.goals) {
    const assignment = preferences.goalAccounts?.find(
      (entry) => entry.goalId === goal.id,
    );
    for (const event of goalEvents.get(goal.id) ?? []) {
      add(event.date, {
        id: `goal:${goal.id}:${event.versionId}:${event.occurrenceDate}`,
        type: "goal",
        name: goal.name,
        amount: -toBase(state, event.amount, goal.currency),
        sourceId: goal.id,
        occurrenceDate: event.occurrenceDate,
        versionId: event.versionId,
        overdue: event.occurrenceDate < today,
        legs: assignment
          ? [
              { accountId: assignment.fromAccountId, amount: -event.amount },
              { accountId: assignment.toAccountId, amount: event.amount },
            ]
          : undefined,
        unallocated: !assignment,
        goalAllocation: {
          currency: goal.currency ?? "RUB",
          amount: event.amount,
        },
      });
    }
  }
  // Today's actual expenses are already included in the opening balance.
  for (let date = shiftDate(today, 1); date < end; date = shiftDate(date, 1))
    if (
      dailySpending > 0 &&
      (!options.dailyStart || date >= options.dailyStart)
    )
      add(date, {
        id: `daily:${date}`,
        type: "daily",
        name: "Повседневные расходы",
        amount: -dailySpending,
        occurrenceDate: date,
        legs: preferences.dailyAccountId
          ? [
              {
                accountId: preferences.dailyAccountId,
                amount: -convertMoney(
                  state,
                  dailySpending,
                  baseCurrency(state),
                  accountCurrency(state, preferences.dailyAccountId),
                ),
              },
            ]
          : undefined,
        unallocated: !preferences.dailyAccountId,
      });
  for (const event of scenario?.events ?? []) {
    if (event.enabled === false) continue;
    add(event.date, {
      id: `scenario:${event.id}`,
      type: event.type,
      name: event.name,
      amount: event.type === "income" ? event.amount : -event.amount,
      occurrenceDate: event.date,
      legs: event.accountId
        ? [
            {
              accountId: event.accountId,
              amount: convertMoney(
                state,
                event.type === "income" ? event.amount : -event.amount,
                baseCurrency(state),
                accountCurrency(state, event.accountId),
              ),
            },
          ]
        : undefined,
      unallocated: !event.accountId,
    });
  }
  const warnings: string[] = [];
  for (const transfer of preferences.transfers ?? []) {
    if (transfer.date < today) {
      warnings.push(
        `Плановый перевод «${transfer.name}» просрочен: задайте новую дату или удалите его.`,
      );
      continue;
    }
    const legs = [
      { accountId: transfer.accountId, amount: -transfer.amount },
      {
        accountId: transfer.toAccountId,
        amount: receivedAmount(transfer),
      },
    ];
    add(transfer.date, {
      id: `transfer:${transfer.id}`,
      type: "transfer",
      name: transfer.name,
      amount: spendingLegAmount(state, legs),
      occurrenceDate: transfer.date,
      legs,
    });
  }
  if (purchase)
    add(purchase.date, {
      id: "purchase",
      type: "purchase",
      name: "Покупка в сценарии",
      amount: purchase.accountId
        ? -accountToBase(state, purchase.amount, purchase.accountId)
        : -purchase.amount,
      occurrenceDate: purchase.date,
      legs: purchase.accountId
        ? [{ accountId: purchase.accountId, amount: -purchase.amount }]
        : undefined,
      unallocated: !purchase.accountId,
    });

  const balances = accountBalances(state, today);
  const openingBalance = state.accounts
    .filter((a) => a.kind === "spending")
    .reduce(
      (sum, a) => sum + accountToBase(state, balances.get(a.id) ?? 0, a.id),
      0,
    );
  const days: ForecastDay[] = [];
  const nativeHolds = pendingHolds(state);
  let openingHeld = spendingHeld(state);
  if (accountBased)
    openingHeld =
      openingBalance -
      state.accounts
        .filter((account) => account.kind === "spending")
        .reduce(
          (sum, account) =>
            sum +
            accountToBase(
              state,
              (balances.get(account.id) ?? 0) -
                (nativeHolds.get(account.id) ?? 0),
              account.id,
            ),
          0,
        );
  let balance = openingBalance,
    held = openingHeld,
    income = 0,
    fundReturns = 0,
    outflow = 0;
  for (let date = today; date < end; date = shiftDate(date, 1)) {
    const events = byDate.get(date) ?? [];
    const opening = balance;
    for (const event of events) {
      balance += event.amount;
      held -= event.releaseHeld ?? 0;
      if (event.type === "fund") fundReturns += event.amount;
      else if (event.type === "transfer") continue;
      else if (event.amount > 0) income += event.amount;
      else outflow -= event.amount;
    }
    days.push({
      date,
      openingBalance: opening,
      balance,
      projectedBalance: balance,
      held,
      available: balance - held,
      events,
      unallocated: 0,
      accountAvailable: 0,
      valuationRounding: 0,
    });
  }
  const accounts = forecastAccounts(state, days, today);
  const allocation = new Map<string, number>();
  for (const goal of state.goals) {
    const currency = goal.currency ?? "RUB";
    allocation.set(
      currency,
      (allocation.get(currency) ?? 0) + goalSaved(state, goal, today),
    );
  }
  for (const [index, day] of days.entries()) {
    for (const event of day.events) {
      if (event.goalAllocation && !event.unallocated) {
        const { currency, amount } = event.goalAllocation;
        allocation.set(currency, (allocation.get(currency) ?? 0) + amount);
      }
      if (event.type === "transfer" || event.type === "fund") {
        const source = accounts.find(
          (entry) => entry.accountId === event.legs?.[0]?.accountId,
        );
        if (source && source.days[index].available < 0)
          warnings.push(
            `Для перевода «${event.name}» ${day.date} недостаточно денег на счёте «${source.name}».`,
          );
      }
    }
    // Only assigned contributions can be compared with actual savings accounts.
    // Missing assignments are already exposed separately and prohibit a positive
    // account-level purchase conclusion.
    for (const [currency, reserved] of allocation) {
      const savings = accounts
        .filter(
          (account) =>
            account.kind === "savings" && account.currency === currency,
        )
        .reduce((sum, account) => sum + account.days[index].available, 0);
      const message = `В прогнозе накопления ${currency} не обеспечивают цели. Измените плановые переводы или взносы.`;
      if (savings < reserved && !warnings.includes(message))
        warnings.push(message);
    }
  }
  let unallocated = 0;
  let previousBalance = openingBalance;
  for (const [index, day] of days.entries()) {
    unallocated += day.events.reduce(
      (sum, event) => sum + (event.unallocated ? event.amount : 0),
      0,
    );
    day.accountAvailable = accounts
      .filter((account) => account.kind === "spending")
      .reduce(
        (sum, account) =>
          sum +
          accountToBase(
            state,
            account.days[index].available,
            account.accountId,
          ),
        0,
      );
    day.unallocated = unallocated;
    if (accountBased) {
      const accountBalance = accounts
        .filter((account) => account.kind === "spending")
        .reduce(
          (sum, account) =>
            sum +
            accountToBase(
              state,
              account.days[index].balance,
              account.accountId,
            ),
          0,
        );
      day.openingBalance = previousBalance;
      day.balance = day.projectedBalance = accountBalance + unallocated;
      day.available = day.accountAvailable + unallocated;
      day.held = day.balance - day.available;
      day.valuationRounding =
        day.balance -
        previousBalance -
        day.events.reduce((sum, event) => sum + event.amount, 0);
      previousBalance = day.balance;
    } else {
      day.valuationRounding =
        day.available - day.accountAvailable - unallocated;
    }
  }
  balance = days[days.length - 1].balance;
  held = days[days.length - 1].held;
  const unallocatedEvents = days.flatMap((day) =>
    day.events.filter((event) => event.unallocated),
  );
  return {
    days,
    openingBalance,
    closingBalance: balance,
    openingHeld,
    openingAvailable: openingBalance - openingHeld,
    closingAvailable: balance - held,
    minimum: days.reduce((min, day) =>
      day.available < min.available ? day : min,
    ),
    firstShortfall: days.find((day) => day.available < 0),
    firstBelowBuffer: days.find((day) => day.available < state.settings.buffer),
    buffer: state.settings.buffer,
    income,
    fundReturns,
    outflow,
    accounts,
    unallocatedEvents,
    warnings,
    accountBased,
  };
}
