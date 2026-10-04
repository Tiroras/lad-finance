import { expect, test, type Route } from "@playwright/test";
import { createInitialState } from "../../src/domain/seed";
import {
  saveDebt,
  saveRecurring,
  saveTransaction,
} from "../../src/domain/actions";
import { MAX_BACKUP_BYTES } from "../../src/domain/backup";
import { readState, startApp } from "./helpers";

const TODAY = "2026-09-10";

test("automatic rates resume after cancelling the pending update and re-enabling automatic mode", async ({
  page,
}) => {
  let requests = 0;
  let pending: Route | undefined;
  await page.route("https://api.frankfurter.dev/**", async (route) => {
    requests++;
    if (requests === 1) {
      pending = route;
      return;
    }
    await route.fulfill({
      json: [{ base: "USD", quote: "RUB", rate: 90, date: TODAY }],
    });
  });
  const initial = createInitialState(false, TODAY);
  await startApp(page, TODAY, initial);
  await expect.poll(() => requests).toBe(1);
  await page
    .getByRole("button", { name: "Профиль и настройки", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Валюты и курсы", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Загружаем курсы…" }),
  ).toBeDisabled();
  await page.getByRole("tab", { name: "По запросу", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Обновить курсы сейчас" }),
  ).toBeEnabled();
  await page.getByRole("tab", { name: "Автоматически", exact: true }).click();
  await expect
    .poll(async () => (await readState(page)).settings.exchange?.fetchedOn)
    .toBe(TODAY);
  expect(requests).toBe(2);
  expect((await readState(page)).transactions).toEqual(initial.transactions);
  await pending?.abort().catch(() => {});
});

test("payment linking excludes debt principal and records no second expense", async ({
  page,
}) => {
  let initial = createInitialState(false, TODAY);
  initial.settings.exchange = { automatic: false, rates: {} };
  initial.accounts[0].openingBalance = 100_000;
  initial = saveDebt(
    initial,
    {
      name: "Тестовый долг",
      direction: "lent",
      accountId: "card",
      amount: 5_000,
      date: TODAY,
      recordTransaction: true,
    },
    TODAY,
  );
  initial = saveTransaction(
    initial,
    {
      title: "Оплаченный интернет",
      amount: 5_000,
      date: TODAY,
      type: "expense",
      category: "home",
      accountId: "card",
    },
    TODAY,
  );
  initial = saveRecurring(
    initial,
    {
      name: "Интернет",
      amount: 5_000,
      day: 10,
      kind: "bill",
      category: "home",
      accountId: "card",
      startsOn: TODAY,
    },
    TODAY,
  );
  await startApp(page, TODAY, initial);
  await page.getByRole("tab", { name: "План", exact: true }).click();
  await page.getByRole("tab", { name: "Платежи", exact: true }).click();
  await page.getByRole("button", { name: /^Интернет,.*Сегодня/ }).click();
  const links = page.getByRole("button", { name: /^Связать:/ });
  await expect(links).toHaveCount(1);
  await expect(links).toHaveText(/Оплаченный интернет/);
  await links.click();
  await expect
    .poll(
      async () =>
        (await readState(page)).transactions.find(
          (t) => t.title === "Оплаченный интернет",
        )?.recurringId,
    )
    .toBe(initial.recurring[0].id);
  const saved = await readState(page);
  expect(saved.transactions).toHaveLength(initial.transactions.length);
  expect(saved.transactions.find((t) => t.debtId)?.recurringId).toBeUndefined();
});

test("an edit exceeding the snapshot limit keeps the previous ledger and the form draft", async ({
  page,
}) => {
  const initial = createInitialState(false, TODAY);
  initial.settings.exchange = { automatic: false, rates: {} };
  initial.transactions = Array.from({ length: 13000 }, (_, index) => ({
    id: `audit-${index}`,
    title: "Покупка",
    type: "expense" as const,
    amount: 100,
    baseAmount: 100,
    date: TODAY,
    category: "other",
    accountId: "card",
    note: "a".repeat(100),
  }));
  let remaining =
    MAX_BACKUP_BYTES - 300 - Buffer.byteLength(JSON.stringify(initial), "utf8");
  for (const transaction of initial.transactions) {
    const extra = Math.min(400, remaining);
    transaction.note += "a".repeat(extra);
    remaining -= extra;
    if (!remaining) break;
  }
  expect(remaining).toBe(0);
  await startApp(page, TODAY, initial);
  await page
    .getByRole("button", { name: "Добавить операцию", exact: true })
    .click();
  await page
    .getByLabel("Название операции", { exact: true })
    .fill("Новая покупка");
  await page.getByLabel("Сумма операции", { exact: true }).fill("1");
  await page
    .getByRole("button", { name: /дополнительные поля операции$/i })
    .click();
  await page.getByLabel("Заметка", { exact: true }).fill("a".repeat(500));
  await page
    .getByRole("button", { name: "Добавить операцию", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Учёт превышает 5 МБ" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Название операции", { exact: true }),
  ).toHaveValue("Новая покупка");
  expect((await readState(page)).transactions).toHaveLength(13000);
  await page.reload();
  await expect(page.getByText("Больше ясности.")).toBeVisible();
  expect((await readState(page)).transactions).toHaveLength(13000);
});

test("an oversized legacy Unicode ledger can shrink gradually and reopen", async ({
  page,
}) => {
  const initial = createInitialState(false, TODAY);
  initial.settings.exchange = { automatic: false, rates: {} };
  initial.transactions = Array.from({ length: 9000 }, (_, index) => ({
    id: `legacy-${index}`,
    title: `Старая запись ${index}`,
    type: "expense" as const,
    amount: 100,
    baseAmount: 100,
    date: TODAY,
    category: "other",
    accountId: "card",
    note: "Я".repeat(200),
  }));
  expect(Buffer.byteLength(JSON.stringify(initial), "utf8")).toBeGreaterThan(
    MAX_BACKUP_BYTES,
  );
  await startApp(page, TODAY, initial);
  await page
    .getByRole("button", { name: /^Старая запись 0,.*открыть операцию/ })
    .first()
    .click();
  await page.getByLabel("Заметка", { exact: true }).fill("Я".repeat(199));
  await page
    .getByRole("button", { name: "Сохранить изменения", exact: true })
    .click();
  await expect
    .poll(async () => (await readState(page)).transactions[0].note)
    .toBe("Я".repeat(199));
  await page.reload();
  await page
    .getByRole("button", { name: /^Старая запись 0,.*открыть операцию/ })
    .first()
    .click();
  await expect(page.getByLabel("Заметка", { exact: true })).toHaveValue(
    "Я".repeat(199),
  );
  await page.getByLabel("Заметка", { exact: true }).fill("Я".repeat(200));
  await page
    .getByRole("button", { name: "Сохранить изменения", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Учёт превышает 5 МБ" }),
  ).toBeVisible();
  expect((await readState(page)).transactions[0].note).toBe("Я".repeat(199));
});
