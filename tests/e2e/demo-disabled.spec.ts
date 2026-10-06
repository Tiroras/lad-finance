import { expect, test, type Page } from "@playwright/test";
import { accountBalance } from "../../src/domain/accountBalances";
import { saveTransaction } from "../../src/domain/actions/transactions";
import { createInitialState } from "../../src/domain/seed";
import { backupCrypto } from "../../src/infrastructure/crypto/backupCrypto";
import { encryptBackup } from "../../src/infrastructure/crypto/passwordBackup";
import {
  pickDate,
  readState,
  startApp,
  PROFILE_KEYS,
  ACTIVE_PROFILE_KEY,
  openProfiles,
} from "./helpers";

const TODAY = "2026-09-10";
const DEMO_BACKUP_ERROR =
  "В этой копии сохранён демонстрационный учёт. Эта версия приложения поддерживает только личный учёт. Выберите копию своих данных.";
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const readRaw = (page: Page) =>
  page.evaluate((key) => localStorage.getItem(key), PROFILE_KEYS.personal);

function personalFixture() {
  const state = createInitialState(false, TODAY);
  state.settings.name = "Личный учёт";
  state.settings.exchange = { automatic: false, rates: {} };
  state.accounts[0].openingBalance = 1000000;
  return saveTransaction(
    state,
    {
      type: "expense",
      title: "Своя покупка",
      amount: 1234,
      date: TODAY,
      accountId: "card",
      category: "groceries",
    },
    TODAY,
  );
}

async function startWithRaw(page: Page, raw: string) {
  await page.clock.install({ time: new Date(`${TODAY}T12:00:00+04:00`) });
  await page.addInitScript(
    ({ key, initial }) => {
      if (localStorage.getItem(key) === null)
        localStorage.setItem(key, initial);
    },
    { key: PROFILE_KEYS.personal, initial: raw },
  );
  await page.goto("/");
}

async function pickBackup(
  page: Page,
  label: string,
  raw: string,
  encrypted = false,
) {
  const choosing = page.waitForEvent("filechooser");
  await button(page, label).click();
  await (
    await choosing
  ).setFiles({
    name: encrypted ? "demo.ladbackup" : "demo.json",
    mimeType: encrypted ? "application/octet-stream" : "application/json",
    buffer: Buffer.from(raw),
  });
}

test.beforeEach(async ({ page }) => {
  // Keep first-run snapshots independent of the external exchange-rate service.
  await page.route("https://api.frankfurter.dev/**", (route) => route.abort());
});

test("without the flag a clean launch creates empty personal accounts and hides demo entry points", async ({
  page,
}, testInfo) => {
  await startApp(page, TODAY);
  const state = await readState(page);
  expect(state.demo).toBe(false);
  expect(state.settings.onboardingCompleted).toBe(true);
  expect(state.transactions).toEqual([]);
  expect(state.goals).toEqual([]);
  expect(state.recurring).toEqual([]);
  expect(state.plannedIncomes ?? []).toEqual([]);
  expect(state.scenarios ?? []).toEqual([]);
  expect(state.accounts.every((account) => account.openingBalance === 0)).toBe(
    true,
  );
  expect(state.categories.every((category) => category.budget === 0)).toBe(
    true,
  );
  expect(state.settings.buffer).toBe(0);
  await expect(button(page, "Настроить свой учёт")).toHaveCount(0);
  await expect(button(page, "Посмотреть пример")).toHaveCount(0);
  await expect(
    button(page, "Текущий профиль: Демо. Открыть профили"),
  ).toHaveCount(0);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`personal-welcome-${width}.png`),
      animations: "disabled",
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await button(page, "Профиль и настройки").click();
  await button(page, "Данные и копии").click();
  await expect(button(page, "Очистить учёт")).toBeVisible();
  await button(page, "Закрыть").click();
  await openProfiles(page);
  await expect(button(page, "Открыть профиль: Личный")).toBeDisabled();
  await expect(button(page, "Открыть профиль: Демо")).toHaveCount(0);
  await expect(button(page, "Добавить профиль")).toBeVisible();
});

test("personal onboarding commits only after the fourth step and preserves the entered balances after reload", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const initial = createInitialState(false, TODAY);
  initial.settings.onboardingCompleted = false;
  initial.settings.exchange = { automatic: false, rates: {} };
  await startApp(page, TODAY, initial);
  const before = await readState(page);
  await button(page, "Настроить свой учёт").click();
  await page.getByLabel("Ваше имя", { exact: true }).fill("Анна");
  await page
    .getByLabel("Название основного счёта", { exact: true })
    .fill("Мой счёт");
  await page.getByLabel("Начальный остаток", { exact: true }).fill("10000");
  await page.getByLabel("Начальные накопления", { exact: true }).fill("2000");
  await button(page, "Продолжить").click();
  await page.getByLabel("Доход при настройке", { exact: true }).fill("5000");
  await pickDate(page, "Дата первого дохода", "2026-09-15");
  await button(page, "Продолжить").click();
  await page.getByLabel("Платёж при настройке", { exact: true }).fill("2500");
  await pickDate(page, "Дата первого платежа", "2026-09-18");
  await button(page, "Продолжить").click();
  await page.getByLabel("Резерв при настройке", { exact: true }).fill("1000");
  expect(await readState(page)).toEqual(before);
  await expect(page.getByText(/заменит демонстрационные записи/)).toHaveCount(
    0,
  );
  await page.screenshot({
    path: testInfo.outputPath("personal-onboarding-confirmation-320.png"),
    animations: "disabled",
  });
  await button(page, "Начать учёт с этими данными").click();
  await expect
    .poll(async () => (await readState(page)).settings.onboardingCompleted)
    .toBe(true);
  const state = await readState(page);
  expect(state.demo).toBe(false);
  expect(state.transactions).toHaveLength(0);
  expect(state.goals).toHaveLength(0);
  expect(accountBalance(state, "card", TODAY)).toBe(1000000);
  expect(accountBalance(state, "savings", TODAY)).toBe(200000);
  expect(state.plannedIncomes).toHaveLength(1);
  expect(state.plannedIncomes?.[0].amount).toBe(500000);
  expect(state.recurring).toHaveLength(1);
  expect(state.recurring[0].amount).toBe(250000);
  expect(state.settings.buffer).toBe(100000);
  await page.reload();
  await expect(page.getByText("Анна, всё на виду.")).toBeVisible();
  expect(await readState(page)).toEqual(state);
  await expect(button(page, "Настроить свой учёт")).toHaveCount(0);
});

test("an ordinary launch ignores legacy data and the saved demo preference without blocking personal setup", async ({
  page,
}) => {
  const demo = createInitialState(true, TODAY);
  demo.settings.exchange = { automatic: false, rates: {} };
  const original = JSON.stringify(demo);
  const legacy = JSON.stringify(personalFixture());
  // Both old shared storage and the independent demo profile may be present.
  await page.addInitScript(
    ({ active, demoKey, raw, old }) => {
      if (!localStorage.getItem("profile-fixture-installed")) {
        localStorage.setItem("lad-finance-v1", old);
        localStorage.setItem(demoKey, raw);
        localStorage.setItem(active, "demo");
        localStorage.setItem("profile-fixture-installed", "1");
      }
    },
    {
      active: ACTIVE_PROFILE_KEY,
      demoKey: PROFILE_KEYS.demo,
      raw: original,
      old: legacy,
    },
  );
  await startApp(page, TODAY);
  const personal = await readState(page);
  expect(personal.demo).toBe(false);
  expect(personal.transactions).toEqual([]);
  expect(
    personal.accounts.every((account) => account.openingBalance === 0),
  ).toBe(true);
  await expect(button(page, "Настроить свой учёт")).toBeVisible();
  await expect(button(page, "Сохранить копию прежних данных")).toHaveCount(0);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), ACTIVE_PROFILE_KEY),
  ).toBe("personal");
  expect(
    await page.evaluate(() => localStorage.getItem("lad-finance-v1")),
  ).toBe(legacy);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), PROFILE_KEYS.demo),
  ).toBe(original);
  await page.reload();
  await expect(button(page, "Настроить свой учёт")).toBeVisible();
  expect(await readState(page)).toEqual(personal);
});

test("existing personal records load unchanged without showing the initial setup", async ({
  page,
}) => {
  const personal = personalFixture();
  await startApp(page, TODAY, personal);
  await expect(page.getByText("Личный учёт, всё на виду.")).toBeVisible();
  await expect(button(page, "Настроить свой учёт")).toHaveCount(0);
  expect(await readState(page)).toEqual(personal);
  expect(accountBalance(await readState(page), "card", TODAY)).toBe(998766);
  await page.evaluate(
    (key) => localStorage.setItem(key, "demo"),
    ACTIVE_PROFILE_KEY,
  );
  await page.reload();
  await expect(page.getByText("Личный учёт, всё на виду.")).toBeVisible();
  expect(await readState(page)).toEqual(personal);
});

test("plain and password-protected demo imports are rejected without changing personal records", async ({
  page,
}) => {
  const personal = personalFixture();
  await startApp(page, TODAY, personal);
  await button(page, "Профиль и настройки").click();
  await button(page, "Данные и копии").click();
  const demo = createInitialState(true, TODAY);
  await pickBackup(page, "Восстановить из файла", JSON.stringify(demo));
  await expect(
    page.getByText(DEMO_BACKUP_ERROR, { exact: true }),
  ).toBeVisible();
  await expect(button(page, "Заменить данные этой копией")).toHaveCount(0);
  expect(await readState(page)).toEqual(personal);
  const password = "Пароль демо-копии 2026";
  await pickBackup(
    page,
    "Восстановить из файла",
    await encryptBackup(demo, password, backupCrypto),
    true,
  );
  await page
    .getByLabel("Пароль для восстановления", { exact: true })
    .fill(password);
  await button(page, "Открыть защищённую копию").click();
  await expect(
    page.getByText(DEMO_BACKUP_ERROR, { exact: true }),
  ).toBeVisible();
  await expect(button(page, "Заменить данные этой копией")).toHaveCount(0);
  expect(await readState(page)).toEqual(personal);
});

test("recovery rejects both demo backup formats and preserves the unreadable original", async ({
  page,
}) => {
  const broken = "unreadable-original-ledger";
  await startWithRaw(page, broken);
  await expect(
    page.getByText(/Не удалось прочитать сохранённые данные/),
  ).toBeVisible();
  const demo = createInitialState(true, TODAY);
  await pickBackup(
    page,
    "Выбрать копию для восстановления",
    JSON.stringify(demo),
  );
  await expect(
    page.getByText(DEMO_BACKUP_ERROR, { exact: true }),
  ).toBeVisible();
  await expect(
    button(page, "Подтвердить восстановление хранилища"),
  ).toHaveCount(0);
  expect(await readRaw(page)).toBe(broken);
  const password = "Пароль восстановления 2026";
  await pickBackup(
    page,
    "Выбрать копию для восстановления",
    await encryptBackup(demo, password, backupCrypto),
    true,
  );
  await page
    .getByLabel("Пароль для восстановления", { exact: true })
    .fill(password);
  await button(page, "Открыть защищённую копию").click();
  await expect(
    page.getByText(DEMO_BACKUP_ERROR, { exact: true }),
  ).toBeVisible();
  await expect(
    button(page, "Подтвердить восстановление хранилища"),
  ).toHaveCount(0);
  expect(await readRaw(page)).toBe(broken);
});
