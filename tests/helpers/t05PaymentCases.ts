import { createInitialState } from "../../src/domain/seed";
import { accountBalance } from "../../src/domain/accountBalances";
import { decodeBackup, encodeBackup } from "../../src/domain/backup";
import { forecast } from "../../src/domain/forecast";
import { reminderPlan } from "../../src/domain/reminders";
import {
  paymentOccurrenceKey,
  paymentPending,
  resolvePaymentOccurrence,
  upcoming,
  overduePayments,
} from "../../src/domain/payments";
import {
  saveRecurring,
  setRecurringActive,
  payRecurring,
  setPaymentSkipped,
  paymentTransitionPreview,
  type RecurringInput,
} from "../../src/domain/actions/recurring";
import {
  cancelPendingTransaction,
  saveTransaction,
} from "../../src/domain/actions/transactions";
import type { FinanceState, Recurring } from "../../src/domain/types";

const TODAY = "2026-10-18";
function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function equal(actual: unknown, expected: unknown, message: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(
      `${message}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`,
    );
}
function rejects(run: () => unknown, message: string) {
  let error: unknown;
  try {
    run();
  } catch (value) {
    error = value;
  }
  check(error instanceof Error, message);
}
export function paymentFixture(today = TODAY): FinanceState {
  const state = createInitialState(false, today);
  state.accounts[0].openingBalance = 2_000_000;
  state.settings.onboardingCompleted = true;
  state.settings.exchange = { automatic: false, rates: {} };
  state.settings.buffer = 0;
  state.settings.reminders = { enabled: true, daysBefore: 1, hour: 9 };
  state.recurring = [
    {
      id: "history-payment",
      name: "История интернета",
      amount: 10_000,
      day: 5,
      kind: "bill",
      active: true,
      icon: "home-outline",
      color: "#EAF0E8",
      category: "home",
      accountId: "card",
      startsOn: "2026-10-01",
    },
  ];
  return state;
}
function input(
  payment: Recurring,
  changes: Partial<RecurringInput> = {},
): RecurringInput {
  return {
    id: payment.id,
    name: payment.name,
    amount: payment.amount,
    day: payment.day,
    category: payment.category,
    accountId: payment.accountId,
    startsOn: payment.startsOn,
    schedule: payment.schedule,
    ...changes,
  };
}
export const t05PaymentCases: readonly { name: string; run(): void }[] = [
  {
    name: "future weekly terms retain monthly arrears and historical account/category",
    run() {
      const state = paymentFixture();
      const before = encodeBackup(state);
      const next = saveRecurring(
        state,
        input(state.recurring[0], {
          amount: 20_000,
          accountId: "cash",
          category: "other",
          effectiveFrom: "2026-10-19",
          schedule: { unit: "week", interval: 1, anchor: "2026-10-19" },
        }),
        TODAY,
      );
      equal(encodeBackup(state), before, "Transition mutated original");
      equal(next.version, 6, "New format was not selected");
      const old = overduePayments(next, TODAY)[0];
      equal(
        [
          old.date,
          old.payment.amount,
          old.payment.accountId,
          old.payment.category,
          old.versionId,
        ],
        ["2026-10-05", 10_000, "card", "home", "legacy"],
        "Historical terms lost",
      );
      const dates = upcoming(next, "2026-10-19", "2026-11-03");
      equal(
        dates.map((item) => item.date),
        ["2026-10-19", "2026-10-26", "2026-11-02"],
        "Boundary generated duplicate",
      );
      check(
        dates.every(
          (item) =>
            item.payment.amount === 20_000 && item.payment.accountId === "cash",
        ),
        "Future terms incorrect",
      );
      check(dates[0].versionId !== "legacy", "Version identity absent");
      const restored = decodeBackup(encodeBackup(next), TODAY);
      equal(
        upcoming(restored, "2026-10-19", "2026-11-03").map((item) => item.date),
        dates.map((item) => item.date),
        "Round-trip changed calendar",
      );
      const paid = payRecurring(
        next,
        next.recurring[0].id,
        "2026-10-05",
        TODAY,
      );
      equal(
        [
          paid.transactions[0].amount,
          paid.transactions[0].accountId,
          paid.transactions[0].category,
        ],
        [10_000, "card", "home"],
        "Old payment used new terms",
      );
    },
  },
  {
    name: "future paid skipped and pending obligations reject transition atomically",
    run() {
      for (const kind of ["posted", "pending", "skipped"] as const) {
        let state = paymentFixture();
        state.recurring[0].day = 25;
        if (kind === "skipped")
          state = setPaymentSkipped(
            state,
            "history-payment",
            "2026-10-25",
            true,
            TODAY,
          );
        else
          state = saveTransaction(
            state,
            {
              type: "expense",
              title: "Ранний факт",
              amount: 10_000,
              accountId: "card",
              category: "home",
              date: TODAY,
              status: kind,
              expectedDate: kind === "pending" ? "2026-10-25" : undefined,
              recurringId: "history-payment",
              occurrenceDate: "2026-10-25",
            },
            TODAY,
          );
        const before = encodeBackup(state);
        const preview = paymentTransitionPreview(
          state,
          "history-payment",
          "2026-10-19",
          TODAY,
        );
        equal(preview.suggestedFrom, "2026-10-26", "Wrong conflict boundary");
        rejects(
          () =>
            saveRecurring(
              state,
              input(state.recurring[0], { amount: 30_000 }),
              TODAY,
            ),
          `Accepted ${kind} conflict`,
        );
        equal(
          encodeBackup(state),
          before,
          "Rejected transition changed source",
        );
        saveRecurring(
          state,
          input(state.recurring[0], {
            amount: 30_000,
            effectiveFrom: "2026-10-26",
          }),
          TODAY,
        );
      }
    },
  },
  {
    name: "stop preserves today and arrears, resume leaves gap empty",
    run() {
      const state = paymentFixture();
      state.recurring[0].schedule = {
        unit: "day",
        interval: 1,
        anchor: "2026-10-17",
      };
      state.recurring[0].startsOn = "2026-10-17";
      const stopped = setRecurringActive(
        state,
        "history-payment",
        false,
        TODAY,
      );
      equal(
        upcoming(stopped, TODAY, "2026-10-24").map((item) => item.date),
        [TODAY],
        "Stop removed today or retained future",
      );
      equal(
        overduePayments(stopped, "2026-10-22").map((item) => item.date),
        ["2026-10-17", TODAY],
        "Stop erased obligations",
      );
      const resumed = setRecurringActive(
        stopped,
        "history-payment",
        true,
        "2026-10-22",
      );
      equal(
        upcoming(resumed, "2026-10-19", "2026-10-24").map((item) => item.date),
        ["2026-10-22", "2026-10-23"],
        "Pause gap was backfilled",
      );
      check(
        !resolvePaymentOccurrence(resumed.recurring[0], "2026-10-20", "legacy"),
        "Closed interval accepted gap date",
      );
      const paid = payRecurring(
        resumed,
        "history-payment",
        "2026-10-17",
        "2026-10-22",
      );
      equal(
        paid.transactions[0].occurrenceDate,
        "2026-10-17",
        "Historical obligation could not be paid",
      );
    },
  },
  {
    name: "same-day stop and resume do not overlap or duplicate",
    run() {
      const state = paymentFixture();
      state.recurring[0].day = 18;
      const resumed = setRecurringActive(
        setRecurringActive(state, "history-payment", false, TODAY),
        "history-payment",
        true,
        TODAY,
      );
      equal(
        resumed.recurring[0].versions?.length,
        1,
        "Same-day resume appended overlapping version",
      );
      equal(
        upcoming(resumed, TODAY, "2026-11-19").map((item) => item.date),
        [TODAY, "2026-11-18"],
        "Same-day resume duplicated occurrence",
      );
      decodeBackup(encodeBackup(resumed), TODAY);
    },
  },
  {
    name: "legacy disabled plan keeps known facts without inventing unpaid history",
    run() {
      const state = paymentFixture();
      state.recurring[0].startsOn = "2026-01-01";
      state.recurring[0].active = false;
      state.transactions = [
        {
          id: "legacy-paid",
          type: "expense",
          title: "Известная оплата",
          amount: 10_000,
          baseAmount: 10_000,
          date: "2026-10-05",
          accountId: "card",
          category: "home",
          recurringId: "history-payment",
          occurrenceDate: "2026-10-05",
        },
      ];
      equal(
        overduePayments(state, TODAY).length,
        0,
        "Legacy disabled plan revived",
      );
      const resumed = setRecurringActive(state, "history-payment", true, TODAY);
      equal(
        overduePayments(resumed, TODAY).length,
        0,
        "Resume invented unknown history",
      );
      equal(resumed.transactions, state.transactions, "Resume rewrote facts");
      equal(
        upcoming(resumed, TODAY, "2026-11-10").map((item) => item.date),
        ["2026-11-05"],
        "Resume future incorrect",
      );
      decodeBackup(encodeBackup(resumed), TODAY);
    },
  },
  {
    name: "previous-month split expense binds without additional money movement",
    run() {
      let state = paymentFixture();
      state = saveTransaction(
        state,
        {
          type: "expense",
          title: "Ранняя оплата",
          amount: 10_000,
          date: "2026-09-30",
          accountId: "card",
          category: "home",
          splits: [
            { category: "home", amount: 7000 },
            { category: "other", amount: 3000 },
          ],
        },
        TODAY,
      );
      const before = accountBalance(state, "card", TODAY);
      const original = state.transactions[0];
      const linked = payRecurring(
        state,
        "history-payment",
        "2026-10-05",
        TODAY,
        original.id,
      );
      equal(
        linked.transactions.length,
        1,
        "Binding appended second transaction",
      );
      equal(
        accountBalance(linked, "card", TODAY),
        before,
        "Binding changed balance",
      );
      equal(
        linked.transactions[0].date,
        "2026-09-30",
        "Binding changed fact date",
      );
      equal(
        linked.transactions[0].splits,
        original.splits,
        "Binding lost split",
      );
      equal(
        overduePayments(linked, TODAY).length,
        0,
        "Binding did not close obligation",
      );
    },
  },
  {
    name: "old pending survives stop and remains one forecast event until posting",
    run() {
      let state = paymentFixture();
      state = saveTransaction(
        state,
        {
          type: "expense",
          status: "pending",
          title: "Ожидание",
          amount: 10_000,
          date: TODAY,
          expectedDate: TODAY,
          accountId: "card",
          category: "home",
          recurringId: "history-payment",
          occurrenceDate: "2026-10-05",
        },
        TODAY,
      );
      const pendingId = state.transactions[0].id;
      const stopped = setRecurringActive(
        state,
        "history-payment",
        false,
        TODAY,
      );
      check(
        paymentPending(stopped, stopped.recurring[0], "2026-10-05"),
        "Stop lost pending",
      );
      const events = forecast(stopped, 30, TODAY)
        .days.flatMap((day) => day.events)
        .filter(
          (event) =>
            event.pendingId === pendingId ||
            event.sourceId === "history-payment",
        );
      equal(events.length, 1, "Pending and old obligation doubled");
      const posted = payRecurring(
        stopped,
        "history-payment",
        "2026-10-05",
        TODAY,
      );
      equal(posted.transactions.length, 1, "Posting pending duplicated fact");
      equal(posted.transactions[0].id, pendingId, "Posting changed identity");
      equal(
        overduePayments(posted, TODAY).length,
        0,
        "Posting did not close old event",
      );
    },
  },
  {
    name: "month year leap and week transitions retain bounded schedule identities",
    run() {
      const date = "2023-12-30";
      let state = paymentFixture(date);
      state.recurring[0].startsOn = "2023-12-01";
      state.recurring[0].day = 31;
      state = saveRecurring(
        state,
        input(state.recurring[0], {
          amount: 11_000,
          effectiveFrom: "2024-01-01",
          schedule: { unit: "month", interval: 1, anchor: "2024-01-31" },
        }),
        date,
      );
      equal(
        upcoming(state, "2023-12-30", "2024-04-01").map((item) => item.date),
        ["2023-12-31", "2024-01-31", "2024-02-29", "2024-03-31"],
        "Short month or year boundary shifted",
      );
      state = saveRecurring(
        state,
        input(state.recurring[0], {
          effectiveFrom: "2024-04-01",
          schedule: { unit: "year", interval: 1, anchor: "2024-04-30" },
        }),
        "2024-03-15",
      );
      equal(
        upcoming(state, "2024-04-01", "2026-05-01").map((item) => item.date),
        ["2024-04-30", "2025-04-30", "2026-04-30"],
        "Annual transition wrong",
      );
      state = saveRecurring(
        state,
        input(state.recurring[0], {
          effectiveFrom: "2026-05-01",
          schedule: { unit: "week", interval: 1, anchor: "2026-05-01" },
        }),
        "2026-04-15",
      );
      const weekly = upcoming(state, "2026-05-01", "2026-05-16");
      equal(
        weekly.map((item) => item.date),
        ["2026-05-01", "2026-05-08", "2026-05-15"],
        "Weekly transition wrong",
      );
      equal(
        new Set(
          weekly.map((item) =>
            paymentOccurrenceKey(state.recurring[0], item.date, item.versionId),
          ),
        ).size,
        3,
        "Weekly events merged",
      );
    },
  },
  {
    name: "skip of one weekly version occurrence leaves other occurrences intact",
    run() {
      let state = paymentFixture();
      state = saveRecurring(
        state,
        input(state.recurring[0], {
          effectiveFrom: "2026-10-19",
          schedule: { unit: "week", interval: 1, anchor: "2026-10-19" },
        }),
        TODAY,
      );
      const id = state.recurring[0].versions![1].id;
      state = setPaymentSkipped(
        state,
        "history-payment",
        "2026-10-19",
        true,
        TODAY,
        id,
      );
      equal(
        upcoming(state, "2026-10-19", "2026-11-01").map((item) => [
          item.date,
          item.skipped,
        ]),
        [
          ["2026-10-19", true],
          ["2026-10-26", false],
        ],
        "Weekly skip spread across month",
      );
      rejects(
        () =>
          payRecurring(
            state,
            "history-payment",
            "2026-10-19",
            TODAY,
            undefined,
            id,
          ),
        "Skipped occurrence paid",
      );
      state = setPaymentSkipped(
        state,
        "history-payment",
        "2026-10-19",
        false,
        TODAY,
        id,
      );
      const paid = payRecurring(
        state,
        "history-payment",
        "2026-10-19",
        TODAY,
        undefined,
        id,
      );
      equal(
        paid.transactions[0].recurringVersionId,
        id,
        "Version reference missing",
      );
      equal(
        upcoming(paid, "2026-10-19", "2026-11-01").map((item) => item.paid),
        [true, false],
        "Paid weekly event merged",
      );
    },
  },
  {
    name: "legacy amount/day history survives materialization and round trip",
    run() {
      const state = paymentFixture();
      state.recurring[0].startsOn = "2026-08-01";
      state.recurring[0].history = [
        { untilMonth: "2026-08", amount: 6000, day: 31 },
        { untilMonth: "2026-09", amount: 8000, day: 29 },
      ];
      const next = saveRecurring(
        state,
        input(state.recurring[0], { amount: 12_000 }),
        TODAY,
      );
      const restored = decodeBackup(encodeBackup(next), TODAY);
      equal(
        overduePayments(restored, TODAY).map((item) => [
          item.date,
          item.payment.amount,
        ]),
        [
          ["2026-08-31", 6000],
          ["2026-09-29", 8000],
          ["2026-10-05", 10_000],
        ],
        "Legacy historical terms changed",
      );
    },
  },
  {
    name: "reminder plan follows version intervals and retains overdue reminders after stop",
    run() {
      const state = paymentFixture();
      const stopped = setRecurringActive(
        state,
        "history-payment",
        false,
        TODAY,
      );
      const plan = reminderPlan(stopped, new Date("2026-10-18T08:00:00+04:00"));
      check(
        plan.items.some((item) => item.id.startsWith("lad.overdue.")),
        "Stop erased overdue reminders",
      );
      check(
        !plan.items.some((item) => item.paymentId === "history-payment"),
        "Stop retained future notification",
      );
      const resumed = setRecurringActive(
        stopped,
        "history-payment",
        true,
        "2026-10-22",
      );
      const next = reminderPlan(resumed, new Date("2026-10-22T08:00:00+04:00"));
      check(
        next.items.some(
          (item) =>
            item.paymentId === "history-payment" && item.date === "2026-11-05",
        ),
        "Resume reminder absent",
      );
    },
  },
  {
    name: "cancelled future intention retains history across a replacement interval",
    run() {
      let state = paymentFixture();
      state.recurring[0].day = 25;
      state = saveTransaction(
        state,
        {
          type: "expense",
          status: "pending",
          title: "Отменённое ожидание",
          amount: 10_000,
          date: TODAY,
          expectedDate: "2026-10-25",
          accountId: "card",
          category: "home",
          recurringId: "history-payment",
          occurrenceDate: "2026-10-25",
        },
        TODAY,
      );
      const id = state.transactions[0].id;
      state = cancelPendingTransaction(state, id, TODAY);
      const changed = saveRecurring(
        state,
        input(state.recurring[0], { amount: 12_000 }),
        TODAY,
      );
      const restored = decodeBackup(encodeBackup(changed), TODAY);
      equal(
        restored.transactions[0].status,
        "cancelled",
        "Cancelled intention lost its status",
      );
      equal(
        restored.transactions[0].occurrenceDate,
        "2026-10-25",
        "Historical original key was rewritten",
      );
      const planned = upcoming(restored, "2026-10-19", "2026-11-01");
      equal(
        planned.map((entry) => [entry.date, entry.payment.amount, entry.paid]),
        [["2026-10-25", 12_000, false]],
        "Old cancellation suppressed new version",
      );
    },
  },
  {
    name: "stop before first legacy occurrence creates no phantom obligation on resume",
    run() {
      const state = paymentFixture();
      state.recurring[0].startsOn = "2027-01-01";
      state.recurring[0].day = 18;
      const paused = setRecurringActive(state, "history-payment", false, TODAY);
      equal(
        upcoming(paused, TODAY, "2027-02-01"),
        [],
        "Future-start stop created a phantom event",
      );
      const resumed = setRecurringActive(
        paused,
        "history-payment",
        true,
        TODAY,
      );
      equal(
        upcoming(resumed, TODAY, "2027-02-01").map((entry) => entry.date),
        ["2027-01-18"],
        "Resume moved original future start backwards",
      );
      decodeBackup(encodeBackup(resumed), TODAY);
    },
  },
  {
    name: "stopping before saved future terms voids only the future version and resumes current terms",
    run() {
      let state = paymentFixture();
      state = saveRecurring(
        state,
        input(state.recurring[0], {
          amount: 90_000,
          effectiveFrom: "2026-11-01",
          schedule: { unit: "week", interval: 1, anchor: "2026-11-01" },
        }),
        TODAY,
      );
      const futureId = state.recurring[0].versions![1].id;
      const paused = setRecurringActive(state, "history-payment", false, TODAY);
      equal(
        paused.recurring[0].versions?.[1].voided,
        true,
        "Saved future terms were not voided",
      );
      equal(
        paused.recurring[0].amount,
        10_000,
        "Pause kept not-yet-effective price",
      );
      equal(
        upcoming(paused, "2026-10-19", "2026-12-01"),
        [],
        "Future condition generated after stop",
      );
      check(
        !resolvePaymentOccurrence(paused.recurring[0], "2026-11-01", futureId),
        "Voided version resolved as active event",
      );
      const resumed = setRecurringActive(
        paused,
        "history-payment",
        true,
        "2026-10-22",
      );
      equal(
        upcoming(resumed, "2026-10-22", "2026-12-01").map((entry) => [
          entry.date,
          entry.payment.amount,
        ]),
        [["2026-11-05", 10_000]],
        "Resume revived voided future terms",
      );
      decodeBackup(encodeBackup(resumed), "2026-10-22");
    },
  },
  {
    name: "a new future edit replaces scheduled unopened terms without deleting their snapshot",
    run() {
      let state = paymentFixture();
      state = saveRecurring(
        state,
        input(state.recurring[0], {
          amount: 20_000,
          effectiveFrom: "2026-11-01",
        }),
        TODAY,
      );
      state = saveRecurring(
        state,
        input(state.recurring[0], {
          amount: 30_000,
          effectiveFrom: "2026-10-20",
        }),
        TODAY,
      );
      equal(
        state.recurring[0].versions?.map((version) => [
          version.amount,
          !!version.voided,
        ]),
        [
          [10_000, false],
          [20_000, true],
          [30_000, false],
        ],
        "Earlier future edit lost immutable history",
      );
      equal(
        upcoming(state, "2026-10-20", "2026-11-10").map((entry) => [
          entry.date,
          entry.payment.amount,
        ]),
        [["2026-11-05", 30_000]],
        "Replaced future version still generated",
      );
      decodeBackup(encodeBackup(state), TODAY);
    },
  },
  {
    name: "invalid earlier boundary and currency replacement leave state unchanged",
    run() {
      const state = paymentFixture();
      const before = encodeBackup(state);
      rejects(
        () =>
          saveRecurring(
            state,
            input(state.recurring[0], { amount: 20_000, effectiveFrom: TODAY }),
            TODAY,
          ),
        "Same-day new terms accepted",
      );
      state.accounts[1].currency = "USD";
      const currencyBefore = encodeBackup(state);
      rejects(
        () =>
          saveRecurring(
            state,
            input(state.recurring[0], { accountId: "cash" }),
            TODAY,
          ),
        "Plan currency changed",
      );
      equal(
        encodeBackup(state),
        currencyBefore,
        "Currency rejection mutated state",
      );
      check(before !== currencyBefore, "Fixture currency was not changed");
    },
  },
];

const KEY = "lad-profile-personal:lad-finance-v1";
export function installPaymentUiFixture() {
  if (sessionStorage.getItem("t05-payment-installed")) return;
  const state = paymentFixture();
  state.settings.reminders = { enabled: false, daysBefore: 1, hour: 9 };
  state.transactions = [
    {
      id: "early-payment",
      type: "expense",
      title: "Оплата заранее",
      amount: 10_000,
      baseAmount: 10_000,
      date: "2026-09-30",
      category: "home",
      accountId: "card",
    },
  ];
  localStorage.setItem(KEY, encodeBackup(state));
  localStorage.setItem("lad-active-profile-v1", "personal");
  sessionStorage.setItem("t05-payment-installed", "yes");
}
export function paymentUiState() {
  return decodeBackup(localStorage.getItem(KEY)!, TODAY);
}
