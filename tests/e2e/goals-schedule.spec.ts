import { expect, test, type Page } from "@playwright/test";
import { bundleBrowserModule } from "./browserBundle";
import type * as GoalModule from "../helpers/t06GoalCases";
type Browser = typeof globalThis & { __browserTestModule: typeof GoalModule };
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
let bundle: string;
test.beforeAll(async () => {
  bundle = await bundleBrowserModule("tests/helpers/t06GoalCases.ts");
});
async function start(page: Page) {
  await page.route("https://api.frankfurter.dev/**", (route) => route.abort());
  await page.clock.install({ time: new Date("2026-10-19T12:00:00+04:00") });
  await page.addInitScript({
    content: `${bundle}\n;globalThis.__browserTestModule = __browserTestModule; __browserTestModule.installGoalFixture();`,
  });
  await page.goto("/");
  await expect(button(page, "Добавить операцию")).toBeVisible();
  await page.getByRole("tab", { name: "План", exact: true }).click();
  await page.getByRole("tab", { name: "Цели", exact: true }).click();
}
async function configure(page: Page) {
  await button(page, "Изменить цель Отпуск").click();
  await button(page, "Настроить индивидуальный график").click();
  await page.getByRole("tab", { name: "Неделя", exact: true }).click();
  await page.getByLabel("Срок цели", { exact: true }).fill("29.11.2026");
  await button(page, "Сохранить цель").click();
}
test("T06 goal schedule calculations execute in Chromium", async ({
  page,
}, testInfo) => {
  await page.route("https://lad-goal-tests.invalid/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Goal cases</title>",
    }),
  );
  await page.goto("https://lad-goal-tests.invalid/");
  await page.addScriptTag({ content: bundle });
  const results = await page.evaluate(() =>
    (globalThis as Browser).__browserTestModule.t06GoalCases.map((entry) => {
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
  await testInfo.attach("goal-browser-cases", {
    body: JSON.stringify(results, null, 2),
    contentType: "application/json",
  });
  expect(results).toHaveLength(22);
  expect(results.filter((entry) => !entry.passed)).toEqual([]);
});
test("weekly goal previews exact deadline amount, requires confirmation and survives reload", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await start(page);
  await configure(page);
  const preview = page.getByTestId("goal-transition-preview");
  await expect(preview).toContainText("До срока 6 дат");
  await expect(preview).toContainText(/Требуется по 1\s666,67 ₽/);
  expect(
    await page.evaluate(
      () =>
        (globalThis as Browser).__browserTestModule.readGoalFixture().goals[0]
          .versions,
    ),
  ).toBeUndefined();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await preview.scrollIntoViewIfNeeded();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`goal-preview-${width}.png`),
    });
  }
  await button(page, "Подтвердить условия цели").click();
  await expect(button(page, "Изменить цель Отпуск")).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "План", exact: true }).click();
  await page.getByRole("tab", { name: "Цели", exact: true }).click();
  await button(page, "Изменить цель Отпуск").click();
  await expect(page.getByTestId("goal-terms-history")).toContainText(
    "Каждые 1 нед.",
  );
  const state = await page.evaluate(() =>
    (globalThis as Browser).__browserTestModule.readGoalFixture(),
  );
  expect(state.version).toBe(7);
  expect(state.goals[0].versions).toHaveLength(2);
  expect(state.transactions).toHaveLength(0);
});
test("required contribution can be applied and any field edit clears confirmation", async ({
  page,
}) => {
  await start(page);
  await configure(page);
  await button(page, "Применить требуемый взнос").click();
  await expect(page.getByTestId("goal-transition-preview")).toHaveCount(0);
  await button(page, "Сохранить цель").click();
  await page.getByLabel("Взнос по графику", { exact: true }).fill("1000");
  await expect(button(page, "Подтвердить условия цели")).toHaveCount(0);
  await button(page, "Сохранить цель").click();
  await expect(page.getByTestId("goal-transition-preview")).toContainText(
    "Текущего взноса недостаточно",
  );
  await button(page, "Подтвердить условия цели").click();
  await button(page, "Пополнить цель").click();
  await button(page, "Взнос по графику цели").click();
  await page.getByRole("radio", { name: /^1 ноября/ }).click();
  await page.getByLabel("Сумма пополнения цели", { exact: true }).fill("500");
  await button(page, "Записать пополнение").click();
  await expect(button(page, "Изменить цель Отпуск")).toBeVisible();
  const state = await page.evaluate(() =>
    (globalThis as Browser).__browserTestModule.readGoalFixture(),
  );
  expect(state.transactions).toHaveLength(1);
  expect(state.transactions[0].goalOccurrenceDate).toBe("2026-11-01");
  expect(state.transactions[0].goalVersionId).toBe(
    state.goals[0].versions?.at(-1)?.id,
  );
});
test("impossible goal deadline is explained without a completion promise", async ({
  page,
}) => {
  await start(page);
  await button(page, "Новая цель").click();
  await page.getByLabel("Название цели", { exact: true }).fill("Новая мечта");
  await button(page, "Настроить индивидуальный график").click();
  await page.getByLabel("День взноса цели", { exact: true }).fill("5");
  await page.getByLabel("Срок цели", { exact: true }).fill("31.10.2026");
  await button(page, "Создать цель").click();
  await expect(page.getByTestId("goal-transition-preview")).toContainText(
    "До срока нет будущих дат",
  );
});
