import {
  CURRENCIES,
  CURRENCY_CODES,
  type CurrencyCode,
} from "../../../domain/currency";
import { ChoiceGroup } from "../../../shared/ui";

export function CurrencyPicker({
  value,
  onChange,
  label = "Валюта",
  disabled = false,
}: {
  value: CurrencyCode;
  onChange: (code: CurrencyCode) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <ChoiceGroup
      label={`${label}${disabled ? ` · ${value} — ${CURRENCIES[value].name}` : ""}`}
      value={value}
      onChange={onChange}
      options={
        disabled
          ? []
          : CURRENCY_CODES.map((code) => ({ value: code, label: code }))
      }
    />
  );
}
