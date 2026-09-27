import { createInitialState } from "./seed";
import type { FinanceState } from "./types";

// Personal seed data does not depend on the date. Build its small template once.
const emptyLedger = createInitialState(false, "2000-01-01");

function sameFields<T extends object>(value: T, expected: T): boolean {
  return Object.keys({ ...value, ...expected }).every(
    (key) => value[key as keyof T] === expected[key as keyof T],
  );
}

function sameRecords<T extends object>(values: T[], expected: T[]): boolean {
  return (
    values.length === expected.length &&
    values.every((value, index) => sameFields(value, expected[index]))
  );
}

export function canStartOnboarding(state: FinanceState): boolean {
  if (state.demo) return true;
  if (state.settings.onboardingCompleted !== false) return false;

  // The wizard replaces the ledger. Decline if the user has already changed it,
  // including while another copy of the wizard was open. Exchange rates are
  // updated in the background and explicitly preserved by completeOnboarding.
  const { exchange, onboardingCompleted, ...settings } = state.settings;
  return (
    sameFields(settings, emptyLedger.settings) &&
    sameRecords(state.accounts, emptyLedger.accounts) &&
    sameRecords(state.categories, emptyLedger.categories) &&
    Object.entries(state).every(([key, value]) => {
      if (
        ["version", "demo", "settings", "accounts", "categories"].includes(key)
      )
        return true;
      return (
        value === undefined || (Array.isArray(value) && value.length === 0)
      );
    })
  );
}
