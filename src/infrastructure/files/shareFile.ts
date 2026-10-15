export async function shareFile(
  content: string | readonly Uint8Array[],
  name: string,
  mimeType: string,
) {
  const parts =
    typeof content === "string"
      ? [content]
      : content.map((part) => new Uint8Array(part));
  const url = URL.createObjectURL(new Blob(parts, { type: mimeType }));
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
