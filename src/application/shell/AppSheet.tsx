import type { ReactNode } from "react";
import { View } from "react-native";
import { Sheet } from "../../shared/ui";
import { useSecurity, LockScreen } from "../../features/security";
import type { SheetState, OpenSheet } from "../navigation/types";
import { SheetContent } from "./SheetContent";
import { SheetToast } from "./AppToast";
import type { DismissalController } from "../../shared/lib/dismissal";
import { listPageTitles } from "../navigation/listPages";

export function AppSheet({
  sheet,
  close,
  open,
  back,
  returnToGuide,
  returnToList,
  tourCoach,
  startTour,
  dismissal,
}: {
  sheet: SheetState | null;
  close: () => void;
  open: OpenSheet;
  back?: () => void;
  returnToGuide?: () => void;
  returnToList?: () => void;
  tourCoach?: ReactNode;
  startTour: (id?: string) => void;
  dismissal: DismissalController;
}) {
  const security = useSecurity();
  const id = sheet && "id" in sheet ? sheet.id : undefined;
  const contentKey =
    sheet?.type === "list"
      ? `list-${sheet.list}-${sheet.month ?? "current"}`
      : sheet?.type === "guide"
        ? `guide-${sheet.journey ? "journey" : (sheet.lesson ?? "catalog")}`
        : `${sheet?.type}-${id ?? "new"}`;
  const titles: Record<SheetState["type"], string> = {
    list: sheet?.type === "list" ? listPageTitles[sheet.list] : "Полный список",
    transaction: id ? "Детали операции" : "Новая операция",
    automation: "Правила и шаблоны",
    reconcile: "Сверка счёта",
    onboarding: "Начнём ваш учёт",
    guide: "Обучение",
    debt: id ? "Условия долга" : "Новый долг",
    repayDebt: "Возврат долга",
    repayCredit: "Погашение кредитной карты",
    formula: "Всё прозрачно",
    simulate: "Примерка покупки",
    accounts: "Мои счета",
    account: id ? "Настроить счёт" : "Новый счёт",
    settings: "Ваш Лад",
    profiles: "Профили",
    deleteData: "Удаление данных",
    profileSettings: "Профиль и планирование",
    reminderSettings: "Напоминания",
    securitySettings: "Защита данных",
    dataSettings: "Данные и копии",
    about: "О приложении",
    currencies: "Валюты и курсы",
    goal: id ? "Настроить цель" : "Новая мечта",
    fund: "Ближе к цели",
    withdrawGoal: "Вывести из цели",
    recurring: id ? "Настроить платёж" : "Новый платёж",
    budget: "Бюджет категории",
    payment: "Запланированный платёж",
    csv: "Импорт банковской выписки",
    importResult: "Результат импорта",
    categories: "Категории и подкатегории",
    category: id ? "Настроить категорию" : "Новая категория",
    scenarios: "Мои сценарии",
    scenario: id ? "Сохранённый сценарий" : "Новый сценарий",
    export: "Экспорт операций",
    forecast: "Прогноз по дням",
    forecastSettings: "Параметры прогноза",
    income: id ? "План дохода" : "Запланировать доход",
  };

  return (
    <Sheet
      dismissal={dismissal}
      visible={!!sheet}
      contentKey={contentKey}
      blockingContent={security.locked ? <LockScreen compact /> : undefined}
      title={sheet ? titles[sheet.type] : ""}
      fullScreen={sheet?.type === "list"}
      onClose={close}
      onBack={back ?? (sheet?.type === "list" ? close : undefined)}
      headerAccessory={tourCoach}
    >
      {/* Keep drafts mounted while the lock screen covers the form. */}
      <View key={contentKey} style={{ gap: 20 }}>
        <SheetContent
          sheet={sheet}
          close={close}
          back={back}
          open={open}
          returnToGuide={returnToGuide}
          returnToList={returnToList}
          startTour={startTour}
        />
        <SheetToast />
      </View>
    </Sheet>
  );
}
