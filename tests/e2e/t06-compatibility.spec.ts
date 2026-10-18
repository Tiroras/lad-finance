import { expect, test } from "@playwright/test";
import { bundleBrowserModule } from "./browserBundle";
import type * as Fixture from "../helpers/t06CompatibilityCases";

test("T06 financial format compatibility executes in Chromium", async ({
  page,
}, info) => {
  await page.clock.install({ time: new Date("2026-10-19T12:00:00+04:00") });
  await page.route("https://lad-t06-compatibility.invalid/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>T06 compatibility</title>",
    }),
  );
  await page.goto("https://lad-t06-compatibility.invalid/");
  await page.addScriptTag({
    content: await bundleBrowserModule(
      "tests/helpers/t06CompatibilityCases.ts",
    ),
  });
  const outcomes = await page.evaluate(() => {
    const module = (
      globalThis as unknown as { __browserTestModule: typeof Fixture }
    ).__browserTestModule;
    const outcomes = [];
    for (const entry of module.t06CompatibilityCases) {
      try {
        entry.run();
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
  expect(outcomes.length).toBeGreaterThan(0);
  expect(outcomes.filter((entry) => !entry.passed)).toEqual([]);
});
