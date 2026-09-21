import { View } from "react-native";
import { useMoney } from "../../state/finance";
import { Card, font, IconTile, Row, Txt } from "../../shared/ui";

export function SavingsSummary({
  income,
  expense,
}: {
  income: number;
  expense: number;
}) {
  const { money } = useMoney();
  const savingsRate = income > 0 ? (income - expense) / income : null;

  return (
    <Card style={{ backgroundColor: "#EAF0E5" }}>
      <Row>
        <IconTile name="leaf-outline" background="#DCE7D1" size={46} />
        <View style={{ flex: 1, gap: 6 }}>
          <Txt style={{ fontFamily: font.bold, fontSize: 15 }}>
            {savingsRate === null
              ? "Доходы пока не добавлены"
              : savingsRate >= 0
                ? `${Math.round(savingsRate * 100)}% дохода осталось с вами`
                : "Расходы превысили доходы"}
          </Txt>
          <Txt style={{ color: "#78816F", fontSize: 11, lineHeight: 18 }}>
            Разница доходов и расходов: {money(income - expense)}. Переводы
            между счетами не учитываются.
          </Txt>
        </View>
      </Row>
    </Card>
  );
}
