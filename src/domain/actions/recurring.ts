import { assertGoalFundPlansPreserved, validateGoalFunds } from "../goalFunds";
import { accountCurrency } from "../currency";
import { validateAccountArchives } from "../accountArchive";
import {
  dateInMonth,
  localDate,
  monthKey,
  shiftDate,
  uid,
  validDate,
} from "../finance";
import {
  canLinkPayment,
  legacyPaymentTerms,
  paymentOccurrenceKey,
  paymentPending,
  paymentVersions,
  resolvePaymentOccurrence,
  upcoming,
} from "../payments";
import { scheduleSchema, validateSchedules } from "../recurrence";
import type { FinanceState, PaymentTermsVersion, Recurring } from "../types";
import { postPendingTransaction, saveTransaction } from "./transactions";
import { isPosted, transactionStatus } from "../transactionStatus";
import { validatePlanHistory } from "../planHistory";
import { pendingLinkError } from "../pendingLinks";
import {
  checkAmount,
  checkCurrencyAmounts,
  checkDay,
  checkName,
  ensure,
} from "./validation";

export type RecurringInput = Pick<
  Recurring,
  | "name"
  | "amount"
  | "day"
  | "kind"
  | "category"
  | "accountId"
  | "startsOn"
  | "skippedMonths"
  | "schedule"
  | "skippedDates"
> & { id?: string; effectiveFrom?: string };

export function paymentTermsChanged(
  original: Recurring,
  input: Pick<
    Recurring,
    "amount" | "day" | "accountId" | "category" | "schedule"
  >,
) {
  return (
    original.amount !== input.amount ||
    original.day !== input.day ||
    original.accountId !== input.accountId ||
    original.category !== input.category ||
    original.schedule?.unit !== input.schedule?.unit ||
    original.schedule?.interval !== input.schedule?.interval ||
    original.schedule?.anchor !== input.schedule?.anchor
  );
}

export interface PaymentTransitionConflict {
  date: string;
  kind: "posted" | "pending" | "skipped";
}

/** The UI previews this, and the action repeats it against the current state. */
export function paymentTransitionPreview(
  state: FinanceState,
  id: string,
  effectiveFrom: string,
  today = localDate(),
) {
  const payment = state.recurring.find((item) => item.id === id);
  const conflicts: PaymentTransitionConflict[] = [];
  if (!payment || !validDate(effectiveFrom))
    return {
      conflicts,
      affected: [] as { date: string; amount: number }[],
      suggestedFrom: undefined,
      replacedVersions: [] as { id: string; effectiveFrom: string }[],
    };
  for (const transaction of state.transactions) {
    if (
      transaction.recurringId !== id ||
      !transaction.occurrenceDate ||
      transactionStatus(transaction) === "cancelled"
    )
      continue;
    const terms =
      payment.versions?.find(
        (version) =>
          version.id === (transaction.recurringVersionId ?? "legacy"),
      ) ?? legacyPaymentTerms(payment);
    const oldRule = terms.history?.find(
      (rule) => monthKey(transaction.occurrenceDate!) <= rule.untilMonth,
    );
    const originalDate = terms.schedule
      ? transaction.occurrenceDate
      : dateInMonth(transaction.occurrenceDate, oldRule?.day ?? terms.day);
    if (originalDate < effectiveFrom) continue;
    conflicts.push({
      date: originalDate,
      kind: transactionStatus(transaction) === "pending" ? "pending" : "posted",
    });
  }
  for (const version of paymentVersions(payment, today)) {
    if (version.voided) continue;
    for (const date of version.skippedDates ?? [])
      if (date >= effectiveFrom) conflicts.push({ date, kind: "skipped" });
    for (const month of version.skippedMonths ?? []) {
      const rule = version.history?.find((entry) => month <= entry.untilMonth);
      const date = dateInMonth(`${month}-01`, rule?.day ?? version.day);
      if (date >= effectiveFrom) conflicts.push({ date, kind: "skipped" });
    }
  }
  conflicts.sort((a, b) => a.date.localeCompare(b.date));
  const end = shiftDate(today, 90);
  const affected =
    effectiveFrom < end
      ? upcoming({ ...state, recurring: [payment] }, effectiveFrom, end)
          .filter((entry) => !entry.paid && !entry.skipped)
          .map(({ date, payment: terms }) => ({ date, amount: terms.amount }))
      : [];
  return {
    conflicts,
    affected,
    replacedVersions: (payment.versions ?? [])
      .filter(
        (version) => !version.voided && version.effectiveFrom >= effectiveFrom,
      )
      .map(({ id, effectiveFrom }) => ({ id, effectiveFrom })),
    suggestedFrom: conflicts.length
      ? shiftDate(conflicts[conflicts.length - 1].date, 1)
      : undefined,
  };
}

export function recurringPausePreview(
  state: FinanceState,
  id: string,
  today = localDate(),
) {
  return paymentTransitionPreview(state, id, shiftDate(today, 1), today);
}

function assertTransition(
  state: FinanceState,
  payment: Recurring,
  from: string,
  today: string,
) {
  const preview = paymentTransitionPreview(state, payment.id, from, today);
  ensure(
    !preview.conflicts.length,
    `Новые условия затронут оплату, пропуск или ожидание: ${preview.conflicts
      .map((entry) => entry.date)
      .slice(0, 8)
      .join(", ")}. Выберите дату не раньше ${preview.suggestedFrom}.`,
  );
  return preview;
}

function finish(
  state: FinanceState,
  payment: Recurring,
  today: string,
  promote = true,
) {
  const next: FinanceState = {
    ...state,
    ...(promote
      ? { version: state.version >= 6 ? state.version : (6 as const) }
      : {}),
    recurring: state.recurring.some((entry) => entry.id === payment.id)
      ? state.recurring.map((entry) =>
          entry.id === payment.id ? payment : entry,
        )
      : [...state.recurring, payment],
  };
  validateSchedules(next);
  validatePlanHistory(next);
  for (const transaction of next.transactions) {
    if (transaction.recurringId !== payment.id) continue;
    const error = pendingLinkError(next, transaction);
    ensure(!error, error ?? "Проверьте ожидание платежа.");
  }
  assertGoalFundPlansPreserved(state, next);
  validateGoalFunds(next, today);
  validateAccountArchives(next, today);
  checkCurrencyAmounts(next, today);
  return next;
}

export function saveRecurring(
  state: FinanceState,
  input: RecurringInput,
  today = localDate(),
): FinanceState {
  const original = state.recurring.find((entry) => entry.id === input.id);
  ensure(!input.id || original, "Платёж уже удалён.");
  ensure(
    original || state.recurring.length < 200,
    "Можно создать не более 200 платежей.",
  );
  ensure(
    !original ||
      accountCurrency(state, original.accountId) ===
        accountCurrency(state, input.accountId),
    "Для смены валюты создайте новый план. Валюта существующего плана сохраняется для истории и сценариев.",
  );
  checkName(input.name);
  checkAmount(input.amount);
  checkDay(input.day);
  ensure(
    !input.schedule || scheduleSchema.safeParse(input.schedule).success,
    "Укажите корректный интервал повторения от 1 до 365 и дату начала.",
  );
  ensure(
    input.startsOn &&
      validDate(input.startsOn) &&
      input.startsOn >= "2000-01-01" &&
      input.startsOn <= "2100-12-31",
    "Укажите корректную дату начала учёта от 2000 до 2100 года.",
  );
  ensure(
    state.accounts.some(
      (account) =>
        account.id === input.accountId &&
        account.kind === "spending" &&
        !account.archived,
    ),
    "Выберите повседневный счёт.",
  );
  ensure(
    state.categories.some(
      (category) =>
        category.id === input.category &&
        (!category.archived || original?.category === category.id),
    ),
    "Выберите активную категорию.",
  );
  if (!original) {
    ensure(
      !input.schedule ||
        (input.schedule.anchor >= input.startsOn! &&
          input.schedule.anchor >= shiftDate(today, -366)),
      "Первое повторение должно быть не раньше даты начала учёта и не старше года.",
    );
    const { effectiveFrom: _effectiveFrom, ...fields } = input;
    return finish(
      state,
      {
        ...fields,
        id: uid(),
        name: input.name.trim(),
        active: true,
        icon: input.kind === "bill" ? "home-outline" : "musical-notes-outline",
        color: "#EEEBF5",
      },
      today,
      false,
    );
  }
  ensure(
    !original.startsOn || input.startsOn === original.startsOn,
    "Начало истории сохраняется. Для новых условий выберите отдельную будущую дату.",
  );
  const changed = paymentTermsChanged(original, input);
  if (!changed) {
    const legacy =
      original.versions?.find((version) => version.id === "legacy") ??
      legacyPaymentTerms(original);
    const skippedMonths = input.skippedMonths ?? legacy.skippedMonths;
    const skippedDates = input.skippedDates ?? legacy.skippedDates;
    const added = new Set(
      (legacy.schedule ? skippedDates : skippedMonths)?.filter(
        (key) =>
          !(
            legacy.schedule ? legacy.skippedDates : legacy.skippedMonths
          )?.includes(key),
      ),
    );
    ensure(
      !state.transactions.some(
        (transaction) =>
          isPosted(transaction) &&
          transaction.recurringId === original.id &&
          !transaction.recurringVersionId &&
          transaction.occurrenceDate &&
          added.has(
            legacy.schedule
              ? transaction.occurrenceDate
              : monthKey(transaction.occurrenceDate),
          ),
      ),
      "Проведённый платёж нельзя пропустить. Сначала исправьте связанную операцию.",
    );
    return finish(
      state,
      {
        ...original,
        name: input.name.trim(),
        kind: input.kind,
        ...(original.versions
          ? {
              versions: original.versions.map((version) =>
                version.id === "legacy"
                  ? { ...version, skippedMonths, skippedDates }
                  : version,
              ),
            }
          : { skippedMonths, skippedDates }),
      },
      today,
      false,
    );
  }
  ensure(
    original.active,
    "Сначала возобновите платёж с прежними условиями. Затем задайте новые условия с будущей даты.",
  );
  const from = input.effectiveFrom ?? shiftDate(today, 1);
  ensure(
    validDate(from) && from > today && from <= "2100-12-31",
    "Новые условия могут начаться не раньше завтра, до конца 2100 года.",
  );
  assertTransition(state, original, from, today);
  const versions = original.versions ?? [
    legacyPaymentTerms(original, `${monthKey(today)}-01`),
  ];
  ensure(
    versions.length < 200,
    "Можно сохранить не более 200 версий условий платежа.",
  );
  const version: PaymentTermsVersion = {
    id: uid(),
    effectiveFrom: from,
    amount: input.amount,
    day: input.day,
    accountId: input.accountId,
    category: input.category,
    schedule: input.schedule,
  };
  return finish(
    state,
    {
      ...original,
      name: input.name.trim(),
      kind: input.kind,
      amount: input.amount,
      day: input.day,
      accountId: input.accountId,
      category: input.category,
      schedule: input.schedule,
      history: undefined,
      amountHistory: undefined,
      skippedMonths: undefined,
      skippedDates: undefined,
      versions: [
        ...versions.map((item) =>
          item.voided
            ? item
            : item.effectiveFrom >= from
              ? { ...item, voided: true as const }
              : !item.effectiveTo || item.effectiveTo > from
                ? { ...item, effectiveTo: from }
                : item,
        ),
        version,
      ],
    },
    today,
  );
}

export function deleteRecurring(state: FinanceState, id: string): FinanceState {
  return {
    ...state,
    recurring: state.recurring.filter((entry) => entry.id !== id),
    ...(state.goalFundCycles
      ? {
          goalFundCycles: state.goalFundCycles.map((cycle) =>
            cycle.recurringId === id
              ? {
                  ...cycle,
                  recurringId: undefined,
                  recurringVersionId: undefined,
                  status:
                    cycle.status === "active"
                      ? ("cancelled" as const)
                      : cycle.status,
                }
              : cycle,
          ),
        }
      : {}),
    transactions: state.transactions.map((transaction) =>
      transaction.recurringId === id
        ? {
            ...transaction,
            recurringId: undefined,
            occurrenceDate: undefined,
            recurringVersionId: undefined,
          }
        : transaction,
    ),
  };
}

function currentTerms(
  payment: Recurring,
  version: PaymentTermsVersion,
  versions: PaymentTermsVersion[],
  active: boolean,
): Recurring {
  return {
    ...payment,
    amount: version.amount,
    day: version.day,
    accountId: version.accountId,
    category: version.category,
    schedule: version.schedule,
    history: version.history,
    amountHistory: version.amountHistory,
    skippedMonths: version.skippedMonths,
    skippedDates: version.skippedDates,
    active,
    versions,
  };
}

export function setRecurringActive(
  state: FinanceState,
  id: string,
  active: boolean,
  today = localDate(),
): FinanceState {
  const original = state.recurring.find((entry) => entry.id === id);
  ensure(original, "Платёж уже удалён.");
  if (original.active === active) return state;
  const boundary = shiftDate(today, 1);
  if (!active) {
    assertTransition(state, original, boundary, today);
    const versions = original.versions ?? [
      legacyPaymentTerms(original, `${monthKey(today)}-01`),
    ];
    const current = versions.find(
      (version) =>
        !version.voided &&
        version.effectiveFrom <= today &&
        (!version.effectiveTo || version.effectiveTo > today),
    );
    const source =
      current ??
      versions
        .filter(
          (version) => !version.voided && version.effectiveFrom < boundary,
        )
        .at(-1) ??
      versions.find((version) => !version.voided)!;
    const closed = versions.map((version): PaymentTermsVersion => {
      if (version.voided) return version;
      if (version.id === "legacy" && version.effectiveFrom >= boundary)
        return {
          ...version,
          effectiveFrom: today,
          effectiveTo: boundary,
          inactiveLegacy: true,
        };
      if (version.effectiveFrom >= boundary)
        return { ...version, voided: true };
      if (!version.effectiveTo || version.effectiveTo > boundary)
        return { ...version, effectiveTo: boundary };
      return version;
    });
    return finish(state, currentTerms(original, source, closed, false), today);
  }
  let versions = original.versions;
  if (!versions) {
    const legacy = legacyPaymentTerms(original, `${monthKey(today)}-01`);
    versions = [
      {
        ...legacy,
        effectiveFrom:
          legacy.effectiveFrom < today
            ? legacy.effectiveFrom
            : shiftDate(today, -1),
        effectiveTo: today,
        inactiveLegacy: true,
      },
    ];
  }
  const last = versions.filter((version) => !version.voided).at(-1);
  ensure(last?.effectiveTo, "Платёж уже включён.");
  ensure(
    !state.accounts.find((account) => account.id === last.accountId)?.archived,
    "Сначала восстановите счёт платежа из архива.",
  );
  // A stop that has not begun can be withdrawn without overlapping intervals.
  if (last.effectiveTo > today && !last.inactiveLegacy) {
    const restored = { ...last, effectiveTo: undefined };
    return finish(
      state,
      currentTerms(
        original,
        restored,
        versions.map((version) =>
          version.id === last.id ? restored : version,
        ),
        true,
      ),
      today,
    );
  }
  ensure(
    versions.length < 200,
    "Можно сохранить не более 200 версий условий платежа.",
  );
  const from = [
    today,
    last.effectiveTo,
    ...(last.inactiveLegacy && original.startsOn ? [original.startsOn] : []),
  ]
    .sort()
    .at(-1)!;
  const next: PaymentTermsVersion = {
    id: uid(),
    effectiveFrom: from,
    amount: last.amount,
    day: last.day,
    accountId: last.accountId,
    category: last.category,
    schedule: last.schedule,
  };
  return finish(
    state,
    currentTerms(original, next, [...versions, next], true),
    today,
  );
}

function occurrence(
  state: FinanceState,
  id: string,
  date: string,
  versionId?: string,
) {
  const template = state.recurring.find((entry) => entry.id === id);
  ensure(template, "Платёж уже удалён.");
  const resolved = resolvePaymentOccurrence(template, date, versionId);
  ensure(
    resolved,
    "Дата не соответствует условиям платежа. Откройте обязательство заново.",
  );
  ensure(
    !template.versions?.find((version) => version.id === resolved.versionId)
      ?.inactiveLegacy &&
      (template.versions || template.active),
    "Это прежний выключенный план. Неизвестные обязательства не восстанавливаются.",
  );
  return resolved;
}

export function setPaymentSkipped(
  state: FinanceState,
  id: string,
  date: string,
  skipped: boolean,
  today = localDate(),
  versionId?: string,
): FinanceState {
  const resolved = occurrence(state, id, date, versionId);
  const template = state.recurring.find((entry) => entry.id === id)!;
  const key = paymentOccurrenceKey(template, date, resolved.versionId);
  ensure(
    !state.transactions.some(
      (transaction) =>
        transactionStatus(transaction) !== "cancelled" &&
        transaction.recurringId === id &&
        transaction.occurrenceDate &&
        paymentOccurrenceKey(
          template,
          transaction.occurrenceDate,
          transaction.recurringVersionId,
        ) === key,
    ),
    "Проведённый платёж или активное ожидание нельзя пропустить.",
  );
  const versions = template.versions ?? [
    legacyPaymentTerms(template, `${monthKey(today)}-01`),
  ];
  const update = (version: PaymentTermsVersion): PaymentTermsVersion => {
    if (version.id !== resolved.versionId) return version;
    if (version.schedule)
      return {
        ...version,
        skippedDates: skipped
          ? [...new Set([...(version.skippedDates ?? []), date])]
          : (version.skippedDates ?? []).filter((entry) => entry !== date),
      };
    return {
      ...version,
      skippedMonths: skipped
        ? [...new Set([...(version.skippedMonths ?? []), monthKey(date)])]
        : (version.skippedMonths ?? []).filter(
            (entry) => entry !== monthKey(date),
          ),
    };
  };
  const nextVersions = versions.map(update);
  const selected = nextVersions.find(
    (version) => version.id === resolved.versionId,
  )!;
  return finish(
    state,
    {
      ...template,
      versions: nextVersions,
      ...(!template.versions
        ? {
            skippedMonths: selected.skippedMonths,
            skippedDates: selected.skippedDates,
          }
        : {}),
    },
    today,
  );
}

export function payRecurring(
  state: FinanceState,
  id: string,
  date: string,
  today = localDate(),
  transactionId?: string,
  versionId?: string,
): FinanceState {
  const resolved = occurrence(state, id, date, versionId);
  const { payment } = resolved;
  const template = state.recurring.find((entry) => entry.id === id)!;
  const key = paymentOccurrenceKey(template, date, resolved.versionId);
  if (
    state.transactions.some(
      (transaction) =>
        isPosted(transaction) &&
        transaction.recurringId === id &&
        transaction.occurrenceDate &&
        paymentOccurrenceKey(
          template,
          transaction.occurrenceDate,
          transaction.recurringVersionId,
        ) === key,
    )
  )
    return state;
  const pending = paymentPending(state, template, date, resolved.versionId);
  if (pending) {
    ensure(
      !transactionId || transactionId === pending.id,
      "У этого платежа уже есть ожидание. Сначала проведите или отмените его.",
    );
    return postPendingTransaction(state, pending.id, today, today);
  }
  ensure(
    !(payment.schedule
      ? payment.skippedDates?.includes(date)
      : payment.skippedMonths?.includes(monthKey(date))),
    "Сначала верните этот платёж в план.",
  );
  const link = {
    recurringId: id,
    occurrenceDate: date,
    recurringVersionId:
      resolved.versionId === "legacy" ? undefined : resolved.versionId,
  };
  if (transactionId) {
    const transaction = state.transactions.find(
      (entry) => entry.id === transactionId,
    );
    ensure(
      transaction && canLinkPayment(transaction, payment, date, today),
      "Расход больше не подходит для этого платежа.",
    );
    return saveTransaction(state, { ...transaction, ...link }, today);
  }
  return saveTransaction(
    state,
    {
      type: "expense",
      title: payment.name,
      amount: payment.amount,
      date: today,
      category: payment.category,
      accountId: payment.accountId,
      ...link,
    },
    today,
  );
}
