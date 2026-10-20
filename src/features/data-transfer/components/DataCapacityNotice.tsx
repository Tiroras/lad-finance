import { useMemo } from "react";
import { View } from "react-native";
import {
  capacityMessage,
  dataCapacity,
  nearCapacity,
} from "../../../domain/dataLimits";
import { useFinance } from "../../../state/finance";
import { Notice } from "../../../shared/ui";
import {
  MAX_PAYMENT_OCCURRENCES,
  paymentCapacityCount,
} from "../../../domain/payments";

export function DataCapacityNotice() {
  const { state, today } = useFinance();
  const warnings = useMemo(
    () =>
      dataCapacity(state).filter((entry) =>
        nearCapacity(entry.used, entry.limit),
      ),
    [state],
  );
  const calendarWarning = useMemo(() => {
    try {
      const used = paymentCapacityCount(state, today);
      return nearCapacity(used, MAX_PAYMENT_OCCURRENCES)
        ? capacityMessage({
            key: "paymentCalendar",
            name: "даты платежей",
            used,
            limit: MAX_PAYMENT_OCCURRENCES,
            remedy:
              "Учитываются неоплаченные просрочки и даты ближайшего года. Уточните начало или интервал повторений; отметьте действительно завершённые платежи.",
          })
        : "";
    } catch (error) {
      return error instanceof Error
        ? error.message
        : "Не удалось проверить объём календаря платежей.";
    }
  }, [state, today]);
  if (!warnings.length && !calendarWarning) return null;
  return (
    <View testID="data-capacity-warnings" style={{ gap: 12 }}>
      {warnings.map((entry) => (
        <Notice key={entry.key} tone="warning">
          {capacityMessage(entry)}
        </Notice>
      ))}
      {!!calendarWarning && <Notice tone="warning">{calendarWarning}</Notice>}
    </View>
  );
}
