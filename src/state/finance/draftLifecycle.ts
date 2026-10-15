import { validateBackupValue } from "../../domain/backup";
import { fingerprintFinanceState } from "../../domain/backupRecovery";
import type { FinanceState } from "../../domain/types";
import type { FinanceProfile } from "../../domain/profiles";
import type { DraftStorage } from "../../infrastructure/storage/draftStore";
import type { LedgerInspection } from "../../infrastructure/storage/ledgerContracts";

export function createDraftLifecycle(ports: {
  drafts(profile: FinanceProfile): DraftStorage;
  inspect(
    profile: FinanceProfile,
    normalizationDate: string,
  ): Promise<LedgerInspection>;
}) {
  const fingerprint = (state: FinanceState, date: string) =>
    `${date}:${fingerprintFinanceState(state).sha256}`;
  return {
    /** Persist the normalization context before replacing the ledger. */
    async prepareReplacement({
      profileId,
      operationId,
      next,
      validationDate,
    }: {
      profileId: FinanceProfile;
      operationId: string;
      next: FinanceState;
      validationDate: string;
    }) {
      const drafts = ports.drafts(profileId);
      const existing = await drafts.load("transaction");
      if (existing.blockedBy === operationId) return;
      const stored = await ports.inspect(profileId, validationDate);
      await drafts.beginReplacement(operationId, {
        before:
          stored.status === "readable"
            ? fingerprint(stored.state, validationDate)
            : null,
        after: fingerprint(
          validateBackupValue(next, validationDate),
          validationDate,
        ),
      });
    },
    async settleReplacement(profileId: FinanceProfile, snapshot: FinanceState) {
      const drafts = ports.drafts(profileId);
      const loaded = await drafts.load("transaction");
      if (!loaded.replacement) return "none" as const;
      const date = loaded.replacement.after?.match(
        /^(\d{4}-\d{2}-\d{2}):[a-f0-9]{64}$/,
      )?.[1];
      if (!date) {
        // Read earlier T04 markers without inventing a missing context.
        return drafts.resolveReplacement(
          fingerprintFinanceState(snapshot).sha256,
        );
      }
      // Legacy files can acquire a different default startsOn in a new month.
      // The same raw file must be compared using the originally captured date.
      const stored = await ports.inspect(profileId, date);
      return drafts.resolveReplacement(
        stored.status === "readable" ? fingerprint(stored.state, date) : null,
      );
    },
  };
}
