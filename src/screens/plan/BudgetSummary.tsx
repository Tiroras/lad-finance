import { C, font, Txt, Card, Progress } from "../../ui";
import { dateLabel, localDate, money } from "../../domain/finance";

export function BudgetSummary({
  budget,
  spent,
}: {
  budget: number;
  spent: number;
}) {
  return (
    <Card style={{ backgroundColor: C.green, borderColor: C.green }}>
      <Txt style={{ color: "#C4D2C3", fontSize: 12, marginBottom: 12 }}>
        Ваш план на {dateLabel(localDate(), { month: "long" })}
      </Txt>
      <Txt style={{ color: "#fff", fontFamily: font.bold, fontSize: 30 }}>
        {money(Math.max(0, budget - spent))}
      </Txt>
      <Txt
        style={{
          color: "#C4D2C3",
          fontSize: 11,
          marginTop: 6,
          marginBottom: 22,
        }}
      >
        {spent > budget
          ? `Превышение на ${money(spent - budget)}`
          : `осталось из ${money(budget)}`}
      </Txt>
      <Progress
        value={budget ? spent / budget : 0}
        color={C.lime}
        background="#42614D"
        height={7}
      />
    </Card>
  );
}
