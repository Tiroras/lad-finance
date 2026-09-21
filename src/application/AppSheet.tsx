import { View } from "react-native";
import { useFinance } from "../store";
import { C, Txt, Sheet } from "../ui";
import { useSecurity } from "../security/SecurityProvider";
import { LockScreen } from "../security/LockScreen";
import type { SheetState, OpenSheet } from "../navigation/types";
import { SheetContent } from "./SheetContent";

export function AppSheet({
  sheet,
  close,
  open,
}: {
  sheet: SheetState | null;
  close: () => void;
  open: OpenSheet;
}) {
  const security = useSecurity();
  const { toast } = useFinance();
  const titles: Record<SheetState["type"], string> = {
    transaction: sheet?.id ? "Детали операции" : "Новая операция",
    formula: "Всё прозрачно",
    simulate: "Примерка покупки",
    accounts: "Мои счета",
    account: sheet?.id ? "Настроить счёт" : "Новый счёт",
    settings: "Ваш Лад",
    currencies: "Валюты и курсы",
    goal: sheet?.id ? "Настроить цель" : "Новая мечта",
    fund: "Ближе к цели",
    recurring: sheet?.id ? "Настроить платёж" : "Новый платёж",
    budget: "Бюджет категории",
    payment: "Запланированный платёж",
    csv: "Импорт банковской выписки",
    categories: "Категории и подкатегории",
    category: sheet?.id ? "Настроить категорию" : "Новая категория",
    scenarios: "Мои сценарии",
    scenario: sheet?.id ? "Сохранённый сценарий" : "Новый сценарий",
    export: "Экспорт операций",
    forecast: "Прогноз по дням",
    forecastSettings: "Параметры прогноза",
    income: sheet?.id ? "План дохода" : "Запланировать доход",
  };

  return (
    <Sheet
      visible={!!sheet}
      contentKey={`${sheet?.type}-${sheet?.id ?? "new"}`}
      blockingContent={security.locked ? <LockScreen compact /> : undefined}
      title={sheet ? titles[sheet.type] : ""}
      onClose={close}
    >
      {/* Keep drafts mounted while the lock screen covers the form. */}
      <View key={`${sheet?.type}-${sheet?.id ?? "new"}`} style={{ gap: 20 }}>
        <SheetContent sheet={sheet} close={close} open={open} />
        {!!toast && (
          <Txt
            accessibilityRole="alert"
            style={{ color: C.green, fontSize: 12 }}
          >
            {toast}
          </Txt>
        )}
      </View>
    </Sheet>
  );
}
