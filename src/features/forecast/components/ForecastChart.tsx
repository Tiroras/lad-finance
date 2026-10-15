import { View } from "react-native";
import Svg, { Line, Polyline } from "react-native-svg";
import { dateLabel } from "../../../domain/finance";
import type { ForecastResult } from "../../../domain/forecast";
import { useMoney } from "../../../state/finance";
import { C, font, Row, Txt } from "../../../shared/ui";

export function ForecastChart({
  result,
  baseline,
  labels,
}: {
  result: ForecastResult;
  baseline?: ForecastResult;
  labels?: { result: string; baseline: string };
}) {
  const { money } = useMoney();
  const values = [
    0,
    result.buffer,
    result.openingAvailable,
    ...result.days.map((d) => d.available),
    ...(baseline?.days.map((d) => d.available) ?? []),
  ];
  const min = Math.min(...values),
    max = Math.max(...values);
  const span = Math.max(100, max - min);
  const y = (n: number) => 150 - ((n - min) / span) * 130;
  const points = (data: ForecastResult) =>
    data.days
      .map(
        (day, i) =>
          `${8 + (i / (data.days.length - 1)) * 304},${y(day.available)}`,
      )
      .join(" ");
  return (
    <View style={{ gap: 10 }}>
      <Txt style={{ fontFamily: font.bold, fontSize: 16 }}>
        Как меняется доступный остаток
      </Txt>
      <Row style={{ justifyContent: "space-between" }}>
        <Txt style={{ fontSize: 11, color: C.muted }}>{money(max)}</Txt>
        <Txt style={{ fontSize: 11, color: C.orange }}>
          Резерв {money(result.buffer)}
        </Txt>
      </Row>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel="График доступного остатка по дням; точные суммы доступны в календаре ниже"
      >
        <Svg
          width="100%"
          height={168}
          viewBox="0 0 320 168"
          preserveAspectRatio="none"
        >
          <Line
            x1={8}
            x2={312}
            y1={y(0)}
            y2={y(0)}
            stroke={C.red}
            strokeWidth={1}
            opacity={0.45}
          />
          <Line
            x1={8}
            x2={312}
            y1={y(result.buffer)}
            y2={y(result.buffer)}
            stroke={C.orange}
            strokeWidth={1}
            strokeDasharray="3 5"
          />
          {baseline && (
            <Polyline
              points={points(baseline)}
              fill="none"
              stroke="#9BA991"
              strokeWidth={2}
              strokeDasharray="5 5"
            />
          )}
          <Polyline
            points={points(result)}
            fill="none"
            stroke={baseline ? "#81729C" : C.green}
            strokeWidth={3}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </Svg>
      </View>
      <Row style={{ justifyContent: "space-between" }}>
        <Txt style={{ fontSize: 11, color: C.muted }}>
          {dateLabel(result.days[0].date, { day: "numeric", month: "short" })}
        </Txt>
        <Txt style={{ fontSize: 11, color: C.muted }}>{money(min)}</Txt>
        <Txt style={{ fontSize: 11, color: C.muted }}>
          {dateLabel(result.days.at(-1)!.date, {
            day: "numeric",
            month: "short",
          })}
        </Txt>
      </Row>
      {baseline && (
        <Row style={{ flexWrap: "wrap", gap: 14 }}>
          <Txt style={{ fontSize: 11, color: "#81729C" }}>
            ━ {labels?.result ?? "С покупкой"}
          </Txt>
          <Txt style={{ fontSize: 11, color: "#68775E" }}>
            ┄ {labels?.baseline ?? "Без покупки"}
          </Txt>
        </Row>
      )}
    </View>
  );
}
