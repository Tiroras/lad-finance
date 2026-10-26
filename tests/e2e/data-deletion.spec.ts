import { expect, test, type Page } from "@playwright/test";
import { createInitialState } from "../../src/domain/seed";
import {
  encodeProfileRegistry,
  type FinanceProfile,
} from "../../src/domain/profiles";
import { DATA_DELETION_KEY } from "../../src/infrastructure/storage/dataDeletion";
import {
  ACTIVE_PROFILE_KEY,
  PROFILE_REGISTRY_KEY,
  finishAccountSetup,
  openProfiles,
  profileStorageKey,
  readState,
} from "./helpers";

const TODAY = "2026-10-25";
const other: FinanceProfile = "profile-11111111-1111-4111-8111-111111111111";
const otherName = "Семейный бюджет и повседневные расходы";
const learningKey = "lad-learning-progress-v1";
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const welcome = (page: Page) =>
  page.getByText("Добро пожаловать в Лад", { exact: true });
const data = (page: Page) =>
  page.evaluate(() =>
    Object.fromEntries(
      Object.entries(localStorage).filter(([key]) => key.startsWith("lad-")),
    ),
  );

async function start(
  page: Page,
  active: FinanceProfile = "personal",
  single = false,
) {
  await page.route("https://api.frankfurter.dev/**", (route) => route.abort());
  await page.clock.install({ time: new Date(`${TODAY}T12:00:00+04:00`) });
  const personal = createInitialState(false, TODAY);
  personal.settings.name = "Тестовый пользователь";
  personal.settings.onboardingCompleted = true;
  personal.settings.exchange = { automatic: false, rates: {} };
  personal.accounts[0].openingBalance = 123456;
  const family = {
    ...personal,
    settings: { ...personal.settings, name: "Семейный тест" },
  };
  const entries: Record<string, string> = {
    [PROFILE_REGISTRY_KEY]: encodeProfileRegistry([
      { id: "personal", name: "Личный" },
      ...(single ? [] : [{ id: other, name: otherName }]),
    ]),
    [ACTIVE_PROFILE_KEY]: active,
    [profileStorageKey("personal")]: JSON.stringify(personal),
    [learningKey]: JSON.stringify({
      version: 2,
      status: "skipped",
      step: "home-formula",
    }),
    "lad-profile-personal:lad-drafts-v1": "synthetic obsolete draft",
    "lad-profile-personal:lad-last-backup-prepared": TODAY,
    ...(single
      ? {}
      : {
          [profileStorageKey(other)]: JSON.stringify(family),
          [`lad-profile-${other}:lad-drafts-v1`]: "synthetic family draft",
        }),
  };
  await page.addInitScript((fixture) => {
    if (sessionStorage.getItem("deletion-fixture")) return;
    sessionStorage.setItem("deletion-fixture", "yes");
    for (const [key, value] of Object.entries(fixture))
      localStorage.setItem(key, value);
    localStorage.setItem("another-app", "keep");
  }, entries);
  await page.goto("/");
  await expect(button(page, "Профиль и настройки")).toBeVisible();
  return entries;
}

async function fullReset(page: Page) {
  await button(page, "Профиль и настройки").click();
  await button(page, "Данные и копии").click();
  await button(page, "Удалить все профили и данные").click();
}
async function confirm(page: Page, all: boolean) {
  await page
    .getByLabel("Для подтверждения введите УДАЛИТЬ", { exact: true })
    .fill("УДАЛИТЬ");
  await button(
    page,
    all ? "Удалить все данные безвозвратно" : "Удалить профиль безвозвратно",
  ).click();
}

for (const width of [320, 390, 1440]) {
  test(`deletion warning and cancellation preserve profiles at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await start(page);
    const before = await data(page);
    await openProfiles(page);
    await page.screenshot({ path: info.outputPath(`profiles-${width}.png`) });
    await button(page, `Удалить профиль: ${otherName}`).click();
    await expect(
      page.getByText(`Удалить профиль «${otherName}»?`, { exact: true }),
    ).toBeVisible();
    await expect(button(page, "Удалить профиль безвозвратно")).toBeDisabled();
    await expect(
      page.getByText(/Другие профили и общая защита приложения сохранятся/),
    ).toBeVisible();
    await page
      .getByLabel("Для подтверждения введите УДАЛИТЬ")
      .fill("не удалять");
    await expect(button(page, "Удалить профиль безвозвратно")).toBeDisabled();
    await page.screenshot({
      path: info.outputPath(`delete-profile-${width}.png`),
    });
    await button(page, "Отмена удаления").click();
    expect(await data(page)).toEqual(before);
    await expect(button(page, `Удалить профиль: ${otherName}`)).toBeVisible();
    await button(page, "Удалить все профили и данные").click();
    await expect(
      button(page, "Удалить все данные безвозвратно"),
    ).toBeDisabled();
    await expect(
      page.getByText(/Ранее экспортированные файлы останутся у вас/),
    ).toBeVisible();
    await page.screenshot({ path: info.outputPath(`delete-all-${width}.png`) });
    await button(page, "Отмена удаления").click();
    expect(await data(page)).toEqual(before);
    await expect(button(page, `Удалить профиль: ${otherName}`)).toBeVisible();
    await button(page, "Назад").click();
    await expect(button(page, "Данные и копии")).toBeVisible();
    await expect(button(page, "Удалить все данные безвозвратно")).toHaveCount(
      0,
    );
  });
}

test("full reset clears all profiles and drafts, returns welcome immediately and permits repeated first runs", async ({
  page,
}, info) => {
  await start(page);
  await page.evaluate(() => {
    localStorage.setItem("lad-profile-demo:lad-finance-v1", "old demo");
    localStorage.setItem("lad-finance-v1", "old shared data");
    localStorage.setItem(
      "lad-profile-profile-22222222-2222-4222-8222-222222222222:lad-finance-v1",
      "orphan data",
    );
  });
  for (let pass = 0; pass < 2; pass++) {
    await fullReset(page);
    await confirm(page, true);
    await expect(welcome(page)).toBeVisible();
    expect(await data(page)).toEqual({});
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.screenshot({
      path: info.outputPath(`welcome-after-reset-${pass}.png`),
    });
    await page.reload();
    await expect(welcome(page)).toBeVisible();
    expect(await data(page)).toEqual({});
    expect(await page.evaluate(() => localStorage.getItem("another-app"))).toBe(
      "keep",
    );
    await button(page, "Настроить свой учёт").click();
    await expect(
      page.getByLabel("Начальный остаток", { exact: true }),
    ).toHaveValue("");
    await expect(button(page, "Восстановить черновик настройки")).toHaveCount(
      0,
    );
    await finishAccountSetup(page);
    await button(page, "Начать без обучения").click();
    await expect(button(page, "Профиль и настройки")).toBeVisible();
    const state = await readState(page);
    expect(state.transactions).toEqual([]);
    expect(
      state.accounts.every((account) => account.openingBalance === 0),
    ).toBe(true);
    expect(state.settings.name).not.toBe("Тестовый пользователь");
  }
});

for (const target of ["personal", other] as const) {
  for (const active of ["personal", other] as const) {
    test(`deleting ${target === "personal" ? "personal" : "custom"} with ${active === target ? "active" : "inactive"} target preserves the survivor on reload`, async ({
      page,
    }) => {
      const entries = await start(page, active);
      const survivor = target === "personal" ? other : "personal";
      await openProfiles(page);
      await button(
        page,
        `Удалить профиль: ${target === "personal" ? "Личный" : otherName}`,
      ).click();
      await confirm(page, false);
      await expect(button(page, "Профиль и настройки")).toBeVisible();
      const remaining = await data(page);
      expect(
        Object.keys(remaining).some((key) =>
          key.startsWith(`lad-profile-${target}:`),
        ),
      ).toBe(false);
      for (const [key, raw] of Object.entries(entries))
        if (key.startsWith(`lad-profile-${survivor}:`) || key === learningKey)
          expect(remaining[key]).toBe(raw);
      expect(remaining[ACTIVE_PROFILE_KEY]).toBe(survivor);
      expect(JSON.parse(remaining[PROFILE_REGISTRY_KEY]).profiles).toEqual([
        { id: survivor, name: survivor === "personal" ? "Личный" : otherName },
      ]);
      await page.reload();
      await expect(button(page, "Профиль и настройки")).toBeVisible();
      expect(await data(page)).toEqual(remaining);
    });
  }
}

test("deleting the last profile returns welcome without an automatic replacement ledger", async ({
  page,
}) => {
  await start(page, "personal", true);
  await openProfiles(page);
  await button(page, "Удалить профиль: Личный").click();
  await expect(
    page.getByText(/После удаления последнего профиля/),
  ).toBeVisible();
  await confirm(page, false);
  await expect(welcome(page)).toBeVisible();
  const remaining = await data(page);
  expect(remaining[profileStorageKey("personal")]).toBeUndefined();
  expect(remaining[learningKey]).toBeUndefined();
  expect(JSON.parse(remaining[PROFILE_REGISTRY_KEY])).toEqual({
    version: 2,
    profiles: [],
  });
  await page.reload();
  await expect(welcome(page)).toBeVisible();
  await button(page, "Настроить свой учёт").click();
  await finishAccountSetup(page);
  await button(page, "Начать без обучения").click();
  await expect(button(page, "Профиль и настройки")).toBeVisible();
});

test("partial deletion keeps the app closed across restart and finishes on explicit retry", async ({
  page,
}) => {
  await page.addInitScript((key) => {
    const remove = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function (name) {
      if (
        this === localStorage &&
        name === key &&
        sessionStorage.getItem("allow-deletion") !== "yes"
      )
        throw new Error("synthetic deletion failure");
      return remove.call(this, name);
    };
  }, profileStorageKey("personal"));
  await start(page);
  await fullReset(page);
  await confirm(page, true);
  await expect(button(page, "Повторить попытку")).toBeVisible();
  await expect(button(page, "Профиль и настройки")).toHaveCount(0);
  expect((await data(page))[DATA_DELETION_KEY]).toBeTruthy();
  await page.reload();
  await expect(button(page, "Повторить попытку")).toBeVisible();
  await expect(welcome(page)).toHaveCount(0);
  await page.evaluate(() => sessionStorage.setItem("allow-deletion", "yes"));
  await button(page, "Повторить попытку").click();
  await expect(welcome(page)).toBeVisible();
  expect(await data(page)).toEqual({});
});
