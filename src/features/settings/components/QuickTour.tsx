import { useState } from "react";
import { View } from "react-native";
import {
  Button,
  C,
  Card,
  font,
  IconTile,
  Row,
  Txt,
  type IName,
} from "../../../shared/ui";

type TourStep = {
  title: string;
  description: string;
  hint: string;
  items: { icon: IName; title: string; description: string }[];
};

const steps: TourStep[] = [
  {
    title: "Начните со счетов",
    description:
      "Укажите, где хранятся ваши деньги и сколько уже есть на каждом счёте.",
    hint: "На вкладке «Обзор» нажмите на карточку «На всех счетах», чтобы добавить или настроить счёт.",
    items: [
      {
        icon: "wallet-outline",
        title: "На повседневные расходы",
        description: "Карты, наличные и другие счета для трат",
      },
      {
        icon: "leaf-outline",
        title: "На накопления",
        description: "Деньги, которые вы откладываете отдельно",
      },
    ],
  },
  {
    title: "Записывайте операции",
    description:
      "Добавляйте покупки и поступления на вкладке «Операции». Записи обновляют остатки ваших счетов.",
    hint: "Перевод между своими счетами меняет остатки, но не считается доходом или расходом.",
    items: [
      {
        icon: "arrow-up-outline",
        title: "Расход",
        description: "Когда вы оплачиваете покупку или услугу",
      },
      {
        icon: "arrow-down-outline",
        title: "Доход",
        description: "Когда деньги уже поступили на счёт",
      },
      {
        icon: "swap-horizontal-outline",
        title: "Перевод",
        description: "Когда перемещаете деньги между счетами",
      },
    ],
  },
  {
    title: "Планируйте наперёд",
    description:
      "Укажите будущие доходы и платежи. На вкладке «План» удобно следить за обязательствами и целями.",
    hint: "Планы сами не меняют баланс. Когда платёж прошёл или доход поступил, запишите операцию.",
    items: [
      {
        icon: "calendar-outline",
        title: "Ближайшие платежи",
        description: "Суммы и даты, которые важно учесть",
      },
      {
        icon: "shield-checkmark-outline",
        title: "Резерв",
        description: "Остаток, который вы хотите сохранить",
      },
      {
        icon: "sunny-outline",
        title: "Можно потратить",
        description: "Ориентир на основе ваших счетов и планов",
      },
    ],
  },
];

export function QuickTour({
  onComplete,
  onSkip,
  onBack,
  onStepChange,
  backAccessibilityLabel = "Назад",
  finishLabel = "Далее",
  skipLabel = "Пропустить знакомство",
}: {
  onComplete: () => void;
  onSkip: () => void;
  onBack?: () => void;
  onStepChange?: () => void;
  backAccessibilityLabel?: string;
  finishLabel?: string;
  skipLabel?: string;
}) {
  const [step, setStep] = useState(0);
  const current = steps[step];
  const move = (next: number) => {
    setStep(next);
    onStepChange?.();
  };
  return (
    <View style={{ gap: 20 }}>
      <View style={{ gap: 10 }}>
        <Txt style={{ color: C.muted, fontSize: 12 }}>
          Шаг {step + 1} из {steps.length}
        </Txt>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ flexDirection: "row", gap: 6 }}
        >
          {steps.map((item, index) => (
            <View
              key={item.title}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                backgroundColor: index <= step ? C.green : C.border,
              }}
            />
          ))}
        </View>
      </View>
      <View style={{ gap: 10 }}>
        <Txt
          accessibilityRole="header"
          style={{ fontFamily: font.bold, fontSize: 25, lineHeight: 34 }}
        >
          {current.title}
        </Txt>
        <Txt style={{ color: C.muted, lineHeight: 22 }}>
          {current.description}
        </Txt>
      </View>
      <Card style={{ padding: 16, gap: 18, backgroundColor: C.soft }}>
        {current.items.map((item) => (
          <Row key={item.title} style={{ alignItems: "flex-start", gap: 12 }}>
            <IconTile name={item.icon} background={C.surface} size={40} />
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <Txt style={{ fontFamily: font.semibold }}>{item.title}</Txt>
              <Txt style={{ color: C.muted, fontSize: 12, lineHeight: 19 }}>
                {item.description}
              </Txt>
            </View>
          </Row>
        ))}
      </Card>
      <Txt style={{ color: C.muted, fontSize: 12, lineHeight: 20 }}>
        {current.hint}
      </Txt>
      <View style={{ gap: 10 }}>
        <Row>
          <Button
            label="Назад"
            accessibilityLabel={backAccessibilityLabel}
            variant="secondary"
            style={{ flex: 1 }}
            disabled={step === 0 && !onBack}
            onPress={() => (step > 0 ? move(step - 1) : onBack?.())}
          />
          <Button
            label={step === steps.length - 1 ? finishLabel : "Далее"}
            style={{ flex: 1 }}
            onPress={() =>
              step === steps.length - 1 ? onComplete() : move(step + 1)
            }
          />
        </Row>
        <Button label={skipLabel} variant="secondary" onPress={onSkip} />
      </View>
    </View>
  );
}
