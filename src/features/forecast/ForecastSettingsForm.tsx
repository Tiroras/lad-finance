import { useState } from "react";
import { DEFAULT_FORECAST } from "../../domain/forecast";
import { moneyInput, parseMoney } from "../../domain/finance";
import { ErrorText } from "../../forms/ErrorText";
import { useActionError } from "../../hooks/useActionError";
import { useFinanceActions } from "../../hooks/useFinanceActions";
import { useFinance } from "../../store";
import { Button, Field, Notice } from "../../ui";

export function ForecastSettingsForm({ close }: { close: () => void }) {
  const { state, notify } = useFinance();
  const actions = useFinanceActions();
  const preferences = state.settings.forecast ?? DEFAULT_FORECAST;
  const [daily, setDaily] = useState(moneyInput(preferences.dailySpending));
  const [goalDay, setGoalDay] = useState(String(preferences.goalDay));
  const { error, run } = useActionError();
  return (
    <>
      <Field
        label="Повседневные расходы в день, ₽"
        accessibilityLabel="Расходы в день для прогноза"
        value={daily}
        onChangeText={setDaily}
        keyboardType="decimal-pad"
        maxLength={16}
      />
      <Notice>
        Сумма на еду, транспорт и другие обычные траты с завтрашнего дня.
        Укажите её без регулярных платежей и взносов на цели: они уже учтены
        отдельно. При нуле ежедневные траты в прогноз не добавляются.
      </Notice>
      <Field
        label="День ежемесячного взноса на цели"
        accessibilityLabel="День взноса на цели"
        value={goalDay}
        onChangeText={setGoalDay}
        keyboardType="number-pad"
        maxLength={2}
      />
      <Notice>
        В коротком месяце — последний день. Если день уже прошёл, невнесённая
        часть взноса текущего месяца попадёт на сегодня. Выполненные взносы и
        достигнутые цели повторно не учитываются.
      </Notice>
      <ErrorText error={error} />
      <Button
        label="Сохранить прогноз"
        onPress={() =>
          run(() => {
            const dailySpending = parseMoney(daily);
            if (dailySpending === null)
              throw new Error("Введите расходы в рублях, от нуля до 1 млрд ₽.");
            actions.saveForecastPreferences({
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
