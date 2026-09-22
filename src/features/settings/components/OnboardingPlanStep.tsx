import { Field, Notice } from "../../../shared/ui";

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
      <Field
        label={`Сумма, ${currency}`}
        accessibilityLabel={
          income ? "Доход при настройке" : "Платёж при настройке"
        }
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        maxLength={16}
      />
      <Field
        label="Первая дата · ГГГГ-ММ-ДД"
        accessibilityLabel={
          income ? "Дата первого дохода" : "Дата первого платежа"
        }
        value={date}
        onChangeText={setDate}
        maxLength={10}
      />
      <Notice>
        {income
          ? "Добавим ежемесячный план дохода. Баланс увеличится только после записи фактического поступления."
          : "Добавим ежемесячное обязательство. Фактическую оплату вы отметите отдельно."}{" "}
        Нулевая сумма пропустит этот шаг; остальные планы можно добавить
        позднее.
      </Notice>
    </>
  );
}
