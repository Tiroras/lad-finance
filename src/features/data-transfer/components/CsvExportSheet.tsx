import { useState } from "react";
import { View } from "react-native";
import type { CsvExportOptions } from "../../../domain/csvExport";
import { AccountPicker } from "../../accounts";
import {
  ErrorText,
  Button,
  Chip,
  Notice,
  Row,
  Segments,
  Txt,
  DateField,
} from "../../../shared/ui";
import { useFinance } from "../../../state/finance";
import { useCsvExport } from "../model/useCsvExport";
import { CsvExportResult } from "./CsvExportResult";

export function CsvExportSheet() {
  const { state, today } = useFinance();
  const [format, setFormat] = useState<CsvExportOptions["format"]>("universal");
  const [accountId, setAccount] = useState<string>();
  const [from, setFrom] = useState("");
  const [through, setThrough] = useState(today);
  const exporting = useCsvExport({ format, accountId, from, through });
  const { busy, preview } = exporting;
  return (
    <View style={{ gap: 18 }}>
      <Notice>
        CSV содержит исходные суммы и коды валют без пароля. Категории, счета и
        заметки доступны в универсальном формате; бюджеты, цели и сценарии
        сохраняются в полной резервной копии.
      </Notice>
      <Segments
        value={format}
        onChange={(value) => {
          if (!exporting.invalidate()) return;
          setFormat(value);
          if (value === "ynab" && !accountId) setAccount(state.accounts[0].id);
        }}
        options={[
          { value: "universal", label: "Универсальный" },
          { value: "ynab", label: "Для YNAB" },
        ]}
      />
      <Row style={{ flexWrap: "wrap" }}>
        {format === "universal" && (
          <Chip
            label="Все счета"
            active={!accountId}
            onPress={() => {
              if (exporting.invalidate()) setAccount(undefined);
            }}
          />
        )}
        <Chip
          label="Выбрать счёт"
          active={!!accountId}
          onPress={() => {
            if (exporting.invalidate())
              setAccount(accountId ?? state.accounts[0].id);
          }}
        />
      </Row>
      {accountId && (
        <AccountPicker
          allowArchived
          selected={accountId}
          onChange={(value) => {
            if (exporting.invalidate()) setAccount(value);
          }}
        />
      )}
      <DateField
        label="С даты"
        accessibilityLabel="Начало экспорта"
        value={from}
        onChangeText={(value) => {
          if (exporting.invalidate()) setFrom(value);
        }}
        placeholder="Вся история"
        allowClear
      />
      <DateField
        label="По дату включительно"
        accessibilityLabel="Конец экспорта"
        value={through}
        onChangeText={(value) => {
          if (exporting.invalidate()) setThrough(value);
        }}
        placeholder="Без ограничения"
        allowClear
      />
      <Notice>
        {format === "ynab"
          ? "Формат Date, Payee, Memo, Outflow, Inflow в валюте выбранного счёта. Выберите такую же валюту в приложении получателя. Категория записывается в заметку; назначьте категории и свяжите переводы после импорта в YNAB."
          : "Один перевод — одна строка с двумя счетами, суммами и валютами (FromAmount, FromCurrency, ToAmount, ToCurrency). При выборе счёта знак суммы показывает движение относительно него. При экспорте всех счетов сумма перевода отрицательная со стороны отправителя; тип transfer отличает его от расхода."}
      </Notice>
      <Notice>
        Разделённая покупка и её возвраты выгружаются строками частей без
        повторной строки полной суммы. GroupID связывает части в универсальном
        CSV, RefundOf указывает покупку. В YNAB связь описана в заметке;
        проверьте категории после импорта. Полные связи сохраняет резервная
        копия Лада.
      </Notice>
      <Txt>
        При импорте в другое приложение сопоставьте столбцы. Подкатегории
        записаны как «Категория / Подкатегория»; даты — ГГГГ-ММ-ДД.
      </Txt>
      {preview && (
        <Txt testID="csv-export-count">
          Будет экспортировано операций: {preview.totals.transactionCount} ·
          строк: {preview.totals.rowCount} · файлов: {preview.totals.partCount}
        </Txt>
      )}
      <ErrorText error={exporting.error} />
      {!!exporting.message && <Notice>{exporting.message}</Notice>}
      <Button
        label={
          busy
            ? "Подготовка CSV…"
            : exporting.batch
              ? "Подготовить новый набор"
              : "Сохранить CSV"
        }
        disabled={busy || !preview || preview.totals.rowCount === 0}
        icon="download-outline"
        onPress={exporting.prepare}
      />
      {exporting.receipt && (
        <CsvExportResult
          batch={exporting.batch}
          receipt={exporting.receipt}
          busy={busy}
          share={exporting.share}
          confirm={exporting.confirm}
          verify={exporting.verify}
        />
      )}
    </View>
  );
}
