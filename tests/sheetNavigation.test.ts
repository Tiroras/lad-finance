import assert from "node:assert/strict";
import { test } from "node:test";
import {
  openSheet,
  previousSheet,
  returnToLearning,
  type SheetNavigation,
} from "../src/application/navigation/sheets";

const empty = (): SheetNavigation => ({ current: null, parents: [] });

test("settings navigation returns through the data section before closing", () => {
  const root = openSheet(empty(), { type: "settings" });
  const data = openSheet(root, { type: "dataSettings" });
  const csv = openSheet(data, { type: "csv" });
  assert.deepEqual(previousSheet(csv), data);
  assert.deepEqual(previousSheet(data), root);
  assert.deepEqual(previousSheet(root), empty());
  assert.deepEqual(root, { current: { type: "settings" }, parents: [] });
});

test("saving a child form returns to its parent without adding a back loop", () => {
  const root = openSheet(empty(), { type: "settings" });
  const categories = openSheet(root, { type: "categories" });
  const edit = openSheet(categories, { type: "category", id: "food" });
  const saved = openSheet(edit, { type: "categories" });
  assert.deepEqual(saved, categories);
  assert.deepEqual(previousSheet(saved), root);
  assert.equal(openSheet(saved, { type: "categories" }), saved);

  const profile = openSheet(root, { type: "profileSettings" });
  assert.deepEqual(openSheet(profile, { type: "settings" }), root);
});

test("independent entry points keep their existing sheet replacement behavior", () => {
  const accounts = openSheet(empty(), { type: "accounts" });
  const currencies = openSheet(accounts, { type: "currencies" });
  assert.deepEqual(currencies.parents, []);
  assert.deepEqual(previousSheet(currencies), empty());
  const transaction = openSheet(empty(), { type: "transaction", id: "first" });
  const another = openSheet(transaction, { type: "transaction", id: "second" });
  assert.equal(
    another.current && "id" in another.current && another.current.id,
    "second",
  );
  assert.deepEqual(another.parents, []);
});

test("a direct reminder settings entry can return to the settings menu", () => {
  const reminders = openSheet(empty(), { type: "reminderSettings" });
  assert.deepEqual(previousSheet(reminders), {
    current: { type: "settings" },
    parents: [],
  });
});

test("first-run learning returns from nested forms to the same lesson without a settings detour", () => {
  const guide = openSheet(empty(), { type: "guide", journey: true });
  assert.deepEqual(guide.parents, []);
  const income = openSheet(guide, { type: "income" });
  assert.deepEqual(previousSheet(income), guide);
  assert.deepEqual(returnToLearning(income), guide);
  const accounts = openSheet(guide, { type: "accounts" });
  const account = openSheet(accounts, { type: "account" });
  assert.deepEqual(returnToLearning(account), guide);
  assert.deepEqual(previousSheet(guide), empty());
  assert.equal(returnToLearning(account).parents.length, 0);
  assert.equal(returnToLearning(empty()).current, null);
});

test("standalone lessons retain their catalog and settings navigation", () => {
  const catalog = openSheet(empty(), { type: "guide" });
  const lesson = openSheet(catalog, { type: "guide", lesson: "plans" });
  const form = openSheet(lesson, { type: "recurring" });
  assert.deepEqual(returnToLearning(form), lesson);
  assert.deepEqual(openSheet(lesson, { type: "guide" }), catalog);
  assert.deepEqual(previousSheet(catalog), {
    current: { type: "settings" },
    parents: [],
  });
});
