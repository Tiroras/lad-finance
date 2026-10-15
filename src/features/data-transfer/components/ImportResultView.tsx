import { useState } from "react";
import { View } from "react-native";
import { useFinanceStatus, type ImportResult } from "../../../state/finance";
import { Button, ErrorText, Notice, Txt } from "../../../shared/ui";
import { DataConfirmation } from "./DataConfirmation";
import { ImportSnapshotSummary } from "./ImportSnapshotSummary";

export const importFormatLabel = (format: ImportResult["format"]) => {
  switch (format) {
    case "csv":
      return "CSV";
    case "json":
      return "JSON";
    case "password-v1":
      return "Копия с паролем";
    case "rescue-v2":
      return "Большой архив без пароля";
    case "password-v2":
      return "Большой архив с паролем";
    default:
      return "Резервная копия";
  }
};
export const importModeLabel = (mode: ImportResult["mode"]) =>
  mode === "add"
    ? "Добавление операций"
    : mode === "replace"
      ? "Замена учёта"
      : "Новый профиль";

export function ImportResultView({ result }: { result: ImportResult }) {
  const {
    pendingImportId,
    busyImportId,
    retryImportSave,
    openDeviceSnapshotAfterImport,
  } = useFinanceStatus();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState("");
  const busy = busyImportId === result.id;
  const pending = pendingImportId === result.id;
  const run = async (task: () => Promise<unknown>) => {
    setError("");
    try {
      await task();
      setConfirmOpen(false);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Не удалось проверить сохранённые данные. Повторите попытку.",
      );
    }
  };
  const message = busy
    ? result.status === "recovery-unconfirmed"
      ? "Проверяем запись копии…"
      : "Сохраняем изменения…"
    : result.status === "confirmed"
      ? "Импорт сохранён и проверен чтением."
      : result.status === "recovery-unconfirmed"
        ? "Запись копии не подтверждена. Учёт в памяти ещё не заменён; состояние записи на устройстве пока неизвестно."
        : result.status === "device-snapshot-opened"
          ? "Открыт сохранённый снимок устройства."
          : "Изменения применены в памяти, запись на устройстве не подтверждена.";
  return (
    <View style={{ gap: 16 }}>
      <Txt>Профиль: {result.profileName}</Txt>
      <Txt>
        {importFormatLabel(result.format)} · {importModeLabel(result.mode)}
      </Txt>
      <Notice tone={pending && !busy ? "warning" : undefined}>
        <Txt
          testID="import-result-status"
          accessibilityRole={pending && !busy ? "alert" : undefined}
        >
          {message}
        </Txt>
      </Notice>
      <Txt>Начато: {new Date(result.requestedAt).toLocaleString("ru-RU")}</Txt>
      {result.status === "confirmed" && (
        <Txt>
          Запись проверена:{" "}
          {new Date(result.confirmedAt).toLocaleString("ru-RU")}
        </Txt>
      )}
      {result.summary.csv && (
        <View style={{ gap: 8 }} testID="import-row-summary">
          <Txt>Строк данных в файле: {result.summary.csv.sourceRows}</Txt>
          <Txt>Добавлено операций: {result.summary.csv.added}</Txt>
          <Txt>
            Пропущено: ошибок — {result.summary.csv.skipped.invalid}, повторов —{" "}
            {result.summary.csv.skipped.duplicate}, исключено вами —{" "}
            {result.summary.csv.skipped.excluded}.
          </Txt>
          <Notice>
            Этот результат относится к одному файлу. Уже принятые части CSV
            сохраняются при отмене или ошибке следующей части.
          </Notice>
        </View>
      )}
      {pending && (
        <>
          <Notice>
            Пока запись не подтверждена, другие изменения учёта и смена профиля
            приостановлены. Можно закрыть окно и вернуться к этому результату.
            Повтор сохранения использует ту же копию; операции заново не
            добавляются.
          </Notice>
          <Button
            label="Повторить сохранение импорта"
            disabled={!!busyImportId}
            onPress={() => void run(() => retryImportSave(result.id))}
          />
          <Button
            label="Открыть сохранённый снимок устройства"
            variant="secondary"
            disabled={!!busyImportId}
            onPress={() => setConfirmOpen(true)}
          />
          {confirmOpen && (
            <DataConfirmation
              title="Открыть сохранённый снимок устройства?"
              confirmLabel="Да, открыть сохранённый снимок"
              busy={!!busyImportId}
              onCancel={() => setConfirmOpen(false)}
              onConfirm={() =>
                void run(() => openDeviceSnapshotAfterImport(result.id))
              }
            >
              Учёт в памяти будет заменён тем снимком, который удастся прочитать
              на устройстве. Он может отличаться от импортированной копии. Этот
              шаг не записывает и не удаляет финансовые данные на устройстве.
            </DataConfirmation>
          )}
        </>
      )}
      <ErrorText error={error || (!busy ? (result.error ?? "") : "")} />
      {result.status === "device-snapshot-opened" && (
        <ImportSnapshotSummary
          title="Открытый снимок устройства"
          snapshot={result.openedSnapshot.summary}
        />
      )}
      {result.summary.beforeStatus === "new-profile" ? (
        <Txt>Создан отдельный профиль; прежние профили сохранены.</Txt>
      ) : result.summary.before ? (
        <ImportSnapshotSummary
          title="До применения"
          snapshot={result.summary.before}
          balances={false}
        />
      ) : (
        <Txt>Прежний состав профиля недоступен для сравнения.</Txt>
      )}
      <ImportSnapshotSummary
        title={
          result.status === "recovery-unconfirmed"
            ? "Состав выбранной копии"
            : result.status === "device-snapshot-opened"
              ? "Сводка первоначальной попытки импорта"
              : "Сводка импорта"
        }
        snapshot={result.summary.after}
      />
    </View>
  );
}
