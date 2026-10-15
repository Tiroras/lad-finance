import { View } from "react-native";
import { dateLabel } from "../../../domain/finance";
import {
  csvReceiptTotals,
  type CsvExportReceipt,
} from "../../../infrastructure/storage/csvExportReceipts";
import { Button, Card, Notice, Txt } from "../../../shared/ui";
import { font } from "../../../shared/ui/theme";
import type { PreparedCsvBatch } from "../lib/csvExportBatch";

const instantLabel = (value: string) => new Date(value).toLocaleString("ru-RU");
export function CsvExportResult({
  batch,
  receipt,
  busy,
  share,
  confirm,
  verify,
}: {
  batch?: PreparedCsvBatch;
  receipt: CsvExportReceipt;
  busy: boolean;
  share(part: number): void;
  confirm(part: number, saved: boolean): void;
  verify(part: number): void;
}) {
  const totals = csvReceiptTotals(receipt);
  const available = batch?.id === receipt.batchId;
  return (
    <View style={{ gap: 14 }}>
      <Txt style={{ fontSize: 17, fontFamily: font.bold }}>
        Подготовленный CSV-набор
      </Txt>
      {available ? (
        <Txt>
          Профиль «{batch.profileName}» · {batch.accountName} ·{" "}
          {batch.options.format === "universal" ? "универсальный CSV" : "YNAB"}.
          {"\n"}Операций: {batch.totals.transactionCount} · строк:{" "}
          {batch.totals.rowCount} · файлов: {batch.totals.partCount} · байт:{" "}
          {batch.totals.byteLength}.{"\n"}Период:{" "}
          {batch.totals.period.from ? dateLabel(batch.totals.period.from) : "—"}{" "}
          —{" "}
          {batch.totals.period.through
            ? dateLabel(batch.totals.period.through)
            : "—"}
          .
        </Txt>
      ) : (
        <Notice>
          Это отметки предыдущего набора. Файлы не хранятся в приложении. Для
          новой передачи подготовьте новый набор; сохранённые файлы можно
          проверить ниже.
        </Notice>
      )}
      <Txt testID="csv-export-confirmation-count">
        Подтверждено вами: {totals.userConfirmed} из {totals.total}. Проверено
        чтением: {totals.readVerified} из {totals.total}.
      </Txt>
      <Notice>
        Сохраните каждую часть отдельно. Повтор передачи использует тот же файл.
        Возврат из системного меню и скачивание браузером не подтверждают, что
        файл сохранён в нужном месте.
      </Notice>
      {receipt.parts.map((part) => (
        <Card key={part.part} style={{ gap: 12 }}>
          <Txt style={{ fontFamily: font.bold }}>
            Часть {part.part} из {totals.total}
          </Txt>
          <Txt>{part.fileName}</Txt>
          {available && (
            <Txt>
              {batch.parts[part.part - 1].transactionCount} операций ·{" "}
              {batch.parts[part.part - 1].rowCount} строк · {part.byteLength}{" "}
              байт
            </Txt>
          )}
          <Txt>Подготовлено: {instantLabel(part.preparedAt)}.</Txt>
          {part.transfer && (
            <Txt>
              {part.transfer.status === "failed"
                ? "Передача завершилась ошибкой"
                : "Передача запрошена; сохранение неизвестно"}
              : {instantLabel(part.transfer.at)}.
            </Txt>
          )}
          <Txt>
            {part.userConfirmedAt
              ? `Сохранение подтверждено вами: ${instantLabel(part.userConfirmedAt)}.`
              : part.notConfirmedAt
                ? `Вы ещё не подтвердили сохранение: ${instantLabel(part.notConfirmedAt)}.`
                : "Сохранение этой части не подтверждено вами."}
          </Txt>
          <Txt>
            {part.readVerifiedAt
              ? `Точный файл проверен чтением: ${instantLabel(part.readVerifiedAt)}.`
              : "Чтение этой части ещё не проверено."}
          </Txt>
          <Button
            label={
              part.transfer
                ? `Повторить передачу части ${part.part}`
                : `Сохранить часть ${part.part}`
            }
            variant="secondary"
            disabled={busy || !available}
            onPress={() => share(part.part)}
          />
          {!part.userConfirmedAt && (
            <>
              <Button
                label={`Я сохранил часть ${part.part}`}
                variant="secondary"
                disabled={busy}
                onPress={() => confirm(part.part, true)}
              />
              <Button
                label={`Часть ${part.part}: ещё нет`}
                variant="secondary"
                disabled={busy}
                onPress={() => confirm(part.part, false)}
              />
            </>
          )}
          <Button
            label={`Проверить файл части ${part.part}`}
            variant="secondary"
            disabled={busy}
            onPress={() => verify(part.part)}
          />
        </Card>
      ))}
    </View>
  );
}
