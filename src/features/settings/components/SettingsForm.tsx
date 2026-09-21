import { useState } from "react";
import { View } from "react-native";
import type { FinanceState } from "../../../domain/types";
import { BackupSettings } from "../../data-transfer";
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
  const [buffer, setBuffer] = useState(moneyInput(state.settings.buffer));
  const [error, setError] = useState("");
  const [pending, setPending] = useState<FinanceState | null>(null);
  const [reset, setReset] = useState<"clean" | "demo" | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Не удалось выполнить действие. Повторите попытку.",
      );
    } finally {
      setBusy(false);
    }
  };
  const save = () =>
    void run(async () => {
      const parsed = parseMoney(buffer),
        day = Number(payday);
      if (parsed === null)
        return setError(
          "Введите резерв в основной валюте, в пределах допустимого лимита.",
        );
      actions.saveSettings({ name, payday: day, buffer: parsed });
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
        label="День следующего регулярного дохода"
        accessibilityLabel="День дохода"
        value={payday}
        onChangeText={setPayday}
        keyboardType="number-pad"
        maxLength={2}
      />
      <Field
        label={`Неприкосновенный остаток, ${baseSymbol}`}
        accessibilityLabel="Неприкосновенный остаток"
        value={buffer}
        onChangeText={setBuffer}
        keyboardType="decimal-pad"
        maxLength={16}
      />
      <Txt style={{ fontSize: 11, color: C.muted, lineHeight: 19 }}>
        Остаток — деньги на повседневных счетах, которые вы не хотите тратить.
        Он вычитается перед расчётом доступной суммы. День дохода задаёт
        горизонт расчёта и не создаёт поступление автоматически.
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
      <BackupSettings
        onStart={() => {
          setPending(null);
          setReset(null);
        }}
        onReady={(value) => {
          setPending(value);
          setReset(null);
        }}
      />
      {pending && (
        <Card style={{ gap: 15, backgroundColor: "#FAF0E4" }}>
          <Txt style={{ fontFamily: font.bold }}>Копия проверена</Txt>
          <Txt style={{ fontSize: 12, lineHeight: 20 }}>
            В файле {pending.transactions.length} операций,{" "}
            {pending.accounts.length} счетов, {pending.goals.length} целей и{" "}
            {pending.scenarios?.length ?? 0} сценариев. Восстановление заменит
            все текущие данные. Сначала экспортируйте их, если хотите сохранить.
          </Txt>
          <Button
            label="Заменить данные этой копией"
            onPress={() =>
              void run(async () => {
                actions.restore(pending);
                notify("Данные восстановлены");
                close();
              })
            }
          />
          <Button
            label="Отмена восстановления"
            variant="secondary"
            onPress={() => setPending(null)}
          />
        </Card>
      )}
      <View
        style={{ height: 1, backgroundColor: C.border, marginVertical: 4 }}
      />
      {state.demo ? (
        <Button
          label="Начать свой учёт с нуля"
          icon="leaf-outline"
          variant="secondary"
          onPress={() => {
            setReset("clean");
            setPending(null);
          }}
        />
      ) : (
        <Row>
          <Button
            label="Очистить учёт"
            variant="danger"
            style={{ flex: 1 }}
            onPress={() => {
              setReset("clean");
              setPending(null);
            }}
          />
          <Button
            label="Загрузить демо"
            variant="secondary"
            style={{ flex: 1 }}
            onPress={() => {
              setReset("demo");
              setPending(null);
            }}
          />
        </Row>
      )}
      {reset && (
        <Card style={{ gap: 15, backgroundColor: "#FAF0E4" }}>
          <Txt style={{ fontFamily: font.bold }}>
            {reset === "demo" ? "Загрузить пример?" : "Начать с чистого листа?"}
          </Txt>
          <Txt style={{ fontSize: 12, lineHeight: 20 }}>
            Текущие операции, категории, цели, платежи, сценарии и остатки будут
            заменены. При необходимости сначала экспортируйте резервную копию.
          </Txt>
          <Button
            label={
              reset === "demo"
                ? "Да, заменить демоданными"
                : "Да, начать с пустых счетов"
            }
            onPress={() =>
              void run(async () => {
                actions.reset(reset === "demo");
                notify(
                  reset === "demo"
                    ? "Демонстрационные данные загружены"
                    : "Всё готово для вашего первого шага",
                );
                close();
              })
            }
          />
          <Button
            label="Отмена"
            variant="secondary"
            onPress={() => setReset(null)}
          />
        </Card>
      )}
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
