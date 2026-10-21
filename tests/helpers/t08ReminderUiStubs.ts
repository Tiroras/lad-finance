import { createInitialState } from "../../src/domain/seed";
import { DEFAULT_REMINDERS } from "../../src/domain/reminders";
import type { FinanceProfile } from "../../src/domain/profiles";
import type { FinanceState, ReminderPreferences } from "../../src/domain/types";
import type { ReminderStatus } from "../../src/infrastructure/notifications/notifications.types";

/**
 * Browser-only seams. The provider, settings, queue status and shared controls
 * are production components. No Expo notification or native rendering API runs.
 */
export const TODAY = "2026-10-20";
export const NOW = new Date(`${TODAY}T12:00:00+04:00`).getTime();
export const SECOND_PROFILE: FinanceProfile =
  "profile-00000000-0000-4000-8000-000000000008";

type Environment = {
  state: FinanceState;
  profile: FinanceProfile;
  profileName: string;
  ready: boolean;
  switching: boolean;
};
type Call = {
  state: FinanceState;
  profile: FinanceProfile;
  resolve: (result: ReminderStatus) => void;
  reject: (error: Error) => void;
};
let environment: Environment;
let render: () => void = () => {};
let calls: Call[] = [];
let saves: Partial<ReminderPreferences>[] = [];
let permission: boolean | "error" | "pending" = true;
let permissionCompletion: ((allowed: boolean) => void) | undefined;
let permissionCalls = 0;
let settingsCalls = 0;
const listeners = new Set<(state: string) => void>();

export function resetEnvironment(
  rerender: () => void,
  options: { enabled?: boolean; profileName?: string; ready?: boolean } = {},
) {
  const state = createInitialState(false, TODAY);
  state.settings.reminders = {
    ...DEFAULT_REMINDERS,
    enabled: options.enabled ?? true,
  };
  environment = {
    state,
    profile: "personal",
    profileName: options.profileName ?? "Личный",
    ready: options.ready ?? true,
    switching: false,
  };
  render = rerender;
  calls = [];
  saves = [];
  permission = true;
  permissionCompletion = undefined;
  permissionCalls = 0;
  settingsCalls = 0;
}

export function useFinance() {
  return {
    state: environment.state,
    profile: environment.profile,
    today: TODAY,
    activeProfile: {
      id: environment.profile,
      name: environment.profileName,
    },
    profiles: [{ id: environment.profile, name: environment.profileName }],
  };
}
export function useFinanceStatus() {
  return {
    ready: environment.ready,
    switching: environment.switching,
  };
}
export function useFinanceActions() {
  return {
    saveReminderPreferences(patch: Partial<ReminderPreferences>) {
      saves.push(patch);
      environment = {
        ...environment,
        state: {
          ...environment.state,
          settings: {
            ...environment.state.settings,
            reminders: {
              ...(environment.state.settings.reminders ?? DEFAULT_REMINDERS),
              ...patch,
            },
          },
        },
      };
      render();
    },
  };
}

export function synchronizeReminders(
  state: FinanceState,
  profile: FinanceProfile,
): Promise<ReminderStatus> {
  return new Promise((resolve, reject) => {
    calls.push({ state, profile, resolve, reject });
  });
}
export async function requestReminderPermission() {
  permissionCalls += 1;
  if (permission === "error") throw new Error("Synthetic permission failure");
  if (permission === "pending")
    return new Promise<boolean>((resolve) => {
      permissionCompletion = resolve;
    });
  return permission;
}
export function resolveSync(index: number, result: ReminderStatus) {
  if (!calls[index]) throw new Error(`Missing synchronization ${index}`);
  calls[index].resolve(result);
}
export function rejectSync(index: number) {
  if (!calls[index]) throw new Error(`Missing synchronization ${index}`);
  calls[index].reject(new Error("Synthetic synchronization failure"));
}
export function setPermission(value: boolean | "error" | "pending") {
  permission = value;
}
export function resolvePermission(allowed: boolean) {
  if (!permissionCompletion) throw new Error("No pending permission request");
  permissionCompletion(allowed);
  permissionCompletion = undefined;
}
export function changeEnvironment(
  patch: Partial<Omit<Environment, "state">> & { enabled?: boolean },
) {
  const { enabled, ...rest } = patch;
  environment = { ...environment, ...rest };
  if (enabled !== undefined) {
    environment = {
      ...environment,
      state: {
        ...environment.state,
        settings: {
          ...environment.state.settings,
          reminders: {
            ...(environment.state.settings.reminders ?? DEFAULT_REMINDERS),
            enabled,
          },
        },
      },
    };
  }
  render();
}
export function changeFinanceState() {
  environment = {
    ...environment,
    state: {
      ...environment.state,
      settings: {
        ...environment.state.settings,
        buffer: environment.state.settings.buffer + 100,
      },
    },
  };
  render();
}
export function observations() {
  return {
    calls: calls.map((call) => ({
      profile: call.profile,
      enabled: call.state.settings.reminders?.enabled,
      buffer: call.state.settings.buffer,
      hour: call.state.settings.reminders?.hour,
    })),
    saves,
    permissionCalls,
    settingsCalls,
    preferences: environment.state.settings.reminders,
  };
}
export const AppState = {
  addEventListener(_event: string, listener: (state: string) => void) {
    listeners.add(listener);
    return { remove: () => listeners.delete(listener) };
  },
};
export function activate() {
  for (const listener of listeners) listener("active");
}
export const Linking = {
  async openSettings() {
    settingsCalls += 1;
  },
};
export const Platform = {
  OS: "ios",
  select<T>(options: { ios?: T; native?: T; default?: T }) {
    return options.ios ?? options.native ?? options.default;
  },
};
