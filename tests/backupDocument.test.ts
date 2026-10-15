import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as contracts from "../src/infrastructure/files/backupDocumentReader";

function loadAdapter(
  native: boolean,
  modules: Record<string, unknown>,
  globals = {},
) {
  const filename = new URL(
    `../src/infrastructure/files/backupDocument${native ? ".native" : ""}.ts`,
    import.meta.url,
  );
  const source = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const exports = {} as {
    pickBackupDocument(): Promise<contracts.BackupDocument | null>;
  };
  runInNewContext(
    source,
    {
      exports,
      Uint8Array,
      ...globals,
      require(name: string) {
        if (name === "./backupDocumentReader") return contracts;
        assert.ok(name in modules, `Unexpected import: ${name}`);
        return modules[name];
      },
    },
    { filename: filename.pathname },
  );
  return exports.pickBackupDocument;
}

function nativeFixture() {
  const bytes = new TextEncoder().encode("LADRESC2synthetic bytes");
  const state = {
    canceled: false,
    name: "synthetic.ladrescue",
    fileSize: bytes.length,
    handleSize: bytes.length,
    exists: true,
    opens: 0,
    closes: 0,
    reads: [] as [number, number][],
    deletes: [] as string[],
    options: undefined as Record<string, unknown> | undefined,
    failOpen: false,
    shortRead: false,
    failRead: false,
  };
  const uri = "file:///cache/DocumentPicker/unique-copy.ladrescue";
  class File {
    constructor(readonly uri: string) {
      assert.equal(uri, "file:///cache/DocumentPicker/unique-copy.ladrescue");
    }
    get size() {
      return state.fileSize;
    }
    get exists() {
      return state.exists;
    }
    delete() {
      state.deletes.push(this.uri);
      state.exists = false;
    }
    open(mode: string) {
      assert.equal(mode, "read-only");
      state.opens++;
      if (state.failOpen) throw new Error("open failed");
      return {
        offset: 0,
        get size() {
          return state.handleSize;
        },
        readBytes(length: number) {
          state.reads.push([this.offset, length]);
          if (state.failRead) throw new Error("read failed");
          return bytes.slice(
            this.offset,
            this.offset + length - (state.shortRead ? 1 : 0),
          );
        },
        close() {
          state.closes++;
        },
      };
    }
  }
  const pick = loadAdapter(true, {
    "expo-file-system": { File, FileMode: { ReadOnly: "read-only" } },
    "expo-document-picker": {
      async getDocumentAsync(options: Record<string, unknown>) {
        state.options = options;
        return state.canceled
          ? { canceled: true, assets: null }
          : { canceled: false, assets: [{ name: state.name, uri }] };
      },
    },
  });
  return { state, bytes, uri, pick };
}

function webFixture() {
  const bytes = new TextEncoder().encode("LADRESC2web synthetic bytes");
  const state = {
    canceled: false,
    name: "synthetic.ladrescue",
    uri: "blob:picker-copy",
    missingFile: false,
    shortRead: false,
    failRead: false,
    size: bytes.length,
    slices: [] as [number, number][],
    revoked: [] as string[],
    options: undefined as Record<string, unknown> | undefined,
  };
  const pick = loadAdapter(
    false,
    {
      "expo-document-picker": {
        async getDocumentAsync(options: Record<string, unknown>) {
          state.options = options;
          if (state.canceled) return { canceled: true, assets: null };
          const file = {
            get size() {
              return state.size;
            },
            slice(start: number, end: number) {
              state.slices.push([start, end]);
              return {
                async arrayBuffer() {
                  if (state.failRead) throw new Error("read failed");
                  return bytes.slice(start, end - (state.shortRead ? 1 : 0))
                    .buffer;
                },
              };
            },
          };
          return {
            canceled: false,
            assets: [
              {
                name: state.name,
                uri: state.uri,
                file: state.missingFile ? undefined : file,
              },
            ],
          };
        },
      },
    },
    {
      URL: { revokeObjectURL: (uri: string) => state.revoked.push(uri) },
      fetch: () => {
        throw new Error("Unbounded fetch is forbidden");
      },
    },
  );
  return { state, bytes, pick };
}

test("native picker is lazy, seeks exact bounded ranges and only deletes its copied cache file on close", async () => {
  const { state, bytes, uri, pick } = nativeFixture();
  const document = (await pick())!;
  assert.equal(state.options?.copyToCacheDirectory, true);
  assert.equal(state.options?.multiple, false);
  assert.equal(state.opens, 1);
  assert.deepEqual(state.reads, []);
  assert.deepEqual(await document.read(8, 4), bytes.slice(8, 12));
  assert.deepEqual(await document.read(0, 8), bytes.slice(0, 8));
  assert.deepEqual(state.deletes, []);
  for (const [offset, length] of [
    [-1, 1],
    [0, -1],
    [0.5, 1],
    [0, Infinity],
    [bytes.length, 1],
    [Number.MAX_SAFE_INTEGER, 2],
  ])
    await assert.rejects(document.read(offset, length), /размер/);
  assert.equal(state.reads.length, 2);
  document.close();
  document.close();
  assert.deepEqual(state.deletes, [uri]);
  assert.equal(state.closes, 1);
  await assert.rejects(document.read(0, 1), /ещё раз/);
});

test("native picker cancellation creates nothing; rejection/open failure/changed size release only the picker copy", async () => {
  const canceled = nativeFixture();
  canceled.state.canceled = true;
  assert.equal(await canceled.pick(), null);
  assert.equal(canceled.state.opens, 0);
  assert.deepEqual(canceled.state.deletes, []);
  for (const failure of ["name", "open", "size"] as const) {
    const { state, uri, pick } = nativeFixture();
    if (failure === "name") state.name = "not-a-backup.csv";
    if (failure === "open") state.failOpen = true;
    if (failure === "size") state.handleSize++;
    await assert.rejects(pick());
    assert.deepEqual(state.deletes, [uri]);
    assert.equal(state.closes, failure === "size" ? 1 : 0);
  }
});

test("native short reads, read errors and external size changes fail; explicit owner cleanup closes the resource", async () => {
  for (const failure of ["short", "read", "size"] as const) {
    const { state, uri, pick } = nativeFixture();
    const document = (await pick())!;
    if (failure === "short") state.shortRead = true;
    if (failure === "read") state.failRead = true;
    if (failure === "size") state.handleSize++;
    try {
      await assert.rejects(document.read(0, 8));
    } finally {
      document.close();
    }
    assert.equal(state.closes, 1);
    assert.deepEqual(state.deletes, [uri]);
  }
});

test("web picker uses Blob slices without fetching/reading the complete file and revokes its URL on close", async () => {
  const { state, bytes, pick } = webFixture();
  const document = (await pick())!;
  assert.equal(state.options?.base64, false);
  assert.deepEqual(state.slices, []);
  assert.deepEqual(await document.read(0, 8), bytes.slice(0, 8));
  assert.deepEqual(await document.read(8, 4), bytes.slice(8, 12));
  await assert.rejects(document.read(0, document.size + 1));
  assert.deepEqual(state.slices, [
    [0, 8],
    [8, 12],
  ]);
  assert.deepEqual(state.revoked, []);
  document.close();
  assert.deepEqual(state.revoked, ["blob:picker-copy"]);
  await assert.rejects(document.read(0, 1), /ещё раз/);
});

test("web cancellation, invalid extension and missing File never fetch unbounded data and clean rejected blob URLs", async () => {
  const canceled = webFixture();
  canceled.state.canceled = true;
  assert.equal(await canceled.pick(), null);
  assert.deepEqual(canceled.state.revoked, []);
  for (const failure of ["name", "missing", "size"] as const) {
    const { state, pick } = webFixture();
    if (failure === "name") state.name = "not-a-backup.csv";
    if (failure === "missing") state.missingFile = true;
    if (failure === "size") state.size = Infinity;
    await assert.rejects(pick());
    assert.deepEqual(state.slices, []);
    assert.deepEqual(state.revoked, ["blob:picker-copy"]);
  }
});

test("web short reads and read failures retain ownership until explicit cleanup", async () => {
  for (const failure of ["short", "read"] as const) {
    const { state, pick } = webFixture();
    const document = (await pick())!;
    if (failure === "short") state.shortRead = true;
    else state.failRead = true;
    try {
      await assert.rejects(document.read(0, 8));
    } finally {
      document.close();
    }
    assert.deepEqual(state.revoked, ["blob:picker-copy"]);
  }
});
