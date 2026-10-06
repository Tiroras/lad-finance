import { expect, test, type Locator, type Page } from "@playwright/test";
import { createInitialState } from "../../src/domain/seed";
import { tourSteps } from "../../src/features/settings/lib/tourSteps";
import type { LearningProgress } from "../../src/features/settings/model/learningProgress";
import {
  activeProfile,
  finishAccountSetup,
  openProfiles,
  readState,
  startApp,
  startDemoApp,
  switchProfile,
} from "./helpers";

type MeasurementCounts = Record<
  "target" | "coach" | "frame" | "viewport",
  number
>;
type ProbeRect = { x: number; y: number; width: number; height: number };
type MeasurementProbe = {
  observe: (targetId: string, contentId: string) => void;
  snapshot: () => {
    counts: MeasurementCounts;
    targetY: number;
    spotlightY: number;
    coachY: number;
    targetBounds: ProbeRect;
    viewportBounds: ProbeRect;
    scrollTop: number;
  };
  scroll: (offset?: number) => Promise<void>;
};
declare global {
  interface Window {
    __tourMeasurementProbe: MeasurementProbe;
  }
}

const TODAY = "2026-09-10";
const KEY = "lad-learning-progress-v1";
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const coach = (page: Page) => page.getByTestId("tour-coach");
const overlay = (page: Page) => page.getByTestId("tour-overlay");
const readProgress = (page: Page): Promise<LearningProgress> =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), KEY);

async function expectStep(page: Page, id: string) {
  const step = tourSteps.find((value) => value.id === id)!;
  await expect(coach(page)).toHaveCount(1);
  await expect(
    coach(page).getByRole("heading", { name: step.title, exact: true }),
  ).toBeVisible();
  await expect.poll(async () => (await readProgress(page)).step).toBe(id);
  if (!step.sheets.length)
    await expect(page.getByTestId("sheet")).toHaveCount(0);
  const target = page.getByTestId(`tour-target-${step.target}`);
  await expect(target).toBeVisible();
  await expectSpotlight(page, target, step.target === "data.backups");
  return target;
}

async function expectSpotlight(page: Page, target: Locator, tallBlock = false) {
  await expect(overlay(page)).toHaveCount(1);
  await expect(page.getByTestId("tour-spotlight")).toHaveCount(1);
  await expect(target).toBeInViewport({ ratio: tallBlock ? 0.1 : 1 });
  await expect(coach(page)).toBeInViewport({ ratio: 1 });
  await expect
    .poll(async () => {
      const [actual, highlighted, explanation, shade] = await Promise.all([
        target.boundingBox(),
        page.getByTestId("tour-spotlight").boundingBox(),
        coach(page).boundingBox(),
        overlay(page).boundingBox(),
      ]);
      if (!actual || !highlighted || !explanation || !shade) return false;
      const viewport = page.viewportSize()!;
      const contains =
        highlighted.x <= actual.x + 1 &&
        highlighted.y <= actual.y + 1 &&
        highlighted.x + highlighted.width >= actual.x + actual.width - 1 &&
        highlighted.y + highlighted.height >= actual.y + actual.height - 1;
      const followsTarget =
        highlighted.width <= actual.width + 24 &&
        highlighted.height <= actual.height + 24;
      const separate =
        explanation.x + explanation.width <= highlighted.x ||
        highlighted.x + highlighted.width <= explanation.x ||
        explanation.y + explanation.height <= highlighted.y ||
        highlighted.y + highlighted.height <= explanation.y;
      const coversViewport =
        shade.x <= 1 &&
        shade.y <= 1 &&
        shade.x + shade.width >= viewport.width - 1 &&
        shade.y + shade.height >= viewport.height - 1;
      return contains && followsTarget && separate && coversViewport;
    })
    .toBe(true);
}

async function activate(target: Locator) {
  await target.getByRole("button").or(target.getByRole("tab")).first().click();
}

async function expectSpotlightFollowsScroll(page: Page, target: Locator) {
  await target.hover();
  const before = (await target.boundingBox())!;
  await page.mouse.wheel(0, -24);
  await expect
    .poll(async () => (await target.boundingBox())!.y - before.y)
    .toBeGreaterThan(10);
  await expectSpotlight(page, target);
}

async function beginLearning(page: Page) {
  await page.clock.install({ time: new Date(`${TODAY}T12:00:00+04:00`) });
  await page.goto("/");
  await button(page, "Настроить свой учёт").click();
  await finishAccountSetup(page);
  await button(page, "Пройти обучение").click();
  await expectStep(page, "home-formula");
}

async function openCatalog(page: Page) {
  await button(page, "Профиль и настройки").click();
  await button(page, "Обучение").click();
  await expect(
    page.getByRole("heading", { name: "Экскурсия по приложению", exact: true }),
  ).toBeVisible();
}

const sheetTitles: Record<string, string> = {
  formula: "Всё прозрачно",
  accounts: "Мои счета",
  simulate: "Примерка покупки",
  export: "Экспорт операций",
  scenarios: "Мои сценарии",
  settings: "Ваш Лад",
  profileSettings: "Профиль и планирование",
  currencies: "Валюты и курсы",
  categories: "Категории и подкатегории",
  automation: "Правила и шаблоны",
  profiles: "Профили",
  reminderSettings: "Напоминания",
  securitySettings: "Защита данных",
  dataSettings: "Данные и копии",
  csv: "Импорт банковской выписки",
  about: "О приложении",
};
const tabLabels = {
  home: "Обзор",
  transactions: "Операции",
  plan: "План",
  analytics: "Аналитика",
};
const sectionLabels = {
  budgets: "Бюджеты",
  goals: "Цели",
  payments: "Платежи",
  forecast: "Прогноз",
};

test.beforeEach(async ({ page }) => {
  await page.route("https://api.frankfurter.dev/**", (route) => route.abort());
});

async function installMeasurementProbe(page: Page) {
  await page.addInitScript(() => {
    const original = Element.prototype.getBoundingClientRect;
    let tracked = new Map<Element, keyof MeasurementCounts>();
    let counts: MeasurementCounts = {
      target: 0,
      coach: 0,
      frame: 0,
      viewport: 0,
    };
    let target: HTMLElement;
    let viewport: HTMLElement;
    const find = (id: string) => {
      const node = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
      if (!node) throw new Error(`Missing tour probe element: ${id}`);
      return node;
    };
    Element.prototype.getBoundingClientRect = function () {
      const name = tracked.get(this);
      if (name) counts[name]++;
      return original.call(this);
    };
    window.__tourMeasurementProbe = {
      observe(targetId, contentId) {
        target = find(targetId);
        let scroll: HTMLElement | null = find(contentId);
        while (
          scroll &&
          !/auto|scroll/.test(getComputedStyle(scroll).overflowY)
        )
          scroll = scroll.parentElement;
        if (!scroll) throw new Error("Tour probe needs a content viewport");
        viewport = scroll;
        tracked = new Map([
          [target, "target"],
          [find("tour-coach").parentElement!, "coach"],
          [find("tour-overlay").parentElement!, "frame"],
          [viewport, "viewport"],
        ]);
        counts = { target: 0, coach: 0, frame: 0, viewport: 0 };
      },
      snapshot: () => {
        const bounds = (node: HTMLElement) => {
          const { x, y, width, height } = original.call(node);
          return { x, y, width, height };
        };
        const spotlight = document.querySelector<HTMLElement>(
          '[data-testid="tour-spotlight"]',
        );
        const targetBounds = bounds(target);
        return {
          counts: { ...counts },
          targetY: targetBounds.y,
          spotlightY: spotlight ? bounds(spotlight).y : Number.NaN,
          coachY: bounds(find("tour-coach")).y,
          targetBounds,
          viewportBounds: bounds(viewport),
          scrollTop: viewport.scrollTop,
        };
      },
      scroll: (offset) =>
        new Promise<void>((resolve, reject) => {
          const complete = () => resolve();
          viewport.addEventListener("scroll", complete, { once: true });
          const before = viewport.scrollTop;
          viewport.scrollTop = offset ?? before + (before > 0 ? -24 : 24);
          if (viewport.scrollTop === before) {
            viewport.removeEventListener("scroll", complete);
            if (offset !== undefined) {
              resolve();
              return;
            }
            reject(
              new Error("The tour probe did not scroll the real viewport"),
            );
          }
        }),
    };
  });
}

test("tour geometry stays idle and scrolling moves the spotlight without remeasuring", async ({
  page,
}) => {
  await installMeasurementProbe(page);
  await startDemoApp(page, TODAY);
  const state = await readState(page);
  await openCatalog(page);
  await button(page, "Начать экскурсию").click();
  await expectStep(page, "home-formula");

  async function observe(target: string, content: string) {
    // The Modal fade follows real browser time, independently of the test clock.
    // Finish opening before measuring work caused by scrolling.
    await expect
      .poll(() => page.evaluate(() => document.getAnimations().length))
      .toBe(0);
    await page.clock.runFor(500);
    await page.evaluate(
      ({ target, content }) =>
        window.__tourMeasurementProbe.observe(target, content),
      { target, content },
    );
  }
  async function verifyScroll(moving: boolean) {
    const before = await page.evaluate(() =>
      window.__tourMeasurementProbe.snapshot(),
    );
    await page.evaluate(() => window.__tourMeasurementProbe.scroll());
    await page.clock.runFor(250);
    const after = await page.evaluate(() =>
      window.__tourMeasurementProbe.snapshot(),
    );
    expect(after.counts.coach).toBe(0);
    expect(after.counts.frame).toBe(0);
    expect(after.counts.viewport).toBe(0);
    expect(after.counts.target).toBe(0);
    expect(after.coachY).toBe(before.coachY);
    if (moving) {
      expect(after.targetY).not.toBe(before.targetY);
      expect(
        Math.abs(
          after.spotlightY - before.spotlightY - after.targetY + before.targetY,
        ),
      ).toBeLessThan(1);
    } else {
      expect(after.targetY).toBe(before.targetY);
      expect(after.spotlightY).toBe(before.spotlightY);
    }
  }

  await observe("tour-target-home.formula", "screen-home");
  await page.clock.runFor(1000);
  expect(
    (await page.evaluate(() => window.__tourMeasurementProbe.snapshot()))
      .counts,
  ).toEqual({ target: 0, coach: 0, frame: 0, viewport: 0 });
  await verifyScroll(true);
  await expectStep(page, "home-formula");

  const navigationIndex = tourSteps.findIndex(
    (step) => step.id === "open-transactions",
  );
  for (let index = 0; index < navigationIndex; index++) {
    await button(page, "Пропустить шаг").click();
    await expectStep(page, tourSteps[index + 1].id);
  }
  await observe("tour-target-nav.transactions", "screen-home");
  await verifyScroll(false);
  await button(page, "Продолжить позже").click();
  await openCatalog(page);
  await button(page, "Настройки и перенос данных").click();
  await activate(await expectStep(page, "open-settings"));
  await expectStep(page, "open-profileSettings");
  await observe("tour-target-settings.profileSettings", "sheet-scroll");
  await verifyScroll(true);
  await expectStep(page, "open-profileSettings");
  expect(await readState(page)).toEqual(state);
});

async function visibleSpotlight(page: Page): Promise<ProbeRect | null> {
  return page.evaluate(() => {
    const node = document.querySelector<HTMLElement>(
      '[data-testid="tour-spotlight"]',
    );
    if (!node) return null;
    for (
      let parent: HTMLElement | null = node;
      parent;
      parent = parent.parentElement
    )
      if (getComputedStyle(parent).opacity === "0") return null;
    return new Promise<ProbeRect | null>((resolve) => {
      const observer = new IntersectionObserver(([entry]) => {
        observer.disconnect();
        const { x, y, width, height } = entry.intersectionRect;
        resolve(width && height ? { x, y, width, height } : null);
      });
      observer.observe(node);
    });
  });
}

test("a scrolling spotlight stays clipped and survives offset changes, resize and pause", async ({
  page,
}, testInfo) => {
  await installMeasurementProbe(page);
  await page.setViewportSize({ width: 320, height: 740 });
  await startDemoApp(page, TODAY);
  const state = await readState(page);
  await openCatalog(page);
  await button(page, "Начать экскурсию").click();
  await activate(await expectStep(page, "home-formula"));
  await activate(await expectStep(page, "formula"));
  await expectStep(page, "home-accounts");
  await page.clock.runFor(500);
  await page.evaluate(() =>
    window.__tourMeasurementProbe.observe(
      "tour-target-home.accounts",
      "screen-home",
    ),
  );
  const initial = await page.evaluate(() =>
    window.__tourMeasurementProbe.snapshot(),
  );
  const contentTop =
    initial.targetY - initial.viewportBounds.y + initial.scrollTop;
  const targetHeight = initial.targetBounds.height;
  const viewportHeight = initial.viewportBounds.height;
  const offsets = {
    visible: Math.max(0, contentTop - 24),
    "top-clipped": contentTop + targetHeight / 2,
    "above-viewport": contentTop + targetHeight + 20,
    "bottom-clipped": Math.max(
      0,
      contentTop - viewportHeight + targetHeight / 2,
    ),
    "below-viewport": Math.max(0, contentTop - viewportHeight - 20),
  };
  for (const [name, offset] of Object.entries(offsets)) {
    await page.evaluate(
      (top) => window.__tourMeasurementProbe.scroll(top),
      offset,
    );
    await page.clock.runFor(80);
    const current = await page.evaluate(() =>
      window.__tourMeasurementProbe.snapshot(),
    );
    expect(current.counts).toEqual({
      target: 0,
      coach: 0,
      frame: 0,
      viewport: 0,
    });
    expect(current.coachY).toBe(initial.coachY);
    const { targetBounds: actual, viewportBounds: viewport } = current;
    const expectedTop = Math.max(actual.y - 5, viewport.y);
    const expectedBottom = Math.min(
      actual.y + actual.height + 5,
      viewport.y + viewport.height,
    );
    const rendered = await visibleSpotlight(page);
    if (name === "above-viewport" || name === "below-viewport") {
      expect(
        actual.y + actual.height <= viewport.y ||
          actual.y >= viewport.y + viewport.height,
      ).toBe(true);
      expect(rendered).toBeNull();
    } else {
      expect(rendered).not.toBeNull();
      expect(Math.abs(rendered!.y - expectedTop)).toBeLessThan(1);
      expect(
        Math.abs(rendered!.height - (expectedBottom - expectedTop)),
      ).toBeLessThan(1);
      expect(rendered!.y).toBeGreaterThanOrEqual(viewport.y - 1);
      expect(rendered!.y + rendered!.height).toBeLessThanOrEqual(
        viewport.y + viewport.height + 1,
      );
    }
    await page.screenshot({
      path: testInfo.outputPath(`tour-scroll-${name}.png`),
      animations: "disabled",
    });
  }
  for (const offset of [
    offsets.visible,
    offsets["top-clipped"],
    offsets["bottom-clipped"],
    offsets.visible,
  ])
    await page.evaluate(
      (top) => window.__tourMeasurementProbe.scroll(top),
      offset,
    );
  await button(page, "Пропустить шаг").click();
  await expectStep(page, "accounts");
  await page.setViewportSize({ width: 390, height: 844 });
  await expectStep(page, "accounts");
  await activate(await expectStep(page, "accounts"));
  await expectStep(page, "home-purchase");
  await page.setViewportSize({ width: 320, height: 640 });
  await expectStep(page, "home-purchase");
  await page.clock.runFor(500);
  await page.evaluate(() =>
    window.__tourMeasurementProbe.observe(
      "tour-target-home.simulate",
      "screen-home",
    ),
  );
  const scrolling = page.evaluate(() => window.__tourMeasurementProbe.scroll());
  await button(page, "Продолжить позже").click();
  await scrolling;
  await expect(overlay(page)).toHaveCount(0);
  await page.clock.runFor(1000);
  await expect(overlay(page)).toHaveCount(0);
  expect(await readState(page)).toEqual(state);
});

test.describe("tour sheet gestures", () => {
  test.use({ hasTouch: true });

  test("the coach and spotlight follow a dragged sheet without measuring each animation frame", async ({
    page,
  }, testInfo) => {
    await installMeasurementProbe(page);
    await page.setViewportSize({ width: 320, height: 740 });
    await startDemoApp(page, TODAY);
    const state = await readState(page);
    await openCatalog(page);
    await button(page, "Начать экскурсию").click();
    await activate(await expectStep(page, "home-formula"));
    await expectStep(page, "formula");
    // The opening Modal still has a CSS fade and an onShow layout refresh.
    // Count only work caused by dragging, once opening has finished.
    await expect
      .poll(() => page.evaluate(() => document.getAnimations().length))
      .toBe(0);
    const header = (await page.getByTestId("sheet-drag-area").boundingBox())!;
    const start = { x: header.x + header.width / 2, y: header.y + 12 };
    const session = await page.context().newCDPSession(page);
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
    await page.evaluate(() =>
      window.__tourMeasurementProbe.observe(
        "tour-target-sheet.close",
        "sheet-scroll",
      ),
    );
    const before = await page.evaluate(() =>
      window.__tourMeasurementProbe.snapshot(),
    );
    try {
      const arrived = page.evaluate(
        (point) =>
          new Promise<void>((resolve) => {
            const onMove = (event: TouchEvent) => {
              const touch = event.changedTouches[0];
              if (
                Math.abs(touch.clientX - point.x) < 1 &&
                Math.abs(touch.clientY - point.y) < 1
              ) {
                document.removeEventListener("touchmove", onMove);
                resolve();
              }
            };
            document.addEventListener("touchmove", onMove);
          }),
        { x: start.x, y: start.y + 64 },
      );
      await session.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [start],
      });
      for (let index = 1; index <= 8; index++) {
        await page.clock.runFor(80);
        await session.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: start.x, y: start.y + index * 8 }],
        });
      }
      await arrived;
      await page.clock.runFor(32);
      const dragged = await page.evaluate(() =>
        window.__tourMeasurementProbe.snapshot(),
      );
      const displacement = dragged.targetY - before.targetY;
      expect(displacement).toBeGreaterThan(40);
      expect(
        Math.abs(dragged.spotlightY - before.spotlightY - displacement),
      ).toBeLessThan(1);
      expect(
        Math.abs(dragged.coachY - before.coachY - displacement),
      ).toBeLessThan(1);
      expect(dragged.counts).toEqual({
        target: 0,
        coach: 0,
        frame: 0,
        viewport: 0,
      });
      await page.screenshot({
        path: testInfo.outputPath("tour-sheet-dragged.png"),
        animations: "disabled",
      });
      await session.send("Input.dispatchTouchEvent", {
        type: "touchCancel",
        touchPoints: [],
      });
      await page.clock.runFor(1500);
      const restored = await page.evaluate(() =>
        window.__tourMeasurementProbe.snapshot(),
      );
      expect(Math.abs(restored.targetY - before.targetY)).toBeLessThan(1);
      expect(Math.abs(restored.spotlightY - before.spotlightY)).toBeLessThan(1);
      expect(Math.abs(restored.coachY - before.coachY)).toBeLessThan(1);
      expect(restored.counts).toEqual({
        target: 0,
        coach: 0,
        frame: 0,
        viewport: 0,
      });
    } finally {
      await page.clock.resume();
      await session.detach();
    }
    await expectStep(page, "formula");
    expect(await readState(page)).toEqual(state);
    await button(page, "Продолжить позже").click();
    await expect(overlay(page)).toHaveCount(0);
  });
});

for (const width of [320, 390]) {
  test(`closing a tour sheet reveals the next target after dismissal at ${width}px without another tap`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await beginLearning(page);
    await activate(await expectStep(page, "home-formula"));
    await activate(await expectStep(page, "formula"));
    await expect(page.getByTestId("sheet")).toHaveCount(0);
    // Modal focus restoration happens after its closing animation. Observe the
    // settled next step without another gesture that could reveal it for us.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
    await expectStep(page, "home-accounts");
  });
}

test("a fixed spotlight follows late sheet layout without an animation frame or another tap", async ({
  page,
}) => {
  await beginLearning(page);
  await page.evaluate(() => {
    // Install before the new frame creates its measurement queue.
    window.requestAnimationFrame = () => -1;
    window.cancelAnimationFrame = () => undefined;
  });
  await activate(await expectStep(page, "home-formula"));
  const target = await expectStep(page, "formula");
  await page.evaluate(() =>
    Promise.all(
      document.getAnimations().map((animation) => animation.finished),
    ),
  );
  await page.clock.runFor(1000);
  await page.evaluate(() => {
    // Only JS frame callbacks stop; the browser still lays out and delivers
    // ResizeObserver/onLayout. No step change can trigger a fresh layout effect.
    const close = document.querySelector<HTMLElement>(
      '[data-testid="tour-target-sheet.close"]',
    )!;
    close.style.paddingTop = "32px";
  });
  await expectSpotlight(page, target);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const explanation = document
          .querySelector('[data-testid="tour-coach"]')!
          .getBoundingClientRect();
        const x = explanation.x + explanation.width / 2;
        const y = explanation.bottom - 12;
        return Array.from(
          document.querySelectorAll('[data-testid="tour-overlay"] *'),
        ).some((node) => {
          if (
            getComputedStyle(node).backgroundColor !== "rgba(9, 22, 17, 0.68)"
          )
            return false;
          const rect = node.getBoundingClientRect();
          return (
            x > rect.left && x < rect.right && y > rect.top && y < rect.bottom
          );
        });
      }),
    )
    .toBe(false);
});

test("the tour visits every real tab, plan section and settings screen without changing the ledger", async ({
  page,
}, testInfo) => {
  test.setTimeout(150000);
  await beginLearning(page);
  expect(await activeProfile(page)).toBe("personal");
  const state = await readState(page);
  expect(state.transactions).toEqual([]);
  const visitedTabs = new Set<string>();
  const visitedSheets = new Set<string>();
  const visitedSections = new Set<string>();
  for (const [index, step] of tourSteps.entries()) {
    const target = await expectStep(page, step.id);
    await expect(page.getByTestId("learning-stage")).toHaveCount(0);
    await expect(page.getByTestId(`screen-${step.tab}`)).toBeVisible();
    visitedTabs.add(step.tab);
    const sheet = step.sheets.at(-1);
    if (sheet) {
      visitedSheets.add(sheet.type);
      await expect(page.getByRole("dialog")).toHaveCount(1);
      await expect(
        page
          .getByRole("dialog")
          .getByRole("heading", {
            name: sheetTitles[sheet.type],
            exact: true,
          })
          .first(),
      ).toBeVisible();
    } else {
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(
        page.getByRole("tab", { name: tabLabels[step.tab], exact: true }),
      ).toHaveAttribute("aria-selected", "true");
      if (step.section) {
        visitedSections.add(step.section);
        await expect(
          page.getByRole("tab", {
            name: sectionLabels[step.section],
            exact: true,
          }),
        ).toHaveAttribute("aria-selected", "true");
      }
    }
    if (
      ["home-formula", "open-plan", "open-securitySettings"].includes(step.id)
    ) {
      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({
          width,
          height: width === 320 ? 640 : 740,
        });
        await expectSpotlight(page, target);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: testInfo.outputPath(`tour-${step.id}-${width}.png`),
          animations: "disabled",
        });
      }
      await page.setViewportSize({ width: 390, height: 844 });
    }
    if (["home-accounts", "open-securitySettings"].includes(step.id))
      await expectSpotlightFollowsScroll(page, target);
    if (step.action)
      await button(
        page,
        step.action === "sheet.back" ? "Назад" : "Закрыть",
      ).click();
    else await activate(target);
    if (index + 1 < tourSteps.length)
      await expectStep(page, tourSteps[index + 1].id);
    if (step.id === "transactions-filter")
      await expect(
        page.getByRole("tab", { name: "Расходы", exact: true }),
      ).toHaveAttribute("aria-selected", "true");
    if (step.id === "analytics-month")
      await expect(
        page
          .getByTestId("screen-analytics")
          .getByText("август 2026", { exact: true }),
      ).toBeVisible();
    expect(await readState(page)).toEqual(state);
    expect(await activeProfile(page)).toBe("personal");
  }
  expect([...visitedTabs].sort()).toEqual([
    "analytics",
    "home",
    "plan",
    "transactions",
  ]);
  expect([...visitedSections].sort()).toEqual([
    "budgets",
    "forecast",
    "goals",
    "payments",
  ]);
  expect([...visitedSheets].sort()).toEqual(Object.keys(sheetTitles).sort());
  await expect(coach(page)).toHaveCount(0);
  await expect(overlay(page)).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("tab", { name: "Обзор", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  expect((await readProgress(page)).status).toBe("completed");
  await openCatalog(page);
  await button(page, "Пройти всё приложение заново").click();
  await expectStep(page, "home-formula");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await readState(page)).toEqual(state);
});

test("steps 38 and 41 reveal read-only blocks and restore their actions after pausing", async ({
  page,
}, testInfo) => {
  await startDemoApp(page, TODAY);
  const state = await readState(page);
  await page.evaluate((key) => {
    localStorage.setItem(
      key,
      JSON.stringify({ version: 2, status: "started", step: "data-back" }),
    );
  }, KEY);
  await page.reload();
  await button(page, "Продолжить обучение").click();
  let fileActions = 0;
  page.on("download", () => fileActions++);
  page.on("filechooser", () => fileActions++);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: width === 320 ? 640 : 844 });
    const target = await expectStep(page, "data-back");
    await expect
      .poll(() =>
        page.getByTestId("sheet-scroll").evaluate((node) => node.scrollTop),
      )
      .toBeGreaterThan(0);
    await expect(
      target.getByRole("button", {
        name: "Создать копию с паролем",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      target.getByRole("button", {
        name: "Экспортировать резервную копию",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      target.getByRole("button", {
        name: "Восстановить из файла",
        exact: true,
      }),
    ).toBeDisabled();
    await page.screenshot({
      path: testInfo.outputPath(`tour-backups-${width}.png`),
      animations: "disabled",
    });
  }
  await button(page, "Создать копию с паролем").click({ force: true });
  await expect(
    page.getByLabel("Новый пароль копии", { exact: true }),
  ).toHaveCount(0);
  expect((await readProgress(page)).step).toBe("data-back");
  expect(fileActions).toBe(0);
  await button(page, "Продолжить позже").click();
  await expect(button(page, "Создать копию с паролем")).toBeEnabled();
  await expect(button(page, "Экспортировать резервную копию")).toBeEnabled();
  await expect(button(page, "Восстановить из файла")).toBeEnabled();
  await button(page, "Создать копию с паролем").click();
  await expect(
    page.getByLabel("Новый пароль копии", { exact: true }),
  ).toBeVisible();
  await button(page, "Закрыть").click();
  await button(page, "Продолжить обучение").click();
  await expectStep(page, "data-back");
  await button(page, "Назад").click();
  await activate(await expectStep(page, "open-about"));
  await activate(await expectStep(page, "about"));
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: width === 320 ? 640 : 844 });
    const target = await expectStep(page, "settings-close");
    await expect
      .poll(() =>
        page.getByTestId("sheet-scroll").evaluate((node) => node.scrollTop),
      )
      .toBeGreaterThan(0);
    await expect(
      target.getByRole("button", { name: "Обучение", exact: true }),
    ).toBeDisabled();
    await page.screenshot({
      path: testInfo.outputPath(`tour-guide-${width}.png`),
      animations: "disabled",
    });
  }
  await button(page, "Обучение").click({ force: true });
  await expect(
    page.getByRole("heading", { name: "Экскурсия по приложению", exact: true }),
  ).toHaveCount(0);
  expect((await readProgress(page)).step).toBe("settings-close");
  await button(page, "Продолжить позже").click();
  await expect(button(page, "Обучение")).toBeEnabled();
  await button(page, "Обучение").click();
  await expect(
    page.getByRole("heading", { name: "Экскурсия по приложению", exact: true }),
  ).toBeVisible();
  await button(page, "Продолжить экскурсию").click();
  await expectStep(page, "settings-close");
  await button(page, "Закрыть").click();
  await activate(await expectStep(page, "finish"));
  expect((await readProgress(page)).status).toBe("completed");
  expect(await readState(page)).toEqual(state);
  expect(fileActions).toBe(0);
});

test("pause, reload, back and skip restore the actual screen and keep progress across profiles", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await startApp(page, TODAY);
  const state = await readState(page);
  await openCatalog(page);
  await button(page, "План: бюджеты, цели, платежи и прогноз").click();
  await activate(await expectStep(page, "plan-budgets"));
  await expectStep(page, "plan-goals");
  await button(page, "Назад по экскурсии").click();
  await expectStep(page, "plan-budgets");
  await expect(
    page.getByRole("tab", { name: "Бюджеты", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await button(page, "Пропустить шаг").click();
  await expectStep(page, "plan-goals");
  await button(page, "Продолжить позже").click();
  await expect(coach(page)).toHaveCount(0);
  await expect(overlay(page)).toHaveCount(0);
  await expect(page.getByTestId("tour-spotlight")).toHaveCount(0);
  await expect(
    page.getByRole("tab", { name: "Цели", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.reload();
  await button(page, "Продолжить обучение").click();
  await expectStep(page, "plan-goals");
  await expect(page.getByTestId("screen-plan")).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Цели", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await button(page, "Продолжить позже").click();
  const progress = await readProgress(page);
  expect(await readState(page)).toEqual(state);
  await openProfiles(page);
  await button(page, "Добавить профиль").click();
  await page.getByLabel("Название профиля", { exact: true }).fill("Семейный");
  await button(page, "Создать профиль").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await readProgress(page)).toEqual(progress);
  const family = await readState(page);
  await button(page, "Продолжить обучение").click();
  await expectStep(page, "plan-goals");
  await button(page, "Продолжить позже").click();
  expect(await readState(page)).toEqual(family);
  await switchProfile(page, "Личный");
  expect(await readState(page)).toEqual(state);
  expect(await readProgress(page)).toEqual(progress);
});

test("old lesson progress resumes at the real overview instead of the removed practice forms", async ({
  page,
}) => {
  await page.addInitScript((key) => {
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        status: "started",
        step: 4,
        pages: { goals: 2 },
        completed: ["accounts", "operations"],
        overviewActive: true,
        overviewSpot: 2,
      }),
    );
  }, KEY);
  // Migration belongs to an existing profile; an explicit first-run decline
  // intentionally replaces any leftover learning choice with a full skip.
  await startApp(page, TODAY, createInitialState(false, TODAY));
  const state = await readState(page);
  await button(page, "Продолжить обучение").click();
  await expectStep(page, "home-formula");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("screen-home")).toBeVisible();
  expect(await readProgress(page)).toEqual({
    version: 2,
    status: "started",
    step: "home-formula",
  });
  expect(await readState(page)).toEqual(state);
});

test("a paused settings visit restores its real sheet and parent menu after reload", async ({
  page,
}) => {
  await startApp(page, TODAY);
  const state = await readState(page);
  await openCatalog(page);
  await button(page, "Настройки и перенос данных").click();
  await activate(await expectStep(page, "open-settings"));
  await activate(await expectStep(page, "open-profileSettings"));
  await expectStep(page, "profileSettings");
  await button(page, "Продолжить позже").click();
  await expect(coach(page)).toHaveCount(0);
  await expect(overlay(page)).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.reload();
  await button(page, "Продолжить обучение").click();
  await expectStep(page, "profileSettings");
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", {
        name: "Профиль и планирование",
        exact: true,
      })
      .first(),
  ).toBeVisible();
  await activate(await expectStep(page, "profileSettings"));
  await expectStep(page, "open-currencies");
  await expect(
    page.getByRole("dialog").getByRole("heading", {
      name: "Ваш Лад",
      exact: true,
    }),
  ).toBeVisible();
  expect(await readState(page)).toEqual(state);
});

test("a failed progress save keeps the same stop and permits retrying the real control", async ({
  page,
}) => {
  await page.addInitScript((key) => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (
        this === localStorage &&
        name === key &&
        sessionStorage.getItem("fail-learning-write") === "yes"
      )
        throw new DOMException("Full", "QuotaExceededError");
      return setItem.call(this, name, value);
    };
  }, KEY);
  await beginLearning(page);
  const state = await readState(page);
  await page.evaluate(() =>
    sessionStorage.setItem("fail-learning-write", "yes"),
  );
  await activate(await expectStep(page, "home-formula"));
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(coach(page)).toHaveCount(1);
  await expect(coach(page).getByRole("alert")).toContainText(
    "сохранить прогресс",
  );
  expect((await readProgress(page)).step).toBe("home-formula");
  expect(await readState(page)).toEqual(state);
  await page.evaluate(() => sessionStorage.removeItem("fail-learning-write"));
  await activate(await expectStep(page, "home-formula"));
  await expectStep(page, "formula");
  await expect(page.getByRole("dialog")).toHaveCount(1);
  expect(await readState(page)).toEqual(state);
});

test("the whole tour can be skipped immediately and manually restarted after reload", async ({
  page,
}, testInfo) => {
  await beginLearning(page);
  const state = await readState(page);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 640 });
    await expectStep(page, "home-formula");
    await expect(button(page, "Пропустить экскурсию")).toBeInViewport({
      ratio: 1,
    });
    await page.screenshot({
      path: testInfo.outputPath(`skip-tour-${width}.png`),
      animations: "disabled",
    });
  }
  await button(page, "Пропустить экскурсию").click();
  await expect(coach(page)).toHaveCount(0);
  await expect(overlay(page)).toHaveCount(0);
  await expect(button(page, "Продолжить обучение")).toHaveCount(0);
  expect((await readProgress(page)).status).toBe("skipped");
  expect(await readState(page)).toEqual(state);
  await page.reload();
  await expect(button(page, "Профиль и настройки")).toBeVisible();
  await expect(button(page, "Продолжить обучение")).toHaveCount(0);
  await openCatalog(page);
  await expect(button(page, "Продолжить экскурсию")).toHaveCount(0);
  await expect(
    page.getByText(
      "Экскурсия пропущена. Её можно начать заново в любой момент.",
    ),
  ).toBeVisible();
  await button(page, "Начать экскурсию").click();
  await expectStep(page, "home-formula");
  // Skipping from a nested sheet removes only the tour, preserving the real screen.
  await activate(await expectStep(page, "home-formula"));
  await expectStep(page, "formula");
  await button(page, "Пропустить экскурсию").click();
  await expect(coach(page)).toHaveCount(0);
  await expect(overlay(page)).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Всё прозрачно", exact: true }),
  ).toBeVisible();
  await button(page, "Закрыть").click();
  await expect(button(page, "Продолжить обучение")).toHaveCount(0);
  expect(await readState(page)).toEqual(state);
});

for (const entry of ["coach", "banner", "catalog"] as const) {
  test(`skip from ${entry} retains progress on storage failure and hides continuation across profiles after retry`, async ({
    page,
  }, testInfo) => {
    await page.addInitScript((key) => {
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (name, value) {
        if (
          this === localStorage &&
          name === key &&
          sessionStorage.getItem("fail-skip-write") === "yes"
        )
          throw new DOMException("Full", "QuotaExceededError");
        return setItem.call(this, name, value);
      };
    }, KEY);
    await page.setViewportSize({ width: 320, height: 640 });
    await startApp(page, TODAY);
    const state = await readState(page);
    await openCatalog(page);
    await button(page, "План: бюджеты, цели, платежи и прогноз").click();
    await expectStep(page, "plan-budgets");
    if (entry !== "coach") {
      await button(page, "Продолжить позже").click();
      await expect(button(page, "Продолжить обучение")).toBeVisible();
      if (entry === "catalog") await openCatalog(page);
    }
    const started = await readProgress(page);
    await page.evaluate(() => sessionStorage.setItem("fail-skip-write", "yes"));
    await button(page, "Пропустить экскурсию").click();
    await expect(
      page.getByRole("alert").filter({
        hasText: "Не удалось сохранить прогресс обучения",
      }),
    ).toBeVisible();
    expect(await readProgress(page)).toEqual(started);
    expect(await readState(page)).toEqual(state);
    await page.screenshot({
      path: testInfo.outputPath(`skip-${entry}-retry-320.png`),
      animations: "disabled",
    });
    await page.evaluate(() => sessionStorage.removeItem("fail-skip-write"));
    await button(page, "Пропустить экскурсию").click();
    await expect
      .poll(async () => (await readProgress(page)).status)
      .toBe("skipped");
    await expect(coach(page)).toHaveCount(0);
    await expect(overlay(page)).toHaveCount(0);
    if (entry === "catalog") await button(page, "Закрыть").click();
    await expect(button(page, "Продолжить обучение")).toHaveCount(0);
    await page.reload();
    await expect(button(page, "Профиль и настройки")).toBeVisible();
    await expect(button(page, "Продолжить обучение")).toHaveCount(0);
    expect(await readState(page)).toEqual(state);
    await openProfiles(page);
    await button(page, "Добавить профиль").click();
    await page.getByLabel("Название профиля", { exact: true }).fill("Семейный");
    await button(page, "Создать профиль").click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(button(page, "Продолжить обучение")).toHaveCount(0);
    expect((await readProgress(page)).status).toBe("skipped");
    await switchProfile(page, "Личный");
    await expect(button(page, "Продолжить обучение")).toHaveCount(0);
    expect(await readState(page)).toEqual(state);
  });
}
