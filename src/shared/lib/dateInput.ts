import { validDate } from "./dates";
import {
  createFormattedInputController,
  selectionAfterEdit,
  type InputSelection,
} from "./formattedInput";

const dateDigits = (text: string) => text.replace(/\D/g, "");

export function maskDateInput(text: string) {
  const digits = dateDigits(text).slice(0, 8);
  return (
    digits.slice(0, 2) +
    (digits.length >= 2 ? "." + digits.slice(2, 4) : "") +
    (digits.length >= 4 ? "." + digits.slice(4) : "")
  );
}

export function dateInputText(value: string) {
  if (!validDate(value)) return value;
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}

// Incomplete/invalid drafts must reach the form too, so Save cannot silently
// reuse the last valid date. Only a complete real date becomes an ISO value.
export function dateInputValue(text: string) {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text);
  if (!match) return text;
  const [, day, month, year] = match;
  const value = `${year}-${month}-${day}`;
  return validDate(value) ? value : text;
}

export function dateInputEdit(
  previous: string,
  next: string,
  selection: InputSelection,
  nativeSelection?: InputSelection,
) {
  const inputSelection = selectionAfterEdit(
    previous,
    next,
    selection,
    nativeSelection,
  );
  let digits = dateDigits(next);
  let start = dateDigits(next.slice(0, inputSelection.start)).length;
  let end = dateDigits(next.slice(0, inputSelection.end)).length;
  // A separator belongs to the mask. Deleting it also removes the adjacent
  // digit, so Backspace/Delete never get stuck on a regenerated dot.
  if (
    previous.length === next.length + 1 &&
    digits === dateDigits(previous) &&
    selection.start === selection.end
  ) {
    const backward =
      selection.start === inputSelection.start + 1 &&
      previous[selection.start - 1] === ".";
    const forward =
      selection.start === inputSelection.start &&
      previous[selection.start] === ".";
    if (backward || forward) {
      const removed = start - (backward ? 1 : 0);
      digits = digits.slice(0, removed) + digits.slice(removed + 1);
      start = end = removed;
    }
  }
  const text = maskDateInput(digits);
  const position = (count: number) =>
    maskDateInput(digits.slice(0, count)).length;
  return {
    text,
    value: dateInputValue(text),
    selection: { start: position(start), end: position(end) },
    inputSelection,
  };
}

export function createDateInputController(value: string) {
  return createFormattedInputController(
    value,
    dateInputText,
    dateInputEdit,
    (edit) => edit.text,
  );
}
