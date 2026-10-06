import assert from "node:assert/strict";
import { fork } from "node:child_process";
import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { test } from "node:test";
import {
  LEGACY_STORAGE_KEY,
  VAULT_STORAGE_KEY,
} from "../src/infrastructure/storage/vault";
import {
  reliabilityProfiles,
  reliabilitySnapshots,
  snapshotEvidence,
} from "./helpers/saveReliability";

interface Event {
  type: string;
  stage?: string;
  elapsedMs: number;
  parentReceivedMs?: number;
  profile?: string;
  revision?: number;
  digest?: string;
  balance?: number;
  transactionIds?: string[];
}
const childPath = new URL(
  "./helpers/saveInterruptionProcess.ts",
  import.meta.url,
);
const expected = reliabilitySnapshots().map(snapshotEvidence);
const holdMs = 125;

async function runChild(directory: string, operation: string, target: string) {
  const started = performance.now();
  const child = fork(childPath, [directory, operation, target], {
    execArgv: ["--import", "tsx"],
    stdio: ["ignore", "ignore", "pipe", "ipc"],
    env: {
      ...process.env,
      EXPO_PUBLIC_ENABLE_DEMO: "false",
      EXPO_PUBLIC_RESET_ON_START: "false",
    },
  });
  const events: Event[] = [];
  let stderr = "",
    killed = false,
    atKillMs: number | undefined;
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  child.stderr!.on("data", (chunk) => {
    stderr += chunk;
  });
  child.on("message", (message) => {
    const event = message as Event;
    event.parentReceivedMs = performance.now() - started;
    events.push(event);
    if (event.type === "checkpoint" && event.stage === target) {
      killTimer = setTimeout(() => {
        atKillMs = performance.now() - started;
        killed = child.kill("SIGKILL");
      }, holdMs);
    }
  });
  const timeout = setTimeout(() => child.kill("SIGKILL"), 15_000);
  try {
    const result = await new Promise<{
      code: number | null;
      signal: NodeJS.Signals | null;
    }>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => resolve({ code, signal }));
    });
    if (operation === "load") assert.equal(result.code, 0, stderr);
    else {
      assert.equal(
        killed,
        true,
        `Never reached ${operation}/${target}: ${stderr}`,
      );
      assert.equal(result.signal, "SIGKILL", stderr);
    }
    assert.equal(stderr, "");
    return { events, result, atKillMs, totalMs: performance.now() - started };
  } finally {
    clearTimeout(timeout);
    clearTimeout(killTimer);
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
  }
}

const scenarios: { operation: string; stage: string; revision: number }[] = [];
for (const operation of ["save", "two-edits"]) {
  const previous = operation === "save" ? 0 : 1;
  for (const stage of [
    "before-enqueue",
    "envelope-before-commit",
    "envelope-after-commit",
    "envelope-readback",
    "legacy-before-remove",
    "legacy-after-remove",
    "after-ack",
  ]) {
    scenarios.push({
      operation,
      stage,
      revision: ["before-enqueue", "envelope-before-commit"].includes(stage)
        ? previous
        : previous + 1,
    });
  }
}
for (const operation of ["migrate", "recover"]) {
  for (const stage of [
    "key-before-create",
    "key-after-create",
    "envelope-before-commit",
    "envelope-after-commit",
    "envelope-readback",
    "legacy-before-remove",
    "legacy-after-remove",
    ...(operation === "recover"
      ? ["old-key-before-remove", "old-key-after-remove"]
      : []),
    "after-ack",
  ]) {
    scenarios.push({
      operation,
      stage,
      revision:
        operation === "migrate" ||
        [
          "key-before-create",
          "key-after-create",
          "envelope-before-commit",
        ].includes(stage)
          ? 0
          : 1,
    });
  }
}

for (const { operation, stage, revision } of scenarios) {
  test(
    `A05 isolated Node SIGKILL ${operation}/${stage}: full revision survives restart (3 repeats)`,
    { timeout: 90_000 },
    async () => {
      for (let repetition = 1; repetition <= 3; repetition += 1) {
        const directory = await mkdtemp(join(tmpdir(), "lad-a05-"));
        try {
          const interrupted = await runChild(directory, operation, stage);
          const filesBeforeRestart = await readdir(
            join(directory, reliabilityProfiles[0]),
          );
          // Assert cleanup ordering independently of successful restart, whose load()
          // is intentionally allowed to migrate or remove a leftover plaintext copy.
          if (operation === "migrate") {
            assert.equal(
              filesBeforeRestart.includes(LEGACY_STORAGE_KEY),
              !["legacy-after-remove", "after-ack"].includes(stage),
            );
          }
          if (
            operation === "recover" &&
            !["old-key-after-remove", "after-ack"].includes(stage)
          ) {
            assert.ok(
              filesBeforeRestart.some((name) => name.startsWith("key-")),
            );
          }
          const envelopeBeforeRestart = await readFile(
            join(directory, reliabilityProfiles[0], VAULT_STORAGE_KEY),
            "utf8",
          ).catch((error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") return null;
            throw error;
          });
          if (envelopeBeforeRestart) {
            const keyId: string = JSON.parse(envelopeBeforeRestart).keyId;
            assert.ok(
              filesBeforeRestart.includes(`key-${keyId}`),
              "Envelope must retain its matching key before reopening",
            );
          }
          const restarted = await runChild(directory, "load", "none");
          const loaded = restarted.events.find(
            (event) =>
              event.type === "loaded" &&
              event.profile === reliabilityProfiles[0],
          );
          const other = restarted.events.find(
            (event) =>
              event.type === "loaded" &&
              event.profile === reliabilityProfiles[1],
          );
          assert.ok(loaded && other);
          for (const [actual, wanted] of [
            [loaded, expected[revision]],
            [other, expected[0]],
          ] as const) {
            assert.equal(
              actual.digest,
              wanted.digest,
              "The entire financial snapshot must agree, not just its amount",
            );
            assert.equal(actual.balance, wanted.balance);
            assert.deepEqual(actual.transactionIds, wanted.transactionIds);
          }
          const acknowledgements = interrupted.events.filter(
            (event) => event.type === "ack",
          );
          for (const ack of acknowledgements) {
            assert.equal(ack.profile, reliabilityProfiles[0]);
            assert.ok(
              ack.revision! <= revision,
              "No acknowledged revision may be lost",
            );
          }
          if (stage === "after-ack")
            assert.equal(acknowledgements.at(-1)?.revision, revision);
          if (operation === "two-edits")
            assert.equal(acknowledgements[0]?.revision, 1);
          if (process.env.A05_EVIDENCE) {
            await mkdir(dirname(process.env.A05_EVIDENCE), { recursive: true });
            await appendFile(
              process.env.A05_EVIDENCE,
              `${JSON.stringify({
                timestamp: new Date().toISOString(),
                environment: "Node file adapter; not native",
                operation,
                stage,
                repetition,
                injectedHoldMs: holdMs,
                expectedRevision: revision,
                interrupted,
                restarted,
                artifactCounts: {
                  keys: filesBeforeRestart.filter((name) =>
                    name.startsWith("key-"),
                  ).length,
                  legacyPresent:
                    filesBeforeRestart.includes(LEGACY_STORAGE_KEY),
                },
              })}\n`,
            );
          }
        } finally {
          await rm(directory, { recursive: true, force: true });
        }
      }
    },
  );
}
