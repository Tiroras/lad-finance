import { expect, type Page } from "@playwright/test";
import { createInitialState } from "../../src/domain/seed";
import type { FinanceState } from "../../src/domain/types";

export const ACTIVE_PROFILE_KEY = "lad-active-profile-v1";
export const PROFILE_KEYS = {
  personal: "lad-profile-personal:lad-finance-v1",
  demo: "lad-profile-demo:lad-finance-v1",
} as const;
export const PROFILE_REGISTRY_KEY = "lad-profiles-v1";
export type TestProfile = keyof typeof PROFILE_KEYS | `profile-${string}`;
export const profileStorageKey = (profile: TestProfile) =>
  `lad-profile-${profile}:lad-finance-v1`;

export async function activeProfile(page: Page): Promise<TestProfile> {
  const profile = await page.evaluate(
    (key) => localStorage.getItem(key),
    ACTIVE_PROFILE_KEY,
  );
  if (!profile) throw new Error("Профиль ещё не выбран.");
  return profile as TestProfile;
}

export async function activeStorageKey(page: Page) {
  return profileStorageKey(await activeProfile(page));
}

export async function pickDate(page: Page, label: string, date: string) {
  await page
    .getByRole("button", { name: `Открыть календарь: ${label}`, exact: true })
    .click();
  const calendar = page.getByTestId(`date-picker-${label}`);
  const parsed = new Date(`${date}T12:00:00`);
  const year = parsed.getFullYear();
  await calendar
    .getByRole("button", { name: "Выбрать год", exact: true })
    .click();
  const yearButton = calendar.getByRole("button", {
    name: `${year} год`,
    exact: true,
  });
  while (!(await yearButton.count())) {
    const firstYear = Number(
      await calendar
        .getByRole("button", { name: /^\d+ год$/ })
        .first()
        .innerText(),
    );
    await calendar
      .getByRole("button", {
        name: year < firstYear ? "Предыдущие годы" : "Следующие годы",
        exact: true,
      })
      .click();
  }
  await yearButton.click();
  const month = parsed.toLocaleDateString("ru-RU", { month: "long" });
  await calendar
    .getByRole("button", {
      name: month[0].toUpperCase() + month.slice(1),
      exact: true,
    })
    .click();
  await calendar
    .getByRole("button", {
      name: parsed.toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
      exact: true,
    })
    .click();
}

export async function readState(
  page: Page,
  profile?: TestProfile,
): Promise<FinanceState> {
  return page.evaluate(
    (key) => {
      const value = localStorage.getItem(key);
      if (value === null)
        throw new Error("Финансовое состояние ещё не сохранено.");
      return JSON.parse(value);
    },
    profile ? profileStorageKey(profile) : await activeStorageKey(page),
  );
}

async function waitForApp(page: Page) {
  await expect(
    page.getByRole("button", { name: "Профиль и настройки" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate((active) => {
        const profile = localStorage.getItem(active);
        return (
          profile !== null &&
          localStorage.getItem(`lad-profile-${profile}:lad-finance-v1`) !== null
        );
      }, ACTIVE_PROFILE_KEY),
    )
    .toBe(true);
}

export async function startApp(
  page: Page,
  today: string,
  state?: FinanceState,
) {
  await page.clock.install({ time: new Date(`${today}T12:00:00+04:00`) });
  if (state) {
    // Each test owns its browser context. Reloads must preserve subsequent edits.
    await page.addInitScript(
      ({ key, active, profile, initial }) => {
        if (localStorage.getItem(key) === null) {
          localStorage.setItem(key, JSON.stringify(initial));
          localStorage.setItem(active, profile);
        }
      },
      {
        key: state.demo ? PROFILE_KEYS.demo : PROFILE_KEYS.personal,
        active: ACTIVE_PROFILE_KEY,
        profile: state.demo ? "demo" : "personal",
        initial: state,
      },
    );
  }
  await page.goto("/");
  if (!state) await finishFirstRun(page);
  await waitForApp(page);
}

export async function setState(page: Page, state: FinanceState) {
  await page.evaluate(
    ({ key, active, profile, value }) => {
      localStorage.setItem(key, JSON.stringify(value));
      localStorage.setItem(active, profile);
    },
    {
      key: state.demo ? PROFILE_KEYS.demo : PROFILE_KEYS.personal,
      active: ACTIVE_PROFILE_KEY,
      profile: state.demo ? "demo" : "personal",
      value: state,
    },
  );
  await page.reload();
  await waitForApp(page);
}

// Financial examples are an explicit fixture, never an implicit first-run default.
export async function startDemoApp(page: Page, today: string) {
  const state = createInitialState(true, today);
  state.settings.exchange = { automatic: false, rates: {} };
  await startApp(page, today, state);
}

export async function openProfiles(page: Page) {
  await page
    .getByRole("button", { name: "Профиль и настройки", exact: true })
    .click();
  await page.getByRole("button", { name: "Профили", exact: true }).click();
}

export async function switchProfile(page: Page, name: string) {
  await openProfiles(page);
  await page
    .getByRole("button", { name: `Открыть профиль: ${name}`, exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await waitForApp(page);
}

// Enter through the same first-run controls as a person; no completion flag is seeded.
export async function finishFirstRun(page: Page) {
  const skip = page.getByRole("button", {
    name: "Пропустить знакомство",
    exact: true,
  });
  const profile = page.getByRole("button", {
    name: "Профиль и настройки",
    exact: true,
  });
  await expect(skip.or(profile).first()).toBeVisible();
  if (await skip.isVisible()) {
    await skip.click();
    await page
      .getByRole("button", { name: "Начать с пустым профилем", exact: true })
      .click();
  }
  await waitForApp(page);
}
