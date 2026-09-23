import { expect, test, type Page } from "@playwright/test";
import { createInitialState } from "../../src/domain/seed";
import { readState, startApp } from "./helpers";

const TODAY = "2026-09-10";
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const tab = (page: Page, name: string) =>
  page.getByRole("tab", { name, exact: true });
const option = (page: Page, name: string) =>
  page.getByRole("radio", { name, exact: true });
const fixture = () => {
  const state = createInitialState(false, TODAY);
  state.settings.exchange = { automatic: false, rates: {} };
  state.settings.onboardingCompleted = true;
  state.categories.find((category) => category.id === "cafe")!.archived = true;
  state.categories.push({
    id: "vegetables",
    name: "Овощи",
    parentId: "groceries",
    budget: 0,
    icon: "leaf-outline",
    color: "#286347",
    background: "#EFF6EA",
  });
  return state;
};

async function openCategories(page: Page) {
  await button(page, "Профиль и настройки").click();
  await button(page, "Категории и подкатегории").click();
}

test("category form requires an active parent and saves the selected icon and color after reload", async ({
  page,
}) => {
  const initial = fixture();
  await startApp(page, TODAY, initial);
  await openCategories(page);
  await button(page, "Создать категорию").click();
  await page.getByLabel("Название категории", { exact: true }).fill("Такси");
  await expect(tab(page, "Основная категория")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(button(page, "Основная категория")).toHaveCount(0);
  await tab(page, "Подкатегория").click();
  await button(page, "Сохранить категорию").click();
  await expect(page.getByRole("alert")).toHaveText(
    "Выберите основную категорию.",
  );
  expect(await readState(page)).toEqual(initial);

  await button(page, "Основная категория").click();
  await expect(button(page, "Основная категория")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(option(page, "Кафе и рестораны")).toHaveCount(0);
  await expect(option(page, "Овощи")).toHaveCount(0);
  await option(page, "Транспорт").click();
  await expect(button(page, "Основная категория")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(button(page, "Основная категория")).toContainText("Транспорт");
  await expect(
    page.getByText("Подкатегория · Транспорт", { exact: true }),
  ).toBeVisible();
  await button(page, "Значок").click();
  await option(page, "Транспорт").click();
  await expect(button(page, "Значок")).toContainText("Транспорт");
  await option(page, "Цвет: Коралловый").click();
  await expect(option(page, "Цвет: Коралловый")).toBeChecked();
  await expect(
    page.getByText("Цвет · Коралловый", { exact: true }),
  ).toBeVisible();
  await button(page, "Сохранить категорию").click();
  await expect(button(page, "Настроить: Транспорт / Такси")).toBeVisible();
  await expect
    .poll(async () => (await readState(page)).categories.length)
    .toBe(initial.categories.length + 1);
  const saved = await readState(page);
  const category = saved.categories.find((item) => item.name === "Такси")!;
  expect(category).toMatchObject({
    parentId: "transport",
    icon: "car-outline",
    color: "#B6614F",
    background: "#FBEDE7",
    budget: 0,
  });
  expect({ ...saved, categories: initial.categories }).toEqual(initial);
  await page.reload();
  await openCategories(page);
  await button(page, "Настроить: Транспорт / Такси").click();
  await expect(tab(page, "Подкатегория")).toHaveCount(0);
  await expect(button(page, "Основная категория")).toHaveCount(0);
  await expect(button(page, "Значок")).toContainText("Транспорт");
  await expect(option(page, "Цвет: Коралловый")).toBeChecked();
  await page
    .getByLabel("Название категории", { exact: true })
    .fill("Поездки на такси");
  await option(page, "Цвет: Индиго").click();
  await button(page, "Сохранить категорию").click();
  await expect
    .poll(
      async () =>
        (await readState(page)).categories.find(
          (item) => item.id === category.id,
        )?.name,
    )
    .toBe("Поездки на такси");
  expect(
    (await readState(page)).categories.find((item) => item.id === category.id),
  ).toEqual({
    ...category,
    name: "Поездки на такси",
    color: "#565A9D",
    background: "#ECECF8",
  });
});

test("category form switches back to a main category and preserves custom colors when editing", async ({
  page,
}) => {
  const initial = fixture();
  await startApp(page, TODAY, initial);
  await openCategories(page);
  await button(page, "Создать категорию").click();
  await page
    .getByLabel("Название категории", { exact: true })
    .fill("Образование");
  await tab(page, "Подкатегория").click();
  await button(page, "Основная категория").click();
  await option(page, "Продукты").click();
  await tab(page, "Основная категория").click();
  await expect(button(page, "Основная категория")).toHaveCount(0);
  await button(page, "Сохранить категорию").click();
  await expect(button(page, "Настроить: Образование")).toBeVisible();
  expect(
    (await readState(page)).categories.find(
      (item) => item.name === "Образование",
    )?.parentId,
  ).toBeUndefined();

  await button(page, "Настроить: Продукты / Овощи").click();
  await expect(option(page, "Цвет: Текущий цвет")).toBeChecked();
  await page
    .getByLabel("Название категории", { exact: true })
    .fill("Свежие овощи");
  await button(page, "Сохранить категорию").click();
  await expect
    .poll(
      async () =>
        (await readState(page)).categories.find(
          (item) => item.id === "vegetables",
        )?.name,
    )
    .toBe("Свежие овощи");
  expect(
    (await readState(page)).categories.find((item) => item.id === "vegetables"),
  ).toEqual({
    ...initial.categories.find((item) => item.id === "vegetables"),
    name: "Свежие овощи",
    archived: false,
  });
});

test("category form lists scroll and long names fit narrow and wide screens", async ({
  page,
}, testInfo) => {
  const initial = fixture();
  const longName = "Обслуживание автомобиля и дальние путешествия всей семьёй";
  initial.categories.push(
    ...Array.from({ length: 30 }, (_, index) => ({
      id: `custom-${index}`,
      name: index === 29 ? longName : `Основная категория ${index + 1}`,
      icon: "car-outline" as const,
      color: "#52768A",
      background: "#E8F0F5",
      budget: 0,
    })),
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await startApp(page, TODAY, initial);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await openCategories(page);
    await page.screenshot({
      path: testInfo.outputPath(`category-list-${width}.png`),
      animations: "disabled",
    });
    await button(page, "Создать категорию").click();
    await page
      .getByLabel("Название категории", { exact: true })
      .fill("Расходы на автомобиль в путешествии");
    await page.getByLabel("Название категории", { exact: true }).press("Enter");
    await page.screenshot({
      path: testInfo.outputPath(`category-main-${width}.png`),
      animations: "disabled",
    });
    await tab(page, "Подкатегория").click();
    await button(page, "Основная категория").click();
    await option(page, longName).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(`category-parent-list-${width}.png`),
      animations: "disabled",
    });
    await option(page, longName).click();
    await button(page, "Значок").click();
    await option(page, "Связь").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(`category-icon-list-${width}.png`),
      animations: "disabled",
    });
    await option(page, "Связь").click();
    await option(page, "Цвет: Бирюзовый").click();
    await expect(button(page, "Значок")).toContainText("Связь");
    await button(page, "Основная категория").scrollIntoViewIfNeeded();
    const bounds = await button(page, "Основная категория").boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(
      await page.evaluate(() =>
        Array.from(document.querySelectorAll('[role="dialog"] *')).every(
          (element) =>
            element.scrollWidth <= element.clientWidth + 1 ||
            element instanceof HTMLInputElement,
        ),
      ),
    ).toBe(true);
    await button(page, "Сохранить категорию").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(`category-preview-${width}.png`),
      animations: "disabled",
    });
    await button(page, "Закрыть").click();
  }
  expect(await readState(page)).toEqual(initial);
  expect(errors).toEqual([]);
});
