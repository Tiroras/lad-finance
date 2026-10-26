/*
 * Regression harness: run from repository root:
 *   node --import tsx tests/helpers/applicationDeletion.cjs
 * This forces effect replay while preserving state, the Fast Refresh contract.
 * It does not simulate a real native renderer or device storage.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const repo = process.argv[2] || process.cwd();
const requireRepo = createRequire(path.join(repo, "package.json"));
const ts = requireRepo("typescript");
const { createDataDeletion } = requireRepo(
  "./src/infrastructure/storage/dataDeletion.ts",
);
const { encodeProfileRegistry, decodeProfileRegistry } = requireRepo(
  "./src/domain/profiles.ts",
);

async function main() {
  const catalogKey = "lad-profiles-v1";
  const activeKey = "lad-active-profile-v1";
  const ledgerKey = "lad-profile-personal:lad-finance-v1";
  const items = new Map();
  const seed = (value) => {
    items.set(
      catalogKey,
      encodeProfileRegistry([{ id: "personal", name: "Личный" }]),
    );
    items.set(activeKey, "personal");
    items.set(ledgerKey, value);
  };
  seed("old synthetic ledger");
  const storage = {
    async getAllKeys() {
      return [...items.keys()];
    },
    async getItem(key) {
      return items.get(key) ?? null;
    },
    async setItem(key, value) {
      items.set(key, value);
    },
    async removeItem(key) {
      items.delete(key);
    },
    async multiGet(keys) {
      return keys.map((key) => [key, items.get(key) ?? null]);
    },
    async multiRemove(keys) {
      keys.forEach((key) => items.delete(key));
    },
  };
  const protocol = createDataDeletion({
    storage,
    profiles: async () => decodeProfileRegistry(items.get(catalogKey)),
    readCatalog: () => storage.getItem(catalogKey),
    writeCatalog: (raw) =>
      raw === null
        ? storage.removeItem(catalogKey)
        : storage.setItem(catalogKey, raw),
    readActive: () => storage.getItem(activeKey),
    writeActive: (raw) =>
      raw === null
        ? storage.removeItem(activeKey)
        : storage.setItem(activeKey, raw),
    clearLearning: async () => {},
    resetDevice: async () => {},
  });
  const preparationCalls = [];
  const state = [];
  let index = 0;
  let effect;
  let cleanup;
  const React = {
    useState(initial) {
      const slot = index++;
      if (!(slot in state))
        state[slot] = typeof initial === "function" ? initial() : initial;
      return [
        state[slot],
        (value) => {
          state[slot] =
            typeof value === "function" ? value(state[slot]) : value;
        },
      ];
    },
    useEffect(fn) {
      effect = fn;
    },
    useCallback: (fn) => fn,
  };
  const jsx = (type, props) => ({ type, props });
  const modules = {
    react: React,
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "react-native": {
      View: "View",
      ActivityIndicator: "ActivityIndicator",
      StyleSheet: { create: (value) => value },
    },
    "../shared/ui": { Button: "Button", Txt: "Txt", C: { green: "green" } },
    "react-native-safe-area-context": { SafeAreaProvider: "SafeAreaProvider" },
    "expo-font": { useFonts: () => [true, undefined] },
    "./providers/AppProviders": { AppProviders: "AppProviders" },
    "./shell/AppShell": { AppShell: "AppShell" },
    "../infrastructure/storage/developmentReset": {
      resetDevelopmentData: async () => {},
    },
    "../infrastructure/storage/appDataDeletion": {
      appDataDeletion: {
        async run(request) {
          preparationCalls.push(request);
          await protocol.run(request);
        },
      },
    },
    "../infrastructure/storage/ledgerStorage": {
      clearLedgerStorageCache: () => {},
    },
    "../infrastructure/storage/useStoredDraft": {
      settleStoredDrafts: async () => {},
    },
    "../features/settings": { resetLearningProgressMemory: async () => {} },
  };
  const source = ts.transpileModule(
    fs.readFileSync(path.join(repo, "src/application/Application.tsx"), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    },
  ).outputText;
  const context = {
    exports: {},
    require(name) {
      if (name.startsWith("@expo-google-fonts/")) return {};
      assert.ok(name in modules, `Unexpected import: ${name}`);
      return modules[name];
    },
  };
  vm.runInNewContext(source, context);
  const render = () => {
    index = 0;
    return context.exports.default();
  };
  const replayEffects = async () => {
    cleanup?.();
    cleanup = effect();
    await new Promise((resolve) => setImmediate(resolve));
  };

  render();
  await replayEffects();
  let tree = render();
  assert.equal(tree.props.children.type, "AppProviders");
  tree.props.children.props.onDeleteData({ type: "all" });
  tree = render();
  assert.equal(
    tree.props.children.type,
    "View",
    "providers must be unmounted before deletion",
  );
  await replayEffects();
  assert.equal(items.size, 0);
  tree = render();
  assert.equal(tree.props.children.type, "AppProviders");

  // New synthetic data represents the next completed onboarding session.
  seed("new synthetic ledger");
  const beforeRefresh = new Map(items);
  const callsBeforeRefresh = preparationCalls.length;
  await replayEffects();
  assert.deepEqual(
    items,
    beforeRefresh,
    "Fast Refresh must preserve the newly created ledger",
  );
  assert.equal(
    preparationCalls.length,
    callsBeforeRefresh,
    "Fast Refresh must skip preparation while providers are mounted",
  );

  // A second explicitly confirmed deletion must remain available.
  tree = render();
  tree.props.children.props.onDeleteData({ type: "all" });
  render();
  await replayEffects();
  assert.equal(items.size, 0);
  assert.equal(preparationCalls.length, callsBeforeRefresh + 1);
  console.log(
    "PASS: first reset, Fast Refresh preservation, second explicit reset",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
