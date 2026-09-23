import { expect, test, type Locator, type Page } from "@playwright/test";
import { createInitialState } from "../../src/domain/seed";
import { RATE_SCALE } from "../../src/domain/currency";
import { startApp, readState, pickDate } from "./helpers";

const TODAY = "2026-09-10";
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const caret = (input: Locator) =>
  input.evaluate((element: HTMLInputElement) => ({
    start: element.selectionStart,
    end: element.selectionEnd,
  }));
const fixture = () => {
  const state = createInitialState(false, TODAY);
  state.settings.exchange = { automatic: false, rates: {} };
  state.settings.onboardingCompleted = true;
  return state;
};

test("amount input groups while typing and preserves middle edits, decimals and saved money", async ({
  page,
}) => {
  await startApp(page, TODAY, fixture());
  await button(page, "Добавить операцию").click();
  await page.getByRole("tab", { name: "Доход", exact: true }).click();
  const amount = page.getByLabel("Сумма операции", { exact: true });
  for (const [digit, displayed] of [
    ["1", "1"],
    ["2", "12"],
    ["5", "125"],
    ["5", "1 255"],
    ["0", "12 550"],
    ["0", "125 500"],
    ["0", "1 255 000"],
    ["0", "12 550 000"],
    ["0", "125 500 000"],
    [",", "125 500 000,"],
    ["0", "125 500 000,0"],
    ["9", "125 500 000,09"],
  ]) {
    await amount.pressSequentially(digit);
    await expect(amount).toHaveValue(displayed);
    expect(await caret(amount)).toEqual({
      start: displayed.length,
      end: displayed.length,
    });
  }
  await expect(amount).toHaveValue("125 500 000,09");
  await amount.press("Home");
  for (let i = 0; i < 4; i++) await amount.press("ArrowRight");
  for (let i = 0; i < 3; i++) await amount.press("Shift+ArrowRight");
  await amount.pressSequentially("600");
  await expect(amount).toHaveValue("125 600 000,09");
  expect(await caret(amount)).toEqual({ start: 7, end: 7 });

  await amount.fill("11111");
  await amount.press("Home");
  await amount.press("ArrowRight");
  await amount.pressSequentially("1");
  await expect(amount).toHaveValue("111 111");
  expect(await caret(amount)).toEqual({ start: 2, end: 2 });

  await amount.fill("1234");
  await amount.press("Home");
  await amount.press("ArrowRight");
  await amount.press("ArrowRight");
  await amount.press("Backspace");
  await expect(amount).toHaveValue("1 234");
  await amount.press("Backspace");
  await expect(amount).toHaveValue("234");

  await amount.fill("1234");
  await amount.press("Home");
  await amount.press("ArrowRight");
  await amount.press("Delete");
  await expect(amount).toHaveValue("1 234");
  await amount.press("Delete");
  await expect(amount).toHaveValue("134");

  await amount.fill("125\u00a0500\u202f000,09");
  await expect(amount).toHaveValue("125 500 000,09");
  await page
    .getByLabel("Название операции", { exact: true })
    .fill("Проверка большой суммы");
  await pickDate(page, "Дата операции", "2026-08-31");
  await button(page, "Добавить операцию").click();
  await expect
    .poll(async () => (await readState(page)).transactions.length)
    .toBe(1);
  expect((await readState(page)).transactions[0]).toMatchObject({
    amount: 12_550_000_009,
    date: "2026-08-31",
  });
  await page.reload();
  expect((await readState(page)).transactions[0].amount).toBe(12_550_000_009);
});

test("credit balance keeps its sign and three KWD decimals; optional due date can be cleared", async ({
  page,
}) => {
  const state = fixture();
  state.settings.exchange!.rates.KWD = {
    value: 300 * RATE_SCALE,
    date: TODAY,
    source: "manual",
  };
  await startApp(page, TODAY, state);
  await button(page, "Открыть мои счета").click();
  await button(page, "Добавить кредитную карту").click();
  await page.getByLabel("Название счёта", { exact: true }).fill("Карта KWD");
  await button(page, "KWD").click();
  const balance = page.getByLabel("Остаток на счёте", { exact: true });
  await expect(balance).toHaveValue("");
  await balance.pressSequentially("-12345,678");
  await expect(balance).toHaveValue("-12 345,678");
  await page.getByLabel("Кредитный лимит", { exact: true }).fill("20000");
  await expect(page.getByLabel("Кредитный лимит", { exact: true })).toHaveValue(
    "20 000",
  );
  await pickDate(page, "Срок платежа по карте", "2028-02-29");
  await expect(
    page.getByLabel("Срок платежа по карте", { exact: true }),
  ).toHaveValue("29.02.2028");
  await button(page, "Открыть календарь: Срок платежа по карте").click();
  await page
    .getByTestId("date-picker-Срок платежа по карте")
    .getByRole("button", { name: "Очистить дату", exact: true })
    .click();
  await expect(
    page.getByLabel("Срок платежа по карте", { exact: true }),
  ).toHaveValue("");
  await button(page, "Сохранить счёт").click();
  await expect
    .poll(
      async () =>
        (await readState(page)).accounts.find((a) => a.name === "Карта KWD")
          ?.openingBalance,
    )
    .toBe(-12_345_678);
  const account = (await readState(page)).accounts.find(
    (a) => a.name === "Карта KWD",
  )!;
  expect(account.paymentDueDate).toBeUndefined();
  expect(account.creditLimit).toBe(20_000_000);
});

test("a saved zero is replaced by the first typed digit without clearing the input", async ({
  page,
}) => {
  const state = fixture();
  state.settings.buffer = 0;
  await startApp(page, TODAY, state);
  await button(page, "Профиль и настройки").click();
  await button(page, "Профиль и планирование").click();
  const buffer = page.getByLabel("Неприкосновенный остаток", { exact: true });
  await expect(buffer).toHaveValue("0");
  await buffer.click();
  await expect.poll(() => caret(buffer)).toEqual({ start: 0, end: 1 });
  await buffer.pressSequentially("12345,67");
  await expect(buffer).toHaveValue("12 345,67");
  await button(page, "Сохранить настройки").click();
  await expect
    .poll(async () => (await readState(page)).settings.buffer)
    .toBe(1_234_567);
});

test("a new credit account requires its limit and accepts empty balance and payment as zero", async ({
  page,
}) => {
  await startApp(page, TODAY, fixture());
  await button(page, "Открыть мои счета").click();
  await button(page, "Добавить кредитную карту").click();
  await page.getByLabel("Название счёта", { exact: true }).fill("Новая карта");
  for (const label of [
    "Остаток на счёте",
    "Кредитный лимит",
    "Обязательный платёж по карте",
  ]) {
    await expect(page.getByLabel(label, { exact: true })).toHaveValue("");
  }
  await button(page, "Сохранить счёт").click();
  await expect(
    page.getByText("Укажите положительный кредитный лимит.", { exact: true }),
  ).toBeVisible();
  expect(
    (await readState(page)).accounts.some(
      (account) => account.name === "Новая карта",
    ),
  ).toBe(false);
  await page
    .getByLabel("Кредитный лимит", { exact: true })
    .pressSequentially("1000");
  await button(page, "Сохранить счёт").click();
  await expect
    .poll(async () =>
      (await readState(page)).accounts.find(
        (account) => account.name === "Новая карта",
      ),
    )
    .toMatchObject({
      openingBalance: 0,
      creditLimit: 100_000,
      paymentDueAmount: 0,
    });
});

test("calendar offers real dates, month and year navigation, cancellation and responsive layouts", async ({
  page,
}, testInfo) => {
  await startApp(page, TODAY, fixture());
  await button(page, "Добавить операцию").click();
  await page.getByLabel("Сумма операции", { exact: true }).fill("125500000");
  await pickDate(page, "Дата операции", "2028-02-29");
  await expect(page.getByLabel("Дата операции", { exact: true })).toHaveValue(
    "29.02.2028",
  );
  await button(page, "Открыть календарь: Дата операции").click();
  const calendar = page.getByTestId("date-picker-Дата операции");
  await calendar
    .getByRole("button", { name: "Выбрать год", exact: true })
    .click();
  await calendar
    .getByRole("button", { name: "Предыдущие годы", exact: true })
    .click();
  await calendar.getByRole("button", { name: "2027 год", exact: true }).click();
  await calendar.getByRole("button", { name: "Февраль", exact: true }).click();
  await expect(
    calendar.getByRole("button", { name: "29 февраля 2027 г.", exact: true }),
  ).toHaveCount(0);
  await expect(
    calendar.getByRole("button", { name: "28 февраля 2027 г.", exact: true }),
  ).toBeVisible();
  await calendar.getByRole("button", { name: "Отмена", exact: true }).click();
  await expect(page.getByLabel("Дата операции", { exact: true })).toHaveValue(
    "29.02.2028",
  );
  await button(page, "Открыть календарь: Дата операции").click();
  await calendar.getByRole("button", { name: "Сегодня", exact: true }).click();
  await expect(page.getByLabel("Дата операции", { exact: true })).toHaveValue(
    "10.09.2026",
  );

  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await button(page, "Открыть календарь: Дата операции").click();
    await calendar.scrollIntoViewIfNeeded();
    const bounds = await calendar.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: testInfo.outputPath(`calendar-${width}.png`),
    });
    await calendar.getByRole("button", { name: "Отмена", exact: true }).click();
    await page
      .getByLabel("Сумма операции", { exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`amount-${width}.png`) });
  }
  expect((await readState(page)).transactions).toHaveLength(0);
});
