import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../src/domain/seed";
import {
  applyCsvImport,
  guessCsvMapping,
  parseCsv,
  previewCsv,
  type CsvOptions,
} from "../src/domain/csv";
import { decodeCsvBytes } from "../src/domain/csvEncoding";
import { accountBalance } from "../src/domain/finance";
import { decodeBackup, encodeBackup } from "../src/domain/backup";

const TODAY = "2026-09-10";
const sample =
  '\uFEFFДата операции;Описание;Сумма;Валюта;Статус;ID\r\n09.09.2026;"Кофе; \\"\\"Бодрый\\"\\"";-320,50;RUB;OK;1\r\n10.09.2026;Зарплата;10000;RUB;OK;2'.replaceAll(
    '\\"',
    '"',
  );
function setup(raw = sample) {
  const state = createInitialState(false, TODAY);
  state.accounts[0].openingBalance = 1000000;
  const table = parseCsv(raw);
  const options: CsvOptions = {
    accountId: "card",
    mapping: guessCsvMapping(table.headers),
    mode: "signed",
    positive: "income",
    dateOrder: "dmy",
  };
  return { state, table, options };
}
test("CSV preserves quoted delimiters, doubled quotes, newlines, BOM and CRLF", () => {
  const table = parseCsv(
    'Дата;Описание;Сумма\r\n10.09.2026;"Кафе; ""Лист""\nобед";-100,50\r\n',
  );
  assert.equal(table.rows.length, 1);
  assert.equal(table.rows[0][1], 'Кафе; "Лист"\nобед');
  assert.equal(table.delimiter, ";");
  assert.equal(
    parseCsv('date,title,amount\n2026-09-10,"shop, cafe",-100').delimiter,
    ",",
  );
  assert.throws(() => parseCsv('date;title\n1;"unfinished'), /кавычка/);
  assert.throws(() => parseCsv('date;title\n1;"closed"bad'), /разделитель/);
});
test("signed import is exact, additive and idempotent; backup retains import IDs", () => {
  const { state, table, options } = setup();
  const preview = previewCsv(state, table, options, {}, TODAY);
  assert.equal(preview[0].transaction?.amount, 32050);
  assert.equal(preview[1].transaction?.type, "income");
  const before = structuredClone(state);
  const next = applyCsvImport(state, table, options, new Set(), {}, TODAY);
  assert.deepEqual(state, before);
  assert.equal(next.transactions.length, 2);
  assert.equal(accountBalance(next, "card", TODAY), 1967950);
  assert.ok(
    previewCsv(next, table, options, {}, TODAY).every((r) => r.duplicate),
  );
  assert.throws(
    () => applyCsvImport(next, table, options, new Set(), {}, TODAY),
    /Нет новых/,
  );
  assert.deepEqual(decodeBackup(encodeBackup(next)), next);
});
test("unconfirmed status, foreign currency, future dates and invalid amounts are rejected per row", () => {
  const { state, table, options } = setup(
    "Дата;Описание;Сумма;Валюта;Статус\n09.09.2026;A;-100;USD;OK\n09.09.2026;B;-100;RUB;FAILED\n09.09.2026;C;-1,005;RUB;OK\n31.02.2026;D;-100;RUB;OK\n11.09.2026;E;-100;RUB;OK",
  );
  const rows = previewCsv(state, table, options, {}, TODAY);
  assert.equal(rows.filter((r) => r.error).length, 5);
  assert.throws(
    () => applyCsvImport(state, table, options, new Set(), {}, TODAY),
    /Нет новых/,
  );
});
test("separate debit/credit columns and slash date ordering are explicit", () => {
  const { state, table, options } = setup(
    "date;description;debit;credit\n09/10/2026;Coffee;100,50;\n09/10/2026;Salary;;900",
  );
  options.mode = "split";
  options.dateOrder = "mdy";
  const rows = previewCsv(state, table, options, {}, TODAY);
  assert.equal(rows[0].transaction?.date, TODAY);
  assert.equal(rows[0].transaction?.type, "expense");
  assert.equal(rows[1].transaction?.amount, 90000);
});
test("potential transfers require review, then conserve the total across own accounts", () => {
  const { state, table, options } = setup(
    "Дата;Описание;Сумма\n10.09.2026;Перевод на свой счёт;-1000",
  );
  assert.match(
    previewCsv(state, table, options, {}, TODAY)[0].error!,
    /Возможный перевод/,
  );
  const next = applyCsvImport(
    state,
    table,
    options,
    new Set(),
    { 2: { type: "transfer", otherAccountId: "savings" } },
    TODAY,
  );
  assert.equal(accountBalance(next, "card", TODAY), 900000);
  assert.equal(accountBalance(next, "savings", TODAY), 100000);
});
test("deduplication without bank ID counts identical rows, including manually recorded expenses", () => {
  const { state, table, options } = setup(
    "Дата;Описание;Сумма\n10.09.2026;Кофе;-100\n10.09.2026;Кофе;-100",
  );
  let next = applyCsvImport(state, table, options, new Set(), {}, TODAY);
  assert.equal(next.transactions.length, 2);
  next = {
    ...next,
    transactions: next.transactions
      .slice(0, 1)
      .map((t) => ({ ...t, importKey: undefined })),
  };
  const rows = previewCsv(next, table, options, {}, TODAY);
  assert.equal(rows[0].duplicate, true);
  assert.equal(rows[1].duplicate, false);
  assert.throws(
    () => applyCsvImport(next, table, options, new Set([3]), {}, TODAY),
    /Нет новых/,
  );
});
test("conflicting bank IDs cannot silently replace an existing operation", () => {
  const { state, table, options } = setup();
  const next = applyCsvImport(state, table, options, new Set(), {}, TODAY);
  table.rows[0][2] = "-500";
  assert.match(
    previewCsv(next, table, options, {}, TODAY)[0].error!,
    /ID банка/,
  );
});
test("UTF-8 and Windows-1251 decode Cyrillic without network or native dependencies", () => {
  assert.equal(
    decodeCsvBytes(new TextEncoder().encode("Дата;Сумма")),
    "Дата;Сумма",
  );
  const bytes = new Uint8Array([0xc4, 0xe0, 0xf2, 0xe0]);
  assert.equal(decodeCsvBytes(bytes), "Дата");
  assert.equal(decodeCsvBytes(bytes, "windows1251"), "Дата");
  assert.throws(() => decodeCsvBytes(bytes, "utf8"), /UTF-8/);
});
test("conflicting IDs within one CSV exclude every ambiguous row", () => {
  const { state, table, options } = setup(
    "Дата;Описание;Сумма;ID\n10.09.2026;Кофе;-100;1\n10.09.2026;Кофе;-200;1",
  );
  const rows = previewCsv(state, table, options, {}, TODAY);
  assert.ok(rows.every((r) => r.error && !r.transaction));
  assert.throws(
    () => applyCsvImport(state, table, options, new Set(), {}, TODAY),
    /Нет новых/,
  );
});
