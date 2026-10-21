import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import {
  ReminderProvider,
  useReminders,
} from "../../src/features/payments/model/ReminderProvider";
import { ReminderSettings } from "../../src/features/payments/components/ReminderSettings";
import { ReminderQueueStatus } from "../../src/features/payments/components/ReminderQueueStatus";
import type { ReminderStatus } from "../../src/infrastructure/notifications/notifications.types";
import {
  resetEnvironment,
  NOW,
  TODAY,
  observations,
} from "./t08ReminderUiStubs";

export {
  activate,
  changeEnvironment,
  changeFinanceState,
  observations,
  rejectSync,
  resolvePermission,
  resolveSync,
  setPermission,
  SECOND_PROFILE,
} from "./t08ReminderUiStubs";

let root: Root;
let current: ReturnType<typeof useReminders> | undefined;
let standalone: {
  profileName: string;
  result: ReminderStatus | null;
  error: string;
  updating: boolean;
  lastSuccessAt?: number;
} | null = null;
let retries = 0;

function Probe() {
  current = useReminders();
  return null;
}
function Contents() {
  return (
    <main
      style={{
        maxWidth: 560,
        margin: "0 auto",
        padding: 24,
        boxSizing: "border-box",
      }}
    >
      {standalone ? (
        <ReminderQueueStatus
          {...standalone}
          retry={() => {
            retries += 1;
          }}
        />
      ) : (
        <ReminderProvider>
          <Probe />
          <ReminderSettings />
        </ReminderProvider>
      )}
    </main>
  );
}
function render() {
  flushSync(() => root.render(<Contents />));
}
export function mount(
  options: { enabled?: boolean; profileName?: string; ready?: boolean } = {},
) {
  if (root) flushSync(() => root.unmount());
  current = undefined;
  standalone = null;
  retries = 0;
  document.body.innerHTML = "";
  document.body.style.margin = "0";
  document.body.style.background = "#F8F9F5";
  const node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  resetEnvironment(render, options);
  render();
}
export function snapshot() {
  return {
    ...observations(),
    context: current
      ? {
          result: current.result,
          error: current.error,
          updating: current.updating,
          lastSuccessAt: current.lastSuccessAt,
        }
      : null,
    retries,
  };
}
export function retry() {
  current?.retry();
}
type ReadyStatus = Extract<ReminderStatus, { status: "ready" }>;
type ErrorStatus = Extract<ReminderStatus, { status: "error" }>;
type DeniedStatus = Extract<ReminderStatus, { status: "denied" }>;

export function readyResult(
  overrides: Partial<Omit<ReadyStatus, "status">> = {},
): ReadyStatus {
  return {
    status: "ready",
    profile: "personal",
    count: 60,
    truncated: true,
    syncedAt: NOW,
    lastNotificationAt: new Date(`${TODAY}T15:00:00+04:00`).getTime(),
    firstOmittedAt: new Date(`${TODAY}T15:00:00+04:00`).getTime(),
    windowEnd: "2026-12-18",
    ...overrides,
  };
}
export function offResult(): Extract<ReminderStatus, { status: "off" }> {
  return {
    status: "off",
    profile: "personal",
    count: 0,
    truncated: false,
    syncedAt: NOW,
    windowEnd: "2026-12-18",
  };
}
export function errorResult(
  overrides: Pick<ErrorStatus, "error"> &
    Partial<Omit<ErrorStatus, "status" | "error">>,
): ErrorStatus {
  return {
    status: "error",
    profile: "personal",
    count: null,
    truncated: true,
    windowEnd: "2026-12-18",
    ...overrides,
  };
}
export function deniedResult(
  deniedReason: DeniedStatus["deniedReason"],
): DeniedStatus {
  return { ...offResult(), status: "denied", deniedReason };
}
export function showStatus(
  options: Partial<NonNullable<typeof standalone>> = {},
) {
  standalone = {
    profileName: "Личный",
    result: readyResult(),
    error: "",
    updating: false,
    ...options,
  };
  render();
}
