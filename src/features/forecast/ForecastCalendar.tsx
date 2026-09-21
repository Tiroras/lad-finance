import { Pressable, View } from "react-native";
import {
  dateLabel,
  fromDate,
  money,
  monthKey,
  shiftDate,
  shiftMonth,
} from "../../domain/finance";
import type { ForecastResult } from "../../domain/forecast";
import { C, font, IconButton, Row, Txt } from "../../ui";

export function ForecastCalendar({
  result,
  selected,
  onSelect,
}: {
  result: ForecastResult;
  selected: string;
  onSelect: (date: string) => void;
}) {
  const month = `${monthKey(selected)}-01`;
  const first = result.days[0].date,
    last = result.days.at(-1)!.date;
  const offset = (fromDate(month).getDay() + 6) % 7;
  const nextMonth = shiftMonth(month, 1);
  const dayCount = fromDate(shiftDate(nextMonth, -1)).getDate();
  const byDate = new Map(result.days.map((day) => [day.date, day]));
  const move = (n: number) => {
    const date = shiftMonth(month, n);
    onSelect(date < first ? first : date > last ? last : date);
  };
  return (
    <View style={{ gap: 12 }}>
      <Row style={{ justifyContent: "space-between" }}>
        {monthKey(month) > monthKey(first) ? (
          <IconButton
            name="chevron-back"
            label="Предыдущий месяц прогноза"
            onPress={() => move(-1)}
          />
        ) : (
          <View style={{ width: 42 }} />
        )}
        <Txt
          style={{
            fontFamily: font.bold,
            fontSize: 15,
            textTransform: "capitalize",
          }}
        >
          {dateLabel(month, { month: "long", year: "numeric" })}
        </Txt>
        {monthKey(month) < monthKey(last) ? (
          <IconButton
            name="chevron-forward"
            label="Следующий месяц прогноза"
            onPress={() => move(1)}
          />
        ) : (
          <View style={{ width: 42 }} />
        )}
      </Row>
      <Row style={{ gap: 0 }}>
        {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => (
          <Txt
            key={day}
            style={{
              width: `${100 / 7}%`,
              textAlign: "center",
              fontSize: 10,
              color: C.muted,
            }}
          >
            {day}
          </Txt>
        ))}
      </Row>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {Array.from({ length: offset + dayCount }, (_, i) => {
          const date = shiftDate(month, i - offset),
            day = byDate.get(date);
          if (i < offset)
            return (
              <View key={date} style={{ width: `${100 / 7}%`, height: 48 }} />
            );
          const active = selected === date;
          const color =
            day && day.balance < 0
              ? C.red
              : day && day.balance < result.buffer
                ? C.orange
                : C.green;
          const marked =
            day && (day.events.length > 0 || day.balance < result.buffer);
          return (
            <View key={date} style={{ width: `${100 / 7}%`, padding: 2 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${dateLabel(date)}: ${day ? money(day.balance, true) : "вне прогноза"}`}
                accessibilityState={{ selected: active, disabled: !day }}
                disabled={!day}
                onPress={() => onSelect(date)}
                style={{
                  height: 44,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  backgroundColor: active
                    ? C.green
                    : day && day.balance < 0
                      ? "#FAECE9"
                      : "transparent",
                  opacity: day ? 1 : 0.3,
                }}
              >
                <Txt
                  style={{
                    fontSize: 12,
                    fontFamily: active ? font.bold : font.medium,
                    color: active ? "#fff" : color,
                  }}
                >
                  {i - offset + 1}
                </Txt>
                <View
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: marked
                      ? active
                        ? C.lime
                        : color
                      : "transparent",
                  }}
                />
              </Pressable>
            </View>
          );
        })}
      </View>
      <Txt style={{ color: C.muted, fontSize: 10, lineHeight: 17 }}>
        Красный — нехватка · охра — ниже резерва. Нажмите на день, чтобы увидеть
        расчёт.
      </Txt>
    </View>
  );
}
