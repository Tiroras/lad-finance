import { expect, test, type Page } from "@playwright/test";
import { bundleBrowserModule } from "./browserBundle";
import type * as FxModule from "../helpers/t07FxCases";
import type { BrowserDomainOutcome } from "../helpers/browserDomainTestShim";
type Browser = typeof globalThis & { __browserTestModule: typeof FxModule };
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
let bundle: string;
test.beforeAll(async () => {
  bundle = await bundleBrowserModule("tests/helpers/t07FxCases.ts");
});
for (const [suite, count] of Object.entries({
  transactionDraft: 10,
  transactionDraftChanges: 3,
  currency: 17,
})) {
  test(`T07 existing FX and draft regressions in Chromium: ${suite}`, async ({
    page,
  }, testInfo) => {
    await page.clock.install({ time: new Date("2026-10-20T12:00:00+04:00") });
    await page.addScriptTag({
      content: await bundleBrowserModule(`tests/${suite}.test.ts`, {
        domainTestShims: true,
      }),
    });
    const outcomes = await page.evaluate(() =>
      (
        globalThis as unknown as {
          __runBrowserDomainTests: () => Promise<BrowserDomainOutcome[]>;
        }
      ).__runBrowserDomainTests(),
    );
    await testInfo.attach("existing-fx-case-results", {
      body: JSON.stringify(outcomes, null, 2),
      contentType: "application/json",
    });
    expect(outcomes).toHaveLength(count);
    expect(outcomes.filter((entry) => !entry.passed)).toEqual([]);
  });
}
async function start(page: Page) {
  await page.route("https://api.frankfurter.dev/**", (route) => route.abort());
  await page.clock.install({ time: new Date("2026-10-20T12:00:00+04:00") });
  await page.addInitScript({
    content: `${bundle}\n;globalThis.__browserTestModule = __browserTestModule; __browserTestModule.installFxFixture();`,
  });
  await page.goto("/");
  await expect(button(page, "Добавить операцию")).toBeVisible();
}
async function read(page: Page) {
  return page.evaluate(() =>
    (globalThis as Browser).__browserTestModule.readFxFixture(),
  );
}
test("T07 FX calculations and atomic exchange execute in Chromium", async ({
  page,
}, testInfo) => {
  await page.route("https://lad-fx-tests.invalid/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>FX cases</title>",
    }),
  );
  await page.goto("https://lad-fx-tests.invalid/");
  await page.addScriptTag({ content: bundle });
  const results = await page.evaluate(() =>
    (globalThis as Browser).__browserTestModule.t07FxCases.map((entry) => {
      try {
        entry.run();
        return { name: entry.name, passed: true, error: "" };
      } catch (cause) {
        return {
          name: entry.name,
          passed: false,
          error:
            cause instanceof Error
              ? cause.stack || cause.message
              : String(cause),
        };
      }
    }),
  );
  await testInfo.attach("t07-fx-browser-cases", {
    body: JSON.stringify(results, null, 2),
    contentType: "application/json",
  });
  expect(results).toHaveLength(21);
  expect(results.filter((entry) => !entry.passed)).toEqual([]);
});
test("T07 manual historical basis is visible and survives reload and rename", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  await button(page, "Добавить операцию").click();
  await button(page, "Доллары Т07 · USD").click();
  await page
    .getByLabel("Название операции", { exact: true })
    .fill("Историческая оценка Т07");
  await page.getByLabel("Сумма операции", { exact: true }).fill("100");
  await page.getByLabel("Дата операции", { exact: true }).fill("01.10.2026");
  await page
    .getByLabel("Оценка в основной валюте", { exact: true })
    .fill("8800");
  await page
    .getByLabel("Дата основания оценки", { exact: true })
    .fill("30.09.2026");
  await page
    .getByLabel("Дата основания оценки", { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    animations: "disabled",
    path: testInfo.outputPath("manual-valuation-390.png"),
  });
  await button(page, "Добавить операцию").last().click();
  await expect.poll(async () => (await read(page)).transactions.length).toBe(1);
  expect((await read(page)).transactions[0].valuation).toEqual({
    source: "manual",
    date: "2026-09-30",
  });
  await page.reload();
  await page.getByRole("button", { name: /Историческая оценка Т07/ }).click();
  await expect(
    page.getByText(/Указана вручную\. Дата основания: 30\.09\.2026\./),
  ).toBeVisible();
  await page
    .getByLabel("Название операции", { exact: true })
    .fill("Переименованная оценка Т07");
  await button(page, "Сохранить изменения").click();
  expect((await read(page)).transactions[0].baseAmount).toBe(880_000);
  expect((await read(page)).transactions[0].valuation).toEqual({
    source: "manual",
    date: "2026-09-30",
  });
});
test("T07 exchange fee form rejects invalid fee atomically, displays narrow and wide, persists both facts", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await start(page);
  await button(page, "Добавить операцию").click();
  await page.getByRole("tab", { name: "Перевод", exact: true }).click();
  await button(page, "Доллары Т07 · USD").last().click();
  await page
    .getByLabel("Название операции", { exact: true })
    .fill("Обмен с комиссией Т07");
  await page.getByLabel("Сумма операции", { exact: true }).fill("9000");
  await page.getByLabel("Сумма зачисления", { exact: true }).fill("100");
  await button(page, "Добавить комиссию обмена").click();
  await page.getByLabel("Комиссия обмена", { exact: true }).fill("0");
  await button(page, "Записать обмен и комиссию").click();
  await expect(
    page.getByText(/Введите положительную сумму в пределах допустимого лимита/),
  ).toBeVisible();
  expect((await read(page)).transactions).toHaveLength(0);
  await page.getByLabel("Комиссия обмена", { exact: true }).fill("100");
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByTestId("exchange-fee").scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      animations: "disabled",
      path: testInfo.outputPath(`exchange-fee-${width}.png`),
    });
  }
  await button(page, "Записать обмен и комиссию").click();
  await expect.poll(async () => (await read(page)).transactions.length).toBe(2);
  let state = await read(page);
  expect(state.version).toBe(8);
  expect(
    state.transactions.find((entry) => entry.type === "transfer")?.toAmount,
  ).toBe(10_000);
  expect(
    state.transactions.find((entry) => entry.type === "expense")?.amount,
  ).toBe(10_000);
  await page.reload();
  state = await read(page);
  expect(state.transactions).toHaveLength(2);
  expect(
    state.transactions.map((entry) => entry.amount).sort((a, b) => a - b),
  ).toEqual([10_000, 900_000]);
});
