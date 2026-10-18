import { build } from "esbuild";
import { resolve } from "node:path";

/** Compile only on the host; all exported scenarios and fixtures run in Chromium. */
export async function bundleBrowserModule(
  relativePath: string,
  options: { domainTestShims?: boolean } = {},
): Promise<string> {
  const result = await build({
    entryPoints: [resolve(relativePath)],
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    globalName: "__browserTestModule",
    target: "es2022",
    alias: options.domainTestShims
      ? {
          "node:test": resolve("tests/helpers/browserDomainTestShim.ts"),
          "node:assert/strict": resolve("tests/helpers/browserDomainAssert.ts"),
        }
      : undefined,
  });
  return result.outputFiles[0].text;
}
