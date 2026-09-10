import Svg, { Circle, Path } from "react-native-svg";

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
