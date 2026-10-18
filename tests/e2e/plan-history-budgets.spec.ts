import { expect, test, type Page } from "@playwright/test";
import { bundleBrowserModule } from "./browserBundle";
import type * as BudgetModule from "../helpers/t05BudgetCases";

type Browser = typeof globalThis & { __browserTestModule: typeof BudgetModule };
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
let bundle: string;
test.beforeAll(async () => {
  bundle = await bundleBrowserModule("tests/helpers/t05BudgetCases.ts");
});
async function start(page: Page, conflict = false, weekly = false) {
  await page.route("https://api.frankfurter.dev/**", (route) => route.abort());
  await page.clock.install({ time: new Date("2026-10-18T12:00:00+04:00") });
  await page.addInitScript({
    content: `${bundle}\n;globalThis.__browserTestModule = __browserTestModule; __browserTestModule.installBudgetFixture(${conflict});
      if (${weekly}) {
        const state = __browserTestModule.readBudgetFixture();
        state.budgetPlans[0].period = "weekly";
        localStorage.setItem("lad-profile-personal:lad-finance-v1", JSON.stringify(state));
      }`,
  });
  await page.goto("/");
  await expect(button(page, "Добавить операцию")).toBeVisible();
  await page.getByRole("tab", { name: "План", exact: true }).click();
  await button(page, "Изменить бюджет: Продукты").click();
}

test("T05 budget history calculations execute in Chromium", async ({
  page,
}, testInfo) => {
  await page.route("https://lad-budget-tests.invalid/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Budget cases</title>",
    }),
  );
  await page.goto("https://lad-budget-tests.invalid/");
  await page.addScriptTag({ content: bundle });
  const results = await page.evaluate(() => {
    return (globalThis as Browser).__browserTestModule.t05BudgetCases.map(
      (entry) => {
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
      },
    );
  });
  await testInfo.attach("budget-browser-cases", {
    body: JSON.stringify(results, null, 2),
    contentType: "application/json",
  });
  expect(results).toHaveLength(22);
  expect(results.filter((entry) => !entry.passed)).toEqual([]);
});

test("monthly budget transition previews old carry, requires confirmation and preserves history after reload", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await start(page);
  await button(page, "Новый график бюджета").click();
  await page.getByRole("tab", { name: "Неделя", exact: true }).click();
  await page.getByLabel("Новый лимит бюджета", { exact: true }).fill("3000");
  await page
    .getByLabel("Переносить остаток нового бюджета", { exact: true })
    .click();
  await button(page, "Рассчитать переход").click();
  const preview = page.getByTestId("budget-transition-preview");
  await expect(preview).toContainText("Переход с 1 ноября");
  await expect(preview).toContainText(
    /Перенос по прежним правилам: 2\s000,00 ₽/,
  );
  await expect(preview).toContainText(/Бюджет первого периода: 5\s000,00 ₽/);
  expect(
    await page.evaluate(
      () =>
        (globalThis as Browser).__browserTestModule.readBudgetFixture()
          .budgetPlans![0].versions,
    ),
  ).toBeUndefined();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await preview.screenshot({
    path: testInfo.outputPath("budget-transition-320.png"),
    animations: "disabled",
  });
  await button(page, "Подтвердить новый график").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (globalThis as Browser).__browserTestModule.readBudgetFixture()
            .budgetPlans![0].versions?.length,
      ),
    )
    .toBe(1);
  await page.reload();
  await page.getByRole("tab", { name: "План", exact: true }).click();
  await button(page, "Изменить бюджет: Продукты").click();
  await button(page, "История условий бюджета").click();
  const history = page.getByTestId("budget-conditions-history");
  await expect(history).toContainText("1 ноября");
  await expect(history).toContainText("запланировано");
  await expect(history).toContainText("Месяц с 1-го числа");
  await expect(history).toContainText(/Неделя; первый лимит 3\s000,00 ₽/);
});

test("future budget override blocks schedule change and preserves the complete ledger", async ({
  page,
}) => {
  await start(page, true);
  const before = await page.evaluate(() =>
    (globalThis as Browser).__browserTestModule.readBudgetFixture(),
  );
  await button(page, "Новый график бюджета").click();
  await page.getByRole("tab", { name: "Неделя", exact: true }).click();
  await button(page, "Рассчитать переход").click();
  await expect(
    page.getByText(/В будущем уже заданы лимиты: 2026-12-01/),
  ).toBeVisible();
  await expect(button(page, "Подтвердить новый график")).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      (globalThis as Browser).__browserTestModule.readBudgetFixture(),
    ),
  ).toEqual(before);
});

test("budget date outside the supported calendar shows a field error without rendering an unbounded carry preview", async ({
  page,
}) => {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  await start(page, false, true);
  const before = await page.evaluate(() =>
    (globalThis as Browser).__browserTestModule.readBudgetFixture(),
  );
  const date = page.getByLabel("Дата бюджетного периода", { exact: true });
  for (const unsupported of ["01.01.2200", "31.12.1999"]) {
    await date.fill(unsupported);
    await expect(
      page.getByText("Выберите дату бюджетного периода от 2000 до 2100 года.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(button(page, "Сохранить лимит")).toBeDisabled();
    await expect(page.getByText(/^Выбранный период:/)).toHaveCount(0);
    await expect(page.getByRole("dialog")).toBeVisible();
  }
  await date.fill("18.10.2026");
  await expect(button(page, "Сохранить лимит")).toBeEnabled();
  await expect(page.getByText(/^Выбранный период:/)).toBeVisible();
  expect(
    await page.evaluate(() =>
      (globalThis as Browser).__browserTestModule.readBudgetFixture(),
    ),
  ).toEqual(before);
  expect(failures).toEqual([]);
});
