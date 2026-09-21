import { useState } from "react";
import { Pressable, View } from "react-native";
import type { CurrencyCode } from "../domain/currency";
import { money } from "../domain/finance";
import { Row } from "./Row";
import { C, font } from "./theme";
import { Txt } from "./Txt";

export function BarChart({
  values,
  labels,
  currency = "RUB",
}: {
  values: number[];
  labels: string[];
  currency?: CurrencyCode;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const max = Math.max(1, ...values);
  return (
    <View>
      <Row style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <Txt style={{ fontSize: 11, color: C.muted }}>
          {selected === null ? "Расходы по дням" : labels[selected]}
        </Txt>
        <Txt style={{ fontSize: 11, color: C.green, fontFamily: font.bold }}>
          {selected === null
            ? "Нажмите на столбик"
            : money(values[selected], false, currency)}
        </Txt>
      </Row>
      <Row
        style={{
          height: 112,
          gap: values.length > 10 ? 4 : 13,
          alignItems: "flex-end",
        }}
      >
        {values.map((value, index) => (
          <Pressable
            key={index}
            accessibilityRole="button"
            accessibilityLabel={`${labels[index]}: ${money(value, false, currency)}`}
            onPress={() => setSelected(index)}
            style={{
              flex: 1,
              height: "100%",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: 9,
            }}
          >
            <View
              style={{
                width: "100%",
                height: 82,
                justifyContent: "flex-end",
                borderRadius: 6,
                backgroundColor: "#F4F6F0",
              }}
            >
              <View
                style={{
                  height: Math.max(value ? 7 : 0, (value / max) * 82),
                  width: "100%",
                  borderRadius: 6,
                  backgroundColor:
                    selected === index || index === values.length - 1
                      ? C.green
                      : "#C9DCAA",
                }}
              />
            </View>
            {values.length <= 10 && (
              <Txt
                style={{
                  color: selected === index ? C.green : C.muted,
                  fontSize: 10,
                }}
              >
                {labels[index]}
              </Txt>
            )}
          </Pressable>
        ))}
      </Row>
    </View>
  );
}
