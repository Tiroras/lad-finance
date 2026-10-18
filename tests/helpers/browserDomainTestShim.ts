/** A deliberately small node:test adapter: test bodies execute only in Chromium. */
type BrowserDomainCase = { name: string; run: () => unknown };
export type BrowserDomainOutcome = {
  name: string;
  passed: boolean;
  error: string;
};
const cases: BrowserDomainCase[] = [];

export function test(name: string, run: () => unknown) {
  if (typeof name !== "string" || typeof run !== "function") {
    throw new Error(
      "Browser domain adapter only supports test(name, callback)",
    );
  }
  cases.push({ name, run });
}

async function runBrowserDomainTests(): Promise<BrowserDomainOutcome[]> {
  const outcomes: BrowserDomainOutcome[] = [];
  for (const entry of cases) {
    try {
      await entry.run();
      outcomes.push({ name: entry.name, passed: true, error: "" });
    } catch (error) {
      outcomes.push({
        name: entry.name,
        passed: false,
        error:
          error instanceof Error ? error.stack || error.message : String(error),
      });
    }
  }
  return outcomes;
}

(
  globalThis as unknown as {
    __runBrowserDomainTests: typeof runBrowserDomainTests;
  }
).__runBrowserDomainTests = runBrowserDomainTests;
