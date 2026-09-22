import type { ReactNode } from "react";
import { Button, Card, font, Txt } from "../../../shared/ui";

export function DataConfirmation({
  title,
  children,
  confirmLabel,
  cancelLabel = "Отмена",
  busy = false,
  onConfirm,
  onCancel,
}: {
  title?: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Card style={{ gap: 15, backgroundColor: "#FAF0E4" }}>
      {title && <Txt style={{ fontFamily: font.bold }}>{title}</Txt>}
      <Txt style={{ fontSize: 12, lineHeight: 20 }}>{children}</Txt>
      <Button label={confirmLabel} disabled={busy} onPress={onConfirm} />
      <Button
        label={cancelLabel}
        variant="secondary"
        disabled={busy}
        onPress={onCancel}
      />
    </Card>
  );
}
