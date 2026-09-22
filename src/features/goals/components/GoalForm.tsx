import { useState } from "react";
import { Pressable } from "react-native";
import { currencySymbol, type CurrencyCode } from "../../../domain/currency";
import type { Goal } from "../../../domain/types";
import { CurrencyPicker } from "../../currencies";
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
  IconTile,
  Notice,
  Row,
  DeleteButton,
  ErrorText,
  AmountField,
} from "../../../shared/ui";

export function GoalForm({ id, close }: { id?: string; close: () => void }) {
  const { moneyInput, parseMoney, currency: baseCode } = useMoney();
  const { state, notify } = useFinance();
  const actions = useFinanceActions();
  const original = state.goals.find((g) => g.id === id);
  const [currency, setCurrency] = useState<CurrencyCode>(
    original ? (original.currency ?? "RUB") : baseCode,
  );
  const [name, setName] = useState(original?.name ?? "");
  const [target, setTarget] = useState(
    original
      ? moneyInput(original.target, original.currency ?? "RUB")
      : "100000",
  );
  const [monthly, setMonthly] = useState(
    original
      ? moneyInput(original.monthly, original.currency ?? "RUB")
      : "5000",
  );
  const [icon, setIcon] = useState<Goal["icon"]>(
    original?.icon ?? "airplane-outline",
  );
  const { error, setError, run } = useActionError();
  const save = () =>
    run(() => {
      const targetAmount = parseMoney(target, currency),
        monthlyAmount = parseMoney(monthly, currency);
      if (targetAmount === null || monthlyAmount === null)
        return setError(
          "Укажите сумму цели и ежемесячный взнос в выбранной валюте.",
        );
      actions.saveGoal({
        id,
        name,
        target: targetAmount,
        monthly: monthlyAmount,
        icon,
        currency,
      });
      notify(original ? "Цель обновлена" : "Первый шаг к мечте сделан");
      close();
    });
  return (
    <>
      <Row style={{ justifyContent: "center", gap: 14 }}>
        {(
          [
            "airplane-outline",
            "shield-checkmark-outline",
            "home-outline",
            "heart-outline",
            "bag-handle-outline",
          ] as const
        ).map((value) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityLabel={`Значок цели: ${value}`}
            accessibilityState={{ selected: value === icon }}
            onPress={() => setIcon(value)}
          >
            <IconTile
              name={value}
              background={value === icon ? "#DCE8C9" : C.soft}
              size={48}
            />
          </Pressable>
        ))}
      </Row>
      <Field
        label="Название цели"
        accessibilityLabel="Название цели"
        placeholder="Например, отпуск у моря"
        value={name}
        onChangeText={setName}
        maxLength={120}
      />
      <CurrencyPicker
        value={currency}
        onChange={setCurrency}
        disabled={!!original}
      />
      <AmountField
        label={`Сколько нужно накопить, ${currencySymbol(currency)}`}
        accessibilityLabel="Сумма цели"
        value={target}
        onChangeText={setTarget}
      />
      <AmountField
        label={`Планирую откладывать в месяц, ${currencySymbol(currency)}`}
        accessibilityLabel="Ежемесячный взнос"
        value={monthly}
        onChangeText={setMonthly}
      />
      <Notice>
        Лад зарезервирует взнос в расчёте доступных денег. Само пополнение вы
        отмечаете вручную — когда действительно отложили средства.
      </Notice>
      <ErrorText error={error} />
      <Button
        label={original ? "Сохранить цель" : "Создать цель"}
        onPress={save}
      />
      {original && (
        <DeleteButton
          label="Удалить цель"
          explanation="Цель исчезнет из плана. Все накопленные деньги останутся на счетах, а переводы — в истории."
          onDelete={() =>
            run(() => {
              actions.deleteGoal(original.id);
              notify("Цель удалена, деньги остались на счетах");
              close();
            })
          }
        />
      )}
    </>
  );
}
