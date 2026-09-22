import { useState } from "react";
import { accountCurrency } from "../../../domain/currency";
import { refundedAmount } from "../../../domain/transactionAmounts";
import type { Transaction } from "../../../domain/types";
import { Button, Card, Field, Notice, Txt } from "../../../shared/ui";
import { useFinance, useMoney } from "../../../state/finance";

export function RefundFields({
  refundOf,
  sourceAmount,
  accountId,
  transactionId,
  locked,
  onSelect,
  onClear,
  onSourceAmount,
}: {
  refundOf?: string;
  sourceAmount: string;
  accountId: string;
  transactionId?: string;
  locked: boolean;
  onSelect: (transaction: Transaction) => void;
  onClear: () => void;
  onSourceAmount: (value: string) => void;
}) {
  const { state } = useFinance();
  const { money } = useMoney();
  const [choosing, setChoosing] = useState(false);
  const [search, setSearch] = useState("");
  const expense = state.transactions.find((entry) => entry.id === refundOf);
  const candidates = state.transactions.filter(
    (entry) =>
      entry.type === "expense" &&
      !entry.debtId &&
      entry.amount > refundedAmount(state, entry.id, transactionId) &&
      entry.title
        .toLocaleLowerCase("ru-RU")
        .includes(search.toLocaleLowerCase("ru-RU")),
  );
  const currency = accountCurrency(state, expense?.accountId ?? accountId);
  return (
    <Card style={{ gap: 12 }}>
      {expense ? (
        <>
          <Txt>
            Возврат за «{expense.title}» от {expense.date}
          </Txt>
          <Notice>
            Возврат уменьшит расходы в день зачисления. Доступно вернуть:{" "}
            {money(
              expense.amount - refundedAmount(state, expense.id, transactionId),
              true,
              currency,
            )}
            . Для разделённой покупки сумма распределится пропорционально её
            категориям.
          </Notice>
          {currency !== accountCurrency(state, accountId) && (
            <>
              <Field
                label={`Возвращённая часть покупки, ${currency}`}
                accessibilityLabel="Возвращённая часть покупки"
                value={sourceAmount}
                onChangeText={onSourceAmount}
                keyboardType="decimal-pad"
                maxLength={16}
              />
              <Notice>
                Укажите, какую часть исходной покупки вернули. Сумма поступления
                выше — фактически полученные деньги в валюте выбранного счёта.
                Расходы уменьшатся на сохранённую оценку поступления; разница
                курсов может изменить итог.
              </Notice>
            </>
          )}
          {!locked && (
            <Button
              label="Сделать обычным доходом"
              variant="secondary"
              onPress={onClear}
            />
          )}
        </>
      ) : (
        <>
          <Button
            label={
              choosing ? "Закрыть выбор покупки" : "Это возврат за покупку"
            }
            variant="secondary"
            onPress={() => setChoosing(!choosing)}
          />
          {choosing && (
            <>
              <Field
                label="Найти покупку"
                accessibilityLabel="Поиск покупки для возврата"
                value={search}
                onChangeText={setSearch}
                maxLength={120}
              />
              {candidates.slice(0, 20).map((entry) => (
                <Button
                  key={entry.id}
                  label={`${entry.title} · ${entry.date} · ${money(entry.amount, true, accountCurrency(state, entry.accountId))}`}
                  variant="secondary"
                  onPress={() => {
                    onSelect(entry);
                    setChoosing(false);
                  }}
                />
              ))}
              {!candidates.length && (
                <Txt>Нет покупок с доступной суммой возврата.</Txt>
              )}
              {candidates.length > 20 && (
                <Txt>
                  Уточните название, чтобы найти покупку среди остальных
                  операций.
                </Txt>
              )}
            </>
          )}
        </>
      )}
    </Card>
  );
}
