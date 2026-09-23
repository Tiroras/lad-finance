import { useState } from "react";
import { View } from "react-native";
import { useActionError } from "../../../shared/lib/useActionError";
import {
  useFinanceActions,
  useMoney,
  useFinance,
} from "../../../state/finance";
import {
  Button,
  C,
  Field,
  Section,
  Txt,
  ErrorText,
  Chip,
  AmountField,
} from "../../../shared/ui";

export function SettingsForm({ close }: { close: () => void }) {
  const { moneyInput, parseMoney, symbol: baseSymbol } = useMoney();
  const { state, notify } = useFinance();
  const actions = useFinanceActions();
  const [name, setName] = useState(state.settings.name);
  const [payday, setPayday] = useState(String(state.settings.payday));
  const [spendableIncomeId, setSpendableIncomeId] = useState(
    state.settings.spendableIncomeId,
  );
  const [buffer, setBuffer] = useState(moneyInput(state.settings.buffer));
  const { error, setError, run } = useActionError();
  const save = () =>
    run(() => {
      const parsed = parseMoney(buffer),
        day = Number(payday);
      if (parsed === null)
        return setError(
          "Введите резерв в основной валюте, в пределах допустимого лимита.",
        );
      actions.saveSettings({
        name,
        payday: day,
        buffer: parsed,
        spendableIncomeId,
      });
      notify("Настройки сохранены");
      close();
    });
  return (
    <>
      <Field
        label="Как к вам обращаться?"
        accessibilityLabel="Ваше имя"
        value={name}
        onChangeText={setName}
        placeholder="Ваше имя"
        maxLength={40}
      />
      <Field
        label="День дохода, если нет запланированных поступлений"
        accessibilityLabel="День дохода"
        value={payday}
        onChangeText={setPayday}
        keyboardType="number-pad"
        maxLength={2}
      />
      <Section title="До какого дохода планировать траты" />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Chip
          label="Ближайший по плану"
          active={!spendableIncomeId}
          onPress={() => setSpendableIncomeId(undefined)}
        />
        {(state.plannedIncomes ?? []).map((income) => (
          <Chip
            key={income.id}
            label={income.name}
            active={spendableIncomeId === income.id}
            onPress={() => setSpendableIncomeId(income.id)}
          />
        ))}
      </View>
      <Txt style={{ fontSize: 11, color: C.muted }}>
        Выберите надёжное поступление. Ожидаемые деньги остаются в прогнозе и не
        увеличивают текущий остаток.
      </Txt>
      <AmountField
        label={`Неприкосновенный остаток, ${baseSymbol}`}
        accessibilityLabel="Неприкосновенный остаток"
        value={buffer}
        onChangeText={setBuffer}
      />
      <Txt style={{ fontSize: 11, color: C.muted, lineHeight: 19 }}>
        Остаток — деньги на повседневных счетах, которые вы не хотите тратить.
        Он вычитается перед расчётом доступной суммы. Без будущих планов
        используется день дохода из настроек. Поступления записываются после
        фактического получения.
      </Txt>
      <ErrorText error={error} />
      <Button label="Сохранить настройки" onPress={save} />
    </>
  );
}
