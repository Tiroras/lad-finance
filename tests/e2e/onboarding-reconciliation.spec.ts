import { expect, test, type Page } from "@playwright/test";
import { createInitialState } from "../../src/domain/seed";
import { saveTransaction } from "../../src/domain/actions/transactions";
import { accountBalance } from "../../src/domain/accountBalances";
import { reconciliationCurrent } from "../../src/domain/reconciliation";
import type { FinanceState } from "../../src/domain/types";

const TODAY = "2026-09-10",
  KEY = "lad-finance-v1";
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const read = (page: Page): Promise<FinanceState> =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), KEY);
async function start(page: Page, state: FinanceState) {
  await page.clock.install({ time: new Date("2026-09-10T12:00:00+04:00") });
  state.settings.exchange = { automatic: false, rates: {} };
  await page.addInitScript(
    ({ key, state }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(state));
    },
    { key: KEY, state },
  );
  await page.goto("/");
  await expect(page.getByText("Больше ясности.")).toBeVisible();
}
async function openReconciliation(page: Page) {
  await button(page, "Открыть мои счета").click();
  await button(page, "Сверить: Основная карта").click();
}

test("four-step onboarding replaces demo only after confirmation and persists balances and future plans", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const demo = createInitialState(true, TODAY);
  demo.settings.onboardingCompleted = false;
  await start(page, demo);
  await button(page, "Настроить свой учёт").click();
  await button(page, "Настроить свой учёт").click();
  await page.getByLabel("Ваше имя", { exact: true }).fill("Тест");
  await page
    .getByLabel("Название основного счёта", { exact: true })
    .fill("Моя карта");
  await page.getByLabel("Начальный остаток", { exact: true }).fill("10000");
  await page.getByLabel("Начальные накопления", { exact: true }).fill("2000");
  await button(page, "Продолжить").click();
  await page.getByLabel("Доход при настройке", { exact: true }).fill("5000");
  await page
    .getByLabel("Дата первого дохода", { exact: true })
    .fill("2026-09-15");
  await button(page, "Продолжить").click();
  await page.getByLabel("Платёж при настройке", { exact: true }).fill("2500");
  await page
    .getByLabel("Дата первого платежа", { exact: true })
    .fill("2026-09-18");
  await button(page, "Продолжить").click();
  await page.getByLabel("Резерв при настройке", { exact: true }).fill("1000");
  expect((await read(page)).demo).toBe(true);
  expect((await read(page)).transactions.length).toBe(demo.transactions.length);
  await page.screenshot({
    path: "test-results/onboarding-confirmation-320.png",
    fullPage: true,
  });
  await button(page, "Начать учёт с этими данными").click();
  await expect.poll(async () => (await read(page)).demo).toBe(false);
  const state = await read(page);
  expect(state.transactions).toHaveLength(0);
  expect(accountBalance(state, "card", TODAY)).toBe(1000000);
  expect(accountBalance(state, "savings", TODAY)).toBe(200000);
  expect(state.plannedIncomes).toHaveLength(1);
  expect(state.recurring).toHaveLength(1);
  await page.reload();
  await expect(page.getByText("Тест, всё на виду.")).toBeVisible();
  expect((await read(page)).settings.onboardingCompleted).toBe(true);
  await expect(button(page, "Настроить свой учёт")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("bank reconciliation preserves dated correction and flags edited history after reload", async ({
  page,
}) => {
  let state = createInitialState(false, TODAY);
  state.accounts[0].openingBalance = 1000000;
  state = saveTransaction(
    state,
    {
      type: "expense",
      title: "Покупка для сверки",
      amount: 10000,
      date: "2026-09-08",
      category: "groceries",
      accountId: "card",
    },
    TODAY,
  );
  await start(page, state);
  await openReconciliation(page);
  await page.getByLabel("Остаток по банку", { exact: true }).fill("9800");
  await button(page, "Подтвердить сверку").click();
  await expect(
    page.getByText(/Сначала найдите расхождение или подтвердите корректировку/),
  ).toBeVisible();
  await button(page, "Записать разницу корректировкой").click();
  await page
    .getByLabel("Причина корректировки", { exact: true })
    .fill("Сверено с банком");
  await button(page, "Подтвердить сверку").click();
  await expect
    .poll(async () => (await read(page)).reconciliations?.length)
    .toBe(1);
  let saved = await read(page);
  expect(saved.balanceAdjustments?.[0].amount).toBe(-10000);
  expect(saved.transactions).toHaveLength(1);
  expect(accountBalance(saved, "card", TODAY)).toBe(980000);
  await button(page, "Закрыть").click();
  await page
    .getByRole("button", { name: /Покупка для сверки,.*открыть операцию/ })
    .first()
    .click();
  await page.getByLabel("Сумма операции", { exact: true }).fill("120");
  await button(page, "Сохранить изменения").click();
  await expect
    .poll(async () => (await read(page)).transactions[0].amount)
    .toBe(12000);
  saved = await read(page);
  expect(reconciliationCurrent(saved, saved.reconciliations![0])).toBe(false);
  await page.reload();
  await expect(page.getByText("Больше ясности.")).toBeVisible();
  await openReconciliation(page);
  await expect(
    page.getByText("История изменилась — нужна повторная сверка"),
  ).toBeVisible();
  await expect(page.getByText("Сверено с банком").first()).toBeVisible();
  await page
    .getByText("История изменилась — нужна повторная сверка")
    .scrollIntoViewIfNeeded();
  await page.clock.runFor(500);
  await page.screenshot({
    path: "test-results/reconciliation-history.png",
    fullPage: true,
    animations: "disabled",
  });
  await button(page, "Подтвердить сверку").click();
  await expect
    .poll(async () => (await read(page)).reconciliations?.length)
    .toBe(2);
  saved = await read(page);
  expect(saved.balanceAdjustments).toHaveLength(1);
  expect(reconciliationCurrent(saved, saved.reconciliations!.at(-1)!)).toBe(
    true,
  );
});

test("plain income form stays usable without a selected refund purchase", async ({
  page,
}) => {
  await start(page, createInitialState(false, TODAY));
  await button(page, "Добавить операцию").click();
  await page.getByRole("tab", { name: "Доход", exact: true }).click();
  await page
    .getByLabel("Название операции", { exact: true })
    .fill("Подработка");
  await page.getByLabel("Сумма операции", { exact: true }).fill("300");
  await expect(button(page, "Это возврат за покупку")).toBeVisible();
  await button(page, "Добавить операцию").click();
  await expect.poll(async () => (await read(page)).transactions.length).toBe(1);
  expect((await read(page)).transactions[0].refundOf).toBeUndefined();
});
