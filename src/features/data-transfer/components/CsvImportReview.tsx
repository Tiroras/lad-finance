import { View } from "react-native";
import { importedBalance } from "../../../domain/csv";
import { accountCurrency } from "../../../domain/currency";
import { accountBalance } from "../../../domain/finance";
import { useFinance, useMoney } from "../../../state/finance";
import { Button, C, Card, Notice, Section, Txt } from "../../../shared/ui";
import type { CsvImportModel } from "../model/useCsvImport";
import { CsvRowItem } from "./CsvRowItem";

export function CsvImportReview({ model }: { model: CsvImportModel }) {
  const { state, today } = useFinance();
  const { money } = useMoney();
  const {
    options,
    draft: { page, excluded, overrides },
    preview,
    selected,
    setPage,
    commit,
  } = model;
  const rows = preview.rows;
  const income = selected.reduce(
    (sum, row) =>
      sum + (row.transaction?.type === "income" ? row.transaction.amount : 0),
    0,
  );
  const expense = selected.reduce(
    (sum, row) =>
      sum + (row.transaction?.type === "expense" ? row.transaction.amount : 0),
    0,
  );
  return (
    <>
      <Card style={{ gap: 10, backgroundColor: C.soft }}>
        <Section title="Проверьте перед импортом" />
        <Txt>
          Новых выбрано: {selected.length} · повторов:{" "}
          {rows.filter((r) => r.duplicate).length} · требуют исправления:{" "}
          {rows.filter((r) => r.error).length}
        </Txt>
        <Txt style={{ fontSize: 12 }}>
          Доходы:{" "}
          {money(income, true, accountCurrency(state, options.accountId))} ·
          расходы:{" "}
          {money(expense, true, accountCurrency(state, options.accountId))}
        </Txt>
        <Txt style={{ fontSize: 12 }}>
          Остаток счёта:{" "}
          {money(
            accountBalance(state, options.accountId, today),
            true,
            accountCurrency(state, options.accountId),
          )}{" "}
          →{" "}
          {money(
            importedBalance(state, options.accountId, rows, excluded, today),
            true,
            accountCurrency(state, options.accountId),
          )}
        </Txt>
        <Txt style={{ fontSize: 11, lineHeight: 19, color: C.muted }}>
          Начальный остаток счёта должен соответствовать моменту до
          импортируемых операций. Если он уже включает эти расходы, поправьте
          его в настройках счёта.
        </Txt>
      </Card>
      <Notice>
        Повторы и строки с ошибками не импортируются. Без ID банка одинаковые
        строки внутри файла считаются отдельными операциями; совпадения с
        историей сверяются по дате, сумме, типу и описанию.
      </Notice>
      <Button
        label="Назад к колонкам"
        variant="secondary"
        onPress={model.back}
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
          onOverride={(value) => model.override(row.line, value)}
          onToggle={() => model.toggle(row.line)}
        />
      ))}
      <View style={{ gap: 10 }}>
        <Txt style={{ color: C.muted, fontSize: 11 }}>
          Страница {page + 1} из {Math.max(1, Math.ceil(rows.length / 15))}
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
        label={
          model.busy
            ? "Сохраняем импорт…"
            : `Импортировать ${selected.length} операций`
        }
        disabled={
          model.busy ||
          model.financeWriteBlocked ||
          !selected.length ||
          !!preview.error
        }
        onPress={() => void commit()}
      />
    </>
  );
}
