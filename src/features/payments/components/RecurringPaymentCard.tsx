import { Pressable, Switch, View } from "react-native";
import { accountCurrency } from "../../../domain/currency";
import type { Recurring } from "../../../domain/types";
import { scheduleLabel } from "../../../domain/recurrence";
import { annualPreparation } from "../../../domain/payments";
import { dateLabel } from "../../../shared/lib/dates";
import {
  ErrorText,
  C,
  Card,
  font,
  IconTile,
  Row,
  Txt,
} from "../../../shared/ui";
import { useActionError } from "../../../shared/lib/useActionError";
import {
  useFinanceActions,
  useMoney,
  useFinance,
} from "../../../state/finance";
import type { OpenSheet } from "../../../application/navigation/types";

export function RecurringPaymentCard({
  payment: p,
  open,
}: {
  payment: Recurring;
  open: OpenSheet;
}) {
  const { money } = useMoney();
  const { state, today, notify } = useFinance();
  const preparation = annualPreparation(state, p, today);
  const actions = useFinanceActions();
  const { error, run } = useActionError();
  return (
    <Card style={{ padding: 16, opacity: p.active ? 1 : 0.65 }}>
      <Row>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Изменить платёж ${p.name}`}
          onPress={() => open({ type: "recurring", id: p.id })}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            flex: 1,
          }}
        >
          <IconTile name={p.icon} background={p.color} size={42} />
          <View style={{ flex: 1, gap: 5 }}>
            <Txt style={{ fontFamily: font.bold, fontSize: 13 }}>{p.name}</Txt>
            <Txt style={{ color: C.muted, fontSize: 10 }}>
              {p.active
                ? p.schedule
                  ? scheduleLabel(p.schedule)
                  : `Каждый месяц, ${p.day}-го числа`
                : "Исключён из плана"}
            </Txt>
          </View>
        </Pressable>
        <View style={{ alignItems: "flex-end", gap: 8 }}>
          <Txt style={{ fontFamily: font.bold, fontSize: 13 }}>
            {money(p.amount, false, accountCurrency(state, p.accountId))}
          </Txt>
          <Switch
            accessibilityLabel={`Учитывать ${p.name} в плане`}
            value={p.active}
            onValueChange={(active) =>
              run(() => {
                actions.setRecurringActive(p.id, active);
                notify(
                  active
                    ? "Платёж снова учтён в плане"
                    : "Платёж исключён из прогноза",
                );
              })
            }
            trackColor={{ false: "#DADDDA", true: "#73986C" }}
            thumbColor="#fff"
          />
        </View>
      </Row>
      <ErrorText error={error} />
      {preparation && (
        <Txt
          style={{
            color: C.muted,
            fontSize: 11,
            lineHeight: 18,
            marginTop: 12,
          }}
        >
          Подготовка с нуля к {dateLabel(preparation.date)}: около{" "}
          {money(
            preparation.monthly,
            true,
            accountCurrency(state, p.accountId),
          )}{" "}
          в месяц за {preparation.months} мес. Это ориентир для накопления;
          отдельный резерв не создаётся.
        </Txt>
      )}
    </Card>
  );
}
