import { ChoiceGroup, SelectField } from "../../../shared/ui";
import { useFinance } from "../../../state/finance";
import type { CategoryId } from "../../../domain/types";
import { categoryLabel, orderedCategories } from "../../../domain/categories";

export function CategoryPicker({
  value,
  onChange,
  variant = "chips",
}: {
  value: CategoryId;
  onChange: (id: CategoryId) => void;
  variant?: "chips" | "select";
}) {
  const { state } = useFinance();
  const Picker =
    variant === "select" ? SelectField<CategoryId> : ChoiceGroup<CategoryId>;
  return (
    <Picker
      label="Категория"
      value={value}
      onChange={onChange}
      options={orderedCategories(state)
        .filter((c) => !c.archived || c.id === value)
        .map((c) => ({
          value: c.id,
          label: `${categoryLabel(state, c.id)}${c.archived ? " · архив" : ""}`,
          icon: c.icon,
          color: c.color,
          background: c.background,
        }))}
    />
  );
}
