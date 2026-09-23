import { useState } from "react";
import { View } from "react-native";
import { DataManagement } from "../../data-transfer";
import { useActionError } from "../../../shared/lib/useActionError";
import {
  useFinanceActions,
  useMoney,
  useFinance,
} from "../../../state/finance";
import {
  Button,
  C,
  Card,
  Field,
  font,
  IconTile,
  Row,
  Section,
  Txt,
  ErrorText,
  Chip,
  AmountField,
} from "../../../shared/ui";
import { ReminderSettings } from "../../payments";
import { SecuritySettings } from "../../security";
import type { OpenSheet } from "../../../application/navigation/types";

export function SettingsForm({
  close,
  open,
}: {
  close: () => void;
  open: OpenSheet;
}) {
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
      <Card style={{ backgroundColor: C.soft, gap: 12 }}>
        <Row>
          <IconTile name="leaf-outline" background="#DCE7CF" size={45} />
          <View style={{ flex: 1, gap: 5 }}>
            <Txt style={{ fontFamily: font.bold, fontSize: 17 }}>
              Лад — ваши личные финансы
            </Txt>
            <Txt style={{ color: C.muted, fontSize: 11 }}>
              Версия 1.0 ·{" "}
              {state.demo ? "демонстрационный режим" : "ваш личный учёт"}
            </Txt>
          </View>
        </Row>
        <Txt style={{ fontSize: 11, lineHeight: 19, color: "#728068" }}>
          Записи хранятся локально на этом устройстве. Регистрация, реклама и
          передача финансовых данных на сервер отсутствуют.
        </Txt>
      </Card>
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
      <View
        style={{ height: 1, backgroundColor: C.border, marginVertical: 4 }}
      />
      <Button
        label="Валюты и курсы"
        icon="swap-horizontal-outline"
        variant="secondary"
        onPress={() => open({ type: "currencies" })}
      />
      <Section title="Данные под вашим контролем" />
      {state.demo && (
        <Button
          label="Пошаговая настройка своего учёта"
          variant="secondary"
          onPress={() => open({ type: "onboarding" })}
        />
      )}
      <Button
        label="Правила и шаблоны операций"
        variant="secondary"
        onPress={() => open({ type: "automation" })}
      />
      <ReminderSettings />
      <SecuritySettings />
      <Button
        label="Импортировать банковский CSV"
        icon="document-text-outline"
        variant="secondary"
        onPress={() => open({ type: "csv" })}
      />
      <Button
        label="Категории и подкатегории"
        icon="grid-outline"
        variant="secondary"
        onPress={() => open({ type: "categories" })}
      />
      <Button
        label="Экспортировать операции в CSV"
        icon="download-outline"
        variant="secondary"
        onPress={() => open({ type: "export" })}
      />
      <DataManagement close={close} />
      <Txt
        style={{
          color: "#9BA391",
          fontSize: 10,
          textAlign: "center",
          marginVertical: 12,
        }}
      >
        Сделано, чтобы с деньгами было спокойнее.
      </Txt>
    </>
  );
}
