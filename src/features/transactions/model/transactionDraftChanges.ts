import {
  accountCurrency,
  baseCurrency,
  moneyInput,
  parseMoney,
  type CurrencyCode,
} from "../../../domain/currency";
import type { FinanceState, Transaction } from "../../../domain/types";
import {
  transactionDraftAmounts,
  type TransactionDraft,
} from "./transactionDraft";

const amountValue = (input: string, currency: CurrencyCode) =>
  parseMoney(input, currency) ??
  input.trim().replace(/\s/g, "").replace(",", ".");

/** Compare edited values, not display formatting, picker state or split row keys. */
export function transactionDraftSnapshot(
  state: FinanceState,
  draft: TransactionDraft,
  original?: Transaction,
) {
  const {
    sourceCurrency,
    targetCurrency,
    foreignTransfer,
    suggestedReceived,
    historicalValue,
  } = transactionDraftAmounts(state, draft, original);
  const base = baseCurrency(state);
  const purchase = state.transactions.find(
    (entry) => entry.id === draft.refundOf,
  );
  return JSON.stringify({
    repeating: draft.repeating,
    type: draft.type,
    title: draft.title.trim(),
    amount: amountValue(draft.amount, sourceCurrency),
    category: draft.category,
    accountId: draft.accountId,
    date: draft.date,
    note: draft.note.trim(),
    toAccountId: draft.type === "transfer" ? draft.toAccountId : undefined,
    received: foreignTransfer
      ? amountValue(draft.received ?? suggestedReceived, targetCurrency)
      : undefined,
    valuation:
      draft.type !== "transfer" && sourceCurrency !== base
        ? amountValue(
            draft.valuation ??
              (historicalValue === null
                ? ""
                : moneyInput(historicalValue, base)),
            base,
          )
        : undefined,
    splits:
      draft.type === "expense" && draft.splitEnabled
        ? draft.parts.map((part) => ({
            category: part.category,
            amount: amountValue(part.amount, sourceCurrency),
          }))
        : undefined,
    refundOf: draft.type === "income" ? draft.refundOf : undefined,
    refundSource:
      draft.type === "income" &&
      purchase &&
      accountCurrency(state, purchase.accountId) !== sourceCurrency
        ? amountValue(
            draft.refundSource,
            accountCurrency(state, purchase.accountId),
          )
        : undefined,
  });
}
