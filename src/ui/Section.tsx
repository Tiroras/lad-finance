import {
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { C, font } from "./theme";
import { Icon } from "./Icon";
import { Txt } from "./Txt";
import { Row } from "./Row";

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

const s = StyleSheet.create({
  sectionTitle: { fontFamily: font.bold, fontSize: 18, letterSpacing: -0.45 },
  link: { fontFamily: font.semibold, color: C.green, fontSize: 12 },
});
