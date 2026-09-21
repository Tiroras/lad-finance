import { StyleSheet } from "react-native";
import { useMoney } from "../../hooks/useMoney";
import { C, Card, font, Row, Txt } from "../../ui";

export function TransactionTotals({
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
        <Txt style={st.metricLabel}>Поступило</Txt>
        <Txt style={[st.metricValue, { color: "#59816A" }]}>
          +{money(income)}
        </Txt>
      </Card>
      <Card style={{ flex: 1, padding: 16 }}>
        <Txt style={st.metricLabel}>Потрачено</Txt>
        <Txt style={st.metricValue}>−{money(expense)}</Txt>
      </Card>
    </Row>
  );
}

const st = StyleSheet.create({
  metricLabel: { color: C.muted, fontSize: 11, marginBottom: 8 },
  metricValue: { fontFamily: font.bold, fontSize: 21, letterSpacing: -0.5 },
});
