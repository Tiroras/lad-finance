import { View, Pressable, Switch } from "react-native";
import { useFinance } from "../../store";
import { C, font, Txt, Row, Card, IconTile } from "../../ui";
import { localDate, money } from "../../domain/finance";
import type { OpenSheet } from "../../navigation/types";
import type { Recurring } from "../../domain/types";

export function RecurringPaymentCard({
  payment: p,
  open,
}: {
  payment: Recurring;
  open: OpenSheet;
}) {
  const { update, notify } = useFinance();
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
                ? `Каждый месяц, ${p.day}-го числа`
                : "Исключён из плана"}
            </Txt>
          </View>
        </Pressable>
        <View style={{ alignItems: "flex-end", gap: 8 }}>
          <Txt style={{ fontFamily: font.bold, fontSize: 13 }}>
            {money(p.amount)}
          </Txt>
          <Switch
            accessibilityLabel={`Учитывать ${p.name} в плане`}
            value={p.active}
            onValueChange={(active) => {
              update((s) => ({
                ...s,
                recurring: s.recurring.map((item) =>
                  item.id === p.id
                    ? {
                        ...item,
                        active,
                        startsOn: active ? localDate() : item.startsOn,
                      }
                    : item,
                ),
              }));
              notify(
                active
                  ? "Платёж снова учтён в плане"
                  : "Платёж исключён из прогноза",
              );
            }}
            trackColor={{ false: "#DADDDA", true: "#73986C" }}
            thumbColor="#fff"
          />
        </View>
      </Row>
    </Card>
  );
}
