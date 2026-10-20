import { expect, test } from "@playwright/test";
import { bundleBrowserModule } from "./browserBundle";
import type * as Fixture from "../helpers/t07CompatibilityCases";

test("T07 format compatibility and assignments execute in Chrome", async ({
  page,
}, info) => {
  await page.goto("about:blank");
  await page.addScriptTag({
    content: await bundleBrowserModule(
      "tests/helpers/t07CompatibilityCases.ts",
    ),
  });
  const outcomes = await page.evaluate(() => {
    const module = (
      globalThis as unknown as { __browserTestModule: typeof Fixture }
    ).__browserTestModule;
    return module.t07CompatibilityCases.map((entry) => {
      try {
        entry.run();
        return { name: entry.name, passed: true, error: "" };
      } catch (error) {
        return {
          name: entry.name,
          passed: false,
          error:
            error instanceof Error
              ? error.stack || error.message
              : String(error),
        };
      }
    });
  });
  await info.attach("browser-case-results", {
    body: JSON.stringify(outcomes, null, 2),
    contentType: "application/json",
  });
  expect(outcomes.length).toBeGreaterThan(0);
  expect(outcomes.filter((entry) => !entry.passed)).toEqual([]);
});
