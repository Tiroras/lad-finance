import type { OpenSheet } from "../../../application/navigation/types";
import { canStartOnboarding } from "../../../domain/onboarding";
import { useFinance, useFinanceStatus } from "../../../state/finance";
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
  const { switching } = useFinanceStatus();
  return (
    <>
      <Section title="Импорт и экспорт" style={{ marginBottom: 0 }} />
      <Button
        label="Импортировать банковский CSV"
        icon="document-text-outline"
        variant="secondary"
        disabled={switching}
        onPress={() => open({ type: "csv" })}
      />
      <Button
        label="Экспортировать операции в CSV"
        icon="download-outline"
        variant="secondary"
        disabled={switching}
        onPress={() => open({ type: "export" })}
      />
      <Section title="Резервные копии" style={{ marginBottom: 0 }} />
      <DataManagement close={close} />
      {canStartOnboarding(state) && (
        <Button
          label="Пошаговая настройка своего учёта"
          icon="leaf-outline"
          variant="secondary"
          disabled={switching}
          onPress={() => open({ type: "onboarding" })}
        />
      )}
    </>
  );
}
