import { expect, test, type Page } from "@playwright/test";
import { createInitialState } from "../../src/domain/seed";
import {
  ACTIVE_PROFILE_KEY,
  PROFILE_REGISTRY_KEY,
  PROFILE_KEYS,
  profileStorageKey,
} from "./helpers";

const TODAY = "2026-10-15";
const custom = "profile-11111111-1111-4111-8111-111111111111" as const;
const JOURNAL_KEY = "lad-profile-recovery-v1";
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const snapshot = (amount: number) => {
  const state = createInitialState(false, TODAY);
  state.settings.onboardingCompleted = true;
  state.settings.exchange = { automatic: false, rates: {} };
  state.accounts[0].openingBalance = amount;
  return JSON.stringify(state);
};
const initial = {
  [PROFILE_KEYS.personal]: snapshot(1000000),
  [profileStorageKey(custom)]: snapshot(25000),
};
async function readAll(page: Page) {
  return page.evaluate(() =>
    Object.fromEntries(
      Object.entries(localStorage)
        .filter(([key]) => key.startsWith("lad-"))
        .sort(([a], [b]) => a.localeCompare(b)),
    ),
  );
}
async function startBroken(page: Page, missing = false) {
  await page.clock.install({ time: new Date(`${TODAY}T12:00:00+04:00`) });
  await page.route("https://api.frankfurter.dev/**", (route) => route.abort());
  await page.addInitScript(
    ({ initial, registryKey, activeKey, custom, missing }) => {
      if (sessionStorage.getItem("a01-fixture-installed")) return;
      for (const [key, raw] of Object.entries(initial)) {
        if (missing && key.includes("personal:")) continue;
        localStorage.setItem(key, raw);
      }
      if (!missing) localStorage.setItem(registryKey, "broken-registry-a01");
      localStorage.setItem(activeKey, custom);
      sessionStorage.setItem("a01-fixture-installed", "true");
    },
    {
      initial,
      registryKey: PROFILE_REGISTRY_KEY,
      activeKey: ACTIVE_PROFILE_KEY,
      custom,
      missing,
    },
  );
  await page.goto("/");
  await expect(button(page, "Проверить сохранённые профили")).toBeVisible();
  await expect(button(page, "Настроить свой учёт")).toHaveCount(0);
  await expect(button(page, "Добавить операцию")).toHaveCount(0);
}
async function chooseCustom(page: Page) {
  await button(page, "Проверить сохранённые профили").click();
  await button(page, "Выбрать профиль: Восстановленный профиль 1").click();
}
async function expectRecovered(page: Page) {
  await expect(
    button(page, "Текущий профиль: Восстановленный профиль 1. Открыть профили"),
  ).toBeVisible();
  const values = await readAll(page);
  expect(values[JOURNAL_KEY]).toBeUndefined();
  expect(values[ACTIVE_PROFILE_KEY]).toBe(custom);
  expect(values[profileStorageKey(custom)]).toBe(
    initial[profileStorageKey(custom)],
  );
  expect(JSON.parse(values[PROFILE_REGISTRY_KEY])).toEqual({
    version: 1,
    profiles: [
      { id: "personal", name: "Личный" },
      { id: custom, name: "Восстановленный профиль 1" },
    ],
  });
}

test("A01: scan and cancellation write nothing; explicit recovery preserves both exact ledgers", async ({
  page,
}, testInfo) => {
  await startBroken(page);
  const before = await readAll(page);
  await chooseCustom(page);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(
      button(page, "Подтвердить восстановление списка"),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`a01-preview-${width}.png`),
      fullPage: true,
    });
    await button(
      page,
      "Подтвердить восстановление списка",
    ).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(`a01-confirm-${width}.png`),
      fullPage: true,
    });
    await button(
      page,
      "Проверить сохранённые профили",
    ).scrollIntoViewIfNeeded();
  }
  expect(await readAll(page)).toEqual(before);
  await button(page, "Отмена проверки профилей").click();
  expect(await readAll(page)).toEqual(before);
  await chooseCustom(page);
  await button(page, "Подтвердить восстановление списка").click();
  await expectRecovered(page);
  expect((await readAll(page))[PROFILE_KEYS.personal]).toBe(
    initial[PROFILE_KEYS.personal],
  );
  await page.reload();
  await expectRecovered(page);
});

for (const boundary of ["before-catalog", "after-catalog"] as const) {
  test(`A01: journal resumes after ${boundary} failure before ordinary startup`, async ({
    page,
  }) => {
    await startBroken(page);
    await chooseCustom(page);
    await page.evaluate(
      ({ boundary, catalog, journal }) => {
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function (name, value) {
          if (
            this === localStorage &&
            ((boundary === "before-catalog" && name === catalog) ||
              (boundary === "after-catalog" &&
                name === journal &&
                JSON.parse(value).stage === "catalog-verified"))
          )
            throw new DOMException(
              "A01 injected storage failure",
              "QuotaExceededError",
            );
          return original.call(this, name, value);
        };
      },
      { boundary, catalog: PROFILE_REGISTRY_KEY, journal: JOURNAL_KEY },
    );
    await button(page, "Подтвердить восстановление списка").click();
    await expect(
      button(page, "Продолжить восстановление списка"),
    ).toBeVisible();
    const pending = JSON.parse((await readAll(page))[JOURNAL_KEY]);
    expect(pending.targetId).toBe(custom);
    expect(pending.stage).toBe("prepared");
    expect((await readAll(page))[PROFILE_KEYS.personal]).toBe(
      initial[PROFILE_KEYS.personal],
    );
    await page.reload();
    if (boundary === "before-catalog") {
      await expect(
        button(page, "Продолжить восстановление списка"),
      ).toBeVisible();
      expect(JSON.parse((await readAll(page))[JOURNAL_KEY]).operationId).toBe(
        pending.operationId,
      );
      await expect(button(page, "Настроить свой учёт")).toHaveCount(0);
      await button(page, "Продолжить восстановление списка").click();
    }
    await expectRecovered(page);
    expect((await readAll(page))[PROFILE_KEYS.personal]).toBe(
      initial[PROFILE_KEYS.personal],
    );
  });
}

test("A01: absent catalog with a custom ledger never creates an empty personal snapshot", async ({
  page,
}) => {
  await startBroken(page, true);
  expect((await readAll(page))[PROFILE_KEYS.personal]).toBeUndefined();
  await chooseCustom(page);
  await expect(
    page.getByText("Сохранённый снимок не найден", { exact: true }),
  ).toBeVisible();
  await expect(button(page, "Выбрать профиль: Личный")).toBeDisabled();
  expect((await readAll(page))[PROFILE_KEYS.personal]).toBeUndefined();
  await button(page, "Подтвердить восстановление списка").click();
  await expectRecovered(page);
  expect((await readAll(page))[PROFILE_KEYS.personal]).toBeUndefined();
  await page.reload();
  await expectRecovered(page);
  expect((await readAll(page))[PROFILE_KEYS.personal]).toBeUndefined();
});

test("A01: trial restore rechecks today's date before any write when a verified file becomes inapplicable", async ({
  page,
}) => {
  await startBroken(page);
  const before = await readAll(page);
  const imported = createInitialState(false, TODAY);
  imported.settings.exchange = { automatic: false, rates: {} };
  imported.transactions = [
    {
      id: "a01-dated-income",
      type: "income",
      title: "Синтетический доход",
      amount: 100,
      baseAmount: 100,
      date: TODAY,
      category: "other",
      accountId: "card",
    },
  ];
  await button(page, "Восстановить в новый профиль").click();
  const chooser = page.waitForEvent("filechooser");
  await button(page, "Выбрать копию для нового профиля").click();
  await (
    await chooser
  ).setFiles({
    name: "a01-dated-copy.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(imported)),
  });
  await page
    .getByLabel("Название нового профиля", { exact: true })
    .fill("Проверка даты");
  await button(page, "Подготовить восстановление в новый профиль").click();
  await expect(
    button(page, "Подтвердить создание профиля из копии"),
  ).toBeVisible();
  // The file has already passed the picker. Moving the application clock back
  // makes its actual income a future fact; the provider must recheck at commit.
  await page.clock.setSystemTime(new Date("2026-10-14T12:00:00+04:00"));
  await button(page, "Подтвердить создание профиля из копии").click();
  await expect(
    page.getByText(
      "Не удалось прочитать файл. Выберите резервную копию Лада в формате JSON.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(await readAll(page)).toEqual(before);
  await expect(button(page, "Проверить сохранённые профили")).toBeVisible();
});
