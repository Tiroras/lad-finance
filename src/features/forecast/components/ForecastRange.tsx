import type { ForecastHorizon } from "../../../domain/forecast";
import { Segments } from "../../../shared/ui";

export function ForecastRange({
  value,
  onChange,
  tourId,
}: {
  value: ForecastHorizon;
  onChange: (value: ForecastHorizon) => void;
  tourId?: string;
}) {
  return (
    <Segments
      value={String(value)}
      onChange={(v) => onChange(Number(v) as ForecastHorizon)}
      options={[30, 60, 90].map((days) => ({
        value: String(days),
        label: `${days} дней`,
        tourId: days === 60 ? tourId : undefined,
      }))}
    />
  );
}
