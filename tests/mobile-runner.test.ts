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
import { delimiter, join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

const runner = fileURLToPath(new URL("../scripts/mobile.mjs", import.meta.url));
const flowDirectory = "tests/mobile/demo";
const flowFile = `${flowDirectory}/example.yaml`;
type Invocation = { tool: string; args: string[] };

function setup(
  t: TestContext,
  options: {
    cold?: boolean;
    ambiguous?: boolean;
    fail?: boolean;
    buildFailure?: boolean;
  } = {},
) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "lad-mobile-runner-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const sdk = join(root, "sdk");
  const bin = join(root, "bin");
  const logFile = join(root, "commands.jsonl");
  const fixtureRunner = join(root, "scripts/mobile.mjs");
  mkdirSync(join(root, "scripts"));
  mkdirSync(join(root, flowDirectory), { recursive: true });
  writeFileSync(
    join(root, flowFile),
    "appId: app.lad.finance\n---\n- launchApp\n",
  );
  copyFileSync(runner, fixtureRunner);
  writeFileSync(
    join(root, "app.json"),
    JSON.stringify({ expo: { android: { package: "app.lad.finance" } } }),
  );
  const stub = `#!/usr/bin/env node
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
const options = ${JSON.stringify(options)};
const root = ${JSON.stringify(root)};
const tool = basename(process.argv[1]);
const args = process.argv.slice(2);
appendFileSync(join(root, 'commands.jsonl'), JSON.stringify({ tool, args }) + '\\n');
const bootFile = join(root, 'boot');
if (tool === 'emulator') {
  if (args[0] === '-list-avds') console.log(options.ambiguous ? 'Pixel_8\\nTablet' : 'Pixel_8');
  else writeFileSync(bootFile, '0');
} else if (tool === 'adb') {
  if (args[0] === 'devices') {
    console.log('List of devices attached\\nphysical-phone\\tdevice\\nemulator-5554\\tdevice');
    if (!options.cold || existsSync(bootFile)) console.log('emulator-5556\\tdevice');
  } else if (args[0] === '-s') {
    if (args[2] === 'emu') console.log(args[1] === 'emulator-5556' ? 'Pixel_8\\nOK' : 'Other_Phone\\nOK');
    else if (args[3] === 'getprop') {
      const count = existsSync(bootFile) ? Number(readFileSync(bootFile, 'utf8')) : 1;
      console.log(count > 0 ? '1' : '0');
      if (options.cold) writeFileSync(bootFile, String(count + 1));
    } else if (args[3] === 'pm') console.log('package:/test/app.apk');
  }
} else if (tool === 'cli') {
  if (options.buildFailure) process.exitCode = 8;
  else if (args[args.indexOf('--device') + 1] !== 'Pixel_8') process.exitCode = 9;
} else if (tool === 'maestro' && options.fail) process.exitCode = 7;
`;
  for (const path of [
    join(sdk, "platform-tools/adb"),
    join(sdk, "emulator/emulator"),
    join(bin, "maestro"),
    join(root, "node_modules/expo/bin/cli"),
  ]) {
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, stub, { mode: 0o755 });
  }
  return {
    root,
    run: (...args: string[]) =>
      spawnSync(process.execPath, [fixtureRunner, ...args], {
        encoding: "utf8",
        timeout: 30000,
        env: {
          ...process.env,
          ANDROID_HOME: sdk,
          LAD_ANDROID_AVD: "",
          PATH: `${bin}${delimiter}${process.env.PATH || ""}`,
        },
      }),
    calls: () =>
      existsSync(logFile)
        ? readFileSync(logFile, "utf8")
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line) as Invocation)
        : [],
  };
}

test("мобильный запуск требует явный сценарий до обращения к эмулятору и сборки", (t) => {
  const fixture = setup(t);
  for (const args of [["test"], ["test", "--no-build"]]) {
    const result = fixture.run(...args);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Укажите файл сценария или папку/);
    assert.deepEqual(fixture.calls(), []);
    assert.equal(existsSync(join(fixture.root, "test-results")), false);
  }
  const missing = fixture.run("test", "missing.yaml");
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Не найден сценарий/);
  assert.deepEqual(fixture.calls(), []);
});

test("мобильный запуск выбирает нужный эмулятор и сохраняет установленное приложение", (t) => {
  const fixture = setup(t);
  const result = fixture.run("test", "--no-build", flowFile);
  assert.equal(result.status, 0, result.stderr);
  const calls = fixture.calls();
  assert.equal(
    calls.filter((call) => call.tool === "emulator" && call.args[0] === "-avd")
      .length,
    0,
  );
  assert.equal(
    calls.some((call) => call.args.includes("physical-phone")),
    false,
  );
  assert.equal(
    calls.some((call) =>
      call.args.some((arg) => ["uninstall", "clear", "install"].includes(arg)),
    ),
    false,
  );
  const maestro = calls.find((call) => call.tool === "maestro");
  assert.deepEqual(maestro?.args.slice(0, 3), [
    "--device",
    "emulator-5556",
    "test",
  ]);
  assert.equal(maestro!.args.at(-1), join(fixture.root, flowFile));
});

test("Expo собирает для имени AVD, а Maestro проверяет его через адрес ADB", (t) => {
  const fixture = setup(t);
  const result = fixture.run("test", flowDirectory);
  assert.equal(result.status, 0, result.stderr);
  const calls = fixture.calls();
  const build = calls.findIndex((call) => call.tool === "cli");
  const maestro = calls.findIndex((call) => call.tool === "maestro");
  assert.ok(build >= 0 && maestro > build);
  assert.deepEqual(calls[build].args, [
    "run:android",
    "--variant",
    "release",
    "--device",
    "Pixel_8",
    "--no-bundler",
  ]);
  assert.deepEqual(calls[maestro].args.slice(0, 3), [
    "--device",
    "emulator-5556",
    "test",
  ]);
  assert.equal(calls[maestro].args.at(-1), join(fixture.root, flowDirectory));
});

test("при ошибке сборки тесты не проверяют старое приложение", (t) => {
  const fixture = setup(t, { buildFailure: true });
  const result = fixture.run("test", flowFile);
  assert.equal(result.status, 8);
  assert.equal(
    fixture.calls().some((call) => call.tool === "maestro"),
    false,
  );
  assert.doesNotMatch(result.stdout, /Мобильные тесты прошли/);
});

test("холодный запуск ждёт готовности Android перед Maestro", (t) => {
  const fixture = setup(t, { cold: true });
  const result = fixture.run("test", "--no-build", flowFile);
  assert.equal(result.status, 0, result.stderr);
  const calls = fixture.calls();
  assert.deepEqual(
    calls.find((call) => call.tool === "emulator" && call.args[0] === "-avd")
      ?.args,
    ["-avd", "Pixel_8", "-no-boot-anim"],
  );
  const bootChecks = calls.filter((call) =>
    call.args.includes("sys.boot_completed"),
  );
  assert.ok(bootChecks.length >= 2);
  const ready = calls.findIndex(
    (call) => call.args.slice(-3).join(" ") === "pm path android",
  );
  const maestro = calls.findIndex((call) => call.tool === "maestro");
  assert.ok(ready >= 0 && maestro > ready);
});

test("ошибка Maestro сохраняет код завершения и не объявляет тест успешным", (t) => {
  const fixture = setup(t, { fail: true });
  const result = fixture.run("test", "--no-build", flowFile);
  assert.equal(result.status, 7);
  assert.doesNotMatch(result.stdout, /Мобильные тесты прошли/);
});

test("при нескольких AVD запуск требует явного выбора устройства", (t) => {
  const fixture = setup(t, { ambiguous: true });
  const result = fixture.run("emulator");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--avd/);
  assert.deepEqual(
    fixture.calls().map((call) => call.tool),
    ["emulator"],
  );
});
