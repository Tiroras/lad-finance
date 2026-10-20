import { validDate } from "../shared/lib/dates";
import type { Transaction } from "./types";

/** The basis date describes the saved valuation, not the date of the movement. */
export function transactionValuationError(
  transaction: Transaction,
  today: string,
): string | null {
  const valuation = transaction.valuation;
  if (valuation === undefined) return null;
  if (
    !valuation ||
    typeof valuation !== "object" ||
    !["manual", "imported", "current"].includes(valuation.source) ||
    !validDate(valuation.date) ||
    valuation.date > today
  )
    return "Укажите корректную дату основания оценки, не позднее сегодняшней, и её источник.";
  if (transaction.baseAmount === undefined)
    return "Для основания оценки нужна сохранённая сумма в основной валюте.";
  if (transaction.type === "transfer")
    return "Историческая оценка доходов и расходов не задаётся для перевода.";
  return null;
}

export function transactionValuationLabel(transaction: Transaction): string {
  const valuation = transaction.valuation;
  if (!valuation)
    return "Основание исторической оценки неизвестно: оно не сохранялось в прежней записи.";
  const source = {
    manual: "Указана вручную",
    imported: "Рассчитана при импорте по сохранённому курсу",
    current: "Рассчитана по сохранённому курсу",
  }[valuation.source];
  const [year, month, day] = valuation.date.split("-");
  return `${source}. Дата основания: ${day}.${month}.${year}.`;
}
