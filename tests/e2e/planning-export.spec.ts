import {
  readState as read,
  setState,
  startApp,
  activeStorageKey,
} from "./helpers";
import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createInitialState } from "../../src/domain/seed";
import { money } from "../../src/domain/finance";
import { parseCsv } from "../../src/domain/csv";
import { encryptBackup } from "../../src/infrastructure/crypto/passwordBackup";
import { backupCrypto } from "../../src/infrastructure/crypto/backupCrypto";

const TODAY = "2026-09-10";
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const close = (page: Page) => button(page, "Закрыть").click();
function fixture() {
  const state = createInitialState(false, TODAY);
  state.accounts[0].openingBalance = 2000000;
  state.settings.buffer = 500000;
  state.plannedIncomes = [
    {
      id: "salary",
      name: "Зарплата",
      amount: 5000000,
      date: "2026-09-15",
      repeat: "monthly",
      accountId: "card",
    },
  ];
  state.recurring = [
    {
      id: "rent",
      name: "Аренда",
      amount: 3000000,
      day: 18,
      kind: "bill",
      active: true,
      startsOn: TODAY,
      icon: "home-outline",
      color: "#FFFFFF",
      category: "home",
      accountId: "card",
    },
  ];
  return state;
}
async function pick(
  page: Page,
  label: string,
  raw: string,
  name = "lad-backup.ladbackup",
) {
  const choosing = page.waitForEvent("filechooser");
  await button(page, label).click();
  await (
    await choosing
  ).setFiles({
    name,
    mimeType: "application/octet-stream",
    buffer: Buffer.from(raw),
  });
}
test.beforeEach(async ({ page }) => {
  await startApp(page, TODAY);
  await setState(page, fixture());
});

test("custom subcategory can record expenses, share a budget, survive reload and be archived without losing history", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await button(page, "Профиль и настройки").click();
  await button(page, "Категории и подкатегории").click();
  await button(page, "Создать категорию").click();
  await page.getByLabel("Название категории", { exact: true }).fill("Ремонт");
  await page.getByRole("tab", { name: "Подкатегория", exact: true }).click();
  await button(page, "Основная категория").click();
  await page.getByRole("radio", { name: "Дом", exact: true }).click();
  await button(page, "Сохранить категорию").click();
  await expect(button(page, "Настроить: Дом / Ремонт")).toBeVisible();
  await expect.poll(async () => (await read(page)).categories.length).toBe(9);
  const child = (await read(page)).categories.find((c) => c.name === "Ремонт")!;
  await close(page);
  await button(page, "Добавить операцию").click();
  await page
    .getByLabel("Название операции", { exact: true })
    .fill("Краска для ремонта");
  await page.getByLabel("Сумма операции", { exact: true }).fill("123,45");
  await button(page, "Дом / Ремонт").click();
  await button(page, "Добавить операцию").click();
  await expect
    .poll(async () => (await read(page)).transactions[0]?.category)
    .toBe(child.id);
  await page.reload();
  await page.getByRole("tab", { name: "Операции", exact: true }).click();
  await button(page, "Дом").click();
  await expect(
    page.getByRole("button", { name: /Краска для ремонта,.*открыть операцию/ }),
  ).toBeVisible();
  await button(page, "Профиль и настройки").click();
  await button(page, "Категории и подкатегории").click();
  await button(page, "Настроить: Дом / Ремонт").click();
  await expect(
    page.getByLabel("Название категории", { exact: true }),
  ).toBeInViewport();
  await button(page, "Архивировать категорию").click();
  await button(page, "Архив категорий").click();
  await expect(button(page, "Настроить: Дом / Ремонт")).toBeVisible();
  const archived = await read(page);
  expect(archived.categories.find((c) => c.id === child.id)!.archived).toBe(
    true,
  );
  expect(archived.transactions[0].amount).toBe(12345);
  await close(page);
  await button(page, "Добавить операцию").first().click();
  await expect(button(page, "Дом / Ремонт")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("purchase planner selects the first affordable date and the exact maximum without changing finances", async ({
  page,
}) => {
  const before = await read(page);
  await button(page, "Проверить покупку").click();
  await page.getByLabel("Стоимость покупки", { exact: true }).fill("20000");
  await expect(page.getByTestId("purchase-earliest")).toContainText(
    "15 сентября",
  );
  await button(page, "Выбрать ближайшую дату").click();
  await expect(page.getByLabel("Дата покупки", { exact: true })).toHaveValue(
    "15.09.2026",
  );
  await expect(page.getByTestId("purchase-maximum")).toContainText(
    money(3500000, true),
  );
  await button(page, "Подставить доступную сумму").click();
  await expect(
    page.getByLabel("Стоимость покупки", { exact: true }),
  ).toHaveValue("35 000");
  await expect(page.getByTestId("forecast-status")).toHaveText(
    "Без нехватки по этому плану",
  );
  await close(page);
  expect(await read(page)).toEqual(before);
});

test("saved scenarios expose salary-delay shortfalls, compare alternatives and persist only assumptions", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const before = await read(page);
  await button(page, "Прогноз по дням").click();
  await button(page, "Мои сценарии").click();
  await button(page, "Создать сценарий").click();
  await page
    .getByLabel("Название сценария", { exact: true })
    .fill("Зарплата позже");
  await button(page, "Доход: Зарплата").click();
  await page.getByLabel("Сдвиг дохода: Зарплата", { exact: true }).fill("7");
  await button(page, "Сравнить с планом").click();
  await expect(page.getByTestId("forecast-status")).toHaveText(
    "Нехватка с 18 сентября",
  );
  await expect(page.getByTestId("scenario-delta")).toContainText(
    money(0, true),
  );
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByTestId("forecast-day").scrollIntoViewIfNeeded();
    const bounds = await page.getByTestId("forecast-day").boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
  }
  await button(page, "Сохранить сценарий").click();
  await expect(button(page, "Открыть сценарий: Зарплата позже")).toBeVisible();
  await expect.poll(async () => (await read(page)).scenarios?.length).toBe(1);
  const after = await read(page);
  expect(after.transactions).toEqual(before.transactions);
  expect(after.accounts).toEqual(before.accounts);
  expect(after.recurring).toEqual(before.recurring);
  expect(after.plannedIncomes).toEqual(before.plannedIncomes);
  await page.reload();
  await button(page, "Прогноз по дням").click();
  await button(page, "Мои сценарии").click();
  await button(page, "Открыть сценарий: Зарплата позже").click();
  await expect(
    page.getByLabel("Сдвиг дохода: Зарплата", { exact: true }),
  ).toHaveValue("7");
  await page.getByLabel("Сдвиг дохода: Зарплата", { exact: true }).fill("2");
  await button(page, "Сохранить сценарий").click();
  await button(page, "Создать сценарий").click();
  await page.getByLabel("Название сценария", { exact: true }).fill("Мебель");
  await button(page, "Добавить событие в сценарий").click();
  await page.getByLabel("Сумма события 1", { exact: true }).fill("1000");
  await button(page, "Сравнить с планом").click();
  await button(page, "Зарплата позже").click();
  await expect(page.getByTestId("scenario-delta")).toContainText(
    money(-100000, true),
  );
  await button(page, "Сохранить сценарий").click();
  expect(errors).toEqual([]);
});

test("CSV export downloads universal rows and account-specific YNAB transfers", async ({
  page,
}) => {
  const state = fixture();
  state.transactions = [
    {
      id: "transfer",
      type: "transfer",
      title: "Копилка",
      amount: 50000,
      date: TODAY,
      category: "other",
      accountId: "card",
      toAccountId: "savings",
    },
  ];
  await setState(page, state);
  await button(page, "Профиль и настройки").click();
  await button(page, "Данные и копии").click();
  await button(page, "Экспортировать операции в CSV").click();
  await expect(page.getByTestId("csv-export-count")).toContainText("1");
  let downloadPromise = page.waitForEvent("download");
  await button(page, "Сохранить CSV").click();
  const universal = await downloadPromise;
  expect(universal.suggestedFilename()).toMatch(/universal.csv$/);
  const csv = parseCsv(await readFile((await universal.path())!, "utf8"));
  expect(csv.rows[0][1]).toBe("transfer");
  expect(csv.rows[0][2]).toBe("-500.00");
  await page.getByRole("tab", { name: "Для YNAB", exact: true }).click();
  await button(page, "Накопления").click();
  downloadPromise = page.waitForEvent("download");
  await button(page, "Сохранить CSV").click();
  const ynab = parseCsv(
    await readFile((await (await downloadPromise).path())!, "utf8"),
  );
  expect(ynab.headers).toEqual(["Date", "Payee", "Memo", "Outflow", "Inflow"]);
  expect(ynab.rows[0].slice(3)).toEqual(["", "500.00"]);
  await close(page);
  expect(await read(page)).toEqual(state);
});

test("password backup is portable, wrong password is harmless, and replacement requires confirmation", async ({
  page,
}) => {
  const password = "Длинный пароль 2026!";
  const original = fixture();
  original.scenarios = [
    {
      id: "alternative",
      name: "Другой план",
      horizon: 60,
      changes: [],
      events: [],
    },
  ];
  await setState(page, original);
  await button(page, "Профиль и настройки").click();
  await button(page, "Данные и копии").click();
  await button(page, "Создать копию с паролем").click();
  await page.getByLabel("Новый пароль копии", { exact: true }).fill(password);
  await page
    .getByLabel("Повтор пароля копии", { exact: true })
    .fill("Другое значение");
  await button(page, "Сохранить защищённую копию").click();
  await expect(
    page.getByText("Пароли не совпадают.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Повтор пароля копии", { exact: true }).fill(password);
  const downloading = page.waitForEvent("download");
  await button(page, "Сохранить защищённую копию").click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/\.ladbackup$/);
  const raw = await readFile((await download.path())!, "utf8");
  expect(raw).not.toContain("Другой план");
  expect(raw).not.toContain(password);
  expect(
    await page.evaluate(
      (value) =>
        Object.values(localStorage).some((item) => item.includes(value)),
      password,
    ),
  ).toBe(false);
  await setState(page, createInitialState(false, TODAY));
  await button(page, "Профиль и настройки").click();
  await button(page, "Данные и копии").click();
  await pick(page, "Восстановить из файла", raw);
  await page
    .getByLabel("Пароль для восстановления", { exact: true })
    .fill("Неверный пароль");
  await button(page, "Открыть защищённую копию").click();
  await expect(
    page.getByText(/Пароль неверный или файл повреждён/),
  ).toBeVisible();
  expect((await read(page)).scenarios).toEqual([]);
  await page
    .getByLabel("Пароль для восстановления", { exact: true })
    .fill(password);
  await button(page, "Открыть защищённую копию").click();
  await expect(button(page, "Заменить данные этой копией")).toBeVisible();
  expect((await read(page)).scenarios).toEqual([]);
  await button(page, "Заменить данные этой копией").click();
  await expect.poll(async () => (await read(page)).scenarios?.length).toBe(1);
  await page.reload();
  await expect(page.getByText("Больше ясности.")).toBeVisible();
  expect(await read(page)).toEqual(original);
});

test("encrypted backup can recover a corrupt local store without the original device key", async ({
  page,
}) => {
  const KEY = await activeStorageKey(page);
  const state = fixture(),
    password = "Пароль восстановления";
  state.settings.name = "Восстановлено";
  const raw = await encryptBackup(state, password, backupCrypto);
  await page.evaluate((key) => localStorage.setItem(key, "broken-state"), KEY);
  await page.reload();
  await expect(
    page.getByText(/Не удалось прочитать сохранённые данные/),
  ).toBeVisible();
  await pick(page, "Выбрать копию для восстановления", raw);
  await page
    .getByLabel("Пароль для восстановления", { exact: true })
    .fill(password);
  await button(page, "Открыть защищённую копию").click();
  await expect(
    button(page, "Подтвердить восстановление хранилища"),
  ).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe(
    "broken-state",
  );
  await button(page, "Подтвердить восстановление хранилища").click();
  await expect(page.getByText("Восстановлено, всё на виду.")).toBeVisible();
  expect(await read(page)).toEqual(state);
});
