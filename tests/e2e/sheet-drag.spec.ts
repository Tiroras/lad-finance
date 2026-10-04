import { expect, test, type Page } from "@playwright/test";
import { createInitialState } from "../../src/domain/seed";
import { readState, startApp } from "./helpers";

const TODAY = "2026-09-10";
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const fixture = () => {
  const state = createInitialState(true, TODAY);
  state.settings.exchange = { automatic: false, rates: {} };
  return state;
};

test.use({ hasTouch: true });

// Real browser touch input exercises responder cancellation and CSS touch
// handling, which mouse drags alone cannot verify. Advance the installed browser
// clock explicitly so gesture velocity is independent of test-runner speed.
async function touchDrag(
  page: Page,
  start: { x: number; y: number },
  move: { x: number; y: number },
  duration = 400,
) {
  const session = await page.context().newCDPSession(page);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  const arrived = page.evaluate(
    (target) =>
      new Promise<void>((resolve) => {
        const onMove = (event: TouchEvent) => {
          const touch = event.changedTouches[0];
          if (
            Math.abs(touch.clientX - target.x) < 1 &&
            Math.abs(touch.clientY - target.y) < 1
          ) {
            document.removeEventListener("touchmove", onMove);
            resolve();
          }
        };
        document.addEventListener("touchmove", onMove);
      }),
    { x: start.x + move.x, y: start.y + move.y },
  );
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [start],
  });
  for (let step = 1; step <= 10; step++) {
    await page.clock.runFor(duration / 10);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: start.x + (move.x * step) / 10,
          y: start.y + (move.y * step) / 10,
        },
      ],
    });
  }
  await arrived;
  await page.clock.runFor(16);
  return async (cancel = false) => {
    await session.send("Input.dispatchTouchEvent", {
      type: cancel ? "touchCancel" : "touchEnd",
      touchPoints: [],
    });
    await page.clock.resume();
    await session.detach();
  };
}

async function handlePosition(page: Page) {
  const bounds = (await page.getByTestId("sheet-drag-area").boundingBox())!;
  return { x: bounds.x + bounds.width / 2, y: bounds.y + 12 };
}

async function expectSheetTop(page: Page, top: number) {
  await expect
    .poll(async () =>
      Math.abs((await page.getByTestId("sheet").boundingBox())!.y - top),
    )
    .toBeLessThan(1);
}

test("dragging the sheet header down dismisses it without saving the form", async ({
  page,
}) => {
  const initial = fixture();
  await startApp(page, TODAY, initial);
  await button(page, "Добавить операцию").click();
  await page.getByRole("button", { name: "Быстрый ввод", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Быстрый ввод", exact: true })
    .fill("кофе 350");
  const header = page.getByRole("heading", {
    name: "Новая операция",
    exact: true,
  });
  const bounds = (await header.boundingBox())!;
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 180, { steps: 12 });
  await expect
    .poll(async () => (await header.boundingBox())!.y)
    .toBeGreaterThan(bounds.y + 120);
  await page.mouse.up();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await readState(page)).toEqual(initial);
  await button(page, "Добавить операцию").click();
  await expect(header).toBeVisible();
  await page.getByRole("button", { name: "Быстрый ввод", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Быстрый ввод", exact: true }),
  ).toHaveValue("");
  expect((await header.boundingBox())!.y).toBeCloseTo(bounds.y, 0);
});

for (const width of [320, 390, 1440]) {
  test(`touch dragging the payment handle dismisses the sheet at ${width}px`, async ({
    page,
  }, testInfo) => {
    const initial = fixture();
    await page.setViewportSize({ width, height: 900 });
    await startApp(page, TODAY, initial);
    await page.getByRole("button", { name: /^(Впереди|Просрочен):/ }).click();
    await expect(
      page.getByRole("heading", { name: "Запланированный платёж" }),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toBeVisible();
    const top = (await page.getByTestId("sheet").boundingBox())!.y;
    await page.screenshot({
      path: testInfo.outputPath("payment-open.png"),
      animations: "disabled",
    });
    const release = await touchDrag(page, await handlePosition(page), {
      x: 0,
      y: 180,
    });
    await expect
      .poll(async () => (await page.getByTestId("sheet").boundingBox())!.y)
      .toBeGreaterThan(top + 120);
    await page.screenshot({
      path: testInfo.outputPath("payment-dragged.png"),
      animations: "disabled",
    });
    await release();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await readState(page)).toEqual(initial);
  });
}

test("header taps and short, sideways, upward or cancelled drags keep the draft open", async ({
  page,
}) => {
  const initial = fixture();
  await startApp(page, TODAY, initial);
  await button(page, "Профиль и настройки").click();
  await button(page, "Профиль и планирование").click();
  const name = page.getByLabel("Ваше имя", { exact: true });
  await name.fill("Черновик имени");
  const top = (await page.getByTestId("sheet").boundingBox())!.y;
  const handle = await handlePosition(page);
  await page.touchscreen.tap(handle.x, handle.y);
  await expectSheetTop(page, top);
  await expect(name).toHaveValue("Черновик имени");
  for (const move of [
    { x: 0, y: 24 },
    { x: 0, y: 70 },
    { x: 100, y: 10 },
    { x: 0, y: -20 },
  ]) {
    const release = await touchDrag(page, await handlePosition(page), move);
    if (move.x > 0 || move.y < 0) await expectSheetTop(page, top);
    await release();
    await expectSheetTop(page, top);
    await expect(name).toHaveValue("Черновик имени");
  }
  const cancel = await touchDrag(page, await handlePosition(page), {
    x: 0,
    y: 180,
  });
  await expect
    .poll(async () => (await page.getByTestId("sheet").boundingBox())!.y)
    .toBeGreaterThan(top + 120);
  await cancel(true);
  await expectSheetTop(page, top);
  await expect(name).toHaveValue("Черновик имени");
  expect(await readState(page)).toEqual(initial);
  await button(page, "Назад").click();
  await expect(page.getByRole("heading", { name: "Ваш Лад" })).toBeVisible();
  await button(page, "Закрыть").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("a fast downward flick closes nested settings and clears the back history", async ({
  page,
}) => {
  const initial = fixture();
  await startApp(page, TODAY, initial);
  await button(page, "Профиль и настройки").click();
  await button(page, "Данные и копии").click();
  await button(page, "Импортировать банковский CSV").click();
  await expect(
    page.getByRole("heading", { name: "Импорт банковской выписки" }),
  ).toBeVisible();
  const release = await touchDrag(
    page,
    await handlePosition(page),
    { x: 0, y: 80 },
    80,
  );
  await release();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await button(page, "Профиль и настройки").click();
  await expect(page.getByRole("heading", { name: "Ваш Лад" })).toBeVisible();
  await expect(button(page, "Назад")).toHaveCount(0);
  expect(await readState(page)).toEqual(initial);
});

test("touch scrolling a long form leaves the sheet in place and its handle still closes it", async ({
  page,
}) => {
  const initial = fixture();
  await page.setViewportSize({ width: 320, height: 660 });
  await startApp(page, TODAY, initial);
  await button(page, "Добавить операцию").click();
  const sheet = page.getByTestId("sheet");
  const scroll = page.getByTestId("sheet-scroll");
  const top = (await sheet.boundingBox())!.y;
  const viewport = (await scroll.boundingBox())!;
  const x = viewport.x + 8;
  const releaseUp = await touchDrag(
    page,
    { x, y: viewport.y + viewport.height - 40 },
    { x: 0, y: -240 },
    600,
  );
  await releaseUp();
  await expect
    .poll(() => scroll.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(100);
  await expectSheetTop(page, top);
  const scrolled = await scroll.evaluate((element) => element.scrollTop);
  const releaseDown = await touchDrag(
    page,
    { x, y: viewport.y + 40 },
    { x: 0, y: 160 },
    600,
  );
  await releaseDown();
  await expect
    .poll(() => scroll.evaluate((element) => element.scrollTop))
    .toBeLessThan(scrolled - 50);
  await expectSheetTop(page, top);
  await expect(page.getByRole("dialog")).toBeVisible();
  // Header dismissal also works when the content has not returned to the top.
  // Prepare that scrolled position with the same touch input as the rest of the test.
  const releaseBeforeDismiss = await touchDrag(
    page,
    { x, y: viewport.y + viewport.height - 40 },
    { x: 0, y: -240 },
    600,
  );
  await releaseBeforeDismiss();
  await expect
    .poll(() => scroll.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(100);
  const release = await touchDrag(page, await handlePosition(page), {
    x: 0,
    y: 180,
  });
  await release();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await readState(page)).toEqual(initial);
});
