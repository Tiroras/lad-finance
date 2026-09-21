import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { createInitialState } from "../src/domain/seed.ts";

// Run with: PLAYWRIGHT_CHANNEL=chrome node --import tsx scripts/capture-planning.mjs
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
});
const errors = [];
const state = createInitialState(false, "2026-09-10");
state.accounts[0].openingBalance = 2000000;
state.settings.buffer = 500000;
state.categories.push({
  id: "renovation",
  parentId: "home",
  name: "Ремонт",
  budget: 0,
  icon: "home-outline",
  color: "#81729C",
  background: "#EEEBF5",
});
state.plannedIncomes = [
  {
    id: "salary",
    name: "Зарплата",
    amount: 5000000,
    date: "2026-09-15",
    repeat: "monthly",
    accountId: "card",
  },
];
state.recurring = [
  {
    id: "rent",
    name: "Аренда",
    amount: 3000000,
    day: 18,
    kind: "bill",
    active: true,
    startsOn: "2026-09-10",
    icon: "home-outline",
    color: "#FFFFFF",
    category: "home",
    accountId: "card",
  },
];
state.scenarios = [
  {
    id: "salary-delay",
    name: "Если зарплата задержится",
    horizon: 30,
    changes: [
      {
        source: "income",
        sourceId: "salary",
        name: "Зарплата",
        amount: 5000000,
        delayDays: 7,
      },
    ],
    events: [],
  },
];
state.transactions = [
  {
    id: "paint",
    title: "Краска для ремонта",
    type: "expense",
    amount: 12345,
    date: "2026-09-10",
    category: "renovation",
    accountId: "card",
  },
];
await mkdir("docs/screenshots", { recursive: true });
try {
  for (const width of [320, 390, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: width === 1440 ? 1040 : 844 },
      locale: "ru-RU",
      timezoneId: "Europe/Samara",
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.clock.install({ time: new Date("2026-09-10T12:00:00+04:00") });
    await page.addInitScript(
      (data) => localStorage.setItem("lad-finance-v1", JSON.stringify(data)),
      state,
    );
    await page.goto("http://localhost:8087");
    const click = (name) =>
      page.getByRole("button", { name, exact: true }).click();
    const shot = async (name) => {
      await page.clock.runFor(400);
      if (
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        )
      )
        throw new Error(`Horizontal overflow: ${name}/${width}`);
      await page.screenshot({
        path: `docs/screenshots/${name}-${width}.png`,
        animations: "disabled",
      });
    };
    await page.getByText("Больше ясности.").waitFor();
    await click("Профиль и настройки");
    await click("Категории и подкатегории");
    await click("Настроить: Дом / Ремонт");
    await shot("custom-category");
    await click("Закрыть");
    await click("Проверить покупку");
    await page.getByLabel("Стоимость покупки", { exact: true }).fill("20000");
    await page
      .getByText("Когда покупка впишется в план", { exact: true })
      .evaluate((element) => element.scrollIntoView({ block: "start" }));
    await shot("purchase-planner");
    await click("Закрыть");
    await click("Прогноз по дням");
    await click("Мои сценарии");
    await click("Открыть сценарий: Если зарплата задержится");
    await page.getByRole("tab", { name: "Сравнение", exact: true }).click();
    await page
      .getByTestId("scenario-delta")
      .evaluate((element) => element.scrollIntoView({ block: "start" }));
    await shot("saved-scenario");
    await click("Закрыть");
    await click("Профиль и настройки");
    await click("Экспортировать операции в CSV");
    await shot("csv-export");
    await click("Закрыть");
    await click("Профиль и настройки");
    await click("Создать копию с паролем");
    await page
      .getByLabel("Новый пароль копии", { exact: true })
      .evaluate((element) => element.scrollIntoView({ block: "center" }));
    await shot("password-backup");
    await context.close();
  }
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "15 screenshots captured; no console errors or document overflow.",
  );
} finally {
  await browser.close();
}
