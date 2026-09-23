import {
  createFormattedInputController,
  selectionAfterEdit,
  type InputSelection,
} from "./formattedInput";

export const ungroupAmountInput = (value: string) => value.replace(/\s/g, "");

export type AmountInputSelection = InputSelection;

export const isZeroAmountInput = (value: string) =>
  /^[+-]?0+(?:[.,]0+)?$/.test(ungroupAmountInput(value));

export function formatAmountInput(value: string) {
  const raw = ungroupAmountInput(value);
  const match = /^([+-]?)(\d*)([.,]\d*)?$/.exec(raw);
  if (!match) return raw;
  const [, sign, whole, fraction = ""] = match;
  return sign + whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ") + fraction;
}

export function amountInputEdit(
  previous: string,
  next: string,
  selection: AmountInputSelection,
  nativeSelection?: AmountInputSelection,
) {
  const raw = ungroupAmountInput(next);
  const formatted = formatAmountInput(raw);
  const inputSelection = selectionAfterEdit(
    previous,
    next,
    selection,
    nativeSelection,
  );
  const mapPosition = (offset: number) => {
    const beforeCaret = ungroupAmountInput(next.slice(0, offset)).length;
    let position = 0;
    let characters = 0;
    while (position < formatted.length && characters < beforeCaret) {
      if (formatted[position] !== " ") characters++;
      position++;
    }
    return position;
  };
  let start = mapPosition(inputSelection.start);
  let end = mapPosition(inputSelection.end);
  // Forward Delete must cross a separator instead of getting stuck before it.
  if (
    next.length < previous.length &&
    raw === ungroupAmountInput(previous) &&
    selection.start === selection.end &&
    previous[selection.start] === " "
  ) {
    while (formatted[start] === " ") start++;
    end = start;
  }
  return { raw, selection: { start, end }, inputSelection };
}

export function createAmountInputController(value: string) {
  return createFormattedInputController(
    value,
    formatAmountInput,
    amountInputEdit,
    (edit) => formatAmountInput(edit.raw),
  );
}
