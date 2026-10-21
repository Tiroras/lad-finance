import { expect, test, type Page } from "@playwright/test";
import { build } from "esbuild";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import type * as Harness from "../helpers/t08ReminderUiHarness";

type Browser = typeof globalThis & { __browserTestModule: typeof Harness };
let bundle: string;
let fontCss: string;
const NOW = new Date("2026-10-20T12:00:00+04:00").getTime();
const button = (page: Page, name: string | RegExp) =>
  page.getByRole("button", { name, exact: typeof name === "string" });

test.beforeAll(async () => {
  fontCss = (
    await Promise.all(
      ["400Regular", "500Medium", "600SemiBold", "700Bold", "800ExtraBold"].map(
        async (face) => {
          const data = await readFile(
            resolve(
              `node_modules/@expo-google-fonts/manrope/${face}/Manrope_${face}.ttf`,
            ),
          );
          return `@font-face { font-family: "Manrope_${face}"; src: url(data:font/ttf;base64,${data.toString("base64")}) format("truetype"); }`;
        },
      ),
    )
  ).join("\n");
  const stubs = resolve("tests/helpers/t08ReminderUiStubs.ts");
  const result = await build({
    entryPoints: [resolve("tests/helpers/t08ReminderUiHarness.tsx")],
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    globalName: "__browserTestModule",
    target: "es2022",
    define: { "process.env.NODE_ENV": '"development"', __DEV__: "true" },
    plugins: [
      {
        name: "t08-controlled-native-seams",
        setup(build) {
          build.onResolve({ filter: /state\/finance$/ }, () => ({
            path: stubs,
          }));
          build.onResolve(
            { filter: /infrastructure\/notifications\/notifications$/ },
            () => ({ path: stubs }),
          );
          build.onResolve({ filter: /^react-native$/ }, () => ({
            path: "react-native",
            namespace: "t08-native",
          }));
          build.onLoad({ filter: /.*/, namespace: "t08-native" }, () => ({
            contents: `
              export * from "react-native-web";
              export { View as InputAccessoryView } from "react-native-web";
              export { Platform, AppState, Linking } from ${JSON.stringify(stubs)};
            `,
            resolveDir: process.cwd(),
            loader: "js",
          }));
          build.onResolve({ filter: /shared\/ui$/ }, () => ({
            path: "shared-controls",
            namespace: "t08-controls",
          }));
          build.onLoad({ filter: /.*/, namespace: "t08-controls" }, () => ({
            // Keep real controls and omit unused barrel exports that import
            // native SVG/Sheet adapters unrelated to this settings form.
            contents: [
              "theme",
              "Button",
              "Card",
              "Field",
              "Notice",
              "Section",
              "Segments",
              "Txt",
            ]
              .map(
                (name) =>
                  `export * from ${JSON.stringify(resolve(`src/shared/ui/${name}`))};`,
              )
              .join("\n"),
            resolveDir: process.cwd(),
            loader: "js",
          }));
          build.onResolve({ filter: /(?:^|\/)Icon$/ }, (args) =>
            args.importer.includes("/src/shared/ui/")
              ? { path: "Icon", namespace: "t08-icon" }
              : undefined,
          );
          build.onLoad({ filter: /.*/, namespace: "t08-icon" }, () => ({
            // Retain icon space without loading the Expo icon/font adapter.
            contents: `
              import { createElement } from "react";
              export function Icon({size = 22}) {
                return createElement("span", {
                  "aria-hidden": true,
                  style: {width: size, height: size, flexShrink: 0, display: "inline-block"}
                });
              }
            `,
            resolveDir: process.cwd(),
            loader: "js",
          }));
        },
      },
    ],
  });
  bundle = result.outputFiles[0].text;
});

async function start(
  page: Page,
  options: Parameters<typeof Harness.mount>[0] = {},
) {
  await page.route("https://lad-t08-reminders.invalid/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><title>T08 controlled reminder UI</title>',
    }),
  );
  await page.goto("https://lad-t08-reminders.invalid/");
  await page.addStyleTag({ content: fontCss });
  await page.evaluate(async () => {
    await Promise.all(
      ["400Regular", "500Medium", "600SemiBold", "700Bold", "800ExtraBold"].map(
        (face) => document.fonts.load(`14px "Manrope_${face}"`),
      ),
    );
    await document.fonts.ready;
  });
  await page.clock.install({ time: NOW });
  await page.clock.pauseAt(NOW);
  await page.addScriptTag({ content: bundle });
  await page.evaluate((options) => {
    (globalThis as Browser).__browserTestModule.mount(options);
  }, options);
}
async function snapshot(page: Page) {
  return page.evaluate(() =>
    (globalThis as Browser).__browserTestModule.snapshot(),
  );
}
async function nextCall(page: Page, count: number) {
  await page.clock.runFor(300);
  await expect
    .poll(async () => (await snapshot(page)).calls.length)
    .toBe(count);
}
async function resolveReady(
  page: Page,
  index: number,
  overrides: Parameters<typeof Harness.readyResult>[0] = {},
) {
  await page.evaluate(
    ({ index, overrides }) => {
      const h = (globalThis as Browser).__browserTestModule;
      h.resolveSync(index, h.readyResult(overrides));
    },
    { index, overrides },
  );
  await expect
    .poll(async () => (await snapshot(page)).context?.updating)
    .toBe(false);
}
async function noHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
}

test("T08 provider invalidates ready immediately and retries a failed current update", async ({
  page,
}) => {
  await start(page);
  await nextCall(page, 1);
  await resolveReady(page, 0);
  expect((await snapshot(page)).context?.result?.count).toBe(60);
  expect((await snapshot(page)).context?.lastSuccessAt).toBe(NOW);

  await page.evaluate(() =>
    (globalThis as Browser).__browserTestModule.changeFinanceState(),
  );
  let state = await snapshot(page);
  expect(state.context?.updating).toBe(true);
  expect(state.context?.result?.status).not.toBe("ready");
  expect(state.calls).toHaveLength(1);
  await expect(page.getByText(/В очереди этого профиля: 60/)).toHaveCount(0);

  await nextCall(page, 2);
  await page.evaluate(() =>
    (globalThis as Browser).__browserTestModule.rejectSync(1),
  );
  await expect
    .poll(async () => (await snapshot(page)).context?.error)
    .not.toBe("");
  state = await snapshot(page);
  expect(state.context?.updating).toBe(false);
  expect(state.context?.result?.status).not.toBe("ready");
  expect(state.context?.lastSuccessAt).toBe(NOW);
  await button(page, /Повторить/).click();
  await nextCall(page, 3);
  expect((await snapshot(page)).calls[2].buffer).toBe(
    (await snapshot(page)).calls[1].buffer,
  );
  await resolveReady(page, 2, {
    count: 4,
    truncated: false,
    syncedAt: NOW + 1000,
  });
  expect((await snapshot(page)).context?.result?.count).toBe(4);
  expect((await snapshot(page)).context?.error).toBe("");
  expect((await snapshot(page)).context?.lastSuccessAt).toBe(NOW + 1000);

  await page.evaluate(() =>
    (globalThis as Browser).__browserTestModule.activate(),
  );
  await nextCall(page, 4);
  expect((await snapshot(page)).context?.updating).toBe(true);
});

test("T08 provider ignores late profiles and hides the old profile success while loading", async ({
  page,
}) => {
  await start(page);
  await nextCall(page, 1);
  await resolveReady(page, 0);
  await page.evaluate(() => {
    const h = (globalThis as Browser).__browserTestModule;
    h.changeFinanceState();
  });
  await nextCall(page, 2);
  await page.evaluate(() => {
    const h = (globalThis as Browser).__browserTestModule;
    h.changeEnvironment({
      profile: h.SECOND_PROFILE,
      profileName: "Семейный",
      switching: true,
    });
  });
  expect((await snapshot(page)).context?.result).toBeNull();
  expect((await snapshot(page)).context?.lastSuccessAt).toBeUndefined();
  await page.clock.runFor(500);
  expect((await snapshot(page)).calls).toHaveLength(2);
  await page.evaluate(() => {
    const h = (globalThis as Browser).__browserTestModule;
    h.resolveSync(1, h.readyResult({ count: 59 }));
    h.changeEnvironment({ switching: false, ready: false });
  });
  await page.clock.runFor(500);
  expect((await snapshot(page)).calls).toHaveLength(2);
  expect((await snapshot(page)).context?.result).toBeNull();
  await page.evaluate(() =>
    (globalThis as Browser).__browserTestModule.changeEnvironment({
      ready: true,
    }),
  );
  await nextCall(page, 3);
  await page.evaluate(() => {
    const h = (globalThis as Browser).__browserTestModule;
    h.resolveSync(
      2,
      h.readyResult({
        profile: h.SECOND_PROFILE,
        count: 2,
        truncated: false,
        syncedAt: h.readyResult().syncedAt + 2000,
      }),
    );
  });
  await expect
    .poll(async () => (await snapshot(page)).context?.result?.count)
    .toBe(2);
  expect((await snapshot(page)).context?.lastSuccessAt).toBe(NOW + 2000);
  await expect(page.getByText(/Семейный/)).toBeVisible();
});

test("T08 provider rejects a late same-profile result and confirms disabled queue cleanup", async ({
  page,
}) => {
  await start(page);
  await nextCall(page, 1);
  await page.evaluate(() =>
    (globalThis as Browser).__browserTestModule.changeFinanceState(),
  );
  await nextCall(page, 2);
  await resolveReady(page, 1, { count: 7, truncated: false });
  await page.evaluate(() => {
    const h = (globalThis as Browser).__browserTestModule;
    h.resolveSync(0, h.readyResult({ count: 60 }));
  });
  await page.clock.runFor(50);
  expect((await snapshot(page)).context?.result?.count).toBe(7);
  await button(page, "Выключить напоминания").click();
  expect((await snapshot(page)).context?.updating).toBe(true);
  expect((await snapshot(page)).context?.result?.status).not.toBe("ready");
  await nextCall(page, 3);
  expect((await snapshot(page)).calls[2].enabled).toBe(false);
  await page.evaluate(() => {
    const h = (globalThis as Browser).__browserTestModule;
    h.resolveSync(2, h.offResult());
  });
  await expect
    .poll(async () => (await snapshot(page)).context?.updating)
    .toBe(false);
  expect((await snapshot(page)).context?.result?.status).toBe("off");
  await expect(button(page, "Включить напоминания")).toBeVisible();
  await expect(page.getByText(/выключены|отключены|очищена/i)).toBeVisible();
});

for (const width of [320, 390, 1440]) {
  test(`T08 verified queue metadata fits ${width}px without claiming complete same-day coverage`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await start(page, {
      profileName: "Семейный бюджет и важные платежи октября",
    });
    await nextCall(page, 1);
    await resolveReady(page, 0);
    await expect(page.getByText(/Семейный бюджет/)).toBeVisible();
    await expect(page.getByText(/В очереди.*60/)).toBeVisible();
    await expect(page.getByText(/60 календарных дней/)).toBeVisible();
    await expect(page.getByText(/18 декабря 2026/)).toBeVisible();
    await expect(
      page.getByText(/Последнее сообщение в очереди:.*20 октября 2026.*15:00/),
    ).toBeVisible();
    await expect(
      page.getByText(
        /Первое непоместившееся сообщение:.*20 октября 2026.*15:00/,
      ),
    ).toBeVisible();
    await expect(
      page.getByText(/не означает полного покрытия этой даты/i),
    ).toBeVisible();
    await noHorizontalOverflow(page);
    await page.screenshot({
      path: info.outputPath(`reminder-queue-${width}.png`),
      animations: "disabled",
      fullPage: true,
    });
  });
}

test("T08 queue status distinguishes actual zero, unknown count, denial reasons and retry", async ({
  page,
}, info) => {
  await start(page);
  await page.evaluate(() => {
    const h = (globalThis as Browser).__browserTestModule;
    h.showStatus({
      result: h.readyResult({
        count: 0,
        truncated: false,
        lastNotificationAt: undefined,
        firstOmittedAt: undefined,
      }),
    });
  });
  await expect(page.getByText(/В очереди.*0/)).toBeVisible();
  await expect(
    page.getByText(/нет.*напоминаний|нет.*событий|очередь пуста/i),
  ).toBeVisible();
  await page.evaluate(() => {
    const h = (globalThis as Browser).__browserTestModule;
    h.showStatus({
      result: h.errorResult({
        count: 1,
        error: "Синтетическая частичная ошибка.",
      }),
      error: "Синтетическая частичная ошибка.",
      lastSuccessAt: h.readyResult().syncedAt,
    });
  });
  await expect(page.getByText(/Синтетическая частичная ошибка/)).toBeVisible();
  await expect(
    page.getByText(/найдено: 1.*Соответствие плану не подтверждено/i),
  ).toBeVisible();
  await button(page, /Повторить/).click();
  expect((await snapshot(page)).retries).toBe(1);
  await page.evaluate(() => {
    const h = (globalThis as Browser).__browserTestModule;
    h.showStatus({
      result: h.errorResult({
        count: null,
        error: "Синтетическая ошибка чтения.",
      }),
      error: "Синтетическая ошибка чтения.",
    });
  });
  await expect(
    page.getByText(
      /неизвест|не удалось.*количеств|количество.*не.*подтвержден/i,
    ),
  ).toBeVisible();
  await expect(page.getByText(/В очереди.*0/)).toHaveCount(0);
  for (const deniedReason of ["permission", "channel"] as const) {
    await page.evaluate((deniedReason) => {
      const h = (globalThis as Browser).__browserTestModule;
      h.showStatus({
        result: h.deniedResult(deniedReason),
      });
    }, deniedReason);
    await expect(
      page.getByText(
        deniedReason === "channel"
          ? /канал.*отключ|отключ.*канал/i
          : /разрешение.*отключ|не разрешены|разрешение.*не.*выдан/i,
      ),
    ).toBeVisible();
  }
  await noHorizontalOverflow(page);
  await page.screenshot({
    path: info.outputPath("reminder-channel-denied-390.png"),
    animations: "disabled",
    fullPage: true,
  });
});

test("T08 settings validate local hours before saving and retain the enabled preference", async ({
  page,
}) => {
  await start(page);
  const hour = page.getByLabel("Час напоминания", { exact: true });
  for (const invalid of ["", "24", "-1", "aa"]) {
    await hour.fill(invalid);
    await button(page, "Сохранить время").click();
    await expect(page.getByText("Введите час от 0 до 23.")).toBeVisible();
    expect((await snapshot(page)).saves).toEqual([]);
  }
  for (const valid of ["0", "23"]) {
    await hour.fill(valid);
    await button(page, "Сохранить время").click();
    expect((await snapshot(page)).preferences?.hour).toBe(Number(valid));
    expect((await snapshot(page)).preferences?.enabled).toBe(true);
    await expect(page.getByText("Введите час от 0 до 23.")).toHaveCount(0);
  }
  expect((await snapshot(page)).saves).toEqual([{ hour: 0 }, { hour: 23 }]);
});

test("T08 enabling handles denied and failed permission requests without changing preferences", async ({
  page,
}) => {
  await start(page, { enabled: false });
  await page.evaluate(() =>
    (globalThis as Browser).__browserTestModule.setPermission(false),
  );
  await button(page, "Включить напоминания").click();
  await expect(page.getByText(/Уведомления не разрешены/)).toBeVisible();
  expect((await snapshot(page)).preferences?.enabled).toBe(false);
  expect((await snapshot(page)).saves).toEqual([]);
  await button(page, "Настройки телефона").click();
  expect((await snapshot(page)).settingsCalls).toBe(1);
  await page.evaluate(() =>
    (globalThis as Browser).__browserTestModule.setPermission("error"),
  );
  await button(page, "Включить напоминания").click();
  await expect(page.getByText(/Не удалось включить напоминания/)).toBeVisible();
  expect((await snapshot(page)).saves).toEqual([]);
  await page.evaluate(() =>
    (globalThis as Browser).__browserTestModule.setPermission(true),
  );
  await button(page, "Включить напоминания").click();
  expect((await snapshot(page)).preferences?.enabled).toBe(true);
  expect((await snapshot(page)).saves).toEqual([{ enabled: true }]);
  expect((await snapshot(page)).permissionCalls).toBe(3);
  await expect(
    page.getByLabel("Час напоминания", { exact: true }),
  ).toBeVisible();
});

test("T08 a permission prompt from a previous profile cannot enable reminders in the next profile", async ({
  page,
}) => {
  await start(page, { enabled: false });
  await page.evaluate(() =>
    (globalThis as Browser).__browserTestModule.setPermission("pending"),
  );
  await button(page, "Включить напоминания").click();
  expect((await snapshot(page)).permissionCalls).toBe(1);
  await expect(button(page, "Включить напоминания")).toBeDisabled();
  await page.evaluate(() => {
    const h = (globalThis as Browser).__browserTestModule;
    h.changeEnvironment({
      profile: h.SECOND_PROFILE,
      profileName: "Семейный",
      enabled: false,
    });
    h.resolvePermission(true);
  });
  await page.clock.runFor(50);
  await expect(button(page, "Включить напоминания")).toBeEnabled();
  expect((await snapshot(page)).preferences?.enabled).toBe(false);
  expect((await snapshot(page)).saves).toEqual([]);
  await expect(page.getByText(/Семейный/)).toBeVisible();
});
