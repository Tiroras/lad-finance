import { View, StyleSheet } from "react-native";
import { C, font } from "./theme";
import Svg, { Circle, G } from "react-native-svg";
import { Txt } from "./Txt";

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
