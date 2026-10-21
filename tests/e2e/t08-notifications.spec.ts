import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import { resolve } from "node:path";
import { bundleBrowserModule } from "./browserBundle";
import type * as NotificationCases from "../helpers/t08NotificationCases";
import type { BrowserDomainOutcome } from "../helpers/browserDomainTestShim";

type Browser = typeof globalThis & {
  __browserTestModule: typeof NotificationCases;
};
let bundle: string;
let nativeBundle: string;
test.beforeAll(async () => {
  bundle = await bundleBrowserModule("tests/helpers/t08NotificationCases.ts");
  const native = await build({
    entryPoints: [
      resolve("src/infrastructure/notifications/notifications.native.ts"),
    ],
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    globalName: "__t08NativeModule",
    target: "es2022",
    plugins: [
      {
        name: "native-notification-ports",
        setup(context) {
          context.onResolve(
            { filter: /^(react-native|expo-notifications\/build\/)/ },
            ({ path }) => ({ path, namespace: "native-stub" }),
          );
          context.onLoad({ filter: /.*/, namespace: "native-stub" }, () => ({
            contents: [
              "Platform",
              "IosAuthorizationStatus",
              "AndroidImportance",
              "AndroidNotificationVisibility",
              "SchedulableTriggerInputTypes",
              "setNotificationHandler",
              "setNotificationChannelAsync",
              "getNotificationChannelAsync",
              "getPermissionsAsync",
              "requestPermissionsAsync",
              "getAllScheduledNotificationsAsync",
              "cancelScheduledNotificationAsync",
              "scheduleNotificationAsync",
              "getLastNotificationResponse",
              "clearLastNotificationResponseAsync",
              "addNotificationResponseReceivedListener",
            ]
              .map(
                (name) =>
                  `export const ${name} = globalThis.__t08NativeStub.${name};`,
              )
              .join("\n"),
            loader: "js",
          }));
        },
      },
    ],
  });
  nativeBundle = native.outputFiles[0].text;
});

for (const native of [false, true]) {
  test(`T08 ${native ? "native adapter with SDK-shaped browser ports" : "queue failure, readback and concurrency cases"} in Chromium`, async ({
    page,
  }, testInfo) => {
    await page.clock.install({ time: new Date("2026-10-20T08:00:00+04:00") });
    await page.addScriptTag({ content: bundle });
    const results = await page.evaluate(
      async ({ native, nativeBundle }) => {
        const module = (globalThis as Browser).__browserTestModule;
        const cases = native
          ? module.nativeAdapterCases(nativeBundle)
          : module.t08NotificationCases;
        const results = [];
        for (const entry of cases) {
          try {
            await entry.run();
            results.push({ name: entry.name, passed: true, error: "" });
          } catch (cause) {
            results.push({
              name: entry.name,
              passed: false,
              error:
                cause instanceof Error
                  ? cause.stack || cause.message
                  : String(cause),
            });
          }
        }
        return results;
      },
      { native, nativeBundle },
    );
    await testInfo.attach(
      native ? "t08-native-browser-ports" : "t08-queue-cases",
      {
        body: JSON.stringify(results, null, 2),
        contentType: "application/json",
      },
    );
    expect(results).toHaveLength(native ? 8 : 23);
    expect(results.filter((entry) => !entry.passed)).toEqual([]);
  });
}

test("T08 existing profile notification regressions execute in Chromium", async ({
  page,
}, testInfo) => {
  await page.addScriptTag({
    content: await bundleBrowserModule("tests/profileNotifications.test.ts", {
      domainTestShims: true,
    }),
  });
  const results = await page.evaluate(() =>
    (
      globalThis as unknown as {
        __runBrowserDomainTests: () => Promise<BrowserDomainOutcome[]>;
      }
    ).__runBrowserDomainTests(),
  );
  await testInfo.attach("profile-notifications-browser-regressions", {
    body: JSON.stringify(results, null, 2),
    contentType: "application/json",
  });
  expect(results).toHaveLength(8);
  expect(results.filter((entry) => !entry.passed)).toEqual([]);
});
