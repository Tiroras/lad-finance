import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

const adapter = fileURLToPath(new URL("../docker/bin/adb", import.meta.url));

function setup(t: TestContext, legacy = false) {
  const sdk = mkdtempSync(join(tmpdir(), "lad SDK "));
  t.after(() => rmSync(sdk, { recursive: true, force: true }));
  mkdirSync(join(sdk, "platform-tools"));
  const calls = join(sdk, "commands.jsonl");
  writeFileSync(
    join(sdk, "platform-tools/adb"),
    `#!/usr/bin/env node
const {appendFileSync} = require('node:fs');
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(calls)}, JSON.stringify(args) + '\\n');
if (args.includes('getprop')) {
  if (!${legacy} || args.at(-1) === 'ro.kernel.qemu.avd_name') console.log('Pixel_8');
} else process.exit(7);
`,
    { mode: 0o755 },
  );
  return {
    run: (...args: string[]) =>
      spawnSync("sh", [adapter, ...args], {
        env: { ...process.env, ANDROID_HOME: sdk },
        encoding: "utf8",
        timeout: 5000,
      }),
    calls: () =>
      readFileSync(calls, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as string[]),
  };
}

test("Docker ADB читает настоящее имя выбранного AVD через shell", (t) => {
  const fixture = setup(t);
  const result = fixture.run("-s", "emulator-5556", "emu", "avd", "name");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "Pixel_8\nOK\n");
  assert.deepEqual(fixture.calls(), [
    ["-s", "emulator-5556", "shell", "getprop", "ro.boot.qemu.avd_name"],
  ]);
});

test("Docker ADB поддерживает прежнее свойство имени AVD", (t) => {
  const fixture = setup(t, true);
  const result = fixture.run("-s", "emulator-5554", "emu", "avd", "name");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "Pixel_8\nOK\n");
  assert.equal(fixture.calls().at(-1)?.at(-1), "ro.kernel.qemu.avd_name");
});

test("Docker ADB сохраняет аргументы и ошибку настоящей установки APK", (t) => {
  const fixture = setup(t);
  const args = ["-s", "emulator-5556", "install", "-r", "/build/app test.apk"];
  const result = fixture.run(...args);
  assert.equal(result.status, 7);
  assert.deepEqual(fixture.calls(), [args]);
});
