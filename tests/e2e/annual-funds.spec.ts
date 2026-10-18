import { expect, test, type Page } from "@playwright/test";
import { bundleBrowserModule } from "./browserBundle";
import type * as Fixture from "../helpers/t06FundCases";

type Browser = typeof globalThis & { __browserTestModule: typeof Fixture };
let bundle: string;
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
test.beforeAll(async () => {
  bundle = await bundleBrowserModule("tests/helpers/t06FundCases.ts");
});
async function state(page: Page) {
  return page.evaluate(() =>
    (globalThis as Browser).__browserTestModule.annualFundUiState(),
  );
}
async function start(page: Page) {
  await page.route("https://api.frankfurter.dev/**", (route) => route.abort());
  await page.clock.install({ time: new Date("2026-10-19T12:00:00+04:00") });
  await page.addInitScript({
    content: `${bundle}\n;globalThis.__browserTestModule = __browserTestModule; __browserTestModule.installAnnualFundFixture();`,
  });
  await page.goto("/");
  await page.getByRole("tab", { name: "План", exact: true }).click();
  await page.getByRole("tab", { name: "Платежи", exact: true }).click();
  await button(page, "Подготовить годовой фонд").click();
}
async function createLinked(page: Page) {
  await button(page, "Создать годовой фонд").click();
  await button(page, "Цель годового фонда").click();
  await page
    .getByRole("radio", { name: "Фонд страховки", exact: true })
    .click();
  await page
    .getByLabel("Ежемесячный взнос годового фонда", { exact: true })
    .fill("0");
  await button(page, "Подтвердить создание фонда").click();
  await expect(button(page, "Подготовить оплату из фонда")).toBeVisible();
}

test("T06 annual fund calculation cases execute in Chromium", async ({
  page,
}, testInfo) => {
  await page.route("https://lad-annual-fund-tests.invalid/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Annual funds</title>",
    }),
  );
  await page.goto("https://lad-annual-fund-tests.invalid/");
  await page.addScriptTag({ content: bundle });
  const outcomes = await page.evaluate(() =>
    (globalThis as Browser).__browserTestModule.t06FundCases.map((entry) => {
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
    }),
  );
  await testInfo.attach("annual-fund-browser-cases", {
    body: JSON.stringify(outcomes, null, 2),
    contentType: "application/json",
  });
  expect(outcomes.length).toBeGreaterThan(0);
  expect(outcomes.filter((entry) => !entry.passed)).toEqual([]);
});

test("T06 annual fund creation and payment require confirmation, preserve history and reload", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  const original = await state(page);
  await button(page, "Создать годовой фонд").click();
  await button(page, "Отмена создания фонда").click();
  expect(await state(page)).toEqual(original);
  await createLinked(page);
  const linked = await state(page);
  expect(linked.goalFundCycles).toHaveLength(1);
  expect(linked.transactions).toHaveLength(0);
  expect(linked.goals).toHaveLength(1);
  await expect(button(page, "Я оплатил — записать расход")).toHaveCount(0);
  await expect(button(page, "Ожидать списание по плану")).toHaveCount(0);
  await button(page, "Подготовить оплату из фонда").click();
  await expect(
    page.getByText(
      /Вернуть 8\s000 ₽ из накоплений и записать полный расход 12\s000 ₽/,
    ),
  ).toBeVisible();
  expect(await state(page)).toEqual(linked);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await button(page, "Подтвердить оплату из фонда").scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`annual-fund-confirm-${width}.png`),
      fullPage: false,
      animations: "disabled",
    });
  }
  await button(page, "Отмена оплаты из фонда").click();
  expect(await state(page)).toEqual(linked);
  await button(page, "Подготовить оплату из фонда").click();
  await button(page, "Подтвердить оплату из фонда").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect
    .poll(async () => (await state(page)).transactions.length)
    .toBe(2);
  const paid = await state(page);
  expect(paid.goalFundCycles?.[0].status).toBe("paid");
  expect(paid.goalReleases?.[0].amount).toBe(800_000);
  expect(
    paid.transactions.find((entry) => entry.type === "expense")?.amount,
  ).toBe(1_200_000);
  expect(paid.goals[0].initialSaved).toBe(800_000);
  await page.reload();
  await expect(
    page.getByRole("tab", { name: "План", exact: true }),
  ).toBeVisible();
  expect(await state(page)).toEqual(paid);
});

test("T06 cancelling annual fund link keeps actual savings and lets the ordinary payment continue", async ({
  page,
}) => {
  await start(page);
  await createLinked(page);
  const before = await state(page);
  await button(page, "Отменить связь фонда с платежом").click();
  expect(await state(page)).toEqual(before);
  await button(page, "Сохранить связь фонда").click();
  expect(await state(page)).toEqual(before);
  await button(page, "Отменить связь фонда с платежом").click();
  await button(page, "Подтвердить отмену связи фонда").click();
  await expect(button(page, "Я оплатил — записать расход")).toBeVisible();
  const after = await state(page);
  expect(after.goalFundCycles?.[0].status).toBe("cancelled");
  expect(after.goals).toEqual(before.goals);
  expect(after.accounts).toEqual(before.accounts);
  expect(after.transactions).toEqual(before.transactions);
});

test("T06 explicit next annual cycle reuses the goal without automatic transfers", async ({
  page,
}) => {
  await start(page);
  await createLinked(page);
  await button(page, "Подготовить оплату из фонда").click();
  await button(page, "Подтвердить оплату из фонда").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const paid = await state(page);
  await button(page, "Подготовить годовой фонд").click();
  await expect(
    page.getByText("По плану — 10 декабря 2027 г.", { exact: true }),
  ).toBeVisible();
  await createLinked(page);
  const next = await state(page);
  expect(next.goalFundCycles?.map((entry) => entry.status)).toEqual([
    "paid",
    "active",
  ]);
  expect(next.goalFundCycles?.[1].occurrenceDate).toBe("2027-12-10");
  expect(next.goals).toHaveLength(1);
  expect(next.transactions).toEqual(paid.transactions);
  expect(next.goalReleases).toEqual(paid.goalReleases);
});
