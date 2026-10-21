import { createInitialState } from "../../src/domain/seed";
import { encodeBackup } from "../../src/domain/backup";

export function install() {
  if (sessionStorage.getItem("t08-installed")) return;
  const state = createInitialState(false, "2026-10-20");
  state.settings.onboardingCompleted = true;
  state.settings.exchange = { automatic: false, rates: {} };
  state.settings.reminders = { enabled: true, daysBefore: 3, hour: 9 };
  localStorage.setItem(
    "lad-profile-personal:lad-finance-v1",
    encodeBackup(state),
  );
  localStorage.setItem("lad-active-profile-v1", "personal");
  sessionStorage.setItem("t08-installed", "true");
}
