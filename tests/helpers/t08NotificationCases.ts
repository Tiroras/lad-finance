import { createInitialState } from "../../src/domain/seed";
import { reminderPlan, type PlannedReminder } from "../../src/domain/reminders";
import type { FinanceProfile } from "../../src/domain/profiles";
import {
  reminderChanges,
  reminderData,
  type ScheduledReminder,
} from "../../src/infrastructure/notifications/notificationPlan";
import {
  createReminderSynchronizer,
  type ReminderAccess,
} from "../../src/infrastructure/notifications/reminderSynchronizer";
import { notificationTriggerAt } from "../../src/infrastructure/notifications/notificationTrigger";
import type { ReminderStatus } from "../../src/infrastructure/notifications/notifications.types";

const NOW = new Date("2026-10-20T08:00:00+04:00");
const TODAY = "2026-10-20";
type Case = { name: string; run: () => void | Promise<void> };
function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(
      `${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`,
    );
}
function assertStatus<S extends ReminderStatus["status"]>(
  result: ReminderStatus,
  status: S,
): asserts result is Extract<ReminderStatus, { status: S }> {
  equal(result.status, status);
}
function check(value: unknown, message = "Expected true") {
  if (!value) throw new Error(message);
}
async function rejects(action: () => Promise<unknown>) {
  try {
    await action();
  } catch {
    return;
  }
  throw new Error("Expected rejection");
}
export function notificationFixture(count = 2) {
  const state = createInitialState(false, TODAY);
  state.recurring = [];
  state.transactions = [];
  state.plannedIncomes = [];
  state.goals = [];
  state.accounts = Array.from({ length: count }, (_, index) => ({
    id: `card-${index}`,
    name: `Вымышленная карта ${index}`,
    kind: "credit" as const,
    openingBalance: 0,
    creditLimit: 10_000,
    creditTermsReminderDate: "2026-10-21",
    icon: "card-outline" as const,
    color: "#000000",
  }));
  state.settings.reminders = { enabled: true, daysBefore: 1, hour: 9 };
  return state;
}
function scheduled(
  item: PlannedReminder,
  profile: FinanceProfile = "personal",
): ScheduledReminder {
  const qualified = item.id.replace(/^lad\./, `lad.${profile}.`);
  return {
    identifier: qualified,
    content: { data: reminderData(item, profile) },
    trigger: { type: "date", value: item.at, repeats: false },
  };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function portsFixture(existing: ScheduledReminder[] = []) {
  const records = new Map(existing.map((item) => [item.identifier, item]));
  const calls: string[] = [];
  const control = {
    access: "allowed" as ReminderAccess,
    failCancel: 0,
    failSchedule: 0,
    failRead: [] as number[],
    failAccess: false,
    silentSchedule: false,
    silentCancel: false,
    wrongData: false,
    pauseSchedule: undefined as ReturnType<typeof deferred> | undefined,
    startedSchedule: deferred(),
  };
  let reads = 0,
    cancels = 0,
    schedules = 0;
  const sync = createReminderSynchronizer({
    access: async () => {
      calls.push("access");
      if (control.failAccess) throw new Error("permission private details");
      return control.access;
    },
    read: async () => {
      calls.push("read");
      if (control.failRead.includes(++reads))
        throw new Error("read private details");
      return [...records.values()];
    },
    cancel: async (identifier) => {
      calls.push(`cancel:${identifier}`);
      if (++cancels === control.failCancel)
        throw new Error("cancel private details");
      if (!control.silentCancel) records.delete(identifier);
    },
    schedule: async (item, profile) => {
      calls.push(`schedule:${item.id}`);
      control.startedSchedule.resolve();
      await control.pauseSchedule?.promise;
      if (++schedules === control.failSchedule)
        throw new Error("schedule private details");
      if (control.silentSchedule) return;
      records.set(item.id, {
        identifier: item.id,
        content: {
          data: {
            ...reminderData(item, profile),
            ...(control.wrongData ? { creditAccountId: "wrong" } : {}),
          },
        },
        trigger: { type: "date", value: item.at, repeats: false },
      });
    },
    clearResponse: async () => {
      calls.push("clear-response");
    },
    now: () => new Date(NOW),
  });
  return { sync, records, control, calls };
}

export const t08NotificationCases: Case[] = [
  {
    name: "successful readback confirms factual count, last timestamp and window",
    async run() {
      const fixture = portsFixture();
      const state = notificationFixture();
      const result = await fixture.sync.synchronize(state, "personal");
      assertStatus(result, "ready");
      equal(result.profile, "personal");
      equal(result.count, 2);
      equal(
        result.lastNotificationAt,
        new Date("2026-10-21T09:00:00+04:00").getTime(),
      );
      equal(result.windowEnd, "2026-12-18");
      equal(result.syncedAt, NOW.getTime());
      equal(fixture.calls.filter((call) => call === "read").length, 2);
    },
  },
  {
    name: "repeat reads before mutation and does not schedule duplicates",
    async run() {
      const fixture = portsFixture();
      const state = notificationFixture();
      await fixture.sync.synchronize(state, "personal");
      fixture.calls.length = 0;
      equal(
        (await fixture.sync.synchronize(state, "personal")).status,
        "ready",
      );
      equal(fixture.calls, ["access", "read", "read"]);
    },
  },
  {
    name: "partial cancellation failure keeps actual count and retry reads remaining queue",
    async run() {
      const old = reminderPlan(notificationFixture(3), NOW).items;
      const fixture = portsFixture(old.map((item) => scheduled(item)));
      fixture.control.failCancel = 2;
      const empty = notificationFixture(0);
      const failed = await fixture.sync.synchronize(empty, "personal");
      assertStatus(failed, "error");
      equal(failed.count, 2);
      equal("syncedAt" in failed, false);
      check(failed.error.includes("удалить"));
      fixture.calls.length = 0;
      fixture.control.failCancel = 0;
      equal(
        (await fixture.sync.synchronize(empty, "personal")).status,
        "ready",
      );
      equal(fixture.calls[1], "read");
      equal(fixture.records.size, 0);
    },
  },
  {
    name: "partial scheduling failure retry preserves first success without duplication",
    async run() {
      const fixture = portsFixture();
      fixture.control.failSchedule = 2;
      const state = notificationFixture(3);
      const failed = await fixture.sync.synchronize(state, "personal");
      assertStatus(failed, "error");
      equal([failed.status, failed.count], ["error", 1]);
      check(failed.error.includes("добавить"));
      const first = [...fixture.records.keys()][0];
      fixture.calls.length = 0;
      fixture.control.failSchedule = 0;
      equal((await fixture.sync.synchronize(state, "personal")).count, 3);
      check(!fixture.calls.includes(`schedule:${first}`));
      equal(fixture.calls[1], "read");
    },
  },
  {
    name: "failed recovery read preserves original cancellation error and unknown count",
    async run() {
      const fixture = portsFixture(
        reminderPlan(notificationFixture(), NOW).items.map((item) =>
          scheduled(item),
        ),
      );
      fixture.control.failCancel = 1;
      fixture.control.failRead = [2];
      const failed = await fixture.sync.synchronize(
        notificationFixture(0),
        "personal",
      );
      assertStatus(failed, "error");
      equal([failed.status, failed.count], ["error", null]);
      check(failed.error.includes("удалить"));
      check(failed.error.includes("проверить не удалось"));
      check(!failed.error.includes("private"));
    },
  },
  {
    name: "initial read failure does not mutate and does not claim empty queue",
    async run() {
      const fixture = portsFixture();
      fixture.control.failRead = [1];
      const result = await fixture.sync.synchronize(
        notificationFixture(),
        "personal",
      );
      equal([result.status, result.count], ["error", null]);
      equal(fixture.calls, ["access", "read"]);
    },
  },
  {
    name: "final read failure never reuses planned count",
    async run() {
      const fixture = portsFixture();
      fixture.control.failRead = [2];
      const result = await fixture.sync.synchronize(
        notificationFixture(),
        "personal",
      );
      assertStatus(result, "error");
      equal([result.status, result.count], ["error", null]);
      equal(result.lastNotificationAt, undefined);
      equal("syncedAt" in result, false);
    },
  },
  {
    name: "silent OS schedule drop is error with confirmed zero",
    async run() {
      const fixture = portsFixture();
      fixture.control.silentSchedule = true;
      const result = await fixture.sync.synchronize(
        notificationFixture(),
        "personal",
      );
      assertStatus(result, "error");
      equal([result.status, result.count], ["error", 0]);
      equal(result.lastNotificationAt, undefined);
    },
  },
  {
    name: "wrong readback navigation metadata does not report ready",
    async run() {
      const fixture = portsFixture();
      fixture.control.wrongData = true;
      const result = await fixture.sync.synchronize(
        notificationFixture(),
        "personal",
      );
      equal([result.status, result.count], ["error", 2]);
    },
  },
  {
    name: "each identity field and actual trigger must match",
    run() {
      const item: PlannedReminder = {
        id: "lad.payment.plan.v1.2026-10",
        paymentId: "plan",
        date: "2026-10-21",
        versionId: "v1",
        at: NOW.getTime() + 60_000,
      };
      const valid = scheduled(item);
      equal(reminderChanges([item], [valid], "personal"), {
        cancel: [],
        schedule: [],
      });
      for (const key of [
        "source",
        "profile",
        "at",
        "paymentId",
        "date",
        "versionId",
        "creditAccountId",
      ]) {
        const changed = {
          ...valid,
          content: { data: { ...valid.content.data, [key]: "wrong" } },
        };
        equal(reminderChanges([item], [changed], "personal").cancel, [
          valid.identifier,
        ]);
        equal(
          reminderChanges([item], [changed], "personal").schedule.length,
          1,
        );
      }
      for (const trigger of [
        undefined,
        { type: "date", value: item.at + 1 },
        { type: "date", value: item.at, repeats: true },
        { type: "timeInterval", seconds: 60, repeats: false },
      ])
        equal(
          reminderChanges([item], [{ ...valid, trigger }], "personal").cancel,
          [valid.identifier],
        );
    },
  },
  {
    name: "duplicate readback identifier is repaired rather than counted as ready",
    run() {
      const item = reminderPlan(notificationFixture(1), NOW).items[0];
      const record = scheduled(item);
      const changes = reminderChanges([item], [record, record], "personal");
      equal(changes.cancel, [record.identifier]);
      equal(changes.schedule.length, 1);
    },
  },
  {
    name: "switching profile removes old same-ID events and keeps foreign notifications",
    async run() {
      const foreign: ScheduledReminder = {
        identifier: "foreign",
        content: { data: { source: "foreign" } },
      };
      const fixture = portsFixture([foreign]);
      const state = notificationFixture();
      await fixture.sync.synchronize(state, "personal");
      const result = await fixture.sync.synchronize(state, "demo");
      equal(
        [result.status, result.profile, result.count],
        ["ready", "demo", 2],
      );
      equal(
        [...fixture.records.keys()].filter((key) =>
          key.startsWith("lad.personal."),
        ),
        [],
      );
      equal(fixture.records.get("foreign"), foreign);
    },
  },
  {
    name: "disabled reminders clear every owned profile without permission check",
    async run() {
      const fixture = portsFixture();
      const state = notificationFixture();
      await fixture.sync.synchronize(state, "demo");
      state.settings.reminders!.enabled = false;
      fixture.calls.length = 0;
      const result = await fixture.sync.synchronize(state, "personal");
      equal([result.status, result.count], ["off", 0]);
      check(!fixture.calls.includes("access"));
    },
  },
  {
    name: "revoked permission and disabled channel clear schedule and retain distinct denial",
    async run() {
      for (const access of ["permission", "channel"] as const) {
        const fixture = portsFixture();
        const state = notificationFixture();
        await fixture.sync.synchronize(state, "personal");
        fixture.control.access = access;
        const result = await fixture.sync.synchronize(state, "personal");
        assertStatus(result, "denied");
        equal(
          [result.status, result.count, result.deniedReason],
          ["denied", 0, access],
        );
        equal("lastNotificationAt" in result, false);
      }
    },
  },
  {
    name: "permission exception remains error even if queue is readable",
    async run() {
      const fixture = portsFixture();
      fixture.control.failAccess = true;
      const result = await fixture.sync.synchronize(
        notificationFixture(),
        "personal",
      );
      equal([result.status, result.count], ["error", 0]);
      equal("syncedAt" in result, false);
    },
  },
  {
    name: "sixty-slot result exposes same-day first omission without full-day coverage",
    async run() {
      const fixture = portsFixture();
      const result = await fixture.sync.synchronize(
        notificationFixture(70),
        "personal",
      );
      assertStatus(result, "ready");
      equal(
        [result.status, result.count, result.truncated],
        ["ready", 60, true],
      );
      equal(result.firstOmittedAt, result.lastNotificationAt);
    },
  },
  {
    name: "empty confirmed schedule has no last timestamp",
    async run() {
      const result = await portsFixture().sync.synchronize(
        notificationFixture(0),
        "personal",
      );
      assertStatus(result, "ready");
      equal([result.status, result.count], ["ready", 0]);
      equal(result.lastNotificationAt, undefined);
    },
  },
  {
    name: "sync A clear sync B serializes and only new profile survives",
    async run() {
      const fixture = portsFixture();
      fixture.control.pauseSchedule = deferred();
      const first = fixture.sync.synchronize(notificationFixture(), "personal");
      await fixture.control.startedSchedule.promise;
      const clear = fixture.sync.clear();
      const second = fixture.sync.synchronize(notificationFixture(1), "demo");
      fixture.control.pauseSchedule.resolve();
      equal((await first).status, "error");
      await clear;
      equal((await second).status, "ready");
      equal(
        [...fixture.records.keys()].every((key) => key.startsWith("lad.demo.")),
        true,
      );
      equal(fixture.records.size, 1);
      check(
        fixture.calls.indexOf("clear-response") <
          fixture.calls.findIndex((call) =>
            call.startsWith("schedule:lad.demo."),
          ),
      );
    },
  },
  {
    name: "last clear during pending schedule leaves no stale resurrection",
    async run() {
      const foreign = { identifier: "foreign", content: {} };
      const fixture = portsFixture([foreign]);
      fixture.control.pauseSchedule = deferred();
      const first = fixture.sync.synchronize(
        notificationFixture(3),
        "personal",
      );
      await fixture.control.startedSchedule.promise;
      const clear = fixture.sync.clear();
      fixture.control.pauseSchedule.resolve();
      equal((await first).status, "error");
      await clear;
      equal([...fixture.records.values()], [foreign]);
      equal(
        fixture.calls.filter((call) => call.startsWith("schedule:")).length,
        1,
      );
    },
  },
  {
    name: "two consecutive clears and later sync have deterministic order",
    async run() {
      const fixture = portsFixture();
      const one = fixture.sync.clear();
      const two = fixture.sync.clear();
      const last = fixture.sync.synchronize(notificationFixture(1), "personal");
      await Promise.all([one, two]);
      equal((await last).status, "ready");
      equal(
        fixture.calls.filter((call) => call === "clear-response").length,
        2,
      );
      equal(fixture.records.size, 1);
    },
  },
  {
    name: "failed clear rejects reset, next clear reads and removes actual remainder",
    async run() {
      const fixture = portsFixture(
        reminderPlan(notificationFixture(3), NOW).items.map((item) =>
          scheduled(item),
        ),
      );
      fixture.control.failCancel = 2;
      await rejects(fixture.sync.clear);
      equal(fixture.records.size, 2);
      check(!fixture.calls.includes("clear-response"));
      fixture.control.failCancel = 0;
      await fixture.sync.clear();
      equal(fixture.records.size, 0);
    },
  },
  {
    name: "silent cancellation cannot falsely confirm reset",
    async run() {
      const fixture = portsFixture(
        reminderPlan(notificationFixture(1), NOW).items.map((item) =>
          scheduled(item),
        ),
      );
      fixture.control.silentCancel = true;
      await rejects(fixture.sync.clear);
      equal(fixture.records.size, 1);
      check(!fixture.calls.includes("clear-response"));
    },
  },
  {
    name: "UTC calendar readback supports SDK GMT alias, leap date, year and second",
    run() {
      const at = Date.UTC(2028, 1, 29, 23, 59, 17);
      const parts = {
        year: 2028,
        month: 2,
        day: 29,
        hour: 23,
        minute: 59,
        second: 17,
        timeZone: "GMT",
      };
      equal(
        notificationTriggerAt({
          type: "calendar",
          repeats: false,
          dateComponents: parts,
        }),
        at,
      );
      for (const patch of [
        { day: 30 },
        { month: 0 },
        { hour: 24 },
        { timeZone: "Europe/Samara" },
        { second: undefined },
      ])
        equal(
          notificationTriggerAt({
            type: "calendar",
            repeats: false,
            dateComponents: { ...parts, ...patch },
          }),
          undefined,
        );
      equal(
        notificationTriggerAt({
          type: "calendar",
          repeats: true,
          dateComponents: parts,
        }),
        undefined,
      );
    },
  },
];

type NativeModule =
  typeof import("../../src/infrastructure/notifications/notifications.native");
type NativeRequest = {
  identifier: string;
  content: { title: string; body: string; data: Record<string, unknown> };
  trigger: Record<string, unknown>;
};
function nativeFixture(source: string, platform: "ios" | "android") {
  const requests = new Map<string, ScheduledReminder>();
  const scheduledRequests: NativeRequest[] = [];
  const calls: string[] = [];
  const control = {
    granted: true,
    provisional: false,
    requestGranted: false,
    importance: 3,
    channelMissing: false,
    version: 36,
    corruptTrigger: false,
    responseSource: "lad",
  };
  const stub = {
    Platform: {
      OS: platform,
      get Version() {
        return control.version;
      },
    },
    IosAuthorizationStatus: { PROVISIONAL: 3 },
    AndroidImportance: { DEFAULT: 3, NONE: 0 },
    AndroidNotificationVisibility: { PRIVATE: 0 },
    SchedulableTriggerInputTypes: { DATE: "date", CALENDAR: "calendar" },
    setNotificationHandler() {},
    async setNotificationChannelAsync() {
      calls.push("channel:prepare");
    },
    async getNotificationChannelAsync() {
      calls.push("channel:read");
      return control.channelMissing ? null : { importance: control.importance };
    },
    async getPermissionsAsync() {
      calls.push("permission:read");
      return {
        granted: control.granted,
        ios: control.provisional ? { status: 3 } : undefined,
      };
    },
    async requestPermissionsAsync() {
      calls.push("permission:request");
      return { granted: control.requestGranted };
    },
    async getAllScheduledNotificationsAsync() {
      calls.push("read");
      return [...requests.values()];
    },
    async cancelScheduledNotificationAsync(identifier: string) {
      calls.push(`cancel:${identifier}`);
      requests.delete(identifier);
    },
    async scheduleNotificationAsync(request: NativeRequest) {
      calls.push(`schedule:${request.identifier}`);
      scheduledRequests.push(request);
      const input = request.trigger;
      const trigger =
        platform === "ios"
          ? {
              type: input.type,
              repeats: input.repeats,
              dateComponents: {
                year: input.year,
                month: input.month,
                day: input.day,
                hour: input.hour,
                minute: input.minute,
                second: input.second,
                timeZone: input.timezone === "UTC" ? "GMT" : input.timezone,
              },
            }
          : {
              type: input.type,
              repeats: false,
              value:
                (input.date as Date).getTime() +
                (control.corruptTrigger ? 1000 : 0),
            };
      requests.set(request.identifier, {
        identifier: request.identifier,
        content: request.content,
        trigger,
      });
      return request.identifier;
    },
    getLastNotificationResponse: () =>
      control.responseSource
        ? {
            notification: {
              request: {
                content: { data: { source: control.responseSource } },
              },
            },
          }
        : null,
    async clearLastNotificationResponseAsync() {
      calls.push("clear-response");
      control.responseSource = "";
    },
    addNotificationResponseReceivedListener() {
      return { remove() {} };
    },
  };
  (globalThis as unknown as { __t08NativeStub: unknown }).__t08NativeStub =
    stub;
  const native = new Function(
    `${source}\nreturn __t08NativeModule;`,
  )() as NativeModule;
  return { native, control, requests, scheduledRequests, calls };
}

export function nativeAdapterCases(source: string): Case[] {
  return [
    {
      name: "actual native Android adapter checks permission/channel and verifies DATE value",
      async run() {
        const fixture = nativeFixture(source, "android");
        const result = await fixture.native.synchronizeReminders(
          notificationFixture(1),
          "personal",
        );
        equal([result.status, result.count], ["ready", 1]);
        equal(fixture.calls.slice(0, 4), [
          "channel:prepare",
          "permission:read",
          "channel:read",
          "read",
        ]);
        equal(fixture.calls.filter((call) => call === "read").length, 2);
        equal(fixture.scheduledRequests[0].trigger.channelId, "lad-payments");
        equal(fixture.scheduledRequests[0].trigger.type, "date");
        equal(Object.keys(fixture.scheduledRequests[0].content.data).sort(), [
          "at",
          "creditAccountId",
          "date",
          "paymentId",
          "profile",
          "source",
          "versionId",
        ]);
        check(
          !fixture.scheduledRequests[0].content.body.includes("Вымышленная"),
        );
      },
    },
    {
      name: "actual native iOS adapter accepts provisional and verifies full UTC one-off CALENDAR",
      async run() {
        const fixture = nativeFixture(source, "ios");
        fixture.control.granted = false;
        fixture.control.provisional = true;
        const result = await fixture.native.synchronizeReminders(
          notificationFixture(1),
          "demo",
        );
        equal([result.status, result.count], ["ready", 1]);
        equal(fixture.scheduledRequests[0].trigger, {
          type: "calendar",
          repeats: false,
          timezone: "UTC",
          year: 2026,
          month: 10,
          day: 21,
          hour: 5,
          minute: 0,
          second: 0,
        });
        check(!fixture.calls.some((call) => call.startsWith("channel:")));
        equal(await fixture.native.requestReminderPermission(), true);
        check(!fixture.calls.includes("permission:request"));
      },
    },
    {
      name: "actual iOS adapter replaces unverifiable legacy DATE timeInterval readback",
      async run() {
        const fixture = nativeFixture(source, "ios");
        const item = reminderPlan(notificationFixture(1), NOW).items[0];
        const old = scheduled(item);
        fixture.requests.set(old.identifier, {
          ...old,
          trigger: { type: "timeInterval", seconds: 90_000, repeats: false },
        });
        equal(
          (
            await fixture.native.synchronizeReminders(
              notificationFixture(1),
              "personal",
            )
          ).status,
          "ready",
        );
        check(fixture.calls.includes(`cancel:${old.identifier}`));
        equal(fixture.scheduledRequests.length, 1);
      },
    },
    {
      name: "actual native adapter detects permission denial and permission-request refusal",
      async run() {
        const fixture = nativeFixture(source, "android");
        await fixture.native.synchronizeReminders(
          notificationFixture(1),
          "personal",
        );
        fixture.control.granted = false;
        const result = await fixture.native.synchronizeReminders(
          notificationFixture(1),
          "personal",
        );
        assertStatus(result, "denied");
        equal(
          [result.status, result.count, result.deniedReason],
          ["denied", 0, "permission"],
        );
        equal(await fixture.native.requestReminderPermission(), false);
        check(fixture.calls.includes("permission:request"));
      },
    },
    {
      name: "actual Android adapter separates disabled channel from missing channel error",
      async run() {
        const fixture = nativeFixture(source, "android");
        fixture.control.importance = 0;
        const denied = await fixture.native.synchronizeReminders(
          notificationFixture(1),
          "personal",
        );
        assertStatus(denied, "denied");
        equal(
          [denied.status, denied.deniedReason, denied.count],
          ["denied", "channel", 0],
        );
        equal(await fixture.native.requestReminderPermission(), false);
        fixture.control.channelMissing = true;
        const failed = await fixture.native.synchronizeReminders(
          notificationFixture(1),
          "personal",
        );
        equal([failed.status, failed.count], ["error", 0]);
        equal(fixture.scheduledRequests.length, 0);
      },
    },
    {
      name: "actual Android below API26 does not reject unsupported channels",
      async run() {
        const fixture = nativeFixture(source, "android");
        fixture.control.version = 25;
        fixture.control.channelMissing = true;
        equal(
          (
            await fixture.native.synchronizeReminders(
              notificationFixture(1),
              "personal",
            )
          ).status,
          "ready",
        );
        check(!fixture.calls.includes("channel:read"));
      },
    },
    {
      name: "actual adapter does not trust data.at when native trigger time differs",
      async run() {
        const fixture = nativeFixture(source, "android");
        fixture.control.corruptTrigger = true;
        const result = await fixture.native.synchronizeReminders(
          notificationFixture(1),
          "personal",
        );
        equal([result.status, result.count], ["error", 1]);
        equal("syncedAt" in result, false);
      },
    },
    {
      name: "actual adapter clear keeps foreign requests and only consumes Lad response",
      async run() {
        const fixture = nativeFixture(source, "ios");
        await fixture.native.synchronizeReminders(
          notificationFixture(1),
          "personal",
        );
        fixture.requests.set("foreign", { identifier: "foreign", content: {} });
        fixture.control.responseSource = "foreign";
        await fixture.native.clearPaymentNotifications();
        equal([...fixture.requests.keys()], ["foreign"]);
        check(!fixture.calls.includes("clear-response"));
        fixture.control.responseSource = "lad";
        await fixture.native.clearPaymentNotifications();
        equal(fixture.control.responseSource, "");
      },
    },
  ];
}
