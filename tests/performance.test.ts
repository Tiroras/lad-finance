import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkedBackupContent,
  decodeBackup,
  encodeBackup,
  MAX_BACKUP_BYTES,
} from "../src/domain/backup";
import { exportTransactionsCsv } from "../src/domain/csvExport";
import { parseCsv } from "../src/domain/csv";
import {
  createBoundaryPerformanceFixture,
  createLegacyPerformanceFixture,
  createPerformanceFixture,
  FIXTURE_SIZES,
  FIXTURE_TODAY,
} from "./performance/fixtures";
import {
  verifyCsvFixture,
  verifyPerformanceFixture,
} from "./performance/oracle";

for (const size of FIXTURE_SIZES)
  test(`A10 ${size}: reproducible valid snapshot, exact balances/category totals and all 90 forecast dates`, () => {
    const fixture = createPerformanceFixture(size);
    const raw = checkedBackupContent(fixture.state);
    assert.equal(raw, encodeBackup(createPerformanceFixture(size).state));
    assert.deepEqual(decodeBackup(raw), fixture.state);
    assert.ok(Buffer.byteLength(raw) <= MAX_BACKUP_BYTES);
    verifyPerformanceFixture(fixture);
    verifyCsvFixture(fixture);
  });

test("A10 exact UTF-8 boundary passes; one byte more rejects; legacy >5 MB only shrinks", () => {
  const boundary = createBoundaryPerformanceFixture();
  assert.equal(
    Buffer.byteLength(checkedBackupContent(boundary)),
    MAX_BACKUP_BYTES,
  );
  boundary.settings.name += "x";
  assert.throws(() => checkedBackupContent(boundary), /5 МБ/);
  const legacy = createLegacyPerformanceFixture(),
    raw = encodeBackup(legacy);
  assert.ok(raw.length < MAX_BACKUP_BYTES);
  assert.ok(Buffer.byteLength(raw) > MAX_BACKUP_BYTES);
  assert.deepEqual(decodeBackup(raw), legacy);
  assert.throws(() => checkedBackupContent(legacy), /5 МБ/);
  const smaller = {
    ...legacy,
    transactions: legacy.transactions.slice(0, -10),
  };
  assert.doesNotThrow(() =>
    checkedBackupContent(smaller, Buffer.byteLength(raw)),
  );
});

test("A10 split/refund CSV expands rows: 1000 fits; 5000/20000 full reimport is a negative case", () => {
  for (const size of FIXTURE_SIZES) {
    const output = exportTransactionsCsv(
      createPerformanceFixture(size).state,
      { format: "universal" },
      FIXTURE_TODAY,
    );
    assert.equal(output.transactionCount, size);
    assert.equal(output.count, size * 1.2);
    if (size === 1000)
      assert.equal(parseCsv(output.content).rows.length, output.count);
    else assert.throws(() => parseCsv(output.content), /5 000|5000|2 МБ/);
  }
});
