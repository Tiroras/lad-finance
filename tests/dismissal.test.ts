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
