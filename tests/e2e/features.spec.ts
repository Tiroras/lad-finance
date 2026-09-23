import { readState, setState, startApp, STORAGE_KEY as KEY } from "./helpers";
import { test, expect, type Page } from "@playwright/test";
import { createInitialState } from "../../src/domain/seed";
import { accountBalance, spendable } from "../../src/domain/finance";

const TODAY = "2026-09-10";
test.beforeEach(async ({ page }) => {
  await startApp(page, TODAY);
});
test("overdue payment stays reserved, can be skipped, restored and paid without double counting", async ({
  page,
}) => {
  const state = createInitialState(false, TODAY);
  state.accounts[0].openingBalance = 1000000;
  state.recurring = [
    {
      id: "rent",
      name: "Тестовый платёж",
      amount: 100000,
      day: 5,
      startsOn: "2026-09-01",
      active: true,
      kind: "bill",
      category: "home",
      accountId: "card",
      color: "#FFFFFF",
      icon: "home-outline",
    },
  ];
  await setState(page, state);
  await page.getByRole("tab", { name: "План", exact: true }).click();
  await page.getByRole("tab", { name: "Платежи", exact: true }).click();
  await expect(page.getByText(/Просрочено: 1/)).toBeVisible();
  await page
    .getByRole("button", { name: /Тестовый платёж, 5 сентября, Просрочен/ })
    .click();
  await page
    .getByRole("button", { name: "Пропустить этот месяц", exact: true })
    .click();
  await expect
    .poll(async () => spendable(await readState(page), TODAY).overdue)
    .toBe(0);
  await page
    .getByRole("button", { name: "Вернуть этот месяц в план", exact: true })
    .click();
  await expect
    .poll(async () => spendable(await readState(page), TODAY).overdue)
    .toBe(100000);
  const available = spendable(await readState(page), TODAY).available;
  await page
    .getByRole("button", { name: "Я оплатил — записать расход", exact: true })
    .click();
  await expect
    .poll(async () => (await readState(page)).transactions.length)
    .toBe(1);
  expect(spendable(await readState(page), TODAY).available).toBe(available);
  await page.reload();
  await expect(page.getByText("Больше ясности.")).toBeVisible();
  expect(spendable(await readState(page), TODAY).overdue).toBe(0);
});

async function csvPreview(page: Page, csv: string) {
  await page.getByRole("button", { name: "Профиль и настройки" }).click();
  await page
    .getByRole("button", { name: "Данные и копии", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Импортировать банковский CSV" })
    .click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Выбрать CSV-файл" }).click();
  await (
    await chooser
  ).setFiles({
    name: "statement.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page
    .getByRole("button", { name: "Распознать колонки", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Проверить операции", exact: true })
    .click();
}
test("CSV requires preview, rejects bad rows, imports selected records once and survives reload", async ({
  page,
}) => {
  const state = createInitialState(false, TODAY);
  state.accounts[0].openingBalance = 1000000;
  await setState(page, state);
  const csv =
    "Дата;Описание;Сумма;Валюта;ID\n09.09.2026;Кофе из CSV;-320,50;RUB;1\n10.09.2026;Зарплата CSV;10000;RUB;2\n10.09.2026;Покупка USD;-5;USD;3";
  await csvPreview(page, csv);
  await expect(
    page.getByText(/Новых выбрано: 2 · повторов: 0 · требуют исправления: 1/),
  ).toBeVisible();
  expect((await readState(page)).transactions).toHaveLength(0);
  await page.getByRole("checkbox", { name: "Импортировать строку 3" }).click();
  await page
    .getByRole("button", { name: "Назад к колонкам", exact: true })
    .click();
  await page.getByRole("tab", { name: "UTF-8", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Проверить операции", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Распознать колонки", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Проверить операции", exact: true })
    .click();
  await expect(
    page.getByText(/Новых выбрано: 2 · повторов: 0 · требуют исправления: 1/),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: "Импортировать строку 3" }).click();
  await page
    .getByRole("button", { name: "Импортировать 1 операций", exact: true })
    .click();
  await expect
    .poll(async () => (await readState(page)).transactions.length)
    .toBe(1);
  expect(accountBalance(await readState(page), "card", TODAY)).toBe(967950);
  await page.reload();
  await expect(page.getByText("Больше ясности.")).toBeVisible();
  await csvPreview(page, csv);
  await expect(
    page.getByText(/Новых выбрано: 1 · повторов: 1 · требуют исправления: 1/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Импортировать 1 операций", exact: true })
    .click();
  await expect
    .poll(async () => (await readState(page)).transactions.length)
    .toBe(2);
  expect(accountBalance(await readState(page), "card", TODAY)).toBe(1967950);
});
test("a previously imported expense can settle a planned payment without adding another charge", async ({
  page,
}) => {
  const state = createInitialState(false, TODAY);
  state.accounts[0].openingBalance = 1000000;
  state.recurring = [
    {
      id: "internet",
      name: "Домашний интернет",
      amount: 75000,
      day: 9,
      startsOn: "2026-09-01",
      active: true,
      kind: "bill",
      category: "home",
      accountId: "card",
      color: "#FFFFFF",
      icon: "wifi-outline",
    },
  ];
  state.transactions = [
    {
      id: "bank-tx",
      type: "expense",
      title: "Провайдер из выписки",
      amount: 75000,
      date: "2026-09-09",
      category: "home",
      accountId: "card",
      importKey: "bank-id-1",
    },
  ];
  await setState(page, state);
  await page.getByRole("tab", { name: "План", exact: true }).click();
  await page.getByRole("tab", { name: "Платежи", exact: true }).click();
  await page
    .getByRole("button", { name: /Домашний интернет, 9 сентября, Просрочен/ })
    .click();
  await page
    .getByRole("button", { name: /Связать: Провайдер из выписки/ })
    .click();
  await expect
    .poll(async () => (await readState(page)).transactions[0].recurringId)
    .toBe("internet");
  expect((await readState(page)).transactions).toHaveLength(1);
  expect(accountBalance(await readState(page), "card", TODAY)).toBe(925000);
  expect(spendable(await readState(page), TODAY).overdue).toBe(0);
});
test("a corrupt store remains untouched until a validated recovery is confirmed", async ({
  page,
}) => {
  await page.evaluate(
    (key) => localStorage.setItem(key, "corrupted-state"),
    KEY,
  );
  await page.reload();
  await expect(
    page.getByText(/Не удалось прочитать сохранённые данные/),
  ).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe(
    "corrupted-state",
  );
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Выбрать копию для восстановления" })
    .click();
  const state = createInitialState(false, TODAY);
  state.settings.name = "Восстановлено";
  await (
    await chooser
  ).setFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(state)),
  });
  await expect(page.getByText(/Копия проверена: 0 операций/)).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe(
    "corrupted-state",
  );
  await page
    .getByRole("button", { name: "Подтвердить восстановление хранилища" })
    .click();
  await expect(page.getByText("Восстановлено, всё на виду.")).toBeVisible();
  expect((await readState(page)).settings.name).toBe("Восстановлено");
});
