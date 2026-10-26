import { expect, test, type Page } from "@playwright/test";
import { createInitialState } from "../../src/domain/seed";
import type { Recurring } from "../../src/domain/types";
import { accountBalance } from "../../src/domain/accountBalances";
import { readState, startApp } from "./helpers";

const TODAY = "2026-10-26";
const CATEGORY = "Дом / Аренда и содержание квартиры";
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });

function fixture() {
  const state = createInitialState(false, TODAY);
  state.accounts[0].openingBalance = 1_000_000;
  state.settings.onboardingCompleted = true;
  state.settings.exchange = { automatic: false, rates: {} };
  state.categories.push({
    ...state.categories.find((category) => category.id === "home")!,
    id: "home-rent",
    name: "Аренда и содержание квартиры",
    parentId: "home",
    budget: 0,
  });
  return state;
}

async function openPayments(page: Page) {
  await page.getByRole("tab", { name: "План", exact: true }).click();
  await page.getByRole("tab", { name: "Платежи", exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.route("https://api.frankfurter.dev/**", (route) => route.abort());
});

test("the common summary includes both legacy kinds, excludes paid and skipped dates and preserves saved plans", async ({
  page,
}, testInfo) => {
  const state = fixture();
  const payment = (
    id: string,
    name: string,
    amount: number,
    kind: Recurring["kind"],
    category: string,
  ): Recurring => ({
    id,
    name,
    amount,
    kind,
    category,
    day: 28,
    startsOn: TODAY,
    accountId: "card",
    active: true,
    icon: "wifi-outline",
    color: "#EDF1E8",
  });
  state.recurring = [
    payment("rent", "Аренда квартиры", 10_000, "bill", "home-rent"),
    payment("music", "Музыка", 5_000, "subscription", "fun"),
    payment("paid", "Уже оплачено", 2_500, "subscription", "other"),
    {
      ...payment("skipped", "Пропущенный платёж", 7_500, "bill", "other"),
      skippedMonths: ["2026-10"],
    },
  ];
  state.transactions = [
    {
      id: "payment-fact",
      type: "expense",
      title: "Уже оплачено",
      amount: 2_500,
      date: TODAY,
      accountId: "card",
      category: "other",
      recurringId: "paid",
      occurrenceDate: "2026-10-28",
      baseAmount: 2_500,
    },
  ];
  await startApp(page, TODAY, state);
  const before = await readState(page);
  await openPayments(page);
  const summary = page.getByTestId("payments-summary");
  await expect(summary).toContainText("Платежи в вашем плане");
  await expect(summary).toContainText("150 ₽ за 30 дней");
  await expect(summary).toContainText("2 900 ₽ за следующие 365 дней");
  await expect(page.getByText("Подписки в вашем плане")).toHaveCount(0);
  await expect(button(page, "Изменить платёж Аренда квартиры")).toContainText(
    CATEGORY,
  );
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await summary.evaluate((element) =>
      element.scrollIntoView({ block: "center" }),
    );
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`payments-summary-${width}.png`),
      animations: "disabled",
    });
  }
  await button(page, "Изменить платёж Музыка").click();
  await expect(
    page.getByRole("tab", { name: "Подписка", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("tab", { name: "Обязательный платёж", exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Название платежа", { exact: true })
    .fill("Музыка дома");
  await button(page, "Сохранить платёж").click();
  await expect
    .poll(async () => (await readState(page)).recurring[1].name)
    .toBe("Музыка дома");
  await page.reload();
  await openPayments(page);
  await expect(summary).toContainText("150 ₽ за 30 дней");
  const saved = await readState(page);
  expect(saved.recurring).toEqual(
    before.recurring.map((entry) =>
      entry.id === "music" ? { ...entry, name: "Музыка дома" } : entry,
    ),
  );
  expect(saved.transactions).toEqual(before.transactions);
  expect(saved.accounts).toEqual(before.accounts);
});

test("a regular payment uses a category, survives reload and records one expense", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await startApp(page, TODAY, fixture());
  await openPayments(page);
  await button(page, "Добавить").click();
  await expect(
    page.getByRole("tab", { name: "Подписка", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("tab", { name: "Обязательный платёж", exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Название платежа", { exact: true })
    .fill("Ежемесячная аренда квартиры и парковки");
  await page.getByLabel("Сумма платежа", { exact: true }).fill("200");
  await page.getByLabel("День списания", { exact: true }).fill("28");
  await button(page, CATEGORY).click();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page
      .getByLabel("Название платежа", { exact: true })
      .scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`payment-form-${width}.png`),
      animations: "disabled",
    });
  }
  await button(page, "Сохранить платёж").click();
  await expect
    .poll(async () => (await readState(page)).recurring.length)
    .toBe(1);
  await page.reload();
  await openPayments(page);
  const saved = await readState(page);
  const plan = saved.recurring[0];
  expect(plan.kind).toBeUndefined();
  expect(plan.category).toBe("home-rent");
  expect(plan.day).toBe(28);
  expect(plan.amount).toBe(20_000);
  expect(saved.transactions).toEqual([]);
  expect(accountBalance(saved, "card", TODAY)).toBe(1_000_000);
  await expect(page.getByTestId("payments-summary")).toContainText(
    "200 ₽ за 30 дней",
  );
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const card = button(page, `Изменить платёж ${plan.name}`);
    await card.evaluate((element) =>
      element.scrollIntoView({ block: "center" }),
    );
    await expect(card).toContainText(CATEGORY);
    const bounds = await card.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: testInfo.outputPath(`payment-category-${width}.png`),
      animations: "disabled",
    });
  }
  await page
    .getByRole("button", {
      name: /Ежемесячная аренда квартиры и парковки, 28 октября/,
    })
    .click();
  await expect(
    page.getByRole("dialog").getByText(CATEGORY, { exact: true }),
  ).toBeVisible();
  await button(page, "Я оплатил — записать расход").click();
  await expect
    .poll(async () => (await readState(page)).transactions.length)
    .toBe(1);
  const paid = await readState(page);
  expect(paid.transactions[0].category).toBe("home-rent");
  expect(paid.transactions[0].recurringId).toBe(plan.id);
  expect(accountBalance(paid, "card", TODAY)).toBe(980_000);
  await expect(page.getByTestId("payments-summary")).toContainText(
    "0 ₽ за 30 дней",
  );
  await expect(page.getByTestId("payments-summary")).toContainText(
    "2 200 ₽ за следующие 365 дней",
  );
});
