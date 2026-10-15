import { readState as getState, startDemoApp } from "./helpers";
import { test, expect, type Page } from "@playwright/test";
import { createInitialState } from "../../src/domain/seed";
import { categoryBudget } from "../../src/domain/budgets";
import {
  accountBalance as actualBalance,
  goalSaved as actualGoalSaved,
  money,
  spendable as actualSpendable,
} from "../../src/domain/finance";
import type { FinanceState } from "../../src/domain/types";

const TODAY = "2026-09-10";
const accountBalance = (state: FinanceState, id: string) =>
  actualBalance(state, id, TODAY);
const goalSaved = (state: FinanceState, goal: FinanceState["goals"][number]) =>
  actualGoalSaved(state, goal, TODAY);
const spendable = (state: FinanceState) => actualSpendable(state, TODAY);
const closeSheet = (page: Page) =>
  page.getByRole("button", { name: "Закрыть", exact: true }).click();
test.beforeEach(async ({ page }) => {
  await startDemoApp(page, TODAY);
});

test("overview, accessible navigation, balance visibility and mobile width", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await expect(
    page.getByText("Можно потратить", { exact: true }),
  ).toBeVisible();
  const state = await getState(page);
  await expect(
    page.getByText(money(spendable(state).available), { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Скрыть баланс", exact: true })
    .click();
  await expect(page.getByText("••• ••• ₽").first()).toBeVisible();
  await page.getByRole("tab", { name: "План", exact: true }).click();
  await expect(page.getByText("У всего есть план")).toBeVisible();
  await page.getByRole("tab", { name: "Аналитика", exact: true }).click();
  await expect(page.getByText("Понять свои привычки")).toBeVisible();
  await page.getByRole("tab", { name: "Операции", exact: true }).click();
  await expect(page.getByText("Ваши операции")).toBeVisible();
  await page.getByRole("button", { name: "Фильтры", exact: true }).click();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page
      .getByRole("tab", { name: "Все", exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(`transaction-filters-${width}.png`),
      animations: "disabled",
    });
  }
  await page.setViewportSize({ width: 320, height: 844 });
  const salary = page.getByRole("button", {
    name: /^Зарплата,.*открыть операцию$/,
  });
  const groceries = page.getByRole("button", {
    name: /^ВкусВилл,.*открыть операцию$/,
  });
  await page.getByRole("tab", { name: "Доходы", exact: true }).click();
  await expect(salary).toBeVisible();
  await expect(groceries).toHaveCount(0);
  await page.getByRole("tab", { name: "Переводы", exact: true }).click();
  await expect(
    page.getByText("Ничего не найдено", { exact: true }),
  ).toBeVisible();
  await expect(salary).toHaveCount(0);
  await page.getByRole("tab", { name: "Долги", exact: true }).click();
  await expect(
    page.getByText("Ничего не найдено", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Расходы", exact: true }).click();
  await expect(groceries).toBeVisible();
  await expect(salary).toHaveCount(0);
  await page.getByRole("tab", { name: "Все", exact: true }).click();
  await expect(salary).toBeVisible();
  await expect(groceries).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("quick expense, persistence, search, edit and delete update balances", async ({
  page,
}) => {
  const before = await getState(page),
    beforeBalance = accountBalance(before, "card");
  await page
    .getByRole("button", { name: "Добавить операцию", exact: true })
    .click();
  await page.getByRole("button", { name: "Быстрый ввод", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Быстрый ввод", exact: true })
    .fill("кофе тест 320,50");
  await page.getByRole("tab", { name: "Перевод", exact: true }).click();
  await page.getByRole("tab", { name: "Расход", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Быстрый ввод", exact: true }),
  ).toHaveValue("кофе тест 320,50");
  await page
    .getByRole("button", { name: "Распознать запись", exact: true })
    .click();
  await expect(
    page.getByLabel("Название операции", { exact: true }),
  ).toHaveValue("Кофе тест");
  await expect(page.getByLabel("Сумма операции", { exact: true })).toHaveValue(
    "320,5",
  );
  await page
    .getByRole("button", { name: "Добавить операцию", exact: true })
    .click();
  await expect
    .poll(async () => (await getState(page)).transactions.length)
    .toBe(before.transactions.length + 1);
  expect(accountBalance(await getState(page), "card")).toBe(
    beforeBalance - 32050,
  );
  await page.reload();
  await page.getByRole("tab", { name: "Операции", exact: true }).click();
  await page.getByLabel("Поиск операций", { exact: true }).fill("Кофе тест");
  await page
    .getByRole("button", { name: /Кофе тест,.*открыть операцию/ })
    .click();
  await page.getByLabel("Сумма операции", { exact: true }).fill("400");
  await page
    .getByRole("button", { name: "Сохранить изменения", exact: true })
    .click();
  await expect
    .poll(async () => accountBalance(await getState(page), "card"))
    .toBe(beforeBalance - 40000);
  await page
    .getByRole("button", { name: /Кофе тест,.*открыть операцию/ })
    .click();
  await page
    .getByRole("button", { name: "Удалить операцию", exact: true })
    .click();
  await page.getByRole("button", { name: "Да, удалить", exact: true }).click();
  await expect
    .poll(async () => accountBalance(await getState(page), "card"))
    .toBe(beforeBalance);
});

test("purchase simulation updates risk without mutating the ledger", async ({
  page,
}) => {
  const before = await getState(page);
  await page
    .getByRole("button", { name: "Проверить покупку", exact: true })
    .click();
  await page.getByLabel("Стоимость покупки", { exact: true }).fill("100");
  await expect(page.getByText("Вписывается в ваш план")).toBeVisible();
  await page.getByLabel("Стоимость покупки", { exact: true }).fill("1000000");
  await expect(page.getByText("Плану понадобится место")).toBeVisible();
  await closeSheet(page);
  expect(await getState(page)).toEqual(before);
});

test("goal contributions are transfers; savings persist after reload", async ({
  page,
}) => {
  const before = await getState(page),
    beforeTotal = before.accounts.reduce(
      (sum, a) => sum + accountBalance(before, a.id),
      0,
    );
  await page.getByRole("tab", { name: "План", exact: true }).click();
  await page.getByRole("tab", { name: "Цели", exact: true }).click();
  await page
    .getByRole("button", { name: "Пополнить цель", exact: true })
    .first()
    .click();
  await page.getByLabel("Сумма пополнения цели", { exact: true }).fill("5000");
  await page
    .getByRole("button", { name: "Записать пополнение", exact: true })
    .click();
  await expect
    .poll(async () => (await getState(page)).transactions.length)
    .toBe(before.transactions.length + 1);
  const after = await getState(page);
  expect(
    after.accounts.reduce((sum, a) => sum + accountBalance(after, a.id), 0),
  ).toBe(beforeTotal);
  expect(goalSaved(after, after.goals[0])).toBe(
    goalSaved(before, before.goals[0]) + 500000,
  );
  expect(spendable(after).available).toBe(spendable(before).available);
  await page.reload();
  await expect(page.getByText("Больше ясности.")).toBeVisible();
  expect(goalSaved(await getState(page), after.goals[0])).toBe(
    goalSaved(before, before.goals[0]) + 500000,
  );
});

test("budget editing and subscription toggle persist", async ({
  page,
}, testInfo) => {
  await page.getByRole("tab", { name: "План", exact: true }).click();
  await page
    .getByRole("button", { name: "Изменить бюджет: Продукты", exact: true })
    .click();
  await page.getByLabel("Лимит категории", { exact: true }).fill("22000");
  await page
    .getByRole("button", { name: "Сохранить лимит", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        categoryBudget(await getState(page), "groceries", TODAY, TODAY).budget,
    )
    .toBe(2200000);
  await page.getByRole("tab", { name: "Платежи", exact: true }).click();
  await page
    .getByLabel("Учитывать Яндекс Плюс в плане", { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("payment-toggle-on.png"),
    animations: "disabled",
  });
  await page
    .getByLabel("Учитывать Яндекс Плюс в плане", { exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await getState(page)).recurring.find((p) => p.id === "plus")?.active,
    )
    .toBe(false);
  await page.screenshot({
    path: testInfo.outputPath("payment-toggle-off.png"),
    animations: "disabled",
  });
  await page.reload();
  await expect(page.getByText("Больше ясности.")).toBeVisible();
  expect(
    (await getState(page)).recurring.find((p) => p.id === "plus")?.active,
  ).toBe(false);
  expect(
    categoryBudget(await getState(page), "groceries", TODAY, TODAY).budget,
  ).toBe(2200000);
});

test("a paid subscription remains paid after changing its monthly date", async ({
  page,
}) => {
  const before = await getState(page);
  await page.getByRole("tab", { name: "План", exact: true }).click();
  await page.getByRole("tab", { name: "Платежи", exact: true }).click();
  await page
    .getByRole("button", { name: /Яндекс Плюс.*Запланирован/ })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Я оплатил — записать расход", exact: true })
    .click();
  await expect
    .poll(async () => (await getState(page)).transactions.length)
    .toBe(before.transactions.length + 1);
  await page
    .getByRole("button", { name: "Изменить платёж Яндекс Плюс", exact: true })
    .click();
  await page.getByLabel("День списания", { exact: true }).fill("14");
  await page
    .getByRole("button", { name: "Сохранить платёж", exact: true })
    .click();
  await page
    .getByRole("button", { name: /Яндекс Плюс.*Оплачен/ })
    .first()
    .click();
  await expect(
    page.getByRole("button", {
      name: "Открыть записанную операцию",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Я оплатил — записать расход",
      exact: true,
    }),
  ).toHaveCount(0);
  expect(accountBalance(await getState(page), "card")).toBe(
    accountBalance(before, "card") - 44900,
  );
});

test("export downloads data; import validates and requires replacement confirmation", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Профиль и настройки", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Данные и копии", exact: true })
    .click();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", {
      name: "Экспортировать резервную копию",
      exact: true,
    })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^lad-backup-.*\.json$/);
  const before = await getState(page);
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Восстановить из файла", exact: true })
    .click();
  const fileChooser = await fileChooserPromise;
  const imported = createInitialState(false);
  imported.settings.name = "Тимур";
  imported.accounts[0].openingBalance = 5000000;
  await fileChooser.setFiles({
    name: "lad.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(imported)),
  });
  await expect(page.getByText("Копия проверена")).toBeVisible();
  expect(await getState(page)).toEqual(before);
  await page
    .getByRole("button", { name: "Заменить данные этой копией", exact: true })
    .click();
  await expect(page.getByTestId("import-result-status")).toHaveText(
    "Импорт сохранён и проверен чтением.",
  );
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await expect(page.getByText("Тимур, всё на виду.")).toBeVisible();
  await expect
    .poll(async () => (await getState(page)).transactions.length)
    .toBe(0);
});

test("reset requires confirmation and leaves a usable empty personal ledger", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Профиль и настройки", exact: true })
    .click();
  await page.getByRole("button", { name: "Профили", exact: true }).click();
  await page
    .getByRole("button", { name: "Открыть профиль: Личный", exact: true })
    .click();
  await expect.poll(async () => (await getState(page)).demo).toBe(false);
  await page
    .getByRole("button", { name: "Профиль и настройки", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Данные и копии", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Очистить учёт", exact: true })
    .click();
  await expect(page.getByText("Начать с чистого листа?")).toBeVisible();
  expect((await getState(page)).demo).toBe(false);
  await page
    .getByRole("button", { name: "Да, начать с пустых счетов", exact: true })
    .click();
  await expect.poll(async () => (await getState(page)).demo).toBe(false);
  expect((await getState(page)).transactions).toEqual([]);
  await page
    .getByRole("button", { name: "Открыть мои счета", exact: true })
    .click();
  await expect(page.getByText("Мои счета", { exact: true })).toBeVisible();
});

test("small and large layouts keep navigation and content accessible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Добавить операцию", exact: true })
    .click();
  await expect(
    page.getByLabel("Сумма операции", { exact: true }),
  ).toBeVisible();
  await closeSheet(page);
  await page.setViewportSize({ width: 1440, height: 1040 });
  await expect(
    page.getByRole("button", { name: "Настройки", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Можно потратить", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
