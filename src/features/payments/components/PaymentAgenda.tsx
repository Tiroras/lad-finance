import { Pressable, StyleSheet, View } from "react-native";
import { accountCurrency, accountToBase } from "../../../domain/currency";
import {
  dateLabel,
  daysBetween,
  overduePayments,
  upcoming,
} from "../../../domain/finance";
import { useMoney, useFinance } from "../../../state/finance";
import { paymentPending } from "../../../domain/payments";
import type { OpenSheet } from "../../../application/navigation/types";
import {
  C,
  font,
  Icon,
  Notice,
  RecordList,
  Row,
  Section,
  Txt,
} from "../../../shared/ui";

export function PaymentAgenda({
  open,
  full = false,
}: {
  open: OpenSheet;
  full?: boolean;
}) {
  const { money } = useMoney();
  const { state, today } = useFinance();
  const overdue = overduePayments(state, today);
  const occurrences = [...overdue, ...upcoming(state, today)];
  return (
    <View style={{ gap: 12 }}>
      <Section title="Календарь платежей" />
      {overdue.length > 0 && (
        <Notice tone="warning">
          Просрочено: {overdue.length} ·{" "}
          {money(
            overdue.reduce(
              (sum, o) =>
                sum +
                accountToBase(state, o.payment.amount, o.payment.accountId),
              0,
            ),
          )}
          . Эти деньги остаются в резерве. Отметьте оплату или пропустите
          ненужный платёж.
        </Notice>
      )}
      {occurrences.length === 0 && (
        <Txt style={{ color: C.muted }}>На ближайший месяц платежей нет.</Txt>
      )}
      <RecordList
        items={occurrences}
        full={full}
        keyExtractor={({ payment, date, versionId }) =>
          `${payment.id}-${versionId ?? "legacy"}-${date}`
        }
        showAllLabel="Весь календарь платежей"
        onShowAll={() => open({ type: "list", list: "paymentAgenda" })}
        testID="payment-agenda-list"
        renderItem={({ payment, date, paid, skipped, versionId }) => {
          const pending = paymentPending(state, payment, date, versionId);
          const late = date < today && !paid && !skipped;
          const status = paid
            ? "Оплачен"
            : pending
              ? "Ожидает проведения"
              : skipped
                ? "Пропущен"
                : late
                  ? `Просрочен на ${daysBetween(date, today)} дн.`
                  : date === today
                    ? "Сегодня"
                    : "Запланирован";
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${payment.name}, ${dateLabel(date)}, ${status}, ${money(payment.amount, false, accountCurrency(state, payment.accountId))}`}
              onPress={() =>
                open({ type: "payment", id: payment.id, date, versionId })
              }
            >
              <Row style={[styles.item, late && { borderColor: "#EED6CD" }]}>
                <View style={styles.date}>
                  <Txt style={{ fontFamily: font.bold, fontSize: 17 }}>
                    {date.slice(-2)}
                  </Txt>
                  <Txt style={{ fontSize: 9, color: C.muted }}>
                    {dateLabel(date, { month: "short" })}
                  </Txt>
                </View>
                <View style={{ flex: 1, gap: 5 }}>
                  <Txt style={{ fontFamily: font.semibold, fontSize: 12 }}>
                    {payment.name}
                  </Txt>
                  <Txt
                    style={{
                      color: late ? C.red : paid ? C.green : C.muted,
                      fontSize: 10,
                    }}
                  >
                    {status}
                  </Txt>
                </View>
                <Txt style={{ fontFamily: font.bold, fontSize: 12 }}>
                  {money(
                    payment.amount,
                    false,
                    accountCurrency(state, payment.accountId),
                  )}
                </Txt>
                <Icon
                  name={paid ? "checkmark-circle" : "chevron-forward"}
                  size={17}
                  color={C.muted}
                />
              </Row>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    padding: 14,
    borderRadius: 17,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  date: {
    width: 42,
    alignItems: "center",
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: C.soft,
    gap: 3,
  },
});
