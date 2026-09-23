import { View } from "react-native";
import { C, Card, font, IconTile, Row, Txt } from "../../../shared/ui";

export function AboutSettings() {
  return (
    <>
      <Card style={{ backgroundColor: C.soft, gap: 16 }}>
        <Row>
          <IconTile name="leaf-outline" background={C.lime} size={45} />
          <View style={{ flex: 1, gap: 5 }}>
            <Txt style={{ fontFamily: font.bold, fontSize: 17 }}>
              Лад — ваши личные финансы
            </Txt>
            <Txt style={{ color: C.muted, fontSize: 12 }}>Версия 1.0</Txt>
          </View>
        </Row>
        <Txt style={{ fontSize: 13, lineHeight: 22 }}>
          Записи хранятся локально на этом устройстве. Регистрация, реклама и
          передача финансовых данных на сервер отсутствуют.
        </Txt>
      </Card>
      <Txt style={{ color: C.muted, fontSize: 12, textAlign: "center" }}>
        Сделано, чтобы с деньгами было спокойнее.
      </Txt>
    </>
  );
}
