import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { processCiphertext } from "./helpers/encryptedFileStorageProcess";

interface Event {
  type: string;
  stage?: string;
  profile?: string;
  digest?: string;
}
const helper = new URL(
  "./helpers/encryptedFileStorageProcess.ts",
  import.meta.url,
);
const digests = [0, 1].map((revision) =>
  createHash("sha256").update(processCiphertext(revision)).digest("hex"),
);

async function run(directory: string, operation: string, stage: string) {
  const child = fork(helper, [directory, operation, stage], {
    execArgv: ["--import", "tsx"],
    stdio: ["ignore", "ignore", "pipe", "ipc"],
  });
  const events: Event[] = [];
  let stderr = "";
  let reached = false;
  child.stderr!.on("data", (value) => {
    stderr += value;
  });
  child.on("message", (value) => {
    const event = value as Event;
    events.push(event);
    if (event.type === "checkpoint" && event.stage === stage) {
      reached = true;
      child.kill("SIGKILL");
    }
  });
  const timeout = setTimeout(() => child.kill("SIGKILL"), 15_000);
  try {
    const result = await new Promise<{
      code: number | null;
      signal: NodeJS.Signals | null;
    }>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => resolve({ code, signal }));
    });
    assert.equal(stderr, "");
    if (operation === "load") assert.equal(result.code, 0);
    else {
      assert.ok(reached, `Did not reach ${operation}/${stage}`);
      assert.equal(result.signal, "SIGKILL");
    }
    return events;
  } finally {
    clearTimeout(timeout);
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
  }
}

for (const operation of ["migrate-inline", "save-file"])
  for (const stage of [
    "partial-generation",
    "before-pointer",
    "after-pointer",
    "after-ack",
  ])
    test(
      `encrypted file ${operation}/${stage}: SIGKILL preserves complete published revision (3 repeats)`,
      { timeout: 90_000 },
      async () => {
        for (let repeat = 0; repeat < 3; repeat++) {
          const directory = await mkdtemp(
            join(tmpdir(), "lad-ciphertext-process-"),
          );
          try {
            const events = await run(directory, operation, stage);
            assert.equal(
              events.some((event) => event.type === "ack"),
              stage === "after-ack",
            );
            const revision =
              stage === "partial-generation" || stage === "before-pointer"
                ? 0
                : 1;
            const folder = join(directory, "personal");
            const namesBefore = (await readdir(folder)).sort();
            const pointerBefore = await readFile(
              join(folder, "pointer.json"),
              "utf8",
            );
            // A partially written generation must not be mistaken for a committed
            // ledger; reopening is read-only and must not delete this evidence.
            const restarted = await run(directory, "load", "none");
            assert.deepEqual(restarted, [
              {
                type: "loaded",
                profile: "personal",
                digest: digests[revision],
              },
              { type: "loaded", profile: "demo", digest: digests[0] },
            ]);
            assert.equal(
              await readFile(join(folder, "pointer.json"), "utf8"),
              pointerBefore,
            );
            assert.deepEqual((await readdir(folder)).sort(), namesBefore);
            if (operation === "save-file" && stage !== "after-ack")
              assert.equal(
                namesBefore.filter((name) => name.endsWith(".vault")).length,
                2,
              );
          } finally {
            await rm(directory, { recursive: true, force: true });
          }
        }
      },
    );
