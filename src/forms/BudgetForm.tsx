import { useActionError } from "../hooks/useActionError";
import { useFinanceActions } from "../hooks/useFinanceActions";
import { useState } from "react";
import { font, Txt, Row, IconTile, Button, Field, Notice } from "../ui";
import { useFinance } from "../store";
import { moneyInput, parseMoney } from "../domain/finance";
import { ErrorText } from "./ErrorText";

export function BudgetForm({ id, close }: { id?: string; close: () => void }) {
  const { state, notify } = useFinance();
  const actions = useFinanceActions();
  const category = state.categories.find((c) => c.id === id)!;
  const [amount, setAmount] = useState(moneyInput(category.budget));
  const { error, setError, run } = useActionError();
  return (
    <>
      <Row>
        <IconTile
          name={category.icon}
          color={category.color}
          background={category.background}
        />
        <Txt style={{ fontFamily: font.bold, fontSize: 19 }}>
          {category.name}
        </Txt>
      </Row>
      <Field
        label="Лимит на месяц, ₽"
        accessibilityLabel="Лимит категории"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        maxLength={16}
      />
      <Notice>
        Лимит повторяется каждый месяц. Его изменение не меняет записанные
        расходы.
      </Notice>
      <ErrorText error={error} />
      <Button
        label="Сохранить лимит"
        onPress={() =>
          run(() => {
            const parsed = parseMoney(amount);
            if (parsed === null)
              return setError("Введите сумму от 0 до 1 млрд ₽.");
            actions.saveBudget(category.id, parsed);
            notify("Лимит обновлён");
            close();
          })
        }
      />
    </>
  );
}
