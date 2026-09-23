import { test } from "node:test";
import assert from "node:assert/strict";
import {
  amountInputEdit,
  createAmountInputController,
  formatAmountInput,
  isZeroAmountInput,
  ungroupAmountInput,
} from "../src/shared/lib/amountInput";
import { parseMoney } from "../src/domain/currency";

test("amount grouping preserves signs, unfinished input and every decimal digit", () => {
  for (const [raw, displayed] of [
    ["", ""],
    ["-", "-"],
    ["125500000", "125 500 000"],
    ["-12345,670", "-12 345,670"],
    ["+12345.00", "+12 345.00"],
    ["1234,", "1 234,"],
    ["0001234", "0 001 234"],
    ["12\u00a0345\u202f678,90", "12 345 678,90"],
  ]) {
    assert.equal(formatAmountInput(raw), displayed);
    assert.equal(ungroupAmountInput(displayed), ungroupAmountInput(raw));
  }
  assert.equal(
    parseMoney(formatAmountInput("125500000,09"), "RUB"),
    12_550_000_009,
  );
  assert.equal(parseMoney(formatAmountInput("12345,670"), "KWD"), 12_345_670);
  assert.equal(parseMoney(formatAmountInput("12345"), "JPY"), 12_345);
  assert.equal(parseMoney(formatAmountInput("12345,67"), "JPY"), null);
  assert.equal(parseMoney(formatAmountInput("12345,678"), "RUB"), null);
  assert.equal(formatAmountInput("1e3"), "1e3");
  assert.equal(parseMoney(formatAmountInput("1e3")), null);
});

test("formatting keeps the caret after inserted or replaced digits and crosses deleted separators", () => {
  assert.deepEqual(amountInputEdit("1 234", "1 2345", { start: 5, end: 5 }), {
    raw: "12345",
    selection: { start: 6, end: 6 },
    inputSelection: { start: 6, end: 6 },
  });
  assert.deepEqual(amountInputEdit("11 111", "111 111", { start: 1, end: 1 }), {
    raw: "111111",
    selection: { start: 2, end: 2 },
    inputSelection: { start: 2, end: 2 },
  });
  assert.deepEqual(
    amountInputEdit("125 500 000,09", "125 6 000,09", { start: 4, end: 7 }),
    {
      raw: "1256000,09",
      selection: { start: 5, end: 5 },
      inputSelection: { start: 5, end: 5 },
    },
  );
  assert.deepEqual(amountInputEdit("1 234", "1234", { start: 2, end: 2 }), {
    raw: "1234",
    selection: { start: 1, end: 1 },
    inputSelection: { start: 1, end: 1 },
  });
  assert.deepEqual(amountInputEdit("1 234", "1234", { start: 1, end: 1 }), {
    raw: "1234",
    selection: { start: 2, end: 2 },
    inputSelection: { start: 1, end: 1 },
  });
  assert.deepEqual(amountInputEdit("1 234", " 234", { start: 1, end: 1 }), {
    raw: "234",
    selection: { start: 0, end: 0 },
    inputSelection: { start: 0, end: 0 },
  });
});

test("Android selection events cannot move the caret back into the amount after grouping", () => {
  for (const selectionFirst of [false, true]) {
    const input = createAmountInputController("");
    let displayed = "";
    let typed = "";
    let caret = 0;
    for (const digit of "125500000,09") {
      const text = displayed.slice(0, caret) + digit + displayed.slice(caret);
      const native = { start: caret + 1, end: caret + 1 };
      if (selectionFirst) input.select(native);
      const edit = input.change(displayed, text, native);
      // A queued Android selection refers to text before JS inserted spaces.
      const correction = input.select(native);
      caret = (correction ?? native).end;
      displayed = formatAmountInput(edit.raw);
      typed += digit;
      assert.equal(edit.raw, typed);
      assert.equal(caret, displayed.length);
      assert.equal(input.select({ start: caret, end: caret }), undefined);
    }
    assert.equal(displayed, "125 500 000,09");
    assert.equal(input.select({ start: 4, end: 7 }), undefined);
    const replacement = input.change(displayed, "125 600 000,09", {
      start: 7,
      end: 7,
    });
    assert.equal(replacement.raw, "125600000,09");
    assert.deepEqual(replacement.selection, { start: 7, end: 7 });
  }
});

test("native text and selection stay paired for repeated digits and iOS user movement", () => {
  const input = createAmountInputController("123");
  const edit = input.change("123", "1234", { start: 4, end: 4 });
  assert.deepEqual(edit.selection, { start: 5, end: 5 });
  assert.deepEqual(input.select({ start: 4, end: 4 }, "1234"), edit.selection);
  // iOS suppresses programmatic selection events. A tap in the updated text
  // must work without waiting for an acknowledgement that will never arrive.
  assert.equal(input.select({ start: 0, end: 1 }, "1 234"), undefined);
  assert.equal(
    input.change("1 234", "9 234", { start: 1, end: 1 }).raw,
    "9234",
  );

  input.sync("11111");
  input.select({ start: 1, end: 1 });
  // Some native inputs send the advanced caret first. Equal digits make a
  // text diff alone ambiguous; the selection from onChange resolves it.
  input.select({ start: 2, end: 2 });
  assert.deepEqual(
    input.change("11 111", "111 111", { start: 2, end: 2 }).selection,
    { start: 2, end: 2 },
  );
  assert.equal(input.select({ start: 0, end: 0 }), undefined);
});

test("native deletion crosses separators even when selection arrives before text", () => {
  for (const selectionFirst of [false, true]) {
    for (const [key, start, expected] of [
      ["Backspace", 2, 1],
      ["Delete", 1, 2],
    ] as const) {
      const input = createAmountInputController("1234");
      input.select({ start, end: start });
      input.keyPress(key);
      const native = { start: 1, end: 1 };
      if (selectionFirst) input.select(native);
      const edit = input.change("1 234", "1234", native);
      assert.equal(edit.raw, "1234");
      assert.deepEqual(edit.selection, { start: expected, end: expected });
      assert.deepEqual(input.select(native) ?? native, edit.selection);
      input.select(edit.selection);
      input.keyPress(key);
      const next = input.change(
        "1 234",
        key === "Backspace" ? " 234" : "1 34",
        key === "Backspace" ? { start: 0, end: 0 } : { start: 2, end: 2 },
      );
      assert.equal(next.raw, key === "Backspace" ? "234" : "134");
    }
  }
});

test("external amount changes and focus changes release pending cursor corrections", () => {
  const input = createAmountInputController("123");
  input.change("123", "1234", { start: 4, end: 4 });
  assert.equal(input.sync("1234"), false);
  assert.deepEqual(input.select({ start: 4, end: 4 }), { start: 5, end: 5 });
  assert.equal(input.sync("987654"), true);
  assert.equal(input.select({ start: 0, end: 7 }), undefined);
  const replaced = input.change("987 654", "1234", { start: 4, end: 4 });
  assert.equal(replaced.raw, "1234");
  input.release();
  assert.equal(input.select({ start: 0, end: 0 }), undefined);
});

test("only complete zero amounts are selected for replacement on focus", () => {
  for (const value of ["0", "0,00", "0.000", "-0", "+0,00", "0 000"])
    assert.equal(isZeroAmountInput(value), true, value);
  for (const value of ["", "-", "0,", "0.01", "10", "0,0001", "invalid"])
    assert.equal(isZeroAmountInput(value), false, value);
});
