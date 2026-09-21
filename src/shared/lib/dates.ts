export const localDate = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export const fromDate = (value: string) => new Date(`${value}T12:00:00`);
export const monthKey = (date = localDate()) => date.slice(0, 7);
export function shiftDate(value: string, days: number) {
  const date = fromDate(value);
  date.setDate(date.getDate() + days);
  return localDate(date);
}
export function shiftMonth(value: string, months: number) {
  const date = fromDate(value);
  return localDate(new Date(date.getFullYear(), date.getMonth() + months, 1));
}
export const daysBetween = (start: string, end: string) =>
  Math.round(
    (Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) /
      86_400_000,
  );
export function validDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(fromDate(value).getTime()) &&
    localDate(fromDate(value)) === value
  );
}
export function dateInMonth(month: string, day: number) {
  const date = fromDate(`${month.slice(0, 7)}-01`);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return `${month.slice(0, 7)}-${String(Math.min(day, last)).padStart(2, "0")}`;
}
export const dateLabel = (
  date: string,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" },
) => fromDate(date).toLocaleDateString("ru-RU", options);
