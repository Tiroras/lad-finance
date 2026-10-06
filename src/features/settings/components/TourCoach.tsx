import { Pressable, StyleSheet, View } from "react-native";
import { C, ErrorText, font, Icon, Row, Txt } from "../../../shared/ui";
import type { TourStep } from "../lib/tourSteps";

export function TourCoach({
  step,
  index,
  total,
  busy,
  error,
  onBack,
  onSkip,
  onPause,
  onSkipTour,
}: {
  step: TourStep;
  index: number;
  total: number;
  busy: boolean;
  error: string;
  onBack: () => void;
  onSkip: () => void;
  onPause: () => void;
  onSkipTour: () => void;
}) {
  return (
    <View testID="tour-coach" style={s.coach}>
      <Row style={{ justifyContent: "space-between", gap: 10 }}>
        <Txt
          style={{ color: C.green, fontSize: 11, fontFamily: font.semibold }}
        >
          ПО ПРИЛОЖЕНИЮ · {index + 1} / {total}
        </Txt>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Продолжить позже"
          onPress={onPause}
          style={s.pause}
        >
          <Icon name="pause-outline" size={16} />
          <Txt style={{ fontSize: 12 }}>Пауза</Txt>
        </Pressable>
      </Row>
      <Txt
        accessibilityRole="header"
        style={{ fontFamily: font.bold, fontSize: 16 }}
      >
        {step.title}
      </Txt>
      <Txt
        accessibilityLiveRegion="polite"
        style={{ fontSize: 13, lineHeight: 19 }}
      >
        {step.text}
      </Txt>
      <ErrorText error={error} />
      <Row style={{ gap: 18, justifyContent: "space-between" }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад по экскурсии"
          disabled={busy || index === 0}
          accessibilityState={{ disabled: busy || index === 0 }}
          onPress={onBack}
          style={[s.action, (busy || index === 0) && { opacity: 0.35 }]}
        >
          <Txt style={s.link}>← Назад</Txt>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Пропустить шаг"
          disabled={busy}
          accessibilityState={{ disabled: busy }}
          onPress={onSkip}
          style={s.action}
        >
          <Txt style={s.link}>{busy ? "Сохраняем…" : "Пропустить шаг →"}</Txt>
        </Pressable>
      </Row>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Пропустить экскурсию"
        accessibilityHint="Убрать подсказки и предложение продолжить. Начать заново можно в разделе Обучение."
        disabled={busy}
        accessibilityState={{ disabled: busy }}
        onPress={onSkipTour}
        style={[s.action, { minHeight: 44 }, busy && { opacity: 0.35 }]}
      >
        <Txt style={s.link}>Пропустить экскурсию</Txt>
      </Pressable>
    </View>
  );
}
const s = StyleSheet.create({
  coach: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 680,
    backgroundColor: C.lime,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#B4CE8A",
  },
  pause: {
    minHeight: 32,
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
    paddingHorizontal: 4,
  },
  action: { minHeight: 32, justifyContent: "center", paddingHorizontal: 4 },
  link: { fontSize: 12, color: C.green, fontFamily: font.semibold },
});
