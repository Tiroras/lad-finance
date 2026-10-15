import { z } from "zod";
import { CURRENCY_CODES } from "../../../domain/currency";

const input = z.string().max(200);
const schema = z.object({
  version: z.literal(1),
  step: z.number().int().min(0).max(4),
  name: input,
  accountName: input,
  currency: z.enum(CURRENCY_CODES),
  balance: input,
  savings: input,
  buffer: input,
  incomeName: input,
  incomeAmount: input,
  incomeDate: input,
  billName: input,
  billAmount: input,
  billDate: input,
});
export type OnboardingDraft = z.infer<typeof schema>;
export function parseOnboardingDraft(value: unknown): OnboardingDraft {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new Error(
      "Не удалось прочитать поля черновика настройки. Можно удалить его и начать настройку заново.",
    );
  return result.data;
}
