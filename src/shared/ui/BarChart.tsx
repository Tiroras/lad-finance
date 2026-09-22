import { useState } from "react";
import { Pressable, View } from "react-native";
import { Row } from "./Row";
import { C, font } from "./theme";
import { Txt } from "./Txt";

export function BarChart({
  values,
  labels,
  formatValue,
}: {
  values: number[];
  labels: string[];
  formatValue: (value: number) => string;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const positive = Math.max(1, ...values);
  const negative = Math.max(0, ...values.map((value) => -value));
  const range = positive + negative;
  const zero = (negative / range) * 82;
  return (
    <View>
      <Row style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <Txt style={{ fontSize: 11, color: C.muted }}>
          {selected === null ? "Расходы по дням" : labels[selected]}
        </Txt>
        <Txt style={{ fontSize: 11, color: C.green, fontFamily: font.bold }}>
          {selected === null
            ? "Нажмите на столбик"
            : formatValue(values[selected])}
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
            accessibilityLabel={`${labels[index]}: ${formatValue(value)}`}
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
                overflow: "hidden",
              }}
            >
              {negative > 0 && (
                <View
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: zero,
                    borderTopWidth: 1,
                    borderTopColor: C.muted,
                  }}
                />
              )}
              <View
                style={{
                  position: "absolute",
                  bottom:
                    value >= 0 ? zero : zero - (Math.abs(value) / range) * 82,
                  height:
                    negative > 0
                      ? (Math.abs(value) / range) * 82
                      : Math.max(value ? 7 : 0, (value / range) * 82),
                  width: "100%",
                  borderRadius: 6,
                  backgroundColor:
                    value < 0
                      ? C.orange
                      : selected === index || index === values.length - 1
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
