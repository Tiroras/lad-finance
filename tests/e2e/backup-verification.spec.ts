import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createInitialState } from "../../src/domain/seed";
import {
  prepareRestoreCandidate,
  restoreCandidateText,
} from "../../src/domain/backupRecovery";
import { writeRescueArchive } from "../../src/infrastructure/crypto/rescueArchive";
import { decodeBackup } from "../../src/domain/backup";
import { backupCrypto } from "../../src/infrastructure/crypto/backupCrypto";
import { encryptBackup } from "../../src/infrastructure/crypto/passwordBackup";
import { activeProfile, PROFILE_KEYS, readState, startApp } from "./helpers";

const TODAY = "2026-10-15";
const RECEIPT = "lad-profile-personal:lad-backup-receipt-v1";
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const fixture = () => {
  const state = createInitialState(false, TODAY);
  state.settings.onboardingCompleted = true;
  state.settings.exchange = { automatic: false, rates: {} };
  state.accounts[0].openingBalance = 5_000_000;
  return state;
};
const receipt = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), RECEIPT);
const ledgers = (page: Page) =>
  page.evaluate(() =>
    Object.fromEntries(
      Object.entries(localStorage).filter(([key]) =>
        key.endsWith(":lad-finance-v1"),
      ),
    ),
  );
async function openData(page: Page) {
  await button(page, "Профиль и настройки").click();
  await button(page, "Данные и копии").click();
}
async function pick(
  page: Page,
  label: string,
  buffer: Buffer,
  name = "backup.json",
) {
  const chooser = page.waitForEvent("filechooser");
  await button(page, label).click();
  await (
    await chooser
  ).setFiles({ name, mimeType: "application/octet-stream", buffer });
}
async function exported(page: Page, label = "Экспортировать резервную копию") {
  const downloading = page.waitForEvent("download");
  await button(page, label).click();
  const download = await downloading;
  return readFile((await download.path())!);
}

test.beforeEach(async ({ page }) => {
  await page.route("https://api.frankfurter.dev/**", (route) => route.abort());
});

test("B10: preparation, user confirmation and exact-file verification are separate; checking another file never replaces data", async ({
  page,
}, testInfo) => {
  await startApp(page, TODAY, fixture());
  await openData(page);
  const before = await ledgers(page);
  const file = await exported(page);
  const prepared = await receipt(page);
  expect(prepared.sha256).toBe(createHash("sha256").update(file).digest("hex"));
  expect(prepared.byteLength).toBe(file.length);
  expect(prepared.userConfirmedAt).toBeUndefined();
  expect(prepared.readVerifiedAt).toBeUndefined();
  expect(decodeBackup(file.toString(), TODAY)).toEqual(await readState(page));
  await button(page, "Я сохранил файл").click();
  await expect
    .poll(async () => (await receipt(page)).userConfirmedAt)
    .toBeTruthy();
  expect((await receipt(page)).readVerifiedAt).toBeUndefined();
  const other = fixture();
  other.accounts[0].openingBalance = 314159;
  await pick(
    page,
    "Проверить копию",
    Buffer.from(JSON.stringify(other)),
    "other.json",
  );
  await expect(
    page.getByText(
      "Файл читается, но это другая копия. Отметка о последнем экспорте не изменена.",
      { exact: true },
    ),
  ).toBeVisible();
  expect((await receipt(page)).readVerifiedAt).toBeUndefined();
  expect(await ledgers(page)).toEqual(before);
  await pick(page, "Проверить копию", file);
  await expect(
    page.getByText(/^Эта копия успешно проверена чтением: /),
  ).toBeVisible();
  expect((await receipt(page)).readVerifiedAt).toBeTruthy();
  expect(await ledgers(page)).toEqual(before);
  await expect(button(page, "Заменить данные этой копией")).toHaveCount(0);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await button(page, "Проверить копию").scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`b10-verification-${width}.png`),
    });
  }
  // A new export of identical financial content still requires new confirmation.
  await exported(page);
  const next = await receipt(page);
  expect(next.exportId).not.toBe(prepared.exportId);
  expect(next.userConfirmedAt).toBeUndefined();
  expect(next.readVerifiedAt).toBeUndefined();
});

test("B10: password failure is read-only, retry verifies; explicit trial creates one durable new profile", async ({
  page,
}) => {
  await startApp(page, TODAY, fixture());
  const before = await ledgers(page);
  const imported = fixture();
  imported.accounts[0].openingBalance = 987654;
  imported.settings.name = "Проверка переноса";
  const password = "Synthetic-copy-2026";
  const file = Buffer.from(
    await encryptBackup(imported, password, backupCrypto),
  );
  await openData(page);
  await pick(page, "Проверить копию", file, "trial.ladbackup");
  await page
    .getByLabel("Пароль для восстановления", { exact: true })
    .fill("wrong-password");
  await button(page, "Открыть защищённую копию").click();
  await expect(
    page.getByText("Пароль неверный или файл повреждён. Данные не изменены.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(await ledgers(page)).toEqual(before);
  await page
    .getByLabel("Пароль для восстановления", { exact: true })
    .fill(password);
  await button(page, "Открыть защищённую копию").click();
  await expect(page.getByText(/Копия проверена: 0 операций/)).toBeVisible();
  expect(await ledgers(page)).toEqual(before);
  await button(page, "Восстановить в новый профиль").click();
  await page
    .getByLabel("Название нового профиля", { exact: true })
    .fill("Пробное восстановление");
  await button(page, "Подготовить восстановление в новый профиль").click();
  expect(await ledgers(page)).toEqual(before);
  await button(page, "Подтвердить создание профиля из копии").click();
  await expect.poll(() => activeProfile(page)).not.toBe("personal");
  const profile = await activeProfile(page);
  expect(profile).toMatch(/^profile-/);
  await expect(page.getByTestId("import-result-status")).toHaveText(
    "Импорт сохранён и проверен чтением.",
  );
  await button(page, "Закрыть").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await openData(page);
  expect(decodeBackup((await exported(page)).toString(), TODAY)).toEqual(
    imported,
  );
  expect((await ledgers(page))[PROFILE_KEYS.personal]).toBe(
    before[PROFILE_KEYS.personal],
  );
  expect(Object.keys(await ledgers(page))).toHaveLength(2);
  await page.reload();
  await expect(button(page, "Профиль и настройки")).toBeVisible();
  expect(await activeProfile(page)).toBe(profile);
  await openData(page);
  expect(decodeBackup((await exported(page)).toString(), TODAY)).toEqual(
    imported,
  );
  expect((await ledgers(page))[PROFILE_KEYS.personal]).toBe(
    before[PROFILE_KEYS.personal],
  );
});

test("B10: failed save requires explicit fallback confirmation and exports the last readable revision", async ({
  page,
}) => {
  await startApp(page, TODAY, fixture());
  const saved = await readState(page);
  await page.evaluate((key) => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (this === localStorage && name === key)
        throw new DOMException(
          "Synthetic B10 save failure",
          "QuotaExceededError",
        );
      return setItem.call(this, name, value);
    };
  }, PROFILE_KEYS.personal);
  await button(page, "Добавить операцию").click();
  await page.getByRole("tab", { name: "Расход", exact: true }).click();
  await page
    .getByLabel("Название операции", { exact: true })
    .fill("Несохранённый расход");
  await page.getByLabel("Сумма операции", { exact: true }).fill("123");
  await button(page, "Добавить операцию").click();
  await expect(
    button(page, "Повторить подтверждение сохранения"),
  ).toBeVisible();
  await button(page, "Закрыть и сохранить черновик").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await openData(page);
  let downloads = 0;
  page.on("download", () => downloads++);
  await button(page, "Экспортировать резервную копию").click();
  await expect(button(page, "Экспортировать сохранённый снимок")).toBeVisible();
  expect(downloads).toBe(0);
  expect(await receipt(page)).toBeNull();
  const file = await exported(page, "Экспортировать сохранённый снимок");
  expect(decodeBackup(file.toString(), TODAY)).toEqual(saved);
  expect((await receipt(page)).sourceKind).toBe("last-readable-saved");
  expect(await readState(page)).toEqual(saved);
  await expect(
    page.getByText(
      "Копия содержит последний читаемый сохранённый снимок. Несохранённые изменения в неё не вошли.",
      { exact: true },
    ),
  ).toBeVisible();
});

test("B10: cleanup failure clears the password selection and allows choosing another file", async ({
  page,
}) => {
  await startApp(page, TODAY, fixture());
  await openData(page);
  const before = await ledgers(page);
  const sourceText = JSON.stringify(fixture());
  const candidate = prepareRestoreCandidate(sourceText, {
    normalizationDate: TODAY,
    normalizationVersion: 1,
    targetDemo: false,
    transportMode: "rescue",
  });
  const parts = await writeRescueArchive(
    {
      sourceText,
      currentSnapshotText: restoreCandidateText(candidate),
      normalizationDate: TODAY,
      normalizationVersion: 1,
      snapshotDate: TODAY,
    },
    { password: "Synthetic-cleanup-2026", crypto: backupCrypto },
  );
  await pick(
    page,
    "Проверить копию",
    Buffer.concat(parts),
    "cleanup.ladbackup",
  );
  await page
    .getByLabel("Пароль для восстановления", { exact: true })
    .fill("not-retained-after-cancel");
  await page.evaluate(() => {
    const revoke = URL.revokeObjectURL;
    let first = true;
    URL.revokeObjectURL = function (url) {
      if (first) {
        first = false;
        throw new Error("Synthetic cache cleanup failure");
      }
      return revoke.call(URL, url);
    };
  });
  await button(page, "Отмена ввода пароля").click();
  await expect(
    page.getByText("Synthetic cache cleanup failure", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Пароль для восстановления", { exact: true }),
  ).toHaveCount(0);
  expect(await ledgers(page)).toEqual(before);
  await pick(page, "Проверить копию", Buffer.from(sourceText), "retry.json");
  await expect(page.getByText(/Копия проверена: 0 операций/)).toBeVisible();
  expect(await ledgers(page)).toEqual(before);
});
