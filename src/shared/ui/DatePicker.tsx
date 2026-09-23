import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { dateLabel, fromDate, localDate, validDate } from "../lib/dates";
import { C, font } from "./theme";
import { Txt } from "./Txt";
import { Row } from "./Row";
import { IconButton } from "./IconButton";
import { interactionStyles } from "./interactionStyles";

const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const months = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

export function DatePicker({
  value,
  onChange,
  onClose,
  allowClear,
  testID,
}: {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  allowClear: boolean;
  testID: string;
}) {
  const today = localDate();
  const [cursor, setCursor] = useState(() =>
    fromDate(validDate(value) ? value : today),
  );
  const [mode, setMode] = useState<"days" | "months" | "years">("days");
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const [yearPage, setYearPage] = useState(() => Math.floor(year / 12) * 12);
  const first = new Date(cursor);
  first.setDate(1);
  const offset = (first.getDay() + 6) % 7;
  const last = new Date(first);
  last.setMonth(month + 1);
  last.setDate(0);
  const dayCount = last.getDate();
  const move = (direction: number) => {
    if (mode === "years") {
      setYearPage(Math.max(0, Math.min(9996, yearPage + direction * 12)));
      return;
    }
    const date = new Date(first);
    if (mode === "months") date.setFullYear(year + direction);
    else date.setMonth(month + direction);
    if (date.getFullYear() >= 1 && date.getFullYear() <= 9999) setCursor(date);
  };
  return (
    <View style={s.calendar} testID={testID}>
      <Row style={{ gap: 0 }}>
        <IconButton
          name="chevron-back"
          label={
            mode === "days"
              ? "Предыдущий месяц"
              : mode === "months"
                ? "Предыдущий год"
                : "Предыдущие годы"
          }
          onPress={() => move(-1)}
          style={s.arrow}
        />
        <View style={s.heading}>
          {mode === "years" ? (
            <Txt style={s.headingText}>
              {Math.max(1, yearPage)}–{Math.min(9999, yearPage + 11)}
            </Txt>
          ) : (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Выбрать месяц"
                onPress={() => setMode(mode === "months" ? "days" : "months")}
                style={s.headingButton}
              >
                <Txt style={s.headingText}>{months[month]}</Txt>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Выбрать год"
                onPress={() => {
                  setYearPage(Math.floor(year / 12) * 12);
                  setMode("years");
                }}
                style={s.headingButton}
              >
                <Txt style={s.headingText}>{year}</Txt>
              </Pressable>
            </>
          )}
        </View>
        <IconButton
          name="chevron-forward"
          label={
            mode === "days"
              ? "Следующий месяц"
              : mode === "months"
                ? "Следующий год"
                : "Следующие годы"
          }
          onPress={() => move(1)}
          style={s.arrow}
        />
      </Row>
      {mode === "days" ? (
        <>
          <View style={s.grid}>
            {weekdays.map((day) => (
              <View key={day} style={s.weekday}>
                <Txt style={s.weekdayText}>{day}</Txt>
              </View>
            ))}
          </View>
          <View style={s.grid}>
            {Array.from(
              { length: Math.ceil((offset + dayCount) / 7) * 7 },
              (_, index) => {
                const day = index - offset + 1;
                if (day < 1 || day > dayCount)
                  return <View key={index} style={s.day} />;
                const date = `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const selected = value === date;
                return (
                  <Pressable
                    key={index}
                    accessibilityRole="button"
                    accessibilityLabel={dateLabel(date, {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                    accessibilityState={{ selected }}
                    onPress={() => onChange(date)}
                    style={({ pressed }) => [
                      s.day,
                      selected && s.selected,
                      date === today && s.today,
                      pressed && interactionStyles.pressed,
                    ]}
                  >
                    <Txt style={[s.dayText, selected && s.selectedText]}>
                      {day}
                    </Txt>
                  </Pressable>
                );
              },
            )}
          </View>
        </>
      ) : (
        <View style={s.grid}>
          {Array.from({ length: 12 }, (_, index) => {
            const choice = mode === "years" ? yearPage + index : index;
            if (mode === "years" && (choice < 1 || choice > 9999))
              return <View key={index} style={s.choice} />;
            const selected =
              mode === "years" ? choice === year : choice === month;
            return (
              <Pressable
                key={index}
                accessibilityRole="button"
                accessibilityLabel={
                  mode === "years" ? `${choice} год` : months[choice]
                }
                accessibilityState={{ selected }}
                onPress={() => {
                  const date = new Date(first);
                  if (mode === "years") {
                    date.setFullYear(choice);
                    setMode("months");
                  } else {
                    date.setMonth(choice);
                    setMode("days");
                  }
                  setCursor(date);
                }}
                style={({ pressed }) => [
                  s.choice,
                  selected && s.selected,
                  pressed && interactionStyles.pressed,
                ]}
              >
                <Txt style={[s.choiceText, selected && s.selectedText]}>
                  {mode === "years" ? choice : months[choice]}
                </Txt>
              </Pressable>
            );
          })}
        </View>
      )}
      <View style={s.actions}>
        <Pressable
          accessibilityRole="button"
          onPress={() => onChange(today)}
          style={s.action}
        >
          <Txt style={s.actionText}>Сегодня</Txt>
        </Pressable>
        {allowClear && (
          <Pressable
            accessibilityRole="button"
            onPress={() => onChange("")}
            style={s.action}
          >
            <Txt style={s.actionText}>Очистить дату</Txt>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={s.action}
        >
          <Txt style={s.actionText}>Отмена</Txt>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  calendar: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
    padding: 8,
    gap: 8,
  },
  arrow: { width: 32, height: 44 },
  heading: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
  },
  headingButton: {
    paddingHorizontal: 5,
    minHeight: 44,
    justifyContent: "center",
  },
  headingText: { fontFamily: font.bold, fontSize: 14 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  weekday: { width: "14.285714%", alignItems: "center", paddingVertical: 4 },
  weekdayText: { color: C.muted, fontSize: 11 },
  day: {
    width: "14.285714%",
    height: 42,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "transparent",
  },
  dayText: { fontSize: 14, fontFamily: font.medium },
  selected: { backgroundColor: C.green },
  selectedText: { color: C.surface },
  today: { borderColor: C.green },
  choice: {
    width: "33.333333%",
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  choiceText: { fontSize: 12, fontFamily: font.medium },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  action: { minHeight: 44, justifyContent: "center", paddingHorizontal: 6 },
  actionText: { color: C.green, fontSize: 12, fontFamily: font.semibold },
});
