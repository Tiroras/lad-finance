import { Pressable, View } from "react-native";
import { accountToBase } from "../../../domain/currency";
import { accountBalance } from "../../../domain/finance";
import { accountAvailability } from "../../../domain/accountBalances";
import { CurrencyNotice } from "../../currencies";
import { useMoney, useFinance } from "../../../state/finance";
import type { OpenSheet } from "../../../application/navigation/types";
import {
  Button,
  C,
  Card,
  font,
  Icon,
  IconTile,
  Notice,
  RecordList,
  Row,
  Txt,
} from "../../../shared/ui";

export function AccountsContent({
  open,
  full = false,
  section,
}: {
  open: OpenSheet;
  full?: boolean;
  section?: "active" | "archived" | "negative";
}) {
  const { money, currency: baseCode } = useMoney();
  const { state, today } = useFinance();
  const active = state.accounts.filter(
    (account) =>
      !account.archived &&
      (section !== "negative" ||
        (account.kind === "spending" &&
          accountBalance(state, account.id, today) < 0)),
  );
  const archived = state.accounts.filter((account) => account.archived);
  const showActive = section !== "archived";
  const showArchived = !section || section === "archived";
  return (
    <>
      <Notice>
        Это ручной учёт. Названия счетов и остатки можно изменить; подключения к
        банкам в этой версии нет.
      </Notice>
      <CurrencyNotice />
      {section === "negative" && (
        <Notice>
          Счетов с отрицательным остатком: {active.length}. Расходы сохранены.
          Если сумма отличается от фактической, можно сверить счёт;
          корректировка выполняется только после вашего подтверждения.
        </Notice>
      )}
      {showActive && section !== "negative" && !active.length && (
        <Notice>
          Активных счетов пока нет. Добавьте счёт или откройте архив и
          восстановите нужный. Сохранённые операции остаются в истории.
        </Notice>
      )}
      {showActive && (
        <RecordList
          items={active}
          full={full}
          testID="accounts-list"
          keyExtractor={(account) => account.id}
          showAllLabel={
            section === "negative"
              ? "Все счета с отрицательным остатком"
              : "Все активные счета"
          }
          onShowAll={() =>
            open({
              type: "list",
              list: section === "negative" ? "negativeAccounts" : "accounts",
            })
          }
          renderItem={(account) => (
            <View style={{ gap: 8 }}>
              <Pressable
                accessibilityRole="button"
                onPress={() => open({ type: "account", id: account.id })}
              >
                <Card>
                  <Row>
                    <IconTile name={account.icon} color={account.color} />
                    <View style={{ flex: 1, gap: 6 }}>
                      <Txt style={{ fontFamily: font.bold }}>
                        {account.name}
                      </Txt>
                      <Txt style={{ color: C.muted, fontSize: 11 }}>
                        {account.kind === "savings"
                          ? "Накопления · вне доступного бюджета"
                          : account.kind === "credit"
                            ? "Кредитная карта · лимит не входит в доступные деньги"
                            : "Повседневные расходы"}
                      </Txt>
                    </View>
                    <Icon name="create-outline" size={18} color={C.muted} />
                  </Row>
                  <Txt
                    style={{
                      fontFamily: font.bold,
                      fontSize: 27,
                      marginTop: 17,
                    }}
                  >
                    {money(
                      accountBalance(state, account.id),
                      true,
                      account.currency ?? "RUB",
                    )}
                  </Txt>
                  {(account.currency ?? "RUB") !== baseCode && (
                    <Txt style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>
                      ≈{" "}
                      {money(
                        accountToBase(
                          state,
                          accountBalance(state, account.id),
                          account.id,
                        ),
                        true,
                      )}
                    </Txt>
                  )}
                  {accountAvailability(state, account.id, today).held > 0 && (
                    <Txt style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>
                      В ожидании списания:{" "}
                      {money(
                        accountAvailability(state, account.id, today).held,
                        true,
                        account.currency ?? "RUB",
                      )}
                      {" · "}После резервов:{" "}
                      {money(
                        accountAvailability(state, account.id, today).available,
                        true,
                        account.currency ?? "RUB",
                      )}
                    </Txt>
                  )}
                </Card>
              </Pressable>
              <Button
                label={`Сверить: ${account.name}`}
                variant="secondary"
                onPress={() => open({ type: "reconcile", id: account.id })}
              />
            </View>
          )}
        />
      )}
      {showArchived && (archived.length > 0 || section === "archived") && (
        <>
          <Txt accessibilityRole="header" style={{ fontFamily: font.bold }}>
            Архив счетов
          </Txt>
          <Notice>
            Архивные счета сохранены вместе с историей. Для новых записей
            сначала восстановите счёт.
          </Notice>
          {!archived.length && <Txt>Архивных счетов пока нет.</Txt>}
          <RecordList
            items={archived}
            full={full}
            testID="archived-accounts-list"
            keyExtractor={(account) => account.id}
            showAllLabel="Все архивные счета"
            onShowAll={() => open({ type: "list", list: "archivedAccounts" })}
            renderItem={(account) => (
              <Button
                label={`${account.name} · архив`}
                variant="secondary"
                onPress={() => open({ type: "account", id: account.id })}
              />
            )}
          />
        </>
      )}
      <Button
        label="Валюты и курсы"
        variant="secondary"
        onPress={() => open({ type: "currencies" })}
      />
      <Button
        label="Добавить счёт"
        icon="add"
        variant="secondary"
        onPress={() => open({ type: "account" })}
      />
    </>
  );
}
