import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { encodeBackup } from "../src/domain/backup";
import {
  createVault,
  LEGACY_STORAGE_KEY,
  VAULT_STORAGE_KEY,
  type VaultDependencies,
} from "../src/infrastructure/storage/vault";
import {
  reliabilityCipher,
  reliabilitySnapshots,
} from "./helpers/saveReliability";

const boundaries = [
  "key-before",
  "key-after",
  "envelope-before",
  "envelope-after",
  "readback-error",
  "readback-mismatch",
  "legacy-remove",
  "old-key-remove",
] as const;
for (const operation of ["migrate", "recover"] as const) {
  for (const boundary of boundaries) {
    if (operation === "migrate" && boundary === "old-key-remove") continue;
    test(`A05 ${operation}: injected ${boundary} preserves a usable snapshot and allows retry (3 repeats)`, async () => {
      for (let repetition = 0; repetition < 3; repetition += 1) {
        const [s0, s1] = reliabilitySnapshots();
        const items = new Map<string, string>(),
          keys = new Map<string, string>();
        let armed = false,
          written = false,
          hit = false;
        const fail = (at: typeof boundary) => {
          if (armed && at === boundary) {
            hit = true;
            throw new Error(`injected ${at}`);
          }
        };
        const dependencies: VaultDependencies = {
          storage: {
            async getItem(key) {
              if (armed && written && key === VAULT_STORAGE_KEY) {
                fail("readback-error");
                if (boundary === "readback-mismatch") {
                  hit = true;
                  return "mismatched readback";
                }
              }
              return items.get(key) ?? null;
            },
            async setItem(key, value) {
              fail("envelope-before");
              items.set(key, value);
              written = true;
              fail("envelope-after");
            },
            async removeItem(key) {
              if (key === LEGACY_STORAGE_KEY) fail("legacy-remove");
              items.delete(key);
            },
          },
          keys: {
            get: async (id) => keys.get(id) ?? null,
            async create() {
              fail("key-before");
              const id = randomUUID(),
                secret = randomBytes(32).toString("hex");
              keys.set(id, secret);
              fail("key-after");
              return { id, secret };
            },
            async remove(id) {
              fail("old-key-remove");
              keys.delete(id);
            },
          },
          cipher: reliabilityCipher,
        };
        const vault = createVault(dependencies);
        if (operation === "recover") await vault.save(s0);
        // Also keep a legacy copy for recovery to prove cleanup ordering.
        items.set(LEGACY_STORAGE_KEY, encodeBackup(s0));
        const oldEnvelope = items.get(VAULT_STORAGE_KEY);
        const oldKey = oldEnvelope
          ? (JSON.parse(oldEnvelope).keyId as string)
          : null;
        written = false;
        armed = true;
        const attempt =
          operation === "migrate" ? vault.load() : vault.recover(s1);
        if (boundary === "old-key-remove")
          await attempt; // Cleanup is best effort after commit.
        else await assert.rejects(attempt);
        assert.equal(hit, true, "Fault must actually be exercised");
        const committed = ![
          "key-before",
          "key-after",
          "envelope-before",
        ].includes(boundary);
        assert.equal(
          items.has(LEGACY_STORAGE_KEY),
          boundary !== "old-key-remove",
        );
        if (oldKey)
          assert.equal(
            keys.has(oldKey),
            true,
            "Failed replacement cannot delete its old key",
          );
        if (!committed) assert.equal(items.get(VAULT_STORAGE_KEY), oldEnvelope);
        armed = false;
        const expected = operation === "recover" && committed ? s1 : s0;
        assert.deepEqual(await createVault(dependencies).load(), expected);
        if (operation === "recover")
          await createVault(dependencies).recover(s1);
        else await createVault(dependencies).load();
        assert.deepEqual(
          await createVault(dependencies).load(),
          operation === "recover" ? s1 : s0,
        );
      }
    });
  }
}
