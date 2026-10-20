import { useState } from "react";
import { DEFAULT_FORECAST } from "../../../domain/forecast";
import { DailySpendingEstimate } from "../../insights";
import {
  ErrorText,
  Button,
  Field,
  Notice,
  AmountField,
} from "../../../shared/ui";
import { useActionError } from "../../../shared/lib/useActionError";
import {
  useFinanceActions,
  useMoney,
  useFinance,
} from "../../../state/finance";
import { ForecastAccountSettings } from "./ForecastAccountSettings";
import { ForecastTransfers } from "./ForecastTransfers";

export function ForecastSettingsForm({ close }: { close: () => void }) {
  const { moneyInput, parseMoney, symbol: baseSymbol } = useMoney();
  const { state, notify } = useFinance();
  const actions = useFinanceActions();
  const preferences = state.settings.forecast ?? DEFAULT_FORECAST;
  const [daily, setDaily] = useState(moneyInput(preferences.dailySpending));
  const [goalDay, setGoalDay] = useState(String(preferences.goalDay));
  const [assignments, setAssignments] = useState(preferences);
  const { error, run } = useActionError();
  return (
    <>
      <AmountField
        label={`Повседневные расходы в день, ${baseSymbol}`}
        accessibilityLabel="Расходы в день для прогноза"
        value={daily}
        onChangeText={setDaily}
      />
      <Notice>
        Сумма на еду, транспорт и другие обычные траты с завтрашнего дня.
        Укажите её без регулярных платежей и взносов на цели: они уже учтены
        отдельно. При нуле ежедневные траты в прогноз не добавляются.
      </Notice>
      <ForecastAccountSettings value={assignments} onChange={setAssignments} />
      <ForecastTransfers
        transfers={assignments.transfers ?? []}
        onChange={(transfers) => setAssignments({ ...assignments, transfers })}
      />
      <DailySpendingEstimate
        onApply={(amount) => setDaily(moneyInput(amount))}
      />
      <Field
        label="Общий день взноса для прежних целей"
        accessibilityLabel="День взноса на цели"
        value={goalDay}
        onChangeText={setGoalDay}
        keyboardType="number-pad"
        maxLength={2}
      />
      <Notice>
        Индивидуальные графики настраиваются в каждой цели. Общий день
        применяется к целям без своего графика. В коротком месяце — последний
        день. Если день уже прошёл, невнесённая часть взноса текущего месяца
        попадёт на сегодня. Выполненные взносы и достигнутые цели повторно не
        учитываются.
      </Notice>
      <ErrorText error={error} />
      <Button
        label="Сохранить прогноз"
        onPress={() =>
          run(() => {
            const dailySpending = parseMoney(daily);
            if (dailySpending === null)
              throw new Error(
                "Введите расходы в основной валюте, в пределах допустимого лимита.",
              );
            actions.saveForecastPreferences({
              ...assignments,
              goalAccounts: assignments.goalAccounts?.filter(
                (entry) => entry.fromAccountId || entry.toAccountId,
              ),
              dailySpending,
              goalDay: Number(goalDay),
            });
            notify("Параметры прогноза сохранены");
            close();
          })
        }
      />
    </>
  );
}
