import { expect, test, type TestInfo } from "@playwright/test";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { promisify } from "node:util";
import {
  readState,
  PROFILE_KEYS,
  openProfiles,
  finishFirstRun,
} from "./helpers";

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = resolve(__dirname, "../..");
const EXPO_CLI = require.resolve("expo/bin/cli");
const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

async function exportWeb(
  testInfo: TestInfo,
  name: string,
  demo: boolean,
  reset: boolean,
) {
  const outputDir = testInfo.outputPath(name);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CI: "1",
    EXPO_OFFLINE: "1",
    EXPO_NO_DOTENV: "1",
    EXPO_PUBLIC_RESET_ON_START: reset ? "true" : "false",
  };
  delete env.EXPO_PUBLIC_ENABLE_DEMO;
  if (demo) env.EXPO_PUBLIC_ENABLE_DEMO = "true";
  let log = "";
  try {
    // Deliberately reuse Metro's transform cache when changing the build flag.
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [
        EXPO_CLI,
        "export",
        "--platform",
        "web",
        "--max-workers",
        "2",
        "--output-dir",
        outputDir,
      ],
      {
        cwd: PROJECT_ROOT,
        env,
        timeout: 180000,
        maxBuffer: 5 * 1024 * 1024,
      },
    );
    log = `${stdout}\n${stderr}`;
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    log = `${failure.stdout ?? ""}\n${failure.stderr ?? ""}`;
    throw error;
  } finally {
    await testInfo.attach(`${name}-export.log`, {
      body: Buffer.from(log),
      contentType: "text/plain",
    });
  }
  return outputDir;
}

async function serveExport(outputDir: string) {
  const root = resolve(outputDir);
  const server = createServer(async (request, response) => {
    let pathname: string;
    try {
      pathname = decodeURIComponent(
        new URL(request.url ?? "/", "http://127.0.0.1").pathname,
      );
    } catch {
      response.writeHead(400).end();
      return;
    }
    const file = resolve(
      root,
      `.${pathname === "/" ? "/index.html" : pathname}`,
    );
    if (!file.startsWith(`${root}${sep}`)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const content = await readFile(file);
      response.writeHead(200, {
        "Content-Type":
          CONTENT_TYPES[extname(file)] ?? "application/octet-stream",
      });
      response.end(content);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Не удалось определить порт проверки экспорта.");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}

test("production exports switch personal → demo → personal without clearing Metro's cache", async ({
  browser,
}, testInfo) => {
  test.setTimeout(600000);
  for (const [name, demo, reset] of [
    ["personal-first", false, false],
    ["demo", true, false],
    ["personal-again", false, true],
  ] as const) {
    await test.step(name, async () => {
      const outputDir = await exportWeb(testInfo, name, demo, reset);
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        locale: "ru-RU",
        timezoneId: "Europe/Samara",
      });
      try {
        const server = await serveExport(outputDir);
        try {
          const page = await context.newPage();
          page.setDefaultTimeout(15000);
          const errors: string[] = [];
          page.on("pageerror", (error) => errors.push(error.message));
          await page.clock.install({
            time: new Date("2026-09-10T12:00:00+04:00"),
          });
          await page.route("https://api.frankfurter.dev/**", (route) =>
            route.abort(),
          );
          await page.goto(server.url);
          await expect(
            page.getByText("Добро пожаловать в Лад", { exact: true }),
          ).toBeVisible();
          await finishFirstRun(page);
          await expect(
            page.getByRole("button", {
              name: "Профиль и настройки",
              exact: true,
            }),
          ).toBeVisible();
          await expect
            .poll(() =>
              page.evaluate(
                (key) => localStorage.getItem(key) !== null,
                PROFILE_KEYS.personal,
              ),
            )
            .toBe(true);
          const state = await readState(page);
          expect(state.demo).toBe(false);
          expect(state.transactions).toEqual([]);
          await expect(
            page.getByRole("button", {
              name: "Посмотреть пример",
              exact: true,
            }),
          ).toHaveCount(0);
          await expect(
            page.getByRole("button", {
              name: "Текущий профиль: Демо. Открыть профили",
              exact: true,
            }),
          ).toHaveCount(0);
          await page
            .getByRole("button", { name: "Настроить свой учёт", exact: true })
            .click();
          await page
            .getByRole("button", { name: "Настроить свой учёт", exact: true })
            .click();
          await expect(
            page.getByLabel("Ваше имя", { exact: true }),
          ).toBeVisible();
          expect((await readState(page)).demo).toBe(false);
          await page
            .getByRole("button", { name: "Закрыть", exact: true })
            .click();
          // Even a release built with the development reset flag must retain
          // profiles and open the saved ledger after a complete reload.
          state.settings.name = "Проверка сохранённого профиля";
          await page.evaluate(
            ({ key, state }) =>
              localStorage.setItem(key, JSON.stringify(state)),
            { key: PROFILE_KEYS.personal, state },
          );
          await page.reload();
          await expect(
            page.getByRole("button", {
              name: "Профиль и настройки",
              exact: true,
            }),
          ).toBeVisible();
          await expect(
            page.getByText("Добро пожаловать в Лад", { exact: true }),
          ).toHaveCount(0);
          expect(await readState(page)).toEqual(state);
          await openProfiles(page);
          const demoEntry = page.getByRole("button", {
            name: "Открыть профиль: Демо",
            exact: true,
          });
          await expect(demoEntry).toHaveCount(demo ? 1 : 0);
          if (demo) {
            await demoEntry.click();
            await expect(
              page.getByRole("button", {
                name: "Текущий профиль: Демо. Открыть профили",
                exact: true,
              }),
            ).toBeVisible();
            await expect
              .poll(async () => (await readState(page)).demo)
              .toBe(true);
            expect((await readState(page)).transactions.length).toBeGreaterThan(
              0,
            );
            expect(await readState(page, "personal")).toEqual(state);
          }
          await page.screenshot({
            path: testInfo.outputPath(`${name}-profiles.png`),
            animations: "disabled",
          });
          expect(errors).toEqual([]);
        } finally {
          await server.close();
        }
      } finally {
        await context.close();
      }
    });
  }
});
