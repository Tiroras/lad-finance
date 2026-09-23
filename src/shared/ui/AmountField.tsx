import { useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import { Field } from "./Field";
import {
  createAmountInputController,
  formatAmountInput,
  isZeroAmountInput,
  type AmountInputSelection,
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
  const formatted = formatAmountInput(value);
  const input = useRef(createAmountInputController(value));
  const [selection, setSelection] = useState<AmountInputSelection>();
  useLayoutEffect(() => {
    if (input.current.sync(value)) setSelection(undefined);
  }, [value]);
  return (
    <Field
      keyboardType="decimal-pad"
      placeholder="0"
      selectTextOnFocus={isZeroAmountInput(value)}
      {...props}
      maxLength={24}
      value={formatted}
      selection={selection}
      onFocus={(event) => {
        input.current.release();
        setSelection(undefined);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        input.current.release();
        setSelection(undefined);
        onBlur?.(event);
      }}
      onSelectionChange={({ nativeEvent }) => {
        const event = nativeEvent as typeof nativeEvent & { text?: string };
        setSelection(input.current.select(event.selection, event.text));
      }}
      onKeyPress={(event) => {
        input.current.keyPress(event.nativeEvent.key);
        onKeyPress?.(event);
      }}
      onChange={({ nativeEvent }) => {
        // RN 0.86 sends selection with the text on iOS and Android, but its
        // TypeScript declaration still omits it. Web uses the edit fallback.
        const event = nativeEvent as typeof nativeEvent & {
          selection?: AmountInputSelection;
        };
        const edit = input.current.change(
          formatted,
          event.text,
          event.selection,
        );
        setSelection(edit.selection);
        onChangeText(edit.raw);
      }}
    />
  );
}
