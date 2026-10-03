import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

function setup(t: TestContext, buildFailure = false) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "lad-docker-mobile-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "docker"));
  mkdirSync(join(root, "android"));
  mkdirSync(join(root, "node_modules/expo/bin"), { recursive: true });
  const runner = join(root, "docker/android.mjs");
  copyFileSync(
    fileURLToPath(new URL("../docker/android.mjs", import.meta.url)),
    runner,
  );
  writeFileSync(
    join(root, "app.json"),
    JSON.stringify({ expo: { android: { package: "app.lad.finance" } } }),
  );
  writeFileSync(join(root, "node_modules/expo/bin/cli"), "process.exit(0);");
  writeFileSync(
    join(root, "android/gradlew"),
    'exec "$LAD_TEST_NODE" build.cjs "$@"\n',
  );
  writeFileSync(
    join(root, "android/build.cjs"),
    `const fs = require('node:fs');
if (${buildFailure}) process.exit(8);
const args = process.argv.slice(2);
const variant = args.includes(':app:assembleDebug') ? 'debug' : 'release';
const directory = 'app/build/outputs/apk/' + variant;
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(directory + '/app-' + variant + '.apk', JSON.stringify({
  variant,
  demo: process.env.EXPO_PUBLIC_ENABLE_DEMO,
  fresh: process.env.EXPO_PUBLIC_RESET_ON_START,
  args,
}));
`,
  );
  return {
    root,
    run: (...args: string[]) =>
      spawnSync(process.execPath, [runner, ...args], {
        encoding: "utf8",
        timeout: 10000,
        env: {
          ...process.env,
          LAD_TEST_NODE: process.execPath,
          // Explicit mode must override settings inherited from the host.
          EXPO_PUBLIC_ENABLE_DEMO: "true",
          EXPO_PUBLIC_RESET_ON_START: "true",
        },
      }),
    artifact: (mode: string) =>
      JSON.parse(
        readFileSync(
          join(root, `test-results/mobile/docker/app-${mode}.apk`),
          "utf8",
        ),
      ),
  };
}

test("Docker-сборка переключает три режима и сохраняет отдельные APK без эмулятора", (t) => {
  const fixture = setup(t);
  for (const [mode, variant, demo, fresh] of [
    ["default", "release", "false", "false"],
    ["demo", "release", "true", "false"],
    ["fresh", "debug", "false", "true"],
    ["default", "release", "false", "false"],
  ]) {
    const result = fixture.run("build", "--mode", mode, "--abi", "arm64-v8a");
    assert.equal(result.status, 0, result.stderr);
    const artifact = fixture.artifact(mode);
    assert.equal(artifact.variant, variant);
    assert.equal(artifact.demo, demo);
    assert.equal(artifact.fresh, fresh);
    assert.ok(artifact.args.includes("-PreactNativeArchitectures=arm64-v8a"));
    assert.ok(
      artifact.args.includes(join(fixture.root, "docker/build-mode.gradle")),
    );
  }
});

test("Docker-сборка сохраняет код ошибки Gradle и не публикует старый APK", (t) => {
  const fixture = setup(t, true);
  const apk = join(fixture.root, "android/app/build/outputs/apk/release");
  mkdirSync(apk, { recursive: true });
  writeFileSync(join(apk, "app-release.apk"), "old build");
  const result = fixture.run("build");
  assert.equal(result.status, 8);
  assert.equal(existsSync(join(fixture.root, "test-results")), false);
  assert.doesNotMatch(result.stdout, /APK:/);
});

test("Docker не обещает смену режима без сборки и проверяет сценарий до запуска Android", (t) => {
  const fixture = setup(t);
  const mode = fixture.run("test", "--no-build", "--mode", "demo");
  assert.equal(mode.status, 1);
  assert.match(mode.stderr, /не переключает --mode/);
  const missing = fixture.run("test", "missing.yaml");
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Сценарий не найден/);
});
