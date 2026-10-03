import { execFile, spawn } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { createConnection, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";

const root = fileURLToPath(new URL("..", import.meta.url));
const exec = promisify(execFile);
const output = join(root, "test-results/mobile/docker");
const log = (message) => console.log(`[Лад / Docker] ${message}`);

async function read(command, args, env) {
  const { stdout } = await exec(command, args, {
    cwd: root,
    env,
    timeout: 15000,
    maxBuffer: 1024 * 1024,
  });
  return stdout.trim();
}

function run(command, args, env, cwd = root) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) return resolveRun();
      const error = new Error(
        `${command}: ${signal ? `сигнал ${signal}` : `код завершения ${code}`}.`,
      );
      error.exitCode = code || 1;
      reject(error);
    });
  });
}

async function requireHostAdb() {
  await new Promise((resolveConnection, reject) => {
    const socket = createConnection({ host: "127.0.0.1", port: 5037 });
    socket.setTimeout(3000);
    socket.once("connect", () => {
      socket.destroy();
      resolveConnection();
    });
    const fail = () => {
      socket.destroy();
      reject(
        new Error(
          "Контейнер не видит ADB на компьютере. Запустите эмулятор в Android Studio. " +
            "В Docker Desktop включите Settings → Resources → Network → Enable host networking.",
        ),
      );
    };
    socket.once("error", fail);
    socket.once("timeout", fail);
  });
}

async function selectDevice(requested, env) {
  await requireHostAdb();
  const devices = await read("adb", ["devices"], env);
  const serials = [...devices.matchAll(/^(emulator-\d+)\s+device\b/gm)].map(
    (match) => match[1],
  );
  if (requested && !serials.includes(requested)) {
    throw new Error(
      `Эмулятор ${requested} не подключён. Доступны: ${serials.join(", ") || "нет"}.`,
    );
  }
  if (!serials.length) {
    throw new Error(
      "Запустите виртуальный телефон в Android Studio → Device Manager.",
    );
  }
  if (!requested && serials.length > 1) {
    throw new Error(
      `Подключены ${serials.join(", ")}. Укажите --device emulator-XXXX.`,
    );
  }
  const serial = requested || serials[0];
  log(`Ожидаю загрузки ${serial}…`);
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    try {
      const boot = await read(
        "adb",
        ["-s", serial, "shell", "getprop", "sys.boot_completed"],
        env,
      );
      const ready =
        boot === "1" &&
        (await read(
          "adb",
          ["-s", serial, "shell", "pm", "path", "android"],
          env,
        ));
      if (ready && ready.startsWith("package:")) return serial;
    } catch {
      // The emulator can appear in ADB before its package manager is ready.
    }
    await sleep(1000);
  }
  throw new Error(`Android на ${serial} не загрузился за 3 минуты.`);
}

async function prebuild(env, cwd = root) {
  await run(
    process.execPath,
    [
      join(root, "node_modules/expo/bin/cli"),
      "prebuild",
      "--platform",
      "android",
      "--no-install",
      "--no-clean",
    ],
    env,
    cwd,
  );
}

async function initializeAndroidVolume(env) {
  if (existsSync(join(root, "android/gradlew"))) return;
  // An empty volume is an existing but invalid project to Expo. Generate its
  // initial contents elsewhere: a mount point itself cannot be removed.
  const staging = mkdtempSync(join(tmpdir(), "lad-android-prebuild-"));
  const excluded = new Set([
    "android",
    "ios",
    ".git",
    ".expo",
    "dist",
    "test-results",
    "playwright-report",
  ]);
  try {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (excluded.has(entry.name) || entry.name.startsWith(".env")) continue;
      const from = join(root, entry.name);
      const to = join(staging, entry.name);
      if (entry.isDirectory()) symlinkSync(from, to, "dir");
      else copyFileSync(from, to);
    }
    await prebuild(env, staging);
    cpSync(join(staging, "android"), join(root, "android"), {
      recursive: true,
    });
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

async function build(mode, abi, port, env) {
  log(`Собираю Android: режим ${mode}, архитектура ${abi}.`);
  await initializeAndroidVolume(env);
  await prebuild(env);
  const variant = mode === "fresh" ? "Debug" : "Release";
  await run(
    "sh",
    [
      "gradlew",
      `:app:assemble${variant}`,
      "--no-daemon",
      "--no-watch-fs",
      "--console=plain",
      "--max-workers=2",
      "--init-script",
      join(root, "docker/build-mode.gradle"),
      `-PreactNativeArchitectures=${abi}`,
      `-PreactNativeDevServerPort=${port}`,
    ],
    env,
    join(root, "android"),
  );
  const name = variant.toLowerCase();
  const apk = join(
    root,
    `android/app/build/outputs/apk/${name}/app-${name}.apk`,
  );
  mkdirSync(output, { recursive: true });
  copyFileSync(apk, join(output, `app-${mode}.apk`));
  log(`APK: test-results/mobile/docker/app-${mode}.apk`);
  return apk;
}

async function startMetro(port, env) {
  await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", () =>
      reject(
        new Error(
          `Порт ${port} занят. Укажите свободный через --port; существующий сервер не остановлен.`,
        ),
      ),
    );
    server.listen(port, "127.0.0.1", () => server.close(resolvePort));
  });
  const child = spawn(
    process.execPath,
    [
      "node_modules/expo/bin/cli",
      "start",
      "--localhost",
      "--port",
      String(port),
    ],
    {
      cwd: root,
      // Expo must not install the desktop DevTools shell in this headless image.
      env: { ...env, EXPO_UNSTABLE_HEADLESS: "1" },
      stdio: ["ignore", "inherit", "inherit"],
      detached: true,
    },
  );
  let launchError;
  child.once("error", (error) => {
    launchError = error;
  });
  const stop = () => {
    if (child.pid && child.exitCode === null) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        /* Already stopped. */
      }
    }
  };
  try {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      if (launchError) throw launchError;
      if (child.exitCode !== null)
        throw new Error("Metro завершился до запуска тестов.");
      try {
        const response = await fetch(`http://127.0.0.1:${port}/status`, {
          signal: AbortSignal.timeout(1000),
        });
        if ((await response.text()).includes("packager-status:running"))
          return stop;
      } catch {
        // Metro has not started listening yet.
      }
      await sleep(500);
    }
    throw new Error("Metro не запустился за минуту.");
  } catch (error) {
    stop();
    throw error;
  }
}

async function main() {
  const { values, positionals } = parseArgs({
    options: {
      mode: { type: "string" },
      device: { type: "string" },
      abi: { type: "string" },
      port: { type: "string", default: "8095" },
      "no-build": { type: "boolean", default: false },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });
  if (values.help) {
    console.log(`docker compose run --rm android [test|build|doctor] [параметры] [ПУТЬ]
  test ПУТЬ                    Собрать, установить и выполнить выбранный сценарий
  build                        Только собрать APK, без эмулятора
  doctor                       Проверить связь с Android-эмулятором
  --mode default|demo|fresh    Режим приложения (по умолчанию default)
  --no-build                   Проверить уже установленную release-сборку
  --device emulator-5554       Выбрать эмулятор
  --port 8095                  Отдельный порт Metro для Fresh
  --abi arm64-v8a              Архитектура APK при отдельной сборке

Для test обязателен ПУТЬ: YAML или папка со сценариями выбранного режима.
Подготовка данных должна соответствовать сценарию; см. docs/DOCKER.md.
Fresh удаляет данные всех профилей Лада на выбранном тестовом эмуляторе.`);
    return;
  }
  const [command = "test", ...files] = positionals;
  const mode = values.mode || "default";
  if (
    !["test", "build", "doctor"].includes(command) ||
    !["default", "demo", "fresh"].includes(mode)
  ) {
    throw new Error(
      "Неверная команда или режим. Справка: docker compose run --rm android --help",
    );
  }
  if (values["no-build"] && (command !== "test" || values.mode)) {
    throw new Error(
      "--no-build проверяет установленную сборку и не переключает --mode.",
    );
  }
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("Укажите порт от 1024 до 65535.");
  const env = {
    ...process.env,
    EXPO_PUBLIC_ENABLE_DEMO: String(mode === "demo"),
    EXPO_PUBLIC_RESET_ON_START: String(mode === "fresh"),
  };
  const flows = files.map((path) => resolve(root, path));
  if (command === "test") {
    if (!flows.length)
      throw new Error(
        "Укажите файл сценария или папку: docker compose run --rm android test ПУТЬ. " +
          "Режим --mode и данные должны соответствовать выбранному сценарию.",
      );
    for (const path of flows) {
      if (!existsSync(path)) throw new Error(`Сценарий не найден: ${path}`);
    }
  }
  const serial =
    command === "build" ? undefined : await selectDevice(values.device, env);
  if (command === "doctor") {
    log(`Android доступен: ${serial}.`);
    return;
  }
  const abi =
    values.abi ||
    (serial
      ? await read(
          "adb",
          ["-s", serial, "shell", "getprop", "ro.product.cpu.abi"],
          env,
        )
      : "arm64-v8a,x86_64");
  if (
    !abi
      .split(",")
      .every((item) =>
        ["arm64-v8a", "armeabi-v7a", "x86_64", "x86"].includes(item),
      )
  )
    throw new Error("Неподдерживаемая архитектура Android.");
  const appId = JSON.parse(readFileSync(join(root, "app.json"), "utf8")).expo
    .android.package;
  if (!values["no-build"]) {
    const apk = await build(mode, abi, port, env);
    if (command === "build") return;
    await run("adb", ["-s", serial, "install", "-r", apk], env);
  } else {
    const installed = await read(
      "adb",
      ["-s", serial, "shell", "pm", "path", appId],
      env,
    );
    if (!installed.startsWith("package:"))
      throw new Error(
        "Приложение не установлено. Повторите команду без --no-build.",
      );
    log("Проверяю установленную сборку. Исходники и режим не обновляются.");
  }
  let stopMetro;
  let reversed = false;
  try {
    await read(
      "adb",
      ["-s", serial, "shell", "input", "keyevent", "KEYCODE_WAKEUP"],
      env,
    );
    if (mode === "fresh") {
      log(
        "Fresh: при запуске будут очищены все профили Лада на выбранном эмуляторе.",
      );
      stopMetro = await startMetro(port, env);
      await run(
        "adb",
        ["-s", serial, "reverse", "--no-rebind", `tcp:${port}`, `tcp:${port}`],
        env,
      );
      reversed = true;
    }
    mkdirSync(output, { recursive: true });
    await run(
      "maestro",
      [
        "--device",
        serial,
        "test",
        "--test-output-dir",
        output,
        "--debug-output",
        output,
        ...flows,
      ],
      env,
    );
    log("Мобильные тесты прошли.");
  } finally {
    if (reversed)
      await read(
        "adb",
        ["-s", serial, "reverse", "--remove", `tcp:${port}`],
        env,
      ).catch(() => {});
    stopMetro?.();
  }
}

main().catch((error) => {
  console.error(`[Лад / Docker] ${error.message}`);
  process.exitCode = error.exitCode || 1;
});
