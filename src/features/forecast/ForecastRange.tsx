import type { ForecastHorizon } from "../../domain/forecast";
import { Segments } from "../../ui";

export function ForecastRange({
  value,
  onChange,
}: {
  value: ForecastHorizon;
  onChange: (value: ForecastHorizon) => void;
}) {
  return (
    <Segments
      value={String(value)}
      onChange={(v) => onChange(Number(v) as ForecastHorizon)}
      options={[30, 60, 90].map((days) => ({
        value: String(days),
        label: `${days} дней`,
      }))}
    />
  );
}
