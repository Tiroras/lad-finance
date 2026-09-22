import { useState } from "react";
import { accountBalance } from "../../../domain/accountBalances";
import {
  accountSignature,
  reconciliationCurrent,
} from "../../../domain/reconciliation";
import { dateLabel, validDate } from "../../../shared/lib/dates";
import {
  useFinance,
  useFinanceActions,
  useMoney,
} from "../../../state/finance";
import {
  Button,
  Card,
  ErrorText,
  Field,
  Notice,
  Section,
  Txt,
} from "../../../shared/ui";
import { useActionError } from "../../../shared/lib/useActionError";
import type { OpenSheet } from "../../../application/navigation/types";

export function ReconciliationForm({
  id,
  close,
  open,
}: {
  id?: string;
  close: () => void;
  open: OpenSheet;
}) {
  const { state, today, notify } = useFinance();
  const actions = useFinanceActions();
  const { money, moneyInput, parseMoney } = useMoney();
  const account = state.accounts.find((a) => a.id === id);
  const code = account?.currency ?? "RUB";
  const [date, setDate] = useState(today);
  const [balance, setBalance] = useState(
    account ? moneyInput(accountBalance(state, account.id, today), code) : "0",
  );
  const [note, setNote] = useState("");
  const [adjust, setAdjust] = useState(false);
  const { error, run } = useActionError();
  if (!account)
    return <Notice>Счёт не найден. Откройте список счетов заново.</Notice>;
  const negative = balance.trim().startsWith("-");
  const absolute = parseMoney(
    negative ? balance.trim().slice(1) : balance,
    code,
  );
  const parsed = absolute === null ? null : absolute * (negative ? -1 : 1);
  const current = accountBalance(state, account.id, date);
  const difference = parsed === null ? null : parsed - current;
  const signature = accountSignature(state, account.id, date);
  const history = (state.reconciliations ?? [])
    .filter((r) => r.accountId === id)
    .slice()
    .reverse()
    .sort((a, b) => b.date.localeCompare(a.date));
  const previous = history.find(
    (r) => r.date <= date && reconciliationCurrent(state, r),
  );
  const records = state.transactions
    .filter(
      (t) =>
        t.date <= date &&
        (!previous || t.date >= previous.date) &&
        (t.accountId === id || t.toAccountId === id),
    )
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date));
  return (
    <>
      <Section title={account.name} />
      <Notice>
        Сравните остатки на конец выбранного дня в валюте счёта. Введите
        банковский остаток с учётом тех же операций, которые уже записаны в
        Ладе; незавершённые банковские списания сначала проверьте отдельно.
      </Notice>
      <Field
        label="Дата сверки · ГГГГ-ММ-ДД"
        accessibilityLabel="Дата сверки"
        value={date}
        onChangeText={(v) => {
          setDate(v);
          setAdjust(false);
        }}
        maxLength={10}
      />
      <Field
        label={`Остаток по банку, ${code}`}
        accessibilityLabel="Остаток по банку"
        value={balance}
        onChangeText={(v) => {
          setBalance(v);
          setAdjust(false);
        }}
        keyboardType="numbers-and-punctuation"
        maxLength={17}
      />
      <Card>
        <Txt>В Ладе: {money(current, true, code)}</Txt>
        <Txt>
          Разница:{" "}
          {difference === null
            ? "проверьте сумму"
            : money(difference, true, code)}
        </Txt>
      </Card>
      {difference !== null && difference !== 0 && (
        <>
          <Notice>
            Проверьте пропущенные или повторные операции ниже. Если причина
            неизвестна, можно создать отдельную корректировку. Она изменит
            остаток, но не доходы и расходы.
          </Notice>
          <Button
            label={
              adjust
                ? "Корректировка подтверждена"
                : "Записать разницу корректировкой"
            }
            variant="secondary"
            onPress={() => setAdjust(!adjust)}
          />
        </>
      )}
      <Field
        label={difference ? "Причина корректировки" : "Заметка к сверке"}
        accessibilityLabel="Причина корректировки"
        value={note}
        onChangeText={setNote}
        maxLength={500}
      />
      <ErrorText error={error} />
      <Button
        label="Подтвердить сверку"
        onPress={() =>
          run(() => {
            if (parsed === null || !validDate(date))
              throw new Error("Проверьте сумму и дату сверки.");
            actions.reconcileAccount({
              accountId: account.id,
              date,
              balance: parsed,
              note,
              adjust,
              expectedSignature: signature,
            });
            notify("Остаток сверён");
            close();
          })
        }
      />
      <Section title="Операции для проверки" />
      {records.length === 0 && <Txt>Операций за этот период нет.</Txt>}
      {records.slice(0, 20).map((t) => (
        <Button
          key={t.id}
          variant="secondary"
          label={`${dateLabel(t.date)} · ${t.title}`}
          onPress={() => open({ type: "transaction", id: t.id })}
        />
      ))}
      {records.length > 20 && (
        <Txt>
          Показаны последние 20 операций. Остальные доступны на вкладке
          «Операции».
        </Txt>
      )}
      <Section title="История сверок" />
      {history.length === 0 && <Txt>Вы ещё не сверяли этот счёт.</Txt>}
      {history.slice(0, 5).map((r) => (
        <Card key={r.id}>
          <Txt>
            {dateLabel(r.date)} · {money(r.balance, true, code)}
          </Txt>
          <Txt>
            {reconciliationCurrent(state, r)
              ? "Подтверждено"
              : "История изменилась — нужна повторная сверка"}
          </Txt>
          {r.note ? <Txt>{r.note}</Txt> : null}
        </Card>
      ))}
      <Section title="Корректировки остатка" />
      {(state.balanceAdjustments ?? [])
        .filter((a) => a.accountId === id)
        .slice(-10)
        .reverse()
        .map((a) => (
          <Card key={a.id}>
            <Txt>
              {dateLabel(a.date)} · {money(a.amount, true, code)}
            </Txt>
            <Txt>{a.note}</Txt>
          </Card>
        ))}
    </>
  );
}
