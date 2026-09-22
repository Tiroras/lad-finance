import { z } from "zod";
import {
  dateInMonth,
  daysBetween,
  shiftDate,
  shiftMonth,
  validDate,
} from "../shared/lib/dates";
import type { FinanceState } from "./types";

export interface RecurrenceSchedule {
  unit: "day" | "week" | "month" | "year";
  interval: number;
  anchor: string;
}

const date = z
  .string()
  .refine(
    (value) =>
      validDate(value) && value >= "2000-01-01" && value <= "2100-12-31",
  );
export const scheduleSchema = z.object({
  unit: z.enum(["day", "week", "month", "year"]),
  interval: z.number().int().min(1).max(365),
  anchor: date,
});

export function scheduleDates(
  schedule: RecurrenceSchedule,
  start: string,
  end: string,
): string[] {
  return [...iterateScheduleDates(schedule, start, end)];
}

export function* iterateScheduleDates(
  schedule: RecurrenceSchedule,
  start: string,
  end: string,
): Generator<string> {
  if (
    !scheduleSchema.safeParse(schedule).success ||
    !validDate(start) ||
    !validDate(end)
  )
    throw new Error(
      "Укажите корректные дату и интервал повторения от 1 до 365.",
    );
  if (start >= end || schedule.anchor >= end) return;
  const begin = start > schedule.anchor ? start : schedule.anchor;
  const days =
    schedule.unit === "day"
      ? schedule.interval
      : schedule.unit === "week"
        ? schedule.interval * 7
        : 0;
  const months =
    schedule.unit === "year" ? schedule.interval * 12 : schedule.interval;
  let index = days
    ? Math.max(0, Math.floor(daysBetween(schedule.anchor, begin) / days))
    : Math.max(
        0,
        Math.floor(
          ((Number(begin.slice(0, 4)) - Number(schedule.anchor.slice(0, 4))) *
            12 +
            Number(begin.slice(5, 7)) -
            Number(schedule.anchor.slice(5, 7))) /
            months,
        ),
      );
  const at = (n: number) =>
    days
      ? shiftDate(schedule.anchor, n * days)
      : dateInMonth(
          shiftMonth(schedule.anchor, n * months),
          Number(schedule.anchor.slice(-2)),
        );
  let count = 0;
  for (
    let next = at(index);
    next < end && next <= "2100-12-31";
    next = at(++index)
  ) {
    if (next >= begin) {
      yield next;
      count++;
    }
    if (count > 36_890)
      throw new Error("Период повторений превышает поддерживаемые 100 лет.");
  }
}

export function isScheduledDate(schedule: RecurrenceSchedule, date: string) {
  return (
    validDate(date) &&
    scheduleDates(schedule, date, shiftDate(date, 1)).length === 1
  );
}

export function scheduleLabel(schedule: RecurrenceSchedule) {
  const labels = { day: "дн.", week: "нед.", month: "мес.", year: "г." };
  return `Каждые ${schedule.interval} ${labels[schedule.unit]} с ${schedule.anchor}`;
}

export function validateSchedules(state: FinanceState) {
  for (const payment of state.recurring) {
    if (payment.schedule && !scheduleSchema.safeParse(payment.schedule).success)
      throw new Error("Некорректный график регулярного платежа.");
    if (
      payment.skippedDates?.some(
        (date) => !payment.schedule || !isScheduledDate(payment.schedule, date),
      )
    )
      throw new Error("Пропущенная дата не соответствует графику платежа.");
    if (
      new Set(payment.skippedDates).size !== (payment.skippedDates?.length ?? 0)
    )
      throw new Error("Повторяющиеся пропущенные даты платежа.");
    if (
      payment.amountHistory?.some(
        (rule, index, rules) =>
          !payment.schedule ||
          !validDate(rule.until) ||
          (index > 0 && rules[index - 1].until >= rule.until),
      )
    )
      throw new Error("Некорректная история суммы платежа.");
  }
  for (const income of state.plannedIncomes ?? [])
    if (
      income.schedule &&
      (income.repeat === "once" ||
        !scheduleSchema.safeParse(income.schedule).success ||
        income.schedule.anchor !== income.date)
    )
      throw new Error("Некорректный график планируемого дохода.");
}
