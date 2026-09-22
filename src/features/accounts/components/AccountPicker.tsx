import type { CurrencyCode } from "../../../domain/currency";
import { useFinance } from "../../../state/finance";
import { ChoiceGroup } from "../../../shared/ui";

export function AccountPicker({
  selected,
  onChange,
  exclude,
  spendingOnly = false,
  includeCredit = false,
  savingsOnly = false,
  currency,
  label = "Счёт",
}: {
  selected: string;
  onChange: (id: string) => void;
  exclude?: string;
  spendingOnly?: boolean;
  includeCredit?: boolean;
  savingsOnly?: boolean;
  currency?: CurrencyCode;
  label?: string;
}) {
  const { state } = useFinance();
  return (
    <ChoiceGroup
      label={label}
      value={selected}
      onChange={onChange}
      horizontal
      options={state.accounts
        .filter(
          (a) =>
            a.id !== exclude &&
            (!spendingOnly ||
              a.kind === "spending" ||
              (includeCredit && a.kind === "credit")) &&
            (!savingsOnly || a.kind === "savings") &&
            (!currency || (a.currency ?? "RUB") === currency),
        )
        .map((a) => ({
          value: a.id,
          label: `${a.name}${a.kind === "credit" ? " · кредитная" : ""}${a.currency && a.currency !== "RUB" ? ` · ${a.currency}` : ""}`,
          icon: a.icon,
        }))}
    />
  );
}
