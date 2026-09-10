import { View, Pressable } from "react-native";
import { C, font, Txt, Row, Card, Icon, IconTile, Button, Notice } from "../ui";
import { useFinance } from "../store";
import { accountBalance, money } from "../domain/finance";
import type { OpenSheet } from "../navigation/types";

export function AccountsContent({ open }: { open: OpenSheet }) {
  const { state } = useFinance();
  return (
    <>
      <Notice>
        Это ручной учёт. Названия счетов и остатки можно изменить; подключения к
        банкам в этой версии нет.
      </Notice>
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
              {money(accountBalance(state, account.id))}
            </Txt>
          </Card>
        </Pressable>
      ))}
      <Button
        label="Добавить счёт"
        icon="add"
        variant="secondary"
        onPress={() => open({ type: "account" })}
      />
    </>
  );
}
