import { expect, test } from "@playwright/test";
import type { BrowserDomainOutcome } from "../helpers/browserDomainTestShim";
import { bundleBrowserModule } from "./browserBundle";

test("browser assertion adapter rejects unequal financial records", async ({
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
    assert.deepEqual(
      { amount: 1, tags: ["a", undefined] },
      { tags: ["a", undefined], amount: 1 },
    );
    assert.equal(Number.NaN, Number.NaN);
    const unequal = [
      () => assert.equal(0, -0),
      () => assert.deepEqual({ amount: 1 }, { amount: 2 }),
      () => assert.deepEqual({ optional: undefined }, {}),
      () => assert.deepEqual([undefined], Array(1)),
      () => assert.deepEqual([1, 2], [2, 1]),
      () => assert.throws(() => undefined),
      () =>
        assert.throws(() => {
          throw new Error("wrong");
        }, /expected/),
      () =>
        assert.doesNotThrow(() => {
          throw new Error("unexpected");
        }),
    ];
    return unequal.map((run) => {
      try {
        run();
        return false;
      } catch {
        return true;
      }
    });
  });
  expect(outcomes).toEqual(Array(8).fill(true));
});

for (const [suite, count] of Object.entries({
  actions: 11,
  recurrence: 10,
  payments: 9,
  forecast: 10,
  spendable: 12,
  budgets: 14,
  planningCapacity: 6,
  currency: 17,
  finance: 21,
  planning: 6,
})) {
  test(`T05 existing domain regressions in Chromium: ${suite}`, async ({
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
