import corpus from "../fixtures/t04LegacyNormalization.json";
import { validateBackupValue, encodeBackup } from "../../src/domain/backup";
import {
  fingerprintFinanceState,
  prepareRestoreCandidate,
} from "../../src/domain/backupRecovery";

function equal(actual: unknown, expected: unknown, label: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(label);
}

// Immutable expectations captured in Chromium before the first T04 code edit.
export const t04CompatibilityCases = corpus.cases.map((entry) => ({
  name: entry.id,
  run() {
    const state = validateBackupValue(
      JSON.parse(entry.rawText),
      corpus.normalizationDate,
    );
    equal(
      encodeBackup(state),
      entry.expectedNormalized.canonicalText,
      "Legacy canonical bytes changed",
    );
    equal(
      fingerprintFinanceState(state),
      entry.expectedNormalized.fingerprint,
      "Legacy fingerprint changed",
    );
    const candidate = prepareRestoreCandidate(entry.rawText, {
      normalizationDate: corpus.normalizationDate,
      normalizationVersion: 1,
      targetDemo: false,
      transportMode: "standard",
    });
    equal(
      encodeBackup(candidate.state),
      entry.expectedRecoveryAnchor.canonicalText,
      "Recovery canonical bytes changed",
    );
    equal(
      candidate.identity,
      entry.expectedRecoveryAnchor.identity,
      "Recovery identity changed",
    );
  },
}));
