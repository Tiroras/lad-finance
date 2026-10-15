import type { CurrencyCode } from "../../../domain/currency";
import { useFinance } from "../../../state/finance";
import { ChoiceGroup, Notice } from "../../../shared/ui";

export function AccountPicker({
  selected,
  onChange,
  exclude,
  spendingOnly = false,
  includeCredit = false,
  savingsOnly = false,
  currency,
  label = "Счёт",
  allowArchived = false,
}: {
  selected: string;
  onChange: (id: string) => void;
  exclude?: string;
  spendingOnly?: boolean;
  includeCredit?: boolean;
  savingsOnly?: boolean;
  currency?: CurrencyCode;
  label?: string;
  allowArchived?: boolean;
}) {
  const { state } = useFinance();
  const accounts = state.accounts.filter(
    (a) =>
      (allowArchived || !a.archived) &&
      a.id !== exclude &&
      (!spendingOnly ||
        a.kind === "spending" ||
        (includeCredit && a.kind === "credit")) &&
      (!savingsOnly || a.kind === "savings") &&
      (!currency || (a.currency ?? "RUB") === currency),
  );
  if (!accounts.length)
    return (
      <Notice>
        {label}: нет подходящего активного счёта. Создайте или восстановите счёт
        в разделе «Мои счета».
      </Notice>
    );
  return (
    <>
      {!!selected && !accounts.some((account) => account.id === selected) && (
        <Notice tone="warning">
          Прежний счёт недоступен для новой записи. Выберите подходящий активный
          счёт; сохранённая история остаётся на прежнем счёте.
        </Notice>
      )}
      <ChoiceGroup
        label={label}
        value={selected}
        onChange={onChange}
        horizontal
        options={accounts.map((a) => ({
          value: a.id,
          label: `${a.name}${a.archived ? " · архив" : ""}${a.kind === "credit" ? " · кредитная" : ""}${a.currency && a.currency !== "RUB" ? ` · ${a.currency}` : ""}`,
          icon: a.icon,
        }))}
      />
    </>
  );
}
