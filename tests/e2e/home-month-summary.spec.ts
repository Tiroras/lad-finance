import { expect, test, type Locator, type Page } from "@playwright/test";
import { money } from "../../src/domain/currency";
import { createInitialState } from "../../src/domain/seed";
import type { FinanceState } from "../../src/domain/types";
import { readState, startApp } from "./helpers";

const TODAY = "2026-10-04";
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const summary = (page: Page) => page.getByTestId("home-month-summary");
const income = (page: Page) => page.getByTestId("home-month-income");
const expense = (page: Page) => page.getByTestId("home-month-expense");

function fixture(): FinanceState {
  const state = createInitialState(false, TODAY);
  state.demo = true;
  state.settings.onboardingCompleted = true;
  state.settings.exchange = { automatic: false, rates: {} };
  state.accounts[0].openingBalance = 1_000_000;
  state.transactions = [
    {
      id: "october-income",
      type: "income",
      title: "Оплата работы за октябрь",
      amount: 1_234_500,
      date: "2026-10-01",
      category: "other",
      accountId: "card",
    },
    {
      id: "october-purchase",
      type: "expense",
      title: "Покупка с двумя категориями",
      amount: 246_800,
      date: "2026-10-02",
      category: "groceries",
      accountId: "card",
      splits: [
        { category: "groceries", amount: 180_000 },
        { category: "home", amount: 66_800 },
      ],
    },
    {
      id: "october-refund",
      type: "income",
      title: "Возврат сентябрьской покупки",
      amount: 30_000,
      date: "2026-10-03",
      category: "shopping",
      accountId: "card",
      refundOf: "september-purchase",
    },
    {
      id: "october-transfer",
      type: "transfer",
      title: "Перевод в накопления",
      amount: 100_000,
      date: TODAY,
      category: "other",
      accountId: "card",
      toAccountId: "savings",
    },
    {
      id: "september-income",
      type: "income",
      title: "Оплата работы за сентябрь",
      amount: 500_000,
      date: "2026-09-29",
      category: "other",
      accountId: "card",
    },
    {
      id: "september-purchase",
      type: "expense",
      title: "Сентябрьская покупка",
      amount: 100_000,
      date: "2026-09-30",
      category: "shopping",
      accountId: "card",
    },
  ];
  return state;
}

async function expectFitsHorizontally(locator: Locator, width: number) {
  const size = await locator.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      left: bounds.left,
      right: bounds.right,
      contentWidth: element.scrollWidth,
      viewportWidth: element.clientWidth,
    };
  });
  expect(size.left).toBeGreaterThanOrEqual(0);
  expect(size.right).toBeLessThanOrEqual(width);
  expect(size.contentWidth).toBeLessThanOrEqual(size.viewportWidth + 1);
}

test("home shows the current month's actual totals and opens matching analytics without changing the ledger", async ({
  page,
}) => {
  await startApp(page, TODAY, fixture());
  const before = await readState(page);
  await expect(
    summary(page).getByText(/^Этот месяц · октябрь$/i),
  ).toBeVisible();
  // The October refund reduces October spending; it is not another income.
  // The split purchase counts once, and transfers and September totals stay out.
  await expect(income(page)).toHaveText(money(1_234_500));
  await expect(expense(page)).toHaveText(money(216_800));

  const quickAction = await button(page, "Расход").boundingBox();
  const monthly = await summary(page).boundingBox();
  const accounts = await button(page, "Открыть мои счета").boundingBox();
  expect(monthly!.y).toBeGreaterThanOrEqual(
    quickAction!.y + quickAction!.height,
  );
  expect(monthly!.y + monthly!.height).toBeLessThanOrEqual(accounts!.y);

  await summary(page)
    .getByRole("button", { name: "Подробнее в аналитике", exact: true })
    .click();
  const analytics = page.getByTestId("screen-analytics");
  await expect(analytics).toBeVisible();
  await expect(
    analytics.getByText("октябрь 2026", { exact: true }),
  ).toBeVisible();
  await expect(
    analytics.getByText("Доходы", { exact: true }).locator(".."),
  ).toContainText(money(1_234_500));
  await expect(
    analytics.getByText("Расходы", { exact: true }).locator(".."),
  ).toContainText(money(216_800));
  expect(await readState(page)).toEqual(before);

  await button(page, "Предыдущий месяц").click();
  await expect(
    analytics.getByText("сентябрь 2026", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Обзор", exact: true }).click();
  await expect(income(page)).toHaveText(money(1_234_500));
  await expect(expense(page)).toHaveText(money(216_800));
  expect(await readState(page)).toEqual(before);
});

test("hiding balances removes monthly values from both visible text and accessibility until revealed", async ({
  page,
}) => {
  await startApp(page, TODAY, fixture());
  const before = await readState(page);
  await expect(income(page)).toHaveText(money(1_234_500));
  await expect(expense(page)).toHaveText(money(216_800));
  await button(page, "Скрыть баланс").click();
  await expect(income(page)).toContainText("•••");
  await expect(expense(page)).toContainText("•••");
  await expect(summary(page)).not.toContainText(/\d/);
  const accessibility = await summary(page).ariaSnapshot();
  // Heading levels describe the accessibility tree; they are not spoken values.
  expect(accessibility.replace(/\[level=\d+\]/g, "")).not.toMatch(/\d/);
  await expect(
    summary(page).getByRole("button", {
      name: "Подробнее в аналитике",
      exact: true,
    }),
  ).toBeVisible();
  await button(page, "Показать баланс").click();
  await expect(income(page)).toHaveText(money(1_234_500));
  await expect(expense(page)).toHaveText(money(216_800));
  expect(await readState(page)).toEqual(before);
});

test("large monthly totals and the analytics link stay readable at 320, 390 and 1440 pixels", async ({
  page,
}, testInfo) => {
  const state = fixture();
  state.transactions = [
    { ...state.transactions[0], amount: 98_765_432_100 },
    {
      ...state.transactions[1],
      amount: 87_654_321_000,
      splits: undefined,
    },
  ];
  await startApp(page, TODAY, state);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await summary(page).scrollIntoViewIfNeeded();
    await expect(income(page)).toHaveText(money(98_765_432_100));
    await expect(expense(page)).toHaveText(money(87_654_321_000));
    await expectFitsHorizontally(summary(page), width);
    await expectFitsHorizontally(income(page), width);
    await expectFitsHorizontally(expense(page), width);
    const more = summary(page).getByRole("button", {
      name: "Подробнее в аналитике",
      exact: true,
    });
    await expect(more).toBeVisible();
    await expectFitsHorizontally(more, width);
    await page.screenshot({
      path: testInfo.outputPath(`home-month-summary-${width}.png`),
      animations: "disabled",
    });
  }
});
