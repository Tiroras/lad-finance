import { useState } from "react";
import { Pressable } from "react-native";
import { C, Row, IconTile, Button, Field, Notice } from "../ui";
import { useFinance } from "../store";
import { goalSaved, moneyInput, parseMoney, uid } from "../domain/finance";
import type { Goal } from "../domain/types";
import { ErrorText } from "./ErrorText";
import { DeleteButton } from "./DeleteButton";

export function GoalForm({ id, close }: { id?: string; close: () => void }) {
  const { state, update, notify } = useFinance();
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
  const [error, setError] = useState("");
  const save = () => {
    const targetAmount = parseMoney(target),
      monthlyAmount = parseMoney(monthly);
    if (!name.trim() || !targetAmount || monthlyAmount === null)
      return setError(
        "Укажите название, положительную сумму цели и ежемесячный взнос от 0 ₽.",
      );
    if (original && targetAmount < goalSaved(state, original))
      return setError("Сумма цели не может быть меньше уже накопленного.");
    const goal: Goal = {
      id: original?.id ?? uid(),
      name: name.trim(),
      target: targetAmount,
      monthly: monthlyAmount,
      initialSaved: original?.initialSaved ?? 0,
      icon,
      color: icon === "shield-checkmark-outline" ? C.lavender : "#EAF0E8",
    };
    update((s) => ({
      ...s,
      goals: original
        ? s.goals.map((g) => (g.id === id ? goal : g))
        : [...s.goals, goal],
    }));
    notify(original ? "Цель обновлена" : "Первый шаг к мечте сделан");
    close();
  };
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
          onDelete={() => {
            update((s) => ({
              ...s,
              goals: s.goals.filter((g) => g.id !== id),
              transactions: s.transactions.map((t) =>
                t.goalId === id ? { ...t, goalId: undefined } : t,
              ),
            }));
            notify("Цель удалена, деньги остались на счетах");
            close();
          }}
        />
      )}
    </>
  );
}
