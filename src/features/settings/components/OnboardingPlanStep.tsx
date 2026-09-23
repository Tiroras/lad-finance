import { Field, Notice, AmountField, DateField } from "../../../shared/ui";

export function OnboardingPlanStep({
  kind,
  name,
  amount,
  date,
  currency,
  setName,
  setAmount,
  setDate,
}: {
  kind: "income" | "bill";
  name: string;
  amount: string;
  date: string;
  currency: string;
  setName: (v: string) => void;
  setAmount: (v: string) => void;
  setDate: (v: string) => void;
}) {
  const income = kind === "income";
  return (
    <>
      <Field
        accessibilityLabel={
          income ? "Название ожидаемого дохода" : "Первый обязательный платёж"
        }
        label={
          income ? "Название ожидаемого дохода" : "Первый обязательный платёж"
        }
        value={name}
        onChangeText={setName}
        maxLength={120}
      />
      <AmountField
        label={`Сумма, ${currency}`}
        accessibilityLabel={
          income ? "Доход при настройке" : "Платёж при настройке"
        }
        value={amount}
        onChangeText={setAmount}
      />
      <DateField
        label="Первая дата"
        accessibilityLabel={
          income ? "Дата первого дохода" : "Дата первого платежа"
        }
        value={date}
        onChangeText={setDate}
      />
      <Notice>
        {income
          ? "Добавим ежемесячный план дохода. Баланс увеличится только после записи фактического поступления."
          : "Добавим ежемесячное обязательство. Фактическую оплату вы отметите отдельно."}{" "}
        Пустая или нулевая сумма пропустит этот шаг; остальные планы можно
        добавить позднее.
      </Notice>
    </>
  );
}
