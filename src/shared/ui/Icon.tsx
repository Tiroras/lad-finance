import { type ComponentProps } from "react";
import { C } from "./theme";
import Ionicons from "@expo/vector-icons/Ionicons";

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
