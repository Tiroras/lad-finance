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
import {
  accountBalance,
  goalSaved,
  moneyInput,
  parseMoney,
  parseQuickEntry,
  uid,
  validateTransaction,
} from "../domain/finance";
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
  const { state, update, notify, today } = useFinance();
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
  const [error, setError] = useState("");
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
  const save = () => {
    const parsed = parseMoney(amount);
    const transaction: Transaction = {
      id: original?.id ?? uid(),
      type,
      title:
        title.trim() || (type === "transfer" ? "Перевод между счетами" : ""),
      amount: parsed ?? 0,
      date,
      category,
      accountId,
      note: note.trim(),
      importKey: original?.importKey,
    };
    if (type === "transfer") {
      transaction.toAccountId = toAccountId;
      if (original?.goalId) transaction.goalId = original.goalId;
    }
    if (type === "expense" && original?.recurringId) {
      transaction.recurringId = original.recurringId;
      transaction.occurrenceDate = original.occurrenceDate;
    }
    const withoutOriginal = {
      ...state,
      transactions: state.transactions.filter((t) => t.id !== original?.id),
    };
    const validation = validateTransaction(withoutOriginal, transaction, today);
    if (validation) return setError(validation);
    if (
      original?.goalId &&
      (state.accounts.find((a) => a.id === accountId)?.kind !== "spending" ||
        state.accounts.find((a) => a.id === toAccountId)?.kind !== "savings")
    )
      return setError(
        "Пополнять цель можно только с обычного счёта на накопительный.",
      );
    if (
      type === "transfer" &&
      state.accounts.find((a) => a.id === accountId)?.kind === "savings"
    ) {
      const allocated = state.goals.reduce(
        (n, g) => n + goalSaved(withoutOriginal, g),
        0,
      );
      const allSavings = state.accounts
        .filter((a) => a.kind === "savings")
        .reduce((n, a) => n + accountBalance(withoutOriginal, a.id), 0);
      if (
        state.accounts.find((a) => a.id === toAccountId)?.kind !== "savings" &&
        transaction.amount > allSavings - allocated
      )
        return setError(
          "Эти накопления распределены по целям. Сначала освободите средства, удалив соответствующую цель.",
        );
    }
    if (
      type === "expense" &&
      state.accounts.find((a) => a.id === accountId)?.kind === "savings"
    )
      return setError(
        "Для расхода сначала переведите свободные накопления на обычный счёт.",
      );
    update((s) => ({
      ...s,
      transactions: [
        transaction,
        ...s.transactions.filter((t) => t.id !== original?.id),
      ],
    }));
    notify(
      original
        ? "Операция обновлена"
        : type === "transfer"
          ? "Перевод записан"
          : "Операция добавлена",
    );
    close();
  };
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
          onDelete={() => {
            update((s) => ({
              ...s,
              transactions: s.transactions.filter((t) => t.id !== original.id),
            }));
            notify("Операция удалена, баланс пересчитан");
            close();
          }}
        />
      )}
    </>
  );
}
