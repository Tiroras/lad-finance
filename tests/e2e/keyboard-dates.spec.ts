import { expect, test, type Locator, type Page } from "@playwright/test";
import { createInitialState } from "../../src/domain/seed";
import { pickDate, readState, startApp } from "./helpers";

const TODAY = "2026-09-10";
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const field = (page: Page, name: string) =>
  page.getByLabel(name, { exact: true });
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

test("Enter moves from amount to title to editable date without saving or opening the calendar", async ({
  page,
}) => {
  await startApp(page, TODAY, fixture());
  await button(page, "Добавить операцию").click();
  await page.getByRole("tab", { name: "Доход", exact: true }).click();
  const amount = field(page, "Сумма операции");
  await amount.pressSequentially("12500,50");
  await expect(amount).toHaveAttribute("enterkeyhint", "next");
  await amount.press("Enter");
  const title = field(page, "Название операции");
  await expect(title).toBeFocused();
  await title.pressSequentially("Проверка переходов");
  await title.press("Enter");
  const date = field(page, "Дата операции");
  await expect(date).toBeFocused();
  await expect(page.getByTestId("date-picker-Дата операции")).toHaveCount(0);
  await date.fill("31.08.2026");
  await date.press("Enter");
  await expect(field(page, "Заметка")).toBeFocused();
  await field(page, "Заметка").pressSequentially("Первая строка");
  await field(page, "Заметка").press("Enter");
  await field(page, "Заметка").pressSequentially("Вторая строка");
  await expect(field(page, "Заметка")).toHaveValue(
    "Первая строка\nВторая строка",
  );
  expect((await readState(page)).transactions).toHaveLength(0);
  await button(page, "Добавить операцию").click();
  await expect
    .poll(async () => (await readState(page)).transactions[0])
    .toMatchObject({
      title: "Проверка переходов",
      amount: 1_250_050,
      date: "2026-08-31",
    });
});

test("onboarding keyboard navigation follows each step and Done only ends input", async ({
  page,
}) => {
  const state = createInitialState(true, TODAY);
  state.settings.exchange = { automatic: false, rates: {} };
  state.settings.onboardingCompleted = false;
  await startApp(page, TODAY, state);
  await button(page, "Настроить свой учёт").click();
  await button(page, "Настроить свой учёт").click();
  const labels = [
    "Ваше имя",
    "Название основного счёта",
    "Начальный остаток",
    "Начальные накопления",
  ];
  await field(page, labels[0]).click();
  for (let i = 0; i < labels.length - 1; i++) {
    await field(page, labels[i]).press("Enter");
    await expect(field(page, labels[i + 1])).toBeFocused();
  }
  await expect(field(page, labels[3])).toHaveAttribute("enterkeyhint", "done");
  await field(page, labels[3]).press("Enter");
  await expect(field(page, labels[3])).not.toBeFocused();
  await expect(page.getByText("Шаг 1 из 4", { exact: true })).toBeVisible();
  expect((await readState(page)).demo).toBe(false);
  expect(await readState(page, "demo")).toEqual(state);
  await button(page, "Продолжить").click();
  await field(page, "Название ожидаемого дохода").click();
  await field(page, "Название ожидаемого дохода").press("Enter");
  await expect(field(page, "Доход при настройке")).toBeFocused();
  await field(page, "Доход при настройке").press("Enter");
  await expect(field(page, "Дата первого дохода")).toBeFocused();
});

test("fields inserted after choosing a credit account join the keyboard order", async ({
  page,
}, testInfo) => {
  await startApp(page, TODAY, fixture());
  await button(page, "Открыть мои счета").click();
  await button(page, "Добавить счёт").click();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({
      path: testInfo.outputPath(`account-types-${width}.png`),
      animations: "disabled",
    });
  }
  await page.setViewportSize({ width: 320, height: 844 });
  await page.getByRole("tab", { name: "Кредитная карта", exact: true }).click();
  await field(page, "Остаток на счёте").pressSequentially("-100");
  await field(page, "Остаток на счёте").press("Enter");
  await expect(field(page, "Кредитный лимит")).toBeFocused();
  await field(page, "Кредитный лимит").pressSequentially("50000");
  await field(page, "Кредитный лимит").press("Enter");
  await expect(field(page, "Срок платежа по карте")).toBeFocused();
  await field(page, "Срок платежа по карте").pressSequentially("30.09.2026");
  await field(page, "Срок платежа по карте").press("Enter");
  await expect(field(page, "Обязательный платёж по карте")).toBeFocused();
  await expect(field(page, "Обязательный платёж по карте")).toHaveAttribute(
    "enterkeyhint",
    "done",
  );
  await page.getByRole("tab", { name: "Повседневный", exact: true }).click();
  await field(page, "Остаток на счёте").click();
  await expect(field(page, "Остаток на счёте")).toHaveAttribute(
    "enterkeyhint",
    "done",
  );
  await field(page, "Остаток на счёте").press("Enter");
  await expect(field(page, "Остаток на счёте")).not.toBeFocused();
});

test("goal monthly contribution stays visible when the available form height changes", async ({
  page,
}, testInfo) => {
  await startApp(page, TODAY, fixture());
  await page.getByRole("tab", { name: "План", exact: true }).click();
  await page.getByRole("tab", { name: "Цели", exact: true }).click();
  await button(page, "Новая цель").click();
  await field(page, "Название цели").fill("Отпуск");
  const monthly = field(page, "Ежемесячный взнос");
  const expectVisibleInput = async () => {
    await expect(monthly).toBeFocused();
    await expect
      .poll(async () => {
        const input = await monthly.boundingBox();
        const header = await page
          .getByRole("heading", { name: "Новая мечта", exact: true })
          .boundingBox();
        return (
          !!input &&
          !!header &&
          input.y >= header.y + header.height &&
          input.y + input.height <= page.viewportSize()!.height - 20
        );
      })
      .toBe(true);
  };
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await field(page, "Сумма цели").focus();
    await field(page, "Сумма цели").press("Enter");
    // Simulate the reduced space available above a software keyboard. Avoid
    // locator.fill/press after the resize: they could scroll the input for us.
    await page.setViewportSize({ width, height: 460 });
    await page.clock.runFor(500);
    await expectVisibleInput();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("12500");
    await expect(monthly).toHaveValue("12 500");
    await page.setViewportSize({ width, height: 360 });
    await page.clock.runFor(500);
    await expectVisibleInput();
    await page.screenshot({
      path: testInfo.outputPath(`goal-monthly-input-${width}.png`),
      animations: "disabled",
    });
    await page.setViewportSize({ width, height: 900 });
    await page.clock.runFor(500);
    await expectVisibleInput();
  }
  await button(page, "Создать цель").click();
  await expect
    .poll(async () =>
      (await readState(page)).goals.find((goal) => goal.name === "Отпуск"),
    )
    .toMatchObject({ monthly: 1_250_000 });
});

test("typed dates reject impossible and incomplete values; only the side button opens the calendar", async ({
  page,
}, testInfo) => {
  await startApp(page, TODAY, fixture());
  await button(page, "Добавить операцию").click();
  await page.getByRole("tab", { name: "Доход", exact: true }).click();
  await field(page, "Сумма операции").fill("500");
  await field(page, "Название операции").fill("Проверка даты");
  const date = field(page, "Дата операции");
  const calendar = page.getByTestId("date-picker-Дата операции");
  await date.click();
  await expect(calendar).toHaveCount(0);
  await date.fill("29.02.2025");
  await button(page, "Добавить операцию").click();
  await expect(
    page.getByText("Введите существующую дату в формате ДД.ММ.ГГГГ.", {
      exact: true,
    }),
  ).toBeVisible();
  expect((await readState(page)).transactions).toHaveLength(0);
  await date.fill("29.02.");
  await button(page, "Добавить операцию").click();
  await expect(date).toHaveValue("29.02.");
  expect((await readState(page)).transactions).toHaveLength(0);
  await date.fill("");
  await date.pressSequentially("29.02.2024");
  await expect(date).toHaveValue("29.02.2024");
  await button(page, "Открыть календарь: Дата операции").click();
  await expect(
    calendar.getByRole("button", { name: "29 февраля 2024 г.", exact: true }),
  ).toBeVisible();
  await calendar.getByRole("button", { name: "Отмена", exact: true }).click();
  await expect(date).toHaveValue("29.02.2024");
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await date.scrollIntoViewIfNeeded();
    await page.clock.runFor(300);
    await page.screenshot({
      path: testInfo.outputPath(`date-input-${width}.png`),
      animations: "disabled",
    });
    const bounds = await button(
      page,
      "Открыть календарь: Дата операции",
    ).boundingBox();
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
  }
  await button(page, "Добавить операцию").click();
  await expect
    .poll(async () => (await readState(page)).transactions[0]?.date)
    .toBe("2024-02-29");
  await page.reload();
  expect((await readState(page)).transactions[0].date).toBe("2024-02-29");
});

test("optional dates can be typed, cleared by hand and then selected in the calendar", async ({
  page,
}) => {
  await startApp(page, TODAY, fixture());
  await button(page, "Открыть мои счета").click();
  await button(page, "Добавить кредитную карту").click();
  const date = field(page, "Срок платежа по карте");
  await date.fill("30.09.2026");
  await field(page, "Название счёта").fill("Карта без срока");
  await field(page, "Кредитный лимит").fill("10000");
  await date.fill("");
  await pickDate(page, "Срок платежа по карте", "2026-10-15");
  await expect(date).toHaveValue("15.10.2026");
  await date.fill("");
  await button(page, "Сохранить счёт").click();
  await expect
    .poll(
      async () =>
        (await readState(page)).accounts.find(
          (a) => a.name === "Карта без срока",
        )?.creditLimit,
    )
    .toBe(1_000_000);
  expect(
    (await readState(page)).accounts.find((a) => a.name === "Карта без срока")
      ?.paymentDueDate,
  ).toBeUndefined();
});

test("date mask adds dots without moving the caret and supports replacement, deletion and paste", async ({
  page,
}) => {
  await startApp(page, TODAY, fixture());
  await button(page, "Добавить операцию").click();
  await page.getByRole("tab", { name: "Доход", exact: true }).click();
  await field(page, "Сумма операции").fill("100");
  await field(page, "Название операции").fill("Дата с маской");
  const date = field(page, "Дата операции");
  await date.fill("");
  for (const [digit, displayed] of [
    ["2", "2"],
    ["9", "29."],
    ["0", "29.0"],
    ["2", "29.02."],
    ["2", "29.02.2"],
    ["0", "29.02.20"],
    ["2", "29.02.202"],
    ["4", "29.02.2024"],
  ]) {
    await date.pressSequentially(digit);
    await expect(date).toHaveValue(displayed);
    expect(await caret(date)).toEqual({
      start: displayed.length,
      end: displayed.length,
    });
  }
  await expect(page.getByTestId("date-picker-Дата операции")).toHaveCount(0);
  await date.pressSequentially("9x");
  await expect(date).toHaveValue("29.02.2024");
  expect(await caret(date)).toEqual({ start: 10, end: 10 });

  for (let i = 0; i < 10; i++) await date.press("ArrowLeft");
  expect(await caret(date)).toEqual({ start: 0, end: 0 });
  for (let i = 0; i < 3; i++) await date.press("ArrowRight");
  await date.press("Shift+ArrowRight");
  await date.press("Shift+ArrowRight");
  expect(await caret(date)).toEqual({ start: 3, end: 5 });
  await date.pressSequentially("0");
  await expect(date).toHaveValue("29.02.024");
  expect(await caret(date)).toEqual({ start: 4, end: 4 });
  await date.pressSequentially("8");
  await expect(date).toHaveValue("29.08.2024");
  expect(await caret(date)).toEqual({ start: 6, end: 6 });

  for (let i = 0; i < 10; i++) await date.press("ArrowRight");
  for (const expected of [
    "29.08.202",
    "29.08.20",
    "29.08.2",
    "29.08.",
    "29.0",
    "29.",
    "2",
    "",
  ]) {
    await date.press("Backspace");
    await expect(date).toHaveValue(expected);
    expect(await caret(date)).toEqual({
      start: expected.length,
      end: expected.length,
    });
  }
  await date.fill(" 29 / 02 / 2024 ");
  await expect(date).toHaveValue("29.02.2024");
  for (let i = 0; i < 10; i++) await date.press("ArrowLeft");
  await date.press("ArrowRight");
  await date.press("ArrowRight");
  await date.press("Delete");
  await expect(date).toHaveValue("29.22.024");
  expect(await caret(date)).toEqual({ start: 3, end: 3 });
  await date.fill("29022024");
  await expect(date).toHaveValue("29.02.2024");
  await date.press("Enter");
  await expect(field(page, "Заметка")).toBeFocused();
  await button(page, "Добавить операцию").click();
  await expect
    .poll(async () => (await readState(page)).transactions[0]?.date)
    .toBe("2024-02-29");
});
