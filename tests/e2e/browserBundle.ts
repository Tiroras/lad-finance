import { build } from "esbuild";
import { resolve } from "node:path";

/** Compile only on the host; all exported scenarios and fixtures run in Chromium. */
export async function bundleBrowserModule(
  relativePath: string,
): Promise<string> {
  const result = await build({
    entryPoints: [resolve(relativePath)],
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    globalName: "__browserTestModule",
    target: "es2022",
  });
  return result.outputFiles[0].text;
}
