import {
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { C, font } from "./theme";
import { Txt } from "./Txt";
import { Row } from "./Row";

export function Segments<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Row style={[s.segments, style]}>
      {options.map((option) => (
        <Pressable
          key={option.value}
          accessibilityRole="tab"
          accessibilityLabel={option.label}
          accessibilityState={{ selected: value === option.value }}
          aria-selected={value === option.value}
          onPress={() => onChange(option.value)}
          style={[s.segment, value === option.value && s.activeSegment]}
        >
          <Txt
            style={{
              fontFamily: font.semibold,
              fontSize: 13,
              color: value === option.value ? C.green : C.muted,
              textAlign: "center",
            }}
          >
            {option.label}
          </Txt>
        </Pressable>
      ))}
    </Row>
  );
}

const s = StyleSheet.create({
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
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderRadius: 10,
  },
  activeSegment: {
    backgroundColor: "#fff",
    boxShadow: "0 1px 4px rgba(33, 51, 38, 0.05)",
  },
});
