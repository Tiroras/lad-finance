import { test, expect, type Page } from "@playwright/test";
import { accountBalance, money } from "../../src/domain/finance";
import { createInitialState } from "../../src/domain/seed";
import type { FinanceState } from "../../src/domain/types";

const TODAY = "2026-09-10",
  KEY = "lad-finance-v1";
const readState = (page: Page): Promise<FinanceState> =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), KEY);
const close = (page: Page) =>
  page.getByRole("button", { name: "Закрыть", exact: true }).click();
const openForecast = (page: Page) =>
  page.getByRole("button", { name: "Прогноз по дням", exact: true }).click();
async function setState(page: Page, state: FinanceState) {
  await page.evaluate(
    ({ key, state }) => localStorage.setItem(key, JSON.stringify(state)),
    { key: KEY, state },
  );
  await page.reload();
  await expect(page.getByText("Больше ясности.")).toBeVisible();
}
function fixture() {
  const state = createInitialState(false, TODAY);
  state.accounts[0].openingBalance = 500000;
  state.settings.buffer = 0;
  return state;
}
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-10T12:00:00+04:00") });
  await page.goto("/");
  await expect(page.getByText("Больше ясности.")).toBeVisible();
  await expect
    .poll(() => page.evaluate((key) => !!localStorage.getItem(key), KEY))
    .toBe(true);
});

test("planned income and daily assumptions change all horizons, persist and never post actual money", async ({
  page,
}) => {
  await setState(page, fixture());
  const before = await readState(page);
  await openForecast(page);
  await expect(
    page.getByText(/Пока прогноз учитывает только текущие деньги/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Добавить", exact: true }).click();
  await page
    .getByLabel("Название планируемого дохода", { exact: true })
    .fill("Зарплата по плану");
  await page
    .getByLabel("Сумма планируемого дохода", { exact: true })
    .fill("10000");
  await page
    .getByLabel("Дата планируемого дохода", { exact: true })
    .fill("2026-09-15");
  await page
    .getByRole("button", { name: "Сохранить план дохода", exact: true })
    .click();
  await expect(page.getByTestId("forecast-closing")).toHaveText(
    money(1500000, true),
  );
  await page
    .getByRole("button", { name: "Настроить прогноз", exact: true })
    .click();
  await page
    .getByLabel("Расходы в день для прогноза", { exact: true })
    .fill("100");
  await page.getByLabel("День взноса на цели", { exact: true }).fill("15");
  await page
    .getByRole("button", { name: "Сохранить прогноз", exact: true })
    .click();
  await expect(page.getByTestId("forecast-closing")).toHaveText(
    money(1210000, true),
  );
  await page.getByRole("tab", { name: "60 дней", exact: true }).click();
  await expect(page.getByTestId("forecast-closing")).toHaveText(
    money(1910000, true),
  );
  await page.getByRole("tab", { name: "90 дней", exact: true }).click();
  await expect(page.getByTestId("forecast-closing")).toHaveText(
    money(2610000, true),
  );
  const after = await readState(page);
  expect(after.transactions).toEqual(before.transactions);
  expect(after.accounts).toEqual(before.accounts);
  await page.reload();
  await expect(page.getByText("Больше ясности.")).toBeVisible();
  await openForecast(page);
  await expect(page.getByTestId("forecast-closing")).toHaveText(
    money(1210000, true),
  );
  expect((await readState(page)).settings.forecast).toEqual({
    dailySpending: 10000,
    goalDay: 15,
  });
});

test("the calendar explains a shortfall and remains usable at 320 and 1440 pixels", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const state = fixture();
  state.recurring = [
    {
      id: "rent",
      name: "Аренда в прогнозе",
      amount: 700000,
      day: 15,
      startsOn: TODAY,
      active: true,
      kind: "bill",
      accountId: "card",
      category: "home",
      icon: "home-outline",
      color: "#FFFFFF",
    },
  ];
  state.plannedIncomes = [
    {
      id: "salary",
      name: "Зарплата",
      amount: 1000000,
      date: "2026-09-20",
      repeat: "monthly",
      accountId: "card",
    },
  ];
  await setState(page, state);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.getByRole("tab", { name: "План", exact: true }).click();
  await page.getByRole("tab", { name: "Прогноз", exact: true }).click();
  await expect(page.getByTestId("forecast-status")).toHaveText(
    "Нехватка с 15 сентября",
  );
  await page.getByRole("button", { name: /^15 сентября:/ }).click();
  await expect(page.getByTestId("forecast-day")).toContainText(
    "Аренда в прогнозе",
  );
  await expect(page.getByTestId("forecast-day")).toContainText(
    money(-200000, true),
  );
  await page.getByRole("tab", { name: "90 дней", exact: true }).click();
  await page
    .getByRole("button", { name: "Следующий месяц прогноза", exact: true })
    .click();
  await page.getByRole("button", { name: /^20 октября:/ }).click();
  await expect(page.getByTestId("forecast-day")).toContainText("Зарплата");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  // Check real content bounds as well as the document's overflow setting.
  const bounds = await page.getByTestId("forecast-day").boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  await page.setViewportSize({ width: 1440, height: 1040 });
  await expect(
    page.getByRole("button", { name: /^20 октября:/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("an existing income can be linked to its plan without a second credit", async ({
  page,
}) => {
  const state = fixture();
  state.plannedIncomes = [
    {
      id: "salary",
      name: "Зарплата",
      amount: 1000000,
      date: "2026-09-15",
      repeat: "monthly",
      accountId: "card",
    },
  ];
  state.transactions = [
    {
      id: "received",
      type: "income",
      title: "Зачисление из CSV",
      amount: 1000000,
      date: TODAY,
      category: "other",
      accountId: "card",
      importKey: "test-income",
    },
  ];
  await setState(page, state);
  await openForecast(page);
  await page
    .getByRole("button", { name: "Доход: Зарплата", exact: true })
    .click();
  await page
    .getByRole("button", { name: /Связать доход: Зачисление из CSV/ })
    .click();
  await expect(
    page.getByRole("button", { name: "Открыть полученный доход", exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => (await readState(page)).transactions[0].plannedIncomeId)
    .toBe("salary");
  const linked = await readState(page);
  expect(linked.transactions).toHaveLength(1);
  expect(accountBalance(linked, "card", TODAY)).toBe(1500000);
  await close(page);
  await openForecast(page);
  await expect(page.getByTestId("forecast-closing")).toHaveText(
    money(1500000, true),
  );
});

test("receiving income posts it once; deleting its plan preserves the actual receipt after reload", async ({
  page,
}) => {
  const state = fixture();
  state.plannedIncomes = [
    {
      id: "salary",
      name: "Подработка",
      amount: 100000,
      date: TODAY,
      repeat: "once",
      accountId: "card",
    },
  ];
  await setState(page, state);
  await openForecast(page);
  await page
    .getByRole("button", { name: "Доход: Подработка", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Доход получен — записать", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Открыть полученный доход", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Доход получен — записать", exact: true }),
  ).toHaveCount(0);
  await expect
    .poll(async () => (await readState(page)).transactions.length)
    .toBe(1);
  await page
    .getByRole("button", { name: "Удалить план дохода", exact: true })
    .click();
  await page.getByRole("button", { name: "Да, удалить", exact: true }).click();
  await expect(page.getByTestId("forecast-closing")).toHaveText(
    money(600000, true),
  );
  await page.reload();
  await expect(page.getByText("Больше ясности.")).toBeVisible();
  const after = await readState(page);
  expect(after.plannedIncomes).toEqual([]);
  expect(after.transactions).toHaveLength(1);
  expect(after.transactions[0].plannedIncomeId).toBeUndefined();
  expect(accountBalance(after, "card", TODAY)).toBe(600000);
});

test("a purchase on a chosen future day shifts the shortfall while leaving all finances untouched", async ({
  page,
}) => {
  await setState(page, fixture());
  const before = await readState(page);
  await page
    .getByRole("button", { name: "Проверить покупку", exact: true })
    .click();
  await page.getByLabel("Стоимость покупки", { exact: true }).fill("5000,01");
  await page.getByLabel("Дата покупки", { exact: true }).fill("2026-09-20");
  await expect(page.getByTestId("forecast-status")).toHaveText(
    "Нехватка с 20 сентября",
  );
  await page.getByRole("button", { name: /^19 сентября:/ }).click();
  await expect(page.getByTestId("forecast-day")).toContainText(
    money(500000, true),
  );
  await page.getByRole("button", { name: /^20 сентября:/ }).click();
  await expect(page.getByTestId("forecast-day")).toContainText(
    "Покупка в сценарии",
  );
  await expect(page.getByTestId("forecast-day")).toContainText(money(-1, true));
  await page.getByLabel("Дата покупки", { exact: true }).fill("2026-10-20");
  await expect(page.getByText(/или увеличьте период/)).toBeVisible();
  await page.getByRole("tab", { name: "60 дней", exact: true }).click();
  await expect(page.getByTestId("forecast-status")).toHaveText(
    "Нехватка с 20 октября",
  );
  await close(page);
  expect(await readState(page)).toEqual(before);
});
