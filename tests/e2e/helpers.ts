import { expect, type Page } from "@playwright/test";
import type { FinanceState } from "../../src/domain/types";

export const STORAGE_KEY = "lad-finance-v1";

export async function readState(page: Page): Promise<FinanceState> {
  return page.evaluate((key) => {
    const value = localStorage.getItem(key);
    if (value === null)
      throw new Error("Финансовое состояние ещё не сохранено.");
    return JSON.parse(value);
  }, STORAGE_KEY);
}

async function waitForApp(page: Page) {
  await expect(
    page.getByRole("button", { name: "Профиль и настройки" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate((key) => localStorage.getItem(key) !== null, STORAGE_KEY),
    )
    .toBe(true);
}

export async function startApp(
  page: Page,
  today: string,
  state?: FinanceState,
) {
  await page.clock.install({ time: new Date(`${today}T12:00:00+04:00`) });
  if (state) {
    // Each test owns its browser context. Reloads must preserve subsequent edits.
    await page.addInitScript(
      ({ key, initial }) => {
        if (localStorage.getItem(key) === null)
          localStorage.setItem(key, JSON.stringify(initial));
      },
      { key: STORAGE_KEY, initial: state },
    );
  }
  await page.goto("/");
  await waitForApp(page);
}

export async function setState(page: Page, state: FinanceState) {
  await page.evaluate(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    {
      key: STORAGE_KEY,
      value: state,
    },
  );
  await page.reload();
  await waitForApp(page);
}
