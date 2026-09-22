import assert from "node:assert/strict";
import { test } from "node:test";
import { prepareCsvSource } from "../src/features/data-transfer/lib/csvImport";

test("CSV preparation skips the statement preamble and preserves quoted delimiters and multiline descriptions", () => {
  const file = {
    name: "statement.csv",
    bytes: new TextEncoder().encode(
      'Выписка банка\r\nДата;Описание;Сумма\r\n10.09.2026;"Кофе; булочка\r\nмагазин";-120',
    ),
  };
  const source = prepareCsvSource(file, {
    encoding: "auto",
    separator: "auto",
    headerRow: "2",
  });
  assert.equal(source.error, "");
  assert.deepEqual(source.table?.headers, ["Дата", "Описание", "Сумма"]);
  assert.deepEqual(source.table?.rows, [
    ["10.09.2026", "Кофе; булочка\nмагазин", "-120"],
  ]);
  assert.equal(source.table?.delimiter, ";");
});

test("source errors discard the previous table and a corrected encoding can prepare the same bytes", () => {
  const bytes = new Uint8Array([
    ...new TextEncoder().encode("Date;Description;Amount\n10.09.2026;"),
    0xca,
    0xee,
    0xf4,
    0xe5,
    ...new TextEncoder().encode(";-120"),
  ]);
  const file = { name: "bank.csv", bytes };
  const bad = prepareCsvSource(file, {
    encoding: "utf8",
    separator: ";",
    headerRow: "1",
  });
  assert.equal(bad.table, null);
  assert.match(bad.error, /UTF-8/);
  const fixed = prepareCsvSource(file, { ...bad, encoding: "windows1251" });
  assert.equal(fixed.error, "");
  assert.equal(fixed.table?.rows[0][1], "Кофе");
  for (const headerRow of ["0", "31", "1.5", ""]) {
    const invalid = prepareCsvSource(file, { ...fixed, headerRow });
    assert.equal(invalid.table, null);
    assert.match(invalid.error, /от 1 до 30/);
  }
});
