import { paymentFixture } from "./t05PaymentCases";
import {
  decodeBackup,
  encodeBackup,
  validateBackupValue,
} from "../../src/domain/backup";
import {
  saveRecurring,
  setPaymentSkipped,
  setRecurringActive,
} from "../../src/domain/actions/recurring";
import {
  savePlannedIncome,
  setIncomeCancelled,
  setIncomePaused,
} from "../../src/domain/actions/incomes";
import { archiveAccount } from "../../src/domain/actions/accountArchive";
import { saveTransaction } from "../../src/domain/actions/transactions";
import { incomeOccurrences } from "../../src/domain/incomes";
import { spendable } from "../../src/domain/finance";
import { forecast } from "../../src/domain/forecast";
import { reminderPlan } from "../../src/domain/reminders";
import { readPaymentNotification } from "../../src/infrastructure/notifications/notificationPlan";
import { notificationTarget } from "../../src/application/navigation/notificationTarget";

const TODAY = "2026-10-18";
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function rejects(run: () => unknown) {
  let rejected = false;
  try {
    run();
  } catch {
    rejected = true;
  }
  check(rejected, "Expected atomic rejection");
}
function transition(state = paymentFixture()) {
  return saveRecurring(
    state,
    {
      ...state.recurring[0],
      amount: 20_000,
      effectiveFrom: "2026-10-19",
      schedule: { unit: "week", interval: 1, anchor: "2026-10-19" },
    },
    TODAY,
  );
}
export const t05IntegrationCases: readonly { name: string; run(): void }[] = [
  {
    name: "materialized legacy retains known facts before its later tracking start",
    run() {
      const old = paymentFixture();
      old.version = 5;
      old.transactions = [
        {
          id: "old-pay",
          type: "expense",
          title: "Прежняя оплата",
          amount: 10000,
          date: "2026-09-05",
          category: "home",
          accountId: "card",
          recurringId: old.recurring[0].id,
          occurrenceDate: "2026-09-05",
        },
      ];
      check(
        decodeBackup(encodeBackup(old), TODAY).version === 5,
        "Old known fact should be readable",
      );
      const next = transition(old);
      check(
        decodeBackup(encodeBackup(next), TODAY).transactions[0]
          .occurrenceDate === "2026-09-05",
        "Materialization rejected prior known fact",
      );
      check(
        forecast(next, 30, TODAY)
          .days.flatMap((d) => d.events)
          .filter((e) => e.type === "payment" && e.overdue).length === 1,
        "Materialization invented older arrears",
      );
    },
  },
  {
    name: "legacy income before revised start remains readable after materialization",
    run() {
      const old = paymentFixture();
      old.version = 5;
      old.recurring = [];
      old.plannedIncomes = [
        {
          id: "salary",
          name: "Доход",
          amount: 1000,
          accountId: "card",
          date: "2026-10-10",
          repeat: "monthly",
        },
      ];
      old.transactions = [
        {
          id: "old-income",
          type: "income",
          title: "Прежний доход",
          amount: 1000,
          date: "2026-09-10",
          category: "other",
          accountId: "card",
          plannedIncomeId: "salary",
          incomeOccurrenceDate: "2026-09-10",
        },
      ];
      decodeBackup(encodeBackup(old), TODAY);
      const next = savePlannedIncome(
        old,
        { ...old.plannedIncomes[0], amount: 2000, effectiveFrom: "2026-10-19" },
        TODAY,
      );
      check(
        decodeBackup(encodeBackup(next), TODAY).transactions.length === 1,
        "Prior income disappeared",
      );
    },
  },
  {
    name: "paused income without known interval is rejected",
    run() {
      const state = paymentFixture();
      state.version = 6;
      state.plannedIncomes = [
        {
          id: "salary",
          name: "Доход",
          amount: 1000,
          accountId: "card",
          date: "2026-10-25",
          repeat: "monthly",
          paused: true,
        },
      ];
      rejects(() => validateBackupValue(state, TODAY));
    },
  },

  {
    name: "new-version pending payment is reserved exactly once",
    run() {
      let state = transition();
      const version = state.recurring[0].versions!.at(-1)!;
      state = saveTransaction(
        state,
        {
          type: "expense",
          title: "Ожидание Т05",
          amount: 20_000,
          date: TODAY,
          category: "home",
          accountId: "card",
          status: "pending",
          expectedDate: "2026-10-19",
          recurringId: state.recurring[0].id,
          recurringVersionId: version.id,
          occurrenceDate: "2026-10-19",
        },
        TODAY,
      );
      const result = spendable(state, TODAY);
      check(
        result.held === 20_000 && result.payments === 10_000,
        "Pending was subtracted as both hold and plan",
      );
      check(
        forecast(state, 30, TODAY)
          .days.flatMap((day) => day.events)
          .filter((event) => event.occurrenceDate === "2026-10-19").length ===
          1,
        "Duplicate forecast intention",
      );
      check(
        decodeBackup(encodeBackup(state), TODAY).version === 6,
        "Pending downgraded format",
      );
    },
  },
  {
    name: "notification carries version identity and rejects a voided source",
    run() {
      const state = transition();
      const version = state.recurring[0].versions!.at(-1)!;
      const item = reminderPlan(
        state,
        new Date("2026-10-18T08:00:00+04:00"),
      ).items.find((item) => item.date === "2026-10-19")!;
      check(
        item.versionId === version.id && item.id.includes(version.id),
        "Reminder lost version",
      );
      const notification = readPaymentNotification({
        source: "lad",
        profile: "personal",
        paymentId: item.paymentId,
        date: item.date,
        versionId: item.versionId,
      })!;
      const target = notificationTarget(notification, "personal", state);
      check(
        target?.sheet?.type === "payment" &&
          target.sheet.versionId === version.id,
        "Navigation lost identity",
      );
      const stopped = setRecurringActive(
        state,
        state.recurring[0].id,
        false,
        TODAY,
      );
      check(
        notificationTarget(notification, "personal", stopped)?.sheet === null,
        "Voided reminder remained actionable",
      );
    },
  },
  {
    name: "v6 preserves the previous 200-budget capacity during an upgrade",
    run() {
      const state = paymentFixture();
      state.categories = Array.from({ length: 101 }, (_, index) => ({
        ...state.categories[0],
        id: index === 0 ? "other" : `budget-${index}`,
        name: `Категория ${index}`,
        budget: 100,
      }));
      state.recurring[0].category = state.categories[0].id;
      state.budgetPlans = state.categories.map((category) => ({
        categoryId: category.id,
        period: "monthly",
        startDay: 1,
        anchor: "2026-10-01",
        rolloverSurplus: false,
        rolloverDeficit: false,
        changes: [{ from: "2000-01-01", amount: 100 }],
        overrides: [],
      }));
      check(
        decodeBackup(encodeBackup(state), TODAY).budgetPlans?.length === 101,
        "Legacy fixture rejected",
      );
      const next = transition(state);
      check(
        decodeBackup(encodeBackup(next), TODAY).budgetPlans?.length === 101,
        "Upgrade narrowed old capacity",
      );
    },
  },
  {
    name: "history cannot consist entirely of voided payment versions",
    run() {
      const state = transition();
      state.recurring[0].versions = state.recurring[0].versions!.map((v) => ({
        ...v,
        voided: true,
      }));
      rejects(() => validateBackupValue(state, TODAY));
    },
  },
  {
    name: "history cannot consist entirely of voided income versions",
    run() {
      let state = paymentFixture();
      state.plannedIncomes = [
        {
          id: "salary",
          name: "Доход",
          amount: 1000,
          accountId: "card",
          date: "2026-10-10",
          repeat: "monthly",
        },
      ];
      state = savePlannedIncome(
        state,
        {
          ...state.plannedIncomes[0],
          amount: 2000,
          effectiveFrom: "2026-10-19",
        },
        TODAY,
      );
      state.plannedIncomes![0].versions =
        state.plannedIncomes![0].versions!.map((v) => ({ ...v, voided: true }));
      rejects(() => validateBackupValue(state, TODAY));
    },
  },
  {
    name: "restoring a skipped obligation on an archived account rejects atomically",
    run() {
      let state = paymentFixture();
      state.accounts[0].openingBalance = 0;
      state = setPaymentSkipped(
        state,
        state.recurring[0].id,
        "2026-10-05",
        true,
        TODAY,
      );
      state = setRecurringActive(state, state.recurring[0].id, false, TODAY);
      state = archiveAccount(state, "card", "2026-10-19");
      const before = encodeBackup(state);
      rejects(() =>
        setPaymentSkipped(
          state,
          state.recurring[0].id,
          "2026-10-05",
          false,
          "2026-10-19",
        ),
      );
      check(encodeBackup(state) === before, "Rejected change mutated source");
    },
  },
  {
    name: "restoring a cancelled income on an archived account rejects atomically",
    run() {
      let state = paymentFixture();
      state.accounts[0].openingBalance = 0;
      state.recurring = [];
      state.plannedIncomes = [
        {
          id: "salary",
          name: "Доход",
          amount: 1000,
          accountId: "card",
          date: "2026-10-10",
          repeat: "monthly",
        },
      ];
      state = setIncomeCancelled(state, "salary", "2026-10-10", true, TODAY);
      state = setIncomePaused(state, "salary", true, TODAY);
      state = archiveAccount(state, "card", "2026-10-19");
      const before = encodeBackup(state);
      rejects(() =>
        setIncomeCancelled(state, "salary", "2026-10-10", false, "2026-10-19"),
      );
      check(encodeBackup(state) === before, "Rejected change mutated source");
    },
  },
  {
    name: "overlapping or missing version references reject without modifying input",
    run() {
      const state = transition();
      const malformed = structuredClone(state);
      malformed.recurring[0].versions![0].effectiveTo = "2026-11-01";
      const before = JSON.stringify(malformed);
      rejects(() => validateBackupValue(malformed, TODAY));
      check(JSON.stringify(malformed) === before, "Validation mutated caller");
      state.transactions = [
        {
          id: "bad",
          type: "expense",
          title: "Ссылка",
          amount: 1,
          date: TODAY,
          accountId: "card",
          category: "home",
          recurringId: state.recurring[0].id,
          recurringVersionId: "missing",
          occurrenceDate: "2026-10-19",
        },
      ];
      rejects(() => validateBackupValue(state, TODAY));
    },
  },
  {
    name: "older format cannot silently strip new terms",
    run() {
      const state = transition();
      state.version = 5;
      rejects(() => encodeBackup(state));
      rejects(() => validateBackupValue(state, TODAY));
    },
  },
  {
    name: "legacy monthly override keys remain unique and canonical",
    run() {
      const state = paymentFixture();
      state.version = 6;
      state.plannedIncomes = [
        {
          id: "salary",
          name: "Доход",
          amount: 1000,
          accountId: "card",
          date: "2026-10-10",
          repeat: "monthly",
          occurrenceOverrides: [
            {
              versionId: "legacy",
              occurrenceDate: "2026-10-10",
              expectedDate: "2026-10-20",
            },
            {
              versionId: "legacy",
              occurrenceDate: "2026-10-11",
              expectedDate: "2026-10-21",
            },
          ],
        },
      ];
      rejects(() => validateBackupValue(state, TODAY));
    },
  },
  {
    name: "current income account archive uses actual historical outstanding conditions",
    run() {
      let state = paymentFixture();
      state.accounts[0].openingBalance = 0;
      state.recurring = [];
      state.plannedIncomes = [
        {
          id: "salary",
          name: "Доход",
          amount: 1000,
          accountId: "card",
          date: "2026-10-10",
          repeat: "monthly",
        },
      ];
      state = savePlannedIncome(
        state,
        {
          ...state.plannedIncomes[0],
          accountId: "cash",
          effectiveFrom: "2026-10-19",
        },
        TODAY,
      );
      check(
        incomeOccurrences(state, "2026-10-01", "2026-11-01", TODAY)[0].plan
          .accountId === "card",
        "Old account lost",
      );
      rejects(() => archiveAccount(state, "card", TODAY));
    },
  },
];
