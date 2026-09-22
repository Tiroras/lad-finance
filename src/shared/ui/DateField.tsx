import type { ComponentProps } from "react";
import { Field } from "./Field";

export function DateField({
  label,
  ...props
}: Omit<ComponentProps<typeof Field>, "label"> & { label: string }) {
  return <Field label={`${label} · ГГГГ-ММ-ДД`} maxLength={10} {...props} />;
}
