import { Pressable, StyleSheet, View } from "react-native";
import { accountCurrency } from "../../../domain/currency";
import {
  dateLabel,
  localDate,
  overduePayments,
  upcoming,
} from "../../../domain/finance";
import { useMoney, useFinance } from "../../../state/finance";
import type { OpenSheet } from "../../../application/navigation/types";
import { C, font, Icon, Row, Txt } from "../../../shared/ui";

export function NextPaymentCard({ open }: { open: OpenSheet }) {
  const { money } = useMoney();
  const { state } = useFinance();
  const next = [...overduePayments(state), ...upcoming(state)].find(
    (p) => !p.paid && !p.skipped,
  );
  if (!next) return null;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        open({ type: "payment", id: next.payment.id, date: next.date })
      }
    >
      <Row style={st.upcoming}>
        <Icon name="calendar-outline" color={C.muted} size={20} />
        <View style={{ flex: 1 }}>
          <Txt style={{ fontSize: 11, fontFamily: font.semibold }}>
            {next.date < localDate() ? "Просрочен" : "Впереди"}:{" "}
            {next.payment.name}
          </Txt>
          <Txt style={{ color: C.muted, fontSize: 10, marginTop: 4 }}>
            {dateLabel(next.date)} · уже учтено в плане платежей
          </Txt>
        </View>
        <Txt style={{ fontFamily: font.bold, fontSize: 12 }}>
          {money(
            next.payment.amount,
            false,
            accountCurrency(state, next.payment.accountId),
          )}
        </Txt>
        <Icon name="chevron-forward" size={15} color={C.muted} />
      </Row>
    </Pressable>
  );
}

const st = StyleSheet.create({
  upcoming: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: "#F0F3EB",
    borderRadius: 16,
    padding: 15,
  },
});
