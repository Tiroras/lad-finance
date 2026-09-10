import { useState } from "react";
import { View } from "react-native";
import {
  C,
  font,
  Txt,
  Row,
  Card,
  Icon,
  IconTile,
  Chip,
  Field,
  Notice,
} from "../ui";
import { useFinance } from "../store";
import {
  dateLabel,
  money,
  parseMoney,
  simulatePurchase,
} from "../domain/finance";
import { ErrorText } from "./ErrorText";

export function Simulator() {
  const { state, today } = useFinance();
  const [amount, setAmount] = useState("12000");
  const parsed = parseMoney(amount);
  const result = simulatePurchase(state, parsed ?? 0, today);
  return (
    <>
      <Notice>
        Примерьте покупку к плану. Это сценарий: деньги не списываются, операция
        не создаётся.
      </Notice>
      <Field
        label="Сколько стоит покупка, ₽"
        accessibilityLabel="Стоимость покупки"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        style={{ fontSize: 36, fontFamily: font.semibold }}
        maxLength={16}
      />
      <Row style={{ flexWrap: "wrap" }}>
        {[3000, 12000, 30000, 60000].map((n) => (
          <Chip
            key={n}
            label={money(n * 100)}
            active={parsed === n * 100}
            onPress={() => setAmount(String(n))}
          />
        ))}
      </Row>
      {parsed !== null && parsed > 0 ? (
        <>
          <Card
            style={{
              backgroundColor: result.affordable ? "#EAF0E4" : "#FAEEE5",
              borderColor: result.affordable ? "#DFE8D6" : "#F0DFD1",
              gap: 20,
            }}
          >
            <Row>
              <IconTile
                name={result.affordable ? "checkmark-outline" : "alert-outline"}
                background={result.affordable ? "#D9E6CB" : "#F3DCC9"}
                color={result.affordable ? C.green : C.orange}
              />
              <View style={{ flex: 1, gap: 6 }}>
                <Txt style={{ fontFamily: font.bold, fontSize: 18 }}>
                  {result.affordable
                    ? "Вписывается в ваш план"
                    : "Плану понадобится место"}
                </Txt>
                <Txt style={{ color: "#7D8574", fontSize: 11, lineHeight: 18 }}>
                  {result.affordable
                    ? "Платежи, резерв и взносы на цели сохраняются."
                    : `Для сохранения плана не хватает ${money(result.shortfall)}.`}
                </Txt>
              </View>
            </Row>
            <View style={{ height: 1, backgroundColor: "#D7DECD" }} />
            <Row style={{ justifyContent: "space-between" }}>
              <View style={{ gap: 6 }}>
                <Txt style={{ color: C.muted, fontSize: 11 }}>
                  На день сейчас
                </Txt>
                <Txt style={{ fontFamily: font.semibold, fontSize: 23 }}>
                  {money(result.daily)}
                </Txt>
              </View>
              <Icon name="arrow-forward" color="#97A18C" />
              <View style={{ gap: 6, alignItems: "flex-end" }}>
                <Txt style={{ color: C.muted, fontSize: 11 }}>
                  После покупки
                </Txt>
                <Txt
                  style={{
                    fontFamily: font.bold,
                    fontSize: 27,
                    color: result.affordable ? C.green : C.orange,
                  }}
                >
                  {money(result.dailyAfter)}
                </Txt>
              </View>
            </Row>
          </Card>
          <Row style={{ justifyContent: "space-between" }}>
            <Txt style={{ color: C.muted, fontSize: 12 }}>
              Останется свободных денег
            </Txt>
            <Txt style={{ fontFamily: font.bold }}>
              {money(Math.max(0, result.after))}
            </Txt>
          </Row>
          {!result.affordable && (
            <Notice tone="warning">
              Можно уменьшить стоимость покупки или пересмотреть план вручную.
              Лад не забирает деньги из ваших целей автоматически.
            </Notice>
          )}
          <Txt style={{ color: C.muted, fontSize: 11, lineHeight: 19 }}>
            Расчёт до {dateLabel(result.payday)} по текущим остаткам и известным
            платежам. Неучтённые расходы могут изменить результат.
          </Txt>
        </>
      ) : (
        <ErrorText error="Введите стоимость покупки больше нуля, не более 1 млрд ₽." />
      )}
    </>
  );
}
