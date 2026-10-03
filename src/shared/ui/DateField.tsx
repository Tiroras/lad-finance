import { useRef, useState } from "react";
import { Keyboard, Pressable, View } from "react-native";
import { validDate } from "../lib/dates";
import { createDateInputController, dateInputText } from "../lib/dateInput";
import { DatePicker } from "./DatePicker";
import { Field } from "./Field";
import { Icon } from "./Icon";
import { C } from "./theme";
import { interactionStyles } from "./interactionStyles";
import { useFormattedInput } from "./useFormattedInput";

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
  const trigger = useRef<View>(null);
  const displayed = dateInputText(value);
  const input = useFormattedInput({
    value,
    displayed,
    createController: createDateInputController,
    onEdit: (edit) => onChangeText(edit.value),
  });
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
        {...input.fieldProps}
        onFocus={() => {
          setOpen(false);
          input.release();
        }}
        onBlur={() => {
          setTouched(true);
          input.release();
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
            input.release();
            onChangeText(date);
            close();
          }}
        />
      )}
    </View>
  );
}
