import { Pressable } from "react-native";
import { font, Txt, Row, Icon, IconButton } from "../../ui";
import { dateLabel, monthKey, shiftMonth } from "../../domain/finance";

export function MonthPicker({
  month,
  onChange,
}: {
  month: string;
  onChange: (month: string) => void;
}) {
  return (
    <Row style={{ gap: 2 }}>
      <IconButton
        name="chevron-back"
        label="Предыдущий месяц"
        onPress={() => onChange(monthKey(shiftMonth(`${month}-01`, -1)))}
        style={{ width: 32, height: 36 }}
      />
      <Txt
        style={{
          fontFamily: font.semibold,
          fontSize: 12,
          textTransform: "capitalize",
          minWidth: 110,
          textAlign: "center",
        }}
      >
        {dateLabel(`${month}-01`, { month: "long", year: "numeric" }).replace(
          " г.",
          "",
        )}
      </Txt>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Следующий месяц"
        disabled={month >= monthKey()}
        onPress={() => onChange(monthKey(shiftMonth(`${month}-01`, 1)))}
        style={{ padding: 8, opacity: month >= monthKey() ? 0.25 : 1 }}
      >
        <Icon name="chevron-forward" size={18} />
      </Pressable>
    </Row>
  );
}
