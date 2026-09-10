import { View } from "react-native";
import { C } from "./theme";
import { Icon, type IName } from "./Icon";

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
