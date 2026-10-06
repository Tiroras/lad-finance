import type { ReactNode } from "react";
import { View } from "react-native";
import {
  Button,
  C,
  Card,
  ErrorText,
  font,
  IconTile,
  Row,
  Txt,
} from "../../../shared/ui";

export function FirstRunWelcome({
  brand,
  busy,
  error,
  onStart,
}: {
  brand: ReactNode;
  busy: boolean;
  error: string;
  onStart: () => void;
}) {
  return (
    <>
      <View style={{ alignItems: "center", marginBottom: 8 }}>{brand}</View>
      <Txt
        accessibilityRole="header"
        style={{
          fontFamily: font.bold,
          fontSize: 28,
          lineHeight: 37,
          textAlign: "center",
        }}
      >
        Добро пожаловать в Лад
      </Txt>
      <Txt style={{ color: C.muted, lineHeight: 23, textAlign: "center" }}>
        Начните с остатков на счетах и ближайших планов. Это поможет понять,
        сколько можно потратить.
      </Txt>
      <ErrorText error={error} />
      <Button
        label={busy ? "Создаём личный профиль…" : "Настроить свой учёт"}
        disabled={busy}
        onPress={onStart}
      />
      <Card style={{ gap: 18, backgroundColor: C.soft }}>
        {(
          [
            { icon: "wallet-outline", title: "Понимайте, сколько у вас есть" },
            {
              icon: "swap-horizontal-outline",
              title: "Записывайте доходы и расходы",
            },
            { icon: "calendar-outline", title: "Учитывайте то, что впереди" },
          ] as const
        ).map((item) => (
          <Row key={item.title} style={{ gap: 12 }}>
            <IconTile name={item.icon} background={C.surface} size={40} />
            <Txt style={{ flex: 1, minWidth: 0, fontFamily: font.medium }}>
              {item.title}
            </Txt>
          </Row>
        ))}
      </Card>
      <Txt
        style={{
          color: C.muted,
          fontSize: 12,
          lineHeight: 20,
          textAlign: "center",
        }}
      >
        Без регистрации и подключения к банку. Данные сохраняются на вашем
        устройстве.
      </Txt>
    </>
  );
}
