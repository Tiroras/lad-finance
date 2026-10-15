import assert from "node:assert/strict";
import { test } from "node:test";
import { isAbsolute, relative, resolve, sep } from "node:path";
import demo from "../playwright.config";
import personal from "../playwright.personal.config";
import fresh from "../playwright.fresh.config";

test("Playwright cleanup is confined to disjoint mode directories, preserving sibling logs and native stands", () => {
  const root = resolve("test-results");
  const paths = [demo, personal, fresh].map((config) => {
    assert.ok(
      config.outputDir,
      "Every mode must explicitly scope its cleanup directory",
    );
    const target = resolve(config.outputDir);
    const child = relative(root, target);
    assert.ok(
      child &&
        !isAbsolute(child) &&
        child !== ".." &&
        !child.startsWith(`..${sep}`),
    );
    return target;
  });
  for (const [index, target] of paths.entries()) {
    for (const other of paths.slice(index + 1)) {
      assert.notEqual(target, other);
      assert.ok(
        !target.startsWith(`${other}${sep}`) &&
          !other.startsWith(`${target}${sep}`),
      );
    }
  }
});
