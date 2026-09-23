import { useState } from "react";
import {
  matchCategoryRule,
  type TransactionTemplate,
} from "../../../domain/automation";
import { refundedAmount } from "../../../domain/transactionAmounts";
import { accountCurrency, currencySymbol } from "../../../domain/currency";
import type { Transaction } from "../../../domain/types";
import { useActionError } from "../../../shared/lib/useActionError";
import {
  useFinanceActions,
  useMoney,
  useFinance,
} from "../../../state/finance";
import type { SheetOf } from "../../../application/navigation/types";
import {
  Button,
  Field,
  font,
  Notice,
  Segments,
  DeleteButton,
  ErrorText,
  AmountField,
  DateField,
} from "../../../shared/ui";
import { AccountPicker } from "../../accounts";
import { DebtTransactionDetails } from "../../debts";
import { CategoryPicker } from "../../categories";
import { CategoryRuleSuggestion } from "./CategoryRuleSuggestion";
import { RefundFields } from "./RefundFields";
import { TransactionSplits } from "./TransactionSplits";
import { TransactionTemplates } from "./TransactionTemplates";
import { QuickEntry } from "./QuickEntry";
import {
  applyQuickEntry,
  applyTransactionTemplate,
  changeTransactionType,
  createTransactionDraft,
  repeatTransaction,
  selectRefund as selectRefundDraft,
  toggleTransactionSplits,
  transactionDraftAmounts,
  transactionInput,
  transactionTemplateInput,
  type TransactionDraft,
} from "../model/transactionDraft";

export function TransactionForm({
  sheet,
  close,
}: {
  sheet: SheetOf<"transaction">;
  close: () => void;
}) {
  const { moneyInput, currency: baseCode, symbol: baseSymbol } = useMoney();
  const { state, notify, today } = useFinance();
  const actions = useFinanceActions();
  const sourceOriginal = state.transactions.find((t) => t.id === sheet.id);
  const [quick, setQuick] = useState("");
  const [draft, setDraft] = useState(() =>
    createTransactionDraft(state, today, sourceOriginal, sheet.transactionType),
  );
  const {
    repeating,
    templateId,
    manualCategory,
    type,
    title,
    amount,
    category,
    accountId,
    toAccountId,
    received,
    valuation,
    date,
    note,
    splitEnabled,
    parts,
    refundOf,
    refundSource,
  } = draft;
  const original = repeating ? undefined : sourceOriginal;
  const {
    sourceCurrency,
    targetCurrency,
    foreignTransfer,
    parsedAmount,
    suggestedReceived,
    historicalValue,
  } = transactionDraftAmounts(state, draft, original);
  const patch = (values: Partial<TransactionDraft>) =>
    setDraft((current) => ({ ...current, ...values }));
  const { error, setError, run } = useActionError();
  const selectRefund = (expense: Transaction) =>
    setDraft((current) =>
      selectRefundDraft(state, current, expense, original?.id),
    );
  const applyQuick = (input: string) =>
    run(() => {
      setDraft(applyQuickEntry(state, draft, input));
      notify("Распознано. Проверьте категорию и счёт перед сохранением.");
    });
  const applyTemplate = (template: TransactionTemplate) =>
    run(() => {
      setDraft(applyTransactionTemplate(state, draft, template, today));
      notify("Шаблон заполнил черновик. Проверьте сумму и дату.");
    });
  const saveTemplate = (name: string, id?: string) =>
    run(() => {
      actions.saveTransactionTemplate(
        transactionTemplateInput(state, draft, name, id, original),
      );
      notify(id ? "Шаблон обновлён" : "Шаблон сохранён");
    });
  const save = () =>
    run(() => {
      actions.saveTransaction(transactionInput(state, draft, original));
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
        <QuickEntry value={quick} onChange={setQuick} onApply={applyQuick} />
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
          onChange={(value) =>
            setDraft((current) =>
              changeTransactionType(current, value, original),
            )
          }
          options={[
            { value: "expense", label: "Расход" },
            { value: "income", label: "Доход" },
            { value: "transfer", label: "Перевод" },
          ]}
        />
      )}
      <AmountField
        label={`Сумма, ${currencySymbol(accountCurrency(state, accountId))}`}
        accessibilityLabel="Сумма операции"
        value={amount}
        onChangeText={(value) => {
          patch({ amount: value, valuation: null });
        }}
        placeholder="0"
        style={{ fontSize: 36, fontFamily: font.semibold, paddingVertical: 18 }}
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
          patch({
            title: value,
            category:
              !manualCategory && type === "expense"
                ? (matchCategoryRule(state, value)?.category ?? "other")
                : category,
          });
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
            onChange={(parts) => patch({ parts })}
            onToggle={() => setDraft(toggleTransactionSplits)}
          />
          {!splitEnabled && (
            <>
              <CategoryPicker
                value={category}
                onChange={(value) => {
                  patch({ category: value, manualCategory: true });
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
          patch({ accountId: id, valuation: null, received: null });
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
          onClear={() => patch({ refundOf: undefined, refundSource: "" })}
          onSourceAmount={(refundSource) => patch({ refundSource })}
        />
      )}
      {type === "transfer" && !original?.goalId && (
        <AccountPicker
          label="Куда"
          selected={toAccountId}
          exclude={accountId}
          onChange={(id) => {
            patch({ toAccountId: id, received: null });
          }}
        />
      )}
      {foreignTransfer && (
        <>
          <AmountField
            label={`Зачислено, ${currencySymbol(targetCurrency)}`}
            accessibilityLabel="Сумма зачисления"
            value={received ?? suggestedReceived}
            onChangeText={(received) => patch({ received })}
          />
          <Notice>
            Предложена оценка по сохранённому курсу. Укажите фактически
            полученную сумму с учётом обмена.
          </Notice>
        </>
      )}
      {type !== "transfer" && sourceCurrency !== baseCode && (
        <>
          <AmountField
            label={`Оценка в основной валюте, ${baseSymbol}`}
            accessibilityLabel="Оценка в основной валюте"
            value={
              valuation ??
              (historicalValue === null ? "" : moneyInput(historicalValue))
            }
            onChangeText={(valuation) => patch({ valuation })}
          />
          <Notice>
            Эта оценка сохранится в статистике. Для прошлой операции можно
            указать сумму по курсу на её дату.
          </Notice>
        </>
      )}
      <DateField
        label="Дата"
        accessibilityLabel="Дата операции"
        value={date}
        onChangeText={(date) => patch({ date })}
      />
      <Field
        label="Заметка · необязательно"
        accessibilityLabel="Заметка"
        placeholder="Что хочется запомнить?"
        value={note}
        onChangeText={(note) => patch({ note })}
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
              setDraft((current) => ({
                ...selectRefundDraft(
                  state,
                  repeatTransaction(current, today),
                  original,
                ),
                note: "",
              }));
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
              setDraft((current) => repeatTransaction(current, today));
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
