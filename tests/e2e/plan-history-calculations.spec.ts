import { expect, test } from "@playwright/test";
import { bundleBrowserModule } from "./browserBundle";

for (const name of [
  "t04CompatibilityCases",
  "t05CompatibilityCases",
  "t05PaymentCases",
  "t05IncomeCases",
  "t05BudgetCases",
  "t05IntegrationCases",
]) {
  test(`T05 browser calculations: ${name}`, async ({ page }, testInfo) => {
    await page.route("https://lad-history-tests.invalid/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>T05 calculations</title>",
      }),
    );
    await page.goto("https://lad-history-tests.invalid/");
    await page.addScriptTag({
      content: await bundleBrowserModule(`tests/helpers/${name}.ts`),
    });
    const outcomes = await page.evaluate(async (suite) => {
      const module = (
        globalThis as unknown as {
          __browserTestModule: Record<
            string,
            readonly { name: string; run(): void | Promise<void> }[]
          >;
        }
      ).__browserTestModule;
      const result = [];
      for (const entry of module[suite]) {
        try {
          await entry.run();
          result.push({ name: entry.name, passed: true, error: "" });
        } catch (error) {
          result.push({
            name: entry.name,
            passed: false,
            error:
              error instanceof Error
                ? error.stack || error.message
                : String(error),
          });
        }
      }
      return result;
    }, name);
    await testInfo.attach("browser-case-results", {
      body: JSON.stringify(outcomes, null, 2),
      contentType: "application/json",
    });
    expect(outcomes.length).toBeGreaterThan(0);
    expect(outcomes.filter((entry) => !entry.passed)).toEqual([]);
  });
}
