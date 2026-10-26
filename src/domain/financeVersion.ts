import type { FinanceState } from "./types";

/** A new action may require a newer format, but must preserve existing semantics. */
export function promoteFinanceVersion(
  current: FinanceState["version"],
  required: FinanceState["version"],
): FinanceState["version"] {
  return current >= required ? current : required;
}
