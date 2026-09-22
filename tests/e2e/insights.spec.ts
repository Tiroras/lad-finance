import { expect, test, type Page } from "@playwright/test";
import { createInitialState } from "../../src/domain/seed";
import type { FinanceState, Transaction } from "../../src/domain/types";

const STORAGE_KEY = "lad-finance-v1";
const TODAY = "2026-09-20";
const readState = (page: Page): Promise<FinanceState> =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);

function fixture() {
  const state = createInitialState(false, TODAY);
  state.accounts[0].openingBalance = 10_000_000;
  const transaction = (
    id: string,
    date: string,
    amount: number,
    extra: Partial<Transaction> = {},
  ): Transaction => ({
    id,
    date,
    amount,
    type: "expense",
    title: "Продукты домой",
    category: "groceries",
    accountId: "card",
    ...extra,
  });
  state.transactions.push(
    transaction("history", "2026-07-01", 1, {
      type: "income",
      title: "Начало истории",
    }),
  );
  for (const month of ["07", "08", "09"])
    state.transactions.push(
      transaction(`service-${month}`, `2026-${month}-15`, 49_900, {
        title: "Музыкальный сервис",
        category: "fun",
      }),
    );
  state.transactions.push(transaction("previous", "2026-08-10", 2_000));
  for (const day of [1, 3, 6, 9, 12, 18])
    state.transactions.push(
      transaction(
        `current-${day}`,
        `2026-09-${String(day).padStart(2, "0")}`,
        3_000,
      ),
    );
  return state;
}

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-20T12:00:00+04:00") });
  await page.addInitScript(
    ({ key, state }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(state));
    },
    { key: STORAGE_KEY, state: fixture() },
  );
  await page.goto("/");
  await expect(page.getByText("Больше ясности.")).toBeVisible();
});

test("analytics explains changes with source operations and provides a year overview on narrow and wide screens", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const before = await readState(page);
  await page.getByRole("tab", { name: "Аналитика", exact: true }).click();
  await expect(page.getByText(/одинаковое число дней: 20/)).toBeVisible();
  await page
    .getByRole("button", { name: "Почему: Продукты", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: /Открыть операцию Продукты домой, 18 сентября/,
    })
    .click();
  await expect(
    page.getByLabel("Название операции", { exact: true }),
  ).toHaveValue("Продукты домой");
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page.getByRole("tab", { name: "Год", exact: true }).click();
  await expect(
    page.getByText("октябрь 2025 г.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Нет истории за этот месяц").first(),
  ).toBeVisible();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  expect(await readState(page)).toEqual(before);
  expect(errors).toEqual([]);
});

test("repeated-spending suggestions prefill a future plan and forecast estimates require saving", async ({
  page,
}) => {
  const before = await readState(page);
  await page.getByRole("tab", { name: "Аналитика", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Запланировать: Музыкальный сервис",
      exact: true,
    })
    .click();
  await expect(
    page.getByLabel("Название платежа", { exact: true }),
  ).toHaveValue("Музыкальный сервис");
  await expect(page.getByLabel("Сумма платежа", { exact: true })).toHaveValue(
    "499",
  );
  await expect(
    page.getByLabel("Дата начала платежа", { exact: true }),
  ).toHaveValue("2026-09-21");
  await expect(page.getByLabel("День списания", { exact: true })).toHaveValue(
    "15",
  );
  expect(await readState(page)).toEqual(before);
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page.getByRole("tab", { name: "План", exact: true }).click();
  await page.getByRole("tab", { name: "Прогноз", exact: true }).click();
  await page
    .getByRole("button", { name: "Настроить прогноз", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Подставить оценку расходов", exact: true })
    .click();
  const field = page.getByLabel("Расходы в день для прогноза", { exact: true });
  expect(await field.inputValue()).not.toBe("0");
  expect(await readState(page)).toEqual(before);
  await page
    .getByRole("button", { name: "Сохранить прогноз", exact: true })
    .click();
  await expect
    .poll(
      async () => (await readState(page)).settings.forecast?.dailySpending ?? 0,
    )
    .toBeGreaterThan(0);
  expect((await readState(page)).transactions).toEqual(before.transactions);
});

test("a reserve shortfall explains the date and opens scenarios without changing the ledger", async ({
  page,
}) => {
  const state = createInitialState(false, TODAY);
  state.accounts[0].openingBalance = 10_000;
  state.settings.buffer = 1_000;
  state.settings.forecast = { dailySpending: 5_000, goalDay: 31 };
  await page.evaluate(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: STORAGE_KEY, value: state },
  );
  await page.reload();
  await page.getByRole("tab", { name: "Аналитика", exact: true }).click();
  await expect(
    page.getByText(
      /По текущему прогнозу 22 сентября до резерва будет не хватать 10 ₽/,
    ),
  ).toBeVisible();
  const before = await readState(page);
  await page
    .getByRole("button", {
      name: "Проверить изменения в сценарии",
      exact: true,
    })
    .click();
  await expect(page.getByText("Мои сценарии", { exact: true })).toBeVisible();
  expect(await readState(page)).toEqual(before);
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page
    .getByRole("button", { name: "Настроить прогноз", exact: true })
    .click();
  await expect(
    page.getByLabel("Расходы в день для прогноза", { exact: true }),
  ).toHaveValue("50");
  expect(await readState(page)).toEqual(before);
});
