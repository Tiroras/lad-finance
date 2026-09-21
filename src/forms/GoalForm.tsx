import { useActionError } from "../hooks/useActionError";
import { useFinanceActions } from "../hooks/useFinanceActions";
import { useState } from "react";
import { Pressable } from "react-native";
import { C, Row, IconTile, Button, Field, Notice } from "../ui";
import { useFinance } from "../store";
import { moneyInput, parseMoney } from "../domain/finance";
import type { Goal } from "../domain/types";
import { ErrorText } from "./ErrorText";
import { DeleteButton } from "./DeleteButton";

export function GoalForm({ id, close }: { id?: string; close: () => void }) {
  const { state, notify } = useFinance();
  const actions = useFinanceActions();
  const original = state.goals.find((g) => g.id === id);
  const [name, setName] = useState(original?.name ?? "");
  const [target, setTarget] = useState(
    original ? moneyInput(original.target) : "100000",
  );
  const [monthly, setMonthly] = useState(
    original ? moneyInput(original.monthly) : "5000",
  );
  const [icon, setIcon] = useState<Goal["icon"]>(
    original?.icon ?? "airplane-outline",
  );
  const { error, setError, run } = useActionError();
  const save = () =>
    run(() => {
      const targetAmount = parseMoney(target),
        monthlyAmount = parseMoney(monthly);
      if (targetAmount === null || monthlyAmount === null)
        return setError("Укажите сумму цели и ежемесячный взнос в рублях.");
      actions.saveGoal({
        id,
        name,
        target: targetAmount,
        monthly: monthlyAmount,
        icon,
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
      <Field
        label="Сколько нужно накопить, ₽"
        accessibilityLabel="Сумма цели"
        value={target}
        onChangeText={setTarget}
        keyboardType="decimal-pad"
        maxLength={16}
      />
      <Field
        label="Планирую откладывать в месяц, ₽"
        accessibilityLabel="Ежемесячный взнос"
        value={monthly}
        onChangeText={setMonthly}
        keyboardType="decimal-pad"
        maxLength={16}
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
