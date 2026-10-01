import { Pressable, View } from "react-native";
import type {
  OpenSheet,
  SheetState,
} from "../../../application/navigation/types";
import { useFinance } from "../../../state/finance";
import { TourTarget, useTourAction } from "../../../shared/ui/Tour";
import {
  C,
  Card,
  font,
  Icon,
  IconTile,
  interactionStyles,
  Row,
  Section,
  Txt,
  type IName,
} from "../../../shared/ui";

type SettingsItem = {
  title: string;
  description: string;
  icon: IName;
  sheet: SheetState;
};

const groups: { title: string; items: SettingsItem[] }[] = [
  {
    title: "Финансы",
    items: [
      {
        title: "Профиль и планирование",
        description: "Имя, доход и резерв",
        icon: "person-outline",
        sheet: { type: "profileSettings" },
      },
      {
        title: "Валюты и курсы",
        description: "Основная валюта и обновление курсов",
        icon: "swap-horizontal-outline",
        sheet: { type: "currencies" },
      },
      {
        title: "Категории и подкатегории",
        description: "Группы расходов и их оформление",
        icon: "grid-outline",
        sheet: { type: "categories" },
      },
      {
        title: "Правила и шаблоны операций",
        description: "Быстрый ввод привычных операций",
        icon: "flash-outline",
        sheet: { type: "automation" },
      },
    ],
  },
  {
    title: "Приложение",
    items: [
      {
        title: "Профили",
        description: "Отдельный учёт для разных бюджетов",
        icon: "people-outline",
        sheet: { type: "profiles" },
      },
      {
        title: "Напоминания",
        description: "Уведомления о предстоящих платежах",
        icon: "notifications-outline",
        sheet: { type: "reminderSettings" },
      },
      {
        title: "Защита данных",
        description: "Блокировка и доступ к приложению",
        icon: "shield-checkmark-outline",
        sheet: { type: "securitySettings" },
      },
      {
        title: "Данные и копии",
        description: "Импорт, экспорт и резервные копии",
        icon: "folder-open-outline",
        sheet: { type: "dataSettings" },
      },
      {
        title: "Обучение",
        description: "Пошаговый маршрут по экранам приложения",
        icon: "compass-outline",
        sheet: { type: "guide" },
      },
      {
        title: "О приложении",
        description: "Версия и хранение данных",
        icon: "information-circle-outline",
        sheet: { type: "about" },
      },
    ],
  },
];

function SettingsLink({
  item,
  last,
  open,
}: {
  item: SettingsItem;
  last: boolean;
  open: OpenSheet;
}) {
  const tourAction = useTourAction();
  const tourId = `settings.${item.sheet.type}`;
  return (
    <TourTarget id={tourId}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={item.title}
        accessibilityHint={item.description}
        onPress={() => {
          open(item.sheet);
          tourAction(tourId);
        }}
        style={({ pressed }) => [
          {
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            paddingHorizontal: 14,
            paddingVertical: 12,
            minHeight: 68,
            borderBottomWidth: last ? 0 : 1,
            borderColor: C.border,
          },
          pressed && interactionStyles.pressed,
        ]}
      >
        <IconTile name={item.icon} size={36} />
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Txt style={{ fontFamily: font.semibold, fontSize: 14 }}>
            {item.title}
          </Txt>
          <Txt style={{ color: C.muted, fontSize: 11, lineHeight: 17 }}>
            {item.description}
          </Txt>
        </View>
        <Icon name="chevron-forward" size={17} color={C.muted} />
      </Pressable>
    </TourTarget>
  );
}

export function SettingsMenu({ open }: { open: OpenSheet }) {
  const { state, activeProfile } = useFinance();
  return (
    <>
      <Card style={{ backgroundColor: C.soft, padding: 16 }}>
        <Row style={{ gap: 14 }}>
          <IconTile name="leaf-outline" background={C.lime} size={42} />
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <Txt style={{ fontFamily: font.bold, fontSize: 18 }}>
              {state.settings.name || "Мой учёт"}
            </Txt>
            <Txt style={{ color: C.muted, fontSize: 12 }}>
              Профиль: {activeProfile.name}
            </Txt>
          </View>
        </Row>
      </Card>
      {groups.map((group) => (
        <View key={group.title} style={{ gap: 10 }}>
          <Section title={group.title} style={{ marginBottom: 0 }} />
          <Card style={{ padding: 0, overflow: "hidden" }}>
            {group.items.map((item, index) => (
              <SettingsLink
                key={item.sheet.type}
                item={item}
                last={index === group.items.length - 1}
                open={open}
              />
            ))}
          </Card>
        </View>
      ))}
    </>
  );
}
