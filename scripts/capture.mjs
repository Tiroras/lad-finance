import { openDemoForCapture } from "./capture-profile.mjs";
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";

const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
await page.goto("http://localhost:8087");
await openDemoForCapture(page);
await page.getByText("Больше ясности.").waitFor({ timeout: 60000 });
await page.evaluate(() => document.fonts.ready);
await fs.mkdir("docs/screenshots", { recursive: true });
await page.screenshot({
  animations: "disabled",
  path: "docs/screenshots/overview-mobile.png",
});
await page
  .getByRole("button", { name: "Проверить покупку", exact: true })
  .click();
await page.getByLabel("Стоимость покупки").fill("60000");
await page.screenshot({
  animations: "disabled",
  path: "docs/screenshots/purchase-mobile.png",
});
await page.getByRole("button", { name: "Закрыть", exact: true }).click();
await page.getByRole("tab", { name: "План", exact: true }).click();
await page.getByRole("tab", { name: "Цели", exact: true }).click();
await page.screenshot({
  animations: "disabled",
  path: "docs/screenshots/goals-mobile.png",
});
await page.getByRole("tab", { name: "Аналитика", exact: true }).click();
await page.screenshot({
  animations: "disabled",
  path: "docs/screenshots/analytics-mobile.png",
});
await page.getByRole("tab", { name: "Обзор", exact: true }).click();
await page.setViewportSize({ width: 1440, height: 1040 });
await page.screenshot({
  animations: "disabled",
  path: "docs/screenshots/overview-desktop.png",
});

const brand = await fs.readFile("assets/brand.svg", "utf8");
const assetPage = await browser.newPage({
  viewport: { width: 1024, height: 1024 },
  deviceScaleFactor: 1,
});
await assetPage.setContent(
  `<html><body style="margin:0;background:transparent">${brand.replace('rx="224"', 'rx="0"')}</body></html>`,
);
await assetPage.screenshot({
  animations: "disabled",
  path: "assets/icon.png",
  omitBackground: false,
});
await assetPage.setContent(
  `<html><body style="margin:0;background:transparent">${brand.replace(/<rect[^>]+\/>/, "").replace(/fill="#234B3C"/g, 'fill="none"')}</body></html>`,
);
await assetPage.screenshot({
  animations: "disabled",
  path: "assets/android-icon-foreground.png",
  omitBackground: true,
});
await assetPage.setContent(
  `<html><body style="margin:0;background:transparent">${brand.replace(/<rect[^>]+\/>/, "").replace(/#D5E9A7|#91AD78/g, "#FFFFFF")}</body></html>`,
);
await assetPage.screenshot({
  animations: "disabled",
  path: "assets/android-icon-monochrome.png",
  omitBackground: true,
});
await assetPage.setViewportSize({ width: 64, height: 64 });
await assetPage.setContent(
  `<html><body style="margin:0">${brand.replace('width="1024" height="1024"', 'width="64" height="64"')}</body></html>`,
);
await assetPage.screenshot({
  animations: "disabled",
  path: "assets/favicon.png",
  omitBackground: true,
});
console.log(
  JSON.stringify({ errors, screenshots: "docs/screenshots" }, null, 2),
);
await browser.close();
if (errors.length) process.exit(1);
