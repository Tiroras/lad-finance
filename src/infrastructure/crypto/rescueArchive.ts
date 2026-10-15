import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import {
  BACKUP_NORMALIZATION_VERSION,
  MAX_RESCUE_SOURCE_BYTES,
  prepareRestoreCandidate,
} from "../../domain/backupRecovery";
import { validDate } from "../../domain/finance";
import {
  BACKUP_ITERATIONS,
  validateBackupPassword,
  type BackupCrypto,
} from "./passwordBackup";

// Binary framing: magic[8] | headerLength[4, big endian] | UTF-8 JSON header
// | source section | current snapshot section. Lengths include GCM overhead.
// This format is intentionally distinct from the released v1 JSON envelope.
export const RESCUE_ARCHIVE_MAGIC = "LADRESC2";
export const MAX_RESCUE_HEADER_BYTES = 2_048;
const PREFIX_BYTES = 12;
const GCM_OVERHEAD = 28;
const utf8 = new TextEncoder();
const magic = utf8.encode(RESCUE_ARCHIVE_MAGIC);
const invalid = () =>
  new Error(
    "Неизвестная версия или повреждённый формат архива восстановления.",
  );
const authenticationFailed = () =>
  new Error("Пароль неверный или файл повреждён. Данные не изменены.");

export interface RescueArchiveReader {
  readonly size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
}

interface HeaderBase {
  format: "lad-rescue-archive";
  version: 2;
  normalizationVersion: typeof BACKUP_NORMALIZATION_VERSION;
  normalizationDate: string;
  snapshotDate: string;
  sourceBytes: number;
  snapshotBytes: number;
}

export type RescueArchiveHeader = HeaderBase &
  (
    | { protection: "none" }
    | {
        protection: "password";
        cipher: "AES-256-GCM";
        kdf: "PBKDF2-SHA256";
        iterations: typeof BACKUP_ITERATIONS;
        salt: string;
      }
  );

export interface RescueArchiveContent {
  sourceText: string;
  currentSnapshotText: string;
  normalizationVersion: typeof BACKUP_NORMALIZATION_VERSION;
  normalizationDate: string;
  snapshotDate: string;
}

export interface RescueArchivePassword {
  password: string;
  crypto: BackupCrypto;
}

export function isRescueArchivePrefix(bytes: Uint8Array): boolean {
  return bytes.length >= magic.length && magic.every((b, i) => bytes[i] === b);
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes,
    );
  } catch {
    throw invalid();
  }
}

async function readExact(
  reader: RescueArchiveReader,
  offset: number,
  length: number,
): Promise<Uint8Array> {
  if (
    !Number.isSafeInteger(reader.size) ||
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(length) ||
    offset < 0 ||
    length < 0 ||
    offset > reader.size ||
    length > reader.size - offset
  )
    throw invalid();
  const result = await reader.read(offset, length);
  if (!(result instanceof Uint8Array) || result.length !== length)
    throw invalid();
  return result;
}

function parseHeader(bytes: Uint8Array): RescueArchiveHeader {
  let h: Record<string, unknown>;
  try {
    h = JSON.parse(decodeUtf8(bytes));
  } catch {
    throw invalid();
  }
  if (!h || typeof h !== "object" || Array.isArray(h)) throw invalid();
  const password = h.protection === "password";
  const fields = [
    "format",
    "version",
    "protection",
    "normalizationVersion",
    "normalizationDate",
    "snapshotDate",
    "sourceBytes",
    "snapshotBytes",
    ...(password ? ["cipher", "kdf", "iterations", "salt"] : []),
  ];
  if (
    Object.keys(h).length !== fields.length ||
    fields.some((field) => !Object.hasOwn(h, field)) ||
    h.format !== "lad-rescue-archive" ||
    h.version !== 2 ||
    (h.protection !== "none" && !password) ||
    h.normalizationVersion !== BACKUP_NORMALIZATION_VERSION ||
    typeof h.normalizationDate !== "string" ||
    !validDate(h.normalizationDate) ||
    typeof h.snapshotDate !== "string" ||
    !validDate(h.snapshotDate) ||
    typeof h.sourceBytes !== "number" ||
    !Number.isSafeInteger(h.sourceBytes) ||
    h.sourceBytes <= (password ? GCM_OVERHEAD : 0) ||
    h.sourceBytes > MAX_RESCUE_SOURCE_BYTES + (password ? GCM_OVERHEAD : 0) ||
    typeof h.snapshotBytes !== "number" ||
    !Number.isSafeInteger(h.snapshotBytes) ||
    h.snapshotBytes <= (password ? GCM_OVERHEAD : 0) ||
    (password &&
      (h.cipher !== "AES-256-GCM" ||
        h.kdf !== "PBKDF2-SHA256" ||
        h.iterations !== BACKUP_ITERATIONS ||
        typeof h.salt !== "string" ||
        !/^[0-9a-f]{32}$/.test(h.salt)))
  )
    throw invalid();
  // All required fields and the exact key set have been checked above.
  return Object.freeze(h) as unknown as RescueArchiveHeader;
}

async function readFraming(reader: RescueArchiveReader) {
  const prefix = await readExact(reader, 0, PREFIX_BYTES);
  if (!isRescueArchivePrefix(prefix)) throw invalid();
  const length = new DataView(
    prefix.buffer,
    prefix.byteOffset,
    prefix.byteLength,
  ).getUint32(8, false);
  // Never allocate/read an attacker-selected unbounded header.
  if (length < 2 || length > MAX_RESCUE_HEADER_BYTES) throw invalid();
  const bytes = await readExact(reader, PREFIX_BYTES, length);
  const header = parseHeader(bytes);
  const sourceOffset = PREFIX_BYTES + length;
  const snapshotOffset = sourceOffset + header.sourceBytes;
  const expectedSize = snapshotOffset + header.snapshotBytes;
  if (!Number.isSafeInteger(expectedSize) || expectedSize !== reader.size)
    throw invalid();
  return { prefix, bytes, header, sourceOffset, snapshotOffset };
}

export async function readRescueArchiveHeader(
  reader: RescueArchiveReader,
): Promise<RescueArchiveHeader> {
  return (await readFraming(reader)).header;
}

function aad(
  prefix: Uint8Array,
  header: Uint8Array,
  section: "source" | "snapshot",
) {
  const identity = utf8.encode(`/lad-rescue-archive/2/${section}`);
  const result = new Uint8Array(
    prefix.length + header.length + identity.length,
  );
  result.set(prefix);
  result.set(header, prefix.length);
  result.set(identity, prefix.length + header.length);
  return result;
}

async function openText(
  sealed: Uint8Array,
  key: Uint8Array,
  crypto: BackupCrypto,
  context: Uint8Array,
) {
  let plain: Uint8Array;
  try {
    plain = await crypto.open(sealed, key, context);
  } catch {
    throw authenticationFailed();
  }
  try {
    if (plain.length !== sealed.length - GCM_OVERHEAD) throw invalid();
    return decodeUtf8(plain);
  } finally {
    plain.fill(0);
  }
}

function anchorOptions(header: RescueArchiveContent | RescueArchiveHeader) {
  return {
    normalizationDate: header.normalizationDate,
    normalizationVersion: header.normalizationVersion,
    targetDemo: false as const,
    transportMode: "rescue" as const,
  };
}

export async function readRescueArchive(
  reader: RescueArchiveReader,
  credentials?: RescueArchivePassword,
) {
  const password = credentials && { ...credentials };
  const { prefix, bytes, header, sourceOffset, snapshotOffset } =
    await readFraming(reader);
  let key: Uint8Array | undefined;
  try {
    if (header.protection === "password") {
      if (!password) throw new Error("Введите пароль архива восстановления.");
      validateBackupPassword(password.password, false);
      key = await password.crypto.derive(
        password.password,
        hexToBytes(header.salt),
        BACKUP_ITERATIONS,
      );
      if (key.length !== 32) throw invalid();
    }
    const sourceBytes = await readExact(
      reader,
      sourceOffset,
      header.sourceBytes,
    );
    const sourceText = key
      ? await openText(
          sourceBytes,
          key,
          password!.crypto,
          aad(prefix, bytes, "source"),
        )
      : decodeUtf8(sourceBytes);
    const anchor = prepareRestoreCandidate(sourceText, anchorOptions(header));
    const overhead = key ? GCM_OVERHEAD : 0;
    // No header number grants an allowance. Recompute it from the bounded,
    // validated source before reading or allocating the current section.
    if (header.snapshotBytes - overhead > anchor.identity.allowance.utf8Bytes)
      throw new Error(
        "Текущий снимок превышает проверенный допуск исходной копии.",
      );
    const snapshotBytes = await readExact(
      reader,
      snapshotOffset,
      header.snapshotBytes,
    );
    const currentSnapshotText = key
      ? await openText(
          snapshotBytes,
          key,
          password!.crypto,
          aad(prefix, bytes, "snapshot"),
        )
      : decodeUtf8(snapshotBytes);
    return prepareRestoreCandidate(anchor, {
      ...anchorOptions(header),
      currentSnapshotText,
      snapshotDate: header.snapshotDate,
    });
  } finally {
    key?.fill(0);
  }
}

// Count without allocating a complete UTF-8 section. Reject raw lone UTF-16
// surrogates instead of silently changing an exact source to replacement chars.
function utf8Length(text: string): number {
  let length = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code <= 0x7f) length++;
    else if (code <= 0x7ff) length += 2;
    else if (
      code >= 0xd800 &&
      code <= 0xdbff &&
      i + 1 < text.length &&
      text.charCodeAt(i + 1) >= 0xdc00 &&
      text.charCodeAt(i + 1) <= 0xdfff
    ) {
      length += 4;
      i++;
    } else if (code >= 0xd800 && code <= 0xdfff) throw invalid();
    else length += 3;
  }
  return length;
}

function randomBytes(crypto: BackupCrypto, length: number) {
  const result = crypto.random(length);
  if (!(result instanceof Uint8Array) || result.length !== length)
    throw new Error("Не удалось получить безопасные случайные байты.");
  return result;
}

export async function writeRescueArchive(
  input: RescueArchiveContent,
  credentials?: RescueArchivePassword,
): Promise<Uint8Array[]> {
  // Bind this export to the values that were validated, even if its caller
  // changes its objects while the asynchronous KDF is running.
  const content = { ...input };
  const password = credentials && { ...credentials };
  const anchor = prepareRestoreCandidate(
    content.sourceText,
    anchorOptions(content),
  );
  prepareRestoreCandidate(anchor, {
    ...anchorOptions(content),
    currentSnapshotText: content.currentSnapshotText,
    snapshotDate: content.snapshotDate,
  });
  if (password) validateBackupPassword(password.password);
  const overhead = password ? GCM_OVERHEAD : 0;
  const base: HeaderBase = {
    format: "lad-rescue-archive",
    version: 2,
    normalizationVersion: content.normalizationVersion,
    normalizationDate: content.normalizationDate,
    snapshotDate: content.snapshotDate,
    sourceBytes: utf8Length(content.sourceText) + overhead,
    snapshotBytes: utf8Length(content.currentSnapshotText) + overhead,
  };
  const salt = password ? randomBytes(password.crypto, 16) : undefined;
  const header: RescueArchiveHeader = salt
    ? {
        ...base,
        protection: "password",
        cipher: "AES-256-GCM",
        kdf: "PBKDF2-SHA256",
        iterations: BACKUP_ITERATIONS,
        salt: bytesToHex(salt),
      }
    : { ...base, protection: "none" };
  const headerBytes = utf8.encode(JSON.stringify(header));
  if (headerBytes.length > MAX_RESCUE_HEADER_BYTES) throw invalid();
  parseHeader(headerBytes);
  const prefix = new Uint8Array(PREFIX_BYTES);
  prefix.set(magic);
  new DataView(prefix.buffer).setUint32(8, headerBytes.length, false);
  if (!password || !salt)
    return [
      prefix,
      headerBytes,
      utf8.encode(content.sourceText),
      utf8.encode(content.currentSnapshotText),
    ];

  let key: Uint8Array | undefined;
  try {
    const sourceNonce = randomBytes(password.crypto, 12);
    const snapshotNonce = randomBytes(password.crypto, 12);
    if (sourceNonce.every((byte, index) => byte === snapshotNonce[index]))
      throw new Error(
        "Не удалось получить разные одноразовые значения шифрования.",
      );
    key = await password.crypto.derive(
      password.password,
      salt,
      BACKUP_ITERATIONS,
    );
    if (key.length !== 32) throw invalid();
    const parts: Uint8Array[] = [prefix, headerBytes];
    for (const [section, text, nonce, expected] of [
      ["source", content.sourceText, sourceNonce, header.sourceBytes],
      [
        "snapshot",
        content.currentSnapshotText,
        snapshotNonce,
        header.snapshotBytes,
      ],
    ] as const) {
      const plain = utf8.encode(text);
      try {
        const sealed = await password.crypto.seal(
          plain,
          key,
          nonce,
          aad(prefix, headerBytes, section),
        );
        if (sealed.length !== expected) throw invalid();
        parts.push(sealed);
      } finally {
        plain.fill(0);
      }
    }
    return parts;
  } finally {
    key?.fill(0);
  }
}
