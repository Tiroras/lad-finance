import { useState } from "react";
import { Pressable } from "react-native";
import { activeCategory } from "../../../domain/categories";
import {
  accountCurrency,
  currencySymbol,
  receivedAmount,
  transactionValue,
  tryConvertMoney,
} from "../../../domain/currency";
import { parseQuickEntry } from "../../../domain/finance";
import type { CategoryId, Transaction } from "../../../domain/types";
import { useActionError } from "../../../shared/lib/useActionError";
import {
  useFinanceActions,
  useMoney,
  useFinance,
} from "../../../state/finance";
import type { SheetState } from "../../../application/navigation/types";
import {
  Button,
  C,
  Card,
  Field,
  font,
  Icon,
  Notice,
  Row,
  Segments,
  Txt,
  DeleteButton,
  ErrorText,
} from "../../../shared/ui";
import { AccountPicker } from "../../accounts";
import { CategoryPicker } from "../../categories";

export function TransactionForm({
  sheet,
  close,
}: {
  sheet: SheetState;
  close: () => void;
}) {
  const {
    moneyInput,
    parseMoney,
    currency: baseCode,
    symbol: baseSymbol,
  } = useMoney();
  const { state, notify, today } = useFinance();
  const actions = useFinanceActions();
  const original = state.transactions.find((t) => t.id === sheet.id);
  const [type, setType] = useState<Transaction["type"]>(
    original?.type ?? sheet.transactionType ?? "expense",
  );
  const [title, setTitle] = useState(original?.title ?? "");
  const [amount, setAmount] = useState(
    original
      ? moneyInput(original.amount, accountCurrency(state, original.accountId))
      : "",
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
  const [received, setReceived] = useState<string | null>(
    original?.type === "transfer"
      ? moneyInput(
          receivedAmount(original),
          accountCurrency(state, original.toAccountId),
        )
      : null,
  );
  const [valuation, setValuation] = useState<string | null>(null);
  const sourceCurrency = accountCurrency(state, accountId),
    targetCurrency = accountCurrency(state, toAccountId);
  const foreignTransfer =
    type === "transfer" && sourceCurrency !== targetCurrency;
  const parsedAmount = parseMoney(amount, sourceCurrency);
  const receivedEstimate = tryConvertMoney(
    state,
    parsedAmount ?? 0,
    sourceCurrency,
    targetCurrency,
  );
  const suggestedReceived =
    receivedEstimate === null
      ? ""
      : moneyInput(receivedEstimate, targetCurrency);
  const historicalValue =
    original &&
    original.accountId === accountId &&
    original.amount === parsedAmount
      ? transactionValue(state, original)
      : tryConvertMoney(state, parsedAmount ?? 0, sourceCurrency, baseCode);
  const [date, setDate] = useState(original?.date ?? today);
  const [note, setNote] = useState(original?.note ?? "");
  const [quick, setQuick] = useState("");
  const { error, setError, run } = useActionError();
  const applyQuick = (input = quick) => {
    const parsed = parseQuickEntry(input, accountCurrency(state, accountId));
    if (!parsed)
      return setError(
        "Напишите название и одну сумму: например, «кофе 320» или «продукты 1 450,50».",
      );
    setType(parsed.type);
    setTitle(parsed.title);
    setAmount(moneyInput(parsed.amount, accountCurrency(state, accountId)));
    setCategory(activeCategory(state, parsed.category));
    setError("");
    notify("Распознано. Проверьте категорию и счёт перед сохранением.");
  };
  const save = () =>
    run(() => {
      const parsed = parseMoney(amount, accountCurrency(state, accountId));
      if (parsed === null)
        return setError("Введите корректную сумму в валюте счёта.");
      actions.saveTransaction({
        id: sheet.id,
        type,
        title,
        amount: parsed,
        toAmount: foreignTransfer
          ? (parseMoney(received ?? suggestedReceived, targetCurrency) ?? NaN)
          : undefined,
        baseAmount:
          type !== "transfer" && sourceCurrency !== baseCode
            ? (parseMoney(
                valuation ??
                  (historicalValue === null ? "" : moneyInput(historicalValue)),
              ) ?? NaN)
            : undefined,
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
        label={`Сумма, ${currencySymbol(accountCurrency(state, accountId))}`}
        accessibilityLabel="Сумма операции"
        value={amount}
        onChangeText={(value) => {
          setAmount(value);
          setValuation(null);
        }}
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
        onChange={(id) => {
          setAccountId(id);
          setValuation(null);
          setReceived(null);
        }}
        spendingOnly={!!original?.goalId || type === "expense"}
        label={type === "transfer" ? "Откуда" : "Счёт"}
      />
      {type === "transfer" && !original?.goalId && (
        <AccountPicker
          label="Куда"
          selected={toAccountId}
          exclude={accountId}
          onChange={(id) => {
            setToAccountId(id);
            setReceived(null);
          }}
        />
      )}
      {foreignTransfer && (
        <>
          <Field
            label={`Зачислено, ${currencySymbol(targetCurrency)}`}
            accessibilityLabel="Сумма зачисления"
            value={received ?? suggestedReceived}
            onChangeText={setReceived}
            keyboardType="decimal-pad"
            maxLength={16}
          />
          <Notice>
            Предложена оценка по сохранённому курсу. Укажите фактически
            полученную сумму с учётом обмена.
          </Notice>
        </>
      )}
      {type !== "transfer" && sourceCurrency !== baseCode && (
        <>
          <Field
            label={`Оценка в основной валюте, ${baseSymbol}`}
            accessibilityLabel="Оценка в основной валюте"
            value={
              valuation ??
              (historicalValue === null ? "" : moneyInput(historicalValue))
            }
            onChangeText={setValuation}
            keyboardType="decimal-pad"
            maxLength={16}
          />
          <Notice>
            Эта оценка сохранится в статистике. Для прошлой операции можно
            указать сумму по курсу на её дату.
          </Notice>
        </>
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
