import { chromium, expect } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  locale: "ru-RU",
  timezoneId: "Europe/Samara",
});
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
const capture = (name) =>
  page.screenshot({
    path: `docs/screenshots/${name}.png`,
    animations: "disabled",
  });
try {
  await page.clock.install({ time: new Date("2026-09-10T12:00:00+04:00") });
  await page.goto("http://localhost:8087");
  await expect(page.getByText("Больше ясности.")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => !!localStorage.getItem("lad-finance-v1")))
    .toBe(true);
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("lad-finance-v1"));
    state.plannedIncomes = [
      {
        id: "salary-plan",
        name: "Зарплата",
        amount: 12000000,
        date: "2026-09-25",
        repeat: "monthly",
        accountId: "card",
      },
    ];
    state.settings.forecast = { dailySpending: 150000, goalDay: 26 };
    localStorage.setItem("lad-finance-v1", JSON.stringify(state));
  });
  await page.reload();
  await page.getByRole("tab", { name: "План", exact: true }).click();
  await page.getByRole("tab", { name: "Прогноз", exact: true }).click();
  await page.getByRole("tab", { name: "60 дней", exact: true }).click();
  await capture("forecast-mobile");
  await page.getByRole("button", { name: /^25 сентября:/ }).click();
  await page.getByTestId("forecast-day").scrollIntoViewIfNeeded();
  await capture("forecast-calendar-mobile");
  await page.setViewportSize({ width: 1440, height: 1040 });
  await page
    .getByRole("tab", { name: "60 дней", exact: true })
    .scrollIntoViewIfNeeded();
  await capture("forecast-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Примерить покупку", exact: true })
    .click();
  await page.getByLabel("Стоимость покупки", { exact: true }).fill("70000");
  await page.getByLabel("Дата покупки", { exact: true }).fill("2026-09-20");
  await page.getByRole("tab", { name: "60 дней", exact: true }).click();
  await page
    .getByText("С покупкой и без неё", { exact: true })
    .evaluate((el) => el.scrollIntoView({ block: "start" }));
  await capture("forecast-purchase-mobile");
  await page.setViewportSize({ width: 320, height: 740 });
  await page.getByRole("button", { name: /^20 сентября:/ }).click();
  const details = await page.getByTestId("forecast-day").last().boundingBox();
  if (!details || details.x < 0 || details.x + details.width > 320)
    throw new Error("Forecast details overflow at 320px");
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page
    .getByRole("button", { name: "Доход: Зарплата", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Доход получен — записать", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: join(tmpdir(), "lad-income-320.png"),
    animations: "disabled",
  });
  const overflow = await page
    .getByRole("button", { name: "Доход получен — записать", exact: true })
    .evaluate((el) => el.scrollWidth > el.clientWidth);
  if (overflow) throw new Error("Receipt action overflows at 320px");
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "Saved forecast, calendar and purchase screenshots; checked narrow receipt form; no console/page errors.",
  );
} finally {
  await browser.close();
}
