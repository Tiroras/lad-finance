import { reminderPlan } from "../../src/domain/reminders";
import { createInitialState } from "../../src/domain/seed";
import type {
  Account,
  FinanceState,
  PaymentTermsVersion,
  Recurring,
} from "../../src/domain/types";
import { shiftDate } from "../../src/shared/lib/dates";
import assert from "./browserDomainAssert";

const TODAY = "2026-10-06";
type Case = { name: string; run: () => void };
function fixture(today = TODAY): FinanceState {
  const state = createInitialState(false, today);
  state.version = 8;
  state.recurring = [];
  state.transactions = [];
  state.plannedIncomes = [];
  state.settings.reminders = { enabled: true, daysBefore: 0, hour: 9 };
  return state;
}
function payment(id: string, date: string): Recurring {
  return {
    id,
    name: `Тестовый платёж ${id}`,
    amount: 100,
    day: Number(date.slice(-2)),
    kind: "bill",
    active: true,
    icon: "card-outline",
    color: "#234B3C",
    category: "other",
    accountId: "card",
    startsOn: date,
    schedule: { unit: "year", interval: 1, anchor: date },
  };
}
function credit(id: string, date: string): Account {
  return {
    id,
    name: "Тестовая карта",
    kind: "credit",
    openingBalance: 0,
    creditLimit: 100_000,
    creditTermsReminderDate: date,
    icon: "card-outline",
    color: "#234B3C",
  };
}
function version(id: string, from: string, to?: string): PaymentTermsVersion {
  return {
    id,
    effectiveFrom: from,
    ...(to ? { effectiveTo: to } : {}),
    amount: 100,
    accountId: "card",
    category: "other",
    day: 7,
    schedule: { unit: "day", interval: 1, anchor: TODAY },
  };
}
function at(value: string) {
  return new Date(value).getTime();
}
function paymentIds(state: FinanceState, now = "2026-10-06T08:00:00") {
  return reminderPlan(state, new Date(now))
    .items.filter((item) => item.paymentId)
    .map((item) => item.paymentId);
}

export const t08ReminderCases: Case[] = [
  ...([0, 1, 3] as const).flatMap((daysBefore): Case[] => [
    {
      name: `${daysBefore} days advance: last notification day is included and following day excluded`,
      run() {
        const state = fixture();
        state.settings.reminders!.daysBefore = daysBefore;
        const lastDue = ["2026-12-04", "2026-12-05", "", "2026-12-07"][
          daysBefore
        ];
        const nextDue = ["2026-12-05", "2026-12-06", "", "2026-12-08"][
          daysBefore
        ];
        state.recurring = [
          payment("last", lastDue),
          payment("outside", nextDue),
        ];
        const result = reminderPlan(state, new Date("2026-10-06T08:00:00"));
        assert.equal(result.windowEnd, "2026-12-04");
        assert.equal(result.truncated, false);
        assert.equal(result.firstOmittedAt, undefined);
        assert.equal(result.items.length, 1);
        assert.equal(result.items[0].paymentId, "last");
        assert.equal(result.items[0].date, lastDue);
        assert.equal(result.items[0].at, at("2026-12-04T09:00:00"));
      },
    },
    {
      name: `${daysBefore} days advance: remaining hour today is included but an exact-now trigger is excluded`,
      run() {
        const state = fixture();
        state.settings.reminders!.daysBefore = daysBefore;
        state.recurring = [payment("today", TODAY)];
        const before = reminderPlan(state, new Date("2026-10-06T08:59:59.999"));
        assert.equal(before.items.length, 1);
        assert.equal(before.items[0].at, at("2026-10-06T09:00:00"));
        assert.deepEqual(
          reminderPlan(state, new Date("2026-10-06T09:00:00")).items,
          [],
        );
        assert.deepEqual(
          reminderPlan(state, new Date("2026-10-06T09:00:00.001")).items,
          [],
        );
      },
    },
    {
      name: `${daysBefore} days advance: midnight at the exclusive end never enters the queue`,
      run() {
        const state = fixture();
        state.settings.reminders = {
          enabled: true,
          daysBefore,
          hour: 0,
        };
        const due = ["2026-12-05", "2026-12-06", "", "2026-12-08"][daysBefore];
        state.recurring = [payment("end", due)];
        state.accounts.push(credit("end-credit", "2026-12-05"));
        assert.deepEqual(
          reminderPlan(state, new Date("2026-10-06T00:00:00")).items,
          [],
        );
      },
    },
  ]),
  {
    name: "passed advance time falls back to due-day hour with the same event identity",
    run() {
      const state = fixture();
      state.settings.reminders!.daysBefore = 3;
      state.recurring = [payment("fallback", "2026-10-08")];
      const early = reminderPlan(state, new Date("2026-10-05T08:00:00"))
        .items[0];
      const exact = reminderPlan(state, new Date("2026-10-05T09:00:00"))
        .items[0];
      const late = reminderPlan(state, new Date("2026-10-06T12:00:00"))
        .items[0];
      assert.equal(early.at, at("2026-10-05T09:00:00"));
      assert.equal(exact.at, at("2026-10-08T09:00:00"));
      assert.equal(late.at, exact.at);
      assert.equal(late.id, early.id);
      assert.equal(late.date, "2026-10-08");
    },
  },
  {
    name: "same month identity survives a legacy due-day change while route data keeps actual date",
    run() {
      const state = fixture();
      const monthly = payment("monthly", "2026-10-10");
      delete monthly.schedule;
      state.recurring = [monthly];
      const before = reminderPlan(state, new Date("2026-10-06T08:00:00"))
        .items[0];
      monthly.day = 11;
      const after = reminderPlan(state, new Date("2026-10-06T08:00:00"))
        .items[0];
      assert.equal(before.date, "2026-10-10");
      assert.equal(after.date, "2026-10-11");
      assert.equal(after.id, before.id);
      assert.deepEqual(
        JSON.parse(decodeURIComponent(after.id.slice("lad.payment.".length))),
        ["monthly", "legacy:2026-10"],
      );
      assert.equal(after.versionId, "legacy");
    },
  },
  {
    name: "explicit weekly schedule uses a distinct full-date key for each occurrence",
    run() {
      const state = fixture();
      state.recurring = [
        {
          ...payment("weekly", TODAY),
          schedule: { unit: "week", interval: 1, anchor: TODAY },
        },
      ];
      const result = reminderPlan(state, new Date("2026-10-06T08:00:00"));
      assert.deepEqual(
        result.items
          .slice(0, 2)
          .map((item) =>
            JSON.parse(
              decodeURIComponent(item.id.slice("lad.payment.".length)),
            ),
          ),
        [
          ["weekly", "legacy:2026-10-06"],
          ["weekly", "legacy:2026-10-13"],
        ],
      );
      assert.equal(new Set(result.items.map((item) => item.id)).size, 9);
    },
  },
  {
    name: "payment and version IDs with separators cannot collide",
    run() {
      const state = fixture();
      state.recurring = [
        {
          ...payment("a.b", "2026-10-07"),
          versions: [
            {
              ...version("c", "2026-10-07", "2026-10-08"),
              schedule: undefined,
            },
          ],
        },
        {
          ...payment("a", "2026-10-07"),
          versions: [
            {
              ...version("b.c", "2026-10-07", "2026-10-08"),
              schedule: undefined,
            },
          ],
        },
        payment('tuple",[0]:%.\ud800', "2026-10-07"),
      ];
      const result = reminderPlan(state, new Date("2026-10-06T08:00:00"));
      assert.equal(result.items.length, 3);
      assert.equal(new Set(result.items.map((item) => item.id)).size, 3);
      assert.equal(
        result.items.find((item) => item.paymentId === "a.b")!.versionId,
        "c",
      );
    },
  },
  {
    name: "version intervals and pauses preserve old obligations without filling a pause",
    run() {
      const state = fixture();
      state.recurring = [
        {
          ...payment("versions", TODAY),
          versions: [
            version("old", TODAY, "2026-10-08"),
            version("new", "2026-10-10", "2026-10-12"),
            { ...version("voided", "2026-10-12"), voided: true },
          ],
        },
      ];
      const result = reminderPlan(state, new Date("2026-10-06T08:00:00"));
      assert.deepEqual(
        result.items.map((item) => [item.date, item.versionId]),
        [
          ["2026-10-06", "old"],
          ["2026-10-07", "old"],
          ["2026-10-10", "new"],
          ["2026-10-11", "new"],
        ],
      );
      assert.equal(new Set(result.items.map((item) => item.id)).size, 4);
    },
  },
  {
    name: "paid, cancelled and pending facts retain their distinct scheduling meaning",
    run() {
      const state = fixture();
      state.recurring = [
        payment("paid", "2026-10-07"),
        payment("cancelled", "2026-10-07"),
        payment("pending", "2026-10-07"),
      ];
      state.transactions = state.recurring.map((item, index) => ({
        id: `fact-${index}`,
        title: "Тестовая оплата",
        type: "expense",
        amount: 100,
        date: TODAY,
        category: "other",
        accountId: "card",
        recurringId: item.id,
        occurrenceDate: "2026-10-07",
        recurringVersionId: "legacy",
        status: (["posted", "cancelled", "pending"] as const)[index],
      }));
      assert.deepEqual(paymentIds(state), ["cancelled", "pending"]);
    },
  },
  {
    name: "skipped monthly and explicit dates are excluded independently",
    run() {
      const state = fixture();
      const monthly = payment("monthly", "2026-10-07");
      delete monthly.schedule;
      monthly.skippedMonths = ["2026-10"];
      state.recurring = [
        monthly,
        {
          ...payment("weekly", "2026-10-07"),
          schedule: { unit: "week", interval: 1, anchor: "2026-10-07" },
          skippedDates: ["2026-10-14"],
        },
      ];
      const dates = reminderPlan(state, new Date("2026-10-06T08:00:00")).items;
      assert.equal(
        dates.some(
          (item) => item.paymentId === "monthly" && item.date === "2026-10-07",
        ),
        false,
      );
      assert.equal(
        dates.some(
          (item) => item.paymentId === "monthly" && item.date === "2026-11-07",
        ),
        true,
      );
      assert.equal(
        dates.some(
          (item) => item.paymentId === "weekly" && item.date === "2026-10-14",
        ),
        false,
      );
      assert.equal(
        dates.some(
          (item) => item.paymentId === "weekly" && item.date === "2026-10-21",
        ),
        true,
      );
    },
  },
  {
    name: "70 notifications keep the earliest 60 and paying one replenishes its slot",
    run() {
      const state = fixture();
      state.recurring = Array.from({ length: 70 }, (_, index) =>
        payment(
          `payment-${String(index).padStart(3, "0")}`,
          shiftDate(TODAY, 1 + Math.floor(index / 2)),
        ),
      );
      const before = reminderPlan(state, new Date("2026-10-06T08:00:00"));
      assert.equal(before.items.length, 60);
      assert.equal(before.truncated, true);
      assert.equal(before.items.at(-1)!.paymentId, "payment-059");
      assert.equal(before.firstOmittedAt, at("2026-11-06T09:00:00"));
      state.transactions.push({
        id: "paid",
        title: "Ранняя оплата",
        type: "expense",
        amount: 100,
        date: TODAY,
        category: "other",
        accountId: "card",
        recurringId: "payment-000",
        recurringVersionId: "legacy",
        occurrenceDate: "2026-10-07",
      });
      const after = reminderPlan(state, new Date("2026-10-06T08:00:00"));
      assert.equal(after.items.length, 60);
      assert.equal(
        after.items.some((item) => item.paymentId === "payment-000"),
        false,
      );
      assert.equal(after.items.at(-1)!.paymentId, "payment-060");
      assert.equal(after.firstOmittedAt, at("2026-11-06T09:00:00"));
      assert.equal(after.truncated, true);
    },
  },
  {
    name: "an omitted event may share the final scheduled date and exact capacity is not truncated",
    run() {
      const state = fixture();
      state.recurring = Array.from({ length: 60 }, (_, index) =>
        payment(`payment-${index}`, "2026-10-07"),
      );
      const exact = reminderPlan(state, new Date("2026-10-06T08:00:00"));
      assert.equal(exact.items.length, 60);
      assert.equal(exact.truncated, false);
      assert.equal(exact.firstOmittedAt, undefined);
      state.recurring.push(payment("one-more", "2026-10-07"));
      const truncated = reminderPlan(state, new Date("2026-10-06T08:00:00"));
      assert.equal(truncated.items.length, 60);
      assert.equal(truncated.truncated, true);
      assert.equal(truncated.firstOmittedAt, truncated.items.at(-1)!.at);
    },
  },
  {
    name: "credit reminders use the common window without applying payment advance",
    run() {
      const state = fixture();
      state.settings.reminders!.daysBefore = 3;
      state.accounts.push(
        credit("today", TODAY),
        credit("last", "2026-12-04"),
        credit("outside", "2026-12-05"),
        credit("far", "2027-10-06"),
      );
      const before = reminderPlan(state, new Date("2026-10-06T08:00:00"));
      assert.deepEqual(
        before.items.map((item) => item.creditAccountId),
        ["today", "last"],
      );
      assert.deepEqual(
        before.items.map((item) => item.at),
        [at("2026-10-06T09:00:00"), at("2026-12-04T09:00:00")],
      );
      const after = reminderPlan(state, new Date("2026-10-06T09:00:00"));
      assert.deepEqual(
        after.items.map((item) => item.creditAccountId),
        ["last"],
      );
    },
  },
  {
    name: "credit reminders share the 60 slots with payments and disappear after archive or date removal",
    run() {
      const state = fixture();
      state.recurring = Array.from({ length: 59 }, (_, index) =>
        payment(`payment-${index}`, "2026-10-07"),
      );
      state.accounts.push(
        credit("today", TODAY),
        credit("later", "2026-10-08"),
      );
      const result = reminderPlan(state, new Date("2026-10-06T08:00:00"));
      assert.equal(result.items.length, 60);
      assert.equal(result.items[0].creditAccountId, "today");
      assert.equal(result.firstOmittedAt, at("2026-10-08T09:00:00"));
      state.accounts.find((item) => item.id === "today")!.archived = true;
      const archived = reminderPlan(state, new Date("2026-10-06T08:00:00"));
      assert.equal(archived.items.length, 60);
      assert.equal(archived.truncated, false);
      assert.equal(archived.items.at(-1)!.creditAccountId, "later");
      delete state.accounts.find((item) => item.id === "later")!
        .creditTermsReminderDate;
      assert.equal(
        reminderPlan(state, new Date("2026-10-06T08:00:00")).items.length,
        59,
      );
    },
  },
  {
    name: "overdue summaries occupy the same chronological slots and stop when debt is paid",
    run() {
      const state = fixture();
      state.recurring = [
        payment("overdue", "2026-10-05"),
        ...Array.from({ length: 55 }, (_, index) =>
          payment(`payment-${index}`, "2026-10-07"),
        ),
      ];
      const result = reminderPlan(state, new Date("2026-10-06T08:00:00"));
      assert.equal(result.items.length, 60);
      assert.equal(result.truncated, true);
      assert.equal(result.firstOmittedAt, at("2026-10-11T09:00:00"));
      assert.equal(result.items[0].id, "lad.overdue.2026-10-06");
      assert.equal(result.items.at(-1)!.id, "lad.overdue.2026-10-10");
      state.transactions.push({
        id: "settled",
        title: "Оплата просрочки",
        type: "expense",
        amount: 100,
        date: TODAY,
        category: "other",
        accountId: "card",
        recurringId: "overdue",
        occurrenceDate: "2026-10-05",
      });
      const settled = reminderPlan(state, new Date("2026-10-06T08:00:00"));
      assert.equal(settled.items.length, 55);
      assert.equal(settled.truncated, false);
      assert.equal(
        settled.items.some((item) => item.id.startsWith("lad.overdue.")),
        false,
      );
    },
  },
  {
    name: "overdue exact-now trigger is excluded and only the next six local mornings remain",
    run() {
      const state = fixture();
      state.recurring = [payment("old", "2026-10-05")];
      const result = reminderPlan(state, new Date("2026-10-06T09:00:00"));
      assert.equal(result.items.length, 6);
      assert.equal(result.items[0].at, at("2026-10-07T09:00:00"));
      assert.equal(result.items.at(-1)!.at, at("2026-10-12T09:00:00"));
    },
  },
  ...(
    [
      ["2027-02-20", "2027-02-28", "2027-02-27"],
      ["2028-02-20", "2028-02-29", "2028-02-28"],
    ] as const
  ).map(([today, due, trigger]): Case => ({
    name: `monthly day 31 clamps to ${due} with a local advance hour`,
    run() {
      const state = fixture(today);
      state.settings.reminders!.daysBefore = 1;
      const monthly = payment("month-end", `${today.slice(0, 7)}-01`);
      delete monthly.schedule;
      monthly.day = 31;
      state.recurring = [monthly];
      const result = reminderPlan(state, new Date(`${today}T12:00:00`));
      assert.equal(result.items[0].date, due);
      assert.equal(result.items[0].at, at(`${trigger}T09:00:00`));
      assert.equal(result.items[1].date, `${today.slice(0, 4)}-03-31`);
    },
  })),
  {
    name: "year rollover keeps a sixty-calendar-day window and advance beyond its final date",
    run() {
      const state = fixture("2026-12-15");
      state.settings.reminders!.daysBefore = 3;
      state.recurring = [
        payment("last", "2027-02-15"),
        payment("outside", "2027-02-16"),
      ];
      const result = reminderPlan(state, new Date("2026-12-15T08:00:00"));
      assert.equal(result.windowEnd, "2027-02-12");
      assert.equal(result.items.length, 1);
      assert.equal(result.items[0].at, at("2027-02-12T09:00:00"));
    },
  },
  {
    name: "disabled preferences and absent preferences have an empty known window without changing finance data",
    run() {
      const state = fixture();
      state.recurring = [payment("future", "2026-10-07")];
      state.accounts.push(credit("credit", "2026-10-07"));
      state.settings.reminders!.enabled = false;
      const original = JSON.stringify(state);
      assert.deepEqual(reminderPlan(state, new Date("2026-10-06T08:00:00")), {
        items: [],
        truncated: false,
        windowEnd: "2026-12-04",
      });
      assert.equal(JSON.stringify(state), original);
      delete state.settings.reminders;
      assert.equal(
        reminderPlan(state, new Date("2026-10-06T08:00:00")).items.length,
        0,
      );
      assert.equal(state.settings.reminders, undefined);
      assert.equal(state.version, 8);
    },
  },
  {
    name: "planning is deterministic and leaves versions, money and settings unchanged",
    run() {
      const state = fixture();
      state.recurring = [payment("future", "2026-10-07")];
      state.accounts.push(credit("credit", "2026-10-07"));
      const before = JSON.stringify(state);
      const first = reminderPlan(state, new Date("2026-10-06T08:00:00"));
      assert.deepEqual(
        first,
        reminderPlan(state, new Date("2026-10-06T08:00:00")),
      );
      assert.equal(JSON.stringify(state), before);
    },
  },
];

export const t08TimeZoneCases: Case[] = [
  ...(
    [
      ["2026-03-07", "2026-05-05", "2026-03-08"],
      ["2026-10-31", "2026-12-29", "2026-11-01"],
      ["2026-03-28", "2026-05-26", "2026-03-29"],
      ["2026-10-24", "2026-12-22", "2026-10-25"],
    ] as const
  ).map(([today, end, next]): Case => ({
    name: `sixty local mornings from ${today} preserve the chosen hour across timezone transitions`,
    run() {
      const state = fixture(today);
      state.recurring = [
        {
          ...payment("daily", today),
          schedule: { unit: "day", interval: 1, anchor: today },
        },
      ];
      const result = reminderPlan(state, new Date(`${today}T08:00:00`));
      assert.equal(result.windowEnd, end);
      assert.equal(result.items.length, 60);
      assert.equal(result.truncated, false);
      assert.equal(result.items[0].date, today);
      assert.equal(result.items[1].date, next);
      assert.equal(result.items.at(-1)!.date, end);
      assert.equal(new Set(result.items.map((item) => item.date)).size, 60);
      assert.ok(
        result.items.every((item) => new Date(item.at).getHours() === 9),
      );
      assert.equal(result.items[1].at, at(`${next}T09:00:00`));
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const elapsedHours =
        (result.items[1].at - result.items[0].at) / 3_600_000;
      if (zone === "America/New_York" && today === "2026-03-07")
        assert.equal(elapsedHours, 23);
      if (zone === "America/New_York" && today === "2026-10-31")
        assert.equal(elapsedHours, 25);
      if (zone === "Europe/Berlin" && today === "2026-03-28")
        assert.equal(elapsedHours, 23);
      if (zone === "Europe/Berlin" && today === "2026-10-24")
        assert.equal(elapsedHours, 25);
      if (zone === "Europe/Samara") assert.equal(elapsedHours, 24);
    },
  })),
  {
    name: "late local time never switches the calendar to the UTC date",
    run() {
      const state = fixture();
      state.recurring = [payment("tomorrow", "2026-10-07")];
      const result = reminderPlan(state, new Date("2026-10-06T23:30:00"));
      assert.equal(result.windowEnd, "2026-12-04");
      assert.equal(result.items[0].at, at("2026-10-07T09:00:00"));
      assert.equal(result.items[0].date, "2026-10-07");
    },
  },
];
