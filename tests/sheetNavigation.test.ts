import assert from "node:assert/strict";
import { test } from "node:test";
import {
  openSheet,
  previousSheet,
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
