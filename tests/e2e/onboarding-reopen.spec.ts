import { expect, test, type Page } from "@playwright/test";
import { accountBalance } from "../../src/domain/accountBalances";
import { createInitialState } from "../../src/domain/seed";
import { readState, startApp } from "./helpers";

const TODAY = "2026-09-10";
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });

for (const width of [320, 390]) {
  test(`personal setup opens directly and remains usable after repeated dismissal at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 740 });
    const initial = createInitialState(false, TODAY);
    initial.settings.onboardingCompleted = false;
    initial.settings.exchange = { automatic: false, rates: {} };
    // A saved, unfinished ledger represents existing users and additional profiles.
    await startApp(page, TODAY, initial);
    const before = await readState(page);

    for (let attempt = 0; attempt < 3; attempt++) {
      await button(page, "Настроить свой учёт").click();
      await expect(page.getByText("Шаг 1 из 4", { exact: true })).toBeVisible();
      await expect(
        page.getByText("Больше ясности с первого дня", { exact: true }),
      ).toHaveCount(0);
      await expect(button(page, "Настроить свой учёт")).toHaveCount(0);
      const balance = page.getByLabel("Начальный остаток", { exact: true });
      await expect(balance).toHaveValue("");
      await balance.fill("1234");
      if (attempt === 1) {
        await button(page, "Продолжить").click();
        await expect(
          page.getByText("Шаг 2 из 4", { exact: true }),
        ).toBeVisible();
      }
      await button(page, "Закрыть").click();
      await expect(button(page, "Настроить свой учёт")).toBeVisible();
      expect(await readState(page)).toEqual(before);
    }

    await button(page, "Настроить свой учёт").click();
    await page.getByLabel("Начальный остаток", { exact: true }).fill("1250");
    for (let step = 1; step < 4; step++)
      await button(page, "Продолжить").click();
    await button(page, "Начать учёт с этими данными").click();
    await expect
      .poll(async () => (await readState(page)).settings.onboardingCompleted)
      .toBe(true);
    const saved = await readState(page);
    expect(accountBalance(saved, "card", TODAY)).toBe(125000);
    expect(saved.transactions).toEqual([]);
    await page.reload();
    await expect(button(page, "Профиль и настройки")).toBeVisible();
    await expect(button(page, "Настроить свой учёт")).toHaveCount(0);
    expect(await readState(page)).toEqual(saved);
  });
}
