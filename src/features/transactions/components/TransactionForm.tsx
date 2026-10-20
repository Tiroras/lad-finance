import { useMemo, useRef, useState } from "react";
import { Keyboard } from "react-native";
import {
  matchCategoryRule,
  type TransactionTemplate,
} from "../../../domain/automation";
import { refundedAmount } from "../../../domain/transactionAmounts";
import { currencySymbol, parseMoney } from "../../../domain/currency";
import { transactionValuationLabel } from "../../../domain/transactionValuation";
import { uid } from "../../../domain/finance";
import { sameTransaction } from "../../../domain/actions/transactions";
import { transactionStatus } from "../../../domain/transactionStatus";
import type { FinanceState, Transaction } from "../../../domain/types";
import { useStoredDraft } from "../../../infrastructure/storage/useStoredDraft";
import { encryptedDraftStorage } from "../../../infrastructure/storage/draftStorage";
import { useActionError } from "../../../shared/lib/useActionError";
import {
  useFinanceActions,
  useMoney,
  useFinance,
  useFinanceStatus,
} from "../../../state/finance";
import type { OpenSheet, SheetOf } from "../../../application/navigation/types";
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
import { AccountChoiceEmpty, AccountPicker } from "../../accounts";
import { useSecurity } from "../../security";
import { DebtTransactionDetails } from "../../debts";
import { CategoryPicker } from "../../categories";
import { RefundFields } from "./RefundFields";
import { TransactionTemplates } from "./TransactionTemplates";
import { TransactionEntryTools, type EntryTool } from "./TransactionEntryTools";
import { TransactionDetails } from "./TransactionDetails";
import { ExchangeFeeFields } from "./ExchangeFeeFields";
import { usePreventSheetDismiss } from "../../../shared/ui/SheetDismissal";
import { transactionDraftSnapshot } from "../model/transactionDraftChanges";
import {
  parseStoredTransactionDraft,
  type StoredTransactionDraft,
} from "../model/storedTransactionDraft";
import {
  applyQuickEntry,
  applyTransactionTemplate,
  changeTransactionType,
  createTransactionDraft,
  draftAccountCurrency,
  repeatTransaction,
  selectRefund as selectRefundDraft,
  toggleTransactionSplits,
  transactionDraftAmounts,
  transactionInput,
  transactionTemplateInput,
  type TransactionDraft,
} from "../model/transactionDraft";

type TransactionFormProps = {
  sheet: SheetOf<"transaction">;
  close: () => void;
  open: OpenSheet;
};

export function TransactionForm(props: TransactionFormProps) {
  const { profile } = useFinance();
  return (
    <TransactionFormFields
      key={`${profile}:${props.sheet.id ?? "new"}`}
      {...props}
    />
  );
}

function TransactionFormFields({ sheet, close, open }: TransactionFormProps) {
  const { moneyInput, currency: baseCode, symbol: baseSymbol } = useMoney();
  const { state, profile, notify, today } = useFinance();
  const status = useFinanceStatus();
  const { locked } = useSecurity();
  const actions = useFinanceActions();
  const scrollToStart = useSheetScrollToStart();
  const sourceOriginal = state.transactions.find((t) => t.id === sheet.id);
  const [baseline, setBaseline] = useState<Transaction | null>(
    sourceOriginal ?? null,
  );
  const [createId, setCreateId] = useState(uid);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const keepingDraftOnClose = useRef(false);
  const pendingSave = useRef<{
    state: FinanceState;
    message: string;
    confirmed?: boolean;
  } | null>(null);
  const [awaitingSave, setAwaitingSave] = useState(false);
  const [postDate, setPostDate] = useState(today);
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
    status: draftStatus,
    expectedDate,
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
  const payload = useMemo<StoredTransactionDraft>(
    () => ({
      version: 1,
      createId,
      draft,
      quick,
      templateName,
      savedTemplateName: auxiliaryDraft.current.savedTemplateName,
      original: baseline,
    }),
    [createId, draft, quick, templateName, baseline],
  );
  const recordId = draft.repeating ? "new" : (sheet.id ?? "new");
  const savedDraft = useStoredDraft({
    profileId: profile,
    slot: "transaction",
    recordId,
    payload,
    dirty:
      !!quick.trim() ||
      templateName.trim() !== auxiliaryDraft.current.savedTemplateName ||
      transactionDraftSnapshot(state, draft, sourceOriginal) !==
        transactionDraftSnapshot(state, initialDraft.current, sourceOriginal),
    enabled:
      status.ready &&
      !status.financeWriteBlocked &&
      !locked &&
      !sourceOriginal?.debtId,
    parse: parseStoredTransactionDraft,
    onRestore: (restored) => {
      setCreateId(restored.createId);
      setBaseline(restored.original);
      setDraft(restored.draft);
      setQuick(restored.quick);
      setTemplateName(restored.templateName);
      auxiliaryDraft.current = {
        quick: restored.quick,
        templateName: restored.templateName,
        savedTemplateName: restored.savedTemplateName,
      };
      setDetailsExpanded(!!restored.draft.note || restored.draft.splitEnabled);
      setError("");
    },
  });
  const hasChanges = () =>
    !keepingDraftOnClose.current &&
    !sourceOriginal?.debtId &&
    (!!pendingSave.current ||
      !!auxiliaryDraft.current.quick.trim() ||
      auxiliaryDraft.current.templateName.trim() !==
        auxiliaryDraft.current.savedTemplateName ||
      transactionDraftSnapshot(state, currentDraft.current, sourceOriginal) !==
        transactionDraftSnapshot(state, initialDraft.current, sourceOriginal));
  usePreventSheetDismiss({
    hasChanges,
    description:
      "Введённые поля и сохранённый черновик этой формы будут удалены. Записанные финансовые операции не изменятся.",
    onDiscard: async () => {
      if (saving.current || pendingSave.current)
        throw new Error(
          "Сначала подтвердите сохранение операции. Черновик пока нужен для безопасного повтора.",
        );
      await savedDraft.clear();
    },
  });
  const originalChanged =
    !!original && (!baseline || !sameTransaction(original, baseline));
  const originalRemoved = !!sheet.id && !repeating && !sourceOriginal;
  const validAccount = state.accounts.some(
    (account) =>
      account.id === accountId &&
      !account.archived &&
      (type !== "expense" ||
        account.kind === "spending" ||
        account.kind === "credit"),
  );
  const validTarget =
    type !== "transfer" ||
    state.accounts.some(
      (account) =>
        account.id === toAccountId &&
        account.id !== accountId &&
        !account.archived,
    );
  const {
    error: entryError,
    setError: setEntryError,
    run: runEntry,
  } = useActionError();
  const revealDraft = (next: TransactionDraft) => {
    if (next.repeating && !currentDraft.current.repeating) setCreateId(uid());
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
      notify(
        foreignTransfer && draft.feeEnabled
          ? "Шаблон перевода сохранён. Комиссию нужно добавлять отдельно при каждом обмене."
          : id
            ? "Шаблон обновлён"
            : "Шаблон сохранён",
      );
    });
  const commit = async (change: () => FinanceState, message: string) => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      if (!pendingSave.current) {
        if (!savedDraft.ready || savedDraft.offer)
          throw new Error(
            "Сначала выберите, что делать с сохранённым черновиком.",
          );
        await savedDraft.flush();
        savedDraft.suspend();
        try {
          pendingSave.current = { state: change(), message };
          setAwaitingSave(true);
        } catch (cause) {
          savedDraft.resume();
          throw cause;
        }
      }
      const pending = pendingSave.current;
      await status.confirmCurrentSave(profile, pending.state);
      pending.confirmed = true;
      await savedDraft.clear();
      pendingSave.current = null;
      setAwaitingSave(false);
      notify(pending.message);
      keepingDraftOnClose.current = true;
      close();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Не удалось подтвердить сохранение. Черновик сохранён для повтора.",
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  const save = () =>
    void commit(
      () => {
        const input = {
          ...transactionInput(state, draft, original),
          ...(!original
            ? { createId }
            : { expectedOriginal: baseline ?? original }),
        };
        return !original &&
          foreignTransfer &&
          draftStatus === "posted" &&
          draft.feeEnabled
          ? actions.exchangeWithFee({
              transfer: input,
              feeAmount:
                parseMoney(
                  draft.feeAmount ?? "",
                  draftAccountCurrency(state, draft.feeAccountId ?? ""),
                ) ?? NaN,
              feeAccountId: draft.feeAccountId ?? "",
              feeCategory: draft.feeCategory ?? "other",
            })
          : actions.saveTransaction(input);
      },
      draftStatus === "pending"
        ? "Операция ожидает проведения"
        : original
          ? "Операция обновлена"
          : type === "transfer"
            ? foreignTransfer && draft.feeEnabled
              ? "Обмен и комиссия записаны"
              : "Перевод записан"
            : "Операция добавлена",
    );
  if (original?.debtId)
    return <DebtTransactionDetails transaction={original} close={close} />;
  if (busy || awaitingSave)
    return (
      <>
        <Notice>
          {busy
            ? "Подтверждаем запись операции и очищаем её черновик…"
            : pendingSave.current?.confirmed
              ? "Операция сохранена. Не удалось очистить её черновик; повтор проверит ту же запись и завершит очистку, без добавления второго движения."
              : "Сохранение операции ещё не подтверждено. Повтор проверит ту же запись, без добавления второго движения."}
        </Notice>
        <ErrorText error={error} />
        <Button
          label={busy ? "Сохранение…" : "Повторить подтверждение сохранения"}
          disabled={busy}
          onPress={save}
        />
        {!busy && (
          <Button
            label="Закрыть и сохранить черновик"
            variant="secondary"
            onPress={() => {
              keepingDraftOnClose.current = true;
              close();
            }}
          />
        )}
      </>
    );
  if (!savedDraft.ready)
    return (
      <>
        <Notice>Проверяем сохранённый черновик…</Notice>
        <ErrorText error={savedDraft.error} />
        {!!savedDraft.error && (
          <>
            <Button
              label="Повторить чтение черновика"
              onPress={savedDraft.retryLoad}
            />
            <DeleteButton
              label="Удалить все черновики профиля"
              explanation="Удалятся черновики операции и первоначальной настройки только этого профиля. Записанный учёт не изменится. Это действие нельзя отменить."
              onDelete={() =>
                void savedDraft
                  .discardAll()
                  .catch((cause: unknown) =>
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : "Не удалось удалить черновики.",
                    ),
                  )
              }
            />
          </>
        )}
      </>
    );
  const sameDraftRecord = savedDraft.offer?.lease.recordId === recordId;
  const storedDraftError = error || savedDraft.error;
  if (savedDraft.offer)
    return (
      <>
        <Notice>
          На этом профиле есть сохранённый черновик операции. Поля ещё не
          применены.
          {sameDraftRecord
            ? " Можно продолжить ввод или явно удалить черновик."
            : " Он относится к другой записи; открыть его или заменить текущей формой нужно явно."}
        </Notice>
        <ErrorText error={storedDraftError} />
        <Button
          label={
            sameDraftRecord
              ? "Восстановить черновик операции"
              : "Открыть сохранённый черновик"
          }
          onPress={() => {
            if (!sameDraftRecord) {
              const id = savedDraft.offer?.lease.recordId;
              open({
                type: "transaction",
                ...(id && id !== "new" ? { id } : {}),
              });
            } else
              void savedDraft
                .restore()
                .catch((cause: unknown) =>
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : "Не удалось открыть черновик.",
                  ),
                );
          }}
        />
        <Button
          label={
            sameDraftRecord
              ? "Удалить сохранённый черновик"
              : "Заменить черновик этой формой"
          }
          variant="danger"
          onPress={() =>
            void savedDraft
              .discard()
              .catch((cause: unknown) =>
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Не удалось удалить черновик.",
                ),
              )
          }
        />
      </>
    );
  if (originalRemoved)
    return (
      <>
        <Notice tone="warning">
          Исходная операция удалена. Черновик не перезапишет другую запись.
          Можно явно создать новую операцию с этими полями.
        </Notice>
        <ErrorText error={storedDraftError} />
        <Button
          label="Создать новую из черновика"
          onPress={() => revealDraft(repeatTransaction(draft, today))}
        />
      </>
    );
  if (original && transactionStatus(original) === "cancelled")
    return (
      <>
        <Notice>
          «{original.title}» отменена. Деньги не списаны, резерв освобождён.
          Отмена сохранена в истории.
        </Notice>
        <Button
          label="Создать новую операцию"
          variant="secondary"
          onPress={() => revealDraft(repeatTransaction(draft, today))}
        />
      </>
    );
  if (!original && !state.accounts.some((account) => !account.archived))
    return <AccountChoiceEmpty open={open} />;
  const pendingChanged =
    !!original &&
    transactionStatus(original) === "pending" &&
    transactionDraftSnapshot(state, draft, original) !==
      transactionDraftSnapshot(
        state,
        createTransactionDraft(state, today, original),
        original,
      );
  return (
    <>
      {!encryptedDraftStorage && (
        <Notice>
          Черновик автоматически сохраняется в браузере без шифрования. После
          перезапуска его восстановление нужно подтвердить.
        </Notice>
      )}
      <ErrorText error={savedDraft.error} />
      {originalChanged && (
        <>
          <Notice tone="warning">
            Операция изменилась после сохранения черновика. Сейчас записано:
            {" «"}
            {original!.title}
            {"», "}
            {moneyInput(
              original!.amount,
              draftAccountCurrency(state, original!.accountId),
            )}{" "}
            {draftAccountCurrency(state, original!.accountId)}, {original!.date}
            . Ваши поля ещё не записаны. Подтвердите замену только после
            проверки.
          </Notice>
          <Button
            label="Подтвердить замену актуальной записи черновиком"
            variant="secondary"
            onPress={() => setBaseline(original ?? null)}
          />
        </>
      )}
      {repeating && (
        <Notice>
          Новая копия операции на сегодня. Проверьте сумму и дату; связи с
          целями и планами не повторяются.
        </Notice>
      )}
      {!original && !refundOf && (
        <Segments
          value={draftStatus}
          onChange={(status) => patch({ status })}
          options={[
            { value: "posted", label: "Проведена" },
            { value: "pending", label: "Ожидается" },
          ]}
        />
      )}
      {draftStatus === "pending" && (
        <Notice>
          Ожидаемая операция не меняет фактический остаток. Исходящая сумма
          зарезервирована до проведения или отмены; поступление ещё не доступно
          для трат.
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
        label={`Сумма, ${currencySymbol(draftAccountCurrency(state, accountId))}`}
        accessibilityLabel="Сумма операции"
        value={amount}
        onChangeText={(value) => {
          patch({ amount: value, valuation: null, valuationDate: undefined });
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
          patch({
            accountId: id,
            valuation: null,
            valuationDate: undefined,
            received: null,
          });
        }}
        spendingOnly={!!original?.goalId || type === "expense"}
        includeCredit={
          type === "expense" && !original?.goalId && !original?.debtId
        }
        label={type === "transfer" ? "Откуда" : "Счёт"}
      />
      {!validAccount && <AccountChoiceEmpty open={open} />}
      {type === "income" &&
        draftStatus === "posted" &&
        validAccount &&
        !original?.plannedIncomeId &&
        !original?.debtId && (
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
      {!validTarget && <AccountChoiceEmpty open={open} />}
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
            onChangeText={(valuation) =>
              patch({
                valuation,
                valuationDate: draft.valuationDate ?? date,
              })
            }
          />
          <Notice>
            Эта оценка сохранится в статистике и не изменится при обновлении
            курсов. Для прошлой операции можно указать свою сумму и дату
            основания.
          </Notice>
          {valuation !== null ? (
            <DateField
              label="Дата основания ручной оценки"
              accessibilityLabel="Дата основания оценки"
              value={draft.valuationDate ?? date}
              onChangeText={(valuationDate) => patch({ valuationDate })}
            />
          ) : (
            <>
              <Notice>
                {original &&
                original.accountId === accountId &&
                original.amount === parsedAmount
                  ? transactionValuationLabel(original)
                  : `Оценка по сохранённому курсу на день записи ${today.split("-").reverse().join(".")}. Автоматические исторические курсы не загружаются.`}
              </Notice>
              <Button
                label="Указать основание оценки вручную"
                variant="secondary"
                onPress={() =>
                  patch({
                    valuation:
                      historicalValue === null
                        ? ""
                        : moneyInput(historicalValue),
                    valuationDate: draft.valuationDate ?? date,
                  })
                }
              />
            </>
          )}
        </>
      )}
      {foreignTransfer && !original && draftStatus === "posted" && (
        <ExchangeFeeFields draft={draft} onChange={patch} />
      )}
      <DateField
        label={draftStatus === "pending" ? "Дата создания ожидания" : "Дата"}
        accessibilityLabel="Дата операции"
        value={date}
        onChangeText={(date) => patch({ date })}
      />
      {draftStatus === "pending" && (
        <DateField
          label="Ожидаемая дата · необязательно"
          accessibilityLabel="Ожидаемая дата операции"
          value={expectedDate}
          onChangeText={(expectedDate) => patch({ expectedDate })}
        />
      )}
      <ErrorText error={error} />
      <Button
        label={
          original
            ? "Сохранить изменения"
            : draftStatus === "pending"
              ? "Добавить ожидаемую операцию"
              : type === "transfer"
                ? foreignTransfer && draft.feeEnabled
                  ? "Записать обмен и комиссию"
                  : "Записать перевод"
                : "Добавить операцию"
        }
        icon="checkmark"
        onPress={save}
        disabled={
          originalChanged ||
          !validAccount ||
          !validTarget ||
          status.financeWriteBlocked
        }
      />
      {original && transactionStatus(original) === "pending" && (
        <>
          {pendingChanged && (
            <Notice>
              Сначала сохраните изменённые поля ожидания, затем проведите
              операцию.
            </Notice>
          )}
          <DateField
            label="Дата проведения"
            accessibilityLabel="Дата проведения операции"
            value={postDate}
            onChangeText={setPostDate}
          />
          <Button
            label="Провести операцию"
            disabled={
              pendingChanged || originalChanged || !validAccount || !validTarget
            }
            onPress={() =>
              void commit(
                () => actions.postPendingTransaction(original.id, postDate),
                "Операция проведена; резерв освобождён",
              )
            }
          />
          <Button
            label="Отменить ожидаемую операцию"
            variant="secondary"
            disabled={originalChanged}
            onPress={() =>
              void commit(
                () => actions.cancelPendingTransaction(original.id),
                "Ожидание отменено; резерв освобождён",
              )
            }
          />
        </>
      )}
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
        transactionStatus(original) === "posted" &&
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
            void commit(
              () => actions.deleteTransaction(original.id),
              "Операция удалена, баланс пересчитан",
            )
          }
        />
      )}
    </>
  );
}
