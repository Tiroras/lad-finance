import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addProfile,
  assertProfileId,
  createDefaultProfiles,
  decodeProfileRegistry,
  encodeProfileRegistry,
  isFinanceProfile,
  renameProfile,
  validateProfiles,
  type FinanceProfile,
} from "../src/domain/profiles";

const family = "profile-11111111-1111-4111-8111-111111111111";
const work = "profile-22222222-2222-4222-8222-222222222222";

test("additional profiles have independent immutable names and preserve the built-in personal profile", () => {
  const initial = Object.freeze(
    createDefaultProfiles().map((profile) => Object.freeze(profile)),
  );
  const added = addProfile(initial, family, "  Семейный  ");
  assert.deepEqual(initial, [{ id: "personal", name: "Личный" }]);
  assert.deepEqual(added, [
    { id: "personal", name: "Личный" },
    { id: family, name: "Семейный" },
  ]);
  const both = addProfile(added, work, "Рабочий");
  const renamed = renameProfile(both, family, "  Общие расходы ");
  assert.equal(added[1].name, "Семейный");
  assert.equal(both[1].name, "Семейный");
  assert.equal(renamed[1].name, "Общие расходы");
  assert.equal(renamed[1].id, family);
  assert.equal(renamed[2].name, "Рабочий");
  assert.deepEqual(renameProfile(renamed, family, "Общие расходы"), renamed);
});

test("profile names reject blank, long, control and duplicate values including reserved names", () => {
  const initial = addProfile(createDefaultProfiles(), family, "Семейный");
  for (const name of ["", "   ", "Я".repeat(41), "😀".repeat(41)]) {
    assert.throws(() => addProfile(initial, work, name), /от 1 до 40/);
    assert.throws(() => renameProfile(initial, family, name), /от 1 до 40/);
  }
  for (const name of [
    "Новый\nпрофиль",
    "\tРабота",
    "Лето\u0000",
    "Дом\u0085",
  ]) {
    assert.throws(() => addProfile(initial, work, name), /без переносов/);
  }
  for (const name of ["Семейный", " семейНЫЙ ", "Личный", "личный", " ДЕМО "]) {
    assert.throws(() => addProfile(initial, work, name), /уже есть/);
  }
  assert.equal(addProfile(initial, work, "Я".repeat(40))[2].name.length, 40);
  assert.equal(
    [...addProfile(initial, work, "😀".repeat(40))[2].name].length,
    40,
  );
  const accented = addProfile(initial, work, "Cafe\u0301");
  assert.equal(accented[2].name, "Café");
  assert.throws(() => renameProfile(accented, family, "CAFÉ"), /уже есть/);
  assert.throws(() => renameProfile(initial, "personal", "Мой"), /нельзя/);
  assert.throws(() => renameProfile(initial, "demo", "Пример"), /нельзя/);
  assert.throws(() => renameProfile(initial, work, "Работа"), /не найден/);
});

test("profile identity is restricted to fixed built-ins and UUID namespaces", () => {
  for (const id of ["personal", "demo", family, work]) {
    assert.ok(isFinanceProfile(id));
    assert.doesNotThrow(() => assertProfileId(id));
  }
  for (const id of [
    null,
    "",
    "profile-personal",
    "profile-../personal",
    "profile-personal:lad-finance-v1",
    "profile-11111111-1111-4111-8111-11111111111",
    `${family}:extra`,
    1,
    {},
  ]) {
    assert.equal(isFinanceProfile(id), false);
    assert.throws(() => assertProfileId(id), /определить профиль/);
  }
  const profiles = addProfile(createDefaultProfiles(), family, "Семья");
  for (const id of ["personal", "demo", family] as FinanceProfile[]) {
    assert.throws(() => addProfile(profiles, id, "Работа"), /уже есть/);
  }
});

test("registry validation rejects damaged identities and names instead of dropping records", () => {
  const personal = { id: "personal", name: "Личный" };
  const familyProfile = { id: family, name: "Семья" };
  for (const profiles of [
    null,
    {},
    [familyProfile, personal],
    [personal, { id: "demo", name: "Демо" }],
    [personal, personal],
    [personal, { id: "profile-invalid", name: "Работа" }],
    [personal, { id: family, name: null }],
    [{ id: "personal", name: "Переименованный" }],
    [personal, familyProfile, familyProfile],
    [personal, familyProfile, { id: work, name: "семья" }],
    [personal, { id: work, name: "демо" }],
  ]) {
    assert.throws(() => validateProfiles(profiles));
  }
  const valid = [personal, familyProfile];
  const checked = validateProfiles(valid);
  checked[1].name = "Новая семья";
  assert.equal(valid[1].name, "Семья");
});

test("registry v2 permits deleting personal and the last profile; v1 still rejects missing personal", () => {
  for (const entries of [[], [{ id: family, name: "Семья" }]] as const) {
    assert.deepEqual(
      decodeProfileRegistry(encodeProfileRegistry(entries)),
      entries,
    );
    assert.equal(JSON.parse(encodeProfileRegistry(entries)).version, 2);
    assert.throws(() =>
      decodeProfileRegistry(JSON.stringify({ version: 1, profiles: entries })),
    );
  }
  assert.equal(
    JSON.parse(encodeProfileRegistry(createDefaultProfiles())).version,
    1,
  );
});
