import { ChoiceGroup } from "../../../shared/ui";

export function ColumnPicker({
  label,
  headers,
  value,
  onChange,
}: {
  label: string;
  headers: string[];
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <ChoiceGroup
      label={label}
      value={value}
      onChange={onChange}
      horizontal
      gap={8}
      options={[
        { value: -1, label: "Не выбрана" },
        ...headers.map((header, index) => ({
          value: index,
          label: `${index + 1}. ${header}`,
        })),
      ]}
    />
  );
}
