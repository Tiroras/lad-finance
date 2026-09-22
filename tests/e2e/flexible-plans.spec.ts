import { expect, test } from "@playwright/test";
import { createInitialState } from "../../src/domain/seed";
import type { FinanceState } from "../../src/domain/types";

const TODAY = "2026-09-10";
test("weekly budgets and payment schedules are editable on a narrow screen and persist", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 844 });
  const initial = createInitialState(false, TODAY);
  initial.accounts[0].openingBalance = 100_000;
  initial.settings.onboardingCompleted = true;
  await page.clock.install({ time: new Date("2026-09-10T12:00:00+04:00") });
  await page.addInitScript((state) => {
    if (!localStorage.getItem("lad-finance-v1"))
      localStorage.setItem("lad-finance-v1", JSON.stringify(state));
  }, initial);
  const read = (): Promise<FinanceState> =>
    page.evaluate(() => JSON.parse(localStorage.getItem("lad-finance-v1")!));
  await page.goto("/");
  await expect(page.getByText("Больше ясности.")).toBeVisible();
  await page.getByRole("tab", { name: "План", exact: true }).click();
  await page
    .getByRole("button", { name: "Изменить бюджет: Продукты", exact: true })
    .click();
  await page.getByRole("tab", { name: "Неделя", exact: true }).click();
  await page
    .getByLabel("Начало бюджетного периода", { exact: true })
    .fill(TODAY);
  await page.getByLabel("Переносить остаток бюджета", { exact: true }).click();
  await page.getByLabel("Лимит категории", { exact: true }).fill("100");
  await page
    .getByRole("tab", { name: "Только этот период", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Сохранить лимит", exact: true })
    .click();
  await expect
    .poll(async () => (await read()).budgetPlans?.[0].period)
    .toBe("weekly");
  expect((await read()).budgetPlans?.[0].overrides).toEqual([
    { start: TODAY, amount: 10_000 },
  ]);
  await page.getByRole("tab", { name: "Платежи", exact: true }).click();
  await page.getByRole("button", { name: "Добавить", exact: true }).click();
  await page
    .getByLabel("Название платежа", { exact: true })
    .fill("Еженедельный курс");
  await page.getByLabel("Сумма платежа", { exact: true }).fill("50");
  await page.getByRole("tab", { name: "Неделя", exact: true }).click();
  await page.getByLabel("Дата начала платежа", { exact: true }).fill(TODAY);
  await page.screenshot({
    path: testInfo.outputPath("weekly-payment-320.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Сохранить платёж", exact: true })
    .click();
  await expect.poll(async () => (await read()).recurring.length).toBe(1);
  expect((await read()).recurring[0].schedule).toEqual({
    unit: "week",
    interval: 1,
    anchor: TODAY,
  });
  await page
    .getByRole("button", { name: /Еженедельный курс, 10 сентября/ })
    .click();
  await page
    .getByRole("button", { name: "Пропустить этот платёж", exact: true })
    .click();
  await expect
    .poll(async () => (await read()).recurring[0].skippedDates)
    .toEqual([TODAY]);
  await page
    .getByRole("button", { name: "Вернуть этот платёж в план", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Я оплатил — записать расход", exact: true })
    .click();
  await expect.poll(async () => (await read()).transactions.length).toBe(1);
  await page.reload();
  await expect(page.getByText("Больше ясности.")).toBeVisible();
  const saved = await read();
  expect(saved.budgetPlans?.[0].rolloverSurplus).toBe(true);
  expect(saved.recurring[0].schedule?.unit).toBe("week");
  expect(saved.transactions[0].occurrenceDate).toBe(TODAY);
  expect(saved.accounts[0].openingBalance).toBe(100_000);
});
