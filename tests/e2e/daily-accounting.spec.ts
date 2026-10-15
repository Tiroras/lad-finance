import { expect, test, type Page } from "@playwright/test";
import { bundleBrowserModule } from "./browserBundle";
import type * as Fixture from "../helpers/t04DailyUiFixture";
import type * as DraftHarness from "../helpers/t04DraftHookHarness";

type Browser = typeof globalThis & { __browserTestModule: typeof Fixture };
type HookBrowser = typeof globalThis & {
  __browserTestModule: typeof DraftHarness;
};
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
let bundle: string;
test.beforeAll(async () => {
  bundle = await bundleBrowserModule("tests/helpers/t04DailyUiFixture.ts");
});
test.beforeEach(async ({ page }) => {
  await page.route("https://api.frankfurter.dev/**", (route) => route.abort());
  await page.clock.install({ time: new Date("2026-10-15T12:00:00+04:00") });
});
async function start(
  page: Page,
  mode: Parameters<typeof Fixture.install>[0]["mode"] = "money",
) {
  await page.addInitScript({
    content: `${bundle}\n;globalThis.__browserTestModule = __browserTestModule; __browserTestModule.install(${JSON.stringify({ today: "2026-10-15", mode })});`,
  });
  await page.goto("/");
  await expect(button(page, "Добавить операцию")).toBeVisible();
}
async function openNew(page: Page, title: string, amount: string) {
  await button(page, "Добавить операцию").click();
  await page.getByLabel("Название операции", { exact: true }).fill(title);
  await page.getByLabel("Сумма операции", { exact: true }).fill(amount);
}
async function closed(page: Page) {
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
async function assertState(
  page: Page,
  value: Parameters<typeof Fixture.assertState>[0],
) {
  await expect
    .poll(() =>
      page.evaluate(
        (value) =>
          (globalThis as Browser).__browserTestModule.assertState(value),
        value,
      ),
    )
    .toBe(true);
}
async function openAccount(page: Page, name: string) {
  await page
    .getByRole("dialog")
    .getByRole("button", { name: new RegExp(`^${name}`) })
    .first()
    .click();
  await expect(page.getByLabel("Название счёта", { exact: true })).toHaveValue(
    name,
  );
}
async function persistedDraft(page: Page) {
  return page.evaluate(() =>
    (globalThis as Browser).__browserTestModule.draft(),
  );
}

async function startHookHarness(page: Page) {
  await page.route("https://lad-draft-hook.invalid/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Draft lifecycle gate</title>",
    }),
  );
  await page.goto("https://lad-draft-hook.invalid/");
  await page.addScriptTag({
    content: await bundleBrowserModule("tests/helpers/t04DraftHookHarness.ts"),
  });
  await page.evaluate(() =>
    (globalThis as HookBrowser).__browserTestModule.mount(),
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        (globalThis as HookBrowser).__browserTestModule.ready(),
      ),
    )
    .toBe(true);
  await page.clock.pauseAt(new Date("2026-10-15T12:00:02+04:00"));
}

async function startGatedWrite(page: Page, kind: "claim" | "save") {
  await page.evaluate((kind) => {
    const harness = (globalThis as HookBrowser).__browserTestModule;
    harness.gateFirstCompletion(kind);
    harness.setFields("Первая запись");
    harness.startFlush();
  }, kind);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (globalThis as HookBrowser).__browserTestModule.entered(),
      ),
    )
    .toBe(true);
}

async function releaseGatedWrite(page: Page) {
  return page.evaluate(async () => {
    const harness = (globalThis as HookBrowser).__browserTestModule;
    harness.release();
    return harness.waitFlushes();
  });
}

test("T04 archive: all empty accounts can be archived, restored and kept in history", async ({
  page,
}, info) => {
  await start(page, "history");
  await button(page, "Открыть мои счета").click();
  for (const name of ["Основная карта", "Наличные", "Накопления"]) {
    await openAccount(page, name);
    await button(page, "Архивировать счёт").click();
    await expect(button(page, `${name} · архив`)).toBeVisible();
  }
  await assertState(page, { count: 1, balance: 0, held: 0, archived: 3 });
  await button(page, "Закрыть").click();
  await button(page, "Добавить операцию").click();
  await expect(button(page, "Создать или восстановить счёт")).toBeVisible();
  await page.setViewportSize({ width: 320, height: 740 });
  await page.waitForTimeout(700);
  await page.screenshot({
    path: info.outputPath("zero-active-320.png"),
    fullPage: true,
  });
  await button(page, "Создать или восстановить счёт").click();
  await button(page, "Основная карта · архив").click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: /^Историческая трата/ }),
  ).toBeVisible();
  await button(page, "Восстановить счёт").click();
  await assertState(page, { count: 1, balance: 0, held: 0, archived: 2 });
});

test("T04 archive: a live obligation explains why a zero-balance account cannot be archived", async ({
  page,
}) => {
  await start(page, "blocker");
  await button(page, "Открыть мои счета").click();
  await openAccount(page, "Основная карта");
  await expect(button(page, "Архивировать счёт")).toBeDisabled();
  await expect(
    page.getByRole("dialog").getByText(/Действующее обязательство/),
  ).toBeVisible();
  await assertState(page, { count: 0, balance: 0, held: 0, archived: 0 });
});

test("T04 pending: posting moves money once, cancellation releases the reserve and filters keep both records", async ({
  page,
}, info) => {
  await start(page);
  await openNew(page, "Ожидаемый расход", "2000");
  await page.getByRole("tab", { name: "Ожидается", exact: true }).click();
  await page
    .getByLabel("Ожидаемая дата операции", { exact: true })
    .fill("16.10.2026");
  await button(page, "Добавить ожидаемую операцию").click();
  await closed(page);
  await assertState(page, {
    count: 1,
    balance: 1000000,
    held: 200000,
    statuses: ["pending"],
  });
  await page.getByRole("button", { name: /^Ожидаемый расход,/ }).click();
  await button(page, "Провести операцию").click();
  await closed(page);
  await assertState(page, {
    count: 1,
    balance: 800000,
    held: 0,
    statuses: ["posted"],
  });
  await openNew(page, "Отменённое ожидание", "500");
  await page.getByRole("tab", { name: "Ожидается", exact: true }).click();
  await button(page, "Добавить ожидаемую операцию").click();
  await closed(page);
  await page.getByRole("button", { name: /^Отменённое ожидание,/ }).click();
  await button(page, "Отменить ожидаемую операцию").click();
  await closed(page);
  await assertState(page, {
    count: 2,
    balance: 800000,
    held: 0,
    statuses: ["posted", "cancelled"],
  });
  await page.getByRole("tab", { name: "Операции", exact: true }).click();
  await button(page, "Фильтры").click();
  await button(page, "Отменённые").click();
  await expect(page.getByTestId("transaction-results-summary")).toContainText(
    "операций: 1",
  );
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 850 });
    await page.waitForTimeout(700);
    await page.screenshot({
      path: info.outputPath(`cancelled-${width}.png`),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("T04 draft: raw fields survive reload only after explicit restore and a failed ledger save retries one ID", async ({
  page,
}) => {
  await start(page);
  await openNew(page, "Черновик после перезапуска", "123,45");
  await expect
    .poll(async () => (await persistedDraft(page))?.payload.draft)
    .toMatchObject({ title: "Черновик после перезапуска", amount: "123,45" });
  await assertState(page, { count: 0, balance: 1000000, held: 0 });
  await page.reload();
  await button(page, "Добавить операцию").click();
  await expect(button(page, "Восстановить черновик операции")).toBeVisible();
  await expect(
    page.getByLabel("Название операции", { exact: true }),
  ).toHaveCount(0);
  await button(page, "Восстановить черновик операции").click();
  await expect(
    page.getByLabel("Название операции", { exact: true }),
  ).toHaveValue("Черновик после перезапуска");
  await page.evaluate(() =>
    (globalThis as Browser).__browserTestModule.setLedgerFailure(true),
  );
  await button(page, "Добавить операцию").click();
  await expect(
    button(page, "Повторить подтверждение сохранения"),
  ).toBeVisible();
  expect(await persistedDraft(page)).not.toBeNull();
  await assertState(page, { count: 0, balance: 1000000, held: 0 });
  await page.evaluate(() =>
    (globalThis as Browser).__browserTestModule.setLedgerFailure(false),
  );
  await button(page, "Повторить подтверждение сохранения").click();
  await closed(page);
  await assertState(page, { count: 1, balance: 987655, held: 0 });
  expect(await persistedDraft(page)).toBeNull();
  await page.reload();
  await assertState(page, { count: 1, balance: 987655, held: 0 });
});

test("T04 draft: discard deletes the stored slot and edit conflicts need explicit confirmation", async ({
  page,
}) => {
  await start(page, "edit");
  await openNew(page, "Удаляемый черновик", "25");
  await expect
    .poll(async () => (await persistedDraft(page))?.payload.draft)
    .toMatchObject({ title: "Удаляемый черновик" });
  await button(page, "Закрыть").click();
  await button(page, "Сбросить и закрыть").click();
  await closed(page);
  expect(await persistedDraft(page)).toBeNull();
  await page.getByRole("button", { name: /^Исходная операция,/ }).click();
  await page
    .getByLabel("Название операции", { exact: true })
    .fill("Поля из черновика");
  await expect
    .poll(async () => (await persistedDraft(page))?.payload.draft)
    .toMatchObject({ title: "Поля из черновика" });
  await page.evaluate(() =>
    (globalThis as Browser).__browserTestModule.changeOriginal(),
  );
  await page.reload();
  await page.getByRole("button", { name: /^Актуальная операция,/ }).click();
  await button(page, "Восстановить черновик операции").click();
  await expect(button(page, "Сохранить изменения")).toBeDisabled();
  await button(page, "Подтвердить замену актуальной записи черновиком").click();
  await button(page, "Сохранить изменения").click();
  await closed(page);
  await assertState(page, { count: 1, balance: 999000, held: 0 });
});

test("T04 negative: actual expense remains allowed and reconciliation is offered without a correction", async ({
  page,
}) => {
  await start(page, "empty");
  await openNew(page, "Достоверный расход", "50");
  await button(page, "Добавить операцию").click();
  await closed(page);
  await assertState(page, { count: 1, balance: -5000, held: 0 });
  await expect(
    button(page, "Сверить отрицательный остаток: Основная карта"),
  ).toBeVisible();
  await button(page, "Сверить отрицательный остаток: Основная карта").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await assertState(page, { count: 1, balance: -5000, held: 0 });
});

test("T04 draft: profile and record identities never silently replace another draft", async ({
  page,
}) => {
  await start(page, "edit");
  await openNew(page, "Только личный черновик", "75");
  await expect
    .poll(async () => (await persistedDraft(page))?.payload.draft)
    .toMatchObject({ title: "Только личный черновик" });
  await page.reload();
  await button(page, "Профиль и настройки").click();
  await button(page, "Профили").click();
  await button(page, "Открыть профиль: Контрольный Т04").click();
  await closed(page);
  await button(page, "Добавить операцию").click();
  await expect(
    page.getByLabel("Название операции", { exact: true }),
  ).toHaveValue("");
  await expect(button(page, "Восстановить черновик операции")).toHaveCount(0);
  await button(page, "Закрыть").click();
  await button(page, "Профиль и настройки").click();
  await button(page, "Профили").click();
  await button(page, "Открыть профиль: Личный").click();
  await closed(page);
  await page.getByRole("button", { name: /^Исходная операция,/ }).click();
  await expect(button(page, "Открыть сохранённый черновик")).toBeVisible();
  await expect(
    page.getByLabel("Название операции", { exact: true }),
  ).toHaveCount(0);
  await button(page, "Открыть сохранённый черновик").click();
  await button(page, "Восстановить черновик операции").click();
  await expect(
    page.getByLabel("Название операции", { exact: true }),
  ).toHaveValue("Только личный черновик");
  await assertState(page, { count: 1, balance: 999000, held: 0 });
});

test("T04 draft: cleanup failure after a confirmed financial save cannot duplicate the fact after restart", async ({
  page,
}) => {
  await start(page);
  await openNew(page, "Сохранённый факт до очистки", "150");
  await page.evaluate(() =>
    (globalThis as Browser).__browserTestModule.setClearFailure(true),
  );
  await button(page, "Добавить операцию").click();
  await expect(
    button(page, "Повторить подтверждение сохранения"),
  ).toBeVisible();
  await assertState(page, { count: 1, balance: 985000, held: 0 });
  const saved = await persistedDraft(page);
  expect(saved).not.toBeNull();
  await button(page, "Закрыть и сохранить черновик").click();
  await closed(page);
  await page.reload();
  await button(page, "Добавить операцию").click();
  await button(page, "Восстановить черновик операции").click();
  await button(page, "Добавить операцию").click();
  await closed(page);
  await assertState(page, { count: 1, balance: 985000, held: 0 });
  expect(await persistedDraft(page)).toBeNull();
});

test("T04 draft: explicit repeat receives a new durable identity before adding the second fact", async ({
  page,
}) => {
  await start(page, "edit");
  await page.getByRole("button", { name: /^Исходная операция,/ }).click();
  await button(page, "Повторить операцию").click();
  await expect
    .poll(async () => (await persistedDraft(page))?.lease.recordId)
    .toBe("new");
  await expect
    .poll(async () => (await persistedDraft(page))?.payload.draft)
    .toMatchObject({ repeating: true, title: "Исходная операция" });
  await page.reload();
  await button(page, "Добавить операцию").click();
  await button(page, "Восстановить черновик операции").click();
  await button(page, "Добавить операцию").click();
  await closed(page);
  await assertState(page, { count: 2, balance: 998000, held: 0 });
});

test("T04 plans: pending payment and income remain unfulfilled until one actual posting", async ({
  page,
}) => {
  await start(page, "plans");
  const assertPlans = async (paid: boolean, received: boolean) => {
    await expect
      .poll(() =>
        page.evaluate(
          (value) =>
            (globalThis as Browser).__browserTestModule.assertPlans(value),
          { paid, received },
        ),
      )
      .toBe(true);
  };
  await page.getByRole("tab", { name: "План", exact: true }).click();
  await page.getByRole("tab", { name: "Платежи", exact: true }).click();
  const payment = () =>
    page.getByRole("button", { name: /^Действующее обязательство,.*15 окт/ });
  await payment().click();
  await button(page, "Ожидать списание по плану").click();
  await assertState(page, {
    count: 1,
    balance: 1000000,
    held: 1000,
    statuses: ["pending"],
  });
  await assertPlans(false, false);
  await button(page, "Закрыть").click();
  await expect(payment()).toHaveAccessibleName(/Ожидает проведения/);
  await payment().click();
  await expect(
    page.getByRole("dialog").getByText(/Списание ожидает проведения/),
  ).toBeVisible();
  await button(page, "Открыть ожидаемое списание").click();
  await button(page, "Отменить ожидаемую операцию").click();
  await closed(page);
  await assertState(page, {
    count: 1,
    balance: 1000000,
    held: 0,
    statuses: ["cancelled"],
  });
  await assertPlans(false, false);
  await payment().click();
  await button(page, "Ожидать списание по плану").click();
  await button(page, "Провести операцию").click();
  await closed(page);
  await assertState(page, {
    count: 2,
    balance: 999000,
    held: 0,
    statuses: ["cancelled", "posted"],
  });
  await assertPlans(true, false);
  await payment().click();
  await expect(button(page, "Открыть записанную операцию")).toBeVisible();
  await expect(button(page, "Ожидать списание по плану")).toHaveCount(0);
  await button(page, "Закрыть").click();
  await page.getByRole("tab", { name: "Прогноз", exact: true }).click();
  await button(page, "Доход: Ожидаемый гонорар").click();
  await button(page, "Ожидать поступление по плану").click();
  await assertState(page, {
    count: 3,
    balance: 999000,
    held: 0,
    statuses: ["cancelled", "posted", "pending"],
  });
  await assertPlans(true, false);
  await button(page, "Закрыть").click();
  await button(page, "Доход: Ожидаемый гонорар").click();
  await expect(
    page.getByRole("dialog").getByText(/Поступление ожидает проведения/),
  ).toBeVisible();
  await button(page, "Открыть ожидаемое поступление").click();
  await button(page, "Провести операцию").click();
  await closed(page);
  await assertState(page, {
    count: 3,
    balance: 1001000,
    held: 0,
    statuses: ["cancelled", "posted", "posted"],
  });
  await assertPlans(true, true);
  await button(page, "Доход: Ожидаемый гонорар").click();
  await expect(button(page, "Открыть полученный доход")).toBeVisible();
  await expect(button(page, "Ожидать поступление по плану")).toHaveCount(0);
});

test("T04 archive: an old template needs explicit active-account replacement before saving", async ({
  page,
}) => {
  await start(page, "template");
  await button(page, "Добавить операцию").click();
  await button(page, "Шаблоны").click();
  await page.getByRole("button", { name: /^Старый наличный шаблон ·/ }).click();
  await expect(
    page.getByLabel("Название операции", { exact: true }),
  ).toHaveValue("Покупка по шаблону");
  await expect(
    page
      .getByRole("dialog")
      .getByText(/Прежний счёт недоступен для новой записи/),
  ).toBeVisible();
  await expect(button(page, "Добавить операцию")).toBeDisabled();
  await assertState(page, { count: 0, balance: 1000000, held: 0, archived: 1 });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Основная карта", exact: true })
    .click();
  await button(page, "Добавить операцию").click();
  await closed(page);
  await assertState(page, { count: 1, balance: 997500, held: 0, archived: 1 });
});

test("T04 draft: returning fields to their initial values never leaves stale saved input", async ({
  page,
}) => {
  await start(page);
  await openNew(page, "Уже удалённые поля", "42");
  await expect
    .poll(async () => (await persistedDraft(page))?.payload.draft)
    .toMatchObject({ title: "Уже удалённые поля", amount: "42" });
  await page.getByLabel("Название операции", { exact: true }).fill("");
  await page.getByLabel("Сумма операции", { exact: true }).fill("");
  await expect
    .poll(
      async () =>
        (await persistedDraft(page))?.payload.draft ?? {
          title: "",
          amount: "",
        },
    )
    .toMatchObject({ title: "", amount: "" });
  await assertState(page, { count: 0, balance: 1000000, held: 0 });
});

test("T04 draft hook: pause saves the last fields without the debounce and confirmed cleanup stays cleared", async ({
  page,
}) => {
  await page.route("https://lad-draft-hook.invalid/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Draft lifecycle</title>",
    }),
  );
  await page.goto("https://lad-draft-hook.invalid/");
  await page.addScriptTag({
    content: await bundleBrowserModule("tests/helpers/t04DraftHookHarness.ts"),
  });
  type HookBrowser = typeof globalThis & {
    __browserTestModule: typeof DraftHarness;
  };
  await page.evaluate(() =>
    (globalThis as HookBrowser).__browserTestModule.mount(),
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        (globalThis as HookBrowser).__browserTestModule.ready(),
      ),
    )
    .toBe(true);
  await page.clock.pauseAt(new Date("2026-10-15T12:00:02+04:00"));
  await page.evaluate(() =>
    (globalThis as HookBrowser).__browserTestModule.pauseUntouched(),
  );
  expect(
    await page.evaluate(
      async () =>
        (await (globalThis as HookBrowser).__browserTestModule.read()).draft,
    ),
  ).toBeNull();
  await page.evaluate(() =>
    (globalThis as HookBrowser).__browserTestModule.resume(),
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        (globalThis as HookBrowser).__browserTestModule.ready(),
      ),
    )
    .toBe(true);
  await page.evaluate(() =>
    (globalThis as HookBrowser).__browserTestModule.editThenPause(
      "Последний незавершённый ввод 3,",
    ),
  );
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await (globalThis as HookBrowser).__browserTestModule.read()).draft
            ?.payload,
      ),
    )
    .toEqual({ value: "Последний незавершённый ввод 3," });
  await page.evaluate(() =>
    (globalThis as HookBrowser).__browserTestModule.mount(),
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (globalThis as HookBrowser).__browserTestModule.status().offer
            ?.payload,
      ),
    )
    .toEqual({ value: "Последний незавершённый ввод 3," });
  expect(
    await page.evaluate(
      () => (globalThis as HookBrowser).__browserTestModule.status().fields,
    ),
  ).toEqual({ value: "" });
  await page.evaluate(() =>
    (globalThis as HookBrowser).__browserTestModule.restoreThenClearAndPause(),
  );
  expect(
    await page.evaluate(
      async () =>
        (await (globalThis as HookBrowser).__browserTestModule.read()).draft,
    ),
  ).toBeNull();
});

test("T04 draft hook: a first claim finishing after pause hands its lease to the latest captured fields", async ({
  page,
}) => {
  await startHookHarness(page);
  await startGatedWrite(page, "claim");
  await page.evaluate(() =>
    (globalThis as HookBrowser).__browserTestModule.editThenPause(
      "Последние поля до блокировки",
    ),
  );
  expect((await releaseGatedWrite(page))[0].ok).toBe(false);
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await (globalThis as HookBrowser).__browserTestModule.read()).draft
            ?.payload,
      ),
    )
    .toEqual({ value: "Последние поля до блокировки" });
});

test("T04 draft hook: a late claim never assigns its lease to another profile", async ({
  page,
}) => {
  await startHookHarness(page);
  await startGatedWrite(page, "claim");
  await page.evaluate(() => {
    const harness = (globalThis as HookBrowser).__browserTestModule;
    harness.switchProfile(harness.CONTROL);
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        (globalThis as HookBrowser).__browserTestModule.ready(),
      ),
    )
    .toBe(true);
  await page.evaluate(() => {
    const harness = (globalThis as HookBrowser).__browserTestModule;
    harness.setFields("Только второй профиль");
    harness.startFlush();
  });
  expect((await releaseGatedWrite(page)).map((value) => value.ok)).toEqual([
    false,
    true,
  ]);
  expect(
    await page.evaluate(
      async () =>
        (await (globalThis as HookBrowser).__browserTestModule.read()).draft,
    ),
  ).toBeNull();
  expect(
    await page.evaluate(async () => {
      const harness = (globalThis as HookBrowser).__browserTestModule;
      return (await harness.read(harness.CONTROL)).draft?.payload;
    }),
  ).toEqual({ value: "Только второй профиль" });
});

test("T04 draft hook: delayed save completion cannot resurrect a cleared draft", async ({
  page,
}) => {
  await startHookHarness(page);
  await startGatedWrite(page, "save");
  await page.evaluate(() => {
    const harness = (globalThis as HookBrowser).__browserTestModule;
    harness.startClear();
    harness.pauseAndUnmount();
  });
  expect((await releaseGatedWrite(page)).map((value) => value.ok)).toEqual([
    false,
    true,
  ]);
  expect(
    await page.evaluate(
      async () =>
        (await (globalThis as HookBrowser).__browserTestModule.read()).draft,
    ),
  ).toBeNull();
});

test("T04 draft hook: replacement invalidates a delayed save and its queued pause continuation", async ({
  page,
}) => {
  await startHookHarness(page);
  await startGatedWrite(page, "save");
  const generation = await page.evaluate(
    async () =>
      (await (globalThis as HookBrowser).__browserTestModule.read()).generation,
  );
  await page.evaluate(() =>
    (globalThis as HookBrowser).__browserTestModule.replaceDrafts(),
  );
  await page.evaluate(() =>
    (globalThis as HookBrowser).__browserTestModule.editThenPause(
      "Старые поля после замены",
    ),
  );
  expect((await releaseGatedWrite(page))[0].ok).toBe(false);
  const result = await page.evaluate(() =>
    (globalThis as HookBrowser).__browserTestModule.read(),
  );
  expect(result.generation).not.toBe(generation);
  expect(result.draft).toBeNull();
  expect(result.blockedBy).toBeNull();
});
