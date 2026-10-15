import { validateBackupValue } from "../../domain/backup";
import {
  fingerprintFinanceState,
  sameFingerprint,
} from "../../domain/backupRecovery";
import type { FinanceState } from "../../domain/types";
import type { LedgerInspection } from "../../infrastructure/storage/ledgerContracts";

/** Exact read-back proof. A rejected write can still have committed its bytes. */
export async function confirmFinanceSnapshot({
  state,
  today,
  save,
  inspect,
}: {
  state: FinanceState;
  today: string;
  save: () => Promise<void>;
  inspect: () => Promise<LedgerInspection>;
}): Promise<void> {
  const expected = fingerprintFinanceState(validateBackupValue(state, today));
  const matches = async () => {
    const stored = await inspect();
    return (
      stored.status === "readable" &&
      sameFingerprint(expected, fingerprintFinanceState(stored.state))
    );
  };
  // On retry, prove a previous ambiguous commit before attempting another write.
  try {
    if (await matches()) return;
  } catch {
    // A transient read failure does not justify deleting the draft.
  }
  try {
    await save();
  } catch {
    // The following read is authoritative, including a failure after commit.
  }
  try {
    if (await matches()) return;
  } catch {
    // Keep the entered fields and the same transaction ID for another attempt.
  }
  throw new Error(
    "Запись пока не подтверждена чтением. Черновик сохранён. Повторите сохранение; новая операция повторно не добавится.",
  );
}
