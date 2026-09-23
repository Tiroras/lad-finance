import { useEffect, useId, useRef, type ReactNode } from "react";
import {
  View,
  TextInput,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
  type TextInputProps,
} from "react-native";
import { C, font } from "./theme";
import { Txt } from "./Txt";
import { useFormFields } from "./FormFields";

export function Field({
  label,
  error,
  style,
  containerStyle,
  trailing,
  onFocus,
  onBlur,
  onLayout,
  onSubmitEditing,
  ...props
}: TextInputProps & {
  label?: string;
  error?: string;
  containerStyle?: StyleProp<ViewStyle>;
  trailing?: ReactNode;
}) {
  const input = useRef<TextInput>(null);
  const id = useId();
  const form = useFormFields();
  const register = form?.register;
  const editable = props.editable !== false && !props.readOnly;
  useEffect(() => {
    if (editable && input.current) return register?.(id, input.current);
  }, [editable, id, register]);
  const navigates = !!form && !props.multiline && !onSubmitEditing;
  const numericKeyboard =
    ["number-pad", "decimal-pad", "numeric", "phone-pad"].includes(
      props.keyboardType ?? "",
    ) ||
    props.inputMode === "numeric" ||
    props.inputMode === "decimal";
  const action =
    form?.active?.id === id && form.active.hasNext ? "next" : "done";
  const field = (
    <TextInput
      ref={input}
      placeholderTextColor="#A4AAA0"
      inputAccessoryViewID={
        numericKeyboard && !props.multiline ? form?.accessoryID : undefined
      }
      returnKeyType={navigates ? action : undefined}
      enterKeyHint={navigates ? action : undefined}
      submitBehavior={navigates ? "submit" : undefined}
      // RN Web 0.21 uses blurOnSubmit; native uses submitBehavior above.
      blurOnSubmit={navigates ? false : undefined}
      {...props}
      onFocus={(event) => {
        form?.focus(id);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        form?.blur(id);
        onBlur?.(event);
      }}
      onLayout={(event) => {
        form?.refresh();
        onLayout?.(event);
      }}
      onSubmitEditing={(event) => {
        if (onSubmitEditing) onSubmitEditing(event);
        else if (navigates) void form.next(id);
      }}
      style={[
        s.input,
        trailing
          ? {
              flex: 1,
              minWidth: 0,
              borderWidth: 0,
              backgroundColor: "transparent",
            }
          : undefined,
        error && !trailing ? { borderColor: C.red } : undefined,
        style,
      ]}
    />
  );
  return (
    <View style={[{ gap: 8 }, containerStyle]}>
      {label && <Txt style={s.fieldLabel}>{label}</Txt>}
      {trailing ? (
        <View
          style={[
            s.input,
            {
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: 0,
              paddingHorizontal: 0,
            },
            error ? { borderColor: C.red } : undefined,
          ]}
        >
          {field}
          {trailing}
        </View>
      ) : (
        field
      )}
      {error && (
        <Txt accessibilityRole="alert" style={{ color: C.red, fontSize: 12 }}>
          {error}
        </Txt>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  fieldLabel: { fontSize: 12, fontFamily: font.semibold, color: C.muted },
  input: {
    backgroundColor: "#F5F7F1",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 52,
    color: C.ink,
    fontFamily: font.medium,
    fontSize: 15,
  },
});
