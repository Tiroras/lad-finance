import { useState } from "react";
import { C, Txt, Row, Card, Button } from "../ui";

export function DeleteButton({
  onDelete,
  label = "Удалить запись",
  explanation = "Это действие изменит ваш баланс и расчёты.",
}: {
  onDelete: () => void;
  label?: string;
  explanation?: string;
}) {
  const [confirm, setConfirm] = useState(false);
  return confirm ? (
    <Card style={{ gap: 14, backgroundColor: "#FBF0EA" }}>
      <Txt style={{ fontSize: 12, color: C.red, lineHeight: 20 }}>
        {explanation}
      </Txt>
      <Row>
        <Button
          label="Отмена"
          variant="secondary"
          onPress={() => setConfirm(false)}
          style={{ flex: 1 }}
        />
        <Button
          label="Да, удалить"
          variant="danger"
          onPress={onDelete}
          style={{ flex: 1 }}
        />
      </Row>
    </Card>
  ) : (
    <Button
      label={label}
      variant="danger"
      icon="trash-outline"
      onPress={() => setConfirm(true)}
    />
  );
}
