import {
  matchCategoryRule,
  templateDraft,
  type TransactionTemplate,
} from "../../../domain/automation";
import type { TransactionTemplateInput } from "../../../domain/actions/automation";
import type { TransactionInput } from "../../../domain/actions/transactions";
import { activeCategory } from "../../../domain/categories";
import {
  accountCurrency,
  baseCurrency,
  moneyInput,
  parseMoney,
  receivedAmount,
  transactionValue,
  tryConvertMoney,
} from "../../../domain/currency";
import { parseQuickEntry } from "../../../domain/finance";
import { refundedAmount } from "../../../domain/transactionAmounts";
import type { FinanceState, Transaction } from "../../../domain/types";
import { transactionStatus } from "../../../domain/transactionStatus";

export interface SplitDraft {
  key: string;
  category: string;
  amount: string;
}

export interface TransactionDraft {
  repeating: boolean;
  templateId?: string;
  manualCategory: boolean;
  type: Transaction["type"];
  title: string;
  amount: string;
  category: string;
  accountId: string;
  toAccountId: string;
  received: string | null;
  valuation: string | null;
  valuationDate?: string;
  feeEnabled?: boolean;
  feeAmount?: string;
  feeAccountId?: string;
  feeCategory?: string;
  date: string;
  status: "posted" | "pending";
  expectedDate: string;
  note: string;
  splitEnabled: boolean;
  parts: SplitDraft[];
  refundOf?: string;
  refundSource: string;
}

export function createTransactionDraft(
  state: FinanceState,
  today: string,
  original?: Omit<Transaction, "id">,
  type: Transaction["type"] = "expense",
): TransactionDraft {
  const accountId =
    original?.accountId ??
    state.accounts.find((a) => !a.archived && a.kind === "spending")?.id ??
    "";
  const currency = draftAccountCurrency(state, accountId);
  return {
    repeating: false,
    manualCategory: !!original,
    type: original?.type ?? type,
    title: original?.title ?? "",
    amount: original ? moneyInput(original.amount, currency) : "",
    category: original?.category ?? "other",
    accountId,
    toAccountId:
      original?.toAccountId ??
      state.accounts.find((a) => !a.archived && a.kind === "savings")?.id ??
      state.accounts.find((a) => !a.archived && a.id !== accountId)?.id ??
      "",
    received:
      original?.type === "transfer"
        ? moneyInput(
            receivedAmount(original),
            accountCurrency(state, original.toAccountId),
          )
        : null,
    valuation: null,
    valuationDate: original?.valuation?.date,
    date: original?.date ?? today,
    status:
      original && transactionStatus(original) === "pending"
        ? "pending"
        : "posted",
    expectedDate: original?.expectedDate ?? "",
    note: original?.note ?? "",
    splitEnabled: !!original?.splits,
    parts:
      original?.splits?.map((part, index) => ({
        key: String(index),
        category: part.category,
        amount: moneyInput(part.amount, currency),
      })) ?? [],
    refundOf: original?.refundOf,
    refundSource:
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
  };
}

/** A source selection must not leave the transfer pointing to itself. */
export function selectTransactionAccount(
  state: FinanceState,
  draft: TransactionDraft,
  accountId: string,
): TransactionDraft {
  const collision =
    draft.type === "transfer" && draft.toAccountId === accountId;
  const previousSource = state.accounts.find(
    (account) =>
      account.id === draft.accountId &&
      !account.archived &&
      account.id !== accountId,
  );
  return {
    ...draft,
    accountId,
    toAccountId: collision
      ? (previousSource?.id ??
        state.accounts.find(
          (account) => !account.archived && account.id !== accountId,
        )?.id ??
        "")
      : draft.toAccountId,
    received: null,
    valuation: null,
    valuationDate: undefined,
  };
}

export function applyQuickEntry(
  state: FinanceState,
  draft: TransactionDraft,
  input: string,
): TransactionDraft {
  const currency = accountCurrency(state, draft.accountId);
  const parsed = parseQuickEntry(input, currency);
  if (!parsed)
    throw new Error(
      "Напишите название и одну сумму: например, «кофе 320» или «продукты 1 450,50».",
    );
  return {
    ...draft,
    ...parsed,
    amount: moneyInput(parsed.amount, currency),
    category:
      parsed.type === "expense"
        ? (matchCategoryRule(state, parsed.title)?.category ??
          activeCategory(state, parsed.category))
        : "other",
    manualCategory: false,
    templateId: undefined,
    valuation: null,
    valuationDate: undefined,
    feeEnabled: false,
    received: null,
    refundOf: undefined,
    refundSource: "",
    splitEnabled: false,
    parts: [],
  };
}

export function applyTransactionTemplate(
  state: FinanceState,
  draft: TransactionDraft,
  template: TransactionTemplate,
  today: string,
): TransactionDraft {
  // An archived account may fill the editable form, but never a financial
  // action. Keep its identity visible until the user chooses another account.
  const archivedAccount = state.accounts.some(
    (account) =>
      account.archived &&
      (account.id === template.accountId ||
        account.id === template.toAccountId),
  );
  const transaction = archivedAccount
    ? {
        type: template.type,
        title: template.title,
        amount: template.amount,
        category: template.category,
        accountId: template.accountId,
        toAccountId: template.toAccountId,
        toAmount: template.toAmount,
        date: today,
        note: template.note,
        splits: template.splits?.map((part) => ({ ...part })),
      }
    : templateDraft(state, template, today);
  return {
    ...createTransactionDraft(state, today, transaction),
    repeating: draft.repeating,
    templateId: template.id,
    toAccountId: transaction.toAccountId ?? draft.toAccountId,
  };
}

export function selectRefund(
  state: FinanceState,
  draft: TransactionDraft,
  expense: Transaction,
  transactionId?: string,
): TransactionDraft {
  return {
    ...draft,
    refundOf: expense.id,
    refundSource: "",
    type: "income",
    splitEnabled: false,
    parts: [],
    templateId: undefined,
    manualCategory: true,
    accountId: expense.accountId,
    category: expense.category,
    amount: moneyInput(
      expense.amount - refundedAmount(state, expense.id, transactionId),
      accountCurrency(state, expense.accountId),
    ),
    valuation: null,
    valuationDate: undefined,
    feeEnabled: false,
    received: null,
    title: `Возврат: ${expense.title}`.slice(0, 120),
  };
}

export function repeatTransaction(
  draft: TransactionDraft,
  today: string,
): TransactionDraft {
  return {
    ...draft,
    repeating: true,
    date: today,
    status: "posted",
    expectedDate: "",
    valuation: null,
    valuationDate: undefined,
    feeEnabled: false,
    templateId: undefined,
  };
}

export function changeTransactionType(
  draft: TransactionDraft,
  type: Transaction["type"],
  original?: Pick<Transaction, "refundOf">,
): TransactionDraft {
  const lockedRefund = draft.repeating ? undefined : original?.refundOf;
  const keepRefund = type === "income" || !!lockedRefund;
  return {
    ...draft,
    type,
    refundOf: keepRefund ? (lockedRefund ?? draft.refundOf) : undefined,
    refundSource: keepRefund ? draft.refundSource : "",
  };
}

export function toggleTransactionSplits(
  draft: TransactionDraft,
): TransactionDraft {
  return {
    ...draft,
    splitEnabled: !draft.splitEnabled,
    parts:
      draft.parts.length >= 2
        ? draft.parts
        : [
            { key: "first", category: draft.category, amount: draft.amount },
            {
              key: "second",
              category: draft.category === "other" ? "groceries" : "other",
              amount: "",
            },
          ],
  };
}

export function transactionDraftAmounts(
  state: FinanceState,
  draft: TransactionDraft,
  original?: Transaction,
) {
  if (draft.repeating) original = undefined;
  const sourceCurrency = draftAccountCurrency(state, draft.accountId);
  const targetCurrency = draftAccountCurrency(state, draft.toAccountId);
  const parsedAmount = parseMoney(draft.amount, sourceCurrency);
  const receivedEstimate = tryConvertMoney(
    state,
    parsedAmount ?? 0,
    sourceCurrency,
    targetCurrency,
  );
  return {
    sourceCurrency,
    targetCurrency,
    foreignTransfer:
      draft.type === "transfer" && sourceCurrency !== targetCurrency,
    parsedAmount,
    suggestedReceived:
      receivedEstimate === null
        ? ""
        : moneyInput(receivedEstimate, targetCurrency),
    historicalValue:
      original &&
      original.accountId === draft.accountId &&
      original.amount === parsedAmount
        ? transactionValue(state, original)
        : tryConvertMoney(
            state,
            parsedAmount ?? 0,
            sourceCurrency,
            baseCurrency(state),
          ),
  };
}

function commonFields(state: FinanceState, draft: TransactionDraft) {
  if (!state.accounts.some((account) => account.id === draft.accountId))
    throw new Error("Выберите активный счёт для операции.");
  if (
    draft.type === "transfer" &&
    !state.accounts.some((account) => account.id === draft.toAccountId)
  )
    throw new Error("Выберите активный счёт зачисления.");
  const {
    sourceCurrency,
    targetCurrency,
    foreignTransfer,
    parsedAmount,
    suggestedReceived,
  } = transactionDraftAmounts(state, draft);
  if (parsedAmount === null)
    throw new Error("Введите корректную сумму в валюте счёта.");
  return {
    type: draft.type,
    title: draft.title,
    amount: parsedAmount,
    category: draft.category,
    accountId: draft.accountId,
    toAccountId: draft.type === "transfer" ? draft.toAccountId : undefined,
    toAmount: foreignTransfer
      ? (parseMoney(draft.received ?? suggestedReceived, targetCurrency) ?? NaN)
      : undefined,
    note: draft.note,
    splits:
      draft.type === "expense" && draft.splitEnabled
        ? draft.parts.map((part) => ({
            category: part.category,
            amount: parseMoney(part.amount, sourceCurrency) ?? NaN,
          }))
        : undefined,
  };
}

export function transactionInput(
  state: FinanceState,
  draft: TransactionDraft,
  original?: Transaction,
): TransactionInput {
  if (draft.repeating) original = undefined;
  const { sourceCurrency } = transactionDraftAmounts(state, draft, original);
  const baseCode = baseCurrency(state);
  const purchase = state.transactions.find(
    (entry) => entry.id === draft.refundOf,
  );
  return {
    ...commonFields(state, draft),
    id: original?.id,
    date: draft.date,
    status: draft.status,
    expectedDate:
      draft.status === "pending" ? draft.expectedDate || undefined : undefined,
    baseAmount:
      draft.type !== "transfer" &&
      sourceCurrency !== baseCode &&
      draft.valuation !== null
        ? (parseMoney(draft.valuation, baseCode) ?? NaN)
        : undefined,
    valuation:
      draft.type !== "transfer" &&
      sourceCurrency !== baseCode &&
      draft.valuation !== null
        ? { date: draft.valuationDate ?? draft.date, source: "manual" }
        : undefined,
    refundOf: draft.type === "income" ? draft.refundOf : undefined,
    refundSourceAmount:
      draft.type === "income" &&
      purchase &&
      accountCurrency(state, purchase.accountId) !== sourceCurrency
        ? (parseMoney(
            draft.refundSource,
            accountCurrency(state, purchase.accountId),
          ) ?? NaN)
        : undefined,
  };
}

/** Currency for displaying an incomplete form; final actions still require an account. */
export function draftAccountCurrency(state: FinanceState, id: string) {
  return state.accounts.some((account) => account.id === id)
    ? accountCurrency(state, id)
    : baseCurrency(state);
}

export function transactionTemplateInput(
  state: FinanceState,
  draft: TransactionDraft,
  name: string,
  id?: string,
  original?: Transaction,
): TransactionTemplateInput {
  if (draft.refundOf || original?.debtId)
    throw new Error(
      "Возврат покупки и операции долга сохраняются через связанные записи, без шаблона обычного дохода или расхода.",
    );
  return {
    ...commonFields(state, draft),
    id,
    name,
    category: draft.type === "expense" ? draft.category : "other",
    currency: accountCurrency(state, draft.accountId),
    toCurrency:
      draft.type === "transfer"
        ? accountCurrency(state, draft.toAccountId)
        : undefined,
  };
}
