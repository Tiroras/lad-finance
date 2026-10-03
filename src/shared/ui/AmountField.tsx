import type { ComponentProps } from "react";
import { Field } from "./Field";
import { useFormattedInput } from "./useFormattedInput";
import {
  createAmountInputController,
  formatAmountInput,
  isZeroAmountInput,
} from "../lib/amountInput";

type AmountFieldProps = Omit<
  ComponentProps<typeof Field>,
  | "value"
  | "defaultValue"
  | "onChange"
  | "onChangeText"
  | "selection"
  | "onSelectionChange"
  | "maxLength"
> & { value: string; onChangeText: (value: string) => void };

export function AmountField({
  value,
  onChangeText,
  onFocus,
  onBlur,
  onKeyPress,
  ...props
}: AmountFieldProps) {
  const input = useFormattedInput({
    value,
    displayed: formatAmountInput(value),
    createController: createAmountInputController,
    onEdit: (edit) => onChangeText(edit.raw),
  });
  return (
    <Field
      keyboardType="decimal-pad"
      placeholder="0"
      selectTextOnFocus={isZeroAmountInput(value)}
      {...props}
      maxLength={24}
      {...input.fieldProps}
      onFocus={(event) => {
        input.release();
        onFocus?.(event);
      }}
      onBlur={(event) => {
        input.release();
        onBlur?.(event);
      }}
      onKeyPress={(event) => {
        input.fieldProps.onKeyPress(event);
        onKeyPress?.(event);
      }}
    />
  );
}
