import { View } from "react-native";
import { useMoney } from "../../../state/finance";
import { C, Card, font, Icon, Row, Txt } from "../../../shared/ui";

export function SubscriptionSummary({
  monthly,
  yearly,
}: {
  monthly: number;
  yearly: number;
}) {
  const { money } = useMoney();
  return (
    <Card style={{ backgroundColor: C.lavender, borderColor: "#E4E0ED" }}>
      <Row style={{ justifyContent: "space-between" }}>
        <View style={{ gap: 8 }}>
          <Txt style={{ fontSize: 12, color: "#82768F" }}>
            Подписки в вашем плане
          </Txt>
          <Txt style={{ fontFamily: font.bold, fontSize: 28 }}>
            {money(monthly)}{" "}
            <Txt style={{ fontSize: 12, color: "#82768F" }}>за 30 дней</Txt>
          </Txt>
          <Txt style={{ fontSize: 11, color: "#82768F" }}>
            {money(yearly)} за следующие 365 дней по графику
          </Txt>
        </View>
        <Icon name="repeat-outline" color="#9B8AAF" size={35} />
      </Row>
    </Card>
  );
}
