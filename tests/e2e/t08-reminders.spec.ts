import { expect, test } from "@playwright/test";
import { bundleBrowserModule } from "./browserBundle";
import type * as Fixture from "../helpers/t08ReminderCases";

type Browser = typeof globalThis & { __browserTestModule: typeof Fixture };
let bundle: string;
test.beforeAll(async () => {
  bundle = await bundleBrowserModule("tests/helpers/t08ReminderCases.ts");
});

test("T08 reminder boundaries, identity and common capacity execute in Chromium", async ({
  page,
}, info) => {
  await page.goto("about:blank");
  await page.addScriptTag({ content: bundle });
  const outcomes = await page.evaluate(() =>
    (globalThis as Browser).__browserTestModule.t08ReminderCases.map(
      (entry) => {
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
      },
    ),
  );
  await info.attach("browser-case-results", {
    body: JSON.stringify(outcomes, null, 2),
    contentType: "application/json",
  });
  expect(outcomes.length).toBeGreaterThan(25);
  expect(outcomes.filter((entry) => !entry.passed)).toEqual([]);
});

for (const timezoneId of [
  "Europe/Samara",
  "America/New_York",
  "Europe/Berlin",
]) {
  test.describe(timezoneId, () => {
    test.use({ timezoneId });
    test("T08 local calendar window and hours survive DST changes", async ({
      page,
    }, info) => {
      await page.goto("about:blank");
      await page.addScriptTag({ content: bundle });
      const result = await page.evaluate(() => ({
        zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        outcomes: (
          globalThis as Browser
        ).__browserTestModule.t08TimeZoneCases.map((entry) => {
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
        }),
      }));
      await info.attach("timezone-browser-case-results", {
        body: JSON.stringify(result, null, 2),
        contentType: "application/json",
      });
      expect(result.zone).toBe(timezoneId);
      expect(result.outcomes).toHaveLength(5);
      expect(result.outcomes.filter((entry) => !entry.passed)).toEqual([]);
    });
  });
}
