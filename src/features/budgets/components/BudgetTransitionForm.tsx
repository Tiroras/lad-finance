import { useState } from "react";
import { View } from "react-native";
import {
  previewBudgetTransition,
  type BudgetTransitionInput,
} from "../../../domain/actions/budgets";
import {
  budgetTermsAt,
  type BudgetPlan,
  type BudgetTerms,
} from "../../../domain/budgets";
import { dateLabel, shiftDate } from "../../../shared/lib/dates";
import { useActionError } from "../../../shared/lib/useActionError";
import {
  useFinance,
  useFinanceActions,
  useMoney,
} from "../../../state/finance";
import {
  AmountField,
  Button,
  ErrorText,
  font,
  Notice,
  Row,
  Segments,
  Toggle,
  Txt,
} from "../../../shared/ui";

export function BudgetTransitionForm({
  plan,
  close,
  back,
}: {
  plan: BudgetPlan;
  close: () => void;
  back: () => void;
}) {
  const { state, today, notify } = useFinance();
  const actions = useFinanceActions();
  const { money, moneyInput, parseMoney, symbol } = useMoney();
  const terms = budgetTermsAt(plan, today);
  const [period, setPeriod] = useState<BudgetTerms["period"]>(terms.period);
  const [amount, setAmount] = useState(
    moneyInput(terms.changes.at(-1)!.amount),
  );
  const [surplus, setSurplus] = useState(terms.rolloverSurplus);
  const [deficit, setDeficit] = useState(terms.rolloverDeficit);
  const [confirmation, setConfirmation] = useState<BudgetTransitionInput>();
  const { error, run, setError } = useActionError();
  let preview: ReturnType<typeof previewBudgetTransition> | undefined;
  let previewError: string | undefined;
  if (confirmation) {
    try {
      preview = previewBudgetTransition(state, confirmation, today);
    } catch (cause) {
      previewError =
        cause instanceof Error ? cause.message : "Проверьте условия бюджета.";
    }
  }
  const change = (action: () => void) => {
    action();
    setConfirmation(undefined);
    setError("");
  };
  return (
    <>
      <Txt style={{ fontFamily: font.bold, fontSize: 19 }}>
        Новый график бюджета
      </Txt>
      <Notice>
        Новые условия начнутся на ближайшей будущей границе текущего периода.
        Прошлые периоды сохранят свои суммы и правила. Начало нового месяца
        будет совпадать с днём перехода.
      </Notice>
      <Segments
        value={period}
        onChange={(value) => change(() => setPeriod(value))}
        options={[
          { value: "monthly", label: "Месяц" },
          { value: "weekly", label: "Неделя" },
          { value: "yearly", label: "Год" },
        ]}
      />
      <AmountField
        label={`Новый лимит, ${symbol}`}
        accessibilityLabel="Новый лимит бюджета"
        value={amount}
        onChangeText={(value) => change(() => setAmount(value))}
      />
      <Row style={{ justifyContent: "space-between" }}>
        <Txt style={{ flex: 1 }}>Переносить неиспользованный остаток</Txt>
        <Toggle
          accessibilityLabel="Переносить остаток нового бюджета"
          value={surplus}
          onValueChange={(value) => change(() => setSurplus(value))}
        />
      </Row>
      <Row style={{ justifyContent: "space-between" }}>
        <Txt style={{ flex: 1 }}>Переносить перерасход</Txt>
        <Toggle
          accessibilityLabel="Переносить перерасход нового бюджета"
          value={deficit}
          onValueChange={(value) => change(() => setDeficit(value))}
        />
      </Row>
      <ErrorText error={error || previewError || ""} />
      {preview && (
        <View testID="budget-transition-preview" style={{ gap: 10 }}>
          <Txt style={{ fontFamily: font.semibold }}>
            Переход с {dateLabel(preview.start)}
          </Txt>
          <Txt>
            Первый период: {dateLabel(preview.after.start)} —{" "}
            {dateLabel(shiftDate(preview.after.end, -1))}
          </Txt>
          <Txt>Лимит: {money(preview.after.base, true)}</Txt>
          <Txt>
            Перенос по прежним правилам: {money(preview.after.carried, true)}
          </Txt>
          <Txt>Бюджет первого периода: {money(preview.after.budget, true)}</Txt>
          <Notice>
            Это расчёт по записанным расходам на сегодня. Новые расходы и
            исправления истории изменят перенос. После первого нового периода
            будут действовать новые правила переноса.
          </Notice>
          <Button
            label="Подтвердить новый график"
            onPress={() =>
              run(() => {
                actions.scheduleBudgetTransition({
                  ...confirmation!,
                  expectedStart: preview.start,
                });
                notify("Новый график бюджета запланирован");
                close();
              })
            }
          />
        </View>
      )}
      {!confirmation && (
        <Button
          label="Рассчитать переход"
          onPress={() =>
            run(() => {
              const parsed = parseMoney(amount);
              if (parsed === null)
                return setError("Введите корректную неотрицательную сумму.");
              const input: BudgetTransitionInput = {
                categoryId: plan.categoryId,
                period,
                amount: parsed,
                rolloverSurplus: surplus,
                rolloverDeficit: deficit,
              };
              const result = previewBudgetTransition(state, input, today);
              setConfirmation({ ...input, expectedStart: result.start });
            })
          }
        />
      )}
      <Button label="Вернуться к лимиту" variant="secondary" onPress={back} />
    </>
  );
}
