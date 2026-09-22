import { Pressable, View } from "react-native";
import { dateLabel } from "../../../domain/finance";
import type { ForecastDay, ForecastEvent } from "../../../domain/forecast";
import { useMoney } from "../../../state/finance";
import type { OpenSheet } from "../../../application/navigation/types";
import { C, font, Icon, Row, Txt } from "../../../shared/ui";

export function ForecastDayDetails({
  day,
  open,
}: {
  day: ForecastDay;
  open?: OpenSheet;
}) {
  const { money } = useMoney();
  const openEvent = (event: ForecastEvent) => {
    if (!open || !event.sourceId) return;
    if (event.type === "income")
      open({ type: "income", id: event.sourceId, date: event.occurrenceDate });
    if (event.type === "payment")
      open({ type: "payment", id: event.sourceId, date: event.occurrenceDate });
    if (event.type === "goal") open({ type: "fund", id: event.sourceId });
    if (event.type === "debt") open({ type: "repayDebt", id: event.sourceId });
    if (event.type === "credit")
      open({ type: "repayCredit", id: event.sourceId });
  };
  return (
    <View testID="forecast-day" style={{ gap: 14 }}>
      <Txt style={{ fontFamily: font.bold, fontSize: 16 }}>
        {dateLabel(day.date)}
      </Txt>
      <Row style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <Txt style={{ color: C.muted, fontSize: 12 }}>До событий дня</Txt>
        <Txt style={{ fontSize: 13 }}>{money(day.openingBalance, true)}</Txt>
      </Row>
      {day.events.length === 0 && (
        <Txt style={{ fontSize: 12, color: C.muted }}>
          На этот день ничего не запланировано.
        </Txt>
      )}
      {day.events.map((event) => (
        <Pressable
          key={event.id}
          accessibilityRole={open && event.sourceId ? "button" : undefined}
          disabled={!open || !event.sourceId}
          onPress={() => openEvent(event)}
          style={{ gap: 5, paddingVertical: 6 }}
        >
          <Row style={{ gap: 10, alignItems: "flex-start" }}>
            <Icon
              name={
                event.type === "income"
                  ? "arrow-down-outline"
                  : event.type === "goal"
                    ? "flag-outline"
                    : event.type === "purchase"
                      ? "bag-handle-outline"
                      : "arrow-up-outline"
              }
              size={16}
              color={event.amount > 0 ? C.green : C.muted}
            />
            <View style={{ flex: 1, gap: 4 }}>
              <Txt style={{ fontSize: 12, fontFamily: font.medium }}>
                {event.name}
              </Txt>
              {event.overdue && (
                <Txt style={{ fontSize: 10, color: C.orange }}>
                  По плану {dateLabel(event.occurrenceDate)} · учтено сегодня
                </Txt>
              )}
              {event.type === "goal" && (
                <Txt style={{ fontSize: 10, color: C.muted }}>
                  Плановый взнос на цель
                </Txt>
              )}
              {(event.type === "debt" || event.type === "credit") && (
                <Txt style={{ fontSize: 10, color: C.muted }}>
                  {event.type === "debt"
                    ? "Возврат заёмных денег"
                    : "Обязательный платёж по карте"}
                </Txt>
              )}
            </View>
            <Txt
              style={{
                fontSize: 12,
                fontFamily: font.semibold,
                color: event.amount > 0 ? C.green : C.ink,
              }}
            >
              {event.amount > 0 ? "+" : "−"}
              {money(Math.abs(event.amount), true)}
            </Txt>
          </Row>
        </Pressable>
      ))}
      <Row
        style={{
          borderTopWidth: 1,
          borderTopColor: C.border,
          paddingTop: 14,
          justifyContent: "space-between",
          flexWrap: "wrap",
        }}
      >
        <Txt style={{ fontSize: 12 }}>К концу дня</Txt>
        <Txt
          style={{
            fontFamily: font.bold,
            color: day.balance < 0 ? C.red : C.green,
          }}
        >
          {money(day.balance, true)}
        </Txt>
      </Row>
    </View>
  );
}
