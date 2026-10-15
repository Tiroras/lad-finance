import { z } from "zod";
import type { Transaction } from "../../../domain/types";
import type { TransactionDraft } from "./transactionDraft";

export type StoredTransactionDraft = {
  version: 1;
  createId: string;
  draft: TransactionDraft;
  quick: string;
  templateName: string;
  savedTemplateName: string;
  original: Transaction | null;
};

const text = z.string().max(8000);
const draftSchema = z.object({
  repeating: z.boolean(),
  templateId: text.optional(),
  manualCategory: z.boolean(),
  type: z.enum(["expense", "income", "transfer"]),
  title: text,
  amount: text,
  category: text,
  accountId: text,
  toAccountId: text,
  received: text.nullable(),
  valuation: text.nullable(),
  date: text,
  status: z.enum(["posted", "pending"]),
  expectedDate: text,
  note: text,
  splitEnabled: z.boolean(),
  parts: z.array(z.object({ key: text, category: text, amount: text })).max(50),
  refundOf: text.optional(),
  refundSource: text,
});
const originalSchema = z
  .object({
    id: z.string().min(1).max(160),
    type: z.enum(["expense", "income", "transfer"]),
    title: text,
    amount: z.number().int(),
    date: text,
    category: text,
    accountId: text,
  })
  .passthrough();
const schema = z.object({
  version: z.literal(1),
  createId: z.string().min(1).max(160),
  draft: draftSchema,
  quick: text,
  templateName: text,
  savedTemplateName: text,
  original: originalSchema.nullable(),
});

export function parseStoredTransactionDraft(
  value: unknown,
): StoredTransactionDraft {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new Error(
      "Черновик операции повреждён или создан другой версией. Его поля не применены.",
    );
  return result.data as StoredTransactionDraft;
}
