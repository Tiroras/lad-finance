import { expect, test } from "@playwright/test";
import { readState } from "./helpers";

const key = "lad-profile-personal:lad-drafts-v1";
const button = (page: import("@playwright/test").Page, name: string) =>
  page.getByRole("button", { name, exact: true });

test("T04: setup draft preserves partial fields across reload and clears after confirmed setup", async ({
  page,
}, testInfo) => {
  await page.clock.install({ time: new Date("2026-10-15T12:00:00+04:00") });
  await page.route("https://api.frankfurter.dev/**", (route) => route.abort());
  await page.goto("/");
  await button(page, "Настроить свой учёт").click();
  await page
    .getByLabel("Ваше имя", { exact: true })
    .fill("Синтетический профиль");
  await page.getByLabel("Начальный остаток", { exact: true }).fill("1234,");
  await page.clock.runFor(700);
  await expect
    .poll(() =>
      page.evaluate(
        (key) =>
          JSON.parse(localStorage.getItem(key) ?? "null")?.onboarding?.payload
            ?.balance,
        key,
      ),
    )
    .toBe("1234,");
  const before = await readState(page);
  await page.reload();
  await expect(button(page, "Восстановить черновик настройки")).toBeVisible();
  await expect(
    page.getByLabel("Начальный остаток", { exact: true }),
  ).toHaveValue("");
  expect(await readState(page)).toEqual(before);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 740 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`onboarding-draft-${width}.png`),
      fullPage: true,
    });
  }
  await button(page, "Восстановить черновик настройки").click();
  await expect(
    page.getByLabel("Начальный остаток", { exact: true }),
  ).toHaveValue(/^1\s234,$/);
  await page.getByLabel("Начальный остаток", { exact: true }).fill("1234,50");
  for (let step = 1; step < 4; step++) await button(page, "Продолжить").click();
  await button(page, "Начать учёт с этими данными").click();
  await expect(
    page.getByRole("heading", { name: "Хотите пройти обучение?", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        (key) =>
          JSON.parse(localStorage.getItem(key) ?? "null")?.onboarding
            ?.payload ?? null,
        key,
      ),
    )
    .toBeNull();
  expect(
    (await readState(page)).accounts.find((account) => account.id === "card")
      ?.openingBalance,
  ).toBe(123450);
  await button(page, "Начать без обучения").click();
  await page.reload();
  await expect(button(page, "Профиль и настройки")).toBeVisible();
  await expect(button(page, "Восстановить черновик настройки")).toHaveCount(0);
});

test("T04: explicitly discarded setup draft does not return after reload", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-15T12:00:00+04:00") });
  await page.goto("/");
  await button(page, "Настроить свой учёт").click();
  await page.getByLabel("Ваше имя", { exact: true }).fill("Удаляемый черновик");
  await page.clock.runFor(700);
  await expect
    .poll(() =>
      page.evaluate(
        (key) =>
          JSON.parse(localStorage.getItem(key) ?? "null")?.onboarding?.payload
            ?.name,
        key,
      ),
    )
    .toBe("Удаляемый черновик");
  await page.reload();
  await button(page, "Удалить черновик настройки").click();
  await page.clock.runFor(700);
  await page.reload();
  await expect(page.getByLabel("Ваше имя", { exact: true })).toHaveValue("");
  await expect(button(page, "Восстановить черновик настройки")).toHaveCount(0);
});
