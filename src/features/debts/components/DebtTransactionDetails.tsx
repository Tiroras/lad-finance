import { accountCurrency } from "../../../domain/currency";
import type { Transaction } from "../../../domain/types";
import { dateLabel } from "../../../shared/lib/dates";
import { useActionError } from "../../../shared/lib/useActionError";
import {
  useFinance,
  useFinanceActions,
  useMoney,
} from "../../../state/finance";
import {
  C,
  DeleteButton,
  ErrorText,
  font,
  Notice,
  Txt,
} from "../../../shared/ui";

export function DebtTransactionDetails({
  transaction,
  close,
}: {
  transaction: Transaction;
  close: () => void;
}) {
  const { state, notify } = useFinance();
  const { money } = useMoney();
  const actions = useFinanceActions();
  const { error, run } = useActionError();
  const debt = state.debts?.find((entry) => entry.id === transaction.debtId);
  return (
    <>
      <Txt style={{ fontFamily: font.bold, fontSize: 18 }}>
        {transaction.title}
      </Txt>
      <Txt style={{ fontFamily: font.bold, fontSize: 24 }}>
        {money(
          transaction.amount,
          false,
          accountCurrency(state, transaction.accountId),
        )}
      </Txt>
      <Txt style={{ color: C.muted, fontSize: 13 }}>
        {dateLabel(transaction.date)} ·{" "}
        {
          state.accounts.find((account) => account.id === transaction.accountId)
            ?.name
        }
      </Txt>
      <Notice>
        {transaction.debtAction === "issue" ? "Выдача" : "Возврат"} основной
        суммы долга «{debt?.name}». Эта операция меняет остаток счёта и долга
        одновременно. Для исправления удалите ошибочную запись и запишите
        движение заново в разделе «Долги». Удалить выдачу при сохранённых
        возвратах нельзя.
      </Notice>
      <ErrorText error={error} />
      <DeleteButton
        label="Удалить операцию долга"
        explanation="Движение денег будет отменено на счёте и в остатке долга. Если после удаления возвраты превысят сумму долга, приложение попросит сначала исправить их."
        onDelete={() =>
          run(() => {
            actions.deleteTransaction(transaction.id);
            notify("Операция долга удалена");
            close();
          })
        }
      />
    </>
  );
}
