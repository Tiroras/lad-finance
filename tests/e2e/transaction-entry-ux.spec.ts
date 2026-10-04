import { expect, test, type Page } from "@playwright/test";
import { accountBalance } from "../../src/domain/finance";
import { createInitialState } from "../../src/domain/seed";
import { readState, startApp } from "./helpers";

const TODAY = "2026-10-04";
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const input = (page: Page, name: string) =>
  page.getByRole("textbox", { name, exact: true });
const details = (page: Page) =>
  page.getByRole("button", { name: /дополнительные поля операции$/i });
const fixture = () => {
  const state = createInitialState(true, TODAY);
  state.settings.exchange = { automatic: false, rates: {} };
  return state;
};

test("the compact expense keeps main fields together and optional fields collapsed at every width", async ({
  page,
}, testInfo) => {
  await startApp(page, TODAY, fixture());
  await button(page, "Добавить операцию").click();
  await input(page, "Сумма операции").fill("320,50");
  await input(page, "Название операции").fill("Кофе по дороге на работу");
  await button(page, "Категория").click();
  await page
    .getByRole("radio", { name: "Кафе и рестораны", exact: true })
    .click();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(button(page, "Быстрый ввод")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await expect(button(page, "Шаблоны")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await expect(details(page)).toHaveAttribute("aria-expanded", "false");
    await expect(input(page, "Быстрый ввод")).toHaveCount(0);
    await expect(input(page, "Заметка")).toHaveCount(0);
    await expect(button(page, "Разделить покупку по категориям")).toHaveCount(
      0,
    );
    await expect(button(page, "Категория")).toContainText("Кафе и рестораны");
    await expect(input(page, "Дата операции")).toHaveValue("04.10.2026");
    await expect(button(page, "Добавить операцию")).toHaveCount(1);
    // The standard draft needs less than one full viewport of scrolling.
    // Optional tools must not silently expand as the viewport changes.
    const scroll = await page
      .getByTestId("sheet-scroll")
      .evaluate((element) => ({
        content: element.scrollHeight,
        viewport: element.clientHeight,
        width: element.scrollWidth,
        availableWidth: element.clientWidth,
      }));
    expect(scroll.content - scroll.viewport).toBeLessThan(scroll.viewport);
    expect(scroll.width).toBeLessThanOrEqual(scroll.availableWidth);
    await input(page, "Сумма операции").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(`compact-expense-${width}.png`),
      animations: "disabled",
    });
  }
});

test("quick entry keeps invalid text and draft, then reveals a valid draft without saving and respects manual category", async ({
  page,
}) => {
  const state = fixture();
  state.categoryRules = [
    {
      id: "coffee",
      pattern: "Кофе",
      match: "contains",
      category: "cafe",
      enabled: true,
    },
  ];
  await startApp(page, TODAY, state);
  const before = await readState(page);
  await button(page, "Добавить операцию").click();
  await button(page, "Добавить операцию").click();
  const saveError = page.getByRole("alert").filter({
    hasText: "Введите корректную сумму в валюте счёта.",
  });
  await expect(saveError).toBeVisible();
  await input(page, "Сумма операции").fill("42");
  await input(page, "Название операции").fill("Мой черновик");
  await button(page, "Быстрый ввод").click();
  await input(page, "Быстрый ввод").fill("Кофе без суммы");
  await button(page, "Распознать запись").click();
  const error = page
    .getByRole("alert")
    .filter({ hasText: "Напишите название и одну сумму" });
  await expect(error).toBeVisible();
  await expect(button(page, "Быстрый ввод")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(input(page, "Быстрый ввод")).toHaveValue("Кофе без суммы");
  await expect(input(page, "Сумма операции")).toHaveValue("42");
  await expect(input(page, "Название операции")).toHaveValue("Мой черновик");
  expect((await error.boundingBox())!.y).toBeLessThan(
    (await input(page, "Сумма операции").boundingBox())!.y,
  );
  expect((await readState(page)).transactions).toEqual(before.transactions);
  await input(page, "Быстрый ввод").fill("Зарплата 120000");
  await button(page, "Распознать запись").click();
  await expect(
    page.getByRole("tab", { name: "Доход", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(input(page, "Название операции")).toHaveValue("Зарплата");
  await expect(input(page, "Быстрый ввод")).toHaveCount(0);
  await expect(saveError).toHaveCount(0);
  expect((await readState(page)).transactions).toEqual(before.transactions);
  await button(page, "Быстрый ввод").click();
  await input(page, "Быстрый ввод").fill("Кофе 320,50");
  await input(page, "Быстрый ввод").press("Enter");
  await expect(input(page, "Быстрый ввод")).toHaveCount(0);
  await expect(button(page, "Быстрый ввод")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(input(page, "Сумма операции")).toHaveValue("320,5");
  await expect(input(page, "Название операции")).toHaveValue("Кофе");
  await expect(error).toHaveCount(0);
  expect((await readState(page)).transactions).toEqual(before.transactions);
  await button(page, "Быстрый ввод").click();
  await expect(input(page, "Быстрый ввод")).toHaveValue("Кофе 320,50");
  await button(page, "Быстрый ввод").click();
  await button(page, "Категория").click();
  await page.getByRole("radio", { name: "Продукты", exact: true }).click();
  await input(page, "Название операции").fill("Кофе для поездки");
  await expect(button(page, "Категория")).toContainText("Продукты");
  await button(page, "Добавить операцию").click();
  await expect
    .poll(async () => (await readState(page)).transactions.length)
    .toBe(before.transactions.length + 1);
  const after = await readState(page);
  expect(after.transactions[0]).toMatchObject({
    title: "Кофе для поездки",
    amount: 32050,
    category: "groceries",
    date: TODAY,
  });
  expect(accountBalance(after, "card", TODAY)).toBe(
    accountBalance(before, "card", TODAY) - 32050,
  );
});

test("a template reveals its note and split parts and collapsing details cannot hide an active split", async ({
  page,
}) => {
  const state = fixture();
  state.transactionTemplates = [
    {
      id: "split-template",
      name: "Закупка для дома",
      title: "Большая покупка",
      type: "expense",
      amount: 100000,
      category: "groceries",
      accountId: "card",
      currency: "RUB",
      note: "Продукты и вещи для дома",
      splits: [
        { category: "groceries", amount: 70000 },
        { category: "home", amount: 30000 },
      ],
    },
  ];
  await startApp(page, TODAY, state);
  const before = await readState(page);
  await button(page, "Добавить операцию").click();
  await button(page, "Шаблоны").click();
  await input(page, "Имя нового шаблона").fill("Мой рабочий шаблон");
  await button(page, "Шаблоны").click();
  await button(page, "Быстрый ввод").click();
  await button(page, "Шаблоны").click();
  await expect(input(page, "Имя нового шаблона")).toHaveValue(
    "Мой рабочий шаблон",
  );
  await page.getByRole("button", { name: /^Закупка для дома ·/ }).click();
  await expect(button(page, "Шаблоны")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(details(page)).toHaveAttribute("aria-expanded", "true");
  await expect(input(page, "Заметка")).toHaveValue("Продукты и вещи для дома");
  await expect(input(page, "Сумма части 1")).toHaveValue("700");
  await expect(input(page, "Сумма части 2")).toHaveValue("300");
  expect((await readState(page)).transactions).toEqual(before.transactions);
  await details(page).click();
  await expect(details(page)).toHaveAccessibleName(/заметка заполнена/i);
  await expect(input(page, "Заметка")).toHaveCount(0);
  await expect(
    page.getByText("Заметка: Продукты и вещи для дома", { exact: true }),
  ).toBeVisible();
  await expect(input(page, "Сумма части 1")).toBeVisible();
  await input(page, "Сумма части 1").fill("650");
  await input(page, "Сумма части 2").fill("350");
  await button(page, "Добавить операцию").click();
  await expect
    .poll(async () => (await readState(page)).transactions.length)
    .toBe(before.transactions.length + 1);
  const after = await readState(page);
  expect(after.transactions[0]).toMatchObject({
    amount: 100000,
    date: TODAY,
    note: "Продукты и вещи для дома",
    splits: [
      { category: "groceries", amount: 65000 },
      { category: "home", amount: 35000 },
    ],
  });
  expect(accountBalance(after, "card", TODAY)).toBe(
    accountBalance(before, "card", TODAY) - 100000,
  );
  await page.reload();
  await expect
    .poll(async () => (await readState(page)).transactions[0])
    .toEqual(after.transactions[0]);
});
