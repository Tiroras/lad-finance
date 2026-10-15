import { useEffect, useState } from "react";
import { View } from "react-native";
import { useFinanceStatus } from "../../../state/finance";
import { Button, Notice, Section, Txt } from "../../../shared/ui";
import {
  ImportResultView,
  importFormatLabel,
  importModeLabel,
} from "./ImportResultView";

export function ImportResults({ id }: { id?: string }) {
  const { importResults } = useFinanceStatus();
  const [selectedId, setSelectedId] = useState(id);
  useEffect(() => setSelectedId(id), [id]);
  const selected = importResults.find((result) => result.id === selectedId);
  return (
    <View style={{ gap: 18 }}>
      <Section title="Результаты этого запуска" />
      <Notice>
        Здесь сохраняются сводки до закрытия приложения. Открытие результата не
        повторяет импорт. Остатки в сводке относятся к моменту этой операции.
      </Notice>
      {selected ? (
        <>
          <Button
            label="Все результаты импорта"
            variant="secondary"
            onPress={() => setSelectedId(undefined)}
          />
          <ImportResultView key={selected.id} result={selected} />
        </>
      ) : (
        <>
          {!importResults.length && (
            <Txt>В этом запуске импорт ещё не выполнялся.</Txt>
          )}
          {[...importResults].reverse().map((result) => (
            <Button
              key={result.id}
              label={`${result.profileName} · ${importModeLabel(result.mode)} · ${importFormatLabel(result.format)} · ${new Date(result.requestedAt).toLocaleString("ru-RU")}`}
              accessibilityLabel={`Открыть результат импорта: ${result.profileName}, ${importModeLabel(result.mode)}, ${new Date(result.requestedAt).toLocaleString("ru-RU")}`}
              variant="secondary"
              onPress={() => setSelectedId(result.id)}
            />
          ))}
        </>
      )}
    </View>
  );
}
