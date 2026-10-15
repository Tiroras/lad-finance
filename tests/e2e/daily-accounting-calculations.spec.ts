import { expect, test } from "@playwright/test";
import { bundleBrowserModule } from "./browserBundle";

for (const suite of [
  { file: "t04CompatibilityCases", count: 17 },
  { file: "t04SaveCases", count: 5 },
  { file: "t04DraftCases", count: 12 },
  { file: "t04FinanceCases", count: 42 },
]) {
  test(`T04: ${suite.file} execute in Chromium`, async ({ page }, testInfo) => {
    // WebCrypto requires a secure origin. This document is fulfilled locally;
    // no application server or external request participates in the cases.
    await page.route("https://lad-browser-tests.invalid/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>T04 browser cases</title>",
      }),
    );
    await page.goto("https://lad-browser-tests.invalid/");
    await page.addScriptTag({
      content: await bundleBrowserModule(`tests/helpers/${suite.file}.ts`),
    });
    const outcomes = await page.evaluate(async (name) => {
      const module = (
        globalThis as unknown as {
          __browserTestModule: Record<
            string,
            readonly { name: string; run(): void | Promise<void> }[]
          >;
        }
      ).__browserTestModule;
      const cases = module[name];
      if (!cases) throw new Error(`Missing suite ${name}`);
      const results = [];
      for (const scenario of cases) {
        try {
          await scenario.run();
          results.push({ name: scenario.name, passed: true, error: "" });
        } catch (failure) {
          results.push({
            name: scenario.name,
            passed: false,
            error:
              failure instanceof Error
                ? failure.stack || failure.message
                : String(failure),
          });
        }
      }
      return results;
    }, suite.file);
    await testInfo.attach("browser-case-results", {
      body: JSON.stringify(outcomes, null, 2),
      contentType: "application/json",
    });
    if (suite.count !== null) expect(outcomes).toHaveLength(suite.count);
    else expect(outcomes.length).toBeGreaterThan(0);
    expect(outcomes.filter((result) => !result.passed)).toEqual([]);
  });
}
