import type { OpenSheet } from "../../../application/navigation/types";
import { useFinance } from "../../../state/finance";
import { Button, Section } from "../../../shared/ui";
import { DataManagement } from "./DataManagement";

export function DataSettings({
  open,
  close,
}: {
  open: OpenSheet;
  close: () => void;
}) {
  const { state } = useFinance();
  return (
    <>
      <Section title="Импорт и экспорт" style={{ marginBottom: 0 }} />
      <Button
        label="Импортировать банковский CSV"
        icon="document-text-outline"
        variant="secondary"
        onPress={() => open({ type: "csv" })}
      />
      <Button
        label="Экспортировать операции в CSV"
        icon="download-outline"
        variant="secondary"
        onPress={() => open({ type: "export" })}
      />
      <Section title="Резервные копии" style={{ marginBottom: 0 }} />
      <DataManagement close={close} />
      {state.demo && (
        <Button
          label="Пошаговая настройка своего учёта"
          icon="leaf-outline"
          variant="secondary"
          onPress={() => open({ type: "onboarding" })}
        />
      )}
    </>
  );
}
