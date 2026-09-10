import { C, Txt } from "../ui";

export function ErrorText({ error }: { error: string }) {
  return error ? (
    <Txt
      accessibilityRole="alert"
      style={{ fontSize: 12, lineHeight: 20, color: C.red }}
    >
      {error}
    </Txt>
  ) : null;
}
