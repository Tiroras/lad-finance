import { readState as read, startApp } from "./helpers";
import { expect, test, type Page } from "@playwright/test";
import { createInitialState } from "../../src/domain/seed";

const TODAY = "2026-09-10";
const button = (page: Page, name: string | RegExp) =>
  page.getByRole("button", { name, exact: true });
async function importFile(page: Page) {
  const chooser = page.waitForEvent("filechooser");
  await button(page, "Выбрать CSV-файл").click();
  await (
    await chooser
  ).setFiles({
    name: "bank.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "Дата;Описание;Сумма;ID\n10.09.2026;Соседний магазин;-123;bank-1",
    ),
  });
}
async function openImport(page: Page) {
  await button(page, "Профиль и настройки").click();
  await button(page, "Данные и копии").click();
  await button(page, "Импортировать банковский CSV").click();
}

test.beforeEach(async ({ page }) => {
  const state = createInitialState(false, TODAY);
  state.settings.exchange = { automatic: false, rates: {} };
  state.settings.onboardingCompleted = true;
  state.accounts[0].openingBalance = 1000000;
  await startApp(page, TODAY, state);
});

test("explicit rule, favorite template and saved CSV profile survive reload and retain duplicate checks", async ({
  page,
}, testInfo) => {
  await button(page, "Добавить операцию").click();
  await page
    .getByLabel("Название операции", { exact: true })
    .fill("Соседний магазин");
  await page.getByLabel("Сумма операции", { exact: true }).fill("250");
  await button(page, "Категория").click();
  await page.getByRole("radio", { name: "Продукты", exact: true }).click();
  await button(page, /дополнительные поля операции$/i).click();
  await button(page, "Запомнить категорию для «Соседний магазин»").click();
  await expect
    .poll(async () => (await read(page)).categoryRules?.length)
    .toBe(1);
  await button(page, "Шаблоны").click();
  await page
    .getByLabel("Имя нового шаблона", { exact: true })
    .fill("Магазин у дома");
  await button(page, "Сохранить новый шаблон").click();
  await expect
    .poll(async () => (await read(page)).transactionTemplates?.length)
    .toBe(1);
  expect((await read(page)).transactions).toHaveLength(0);
  await button(page, "Добавить операцию").click();
  await expect.poll(async () => (await read(page)).transactions.length).toBe(1);
  await button(page, "Профиль и настройки").click();
  await button(page, "Правила и шаблоны операций").click();
  await button(page, "Изменить правило 1").click();
  const category = button(page, "Категория");
  await expect(category).toContainText("Продукты");
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await category.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(`rule-category-${width}.png`),
      animations: "disabled",
    });
    await category.click();
    await page
      .getByRole("radio", { name: "Дом", exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(`rule-category-list-${width}.png`),
      animations: "disabled",
    });
    await category.click();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await category.click();
  await page.getByRole("radio", { name: "Дом", exact: true }).click();
  await button(page, "Сохранить правило").click();
  await expect
    .poll(async () => (await read(page)).categoryRules?.[0].category)
    .toBe("home");
  expect((await read(page)).transactions[0].category).toBe("groceries");
  await button(page, "Закрыть").click();
  await button(page, "Добавить операцию").click();
  await button(page, "Шаблоны").click();
  await page.getByRole("button", { name: /^Магазин у дома ·/ }).click();
  await expect(page.getByLabel("Сумма операции", { exact: true })).toHaveValue(
    "250",
  );
  await expect(page.getByLabel("Дата операции", { exact: true })).toHaveValue(
    "10.09.2026",
  );
  await button(page, "Закрыть").click();
  await openImport(page);
  await importFile(page);
  await button(page, "Распознать колонки").click();
  await button(page, "Профили CSV").click();
  await page
    .getByLabel("Название профиля CSV", { exact: true })
    .fill("Банк: карта");
  await button(page, "Сохранить профиль CSV").click();
  await expect.poll(async () => (await read(page)).csvProfiles?.length).toBe(1);
  await button(page, "Проверить операции").click();
  await expect(
    page.getByText(/Правило «Соседний магазин» → Дом/),
  ).toBeVisible();
  await button(page, "Импортировать 1 операций").click();
  await expect.poll(async () => (await read(page)).transactions.length).toBe(2);
  await page.reload();
  await expect(page.getByText("Больше ясности.")).toBeVisible();
  await openImport(page);
  await importFile(page);
  await button(page, "Профили CSV").click();
  await button(page, "Применить профиль «Банк: карта»").click();
  await button(page, "Распознать колонки заново").click();
  await expect(button(page, "Обновить профиль «Банк: карта»")).toBeVisible();
  await page.getByRole("tab", { name: "UTF-8", exact: true }).click();
  await button(page, "Распознать колонки").click();
  await expect(button(page, "Обновить профиль «Банк: карта»")).toBeVisible();
  await button(page, "Проверить операции").click();
  await expect(page.getByText(/Новых выбрано: 0 · повторов: 1/)).toBeVisible();
  await expect(button(page, "Импортировать 0 операций")).toBeDisabled();
  expect((await read(page)).categoryRules?.[0].category).toBe("home");
});

test("split purchase and partial refund stay one account movement each on narrow screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await button(page, "Добавить операцию").click();
  await page
    .getByLabel("Название операции", { exact: true })
    .fill("Покупка с частями");
  await page.getByLabel("Сумма операции", { exact: true }).fill("1000");
  await button(page, /дополнительные поля операции$/i).click();
  await button(page, "Разделить покупку по категориям").click();
  await page.getByLabel("Сумма части 1", { exact: true }).fill("700");
  await button(page, "Продукты").first().click();
  await page.getByLabel("Сумма части 2", { exact: true }).fill("300");
  await button(page, "Дом").last().click();
  await page
    .getByLabel("Сумма части 1", { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "test-results/split-editor-320.png",
    fullPage: true,
  });
  await button(page, "Добавить операцию").click();
  await expect.poll(async () => (await read(page)).transactions.length).toBe(1);
  const purchase = (await read(page)).transactions[0];
  expect(purchase.splits).toEqual([
    { category: "groceries", amount: 70000 },
    { category: "home", amount: 30000 },
  ]);
  await page
    .getByRole("button", { name: /Покупка с частями,.*открыть операцию/ })
    .first()
    .click();
  await button(page, "Записать возврат покупки").click();
  await page.getByLabel("Сумма операции", { exact: true }).fill("500");
  await button(page, "Добавить операцию").click();
  await expect.poll(async () => (await read(page)).transactions.length).toBe(2);
  expect((await read(page)).transactions[0].refundOf).toBe(purchase.id);
  await page.reload();
  await expect(page.getByText("Больше ясности.")).toBeVisible();
  const state = await read(page);
  expect(
    state.transactions.filter((entry) => entry.type === "expense"),
  ).toHaveLength(1);
  expect(state.transactions.find((entry) => entry.refundOf)?.amount).toBe(
    50000,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/split-refund-320.png",
    fullPage: true,
  });
});
