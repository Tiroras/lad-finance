import { Pressable, View } from "react-native";
import { accountToBase } from "../../../domain/currency";
import { accountBalance } from "../../../domain/finance";
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
  Row,
  Txt,
} from "../../../shared/ui";

export function AccountsContent({ open }: { open: OpenSheet }) {
  const { money, currency: baseCode } = useMoney();
  const { state } = useFinance();
  return (
    <>
      <Notice>
        Это ручной учёт. Названия счетов и остатки можно изменить; подключения к
        банкам в этой версии нет.
      </Notice>
      <CurrencyNotice />
      {state.accounts.map((account) => (
        <Pressable
          key={account.id}
          accessibilityRole="button"
          onPress={() => open({ type: "account", id: account.id })}
        >
          <Card>
            <Row>
              <IconTile name={account.icon} color={account.color} />
              <View style={{ flex: 1, gap: 6 }}>
                <Txt style={{ fontFamily: font.bold }}>{account.name}</Txt>
                <Txt style={{ color: C.muted, fontSize: 11 }}>
                  {account.kind === "savings"
                    ? "Накопления · вне доступного бюджета"
                    : "Повседневные расходы"}
                </Txt>
              </View>
              <Icon name="create-outline" size={18} color={C.muted} />
            </Row>
            <Txt style={{ fontFamily: font.bold, fontSize: 27, marginTop: 17 }}>
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
          </Card>
        </Pressable>
      ))}
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
