import { expect, test, type Page } from "@playwright/test";
import { bundleBrowserModule } from "./browserBundle";
import type * as Fixture from "../helpers/t07ScenarioCases";
type Browser = typeof globalThis & { __browserTestModule: typeof Fixture };
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
let bundle: string;
test.beforeAll(async () => {
  bundle = await bundleBrowserModule("tests/helpers/t07ScenarioCases.ts");
});
async function start(page: Page, kind = "base") {
  await page.route("https://api.frankfurter.dev/**", (route) => route.abort());
  await page.clock.install({ time: new Date("2026-10-20T12:00:00+04:00") });
  await page.addInitScript({
    content: `${bundle}\n;globalThis.__browserTestModule = __browserTestModule; __browserTestModule.installScenarioFixture(${JSON.stringify(kind)});`,
  });
  await page.goto("/");
  await expect(button(page, "Добавить операцию")).toBeVisible();
}
async function scenarios(page: Page) {
  await button(page, "Прогноз по дням").click();
  await button(page, "Мои сценарии").click();
}
test("T07 scenarios and capacity calculations execute in Chromium", async ({
  page,
}, info) => {
  await page.route("https://lad-t07-scenarios.invalid/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>T07 scenarios</title>",
    }),
  );
  await page.goto("https://lad-t07-scenarios.invalid/");
  await page.addScriptTag({ content: bundle });
  const results = await page.evaluate(() =>
    (globalThis as Browser).__browserTestModule.t07ScenarioCases.map(
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
  await info.attach("scenario-browser-cases", {
    body: JSON.stringify(results, null, 2),
    contentType: "application/json",
  });
  expect(results.length).toBeGreaterThan(0);
  expect(results.filter((entry) => !entry.passed)).toEqual([]);
});
test("copy and per-row switches persist while original and real ledger stay intact", async ({
  page,
}, info) => {
  await start(page);
  const before = await page.evaluate(() =>
    (globalThis as Browser).__browserTestModule.readScenarioFixture(),
  );
  await scenarios(page);
  await button(page, "Копировать сценарий: Первый вариант").click();
  await button(page, "Открыть сценарий: Первый вариант — копия").click();
  await page
    .getByRole("switch", { name: "Учитывать изменение: Зарплата", exact: true })
    .uncheck();
  await page
    .getByRole("switch", { name: "Учитывать событие 1: Покупка", exact: true })
    .uncheck();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page
      .getByRole("switch", {
        name: "Учитывать событие 1: Покупка",
        exact: true,
      })
      .scrollIntoViewIfNeeded();
    await page.clock.runFor(350);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      animations: "disabled",
      path: info.outputPath(`scenario-switch-${width}.png`),
    });
  }
  await button(page, "Сравнить с планом").click();
  await expect(page.getByTestId("scenario-delta")).toContainText("0 ₽");
  await button(page, "Сохранить сценарий").click();
  await expect(
    button(page, "Открыть сценарий: Первый вариант — копия"),
  ).toBeVisible();
  const after = await page.evaluate(() =>
    (globalThis as Browser).__browserTestModule.readScenarioFixture(),
  );
  expect(after.scenarios![0]).toEqual(before.scenarios![0]);
  expect(after.scenarios![1].id).not.toBe(before.scenarios![0].id);
  expect(after.scenarios![1].events[0].id).not.toBe(
    before.scenarios![0].events[0].id,
  );
  expect(after.accounts).toEqual(before.accounts);
  expect(after.transactions).toEqual(before.transactions);
  expect(after.plannedIncomes).toEqual(before.plannedIncomes);
  await page.reload();
  await scenarios(page);
  await button(page, "Открыть сценарий: Первый вариант — копия").click();
  await expect(
    page.getByRole("switch", {
      name: "Учитывать изменение: Зарплата",
      exact: true,
    }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("switch", {
      name: "Учитывать событие 1: Покупка",
      exact: true,
    }),
  ).not.toBeChecked();
});
test("scenario capacity warning begins at sixteen and explains the full limit", async ({
  page,
}, info) => {
  await start(page, "capacity");
  await scenarios(page);
  await expect(
    page.getByText(/Приближение к лимиту: сценарии — 16 из 20/),
  ).toBeVisible();
  for (let i = 0; i < 4; i++)
    await button(page, "Копировать сценарий: Вариант 1").click();
  await expect(
    page.getByText(/Достигнут лимит: сценарии — 20 из 20/),
  ).toBeVisible();
  await expect(button(page, "Создать сценарий")).toBeDisabled();
  await expect(button(page, "Копировать сценарий: Вариант 1")).toBeDisabled();
  await page.setViewportSize({ width: 320, height: 900 });
  await page
    .getByText(/Достигнут лимит: сценарии — 20 из 20/)
    .scrollIntoViewIfNeeded();
  await page.clock.runFor(350);
  await page.screenshot({
    animations: "disabled",
    path: info.outputPath("scenario-capacity-320.png"),
  });
});
test("data settings show the same scenario threshold", async ({
  page,
}, info) => {
  await start(page, "capacity");
  await button(page, "Профиль и настройки").click();
  await button(page, "Данные и копии").click();
  await expect(page.getByTestId("data-capacity-warnings")).toContainText(
    "16 из 20",
  );
  await page.setViewportSize({ width: 390, height: 900 });
  await page.clock.runFor(350);
  await page.screenshot({
    animations: "disabled",
    path: info.outputPath("data-capacity-390.png"),
  });
});
test("disabled events remain visible and count toward the eighty percent warning", async ({
  page,
}) => {
  await start(page, "events");
  await scenarios(page);
  await button(page, "Открыть сценарий: Первый вариант").click();
  await expect(
    page.getByText(/Приближение к лимиту: разовые события — 80 из 100/),
  ).toBeVisible();
  await expect(
    page.getByRole("switch", {
      name: "Учитывать событие 1: Событие 1",
      exact: true,
    }),
  ).not.toBeChecked();
});
