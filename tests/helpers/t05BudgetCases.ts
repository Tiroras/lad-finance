import {
  saveBudgetPlan,
  scheduleBudgetTransition,
  previewBudgetTransition,
  type BudgetTransitionInput,
} from "../../src/domain/actions/budgets";
import { changeBaseCurrency } from "../../src/domain/actions/currencies";
import { saveBudget } from "../../src/domain/actions/settings";
import { decodeBackup, encodeBackup } from "../../src/domain/backup";
import {
  budgetActivity,
  budgetPeriod,
  categoryBudget,
  validateBudgetPlans,
  type BudgetPlan,
} from "../../src/domain/budgets";
import { RATE_SCALE } from "../../src/domain/currency";
import { createInitialState } from "../../src/domain/seed";
import type { FinanceState } from "../../src/domain/types";

const TODAY = "2026-10-18";
const KEY = "lad-profile-personal:lad-finance-v1";
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([first], [second]) => first.localeCompare(second))
        .map(([key, child]) => [key, canonical(child)]),
    );
  return value;
}
function equal(actual: unknown, expected: unknown, message = "budget result") {
  if (JSON.stringify(canonical(actual)) !== JSON.stringify(canonical(expected)))
    throw new Error(
      `${message}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`,
    );
}
function rejects(run: () => unknown, pattern: RegExp) {
  try {
    run();
  } catch (cause) {
    if (cause instanceof Error && pattern.test(cause.message)) return;
    throw new Error(`Unexpected rejection: ${String(cause)}`);
  }
  throw new Error(`Expected rejection: ${String(pattern)}`);
}
function original(
  options: {
    surplus?: boolean;
    deficit?: boolean;
    amount?: number;
    spent?: number;
  } = {},
): FinanceState {
  const state = createInitialState(false, TODAY);
  state.settings.onboardingCompleted = true;
  state.settings.exchange = { automatic: false, rates: {} };
  state.accounts[0].openingBalance = 10_000_000;
  state.categories.find((entry) => entry.id === "groceries")!.budget =
    1_000_000;
  state.transactions = [
    {
      id: "old-expense",
      date: "2026-10-10",
      type: "expense",
      title: "Продукты за октябрь",
      accountId: "card",
      category: "groceries",
      amount: options.spent ?? 800_000,
    },
  ];
  return saveBudgetPlan(
    state,
    {
      categoryId: "groceries",
      period: "monthly",
      startDay: 1,
      anchor: "2026-10-01",
      rolloverSurplus: options.surplus ?? true,
      rolloverDeficit: options.deficit ?? false,
      date: TODAY,
      amount: options.amount ?? 1_000_000,
      onlyThisPeriod: false,
    },
    TODAY,
  );
}
function input(
  patch: Partial<BudgetTransitionInput> = {},
): BudgetTransitionInput {
  return {
    categoryId: "groceries",
    period: "weekly",
    amount: 300_000,
    rolloverSurplus: false,
    rolloverDeficit: false,
    ...patch,
  };
}
function read(state: FinanceState, date: string) {
  return categoryBudget(state, "groceries", date, date);
}
export const t05BudgetCases: readonly { name: string; run(): void }[] = [
  {
    name: "legacy carry enters first new period once, then new rules apply",
    run() {
      const state = scheduleBudgetTransition(original(), input(), TODAY);
      equal(
        [
          read(state, "2026-11-01").base,
          read(state, "2026-11-01").carried,
          read(state, "2026-11-01").budget,
        ],
        [300_000, 200_000, 500_000],
      );
      equal(
        [read(state, "2026-11-08").carried, read(state, "2026-11-08").budget],
        [0, 300_000],
      );
    },
  },
  {
    name: "old disabled surplus does not acquire new rules at transition",
    run() {
      const state = scheduleBudgetTransition(
        original({ surplus: false }),
        input({ rolloverSurplus: true }),
        TODAY,
      );
      equal(read(state, "2026-11-01").budget, 300_000);
      equal(read(state, "2026-11-08").budget, 600_000);
    },
  },
  {
    name: "old deficit crosses once even when new deficit is disabled",
    run() {
      const state = scheduleBudgetTransition(
        original({ deficit: true, spent: 1_800_000 }),
        input(),
        TODAY,
      );
      equal(
        [read(state, "2026-11-01").carried, read(state, "2026-11-01").budget],
        [-800_000, 0],
      );
      equal(read(state, "2026-11-08").budget, 300_000);
    },
  },
  {
    name: "enabled deficit preserves debt beyond zero displayed limit",
    run() {
      const state = scheduleBudgetTransition(
        original({ deficit: true, spent: 1_800_000 }),
        input({ rolloverDeficit: true }),
        TODAY,
      );
      equal(
        [read(state, "2026-11-08").carried, read(state, "2026-11-08").budget],
        [-500_000, 0],
      );
      equal(read(state, "2026-11-15").carried, -200_000);
    },
  },
  {
    name: "historical correction recomputes carry without rewriting conditions",
    run() {
      const state = scheduleBudgetTransition(original(), input(), TODAY);
      const before = JSON.stringify(state.budgetPlans);
      state.transactions[0] = { ...state.transactions[0], amount: 700_000 };
      equal(read(state, "2026-11-01").budget, 600_000);
      equal(JSON.stringify(state.budgetPlans), before);
      equal(read(state, "2026-10-10").base, 1_000_000);
    },
  },
  {
    name: "date crossing moves one expense between old and new periods",
    run() {
      const state = scheduleBudgetTransition(original(), input(), TODAY);
      state.transactions[0] = { ...state.transactions[0], date: "2026-11-01" };
      equal(
        [read(state, "2026-11-01").carried, read(state, "2026-11-01").spent],
        [1_000_000, 800_000],
      );
      equal(
        budgetActivity(state, "groceries", "2026-10-10", "2026-11-01").spent,
        0,
      );
    },
  },
  {
    name: "refund and subcategory split preserve exact old carry and new spending",
    run() {
      const base = original();
      base.categories.push({
        ...base.categories[0],
        id: "fruit",
        parentId: "groceries",
        budget: 0,
      });
      base.transactions[0] = {
        ...base.transactions[0],
        splits: [
          { category: "fruit", amount: 600_000 },
          { category: "home", amount: 200_000 },
        ],
      };
      const state = scheduleBudgetTransition(base, input(), TODAY);
      state.transactions.push({
        id: "refund",
        type: "income",
        title: "Возврат",
        date: "2026-11-02",
        accountId: "card",
        category: "other",
        amount: 400_000,
        refundOf: "old-expense",
      });
      equal(
        [read(state, "2026-11-02").carried, read(state, "2026-11-02").spent],
        [400_000, -300_000],
      );
      equal(
        budgetActivity(state, "groceries", "2026-11-02", "2026-11-02").spent,
        -300_000,
      );
    },
  },
  {
    name: "pending and cancelled expenses do not reduce budget carry",
    run() {
      const base = original();
      base.version = 5;
      base.transactions.push(
        ...(["pending", "cancelled"] as const).map((status) => ({
          ...base.transactions[0],
          id: status,
          status,
          expectedDate: "2026-10-25",
          amount: 100_000,
        })),
      );
      equal(
        read(scheduleBudgetTransition(base, input(), TODAY), "2026-11-01")
          .carried,
        200_000,
      );
    },
  },
  {
    name: "two sequential changes retain old month and week boundaries",
    run() {
      let state = scheduleBudgetTransition(original(), input(), TODAY);
      state = scheduleBudgetTransition(
        state,
        input({ period: "yearly", amount: 900_000 }),
        "2026-11-03",
      );
      equal(budgetPeriod(state.budgetPlans![0], "2026-10-31"), {
        start: "2026-10-01",
        end: "2026-11-01",
      });
      equal(budgetPeriod(state.budgetPlans![0], "2026-11-07"), {
        start: "2026-11-01",
        end: "2026-11-08",
      });
      equal(budgetPeriod(state.budgetPlans![0], "2026-11-08"), {
        start: "2026-11-08",
        end: "2027-11-08",
      });
    },
  },
  {
    name: "today on boundary schedules the following boundary",
    run() {
      const state = scheduleBudgetTransition(original(), input(), "2026-11-01");
      equal(state.budgetPlans![0].versions![0].effectiveFrom, "2026-12-01");
    },
  },
  {
    name: "monthly transition derives day from old weekly boundary",
    run() {
      const base = original();
      base.budgetPlans![0] = {
        ...base.budgetPlans![0],
        period: "weekly",
        anchor: TODAY,
        changes: [{ from: "2000-01-01", amount: 1_000_000 }],
        overrides: [],
      };
      const state = scheduleBudgetTransition(
        base,
        input({ period: "monthly" }),
        TODAY,
      );
      equal(budgetPeriod(state.budgetPlans![0], "2026-10-25"), {
        start: "2026-10-25",
        end: "2026-11-25",
      });
      equal(state.budgetPlans![0].versions![0].startDay, 25);
    },
  },
  {
    name: "short month boundary and leap annual anchor survive transition",
    run() {
      const base = original();
      base.budgetPlans![0] = {
        ...base.budgetPlans![0],
        startDay: 31,
        anchor: "2024-01-31",
        changes: [{ from: "2000-01-01", amount: 1_000_000 }],
        overrides: [],
      };
      const state = scheduleBudgetTransition(
        base,
        input({ period: "yearly" }),
        "2024-02-10",
      );
      equal(state.budgetPlans![0].versions![0].anchor, "2024-02-29");
      equal(budgetPeriod(state.budgetPlans![0], "2025-03-01"), {
        start: "2025-02-28",
        end: "2026-02-28",
      });
      equal(budgetPeriod(state.budgetPlans![0], "2024-02-28"), {
        start: "2024-01-31",
        end: "2024-02-29",
      });
    },
  },
  {
    name: "future explicit limit blocks transition without changing input",
    run() {
      const state = original();
      state.budgetPlans![0].overrides.push({ start: "2026-12-01", amount: 42 });
      const before = JSON.stringify(state);
      rejects(
        () => scheduleBudgetTransition(state, input(), TODAY),
        /2026-12-01/,
      );
      equal(JSON.stringify(state), before);
    },
  },
  {
    name: "future regular limit and existing transition cannot disappear silently",
    run() {
      const state = original();
      state.budgetPlans![0].changes.push({ from: "2026-11-01", amount: 42 });
      rejects(
        () => scheduleBudgetTransition(state, input(), TODAY),
        /В будущем/,
      );
      const planned = scheduleBudgetTransition(original(), input(), TODAY);
      rejects(
        () => scheduleBudgetTransition(planned, input(), TODAY),
        /уже запланирован/,
      );
    },
  },
  {
    name: "stale confirmation boundary is rejected",
    run() {
      rejects(
        () =>
          scheduleBudgetTransition(
            original(),
            input({ expectedStart: "2026-11-01" }),
            "2026-11-01",
          ),
        /Граница периода изменилась/,
      );
    },
  },
  {
    name: "preview is pure and matches committed first period",
    run() {
      const state = original(),
        before = JSON.stringify(state);
      const preview = previewBudgetTransition(state, input(), TODAY);
      equal(
        preview.after,
        categoryBudget(
          scheduleBudgetTransition(state, input(), TODAY),
          "groceries",
          preview.start,
          TODAY,
        ),
      );
      equal(JSON.stringify(state), before);
    },
  },
  {
    name: "period-only edit updates selected version, not legacy limits",
    run() {
      const state = scheduleBudgetTransition(original(), input(), TODAY);
      const terms = state.budgetPlans![0].versions![0];
      const edited = saveBudgetPlan(
        state,
        {
          ...terms,
          categoryId: "groceries",
          date: "2026-11-08",
          amount: 777_000,
          onlyThisPeriod: true,
        },
        TODAY,
      );
      equal(read(edited, "2026-11-08").base, 777_000);
      equal(read(edited, "2026-11-15").base, 300_000);
      equal(read(edited, "2026-10-18").base, 1_000_000);
    },
  },
  {
    name: "legacy quick budget action edits current version",
    run() {
      const state = scheduleBudgetTransition(original(), input(), TODAY);
      const edited = saveBudget(state, "groceries", 777_000, "2026-11-10");
      equal(read(edited, "2026-11-10").base, 777_000);
      equal(read(edited, "2026-10-18").base, 1_000_000);
    },
  },
  {
    name: "malformed overlap, missing boundary and duplicate IDs are rejected",
    run() {
      const good = scheduleBudgetTransition(original(), input(), TODAY);
      for (const mutate of [
        (plan: BudgetPlan) => {
          plan.versions![0].effectiveFrom = "2026-10-20";
          plan.versions![0].anchor = "2026-10-20";
        },
        (plan: BudgetPlan) => {
          plan.versions![0].id = "legacy";
        },
        (plan: BudgetPlan) => {
          plan.versions!.push({ ...plan.versions![0] });
        },
        (plan: BudgetPlan) => {
          plan.versions![0].changes[0].from = "2000-01-01";
        },
      ]) {
        const state = structuredClone(good);
        mutate(state.budgetPlans![0]);
        rejects(() => validateBudgetPlans(state), /бюджета|версии/);
      }
    },
  },
  {
    name: "format 6 roundtrip preserves all history, format 5 cannot encode it",
    run() {
      const state = scheduleBudgetTransition(original(), input(), TODAY);
      const restored = decodeBackup(encodeBackup(state), TODAY);
      equal(restored.version, 6);
      equal(restored.budgetPlans, state.budgetPlans);
      equal(
        [
          read(restored, "2026-10-18").base,
          read(restored, "2026-11-01").carried,
          read(restored, "2026-11-01").budget,
          read(restored, "2026-11-08").budget,
        ],
        [1_000_000, 200_000, 500_000, 300_000],
        "Restored old conditions and first/subsequent new periods",
      );
      equal(
        encodeBackup(decodeBackup(encodeBackup(restored), TODAY)),
        encodeBackup(restored),
        "Stable normalized serialized roundtrip",
      );
      rejects(() => encodeBackup({ ...state, version: 5 }), /версии 6|формат/);
    },
  },
  {
    name: "base currency conversion converts every conditions version",
    run() {
      const state = scheduleBudgetTransition(original(), input(), TODAY);
      state.settings.exchange = {
        automatic: false,
        rates: {
          USD: { value: 100 * RATE_SCALE, date: TODAY, source: "manual" },
        },
      };
      const next = changeBaseCurrency(state, "USD", TODAY);
      equal(
        [
          next.version,
          next.budgetPlans![0].changes.at(-1)!.amount,
          next.budgetPlans![0].versions![0].changes[0].amount,
        ],
        [6, 10_000, 3_000],
      );
    },
  },
  {
    name: "unsupported end of calendar and unsafe compounded budget are rejected",
    run() {
      const state = original();
      rejects(
        () => scheduleBudgetTransition(state, input(), "2100-12-15"),
        /2100/,
      );
      const overflow = scheduleBudgetTransition(
        state,
        input({ rolloverSurplus: true }),
        TODAY,
      );
      overflow.budgetPlans![0].versions![0].changes[0].amount = 1_000_000_000_000_000;
      rejects(
        () => validateBudgetPlans(overflow),
        /Некорректный|слишком велики/,
      );
    },
  },
];

export function installBudgetFixture(conflict = false) {
  if (sessionStorage.getItem("t05-budget-installed")) return;
  const state = original();
  if (conflict)
    state.budgetPlans![0].overrides.push({
      start: "2026-12-01",
      amount: 900_000,
    });
  localStorage.setItem(KEY, encodeBackup(state));
  localStorage.setItem("lad-active-profile-v1", "personal");
  localStorage.setItem(
    "lad-profiles-v1",
    JSON.stringify({
      version: 1,
      profiles: [{ id: "personal", name: "Личный" }],
    }),
  );
  sessionStorage.setItem("t05-budget-installed", "true");
}
export function readBudgetFixture() {
  return decodeBackup(localStorage.getItem(KEY)!, TODAY);
}
