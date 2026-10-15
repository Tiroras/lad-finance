import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  readSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as profiles from "../src/domain/profiles";
import * as core from "../src/infrastructure/storage/encryptedFileStorage";
import { VAULT_STORAGE_KEY } from "../src/infrastructure/storage/vault";

const source = ts.transpileModule(
  readFileSync(
    new URL(
      "../src/infrastructure/storage/ciphertextFiles.native.ts",
      import.meta.url,
    ),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;

function fixture() {
  const document = mkdtempSync(join(tmpdir(), "lad-ciphertext-adapter-"));
  const calls: string[] = [];
  const faults = { write: false };
  const path = (...parts: (string | { uri: string })[]) =>
    join(...parts.map((part) => (typeof part === "string" ? part : part.uri)));
  class Directory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = path(...parts);
    }
    get name() {
      return this.uri.split("/").at(-1)!;
    }
    get exists() {
      return existsSync(this.uri);
    }
    create(options: { intermediates: boolean; idempotent: boolean }) {
      assert.deepEqual(JSON.parse(JSON.stringify(options)), {
        intermediates: true,
        idempotent: true,
      });
      mkdirSync(this.uri, { recursive: true });
    }
    list() {
      return readdirSync(this.uri, { withFileTypes: true }).map((item) =>
        item.isDirectory()
          ? new Directory(this, item.name)
          : new File(this, item.name),
      );
    }
    delete() {
      calls.push(`delete-root:${this.uri}`);
      rmSync(this.uri, { recursive: true });
    }
  }
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = path(...parts);
    }
    get name() {
      return this.uri.split("/").at(-1)!;
    }
    get exists() {
      return existsSync(this.uri);
    }
    get size() {
      return statSync(this.uri).size;
    }
    create(options: { overwrite: boolean }) {
      assert.equal(options.overwrite, false);
      closeSync(openSync(this.uri, "wx"));
      calls.push("create-exclusive");
    }
    open(mode: string) {
      calls.push(`open:${mode}`);
      assert.ok(mode === "r" || mode === "w");
      const fd = openSync(this.uri, mode === "r" ? "r" : "r+");
      let offset = 0;
      return {
        get size() {
          return fstatSync(fd).size;
        },
        writeBytes(bytes: Uint8Array) {
          assert.equal(mode, "w");
          if (faults.write) throw new Error("disk full");
          offset += writeSync(fd, bytes, 0, bytes.length, offset);
        },
        readBytes(length: number) {
          assert.equal(mode, "r");
          const bytes = Buffer.alloc(length);
          const read = readSync(fd, bytes, 0, length, offset);
          offset += read;
          return bytes.subarray(0, read);
        },
        close() {
          closeSync(fd);
          calls.push(`close:${mode}`);
        },
      };
    }
    delete() {
      unlinkSync(this.uri);
    }
  }
  const modules: Record<string, unknown> = {
    "expo-file-system": {
      Directory,
      File,
      FileMode: { ReadOnly: "r", WriteOnly: "w" },
      Paths: { document: new Directory(document) },
    },
    "expo-crypto": {
      CryptoDigestAlgorithm: { SHA256: "sha256" },
      randomUUID,
      async digestStringAsync(algorithm: string, value: string) {
        assert.equal(algorithm, "sha256");
        return createHash("sha256").update(value).digest("hex");
      },
    },
    "../../domain/profiles": profiles,
    "./encryptedFileStorage": core,
  };
  const exports = {};
  runInNewContext(source, {
    exports,
    TextEncoder,
    TextDecoder,
    require(name: string) {
      assert.ok(name in modules, `Unexpected import ${name}`);
      return modules[name];
    },
  });
  const api =
    exports as typeof import("../src/infrastructure/storage/ciphertextFiles.native");
  const items = new Map<string, string>();
  const storage = api.createNativeEncryptedFileStorage("personal", {
    async getItem(key) {
      return items.get(key) ?? null;
    },
    async setItem(key, value) {
      calls.push("commit-pointer");
      items.set(key, value);
    },
    async removeItem(key) {
      items.delete(key);
    },
  });
  return {
    document,
    calls,
    faults,
    items,
    storage,
    api,
    cleanup: () => rmSync(document, { recursive: true, force: true }),
  };
}

test("native adapter exclusively writes closed generations, reads in read-only mode and preserves unrelated documents on Fresh", async () => {
  const f = fixture();
  try {
    const raw = JSON.stringify({
      format: "lad-aes-gcm",
      version: 1,
      keyId: "native-test-key",
      sealed: "A".repeat(600_000),
    });
    writeFileSync(join(f.document, "unrelated.txt"), "keep");
    await f.storage.setItem(VAULT_STORAGE_KEY, raw);
    assert.equal(await f.storage.getItem(VAULT_STORAGE_KEY), raw);
    assert.ok(f.calls.indexOf("close:w") < f.calls.indexOf("commit-pointer"));
    assert.equal(f.calls.filter((call) => call === "open:r").length, 3);
    assert.equal(f.calls.filter((call) => call === "close:r").length, 3);
    const profile = join(f.document, "lad-ciphertext-v1", "personal");
    writeFileSync(join(profile, `orphan-key.${randomUUID()}.vault`), "partial");
    writeFileSync(join(profile, "unknown-file"), "owned orphan");
    const keys = f.api.listCiphertextKeysForReset();
    assert.deepEqual(
      new Set(keys.map((item) => item.keyId)),
      new Set([null, "native-test-key", "orphan-key"]),
    );
    f.api.removeCiphertextFilesForReset();
    assert.equal(existsSync(join(f.document, "lad-ciphertext-v1")), false);
    assert.equal(
      readFileSync(join(f.document, "unrelated.txt"), "utf8"),
      "keep",
    );
    assert.equal(f.api.listCiphertextKeysForReset().length, 0);
  } finally {
    f.cleanup();
  }
});

test("native write errors close their handle and leave the previous pointer; truncated files fail before opening", async () => {
  const f = fixture();
  try {
    const raw = JSON.stringify({
      format: "lad-aes-gcm",
      version: 1,
      keyId: "key",
      sealed: "AAAA",
    });
    await f.storage.setItem(VAULT_STORAGE_KEY, raw);
    const pointerRaw = f.items.get(VAULT_STORAGE_KEY)!;
    f.calls.length = 0;
    f.faults.write = true;
    await assert.rejects(
      f.storage.setItem(VAULT_STORAGE_KEY, raw),
      /disk full/,
    );
    assert.equal(f.calls.at(-1), "close:w");
    assert.equal(f.items.get(VAULT_STORAGE_KEY), pointerRaw);
    const pointer = JSON.parse(pointerRaw);
    writeFileSync(
      join(f.document, "lad-ciphertext-v1", "personal", pointer.fileName),
      "truncated",
    );
    f.calls.length = 0;
    await assert.rejects(
      f.storage.getItem(VAULT_STORAGE_KEY),
      /отсутствует или повреждён/,
    );
    assert.deepEqual(f.calls, []);
  } finally {
    f.cleanup();
  }
});
