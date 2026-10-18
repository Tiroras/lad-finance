import { expect, test } from "@playwright/test";
import type { BrowserDomainOutcome } from "../helpers/browserDomainTestShim";
import { bundleBrowserModule } from "./browserBundle";

test("T06 browser inequality assertion rejects equal values", async ({
  page,
}) => {
  await page.addScriptTag({
    content: await bundleBrowserModule("tests/helpers/browserDomainAssert.ts"),
  });
  const outcomes = await page.evaluate(() => {
    const assert = (
      globalThis as unknown as {
        __browserTestModule: {
          default: typeof import("../helpers/browserDomainAssert").default;
        };
      }
    ).__browserTestModule.default;
    assert.notEqual(1, 2);
    assert.notEqual(0, -0);
    return [1, Number.NaN, "same"].map((value) => {
      try {
        assert.notEqual(value, value);
        return false;
      } catch {
        return true;
      }
    });
  });
  expect(outcomes).toEqual([true, true, true]);
});

for (const [suite, count] of Object.entries({
  debts: 11,
  reconciliation: 4,
  profileNotifications: 8,
  domainAggregation: 5,
})) {
  test(`T06 existing domain regressions in Chromium: ${suite}`, async ({
    page,
  }, testInfo) => {
    await page.route("https://lad-domain-regressions.invalid/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>Existing domain regressions</title>",
      }),
    );
    await page.goto("https://lad-domain-regressions.invalid/");
    await page.addScriptTag({
      content: await bundleBrowserModule(`tests/${suite}.test.ts`, {
        domainTestShims: true,
      }),
    });
    const outcomes = await page.evaluate(() =>
      (
        globalThis as unknown as {
          __runBrowserDomainTests: () => Promise<BrowserDomainOutcome[]>;
        }
      ).__runBrowserDomainTests(),
    );
    await testInfo.attach("existing-domain-case-results", {
      body: JSON.stringify(outcomes, null, 2),
      contentType: "application/json",
    });
    expect(outcomes).toHaveLength(count);
    expect(outcomes.filter((entry) => !entry.passed)).toEqual([]);
  });
}
