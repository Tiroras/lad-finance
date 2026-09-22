import {
  backupByteLength,
  checkedBackupContent,
  decodeBackup,
  encodeBackup,
} from "../../domain/backup";
import type { FinanceState } from "../../domain/types";
import { LEGACY_STORAGE_KEY } from "./vault";

export function createPlainLedgerStorage(storage: {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
}) {
  let previousBytes: number | undefined;
  const load = async () => {
    const raw = await storage.getItem(LEGACY_STORAGE_KEY);
    const state = raw !== null ? decodeBackup(raw) : null;
    previousBytes = state ? backupByteLength(encodeBackup(state)) : 0;
    return state;
  };
  const save = async (state: FinanceState) => {
    if (previousBytes === undefined) await load();
    const content = checkedBackupContent(state, previousBytes);
    await storage.setItem(LEGACY_STORAGE_KEY, content);
    previousBytes = backupByteLength(content);
  };
  return {
    load,
    save,
    async recover(state: FinanceState) {
      // Recovery may replace unreadable data, but it grants a size allowance only
      // when the previous snapshot is valid. It never trusts corrupt file length.
      let allowance = 0;
      try {
        const previous = await load();
        if (previous) allowance = previousBytes ?? 0;
      } catch {
        /* An explicit recovery can replace a damaged snapshot within 5 MB. */
      }
      const content = checkedBackupContent(state, allowance);
      await storage.setItem(LEGACY_STORAGE_KEY, content);
      previousBytes = backupByteLength(content);
    },
  };
}
