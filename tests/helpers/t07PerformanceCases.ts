import {
  decodeBackup,
  encodeBackup,
  assertBackupSize,
} from "../../src/domain/backup";
import { forecast } from "../../src/domain/forecast";
import { accountCurrency, toBase } from "../../src/domain/currency";
import {
  FIXTURE_TODAY,
  FIXTURE_SEED,
  createPerformanceFixture,
} from "../performance/fixtures";
import { verifyPerformanceFixture } from "../performance/oracle";

function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function equal(actual: unknown, expected: unknown, label: string) {
  check(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${label}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`,
  );
}
function bytes(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

export function runPerformanceCase(count: 1000 | 5000 | 20000) {
  const fixture = createPerformanceFixture(count);
  // Existing independent algebra + brute-force calendar reference, before new assignments.
  const reference = verifyPerformanceFixture(fixture);
  const state = {
    ...fixture.state,
    version: 8 as const,
    settings: {
      ...fixture.state.settings,
      forecast: {
        ...fixture.state.settings.forecast!,
        dailyAccountId: "r",
        goalAccounts: [{ goalId: "g", fromAccountId: "r", toAccountId: "s" }],
        repaymentAccounts: [
          { kind: "debt" as const, sourceId: "d", accountId: "r" },
        ],
        transfers: [
          {
            id: "fx-projection",
            name: "Тестовый будущий обмен",
            date: "2026-10-15",
            accountId: "u",
            toAccountId: "r",
            amount: 100,
            toAmount: 9_000,
          },
        ],
      },
    },
  };
  const content = encodeBackup(state);
  const samples: {
    forecastMs: number;
    decodeMs: number;
    usedJsHeapBytes?: number;
  }[] = [];
  for (let run = 0; run < 3; run++) {
    const started = performance.now();
    const restored = decodeBackup(content, FIXTURE_TODAY);
    const decodedAt = performance.now();
    const result = forecast(restored, 90, FIXTURE_TODAY);
    const completedAt = performance.now();
    equal(result.openingBalance, reference.opening, "opening");
    equal(result.closingBalance, reference.closing, "closing");
    equal(result.income, reference.income, "income");
    equal(result.outflow, reference.outflow, "outflow");
    equal(
      result.days.map(({ date, balance }) => ({ date, balance })),
      reference.days,
      "daily aggregate oracle",
    );
    equal(result.unallocatedEvents.length, 0, "every event assigned");
    for (const day of result.days) {
      const own = result.accounts
        .filter((account) => account.kind === "spending")
        .reduce((sum, account) => {
          const actual = account.days.find((entry) => entry.date === day.date)!;
          return (
            sum +
            toBase(
              restored,
              actual.balance,
              accountCurrency(restored, account.accountId),
            )
          );
        }, 0);
      equal(own, day.balance, `account sum ${day.date}`);
      check(Number.isSafeInteger(day.balance), "Unsafe aggregate integer");
    }
    const memory = (
      performance as Performance & { memory?: { usedJSHeapSize: number } }
    ).memory;
    samples.push({
      forecastMs: completedAt - decodedAt,
      decodeMs: decodedAt - started,
      ...(memory ? { usedJsHeapBytes: memory.usedJSHeapSize } : {}),
    });
  }
  return {
    count,
    seed: FIXTURE_SEED,
    today: FIXTURE_TODAY,
    horizon: 90,
    serializedUtf8Bytes: bytes(state),
    samples,
    oracle: {
      days: reference.days.length,
      opening: reference.opening,
      closing: reference.closing,
      income: reference.income,
      outflow: reference.outflow,
    },
    note: "Три последовательных браузерных измерения; порог производительности не задан. Не подтверждает время, память или холодный запуск на iOS/Android.",
  };
}

/** Exact UTF-8 boundary built using TextEncoder, without Node Buffer. */
export function runUtf8BoundaryCase() {
  const state = createPerformanceFixture(20_000).state;
  let remaining = 5_000_000 - bytes(state);
  for (const transaction of state.transactions) {
    if (remaining <= 10) break;
    const payload = Math.min(1000, remaining - 10);
    transaction.note =
      "Я".repeat(Math.floor(payload / 2)) + "x".repeat(payload % 2);
    remaining -= payload + 10;
  }
  equal(remaining, 0, "boundary constructed");
  const content = encodeBackup(state);
  equal(assertBackupSize(content), 5_000_000, "exact UTF8 max");
  equal(
    decodeBackup(content, FIXTURE_TODAY).transactions.length,
    20_000,
    "all records readable",
  );
  let rejected = false;
  try {
    assertBackupSize(content + " ");
  } catch (error) {
    rejected = error instanceof Error && /5 МБ/.test(error.message);
  }
  check(rejected, "5,000,001 UTF8 bytes accepted");
  // Remove one ASCII payload byte, keeping a valid full JSON document.
  const lastNote = [...state.transactions]
    .reverse()
    .find((entry) => entry.note?.endsWith("x"));
  if (lastNote) lastNote.note = lastNote.note!.slice(0, -1);
  else {
    const note = state.transactions.find((entry) => entry.note!.length > 0)!;
    note.note = "x" + note.note!.slice(1);
  }
  const below = encodeBackup(state);
  equal(assertBackupSize(below), 4_999_999, "one byte below max");
  return {
    acceptedUtf8Bytes: [4_999_999, 5_000_000],
    rejectedUtf8Bytes: 5_000_001,
    records: 20_000,
  };
}
