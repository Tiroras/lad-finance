import { expect, test } from "@playwright/test";
import { money } from "../../src/domain/currency";
import { createInitialState } from "../../src/domain/seed";
import { readState, startApp } from "./helpers";

const TODAY = "2026-09-10";

for (const width of [320, 390, 1440]) {
  test(`transaction pagination preserves totals, date groups and search at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const state = createInitialState(false, TODAY);
    state.settings.exchange = { automatic: false, rates: {} };
    state.settings.onboardingCompleted = true;
    state.accounts[0].openingBalance = 1_000_000;
    state.transactions = Array.from({ length: 125 }, (_, index) => ({
      id: `expense-${index}`,
      title: `Покупка ${index + 1}`,
      note: index === 124 ? "ДЛИННАЯ ЗАМЕТКА для поиска" : undefined,
      type: "expense" as const,
      amount: 100,
      date: index < 70 ? TODAY : "2026-09-09",
      accountId: "card",
      category: "groceries",
    }));
    await startApp(page, TODAY, state);
    const before = await readState(page);
    await page.getByRole("tab", { name: "Операции", exact: true }).click();
    const screen = page.getByTestId("screen-transactions");
    const rows = screen.getByRole("button", { name: /открыть операцию$/ });
    const more = screen.getByRole("button", {
      name: "Показать ещё",
      exact: true,
    });
    const total = screen.getByText(money(12500), { exact: true });
    await expect(rows).toHaveCount(60);
    await expect(total).toBeVisible();
    await more.click();
    await expect(rows).toHaveCount(120);
    await expect(screen.getByText("Сегодня", { exact: true })).toHaveCount(1);
    await expect(screen.getByText("Вчера", { exact: true })).toHaveCount(1);
    await expect(total).toHaveCount(1);
    await more.click();
    await expect(rows).toHaveCount(125);
    await expect(more).toHaveCount(0);
    await expect(total).toHaveCount(1);
    await screen
      .getByLabel("Поиск операций", { exact: true })
      .fill("  длинная заметка  ");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveAccessibleName(/Покупка 125,/);
    await expect(screen.getByText(money(100), { exact: true })).toBeVisible();
    await expect(screen.getByText("Сегодня", { exact: true })).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath(`transaction-list-${width}.png`),
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect(await readState(page)).toEqual(before);
  });
}
