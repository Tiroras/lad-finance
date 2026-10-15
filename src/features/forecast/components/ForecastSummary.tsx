import { View } from "react-native";
import { dateLabel } from "../../../domain/finance";
import type { ForecastResult } from "../../../domain/forecast";
import { useMoney } from "../../../state/finance";
import { C, Card, font, Icon, Row, Txt } from "../../../shared/ui";

function status(result: ForecastResult) {
  if (result.firstShortfall)
    return `Нехватка с ${dateLabel(result.firstShortfall.date)}`;
  if (result.firstBelowBuffer)
    return `Ниже резерва с ${dateLabel(result.firstBelowBuffer.date)}`;
  return "Без нехватки по этому плану";
}

export function ForecastSummary({
  result,
  baseline,
  labels,
}: {
  result: ForecastResult;
  baseline?: ForecastResult;
  labels?: { result: string; baseline: string };
}) {
  const { money } = useMoney();
  const warning = !!result.firstShortfall || !!result.firstBelowBuffer;
  return (
    <Card style={{ backgroundColor: C.green, borderColor: C.green, gap: 19 }}>
      <View style={{ gap: 7 }}>
        <Txt style={{ color: "#CBDBCA", fontSize: 12 }}>
          {labels?.result ??
            (baseline ? "Доступно с покупкой" : "Доступно по плану")}{" "}
          · {dateLabel(result.days.at(-1)!.date)}
        </Txt>
        <Txt
          testID="forecast-closing"
          style={{ color: "#fff", fontFamily: font.semibold, fontSize: 32 }}
        >
          {money(result.closingAvailable, true)}
        </Txt>
        <Txt style={{ color: "#CBDBCA", fontSize: 11 }}>
          На повседневных счетах, за вычетом ожидаемых списаний
        </Txt>
      </View>
      <View
        style={{
          backgroundColor: warning ? "#FAEEE5" : "#DCE9C8",
          padding: 13,
          borderRadius: 13,
          gap: 5,
        }}
      >
        <Row style={{ gap: 8, alignItems: "flex-start" }}>
          <Icon
            name={warning ? "alert-circle-outline" : "checkmark-circle-outline"}
            size={19}
            color={warning ? C.orange : C.green}
          />
          <Txt
            testID="forecast-status"
            style={{
              flex: 1,
              fontSize: 13,
              fontFamily: font.bold,
              color: warning ? "#7E5734" : C.green,
            }}
          >
            {status(result)}
          </Txt>
        </Row>
        <Txt style={{ fontSize: 11, color: "#596651", lineHeight: 18 }}>
          Минимум: {money(result.minimum.available, true)} ·{" "}
          {dateLabel(result.minimum.date)}
        </Txt>
      </View>
      <View style={{ gap: 10 }}>
        {[
          ["Сейчас на счетах", money(result.openingBalance)],
          ["Сейчас удержано ожидающими списаниями", money(result.openingHeld)],
          ["Ожидаемые доходы", `+${money(result.income)}`],
          ["Расходы и взносы", `−${money(result.outflow)}`],
        ].map(([label, value]) => (
          <Row
            key={label}
            style={{
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 4,
            }}
          >
            <Txt style={{ color: "#CBDBCA", fontSize: 12 }}>{label}</Txt>
            <Txt
              style={{ color: "#fff", fontSize: 13, fontFamily: font.semibold }}
            >
              {value}
            </Txt>
          </Row>
        ))}
      </View>
      {baseline && (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: "#50715C",
            paddingTop: 14,
            gap: 5,
          }}
        >
          <Txt style={{ color: "#fff", fontSize: 12 }}>
            {labels?.baseline ?? "Без покупки"}:{" "}
            {money(baseline.closingAvailable, true)}
          </Txt>
          <Txt style={{ color: "#CBDBCA", fontSize: 11 }}>
            {status(baseline)}
          </Txt>
        </View>
      )}
    </Card>
  );
}
