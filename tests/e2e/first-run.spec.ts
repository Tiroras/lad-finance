import { expect, test, type Page } from "@playwright/test";
import { accountBalance } from "../../src/domain/accountBalances";
import { saveTransaction } from "../../src/domain/actions/transactions";
import { createInitialState } from "../../src/domain/seed";
import {
  ACTIVE_PROFILE_KEY,
  PROFILE_KEYS,
  PROFILE_REGISTRY_KEY,
  activeProfile,
  finishAccountSetup,
  readState,
  startApp,
} from "./helpers";

const TODAY = "2026-09-10";
const LEARNING_PROGRESS_KEY = "lad-learning-progress-v1";
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

async function learningProgress(page: Page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, LEARNING_PROGRESS_KEY);
}

async function learningStatus(page: Page) {
  return (await learningProgress(page))?.status ?? null;
}

async function expectSetup(page: Page) {
  await expect(
    page.getByRole("heading", {
      name: "Начнём ваш учёт",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("Шаг 1 из 4", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Ваше имя", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("sheet")).toHaveCount(0);
  await expect(button(page, "Профиль и настройки")).toHaveCount(0);
  await expect(button(page, "Закрыть")).toHaveCount(0);
  await expectNoTour(page);
}

async function expectOffer(page: Page) {
  await expect(
    page.getByRole("heading", {
      name: "Хотите пройти обучение?",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(button(page, "Профиль и настройки")).toHaveCount(0);
  await expectNoTour(page);
}

async function expectNoTour(page: Page) {
  await expect(page.getByTestId("tour-coach")).toHaveCount(0);
  await expect(page.getByTestId("tour-overlay")).toHaveCount(0);
  await expect(button(page, "Продолжить обучение")).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  await page.route("https://api.frankfurter.dev/**", (route) => route.abort());
});

test("welcome has one action and learning is offered only after full-screen account setup", async ({
  page,
}, testInfo) => {
  await startFresh(page);
  await expectNoProfile(page);
  await expect(page.getByRole("button")).toHaveCount(1);
  await expect(button(page, "Пройти обучение")).toHaveCount(0);
  await expect(button(page, "Начать без обучения")).toHaveCount(0);
  await page.clock.runFor(30_000);
  await expectNoTour(page);
  expect(await learningProgress(page)).toBeNull();
  await expect(button(page, "Профиль и настройки")).toHaveCount(0);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 640 });
    await expect(button(page, "Настроить свой учёт")).toBeInViewport({
      ratio: 1,
    });
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
  await page.reload();
  await expect(welcome(page)).toBeVisible();
  await expectNoProfile(page);
  await expectNoTour(page);
  expect(await learningProgress(page)).toBeNull();
  await button(page, "Настроить свой учёт").click();
  await expectSetup(page);
  expect(await learningProgress(page)).toMatchObject({
    status: "new",
    firstRun: "setup",
  });
  await finishAccountSetup(page);
  await expectOffer(page);
  await expect(page.getByRole("button")).toHaveCount(2);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 640 });
    await expect(button(page, "Пройти обучение")).toBeInViewport({ ratio: 1 });
    await expect(button(page, "Начать без обучения")).toBeInViewport({
      ratio: 1,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`learning-offer-${width}.png`),
      animations: "disabled",
    });
  }
  await page.clock.runFor(30_000);
  await expectNoTour(page);
  expect(await learningStatus(page)).toBe("new");
  await button(page, "Начать без обучения").click();
  await expectOverview(page);
  await expectNoTour(page);
  expect(await learningStatus(page)).toBe("skipped");
  expect(await learningProgress(page)).not.toHaveProperty("firstRun");
  const state = await readState(page);
  expect(state.demo).toBe(false);
  expect(state.settings.onboardingCompleted).toBe(true);
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
  ).toEqual({
    version: 1,
    profiles: [{ id: "personal", name: "Личный" }],
  });
  await page.reload();
  await expectOverview(page);
  await expectNoTour(page);
  expect(await readState(page)).toEqual(state);
  await expect(button(page, "Пройти обучение")).toHaveCount(0);
  await button(page, "Профиль и настройки").click();
  await button(page, "Обучение").click();
  await expect(button(page, "Продолжить экскурсию")).toHaveCount(0);
  await button(page, "Начать экскурсию").click();
  await expect(page.getByTestId("tour-coach")).toContainText("1 / 42");
  expect(await learningStatus(page)).toBe("started");
  expect(await readState(page)).toEqual(state);
});

test("setup preserves drafts through Back and commits balances only after confirmation before offering learning", async ({
  page,
}, testInfo) => {
  await startFresh(page);
  await button(page, "Настроить свой учёт").click();
  await expectSetup(page);
  expect(await activeProfile(page)).toBe("personal");
  const before = await readState(page);
  expect(before.settings.onboardingCompleted).toBe(false);
  expect(before.transactions).toEqual([]);
  await page.getByLabel("Ваше имя", { exact: true }).fill("Анна");
  await page.getByLabel("Начальный остаток", { exact: true }).fill("2500");
  await page.getByLabel("Начальные накопления", { exact: true }).fill("100");
  await button(page, "Продолжить").click();
  await expect(page.getByText("Шаг 2 из 4", { exact: true })).toBeVisible();
  await button(page, "Назад").click();
  await expectSetup(page);
  await expect(page.getByLabel("Ваше имя", { exact: true })).toHaveValue(
    "Анна",
  );
  await button(page, "Назад").click();
  await expect(welcome(page)).toBeVisible();
  await expect(page.getByRole("button")).toHaveCount(1);
  await button(page, "Настроить свой учёт").click();
  await expectSetup(page);
  await expect(page.getByLabel("Ваше имя", { exact: true })).toHaveValue(
    "Анна",
  );
  await expect(
    page.getByLabel("Начальный остаток", { exact: true }),
  ).toHaveValue("2 500");
  await expect(
    page.getByLabel("Начальные накопления", { exact: true }),
  ).toHaveValue("100");
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 640 });
    await page.getByLabel("Ваше имя", { exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByLabel("Ваше имя", { exact: true })).toBeInViewport({
      ratio: 1,
    });
    await button(page, "Продолжить").scrollIntoViewIfNeeded();
    await expect(button(page, "Продолжить")).toBeInViewport({ ratio: 1 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`first-setup-${width}.png`),
      animations: "disabled",
    });
  }
  for (let step = 1; step < 4; step++) await button(page, "Продолжить").click();
  expect(await readState(page)).toEqual(before);
  await button(page, "Начать учёт с этими данными").click();
  await expectOffer(page);
  await expect
    .poll(async () => (await readState(page)).settings.onboardingCompleted)
    .toBe(true);
  const state = await readState(page);
  expect(accountBalance(state, "card", TODAY)).toBe(250000);
  expect(accountBalance(state, "savings", TODAY)).toBe(10000);
  expect(state.transactions).toEqual([]);
  await page.reload();
  await expectOffer(page);
  expect(await readState(page)).toEqual(state);
  expect(await learningProgress(page)).toMatchObject({
    status: "new",
    firstRun: "setup",
  });
  await button(page, "Пройти обучение").click();
  await expect(page.getByTestId("tour-coach")).toContainText("1 / 42");
  expect(await learningProgress(page)).not.toHaveProperty("firstRun");
  expect(await learningStatus(page)).toBe("started");
  expect(await readState(page)).toEqual(state);
});

test("reloading unfinished setup offers its draft without applying fields or changing money", async ({
  page,
}) => {
  await startFresh(page);
  await button(page, "Настроить свой учёт").click();
  await expectSetup(page);
  const state = await readState(page);
  await page.getByLabel("Ваше имя", { exact: true }).fill("Не сохранено");
  await page.getByLabel("Начальный остаток", { exact: true }).fill("777");
  await button(page, "Продолжить").click();
  await expect(page.getByText("Шаг 2 из 4", { exact: true })).toBeVisible();
  await page.clock.runFor(700);
  await expect
    .poll(() =>
      page.evaluate(() =>
        localStorage
          .getItem("lad-profile-personal:lad-drafts-v1")
          ?.includes("777"),
      ),
    )
    .toBe(true);
  await page.reload();
  await expectSetup(page);
  await expect(page.getByLabel("Ваше имя", { exact: true })).toHaveValue(
    state.settings.name,
  );
  await expect(
    page.getByLabel("Начальный остаток", { exact: true }),
  ).toHaveValue("");
  expect(await readState(page)).toEqual(state);
  expect(await learningProgress(page)).toMatchObject({
    status: "new",
    firstRun: "setup",
  });
  await button(page, "Восстановить черновик настройки").click();
  await expect(page.getByText("Шаг 2 из 4", { exact: true })).toBeVisible();
  await button(page, "Назад").click();
  await expect(page.getByLabel("Ваше имя", { exact: true })).toHaveValue(
    "Не сохранено",
  );
  await expect(
    page.getByLabel("Начальный остаток", { exact: true }),
  ).toHaveValue("777");
  expect(await readState(page)).toEqual(state);
  await finishAccountSetup(page);
  await button(page, "Начать без обучения").click();
  await expectOverview(page);
  await expectNoTour(page);
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
    await expect(button(page, "Начать без обучения")).toHaveCount(0);
    expect(
      await page.evaluate(
        (key) => localStorage.getItem(key),
        PROFILE_KEYS.personal,
      ),
    ).toBe(raw);
  });
}

test("a failed first profile save keeps welcome open and retries setup without learning", async ({
  page,
}) => {
  await page.addInitScript((key) => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (
        this === localStorage &&
        name === key &&
        sessionStorage.getItem("first-profile-save-allowed") !== "yes"
      )
        throw new DOMException(
          "Недостаточно места для сохранения",
          "QuotaExceededError",
        );
      return setItem.call(this, name, value);
    };
  }, PROFILE_KEYS.personal);
  await startFresh(page);
  await button(page, "Настроить свой учёт").click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(welcome(page)).toBeVisible();
  await expectNoProfile(page);
  await expectNoTour(page);
  expect(await learningProgress(page)).toMatchObject({
    status: "new",
    firstRun: "setup",
  });
  await page.evaluate(() =>
    sessionStorage.setItem("first-profile-save-allowed", "yes"),
  );
  await button(page, "Настроить свой учёт").click();
  await expectSetup(page);
  const state = await readState(page);
  expect(state.demo).toBe(false);
  expect(state.transactions).toEqual([]);
  await page.reload();
  await expectSetup(page);
  expect(await readState(page)).toEqual(state);
});

test("a failed setup marker save keeps welcome available without creating a profile", async ({
  page,
}) => {
  await page.addInitScript((key) => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (
        this === localStorage &&
        name === key &&
        sessionStorage.getItem("allow-learning") !== "yes"
      )
        throw new DOMException("Full", "QuotaExceededError");
      return setItem.call(this, name, value);
    };
  }, LEARNING_PROGRESS_KEY);
  await startFresh(page);
  await button(page, "Настроить свой учёт").click();
  await expect(page.getByRole("alert")).toContainText(
    "Не удалось сохранить прогресс обучения",
  );
  await expect(welcome(page)).toBeVisible();
  await expectNoProfile(page);
  await expectNoTour(page);
  expect(await learningProgress(page)).toBeNull();
  await page.evaluate(() => sessionStorage.setItem("allow-learning", "yes"));
  await button(page, "Настроить свой учёт").click();
  await expectSetup(page);
  expect(await learningProgress(page)).toMatchObject({
    status: "new",
    firstRun: "setup",
  });
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
  await button(page, "Настроить свой учёт").click();
  await finishAccountSetup(page);
  await button(page, "Начать без обучения").click();
  await expectOverview(page);
  expect((await readState(page)).transactions).toEqual([]);
  expect((await readState(page)).demo).toBe(false);
  expect(
    await page.evaluate(() => localStorage.getItem("lad-finance-v1")),
  ).toBe(legacy);
});

for (const choice of ["Пройти обучение", "Начать без обучения"]) {
  test(`a failed ${choice} choice save keeps the post-setup learning offer available`, async ({
    page,
  }) => {
    await page.addInitScript((key) => {
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (name, value) {
        if (
          this === localStorage &&
          name === key &&
          sessionStorage.getItem("fail-learning") === "yes"
        )
          throw new DOMException("Full", "QuotaExceededError");
        return setItem.call(this, name, value);
      };
    }, LEARNING_PROGRESS_KEY);
    await startFresh(page);
    await button(page, "Настроить свой учёт").click();
    await finishAccountSetup(page);
    await page.evaluate(() => sessionStorage.setItem("fail-learning", "yes"));
    await button(page, choice).click();
    await expect(page.getByRole("alert")).toContainText(
      "Не удалось сохранить прогресс обучения",
    );
    await expectOffer(page);
    expect(await learningProgress(page)).toMatchObject({
      status: "new",
      firstRun: "setup",
    });
    const state = await readState(page);
    expect(state.settings.onboardingCompleted).toBe(true);
    await page.reload();
    await expectOffer(page);
    await page.evaluate(() => sessionStorage.removeItem("fail-learning"));
    await button(page, choice).click();
    await expectOverview(page);
    expect(await learningProgress(page)).not.toHaveProperty("firstRun");
    if (choice === "Пройти обучение") {
      await expect(page.getByTestId("tour-coach")).toContainText("1 / 42");
      expect(await learningStatus(page)).toBe("started");
    } else {
      await expectNoTour(page);
      expect(await learningStatus(page)).toBe("skipped");
    }
    expect(await readState(page)).toEqual(state);
  });
}

test("a failed setup ledger save must retry before offering learning and preserves balances", async ({
  page,
}) => {
  await page.addInitScript((key) => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (
        this === localStorage &&
        name === key &&
        sessionStorage.getItem("fail-completed-ledger") === "yes"
      )
        throw new DOMException("Full", "QuotaExceededError");
      return setItem.call(this, name, value);
    };
  }, PROFILE_KEYS.personal);
  await startFresh(page);
  await button(page, "Настроить свой учёт").click();
  const before = await readState(page);
  await page.getByLabel("Начальный остаток", { exact: true }).fill("2300");
  await page.evaluate(() =>
    sessionStorage.setItem("fail-completed-ledger", "yes"),
  );
  for (let step = 1; step < 4; step++) await button(page, "Продолжить").click();
  await button(page, "Начать учёт с этими данными").click();
  await expect(
    page.getByRole("heading", {
      name: "Не удалось сохранить учёт",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button")).toHaveCount(1);
  await expect(button(page, "Пройти обучение")).toHaveCount(0);
  await expect(button(page, "Начать без обучения")).toHaveCount(0);
  await expectNoTour(page);
  expect(await readState(page)).toEqual(before);
  expect(await learningProgress(page)).toMatchObject({
    status: "new",
    firstRun: "setup",
  });
  await page.evaluate(() => sessionStorage.removeItem("fail-completed-ledger"));
  await button(page, "Повторить сохранение").click();
  await expectOffer(page);
  await page.reload();
  await expectOffer(page);
  await button(page, "Начать без обучения").click();
  await expectOverview(page);
  await expectNoTour(page);
  const state = await readState(page);
  expect(state.settings.onboardingCompleted).toBe(true);
  expect(accountBalance(state, "card", TODAY)).toBe(230000);
  expect(state.transactions).toEqual([]);
  expect(await learningStatus(page)).toBe("skipped");
  await page.reload();
  await expectOverview(page);
  expect(await readState(page)).toEqual(state);
});

for (const completed of [false, true]) {
  test(`a failed first-run progress read cannot bypass ${completed ? "the learning offer" : "unfinished setup"}`, async ({
    page,
  }) => {
    const state = createInitialState(false, TODAY);
    state.settings.onboardingCompleted = completed;
    state.settings.exchange = { automatic: false, rates: {} };
    await page.clock.install({ time: new Date(`${TODAY}T12:00:00+04:00`) });
    await page.addInitScript(
      ({ ledger, active, registry, learning, initial }) => {
        if (!localStorage.getItem("first-run-read-fixture")) {
          localStorage.setItem(ledger, JSON.stringify(initial));
          localStorage.setItem(active, "personal");
          localStorage.setItem(
            registry,
            JSON.stringify({
              version: 1,
              profiles: [{ id: "personal", name: "Личный" }],
            }),
          );
          localStorage.setItem(
            learning,
            JSON.stringify({
              version: 2,
              status: "new",
              step: "home-formula",
              firstRun: "setup",
            }),
          );
          localStorage.setItem("first-run-read-fixture", "yes");
        }
        const getItem = Storage.prototype.getItem;
        Storage.prototype.getItem = function (name) {
          if (
            this === localStorage &&
            name === learning &&
            getItem.call(sessionStorage, "allow-learning-read") !== "yes"
          )
            throw new DOMException("Storage unavailable", "SecurityError");
          return getItem.call(this, name);
        };
      },
      {
        ledger: PROFILE_KEYS.personal,
        active: ACTIVE_PROFILE_KEY,
        registry: PROFILE_REGISTRY_KEY,
        learning: LEARNING_PROGRESS_KEY,
        initial: state,
      },
    );
    await page.goto("/");
    await expect(
      page.getByText(
        "Не удалось загрузить прогресс обучения. Попробуйте ещё раз.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(button(page, "Повторить загрузку")).toBeVisible();
    await expect(button(page, "Профиль и настройки")).toHaveCount(0);
    await expect(page.getByTestId("first-run-setup")).toHaveCount(0);
    await expect(button(page, "Пройти обучение")).toHaveCount(0);
    await expectNoTour(page);
    expect(await readState(page)).toEqual(state);
    await page.evaluate(() =>
      sessionStorage.setItem("allow-learning-read", "yes"),
    );
    await button(page, "Повторить загрузку").click();
    if (completed) await expectOffer(page);
    else await expectSetup(page);
    expect(await learningProgress(page)).toMatchObject({
      status: "new",
      firstRun: "setup",
    });
    expect(await readState(page)).toEqual(state);
  });
}

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
  await button(page, "Настроить свой учёт").click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(welcome(page)).toBeVisible();
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
  await button(page, "Настроить свой учёт").click();
  await expectSetup(page);
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
