import type { RecurrenceSchedule } from "../../../domain/recurrence";
import { Field, Notice, Segments } from "../../../shared/ui";
import { scheduleLabel } from "../../../domain/recurrence";

export function RecurrenceFields({
  schedule,
  onChange,
  anchor,
  locked = false,
}: {
  schedule?: RecurrenceSchedule;
  onChange: (schedule: RecurrenceSchedule | undefined) => void;
  anchor: string;
  locked?: boolean;
}) {
  if (locked)
    return (
      <Notice>
        {schedule ? scheduleLabel(schedule) : "Каждый месяц"}. График
        сохраняется для истории. Для другой периодичности создайте новый план.
      </Notice>
    );
  return (
    <>
      <Segments
        value={schedule?.unit ?? "legacy"}
        onChange={(unit: "legacy" | RecurrenceSchedule["unit"]) =>
          onChange(
            unit === "legacy" ? undefined : { unit, interval: 1, anchor },
          )
        }
        options={[
          { value: "legacy", label: "Месяц" },
          { value: "week", label: "Неделя" },
          { value: "year", label: "Год" },
          { value: "day", label: "Дни" },
          { value: "month", label: "Месяцы" },
        ]}
      />
      {schedule && (
        <Field
          label="Повторять через · от 1 до 365"
          accessibilityLabel="Интервал повторения"
          value={String(schedule.interval)}
          keyboardType="number-pad"
          maxLength={3}
          onChangeText={(value) =>
            onChange({ ...schedule, interval: Number(value) || 0 })
          }
        />
      )}
      {schedule && (
        <Notice>
          {scheduleLabel(schedule)}. Дата задаёт первое повторение. В коротком
          месяце используется последний день; затем сохраняется исходное число.
        </Notice>
      )}
    </>
  );
}
