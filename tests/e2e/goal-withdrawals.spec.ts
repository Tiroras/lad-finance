import { expect, test, type Page } from "@playwright/test";
import { accountBalance } from "../../src/domain/accountBalances";
import { goalSaved } from "../../src/domain/goals";
import { createInitialState } from "../../src/domain/seed";
import {
  archiveAccount,
  fundGoal,
  saveAccount,
  saveTransaction,
} from "../../src/domain/actions";
import { readState, startApp } from "./helpers";

const TODAY = "2026-10-26";
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const field = (page: Page, name: string) =>
  page.getByRole("textbox", { name, exact: true });
function fixture() {
  const state = createInitialState(false, TODAY);
  state.settings.exchange = { automatic: false, rates: {} };
  state.accounts[0].openingBalance = 100_000;
  state.accounts[2].openingBalance = 100_000;
  state.goals = [
    {
      id: "trip",
      name: "Поездка к морю и в горы",
      currency: "RUB" as const,
      target: 100_000,
      initialSaved: 60_000,
      monthly: 10_000,
      icon: "airplane-outline" as const,
      color: "#FFFFFF",
    },
  ];
  return state;
}
async function openGoals(page: Page) {
  await page.getByRole("tab", { name: "План", exact: true }).click();
  await page.getByRole("tab", { name: "Цели", exact: true }).click();
}
async function openWithdrawal(page: Page) {
  await openGoals(page);
  await button(page, "Вывести из цели").click();
  await expect(field(page, "Сумма вывода из цели")).toBeVisible();
}

test("goal withdrawal rejects excess, records a partial transfer and survives reload at all widths", async ({
  page,
}, info) => {
  await startApp(page, TODAY, fixture());
  const before = await readState(page);
  await openWithdrawal(page);
  await field(page, "Сумма вывода из цели").fill("601");
  await button(page, "Записать вывод из цели").click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Нельзя вывести больше" }),
  ).toBeVisible();
  expect((await readState(page)).transactions).toEqual(before.transactions);
  await field(page, "Сумма вывода из цели").fill("250");
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await field(page, "Сумма вывода из цели").scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await page.screenshot({
      path: info.outputPath(`goal-withdrawal-${width}.png`),
      animations: "disabled",
    });
    expect(
      await page
        .getByTestId("sheet-scroll")
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
  }
  await button(page, "Записать вывод из цели").click();
  await expect
    .poll(async () => (await readState(page)).transactions.length)
    .toBe(1);
  const next = await readState(page);
  expect(goalSaved(next, next.goals[0], TODAY)).toBe(35_000);
  expect(accountBalance(next, "card", TODAY)).toBe(125_000);
  expect(accountBalance(next, "savings", TODAY)).toBe(75_000);
  expect(next.transactions[0]).toMatchObject({
    type: "transfer",
    amount: 25_000,
  });
  await page.reload();
  await expect(button(page, "Добавить операцию")).toBeVisible();
  expect((await readState(page)).goalReleases).toEqual(next.goalReleases);
  expect((await readState(page)).transactions).toEqual(next.transactions);
});

test("completed goals allow a full withdrawal and the history can correct or undo it", async ({
  page,
}) => {
  const state = fixture();
  state.goals[0].target = 60_000;
  await startApp(page, TODAY, state);
  await openWithdrawal(page);
  await button(page, "Вывести всю сумму").click();
  await expect(field(page, "Сумма вывода из цели")).toHaveValue("600");
  await button(page, "Записать вывод из цели").click();
  await expect
    .poll(async () => (await readState(page)).transactions.length)
    .toBe(1);
  expect(goalSaved(await readState(page), state.goals[0], TODAY)).toBe(0);
  await expect(button(page, "Вывести из цели")).toHaveCount(0);
  await page.getByRole("tab", { name: "Операции", exact: true }).click();
  await page
    .getByText("Из цели: Поездка к морю и в горы", { exact: true })
    .click();
  await expect(page.getByText(/Это вывод из цели/)).toBeVisible();
  await field(page, "Сумма операции").fill("400");
  await button(page, "Сохранить изменения").click();
  await expect
    .poll(async () => (await readState(page)).goalReleases?.[0].amount)
    .toBe(40_000);
  await page
    .getByText("Из цели: Поездка к морю и в горы", { exact: true })
    .click();
  await button(page, "Удалить операцию").click();
  await button(page, "Да, удалить").click();
  await expect
    .poll(async () => (await readState(page)).transactions.length)
    .toBe(0);
  const restored = await readState(page);
  expect(goalSaved(restored, restored.goals[0], TODAY)).toBe(60_000);
  expect(accountBalance(restored, "savings", TODAY)).toBe(100_000);
});

test("withdrawal to another currency uses the entered actual credit", async ({
  page,
}) => {
  const state = fixture();
  state.accounts[0].currency = "USD";
  state.accounts[0].name = "Долларовый счёт";
  state.settings.exchange!.rates = {
    USD: { value: 9000000000, date: TODAY, source: "manual" },
  };
  await startApp(page, TODAY, state);
  await openWithdrawal(page);
  await button(page, "Долларовый счёт · USD").click();
  await field(page, "Сумма вывода из цели").fill("250");
  await field(page, "Зачислено из цели").fill("2,50");
  await button(page, "Записать вывод из цели").click();
  await expect
    .poll(async () => (await readState(page)).transactions.length)
    .toBe(1);
  const next = await readState(page);
  expect(next.transactions[0]).toMatchObject({
    amount: 25_000,
    toAmount: 250,
    accountId: "savings",
    toAccountId: "card",
  });
  expect(goalSaved(next, next.goals[0], TODAY)).toBe(35_000);
  expect(accountBalance(next, "card", TODAY)).toBe(100_250);
});

test("scenarios can be created and edited after a withdrawal and survive reload without changing the ledger", async ({
  page,
}) => {
  await startApp(page, TODAY, fixture());
  await openWithdrawal(page);
  await field(page, "Сумма вывода из цели").fill("250");
  await button(page, "Записать вывод из цели").click();
  await expect
    .poll(async () => (await readState(page)).transactions.length)
    .toBe(1);
  const before = await readState(page);
  await page.getByRole("tab", { name: "Обзор", exact: true }).click();
  await button(page, "Прогноз по дням").click();
  await button(page, "Мои сценарии").click();
  await button(page, "Создать сценарий").click();
  await field(page, "Название сценария").fill("После вывода");
  await button(page, "Добавить событие в сценарий").click();
  await field(page, "Сумма события 1").fill("100");
  await page
    .getByText("Счёт события 1", { exact: true })
    .locator("..")
    .getByRole("button", { name: "Основная карта", exact: true })
    .click();
  await button(page, "Сохранить сценарий").click();
  await expect
    .poll(async () => (await readState(page)).scenarios?.length)
    .toBe(1);
  await button(page, "Открыть сценарий: После вывода").click();
  await page
    .getByRole("switch", { name: "Учитывать событие 1: Покупка", exact: true })
    .uncheck();
  await button(page, "Сохранить сценарий").click();
  await expect
    .poll(async () => (await readState(page)).scenarios?.[0].events[0].enabled)
    .toBe(false);
  const saved = await readState(page);
  expect(saved.version).toBe(9);
  expect(saved.goalReleases).toEqual(before.goalReleases);
  expect(saved.transactions).toEqual(before.transactions);
  expect(saved.accounts).toEqual(before.accounts);
  expect(saved.goals).toEqual(before.goals);
  await page.reload();
  await expect(button(page, "Добавить операцию")).toBeVisible();
  expect(await readState(page)).toEqual(saved);
});

test("choosing the destination as transfer source swaps accounts and permits saving without the false empty state", async ({
  page,
}, info) => {
  await startApp(page, TODAY, fixture());
  await button(page, "Добавить операцию").click();
  await page.getByRole("tab", { name: "Перевод", exact: true }).click();
  await field(page, "Сумма операции").fill("100");
  await field(page, "Название операции").fill("Обратный перевод");
  const source = page.getByText("Откуда", { exact: true }).locator("..");
  const target = page.getByText("Куда", { exact: true }).locator("..");
  await source.getByRole("button", { name: "Накопления", exact: true }).click();
  await expect(
    target.getByRole("button", { name: "Основная карта", exact: true }),
  ).toBeVisible();
  await expect(
    target.getByRole("button", { name: "Накопления", exact: true }),
  ).toHaveCount(0);
  await expect(button(page, "Создать или восстановить счёт")).toHaveCount(0);
  await expect(page.getByText(/Прежний счёт недоступен/)).toHaveCount(0);
  await expect(button(page, "Записать перевод")).toBeEnabled();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await source.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await page.screenshot({
      path: info.outputPath(`transfer-swap-${width}.png`),
      animations: "disabled",
    });
    expect(
      await page
        .getByTestId("sheet-scroll")
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
  }
  await button(page, "Записать перевод").click();
  await expect
    .poll(async () => (await readState(page)).transactions.length)
    .toBe(1);
  expect((await readState(page)).transactions[0]).toMatchObject({
    accountId: "savings",
    toAccountId: "card",
    amount: 10_000,
  });
});

test("foreign transfer source swap clears the old credit and keeps the name and debit", async ({
  page,
}) => {
  const state = fixture();
  state.goals = [];
  state.accounts[2].currency = "USD";
  state.settings.exchange!.rates = {
    USD: { value: 9000000000, date: TODAY, source: "manual" },
  };
  await startApp(page, TODAY, state);
  await button(page, "Добавить операцию").click();
  await page.getByRole("tab", { name: "Перевод", exact: true }).click();
  await field(page, "Сумма операции").fill("90");
  await field(page, "Название операции").fill("Обмен");
  await field(page, "Сумма зачисления").fill("2");
  await page
    .getByText("Откуда", { exact: true })
    .locator("..")
    .getByRole("button", { name: "Накопления · USD", exact: true })
    .click();
  await expect(field(page, "Сумма зачисления")).toHaveValue("8 100");
  await expect(field(page, "Сумма операции")).toHaveValue("90");
  await expect(field(page, "Название операции")).toHaveValue("Обмен");
  await expect(button(page, "Создать или восстановить счёт")).toHaveCount(0);
  await button(page, "Записать перевод").click();
  await expect
    .poll(async () => (await readState(page)).transactions.length)
    .toBe(1);
  expect((await readState(page)).transactions[0]).toMatchObject({
    accountId: "savings",
    toAccountId: "card",
    amount: 9000,
    toAmount: 810000,
  });
});

test("a goal contribution to an archived account keeps the recovery action instead of pointing to a hidden destination picker", async ({
  page,
}) => {
  let state = fundGoal(
    fixture(),
    { goalId: "trip", accountId: "card", amount: 10_000 },
    TODAY,
  );
  state = saveAccount(
    state,
    {
      name: "Вторые накопления",
      kind: "savings",
      balance: 0,
      currency: "RUB",
    },
    TODAY,
  );
  const second = state.accounts.find(
    (account) => account.name === "Вторые накопления",
  )!;
  state = saveTransaction(
    state,
    {
      type: "transfer",
      title: "Перенос накоплений",
      amount: 110_000,
      date: TODAY,
      category: "other",
      accountId: "savings",
      toAccountId: second.id,
    },
    TODAY,
  );
  state = archiveAccount(state, "savings", TODAY);
  await startApp(page, TODAY, state);
  await page.getByRole("tab", { name: "Операции", exact: true }).click();
  await page.getByText("Поездка к морю и в горы", { exact: true }).click();
  await expect(button(page, "Создать или восстановить счёт")).toBeVisible();
  await expect(
    page.getByText("Выберите другой активный счёт в поле «Куда»."),
  ).toHaveCount(0);
  await expect(button(page, "Сохранить изменения")).toBeDisabled();
  await button(page, "Создать или восстановить счёт").click();
  await expect(
    page.getByRole("heading", { name: "Мои счета", exact: true }),
  ).toBeVisible();
  expect((await readState(page)).transactions).toEqual(state.transactions);
});
