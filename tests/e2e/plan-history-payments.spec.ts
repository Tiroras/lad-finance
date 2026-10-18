import { expect, test, type Page } from "@playwright/test";
import { bundleBrowserModule } from "./browserBundle";
import { pickDate } from "./helpers";
import type * as Fixture from "../helpers/t05PaymentCases";

type Browser = typeof globalThis & { __browserTestModule: typeof Fixture };
let bundle: string;
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
test.beforeAll(async () => {
  bundle = await bundleBrowserModule("tests/helpers/t05PaymentCases.ts");
});
async function read(page: Page) {
  return page.evaluate(() =>
    (globalThis as Browser).__browserTestModule.paymentUiState(),
  );
}
async function start(page: Page) {
  await page.route("https://api.frankfurter.dev/**", (route) => route.abort());
  await page.clock.install({ time: new Date("2026-10-18T12:00:00+04:00") });
  await page.addInitScript({
    content: `${bundle}\n;globalThis.__browserTestModule = __browserTestModule; __browserTestModule.installPaymentUiFixture();`,
  });
  await page.goto("/");
  await page.getByRole("tab", { name: "План", exact: true }).click();
  await page.getByRole("tab", { name: "Платежи", exact: true }).click();
}

test("T05 payment domain cases execute in Chromium", async ({
  page,
}, testInfo) => {
  await page.route("https://lad-payment-tests.invalid/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>T05 payment cases</title>",
    }),
  );
  await page.goto("https://lad-payment-tests.invalid/");
  await page.addScriptTag({ content: bundle });
  const results = await page.evaluate(() =>
    (globalThis as Browser).__browserTestModule.t05PaymentCases.map((item) => {
      try {
        item.run();
        return { name: item.name, passed: true, error: "" };
      } catch (error) {
        return {
          name: item.name,
          passed: false,
          error:
            error instanceof Error
              ? error.stack || error.message
              : String(error),
        };
      }
    }),
  );
  await testInfo.attach("payment-browser-results", {
    body: JSON.stringify(results, null, 2),
    contentType: "application/json",
  });
  expect(results).toHaveLength(16);
  expect(results.filter((item) => !item.passed)).toEqual([]);
});

test("T05 future weekly terms preserve old arrears and display history at 320 390 1440", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await start(page);
  await button(page, "Изменить платёж История интернета").click();
  await page.getByLabel("Сумма платежа", { exact: true }).fill("200");
  await page.getByRole("tab", { name: "Неделя", exact: true }).click();
  await expect(
    page.getByLabel("Начало новых условий платежа", { exact: true }),
  ).toHaveValue("19.10.2026");
  await button(page, "Сохранить платёж").click();
  await expect(button(page, "Подтвердить новые условия")).toBeVisible();
  expect((await read(page)).recurring[0].versions).toBeUndefined();
  await button(page, "Подтвердить новые условия").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect
    .poll(async () => (await read(page)).recurring[0].versions?.length)
    .toBe(2);
  await expect(
    page.getByText(
      "Показанные сумма и график действуют с 19 октября. До этой даты сохраняются прежние условия.",
    ),
  ).toBeVisible();
  const state = await read(page);
  expect(
    state.recurring[0].versions?.map((version) => [
      version.amount,
      version.effectiveFrom,
      version.effectiveTo,
    ]),
  ).toEqual([
    [10_000, "2026-10-01", "2026-10-19"],
    [20_000, "2026-10-19", undefined],
  ]);
  await page
    .getByRole("button", { name: /История интернета, 5 октября, Просрочен/ })
    .click();
  await expect(
    page.getByRole("dialog").getByText("100 ₽", { exact: true }),
  ).toBeVisible();
  await button(page, "Изменить регулярный платёж").click();
  await expect(
    page.getByText("История условий", { exact: true }),
  ).toBeVisible();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await page
      .getByText("История условий", { exact: true })
      .scrollIntoViewIfNeeded();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await page.screenshot({
      path: testInfo.outputPath(`payment-history-${width}.png`),
      fullPage: false,
      animations: "disabled",
    });
  }
  await page.reload();
  await expect(
    page.getByRole("tab", { name: "План", exact: true }),
  ).toBeVisible();
  expect((await read(page)).recurring[0].versions?.length).toBe(2);
});

test("T05 stop and resume require confirmation and old obligation is skipped separately", async ({
  page,
}) => {
  await start(page);
  await page
    .getByLabel("Учитывать История интернета в плане", { exact: true })
    .click();
  expect((await read(page)).recurring[0].active).toBe(true);
  await expect(page.getByText(/Сохраняются просрочки: 1/)).toBeVisible();
  await button(page, "Подтвердить остановку").click();
  await expect
    .poll(async () => (await read(page)).recurring[0].active)
    .toBe(false);
  await page
    .getByRole("button", { name: /История интернета, 5 октября, Просрочен/ })
    .click();
  await button(page, "Пропустить этот месяц").click();
  await expect(button(page, "Подтвердить пропуск обязательства")).toBeVisible();
  expect(
    (await read(page)).recurring[0].versions?.[0].skippedMonths,
  ).toBeUndefined();
  await button(page, "Подтвердить пропуск обязательства").click();
  await expect
    .poll(
      async () => (await read(page)).recurring[0].versions?.[0].skippedMonths,
    )
    .toEqual(["2026-10"]);
  await button(page, "Закрыть").click();
  await expect(
    page.getByRole("button", {
      name: /История интернета, 5 октября, Просрочен/,
    }),
  ).toHaveCount(0);
  await button(page, "Изменить платёж История интернета").click();
  await page
    .getByRole("button", { name: /^Открыть пропущенный платёж · 5 октября/ })
    .click();
  await button(page, "Вернуть этот месяц в план").click();
  expect((await read(page)).recurring[0].versions?.[0].skippedMonths).toEqual([
    "2026-10",
  ]);
  await button(page, "Подтвердить возврат обязательства").click();
  await expect
    .poll(
      async () => (await read(page)).recurring[0].versions?.[0].skippedMonths,
    )
    .toEqual([]);
  await button(page, "Закрыть").click();
  await page
    .getByLabel("Учитывать История интернета в плане", { exact: true })
    .click();
  await button(page, "Подтвердить возобновление").click();
  await expect
    .poll(async () => (await read(page)).recurring[0].active)
    .toBe(true);
  expect((await read(page)).recurring[0].versions?.length).toBe(1);
});

test("T05 previous-month recorded expense closes obligation without another charge", async ({
  page,
}) => {
  await start(page);
  await page
    .getByRole("button", { name: /История интернета, 5 октября, Просрочен/ })
    .click();
  await button(page, "Связать: Оплата заранее · 30 сентября").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect
    .poll(async () => (await read(page)).transactions[0].recurringId)
    .toBe("history-payment");
  const state = await read(page);
  expect(state.transactions).toHaveLength(1);
  expect(state.transactions[0]).toMatchObject({
    id: "early-payment",
    date: "2026-09-30",
    amount: 10_000,
    occurrenceDate: "2026-10-05",
  });
  expect(state.accounts[0].openingBalance).toBe(2_000_000);
  await page.reload();
  expect((await read(page)).transactions).toHaveLength(1);
});

test("T05 renaming a payment with an already paid future occurrence does not require a terms transition", async ({
  page,
}) => {
  await start(page);
  await page
    .getByRole("button", { name: /История интернета, 5 ноября, Запланирован/ })
    .click();
  await button(page, "Я оплатил — записать расход").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect.poll(async () => (await read(page)).transactions.length).toBe(2);
  const before = await read(page);
  await button(page, "Изменить платёж История интернета").click();
  await page
    .getByLabel("Название платежа", { exact: true })
    .fill("Новое название интернета");
  await button(page, "Сохранить платёж").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect
    .poll(async () => (await read(page)).recurring[0].name)
    .toBe("Новое название интернета");
  const after = await read(page);
  expect(after.transactions).toEqual(before.transactions);
  expect(after.recurring[0].versions).toEqual(before.recurring[0].versions);
  expect(after.recurring[0].amount).toBe(before.recurring[0].amount);
  await expect(
    page.getByRole("button", {
      name: /Новое название интернета, 5 ноября, Оплачен/,
    }),
  ).toBeVisible();
});

test("T05 editing the repeat interval preserves the explicitly chosen schedule anchor", async ({
  page,
}) => {
  await start(page);
  await button(page, "Изменить платёж История интернета").click();
  await page.getByRole("tab", { name: "Неделя", exact: true }).click();
  await pickDate(page, "Опорная дата графика платежа", "2026-10-23");
  await page.getByLabel("Интервал повторения", { exact: true }).fill("2");
  await expect(
    page.getByLabel("Опорная дата графика платежа", { exact: true }),
  ).toHaveValue("23.10.2026");
  await button(page, "Сохранить платёж").click();
  await button(page, "Подтвердить новые условия").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect
    .poll(
      async () => (await read(page)).recurring[0].versions?.at(-1)?.schedule,
    )
    .toEqual({ unit: "week", interval: 2, anchor: "2026-10-23" });
});
