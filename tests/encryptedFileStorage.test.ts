import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";
import { createInitialState } from "../src/domain/seed";
import { encodeBackup } from "../src/domain/backup";
import {
  createEncryptedFileStorage,
  parseCiphertextPointer,
  MAX_CIPHERTEXT_FILE_BYTES,
  type EncryptedFileStorageDependencies,
} from "../src/infrastructure/storage/encryptedFileStorage";
import {
  createVault,
  LEGACY_STORAGE_KEY,
  VAULT_STORAGE_KEY,
  type VaultDependencies,
} from "../src/infrastructure/storage/vault";

const envelope = (content: string, keyId = "key-1") =>
  JSON.stringify({
    format: "lad-aes-gcm",
    version: 1,
    keyId,
    sealed: Buffer.from(content).toString("base64"),
  });
function fixture(profile: "personal" | "demo" = "personal") {
  const items = new Map<string, string>();
  const files = new Map<string, string>();
  const calls: string[] = [];
  const dependencies: EncryptedFileStorageDependencies = {
    profile,
    randomId: randomUUID,
    sha256: async (value) => createHash("sha256").update(value).digest("hex"),
    metadata: {
      async getItem(key) {
        calls.push(`get:${key}`);
        return items.get(key) ?? null;
      },
      async setItem(key, value) {
        calls.push(`set:${key}`);
        // Simulate both Android limits. Ciphertext must never reach this backend.
        if (value.length > 2_000_000)
          throw new Error("CursorWindow/SQLite limit");
        items.set(key, value);
      },
      async removeItem(key) {
        calls.push(`remove:${key}`);
        items.delete(key);
      },
    },
    files: {
      async writeNew(name, value) {
        calls.push(`write:${name}`);
        assert.equal(
          files.has(name),
          false,
          "immutable generations cannot be overwritten",
        );
        files.set(name, value);
      },
      async read(name, bytes) {
        calls.push(`read:${name}`);
        const value = files.get(name);
        if (value === undefined || Buffer.byteLength(value) !== bytes)
          throw new Error("missing/partial file");
        return value;
      },
      async remove(name) {
        calls.push(`unlink:${name}`);
        files.delete(name);
      },
    },
  };
  return {
    items,
    files,
    calls,
    dependencies,
    open: () => createEncryptedFileStorage(dependencies),
  };
}

test("historical inline envelopes are read without migration; first save migrates to a tiny discoverable pointer", async () => {
  const f = fixture(),
    raw = envelope("старый снимок");
  f.items.set(VAULT_STORAGE_KEY, raw);
  f.items.set(LEGACY_STORAGE_KEY, "plaintext remains for vault verification");
  assert.equal(await f.open().getItem(VAULT_STORAGE_KEY), raw);
  assert.deepEqual(f.calls, [`get:${VAULT_STORAGE_KEY}`]);
  assert.equal(f.files.size, 0);
  await f.open().setItem(VAULT_STORAGE_KEY, raw);
  assert.ok(f.items.get(VAULT_STORAGE_KEY)!.length < 1024);
  assert.equal(
    f.items.get(LEGACY_STORAGE_KEY),
    "plaintext remains for vault verification",
  );
  assert.equal(await f.open().getItem(VAULT_STORAGE_KEY), raw);
  assert.equal(f.files.size, 1);
});

test("a ciphertext above 14MB survives a new adapter instance without crossing SQLite or CursorWindow limits", async () => {
  const f = fixture(),
    raw = envelope("A".repeat(10_600_000));
  assert.ok(Buffer.byteLength(raw) > 14_000_000);
  await f.open().setItem(VAULT_STORAGE_KEY, raw);
  assert.equal(await f.open().getItem(VAULT_STORAGE_KEY), raw);
  assert.ok(f.items.get(VAULT_STORAGE_KEY)!.length < 1024);
  assert.deepEqual([...f.items.keys()], [VAULT_STORAGE_KEY]);
});

test("partial generation and precommit verification failure preserve the old committed snapshot", async () => {
  for (const fault of ["write", "read"] as const) {
    const f = fixture(),
      storage = f.open(),
      old = envelope("old"),
      next = envelope("new");
    await storage.setItem(VAULT_STORAGE_KEY, old);
    const oldPointer = f.items.get(VAULT_STORAGE_KEY);
    const original =
      f.dependencies.files[fault === "write" ? "writeNew" : "read"];
    if (fault === "write")
      f.dependencies.files.writeNew = async (name, value) => {
        f.files.set(name, value.slice(0, 20));
        throw new Error("disk full");
      };
    else
      f.dependencies.files.read = async () => {
        throw new Error("readback unavailable");
      };
    await assert.rejects(storage.setItem(VAULT_STORAGE_KEY, next));
    assert.equal(f.items.get(VAULT_STORAGE_KEY), oldPointer);
    if (fault === "write")
      f.dependencies.files.writeNew =
        original as typeof f.dependencies.files.writeNew;
    else
      f.dependencies.files.read = original as typeof f.dependencies.files.read;
    assert.equal(await f.open().getItem(VAULT_STORAGE_KEY), old);
    assert.equal(
      f.files.size,
      2,
      "uncommitted orphan retained until explicit reset",
    );
  }
});

test("uncertain pointer commit and postcommit file readback retain both generations; retry never deletes current", async () => {
  for (const fault of [
    "before",
    "after",
    "pointer-read",
    "file-read",
  ] as const) {
    const f = fixture(),
      storage = f.open(),
      old = envelope("old"),
      next = envelope("new");
    await storage.setItem(VAULT_STORAGE_KEY, old);
    const set = f.dependencies.metadata.setItem,
      get = f.dependencies.metadata.getItem,
      read = f.dependencies.files.read;
    let committed = false;
    f.dependencies.metadata.setItem = async (key, value) => {
      if (fault === "before") throw new Error("before commit");
      await set(key, value);
      committed = true;
      if (fault === "after") throw new Error("lost acknowledgement");
    };
    f.dependencies.metadata.getItem = async (key) => {
      if (committed && fault === "pointer-read")
        throw new Error("pointer read unavailable");
      return get(key);
    };
    f.dependencies.files.read = async (name, bytes) => {
      if (committed && fault === "file-read")
        throw new Error("file read unavailable");
      return read(name, bytes);
    };
    await assert.rejects(storage.setItem(VAULT_STORAGE_KEY, next));
    assert.equal(f.files.size, 2);
    f.dependencies.metadata.setItem = set;
    f.dependencies.metadata.getItem = get;
    f.dependencies.files.read = read;
    assert.equal(
      await f.open().getItem(VAULT_STORAGE_KEY),
      fault === "before" ? old : next,
    );
    await f.open().setItem(VAULT_STORAGE_KEY, next);
    assert.equal(await f.open().getItem(VAULT_STORAGE_KEY), next);
    assert.equal(
      f.files.size,
      2,
      "only direct known previous generation is removed",
    );
  }
});

test("postcommit cleanup failure is harmless; concurrent readers and writers serialize across instances", async () => {
  const f = fixture(),
    first = f.open(),
    second = f.open();
  const a = envelope("A"),
    b = envelope("B"),
    c = envelope("C");
  await first.setItem(VAULT_STORAGE_KEY, a);
  f.dependencies.files.remove = async () => {
    throw new Error("cleanup unavailable");
  };
  const results = await Promise.all([
    first.setItem(VAULT_STORAGE_KEY, b),
    second.getItem(VAULT_STORAGE_KEY),
    second.setItem(VAULT_STORAGE_KEY, c),
    first.getItem(VAULT_STORAGE_KEY),
  ]);
  assert.equal(results[1], b);
  assert.equal(results[3], c);
  assert.equal(f.files.size, 3);
});

test("corrupt, missing, truncated and mismatched files fail closed without falling back or mutating", async () => {
  for (const fault of [
    "missing",
    "truncated",
    "same-length",
    "key-id",
  ] as const) {
    const f = fixture(),
      raw = envelope("original");
    await f.open().setItem(VAULT_STORAGE_KEY, raw);
    const pointer = parseCiphertextPointer(
      f.items.get(VAULT_STORAGE_KEY)!,
      "personal",
    )!;
    f.items.set(LEGACY_STORAGE_KEY, "stale plaintext");
    if (fault === "missing") f.files.delete(pointer.fileName);
    else if (fault === "truncated")
      f.files.set(pointer.fileName, raw.slice(0, -1));
    else if (fault === "same-length")
      f.files.set(pointer.fileName, raw.replace("b3Jp", "AAAA"));
    else {
      const changed = raw.replace("key-1", "key-2");
      f.files.set(pointer.fileName, changed);
      pointer.sha256 = await f.dependencies.sha256(changed);
      f.items.set(VAULT_STORAGE_KEY, JSON.stringify(pointer));
    }
    const before = [...f.items],
      files = [...f.files];
    await assert.rejects(f.open().getItem(VAULT_STORAGE_KEY));
    assert.deepEqual([...f.items], before);
    assert.deepEqual([...f.files], files);
  }
});

test("strict pointers reject traversal, profile substitution, extra fields and oversized allocation before file access", async () => {
  const f = fixture();
  await f.open().setItem(VAULT_STORAGE_KEY, envelope("data"));
  const good = JSON.parse(f.items.get(VAULT_STORAGE_KEY)!);
  for (const changes of [
    { fileName: "../outside" },
    { fileName: "/absolute" },
    { profileId: "demo" },
    { version: 2 },
    { bytes: MAX_CIPHERTEXT_FILE_BYTES + 1 },
    { bytes: 0 },
    { sha256: "x".repeat(64) },
    { extra: true },
    { keyId: "wrong-key" },
  ]) {
    f.items.set(VAULT_STORAGE_KEY, JSON.stringify({ ...good, ...changes }));
    f.calls.length = 0;
    await assert.rejects(f.open().getItem(VAULT_STORAGE_KEY));
    assert.deepEqual(f.calls, [`get:${VAULT_STORAGE_KEY}`]);
  }
  const other = fixture("demo");
  other.items.set(VAULT_STORAGE_KEY, JSON.stringify(good));
  await assert.rejects(other.open().getItem(VAULT_STORAGE_KEY));
  assert.deepEqual(other.calls, [`get:${VAULT_STORAGE_KEY}`]);
});

test("an orphan without a pointer is not chosen as current and plaintext is never accepted as ciphertext", async () => {
  const f = fixture();
  f.files.set(`key-1.${randomUUID()}.vault`, envelope("orphan"));
  assert.equal(await f.open().getItem(VAULT_STORAGE_KEY), null);
  await assert.rejects(
    f
      .open()
      .setItem(VAULT_STORAGE_KEY, encodeBackup(createInitialState(false))),
  );
  assert.equal(f.items.size, 0);
  assert.equal(f.files.size, 1);
});

function vaultFixture() {
  const f = fixture();
  const secrets = new Map<string, string>();
  // Cryptography itself is covered in vault/password tests. Here the reversible
  // cipher exposes the exact storage/migration protocol and rejects missing keys.
  const dependencies: VaultDependencies = {
    storage: f.open(),
    keys: {
      async create() {
        const id = randomUUID();
        secrets.set(id, "test");
        return { id, secret: "test" };
      },
      async get(id) {
        return secrets.get(id) ?? null;
      },
      async remove(id) {
        secrets.delete(id);
      },
    },
    cipher: {
      async seal(plain) {
        return Buffer.from(plain).toString("base64");
      },
      async open(sealed) {
        return Buffer.from(sealed, "base64").toString();
      },
    },
  };
  return { ...f, dependencies, openVault: () => createVault(dependencies) };
}

test("vault verifies file migration before deleting old plaintext and retains it on an uncertain commit", async () => {
  const f = vaultFixture(),
    state = createInitialState(false),
    raw = encodeBackup(state);
  f.items.set(LEGACY_STORAGE_KEY, raw);
  const write = f.dependencies.storage.setItem;
  f.dependencies.storage.setItem = async (key, value) => {
    await write(key, value);
    throw new Error("lost ack");
  };
  await assert.rejects(f.openVault().load());
  assert.equal(f.items.get(LEGACY_STORAGE_KEY), raw);
  f.dependencies.storage.setItem = write;
  assert.deepEqual(await f.openVault().load(), state);
  assert.equal(f.items.has(LEGACY_STORAGE_KEY), false);
});

test("explicit bounded vault recovery replaces damaged pointer/inline data but never selects unknown old files", async () => {
  for (const broken of [
    "{malformed",
    JSON.stringify({ format: "lad-ciphertext-file", fileName: "../other" }),
  ]) {
    const f = vaultFixture(),
      state = createInitialState(false);
    await f.openVault().save(state);
    const files = [...f.files];
    f.items.set(VAULT_STORAGE_KEY, broken);
    assert.equal((await f.openVault().inspect()).status, "unavailable");
    await assert.rejects(f.openVault().save(state));
    state.settings.name = "Восстановленный";
    await f.openVault().recover(state);
    assert.deepEqual(await f.openVault().load(), state);
    for (const [name, value] of files) assert.equal(f.files.get(name), value);
  }
});
