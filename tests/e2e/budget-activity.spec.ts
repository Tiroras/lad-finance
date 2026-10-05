import { expect, test, type Page } from "@playwright/test";
import { createInitialState } from "../../src/domain/seed";
import { pickDate, readState, startApp, startDemoApp } from "./helpers";

const TODAY = "2026-10-04";

const activityToggle = (page: Page, name = "Продукты") =>
  page.getByRole("button", { name: `Расходы за период: ${name}`, exact: true });
const activity = (page: Page, id = "groceries") =>
  page.getByTestId(`budget-activity-${id}`);

test("monthly budget explains its exact total and stays expanded after editing and deleting an operation", async ({
  page,
}) => {
  await startDemoApp(page, TODAY);
  await page.getByRole("tab", { name: "План", exact: true }).click();
  const before = await readState(page);
  await activityToggle(page).click();
  await expect(activityToggle(page)).toHaveAttribute("aria-expanded", "true");
  await expect(
    activity(page).getByText(/Итого за период: 3\s825,00 ₽/),
  ).toBeVisible();
  await expect(
    activity(page).getByRole("button", { name: /^Открыть операцию / }),
  ).toHaveCount(2);
  await expect(
    activity(page).getByText(/4 октября · 1\s485,00 ₽/),
  ).toBeVisible();
  await expect(
    activity(page).getByText(/1 октября · 2\s340,00 ₽/),
  ).toBeVisible();
  expect(await readState(page)).toEqual(before);

  await activity(page)
    .getByRole("button", { name: /^Открыть операцию ВкусВилл,/ })
    .click();
  await page.getByLabel("Сумма операции", { exact: true }).fill("1485,37");
  await page
    .getByRole("button", { name: "Сохранить изменения", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(activityToggle(page)).toHaveAttribute("aria-expanded", "true");
  await expect(
    activity(page).getByText(/Итого за период: 3\s825,37 ₽/),
  ).toBeVisible();
  await expect(
    activity(page).getByText(/4 октября · 1\s485,37 ₽/),
  ).toBeVisible();

  for (const [title, expected] of [
    ["ВкусВилл", /Итого за период: 2\s340,00 ₽/],
    ["Перекрёсток", /Итого за период: 0,00 ₽/],
  ] as const) {
    await activity(page)
      .getByRole("button", { name: new RegExp(`^Открыть операцию ${title},`) })
      .click();
    await page
      .getByRole("button", { name: "Удалить операцию", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Да, удалить", exact: true })
      .click();
    await expect(activity(page).getByText(expected)).toBeVisible();
    await expect(activityToggle(page)).toHaveAttribute("aria-expanded", "true");
  }
  await expect(
    activity(page).getByText("Нет расходов за этот период.", { exact: true }),
  ).toBeVisible();
  await activityToggle(page).click();
  await expect(activity(page)).toHaveCount(0);
});

test("editing budget cadence keeps the disclosure in sync with its exact weekly dates", async ({
  page,
}) => {
  await startDemoApp(page, TODAY);
  await page.getByRole("tab", { name: "План", exact: true }).click();
  await activityToggle(page).click();
  await page
    .getByRole("button", { name: "Изменить бюджет: Продукты", exact: true })
    .click();
  await page.getByRole("tab", { name: "Неделя", exact: true }).click();
  await pickDate(page, "Начало бюджетного периода", TODAY);
  await page
    .getByRole("button", { name: "Сохранить лимит", exact: true })
    .click();
  await expect(activityToggle(page)).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("button", {
      name: "Изменить бюджет: Продукты",
      exact: true,
    }),
  ).toContainText("4 октября — 10 октября");
  await expect(
    activity(page).getByText(/Итого за период: 1\s485,00 ₽/),
  ).toBeVisible();
  await expect(
    activity(page).getByRole("button", { name: /^Открыть операцию / }),
  ).toHaveCount(1);
  await expect(
    activity(page).getByRole("button", {
      name: /^Открыть операцию Перекрёсток,/,
    }),
  ).toHaveCount(0);
  await activityToggle(page, "Кафе и рестораны").click();
  await expect(activity(page)).toHaveCount(0);
  await expect(activityToggle(page)).toHaveAttribute("aria-expanded", "false");
  await expect(activity(page, "cafe")).toBeVisible();
});

test("budget evidence handles empty states, split contributions and long lists on 320 px without changing the ledger", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 844 });
  const state = createInitialState(true, TODAY);
  state.settings.exchange = { automatic: false, rates: {} };
  const longName = "Продукты для большой семьи и домашних праздников";
  state.categories.find((c) => c.id === "groceries")!.name = longName;
  state.transactions = Array.from({ length: 11 }, (_, index) => ({
    id: `activity-${String(index).padStart(2, "0")}`,
    title:
      index === 0
        ? "Большая покупка для семьи и домашних праздников"
        : `Покупка ${index}`,
    date: TODAY,
    type: "expense" as const,
    amount: index === 0 ? 100_001 : 101,
    category: "groceries",
    accountId: "card",
    ...(index === 0
      ? {
          splits: [
            { category: "groceries", amount: 70_001 },
            { category: "home", amount: 30_000 },
          ],
        }
      : {}),
  }));
  await startApp(page, TODAY, state);
  await page.getByRole("tab", { name: "План", exact: true }).click();
  const before = await readState(page);
  await activityToggle(page, "Кафе и рестораны").click();
  await expect(
    activity(page, "cafe").getByText("Нет расходов за этот период.", {
      exact: true,
    }),
  ).toBeVisible();
  await activityToggle(page, longName).click();
  await expect(activity(page, "cafe")).toHaveCount(0);
  const rows = activity(page).getByRole("button", {
    name: /^Открыть операцию /,
  });
  await expect(rows).toHaveCount(5);
  await expect(
    activity(page).getByText(/Итого за период: 710,11 ₽/),
  ).toBeVisible();
  await expect(
    activity(page).getByText(/700,01 ₽ в этом бюджете из покупки 1\s000,01 ₽/),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await activity(page).screenshot({
    path: testInfo.outputPath("budget-activity-320.png"),
    animations: "disabled",
  });
  await activity(page)
    .getByRole("button", { name: "Показать ещё 5", exact: true })
    .click();
  await expect(rows).toHaveCount(10);
  await activity(page)
    .getByRole("button", { name: "Показать ещё 1", exact: true })
    .click();
  await expect(rows).toHaveCount(11);
  await activity(page)
    .getByRole("button", { name: "Свернуть операции", exact: true })
    .click();
  await expect(rows).toHaveCount(5);
  expect(await readState(page)).toEqual(before);
});
