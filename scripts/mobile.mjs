import { execFile, spawn } from "node:child_process";
import {
  accessSync,
  closeSync,
  constants,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";
import { setTimeout as sleep } from "node:timers/promises";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const outputDir = join(projectRoot, "test-results/mobile");
const exec = promisify(execFile);
const log = (message) => console.log(`[Лад] ${message}`);

function executable(path) {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function environment() {
  const sdk =
    process.env.ANDROID_HOME ||
    process.env.ANDROID_SDK_ROOT ||
    join(
      homedir(),
      process.platform === "darwin" ? "Library/Android/sdk" : "Android/Sdk",
    );
  const adb = join(sdk, "platform-tools/adb");
  const emulator = join(sdk, "emulator/emulator");
  if (!executable(adb) || !executable(emulator)) {
    throw new Error(
      "Не найден Android SDK с Platform-Tools и Android Emulator. " +
        "Установите их в Android Studio или укажите папку SDK в ANDROID_HOME.",
    );
  }
  const javaHome = [
    process.env.JAVA_HOME,
    join(homedir(), ".sdkman/candidates/java/current"),
    "/Applications/Android Studio.app/Contents/jbr/Contents/Home",
  ].find((path) => path && executable(join(path, "bin/java")));
  const paths = [
    ...(process.env.PATH || "").split(delimiter),
    join(sdk, "platform-tools"),
    join(sdk, "emulator"),
    join(homedir(), ".maestro/bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
  ].filter(Boolean);
  if (javaHome) paths.unshift(join(javaHome, "bin"));
  const env = {
    ...process.env,
    ANDROID_HOME: sdk,
    PATH: paths.join(delimiter),
    ...(javaHome ? { JAVA_HOME: javaHome } : {}),
  };
  const maestro = paths.map((path) => join(path, "maestro")).find(executable);
  return { adb, emulator, maestro, env };
}

async function readCommand(command, args, env) {
  const { stdout } = await exec(command, args, {
    cwd: projectRoot,
    env,
    timeout: 10000,
    maxBuffer: 1024 * 1024,
  });
  return stdout.trim();
}

async function readDevice(adb, serial, args, env) {
  try {
    return await readCommand(adb, ["-s", serial, ...args], env);
  } catch {
    // ADB может видеть устройство до готовности Android или консоли эмулятора.
    return "";
  }
}

function run(command, args, env) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) return resolveRun();
      const error = new Error(
        `Команда ${command} завершилась ${signal ? `по сигналу ${signal}` : `с кодом ${code}`}.`,
      );
      error.exitCode = code || (signal === "SIGINT" ? 130 : 1);
      reject(error);
    });
  });
}

async function findEmulator(avd, { adb, env }) {
  const devices = await readCommand(adb, ["devices"], env);
  for (const match of devices.matchAll(
    /^(emulator-\d+)\s+(?:device|offline)\b/gm,
  )) {
    const serial = match[1];
    const name = await readDevice(adb, serial, ["emu", "avd", "name"], env);
    if (name.split(/\r?\n/)[0] === avd) return serial;
  }
  return undefined;
}

async function ensureEmulator(requestedAvd, tools) {
  const { adb, emulator, env } = tools;
  const names = (await readCommand(emulator, ["-list-avds"], env))
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter(Boolean);
  if (!names.length) {
    throw new Error(
      "Создайте виртуальный телефон в Android Studio → Device Manager.",
    );
  }
  if (requestedAvd && !names.includes(requestedAvd)) {
    throw new Error(
      `Эмулятор «${requestedAvd}» не найден. Доступны: ${names.join(", ")}.`,
    );
  }
  if (!requestedAvd && names.length > 1) {
    throw new Error(
      `Найдено несколько эмуляторов: ${names.join(", ")}. Укажите нужный: --avd ИМЯ.`,
    );
  }
  const avd = requestedAvd || names[0];
  await readCommand(adb, ["start-server"], env);
  let serial = await findEmulator(avd, tools);
  let launchError;
  if (serial) {
    log(`Использую запущенный ${avd} (${serial}).`);
  } else {
    const logPath = join(outputDir, "emulator.log");
    log(`Запускаю ${avd}. Журнал: ${logPath}`);
    const logFile = openSync(logPath, "a");
    try {
      const child = spawn(emulator, ["-avd", avd, "-no-boot-anim"], {
        env,
        detached: true,
        stdio: ["ignore", logFile, logFile],
      });
      child.once("error", (error) => {
        launchError = error;
      });
      child.once("exit", (code) => {
        if (code)
          launchError = new Error(
            `Эмулятор завершился с кодом ${code}. См. ${logPath}`,
          );
      });
      child.unref();
    } finally {
      closeSync(logFile);
    }
  }
  log("Ожидаю готовности Android…");
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    if (launchError) throw launchError;
    serial ||= await findEmulator(avd, tools);
    if (serial) {
      const booted = await readDevice(
        adb,
        serial,
        ["shell", "getprop", "sys.boot_completed"],
        env,
      );
      const packageManager =
        booted === "1"
          ? await readDevice(
              adb,
              serial,
              ["shell", "pm", "path", "android"],
              env,
            )
          : "";
      if (packageManager.startsWith("package:")) {
        await readDevice(
          adb,
          serial,
          ["shell", "input", "keyevent", "KEYCODE_WAKEUP"],
          env,
        );
        await readDevice(adb, serial, ["shell", "wm", "dismiss-keyguard"], env);
        log(`Android готов: ${avd} (${serial}).`);
        return { serial, avd };
      }
    }
    await sleep(1500);
  }
  throw new Error(
    "Android не загрузился за 3 минуты. Проверьте окно эмулятора и test-results/mobile/emulator.log.",
  );
}

async function main() {
  const { values, positionals } = parseArgs({
    options: {
      avd: { type: "string" },
      "no-build": { type: "boolean", default: false },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });
  if (values.help) {
    console.log(`Запуск из терминала проекта:
  npm run emulator                           Запустить эмулятор
  npm run test:mobile -- ПУТЬ                 Собрать приложение и выполнить сценарий
  npm run test:mobile -- --no-build ПУТЬ      Проверить установленную сборку
  npm run test:mobile -- --avd Pixel_8 ПУТЬ   Выбрать эмулятор

ПУТЬ обязателен: укажите YAML или папку со сценариями выбранного режима.
Режим сборки и подготовка данных должны соответствовать сценарию; см. README → Мобильные тесты.
SDK, Maestro и Java определяются автоматически. Эмулятор остаётся открытым после тестов.`);
    return;
  }
  const [mode, ...files] = positionals;
  if (!["emulator", "test"].includes(mode))
    throw new Error("Используйте npm run emulator или npm run test:mobile.");
  if (mode === "emulator" && (files.length || values["no-build"]))
    throw new Error(
      "Для запуска эмулятора доступен только параметр --avd ИМЯ.",
    );
  if (process.platform === "win32")
    throw new Error("Этот скрипт рассчитан на macOS и Linux.");
  const flows = files.map((path) => resolve(projectRoot, path));
  if (mode === "test") {
    if (!flows.length)
      throw new Error(
        "Укажите файл сценария или папку: npm run test:mobile -- ПУТЬ. " +
          "Режим сборки и данные должны соответствовать выбранному сценарию.",
      );
    for (const path of flows) {
      if (!existsSync(path)) throw new Error(`Не найден сценарий: ${path}`);
    }
  }
  const tools = environment();
  if (mode === "test" && !tools.maestro)
    throw new Error(
      "Не найден Maestro CLI. Установите его по инструкции README → Мобильные тесты.",
    );
  mkdirSync(outputDir, { recursive: true });
  const { serial, avd } = await ensureEmulator(
    values.avd || process.env.LAD_ANDROID_AVD,
    tools,
  );
  if (mode === "emulator") return;

  const config = JSON.parse(
    readFileSync(join(projectRoot, "app.json"), "utf8"),
  );
  const appId = config.expo.android.package;
  const { adb, maestro, env } = tools;
  if (values["no-build"]) {
    log(
      "Проверяю готовую сборку; изменения исходников в этом режиме не собираются.",
    );
    const installed = await readDevice(
      adb,
      serial,
      ["shell", "pm", "path", appId],
      env,
    );
    if (!installed.startsWith("package:")) {
      const apk = join(
        projectRoot,
        "android/app/build/outputs/apk/release/app-release.apk",
      );
      if (!existsSync(apk))
        throw new Error(
          "Нет установленного приложения и готового APK. Повторите команду с тем же сценарием без --no-build.",
        );
      log("Устанавливаю готовый APK с сохранением данных приложения…");
      await run(adb, ["-s", serial, "install", "-r", apk], env);
    }
  } else {
    log("Собираю и устанавливаю актуальную release-сборку…");
    await run(
      process.execPath,
      [
        join(projectRoot, "node_modules/expo/bin/cli"),
        "run:android",
        "--variant",
        "release",
        "--device",
        avd,
        "--no-bundler",
      ],
      { ...env, CI: "1", EXPO_PUBLIC_RESET_ON_START: "false" },
    );
  }
  log("Запускаю мобильные тесты Maestro…");
  await run(
    maestro,
    [
      "--device",
      serial,
      "test",
      "--test-output-dir",
      join(outputDir, "maestro"),
      "--debug-output",
      join(outputDir, "maestro"),
      ...flows,
    ],
    env,
  );
  log("Мобильные тесты прошли. Артефакты: test-results/mobile/");
}

main().catch((error) => {
  console.error(`[Лад] ${error.message}`);
  process.exitCode = error.exitCode || 1;
});
