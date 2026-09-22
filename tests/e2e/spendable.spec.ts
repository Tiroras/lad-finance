import { startApp, readState } from "./helpers";
import { expect, test } from "@playwright/test";
import { money } from "../../src/domain/currency";
import { createInitialState } from "../../src/domain/seed";

test("income-based allowance explains the later bill limit and survives a reload", async ({
  page,
}) => {
  const today = "2026-09-10";
  const state = createInitialState(false, today);
  state.accounts[0].openingBalance = 100_000;
  state.plannedIncomes = [
    {
      id: "small",
      name: "Небольшой доход",
      amount: 1_000,
      date: "2026-09-11",
      repeat: "monthly",
      accountId: "card",
    },
    {
      id: "salary",
      name: "Зарплата",
      amount: 200_000,
      date: "2026-09-20",
      repeat: "monthly",
      accountId: "card",
    },
  ];
  state.recurring = [
    {
      id: "rent",
      name: "Аренда",
      amount: 95_000,
      day: 15,
      kind: "bill",
      active: true,
      category: "home",
      accountId: "card",
      startsOn: today,
      icon: "home-outline",
      color: "#EEEEEE",
    },
  ];
  await startApp(page, today, state);
  await expect(
    page.getByText("до 11 сентября · Небольшой доход", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(money(6_000), { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Как рассчитана доступная сумма",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Дополнительно оставляем на дальнейший план", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/Сумму ограничивает остаток на 15 сентября/),
  ).toBeVisible();
  await expect(
    page.getByText(/Дополнительно проверены 30 дней до 9 октября/),
  ).toBeVisible();
  const saved = await readState(page);
  expect(saved.accounts).toEqual(state.accounts);
  expect(saved.transactions).toEqual([]);
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page.reload();
  await expect(
    page.getByText("до 11 сентября · Небольшой доход", { exact: true }),
  ).toBeVisible();
});
