import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as reader from "../src/infrastructure/files/documentReader";

function fixture(changeSize = false, failRead = false) {
  const bytes = new TextEncoder().encode("Дата;Сумма\n2026-10-25;10");
  const calls: string[] = [];
  let size = bytes.length;
  let closed = false;
  let exists = true;
  class File {
    constructor(uri: string) {
      assert.equal(uri, "file:///cache/DocumentPicker/example.csv");
    }
    get size() {
      return size;
    }
    get exists() {
      return exists;
    }
    open(mode: string) {
      assert.equal(mode, "read-only");
      return {
        get size() {
          return size;
        },
        async readBytes(length: number) {
          calls.push("read-start");
          await setImmediate();
          assert.equal(closed, false);
          assert.equal(exists, true);
          calls.push("read-end");
          if (failRead) throw new Error("read failed");
          if (changeSize) size++;
          return bytes.slice(0, length);
        },
        close() {
          closed = true;
          calls.push("close");
        },
      };
    }
    delete() {
      exists = false;
      calls.push("delete");
    }
  }
  const filename = new URL(
    "../src/infrastructure/files/documents.native.ts",
    import.meta.url,
  );
  const source = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const modules: Record<string, unknown> = {
    "expo-document-picker": {
      async getDocumentAsync() {
        return {
          canceled: false,
          assets: [
            {
              name: "example.csv",
              uri: "file:///cache/DocumentPicker/example.csv",
            },
          ],
        };
      },
    },
    "expo-file-system": { File, FileMode: { ReadOnly: "read-only" } },
    "./documentReader": reader,
  };
  const exports =
    {} as typeof import("../src/infrastructure/files/documents.native");
  runInNewContext(source, {
    exports,
    require(name: string) {
      assert.ok(name in modules, `Unexpected import: ${name}`);
      return modules[name];
    },
  });
  return { pick: exports.pickDocument, bytes, calls };
}

test("native CSV import waits for reading before closing and removing its cache copy", async () => {
  const f = fixture();
  const document = await f.pick(["csv"], 1000);
  assert.equal(document?.name, "example.csv");
  assert.deepEqual(document?.bytes, f.bytes);
  assert.deepEqual(f.calls, ["read-start", "read-end", "close", "delete"]);
});

test("native CSV import rejects a file whose size changes during asynchronous reading", async () => {
  const f = fixture(true);
  await assert.rejects(f.pick(["csv"], 1000), /Размер файла изменился/);
  assert.deepEqual(f.calls, ["read-start", "read-end", "close", "delete"]);
});

test("native CSV import propagates asynchronous read failure and releases its cache copy", async () => {
  const f = fixture(false, true);
  await assert.rejects(f.pick(["csv"], 1000), /read failed/);
  assert.deepEqual(f.calls, ["read-start", "read-end", "close", "delete"]);
});
