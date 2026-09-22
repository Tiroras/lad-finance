import type { CsvColumn } from "../../../domain/csv";
import type { CsvImportModel } from "../model/useCsvImport";
import { AccountPicker } from "../../accounts";
import { Button, ErrorText, Notice, Segments, Txt } from "../../../shared/ui";
import { ColumnPicker } from "./ColumnPicker";

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

export function CsvImportMapping({ model }: { model: CsvImportModel }) {
  const { source, options, preview, setOptions } = model;
  return (
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
          <Txt style={{ fontSize: 12 }}>Положительная сумма означает:</Txt>
          <Segments
            value={options.positive}
            options={[
              { value: "income", label: "Доход (+)" },
              { value: "expense", label: "Расход (+)" },
            ]}
            onChange={(positive) => setOptions({ ...options, positive })}
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
            headers={source.table!.headers}
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
        Суммы учитываются в валюте выбранного счёта. Если в выписке есть валюта,
        выберите её колонку. Переводы между своими счетами нужно подтвердить
        отдельно в предпросмотре.
      </Notice>
      <ErrorText error={preview.error} />
      <Button
        label="Проверить операции"
        disabled={!!preview.error || !preview.rows.length}
        onPress={model.review}
      />
    </>
  );
}
