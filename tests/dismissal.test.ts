import assert from "node:assert/strict";
import { test } from "node:test";
import { createDismissalController } from "../src/shared/lib/dismissal";

test("dismissal reads the latest edit synchronously and cancel preserves the draft", () => {
  const controller = createDismissalController();
  let draft = "";
  let closed = 0;
  controller.register({ hasChanges: () => !!draft, description: "Черновик" });
  assert.equal(
    controller.request(() => closed++),
    true,
  );
  draft = "Быстро введённое значение";
  assert.equal(
    controller.request(() => closed++),
    false,
  );
  assert.equal(closed, 1);
  assert.equal(controller.getSnapshot()?.description, "Черновик");
  controller.cancel();
  assert.equal(controller.getSnapshot(), null);
  assert.equal(draft, "Быстро введённое значение");
  assert.equal(closed, 1);
});

test("one confirmation runs the original pending action exactly once, including nested tour navigation", () => {
  const controller = createDismissalController();
  controller.register({ hasChanges: () => true, description: "Черновик" });
  let closed = 0;
  controller.request(() => controller.request(() => closed++));
  controller.request(() => {
    throw new Error("Second close replaced the pending Back");
  });
  controller.discard();
  controller.discard();
  assert.equal(closed, 1);
  assert.equal(controller.getSnapshot(), null);
  // Acceptance cannot leak into the next explicit close attempt.
  assert.equal(
    controller.request(() => closed++),
    false,
  );
  assert.equal(closed, 1);
});

test("unmount removes the old form's guard and any pending transition", () => {
  const controller = createDismissalController();
  const unregister = controller.register({
    hasChanges: () => true,
    description: "Старый черновик",
  });
  let closed = false;
  controller.request(() => {
    closed = true;
  });
  unregister();
  assert.equal(controller.getSnapshot(), null);
  controller.discard();
  assert.equal(closed, false);
  assert.equal(
    controller.request(() => {
      closed = true;
    }),
    true,
  );
  assert.equal(closed, true);
});

test("one confirmation covers all changed editors without a clean sibling replacing their guards", () => {
  const controller = createDismissalController();
  const discarded: string[] = [];
  let closed = 0;
  for (const name of ["first", "second"]) {
    controller.register({
      hasChanges: () => true,
      description: "Названия шаблонов",
      onDiscard: () => {
        discarded.push(name);
      },
    });
  }
  controller.register({
    hasChanges: () => true,
    description: "Правило",
    onDiscard: () => {
      discarded.push("rule");
    },
  });
  const unregisterClean = controller.register({
    hasChanges: () => false,
    description: "Неизменённый шаблон",
  });
  assert.equal(
    controller.request(() => closed++),
    false,
  );
  assert.equal(
    controller.getSnapshot()?.description,
    "Названия шаблонов\n\nПравило",
  );
  unregisterClean();
  assert.ok(controller.getSnapshot());
  controller.cancel();
  assert.deepEqual(discarded, []);
  assert.equal(closed, 0);
  controller.request(() => closed++);
  controller.discard();
  assert.deepEqual(discarded, ["first", "second", "rule"]);
  assert.equal(closed, 1);
});

test("unmounting a changed editor cancels pending navigation but retains the other editor's protection", () => {
  const controller = createDismissalController();
  let closed = 0;
  const unregister = controller.register({
    hasChanges: () => true,
    description: "Первый",
  });
  controller.register({ hasChanges: () => true, description: "Второй" });
  controller.request(() => closed++);
  unregister();
  controller.discard();
  assert.equal(closed, 0);
  assert.equal(
    controller.request(() => closed++),
    false,
  );
  assert.equal(controller.getSnapshot()?.description, "Второй");
  controller.discard();
  assert.equal(closed, 1);
});

test("all asynchronous discards finish before navigation and a failed discard keeps the confirmation", async () => {
  const controller = createDismissalController();
  let finish: () => void = () => {};
  const wait = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let fail = true;
  let closed = 0;
  const discarded: string[] = [];
  controller.register({
    hasChanges: () => true,
    description: "Первый",
    onDiscard: async () => {
      await wait;
      discarded.push("first");
    },
  });
  controller.register({
    hasChanges: () => true,
    description: "Второй",
    onDiscard: () => {
      if (fail) throw new Error("Не удалось очистить второй черновик");
      discarded.push("second");
    },
  });
  controller.request(() => closed++);
  const attempt = controller.discard();
  assert.equal(controller.getSnapshot()?.busy, true);
  assert.equal(closed, 0);
  finish();
  await attempt;
  assert.equal(closed, 0);
  assert.equal(controller.getSnapshot()?.busy, false);
  assert.equal(
    controller.getSnapshot()?.error,
    "Не удалось очистить второй черновик",
  );
  fail = false;
  await controller.discard();
  assert.deepEqual(discarded, ["first", "first", "second"]);
  assert.equal(closed, 1);
  assert.equal(controller.getSnapshot(), null);
});
