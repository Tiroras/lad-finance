import { createInitialState } from "../src/domain/seed";
import { validateBackupValue } from "../src/domain/backup";

/** Synthetic source below 5M UTF-16 whose normalized exponent spelling exceeds it. */
export function createExpandedRecoveryFixture() {
  const normalizationDate = "2026-10-06";
  const snapshotDate = "2026-10-15";
  const state = createInitialState(false, normalizationDate);
  state.transactions = Array.from({ length: 10_000 }, (_, i) => ({
    id: `a03-${i}`,
    type: "income" as const,
    title: "Тест",
    amount: 100000,
    baseAmount: 100000,
    date: normalizationDate,
    category: "other",
    accountId: "card",
    note: "",
  }));
  const raw = () => JSON.stringify(state).replace(/:100000(?=[,}])/g, ":1e5");
  const padding = 4_999_990 - raw().length;
  const each = Math.floor(padding / state.transactions.length);
  if (each < 0 || each > 499)
    throw new Error("Synthetic fixture bounds changed");
  state.transactions.forEach((tx, i) => {
    tx.note = "x".repeat(
      each + (i < padding % state.transactions.length ? 1 : 0),
    );
  });
  const sourceText = raw();
  const normalized = validateBackupValue(
    JSON.parse(sourceText),
    normalizationDate,
  );
  const edited = {
    ...normalized,
    transactions: [
      ...normalized.transactions.slice(4),
      {
        ...normalized.transactions[0],
        id: "a03-later",
        date: snapshotDate,
        note: "Изменение после восстановления",
      },
    ],
  };
  return {
    sourceText,
    normalizationDate,
    editedSnapshotText: JSON.stringify(edited),
    snapshotDate,
  };
}
