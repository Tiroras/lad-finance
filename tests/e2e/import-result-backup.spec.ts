import { expect, test, type Page } from "@playwright/test";
import { bundleBrowserModule } from "./browserBundle";
import type * as FixtureModule from "../helpers/t03BackupUiFixture";

type FixtureWindow = typeof globalThis & {
  __browserTestModule: typeof FixtureModule;
};
const TODAY = "2026-10-15";
const PERSONAL = "lad-profile-personal:lad-finance-v1";
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
let fixtureBundle: string;

test.beforeAll(async () => {
  fixtureBundle = await bundleBrowserModule(
    "tests/helpers/t03BackupUiFixture.ts",
  );
});

test.beforeEach(async ({ page }) => {
  await page.route("https://api.frankfurter.dev/**", (route) => route.abort());
  await page.clock.install({ time: new Date(`${TODAY}T12:00:00+04:00`) });
});

async function start(page: Page, broken = false) {
  // Playwright does not define ordering between separate init scripts.
  await page.addInitScript({
    content: `${fixtureBundle}\n;globalThis.__browserTestModule = __browserTestModule; __browserTestModule.installFixture(${JSON.stringify({ today: TODAY, broken })});`,
  });
  await page.goto("/");
  await expect(
    button(
      page,
      broken ? "Выбрать копию для восстановления" : "Профиль и настройки",
    ),
  ).toBeVisible();
  await page.evaluate(() =>
    (globalThis as FixtureWindow).__browserTestModule.beginObservation(),
  );
}
async function openData(page: Page) {
  await button(page, "Профиль и настройки").click();
  await button(page, "Данные и копии").click();
}
async function chooseBackup(page: Page, label = "Восстановить из файла") {
  const text = await page.evaluate(() =>
    (globalThis as FixtureWindow).__browserTestModule.backupText(),
  );
  const chooser = page.waitForEvent("filechooser");
  await button(page, label).click();
  await (
    await chooser
  ).setFiles({
    name: "t03-linked-copy.json",
    mimeType: "application/json",
    buffer: Buffer.from(text),
  });
}
async function expectConfirmedSummary(
  page: Page,
  mode: "replace" | "new-profile",
) {
  const result = page.getByRole("dialog");
  await expect(result.getByTestId("import-result-status")).toHaveText(
    "Импорт сохранён и проверен чтением.",
  );
  await expect(
    result.getByText(
      mode === "replace" ? "JSON · Замена учёта" : "JSON · Новый профиль",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    result.getByText("Сводка импорта", { exact: true }),
  ).toBeVisible();
  await expect(
    result.getByText(
      /Счета: 3 · Операции: 5 · Категории: 8 · Цели: 1 · Планы платежей: 1 · Планы доходов: 1/,
    ),
  ).toBeVisible();
  await expect(
    result.getByText(/2\s*280(?:[,.]00)?\s*₽/, { exact: true }),
  ).toBeVisible();
  await expect(
    result.getByText(/500(?:[,.]00)?\s*₽/, { exact: true }),
  ).toBeVisible();
}
async function writes(page: Page) {
  return page.evaluate(() =>
    (globalThis as FixtureWindow).__browserTestModule.writeAttempts(),
  );
}
async function reopenResult(page: Page, profileName: string, mode: string) {
  await button(page, "Закрыть").click();
  await openData(page);
  await button(page, "Результаты импорта").click();
  await expect(
    page.getByText("Результаты этого запуска", { exact: true }),
  ).toBeVisible();
  const entries = page.getByRole("button", {
    name: /^Открыть результат импорта:/,
  });
  await expect(entries).toHaveCount(1);
  await expect(entries).toHaveAccessibleName(
    new RegExp(`Открыть результат импорта: ${profileName}, ${mode},`),
  );
  await entries.click();
}

test("A06 JSON: confirmation replaces the full linked snapshot and its result reopens without another write", async ({
  page,
}, testInfo) => {
  await start(page);
  await openData(page);
  await chooseBackup(page);
  await expect(button(page, "Заменить данные этой копией")).toBeVisible();
  await page.evaluate(() =>
    (globalThis as FixtureWindow).__browserTestModule.assertOriginalUnchanged(),
  );
  expect(await writes(page)).toHaveLength(0);
  await button(page, "Отмена восстановления").click();
  await page.evaluate(() =>
    (globalThis as FixtureWindow).__browserTestModule.assertOriginalUnchanged(),
  );
  expect(await writes(page)).toHaveLength(0);
  await chooseBackup(page);
  await button(page, "Заменить данные этой копией").click();
  await expectConfirmedSummary(page, "replace");
  await expect(page.getByText("До применения", { exact: true })).toBeVisible();
  await page.evaluate(() =>
    (globalThis as FixtureWindow).__browserTestModule.assertImported(
      "personal",
    ),
  );
  expect(await writes(page)).toEqual([{ key: PERSONAL, succeeded: true }]);
  await reopenResult(page, "Личный", "Замена учёта");
  await expectConfirmedSummary(page, "replace");
  expect(await writes(page)).toEqual([{ key: PERSONAL, succeeded: true }]);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByTestId("import-result-status").scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`json-import-result-${width}.png`),
    });
  }
});

test("A06 new profile: a verified restore records its summary without saving the financial snapshot twice", async ({
  page,
}) => {
  await start(page);
  await openData(page);
  await chooseBackup(page);
  await button(page, "Восстановить в новый профиль").click();
  await page
    .getByLabel("Название нового профиля", { exact: true })
    .fill("Копия T03");
  await button(page, "Подготовить восстановление в новый профиль").click();
  await page.evaluate(() =>
    (globalThis as FixtureWindow).__browserTestModule.assertOriginalUnchanged(),
  );
  expect(await writes(page)).toHaveLength(0);
  await button(page, "Подтвердить создание профиля из копии").click();
  await expectConfirmedSummary(page, "new-profile");
  await expect(
    page.getByText("Профиль: Копия T03", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Создан отдельный профиль; прежние профили сохранены.", {
      exact: true,
    }),
  ).toBeVisible();
  const result = await page.evaluate(() => {
    const fixture = (globalThis as FixtureWindow).__browserTestModule;
    fixture.assertOriginalUnchanged();
    return fixture.assertImported();
  });
  expect(result.profile).toMatch(/^profile-/);
  expect(await writes(page)).toEqual([
    { key: `lad-profile-${result.profile}:lad-finance-v1`, succeeded: true },
  ]);
  await reopenResult(page, "Копия T03", "Новый профиль");
  await expectConfirmedSummary(page, "new-profile");
  expect(await writes(page)).toEqual([
    { key: `lad-profile-${result.profile}:lad-finance-v1`, succeeded: true },
  ]);
  await page.reload();
  await expect(button(page, "Профиль и настройки")).toBeVisible();
  await page.evaluate(() => {
    const fixture = (globalThis as FixtureWindow).__browserTestModule;
    fixture.assertOriginalUnchanged();
    fixture.assertImported();
  });
  await openData(page);
  await button(page, "Результаты импорта").click();
  await expect(
    page.getByText("В этом запуске импорт ещё не выполнялся.", { exact: true }),
  ).toBeVisible();
});

test("A06 recovery: a failed write exposes recovery-unconfirmed on the loading screen and retries the same copy", async ({
  page,
}, testInfo) => {
  await start(page, true);
  await chooseBackup(page, "Выбрать копию для восстановления");
  await page.evaluate(() =>
    (globalThis as FixtureWindow).__browserTestModule.setWriteFailure(true),
  );
  await button(page, "Подтвердить восстановление хранилища").click();
  await expect(page.getByTestId("import-result-status")).toHaveText(
    "Запись копии не подтверждена. Учёт в памяти ещё не заменён; состояние записи на устройстве пока неизвестно.",
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(button(page, "Профиль и настройки")).toHaveCount(0);
  await expect(
    page.getByText("Состав выбранной копии", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Прежний состав профиля недоступен для сравнения.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.evaluate(() =>
    (globalThis as FixtureWindow).__browserTestModule.assertOriginalUnchanged(),
  );
  expect(await writes(page)).toEqual([{ key: PERSONAL, succeeded: false }]);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.getByTestId("import-result-status").scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("recovery-unconfirmed-320.png"),
    fullPage: true,
  });
  await page.evaluate(() =>
    (globalThis as FixtureWindow).__browserTestModule.setWriteFailure(false),
  );
  await button(page, "Повторить сохранение импорта").click();
  await expectConfirmedSummary(page, "replace");
  await page.evaluate(() =>
    (globalThis as FixtureWindow).__browserTestModule.assertImported(
      "personal",
    ),
  );
  expect(await writes(page)).toEqual([
    { key: PERSONAL, succeeded: false },
    { key: PERSONAL, succeeded: true },
  ]);
  await reopenResult(page, "Личный", "Замена учёта");
  await expectConfirmedSummary(page, "replace");
  expect(await writes(page)).toHaveLength(2);
});
