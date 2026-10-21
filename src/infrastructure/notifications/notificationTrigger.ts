const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;

/** Only absolute, non-repeating triggers can confirm our one-off schedule. */
export function notificationTriggerAt(trigger: unknown): number | undefined {
  const value = record(trigger);
  if (!value || value.repeats === true) return undefined;
  if (value.type === "date") {
    // SDK 57 Android serializes DATE as `value`, not the input's `date`.
    const at = value.value ?? value.date;
    const number = at instanceof Date ? at.getTime() : at;
    return typeof number === "number" && Number.isFinite(number)
      ? number
      : undefined;
  }
  if (value.type !== "calendar") return undefined;
  const parts = record(value.dateComponents);
  if (
    !parts ||
    !["UTC", "GMT", "Etc/UTC", "Etc/GMT"].includes(String(parts.timeZone))
  )
    return undefined;
  const keys = ["year", "month", "day", "hour", "minute", "second"] as const;
  if (!keys.every((key) => Number.isInteger(parts[key]))) return undefined;
  const [year, month, day, hour, minute, second] = keys.map(
    (key) => parts[key] as number,
  );
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const actual = [
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
  ];
  return keys.every((key, index) => parts[key] === actual[index])
    ? date.getTime()
    : undefined;
}
