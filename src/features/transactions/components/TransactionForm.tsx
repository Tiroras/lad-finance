import { useState } from "react";
import { Pressable } from "react-native";
import {
  matchCategoryRule,
  templateDraft,
  type TransactionTemplate,
} from "../../../domain/automation";
import { CategoryRuleSuggestion } from "./CategoryRuleSuggestion";
import { refundedAmount } from "../../../domain/transactionAmounts";
import { RefundFields } from "./RefundFields";
import { TransactionSplits, type SplitDraft } from "./TransactionSplits";
import { TransactionTemplates } from "./TransactionTemplates";
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
import { DebtTransactionDetails } from "../../debts";
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
  const sourceOriginal = state.transactions.find((t) => t.id === sheet.id);
  const [repeating, setRepeating] = useState(false);
  const original = repeating ? undefined : sourceOriginal;
  const [templateId, setTemplateId] = useState<string>();
  const [manualCategory, setManualCategory] = useState(!!original);
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
  const [splitEnabled, setSplitEnabled] = useState(!!original?.splits);
  const [parts, setParts] = useState<SplitDraft[]>(
    () =>
      original?.splits?.map((part, index) => ({
        key: String(index),
        category: part.category,
        amount: moneyInput(part.amount, sourceCurrency),
      })) ?? [],
  );
  const [refundOf, setRefundOf] = useState(original?.refundOf);
  const [refundSource, setRefundSource] = useState(
    original?.refundSourceAmount === undefined
      ? ""
      : moneyInput(
          original.refundSourceAmount,
          accountCurrency(
            state,
            state.transactions.find((t) => t.id === original.refundOf)
              ?.accountId,
          ),
        ),
  );
  const purchase = state.transactions.find((entry) => entry.id === refundOf);
  const selectRefund = (expense: Transaction) => {
    setRefundOf(expense.id);
    setRefundSource("");
    setType("income");
    setSplitEnabled(false);
    setAccountId(expense.accountId);
    setCategory(expense.category);
    setAmount(
      moneyInput(
        expense.amount - refundedAmount(state, expense.id, original?.id),
        accountCurrency(state, expense.accountId),
      ),
    );
    setValuation(null);
    setTitle(`Возврат: ${expense.title}`.slice(0, 120));
  };
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
    setCategory(
      parsed.type === "expense"
        ? (matchCategoryRule(state, parsed.title)?.category ??
            activeCategory(state, parsed.category))
        : "other",
    );
    setManualCategory(false);
    setError("");
    notify("Распознано. Проверьте категорию и счёт перед сохранением.");
  };
  const applyTemplate = (template: TransactionTemplate) =>
    run(() => {
      const draft = templateDraft(state, template, today);
      setType(draft.type);
      setTitle(draft.title);
      setAmount(moneyInput(draft.amount, template.currency));
      setCategory(draft.category);
      setAccountId(draft.accountId);
      if (draft.toAccountId) setToAccountId(draft.toAccountId);
      setReceived(
        draft.toAmount === undefined
          ? null
          : moneyInput(draft.toAmount, template.toCurrency),
      );
      setDate(today);
      setNote(draft.note ?? "");
      setValuation(null);
      setManualCategory(true);
      setTemplateId(template.id);
      setRefundOf(undefined);
      setSplitEnabled(!!draft.splits);
      setParts(
        draft.splits?.map((part, index) => ({
          key: String(index),
          category: part.category,
          amount: moneyInput(part.amount, template.currency),
        })) ?? [],
      );
      notify("Шаблон заполнил черновик. Проверьте сумму и дату.");
    });
  const saveTemplate = (name: string, id?: string) =>
    run(() => {
      if (refundOf || original?.debtId)
        throw new Error(
          "Возврат покупки и операции долга сохраняются через связанные записи, без шаблона обычного дохода или расхода.",
        );
      actions.saveTransactionTemplate({
        id,
        name,
        title,
        type,
        amount: parseMoney(amount, sourceCurrency) ?? NaN,
        category: type === "expense" ? category : "other",
        accountId,
        currency: sourceCurrency,
        toAccountId: type === "transfer" ? toAccountId : undefined,
        toCurrency: type === "transfer" ? targetCurrency : undefined,
        toAmount: foreignTransfer
          ? (parseMoney(received ?? suggestedReceived, targetCurrency) ?? NaN)
          : undefined,
        note,
        splits:
          type === "expense" && splitEnabled
            ? parts.map((part) => ({
                category: part.category,
                amount: parseMoney(part.amount, sourceCurrency) ?? NaN,
              }))
            : undefined,
      });
      notify(id ? "Шаблон обновлён" : "Шаблон сохранён");
    });
  const save = () =>
    run(() => {
      const parsed = parseMoney(amount, accountCurrency(state, accountId));
      if (parsed === null)
        return setError("Введите корректную сумму в валюте счёта.");
      actions.saveTransaction({
        id: original?.id,
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
        splits:
          type === "expense" && splitEnabled
            ? parts.map((part) => ({
                category: part.category,
                amount: parseMoney(part.amount, sourceCurrency) ?? NaN,
              }))
            : undefined,
        refundOf: type === "income" ? refundOf : undefined,
        refundSourceAmount:
          type === "income" &&
          purchase &&
          accountCurrency(state, purchase.accountId) !== sourceCurrency
            ? (parseMoney(
                refundSource,
                accountCurrency(state, purchase.accountId),
              ) ?? NaN)
            : undefined,
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
  if (original?.debtId)
    return <DebtTransactionDetails transaction={original} close={close} />;
  return (
    <>
      {!original && (
        <TransactionTemplates
          selectedId={templateId}
          onApply={applyTemplate}
          onSave={saveTemplate}
        />
      )}
      {repeating && (
        <Notice>
          Новая копия операции на сегодня. Проверьте сумму и дату; связи с
          целями и планами не повторяются.
        </Notice>
      )}
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
        onChangeText={(value) => {
          setTitle(value);
          if (!manualCategory && type === "expense")
            setCategory(matchCategoryRule(state, value)?.category ?? "other");
        }}
        maxLength={120}
      />
      {type === "expense" && (
        <>
          <TransactionSplits
            enabled={splitEnabled}
            parts={parts}
            currency={sourceCurrency}
            total={parsedAmount}
            onChange={setParts}
            onToggle={() => {
              setSplitEnabled(!splitEnabled);
              if (parts.length < 2)
                setParts([
                  { key: "first", category, amount },
                  {
                    key: "second",
                    category: category === "other" ? "groceries" : "other",
                    amount: "",
                  },
                ]);
            }}
          />
          {!splitEnabled && (
            <>
              <CategoryPicker
                value={category}
                onChange={(value) => {
                  setCategory(value);
                  setManualCategory(true);
                }}
              />
              <CategoryRuleSuggestion title={title} category={category} />
            </>
          )}
        </>
      )}
      <AccountPicker
        selected={accountId}
        onChange={(id) => {
          setAccountId(id);
          setValuation(null);
          setReceived(null);
        }}
        spendingOnly={!!original?.goalId || type === "expense"}
        includeCredit={
          type === "expense" && !original?.goalId && !original?.debtId
        }
        label={type === "transfer" ? "Откуда" : "Счёт"}
      />
      {type === "income" && !original?.plannedIncomeId && !original?.debtId && (
        <RefundFields
          refundOf={refundOf}
          sourceAmount={refundSource}
          accountId={accountId}
          transactionId={original?.id}
          locked={!!original?.refundOf}
          onSelect={selectRefund}
          onClear={() => setRefundOf(undefined)}
          onSourceAmount={setRefundSource}
        />
      )}
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
      {original?.type === "expense" &&
        !original.debtId &&
        original.amount > refundedAmount(state, original.id) && (
          <Button
            label="Записать возврат покупки"
            variant="secondary"
            onPress={() => {
              setRepeating(true);
              selectRefund(original);
              setDate(today);
              setNote("");
            }}
          />
        )}
      {original && (
        <>
          <Button
            label="Повторить операцию"
            variant="secondary"
            icon="copy-outline"
            onPress={() => {
              setRepeating(true);
              setDate(today);
              setValuation(null);
              notify(
                "Создан черновик новой операции. Подтвердите сумму и дату.",
              );
            }}
          />
          <TransactionTemplates
            selectedId={templateId}
            onApply={() =>
              setError(
                "Сначала нажмите «Повторить операцию» для нового черновика.",
              )
            }
            onSave={saveTemplate}
          />
        </>
      )}
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
