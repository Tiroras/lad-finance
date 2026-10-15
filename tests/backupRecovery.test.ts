import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createInitialState } from "../src/domain/seed";
import {
  checkedBackupContent,
  decodeBackup,
  validateBackupValue,
} from "../src/domain/backup";
import {
  measureJson,
  writeMeasuredJson,
} from "../src/domain/backupMeasurement";
import {
  assertRecoverySnapshotSize,
  assertRestoreCandidateApplicable,
  assertVerifiedRestoreCandidate,
  fingerprintText,
  prepareRestoreCandidate,
  restoreCandidateText,
} from "../src/domain/backupRecovery";
import { createExpandedRecoveryFixture } from "./a03Fixtures";

const options = {
  normalizationDate: "2026-10-06",
  normalizationVersion: 1,
  targetDemo: false,
  transportMode: "standard",
} as const;
test("measured writer matches JSON spelling, UTF-16, UTF-8 and SHA for Unicode, exponents and escaped surrogates", () => {
  const value = {
    title: "Я中🙂",
    lone: "\ud800",
    numeric: [1e5, 1e-7, -0, 1e20, 1e21],
    optional: undefined,
  };
  const json = JSON.stringify(value);
  const measured = measureJson(value);
  assert.deepEqual(measured, {
    utf16Units: json.length,
    utf8Bytes: Buffer.byteLength(json),
    sha256: createHash("sha256").update(json).digest("hex"),
  });
  assert.equal(
    Buffer.from(writeMeasuredJson(value, measured)).toString(),
    json,
  );
  assert.throws(() =>
    writeMeasuredJson({ ...value, title: "изменено" }, measured),
  );
  assert.throws(() =>
    writeMeasuredJson(value, {
      ...measured,
      utf8Bytes: measured.utf8Bytes - 1,
    }),
  );
});
test("candidate preserves exact BOM/whitespace source and demo provenance while freezing a custom target", () => {
  const state = createInitialState(false, options.normalizationDate);
  state.demo = true;
  const source = "\ufeff \n" + JSON.stringify(state) + "\n";
  const candidate = prepareRestoreCandidate(source, options);
  assert.equal(candidate.sourceText, source);
  assert.equal(candidate.sourceDemo, true);
  assert.equal(candidate.state.demo, false);
  assert.deepEqual(
    candidate.identity.sourceFingerprint,
    fingerprintText(source),
  );
  assert.ok(Object.isFrozen(candidate.state.settings));
  assert.throws(() => {
    candidate.state.settings.name = "changed";
  });
  assert.throws(() => assertVerifiedRestoreCandidate({ ...candidate }));
  const personal = prepareRestoreCandidate(candidate, {
    ...options,
    currentSnapshotText: restoreCandidateText(candidate),
  });
  assert.equal(personal.sourceDemo, false);
  assert.equal(personal.sourceText, source);
  const stillDemo = prepareRestoreCandidate(candidate, {
    ...options,
    currentSnapshotText: JSON.stringify(state),
  });
  assert.equal(stillDemo.sourceDemo, true);
  const personalAnchor = prepareRestoreCandidate(
    JSON.stringify({ ...state, demo: false }),
    options,
  );
  assert.throws(
    () =>
      prepareRestoreCandidate(personalAnchor, {
        ...options,
        currentSnapshotText: JSON.stringify(state),
      }),
    /Происхождение/,
  );
});
test("fixed snapshot date validates later operations without changing the anchor's normalization date", () => {
  const state = createInitialState(false, "2026-10-06");
  state.transactions = [
    {
      id: "one",
      type: "income",
      title: "x",
      amount: 100,
      baseAmount: 100,
      category: "other",
      accountId: "card",
      date: "2026-10-06",
      note: "space for later entry",
    },
  ];
  const source = prepareRestoreCandidate(JSON.stringify(state), options);
  const edited = {
    ...source.state,
    transactions: [
      { ...source.state.transactions[0], date: "2026-10-15", note: "" },
    ],
  };
  assert.throws(() =>
    prepareRestoreCandidate(source, {
      ...options,
      currentSnapshotText: JSON.stringify(edited),
    }),
  );
  const verified = prepareRestoreCandidate(source, {
    ...options,
    snapshotDate: "2026-10-15",
    currentSnapshotText: JSON.stringify(edited),
  });
  assert.equal(verified.identity.normalizationDate, "2026-10-06");
  assert.equal(verified.state.transactions[0].date, "2026-10-15");
  // A valid authenticated calendar date is not constrained by the host clock.
  assert.doesNotThrow(() =>
    prepareRestoreCandidate(JSON.stringify(state), {
      ...options,
      normalizationDate: "2099-12-31",
    }),
  );
  assert.throws(() =>
    prepareRestoreCandidate(JSON.stringify(state), {
      ...options,
      normalizationDate: "2026-02-30",
    }),
  );
});
test("legacy version and payment defaults use the fixed anchor date, not the later snapshot date", () => {
  const state = createInitialState(false, options.normalizationDate);
  state.recurring = [
    {
      id: "old-plan",
      name: "План",
      amount: 100,
      day: 6,
      kind: "bill",
      active: true,
      icon: "home-outline",
      color: "#123456",
      category: "other",
      accountId: "card",
    },
  ];
  const source = JSON.stringify({ ...state, version: 1 });
  const anchor = prepareRestoreCandidate(source, options);
  assert.equal(anchor.state.version, 4);
  assert.equal(anchor.state.recurring[0].startsOn, "2026-10-01");
  const current = prepareRestoreCandidate(anchor, {
    ...options,
    currentSnapshotText: restoreCandidateText(anchor),
    snapshotDate: "2026-11-20",
  });
  assert.equal(current.state.recurring[0].startsOn, "2026-10-01");
  assert.deepEqual(current.identity.allowance, anchor.identity.allowance);
});
test("application date rejects future financial facts without rejecting a future fixed anchor date", () => {
  const state = createInitialState(false, "2026-10-15");
  const futureOptions = {
    ...options,
    normalizationDate: "2026-10-16",
    snapshotDate: "2026-10-16",
  };
  const empty = prepareRestoreCandidate(JSON.stringify(state), futureOptions);
  assert.doesNotThrow(() =>
    assertRestoreCandidateApplicable(empty, "2026-10-15"),
  );
  state.transactions = [
    {
      id: "future-fact",
      type: "income",
      title: "Доход",
      amount: 100,
      baseAmount: 100,
      date: "2026-10-16",
      category: "other",
      accountId: "card",
    },
  ];
  const futureFact = prepareRestoreCandidate(
    JSON.stringify(state),
    futureOptions,
  );
  assert.throws(() =>
    assertRestoreCandidateApplicable(futureFact, "2026-10-15"),
  );
  assert.doesNotThrow(() =>
    assertRestoreCandidateApplicable(futureFact, "2026-10-16"),
  );
  assert.throws(() =>
    assertRestoreCandidateApplicable({ ...futureFact }, "2026-10-16"),
  );
  assert.equal(futureFact.identity.normalizationDate, "2026-10-16");
});
test("ordinary limits remain fixed while a bounded exponent source admits only its measured normalized budget", () => {
  const fixture = createExpandedRecoveryFixture();
  assert.ok(fixture.sourceText.length < 5_000_000);
  const candidate = prepareRestoreCandidate(fixture.sourceText, options);
  assert.ok(candidate.identity.allowance.utf16Units > 5_000_000);
  assert.equal(candidate.requiresRescue, true);
  assert.throws(() => checkedBackupContent(candidate.state), /5 МБ/);
  const text = restoreCandidateText(candidate);
  assert.equal(text.length, candidate.identity.allowance.utf16Units);
  assert.deepEqual(
    JSON.parse(text),
    JSON.parse(JSON.stringify(candidate.state)),
  );
  const current = prepareRestoreCandidate(candidate, {
    ...options,
    currentSnapshotText: fixture.editedSnapshotText,
    snapshotDate: fixture.snapshotDate,
  });
  assert.ok(current.identity.normalizedFingerprint.utf16Units > 5_000_000);
  assert.equal(current.state.transactions.at(-1)?.id, "a03-later");
  assert.doesNotThrow(() =>
    assertRecoverySnapshotSize(
      fixture.editedSnapshotText,
      candidate.identity.normalizedFingerprint.utf8Bytes,
      candidate.identity.allowance,
    ),
  );
  assert.throws(
    () =>
      assertRecoverySnapshotSize(
        text,
        candidate.identity.normalizedFingerprint.utf8Bytes,
        candidate.identity.allowance,
      ),
    /уменьшать/,
  );
  assert.throws(
    () =>
      prepareRestoreCandidate(candidate, {
        ...options,
        currentSnapshotText: text + " ",
      }),
    /размер/,
  );
  assert.throws(
    () => prepareRestoreCandidate(fixture.sourceText + " ".repeat(11), options),
    /UTF-16/,
  );
  assert.throws(() => decodeBackup(text), /5 МБ/);
});
test("UTF-8 rescue classification and explicit default normalization do not relax financial validation", () => {
  const state = createInitialState(false, options.normalizationDate);
  state.transactions = Array.from({ length: 9000 }, (_, i) => ({
    id: `u-${i}`,
    type: "income" as const,
    title: "Тест",
    amount: 100,
    baseAmount: 100,
    date: options.normalizationDate,
    category: "other",
    accountId: "card",
    note: "中".repeat(200),
  }));
  const text = JSON.stringify(state);
  assert.ok(
    text.length < 5_000_000 &&
      Buffer.byteLength(text) > 5_000_000 &&
      Buffer.byteLength(text) < 15_000_000,
  );
  assert.equal(prepareRestoreCandidate(text, options).requiresRescue, true);
  const invalid = {
    ...state,
    transactions: [{ ...state.transactions[0], accountId: "absent" }],
  };
  assert.throws(() =>
    prepareRestoreCandidate(JSON.stringify(invalid), options),
  );
  const small = createInitialState(false, options.normalizationDate);
  const raw = JSON.stringify(small).replace('"name":""', '"name":"\\ud800"');
  assert.doesNotThrow(() => prepareRestoreCandidate(raw, options));
  assert.throws(
    () => prepareRestoreCandidate(raw.replace("\\ud800", "\ud800"), options),
    /Unicode/,
  );
  assert.deepEqual(
    validateBackupValue(
      JSON.parse(JSON.stringify(small)),
      options.normalizationDate,
    ),
    small,
  );
});
