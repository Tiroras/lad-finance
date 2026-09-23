import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createDateInputController,
  dateInputEdit,
  dateInputText,
  dateInputValue,
  maskDateInput,
} from "../src/shared/lib/dateInput";
import { validDate } from "../src/shared/lib/dates";

test("typed dates and calendar values describe the same local calendar day", () => {
  for (const [typed, stored] of [
    ["29.02.2024", "2024-02-29"],
    ["01.01.2026", "2026-01-01"],
    ["31.12.2026", "2026-12-31"],
  ]) {
    assert.equal(dateInputValue(typed), stored);
    assert.equal(dateInputText(stored), typed);
    assert.equal(validDate(dateInputValue(typed)), true);
  }
});

test("incomplete and impossible dates cannot reuse an old valid date or become a different day", () => {
  for (const text of [
    "",
    "2",
    "29.",
    "29.02.",
    "29.02.2025",
    "31.04.2026",
    "00.01.2026",
    "10.13.2026",
    "дата",
  ]) {
    assert.equal(dateInputValue(text), text);
    assert.equal(dateInputText(dateInputValue(text)), text);
    assert.equal(validDate(dateInputValue(text)), false);
  }
});

test("date mask inserts dots, accepts pasted dates and limits input to eight digits", () => {
  for (const [input, expected] of [
    ["", ""],
    ["2", "2"],
    ["29", "29."],
    ["290", "29.0"],
    ["2902", "29.02."],
    ["29022", "29.02.2"],
    ["29022024", "29.02.2024"],
    ["29.02.2024", "29.02.2024"],
    [" 29 / 02 / 2024 ", "29.02.2024"],
    ["29022024999", "29.02.2024"],
    ["дата", ""],
  ]) {
    assert.equal(maskDateInput(input), expected);
  }
  assert.equal(dateInputValue(maskDateInput("31042026")), "31.04.2026");
});

test("automatic dots keep the native caret after every digit in either event order", () => {
  for (const selectionFirst of [false, true]) {
    const input = createDateInputController("");
    let displayed = "";
    for (const [digit, expected] of [
      ["2", "2"],
      ["9", "29."],
      ["0", "29.0"],
      ["2", "29.02."],
      ["2", "29.02.2"],
      ["0", "29.02.20"],
      ["2", "29.02.202"],
      ["4", "29.02.2024"],
    ]) {
      const text = displayed + digit;
      const native = { start: text.length, end: text.length };
      input.keyPress(digit);
      if (selectionFirst) input.select(native);
      const edit = input.change(displayed, text, native);
      assert.equal(edit.text, expected);
      assert.deepEqual(input.select(native) ?? native, {
        start: expected.length,
        end: expected.length,
      });
      input.select(edit.selection);
      displayed = edit.text;
      assert.equal(input.sync(edit.value), false);
    }
    assert.equal(dateInputValue(displayed), "2024-02-29");
  }
});

test("deleting an automatic dot removes an adjacent digit without trapping the cursor", () => {
  for (const selectionFirst of [false, true]) {
    for (const [previous, key, caret, next, nativeCaret, text, position] of [
      ["29.", "Backspace", 3, "29", 2, "2", 1],
      ["29.02.", "Backspace", 6, "29.02", 5, "29.0", 4],
      ["29.02.2026", "Backspace", 3, "2902.2026", 2, "20.22.026", 1],
      ["29.02.2026", "Delete", 2, "2902.2026", 2, "29.22.026", 3],
    ] as const) {
      const input = createDateInputController(previous);
      input.select({ start: caret, end: caret });
      input.keyPress(key);
      const native = { start: nativeCaret, end: nativeCaret };
      if (selectionFirst) input.select(native);
      const edit = input.change(previous, next, native);
      assert.equal(edit.text, text);
      assert.deepEqual(edit.selection, { start: position, end: position });
    }
  }
});

test("replacing a date part keeps the caret in place and calendar updates release corrections", () => {
  const input = createDateInputController("2026-02-28");
  input.select({ start: 3, end: 5 }, "28.02.2026");
  const first = input.change("28.02.2026", "28.0.2026", { start: 4, end: 4 });
  assert.equal(first.text, "28.02.026");
  assert.deepEqual(first.selection, { start: 4, end: 4 });
  const second = input.change(first.text, "28.092.026", { start: 5, end: 5 });
  assert.equal(second.text, "28.09.2026");
  assert.equal(second.value, "2026-09-28");
  assert.deepEqual(second.selection, { start: 6, end: 6 });
  // iOS sends text with selection events and no correction acknowledgement.
  assert.deepEqual(
    input.select({ start: 5, end: 5 }, "28.092.026"),
    second.selection,
  );
  assert.equal(input.select({ start: 0, end: 2 }, second.text), undefined);
  assert.equal(input.sync("2024-02-29"), true);
  assert.equal(input.select({ start: 0, end: 10 }, "29.02.2024"), undefined);
  assert.equal(input.change("29.02.2024", "").value, "");
  assert.deepEqual(
    dateInputEdit("", "11112026", { start: 0, end: 0 }).selection,
    {
      start: 10,
      end: 10,
    },
  );
});
