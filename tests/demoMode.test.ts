import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createInitialState } from "../src/domain/seed";
import { encodeBackup } from "../src/domain/backup";
import { resetFinance } from "../src/domain/actions/settings";
import {
  assertDemoAllowed,
  createStartupState,
} from "../src/state/finance/demoMode";

const TODAY = "2026-09-26";

test("only the explicit true build option enables demo, independently of dev mode", () => {
  const source = readFileSync(
    new URL("../src/shared/lib/buildOptions.ts", import.meta.url),
    "utf8",
  );
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  });
  for (const value of [undefined, "", "false", "0", "1", "TRUE", "true"]) {
    for (const nodeEnv of ["development", "production"]) {
      const exports: { DEMO_ENABLED?: boolean } = {};
      runInNewContext(outputText, {
        exports,
        __DEV__: nodeEnv === "development",
        process: {
          env: { EXPO_PUBLIC_ENABLE_DEMO: value, NODE_ENV: nodeEnv },
        },
      });
      assert.equal(exports.DEMO_ENABLED, value === "true");
    }
  }
});

test("fresh ordinary launch is empty and awaits personal setup; explicit demo has examples", () => {
  const personal = createStartupState(TODAY, false);
  assert.equal(personal.demo, false);
  assert.equal(personal.settings.onboardingCompleted, false);
  assert.equal(personal.settings.buffer, 0);
  assert.deepEqual(personal.transactions, []);
  assert.deepEqual(personal.goals, []);
  assert.deepEqual(personal.recurring, []);
  assert.ok(personal.accounts.every((account) => account.openingBalance === 0));
  assert.ok(personal.categories.every((category) => category.budget === 0));
  const demo = createStartupState(TODAY, true);
  assert.equal(demo.demo, true);
  assert.equal(demo.settings.onboardingCompleted, false);
  assert.ok(demo.transactions.length > 0);
  assert.ok(demo.goals.length > 0);
  assert.ok(demo.recurring.length > 0);
});

test("disabled demo rejects stored, restored and reset examples without modifying records", () => {
  const saved = createInitialState(true, TODAY);
  const before = encodeBackup(saved);
  assert.throws(() => assertDemoAllowed(saved, false), /недоступен/);
  assert.equal(encodeBackup(saved), before);
  assert.doesNotThrow(() => assertDemoAllowed(saved, true));
  const personal = createInitialState(false, TODAY);
  personal.accounts[0].openingBalance = 123456;
  const personalBefore = encodeBackup(personal);
  for (const enabled of [false, true])
    assert.doesNotThrow(() => assertDemoAllowed(personal, enabled));
  assert.throws(
    () => assertDemoAllowed(resetFinance(personal, true, TODAY), false),
    /недоступен/,
  );
  assert.equal(encodeBackup(personal), personalBefore);
});
