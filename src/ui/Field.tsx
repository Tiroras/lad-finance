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

export function Field({
  label,
  error,
  style,
  containerStyle,
  ...props
}: TextInputProps & {
  label?: string;
  error?: string;
  containerStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ gap: 8 }, containerStyle]}>
      {label && <Txt style={s.fieldLabel}>{label}</Txt>}
      <TextInput
        placeholderTextColor="#A4AAA0"
        {...props}
        style={[s.input, error ? { borderColor: C.red } : undefined, style]}
      />
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
