import { StyleSheet } from "react-native";
import { useMoney } from "../../state/finance";
import { C, Card, font, IconTile, Row, Txt } from "../../shared/ui";

export function MonthlyTotals({
  income,
  expense,
}: {
  income: number;
  expense: number;
}) {
  const { money } = useMoney();
  return (
    <Row style={{ gap: 12 }}>
      <Card style={{ flex: 1, padding: 16 }}>
        <IconTile name="arrow-down-outline" size={34} />
        <Txt style={[st.metricLabel, { marginTop: 12 }]}>Доходы</Txt>
        <Txt style={[st.metricValue, { color: "#59816A" }]}>
          {money(income)}
        </Txt>
      </Card>
      <Card style={{ flex: 1, padding: 16 }}>
        <IconTile
          name="arrow-up-outline"
          size={34}
          color="#A88056"
          background="#F5EEE3"
        />
        <Txt style={[st.metricLabel, { marginTop: 12 }]}>Расходы</Txt>
        <Txt style={st.metricValue}>{money(expense)}</Txt>
      </Card>
    </Row>
  );
}

const st = StyleSheet.create({
  metricLabel: { color: C.muted, fontSize: 11, marginBottom: 8 },
  metricValue: { fontFamily: font.bold, fontSize: 21, letterSpacing: -0.5 },
});
