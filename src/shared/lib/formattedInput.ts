export type InputSelection = { start: number; end: number };

type SelectionEdit = {
  selection: InputSelection;
  inputSelection: InputSelection;
};

export function selectionAfterEdit(
  previous: string,
  next: string,
  selection: InputSelection,
  nativeSelection?: InputSelection,
) {
  // Native change events pair the text with its caret. Web needs an edit diff.
  if (nativeSelection) return nativeSelection;
  let caret = selection.end + next.length - previous.length;
  if (
    caret < selection.start ||
    next.slice(0, selection.start) !== previous.slice(0, selection.start) ||
    next.slice(caret) !== previous.slice(selection.end)
  ) {
    let suffix = 0;
    let prefix = 0;
    while (
      prefix < Math.min(previous.length, next.length) &&
      previous[prefix] === next[prefix]
    )
      prefix++;
    while (
      suffix < Math.min(previous.length, next.length) - prefix &&
      previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]
    )
      suffix++;
    caret = next.length - suffix;
  }
  return { start: caret, end: caret };
}

const sameSelection = (a: InputSelection, b: InputSelection) =>
  a.start === b.start && a.end === b.end;

export function createFormattedInputController<Edit extends SelectionEdit>(
  value: string,
  format: (value: string) => string,
  applyEdit: (
    previous: string,
    next: string,
    selection: InputSelection,
    nativeSelection?: InputSelection,
  ) => Edit,
  displayEdit: (edit: Edit) => string,
) {
  let displayed = format(value);
  let cursor: InputSelection = {
    start: displayed.length,
    end: displayed.length,
  };
  let pending: InputSelection | undefined;
  let beforeKey: InputSelection | undefined;
  return {
    keyPress(key: string) {
      // Capture the side of a separator before native advances the selection.
      beforeKey =
        key.length === 1 || key === "Backspace" || key === "Delete"
          ? cursor
          : undefined;
    },
    change(previous: string, text: string, nativeSelection?: InputSelection) {
      const edit = applyEdit(
        previous,
        text,
        beforeKey ?? cursor,
        nativeSelection,
      );
      beforeKey = undefined;
      displayed = displayEdit(edit);
      cursor = edit.selection;
      pending = sameSelection(edit.selection, edit.inputSelection)
        ? undefined
        : edit.selection;
      return edit;
    },
    select(selection: InputSelection, text?: string) {
      // iOS/Web include text. iOS does not acknowledge JS cursor corrections,
      // so accept user movement as soon as the event has the formatted text.
      if (text !== undefined && text !== displayed) return cursor;
      // Android can report the old caret after onChange. Wait for the corrected
      // position before accepting movement; never write the stale caret back.
      if (text === undefined && pending && !sameSelection(selection, pending))
        return pending;
      cursor = selection;
      pending = undefined;
      return undefined;
    },
    release() {
      pending = undefined;
      beforeKey = undefined;
    },
    sync(value: string) {
      const formatted = format(value);
      if (formatted === displayed) return false;
      displayed = formatted;
      cursor = { start: formatted.length, end: formatted.length };
      pending = undefined;
      beforeKey = undefined;
      return true;
    },
  };
}
