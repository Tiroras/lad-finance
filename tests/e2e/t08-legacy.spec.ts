import { expect, test } from "@playwright/test";
import type { BrowserDomainOutcome } from "../helpers/browserDomainTestShim";
import { bundleBrowserModule } from "./browserBundle";

for (const suite of ["payments", "recurrence"]) {
  test(`T08 existing payment calendar regressions in Chrome: ${suite}`, async ({
    page,
  }, info) => {
    await page.goto("about:blank");
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
    await info.attach("existing-domain-case-results", {
      body: JSON.stringify(outcomes, null, 2),
      contentType: "application/json",
    });
    expect(outcomes.length).toBeGreaterThan(0);
    expect(outcomes.filter((entry) => !entry.passed)).toEqual([]);
  });
}
