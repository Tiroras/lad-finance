import { useMemo, useState } from "react";
import { View } from "react-native";
import { monthlyOverview } from "../../../domain/insights";
import { dateLabel } from "../../../shared/lib/dates";
import { useFinance, useMoney } from "../../../state/finance";
import { C, Card, font, Section, Segments, Txt } from "../../../shared/ui";

export function MonthOverview({ month }: { month: string }) {
  const { state, today } = useFinance();
  const { money } = useMoney();
  const [period, setPeriod] = useState<"3" | "6" | "12">("3");
  const months = useMemo(
    () => monthlyOverview(state, month, Number(period) as 3 | 6 | 12, today),
    [state, month, period, today],
  );
  return (
    <Card>
      <Section title="История по месяцам" />
      <View style={{ gap: 16 }}>
        <Segments
          value={period}
          onChange={setPeriod}
          options={[
            { value: "3", label: "3 месяца" },
            { value: "6", label: "6 месяцев" },
            { value: "12", label: "Год" },
          ]}
        />
        <Txt style={{ color: C.muted, fontSize: 12, lineHeight: 19 }}>
          Период заканчивается выбранным месяцем. Доходы и расходы в основной
          валюте, переводы исключены. Отсутствующие записи не заменяются
          оценками.
        </Txt>
        {months.map((item) => (
          <View
            key={item.month}
            style={{
              gap: 6,
              paddingTop: 12,
              borderTopWidth: 1,
              borderTopColor: C.border,
            }}
          >
            <Txt style={{ fontFamily: font.bold, fontSize: 14 }}>
              {dateLabel(item.start, { month: "long", year: "numeric" })}
            </Txt>
            {item.status === "missing" || item.status === "future" ? (
              <Txt style={{ color: C.muted, fontSize: 12 }}>
                {item.status === "future"
                  ? "Месяц ещё не начался"
                  : "Нет истории за этот месяц"}
              </Txt>
            ) : (
              <>
                <Txt style={{ fontSize: 12, lineHeight: 19 }}>
                  Доходы: {money(item.income)} · Расходы: {money(item.expense)}
                </Txt>
                <Txt style={{ fontSize: 12, color: C.muted }}>
                  Разница: {money(item.income - item.expense)}
                </Txt>
                {item.status === "partial" && (
                  <Txt style={{ fontSize: 11, color: C.muted }}>
                    Неполный месяц: начало истории или текущий период.
                  </Txt>
                )}
                {item.count === 0 && (
                  <Txt style={{ fontSize: 11, color: C.muted }}>
                    Операций не записано. Проверьте полноту учёта.
                  </Txt>
                )}
              </>
            )}
          </View>
        ))}
      </View>
    </Card>
  );
}
