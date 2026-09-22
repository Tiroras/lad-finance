import type { ComponentProps } from "react";
import { Field } from "./Field";

export function AmountField(props: ComponentProps<typeof Field>) {
  return <Field keyboardType="decimal-pad" maxLength={16} {...props} />;
}
