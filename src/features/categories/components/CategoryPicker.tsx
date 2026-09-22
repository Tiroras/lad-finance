import { ChoiceGroup } from "../../../shared/ui";
import { useFinance } from "../../../state/finance";
import type { CategoryId } from "../../../domain/types";
import { categoryLabel, orderedCategories } from "../../../domain/categories";

export function CategoryPicker({
  value,
  onChange,
}: {
  value: CategoryId;
  onChange: (id: CategoryId) => void;
}) {
  const { state } = useFinance();
  return (
    <ChoiceGroup
      label="Категория"
      value={value}
      onChange={onChange}
      options={orderedCategories(state)
        .filter((c) => !c.archived || c.id === value)
        .map((c) => ({
          value: c.id,
          label: `${categoryLabel(state, c.id)}${c.archived ? " · архив" : ""}`,
          icon: c.icon,
        }))}
    />
  );
}
