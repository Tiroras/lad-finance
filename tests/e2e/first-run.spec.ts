import { expect, test, type Page } from "@playwright/test";
import { accountBalance } from "../../src/domain/accountBalances";
import { saveTransaction } from "../../src/domain/actions/transactions";
import { createInitialState } from "../../src/domain/seed";
import {
  ACTIVE_PROFILE_KEY,
  PROFILE_KEYS,
  PROFILE_REGISTRY_KEY,
  activeProfile,
  readState,
  startApp,
} from "./helpers";

const TODAY = "2026-09-10";
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const welcome = (page: Page) =>
  page.getByText("Добро пожаловать в Лад", { exact: true });

async function startFresh(page: Page) {
  await page.clock.install({ time: new Date(`${TODAY}T12:00:00+04:00`) });
  await page.goto("/");
  await expect(welcome(page)).toBeVisible();
}

async function expectNoProfile(page: Page) {
  expect(
    await page.evaluate(
      ({ active, registry }) => ({
        active: localStorage.getItem(active),
        registry: localStorage.getItem(registry),
        ledgers: Object.keys(localStorage).filter(
          (key) =>
            key.startsWith("lad-profile-") && key.includes(":lad-finance"),
        ),
      }),
      { active: ACTIVE_PROFILE_KEY, registry: PROFILE_REGISTRY_KEY },
    ),
  ).toEqual({ active: null, registry: null, ledgers: [] });
}

async function expectOverview(page: Page) {
  await expect(button(page, "Профиль и настройки")).toBeVisible();
  await expect(welcome(page)).toHaveCount(0);
  await expect.poll(() => activeProfile(page)).toBe("personal");
}

test.beforeEach(async ({ page }) => {
  await page.route("https://api.frankfurter.dev/**", (route) => route.abort());
});

test("welcome creates no profile until an explicit choice and can be skipped after reload", async ({
  page,
}, testInfo) => {
  await startFresh(page);
  await expectNoProfile(page);
  await expect(button(page, "Профиль и настройки")).toHaveCount(0);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(button(page, "Начать знакомство")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`first-welcome-${width}.png`),
      animations: "disabled",
    });
  }
  await button(page, "Пропустить знакомство").click();
  await expect(
    page.getByText("Ваш личный профиль", { exact: true }),
  ).toBeVisible();
  await expectNoProfile(page);
  await button(page, "Назад").click();
  await expect(welcome(page)).toBeVisible();
  await page.reload();
  await expect(welcome(page)).toBeVisible();
  await expectNoProfile(page);
  await button(page, "Пропустить знакомство").click();
  await button(page, "Начать с пустым профилем").click();
  await expectOverview(page);
  const state = await readState(page);
  expect(state.demo).toBe(false);
  expect(state.transactions).toEqual([]);
  expect(state.accounts.every((account) => account.openingBalance === 0)).toBe(
    true,
  );
  expect(state.categories.every((category) => category.budget === 0)).toBe(
    true,
  );
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!),
      PROFILE_REGISTRY_KEY,
    ),
  ).toEqual({ version: 1, profiles: [{ id: "personal", name: "Личный" }] });
  await page.reload();
  await expectOverview(page);
  expect(await readState(page)).toEqual(state);
  await expect(button(page, "Начать знакомство")).toHaveCount(0);
});

test("skipping learning and choosing setup opens the first form step directly", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await startFresh(page);
  await button(page, "Пропустить знакомство").click();
  await expectNoProfile(page);
  await button(page, "Настроить свой учёт").click();
  await expect(page.getByLabel("Ваше имя", { exact: true })).toBeVisible();
  await expect(welcome(page)).toHaveCount(0);
  expect(await activeProfile(page)).toBe("personal");
  const before = await readState(page);
  expect(before.demo).toBe(false);
  expect(before.settings.onboardingCompleted).toBe(false);
  expect(before.transactions).toEqual([]);
  await page.getByLabel("Ваше имя", { exact: true }).fill("Анна");
  await page.getByLabel("Начальный остаток", { exact: true }).fill("2500");
  await page.getByLabel("Начальные накопления", { exact: true }).fill("100");
  await button(page, "Продолжить").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("first-setup-320.png"),
    animations: "disabled",
  });
  await button(page, "Продолжить").click();
  await button(page, "Продолжить").click();
  await button(page, "Продолжить").click();
  expect(await readState(page)).toEqual(before);
  await button(page, "Начать учёт с этими данными").click();
  await expect
    .poll(async () => (await readState(page)).settings.onboardingCompleted)
    .toBe(true);
  const state = await readState(page);
  expect(accountBalance(state, "card", TODAY)).toBe(250000);
  expect(accountBalance(state, "savings", TODAY)).toBe(10000);
  expect(state.transactions).toEqual([]);
  await page.reload();
  await expectOverview(page);
  await expect(page.getByText("Анна, всё на виду.")).toBeVisible();
  expect(await readState(page)).toEqual(state);
});

test("an existing ledger can tour the real screens and resume without changing its money or profile", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const fixture = createInitialState(false, TODAY);
  fixture.settings.exchange = { automatic: false, rates: {} };
  fixture.accounts[0].openingBalance = 123456;
  const state = saveTransaction(
    fixture,
    {
      type: "expense",
      title: "Сохранённая покупка",
      amount: 1234,
      date: TODAY,
      accountId: "card",
      category: "groceries",
    },
    TODAY,
  );
  await startApp(page, TODAY, state);
  await expectOverview(page);
  const registry = await page.evaluate(
    (key) => localStorage.getItem(key),
    PROFILE_REGISTRY_KEY,
  );
  await button(page, "Профиль и настройки").click();
  await button(page, "Обучение").click();
  await button(page, "Операции").click();
  const coach = page.getByTestId("tour-coach");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(coach).toHaveCount(1);
  await expect(
    coach.getByRole("heading", {
      name: "Поиск и фильтры операций",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page
      .getByTestId("screen-transactions")
      .getByText("Ваши операции", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByTestId("screen-transactions")
      .getByText("Сохранённая покупка", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByTestId("tour-target-transactions.expense"),
  ).toBeInViewport({ ratio: 1 });
  await page.screenshot({
    path: testInfo.outputPath("existing-ledger-tour-320.png"),
    animations: "disabled",
  });
  await page.getByRole("tab", { name: "Расходы", exact: true }).click();
  await expect(
    coach.getByRole("heading", { name: "Выгрузка истории", exact: true }),
  ).toBeVisible();
  await button(page, "Продолжить позже").click();
  await expect(coach).toHaveCount(0);
  expect(await readState(page)).toEqual(state);
  await page.reload();
  await expectOverview(page);
  await button(page, "Продолжить обучение").click();
  await expect(
    coach.getByRole("heading", { name: "Выгрузка истории", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("screen-transactions")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await button(page, "Продолжить позже").click();
  expect(await readState(page)).toEqual(state);
  expect(await activeProfile(page)).toBe("personal");
  expect(
    await page.evaluate(
      (key) => localStorage.getItem(key),
      PROFILE_REGISTRY_KEY,
    ),
  ).toBe(registry);
});

test("an existing valid empty ledger opens directly and is never mistaken for a first launch", async ({
  page,
}) => {
  const state = createInitialState(false, TODAY);
  state.settings.onboardingCompleted = false;
  state.settings.exchange = { automatic: false, rates: {} };
  await startApp(page, TODAY, state);
  await expectOverview(page);
  expect(await readState(page)).toEqual(state);
  await expect(button(page, "Настроить свой учёт")).toBeVisible();
});

for (const [name, raw] of [
  ["empty", ""],
  ["corrupt", "unreadable-existing-ledger"],
] as const) {
  test(`an existing ${name} storage record shows recovery and cannot start a replacement profile`, async ({
    page,
  }) => {
    await page.clock.install({ time: new Date(`${TODAY}T12:00:00+04:00`) });
    await page.addInitScript(
      ({ key, value }) => localStorage.setItem(key, value),
      { key: PROFILE_KEYS.personal, value: raw },
    );
    await page.goto("/");
    await expect(
      page.getByText(
        /Не удалось прочитать сохранённые данные или список профилей/,
      ),
    ).toBeVisible();
    await expect(welcome(page)).toHaveCount(0);
    await expect(
      button(page, "Выбрать копию для восстановления"),
    ).toBeVisible();
    await expect(button(page, "Начать с пустым профилем")).toHaveCount(0);
    expect(
      await page.evaluate(
        (key) => localStorage.getItem(key),
        PROFILE_KEYS.personal,
      ),
    ).toBe(raw);
  });
}

test("a failed first save keeps the welcome choice open and creates no profile until a successful retry", async ({
  page,
}) => {
  await page.addInitScript((key) => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (
        this === localStorage &&
        name === key &&
        sessionStorage.getItem("first-profile-save-allowed") !== "yes"
      ) {
        throw new DOMException(
          "Недостаточно места для сохранения",
          "QuotaExceededError",
        );
      }
      return setItem.call(this, name, value);
    };
  }, PROFILE_KEYS.personal);
  await startFresh(page);
  await button(page, "Пропустить знакомство").click();
  await button(page, "Начать с пустым профилем").click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(
    page.getByText("Ваш личный профиль", { exact: true }),
  ).toBeVisible();
  await expect(button(page, "Профиль и настройки")).toHaveCount(0);
  await expectNoProfile(page);
  await page.evaluate(() =>
    sessionStorage.setItem("first-profile-save-allowed", "yes"),
  );
  await button(page, "Начать с пустым профилем").click();
  await expectOverview(page);
  const state = await readState(page);
  expect(state.demo).toBe(false);
  expect(state.transactions).toEqual([]);
  await page.reload();
  await expectOverview(page);
  expect(await readState(page)).toEqual(state);
});

test("old shared storage and an orphan preference do not bypass welcome or get overwritten", async ({
  page,
}) => {
  const legacy = JSON.stringify(createInitialState(true, TODAY));
  await page.addInitScript(
    ({ raw, active }) => {
      if (!localStorage.getItem("legacy-first-run-fixture")) {
        localStorage.setItem("lad-finance-v1", raw);
        localStorage.setItem(active, "demo");
        localStorage.setItem("legacy-first-run-fixture", "installed");
      }
    },
    { raw: legacy, active: ACTIVE_PROFILE_KEY },
  );
  await startFresh(page);
  expect(
    await page.evaluate(
      (key) => localStorage.getItem(key),
      PROFILE_KEYS.personal,
    ),
  ).toBeNull();
  expect(
    await page.evaluate(
      (key) => localStorage.getItem(key),
      PROFILE_REGISTRY_KEY,
    ),
  ).toBeNull();
  expect(
    await page.evaluate(() => localStorage.getItem("lad-finance-v1")),
  ).toBe(legacy);
  await button(page, "Пропустить знакомство").click();
  await button(page, "Начать с пустым профилем").click();
  await expectOverview(page);
  expect((await readState(page)).transactions).toEqual([]);
  expect((await readState(page)).demo).toBe(false);
  expect(
    await page.evaluate(() => localStorage.getItem("lad-finance-v1")),
  ).toBe(legacy);
});

test("retrying after a registry save failure publishes the already saved first ledger without writing it again", async ({
  page,
}) => {
  await page.addInitScript(
    ({ ledger, registry }) => {
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (name, value) {
        if (this === localStorage && name === ledger) {
          const count = Number(
            sessionStorage.getItem("first-ledger-write-count") ?? "0",
          );
          setItem.call(
            sessionStorage,
            "first-ledger-write-count",
            String(count + 1),
          );
        }
        if (
          this === localStorage &&
          name === registry &&
          sessionStorage.getItem("first-registry-save-allowed") !== "yes"
        ) {
          throw new DOMException(
            "Не удалось сохранить список профилей",
            "QuotaExceededError",
          );
        }
        return setItem.call(this, name, value);
      };
    },
    { ledger: PROFILE_KEYS.personal, registry: PROFILE_REGISTRY_KEY },
  );
  await startFresh(page);
  await button(page, "Пропустить знакомство").click();
  await button(page, "Начать с пустым профилем").click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(
    page.getByText("Ваш личный профиль", { exact: true }),
  ).toBeVisible();
  await expect(button(page, "Профиль и настройки")).toHaveCount(0);
  const stored = await page.evaluate(
    (key) => localStorage.getItem(key),
    PROFILE_KEYS.personal,
  );
  expect(stored).not.toBeNull();
  expect(JSON.parse(stored!).transactions).toEqual([]);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), ACTIVE_PROFILE_KEY),
  ).toBeNull();
  expect(
    await page.evaluate(
      (key) => localStorage.getItem(key),
      PROFILE_REGISTRY_KEY,
    ),
  ).toBeNull();
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("first-ledger-write-count"),
    ),
  ).toBe("1");
  await page.evaluate(() =>
    sessionStorage.setItem("first-registry-save-allowed", "yes"),
  );
  await button(page, "Начать с пустым профилем").click();
  await expectOverview(page);
  expect(
    await page.evaluate(
      (key) => localStorage.getItem(key),
      PROFILE_KEYS.personal,
    ),
  ).toBe(stored);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("first-ledger-write-count"),
    ),
  ).toBe("1");
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!),
      PROFILE_REGISTRY_KEY,
    ),
  ).toEqual({ version: 1, profiles: [{ id: "personal", name: "Личный" }] });
});
