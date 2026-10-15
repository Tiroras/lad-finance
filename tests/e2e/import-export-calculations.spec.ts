import { expect, test } from "@playwright/test";
import { bundleBrowserModule } from "./browserBundle";

test("T03: CSV boundaries, atomic import and historical summaries execute in Chromium", async ({
  page,
}, testInfo) => {
  await page.goto("about:blank");
  await page.addScriptTag({
    content: await bundleBrowserModule("tests/helpers/t03CsvCases.ts"),
  });
  const results = await page.evaluate(async () => {
    const { t03CsvCases } = (
      globalThis as unknown as {
        __browserTestModule: {
          t03CsvCases: readonly { name: string; run(): void | Promise<void> }[];
        };
      }
    ).__browserTestModule;
    const outcomes = [];
    for (const scenario of t03CsvCases) {
      try {
        await scenario.run();
        outcomes.push({ name: scenario.name, passed: true, error: "" });
      } catch (failure) {
        outcomes.push({
          name: scenario.name,
          passed: false,
          error:
            failure instanceof Error
              ? failure.stack || failure.message
              : String(failure),
        });
      }
    }
    return outcomes;
  });
  await testInfo.attach("browser-case-results", {
    body: JSON.stringify(results, null, 2),
    contentType: "application/json",
  });
  expect(results).toHaveLength(10);
  expect(results.filter((result) => !result.passed)).toEqual([]);
});

test("T03: exact snapshot receipts and retry/escape protocols execute in Chromium", async ({
  page,
}, testInfo) => {
  await page.goto("about:blank");
  await page.addScriptTag({
    content: await bundleBrowserModule("tests/helpers/t03ImportCases.ts"),
  });
  const results = await page.evaluate(async () => {
    const { t03ImportCases } = (
      globalThis as unknown as {
        __browserTestModule: {
          t03ImportCases: readonly {
            name: string;
            run(): void | Promise<void>;
          }[];
        };
      }
    ).__browserTestModule;
    const outcomes = [];
    for (const scenario of t03ImportCases) {
      try {
        await scenario.run();
        outcomes.push({ name: scenario.name, passed: true, error: "" });
      } catch (failure) {
        outcomes.push({
          name: scenario.name,
          passed: false,
          error:
            failure instanceof Error
              ? failure.stack || failure.message
              : String(failure),
        });
      }
    }
    return outcomes;
  });
  await testInfo.attach("browser-case-results", {
    body: JSON.stringify(results, null, 2),
    contentType: "application/json",
  });
  expect(results).toHaveLength(18);
  expect(results.filter((result) => !result.passed)).toEqual([]);
});

test("T03: export batches, receipts and bounded file reads execute in Chromium", async ({
  page,
}, testInfo) => {
  await page.goto("about:blank");
  await page.addScriptTag({
    content: await bundleBrowserModule("tests/helpers/t03ExportCases.ts"),
  });
  const results = await page.evaluate(async () => {
    const { t03ExportCases } = (
      globalThis as unknown as {
        __browserTestModule: {
          t03ExportCases: readonly {
            name: string;
            run(): void | Promise<void>;
          }[];
        };
      }
    ).__browserTestModule;
    const outcomes = [];
    for (const scenario of t03ExportCases) {
      try {
        await scenario.run();
        outcomes.push({ name: scenario.name, passed: true, error: "" });
      } catch (failure) {
        outcomes.push({
          name: scenario.name,
          passed: false,
          error:
            failure instanceof Error
              ? failure.stack || failure.message
              : String(failure),
        });
      }
    }
    return outcomes;
  });
  await testInfo.attach("browser-case-results", {
    body: JSON.stringify(results, null, 2),
    contentType: "application/json",
  });
  expect(results).toHaveLength(6);
  expect(results.filter((result) => !result.passed)).toEqual([]);
});
