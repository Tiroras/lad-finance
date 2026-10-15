import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { bundleBrowserModule } from "./browserBundle";
import type * as Fixture from "../helpers/t03CsvUiFixture";
import { PROFILE_KEYS, startApp } from "./helpers";

type FixtureWindow = typeof globalThis & {
  __browserTestModule: typeof Fixture;
};
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const receiptKey = "lad-profile-personal:lad-csv-export-receipt-v1";
async function start(page: Page, large = true) {
  await page.goto("about:blank");
  await page.addScriptTag({
    content: await bundleBrowserModule("tests/helpers/t03CsvUiFixture.ts"),
  });
  const fixture = await page.evaluate(
    (large) =>
      large
        ? (
            globalThis as FixtureWindow
          ).__browserTestModule.createT03ExportFixture()
        : (
            globalThis as FixtureWindow
          ).__browserTestModule.createT03PersonalFixture(),
    large,
  );
  await page.route("https://api.frankfurter.dev/**", (route) => route.abort());
  await startApp(page, "2026-10-15", fixture);
  await page.addScriptTag({
    content: await bundleBrowserModule("tests/helpers/t03CsvUiFixture.ts"),
  });
  await openExport(page);
}
async function openExport(page: Page) {
  await button(page, "Профиль и настройки").click();
  await button(page, "Данные и копии").click();
  await button(page, "Экспортировать операции в CSV").click();
}
async function download(page: Page, label: string) {
  const waiting = page.waitForEvent("download");
  await button(page, label).click();
  const file = await waiting;
  const path = await file.path();
  if (!path) throw new Error("No downloaded file");
  return { name: file.suggestedFilename(), bytes: await readFile(path) };
}
async function pick(page: Page, label: string, name: string, bytes: Buffer) {
  const chooser = page.waitForEvent("filechooser");
  await button(page, label).click();
  await (await chooser).setFiles({ name, buffer: bytes, mimeType: "text/csv" });
}
async function rawLedger(page: Page) {
  return page.evaluate(
    (key) => localStorage.getItem(key),
    PROFILE_KEYS.personal,
  );
}

test("T03: 20,000 operations download as five grouped files with independent confirmations and exact retry", async ({
  page,
}, testInfo) => {
  test.setTimeout(90000);
  await start(page);
  const original = await rawLedger(page);
  await expect(page.getByTestId("csv-export-count")).toHaveText(
    "Будет экспортировано операций: 20000 · строк: 24000 · файлов: 5",
  );
  const files = [await download(page, "Сохранить CSV")];
  await expect(page.getByTestId("csv-export-confirmation-count")).toHaveText(
    "Подтверждено вами: 0 из 5. Проверено чтением: 0 из 5.",
  );
  await expect(
    page.getByText(
      /Часть 1 передана системе. Сохранение файла пока не подтверждено/,
    ),
  ).toBeVisible();
  for (let part = 2; part <= 5; part++)
    files.push(await download(page, `Сохранить часть ${part}`));
  const prefix = files[0].name.replace(/001-of-005.csv$/, "");
  files.forEach((file, index) => {
    expect(file.name).toBe(
      `${prefix}${String(index + 1).padStart(3, "0")}-of-005.csv`,
    );
    expect(file.bytes.length).toBeLessThanOrEqual(2_000_000);
  });
  const inspected = await page.evaluate(
    (contents) =>
      (globalThis as FixtureWindow).__browserTestModule.inspectExportFiles(
        contents,
      ),
    files.map((file) => file.bytes.toString("utf8")),
  );
  expect(inspected.groups).toBe(20_000);
  expect(inspected.rows.reduce((sum, count) => sum + count, 0)).toBe(24_000);
  expect(inspected.rows.every((count) => count <= 5000)).toBe(true);
  await button(page, "Я сохранил часть 5").click();
  await expect(page.getByTestId("csv-export-confirmation-count")).toHaveText(
    "Подтверждено вами: 1 из 5. Проверено чтением: 0 из 5.",
  );
  const repeated = await download(page, "Повторить передачу части 1");
  expect(repeated.name).toBe(files[0].name);
  expect(repeated.bytes.equals(files[0].bytes)).toBe(true);
  await pick(
    page,
    "Проверить файл части 1",
    files[0].name,
    Buffer.concat([files[0].bytes, Buffer.from("\n")]),
  );
  await expect(
    page.getByText("Это другой файл. Выберите точный файл этой CSV-части.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByTestId("csv-export-confirmation-count")).toHaveText(
    "Подтверждено вами: 1 из 5. Проверено чтением: 0 из 5.",
  );
  await pick(page, "Проверить файл части 1", files[0].name, files[0].bytes);
  await expect(page.getByTestId("csv-export-confirmation-count")).toHaveText(
    "Подтверждено вами: 1 из 5. Проверено чтением: 1 из 5.",
  );
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page
      .getByTestId("csv-export-confirmation-count")
      .scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`export-result-${width}.png`),
      fullPage: true,
    });
  }
  const previous = await page.evaluate(
    (key) => localStorage.getItem(key),
    receiptKey,
  );
  await button(page, "Закрыть").click();
  await openExport(page);
  await expect(button(page, "Повторить передачу части 1")).toBeDisabled();
  await expect(page.getByTestId("csv-export-confirmation-count")).toHaveText(
    "Подтверждено вами: 1 из 5. Проверено чтением: 1 из 5.",
  );
  expect(
    await page.evaluate((key) => localStorage.getItem(key), receiptKey),
  ).toBe(previous);
  const newFile = await download(page, "Сохранить CSV");
  expect(newFile.name).not.toBe(files[0].name);
  expect(newFile.bytes.equals(files[0].bytes)).toBe(true);
  await expect(page.getByTestId("csv-export-confirmation-count")).toHaveText(
    "Подтверждено вами: 0 из 5. Проверено чтением: 0 из 5.",
  );
  expect(await rawLedger(page)).toBe(original);
});

test("T03: failed CSV transfer leaves saving unconfirmed and retry uses the prepared bytes", async ({
  page,
}) => {
  await start(page);
  const original = await rawLedger(page);
  await page.evaluate(() => {
    const click = HTMLAnchorElement.prototype.click;
    let fail = true;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download && fail) {
        fail = false;
        throw new Error("T03 synthetic browser download failure");
      }
      return click.call(this);
    };
  });
  await button(page, "Сохранить CSV").click();
  await expect(page.getByText(/Передача завершилась ошибкой/)).toBeVisible();
  await expect(page.getByTestId("csv-export-confirmation-count")).toHaveText(
    "Подтверждено вами: 0 из 5. Проверено чтением: 0 из 5.",
  );
  await button(page, "Часть 1: ещё нет").click();
  const retried = await download(page, "Повторить передачу части 1");
  await pick(page, "Проверить файл части 1", retried.name, retried.bytes);
  await expect(page.getByTestId("csv-export-confirmation-count")).toHaveText(
    "Подтверждено вами: 0 из 5. Проверено чтением: 1 из 5.",
  );
  expect(await rawLedger(page)).toBe(original);
});

test("T03: protected backup retry preserves exact bytes and receipt without repeating key derivation", async ({
  page,
}) => {
  await start(page, false);
  await button(page, "Закрыть").click();
  await button(page, "Профиль и настройки").click();
  await button(page, "Данные и копии").click();
  const original = await rawLedger(page);
  await page.evaluate(() => {
    const originalDerive = SubtleCrypto.prototype.deriveBits;
    (
      globalThis as typeof globalThis & { __t03Derivations: number }
    ).__t03Derivations = 0;
    SubtleCrypto.prototype.deriveBits = function (
      ...args: Parameters<SubtleCrypto["deriveBits"]>
    ) {
      (globalThis as typeof globalThis & { __t03Derivations: number })
        .__t03Derivations++;
      return originalDerive.apply(this, args);
    };
  });
  await button(page, "Создать копию с паролем").click();
  await page
    .getByLabel("Новый пароль копии", { exact: true })
    .fill("T03-browser-synthetic-password");
  await page
    .getByLabel("Повтор пароля копии", { exact: true })
    .fill("T03-browser-synthetic-password");
  const first = await download(page, "Сохранить защищённую копию");
  await expect(
    page.getByLabel("Новый пароль копии", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText(
      /Результат сохранения неизвестен; подтвердите сохранение сами/,
    ),
  ).toBeVisible();
  const key = "lad-profile-personal:lad-backup-receipt-v1";
  const prepared = await page.evaluate((key) => localStorage.getItem(key), key);
  expect(prepared).toBeTruthy();
  await button(page, "Ещё нет").click();
  const second = await download(page, "Повторить передачу этой копии");
  expect(second.name).toBe(first.name);
  expect(second.bytes.equals(first.bytes)).toBe(true);
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(
    prepared,
  );
  expect(
    await page.evaluate(
      () =>
        (globalThis as typeof globalThis & { __t03Derivations: number })
          .__t03Derivations,
    ),
  ).toBe(1);
  expect(
    await page.evaluate(() =>
      Object.values(localStorage).some((value) =>
        value.includes("T03-browser-synthetic-password"),
      ),
    ),
  ).toBe(false);
  await button(page, "Я сохранил файл").click();
  await expect(
    page.getByText(/Сохранение файла подтверждено вами:/),
  ).toBeVisible();
  await expect(
    page.getByText("Чтение этой копии ещё не проверено.", { exact: true }),
  ).toBeVisible();
  expect(await rawLedger(page)).toBe(original);
});
