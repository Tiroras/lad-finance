import { useState } from "react";
import { Switch } from "react-native";
import {
  budgetPeriod,
  categoryBudget,
  type BudgetPlan,
} from "../../../domain/budgets";
import { useActionError } from "../../../shared/lib/useActionError";
import {
  useFinanceActions,
  useMoney,
  useFinance,
} from "../../../state/finance";
import {
  Button,
  Field,
  font,
  IconTile,
  Notice,
  Row,
  Txt,
  ErrorText,
  Segments,
} from "../../../shared/ui";

export function BudgetForm({ id, close }: { id?: string; close: () => void }) {
  const { moneyInput, parseMoney, symbol: baseSymbol } = useMoney();
  const { state, today, notify } = useFinance();
  const actions = useFinanceActions();
  const category = state.categories.find((c) => c.id === id)!;
  const original = state.budgetPlans?.find((p) => p.categoryId === id);
  const [amount, setAmount] = useState(
    moneyInput(categoryBudget(state, category.id, today, today).base),
  );
  const [period, setPeriod] = useState<BudgetPlan["period"]>(
    original?.period ?? "monthly",
  );
  const [startDay, setStartDay] = useState(String(original?.startDay ?? 1));
  const [anchor, setAnchor] = useState(original?.anchor ?? today);
  const [date, setDate] = useState(today);
  const [scope, setScope] = useState<"future" | "once">("future");
  const [surplus, setSurplus] = useState(original?.rolloverSurplus ?? false);
  const [deficit, setDeficit] = useState(original?.rolloverDeficit ?? false);
  const { error, setError, run } = useActionError();
  return (
    <>
      <Row>
        <IconTile
          name={category.icon}
          color={category.color}
          background={category.background}
        />
        <Txt style={{ fontFamily: font.bold, fontSize: 19, flex: 1 }}>
          {category.name}
        </Txt>
      </Row>
      {!original ? (
        <>
          <Segments
            value={period}
            onChange={setPeriod}
            options={[
              { value: "monthly", label: "Месяц" },
              { value: "weekly", label: "Неделя" },
              { value: "yearly", label: "Год" },
            ]}
          />
          {period === "monthly" ? (
            <Field
              label="Начало периода · день месяца"
              accessibilityLabel="Начало бюджетного месяца"
              keyboardType="number-pad"
              maxLength={2}
              value={startDay}
              onChangeText={setStartDay}
            />
          ) : (
            <Field
              label="Начало первого периода · ГГГГ-ММ-ДД"
              accessibilityLabel="Начало бюджетного периода"
              value={anchor}
              onChangeText={setAnchor}
              maxLength={10}
            />
          )}
          <Row style={{ justifyContent: "space-between" }}>
            <Txt style={{ flex: 1 }}>Переносить неиспользованный остаток</Txt>
            <Switch
              accessibilityLabel="Переносить остаток бюджета"
              value={surplus}
              onValueChange={setSurplus}
            />
          </Row>
          <Row style={{ justifyContent: "space-between" }}>
            <Txt style={{ flex: 1 }}>Переносить перерасход</Txt>
            <Switch
              accessibilityLabel="Переносить перерасход бюджета"
              value={deficit}
              onValueChange={setDeficit}
            />
          </Row>
        </>
      ) : (
        <Notice>
          Период:{" "}
          {period === "monthly"
            ? `месяц с ${original.startDay}-го числа`
            : period === "weekly"
              ? "неделя"
              : "год"}
          . Перенос остатка: {surplus ? "включён" : "выключен"}; перерасхода:{" "}
          {deficit ? "включён" : "выключен"}. График сохраняется для истории.
        </Notice>
      )}
      <Field
        label="Дата внутри периода · ГГГГ-ММ-ДД"
        accessibilityLabel="Дата бюджетного периода"
        value={date}
        onChangeText={setDate}
        maxLength={10}
      />
      <Field
        label={`Лимит периода, ${baseSymbol}`}
        accessibilityLabel="Лимит категории"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        maxLength={16}
      />
      <Segments
        value={scope}
        onChange={setScope}
        options={[
          { value: "future", label: "С этого периода" },
          { value: "once", label: "Только этот период" },
        ]}
      />
      <Notice>
        Закрытые периоды сохраняют прежние лимиты. Разовый лимит действует
        только в выбранном периоде. В бюджет входят подкатегории; повторного
        резерва в «Можно потратить» нет. Даты первого графика и правила переноса
        после сохранения изменить нельзя.
      </Notice>
      <ErrorText error={error} />
      <Button
        label="Сохранить лимит"
        onPress={() =>
          run(() => {
            const parsed = parseMoney(amount),
              day = Number(startDay);
            if (parsed === null)
              return setError("Введите корректную неотрицательную сумму.");
            if (!Number.isInteger(day) || day < 1 || day > 31)
              return setError("Укажите начало месяца от 1 до 31.");
            const first =
              original?.anchor ??
              (period === "monthly"
                ? budgetPeriod(
                    { period, startDay: day, anchor: "2000-01-01" },
                    today,
                  ).start
                : anchor);
            actions.saveBudgetPlan({
              categoryId: category.id,
              period,
              startDay: day,
              anchor: first,
              rolloverSurplus: surplus,
              rolloverDeficit: deficit,
              date,
              amount: parsed,
              onlyThisPeriod: scope === "once",
            });
            notify("Лимит периода обновлён");
            close();
          })
        }
      />
    </>
  );
}
