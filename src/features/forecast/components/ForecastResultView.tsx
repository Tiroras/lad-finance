import { useState } from "react";
import { View } from "react-native";
import type { ForecastResult } from "../../../domain/forecast";
import type { OpenSheet } from "../../../application/navigation/types";
import { C, Card } from "../../../shared/ui";
import { ForecastSummary } from "./ForecastSummary";
import { ForecastChart } from "./ForecastChart";
import { ForecastCalendar } from "./ForecastCalendar";
import { ForecastDayDetails } from "./ForecastDayDetails";
import { AccountForecastDetails } from "./AccountForecastDetails";

export function ForecastResultView({
  result,
  baseline,
  labels,
  open,
}: {
  result: ForecastResult;
  baseline?: ForecastResult;
  labels?: { result: string; baseline: string };
  open?: OpenSheet;
}) {
  const [selected, setSelected] = useState(result.days[0].date);
  const [wide, setWide] = useState(false);
  const day = result.days.find((d) => d.date === selected) ?? result.days[0];
  return (
    <View
      onLayout={(event) => setWide(event.nativeEvent.layout.width >= 820)}
      style={{
        gap: 20,
        flexDirection: wide ? "row" : "column",
        alignItems: "flex-start",
      }}
    >
      <View style={wide ? { flex: 1, gap: 20 } : { width: "100%", gap: 20 }}>
        <ForecastSummary result={result} baseline={baseline} labels={labels} />
        <Card>
          <ForecastChart result={result} baseline={baseline} labels={labels} />
        </Card>
        <AccountForecastDetails result={result} date={day.date} />
      </View>
      <Card
        style={[
          { padding: 14, gap: 20 },
          wide ? { flex: 1 } : { width: "100%" },
        ]}
      >
        <ForecastCalendar
          result={result}
          selected={day.date}
          onSelect={setSelected}
        />
        <View style={{ height: 1, backgroundColor: C.border }} />
        <ForecastDayDetails day={day} open={open} />
      </Card>
    </View>
  );
}
