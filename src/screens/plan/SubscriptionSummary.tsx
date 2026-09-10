import { View } from "react-native";
import { C, font, Txt, Row, Card, Icon } from "../../ui";
import { money } from "../../domain/finance";

export function SubscriptionSummary({ monthly }: { monthly: number }) {
  return (
    <Card style={{ backgroundColor: C.lavender, borderColor: "#E4E0ED" }}>
      <Row style={{ justifyContent: "space-between" }}>
        <View style={{ gap: 8 }}>
          <Txt style={{ fontSize: 12, color: "#82768F" }}>
            Подписки в вашем плане
          </Txt>
          <Txt style={{ fontFamily: font.bold, fontSize: 28 }}>
            {money(monthly)}{" "}
            <Txt style={{ fontSize: 12, color: "#82768F" }}>/ мес.</Txt>
          </Txt>
          <Txt style={{ fontSize: 11, color: "#82768F" }}>
            {money(monthly * 12)} за год — если цены не изменятся
          </Txt>
        </View>
        <Icon name="repeat-outline" color="#9B8AAF" size={35} />
      </Row>
    </Card>
  );
}
