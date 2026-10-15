import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { getDraftStorage } from "../../src/infrastructure/storage/draftStorage";
import { useStoredDraft } from "../../src/infrastructure/storage/useStoredDraft";
import type { FinanceProfile } from "../../src/domain/profiles";

type Fields = { value: string };
let root: Root;
let fields: Fields = { value: "" };
let enabled = true;
export const CONTROL = "profile-00000000-0000-4000-8000-000000000005";
let profile: FinanceProfile = "personal";
let flushes: Promise<{ ok: boolean; error?: string }>[] = [];
let gateEntered = false;
let releaseGate: (() => void) | undefined;
let hook: ReturnType<typeof useStoredDraft<Fields>>;
function Form() {
  hook = useStoredDraft({
    profileId: profile,
    slot: "transaction",
    recordId: "new",
    payload: fields,
    enabled,
    dirty: fields.value !== "",
    parse: (value) => {
      if (
        !value ||
        typeof value !== "object" ||
        !("value" in value) ||
        typeof value.value !== "string"
      )
        throw new Error("Invalid synthetic fields");
      return { value: value.value };
    },
    onRestore: (restored) => {
      fields = restored;
      render();
    },
  });
  return createElement("div", null, hook.ready ? "ready" : "loading");
}
function render() {
  flushSync(() => root.render(createElement(Form)));
}
export function mount() {
  profile = "personal";
  flushes = [];
  fields = { value: "" };
  enabled = true;
  const node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  render();
}
export function ready() {
  return hook.ready;
}
export function status() {
  return { fields, offer: hook.offer, error: hook.error };
}
export function pauseUntouched() {
  enabled = false;
  render();
}
export function resume() {
  enabled = true;
  render();
}
export function editThenPause(value: string) {
  fields = { value };
  render();
  enabled = false;
  render();
  flushSync(() => root.unmount());
}
export function read(id: FinanceProfile = "personal") {
  return getDraftStorage(id).load("transaction");
}
export function setFields(value: string) {
  fields = { value };
  render();
}
export function startFlush() {
  flushes.push(
    hook.flush().then(
      () => ({ ok: true }),
      (cause: unknown) => ({
        ok: false,
        error: cause instanceof Error ? cause.message : String(cause),
      }),
    ),
  );
}
export function waitFlushes() {
  return Promise.all(flushes);
}
export function pauseAndUnmount() {
  enabled = false;
  render();
  flushSync(() => root.unmount());
}
export function switchProfile(id: FinanceProfile) {
  profile = id;
  fields = { value: "" };
  render();
}
export function gateFirstCompletion(kind: "claim" | "save") {
  const store = getDraftStorage(profile);
  const gate = new Promise<void>((resolve) => {
    releaseGate = resolve;
  });
  gateEntered = false;
  if (kind === "claim") {
    const original = store.claim;
    store.claim = async (...args) => {
      store.claim = original;
      const result = await original(...args);
      gateEntered = true;
      await gate;
      return result;
    };
  } else {
    const original = store.save;
    store.save = async (...args) => {
      store.save = original;
      const result = await original(...args);
      gateEntered = true;
      await gate;
      return result;
    };
  }
}
export function entered() {
  return gateEntered;
}
export function release() {
  releaseGate?.();
}
export function startClear() {
  flushes.push(
    hook.clear().then(
      () => ({ ok: true }),
      (cause: unknown) => ({
        ok: false,
        error: cause instanceof Error ? cause.message : String(cause),
      }),
    ),
  );
}
export async function replaceDrafts() {
  const store = getDraftStorage(profile);
  const id = "a".repeat(64);
  await store.beginReplacement(id);
  await store.finishReplacement(id);
}
export async function restoreThenClearAndPause() {
  await hook.restore();
  await hook.clear();
  enabled = false;
  render();
  flushSync(() => root.unmount());
}
