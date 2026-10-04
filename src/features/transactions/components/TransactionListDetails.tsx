import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import {
  Button,
  C,
  font,
  Icon,
  interactionStyles,
  Txt,
  useTourTargetActive,
} from "../../../shared/ui";

export function TransactionListDetails({ onExport }: { onExport: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const tourExport = useTourTargetActive("transactions.export");
  const showDetails = expanded || tourExport;
  useEffect(() => {
    if (tourExport) setExpanded(true);
  }, [tourExport]);
  return (
    <View style={{ gap: 12 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Экспорт и пояснения"
        accessibilityState={{ expanded: showDetails }}
        aria-expanded={showDetails}
        onPress={() => setExpanded(!showDetails)}
        style={({ pressed }) => [
          {
            minHeight: 44,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            paddingVertical: 8,
          },
          pressed && interactionStyles.pressed,
        ]}
      >
        <Txt
          style={{
            color: C.green,
            fontFamily: font.semibold,
            fontSize: 13,
            flexShrink: 1,
          }}
        >
          Экспорт и пояснения
        </Txt>
        <Icon
          name={showDetails ? "chevron-up" : "chevron-down"}
          size={18}
          color={C.green}
        />
      </Pressable>
      {showDetails && (
        <View style={{ gap: 12 }}>
          <Txt style={{ color: C.muted, fontSize: 12, lineHeight: 19 }}>
            Возвраты уменьшают расходы; переводы и основная сумма долгов
            исключены из итогов. Доходы и расходы показываются в основной валюте
            по сохранённой оценке операции. Период и счёт для CSV выбираются
            отдельно в окне экспорта.
          </Txt>
          <Button
            tourId="transactions.export"
            label="Экспортировать операции в CSV"
            icon="download-outline"
            variant="secondary"
            onPress={onExport}
          />
        </View>
      )}
    </View>
  );
}
