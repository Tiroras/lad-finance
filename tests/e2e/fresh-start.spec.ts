import { expect, test } from "@playwright/test";
import { createInitialState } from "../../src/domain/seed";
import {
  ACTIVE_PROFILE_KEY,
  PROFILE_KEYS,
  PROFILE_REGISTRY_KEY,
  finishFirstRun,
  openProfiles,
  readState,
} from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-10T12:00:00+04:00") });
  await page.route("https://api.frankfurter.dev/**", (route) => route.abort());
});

test("fresh command removes saved profiles, shows welcome and resets again on full reload", async ({
  page,
}, testInfo) => {
  const initial = createInitialState(true, "2026-09-10");
  await page.addInitScript(
    ({ initial, registry, active, personal, demo }) => {
      if (sessionStorage.getItem("fresh-test-seeded")) return;
      sessionStorage.setItem("fresh-test-seeded", "true");
      localStorage.setItem(
        registry,
        JSON.stringify({
          version: 1,
          profiles: [{ id: "personal", name: "Личный" }],
        }),
      );
      localStorage.setItem(active, "demo");
      localStorage.setItem(
        personal,
        JSON.stringify({ ...initial, demo: false }),
      );
      localStorage.setItem(demo, JSON.stringify(initial));
      localStorage.setItem(
        "lad-profile-profile-550e8400-e29b-41d4-a716-446655440000:lad-finance-v1",
        "{damaged",
      );
      localStorage.setItem("lad-finance-v1", "old shared data");
      localStorage.setItem(
        "lad-learning-progress-v1",
        JSON.stringify({
          version: 1,
          status: "completed",
          step: 4,
          completed: ["accounts", "operations"],
          pages: {},
          overviewActive: false,
          overviewSpot: 2,
        }),
      );
      localStorage.setItem(
        "lad-profile-personal:lad-last-backup-prepared",
        "2026-09-10",
      );
      localStorage.setItem("another-project", "keep");
    },
    {
      initial,
      registry: PROFILE_REGISTRY_KEY,
      active: ACTIVE_PROFILE_KEY,
      ...PROFILE_KEYS,
    },
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByText("Добро пожаловать в Лад", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((key) => key.startsWith("lad-")),
    ),
  ).toEqual([]);
  expect(
    await page.evaluate(() => localStorage.getItem("another-project")),
  ).toBe("keep");
  await page.screenshot({ path: testInfo.outputPath("fresh-welcome.png") });
  await finishFirstRun(page);
  await expect(
    page.getByRole("button", { name: "Профиль и настройки", exact: true }),
  ).toBeVisible();
  const state = await readState(page);
  expect(state.demo).toBe(false);
  expect(state.transactions).toEqual([]);
  await openProfiles(page);
  expect(await readState(page)).toEqual(state);
  await page.reload();
  await expect(
    page.getByText("Добро пожаловать в Лад", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((key) => key.startsWith("lad-")),
    ),
  ).toEqual([]);
  expect(errors).toEqual([]);
});

test("reset failure blocks profile loading and can be retried", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.addInitScript((registry) => {
    localStorage.setItem(registry, "{damaged registry");
    const remove = Storage.prototype.removeItem;
    let fail = true;
    Storage.prototype.removeItem = function (key: string) {
      if (key.startsWith("lad-") && fail) {
        fail = false;
        throw new Error("test storage unavailable");
      }
      return remove.call(this, key);
    };
  }, PROFILE_REGISTRY_KEY);
  await page.goto("/");
  await expect(
    page.getByText(/Не удалось завершить подготовку или удаление данных/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Профиль и настройки", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Добро пожаловать в Лад", { exact: true }),
  ).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("fresh-retry-320.png") });
  await page
    .getByRole("button", { name: "Повторить попытку", exact: true })
    .click();
  await expect(
    page.getByText("Добро пожаловать в Лад", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("lad-profiles-v1")),
  ).toBeNull();
});
