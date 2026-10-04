import { expect, test } from "@playwright/test";
import { decodeBackup } from "../../src/domain/backup";
import { money } from "../../src/domain/currency";
import { createInitialState } from "../../src/domain/seed";
import { readState, startApp } from "./helpers";

const TODAY = "2026-09-10";
const ACCOUNT = "Основная карта для повседневных расходов семьи";
const CATEGORY = "Продукты для семьи и домашних животных";

for (const width of [320, 390, 1440]) {
  test(`history exposes scope, intersects collapsed filters and keeps rows near the search at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    const state = createInitialState(false, TODAY);
    state.settings.exchange = { automatic: false, rates: {} };
    state.settings.onboardingCompleted = true;
    state.accounts[0].name = ACCOUNT;
    state.accounts[0].openingBalance = 1_000_000;
    state.accounts.find((account) => account.id === "savings")!.openingBalance =
      100_000;
    state.categories.find((category) => category.id === "groceries")!.name =
      CATEGORY;
    state.transactions = [
      {
        id: "now",
        title: "Кофе сентябрь",
        type: "expense",
        amount: 10000,
        date: TODAY,
        accountId: "card",
        category: "groceries",
      },
      {
        id: "old",
        title: "Кофе август",
        note: "Чек со встречи",
        type: "expense",
        amount: 20000,
        date: "2026-08-20",
        accountId: "card",
        category: "groceries",
      },
      {
        id: "other-category",
        title: "Кофе для дома",
        type: "expense",
        amount: 30000,
        date: "2026-08-19",
        accountId: "card",
        category: "home",
      },
      {
        id: "other-account",
        title: "Кофе с другого счёта",
        type: "expense",
        amount: 40000,
        date: "2026-08-18",
        accountId: "savings",
        category: "groceries",
      },
      {
        id: "last-year",
        title: "Кофе декабрь",
        type: "expense",
        amount: 50000,
        date: "2025-12-31",
        accountId: "card",
        category: "other",
      },
    ];
    decodeBackup(JSON.stringify(state));
    await startApp(page, TODAY, state);
    const before = await readState(page);
    await page.getByRole("tab", { name: "Операции", exact: true }).click();
    const screen = page.getByTestId("screen-transactions");
    const rows = screen.getByRole("button", { name: /открыть операцию$/ });
    const search = screen.getByLabel("Поиск операций", { exact: true });
    const filters = screen.getByRole("button", { name: /^Фильтры(?:: \d+)?$/ });
    await expect(filters).toHaveAttribute("aria-expanded", "false");
    await expect(
      screen.getByRole("tab", { name: "Месяц", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      screen.getByRole("tab", { name: "Расходы", exact: true }),
    ).toHaveCount(0);
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toBeInViewport({ ratio: 1 });
    await page.screenshot({
      path: testInfo.outputPath(`history-compact-${width}.png`),
    });
    await search.fill("кофе");
    await screen.getByRole("tab", { name: "Вся история", exact: true }).click();
    await expect(rows).toHaveCount(5);
    await expect(
      screen.getByText("31 декабря 2025 г.", { exact: true }),
    ).toBeVisible();
    await expect(
      screen.getByRole("button", { name: "Предыдущий месяц", exact: true }),
    ).toHaveCount(0);
    await filters.click();
    await screen.getByRole("tab", { name: "Расходы", exact: true }).click();
    await screen.getByRole("button", { name: ACCOUNT, exact: true }).click();
    await screen.getByRole("button", { name: CATEGORY, exact: true }).click();
    await expect(rows).toHaveCount(2);
    await filters.click();
    await expect(filters).toHaveAttribute("aria-expanded", "false");
    await expect(filters).toHaveAccessibleName("Фильтры: 3");
    await expect(
      screen.getByText(`Расходы · ${ACCOUNT} · ${CATEGORY}`, { exact: true }),
    ).toBeVisible();
    await expect(screen.getByText(money(30000), { exact: true })).toBeVisible();
    await expect(
      screen.getByTestId("transaction-results-summary"),
    ).toContainText("За всю историю");
    await expect(
      screen.getByTestId("transaction-results-summary"),
    ).toContainText("только часть выбранной категории");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`history-active-filters-${width}.png`),
    });
    await search.fill("  чЕК СО ВСТРЕЧИ  ");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveAccessibleName(/Кофе август,/);
    await screen.getByRole("tab", { name: "Месяц", exact: true }).click();
    await expect(
      screen.getByText("Ничего не найдено", { exact: true }),
    ).toBeVisible();
    await screen
      .getByRole("button", { name: "Искать во всей истории", exact: true })
      .click();
    await expect(rows).toHaveCount(1);
    await screen
      .getByRole("button", { name: "Сбросить фильтры", exact: true })
      .click();
    await expect(search).toHaveValue("");
    await expect(rows).toHaveCount(5);
    await expect(filters).toHaveAccessibleName("Фильтры");
    await screen.getByRole("tab", { name: "Месяц", exact: true }).click();
    await expect(rows).toHaveCount(1);
    await screen
      .getByRole("button", { name: "Предыдущий месяц", exact: true })
      .click();
    await expect(rows).toHaveCount(3);
    await screen.getByRole("tab", { name: "Вся история", exact: true }).click();
    await screen.getByRole("tab", { name: "Месяц", exact: true }).click();
    await expect(rows).toHaveCount(3);
    await screen
      .getByRole("button", { name: "Предыдущий месяц", exact: true })
      .click();
    await expect(
      screen.getByText("В этом месяце нет операций", { exact: true }),
    ).toBeVisible();
    await screen
      .getByRole("button", { name: "Открыть всю историю", exact: true })
      .click();
    await expect(rows).toHaveCount(5);
    const exportDetails = screen.getByRole("button", {
      name: "Экспорт и пояснения",
      exact: true,
    });
    await expect(exportDetails).toHaveAttribute("aria-expanded", "false");
    await expect(
      screen.getByRole("button", {
        name: "Экспортировать операции в CSV",
        exact: true,
      }),
    ).toHaveCount(0);
    await exportDetails.click();
    await screen
      .getByRole("button", {
        name: "Экспортировать операции в CSV",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("dialog").getByText("Экспорт операций", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Закрыть", exact: true }).click();
    expect(await readState(page)).toEqual(before);
  });
}

test("an empty ledger invites the first entry rather than a filter reset", async ({
  page,
}) => {
  const state = createInitialState(false, TODAY);
  state.settings.exchange = { automatic: false, rates: {} };
  state.settings.onboardingCompleted = true;
  await startApp(page, TODAY, state);
  await page.getByRole("tab", { name: "Операции", exact: true }).click();
  const screen = page.getByTestId("screen-transactions");
  await expect(
    screen.getByText("Пока нет операций", { exact: true }),
  ).toBeVisible();
  await expect(
    screen.getByRole("button", {
      name: "Сбросить условия поиска",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    screen.getByRole("button", { name: "Искать во всей истории", exact: true }),
  ).toHaveCount(0);
  await screen
    .getByRole("button", { name: "Добавить операцию", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("dialog").getByText("Новая операция", { exact: true }),
  ).toBeVisible();
});
