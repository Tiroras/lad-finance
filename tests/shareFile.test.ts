import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

type ShareFile = (
  content: string | readonly Uint8Array[],
  name: string,
  mimeType: string,
) => Promise<void>;
function loadAdapter(
  native: boolean,
  modules: Record<string, unknown>,
  globals = {},
) {
  const filename = new URL(
    `../src/infrastructure/files/shareFile${native ? ".native" : ""}.ts`,
    import.meta.url,
  );
  const source = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const exports = {} as { shareFile: ShareFile };
  runInNewContext(
    source,
    {
      exports,
      Uint8Array,
      ...globals,
      require(name: string) {
        assert.ok(name in modules, `Unexpected import: ${name}`);
        return modules[name];
      },
    },
    { filename: filename.pathname },
  );
  return exports.shareFile;
}

function nativeFixture() {
  const directories = new Set<string>();
  const files = new Map<string, Uint8Array>();
  files.set("file:///cache/unrelated/keep.json", new Uint8Array([99]));
  const requests: {
    uri: string;
    options: Record<string, string>;
    resolve(): void;
    reject(error: Error): void;
  }[] = [];
  const waiting: { count: number; resolve(): void }[] = [];
  const state = {
    available: true,
    fail: "" as "" | "create" | "open" | "write",
    directories,
    files,
    requests,
    deleted: [] as string[],
    writes: [] as { uri: string; bytes: Uint8Array }[],
    closes: [] as string[],
    uuid: 0,
  };
  class Directory {
    readonly uri: string;
    constructor(parent: { uri: string }, name: string) {
      this.uri = `${parent.uri}/${name}`;
    }
    get exists() {
      return directories.has(this.uri);
    }
    create() {
      if (state.fail === "create") throw new Error("create failed");
      assert.equal(directories.has(this.uri), false);
      directories.add(this.uri);
    }
    delete() {
      state.deleted.push(this.uri);
      directories.delete(this.uri);
      for (const uri of files.keys())
        if (uri.startsWith(`${this.uri}/`)) files.delete(uri);
    }
  }
  class File {
    readonly uri: string;
    constructor(parent: Directory, name: string) {
      this.uri = `${parent.uri}/${name}`;
    }
    create() {
      files.set(this.uri, new Uint8Array());
    }
    write(value: string) {
      if (state.fail === "write") throw new Error("write failed");
      files.set(this.uri, new TextEncoder().encode(value));
    }
    open(mode: string) {
      assert.equal(mode, "write-only");
      if (state.fail === "open") throw new Error("open failed");
      const uri = this.uri;
      return {
        writeBytes(bytes: Uint8Array) {
          if (state.fail === "write") throw new Error("write failed");
          state.writes.push({ uri, bytes: new Uint8Array(bytes) });
          files.set(
            uri,
            new Uint8Array(Buffer.concat([files.get(uri)!, bytes])),
          );
        },
        close() {
          state.closes.push(uri);
        },
      };
    }
  }
  const share = loadAdapter(true, {
    "expo-file-system": {
      Directory,
      File,
      FileMode: { WriteOnly: "write-only" },
      Paths: { cache: { uri: "file:///cache" } },
    },
    "expo-crypto": { randomUUID: () => `unique-${++state.uuid}` },
    "expo-sharing": {
      isAvailableAsync: async () => state.available,
      shareAsync: (uri: string, options: Record<string, string>) =>
        new Promise<void>((resolve, reject) => {
          requests.push({ uri, options, resolve, reject });
          for (const waiter of waiting)
            if (requests.length >= waiter.count) waiter.resolve();
        }),
    },
  });
  const waitForShares = (count: number) =>
    requests.length >= count
      ? Promise.resolve()
      : new Promise<void>((resolve) => waiting.push({ count, resolve }));
  return { state, share, waitForShares };
}

function webFixture() {
  const state = {
    urls: new Map<string, Blob>(),
    revoked: [] as string[],
    timers: [] as { callback(): void; delay: number }[],
    clicked: [] as { href: string; download: string }[],
    failure: "" as "" | "create" | "click",
  };
  const share = loadAdapter(
    false,
    {},
    {
      Blob,
      URL: {
        createObjectURL(blob: Blob) {
          const url = `blob:export-${state.urls.size}`;
          state.urls.set(url, blob);
          return url;
        },
        revokeObjectURL(url: string) {
          state.revoked.push(url);
        },
      },
      setTimeout(callback: () => void, delay: number) {
        state.timers.push({ callback, delay });
      },
      document: {
        createElement(tag: string) {
          assert.equal(tag, "a");
          if (state.failure === "create") throw new Error("create failed");
          return {
            href: "",
            download: "",
            click() {
              if (state.failure === "click") throw new Error("click failed");
              state.clicked.push({ href: this.href, download: this.download });
            },
          };
        },
      },
    },
  );
  return { state, share };
}

test("native export writes binary parts in order, closes the handle before sharing and cleans its directory after completion", async () => {
  const { state, share, waitForShares } = nativeFixture();
  const parts = [
    new Uint8Array([1, 2]),
    new Uint8Array([3]),
    new Uint8Array([4, 5]),
  ];
  const pending = share(parts, "same.ladrescue", "application/octet-stream");
  await waitForShares(1);
  const request = state.requests[0];
  assert.equal(request.options.UTI, "public.data");
  assert.deepEqual(
    state.writes.map((write) => [...write.bytes]),
    [[1, 2], [3], [4, 5]],
  );
  assert.deepEqual(
    state.files.get(request.uri),
    new Uint8Array([1, 2, 3, 4, 5]),
  );
  assert.deepEqual(state.closes, [request.uri]);
  assert.equal(state.directories.size, 1);
  request.resolve(); // Expo resolves both completed and dismissed share menus.
  await pending;
  assert.equal(state.directories.size, 0);
  assert.equal(state.files.has(request.uri), false);
  assert.equal(state.files.has("file:///cache/unrelated/keep.json"), true);
});

test("concurrent native exports with the same filename own separate directories and cannot delete each other's pending file", async () => {
  const { state, share, waitForShares } = nativeFixture();
  const first = share("first", "same.json", "application/json");
  const second = share("second", "same.json", "application/json");
  await waitForShares(2);
  const [a, b] = state.requests;
  assert.notEqual(a.uri, b.uri);
  assert.equal(a.options.UTI, "public.json");
  assert.equal(b.options.UTI, "public.json");
  b.resolve();
  await second;
  assert.equal(state.files.has(a.uri), true);
  assert.equal(new TextDecoder().decode(state.files.get(a.uri)), "first");
  assert.equal(state.files.has(b.uri), false);
  a.resolve();
  await first;
  assert.equal(state.directories.size, 0);
  assert.equal(state.deleted.length, 2);
});

test("native unavailable sharing and all write/open/share failures release only resources created by that export", async () => {
  const unavailable = nativeFixture();
  unavailable.state.available = false;
  await assert.rejects(
    unavailable.share("x", "file.json", "application/json"),
    /недоступно/,
  );
  assert.equal(unavailable.state.uuid, 0);
  for (const failure of ["create", "open", "write"] as const) {
    const { state, share } = nativeFixture();
    state.fail = failure;
    await assert.rejects(
      share(
        [new Uint8Array([1])],
        "file.ladbackup",
        "application/octet-stream",
      ),
      /failed/,
    );
    assert.equal(state.directories.size, 0);
    assert.equal(state.files.size, 1);
    assert.equal(state.files.has("file:///cache/unrelated/keep.json"), true);
    assert.equal(state.requests.length, 0);
    assert.equal(state.closes.length, failure === "write" ? 1 : 0);
  }
  const sharing = nativeFixture();
  const pending = sharing.share("csv", "file.csv", "text/csv");
  await sharing.waitForShares(1);
  assert.equal(
    sharing.state.requests[0].options.UTI,
    "public.comma-separated-values-text",
  );
  sharing.state.requests[0].reject(new Error("share failed"));
  await assert.rejects(pending, /share failed/);
  assert.equal(sharing.state.directories.size, 0);
  assert.equal(sharing.state.files.size, 1);
});

test("web binary export preserves exact parts and releases the URL after download has been requested", async () => {
  const { state, share } = webFixture();
  await share(
    [new Uint8Array([1, 2]), new Uint8Array([3, 4])],
    "file.ladbackup",
    "application/octet-stream",
  );
  assert.deepEqual(state.clicked, [
    { href: "blob:export-0", download: "file.ladbackup" },
  ]);
  assert.deepEqual(
    new Uint8Array(await state.urls.get("blob:export-0")!.arrayBuffer()),
    new Uint8Array([1, 2, 3, 4]),
  );
  assert.equal(
    state.urls.get("blob:export-0")!.type,
    "application/octet-stream",
  );
  assert.deepEqual(state.revoked, []);
  assert.equal(state.timers.length, 1);
  assert.equal(state.timers[0].delay, 1000);
  state.timers[0].callback();
  assert.deepEqual(state.revoked, ["blob:export-0"]);
});

test("web export releases its allocated URL when creation or clicking the download link fails", async () => {
  for (const failure of ["create", "click"] as const) {
    const { state, share } = webFixture();
    state.failure = failure;
    await assert.rejects(
      share("synthetic", "file.json", "application/json"),
      /failed/,
    );
    for (const timer of state.timers) timer.callback();
    assert.deepEqual(state.revoked, ["blob:export-0"]);
  }
});
