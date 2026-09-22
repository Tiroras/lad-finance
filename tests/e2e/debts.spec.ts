import { expect, test, type Page } from "@playwright/test";
import { createInitialState } from "../../src/domain/seed";
import { accountBalance } from "../../src/domain/accountBalances";
import { creditPaymentRemaining, debtBalance } from "../../src/domain/debts";
import { totals } from "../../src/domain/finance";
import type { FinanceState } from "../../src/domain/types";

const KEY = "lad-finance-v1";
const TODAY = "2026-09-20";
const readState = (page: Page): Promise<FinanceState> =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), KEY);

test.beforeEach(async ({ page }) => {
  const state = createInitialState(false, TODAY);
  state.accounts[0].openingBalance = 1_000_000;
  await page.clock.install({ time: new Date("2026-09-20T12:00:00+04:00") });
  await page.addInitScript(
    ({ key, initial }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(initial));
    },
    { key: KEY, initial: state },
  );
  await page.goto("/");
  await expect(page.getByText("Больше ясности.")).toBeVisible();
  await page
    .getByRole("button", { name: "Открыть мои счета", exact: true })
    .click();
});

test("borrowed money and partial repayment remain separate from consumption and expose protected history", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Добавить долг", exact: true })
    .click();
  await page.getByLabel("Название долга", { exact: true }).fill("Алексей");
  await page.getByLabel("Сумма долга", { exact: true }).fill("500");
  await page
    .getByLabel("Срок возврата долга", { exact: true })
    .fill("2026-09-25");
  await page
    .getByRole("button", { name: "Сохранить долг", exact: true })
    .click();
  await expect.poll(async () => (await readState(page)).debts?.length).toBe(1);
  const issued = await readState(page);
  expect(accountBalance(issued, "card", TODAY)).toBe(1_050_000);
  await page
    .getByRole("button", { name: "Вернуть долг: Алексей", exact: true })
    .click();
  await page.getByLabel("Сумма возврата долга", { exact: true }).fill("200");
  await page
    .getByRole("button", { name: "Записать возврат долга", exact: true })
    .click();
  await expect
    .poll(async () => (await readState(page)).transactions.length)
    .toBe(2);
  const repaid = await readState(page);
  expect(debtBalance(repaid, repaid.debts![0], TODAY)).toBe(30_000);
  expect(accountBalance(repaid, "card", TODAY)).toBe(1_030_000);
  expect(totals(repaid, "2026-09")).toEqual({ income: 0, expense: 0 });
  await page
    .getByRole("button", { name: "Показать движения: Алексей", exact: true })
    .click();
  await page.getByRole("button", { name: /20 сентября · Выдача 500/ }).click();
  await expect(page.getByText(/Выдача основной суммы долга/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Сохранить изменения", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Удалить операцию долга", exact: true })
    .click();
  await page.getByRole("button", { name: "Да, удалить", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Возврат превышает долг" }),
  ).toBeVisible();
  expect((await readState(page)).transactions).toEqual(repaid.transactions);
});

test("credit card setup and repayments reduce the required payment without duplicate expenses", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page
    .getByRole("button", { name: "Добавить кредитную карту", exact: true })
    .click();
  await page
    .getByLabel("Название счёта", { exact: true })
    .fill("Кредитная карта для покупок");
  await page.getByLabel("Остаток на счёте", { exact: true }).fill("-1000");
  await page.getByLabel("Кредитный лимит", { exact: true }).fill("5000");
  await page
    .getByLabel("Срок платежа по карте", { exact: true })
    .fill("2026-09-25");
  await page
    .getByLabel("Обязательный платёж по карте", { exact: true })
    .fill("500");
  await page
    .getByRole("button", { name: "Сохранить счёт", exact: true })
    .click();
  await expect
    .poll(async () => (await readState(page)).accounts.length)
    .toBe(4);
  await page
    .getByRole("button", { name: "Открыть мои счета", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Погасить карту: Кредитная карта для покупок",
      exact: true,
    })
    .click();
  await page.getByLabel("Сумма погашения карты", { exact: true }).fill("200");
  await page
    .getByRole("button", { name: "Записать погашение карты", exact: true })
    .click();
  await expect
    .poll(async () => (await readState(page)).transactions.length)
    .toBe(1);
  const state = await readState(page);
  const credit = state.accounts.find((account) => account.kind === "credit")!;
  expect(accountBalance(state, credit.id, TODAY)).toBe(-80_000);
  expect(accountBalance(state, "card", TODAY)).toBe(980_000);
  expect(creditPaymentRemaining(state, credit, TODAY)).toBe(30_000);
  expect(totals(state, "2026-09")).toEqual({ income: 0, expense: 0 });
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    if (width === 320) {
      await page.clock.runFor(500);
      await page
        .getByRole("button", {
          name: "Условия карты: Кредитная карта для покупок",
          exact: true,
        })
        .scrollIntoViewIfNeeded();
      await page.clock.runFor(500);
      await page.screenshot({
        path: testInfo.outputPath("credit-320.png"),
        fullPage: true,
        animations: "disabled",
      });
    }
  }
  await page.reload();
  await expect(page.getByText("Больше ясности.")).toBeVisible();
  expect(
    (await readState(page)).accounts.find(
      (account) => account.kind === "credit",
    )?.id,
  ).toBe(credit.id);
  expect(errors).toEqual([]);
});
