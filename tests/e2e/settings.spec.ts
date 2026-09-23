import { expect, test, type Page } from "@playwright/test";
import { createInitialState } from "../../src/domain/seed";
import { readState, startApp } from "./helpers";

const TODAY = "2026-09-10";
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const heading = (page: Page, name: string) =>
  page.getByRole("heading", { name, exact: true });
const fixture = () => {
  const state = createInitialState(false, TODAY);
  state.settings.exchange = { automatic: false, rates: {} };
  state.settings.onboardingCompleted = true;
  return state;
};

const sections = [
  ["Профиль и планирование", "Профиль и планирование"],
  ["Валюты и курсы", "Валюты и курсы"],
  ["Категории и подкатегории", "Категории и подкатегории"],
  ["Правила и шаблоны операций", "Правила и шаблоны"],
  ["Напоминания", "Напоминания"],
  ["Защита данных", "Защита данных"],
  ["Данные и копии", "Данные и копии"],
  ["О приложении", "О приложении"],
];

test("settings show a compact menu and every category opens its own page with a way back", async ({
  page,
}, testInfo) => {
  const initial = fixture();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await startApp(page, TODAY, initial);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await button(page, "Профиль и настройки").click();
    await expect(heading(page, "Ваш Лад")).toBeVisible();
    await expect(page.getByLabel("Ваше имя", { exact: true })).toHaveCount(0);
    await expect(button(page, "Создать копию с паролем")).toHaveCount(0);
    await expect(button(page, "Назад")).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath(`settings-menu-${width}.png`),
      animations: "disabled",
    });
    for (const [label, title] of sections) {
      await button(page, label).scrollIntoViewIfNeeded();
      const bounds = await button(page, label).boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      await button(page, label).click();
      await expect(heading(page, title)).toBeVisible();
      await expect(heading(page, "Ваш Лад")).toHaveCount(0);
      await expect(button(page, "Назад")).toBeVisible();
      if (
        width === 390 ||
        (width === 320 && label === "Профиль и планирование")
      ) {
        await page.screenshot({
          path: testInfo.outputPath(
            `settings-${sections.findIndex(([name]) => name === label)}-${width}.png`,
          ),
          animations: "disabled",
        });
      }
      await button(page, "Назад").click();
      await expect(heading(page, "Ваш Лад")).toBeVisible();
    }
    await button(page, "Закрыть").click();
  }
  expect(await readState(page)).toEqual(initial);
  expect(errors).toEqual([]);
});

test("profile settings save from their category and return to the menu without changing the ledger", async ({
  page,
}) => {
  const initial = fixture();
  await startApp(page, TODAY, initial);
  await button(page, "Профиль и настройки").click();
  await button(page, "Профиль и планирование").click();
  await page.getByLabel("Ваше имя", { exact: true }).fill("Александра");
  await page.getByLabel("День дохода", { exact: true }).fill("15");
  await page
    .getByLabel("Неприкосновенный остаток", { exact: true })
    .fill("12500");
  await button(page, "Сохранить настройки").click();
  await expect(heading(page, "Ваш Лад")).toBeVisible();
  await expect(page.getByText("Александра", { exact: true })).toBeVisible();
  await expect(button(page, "Назад")).toHaveCount(0);
  await expect
    .poll(async () => (await readState(page)).settings.name)
    .toBe("Александра");
  const saved = await readState(page);
  expect(saved.settings).toMatchObject({ payday: 15, buffer: 1_250_000 });
  expect({ ...saved, settings: initial.settings }).toEqual(initial);
  await button(page, "Закрыть").click();
  await page.reload();
  await button(page, "Профиль и настройки").click();
  await button(page, "Профиль и планирование").click();
  await expect(page.getByLabel("Ваше имя", { exact: true })).toHaveValue(
    "Александра",
  );
  await expect(
    page.getByLabel("Неприкосновенный остаток", { exact: true }),
  ).toHaveValue("12 500");
});

test("nested settings pages return to their category and closing clears the navigation history", async ({
  page,
}) => {
  await startApp(page, TODAY, fixture());
  await button(page, "Профиль и настройки").click();
  await button(page, "Категории и подкатегории").click();
  await button(page, "Создать категорию").click();
  await page
    .getByLabel("Название категории", { exact: true })
    .fill("Тестовая категория");
  await button(page, "Сохранить категорию").click();
  await expect(heading(page, "Категории и подкатегории")).toBeVisible();
  await button(page, "Назад").click();
  await expect(heading(page, "Ваш Лад")).toBeVisible();
  await button(page, "Данные и копии").click();
  await button(page, "Импортировать банковский CSV").click();
  await expect(heading(page, "Импорт банковской выписки")).toBeVisible();
  // Web Escape invokes the same Modal onRequestClose used by Android Back.
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(heading(page, "Данные и копии")).toBeVisible();
  await button(page, "Экспортировать операции в CSV").click();
  await expect(heading(page, "Экспорт операций")).toBeVisible();
  await button(page, "Назад").click();
  await expect(heading(page, "Данные и копии")).toBeVisible();
  await button(page, "Назад").click();
  await expect(heading(page, "Ваш Лад")).toBeVisible();
  await button(page, "О приложении").click();
  await button(page, "Закрыть").click();
  await button(page, "Профиль и настройки").click();
  await expect(heading(page, "Ваш Лад")).toBeVisible();
  await expect(button(page, "Назад")).toHaveCount(0);
});

test("demo setup remains reachable from the data section without replacing data on return", async ({
  page,
}) => {
  const initial = createInitialState(true, TODAY);
  initial.settings.exchange = { automatic: false, rates: {} };
  await startApp(page, TODAY, initial);
  await button(page, "Профиль и настройки").click();
  await button(page, "Данные и копии").click();
  await button(page, "Пошаговая настройка своего учёта").click();
  await expect(heading(page, "Начнём ваш учёт")).toBeVisible();
  // RN Web handles Escape after the opening animation activates the modal.
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(heading(page, "Данные и копии")).toBeVisible();
  expect(await readState(page)).toEqual(initial);
});
