import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

export interface ContentFingerprint {
  readonly sha256: string;
  readonly utf16Units: number;
  readonly utf8Bytes: number;
}

const utf8 = new TextEncoder();
const CHUNK_UNITS = 8192;

/** No complete JSON buffer is created: scalars use standard JSON spelling. */
export function visitJsonChunks(
  value: unknown,
  consume: (chunk: string) => void,
) {
  const visit = (item: unknown): void => {
    if (
      item === null ||
      typeof item === "string" ||
      typeof item === "boolean"
    ) {
      consume(JSON.stringify(item));
    } else if (typeof item === "number" && Number.isFinite(item)) {
      consume(JSON.stringify(item));
    } else if (Array.isArray(item)) {
      consume("[");
      item.forEach((child, index) => {
        if (index) consume(",");
        visit(child);
      });
      consume("]");
    } else if (
      typeof item === "object" &&
      item &&
      Object.getPrototypeOf(item) === Object.prototype
    ) {
      consume("{");
      let first = true;
      for (const key of Object.keys(item)) {
        const child = (item as Record<string, unknown>)[key];
        if (child === undefined) continue;
        if (!first) consume(",");
        first = false;
        consume(JSON.stringify(key));
        consume(":");
        visit(child);
      }
      consume("}");
    } else {
      throw new Error("В копии есть неподдерживаемое значение JSON.");
    }
  };
  visit(value);
}

export function measureJson(value: unknown): ContentFingerprint {
  const hash = sha256.create();
  let utf16Units = 0;
  let utf8Bytes = 0;
  visitUtf8Chunks(value, (bytes, units) => {
    utf16Units += units;
    utf8Bytes += bytes.length;
    hash.update(bytes);
  });
  return Object.freeze({
    sha256: bytesToHex(hash.digest()),
    utf16Units,
    utf8Bytes,
  });
}

/** Bound temporary encoding buffers instead of allocating one per JSON token. */
function visitUtf8Chunks(
  value: unknown,
  consume: (bytes: Uint8Array, units: number) => void,
) {
  let pending = "";
  const flush = () => {
    if (!pending) return;
    consume(utf8.encode(pending), pending.length);
    pending = "";
  };
  visitJsonChunks(value, (chunk) => {
    if (pending.length + chunk.length > CHUNK_UNITS) flush();
    // Validated financial scalar strings are bounded by their schema. Chunk
    // boundaries never split scalar spelling or UTF-16 surrogate pairs.
    if (chunk.length >= CHUNK_UNITS) consume(utf8.encode(chunk), chunk.length);
    else pending += chunk;
  });
  flush();
}

export function fingerprintText(text: string): ContentFingerprint {
  const bytes = utf8.encode(text);
  return Object.freeze({
    sha256: bytesToHex(sha256(bytes)),
    utf16Units: text.length,
    utf8Bytes: bytes.length,
  });
}

export function sameFingerprint(a: ContentFingerprint, b: ContentFingerprint) {
  return (
    a.sha256 === b.sha256 &&
    a.utf16Units === b.utf16Units &&
    a.utf8Bytes === b.utf8Bytes
  );
}

/** Second pass: the measured capacity and fingerprint are checked before use. */
export function writeMeasuredJson(
  value: unknown,
  expected: ContentFingerprint,
): Uint8Array {
  const output = new Uint8Array(expected.utf8Bytes);
  const hash = sha256.create();
  let utf16Units = 0;
  let offset = 0;
  visitUtf8Chunks(value, (bytes, units) => {
    utf16Units += units;
    if (
      utf16Units > expected.utf16Units ||
      offset + bytes.length > output.length
    )
      throw new Error(
        "Измеренный размер копии изменился. Повторите проверку файла.",
      );
    output.set(bytes, offset);
    offset += bytes.length;
    hash.update(bytes);
  });
  if (
    !sameFingerprint(expected, {
      sha256: bytesToHex(hash.digest()),
      utf16Units,
      utf8Bytes: offset,
    })
  )
    throw new Error("Содержимое копии изменилось после проверки.");
  return output;
}
