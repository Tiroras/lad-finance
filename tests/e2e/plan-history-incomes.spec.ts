import { expect, test, type Page } from "@playwright/test";
import { bundleBrowserModule } from "./browserBundle";
import type * as IncomeFixture from "../helpers/t05IncomeCases";
import { pickDate } from "./helpers";

type Browser = typeof globalThis & {
  __browserTestModule: typeof IncomeFixture;
};
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
let bundle: string;
test.beforeAll(async () => {
  bundle = await bundleBrowserModule("tests/helpers/t05IncomeCases.ts");
});
test.beforeEach(async ({ page }) => {
  await page.route("https://api.frankfurter.dev/**", (route) => route.abort());
  await page.clock.install({ time: new Date("2026-10-18T12:00:00+04:00") });
  await page.addInitScript({
    content: `${bundle}\n;globalThis.__browserTestModule = __browserTestModule; __browserTestModule.installIncomeUi();`,
  });
  await page.goto("/");
  await expect(button(page, "Добавить операцию")).toBeVisible();
});
const read = (page: Page) =>
  page.evaluate(() =>
    (globalThis as Browser).__browserTestModule.readIncomeUi(),
  );
async function openIncome(page: Page) {
  await button(page, "Прогноз по дням").click();
  await button(page, "Доход: Гонорар Т05").click();
  await expect(
    page.getByLabel("Название планируемого дохода", { exact: true }),
  ).toHaveValue("Гонорар Т05");
}
async function move(page: Page, original: string) {
  await pickDate(page, "Исходная дата поступления", original);
  await pickDate(page, "Новая ожидаемая дата дохода", "2026-10-20");
  await button(page, "Перенести поступление").click();
  await button(page, "Подтвердить изменение поступления").click();
  await expect
    .poll(
      async () =>
        (await read(page)).plannedIncomes?.[0].occurrenceOverrides?.find(
          (entry) => entry.occurrenceDate === original,
        )?.expectedDate,
    )
    .toBe("2026-10-20");
}

test("T05 income: new terms require preview and preserve historical receipt across reload", async ({
  page,
}, info) => {
  await openIncome(page);
  await page
    .getByLabel("Сумма планируемого дохода", { exact: true })
    .fill("200");
  await page.getByRole("tab", { name: "Месяц", exact: true }).click();
  await pickDate(page, "Дата планируемого дохода", "2026-10-20");
  await pickDate(page, "Новые условия дохода с", "2026-10-20");
  await button(page, "Сохранить план дохода").click();
  await expect(button(page, "Подтвердить новые условия дохода")).toBeVisible();
  expect((await read(page)).plannedIncomes?.[0].versions).toBeUndefined();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await button(
      page,
      "Подтвердить новые условия дохода",
    ).scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await page.screenshot({
      path: info.outputPath(`income-history-preview-${width}.png`),
      animations: "disabled",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await button(page, "Подтвердить новые условия дохода").click();
  await expect
    .poll(async () => (await read(page)).plannedIncomes?.[0].versions?.length)
    .toBe(2);
  const changed = await read(page);
  expect(
    changed.plannedIncomes?.[0].versions?.map((version) => version.amount),
  ).toEqual([10_000, 20_000]);
  expect(changed.transactions).toHaveLength(0);
  await page.reload();
  await expect(button(page, "Добавить операцию")).toBeVisible();
  await openIncome(page);
  await button(page, "Условия с 10 октября 2026 г.").click();
  await pickDate(page, "Исходная дата поступления", "2026-10-10");
  await button(page, "Доход получен — записать").click();
  await expect.poll(async () => (await read(page)).transactions.length).toBe(1);
  const received = (await read(page)).transactions[0];
  expect(received).toMatchObject({
    amount: 10_000,
    incomeOccurrenceDate: "2026-10-10",
    incomeVersionId: "legacy",
    date: "2026-10-18",
  });
  await expect(button(page, "Открыть полученный доход")).toBeVisible();
});

test("T05 income: two moved events share a date without sharing cancellation or receipt", async ({
  page,
}) => {
  await openIncome(page);
  await move(page, "2026-10-10");
  await move(page, "2026-10-17");
  await pickDate(page, "Исходная дата поступления", "2026-10-10");
  await button(page, "Отменить это поступление").click();
  expect(
    (await read(page)).plannedIncomes?.[0].occurrenceOverrides?.find(
      (entry) => entry.occurrenceDate === "2026-10-10",
    )?.cancelled,
  ).toBeUndefined();
  await button(page, "Подтвердить изменение поступления").click();
  await expect(button(page, "Вернуть поступление в план")).toBeVisible();
  await pickDate(page, "Исходная дата поступления", "2026-10-17");
  await button(page, "Доход получен — записать").click();
  await expect.poll(async () => (await read(page)).transactions.length).toBe(1);
  await page.reload();
  await expect(button(page, "Добавить операцию")).toBeVisible();
  const saved = await read(page);
  expect(saved.plannedIncomes?.[0].occurrenceOverrides).toHaveLength(2);
  expect(
    saved.plannedIncomes?.[0].occurrenceOverrides?.find(
      (entry) => entry.occurrenceDate === "2026-10-10",
    )?.cancelled,
  ).toBe(true);
  expect(saved.transactions[0]).toMatchObject({
    incomeOccurrenceDate: "2026-10-17",
    amount: 10_000,
    date: "2026-10-18",
  });
});

test("T05 income: pause previews affected dates and survives restart", async ({
  page,
}) => {
  await openIncome(page);
  await button(page, "Приостановить повторения дохода").click();
  await expect(
    page.getByText(/Прекратить генерацию с 19 октября/),
  ).toBeVisible();
  expect((await read(page)).plannedIncomes?.[0].paused).toBeUndefined();
  await button(page, "Подтвердить режим повторений дохода").click();
  await expect
    .poll(async () => (await read(page)).plannedIncomes?.[0].paused)
    .toBe(true);
  await page.reload();
  await expect(button(page, "Добавить операцию")).toBeVisible();
  await openIncome(page);
  await expect(page.getByText(/Повторения приостановлены/)).toBeVisible();
  const paused = await read(page);
  expect(paused.plannedIncomes?.[0].versions?.[0].effectiveTo).toBe(
    "2026-10-19",
  );
  expect(paused.transactions).toHaveLength(0);
  await button(page, "Возобновить доход с прежними условиями").click();
  await button(page, "Подтвердить режим повторений дохода").click();
  await expect
    .poll(async () => (await read(page)).plannedIncomes?.[0].paused)
    .toBe(false);
  expect(
    (await read(page)).plannedIncomes?.[0].versions?.[0].effectiveTo,
  ).toBeUndefined();
});

test("T05 income: editing any term invalidates its confirmation snapshot", async ({
  page,
}) => {
  await openIncome(page);
  await page
    .getByLabel("Сумма планируемого дохода", { exact: true })
    .fill("200");
  const changes = [
    () =>
      page.getByLabel("Сумма планируемого дохода", { exact: true }).fill("300"),
    () =>
      page
        .getByLabel("Название планируемого дохода", { exact: true })
        .fill("Уточнённый гонорар"),
    () => page.getByLabel("Интервал повторения", { exact: true }).fill("2"),
    () => pickDate(page, "Дата планируемого дохода", "2026-10-22"),
    () => pickDate(page, "Новые условия дохода с", "2026-10-21"),
    () => button(page, "Наличные").click(),
    () => page.getByRole("tab", { name: "Один раз", exact: true }).click(),
  ];
  for (const change of changes) {
    await button(page, "Сохранить план дохода").click();
    await expect(
      button(page, "Подтвердить новые условия дохода"),
    ).toBeVisible();
    await change();
    await expect(button(page, "Подтвердить новые условия дохода")).toHaveCount(
      0,
    );
    expect((await read(page)).plannedIncomes?.[0].versions).toBeUndefined();
  }
  await button(page, "Сохранить план дохода").click();
  await button(page, "Подтвердить новые условия дохода").click();
  await expect
    .poll(async () => (await read(page)).plannedIncomes?.[0].versions?.length)
    .toBe(2);
  const saved = (await read(page)).plannedIncomes![0];
  expect(saved).toMatchObject({
    name: "Уточнённый гонорар",
    amount: 30_000,
    date: "2026-10-22",
    repeat: "once",
    accountId: "cash",
  });
  expect(saved.versions?.at(-1)).toMatchObject({
    amount: 30_000,
    effectiveFrom: "2026-10-21",
    repeat: "once",
    accountId: "cash",
  });
  expect(saved.versions?.at(-1)?.schedule).toBeUndefined();
});

test("T05 income: replaced future conditions are visibly cancelled in history", async ({
  page,
}) => {
  await openIncome(page);
  await page
    .getByLabel("Сумма планируемого дохода", { exact: true })
    .fill("200");
  await pickDate(page, "Новые условия дохода с", "2026-10-25");
  await button(page, "Сохранить план дохода").click();
  await button(page, "Подтвердить новые условия дохода").click();
  await expect
    .poll(async () => (await read(page)).plannedIncomes?.[0].versions?.length)
    .toBe(2);
  await button(page, "Доход: Гонорар Т05").click();
  await page
    .getByLabel("Сумма планируемого дохода", { exact: true })
    .fill("300");
  await button(page, "Сохранить план дохода").click();
  await expect(
    page.getByText(/Будущих версий будет заменено: 1/),
  ).toBeVisible();
  await button(page, "Подтвердить новые условия дохода").click();
  await expect
    .poll(
      async () =>
        (await read(page)).plannedIncomes?.[0].versions?.filter(
          (version) => version.voided,
        ).length,
    )
    .toBe(1);
  await button(page, "Доход: Гонорар Т05").click();
  await expect(
    page.getByText("Отменены до начала действия", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Планировались с 25 октября 2026 г.", { exact: true }),
  ).toBeVisible();
});

test("T05 income: future conditions show their date and renaming needs no transition", async ({
  page,
}) => {
  await openIncome(page);
  await page
    .getByLabel("Сумма планируемого дохода", { exact: true })
    .fill("200");
  await pickDate(page, "Новые условия дохода с", "2026-10-20");
  await button(page, "Сохранить план дохода").click();
  await button(page, "Подтвердить новые условия дохода").click();
  await expect
    .poll(async () => (await read(page)).plannedIncomes?.[0].versions?.length)
    .toBe(2);
  await expect(button(page, "Доход: Гонорар Т05")).toContainText(
    "Показаны условия с 20 октября 2026 г.",
  );
  await button(page, "Доход: Гонорар Т05").click();
  await pickDate(page, "Исходная дата поступления", "2026-10-24");
  await button(page, "Доход получен — записать").click();
  await expect.poll(async () => (await read(page)).transactions.length).toBe(1);
  const before = await read(page);
  expect(before.transactions[0].incomeOccurrenceDate).toBe("2026-10-24");
  await page
    .getByLabel("Название планируемого дохода", { exact: true })
    .fill("Новое название без перехода");
  await button(page, "Сохранить план дохода").click();
  await expect(button(page, "Подтвердить новые условия дохода")).toHaveCount(0);
  await expect(
    button(page, "Доход: Новое название без перехода"),
  ).toBeVisible();
  const renamed = await read(page);
  expect(renamed.plannedIncomes?.[0].versions).toEqual(
    before.plannedIncomes?.[0].versions,
  );
  expect(renamed.transactions).toEqual(before.transactions);
  await expect(
    button(page, "Доход: Новое название без перехода"),
  ).toContainText("Показаны условия с 20 октября 2026 г.");
});
