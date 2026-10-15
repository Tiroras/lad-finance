import { expect, test, type Page } from "@playwright/test";
import { accountBalance } from "../../src/domain/accountBalances";
import { createInitialState } from "../../src/domain/seed";
import type { FinanceState } from "../../src/domain/types";
import {
  ACTIVE_PROFILE_KEY,
  PROFILE_KEYS,
  readState,
  startApp,
  openProfiles,
  switchProfile,
} from "./helpers";

const TODAY = "2026-09-10";
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });

async function openData(page: Page) {
  await button(page, "Профиль и настройки").click();
  await button(page, "Данные и копии").click();
}

async function addIncome(page: Page, title: string, amount: string) {
  const before = await readState(page);
  await button(page, "Добавить операцию").click();
  await page.getByRole("tab", { name: "Доход", exact: true }).click();
  await page.getByLabel("Название операции", { exact: true }).fill(title);
  await page.getByLabel("Сумма операции", { exact: true }).fill(amount);
  await button(page, "Добавить операцию").click();
  await expect
    .poll(async () => (await readState(page)).transactions.length)
    .toBe(before.transactions.length + 1);
}

async function restore(page: Page, state: FinanceState) {
  await openData(page);
  const choosing = page.waitForEvent("filechooser");
  await button(page, "Восстановить из файла").click();
  await (
    await choosing
  ).setFiles({
    name: "profile.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(state)),
  });
  await button(page, "Заменить данные этой копией").click();
  await expect(page.getByTestId("import-result-status")).toHaveText(
    "Импорт сохранён и проверен чтением.",
  );
  await button(page, "Закрыть").click();
  await expect
    .poll(async () => (await readState(page)).settings.name)
    .toBe(state.settings.name);
}

test.beforeEach(async ({ page }) => {
  await page.route("https://api.frankfurter.dev/**", (route) => route.abort());
});

test("the demo option enables independent profiles whose balances and histories survive switching and reloads", async ({
  page,
}, testInfo) => {
  await startApp(page, TODAY);
  const personalFirst = await readState(page);
  expect(personalFirst.demo).toBe(false);
  expect(personalFirst.transactions).toEqual([]);
  expect(
    personalFirst.accounts.every((account) => account.openingBalance === 0),
  ).toBe(true);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), ACTIVE_PROFILE_KEY),
  ).toBe("personal");
  await expect(button(page, "Посмотреть пример")).toHaveCount(0);
  await switchProfile(page, "Демо");
  const initial = await readState(page);
  expect(initial.demo).toBe(true);
  expect(initial.transactions.length).toBeGreaterThan(0);
  await expect(
    button(page, "Текущий профиль: Демо. Открыть профили"),
  ).toBeVisible();
  await addIncome(page, "Доход в примере", "123,45");
  const demo = await readState(page);
  expect(accountBalance(demo, "card", TODAY)).toBe(
    accountBalance(initial, "card", TODAY) + 12345,
  );
  await switchProfile(page, "Личный");
  const empty = await readState(page);
  expect(empty.transactions).toEqual([]);
  expect(empty.accounts.every((account) => account.openingBalance === 0)).toBe(
    true,
  );
  await addIncome(page, "Личный доход", "678,90");
  const personal = await readState(page);
  expect(accountBalance(personal, "card", TODAY)).toBe(67890);
  expect(personal.transactions.map((transaction) => transaction.title)).toEqual(
    ["Личный доход"],
  );
  expect(await readState(page, "demo")).toEqual(demo);
  await page.reload();
  await expect(button(page, "Профиль и настройки")).toBeVisible();
  expect(await readState(page)).toEqual(personal);
  await switchProfile(page, "Демо");
  expect(await readState(page)).toEqual(demo);
  await page.reload();
  await expect(
    button(page, "Текущий профиль: Демо. Открыть профили"),
  ).toBeVisible();
  expect(await readState(page)).toEqual(demo);
  expect(await readState(page, "personal")).toEqual(personal);
  await switchProfile(page, "Личный");
  expect(await readState(page)).toEqual(personal);
  await openProfiles(page);
  await page.setViewportSize({ width: 320, height: 740 });
  await button(page, "Открыть профиль: Демо").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("profile-switch-320.png"),
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("restoring and resetting affect only the current profile and retain its identity", async ({
  page,
}) => {
  await startApp(page, TODAY);
  await addIncome(page, "Личный остаток", "1000");
  const personal = await readState(page);
  await switchProfile(page, "Демо");
  const backup = createInitialState(false, TODAY);
  backup.settings.name = "Восстановленный пример";
  backup.settings.exchange = { automatic: false, rates: {} };
  backup.accounts[0].openingBalance = 456789;
  await restore(page, backup);
  expect(await readState(page)).toEqual({ ...backup, demo: true });
  expect(await readState(page, "personal")).toEqual(personal);
  await openData(page);
  await button(page, "Обновить пример").click();
  expect(await readState(page)).toEqual({ ...backup, demo: true });
  await button(page, "Отмена").click();
  expect(await readState(page)).toEqual({ ...backup, demo: true });
  await button(page, "Обновить пример").click();
  await button(page, "Да, обновить пример").click();
  await expect
    .poll(async () => (await readState(page)).transactions.length)
    .toBeGreaterThan(0);
  const demo = await readState(page);
  expect(demo.demo).toBe(true);
  expect(await readState(page, "personal")).toEqual(personal);
  await switchProfile(page, "Личный");
  await openData(page);
  await button(page, "Очистить учёт").click();
  expect(await readState(page)).toEqual(personal);
  await button(page, "Да, начать с пустых счетов").click();
  await expect
    .poll(async () => (await readState(page)).transactions.length)
    .toBe(0);
  expect((await readState(page)).demo).toBe(false);
  expect(await readState(page, "demo")).toEqual(demo);
  await page.reload();
  await expect(button(page, "Профиль и настройки")).toBeVisible();
  expect((await readState(page)).transactions).toEqual([]);
  expect(await readState(page, "demo")).toEqual(demo);
});

test("a corrupt target profile leaves the active profile, preference and both stored records untouched", async ({
  page,
}) => {
  await startApp(page, TODAY);
  await switchProfile(page, "Демо");
  await addIncome(page, "Запись перед переключением", "432,10");
  const before = await readState(page);
  const broken = "broken-personal-profile";
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), {
    key: PROFILE_KEYS.personal,
    raw: broken,
  });
  await openProfiles(page);
  await button(page, "Открыть профиль: Личный").click();
  await expect(
    page.getByRole("alert").filter({ hasText: /Не удалось прочитать/ }),
  ).toBeVisible();
  expect(await readState(page)).toEqual(before);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), ACTIVE_PROFILE_KEY),
  ).toBe("demo");
  expect(
    await page.evaluate(
      (key) => localStorage.getItem(key),
      PROFILE_KEYS.personal,
    ),
  ).toBe(broken);
  await page.reload();
  await expect(
    button(page, "Текущий профиль: Демо. Открыть профили"),
  ).toBeVisible();
  expect(await readState(page)).toEqual(before);
  expect(
    await page.evaluate(
      (key) => localStorage.getItem(key),
      PROFILE_KEYS.personal,
    ),
  ).toBe(broken);
});
