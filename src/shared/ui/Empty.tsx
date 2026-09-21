import { View, StyleSheet } from "react-native";
import { C, font } from "./theme";
import { type IName } from "./Icon";
import { Txt } from "./Txt";
import { IconTile } from "./IconTile";
import { Button } from "./Button";

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

const s = StyleSheet.create({
  empty: {
    alignItems: "center",
    paddingVertical: 36,
    paddingHorizontal: 15,
    gap: 14,
  },
});
