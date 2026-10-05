import { useRef, useState } from "react";
import { Keyboard } from "react-native";
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
  useSheetScrollToStart,
} from "../../../shared/ui";
import { AccountPicker } from "../../accounts";
import { DebtTransactionDetails } from "../../debts";
import { CategoryPicker } from "../../categories";
import { RefundFields } from "./RefundFields";
import { TransactionTemplates } from "./TransactionTemplates";
import { TransactionEntryTools, type EntryTool } from "./TransactionEntryTools";
import { TransactionDetails } from "./TransactionDetails";
import { usePreventSheetDismiss } from "../../../shared/ui/SheetDismissal";
import { transactionDraftSnapshot } from "../model/transactionDraftChanges";
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
  const scrollToStart = useSheetScrollToStart();
  const sourceOriginal = state.transactions.find((t) => t.id === sheet.id);
  const [quick, setQuick] = useState("");
  const [templateName, setTemplateName] = useState("");
  const auxiliaryDraft = useRef({
    quick: "",
    templateName: "",
    savedTemplateName: "",
  });
  const [draft, setDraftState] = useState(() =>
    createTransactionDraft(state, today, sourceOriginal, sheet.transactionType),
  );
  const initialDraft = useRef(draft);
  const currentDraft = useRef(draft);
  // Keep the guard current in the input event itself, before React commits.
  const setDraft = (
    next: TransactionDraft | ((current: TransactionDraft) => TransactionDraft),
  ) => {
    currentDraft.current =
      typeof next === "function" ? next(currentDraft.current) : next;
    setDraftState(currentDraft.current);
  };
  const changeTemplateName = (value: string) => {
    auxiliaryDraft.current.templateName = value;
    setTemplateName(value);
  };
  usePreventSheetDismiss({
    hasChanges: () =>
      !sourceOriginal?.debtId &&
      (!!auxiliaryDraft.current.quick.trim() ||
        auxiliaryDraft.current.templateName.trim() !==
          auxiliaryDraft.current.savedTemplateName ||
        transactionDraftSnapshot(
          state,
          currentDraft.current,
          sourceOriginal,
        ) !==
          transactionDraftSnapshot(
            state,
            initialDraft.current,
            sourceOriginal,
          )),
    description:
      "Введённые данные операции не сохранены. Если закрыть окно, их придётся ввести заново. Сохранённая история не изменится.",
  });
  const [entryTool, setEntryTool] = useState<EntryTool>(null);
  const [detailsExpanded, setDetailsExpanded] = useState(
    !!draft.note || draft.splitEnabled,
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
    splitEnabled,
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
  const {
    error: entryError,
    setError: setEntryError,
    run: runEntry,
  } = useActionError();
  const revealDraft = (next: TransactionDraft) => {
    setError("");
    setEntryError("");
    setDraft(next);
    setDetailsExpanded(!!next.note || next.splitEnabled);
    setEntryTool(null);
    Keyboard.dismiss();
    requestAnimationFrame(() => scrollToStart?.());
  };
  const selectRefund = (expense: Transaction) =>
    setDraft((current) =>
      selectRefundDraft(state, current, expense, original?.id),
    );
  const applyQuick = (input: string) =>
    runEntry(() => {
      revealDraft(applyQuickEntry(state, draft, input));
      notify("Распознано. Проверьте категорию и счёт перед сохранением.");
    });
  const applyTemplate = (template: TransactionTemplate) =>
    runEntry(() => {
      revealDraft(applyTransactionTemplate(state, draft, template, today));
      notify("Шаблон заполнил черновик. Проверьте сумму и дату.");
    });
  const saveTemplate = (name: string, id?: string) =>
    (original ? run : runEntry)(() => {
      actions.saveTransactionTemplate(
        transactionTemplateInput(state, draft, name, id, original),
      );
      if (!id) auxiliaryDraft.current.savedTemplateName = name.trim();
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
      {repeating && (
        <Notice>
          Новая копия операции на сегодня. Проверьте сумму и дату; связи с
          целями и планами не повторяются.
        </Notice>
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
      {!original && (
        <TransactionEntryTools
          active={entryTool}
          onChange={(tool) => {
            setEntryTool(tool);
            setEntryError("");
          }}
          canQuickEnter={type !== "transfer"}
          quick={quick}
          onQuickChange={(value) => {
            auxiliaryDraft.current.quick = value;
            setQuick(value);
            setEntryError("");
          }}
          onQuickApply={applyQuick}
          templateId={templateId}
          onTemplateApply={applyTemplate}
          onTemplateSave={saveTemplate}
          templateName={templateName}
          onTemplateNameChange={changeTemplateName}
          error={entryError}
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
      {type === "expense" && !splitEnabled && (
        <CategoryPicker
          variant="select"
          value={category}
          onChange={(value) => {
            patch({ category: value, manualCategory: true });
          }}
        />
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
      <TransactionDetails
        draft={draft}
        currency={sourceCurrency}
        total={parsedAmount}
        expanded={detailsExpanded}
        onExpandedChange={setDetailsExpanded}
        onChange={patch}
        onToggleSplits={() => setDraft(toggleTransactionSplits)}
      />
      {original?.type === "expense" &&
        !original.debtId &&
        original.amount > refundedAmount(state, original.id) && (
          <Button
            label="Записать возврат покупки"
            variant="secondary"
            onPress={() => {
              revealDraft({
                ...selectRefundDraft(
                  state,
                  repeatTransaction(draft, today),
                  original,
                ),
                note: "",
              });
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
              revealDraft(repeatTransaction(draft, today));
              notify(
                "Создан черновик новой операции. Подтвердите сумму и дату.",
              );
            }}
          />
          <TransactionTemplates
            selectedId={templateId}
            name={templateName}
            onNameChange={changeTemplateName}
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
