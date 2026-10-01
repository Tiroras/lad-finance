import { Pressable, View } from "react-native";
import { accountToBase } from "../../../domain/currency";
import { accountBalance } from "../../../domain/finance";
import { useMoney, useFinance } from "../../../state/finance";
import type { OpenSheet } from "../../../application/navigation/types";
import {
  C,
  Card,
  font,
  Icon,
  IconTile,
  Row,
  TourTarget,
  Txt,
  useTourAction,
} from "../../../shared/ui";

export function AccountsSummary({
  open,
  hidden,
}: {
  open: OpenSheet;
  hidden: boolean;
}) {
  const tourAction = useTourAction();
  const { money, symbol: baseSymbol } = useMoney();
  const { state } = useFinance();
  const balance = state.accounts.reduce(
    (sum, account) =>
      sum + accountToBase(state, accountBalance(state, account.id), account.id),
    0,
  );
  return (
    <TourTarget id="home.accounts">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Открыть мои счета"
        onPress={() => {
          open({ type: "accounts" });
          tourAction("home.accounts");
        }}
      >
        <Card style={{ padding: 17 }}>
          <Row>
            <IconTile name="wallet-outline" background="#F1F3EC" size={40} />
            <View style={{ flex: 1, gap: 5 }}>
              <Txt style={{ color: C.muted, fontSize: 10 }}>На всех счетах</Txt>
              <Txt style={{ fontSize: 20, fontFamily: font.bold }}>
                {hidden ? `••• ••• ${baseSymbol}` : money(balance)}
              </Txt>
            </View>
            <Txt style={{ color: C.muted, fontSize: 10 }}>
              {state.accounts.length} счёта
            </Txt>
            <Icon name="chevron-forward" size={16} color={C.muted} />
          </Row>
        </Card>
      </Pressable>
    </TourTarget>
  );
}
