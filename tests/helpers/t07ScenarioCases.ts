import { copyScenario, saveScenario } from "../../src/domain/actions/scenarios";
import {
  decodeBackup,
  encodeBackup,
  assertBackupSize,
} from "../../src/domain/backup";
import { MAX_MONEY } from "../../src/domain/currency";
import {
  capacityMessage,
  dataCapacity,
  nearCapacity,
} from "../../src/domain/dataLimits";
import { forecast } from "../../src/domain/forecast";
import {
  scenarioSchema,
  scenarioSchemaV8,
  scenarioWarnings,
} from "../../src/domain/scenarios";
import { createInitialState } from "../../src/domain/seed";
import type { FinanceState, SavedScenario } from "../../src/domain/types";
import { paymentCapacityCount } from "../../src/domain/payments";
import { shiftDate } from "../../src/shared/lib/dates";
import assert from "./browserDomainAssert";

const TODAY = "2026-10-20";
const KEY = "lad-profile-personal:lad-finance-v1";
function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function equal(actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected);
}
function rejects(run: () => unknown, pattern?: RegExp) {
  try {
    run();
  } catch (error) {
    if (!pattern || (error instanceof Error && pattern.test(error.message)))
      return;
    throw error;
  }
  throw new Error(`Expected rejection ${pattern}`);
}
export function scenarioFixture(): FinanceState {
  const state = createInitialState(false, TODAY);
  state.settings.onboardingCompleted = true;
  state.settings.exchange = { automatic: false, rates: {} };
  state.settings.forecast = { dailySpending: 0, goalDay: 31 };
  state.settings.buffer = 0;
  state.accounts.find((account) => account.id === "card")!.openingBalance =
    1_000_000;
  state.plannedIncomes = [
    {
      id: "salary",
      name: "Зарплата",
      accountId: "card",
      amount: 100_000,
      repeat: "monthly",
      date: "2026-10-25",
    },
  ];
  state.scenarios = [scenario()];
  return state;
}
function scenario(): SavedScenario {
  return {
    id: "original",
    name: "Первый вариант",
    horizon: 30,
    changes: [
      {
        source: "income",
        sourceId: "salary",
        name: "Зарплата",
        amount: 200_000,
        delayDays: 0,
      },
    ],
    events: [
      {
        id: "purchase",
        name: "Покупка",
        amount: 50_000,
        type: "expense",
        date: "2026-10-26",
      },
    ],
  };
}
function projection(state: FinanceState, value?: SavedScenario) {
  const result = forecast(state, 30, TODAY, undefined, value);
  return {
    closing: result.closingAvailable,
    income: result.income,
    outflow: result.outflow,
  };
}
export const t07ScenarioCases: { name: string; run(): void }[] = [
  {
    name: "copy owns new scenario and event ids while real plan links remain",
    run() {
      const state = scenarioFixture(),
        before = JSON.stringify(state);
      const next = copyScenario(state, "original"),
        copy = next.scenarios![1];
      check(
        copy.id !== "original" && copy.events[0].id !== "purchase",
        "Copy identities reused",
      );
      equal(copy.changes[0].sourceId, "salary");
      check(
        copy.changes[0] !== state.scenarios![0].changes[0] &&
          copy.events[0] !== state.scenarios![0].events[0],
        "Copy rows alias original",
      );
      equal(JSON.stringify(state), before);
      equal(next.accounts, state.accounts);
      equal(next.transactions, state.transactions);
      equal(next.plannedIncomes, state.plannedIncomes);
      equal(next.version, 8);
      equal(projection(next, copy), projection(state, state.scenarios![0]));
    },
  },
  {
    name: "editing copied assumptions keeps original and financial facts unchanged",
    run() {
      const state = copyScenario(scenarioFixture(), "original");
      const source = JSON.stringify(state.scenarios![0]);
      const copy = state.scenarios![1];
      const next = saveScenario(state, {
        ...copy,
        changes: copy.changes.map((row) => ({ ...row, enabled: false })),
        events: copy.events.map((row) => ({ ...row, enabled: false })),
      });
      equal(JSON.stringify(next.scenarios![0]), source);
      equal(projection(next, next.scenarios![1]), projection(next));
      equal(next.transactions, state.transactions);
      equal(next.accounts, state.accounts);
    },
  },
  {
    name: "legacy missing enabled and explicit true produce the same aggregate",
    run() {
      const state = scenarioFixture(),
        source = state.scenarios![0];
      const explicit = {
        ...source,
        changes: source.changes.map((row) => ({ ...row, enabled: true })),
        events: source.events.map((row) => ({ ...row, enabled: true })),
      };
      equal(projection(state, source), projection(state, explicit));
      equal(projection(state, source), {
        closing: 1_150_000,
        income: 200_000,
        outflow: 50_000,
      });
    },
  },
  {
    name: "switching one expense off only removes its effect",
    run() {
      const state = scenarioFixture(),
        source = state.scenarios![0];
      const off = {
        ...source,
        events: source.events.map((row) => ({ ...row, enabled: false })),
      };
      equal(
        projection(state, off).closing - projection(state, source).closing,
        50_000,
      );
      equal(projection(state, off).income, 200_000);
    },
  },
  {
    name: "switching a plan change off uses real plan amount and date",
    run() {
      const state = scenarioFixture(),
        source = state.scenarios![0];
      const off = {
        ...source,
        changes: source.changes.map((row) => ({
          ...row,
          enabled: false,
          delayDays: 90,
        })),
      };
      equal(projection(state, off), {
        closing: 1_050_000,
        income: 100_000,
        outflow: 50_000,
      });
    },
  },
  {
    name: "v8 roundtrip retains disabled rows and account selection",
    run() {
      const state = scenarioFixture(),
        source = state.scenarios![0];
      const next = saveScenario(state, {
        ...source,
        changes: source.changes.map((row) => ({ ...row, enabled: false })),
        events: source.events.map((row) => ({
          ...row,
          enabled: false,
          accountId: "card",
        })),
      });
      const restored = decodeBackup(encodeBackup(next), TODAY);
      equal(restored.scenarios, next.scenarios);
      equal(projection(restored, restored.scenarios![0]), projection(next));
    },
  },
  {
    name: "old backup normalizes no enabled or account fields and preserves aggregate",
    run() {
      const state = scenarioFixture();
      const restored = decodeBackup(encodeBackup(state), TODAY);
      check(
        !("enabled" in restored.scenarios![0].changes[0]),
        "Old change default injected",
      );
      check(
        !("enabled" in restored.scenarios![0].events[0]),
        "Old event default injected",
      );
      equal(
        projection(restored, restored.scenarios![0]),
        projection(state, state.scenarios![0]),
      );
    },
  },
  {
    name: "legacy schema remains isolated and v8 reads switches",
    run() {
      const value = {
        ...scenario(),
        events: [
          { ...scenario().events[0], enabled: false, accountId: "card" },
        ],
      };
      equal(scenarioSchema.parse(value).events, scenario().events);
      equal(scenarioSchemaV8.parse(value).events[0].enabled, false);
      equal(scenarioSchemaV8.parse(value).events[0].accountId, "card");
    },
  },
  {
    name: "old financial versions reject new switches instead of silently losing them",
    run() {
      for (const version of [4, 5, 6, 7] as const) {
        const state = scenarioFixture();
        state.version = version;
        state.scenarios![0].events[0].enabled = false;
        rejects(() => decodeBackup(encodeBackup(state), TODAY));
      }
    },
  },
  {
    name: "unknown or non-spending event accounts reject atomically",
    run() {
      const state = scenarioFixture(),
        before = JSON.stringify(state);
      for (const accountId of ["missing", "savings"]) {
        rejects(
          () =>
            saveScenario(state, {
              ...scenario(),
              events: [{ ...scenario().events[0], accountId }],
            }),
          /повседневный счёт/,
        );
      }
      equal(JSON.stringify(state), before);
    },
  },
  {
    name: "disabled outdated and removed assumptions do not generate active warnings",
    run() {
      const state = scenarioFixture();
      const value = scenario();
      value.changes[0] = {
        ...value.changes[0],
        sourceId: "missing",
        enabled: false,
      };
      value.events[0] = {
        ...value.events[0],
        date: "2020-01-01",
        enabled: false,
      };
      equal(scenarioWarnings(state, value, TODAY), []);
    },
  },
  {
    name: "20th scenario copy succeeds and 21st fails without mutating",
    run() {
      const state = scenarioFixture();
      state.scenarios = Array.from({ length: 19 }, (_, i) => ({
        ...scenario(),
        id: `s${i}`,
      }));
      const next = copyScenario(state, "s0");
      equal(next.scenarios?.length, 20);
      const before = JSON.stringify(next);
      rejects(() => copyScenario(next, "s0"), /20 сценариев.*Удалите/);
      equal(JSON.stringify(next), before);
    },
  },
  {
    name: "copied long names remain within 120 characters",
    run() {
      const state = scenarioFixture();
      state.scenarios![0].name = "я".repeat(120);
      const copy = copyScenario(state, "original").scenarios![1];
      equal(copy.name.length, 120);
      check(scenarioSchemaV8.safeParse(copy).success, "Copy name invalid");
    },
  },
  {
    name: "deleted source cannot be copied",
    run() {
      rejects(() => copyScenario(scenarioFixture(), "deleted"), /уже удалён/);
    },
  },
  {
    name: "500 disabled changes still occupy the full limit",
    run() {
      const state = scenarioFixture();
      const changes = Array.from({ length: 500 }, (_, i) => ({
        ...scenario().changes[0],
        sourceId: `missing${i}`,
        enabled: false,
      }));
      equal(
        saveScenario(state, { ...scenario(), changes }).scenarios![0].changes
          .length,
        500,
      );
      rejects(
        () =>
          saveScenario(state, {
            ...scenario(),
            changes: [...changes, { ...changes[0], sourceId: "extra" }],
          }),
        /500 изменений.*выключенные/,
      );
    },
  },
  {
    name: "100 disabled events fit and 101 fails with actionable message",
    run() {
      const state = scenarioFixture();
      const events = Array.from({ length: 100 }, (_, i) => ({
        ...scenario().events[0],
        id: `e${i}`,
        enabled: false,
      }));
      equal(
        saveScenario(state, { ...scenario(), events }).scenarios![0].events
          .length,
        100,
      );
      rejects(
        () =>
          saveScenario(state, {
            ...scenario(),
            events: [...events, { ...events[0], id: "extra" }],
          }),
        /100 разовых.*выключенные/,
      );
    },
  },
  {
    name: "warning thresholds begin exactly at 80 percent",
    run() {
      for (const limit of [20, 100, 500, 20_000, 5_000_000]) {
        equal(nearCapacity(limit * 0.8 - 1, limit), false);
        equal(nearCapacity(limit * 0.8, limit), true);
        equal(nearCapacity(limit, limit), true);
      }
    },
  },
  {
    name: "record capacity includes pending and cancelled history",
    run() {
      const state = scenarioFixture();
      state.transactions = Array.from({ length: 16_000 }, (_, i) => ({
        id: `t${i}`,
        type: "expense",
        title: "Тест",
        amount: 1,
        date: TODAY,
        accountId: "card",
        category: "other",
        status: i % 2 ? "pending" : "cancelled",
      }));
      const usage = dataCapacity(state).find(
        (row) => row.key === "transactions",
      )!;
      equal(usage.used, 16_000);
      equal(usage.limit, 20_000);
      check(nearCapacity(usage.used, usage.limit), "80% warning absent");
      check(
        /Приближение.*16\s000.*20\s000.*профиле/.test(capacityMessage(usage)),
        "Message lacks recovery",
      );
    },
  },
  {
    name: "UTF8 usage includes multi-byte Cyrillic and emoji rather than character count",
    run() {
      const state = scenarioFixture();
      const before = dataCapacity(state).find(
        (row) => row.key === "utf8",
      )!.used;
      state.settings.name = "я😀";
      equal(
        dataCapacity(state).find((row) => row.key === "utf8")!.used - before,
        6,
      );
      equal(assertBackupSize("я".repeat(2_500_000)), 5_000_000);
      rejects(() => assertBackupSize("я".repeat(2_500_000) + "x"), /5 МБ/);
    },
  },
  {
    name: "unsafe and over-limit sums reject without changing source",
    run() {
      const state = scenarioFixture(),
        before = JSON.stringify(state);
      for (const amount of [
        MAX_MONEY + 1,
        Number.MAX_SAFE_INTEGER + 1,
        Infinity,
        NaN,
      ]) {
        rejects(
          () =>
            saveScenario(state, {
              ...scenario(),
              events: [{ ...scenario().events[0], amount }],
            }),
          /сумм/i,
        );
      }
      equal(JSON.stringify(state), before);
    },
  },
  {
    name: "calendar allows 19999 and 20000 events and rejects 20001",
    run() {
      const today = "2055-01-01";
      for (const count of [19_999, 20_000, 20_001]) {
        const state = scenarioFixture();
        const start = shiftDate(today, 365 - count);
        state.recurring = [
          {
            id: "daily",
            name: "Ежедневный",
            amount: 1,
            day: Number(start.slice(-2)),
            active: true,
            kind: "bill",
            category: "home",
            accountId: "card",
            icon: "home-outline",
            color: "#254D3E",
            startsOn: start,
            schedule: { unit: "day", interval: 1, anchor: start },
          },
        ];
        if (count <= 20_000) equal(paymentCapacityCount(state, today), count);
        else
          rejects(() => paymentCapacityCount(state, today), /20 000.*интервал/);
      }
    },
  },
  {
    name: "date beyond year2100 gives correction instruction",
    run() {
      rejects(
        () =>
          saveScenario(scenarioFixture(), {
            ...scenario(),
            events: [{ ...scenario().events[0], date: "2101-01-01" }],
          }),
        /31.12.2100/,
      );
    },
  },
];

export function installScenarioFixture(kind = "base") {
  if (localStorage.getItem(KEY)) return;
  const state = scenarioFixture();
  if (kind === "capacity")
    state.scenarios = Array.from({ length: 16 }, (_, i) => ({
      ...scenario(),
      id: `s${i}`,
      name: `Вариант ${i + 1}`,
    }));
  if (kind === "events")
    state.scenarios![0].events = Array.from({ length: 80 }, (_, i) => ({
      ...scenario().events[0],
      id: `e${i}`,
      name: `Событие ${i + 1}`,
      enabled: false,
    }));
  if (kind === "events") state.version = 8;
  localStorage.setItem(KEY, JSON.stringify(state));
  localStorage.setItem("lad-active-profile-v1", "personal");
}
export function readScenarioFixture(): FinanceState {
  return JSON.parse(localStorage.getItem(KEY)!);
}
