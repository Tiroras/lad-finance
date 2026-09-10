import { View } from "react-native";
import { font, Txt, Row } from "../ui";

export function Brand({ small = false }: { small?: boolean }) {
  return (
    <Row style={{ gap: 8 }}>
      <View style={{ width: 27, height: 31, justifyContent: "center" }}>
        <View
          style={{
            position: "absolute",
            left: 4,
            bottom: 3,
            height: 23,
            width: 10,
            borderTopLeftRadius: 10,
            borderBottomRightRadius: 10,
            backgroundColor: "#829B65",
            transform: [{ rotate: "27deg" }],
          }}
        />
        <View
          style={{
            position: "absolute",
            left: 17,
            top: 2,
            height: 13,
            width: 8,
            borderTopRightRadius: 8,
            borderBottomLeftRadius: 8,
            backgroundColor: "#B8CC94",
            transform: [{ rotate: "27deg" }],
          }}
        />
      </View>
      <Txt
        style={{
          fontFamily: font.extra,
          letterSpacing: -1.8,
          fontSize: small ? 29 : 35,
        }}
      >
        лад
      </Txt>
      {!small && (
        <View
          style={{
            width: 4,
            height: 4,
            backgroundColor: "#A9BC8D",
            borderRadius: 2,
            marginTop: 16,
            marginLeft: -5,
          }}
        />
      )}
    </Row>
  );
}
