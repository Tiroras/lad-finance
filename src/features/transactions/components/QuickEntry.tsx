import { Pressable } from "react-native";
import { C, Card, Field, font, Icon, Row, Txt } from "../../../shared/ui";

export function QuickEntry({
  value,
  onChange,
  onApply,
}: {
  value: string;
  onChange: (value: string) => void;
  onApply: (input: string) => void;
}) {
  return (
    <Card
      style={{
        backgroundColor: C.lavender,
        borderColor: "#E5E0EE",
        gap: 12,
      }}
    >
      <Row>
        <Icon name="flash-outline" color="#8C7FA4" size={18} />
        <Txt style={{ fontFamily: font.bold, color: "#756785", fontSize: 12 }}>
          Запишите как говорите
        </Txt>
      </Row>
      <Row>
        <Field
          containerStyle={{ flex: 1 }}
          style={{ backgroundColor: "#fff" }}
          accessibilityLabel="Быстрый ввод"
          placeholder="Кофе 320"
          value={value}
          onChangeText={onChange}
          onSubmitEditing={() => onApply(value)}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Распознать запись"
          onPress={() => onApply(value)}
          style={{
            padding: 13,
            backgroundColor: "#DED7E8",
            borderRadius: 13,
          }}
        >
          <Icon name="arrow-forward" color="#756785" />
        </Pressable>
      </Row>
      <Txt style={{ color: "#91869E", fontSize: 10 }}>
        Распознаётся на устройстве · проверьте перед сохранением
      </Txt>
    </Card>
  );
}
