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
  const { switching, financeWriteBlocked } = useFinanceStatus();
  const blocked = switching || financeWriteBlocked;
  return (
    <>
      <Section title="Импорт и экспорт" style={{ marginBottom: 0 }} />
      <Button
        tourId="data.csv"
        label="Импортировать банковский CSV"
        icon="document-text-outline"
        variant="secondary"
        disabled={blocked}
        onPress={() => open({ type: "csv" })}
      />
      <Button
        label="Экспортировать операции в CSV"
        icon="download-outline"
        variant="secondary"
        disabled={blocked}
        onPress={() => open({ type: "export" })}
      />
      <Button
        label="Результаты импорта"
        variant="secondary"
        onPress={() => open({ type: "importResult" })}
      />
      <Section title="Резервные копии" style={{ marginBottom: 0 }} />
      <DataManagement close={close} />
      {canStartOnboarding(state) && (
        <Button
          label="Пошаговая настройка своего учёта"
          icon="leaf-outline"
          variant="secondary"
          disabled={blocked}
          onPress={() => open({ type: "onboarding" })}
        />
      )}
    </>
  );
}
