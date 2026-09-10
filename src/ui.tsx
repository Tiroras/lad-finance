import React, { useState, type ComponentProps, type ReactNode } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
  type TextInputProps,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Svg, { Circle, Path, G } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { money } from "./domain/finance";

export const C = {
  bg: "#F8F9F5",
  surface: "#FFFFFF",
  ink: "#24392E",
  muted: "#828980",
  green: "#234B3C",
  lime: "#D5E9A7",
  border: "#E9ECE4",
  soft: "#EDF1E8",
  red: "#AF514A",
  orange: "#A77644",
  lavender: "#EFECF7",
};
export const font = {
  regular: "Manrope_400Regular",
  medium: "Manrope_500Medium",
  semibold: "Manrope_600SemiBold",
  bold: "Manrope_700Bold",
  extra: "Manrope_800ExtraBold",
};
export type IName = ComponentProps<typeof Ionicons>["name"];
export function Icon({
  name,
  size = 22,
  color = C.ink,
}: {
  name: IName;
  size?: number;
  color?: string;
}) {
  return (
    <Ionicons
      name={name}
      size={size}
      color={color}
      accessible={false}
      aria-hidden={true}
    />
  );
}
export function Txt({
  children,
  style,
  numberOfLines,
  ...rest
}: ComponentProps<typeof Text>) {
  return (
    <Text {...rest} numberOfLines={numberOfLines} style={[s.text, style]}>
      {children}
    </Text>
  );
}
export function Row({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[s.row, style]}>{children}</View>;
}
export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[s.card, style]}>{children}</View>;
}
export function IconTile({
  name,
  color = C.green,
  background = C.soft,
  size = 44,
}: {
  name: IName;
  color?: string;
  background?: string;
  size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        backgroundColor: background,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon name={name} color={color} size={size * 0.48} />
    </View>
  );
}
export function IconButton({
  name,
  label,
  onPress,
  style,
  color = C.ink,
}: {
  name: IName;
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  color?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [s.iconButton, style, pressed && s.pressed]}
    >
      <Icon name={name} color={color} />
    </Pressable>
  );
}
export function Button({
  label,
  onPress,
  icon,
  variant = "primary",
  disabled = false,
  style,
}: {
  label: string;
  onPress: () => void;
  icon?: IName;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const textColor =
    variant === "primary" ? "#fff" : variant === "danger" ? C.red : C.green;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        {
          backgroundColor:
            variant === "primary"
              ? C.green
              : variant === "danger"
                ? "#FAECE9"
                : C.soft,
        },
        style,
        disabled && { opacity: 0.45 },
        pressed && s.pressed,
      ]}
    >
      {icon && <Icon name={icon} size={19} color={textColor} />}
      <Txt style={{ fontFamily: font.bold, color: textColor, fontSize: 14 }}>
        {label}
      </Txt>
    </Pressable>
  );
}
export function Section({
  title,
  action,
  onPress,
  style,
}: {
  title: string;
  action?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Row style={[{ justifyContent: "space-between", marginBottom: 15 }, style]}>
      <Txt style={s.sectionTitle}>{title}</Txt>
      {action && (
        <Pressable accessibilityRole="button" onPress={onPress} hitSlop={12}>
          <Row style={{ gap: 4 }}>
            <Txt style={s.link}>{action}</Txt>
            <Icon name="arrow-forward" size={14} color={C.green} />
          </Row>
        </Pressable>
      )}
    </Row>
  );
}
export function Chip({
  label,
  active,
  onPress,
  icon,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
  icon?: IName;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={({ pressed }) => [
        s.chip,
        active && { backgroundColor: C.green, borderColor: C.green },
        pressed && s.pressed,
      ]}
    >
      {icon && <Icon name={icon} size={16} color={active ? "#fff" : C.muted} />}
      <Txt
        style={{
          fontSize: 12,
          fontFamily: font.semibold,
          color: active ? "#fff" : C.muted,
        }}
      >
        {label}
      </Txt>
    </Pressable>
  );
}
export function Segments<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <Row style={s.segments}>
      {options.map((option) => (
        <Pressable
          key={option.value}
          accessibilityRole="tab"
          accessibilityLabel={option.label}
          accessibilityState={{ selected: value === option.value }}
          onPress={() => onChange(option.value)}
          style={[s.segment, value === option.value && s.activeSegment]}
        >
          <Txt
            style={{
              fontFamily: font.semibold,
              fontSize: 13,
              color: value === option.value ? C.green : C.muted,
            }}
          >
            {option.label}
          </Txt>
        </Pressable>
      ))}
    </Row>
  );
}
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
export function Progress({
  value,
  color = C.green,
  background = C.soft,
  height = 5,
}: {
  value: number;
  color?: string;
  background?: string;
  height?: number;
}) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{
        min: 0,
        max: 100,
        now: Math.round(Math.max(0, Math.min(1, value)) * 100),
      }}
      style={{
        height,
        backgroundColor: background,
        borderRadius: height,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          width: `${Math.min(100, Math.max(0, value * 100))}%`,
          height,
          backgroundColor: color,
          borderRadius: height,
        }}
      />
    </View>
  );
}
export function Empty({
  icon = "leaf-outline",
  title,
  description,
  action,
  onPress,
}: {
  icon?: IName;
  title: string;
  description: string;
  action?: string;
  onPress?: () => void;
}) {
  return (
    <View style={s.empty}>
      <IconTile name={icon} size={58} />
      <Txt style={{ fontFamily: font.bold, fontSize: 18, textAlign: "center" }}>
        {title}
      </Txt>
      <Txt
        style={{
          color: C.muted,
          textAlign: "center",
          lineHeight: 22,
          maxWidth: 310,
        }}
      >
        {description}
      </Txt>
      {action && onPress && (
        <Button label={action} onPress={onPress} style={{ marginTop: 5 }} />
      )}
    </View>
  );
}
export function Notice({
  children,
  tone = "normal",
}: {
  children: ReactNode;
  tone?: "normal" | "warning";
}) {
  return (
    <View
      style={[s.notice, tone === "warning" && { backgroundColor: "#FBF0E7" }]}
    >
      <Icon
        name={
          tone === "warning" ? "information-circle-outline" : "sparkles-outline"
        }
        size={19}
        color={tone === "warning" ? C.orange : C.green}
      />
      <Txt
        style={{
          flex: 1,
          fontSize: 12,
          lineHeight: 20,
          color: tone === "warning" ? "#8A643F" : C.green,
        }}
      >
        {children}
      </Txt>
    </View>
  );
}

export function Sheet({
  title,
  subtitle,
  children,
  onClose,
  visible,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  visible: boolean;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={[s.overlay, width > 700 && { justifyContent: "center" }]}
      >
        <Pressable
          accessibilityLabel="Закрыть окно"
          accessibilityRole="button"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View
          accessibilityViewIsModal
          style={[
            s.sheet,
            {
              maxHeight: height - Math.max(insets.top, 24),
              paddingBottom: Math.max(insets.bottom, 20),
            },
            width > 700 && {
              borderRadius: 28,
              maxHeight: Math.min(860, height - 64),
            },
          ]}
        >
          <View style={s.handle} />
          <Row
            style={{
              justifyContent: "space-between",
              paddingHorizontal: 24,
              marginBottom: 20,
            }}
          >
            <View style={{ flex: 1, gap: 5 }}>
              <Txt style={{ fontFamily: font.bold, fontSize: 23 }}>{title}</Txt>
              {subtitle && (
                <Txt style={{ fontSize: 12, color: C.muted }}>{subtitle}</Txt>
              )}
            </View>
            <IconButton
              name="close"
              label="Закрыть"
              onPress={onClose}
              style={{ backgroundColor: C.soft }}
            />
          </Row>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 24,
              paddingBottom: 8,
              gap: 20,
            }}
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function Donut({
  data,
  center,
  subtitle,
  size = 166,
}: {
  data: { value: number; color: string }[];
  center: string;
  subtitle: string;
  size?: number;
}) {
  const radius = 67,
    circumference = 2 * Math.PI * radius;
  const total = data.reduce((n, item) => n + item.value, 0);
  let offset = 0;
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Svg
        width={size}
        height={size}
        viewBox="0 0 166 166"
        style={StyleSheet.absoluteFill}
      >
        <Circle
          cx="83"
          cy="83"
          r={radius}
          fill="none"
          stroke={C.soft}
          strokeWidth="15"
        />
        <G transform="rotate(-90 83 83)">
          {data
            .filter((d) => d.value > 0)
            .map((item, i) => {
              const length = total ? (item.value / total) * circumference : 0;
              const start = offset;
              offset += length;
              return (
                <Circle
                  key={i}
                  cx="83"
                  cy="83"
                  r={radius}
                  fill="none"
                  stroke={item.color}
                  strokeWidth="15"
                  strokeDasharray={`${Math.max(0, length - 4)} ${circumference - Math.max(0, length - 4)}`}
                  strokeDashoffset={-start}
                  strokeLinecap="round"
                />
              );
            })}
        </G>
      </Svg>
      <Txt style={{ color: C.muted, fontSize: 10, marginBottom: 5 }}>
        {subtitle}
      </Txt>
      <Txt style={{ fontFamily: font.extra, fontSize: size < 160 ? 15 : 18 }}>
        {center}
      </Txt>
    </View>
  );
}

export function BarChart({
  values,
  labels,
}: {
  values: number[];
  labels: string[];
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const max = Math.max(1, ...values);
  return (
    <View>
      <Row style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <Txt style={{ fontSize: 11, color: C.muted }}>
          {selected === null ? "Расходы по дням" : labels[selected]}
        </Txt>
        <Txt style={{ fontSize: 11, color: C.green, fontFamily: font.bold }}>
          {selected === null ? "Нажмите на столбик" : money(values[selected])}
        </Txt>
      </Row>
      <Row
        style={{
          height: 112,
          gap: values.length > 10 ? 4 : 13,
          alignItems: "flex-end",
        }}
      >
        {values.map((value, index) => (
          <Pressable
            key={index}
            accessibilityRole="button"
            accessibilityLabel={`${labels[index]}: ${money(value)}`}
            onPress={() => setSelected(index)}
            style={{
              flex: 1,
              height: "100%",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: 9,
            }}
          >
            <View
              style={{
                width: "100%",
                height: 82,
                justifyContent: "flex-end",
                borderRadius: 6,
                backgroundColor: "#F4F6F0",
              }}
            >
              <View
                style={{
                  height: Math.max(value ? 7 : 0, (value / max) * 82),
                  width: "100%",
                  borderRadius: 6,
                  backgroundColor:
                    selected === index || index === values.length - 1
                      ? C.green
                      : "#C9DCAA",
                }}
              />
            </View>
            {values.length <= 10 && (
              <Txt
                style={{
                  color: selected === index ? C.green : C.muted,
                  fontSize: 10,
                }}
              >
                {labels[index]}
              </Txt>
            )}
          </Pressable>
        ))}
      </Row>
    </View>
  );
}

export function HeroArt() {
  return (
    <Svg
      width="175"
      height="175"
      viewBox="0 0 175 175"
      style={{ position: "absolute", right: -28, top: -30 }}
    >
      <Circle
        cx="123"
        cy="64"
        r="64"
        fill="none"
        stroke="#98B78C"
        strokeOpacity=".2"
        strokeWidth="1"
      />
      <Circle
        cx="123"
        cy="64"
        r="87"
        fill="none"
        stroke="#98B78C"
        strokeOpacity=".15"
        strokeWidth="1"
      />
      <Circle
        cx="123"
        cy="64"
        r="110"
        fill="none"
        stroke="#98B78C"
        strokeOpacity=".1"
        strokeWidth="1"
      />
      <Path
        d="M85 79 C86 45 108 38 137 37 C136 67 117 84 85 79Z"
        fill="#BFD891"
        fillOpacity=".1"
      />
      <Path d="M87 78 L120 49" stroke="#C6DDA1" strokeOpacity=".25" />
    </Svg>
  );
}

export const s = StyleSheet.create({
  text: { fontFamily: font.regular, fontSize: 14, color: C.ink },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  card: {
    backgroundColor: C.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.border,
    padding: 20,
  },
  iconButton: {
    height: 42,
    width: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  button: {
    minHeight: 52,
    borderRadius: 15,
    paddingHorizontal: 19,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  sectionTitle: { fontFamily: font.bold, fontSize: 18, letterSpacing: -0.45 },
  link: { fontFamily: font.semibold, color: C.green, fontSize: 12 },
  chip: {
    minHeight: 39,
    paddingHorizontal: 15,
    borderRadius: 20,
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: "#fff",
  },
  segments: {
    gap: 3,
    padding: 4,
    backgroundColor: "#EDF0E9",
    borderRadius: 13,
  },
  segment: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 38,
    borderRadius: 10,
  },
  activeSegment: {
    backgroundColor: "#fff",
    boxShadow: "0 1px 4px rgba(33, 51, 38, 0.05)",
  },
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
  empty: {
    alignItems: "center",
    paddingVertical: 36,
    paddingHorizontal: 15,
    gap: 14,
  },
  notice: {
    backgroundColor: C.soft,
    borderRadius: 15,
    padding: 16,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(20, 35, 27, 0.4)",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  sheet: {
    backgroundColor: C.bg,
    width: "100%",
    maxWidth: 560,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
  },
  handle: {
    width: 34,
    height: 4,
    borderRadius: 3,
    backgroundColor: "#D9DED3",
    alignSelf: "center",
    marginBottom: 20,
  },
});
