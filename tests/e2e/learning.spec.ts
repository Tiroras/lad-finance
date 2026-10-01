import { expect, test, type Locator, type Page } from "@playwright/test";
import { tourSteps } from "../../src/features/settings/lib/tourSteps";
import type { LearningProgress } from "../../src/features/settings/model/learningProgress";
import {
  activeProfile,
  openProfiles,
  readState,
  startApp,
  switchProfile,
} from "./helpers";

const TODAY = "2026-09-10";
const KEY = "lad-learning-progress-v1";
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const coach = (page: Page) => page.getByTestId("tour-coach");
const readProgress = (page: Page): Promise<LearningProgress> =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), KEY);

async function expectStep(page: Page, id: string) {
  const step = tourSteps.find((value) => value.id === id)!;
  await expect(coach(page)).toHaveCount(1);
  await expect(
    coach(page).getByRole("heading", { name: step.title, exact: true }),
  ).toBeVisible();
  await expect.poll(async () => (await readProgress(page)).step).toBe(id);
  const target = page.getByTestId(`tour-target-${step.target}`);
  await expect(target).toBeVisible();
  return target;
}

async function activate(target: Locator) {
  await target.getByRole("button").or(target.getByRole("tab")).first().click();
}

async function beginLearning(page: Page) {
  await page.clock.install({ time: new Date(`${TODAY}T12:00:00+04:00`) });
  await page.goto("/");
  await button(page, "Начать знакомство").click();
  await expectStep(page, "home-formula");
}

async function openCatalog(page: Page) {
  await button(page, "Профиль и настройки").click();
  await button(page, "Обучение").click();
  await expect(
    page.getByRole("heading", { name: "Экскурсия по приложению", exact: true }),
  ).toBeVisible();
}

const sheetTitles: Record<string, string> = {
  formula: "Всё прозрачно",
  accounts: "Мои счета",
  simulate: "Примерка покупки",
  export: "Экспорт операций",
  scenarios: "Мои сценарии",
  settings: "Ваш Лад",
  profileSettings: "Профиль и планирование",
  currencies: "Валюты и курсы",
  categories: "Категории и подкатегории",
  automation: "Правила и шаблоны",
  profiles: "Профили",
  reminderSettings: "Напоминания",
  securitySettings: "Защита данных",
  dataSettings: "Данные и копии",
  csv: "Импорт банковской выписки",
  about: "О приложении",
};
const tabLabels = {
  home: "Обзор",
  transactions: "Операции",
  plan: "План",
  analytics: "Аналитика",
};
const sectionLabels = {
  budgets: "Бюджеты",
  goals: "Цели",
  payments: "Платежи",
  forecast: "Прогноз",
};

test.beforeEach(async ({ page }) => {
  await page.route("https://api.frankfurter.dev/**", (route) => route.abort());
});

test("the tour visits every real tab, plan section and settings screen without changing the ledger", async ({
  page,
}, testInfo) => {
  test.setTimeout(150000);
  await beginLearning(page);
  expect(await activeProfile(page)).toBe("personal");
  const state = await readState(page);
  expect(state.transactions).toEqual([]);
  const visitedTabs = new Set<string>();
  const visitedSheets = new Set<string>();
  const visitedSections = new Set<string>();
  for (const [index, step] of tourSteps.entries()) {
    const target = await expectStep(page, step.id);
    await expect(page.getByTestId("learning-stage")).toHaveCount(0);
    await expect(page.getByTestId(`screen-${step.tab}`)).toBeVisible();
    visitedTabs.add(step.tab);
    const sheet = step.sheets.at(-1);
    if (sheet) {
      visitedSheets.add(sheet.type);
      await expect(page.getByRole("dialog")).toHaveCount(1);
      await expect(
        page
          .getByRole("dialog")
          .getByRole("heading", {
            name: sheetTitles[sheet.type],
            exact: true,
          })
          .first(),
      ).toBeVisible();
    } else {
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(
        page.getByRole("tab", { name: tabLabels[step.tab], exact: true }),
      ).toHaveAttribute("aria-selected", "true");
      if (step.section) {
        visitedSections.add(step.section);
        await expect(
          page.getByRole("tab", {
            name: sectionLabels[step.section],
            exact: true,
          }),
        ).toHaveAttribute("aria-selected", "true");
      }
    }
    if (
      ["home-formula", "open-plan", "open-securitySettings"].includes(step.id)
    ) {
      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 740 });
        await expect(target).toBeInViewport({ ratio: 1 });
        await expect(coach(page)).toBeInViewport({ ratio: 1 });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: testInfo.outputPath(`tour-${step.id}-${width}.png`),
          animations: "disabled",
        });
      }
      await page.setViewportSize({ width: 390, height: 844 });
    }
    await activate(target);
    if (index + 1 < tourSteps.length)
      await expectStep(page, tourSteps[index + 1].id);
    if (step.id === "transactions-filter")
      await expect(
        page.getByRole("tab", { name: "Расходы", exact: true }),
      ).toHaveAttribute("aria-selected", "true");
    if (step.id === "analytics-month")
      await expect(
        page
          .getByTestId("screen-analytics")
          .getByText("август 2026", { exact: true }),
      ).toBeVisible();
    expect(await readState(page)).toEqual(state);
    expect(await activeProfile(page)).toBe("personal");
  }
  expect([...visitedTabs].sort()).toEqual([
    "analytics",
    "home",
    "plan",
    "transactions",
  ]);
  expect([...visitedSections].sort()).toEqual([
    "budgets",
    "forecast",
    "goals",
    "payments",
  ]);
  expect([...visitedSheets].sort()).toEqual(Object.keys(sheetTitles).sort());
  await expect(coach(page)).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("tab", { name: "Обзор", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  expect((await readProgress(page)).status).toBe("completed");
  await openCatalog(page);
  await button(page, "Пройти всё приложение заново").click();
  await expectStep(page, "home-formula");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await readState(page)).toEqual(state);
});

test("pause, reload, back and skip restore the actual screen and keep progress across profiles", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await startApp(page, TODAY);
  const state = await readState(page);
  await openCatalog(page);
  await button(page, "План: бюджеты, цели, платежи и прогноз").click();
  await activate(await expectStep(page, "plan-budgets"));
  await expectStep(page, "plan-goals");
  await button(page, "Назад по экскурсии").click();
  await expectStep(page, "plan-budgets");
  await expect(
    page.getByRole("tab", { name: "Бюджеты", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await button(page, "Пропустить шаг").click();
  await expectStep(page, "plan-goals");
  await button(page, "Продолжить позже").click();
  await expect(coach(page)).toHaveCount(0);
  await expect(
    page.getByRole("tab", { name: "Цели", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.reload();
  await button(page, "Продолжить обучение").click();
  await expectStep(page, "plan-goals");
  await expect(page.getByTestId("screen-plan")).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Цели", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await button(page, "Продолжить позже").click();
  const progress = await readProgress(page);
  expect(await readState(page)).toEqual(state);
  await openProfiles(page);
  await button(page, "Добавить профиль").click();
  await page.getByLabel("Название профиля", { exact: true }).fill("Семейный");
  await button(page, "Создать профиль").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await readProgress(page)).toEqual(progress);
  const family = await readState(page);
  await button(page, "Продолжить обучение").click();
  await expectStep(page, "plan-goals");
  await button(page, "Продолжить позже").click();
  expect(await readState(page)).toEqual(family);
  await switchProfile(page, "Личный");
  expect(await readState(page)).toEqual(state);
  expect(await readProgress(page)).toEqual(progress);
});

test("old lesson progress resumes at the real overview instead of the removed practice forms", async ({
  page,
}) => {
  await page.addInitScript((key) => {
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        status: "started",
        step: 4,
        pages: { goals: 2 },
        completed: ["accounts", "operations"],
        overviewActive: true,
        overviewSpot: 2,
      }),
    );
  }, KEY);
  await startApp(page, TODAY);
  const state = await readState(page);
  await button(page, "Продолжить обучение").click();
  await expectStep(page, "home-formula");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("screen-home")).toBeVisible();
  expect(await readProgress(page)).toEqual({
    version: 2,
    status: "started",
    step: "home-formula",
  });
  expect(await readState(page)).toEqual(state);
});

test("a paused settings visit restores its real sheet and parent menu after reload", async ({
  page,
}) => {
  await startApp(page, TODAY);
  const state = await readState(page);
  await openCatalog(page);
  await button(page, "Настройки и перенос данных").click();
  await activate(await expectStep(page, "open-settings"));
  await activate(await expectStep(page, "open-profileSettings"));
  await expectStep(page, "profileSettings");
  await button(page, "Продолжить позже").click();
  await expect(coach(page)).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.reload();
  await button(page, "Продолжить обучение").click();
  await expectStep(page, "profileSettings");
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", {
        name: "Профиль и планирование",
        exact: true,
      })
      .first(),
  ).toBeVisible();
  await activate(await expectStep(page, "profileSettings"));
  await expectStep(page, "open-currencies");
  await expect(
    page.getByRole("dialog").getByRole("heading", {
      name: "Ваш Лад",
      exact: true,
    }),
  ).toBeVisible();
  expect(await readState(page)).toEqual(state);
});

test("a failed progress save keeps the same stop and permits retrying the real control", async ({
  page,
}) => {
  await page.addInitScript((key) => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (
        this === localStorage &&
        name === key &&
        sessionStorage.getItem("fail-learning-write") === "yes"
      )
        throw new DOMException("Full", "QuotaExceededError");
      return setItem.call(this, name, value);
    };
  }, KEY);
  await beginLearning(page);
  const state = await readState(page);
  await page.evaluate(() =>
    sessionStorage.setItem("fail-learning-write", "yes"),
  );
  await activate(await expectStep(page, "home-formula"));
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(coach(page)).toHaveCount(1);
  await expect(coach(page).getByRole("alert")).toContainText(
    "сохранить прогресс",
  );
  expect((await readProgress(page)).step).toBe("home-formula");
  expect(await readState(page)).toEqual(state);
  await page.evaluate(() => sessionStorage.removeItem("fail-learning-write"));
  await activate(await expectStep(page, "home-formula"));
  await expectStep(page, "formula");
  await expect(page.getByRole("dialog")).toHaveCount(1);
  expect(await readState(page)).toEqual(state);
});
