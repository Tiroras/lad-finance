import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { accountBalance } from "../../src/domain/accountBalances";
import { createInitialState } from "../../src/domain/seed";
import {
  ACTIVE_PROFILE_KEY,
  PROFILE_REGISTRY_KEY,
  activeProfile,
  activeStorageKey,
  openProfiles,
  readState,
  startApp,
  switchProfile,
} from "./helpers";

const TODAY = "2026-09-10";
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const readRegistry = (page: Page) =>
  page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    PROFILE_REGISTRY_KEY,
  );

async function createProfile(page: Page, name: string) {
  await openProfiles(page);
  await button(page, "Добавить профиль").click();
  await page.getByLabel("Название профиля", { exact: true }).fill(name);
  await button(page, "Создать профиль").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const id = await activeProfile(page);
  expect(id).toMatch(/^profile-[a-f0-9-]{36}$/);
  await expect.poll(async () => (await readState(page)).demo).toBe(false);
  return id;
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

async function openData(page: Page) {
  await button(page, "Профиль и настройки").click();
  await button(page, "Данные и копии").click();
}

test.beforeEach(async ({ page }) => {
  await page.route("https://api.frankfurter.dev/**", (route) => route.abort());
});

test("personal is the first profile; two optional profiles keep independent money, names and reload preferences", async ({
  page,
}, testInfo) => {
  await startApp(page, TODAY);
  expect(await activeProfile(page)).toBe("personal");
  expect((await readState(page)).demo).toBe(false);
  expect((await readState(page)).transactions).toEqual([]);
  await addIncome(page, "Личная зарплата", "1000");
  const personal = await readState(page);
  const familyId = await createProfile(page, "Семейный");
  const emptyFamily = await readState(page);
  expect(emptyFamily.transactions).toEqual([]);
  expect(emptyFamily.goals).toEqual([]);
  expect(emptyFamily.recurring).toEqual([]);
  expect(
    emptyFamily.accounts.every((account) => account.openingBalance === 0),
  ).toBe(true);
  expect(
    emptyFamily.categories.every((category) => category.budget === 0),
  ).toBe(true);
  await expect(button(page, "Настроить свой учёт")).toBeVisible();
  await addIncome(page, "Семейный доход", "2500,50");
  const family = await readState(page);
  const workId = await createProfile(page, "Рабочий");
  expect(workId).not.toBe(familyId);
  expect((await readState(page)).transactions).toEqual([]);
  await addIncome(page, "Оплата проекта", "4000,25");
  const work = await readState(page);
  expect(accountBalance(personal, "card", TODAY)).toBe(100000);
  expect(accountBalance(family, "card", TODAY)).toBe(250050);
  expect(accountBalance(work, "card", TODAY)).toBe(400025);
  expect(await readState(page, "personal")).toEqual(personal);
  expect(await readState(page, familyId)).toEqual(family);
  await page.reload();
  await expect(
    button(page, "Текущий профиль: Рабочий. Открыть профили"),
  ).toBeVisible();
  expect(await activeProfile(page)).toBe(workId);
  expect(await readState(page)).toEqual(work);

  const longName = "Рабочий бюджет мастерской и новых планов";
  await openProfiles(page);
  await expect(button(page, "Открыть профиль: Рабочий")).toBeDisabled();
  await expect(button(page, "Переименовать профиль: Личный")).toHaveCount(0);
  await expect(button(page, "Переименовать профиль: Демо")).toHaveCount(0);
  await button(page, "Переименовать профиль: Рабочий").click();
  await page
    .getByLabel("Новое название профиля", { exact: true })
    .fill(longName);
  await button(page, "Сохранить название").click();
  await expect(button(page, `Открыть профиль: ${longName}`)).toBeDisabled();
  expect(await activeProfile(page)).toBe(workId);
  expect(await readState(page)).toEqual(work);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await button(page, `Открыть профиль: ${longName}`).scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`profiles-${width}.png`),
      animations: "disabled",
    });
    await button(page, "Добавить профиль").click();
    await page
      .getByLabel("Название профиля", { exact: true })
      .fill("Будущий семейный бюджет");
    await button(page, "Создать профиль").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(`profile-form-${width}.png`),
      animations: "disabled",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await button(page, "Отмена").click();
  }
  await button(page, "Закрыть").click();
  await page.setViewportSize({ width: 320, height: 740 });
  await expect(
    button(page, `Текущий профиль: ${longName}. Открыть профили`),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("profile-header-long-320.png"),
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await switchProfile(page, "Семейный");
  expect(await activeProfile(page)).toBe(familyId);
  expect(await readState(page)).toEqual(family);
  await page.reload();
  await expect(
    button(page, "Текущий профиль: Семейный. Открыть профили"),
  ).toBeVisible();
  expect(await activeProfile(page)).toBe(familyId);
  await switchProfile(page, "Личный");
  expect(await readState(page)).toEqual(personal);
  expect(await readRegistry(page)).toEqual({
    version: 1,
    profiles: [
      { id: "personal", name: "Личный" },
      { id: familyId, name: "Семейный" },
      { id: workId, name: longName },
    ],
  });
});

test("a custom profile backup, restore and confirmed reset never change other profiles or its identity", async ({
  page,
}) => {
  await startApp(page, TODAY);
  await addIncome(page, "Личный остаток", "9000");
  const personal = await readState(page);
  const familyId = await createProfile(page, "Семейный");
  await addIncome(page, "Семейный остаток", "1234,56");
  const family = await readState(page);
  const workId = await createProfile(page, "Рабочий");
  await addIncome(page, "Рабочий остаток", "7000");
  const work = await readState(page);
  await switchProfile(page, "Семейный");
  await openData(page);
  const downloadEvent = page.waitForEvent("download");
  await button(page, "Экспортировать резервную копию").click();
  const downloaded = await (await downloadEvent).path();
  expect(downloaded).not.toBeNull();
  expect(JSON.parse(await readFile(downloaded!, "utf8"))).toEqual(family);

  const backup = createInitialState(false, TODAY);
  backup.settings.name = "Из копии";
  backup.settings.exchange = { automatic: false, rates: {} };
  backup.accounts[0].openingBalance = 876543;
  const choosing = page.waitForEvent("filechooser");
  await button(page, "Восстановить из файла").click();
  await (
    await choosing
  ).setFiles({
    name: "family.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  expect(await readState(page)).toEqual(family);
  await button(page, "Заменить данные этой копией").click();
  await expect
    .poll(async () => (await readState(page)).settings.name)
    .toBe("Из копии");
  expect(await readState(page)).toEqual(backup);
  expect(await activeProfile(page)).toBe(familyId);
  expect(await readState(page, "personal")).toEqual(personal);
  expect(await readState(page, workId)).toEqual(work);
  const registry = await readRegistry(page);
  await openData(page);
  await button(page, "Очистить учёт").click();
  await button(page, "Отмена").click();
  expect(await readState(page)).toEqual(backup);
  await button(page, "Очистить учёт").click();
  await button(page, "Да, начать с пустых счетов").click();
  await expect
    .poll(async () => accountBalance(await readState(page), "card", TODAY))
    .toBe(0);
  expect(await activeProfile(page)).toBe(familyId);
  expect((await readState(page)).demo).toBe(false);
  expect((await readState(page)).transactions).toEqual([]);
  expect(await readRegistry(page)).toEqual(registry);
  expect(await readState(page, "personal")).toEqual(personal);
  expect(await readState(page, workId)).toEqual(work);
  await page.reload();
  await expect(
    button(page, "Текущий профиль: Семейный. Открыть профили"),
  ).toBeVisible();
  expect(await activeProfile(page)).toBe(familyId);
  expect(accountBalance(await readState(page), "card", TODAY)).toBe(0);
});

test("empty and duplicate profile names cannot create or rename a profile", async ({
  page,
}) => {
  await startApp(page, TODAY);
  const id = await createProfile(page, "  Семейный  ");
  const registry = await readRegistry(page);
  const state = await readState(page);
  await openProfiles(page);
  await button(page, "Добавить профиль").click();
  const name = page.getByLabel("Название профиля", { exact: true });
  await name.fill("   ");
  await button(page, "Создать профиль").click();
  await expect(
    page.getByText("Название профиля должно содержать от 1 до 40 символов.", {
      exact: true,
    }),
  ).toBeVisible();
  for (const duplicate of ["семейный", "Личный", "Демо"]) {
    await name.fill(duplicate);
    await button(page, "Создать профиль").click();
    await expect(
      page.getByText("Профиль с таким названием уже есть. Выберите другое.", {
        exact: true,
      }),
    ).toBeVisible();
    expect(await readRegistry(page)).toEqual(registry);
  }
  await button(page, "Отмена").click();
  await button(page, "Переименовать профиль: Семейный").click();
  await page
    .getByLabel("Новое название профиля", { exact: true })
    .fill("личный");
  await button(page, "Сохранить название").click();
  await expect(
    page.getByText("Профиль с таким названием уже есть. Выберите другое.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(await readRegistry(page)).toEqual(registry);
  expect(await activeProfile(page)).toBe(id);
  expect(await readState(page)).toEqual(state);
});

test("an unknown saved preference returns to personal while a valid custom profile remains selectable", async ({
  page,
}) => {
  await startApp(page, TODAY);
  await addIncome(page, "Основной доход", "333");
  const personal = await readState(page);
  const id = await createProfile(page, "Семейный");
  await addIncome(page, "Доход семьи", "777");
  const family = await readState(page);
  const registry = await readRegistry(page);
  await page.evaluate(
    (key) =>
      localStorage.setItem(key, "profile-00000000-0000-4000-8000-000000000000"),
    ACTIVE_PROFILE_KEY,
  );
  await page.reload();
  await expect(
    button(page, "Текущий профиль: Личный. Открыть профили"),
  ).toBeVisible();
  expect(await activeProfile(page)).toBe("personal");
  expect(await readState(page)).toEqual(personal);
  expect(await readRegistry(page)).toEqual(registry);
  await switchProfile(page, "Семейный");
  expect(await activeProfile(page)).toBe(id);
  expect(await readState(page)).toEqual(family);
});

test("a corrupt profile registry preserves every stored ledger and never creates a replacement registry", async ({
  page,
}) => {
  await startApp(page, TODAY);
  await addIncome(page, "Личный доход", "111");
  const personal = await readState(page, "personal");
  const id = await createProfile(page, "Семейный");
  await addIncome(page, "Семейный доход", "222");
  const family = await readState(page);
  const storageKey = await activeStorageKey(page);
  const broken = "unreadable-profile-registry";
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), {
    key: PROFILE_REGISTRY_KEY,
    raw: broken,
  });
  await page.reload();
  await expect(
    page.getByText(
      /Не удалось прочитать сохранённые данные или список профилей/,
    ),
  ).toBeVisible();
  expect(await activeProfile(page)).toBe(id);
  expect(await readState(page, "personal")).toEqual(personal);
  expect(await readState(page, id)).toEqual(family);
  expect(await activeStorageKey(page)).toBe(storageKey);
  expect(
    await page.evaluate(
      (key) => localStorage.getItem(key),
      PROFILE_REGISTRY_KEY,
    ),
  ).toBe(broken);
  await expect(button(page, "Добавить операцию")).toHaveCount(0);
  await expect(button(page, "Начать с пустого учёта")).toHaveCount(0);
  await expect(button(page, "Выбрать копию для восстановления")).toHaveCount(0);
});

test("recovering an unreadable inactive profile requires confirmation and preserves the healthy active profile", async ({
  page,
}) => {
  await startApp(page, TODAY);
  await addIncome(page, "Личный доход", "111");
  const personal = await readState(page);
  const familyId = await createProfile(page, "Семейный");
  await addIncome(page, "Семейный доход", "1234,56");
  const family = await readState(page);
  const workId = await createProfile(page, "Рабочий");
  await addIncome(page, "Оплата работы", "7890,12");
  const backup = await readState(page);
  const workKey = await activeStorageKey(page);
  const registry = await readRegistry(page);
  await switchProfile(page, "Семейный");
  const broken = "unreadable-inactive-work-ledger";
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), {
    key: workKey,
    raw: broken,
  });
  const readBroken = () =>
    page.evaluate((key) => localStorage.getItem(key), workKey);
  await openProfiles(page);
  await button(page, "Открыть профиль: Рабочий").click();
  await expect(
    page.getByRole("alert").filter({ hasText: /Не удалось прочитать/ }),
  ).toBeVisible();
  expect(await activeProfile(page)).toBe(familyId);
  expect(await readState(page)).toEqual(family);
  expect(await readBroken()).toBe(broken);
  for (const confirm of [false, true]) {
    const choosing = page.waitForEvent("filechooser");
    await button(page, "Выбрать копию для восстановления").click();
    await (
      await choosing
    ).setFiles({
      name: "work.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup)),
    });
    await expect(
      page.getByText("Восстановить профиль «Рабочий»?", { exact: true }),
    ).toBeVisible();
    expect(await activeProfile(page)).toBe(familyId);
    expect(await readState(page)).toEqual(family);
    expect(await readBroken()).toBe(broken);
    if (confirm) {
      await button(page, "Подтвердить восстановление хранилища").click();
      await expect.poll(async () => readState(page, workId)).toEqual(backup);
    } else {
      await button(page, "Отмена восстановления").click();
      await expect(
        button(page, "Подтвердить восстановление хранилища"),
      ).toHaveCount(0);
      expect(await readBroken()).toBe(broken);
    }
  }
  expect(await activeProfile(page)).toBe(familyId);
  expect(await readState(page)).toEqual(family);
  expect(await readState(page, "personal")).toEqual(personal);
  expect(await readRegistry(page)).toEqual(registry);
  await button(page, "Открыть профиль: Рабочий").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await activeProfile(page)).toBe(workId);
  expect(await readState(page)).toEqual(backup);
  expect(accountBalance(await readState(page), "card", TODAY)).toBe(789012);
  await page.reload();
  await expect(
    button(page, "Текущий профиль: Рабочий. Открыть профили"),
  ).toBeVisible();
  expect(await readState(page)).toEqual(backup);
  expect(await readState(page, familyId)).toEqual(family);
});

test("a failed startup can open a different healthy profile without overwriting the unreadable selected profile", async ({
  page,
}) => {
  await startApp(page, TODAY);
  await addIncome(page, "Личный доход", "111");
  const personal = await readState(page);
  const familyId = await createProfile(page, "Семейный");
  await addIncome(page, "Семейный доход", "1234,56");
  const family = await readState(page);
  const workId = await createProfile(page, "Рабочий");
  await addIncome(page, "Рабочий доход", "222");
  const workKey = await activeStorageKey(page);
  const registry = await readRegistry(page);
  const broken = "unreadable-selected-work-ledger";
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), {
    key: workKey,
    raw: broken,
  });
  const readBroken = () =>
    page.evaluate((key) => localStorage.getItem(key), workKey);
  await page.reload();
  await expect(
    page.getByText(
      /Не удалось прочитать сохранённые данные или список профилей/,
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Профиль: Рабочий", { exact: true }),
  ).toBeVisible();
  expect(await activeProfile(page)).toBe(workId);
  expect(await readBroken()).toBe(broken);
  await button(page, "Открыть профиль: Семейный").click();
  await expect(
    button(page, "Текущий профиль: Семейный. Открыть профили"),
  ).toBeVisible();
  expect(await activeProfile(page)).toBe(familyId);
  expect(await readState(page)).toEqual(family);
  expect(accountBalance(await readState(page), "card", TODAY)).toBe(123456);
  expect(await readBroken()).toBe(broken);
  expect(await readState(page, "personal")).toEqual(personal);
  expect(await readRegistry(page)).toEqual(registry);
  await page.reload();
  await expect(
    button(page, "Текущий профиль: Семейный. Открыть профили"),
  ).toBeVisible();
  expect(await activeProfile(page)).toBe(familyId);
  expect(await readState(page)).toEqual(family);
  expect(await readBroken()).toBe(broken);
});
