import { useState } from "react";
import { View } from "react-native";
import type { OpenSheet } from "../../../application/navigation/types";
import { debtBalance } from "../../../domain/debts";
import { useFinance } from "../../../state/finance";
import { Button, Notice, RecordList, Section, Txt } from "../../../shared/ui";
import { CreditCardOverview } from "./CreditCardOverview";
import { DebtCard } from "./DebtCard";

export function DebtsPanel({
  open,
  full = false,
  section,
}: {
  open: OpenSheet;
  full?: boolean;
  section?: "debts" | "creditCards";
}) {
  const { state, today } = useFinance();
  const [showClosed, setShowClosed] = useState(full);
  const debts = state.debts ?? [];
  const closed = debts.filter((debt) => debtBalance(state, debt, today) === 0);
  const visibleDebts = debts.filter(
    (debt) => showClosed || debtBalance(state, debt, today) > 0,
  );
  const creditCards = state.accounts.filter(
    (account) => !account.archived && account.kind === "credit",
  );
  const showDebts = section !== "creditCards";
  const showCreditCards = section !== "debts";
  return (
    <View style={{ gap: 16 }}>
      <Section
        title={
          section === "debts"
            ? "Долги"
            : section === "creditCards"
              ? "Кредитные карты"
              : "Долги и кредитные карты"
        }
      />
      <Notice>
        Выдача и возврат основной суммы учитываются отдельно от расходов и
        доходов. Ваши долги со сроком и заданные платежи по картам входят в
        прогноз. Ожидаемые возвраты вам появятся в доступных деньгах только
        после получения.
      </Notice>
      {showDebts && (
        <>
          <Button
            label="Добавить долг"
            icon="add"
            onPress={() => open({ type: "debt" })}
          />
          <RecordList
            items={visibleDebts}
            full={full}
            testID="debts-list"
            keyExtractor={(debt) => debt.id}
            showAllLabel="Все долги"
            onShowAll={() => open({ type: "list", list: "debts" })}
            renderItem={(debt) => <DebtCard debt={debt} open={open} />}
          />
          {full && !visibleDebts.length && <Txt>Здесь пока нет долгов.</Txt>}
          {closed.length > 0 && (
            <Button
              variant="secondary"
              label={
                showClosed
                  ? "Скрыть закрытые долги"
                  : `Закрытые долги: ${closed.length}`
              }
              onPress={() => setShowClosed(!showClosed)}
            />
          )}
        </>
      )}
      {showCreditCards && (
        <>
          <Button
            label="Добавить кредитную карту"
            variant="secondary"
            icon="card-outline"
            onPress={() => open({ type: "account", accountKind: "credit" })}
          />
          <RecordList
            items={creditCards}
            full={full}
            testID="credit-cards-list"
            keyExtractor={(account) => account.id}
            showAllLabel="Все кредитные карты"
            onShowAll={() => open({ type: "list", list: "creditCards" })}
            renderItem={(account) => (
              <CreditCardOverview account={account} open={open} />
            )}
          />
          {full && !creditCards.length && <Txt>Кредитных карт пока нет.</Txt>}
        </>
      )}
    </View>
  );
}
