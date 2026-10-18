import { useState } from "react";
import {
  budgetPeriod,
  categoryBudget,
  budgetTermsAt,
  type BudgetPlan,
} from "../../../domain/budgets";
import { useActionError } from "../../../shared/lib/useActionError";
import { dateLabel, shiftDate, validDate } from "../../../shared/lib/dates";
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
  AmountField,
  DateField,
  Toggle,
} from "../../../shared/ui";
import { BudgetTransitionForm } from "./BudgetTransitionForm";
import { BudgetHistory } from "./BudgetHistory";

export function BudgetForm({ id, close }: { id?: string; close: () => void }) {
  const { money, moneyInput, parseMoney, symbol: baseSymbol } = useMoney();
  const { state, today, notify } = useFinance();
  const actions = useFinanceActions();
  const category = state.categories.find((c) => c.id === id)!;
  const original = state.budgetPlans?.find((p) => p.categoryId === id);
  const initialTerms = original && budgetTermsAt(original, today);
  const [transition, setTransition] = useState(false);
  const [amount, setAmount] = useState(
    moneyInput(categoryBudget(state, category.id, today, today).base),
  );
  const [period, setPeriod] = useState<BudgetPlan["period"]>(
    initialTerms?.period ?? "monthly",
  );
  const [startDay, setStartDay] = useState(String(initialTerms?.startDay ?? 1));
  const [anchor, setAnchor] = useState(initialTerms?.anchor ?? today);
  const [date, setDate] = useState(today);
  const [scope, setScope] = useState<"future" | "once">("future");
  const [surplus, setSurplus] = useState(
    initialTerms?.rolloverSurplus ?? false,
  );
  const [deficit, setDeficit] = useState(
    initialTerms?.rolloverDeficit ?? false,
  );
  const { error, setError, run } = useActionError();
  if (transition && original)
    return (
      <BudgetTransitionForm
        plan={original}
        close={close}
        back={() => setTransition(false)}
      />
    );
  const selectedTerms = original && budgetTermsAt(original, date);
  const validPeriodDate =
    validDate(date) && date >= "2000-01-01" && date <= "2100-12-31";
  const dateError =
    validDate(date) && !validPeriodDate
      ? "Выберите дату бюджетного периода от 2000 до 2100 года."
      : undefined;
  const selectedBudget = validPeriodDate
    ? categoryBudget(state, category.id, date, today)
    : undefined;
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
            <DateField
              label="Начало первого периода"
              accessibilityLabel="Начало бюджетного периода"
              value={anchor}
              onChangeText={setAnchor}
            />
          )}
          <Row style={{ justifyContent: "space-between" }}>
            <Txt style={{ flex: 1 }}>Переносить неиспользованный остаток</Txt>
            <Toggle
              accessibilityLabel="Переносить остаток бюджета"
              value={surplus}
              onValueChange={setSurplus}
            />
          </Row>
          <Row style={{ justifyContent: "space-between" }}>
            <Txt style={{ flex: 1 }}>Переносить перерасход</Txt>
            <Toggle
              accessibilityLabel="Переносить перерасход бюджета"
              value={deficit}
              onValueChange={setDeficit}
            />
          </Row>
        </>
      ) : (
        <Notice>
          Период:{" "}
          {selectedTerms!.period === "monthly"
            ? `месяц с ${selectedTerms!.startDay}-го числа`
            : selectedTerms!.period === "weekly"
              ? "неделя"
              : "год"}
          . Перенос остатка:{" "}
          {selectedTerms!.rolloverSurplus ? "включён" : "выключен"};
          перерасхода: {selectedTerms!.rolloverDeficit ? "включён" : "выключен"}
          . График сохраняется для истории.
        </Notice>
      )}
      <DateField
        label="Дата внутри периода"
        accessibilityLabel="Дата бюджетного периода"
        value={date}
        onChangeText={setDate}
        error={dateError}
      />
      {selectedBudget && original && (
        <Notice>
          Выбранный период: {dateLabel(selectedBudget.start)} —{" "}
          {dateLabel(shiftDate(selectedBudget.end, -1))}. Лимит:{" "}
          {money(selectedBudget.base, true)}; перенос:{" "}
          {money(selectedBudget.carried, true)}; расходы:{" "}
          {money(selectedBudget.spent, true)}.
        </Notice>
      )}
      <AmountField
        label={`Лимит периода, ${baseSymbol}`}
        accessibilityLabel="Лимит категории"
        value={amount}
        onChangeText={setAmount}
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
        сохраняются. Новый график можно назначить с будущей границы периода.
      </Notice>
      <ErrorText error={error} />
      <Button
        label="Сохранить лимит"
        disabled={!validPeriodDate}
        onPress={() =>
          run(() => {
            const parsed = parseMoney(amount),
              day = Number(startDay);
            if (parsed === null)
              return setError("Введите корректную неотрицательную сумму.");
            if (!Number.isInteger(day) || day < 1 || day > 31)
              return setError("Укажите начало месяца от 1 до 31.");
            const first =
              selectedTerms?.anchor ??
              (period === "monthly"
                ? budgetPeriod(
                    { period, startDay: day, anchor: "2000-01-01" },
                    today,
                  ).start
                : anchor);
            actions.saveBudgetPlan({
              categoryId: category.id,
              period: selectedTerms?.period ?? period,
              startDay: selectedTerms?.startDay ?? day,
              anchor: first,
              rolloverSurplus: selectedTerms?.rolloverSurplus ?? surplus,
              rolloverDeficit: selectedTerms?.rolloverDeficit ?? deficit,
              date,
              amount: parsed,
              onlyThisPeriod: scope === "once",
            });
            notify("Лимит периода обновлён");
            close();
          })
        }
      />
      {original && (
        <>
          <Button
            label="Новый график бюджета"
            variant="secondary"
            onPress={() => setTransition(true)}
          />
          <BudgetHistory plan={original} />
        </>
      )}
    </>
  );
}
