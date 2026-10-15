import { z } from "zod";
import {
  assertBackupSize,
  MAX_BACKUP_BYTES,
  validateBackupValue,
} from "./backup";
import { validDate } from "./finance";
import type { FinanceState } from "./types";
import {
  fingerprintText,
  measureJson,
  sameFingerprint,
  writeMeasuredJson,
  type ContentFingerprint,
} from "./backupMeasurement";

export {
  fingerprintText,
  sameFingerprint,
  type ContentFingerprint,
} from "./backupMeasurement";
export const BACKUP_NORMALIZATION_VERSION = 1;
export const MAX_RESCUE_SOURCE_UTF16 = 5_000_000;
export const MAX_RESCUE_SOURCE_BYTES = 15_000_000;

export interface RestoreCandidateIdentity {
  readonly normalizationVersion: 1;
  readonly normalizationDate: string;
  readonly snapshotDate: string;
  readonly targetDemo: false;
  readonly sourceDemo: boolean;
  readonly mode: "standard" | "rescue";
  readonly sourceFingerprint: ContentFingerprint;
  readonly normalizedFingerprint: ContentFingerprint;
  /** The immutable, normalized anchor budget, never an externally supplied size. */
  readonly allowance: ContentFingerprint;
}

declare const verifiedRestore: unique symbol;
export interface VerifiedRestoreCandidate {
  readonly [verifiedRestore]: true;
  readonly identity: RestoreCandidateIdentity;
  readonly state: FinanceState;
  readonly sourceDemo: boolean;
  readonly requiresRescue: boolean;
  readonly sourceText: string;
  readonly currentSnapshotText: string;
}

export interface PrepareRestoreOptions {
  normalizationDate: string;
  normalizationVersion: 1;
  targetDemo: false;
  transportMode: "standard" | "rescue";
  currentSnapshotText?: string;
  snapshotDate?: string;
}

interface Anchor {
  text: string;
  state: FinanceState;
  sourceDemo: boolean;
  date: string;
  source: ContentFingerprint;
  allowance: ContentFingerprint;
}
const anchors = new WeakMap<object, Anchor>();
const fingerprintSchema = z
  .object({
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    utf16Units: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    utf8Bytes: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  })
  .strict();
const identitySchema = z
  .object({
    normalizationVersion: z.literal(1),
    normalizationDate: z.string().refine(validDate),
    snapshotDate: z.string().refine(validDate),
    targetDemo: z.literal(false),
    sourceDemo: z.boolean(),
    mode: z.enum(["standard", "rescue"]),
    sourceFingerprint: fingerprintSchema,
    normalizedFingerprint: fingerprintSchema,
    allowance: fingerprintSchema,
  })
  .strict();

function freezeJson<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeJson(child);
    Object.freeze(value);
  }
  return value;
}
export function parseRestoreCandidateIdentity(
  value: unknown,
): RestoreCandidateIdentity {
  return freezeJson(identitySchema.parse(value));
}
export function sameRestoreIdentity(
  a: RestoreCandidateIdentity,
  b: RestoreCandidateIdentity,
) {
  return (
    a.normalizationVersion === b.normalizationVersion &&
    a.normalizationDate === b.normalizationDate &&
    a.snapshotDate === b.snapshotDate &&
    a.targetDemo === b.targetDemo &&
    a.sourceDemo === b.sourceDemo &&
    a.mode === b.mode &&
    sameFingerprint(a.sourceFingerprint, b.sourceFingerprint) &&
    sameFingerprint(a.normalizedFingerprint, b.normalizedFingerprint) &&
    sameFingerprint(a.allowance, b.allowance)
  );
}
export function assertVerifiedRestoreCandidate(
  value: unknown,
): asserts value is VerifiedRestoreCandidate {
  if (!value || typeof value !== "object" || !anchors.has(value))
    throw new Error("Повторно выберите и проверьте исходный файл копии.");
}
/** Application-time financial check; never re-derive the fixed anchor allowance. */
export function assertRestoreCandidateApplicable(
  candidate: VerifiedRestoreCandidate,
  today: string,
): void {
  assertVerifiedRestoreCandidate(candidate);
  validateBackupValue(candidate.state, today);
}
export const fingerprintFinanceState = (state: FinanceState) =>
  measureJson(state);

function parseSource(text: string, date: string): FinanceState {
  // Literal unpaired surrogates cannot be represented losslessly in UTF-8.
  // Escaped JSON spelling ("\\ud800") remains supported and preserves the value.
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = text.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff))
        throw new Error("Исходник содержит неполный символ Unicode.");
    } else if (unit >= 0xdc00 && unit <= 0xdfff)
      throw new Error("Исходник содержит неполный символ Unicode.");
  }
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    throw new Error("Не удалось прочитать финансовый JSON копии.");
  }
  return validateBackupValue(value, date);
}
function fits(value: ContentFingerprint, allowance: ContentFingerprint) {
  return (
    value.utf16Units <= allowance.utf16Units &&
    value.utf8Bytes <= allowance.utf8Bytes
  );
}

/** Use only with the recomputed allowance returned by a readable rescue ledger. */
export function assertRecoverySnapshotSize(
  content: string,
  previousBytes: number,
  allowance?: ContentFingerprint,
) {
  if (!allowance) return assertBackupSize(content, previousBytes);
  const size = fingerprintText(content);
  if (size.utf8Bytes <= MAX_BACKUP_BYTES && size.utf16Units <= MAX_BACKUP_BYTES)
    return size.utf8Bytes;
  if (!fits(size, allowance) || size.utf8Bytes >= previousBytes)
    throw new Error(
      "Учёт превышает 5 МБ. Старый большой учёт можно только уменьшать.",
    );
  return size.utf8Bytes;
}

/** One factory; passing its verified anchor avoids a second anchor normalization. */
export function prepareRestoreCandidate(
  source: string | VerifiedRestoreCandidate,
  options: PrepareRestoreOptions,
): VerifiedRestoreCandidate {
  const { normalizationDate, normalizationVersion, targetDemo, transportMode } =
    options;
  const snapshotDate = options.snapshotDate ?? normalizationDate;
  if (
    normalizationVersion !== BACKUP_NORMALIZATION_VERSION ||
    targetDemo !== false ||
    !validDate(normalizationDate) ||
    !validDate(snapshotDate) ||
    !["standard", "rescue"].includes(transportMode)
  )
    throw new Error("Неподдерживаемые условия проверки резервной копии.");
  let anchor: Anchor;
  if (typeof source === "string") {
    if (source.length > MAX_RESCUE_SOURCE_UTF16)
      throw new Error(
        "Исходник восстановления превышает 5 000 000 символов UTF-16.",
      );
    const sourceFingerprint = fingerprintText(source);
    if (sourceFingerprint.utf8Bytes > MAX_RESCUE_SOURCE_BYTES)
      throw new Error("Исходник восстановления превышает 15 МБ UTF-8.");
    const decoded = parseSource(source, normalizationDate);
    const state = freezeJson({ ...decoded, demo: false });
    anchor = {
      text: source,
      state,
      sourceDemo: decoded.demo,
      date: normalizationDate,
      source: sourceFingerprint,
      allowance: measureJson(state),
    };
  } else {
    assertVerifiedRestoreCandidate(source);
    anchor = anchors.get(source)!;
    if (normalizationDate !== anchor.date)
      throw new Error("Дата нормализации исходника изменилась.");
  }
  const currentSnapshotText = options.currentSnapshotText ?? anchor.text;
  let state = anchor.state;
  let sourceDemo = anchor.sourceDemo;
  let normalized = anchor.allowance;
  if (options.currentSnapshotText !== undefined) {
    if (
      currentSnapshotText.length > anchor.allowance.utf16Units ||
      !fits(fingerprintText(currentSnapshotText), anchor.allowance)
    )
      throw new Error("Текущий снимок превышает проверенный размер исходника.");
    const current = parseSource(currentSnapshotText, snapshotDate);
    if (current.demo !== false && current.demo !== anchor.sourceDemo)
      throw new Error(
        "Происхождение текущего снимка не совпадает с исходником.",
      );
    sourceDemo = current.demo;
    state = freezeJson({ ...current, demo: false });
    normalized = measureJson(state);
    if (!fits(normalized, anchor.allowance))
      throw new Error(
        "Нормализованный снимок превышает проверенный размер исходника.",
      );
  }
  const requiresRescue =
    transportMode === "rescue" ||
    anchor.source.utf8Bytes > MAX_BACKUP_BYTES ||
    normalized.utf8Bytes > MAX_BACKUP_BYTES ||
    normalized.utf16Units > MAX_BACKUP_BYTES;
  const identity: RestoreCandidateIdentity = freezeJson({
    normalizationVersion,
    normalizationDate,
    snapshotDate,
    targetDemo,
    sourceDemo,
    mode: requiresRescue ? "rescue" : "standard",
    sourceFingerprint: anchor.source,
    normalizedFingerprint: normalized,
    allowance: anchor.allowance,
  });
  const candidate = Object.freeze({
    identity,
    state,
    sourceDemo,
    requiresRescue,
    sourceText: anchor.text,
    currentSnapshotText,
  }) as VerifiedRestoreCandidate;
  anchors.set(candidate, anchor);
  return candidate;
}

export function writeRestoreCandidate(
  candidate: VerifiedRestoreCandidate,
): Uint8Array {
  assertVerifiedRestoreCandidate(candidate);
  return writeMeasuredJson(
    candidate.state,
    candidate.identity.normalizedFingerprint,
  );
}
export function restoreCandidateText(
  candidate: VerifiedRestoreCandidate,
): string {
  return new TextDecoder().decode(writeRestoreCandidate(candidate));
}
