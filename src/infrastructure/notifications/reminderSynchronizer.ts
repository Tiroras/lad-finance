import { reminderPlan, type PlannedReminder } from "../../domain/reminders";
import type { FinanceProfile } from "../../domain/profiles";
import type { FinanceState } from "../../domain/types";
import {
  isLadReminder,
  reminderChanges,
  type ScheduledReminder,
} from "./notificationPlan";
import { notificationTriggerAt } from "./notificationTrigger";
import type { ReminderStatus } from "./notifications.types";

export type ReminderAccess = "allowed" | "permission" | "channel";
export interface ReminderQueuePorts {
  access(): Promise<ReminderAccess>;
  read(): Promise<ScheduledReminder[]>;
  cancel(identifier: string): Promise<void>;
  schedule(item: PlannedReminder, profile: FinanceProfile): Promise<unknown>;
  clearResponse(profile?: FinanceProfile): Promise<void>;
  now(): Date;
}

function observed(existing: ScheduledReminder[], profile: FinanceProfile) {
  const current = existing.filter(
    (item) => isLadReminder(item) && item.content.data?.profile === profile,
  );
  const times = current
    .map((item) => notificationTriggerAt(item.trigger))
    .filter((time): time is number => time !== undefined);
  return {
    count: current.length,
    ...(times.length ? { lastNotificationAt: Math.max(...times) } : {}),
  };
}

/**
 * Mutations share one queue, including reset. A requested clear invalidates all
 * older syncs immediately; the clear itself stays before any later sync.
 * A failed operation is never remembered as success: every retry reads first.
 */
export function createReminderSynchronizer(ports: ReminderQueuePorts) {
  let queue: Promise<unknown> = Promise.resolve();
  let clearGeneration = 0;
  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const task = queue.catch(() => undefined).then(operation);
    queue = task;
    return task;
  }

  function synchronize(
    state: FinanceState,
    profile: FinanceProfile,
  ): Promise<ReminderStatus> {
    const generation = clearGeneration;
    return enqueue(async (): Promise<ReminderStatus> => {
      let error = "Не удалось рассчитать расписание напоминаний.";
      let phase: "plan" | "access" | "read" | "write" | "verify" = "plan";
      let existing: ScheduledReminder[] | undefined;
      let plan: ReturnType<typeof reminderPlan> | undefined;
      const assertCurrent = () => {
        if (generation !== clearGeneration) {
          error = "Обновление напоминаний отменено очисткой данных.";
          throw new Error(error);
        }
      };
      try {
        assertCurrent();
        plan = reminderPlan(state, ports.now());
        const enabled = state.settings.reminders?.enabled ?? false;
        phase = "access";
        error = "Не удалось проверить разрешения на напоминания.";
        const access = enabled ? await ports.access() : "allowed";
        assertCurrent();
        const items = enabled && access === "allowed" ? plan.items : [];
        phase = "read";
        error = "Не удалось прочитать системное расписание напоминаний.";
        existing = await ports.read();
        assertCurrent();
        const changes = reminderChanges(items, existing, profile);
        phase = "write";
        error = "Не удалось удалить прежние напоминания. Повторите обновление.";
        for (const identifier of changes.cancel) {
          assertCurrent();
          await ports.cancel(identifier);
        }
        error = "Не удалось добавить все напоминания. Повторите обновление.";
        for (const item of changes.schedule) {
          assertCurrent();
          await ports.schedule(item, profile);
        }
        assertCurrent();
        phase = "read";
        existing = undefined;
        error = "Не удалось проверить обновлённое системное расписание.";
        existing = await ports.read();
        assertCurrent();
        phase = "verify";
        error =
          "Системное расписание не совпало с планом. Повторите обновление.";
        const remaining = reminderChanges(items, existing, profile);
        if (remaining.cancel.length || remaining.schedule.length)
          throw new Error(error);
        const verified = {
          profile,
          syncedAt: ports.now().getTime(),
          windowEnd: plan.windowEnd,
        };
        if (!enabled)
          return { ...verified, status: "off", count: 0, truncated: false };
        if (access !== "allowed")
          return {
            ...verified,
            status: "denied",
            count: 0,
            truncated: false,
            deniedReason: access,
          };
        return {
          ...verified,
          status: "ready",
          ...observed(existing, profile),
          truncated: plan.truncated,
          ...(plan.firstOmittedAt !== undefined
            ? { firstOmittedAt: plan.firstOmittedAt }
            : {}),
        };
      } catch {
        // After a partial mutation the pre-write snapshot is no longer factual.
        // Keep the original operation error if this recovery read also fails.
        if (phase === "write" || phase === "access" || phase === "plan") {
          existing = undefined;
          try {
            existing = await ports.read();
          } catch {
            error += " Состояние очереди проверить не удалось.";
          }
        }
        return {
          status: "error",
          profile,
          ...(existing ? observed(existing, profile) : { count: null }),
          truncated: plan?.truncated ?? false,
          ...(plan ? { windowEnd: plan.windowEnd } : {}),
          ...(plan?.firstOmittedAt !== undefined
            ? { firstOmittedAt: plan.firstOmittedAt }
            : {}),
          error,
        };
      }
    });
  }

  function clear(profile?: FinanceProfile): Promise<void> {
    clearGeneration++;
    return enqueue(async () => {
      const selected = (item: ScheduledReminder) =>
        isLadReminder(item) &&
        (!profile ||
          item.content.data?.profile === profile ||
          item.identifier.startsWith(`lad.${profile}.`));
      const existing = await ports.read();
      for (const identifier of new Set(
        existing.filter(selected).map((item) => item.identifier),
      ))
        await ports.cancel(identifier);
      const remaining = await ports.read();
      if (remaining.some(selected))
        throw new Error("Не удалось полностью очистить напоминания Лада.");
      await ports.clearResponse(profile);
    });
  }

  return { synchronize, clear };
}
