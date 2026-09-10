import { View, Pressable } from "react-native";
import { useFinance } from "../../store";
import { C, font, Txt, Row, Card, Icon, IconTile } from "../../ui";
import { accountBalance, money } from "../../domain/finance";
import type { OpenSheet } from "../../navigation/types";

export function AccountsSummary({
  open,
  hidden,
}: {
  open: OpenSheet;
  hidden: boolean;
}) {
  const { state } = useFinance();
  const balance = state.accounts.reduce(
    (sum, account) => sum + accountBalance(state, account.id),
    0,
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Открыть мои счета"
      onPress={() => open({ type: "accounts" })}
    >
      <Card style={{ padding: 17 }}>
        <Row>
          <IconTile name="wallet-outline" background="#F1F3EC" size={40} />
          <View style={{ flex: 1, gap: 5 }}>
            <Txt style={{ color: C.muted, fontSize: 10 }}>На всех счетах</Txt>
            <Txt style={{ fontSize: 20, fontFamily: font.bold }}>
              {hidden ? "••• ••• ₽" : money(balance)}
            </Txt>
          </View>
          <Txt style={{ color: C.muted, fontSize: 10 }}>
            {state.accounts.length} счёта
          </Txt>
          <Icon name="chevron-forward" size={16} color={C.muted} />
        </Row>
      </Card>
    </Pressable>
  );
}
