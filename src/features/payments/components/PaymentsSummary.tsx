import { View } from "react-native";
import { useMoney } from "../../../state/finance";
import { C, Card, font, Icon, Row, Txt } from "../../../shared/ui";

export function PaymentsSummary({
  monthly,
  yearly,
}: {
  monthly: number;
  yearly: number;
}) {
  const { money } = useMoney();
  return (
    <Card style={{ backgroundColor: C.lavender }}>
      <Row style={{ justifyContent: "space-between", gap: 12 }}>
        <View testID="payments-summary" style={{ gap: 8, flex: 1 }}>
          <Txt style={{ fontSize: 12, color: C.muted }}>
            Платежи в вашем плане
          </Txt>
          <Txt style={{ fontFamily: font.bold, fontSize: 28 }}>
            {money(monthly)}{" "}
            <Txt style={{ fontSize: 12, color: C.muted }}>за 30 дней</Txt>
          </Txt>
          <Txt style={{ fontSize: 11, color: C.muted }}>
            {money(yearly)} за следующие 365 дней по графику
          </Txt>
        </View>
        <Icon name="repeat-outline" color={C.muted} size={35} />
      </Row>
    </Card>
  );
}
