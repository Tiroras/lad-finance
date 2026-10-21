import { expect, test } from "@playwright/test";
import { bundleBrowserModule } from "./browserBundle";

test("T08 actual Web app keeps native reminders unavailable", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.install({ time: new Date("2026-10-20T12:00:00+04:00") });
  await page.route("https://api.frankfurter.dev/**", (route) => route.abort());
  await page.addInitScript({
    content: `${await bundleBrowserModule("tests/helpers/t08WebFixture.ts")}\n__browserTestModule.install();`,
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Профиль и настройки", exact: true })
    .click();
  await page.getByRole("button", { name: "Напоминания", exact: true }).click();
  await expect(
    page.getByText(/Напоминания работают в приложении Лад для iOS и Android/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /Включить напоминания|Выключить напоминания/,
    }),
  ).toHaveCount(0);
  await expect(page.getByText(/В очереди этого профиля:/)).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("web-reminder-notice-390.png"),
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});
