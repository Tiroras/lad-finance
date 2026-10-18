import corpus from "../fixtures/t05LegacyNormalization.json";
import { validateBackupValue, encodeBackup } from "../../src/domain/backup";
import {
  fingerprintFinanceState,
  prepareRestoreCandidate,
} from "../../src/domain/backupRecovery";

// Captured in Chrome from a bundle built before the first T05 source edit.
export const t05CompatibilityCases = corpus.cases.map((entry) => ({
  name: entry.id,
  run() {
    const state = validateBackupValue(
      JSON.parse(entry.rawText),
      corpus.normalizationDate,
    );
    if (
      encodeBackup(state) !== entry.expectedNormalized.canonicalText ||
      JSON.stringify(fingerprintFinanceState(state)) !==
        JSON.stringify(entry.expectedNormalized.fingerprint)
    )
      throw new Error("Version 5 normalization changed");
    const candidate = prepareRestoreCandidate(entry.rawText, {
      normalizationDate: corpus.normalizationDate,
      normalizationVersion: 1,
      targetDemo: false,
      transportMode: "standard",
    });
    if (
      encodeBackup(candidate.state) !==
        entry.expectedRecoveryAnchor.canonicalText ||
      JSON.stringify(candidate.identity) !==
        JSON.stringify(entry.expectedRecoveryAnchor.identity)
    )
      throw new Error("Version 5 recovery identity changed");
  },
}));
