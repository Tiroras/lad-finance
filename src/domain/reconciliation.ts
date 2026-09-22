import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { z } from "zod";
import { MAX_MONEY } from "./currency";
import { accountBalance } from "./accountBalances";
import { validDate } from "../shared/lib/dates";
import type { FinanceState } from "./types";

export interface BalanceAdjustment {
  id: string;
  accountId: string;
  date: string;
  amount: number;
  note: string;
}
export interface AccountReconciliation {
  id: string;
  accountId: string;
  date: string;
  balance: number;
  signature: string;
  note: string;
}
const id = z.string().min(1).max(100);
const date = z.string().refine(validDate);
const signedAmount = z.number().int().min(-MAX_MONEY).max(MAX_MONEY);
export const adjustmentSchema = z.object({
  id,
  accountId: id,
  date,
  amount: signedAmount.refine((n) => n !== 0),
  note: z.string().trim().min(1).max(500),
});
export const reconciliationSchema = z.object({
  id,
  accountId: id,
  date,
  balance: signedAmount,
  signature: z.string().regex(/^[a-f0-9]{64}$/),
  note: z.string().max(500),
});

/** A stable snapshot of monetary entries through the statement date. */
export function accountSignature(
  state: FinanceState,
  accountId: string,
  date: string,
): string {
  const account = state.accounts.find((a) => a.id === accountId);
  const transactions = state.transactions
    .filter(
      (t) =>
        t.date <= date &&
        (t.accountId === accountId || t.toAccountId === accountId),
    )
    .map((t) => [
      t.id,
      t.date,
      t.type,
      t.accountId,
      t.toAccountId ?? "",
      t.amount,
      t.toAmount ?? t.amount,
    ])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const adjustments = (state.balanceAdjustments ?? [])
    .filter((a) => a.accountId === accountId && a.date <= date)
    .map((a) => [a.id, a.date, a.amount])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return bytesToHex(
    sha256(
      utf8ToBytes(
        JSON.stringify([
          accountId,
          account?.currency ?? "RUB",
          account?.openingBalance,
          transactions,
          adjustments,
        ]),
      ),
    ),
  );
}

export function reconciliationCurrent(
  state: FinanceState,
  item: AccountReconciliation,
): boolean {
  return (
    item.signature === accountSignature(state, item.accountId, item.date) &&
    item.balance === accountBalance(state, item.accountId, item.date)
  );
}

export function validateReconciliations(state: FinanceState, today: string) {
  for (const entries of [
    state.balanceAdjustments ?? [],
    state.reconciliations ?? [],
  ]) {
    if (new Set(entries.map((e) => e.id)).size !== entries.length)
      throw new Error("Повторяющиеся записи сверки или корректировок.");
    for (const entry of entries)
      if (
        !state.accounts.some((a) => a.id === entry.accountId) ||
        entry.date > today
      )
        throw new Error(
          "Сверка ссылается на неизвестный счёт или будущую дату.",
        );
  }
  for (const item of state.reconciliations ?? [])
    if (
      item.signature === accountSignature(state, item.accountId, item.date) &&
      !reconciliationCurrent(state, item)
    )
      throw new Error(
        "Подтверждённый остаток не совпадает с состоянием сверки.",
      );
}
