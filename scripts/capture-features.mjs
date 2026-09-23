import { chromium, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

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
try {
  await page.clock.install({ time: new Date("2026-09-10T12:00:00+04:00") });
  await page.goto("http://localhost:8087");
  await expect(page.getByText("Больше ясности.")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => !!localStorage.getItem("lad-finance-v1")))
    .toBe(true);
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("lad-finance-v1"));
    state.recurring.find((p) => p.id === "internet").startsOn = "2026-08-01";
    localStorage.setItem("lad-finance-v1", JSON.stringify(state));
  });
  await page.reload();
  await page.getByRole("tab", { name: "План", exact: true }).click();
  await page.getByRole("tab", { name: "Платежи", exact: true }).click();
  await page
    .getByText("Календарь платежей", { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "docs/screenshots/payments-mobile.png",
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Профиль и настройки" }).click();
  await page
    .getByRole("button", { name: "Данные и копии", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Импортировать банковский CSV" })
    .click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Выбрать CSV-файл" }).click();
  await (
    await chooser
  ).setFiles({
    name: "statement.csv",
    mimeType: "text/csv",
    buffer: await readFile("docs/examples/statement.csv"),
  });
  await page
    .getByRole("button", { name: "Распознать колонки", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Проверить операции", exact: true })
    .click();
  await page
    .getByText("Проверьте перед импортом", { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "docs/screenshots/csv-mobile.png",
    animations: "disabled",
  });
  await page.setViewportSize({ width: 320, height: 740 });
  await expect(page.getByText("Проверьте перед импортом")).toBeVisible();
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw new Error("CSV overflows at 320px");
  await page.setViewportSize({ width: 1440, height: 1000 });
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw new Error("CSV overflows at 1440px");
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "Saved payment and CSV screenshots; no console/page errors or viewport overflow.",
  );
} finally {
  await browser.close();
}
