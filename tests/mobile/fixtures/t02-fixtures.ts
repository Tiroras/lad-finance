import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createExpandedRecoveryFixture } from "../../a03Fixtures";
import { prepareRestoreCandidate } from "../../../src/domain/backupRecovery";
import { accountBalances } from "../../../src/domain/accountBalances";
import { backupCrypto } from "../../../src/infrastructure/crypto/backupCrypto";
import {
  isRescueArchivePrefix,
  readRescueArchive,
  readRescueArchiveHeader,
  writeRescueArchive,
} from "../../../src/infrastructure/crypto/rescueArchive";

// Public synthetic credential. This fixture never contains a device key or user data.
const password = "T02-synthetic-2026";
const expanded = createExpandedRecoveryFixture();
const anchor = JSON.parse(expanded.sourceText);
anchor.settings = {
  ...anchor.settings,
  name: "T02 Large Synthetic",
  onboardingCompleted: true,
  exchange: { automatic: false, rates: {} },
};
// Reserve room for explicit offline settings while keeping the source <5M UTF-16.
anchor.transactions[0].note = anchor.transactions[0].note.slice(256);
const sourceText = JSON.stringify(anchor).replace(/:100000(?=[,}])/g, ":1e5");
const edited = JSON.parse(expanded.editedSnapshotText);
edited.settings = anchor.settings;
const content = {
  sourceText,
  currentSnapshotText: JSON.stringify(edited),
  normalizationDate: expanded.normalizationDate,
  normalizationVersion: 1 as const,
  snapshotDate: expanded.snapshotDate,
};
const candidate = prepareRestoreCandidate(content.sourceText, {
  ...content,
  targetDemo: false,
  transportMode: "rescue",
});
assert.ok(content.sourceText.length < 5_000_000);
assert.ok(content.currentSnapshotText.length > 5_000_000);
assert.equal(candidate.state.transactions.length, 9_997);
assert.equal(candidate.state.transactions.at(-1)?.id, "a03-later");
const sha = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");

async function main() {
  if (process.argv[2] === "verify") {
    assert.ok(process.argv[3], "Pass the actual exported v2 archive path");
    const expectedProtection = process.argv[4];
    assert.ok(
      expectedProtection === "password" || expectedProtection === "none",
      "Pass explicit expected protection: verify <file> password|none",
    );
    const bytes = new Uint8Array(await readFile(resolve(process.argv[3])));
    assert.equal(isRescueArchivePrefix(bytes), true);
    const reader = {
      size: bytes.length,
      async read(offset: number, length: number) {
        return bytes.slice(offset, offset + length);
      },
    };
    const header = await readRescueArchiveHeader(reader);
    assert.equal(header.protection, expectedProtection);
    const actual = await readRescueArchive(reader, {
      password,
      crypto: backupCrypto,
    });
    assert.equal(actual.sourceText, content.sourceText);
    assert.deepEqual(actual.state, candidate.state);
    assert.deepEqual(
      JSON.parse(actual.currentSnapshotText),
      JSON.parse(content.currentSnapshotText),
    );
    console.log(
      JSON.stringify({
        result: "passed-full-state-and-anchor",
        protection: header.protection,
        bytes: bytes.length,
        fileSha256: sha(bytes),
        canonicalStateSha256: sha(JSON.stringify(actual.state)),
        transactions: actual.state.transactions.length,
        laterOperationId: actual.state.transactions.at(-1)?.id,
        balances: [...accountBalances(actual.state, content.snapshotDate)],
      }),
    );
    return;
  }
  const directory = resolve(
    process.argv[2] ?? "test-artifacts/t02-native/fixtures",
  );
  await mkdir(directory, { recursive: true });
  const plain = Buffer.concat(await writeRescueArchive(content));
  const encrypted = Buffer.concat(
    await writeRescueArchive(content, { password, crypto: backupCrypto }),
  );
  await writeFile(resolve(directory, "t02-large.ladrescue"), plain);
  await writeFile(resolve(directory, "t02-large.ladbackup"), encrypted);
  await writeFile(
    resolve(directory, "expected-current.json"),
    content.currentSnapshotText,
  );
  const manifest = {
    synthetic: true,
    mode: "default",
    normalizationDate: content.normalizationDate,
    snapshotDate: content.snapshotDate,
    sourceUtf16: content.sourceText.length,
    sourceUtf8: Buffer.byteLength(content.sourceText),
    snapshotUtf16: content.currentSnapshotText.length,
    snapshotUtf8: Buffer.byteLength(content.currentSnapshotText),
    allowance: candidate.identity.allowance,
    transactions: candidate.state.transactions.length,
    sourceSha256: sha(content.sourceText),
    canonicalStateSha256: sha(JSON.stringify(candidate.state)),
    plainBytes: plain.length,
    plainSha256: sha(plain),
    encryptedBytes: encrypted.length,
    encryptedSha256: sha(encrypted),
  };
  await writeFile(
    resolve(directory, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  console.log(JSON.stringify(manifest, null, 2));
}
void main();
