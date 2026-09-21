import { useFinanceActions } from "../../hooks/useFinanceActions";
import { useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { useFinance } from "../../store";
import { AccountPicker } from "../../forms/AccountPicker";
import { ErrorText } from "../../forms/ErrorText";
import { accountBalance, money } from "../../domain/finance";
import {
  CSV_MAX_BYTES,
  guessCsvMapping,
  importedBalance,
  parseCsv,
  previewCsv,
  type CsvColumn,
  type CsvOptions,
  type CsvOverride,
} from "../../domain/csv";
import { decodeCsvBytes, type CsvEncoding } from "../../domain/csvEncoding";
import { pickDocument } from "../../services/documents";
import {
  Button,
  C,
  Card,
  Field,
  font,
  Notice,
  Section,
  Segments,
  Txt,
} from "../../ui";
import { ColumnPicker } from "./ColumnPicker";
import { CsvRowItem } from "./CsvRowItem";

const columnLabels: Record<CsvColumn, string> = {
  date: "Дата *",
  title: "Описание *",
  amount: "Сумма со знаком *",
  expense: "Расход *",
  income: "Приход *",
  currency: "Валюта",
  category: "Категория",
  status: "Статус",
  bankId: "ID операции в банке",
  type: "Тип операции",
};

export function CsvImportSheet({ close }: { close: () => void }) {
  const { state, notify, today } = useFinance();
  const actions = useFinanceActions();
  const [file, setFile] = useState<{ name: string; bytes: Uint8Array } | null>(
    null,
  );
  const [encoding, setEncoding] = useState<CsvEncoding>("auto");
  const [separator, setSeparator] = useState("auto");
  const [headerRow, setHeaderRow] = useState("1");
  const [options, setOptions] = useState<CsvOptions>({
    accountId: state.accounts.find((a) => a.kind === "spending")!.id,
    mapping: guessCsvMapping([]),
    mode: "signed",
    positive: "income",
    dateOrder: "dmy",
  });
  const [configured, setConfigured] = useState(false);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [overrides, setOverrides] = useState<Record<number, CsvOverride>>({});
  const [page, setPage] = useState(0);
  const submitted = useRef(false);
  const parsed = useMemo(() => {
    if (!file) return { table: null, error: "" };
    try {
      const raw = decodeCsvBytes(file.bytes, encoding);
      if (
        !/^\d{1,2}$/.test(headerRow) ||
        Number(headerRow) < 1 ||
        Number(headerRow) > 30
      )
        throw new Error("Укажите строку заголовков от 1 до 30.");
      return {
        table: parseCsv(
          raw
            .split(/\r?\n/)
            .slice(Number(headerRow) - 1)
            .join("\n"),
          separator === "auto" ? undefined : separator,
        ),
        error: "",
      };
    } catch (e) {
      return {
        table: null,
        error: e instanceof Error ? e.message : "Не удалось прочитать CSV.",
      };
    }
  }, [file, encoding, separator, headerRow]);
  const preview = useMemo(() => {
    if (!parsed.table || !configured) return { rows: [], error: "" };
    try {
      return {
        rows: previewCsv(state, parsed.table, options, overrides, today),
        error: "",
      };
    } catch (e) {
      return {
        rows: [],
        error:
          e instanceof Error ? e.message : "Проверьте сопоставление колонок.",
      };
    }
  }, [state, parsed.table, options, configured, overrides, today]);
  const selectFile = async () => {
    setBusy(true);
    setError("");
    try {
      const picked = await pickDocument(["csv", "tsv"], CSV_MAX_BYTES);
      if (picked) {
        setFile(picked);
        setConfigured(false);
        setReview(false);
        setOverrides({});
        setExcluded(new Set());
        setPage(0);
        setHeaderRow("1");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось открыть файл.");
    } finally {
      setBusy(false);
    }
  };
  const configure = () => {
    if (!parsed.table) return;
    const mapping = guessCsvMapping(parsed.table.headers);
    setOptions((o) => ({
      ...o,
      mapping,
      mode:
        mapping.amount < 0 && mapping.expense >= 0 && mapping.income >= 0
          ? "split"
          : "signed",
    }));
    setConfigured(true);
    setReview(false);
    setError("");
    setOverrides({});
    setExcluded(new Set());
  };
  const rows = preview.rows;
  const selected = rows.filter(
    (r) => r.transaction && !r.error && !r.duplicate && !excluded.has(r.line),
  );
  const income = selected
    .filter((r) => r.transaction?.type === "income")
    .reduce((n, r) => n + r.transaction!.amount, 0);
  const expense = selected
    .filter((r) => r.transaction?.type === "expense")
    .reduce((n, r) => n + r.transaction!.amount, 0);
  const commit = () => {
    if (!parsed.table || submitted.current) return;
    try {
      // Validate again against the latest in-memory state before the atomic update.
      submitted.current = true;
      const next = actions.importCsv(
        parsed.table,
        options,
        excluded,
        overrides,
      );
      notify(
        `Импортировано операций: ${next.transactions.length - state.transactions.length}`,
      );
      close();
    } catch (e) {
      submitted.current = false;
      setError(
        e instanceof Error ? e.message : "Не удалось импортировать операции.",
      );
    }
  };
  return (
    <>
      {!review && (
        <>
          <Notice>
            Выписка обрабатывается на устройстве. Поддерживаются CSV и TSV,
            UTF-8 и Windows-1251, до 2 МБ и 5000 строк. Импорт добавляет
            операции к текущим данным.
          </Notice>
          <Button
            label={file ? "Выбрать другой CSV" : "Выбрать CSV-файл"}
            icon="document-text-outline"
            disabled={busy}
            onPress={() => void selectFile()}
          />
        </>
      )}
      {!!file && (
        <>
          <Txt style={{ fontFamily: font.bold }}>{file.name}</Txt>
          {!review && (
            <>
              <Segments
                value={encoding}
                options={[
                  { value: "auto", label: "Авто" },
                  { value: "utf8", label: "UTF-8" },
                  { value: "windows1251", label: "Windows-1251" },
                ]}
                onChange={(value) => {
                  setEncoding(value);
                  setConfigured(false);
                }}
              />
              <Segments
                value={separator}
                options={[
                  { value: "auto", label: "Авто" },
                  { value: ";", label: ";" },
                  { value: ",", label: "," },
                  { value: "\t", label: "Табуляция" },
                ]}
                onChange={(value) => {
                  setSeparator(value);
                  setConfigured(false);
                }}
              />
              <Field
                label="Номер строки с заголовками"
                accessibilityLabel="Строка заголовков CSV"
                value={headerRow}
                keyboardType="number-pad"
                onChangeText={(value) => {
                  setHeaderRow(value);
                  setConfigured(false);
                }}
                maxLength={2}
              />
              <ErrorText error={parsed.error} />
              {!!parsed.table && (
                <Button
                  label={
                    configured
                      ? "Распознать колонки заново"
                      : "Распознать колонки"
                  }
                  variant="secondary"
                  onPress={configure}
                />
              )}
            </>
          )}
          {configured && !!parsed.table && !review && (
            <>
              <AccountPicker
                selected={options.accountId}
                spendingOnly
                onChange={(accountId) => setOptions({ ...options, accountId })}
              />
              <Segments
                value={options.mode}
                options={[
                  { value: "signed", label: "Одна сумма" },
                  { value: "split", label: "Приход / расход" },
                ]}
                onChange={(mode) =>
                  setOptions({
                    ...options,
                    mode,
                    mapping: {
                      ...options.mapping,
                      amount: mode === "split" ? -1 : options.mapping.amount,
                      expense: mode === "signed" ? -1 : options.mapping.expense,
                      income: mode === "signed" ? -1 : options.mapping.income,
                    },
                  })
                }
              />
              {options.mode === "signed" && (
                <>
                  <Txt style={{ fontSize: 12 }}>
                    Положительная сумма означает:
                  </Txt>
                  <Segments
                    value={options.positive}
                    options={[
                      { value: "income", label: "Доход (+)" },
                      { value: "expense", label: "Расход (+)" },
                    ]}
                    onChange={(positive) =>
                      setOptions({ ...options, positive })
                    }
                  />
                </>
              )}
              <Txt style={{ fontSize: 12 }}>Даты с косой чертой:</Txt>
              <Segments
                value={options.dateOrder}
                options={[
                  { value: "dmy", label: "День / месяц" },
                  { value: "mdy", label: "Месяц / день" },
                ]}
                onChange={(dateOrder) => setOptions({ ...options, dateOrder })}
              />
              {(Object.keys(columnLabels) as CsvColumn[])
                .filter((key) =>
                  options.mode === "signed"
                    ? key !== "expense" && key !== "income"
                    : key !== "amount",
                )
                .map((key) => (
                  <ColumnPicker
                    key={key}
                    label={columnLabels[key]}
                    headers={parsed.table!.headers}
                    value={options.mapping[key]}
                    onChange={(value) =>
                      setOptions({
                        ...options,
                        mapping: { ...options.mapping, [key]: value },
                      })
                    }
                  />
                ))}
              <Notice>
                Все суммы учитываются в рублях. Если в выписке есть валюта,
                выберите её колонку. Переводы между своими счетами нужно
                подтвердить отдельно в предпросмотре.
              </Notice>
              <ErrorText error={preview.error} />
              <Button
                label="Проверить операции"
                disabled={!!preview.error || !rows.length}
                onPress={() => {
                  setReview(true);
                  setPage(0);
                  setExcluded(new Set());
                  setOverrides({});
                }}
              />
            </>
          )}
          {review && (
            <>
              <Card style={{ gap: 10, backgroundColor: C.soft }}>
                <Section title="Проверьте перед импортом" />
                <Txt>
                  Новых выбрано: {selected.length} · повторов:{" "}
                  {rows.filter((r) => r.duplicate).length} · требуют
                  исправления: {rows.filter((r) => r.error).length}
                </Txt>
                <Txt style={{ fontSize: 12 }}>
                  Доходы: {money(income, true)} · расходы:{" "}
                  {money(expense, true)}
                </Txt>
                <Txt style={{ fontSize: 12 }}>
                  Остаток счёта:{" "}
                  {money(accountBalance(state, options.accountId, today), true)}{" "}
                  →{" "}
                  {money(
                    importedBalance(
                      state,
                      options.accountId,
                      rows,
                      excluded,
                      today,
                    ),
                    true,
                  )}
                </Txt>
                <Txt style={{ fontSize: 11, lineHeight: 19, color: C.muted }}>
                  Начальный остаток счёта должен соответствовать моменту до
                  импортируемых операций. Если он уже включает эти расходы,
                  поправьте его в настройках счёта.
                </Txt>
              </Card>
              <Notice>
                Повторы и строки с ошибками не импортируются. Без ID банка
                одинаковые строки внутри файла считаются отдельными операциями;
                совпадения с историей сверяются по дате, сумме, типу и описанию.
              </Notice>
              <Button
                label="Назад к колонкам"
                variant="secondary"
                onPress={() => setReview(false)}
              />
              {rows.slice(page * 15, (page + 1) * 15).map((row) => (
                <CsvRowItem
                  key={row.line}
                  row={row}
                  accountId={options.accountId}
                  override={overrides[row.line]}
                  included={
                    !!row.transaction &&
                    !row.error &&
                    !row.duplicate &&
                    !excluded.has(row.line)
                  }
                  onOverride={(value) =>
                    setOverrides({ ...overrides, [row.line]: value })
                  }
                  onToggle={() =>
                    setExcluded((previous) => {
                      const next = new Set(previous);
                      if (next.has(row.line)) next.delete(row.line);
                      else next.add(row.line);
                      return next;
                    })
                  }
                />
              ))}
              <View style={{ gap: 10 }}>
                <Txt style={{ color: C.muted, fontSize: 11 }}>
                  Страница {page + 1} из{" "}
                  {Math.max(1, Math.ceil(rows.length / 15))}
                </Txt>
                {page > 0 && (
                  <Button
                    label="Предыдущие строки"
                    variant="secondary"
                    onPress={() => setPage(page - 1)}
                  />
                )}
                {(page + 1) * 15 < rows.length && (
                  <Button
                    label="Следующие строки"
                    variant="secondary"
                    onPress={() => setPage(page + 1)}
                  />
                )}
              </View>
              <Button
                label={`Импортировать ${selected.length} операций`}
                disabled={!selected.length || !!preview.error}
                onPress={commit}
              />
            </>
          )}
        </>
      )}
      <ErrorText error={error} />
    </>
  );
}
