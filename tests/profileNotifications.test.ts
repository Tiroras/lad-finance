import assert from "node:assert/strict";
import { test } from "node:test";
import { notificationTarget } from "../src/application/navigation/notificationTarget";
import { createInitialState } from "../src/domain/seed";
import {
  readPaymentNotification,
  reminderChanges,
} from "../src/infrastructure/notifications/notificationPlan";
import type { PaymentNotification } from "../src/infrastructure/notifications/notifications.types";

const date = "2026-09-28";
const workProfile = "profile-11111111-1111-4111-8111-111111111111";
const familyProfile = "profile-22222222-2222-4222-8222-222222222222";
const reminder = {
  id: `lad.payment.shared-payment.${date}`,
  at: new Date("2026-09-27T09:00:00").getTime(),
  paymentId: "shared-payment",
  date,
};

function fixture(demo: boolean) {
  const state = createInitialState(true, "2026-09-26");
  state.demo = demo;
  state.recurring[0].id = "shared-payment";
  return state;
}

test("payment notifications only open the profile that scheduled them even when payment IDs match", () => {
  const personal = fixture(false);
  const demo = fixture(true);
  const notification: PaymentNotification = {
    profile: "demo",
    paymentId: reminder.paymentId,
    date,
  };
  assert.equal(notificationTarget(notification, "personal", personal), null);
  assert.deepEqual(notificationTarget(notification, "demo", demo), {
    tab: "plan",
    sheet: { type: "payment", id: "shared-payment", date },
  });
  assert.equal(
    notificationTarget({ ...notification, profile: "personal" }, "demo", demo),
    null,
  );
  assert.deepEqual(
    notificationTarget(
      { ...notification, profile: "personal" },
      "personal",
      personal,
    ),
    { tab: "plan", sheet: { type: "payment", id: "shared-payment", date } },
  );
});

test("overdue summaries and removed payments cannot navigate across profiles", () => {
  const personal = fixture(false);
  assert.equal(
    notificationTarget({ profile: "demo" }, "personal", personal),
    null,
  );
  assert.deepEqual(
    notificationTarget({ profile: "personal" }, "personal", personal),
    { tab: "plan", sheet: null },
  );
  assert.deepEqual(
    notificationTarget(
      { profile: "personal", paymentId: "removed", date },
      "personal",
      personal,
    ),
    { tab: "plan", sheet: null },
  );
});

test("named profiles keep identical payment reminders separate from each other and the default profile", () => {
  const state = fixture(false);
  const data = {
    source: "lad",
    profile: workProfile,
    paymentId: reminder.paymentId,
    date,
  };
  const notification = readPaymentNotification(data)!;
  assert.equal(notification.profile, workProfile);
  assert.equal(notificationTarget(notification, "personal", state), null);
  assert.equal(notificationTarget(notification, familyProfile, state), null);
  assert.deepEqual(notificationTarget(notification, workProfile, state), {
    tab: "plan",
    sheet: { type: "payment", id: reminder.paymentId, date },
  });
  const previous = reminderChanges([reminder], [], workProfile).schedule[0];
  const changes = reminderChanges(
    [reminder],
    [
      {
        identifier: previous.id,
        content: { data: { profile: workProfile, at: reminder.at } },
      },
    ],
    familyProfile,
  );
  assert.deepEqual(changes.cancel, [previous.id]);
  assert.equal(
    changes.schedule[0].id,
    `lad.${familyProfile}.payment.shared-payment.${date}`,
  );
  assert.notEqual(changes.schedule[0].id, previous.id);
});

test("legacy and malformed notification data is ignored instead of adopting the active profile", () => {
  for (const data of [
    undefined,
    { source: "lad", paymentId: reminder.paymentId, date },
    { source: "lad", profile: "unknown", paymentId: reminder.paymentId, date },
    {
      source: "another-app",
      profile: "personal",
      paymentId: reminder.paymentId,
      date,
    },
  ]) {
    assert.equal(readPaymentNotification(data), undefined);
  }
  assert.deepEqual(
    readPaymentNotification({
      source: "lad",
      profile: "demo",
      paymentId: reminder.paymentId,
      date,
    }),
    { profile: "demo", paymentId: reminder.paymentId, date },
  );
});

test("switching profiles cancels old notifications and schedules a separate identity at the same time", () => {
  const demo = reminderChanges([reminder], [], "demo").schedule;
  assert.equal(demo[0].id, `lad.demo.payment.shared-payment.${date}`);
  const result = reminderChanges(
    [reminder],
    [
      {
        identifier: demo[0].id,
        content: { data: { profile: "demo", at: reminder.at } },
      },
    ],
    "personal",
  );
  assert.deepEqual(result.cancel, [demo[0].id]);
  assert.deepEqual(result.schedule, [
    { ...reminder, id: `lad.personal.payment.shared-payment.${date}` },
  ]);
});

test("only current profile notifications with matching metadata are retained", () => {
  const id = `lad.personal.payment.shared-payment.${date}`;
  const current = {
    identifier: id,
    content: { data: { profile: "personal", at: reminder.at } },
  };
  assert.deepEqual(reminderChanges([reminder], [current], "personal"), {
    cancel: [],
    schedule: [],
  });
  for (const data of [
    { profile: "demo", at: reminder.at },
    { at: reminder.at },
    { profile: "personal", at: reminder.at - 1000 },
  ]) {
    assert.deepEqual(
      reminderChanges(
        [reminder],
        [{ ...current, content: { data } }],
        "personal",
      ),
      {
        cancel: [id],
        schedule: [{ ...reminder, id }],
      },
    );
  }
});

test("turning reminders off removes prior profile and legacy schedules but leaves unrelated notifications alone", () => {
  assert.deepEqual(
    reminderChanges(
      [],
      [
        { identifier: reminder.id, content: { data: { at: reminder.at } } },
        {
          identifier: `lad.demo.overdue.${date}`,
          content: { data: { profile: "demo", at: reminder.at } },
        },
        {
          identifier: "lad.personal.obsolete",
          content: { data: { profile: "personal" } },
        },
        { identifier: "another-app", content: {} },
      ],
      "personal",
    ),
    {
      cancel: [
        reminder.id,
        `lad.demo.overdue.${date}`,
        "lad.personal.obsolete",
      ],
      schedule: [],
    },
  );
});
