import { z } from "zod";
import { CURRENCY_CODES, MAX_RATE } from "./currency";
import { validDate } from "./finance";

export const currencySchema = z.enum(CURRENCY_CODES);
const rate = z.number().int().positive().max(MAX_RATE);
const date = z.string().refine(validDate);
const exchangeRate = z
  .object({
    value: rate,
    date,
    source: z.enum(["manual", "frankfurter"]),
    automaticValue: rate.optional(),
    automaticDate: date.optional(),
  })
  .refine(
    (r) => (r.automaticValue === undefined) === (r.automaticDate === undefined),
  );
export const exchangeSchema = z
  .object({
    automatic: z.boolean(),
    rates: z.partialRecord(currencySchema, exchangeRate),
    fetchedOn: date.optional(),
  })
  .refine((e) => !e.rates.RUB);
