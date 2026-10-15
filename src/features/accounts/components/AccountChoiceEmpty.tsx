import type { OpenSheet } from "../../../application/navigation/types";
import { Button, Notice } from "../../../shared/ui";

export function AccountChoiceEmpty({ open }: { open: OpenSheet }) {
  return (
    <>
      <Notice>
        Для этой записи нужен активный счёт. Создайте новый или восстановите
        подходящий счёт из архива. История архивных счетов сохранена.
      </Notice>
      <Button
        label="Создать или восстановить счёт"
        variant="secondary"
        onPress={() => open({ type: "accounts" })}
      />
    </>
  );
}
