export interface BoundedDocument {
  name: string;
  size: number;
  read(): Promise<Uint8Array>;
}

/** File/handle size is authoritative; advertised picker metadata is not. */
export async function readBoundedDocument(
  document: BoundedDocument,
  extensions: readonly string[],
  limit: number,
) {
  if (
    !extensions.some((extension) =>
      document.name.toLowerCase().endsWith(`.${extension.toLowerCase()}`),
    )
  )
    throw new Error(`Выберите файл ${extensions.join(" или ").toUpperCase()}.`);
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    !Number.isSafeInteger(document.size) ||
    document.size < 0 ||
    document.size > limit
  )
    throw new Error(`Файл должен быть не больше ${limit / 1_000_000} МБ.`);
  const bytes = await document.read();
  if (bytes.length !== document.size)
    throw new Error(
      "Размер файла изменился или файл прочитан не полностью. Выберите его ещё раз.",
    );
  return { name: document.name, bytes };
}
