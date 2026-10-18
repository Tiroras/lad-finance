import { expect, test, type Page } from "@playwright/test";
import { bundleBrowserModule } from "./browserBundle";
import { pickDate } from "./helpers";
import type * as Fixture from "../helpers/t06DebtCases";

type Browser = typeof globalThis & { __browserTestModule: typeof Fixture };
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
let bundle: string;
test.beforeAll(async () => {
  bundle = await bundleBrowserModule("tests/helpers/t06DebtCases.ts");
});
async function start(page: Page, kind: "credit" | "debt") {
  await page.route("https://api.frankfurter.dev/**", (route) => route.abort());
  await page.clock.install({ time: new Date("2026-10-19T12:00:00+04:00") });
  await page.addInitScript({
    content: `${bundle}\n;globalThis.__browserTestModule = __browserTestModule; __browserTestModule.installDebtUi('${kind}');`,
  });
  await page.goto("/");
  await expect(button(page, "Добавить операцию")).toBeVisible();
  await button(page, "Открыть мои счета").click();
}
const read = (page: Page) =>
  page.evaluate(() => (globalThis as Browser).__browserTestModule.readDebtUi());
async function openIssue(page: Page) {
  await button(page, "Показать движения: Долг Т06").click();
  await page.getByRole("button", { name: /1 октября · Выдача 10/ }).click();
  await expect(
    page.getByLabel("Сумма движения долга", { exact: true }),
  ).toBeVisible();
}

test("T06 credit and debt calculations execute in Chromium", async ({
  page,
}, info) => {
  await page.clock.install({ time: new Date("2026-10-19T12:00:00+04:00") });
  await page.route("https://lad-t06-debt.invalid/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>T06</title>",
    }),
  );
  await page.goto("https://lad-t06-debt.invalid/");
  await page.addScriptTag({ content: bundle });
  const outcomes = await page.evaluate(async () => {
    const outcomes = [];
    for (const entry of (globalThis as Browser).__browserTestModule
      .t06DebtCases) {
      try {
        await entry.run();
        outcomes.push({ name: entry.name, passed: true, error: "" });
      } catch (error) {
        outcomes.push({
          name: entry.name,
          passed: false,
          error:
            error instanceof Error
              ? error.stack || error.message
              : String(error),
        });
      }
    }
    return outcomes;
  });
  await info.attach("browser-case-results", {
    body: JSON.stringify(outcomes, null, 2),
    contentType: "application/json",
  });
  expect(outcomes.filter((entry) => !entry.passed)).toEqual([]);
});

test("T06 credit: a rename preserves unknown freshness and repayment baseline", async ({
  page,
}) => {
  await start(page, "credit");
  await expect(
    page.getByText(
      "Дата подтверждения выписки неизвестна; проверьте её актуальность.",
    ),
  ).toBeVisible();
  await button(page, "Условия карты: Карта Т06").click();
  await expect(
    page.getByLabel("Обязательный платёж по карте", { exact: true }),
  ).toHaveValue("800");
  await page
    .getByLabel("Название счёта", { exact: true })
    .fill("Переименованная карта");
  await button(page, "Сохранить счёт").click();
  await expect
    .poll(
      async () =>
        (await read(page)).accounts.find((account) => account.id === "credit")
          ?.name,
    )
    .toBe("Переименованная карта");
  const card = (await read(page)).accounts.find(
    (account) => account.id === "credit",
  )!;
  expect(card.paymentDueAmount).toBe(100_000);
  expect(card.paymentDueBaselineIds).toEqual([]);
  expect(card.creditTermsConfirmedOn).toBeUndefined();
  await page.reload();
  await button(page, "Открыть мои счета").click();
  await button(page, "Условия карты: Переименованная карта").click();
  await expect(
    page.getByLabel("Обязательный платёж по карте", { exact: true }),
  ).toHaveValue("800");
});

test("T06 credit: same statement amount can be confirmed explicitly and survives reload", async ({
  page,
}, info) => {
  await start(page, "credit");
  await button(page, "Условия карты: Карта Т06").click();
  await page
    .getByLabel("Обязательный платёж по карте", { exact: true })
    .fill("1000");
  await pickDate(page, "Дата напоминания об условиях карты", "2026-10-22");
  await button(page, "Подтвердить условия выписки").click();
  await expect
    .poll(
      async () =>
        (await read(page)).accounts.find((account) => account.id === "credit")
          ?.creditTermsConfirmedOn,
    )
    .toBe("2026-10-19");
  const state = await read(page);
  expect(state.version).toBe(7);
  expect(
    state.accounts.find((account) => account.id === "credit"),
  ).toMatchObject({
    paymentDueAmount: 100_000,
    paymentDueBaselineIds: ["old-repayment"],
    creditTermsReminderDate: "2026-10-22",
  });
  expect(state.transactions).toHaveLength(1);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await button(page, "Подтвердить условия выписки").scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await page.screenshot({
      path: info.outputPath(`credit-terms-${width}.png`),
      animations: "disabled",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.reload();
  await button(page, "Открыть мои счета").click();
  await button(page, "Условия карты: Карта Т06").click();
  await expect(
    page.getByLabel("Обязательный платёж по карте", { exact: true }),
  ).toHaveValue("1 000");
  await expect(
    page.getByLabel("Дата напоминания об условиях карты", { exact: true }),
  ).toHaveValue("22.10.2026");
});

test("T06 credit: saving a reminder leaves the statement unconfirmed and rejects past dates", async ({
  page,
}) => {
  await start(page, "credit");
  const before = await read(page);
  await button(page, "Условия карты: Карта Т06").click();
  await pickDate(page, "Дата напоминания об условиях карты", "2026-10-18");
  await button(page, "Сохранить напоминание о выписке").click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Выберите дату напоминания не раньше сегодняшней." }),
  ).toBeVisible();
  expect((await read(page)).accounts).toEqual(before.accounts);
  await pickDate(page, "Дата напоминания об условиях карты", "2026-10-21");
  await button(page, "Сохранить напоминание о выписке").click();
  await expect
    .poll(
      async () =>
        (await read(page)).accounts.find((account) => account.id === "credit")
          ?.creditTermsReminderDate,
    )
    .toBe("2026-10-21");
  const next = await read(page);
  expect(next.transactions).toEqual(before.transactions);
  expect(
    next.accounts.find((account) => account.id === "credit")
      ?.creditTermsConfirmedOn,
  ).toBeUndefined();
  expect(
    next.accounts.find((account) => account.id === "credit")?.paymentDueAmount,
  ).toBe(100_000);
});

test("T06 debt: correction rejects an uncovered repayment then atomically preserves history identity", async ({
  page,
}, info) => {
  await start(page, "debt");
  const before = await read(page);
  await openIssue(page);
  await page.getByLabel("Сумма движения долга", { exact: true }).fill("5000");
  await button(page, "Сохранить движение долга").click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Возврат превышает долг" }),
  ).toBeVisible();
  expect((await read(page)).transactions).toEqual(before.transactions);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await button(page, "Сохранить движение долга").scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await page.screenshot({
      path: info.outputPath(`debt-correction-${width}.png`),
      animations: "disabled",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByLabel("Сумма движения долга", { exact: true }).fill("7000");
  await page
    .getByLabel("Описание движения долга", { exact: true })
    .fill("Сверенная выдача");
  await button(page, "Сохранить движение долга").click();
  await expect
    .poll(
      async () =>
        (await read(page)).transactions.find((row) => row.id === "issue")
          ?.amount,
    )
    .toBe(700_000);
  const changed = await read(page);
  expect(changed.transactions.map((row) => row.id)).toEqual(["repay", "issue"]);
  expect(changed.transactions[1]).toMatchObject({
    id: "issue",
    debtId: "debt",
    debtAction: "issue",
    type: "income",
    title: "Сверенная выдача",
    importKey: "t06-debt-import",
    status: "posted",
  });
  expect(changed.transactions[0]).toEqual(before.transactions[0]);
  await page.reload();
  await expect(button(page, "Добавить операцию")).toBeVisible();
  expect((await read(page)).transactions).toEqual(changed.transactions);
});

test("T06 debt: moving an issue beyond its repayment fails and metadata preserves historical valuation", async ({
  page,
}) => {
  await start(page, "debt");
  const before = await read(page);
  await openIssue(page);
  await pickDate(page, "Дата движения долга", "2026-10-15");
  await button(page, "Сохранить движение долга").click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Возврат превышает долг" }),
  ).toBeVisible();
  expect((await read(page)).transactions).toEqual(before.transactions);
  await pickDate(page, "Дата движения долга", "2026-10-01");
  await page
    .getByLabel("Примечание к движению долга", { exact: true })
    .fill("Уточнено по переводу");
  await button(page, "Сохранить движение долга").click();
  await expect
    .poll(
      async () =>
        (await read(page)).transactions.find((row) => row.id === "issue")?.note,
    )
    .toBe("Уточнено по переводу");
  expect(
    (await read(page)).transactions.find((row) => row.id === "issue")
      ?.baseAmount,
  ).toBe(999_999);
});
