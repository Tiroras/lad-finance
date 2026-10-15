import type {
  ContentFingerprint,
  RestoreCandidateIdentity,
} from "../../domain/backupRecovery";
import type { FinanceState } from "../../domain/types";
import type { FinanceProfile } from "./profileStorage";

export interface LedgerSnapshotIdentity {
  readonly format:
    "plaintext" | "vault-v1" | "rescue-plain-v1" | "rescue-vault-v1";
  readonly recordFingerprint: ContentFingerprint;
  readonly sourceFingerprint: ContentFingerprint;
  readonly keyId?: string;
}
export interface VerifiedSnapshotReceipt {
  readonly operationId: string;
  readonly profileId: FinanceProfile;
  readonly candidateIdentity: RestoreCandidateIdentity;
  readonly snapshotIdentity: LedgerSnapshotIdentity;
}
export interface LedgerRecoveryAnchor {
  readonly anchorText: string;
  readonly normalizationDate: string;
  readonly normalizationVersion: 1;
  readonly allowance: ContentFingerprint;
}
export type LedgerInspection =
  | { status: "missing" }
  | {
      status: "unavailable";
      reason: "storage" | "key" | "decryption" | "rescue-source-required";
    }
  | {
      status: "damaged";
      reason: "envelope" | "financial-json" | "rescue-allowance";
    }
  | {
      status: "readable";
      state: FinanceState;
      sourceText: string;
      snapshotIdentity: LedgerSnapshotIdentity;
      normalizationDate: string;
      normalizationVersion: 1;
      snapshotDate: string;
      recovery?: LedgerRecoveryAnchor;
      importedSnapshot?: VerifiedSnapshotReceipt;
    };
export interface LedgerInspectOptions {
  normalizationDate?: string;
}
