import { expect, test, type Locator, type Page } from "@playwright/test";
import type { ListPageName } from "../../src/application/navigation/types";
import { accountBalance } from "../../src/domain/accountBalances";
import { createInitialState } from "../../src/domain/seed";
import type { FinanceState } from "../../src/domain/types";
import { readState, startApp } from "./helpers";

const TODAY = "2026-10-26";
const numbers = [1, 2, 3, 4, 5, 6];
const paymentName = (number: number) =>
  `Платёж ${number}: ежемесячная аренда квартиры и парковочного места`;
const button = (root: Page | Locator, name: string) =>
  root.getByRole("button", { name, exact: true });

function paymentFixture(count = 6) {
  const state = createInitialState(false, TODAY);
  state.version = 8;
  state.settings.onboardingCompleted = true;
  state.settings.exchange = { automatic: false, rates: {} };
  state.accounts[0].openingBalance = 10_000_000;
  state.recurring = numbers.slice(0, count).map((number) => ({
    id: `payment-${number}`,
    name: paymentName(number),
    amount: 10_000,
    category: "home",
    day: 28,
    startsOn: TODAY,
    accountId: "card",
    active: true,
    icon: "home-outline",
    color: "#EDF1E8",
  }));
  return state;
}

function fixture() {
  const state = paymentFixture();
  const account = state.accounts[0];
  state.accounts.push(
    ...numbers.map((number) => ({
      ...account,
      id: `negative-${number}`,
      name: `Отрицательный счёт ${number}`,
      openingBalance: -10_000,
    })),
    ...numbers.map((number) => ({
      ...account,
      id: `credit-${number}`,
      name: `Кредитная карта ${number}`,
      kind: "credit" as const,
      openingBalance: -10_000,
      creditLimit: 100_000,
    })),
    ...numbers.map((number) => ({
      ...account,
      id: `archived-${number}`,
      name: `Архивный счёт ${number}`,
      openingBalance: 0,
      archived: true,
    })),
  );
  state.goals = numbers.map((number) => ({
    id: `goal-${number}`,
    name: `Цель ${number}`,
    target: 100_000,
    initialSaved: 0,
    monthly: 1_000,
    icon: "leaf-outline",
    color: "#EDF1E8",
  }));
  state.plannedIncomes = numbers.map((number) => ({
    id: `income-${number}`,
    name: `Доход ${number}`,
    amount: 100_000,
    date: "2026-10-28",
    repeat: "monthly",
    accountId: "card",
  }));
  state.debts = numbers.map((number) => ({
    id: `debt-${number}`,
    name: `Долг ${number}`,
    direction: "borrowed",
    currency: "RUB",
    accountId: "card",
    openingAmount: 10_000,
    startsOn: TODAY,
  }));
  state.categoryRules = numbers.map((number) => ({
    id: `rule-${number}`,
    pattern: `Поставщик ${number}`,
    match: "contains",
    category: "home",
    enabled: true,
  }));
  state.transactionTemplates = numbers.map((number) => ({
    id: `template-${number}`,
    name: `Шаблон ${number}`,
    title: `Операция по шаблону ${number}`,
    type: "expense",
    amount: 10_000,
    category: "home",
    accountId: "card",
    currency: "RUB",
  }));
  state.categories = state.categories.map((category) => ({
    ...category,
    budget: 100_000,
  }));
  state.transactions = state.categories.slice(0, 6).flatMap((category) =>
    ["2026-09-01", "2026-10-01"].map((date) => ({
      id: `${category.id}-${date}`,
      type: "expense" as const,
      title: `Покупка: ${category.name}`,
      amount: date.startsWith("2026-09") ? 1_000 : 10_000,
      baseAmount: date.startsWith("2026-09") ? 1_000 : 10_000,
      date,
      category: category.id,
      accountId: "card",
    })),
  );
  return state;
}

type Overview =
  | "payments"
  | "goals"
  | "budgets"
  | "incomes"
  | "accounts"
  | "home"
  | "analytics"
  | "automation";
async function openOverview(page: Page, overview: Overview) {
  if (overview === "home") return page.getByTestId("screen-home");
  if (overview === "accounts") {
    await button(page, "Открыть мои счета").click();
    return page.getByTestId("sheet");
  }
  if (overview === "automation") {
    await button(page, "Профиль и настройки").click();
    await button(page, "Правила и шаблоны операций").click();
    return page.getByTestId("sheet");
  }
  if (overview === "analytics") {
    await page.getByRole("tab", { name: "Аналитика", exact: true }).click();
    return page.getByTestId("screen-analytics");
  }
  await page.getByRole("tab", { name: "План", exact: true }).click();
  const tabs = {
    payments: "Платежи",
    goals: "Цели",
    budgets: "Бюджеты",
    incomes: "Прогноз",
  };
  await page.getByRole("tab", { name: tabs[overview], exact: true }).click();
  return page.getByTestId("screen-plan");
}

type Case = {
  list: ListPageName;
  overview: Overview;
  testId: string;
  label: string;
  names: (state: FinanceState) => string[];
  item?: (list: Locator, name: string) => Locator;
  fullTestId?: string;
  fullItem?: (list: Locator, name: string) => Locator;
};
const byText = (list: Locator, name: string) =>
  list.getByText(name, { exact: true });
const cases: Case[] = [
  {
    list: "paymentAgenda",
    overview: "payments",
    testId: "payment-agenda-list",
    label: "Весь календарь платежей",
    names: (state) => state.recurring.map((entry) => entry.name),
  },
  {
    list: "recurring",
    overview: "payments",
    testId: "recurring-list",
    label: "Все регулярные платежи",
    names: (state) => state.recurring.map((entry) => entry.name),
  },
  {
    list: "goals",
    overview: "goals",
    testId: "goals-list",
    label: "Все цели",
    names: (state) => state.goals.map((entry) => entry.name),
  },
  {
    list: "budgets",
    overview: "budgets",
    testId: "budgets-list",
    label: "Все бюджеты",
    names: (state) => state.categories.map((entry) => entry.name),
  },
  {
    list: "incomes",
    overview: "incomes",
    testId: "income-plans-list",
    label: "Все планы доходов",
    names: (state) => state.plannedIncomes!.map((entry) => entry.name),
  },
  {
    list: "accounts",
    overview: "accounts",
    testId: "accounts-list",
    label: "Все активные счета",
    names: (state) =>
      state.accounts
        .filter((entry) => !entry.archived)
        .map((entry) => entry.name),
  },
  {
    list: "archivedAccounts",
    overview: "accounts",
    testId: "archived-accounts-list",
    label: "Все архивные счета",
    names: (state) =>
      state.accounts
        .filter((entry) => entry.archived)
        .map((entry) => `${entry.name} · архив`),
  },
  {
    list: "negativeAccounts",
    overview: "home",
    testId: "negative-accounts-preview",
    label: "Все счета с отрицательным остатком",
    names: () => numbers.map((number) => `Отрицательный счёт ${number}`),
    item: (list, name) =>
      button(list, `Сверить отрицательный остаток: ${name}`),
    fullTestId: "accounts-list",
    fullItem: byText,
  },
  {
    list: "debts",
    overview: "accounts",
    testId: "debts-list",
    label: "Все долги",
    names: (state) => state.debts!.map((entry) => entry.name),
  },
  {
    list: "creditCards",
    overview: "accounts",
    testId: "credit-cards-list",
    label: "Все кредитные карты",
    names: (state) =>
      state.accounts
        .filter((entry) => entry.kind === "credit")
        .map((entry) => entry.name),
  },
  {
    list: "spendingCategories",
    overview: "analytics",
    testId: "spending-categories-list",
    label: "Все расходы по категориям",
    names: (state) => state.categories.slice(0, 6).map((entry) => entry.name),
  },
  {
    list: "spendingChanges",
    overview: "analytics",
    testId: "spending-changes-list",
    label: "Все изменения по категориям",
    names: (state) => state.categories.slice(0, 6).map((entry) => entry.name),
  },
  {
    list: "categoryRules",
    overview: "automation",
    testId: "category-rules-list",
    label: "Все правила категорий",
    names: () =>
      numbers.map(
        (number) => `${number}. Содержит «Поставщик ${number}» → Дом`,
      ),
  },
  {
    list: "templates",
    overview: "automation",
    testId: "templates-list",
    label: "Все шаблоны",
    names: () => numbers.map((number) => `Шаблон ${number}`),
    item: (list, name) =>
      list.getByLabel(`Название шаблона ${name}`, { exact: true }),
  },
];

test.beforeEach(async ({ page }) => {
  await page.route("https://api.frankfurter.dev/**", (route) => route.abort());
});

for (const entry of cases) {
  test(`${entry.list}: overview contains five records and full page preserves all records and accounting`, async ({
    page,
  }) => {
    const state = fixture();
    await startApp(page, TODAY, state);
    const before = await readState(page);
    const overview = await openOverview(page, entry.overview);
    const preview = overview.getByTestId(entry.testId);
    const names = entry.names(state);
    const item = entry.item ?? byText;
    for (const name of names.slice(0, 5))
      await expect(item(preview, name)).toHaveCount(1);
    for (const name of names.slice(5))
      await expect(item(preview, name)).toHaveCount(0);
    await button(preview, `${entry.label} (${names.length})`).click();
    const fullPage = page.getByTestId(`list-page-${entry.list}`);
    await expect(fullPage).toBeVisible();
    const full = fullPage.getByTestId(entry.fullTestId ?? entry.testId);
    for (const name of names)
      await expect((entry.fullItem ?? item)(full, name)).toHaveCount(1);
    await expect(
      full.getByRole("button", {
        name: `${entry.label} (${names.length})`,
        exact: true,
      }),
    ).toHaveCount(0);
    expect(await readState(page)).toEqual(before);
    await button(page.getByTestId("sheet"), "Назад").click();
    await expect(fullPage).toHaveCount(0);
    await expect(item(preview, names[4])).toHaveCount(1);
    await expect(item(preview, names[5])).toHaveCount(0);
    expect(await readState(page)).toEqual(before);
  });
}

test("the full list loads the fifty-first record without changing the overview or accounting", async ({
  page,
}) => {
  const state = paymentFixture();
  state.recurring = Array.from({ length: 51 }, (_, index) => ({
    ...state.recurring[0],
    id: `payment-${index + 1}`,
    name: paymentName(index + 1),
  }));
  await startApp(page, TODAY, state);
  const before = await readState(page);
  const overview = await openOverview(page, "payments");
  await expect(
    overview
      .getByTestId("recurring-list")
      .getByRole("button", { name: /^Изменить платёж/ }),
  ).toHaveCount(5);
  await button(overview, "Все регулярные платежи (51)").click();
  const full = page.getByTestId("list-page-recurring");
  await expect(
    full.getByRole("button", { name: /^Изменить платёж/ }),
  ).toHaveCount(50);
  await expect(button(full, `Изменить платёж ${paymentName(51)}`)).toHaveCount(
    0,
  );
  await button(full, "Показать ещё (1)").click();
  await expect(
    full.getByRole("button", { name: /^Изменить платёж/ }),
  ).toHaveCount(51);
  await expect(
    button(full, `Изменить платёж ${paymentName(51)}`),
  ).toBeVisible();
  await expect(full.getByRole("button", { name: /^Показать ещё/ })).toHaveCount(
    0,
  );
  expect(await readState(page)).toEqual(before);
  await button(page.getByTestId("sheet"), "Назад").click();
  await expect(
    overview
      .getByTestId("recurring-list")
      .getByRole("button", { name: /^Изменить платёж/ }),
  ).toHaveCount(5);
});

for (const count of [0, 5]) {
  test(`payment previews with ${count} records do not offer a redundant full-list transition`, async ({
    page,
  }) => {
    await startApp(page, TODAY, paymentFixture(count));
    const before = await readState(page);
    const overview = await openOverview(page, "payments");
    await expect(
      overview.getByTestId("payment-agenda-list").getByRole("button"),
    ).toHaveCount(count);
    await expect(
      overview.getByRole("button", { name: /^Все регулярные платежи/ }),
    ).toHaveCount(0);
    await expect(
      overview.getByRole("button", { name: /^Весь календарь платежей/ }),
    ).toHaveCount(0);
    if (count === 0) {
      await expect(
        overview.getByText("На ближайший месяц платежей нет.", { exact: true }),
      ).toBeVisible();
      await expect(
        overview.getByText("Без неожиданных платежей", { exact: true }),
      ).toBeVisible();
    } else {
      await expect(
        overview
          .getByTestId("recurring-list")
          .getByRole("button", { name: /^Изменить платёж/ }),
      ).toHaveCount(5);
    }
    expect(await readState(page)).toEqual(before);
  });
}

test("closed debts remain available after opening the full list", async ({
  page,
}) => {
  const state = fixture();
  state.debts = state.debts!.map((debt) => ({ ...debt, openingAmount: 0 }));
  await startApp(page, TODAY, state);
  const before = await readState(page);
  const overview = await openOverview(page, "accounts");
  await expect(
    overview.getByTestId("debts-list").getByText("Долг 1", { exact: true }),
  ).toHaveCount(0);
  await button(overview, "Закрытые долги: 6").click();
  await expect(
    overview.getByTestId("debts-list").getByText("Долг 5", { exact: true }),
  ).toHaveCount(1);
  await expect(
    overview.getByTestId("debts-list").getByText("Долг 6", { exact: true }),
  ).toHaveCount(0);
  await button(overview, "Все долги (6)").click();
  const full = page.getByTestId("list-page-debts");
  for (const number of numbers)
    await expect(full.getByText(`Долг ${number}`, { exact: true })).toHaveCount(
      1,
    );
  expect(await readState(page)).toEqual(before);
});

test("restoring the sixth archived account returns to the full archive without changing money", async ({
  page,
}) => {
  await startApp(page, TODAY, fixture());
  const before = await readState(page);
  const overview = await openOverview(page, "accounts");
  await button(overview, "Все архивные счета (6)").click();
  const full = page.getByTestId("list-page-archivedAccounts");
  await button(full, "Архивный счёт 6 · архив").click();
  await button(page, "Восстановить счёт").click();
  await expect(full).toBeVisible();
  await expect(button(full, "Архивный счёт 6 · архив")).toHaveCount(0);
  await expect(button(full, "Архивный счёт 5 · архив")).toHaveCount(1);
  await expect
    .poll(
      async () =>
        (await readState(page)).accounts.find(
          (account) => account.id === "archived-6",
        )?.archived,
    )
    .toBe(false);
  const restored = await readState(page);
  expect(restored.transactions).toEqual(before.transactions);
  expect(restored.accounts).toEqual(
    before.accounts.map((account) =>
      account.id === "archived-6" ? { ...account, archived: false } : account,
    ),
  );
  for (const account of before.accounts)
    expect(accountBalance(restored, account.id, TODAY)).toBe(
      accountBalance(before, account.id, TODAY),
    );
});

test("the sixth payment can be edited and paid from its full pages without losing the list", async ({
  page,
}, testInfo) => {
  await startApp(page, TODAY, paymentFixture());
  const before = await readState(page);
  const initialBalance = accountBalance(before, "card", TODAY);
  const overview = await openOverview(page, "payments");
  await expect(overview.getByTestId("payments-summary")).toContainText(
    "600 ₽ за 30 дней",
  );
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    for (const id of ["payment-agenda-list", "recurring-list"]) {
      await overview
        .getByTestId(id)
        .evaluate((element) => element.scrollIntoView({ block: "start" }));
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`${id}-${width}.png`),
        animations: "disabled",
      });
    }
  }
  await button(overview, "Все регулярные платежи (6)").click();
  const fullPlans = page.getByTestId("list-page-recurring");
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await button(
      fullPlans,
      `Изменить платёж ${paymentName(6)}`,
    ).scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`full-recurring-${width}.png`),
      animations: "disabled",
    });
  }
  expect(await readState(page)).toEqual(before);
  await button(fullPlans, `Изменить платёж ${paymentName(6)}`).click();
  const renamed = "Платёж 6: аренда квартиры после переименования";
  await page.getByLabel("Название платежа", { exact: true }).fill(renamed);
  await button(page, "Сохранить платёж").click();
  await expect(fullPlans).toBeVisible();
  await expect(button(fullPlans, `Изменить платёж ${renamed}`)).toBeVisible();
  await expect
    .poll(async () => (await readState(page)).recurring[5].name)
    .toBe(renamed);
  const edited = await readState(page);
  expect(edited.transactions).toEqual(before.transactions);
  expect(accountBalance(edited, "card", TODAY)).toBe(initialBalance);
  await button(page.getByTestId("sheet"), "Назад").click();
  await expect(overview.getByTestId("payments-summary")).toContainText(
    "600 ₽ за 30 дней",
  );
  await button(overview, "Весь календарь платежей (6)").click();
  const calendar = page.getByTestId("list-page-paymentAgenda");
  await calendar
    .getByRole("button", { name: new RegExp(`^${renamed}, 28 октября`) })
    .click();
  await button(page, "Я оплатил — записать расход").click();
  await expect(calendar).toBeVisible();
  await expect(
    calendar.getByRole("button", {
      name: new RegExp(`^${renamed}, 28 октября, Оплачен`),
    }),
  ).toBeVisible();
  await expect
    .poll(async () => (await readState(page)).transactions.length)
    .toBe(1);
  const paid = await readState(page);
  expect(paid.transactions[0].recurringId).toBe("payment-6");
  expect(paid.transactions[0].amount).toBe(10_000);
  expect(accountBalance(paid, "card", TODAY)).toBe(initialBalance - 10_000);
  await button(page.getByTestId("sheet"), "Назад").click();
  await expect(overview.getByTestId("payments-summary")).toContainText(
    "500 ₽ за 30 дней",
  );
  await page.reload();
  await openOverview(page, "payments");
  await button(page, "Весь календарь платежей (6)").click();
  await expect(
    calendar.getByRole("button", {
      name: new RegExp(`^${renamed}, 28 октября, Оплачен`),
    }),
  ).toHaveCount(1);
  expect((await readState(page)).transactions).toEqual(paid.transactions);
});

test("the full category breakdown preserves the selected historical month and its total", async ({
  page,
}, testInfo) => {
  await startApp(page, TODAY, fixture());
  const before = await readState(page);
  const overview = await openOverview(page, "analytics");
  await button(overview, "Предыдущий месяц").click();
  await expect(
    overview.getByText("сентябрь 2026", { exact: true }),
  ).toHaveCount(1);
  const preview = overview.getByTestId("spending-categories-list");
  await expect(preview.getByText("10 ₽", { exact: true })).toHaveCount(5);
  await button(preview, "Все расходы по категориям (6)").click();
  const full = page.getByTestId("list-page-spendingCategories");
  await expect(full.getByText(/сентябрь 2026/i)).toBeVisible();
  await expect(full.getByText("60 ₽", { exact: true })).toBeVisible();
  await expect(
    full
      .getByTestId("spending-categories-list")
      .getByText("10 ₽", { exact: true }),
  ).toHaveCount(6);
  await expect(full.getByText("600 ₽", { exact: true })).toHaveCount(0);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await full.getByText(/сентябрь 2026/i).scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await full.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`full-spending-categories-${width}.png`),
      animations: "disabled",
    });
  }
  expect(await readState(page)).toEqual(before);
  await button(page.getByTestId("sheet"), "Назад").click();
  await expect(full).toHaveCount(0);
  await expect(
    overview.getByText("сентябрь 2026", { exact: true }),
  ).toHaveCount(1);
  await expect(preview.getByText("10 ₽", { exact: true })).toHaveCount(5);
  expect(await readState(page)).toEqual(before);
});

test("template drafts survive a cancelled list transition and saved names no longer block navigation", async ({
  page,
}, testInfo) => {
  await startApp(page, TODAY, fixture());
  const before = await readState(page);
  await openOverview(page, "automation");
  const first = page.getByLabel("Название шаблона Шаблон 1", { exact: true });
  const second = page.getByLabel("Название шаблона Шаблон 2", { exact: true });
  await first.fill("Первый новый шаблон");
  await second.fill("Второй новый шаблон");
  await button(page, "Все шаблоны (6)").click();
  const confirmation = page.getByRole("heading", {
    name: "Сбросить изменения?",
    exact: true,
  });
  await expect(confirmation).toBeVisible();
  await expect(page.getByTestId("list-page-templates")).toHaveCount(0);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(button(page, "Продолжить ввод")).toBeVisible();
    await expect(button(page, "Сбросить и закрыть")).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`automation-draft-confirmation-${width}.png`),
      animations: "disabled",
    });
  }
  await button(page, "Продолжить ввод").click();
  await expect(first).toHaveValue("Первый новый шаблон");
  await expect(second).toHaveValue("Второй новый шаблон");
  expect(await readState(page)).toEqual(before);

  await button(page, "Переименовать «Шаблон 1»").click();
  await button(page, "Все шаблоны (6)").click();
  await expect(confirmation).toBeVisible();
  await button(page, "Продолжить ввод").click();
  await expect(second).toHaveValue("Второй новый шаблон");
  await button(page, "Переименовать «Шаблон 2»").click();
  await button(page, "Все шаблоны (6)").click();
  await expect(page.getByTestId("list-page-templates")).toBeVisible();
  await expect(confirmation).toHaveCount(0);
  await expect(
    page.getByLabel("Название шаблона Первый новый шаблон", { exact: true }),
  ).toHaveValue("Первый новый шаблон");
  await expect(
    page.getByLabel("Название шаблона Второй новый шаблон", { exact: true }),
  ).toHaveValue("Второй новый шаблон");
  await expect
    .poll(async () =>
      (await readState(page))
        .transactionTemplates!.slice(0, 2)
        .map((template) => template.name),
    )
    .toEqual(["Первый новый шаблон", "Второй новый шаблон"]);
  expect((await readState(page)).transactions).toEqual(before.transactions);
});

for (const destination of [
  { list: "categoryRules", label: "Все правила категорий (6)" },
  { list: "templates", label: "Все шаблоны (6)" },
]) {
  test(`rule draft is protected before opening ${destination.list} and is discarded only explicitly`, async ({
    page,
  }) => {
    await startApp(page, TODAY, fixture());
    const before = await readState(page);
    await openOverview(page, "automation");
    await button(page, "Добавить правило").click();
    const pattern = page.getByLabel("Условие правила", { exact: true });
    await pattern.fill("Новое условие");
    await button(page, destination.label).click();
    await expect(
      page.getByRole("heading", { name: "Сбросить изменения?", exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId(`list-page-${destination.list}`)).toHaveCount(
      0,
    );
    await button(page, "Продолжить ввод").click();
    await expect(pattern).toHaveValue("Новое условие");
    expect(await readState(page)).toEqual(before);
    await button(page, destination.label).click();
    await button(page, "Сбросить и закрыть").click();
    await expect(
      page.getByTestId(`list-page-${destination.list}`),
    ).toBeVisible();
    await button(page.getByTestId("sheet"), "Назад").click();
    await expect(pattern).toHaveCount(0);
    await button(page, "Добавить правило").click();
    await expect(pattern).toHaveValue("");
    expect(await readState(page)).toEqual(before);
  });
}

test("the sixth template also guards Back and Close in the full list", async ({
  page,
}) => {
  await startApp(page, TODAY, fixture());
  const before = await readState(page);
  await openOverview(page, "automation");
  await button(page, "Все шаблоны (6)").click();
  const field = page.getByLabel("Название шаблона Шаблон 6", { exact: true });
  await field.fill("Несохранённое шестое имя");
  await button(page.getByTestId("sheet"), "Назад").click();
  await expect(button(page, "Продолжить ввод")).toBeVisible();
  await button(page, "Продолжить ввод").click();
  await expect(field).toHaveValue("Несохранённое шестое имя");
  await button(page.getByTestId("sheet"), "Закрыть").click();
  await expect(button(page, "Продолжить ввод")).toBeVisible();
  await button(page, "Сбросить и закрыть").click();
  await expect(page.getByTestId("sheet")).toHaveCount(0);
  expect(await readState(page)).toEqual(before);
});
