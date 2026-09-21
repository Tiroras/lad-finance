import { View } from "react-native";
import {
  CURRENCIES,
  CURRENCY_CODES,
  type CurrencyCode,
} from "../../domain/currency";
import { C, Chip, Txt, font } from "../../ui";

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
    <View style={{ gap: 10 }}>
      <Txt style={{ fontSize: 12, fontFamily: font.semibold, color: C.muted }}>
        {label}
        {disabled ? ` · ${value} — ${CURRENCIES[value].name}` : ""}
      </Txt>
      {!disabled && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {CURRENCY_CODES.map((code) => (
            <Chip
              key={code}
              label={code}
              active={value === code}
              onPress={() => onChange(code)}
            />
          ))}
        </View>
      )}
    </View>
  );
}
