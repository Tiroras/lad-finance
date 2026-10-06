import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, writeFile, open, readFile, unlink } from "node:fs/promises";
import { cpus, release, arch, totalmem } from "node:os";
import path from "node:path";
import { performance, monitorEventLoopDelay } from "node:perf_hooks";
import { setImmediate as nextTick } from "node:timers/promises";
import {
  checkedBackupContent,
  decodeBackup,
  encodeBackup,
} from "../../src/domain/backup";
import { forecast } from "../../src/domain/forecast";
import { selectTransactionList } from "../../src/domain/transactionList";
import { exportTransactionsCsv } from "../../src/domain/csvExport";
import {
  applyCsvImport,
  guessCsvMapping,
  parseCsv,
} from "../../src/domain/csv";
import { accountBalance } from "../../src/domain/accountBalances";
import { backupCrypto } from "../../src/infrastructure/crypto/backupCrypto";
import { derivePasswordKey } from "../../src/infrastructure/crypto/passwordKdf";
import {
  BACKUP_ITERATIONS,
  decryptBackup,
  encryptBackup,
} from "../../src/infrastructure/crypto/passwordBackup";
import {
  createVault,
  type VaultDependencies,
} from "../../src/infrastructure/storage/vault";
import {
  createBoundaryPerformanceFixture,
  createLegacyPerformanceFixture,
  createPerformanceFixture,
  FIXTURE_SEED,
  FIXTURE_SIZES,
  FIXTURE_TODAY,
} from "./fixtures";
import { verifyCsvFixture, verifyPerformanceFixture } from "./oracle";

const output = path.resolve(process.argv[2] ?? "test-results/t01-a10");
const samples: Record<string, unknown>[] = [];
const summaries: Record<string, unknown>[] = [];
const started = new Date().toISOString();
const memory = () => ({
  ...process.memoryUsage(),
  maxRssKiB: process.resourceUsage().maxRSS,
});
const hash = (raw: string) => createHash("sha256").update(raw).digest("hex");
const sortedMedian = (values: number[]) =>
  values.length % 2
    ? values[Math.floor(values.length / 2)]
    : (values[values.length / 2 - 1] + values[values.length / 2]) / 2;

async function measure<T>(
  dataset: number | string,
  name: string,
  repetitions: number,
  action: () => T | Promise<T>,
  verify: (result: T) => void = () => {},
) {
  for (let i = 0; i < 3; i++) verify(await action());
  const durations: number[] = [];
  for (let i = 0; i < repetitions; i++) {
    global.gc?.();
    await nextTick();
    const before = memory();
    const start = performance.now();
    const result = await action();
    const elapsedMs = performance.now() - start;
    const after = memory();
    verify(result);
    durations.push(elapsedMs);
    const sample = {
      dataset,
      name,
      iteration: i + 1,
      elapsedMs,
      before,
      after,
    };
    samples.push(sample);
    await writeFile(
      path.join(output, "samples.ndjson"),
      JSON.stringify(sample) + "\n",
      { flag: "a" },
    );
  }
  const ordered = [...durations].sort((a, b) => a - b);
  const summary = {
    dataset,
    name,
    repetitions,
    warmups: 3,
    minMs: ordered[0],
    medianMs: sortedMedian(ordered),
    maxMs: ordered.at(-1),
    ...(repetitions >= 30
      ? { p95Ms: ordered[Math.ceil(repetitions * 0.95) - 1] }
      : {}),
  };
  summaries.push(summary);
  process.stdout.write(JSON.stringify(summary) + "\n");
}

/** Real vault algorithm with explicitly substituted memory storage/key service and Node WebCrypto. */
function modelVault() {
  const items = new Map<string, string>(),
    keys = new Map<string, string>();
  let sequence = 0;
  const dependencies: VaultDependencies = {
    storage: {
      async getItem(key) {
        return items.get(key) ?? null;
      },
      async setItem(key, value) {
        items.set(key, value);
      },
      async removeItem(key) {
        items.delete(key);
      },
    },
    keys: {
      async get(id) {
        return keys.get(id) ?? null;
      },
      async create() {
        const id = `test-${++sequence}`,
          secret = Buffer.from(backupCrypto.random(32)).toString("hex");
        keys.set(id, secret);
        return { id, secret };
      },
      async remove(id) {
        keys.delete(id);
      },
    },
    cipher: {
      async seal(plain, secret, context) {
        return Buffer.from(
          await backupCrypto.seal(
            new TextEncoder().encode(plain),
            Buffer.from(secret, "hex"),
            backupCrypto.random(12),
            new TextEncoder().encode(context),
          ),
        ).toString("base64");
      },
      async open(sealed, secret, context) {
        return new TextDecoder().decode(
          await backupCrypto.open(
            Buffer.from(sealed, "base64"),
            Buffer.from(secret, "hex"),
            new TextEncoder().encode(context),
          ),
        );
      },
    },
  };
  return { vault: createVault(dependencies), dependencies };
}

async function main() {
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, "samples.ndjson"), "");
  const meta = {
    started,
    sha: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    gitStatus: execFileSync("git", ["status", "--short"], { encoding: "utf8" }),
    node: process.version,
    platform: process.platform,
    release: release(),
    arch: arch(),
    cpu: cpus()[0].model,
    cpuCount: cpus().length,
    totalMemoryBytes: totalmem(),
    mode: "default synthetic in-memory; no app profiles opened",
    seed: FIXTURE_SEED,
    today: FIXTURE_TODAY,
    gcBetweenSamples: !!global.gc,
    environmentNote: process.env.A10_ENVIRONMENT_NOTE ?? "not supplied",
    targets:
      "Node baseline only; no React rendering, native AES, SecureStore or device persistence",
  };
  await writeFile(
    path.join(output, "environment.json"),
    JSON.stringify(meta, null, 2),
  );
  const sourceHashes = Object.fromEntries(
    await Promise.all(
      [
        "tests/performance/fixtures.ts",
        "tests/performance/oracle.ts",
        "tests/performance/run.ts",
        "tests/performance/cold-load.ts",
        "src/domain/backup.ts",
        "src/domain/forecast.ts",
        "src/domain/transactionAmounts.ts",
        "src/domain/transactionList.ts",
        "src/infrastructure/storage/vault.ts",
        "src/infrastructure/crypto/passwordBackup.ts",
        "src/infrastructure/crypto/passwordKdf.ts",
      ].map(async (file) => [file, hash(await readFile(file, "utf8"))]),
    ),
  );
  await writeFile(
    path.join(output, "source-hashes.json"),
    JSON.stringify(sourceHashes, null, 2),
  );
  const loop = monitorEventLoopDelay({ resolution: 10 });
  loop.enable();
  const fixtures: Record<string, unknown>[] = [];
  const password = "A10 synthetic password only";
  for (const count of FIXTURE_SIZES) {
    const fixture = createPerformanceFixture(count),
      state = fixture.state;
    const raw = checkedBackupContent(state),
      reference = verifyPerformanceFixture(fixture),
      csvOracle = verifyCsvFixture(fixture);
    const file = path.join(output, `fixture-${count}.json`);
    await writeFile(file, raw);
    fixtures.push({
      count,
      seed: fixture.seed,
      bytes: Buffer.byteLength(raw),
      utf16Characters: raw.length,
      sha256: hash(raw),
      entities: {
        accounts: state.accounts.length,
        categories: state.categories.length,
        goals: state.goals.length,
        recurring: state.recurring.length,
        plannedIncomes: state.plannedIncomes!.length,
        debts: state.debts!.length,
        split: count / 10,
        refund: count / 10,
        debtMovements: count / 5,
        foreignTransfers: count / 10,
      },
      expected: fixture.expected,
      forecast: reference,
      csvOracle,
    });
    const cold = [];
    for (let i = 0; i < 10; i++) {
      const begin = performance.now();
      const child = spawnSync(
        process.execPath,
        ["--import", "tsx", "tests/performance/cold-load.ts", file],
        { encoding: "utf8" },
      );
      assert.equal(child.status, 0, child.stderr);
      const observation = {
        iteration: i + 1,
        nodeProcessWallMs: performance.now() - begin,
        ...JSON.parse(child.stdout),
      };
      assert.equal(observation.count, count);
      cold.push(observation);
    }
    await writeFile(
      path.join(output, `cold-${count}.json`),
      JSON.stringify(cold, null, 2),
    );
    await measure(
      count,
      "json_stringify",
      10,
      () => encodeBackup(state),
      (value) => assert.equal(hash(value), hash(raw)),
    );
    await measure(
      count,
      "json_decode_validate",
      10,
      () => decodeBackup(raw),
      (value) => assert.deepEqual(value, state),
    );
    await measure(
      count,
      "history_all",
      30,
      () =>
        selectTransactionList(
          state,
          {
            month: "2026-10",
            period: "all",
            query: "",
            type: "all",
            account: "all",
            category: "all",
          },
          FIXTURE_TODAY,
        ),
      (value) => {
        assert.equal(value.transactions.length, count);
        assert.equal(value.income, fixture.expected.income);
        assert.equal(value.expense, fixture.expected.expense);
      },
    );
    await measure(
      count,
      "history_search",
      30,
      () =>
        selectTransactionList(
          state,
          {
            month: "2026-10",
            period: "all",
            query: "Поиск чай",
            type: "all",
            account: "all",
            category: "all",
          },
          FIXTURE_TODAY,
        ),
      (value) => {
        assert.equal(value.transactions.length, fixture.expected.searchCount);
        assert.equal(value.expense, fixture.expected.searchExpense);
      },
    );
    await measure(
      count,
      "forecast_90",
      30,
      () => forecast(state, 90, FIXTURE_TODAY),
      (value) =>
        assert.deepEqual(
          value.days.map(({ date, balance }) => ({ date, balance })),
          reference.days,
        ),
    );
    const model = modelVault();
    await model.vault.save(state);
    await measure(count, "vault_save_memory_adapter", 30, async () => {
      await model.vault.save(state);
      return true;
    });
    assert.deepEqual(await createVault(model.dependencies).load(), state);
    const ioFile = path.join(output, `io-${count}.tmp`);
    await measure(
      count,
      "node_file_write_fsync_read",
      10,
      async () => {
        const handle = await open(ioFile, "w");
        try {
          await handle.writeFile(raw);
          await handle.sync();
        } finally {
          await handle.close();
        }
        return readFile(ioFile, "utf8");
      },
      (value) => assert.equal(value, raw),
    );
    await unlink(ioFile);
    await measure(
      count,
      "csv_export",
      10,
      () =>
        exportTransactionsCsv(state, { format: "universal" }, FIXTURE_TODAY),
      (value) => {
        assert.equal(value.transactionCount, count);
        assert.equal(value.count, count * 1.2);
      },
    );
    const rows = Math.min(count, 5000);
    const bankCsv =
      "Date,Description,Amount,ID\n" +
      Array.from(
        { length: rows },
        (_, i) => `2026-10-05,Bank ${i},-1.00,a10-${i}`,
      ).join("\n");
    const bankTable = parseCsv(bankCsv);
    const bankState = { ...state, transactions: [] };
    const bankOptions = {
      accountId: "r",
      mapping: guessCsvMapping(bankTable.headers),
      mode: "signed" as const,
      positive: "income" as const,
      dateOrder: "dmy" as const,
    };
    await measure(
      count,
      `csv_parse_${rows}_rows`,
      10,
      () => parseCsv(bankCsv),
      (value) => assert.equal(value.rows.length, rows),
    );
    await measure(
      count,
      `csv_atomic_import_${rows}_rows_empty_profile`,
      10,
      () =>
        applyCsvImport(
          bankState,
          bankTable,
          bankOptions,
          new Set(),
          {},
          FIXTURE_TODAY,
        ),
      (value) => {
        assert.equal(value.transactions.length, rows);
        assert.equal(
          accountBalance(value, "r", FIXTURE_TODAY),
          1000000000 - rows * 100,
        );
      },
    );
    const plain = new TextEncoder().encode(raw),
      key = backupCrypto.random(32),
      aad = new TextEncoder().encode("A10 synthetic benchmark");
    let sealed = await backupCrypto.seal(
      plain,
      key,
      backupCrypto.random(12),
      aad,
    );
    await measure(
      count,
      "aes_seal_node_webcrypto",
      10,
      () => backupCrypto.seal(plain, key, backupCrypto.random(12), aad),
      (value) => {
        sealed = value;
        assert.equal(value.length, plain.length + 28);
      },
    );
    await measure(
      count,
      "aes_open_node_webcrypto",
      10,
      () => backupCrypto.open(sealed, key, aad),
      (value) => assert.deepEqual(value, plain),
    );
    let envelope = await encryptBackup(state, password, backupCrypto);
    await measure(
      count,
      "password_encrypt_node_webcrypto",
      10,
      () => encryptBackup(state, password, backupCrypto),
      (value) => {
        envelope = value;
        assert.equal(JSON.parse(value).iterations, BACKUP_ITERATIONS);
      },
    );
    await measure(
      count,
      "password_decrypt_node_webcrypto",
      10,
      () => decryptBackup(envelope, password, backupCrypto),
      (value) => assert.deepEqual(value, state),
    );
    await writeFile(
      path.join(output, "fixtures-manifest.json"),
      JSON.stringify(fixtures, null, 2),
    );
  }
  const salt = new Uint8Array(16).fill(27),
    referenceKey = await backupCrypto.derive(password, salt, BACKUP_ITERATIONS);
  await measure(
    "shared",
    "kdf_node_webcrypto_600000",
    10,
    () => backupCrypto.derive(password, salt, BACKUP_ITERATIONS),
    (value) => assert.deepEqual(value, referenceKey),
  );
  await measure(
    "shared",
    "kdf_app_noble_js_600000_on_node",
    10,
    () => derivePasswordKey(password, salt, BACKUP_ITERATIONS),
    (value) => assert.deepEqual(value, referenceKey),
  );
  const boundary = createBoundaryPerformanceFixture(),
    boundaryRaw = checkedBackupContent(boundary);
  assert.equal(Buffer.byteLength(boundaryRaw), 5000000);
  await measure(
    "utf8-boundary",
    "json_decode_validate",
    10,
    () => decodeBackup(boundaryRaw),
    (value) => assert.deepEqual(value, boundary),
  );
  const legacy = createLegacyPerformanceFixture(),
    legacyRaw = encodeBackup(legacy);
  assert.ok(
    legacyRaw.length < 5000000 && Buffer.byteLength(legacyRaw) > 5000000,
  );
  assert.throws(() => checkedBackupContent(legacy), /5 МБ/);
  await measure(
    "legacy-utf16",
    "json_decode_validate",
    10,
    () => decodeBackup(legacyRaw),
    (value) => assert.deepEqual(value, legacy),
  );
  await writeFile(
    path.join(output, "boundary-manifest.json"),
    JSON.stringify(
      {
        boundary: {
          bytes: Buffer.byteLength(boundaryRaw),
          utf16Characters: boundaryRaw.length,
          sha256: hash(boundaryRaw),
        },
        legacy: {
          count: legacy.transactions.length,
          bytes: Buffer.byteLength(legacyRaw),
          utf16Characters: legacyRaw.length,
          sha256: hash(legacyRaw),
          portableExport:
            "rejected as expected; special A03 rescue format not implemented",
        },
      },
      null,
      2,
    ),
  );
  loop.disable();
  await writeFile(
    path.join(output, "summary.json"),
    JSON.stringify(
      {
        started,
        ended: new Date().toISOString(),
        summaries,
        sampleCount: samples.length,
        memory: memory(),
        eventLoopDelay: {
          minMs: loop.min / 1e6,
          maxMs: loop.max / 1e6,
          meanMs: loop.mean / 1e6,
          note: "whole Node harness including validation, GC and synchronous child spawning; not UI latency",
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  process.stderr.write(String(error.stack ?? error) + "\n");
  process.exitCode = 1;
});
