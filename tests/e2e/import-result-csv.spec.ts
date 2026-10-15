import { expect, test, type Page } from "@playwright/test";
import type { FinanceState } from "../../src/domain/types";
import { bundleBrowserModule } from "./browserBundle";
import { PROFILE_KEYS, readState, startApp, openProfiles } from "./helpers";

const TODAY = "2026-10-15";
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const csv =
  "Дата;Описание;Сумма;Валюта;ID\n15.10.2026;Кофе из CSV;-320,50;RUB;a\n15.10.2026;Зарплата CSV;10000;RUB;b\n15.10.2026;Покупка USD;-5;USD;c\n15.10.2026;Кофе из CSV;-320,50;RUB;a";
type StorageControl = {
  mode: "normal" | "reject" | "commit-then-throw" | "read-error";
  writes: number;
  attempts: string[];
};
type BrowserWindow = typeof globalThis & { __t03Storage: StorageControl };

async function start(page: Page) {
  await page.goto("about:blank");
  await page.addScriptTag({
    content: await bundleBrowserModule("tests/helpers/t03CsvUiFixture.ts"),
  });
  const fixture = await page.evaluate(() =>
    (
      globalThis as unknown as {
        __browserTestModule: { createT03PersonalFixture(): FinanceState };
      }
    ).__browserTestModule.createT03PersonalFixture(),
  );
  await page.route("https://api.frankfurter.dev/**", (route) => route.abort());
  await startApp(page, TODAY, fixture);
}
async function openData(page: Page) {
  await button(page, "Профиль и настройки").click();
  await button(page, "Данные и копии").click();
}
async function preview(page: Page) {
  await openData(page);
  await button(page, "Импортировать банковский CSV").click();
  const chooser = page.waitForEvent("filechooser");
  await button(page, "Выбрать CSV-файл").click();
  await (
    await chooser
  ).setFiles({
    name: "statement.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await button(page, "Распознать колонки").click();
  await button(page, "Проверить операции").click();
  await expect(
    page.getByText("Новых выбрано: 2 · повторов: 1 · требуют исправления: 1", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: "Импортировать строку 3", exact: true })
    .click();
}
async function installFault(page: Page, mode: StorageControl["mode"]) {
  await page.evaluate(
    ({ key, mode }) => {
      const control: StorageControl = { mode, writes: 0, attempts: [] };
      (globalThis as BrowserWindow).__t03Storage = control;
      const set = Storage.prototype.setItem;
      const get = Storage.prototype.getItem;
      Storage.prototype.setItem = function (name, value) {
        if (this === localStorage && name === key) {
          control.writes++;
          control.attempts.push(value);
          if (control.mode === "reject")
            throw new DOMException(
              "T03 injected write rejection",
              "QuotaExceededError",
            );
          if (control.mode === "commit-then-throw") {
            set.call(this, name, value);
            throw new DOMException(
              "T03 write acknowledgement lost",
              "QuotaExceededError",
            );
          }
        }
        return set.call(this, name, value);
      };
      Storage.prototype.getItem = function (name) {
        if (
          this === localStorage &&
          name === key &&
          control.mode === "read-error"
        )
          throw new Error("T03 read rejected");
        return get.call(this, name);
      };
    },
    { key: PROFILE_KEYS.personal, mode },
  );
}
async function setMode(page: Page, mode: StorageControl["mode"]) {
  await page.evaluate((mode) => {
    (globalThis as BrowserWindow).__t03Storage.mode = mode;
  }, mode);
}
async function control(page: Page) {
  return page.evaluate(() => (globalThis as BrowserWindow).__t03Storage);
}
async function expectConfirmed(page: Page) {
  await expect(page.getByTestId("import-result-status")).toHaveText(
    "Импорт сохранён и проверен чтением.",
  );
  await expect(page.getByTestId("import-row-summary")).toContainText(
    "Добавлено операций: 1",
  );
}
async function expectPending(page: Page) {
  await expect(page.getByTestId("import-result-status")).toHaveText(
    "Изменения применены в памяти, запись на устройстве не подтверждена.",
  );
  await expect(button(page, "Повторить сохранение импорта")).toBeEnabled();
}

test("T03: CSV result has exact counts; history survives closing and profile change without replay", async ({
  page,
}, testInfo) => {
  await start(page);
  await preview(page);
  await button(page, "Импортировать 1 операций").click();
  await expectConfirmed(page);
  await expect(page.getByTestId("import-row-summary")).toContainText(
    "Строк данных в файле: 4",
  );
  await expect(page.getByTestId("import-row-summary")).toContainText(
    "ошибок — 1, повторов — 1, исключено вами — 1",
  );
  await expect(page.getByText("9 679,50 ₽", { exact: true })).toBeVisible();
  const saved = await readState(page);
  expect(saved.transactions).toHaveLength(1);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`csv-result-${width}.png`),
      fullPage: true,
    });
  }
  await button(page, "Закрыть").click();
  await openProfiles(page);
  await button(page, "Добавить профиль").click();
  await page
    .getByRole("textbox", { name: "Название профиля", exact: true })
    .fill("Семейный T03");
  await button(page, "Создать профиль").click();
  await expect(
    button(page, "Текущий профиль: Семейный T03. Открыть профили"),
  ).toBeVisible();
  await openData(page);
  await button(page, "Результаты импорта").click();
  await page
    .getByRole("button", { name: /^Открыть результат импорта: Личный,/ })
    .click();
  await expectConfirmed(page);
  await expect(
    page.getByText("Профиль: Личный", { exact: true }),
  ).toBeVisible();
  expect(await readState(page, "personal")).toEqual(saved);
  expect((await readState(page)).transactions).toHaveLength(0);
});

test("T03: rejected save keeps a pending result, blocks profile changes, and retries the same IDs", async ({
  page,
}) => {
  await start(page);
  await preview(page);
  await installFault(page, "reject");
  await button(page, "Импортировать 1 операций").click();
  await expectPending(page);
  const failed = await control(page);
  expect(failed.writes).toBe(1);
  expect((await readState(page)).transactions).toHaveLength(0);
  await button(page, "Закрыть").click();
  await openProfiles(page);
  await expect(button(page, "Добавить профиль")).toBeDisabled();
  await button(page, "Закрыть").click();
  await button(page, "Открыть неподтверждённый результат импорта").click();
  await expectPending(page);
  await setMode(page, "normal");
  await button(page, "Повторить сохранение импорта").click();
  await expectConfirmed(page);
  const retried = await control(page);
  expect(retried.writes).toBe(2);
  expect(retried.attempts[1]).toBe(retried.attempts[0]);
  expect((await readState(page)).transactions).toHaveLength(1);
  await page.reload();
  await expect(button(page, "Профиль и настройки")).toBeVisible();
  expect((await readState(page)).transactions).toHaveLength(1);
});

test("T03: ambiguous commit is confirmed by read on retry without a second write", async ({
  page,
}) => {
  await start(page);
  await preview(page);
  await installFault(page, "commit-then-throw");
  await button(page, "Импортировать 1 операций").click();
  await expectPending(page);
  expect((await readState(page)).transactions).toHaveLength(1);
  await setMode(page, "normal");
  await button(page, "Повторить сохранение импорта").click();
  await expectConfirmed(page);
  expect((await control(page)).writes).toBe(1);
  expect((await readState(page)).transactions).toHaveLength(1);
});

test("T03: device snapshot escape requires confirmation and never writes, including failed reads", async ({
  page,
}) => {
  await start(page);
  await preview(page);
  await installFault(page, "reject");
  await button(page, "Импортировать 1 операций").click();
  await expectPending(page);
  const before = await readState(page);
  await button(page, "Открыть сохранённый снимок устройства").click();
  await button(page, "Отмена").click();
  await expectPending(page);
  expect((await control(page)).writes).toBe(1);
  await button(page, "Открыть сохранённый снимок устройства").click();
  await setMode(page, "read-error");
  await button(page, "Да, открыть сохранённый снимок").click();
  await expectPending(page);
  expect((await control(page)).writes).toBe(1);
  await setMode(page, "normal");
  await button(page, "Открыть сохранённый снимок устройства").click();
  await button(page, "Да, открыть сохранённый снимок").click();
  await expect(page.getByTestId("import-result-status")).toHaveText(
    "Открыт сохранённый снимок устройства.",
  );
  await expect(
    page.getByText("Открытый снимок устройства", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Сводка первоначальной попытки импорта", { exact: true }),
  ).toBeVisible();
  expect(await readState(page)).toEqual(before);
  await button(page, "Закрыть").click();
  await page.clock.runFor(1000);
  expect((await control(page)).writes).toBe(1);
  expect(await readState(page)).toEqual(before);
});

test("T03: closing CSV preview applies nothing", async ({ page }) => {
  await start(page);
  const before = await readState(page);
  await preview(page);
  await button(page, "Закрыть").click();
  expect(await readState(page)).toEqual(before);
  await openData(page);
  await button(page, "Результаты импорта").click();
  await expect(
    page.getByText("В этом запуске импорт ещё не выполнялся.", { exact: true }),
  ).toBeVisible();
});
