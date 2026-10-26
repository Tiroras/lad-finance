import { accountArchiveBlockers } from "../accountArchive";
import { promoteFinanceVersion } from "../financeVersion";
import type { FinanceState } from "../types";
import { ensure } from "./validation";

export function archiveAccount(
  state: FinanceState,
  id: string,
  today: string,
): FinanceState {
  const account = state.accounts.find((entry) => entry.id === id);
  ensure(account, "Счёт уже удалён.");
  if (account.archived) return state;
  const blocker = accountArchiveBlockers(state, id, today)[0];
  ensure(!blocker, blocker?.message ?? "Счёт пока нельзя архивировать.");
  return {
    ...state,
    version: promoteFinanceVersion(state.version, 5),
    accounts: state.accounts.map((entry) =>
      entry.id === id ? { ...entry, archived: true } : entry,
    ),
  };
}

export function restoreAccount(state: FinanceState, id: string): FinanceState {
  const account = state.accounts.find((entry) => entry.id === id);
  ensure(account, "Счёт уже удалён.");
  if (!account.archived) return state;
  return {
    ...state,
    version: promoteFinanceVersion(state.version, 5),
    accounts: state.accounts.map((entry) =>
      entry.id === id ? { ...entry, archived: false } : entry,
    ),
  };
}
