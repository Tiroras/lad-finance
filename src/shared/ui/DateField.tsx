import { useLayoutEffect, useRef, useState } from "react";
import { Keyboard, Pressable, View } from "react-native";
import { validDate } from "../lib/dates";
import { createDateInputController, dateInputText } from "../lib/dateInput";
import type { InputSelection } from "../lib/formattedInput";
import { DatePicker } from "./DatePicker";
import { Field } from "./Field";
import { Icon } from "./Icon";
import { C } from "./theme";
import { interactionStyles } from "./interactionStyles";

export function DateField({
  label,
  accessibilityLabel = label,
  value,
  onChangeText,
  placeholder,
  error,
  allowClear = false,
}: {
  label: string;
  accessibilityLabel?: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  error?: string;
  allowClear?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [touched, setTouched] = useState(false);
  const [selection, setSelection] = useState<InputSelection>();
  const input = useRef(createDateInputController(value));
  const trigger = useRef<View>(null);
  const displayed = dateInputText(value);
  useLayoutEffect(() => {
    if (input.current.sync(value)) setSelection(undefined);
  }, [value]);
  const invalid = !!value && !validDate(value);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  return (
    <View style={{ gap: 8 }}>
      <Field
        label={label}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint="Введите дату в формате ДД.ММ.ГГГГ или откройте календарь кнопкой справа."
        placeholder={
          placeholder && !/^\d{4}-\d{2}-\d{2}$/.test(placeholder)
            ? `${placeholder} · ДД.ММ.ГГГГ`
            : "ДД.ММ.ГГГГ"
        }
        keyboardType="number-pad"
        autoCorrect={false}
        autoCapitalize="none"
        value={displayed}
        selection={selection}
        onSelectionChange={({ nativeEvent }) => {
          const event = nativeEvent as typeof nativeEvent & { text?: string };
          setSelection(input.current.select(event.selection, event.text));
        }}
        onKeyPress={({ nativeEvent }) => {
          input.current.keyPress(nativeEvent.key);
        }}
        onChange={({ nativeEvent }) => {
          // RN 0.86 supplies a selection with the changed text on both phones.
          const event = nativeEvent as typeof nativeEvent & {
            selection?: InputSelection;
          };
          const edit = input.current.change(
            displayed,
            event.text,
            event.selection,
          );
          setSelection(edit.selection);
          onChangeText(edit.value);
        }}
        onFocus={() => {
          setOpen(false);
          input.current.release();
          setSelection(undefined);
        }}
        onBlur={() => {
          setTouched(true);
          input.current.release();
          setSelection(undefined);
        }}
        error={
          error ||
          (invalid && (touched || displayed.length === 10)
            ? "Введите существующую дату в формате ДД.ММ.ГГГГ."
            : undefined)
        }
        trailing={
          <Pressable
            ref={trigger}
            accessibilityRole="button"
            accessibilityLabel={`Открыть календарь: ${accessibilityLabel}`}
            accessibilityState={{ expanded: open }}
            onPress={() => {
              Keyboard.dismiss();
              setOpen(!open);
            }}
            style={({ pressed }) => [
              {
                width: 44,
                minHeight: 50,
                marginRight: 4,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 12,
              },
              pressed && interactionStyles.pressed,
            ]}
          >
            <Icon name="calendar-outline" size={20} color={C.green} />
          </Pressable>
        }
      />
      {open && (
        <DatePicker
          value={value}
          testID={`date-picker-${accessibilityLabel}`}
          allowClear={allowClear}
          onClose={close}
          onChange={(date) => {
            input.current.release();
            setSelection(undefined);
            onChangeText(date);
            close();
          }}
        />
      )}
    </View>
  );
}
