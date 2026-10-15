import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createCipheriv,
  createDecipheriv,
  pbkdf2Sync,
  randomBytes,
} from "node:crypto";
import { createInitialState } from "../src/domain/seed";
import { encodeBackup, MAX_BACKUP_BYTES } from "../src/domain/backup";
import {
  BACKUP_NORMALIZATION_VERSION,
  MAX_RESCUE_SOURCE_BYTES,
} from "../src/domain/backupRecovery";
import { backupCrypto } from "../src/infrastructure/crypto/backupCrypto";
import {
  BACKUP_ITERATIONS,
  decryptBackup,
  decryptBackupSource,
  encryptBackup,
  type BackupCrypto,
} from "../src/infrastructure/crypto/passwordBackup";
import {
  MAX_RESCUE_HEADER_BYTES,
  RESCUE_ARCHIVE_MAGIC,
  isRescueArchivePrefix,
  readRescueArchive,
  readRescueArchiveHeader,
  writeRescueArchive,
  type RescueArchiveContent,
  type RescueArchiveReader,
} from "../src/infrastructure/crypto/rescueArchive";
import { createExpandedRecoveryFixture } from "./a03Fixtures";

const password = "Тестовый пароль 🔑 rescue";
const nodeCrypto: BackupCrypto = {
  random: (length) => new Uint8Array(randomBytes(length)),
  async derive(value, salt, iterations) {
    assert.equal(iterations, 600_000);
    return new Uint8Array(pbkdf2Sync(value, salt, iterations, 32, "sha256"));
  },
  async seal(plain, key, nonce, context) {
    const cipher = createCipheriv("aes-256-gcm", key, nonce);
    cipher.setAAD(context);
    return new Uint8Array(
      Buffer.concat([
        nonce,
        cipher.update(plain),
        cipher.final(),
        cipher.getAuthTag(),
      ]),
    );
  },
  async open(sealed, key, context) {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      sealed.subarray(0, 12),
    );
    decipher.setAAD(context);
    decipher.setAuthTag(sealed.subarray(-16));
    return new Uint8Array(
      Buffer.concat([
        decipher.update(sealed.subarray(12, -16)),
        decipher.final(),
      ]),
    );
  },
};

function fixture(): RescueArchiveContent {
  const source = createInitialState(false, "2026-09-10");
  source.settings.name = "Original anchor with a long name";
  source.transactions = [
    {
      id: "retained",
      type: "expense",
      title: "Покупка",
      amount: 100,
      date: "2026-09-10",
      category: "other",
      accountId: "card",
    },
    {
      id: "removed",
      type: "expense",
      title: "Удаляемая запись",
      amount: 100,
      date: "2026-09-10",
      category: "other",
      accountId: "card",
    },
  ];
  const current = structuredClone(source);
  current.settings.name = "Новый";
  current.accounts[0].openingBalance = 123;
  current.transactions.pop();
  current.transactions[0].date = "2026-09-11";
  return {
    sourceText: encodeBackup(source),
    currentSnapshotText: encodeBackup(current),
    normalizationVersion: BACKUP_NORMALIZATION_VERSION,
    normalizationDate: "2026-09-10",
    snapshotDate: "2026-09-11",
  };
}

function reader(parts: Uint8Array[]) {
  const bytes = Buffer.concat(parts);
  const reads: [number, number][] = [];
  const input: RescueArchiveReader = {
    size: bytes.length,
    async read(offset, length) {
      reads.push([offset, length]);
      return new Uint8Array(bytes.subarray(offset, offset + length));
    },
  };
  return { input, reads, bytes };
}

function patchHeader(parts: Uint8Array[], patch: Record<string, unknown>) {
  const header = new TextEncoder().encode(
    JSON.stringify({
      ...JSON.parse(new TextDecoder().decode(parts[1])),
      ...patch,
    }),
  );
  const prefix = new Uint8Array(parts[0]);
  new DataView(prefix.buffer).setUint32(8, header.length, false);
  return [prefix, header, ...parts.slice(2)];
}

test("plain rescue preserves immutable source and exact changed current snapshot, with four independently writable parts", async () => {
  const content = fixture();
  const parts = await writeRescueArchive(content);
  assert.equal(parts.length, 4);
  assert.equal(
    new TextDecoder().decode(parts[0].subarray(0, 8)),
    RESCUE_ARCHIVE_MAGIC,
  );
  assert.equal(isRescueArchivePrefix(parts[0]), true);
  assert.equal(isRescueArchivePrefix(new Uint8Array(7)), false);
  const file = reader(parts);
  const header = await readRescueArchiveHeader(file.input);
  assert.equal(header.protection, "none");
  assert.deepEqual(file.reads, [
    [0, 12],
    [12, parts[1].length],
  ]);
  const restored = await readRescueArchive(file.input);
  assert.equal(restored.sourceText, content.sourceText);
  assert.equal(restored.currentSnapshotText, content.currentSnapshotText);
  assert.equal(restored.state.settings.name, "Новый");
  assert.equal(restored.state.accounts[0].openingBalance, 123);
  assert.equal(restored.state.transactions.length, 1);
  assert.equal(restored.state.transactions[0].date, "2026-09-11");
});

test("both rescue protections round-trip an edited expanded snapshot rather than replacing it with its old bounded source", async () => {
  const expanded = createExpandedRecoveryFixture();
  assert.ok(expanded.sourceText.length <= MAX_BACKUP_BYTES);
  assert.ok(expanded.editedSnapshotText.length > MAX_BACKUP_BYTES);
  const content: RescueArchiveContent = {
    ...expanded,
    normalizationVersion: BACKUP_NORMALIZATION_VERSION,
    currentSnapshotText: expanded.editedSnapshotText,
  };
  for (const protection of [undefined, { password, crypto: nodeCrypto }]) {
    const parts = await writeRescueArchive(content, protection);
    const file = reader(parts);
    const restored = await readRescueArchive(file.input, protection);
    assert.equal(restored.sourceText, expanded.sourceText);
    assert.equal(restored.currentSnapshotText, expanded.editedSnapshotText);
    assert.equal(restored.state.transactions.length, 9_997);
    assert.equal(
      restored.state.transactions.some((tx) => tx.id === "a03-0"),
      false,
    );
    assert.equal(restored.state.transactions.at(-1)?.id, "a03-later");
    assert.equal(
      restored.state.transactions.at(-1)?.date,
      expanded.snapshotDate,
    );
    assert.ok(
      restored.identity.normalizedFingerprint.utf8Bytes > MAX_BACKUP_BYTES,
    );
    assert.ok(
      restored.identity.normalizedFingerprint.utf8Bytes <
        restored.identity.allowance.utf8Bytes,
    );
    assert.deepEqual(
      file.reads.map(([, length]) => length),
      parts.map((part) => part.length),
    );
  }
});

test("password rescue derives once, uses different nonce/AAD per section, and interoperates with WebCrypto", async () => {
  const content = fixture();
  let derives = 0;
  const keys: Uint8Array[] = [];
  const contexts: Uint8Array[] = [];
  const crypto: BackupCrypto = {
    ...nodeCrypto,
    async derive(...args) {
      derives++;
      assert.equal(args[2], BACKUP_ITERATIONS);
      const key = await nodeCrypto.derive(...args);
      keys.push(key);
      return key;
    },
    async seal(plain, key, nonce, context) {
      contexts.push(new Uint8Array(context));
      return nodeCrypto.seal(plain, key, nonce, context);
    },
  };
  const parts = await writeRescueArchive(content, { password, crypto });
  assert.equal(derives, 1);
  assert.notDeepEqual(parts[2].subarray(0, 12), parts[3].subarray(0, 12));
  assert.notDeepEqual(contexts[0], contexts[1]);
  assert.equal(
    keys[0].every((byte) => byte === 0),
    true,
  );
  assert.equal(
    Buffer.concat(parts).includes(Buffer.from(content.currentSnapshotText)),
    false,
  );
  const restored = await readRescueArchive(reader(parts).input, {
    password,
    crypto: backupCrypto,
  });
  assert.equal(restored.currentSnapshotText, content.currentSnapshotText);
  const browserParts = await writeRescueArchive(content, {
    password,
    crypto: backupCrypto,
  });
  assert.notEqual(
    JSON.parse(new TextDecoder().decode(parts[1])).salt,
    JSON.parse(new TextDecoder().decode(browserParts[1])).salt,
  );
  assert.equal(
    (await readRescueArchive(reader(browserParts).input, { password, crypto }))
      .currentSnapshotText,
    content.currentSnapshotText,
  );
  assert.equal(derives, 2);
  assert.equal(
    keys.every((key) => key.every((byte) => byte === 0)),
    true,
  );
});

test("header, source, current, section swapping and wrong-password tampering fail authentication", async () => {
  const content = fixture();
  content.currentSnapshotText = content.sourceText;
  const parts = await writeRescueArchive(content, {
    password,
    crypto: nodeCrypto,
  });
  const wrong = reader(parts);
  await assert.rejects(
    readRescueArchive(wrong.input, {
      password: "Неверный пароль",
      crypto: nodeCrypto,
    }),
    /Пароль неверный/,
  );
  assert.equal(wrong.reads.length, 3); // Header + source only; never current.
  for (const patch of [
    { normalizationDate: "2026-09-09" },
    { snapshotDate: "2026-09-12" },
    { salt: "00".repeat(16) },
  ]) {
    const changed = reader(patchHeader(parts, patch));
    await assert.rejects(
      readRescueArchive(changed.input, { password, crypto: nodeCrypto }),
      /Пароль неверный/,
    );
    assert.equal(changed.reads.length, 3);
  }
  for (const section of [2, 3]) {
    const changed = parts.map((part) => new Uint8Array(part));
    changed[section][changed[section].length - 1] ^= 1;
    await assert.rejects(
      readRescueArchive(reader(changed).input, {
        password,
        crypto: nodeCrypto,
      }),
      /Пароль неверный/,
    );
  }
  await assert.rejects(
    readRescueArchive(reader([parts[0], parts[1], parts[3], parts[2]]).input, {
      password,
      crypto: nodeCrypto,
    }),
    /Пароль неверный/,
  );
});

test("untrusted header lengths, KDF parameters, versions and source bounds are rejected before KDF or section reads", async () => {
  const parts = await writeRescueArchive(fixture(), {
    password,
    crypto: nodeCrypto,
  });
  let derives = 0;
  const crypto: BackupCrypto = {
    ...nodeCrypto,
    async derive() {
      derives++;
      throw new Error("unexpected KDF");
    },
  };
  const hugePrefix = new Uint8Array(parts[0]);
  new DataView(hugePrefix.buffer).setUint32(
    8,
    MAX_RESCUE_HEADER_BYTES + 1,
    false,
  );
  const huge = reader([hugePrefix, ...parts.slice(1)]);
  await assert.rejects(readRescueArchive(huge.input, { password, crypto }));
  assert.deepEqual(huge.reads, [[0, 12]]);
  for (const patch of [
    { iterations: 1 },
    { iterations: 2_147_483_647 },
    { version: 1 },
    { normalizationVersion: 999 },
    { cipher: "AES-CBC" },
    { kdf: "other" },
    { sourceBytes: MAX_RESCUE_SOURCE_BYTES + 29 },
    { sourceBytes: -1 },
    { snapshotBytes: 1.5 },
    { normalizationDate: "2026-02-30" },
    { derivedLength: 999_999_999 },
  ]) {
    const file = reader(patchHeader(parts, patch));
    await assert.rejects(readRescueArchive(file.input, { password, crypto }));
    assert.equal(file.reads.length, 2);
  }
  assert.equal(derives, 0);
});

test("current section is not read until bounded source has granted an independently computed allowance", async () => {
  const parts = await writeRescueArchive(fixture());
  const forged = patchHeader(parts, { snapshotBytes: 50_000_000 });
  const small = reader(forged);
  const currentOffset = forged[0].length + forged[1].length + forged[2].length;
  const input: RescueArchiveReader = {
    size: currentOffset + 50_000_000,
    async read(offset, length) {
      assert.ok(offset < currentOffset, "untrusted current section was read");
      return small.input.read(offset, length);
    },
  };
  await assert.rejects(readRescueArchive(input), /допуск/);
  assert.equal(small.reads.length, 3);
  const invalidSource = new TextEncoder().encode("{}");
  const invalid = patchHeader([parts[0], parts[1], invalidSource, parts[3]], {
    sourceBytes: invalidSource.length,
  });
  const invalidFile = reader(invalid);
  await assert.rejects(readRescueArchive(invalidFile.input));
  assert.equal(invalidFile.reads.length, 3);
});

test("truncation, trailing bytes, short reads and unsupported protection fail closed", async () => {
  const parts = await writeRescueArchive(fixture());
  const file = reader(parts);
  for (const delta of [-1, 1]) {
    await assert.rejects(
      readRescueArchive({ ...file.input, size: file.input.size + delta }),
    );
  }
  await assert.rejects(
    readRescueArchive({
      size: file.input.size,
      async read(offset, length) {
        return (await file.input.read(offset, length)).subarray(1);
      },
    }),
  );
  await assert.rejects(
    readRescueArchive(
      reader(patchHeader(parts, { protection: "unknown" })).input,
    ),
  );
});

test("writer rejects growth and invalid snapshots before KDF, and rejects reused random nonce", async () => {
  const content = fixture();
  let derives = 0;
  const crypto: BackupCrypto = {
    ...nodeCrypto,
    async derive() {
      derives++;
      throw new Error("unexpected KDF");
    },
  };
  await assert.rejects(
    writeRescueArchive(
      {
        ...content,
        currentSnapshotText: content.sourceText + " ".repeat(5000),
      },
      { password, crypto },
    ),
  );
  const invalid = JSON.parse(content.currentSnapshotText);
  invalid.accounts[0].id = "";
  await assert.rejects(
    writeRescueArchive(
      { ...content, currentSnapshotText: JSON.stringify(invalid) },
      { password, crypto },
    ),
  );
  await assert.rejects(
    writeRescueArchive(content, {
      password,
      crypto: { ...crypto, random: (length) => new Uint8Array(length) },
    }),
    /одноразовые/,
  );
  assert.equal(derives, 0);
});

test("rescue retains a Demo snapshot exactly while the verified restore targets a personal profile", async () => {
  const content = fixture();
  content.sourceText = JSON.stringify({
    ...JSON.parse(content.sourceText),
    demo: true,
  });
  content.currentSnapshotText = JSON.stringify({
    ...JSON.parse(content.currentSnapshotText),
    demo: true,
  });
  const restored = await readRescueArchive(
    reader(await writeRescueArchive(content)).input,
  );
  assert.equal(restored.sourceText, content.sourceText);
  assert.equal(restored.currentSnapshotText, content.currentSnapshotText);
  assert.equal(restored.state.demo, false);
  assert.equal(restored.sourceDemo, true);
});

test("writer never silently replaces a raw lone surrogate in an exact UTF-8 source", async () => {
  const content = fixture();
  const source = JSON.stringify({
    ...JSON.parse(content.sourceText),
    settings: { ...JSON.parse(content.sourceText).settings, name: "\ud800" },
  }).replace("\\ud800", "\ud800");
  await assert.rejects(
    writeRescueArchive({
      ...content,
      sourceText: source,
      currentSnapshotText: source,
    }),
    /неполный символ Unicode/,
  );
});

test("asynchronous encryption remains bound to the validated export even if the caller changes its draft", async () => {
  const content = fixture();
  const expected = content.currentSnapshotText;
  const crypto: BackupCrypto = {
    ...nodeCrypto,
    async derive(...args) {
      content.sourceText = "not the validated source";
      content.currentSnapshotText = "not the validated snapshot";
      return nodeCrypto.derive(...args);
    },
  };
  const parts = await writeRescueArchive(content, { password, crypto });
  const restored = await readRescueArchive(reader(parts).input, {
    password,
    crypto: nodeCrypto,
  });
  assert.equal(restored.currentSnapshotText, expected);
});

test("released v1 ordinary password envelopes retain their wire format and signatures", async () => {
  const state = createInitialState(false, "2026-09-10");
  const raw = await encryptBackup(state, password, nodeCrypto);
  assert.equal(JSON.parse(raw).version, 1);
  assert.equal(isRescueArchivePrefix(new TextEncoder().encode(raw)), false);
  assert.deepEqual(await decryptBackup(raw, password, nodeCrypto), state);
});

async function historicalV1(plain: Uint8Array) {
  const salt = randomBytes(16);
  const saltHex = salt.toString("hex");
  const key = await nodeCrypto.derive(password, salt, BACKUP_ITERATIONS);
  try {
    const sealed = await nodeCrypto.seal(
      plain,
      key,
      randomBytes(12),
      new TextEncoder().encode(
        `lad-password-backup/1/AES-256-GCM/PBKDF2-SHA256/600000/${saltHex}`,
      ),
    );
    return JSON.stringify({
      format: "lad-password-backup",
      version: 1,
      cipher: "AES-256-GCM",
      kdf: "PBKDF2-SHA256",
      iterations: 600000,
      salt: saltHex,
      sealed: Buffer.from(sealed).toString("hex"),
    });
  } finally {
    key.fill(0);
  }
}

test("v1 source reader preserves legacy version, demo flag and whitespace before financial normalization", async () => {
  const legacy = { ...createInitialState(true, "2026-09-10"), version: 3 };
  const text = JSON.stringify(legacy, null, 1);
  const raw = await historicalV1(new TextEncoder().encode(text));
  const keys: Uint8Array[] = [];
  const plaintexts: Uint8Array[] = [];
  const crypto: BackupCrypto = {
    ...nodeCrypto,
    async derive(...args) {
      const key = await nodeCrypto.derive(...args);
      keys.push(key);
      return key;
    },
    async open(...args) {
      const plain = await nodeCrypto.open(...args);
      plaintexts.push(plain);
      return plain;
    },
  };
  assert.equal(await decryptBackupSource(raw, password, crypto), text);
  assert.equal(JSON.parse(text).demo, true);
  assert.equal(JSON.parse(text).version, 3);
  assert.equal(
    keys.every((key) => key.every((b) => b === 0)),
    true,
  );
  assert.equal(
    plaintexts.every((plain) => plain.every((b) => b === 0)),
    true,
  );
  const withBom = await historicalV1(new TextEncoder().encode(`\uFEFF${text}`));
  assert.equal(
    await decryptBackupSource(withBom, password, nodeCrypto),
    `\uFEFF${text}`,
  );
  assert.equal((await decryptBackup(withBom, password, nodeCrypto)).demo, true);
  const malformed = await historicalV1(new Uint8Array([0xc3, 0x28]));
  await assert.rejects(
    decryptBackupSource(malformed, password, crypto),
    /прочитать/,
  );
  assert.equal(
    plaintexts.every((plain) => plain.every((b) => b === 0)),
    true,
  );
});
