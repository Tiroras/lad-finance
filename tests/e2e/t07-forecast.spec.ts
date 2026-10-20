import { expect, test, type Page } from "@playwright/test";
import { bundleBrowserModule } from "./browserBundle";
import type * as Fixture from "../helpers/t07ForecastCases";
type Browser = typeof globalThis & { __browserTestModule: typeof Fixture };
let bundle: string;
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
test.beforeAll(async () => {
  bundle = await bundleBrowserModule("tests/helpers/t07ForecastCases.ts");
});
async function start(page: Page) {
  await page.route("https://api.frankfurter.dev/**", (route) => route.abort());
  await page.clock.install({ time: new Date("2026-10-20T12:00:00+04:00") });
  await page.addInitScript({
    content: `${bundle}\n;globalThis.__browserTestModule = __browserTestModule; __browserTestModule.installForecastFixture();`,
  });
  await page.goto("/");
  await expect(button(page, "Добавить операцию")).toBeVisible();
}
async function choose(page: Page, label: string, option: string) {
  await button(page, label).click();
  await page.getByRole("radio", { name: option, exact: true }).click();
}
test("T07 account forecasts and purchase limits execute in Chromium", async ({
  page,
}, info) => {
  await page.route("https://lad-t07-forecast.invalid/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Account forecast</title>",
    }),
  );
  await page.goto("https://lad-t07-forecast.invalid/");
  await page.addScriptTag({ content: bundle });
  const outcomes = await page.evaluate(() =>
    (globalThis as Browser).__browserTestModule.t07ForecastCases.map(
      (entry) => {
        try {
          entry.run();
          return { name: entry.name, passed: true, error: "" };
        } catch (error) {
          return {
            name: entry.name,
            passed: false,
            error:
              error instanceof Error
                ? error.stack || error.message
                : String(error),
          };
        }
      },
    ),
  );
  await info.attach("browser-case-results", {
    body: JSON.stringify(outcomes, null, 2),
    contentType: "application/json",
  });
  expect(outcomes).toHaveLength(27);
  expect(outcomes.filter((entry) => !entry.passed)).toEqual([]);
});
test("T07 planned exchange exposes both stored amounts and the full date after reload", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await start(page);
  await page.evaluate(() => {
    const key = "lad-profile-personal:lad-finance-v1";
    const state = JSON.parse(localStorage.getItem(key)!);
    state.accounts[1].currency = "USD";
    state.settings.exchange.rates.USD = {
      value: 9000000000,
      source: "manual",
      date: "2026-10-20",
    };
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
  await button(page, "Прогноз по дням").click();
  await button(page, "Настроить прогноз").click();
  await choose(page, "Откуда плановый перевод", "Основная карта · USD");
  await choose(page, "Куда плановый перевод", "Карта покупок · RUB");
  await page.getByLabel("Списание в плане, USD", { exact: true }).fill("10");
  await page.getByLabel("Зачисление в плане, RUB", { exact: true }).fill("900");
  await button(page, "Добавить плановый перевод").click();
  const transfer = page
    .getByText(/Перевод между счетами ·.*2026/)
    .locator("..");
  await expect(transfer).toContainText("2026");
  await expect(transfer).toContainText(/Списание:\s*10,00/);
  await expect(transfer).toContainText(/Зачисление:\s*900,00 ₽/);
  await transfer.scrollIntoViewIfNeeded();
  await page.clock.runFor(350);
  await page.screenshot({
    animations: "disabled",
    path: info.outputPath("planned-fx-320.png"),
  });
  await button(page, "Сохранить прогноз").click();
  await page.reload();
  await button(page, "Прогноз по дням").click();
  await button(page, "Настроить прогноз").click();
  await expect(
    page.getByText(/Перевод между счетами ·.*2026/).locator(".."),
  ).toContainText(/Зачисление:\s*900,00 ₽/);
});

test("T07 summary warns about local shortage despite a positive total", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await start(page);
  await page.evaluate(() => {
    const key = "lad-profile-personal:lad-finance-v1";
    const state = JSON.parse(localStorage.getItem(key)!);
    state.recurring = [
      {
        id: "bill",
        name: "Покупка по карте",
        amount: 200000,
        day: 20,
        kind: "bill",
        active: true,
        icon: "home-outline",
        color: "#254D3E",
        category: "other",
        accountId: "a",
        startsOn: "2026-10-20",
      },
    ];
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
  await button(page, "Прогноз по дням").click();
  await expect(page.getByTestId("forecast-status")).toContainText(
    "Нехватка на отдельном счёте",
  );
  await expect(page.getByTestId("forecast-closing")).toContainText(
    /8\s000,00 ₽/,
  );
  await page.clock.runFor(350);
  await page.screenshot({
    animations: "disabled",
    path: info.outputPath("local-shortage-summary-320.png"),
  });
  await page.getByTestId("account-forecast").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("account-forecast")).toContainText(
    "Нехватка на счёте",
  );
  await page.screenshot({
    animations: "disabled",
    path: info.outputPath("account-details-320.png"),
  });
  await button(page, "Настроить прогноз").click();
  await page.clock.runFor(350);
  await page.screenshot({
    animations: "disabled",
    path: info.outputPath("account-settings-320.png"),
  });
});
test("T07 calendar boundary remains readable and explicitly rejects the unavailable horizon", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await start(page);
  await page.evaluate(() => {
    const key = "lad-profile-personal:lad-finance-v1";
    const state = JSON.parse(localStorage.getItem(key)!);
    state.plannedIncomes = [
      {
        id: "last",
        name: "Доход",
        amount: 10000,
        date: "2100-12-25",
        repeat: "once",
        accountId: "a",
      },
    ];
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.clock.setFixedTime(new Date("2100-12-20T12:00:00+04:00"));
  await page.reload();
  await expect(
    page.getByText(/Проверка будущих обязательств выходит за 2100 год/),
  ).toBeVisible();
  await button(page, "Прогноз по дням").click();
  await expect(
    page.getByText(
      "Прогноз выходит за 31 декабря 2100 года. Для выбранной даты этот горизонт недоступен.",
      {
        exact: true,
      },
    ),
  ).toBeVisible();
  await page.clock.runFor(350);
  await page.screenshot({
    animations: "disabled",
    path: info.outputPath("calendar-boundary-320.png"),
  });
});
test("T07 selected purchase account limits amount and explicit plan transfer survives reload", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  await button(page, "Проверить покупку").click();
  await page.getByLabel("Стоимость покупки", { exact: true }).fill("2000");
  await expect(page.getByTestId("purchase-maximum")).toContainText(
    /1\s000,00 ₽/,
  );
  await expect(page.getByTestId("purchase-earliest")).toContainText(
    "покупка не помещается",
  );
  await expect(
    page.getByText("Вписывается в ваш план", { exact: true }),
  ).toHaveCount(0);
  await button(page, "Закрыть").click();
  await button(page, "Прогноз по дням").click();
  await button(page, "Настроить прогноз").click();
  await choose(page, "Откуда плановый перевод", "Основная карта · RUB");
  await choose(page, "Куда плановый перевод", "Карта покупок · RUB");
  await page.getByLabel("Списание в плане, RUB", { exact: true }).fill("1000");
  await button(page, "Добавить плановый перевод").click();
  await button(page, "Сохранить прогноз").click();
  await expect(page.getByTestId("account-forecast")).toContainText(
    /2\s000,00 ₽/,
  );
  await button(page, "Примерить покупку").click();
  await page.getByLabel("Стоимость покупки", { exact: true }).fill("2000");
  await expect(page.getByTestId("purchase-maximum")).toContainText(
    /2\s000,00 ₽/,
  );
  await expect(page.getByTestId("purchase-earliest")).toContainText(
    "20 октября",
  );
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByTestId("purchase-maximum").scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      animations: "disabled",
      path: info.outputPath(`purchase-account-${width}.png`),
    });
  }
  await page.reload();
  await button(page, "Проверить покупку").click();
  await page.getByLabel("Стоимость покупки", { exact: true }).fill("2000");
  await expect(page.getByTestId("purchase-maximum")).toContainText(
    /2\s000,00 ₽/,
  );
  const state = await page.evaluate(() =>
    (globalThis as Browser).__browserTestModule.readForecastFixture(),
  );
  expect(state.version).toBe(8);
  expect(state.settings.forecast?.transfers).toHaveLength(1);
  expect(state.transactions).toEqual([]);
  expect(state.accounts[0].openingBalance).toBe(100_000);
});
test("T07 unallocated daily spending blocks purchase until account assignment", async ({
  page,
}) => {
  await start(page);
  await button(page, "Прогноз по дням").click();
  await button(page, "Настроить прогноз").click();
  await page
    .getByLabel("Расходы в день для прогноза", { exact: true })
    .fill("1");
  await button(page, "Сохранить прогноз").click();
  await expect(page.getByTestId("account-forecast")).toContainText(
    "Есть неназначенные события: 29",
  );
  await button(page, "Примерить покупку").click();
  await expect(page.getByText(/Покупку пока нельзя подтвердить/)).toBeVisible();
  await button(page, "Закрыть").click();
  await button(page, "Прогноз по дням").click();
  await button(page, "Настроить прогноз").click();
  await choose(page, "Счёт повседневных расходов", "Карта покупок · RUB");
  await button(page, "Сохранить прогноз").click();
  await expect(page.getByTestId("account-forecast")).not.toContainText(
    "Есть неназначенные события",
  );
  await button(page, "Примерить покупку").click();
  await expect(page.getByTestId("purchase-maximum")).toContainText("971,00 ₽");
  const state = await page.evaluate(() =>
    (globalThis as Browser).__browserTestModule.readForecastFixture(),
  );
  expect(state.settings.forecast?.dailyAccountId).toBe("a");
  expect(state.transactions).toEqual([]);
});
