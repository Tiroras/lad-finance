import { useState } from "react";
import { View } from "react-native";
import {
  exportTransactionsCsv,
  type CsvExportOptions,
} from "../../../domain/csvExport";
import { AccountPicker } from "../../accounts";
import {
  ErrorText,
  Button,
  Chip,
  Field,
  Notice,
  Row,
  Segments,
  Txt,
} from "../../../shared/ui";
import { shareFile } from "../../../infrastructure/files/shareFile";
import { useFinance } from "../../../state/finance";

export function CsvExportSheet() {
  const { state, today, notify } = useFinance();
  const [format, setFormat] = useState<CsvExportOptions["format"]>("universal");
  const [accountId, setAccount] = useState<string>();
  const [from, setFrom] = useState("");
  const [through, setThrough] = useState(today);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  let preview: ReturnType<typeof exportTransactionsCsv> | undefined,
    validation = "";
  try {
    preview = exportTransactionsCsv(
      state,
      { format, accountId, from, through },
      today,
    );
  } catch (e) {
    validation = (e as Error).message;
  }
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
            onPress={() => setAccount(undefined)}
          />
        )}
        <Chip
          label="Выбрать счёт"
          active={!!accountId}
          onPress={() => setAccount(accountId ?? state.accounts[0].id)}
        />
      </Row>
      {accountId && (
        <AccountPicker selected={accountId} onChange={setAccount} />
      )}
      <Field
        label="С даты · пусто — вся история"
        accessibilityLabel="Начало экспорта"
        value={from}
        onChangeText={setFrom}
        placeholder="ГГГГ-ММ-ДД"
        maxLength={10}
      />
      <Field
        label="По дату включительно"
        accessibilityLabel="Конец экспорта"
        value={through}
        onChangeText={setThrough}
        placeholder="ГГГГ-ММ-ДД"
        maxLength={10}
      />
      <Notice>
        {format === "ynab"
          ? "Формат Date, Payee, Memo, Outflow, Inflow в валюте выбранного счёта. Выберите такую же валюту в приложении получателя. Категория записывается в заметку; назначьте категории и свяжите переводы после импорта в YNAB."
          : "Один перевод — одна строка с двумя счетами, суммами и валютами (FromAmount, FromCurrency, ToAmount, ToCurrency). При выборе счёта знак суммы показывает движение относительно него. При экспорте всех счетов сумма перевода отрицательная со стороны отправителя; тип transfer отличает его от расхода."}
      </Notice>
      <Txt>
        При импорте в другое приложение сопоставьте столбцы. Подкатегории
        записаны как «Категория / Подкатегория»; даты — ГГГГ-ММ-ДД.
      </Txt>
      {preview && (
        <Txt testID="csv-export-count">
          Будет экспортировано операций: {preview.count}
        </Txt>
      )}
      <ErrorText error={error || validation} />
      <Button
        label={busy ? "Подготовка CSV…" : "Сохранить CSV"}
        disabled={busy || !preview || preview.count === 0}
        icon="download-outline"
        onPress={() => {
          if (!preview) return;
          setBusy(true);
          setError("");
          void shareFile(
            preview.content,
            `lad-transactions-${today}${accountId ? "-account" : ""}-${format}.csv`,
            "text/csv",
          )
            .then(() => notify("CSV подготовлен"))
            .catch((e) =>
              setError(
                e instanceof Error ? e.message : "Не удалось подготовить CSV.",
              ),
            )
            .finally(() => setBusy(false));
        }}
      />
    </View>
  );
}
