import { readState as read, startApp, setState } from "./helpers";
import { expect, test, type Page } from "@playwright/test";
import {
  saveAccount,
  saveCurrencyRate,
  saveGoal,
} from "../../src/domain/actions";
import { RATE_SCALE } from "../../src/domain/currency";
import { accountBalance } from "../../src/domain/finance";
import { createInitialState } from "../../src/domain/seed";

const TODAY = "2026-09-10";
const rates = [
  { base: "USD", quote: "RUB", rate: 90, date: TODAY },
  { base: "USD", quote: "EUR", rate: 0.9, date: TODAY },
  { base: "USD", quote: "JPY", rate: 150, date: TODAY },
  { base: "USD", quote: "KWD", rate: 0.3, date: TODAY },
];
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
async function close(page: Page) {
  await button(page, "Закрыть").click();
}
async function currencies(page: Page) {
  await button(page, "Профиль и настройки").click();
  await button(page, "Валюты и курсы").click();
}
test.beforeEach(async ({ page }) => {
  await page.route("https://api.frankfurter.dev/**", (route) =>
    route.fulfill({ json: rates }),
  );
  const state = createInitialState(false, TODAY);
  state.accounts[0].openingBalance = 1_000_000;
  await startApp(page, TODAY, state);
  await expect
    .poll(async () => (await read(page)).settings.exchange?.rates.USD?.value)
    .toBe(90 * RATE_SCALE);
});

test("foreign account, expense and two-sided exchange persist; manual override and base currency preserve original amounts", async ({
  page,
}) => {
  await button(page, "Открыть мои счета").click();
  await button(page, "Добавить счёт").click();
  await page
    .getByLabel("Название счёта", { exact: true })
    .fill("Долларовая карта");
  await button(page, "USD").click();
  await page.getByLabel("Остаток на счёте", { exact: true }).fill("100");
  await button(page, "Сохранить счёт").click();
  await expect.poll(async () => (await read(page)).accounts.length).toBe(4);
  const usdId = (await read(page)).accounts.find(
    (a) => a.currency === "USD",
  )!.id;
  await button(page, "Добавить операцию").click();
  await button(page, "Долларовая карта · USD").click();
  await page
    .getByLabel("Название операции", { exact: true })
    .fill("Кофе за доллары");
  await page.getByLabel("Сумма операции", { exact: true }).fill("2,50");
  await expect(
    page.getByLabel("Оценка в основной валюте", { exact: true }),
  ).toHaveValue("225");
  await button(page, "Добавить операцию").click();
  await expect.poll(async () => (await read(page)).transactions.length).toBe(1);
  await currencies(page);
  await page.getByLabel("Курс USD", { exact: true }).fill("100");
  await button(page, "Сохранить свой курс").click();
  await button(page, "Обновить курсы сейчас").click();
  await expect(button(page, "Обновить курсы сейчас")).toBeEnabled();
  await expect
    .poll(async () => (await read(page)).settings.exchange?.rates.USD?.value)
    .toBe(100 * RATE_SCALE);
  expect((await read(page)).transactions[0].baseAmount).toBe(22500);
  await close(page);
  await button(page, "Добавить операцию").click();
  await page.getByRole("tab", { name: "Перевод", exact: true }).click();
  await button(page, "Долларовая карта · USD").last().click();
  await page.getByLabel("Сумма операции", { exact: true }).fill("1000");
  await page.getByLabel("Сумма зачисления", { exact: true }).fill("9,75");
  await button(page, "Записать перевод").click();
  await expect.poll(async () => (await read(page)).transactions.length).toBe(2);
  const transferred = await read(page);
  expect(accountBalance(transferred, usdId, TODAY)).toBe(10725);
  expect(accountBalance(transferred, "card", TODAY)).toBe(900000);
  await currencies(page);
  await button(page, "USD").first().click();
  await button(page, "Пересчитать и выбрать USD").click();
  await expect
    .poll(async () => (await read(page)).settings.baseCurrency)
    .toBe("USD");
  expect(
    (await read(page)).transactions.find((t) => t.type === "expense")
      ?.baseAmount,
  ).toBe(250);
  await close(page);
  await page.reload();
  await expect(page.getByText("Больше ясности.")).toBeVisible();
  const restored = await read(page);
  expect(restored.settings.baseCurrency).toBe("USD");
  expect(accountBalance(restored, usdId, TODAY)).toBe(10725);
  expect(
    restored.transactions.find((t) => t.type === "transfer")?.toAmount,
  ).toBe(975);
});

test("network failure preserves rates and balances and automatic quotes can replace a manual override", async ({
  page,
}) => {
  await currencies(page);
  await page.getByLabel("Курс USD", { exact: true }).fill("92,5");
  await button(page, "Сохранить свой курс").click();
  const before = await read(page);
  await page.route("https://api.frankfurter.dev/**", (route) =>
    route.abort("internetdisconnected"),
  );
  await button(page, "Обновить курсы сейчас").click();
  await expect(
    page.getByText(/Не удалось обновить курсы\. Сохранённые/),
  ).toBeVisible();
  expect((await read(page)).settings.exchange).toEqual(
    before.settings.exchange,
  );
  expect((await read(page)).transactions).toEqual(before.transactions);
  await button(page, "Вернуть автоматический курс").click();
  await expect
    .poll(async () => (await read(page)).settings.exchange?.rates.USD?.source)
    .toBe("frankfurter");
  expect((await read(page)).settings.exchange?.rates.USD?.value).toBe(
    90 * RATE_SCALE,
  );
});

test("goals fund the selected currency and currency forms fit 320, 390 and 1440 pixel layouts", async ({
  page,
}) => {
  let state = await read(page);
  state = saveCurrencyRate(state, "EUR", 100 * RATE_SCALE, TODAY);
  state = saveAccount(
    state,
    { name: "Евро на отпуск", kind: "savings", currency: "EUR", balance: 0 },
    TODAY,
  );
  state = saveGoal(
    state,
    {
      name: "Отпуск в евро",
      currency: "EUR",
      target: 100000,
      monthly: 10000,
      icon: "airplane-outline",
    },
    TODAY,
  );
  await setState(page, state);
  await page.getByRole("button", { name: /Отпуск в евро/ }).click();
  await page.getByLabel("Сумма пополнения цели", { exact: true }).fill("10");
  await page
    .getByLabel("Списано на пополнение цели", { exact: true })
    .fill("1010");
  await button(page, "Записать пополнение").click();
  await expect
    .poll(async () => (await read(page)).transactions[0]?.toAmount)
    .toBe(1000);
  expect((await read(page)).transactions[0].amount).toBe(101000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await button(page, "Открыть мои счета").click();
    await expect(page.getByText("10,00 €", { exact: true })).toBeVisible();
    await page.clock.runFor(400);
    await page.screenshot({
      animations: "disabled",
      path: test.info().outputPath(`accounts-${width}.png`),
    });
    await button(page, "Валюты и курсы").click();
    await expect(page.getByLabel("Курс USD", { exact: true })).toBeVisible();
    await page.clock.runFor(400);
    await page.screenshot({
      animations: "disabled",
      path: test.info().outputPath(`currencies-${width}.png`),
    });
    await page.getByLabel("Курс USD", { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({
      animations: "disabled",
      path: test.info().outputPath(`rate-editor-${width}.png`),
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await close(page);
    await button(page, "Добавить операцию").click();
    await page.getByRole("tab", { name: "Перевод", exact: true }).click();
    await button(page, "Евро на отпуск · EUR").last().click();
    await page.getByLabel("Сумма операции", { exact: true }).fill("1000");
    await expect(
      page.getByLabel("Сумма зачисления", { exact: true }),
    ).toHaveValue("10");
    await page.clock.runFor(400);
    await page.screenshot({
      animations: "disabled",
      path: test.info().outputPath(`exchange-${width}.png`),
    });
    await close(page);
  }
  expect(errors).toEqual([]);
});
