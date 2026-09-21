import { useActionError } from "../hooks/useActionError";
import { useFinanceActions } from "../hooks/useFinanceActions";
import { useState } from "react";
import { Pressable } from "react-native";
import {
  C,
  font,
  Txt,
  Row,
  Card,
  Icon,
  Button,
  Segments,
  Field,
  Notice,
} from "../ui";
import { useFinance } from "../store";
import { moneyInput, parseMoney, parseQuickEntry } from "../domain/finance";
import type { CategoryId, Transaction } from "../domain/types";
import type { SheetState } from "../navigation/types";
import { ErrorText } from "./ErrorText";
import { AccountPicker } from "./AccountPicker";
import { CategoryPicker } from "./CategoryPicker";
import { DeleteButton } from "./DeleteButton";

export function TransactionForm({
  sheet,
  close,
}: {
  sheet: SheetState;
  close: () => void;
}) {
  const { state, notify, today } = useFinance();
  const actions = useFinanceActions();
  const original = state.transactions.find((t) => t.id === sheet.id);
  const [type, setType] = useState<Transaction["type"]>(
    original?.type ?? sheet.transactionType ?? "expense",
  );
  const [title, setTitle] = useState(original?.title ?? "");
  const [amount, setAmount] = useState(
    original ? moneyInput(original.amount) : "",
  );
  const [category, setCategory] = useState<CategoryId>(
    original?.category ?? "other",
  );
  const [accountId, setAccountId] = useState(
    original?.accountId ??
      state.accounts.find((a) => a.kind === "spending")!.id,
  );
  const [toAccountId, setToAccountId] = useState(
    original?.toAccountId ??
      state.accounts.find((a) => a.kind === "savings")!.id,
  );
  const [date, setDate] = useState(original?.date ?? today);
  const [note, setNote] = useState(original?.note ?? "");
  const [quick, setQuick] = useState("");
  const { error, setError, run } = useActionError();
  const applyQuick = (input = quick) => {
    const parsed = parseQuickEntry(input);
    if (!parsed)
      return setError(
        "Напишите название и одну сумму: например, «кофе 320» или «продукты 1 450,50».",
      );
    setType(parsed.type);
    setTitle(parsed.title);
    setAmount(moneyInput(parsed.amount));
    setCategory(parsed.category);
    setError("");
    notify("Распознано. Проверьте категорию и счёт перед сохранением.");
  };
  const save = () =>
    run(() => {
      const parsed = parseMoney(amount);
      if (parsed === null)
        return setError("Введите корректную сумму в рублях.");
      actions.saveTransaction({
        id: sheet.id,
        type,
        title,
        amount: parsed,
        date,
        category,
        accountId,
        toAccountId,
        note,
      });
      notify(
        original
          ? "Операция обновлена"
          : type === "transfer"
            ? "Перевод записан"
            : "Операция добавлена",
      );
      close();
    });
  return (
    <>
      {!original && type !== "transfer" && (
        <Card
          style={{
            backgroundColor: C.lavender,
            borderColor: "#E5E0EE",
            gap: 12,
          }}
        >
          <Row>
            <Icon name="flash-outline" color="#8C7FA4" size={18} />
            <Txt
              style={{ fontFamily: font.bold, color: "#756785", fontSize: 12 }}
            >
              Запишите как говорите
            </Txt>
          </Row>
          <Row>
            <Field
              containerStyle={{ flex: 1 }}
              style={{ backgroundColor: "#fff" }}
              accessibilityLabel="Быстрый ввод"
              placeholder="Кофе 320"
              value={quick}
              onChangeText={setQuick}
              onSubmitEditing={() => applyQuick()}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Распознать запись"
              onPress={() => applyQuick()}
              style={{
                padding: 13,
                backgroundColor: "#DED7E8",
                borderRadius: 13,
              }}
            >
              <Icon name="arrow-forward" color="#756785" />
            </Pressable>
          </Row>
          <Txt style={{ color: "#91869E", fontSize: 10 }}>
            Распознаётся на устройстве · проверьте перед сохранением
          </Txt>
        </Card>
      )}
      {original?.goalId ? (
        <Notice>
          Это пополнение цели «
          {state.goals.find((g) => g.id === original.goalId)?.name}». Изменения
          отразятся в накоплениях.
        </Notice>
      ) : (
        <Segments
          value={type}
          onChange={setType}
          options={[
            { value: "expense", label: "Расход" },
            { value: "income", label: "Доход" },
            { value: "transfer", label: "Перевод" },
          ]}
        />
      )}
      <Field
        label="Сумма, ₽"
        accessibilityLabel="Сумма операции"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        placeholder="0"
        style={{ fontSize: 36, fontFamily: font.semibold, paddingVertical: 18 }}
        maxLength={16}
      />
      <Field
        label={type === "transfer" ? "Название перевода" : "На что или откуда?"}
        accessibilityLabel="Название операции"
        placeholder={
          type === "expense"
            ? "Например, продукты домой"
            : type === "income"
              ? "Например, зарплата"
              : "Перевод между счетами"
        }
        value={title}
        onChangeText={setTitle}
        maxLength={120}
      />
      {type === "expense" && (
        <CategoryPicker value={category} onChange={setCategory} />
      )}
      <AccountPicker
        selected={accountId}
        onChange={setAccountId}
        spendingOnly={!!original?.goalId || type === "expense"}
        label={type === "transfer" ? "Откуда" : "Счёт"}
      />
      {type === "transfer" && !original?.goalId && (
        <AccountPicker
          label="Куда"
          selected={toAccountId}
          exclude={accountId}
          onChange={setToAccountId}
        />
      )}
      <Field
        label="Дата · ГГГГ-ММ-ДД"
        accessibilityLabel="Дата операции"
        value={date}
        onChangeText={setDate}
        placeholder={today}
        maxLength={10}
        autoCapitalize="none"
      />
      <Field
        label="Заметка · необязательно"
        accessibilityLabel="Заметка"
        placeholder="Что хочется запомнить?"
        value={note}
        onChangeText={setNote}
        maxLength={500}
        multiline
      />
      <ErrorText error={error} />
      <Button
        label={
          original
            ? "Сохранить изменения"
            : type === "transfer"
              ? "Записать перевод"
              : "Добавить операцию"
        }
        icon="checkmark"
        onPress={save}
      />
      {original && (
        <DeleteButton
          label="Удалить операцию"
          onDelete={() =>
            run(() => {
              actions.deleteTransaction(original.id);
              notify("Операция удалена, баланс пересчитан");
              close();
            })
          }
        />
      )}
    </>
  );
}
