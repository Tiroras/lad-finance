import {
  assertRestoreCandidateApplicable,
  type VerifiedRestoreCandidate,
} from "../backupRecovery";
import {
  applyCsvImportWithSummary as applyCsvWithSummary,
  type CsvOptions,
  type CsvOverride,
  type CsvTable,
} from "../csv";
import {
  buildReplacementImportSummary,
  type ImportApplication,
} from "../dataTransfer";
import type { FinanceState } from "../types";
import { restoreFinance } from "./settings";

export interface CsvImportInput {
  table: CsvTable;
  options: CsvOptions;
  excluded: ReadonlySet<number>;
  overrides: Readonly<Record<number, CsvOverride>>;
}

export function applyCsvImportWithSummary(
  current: FinanceState,
  input: CsvImportInput,
  today: string,
): ImportApplication {
  return applyCsvWithSummary(
    current,
    input.table,
    input.options,
    input.excluded,
    input.overrides,
    today,
  );
}

export function restoreFinanceWithSummary(
  current: FinanceState,
  candidate: VerifiedRestoreCandidate,
  today: string,
): ImportApplication {
  assertRestoreCandidateApplicable(candidate, today);
  if (candidate.requiresRescue)
    throw new Error("Большую копию можно восстановить только в новый профиль.");
  const state = restoreFinance(
    current,
    { ...candidate.state, demo: current.demo },
    today,
  );
  return {
    state,
    summary: buildReplacementImportSummary(current, state, today),
  };
}
