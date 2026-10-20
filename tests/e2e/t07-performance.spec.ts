import { expect, test } from "@playwright/test";
import { bundleBrowserModule } from "./browserBundle";
import type * as Fixture from "../helpers/t07PerformanceCases";
type Browser = typeof globalThis & { __browserTestModule: typeof Fixture };
let bundle: string;
test.beforeAll(async () => {
  bundle = await bundleBrowserModule("tests/helpers/t07PerformanceCases.ts", {
    domainTestShims: true,
  });
});
for (const count of [1000, 5000, 20000] as const) {
  test(`T07 browser profile and exact oracle at ${count} records`, async ({
    page,
  }, info) => {
    test.setTimeout(180_000);
    await page.route("https://lad-t07-performance.invalid/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>T07 performance</title>",
      }),
    );
    await page.goto("https://lad-t07-performance.invalid/");
    await page.addScriptTag({ content: bundle });
    const evidence = await page.evaluate(
      (count) => ({
        result: (globalThis as Browser).__browserTestModule.runPerformanceCase(
          count,
        ),
        environment: {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          language: navigator.language,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          hardwareConcurrency: navigator.hardwareConcurrency,
        },
      }),
      count,
    );
    await info.attach("browser-performance-samples", {
      body: JSON.stringify(evidence, null, 2),
      contentType: "application/json",
    });
    expect(evidence.result.samples).toHaveLength(3);
    expect(evidence.result.oracle.days).toBe(90);
  });
}
test("T07 browser exact UTF8 capacity boundaries", async ({ page }, info) => {
  test.setTimeout(180_000);
  await page.route("https://lad-t07-performance.invalid/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>T07 UTF8</title>",
    }),
  );
  await page.goto("https://lad-t07-performance.invalid/");
  await page.addScriptTag({ content: bundle });
  const evidence = await page.evaluate(() =>
    (globalThis as Browser).__browserTestModule.runUtf8BoundaryCase(),
  );
  await info.attach("browser-utf8-boundaries", {
    body: JSON.stringify(evidence, null, 2),
    contentType: "application/json",
  });
  expect(evidence.acceptedUtf8Bytes).toEqual([4_999_999, 5_000_000]);
});
