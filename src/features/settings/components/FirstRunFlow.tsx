import { useRef, useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
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
import { QuickTour } from "./QuickTour";

type IntroPage = "welcome" | "tour" | "finish";

export function FirstRunFlow({
  brand,
  onFinish,
}: {
  brand: ReactNode;
  onFinish: (setup: boolean) => Promise<void>;
}) {
  const [page, setPage] = useState<IntroPage>("welcome");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const scrollToStart = () =>
    scroll.current?.scrollTo({ y: 0, animated: false });
  const show = (next: IntroPage) => {
    setPage(next);
    setError("");
    scrollToStart();
  };
  const finish = async (setup: boolean) => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      await onFinish(setup);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Не удалось создать личный профиль. Попробуйте ещё раз.",
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  return (
    <ScrollView
      ref={scroll}
      style={{ flex: 1, width: "100%", backgroundColor: C.bg }}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.column}>
        <View style={{ alignItems: "center", marginBottom: 8 }}>{brand}</View>
        {page === "welcome" && (
          <>
            <View style={{ gap: 12 }}>
              <Txt accessibilityRole="header" style={styles.title}>
                Добро пожаловать в Лад
              </Txt>
              <Txt style={styles.description}>
                Соберите деньги, повседневные расходы и планы в одном месте.
                Начните с короткого знакомства — всего три шага.
              </Txt>
            </View>
            <Card style={{ gap: 18, backgroundColor: C.soft }}>
              {(
                [
                  {
                    icon: "wallet-outline",
                    title: "Понимайте, сколько у вас есть",
                  },
                  {
                    icon: "swap-horizontal-outline",
                    title: "Записывайте доходы и расходы",
                  },
                  {
                    icon: "calendar-outline",
                    title: "Учитывайте то, что впереди",
                  },
                ] as const
              ).map((item) => (
                <Row key={item.title} style={{ gap: 12 }}>
                  <IconTile name={item.icon} background={C.surface} size={40} />
                  <Txt
                    style={{ flex: 1, minWidth: 0, fontFamily: font.medium }}
                  >
                    {item.title}
                  </Txt>
                </Row>
              ))}
            </Card>
            <View style={{ gap: 10 }}>
              <Button label="Начать знакомство" onPress={() => show("tour")} />
              <Button
                label="Пропустить знакомство"
                variant="secondary"
                onPress={() => show("finish")}
              />
            </View>
            <Txt style={styles.footnote}>
              Без регистрации и подключения к банку. Данные сохраняются на вашем
              устройстве.
            </Txt>
          </>
        )}
        {page === "tour" && (
          <QuickTour
            onComplete={() => show("finish")}
            onSkip={() => show("finish")}
            onBack={() => show("welcome")}
            onStepChange={scrollToStart}
          />
        )}
        {page === "finish" && (
          <>
            <View style={{ alignItems: "center" }}>
              <IconTile name="person-outline" background={C.lime} size={64} />
            </View>
            <View style={{ gap: 12 }}>
              <Txt accessibilityRole="header" style={styles.title}>
                Ваш личный профиль
              </Txt>
              <Txt style={styles.description}>
                Создадим профиль «Личный» для ваших счетов, операций и планов.
                Дополнительные профили необязательны: их можно добавить позже в
                настройках.
              </Txt>
            </View>
            <Card style={{ gap: 8, backgroundColor: C.soft }}>
              <Txt style={{ fontFamily: font.semibold }}>
                Как хотите начать?
              </Txt>
              <Txt style={{ color: C.muted, lineHeight: 22 }}>
                Настройка поможет указать остатки и ближайшие планы. Или
                откройте пустой профиль и добавляйте данные в своём темпе.
              </Txt>
            </Card>
            <ErrorText error={error} />
            {busy && (
              <Txt accessibilityLiveRegion="polite" style={styles.footnote}>
                Создаём личный профиль…
              </Txt>
            )}
            <View style={{ gap: 10 }}>
              <Button
                label="Настроить свой учёт"
                disabled={busy}
                onPress={() => void finish(true)}
              />
              <Button
                label="Начать с пустым профилем"
                variant="secondary"
                disabled={busy}
                onPress={() => void finish(false)}
              />
              <Button
                label="Назад"
                variant="secondary"
                disabled={busy}
                onPress={() => show("welcome")}
              />
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 22,
    paddingVertical: 30,
  },
  column: { width: "100%", maxWidth: 480, gap: 24 },
  title: {
    fontFamily: font.bold,
    fontSize: 28,
    lineHeight: 37,
    textAlign: "center",
  },
  description: { color: C.muted, lineHeight: 23, textAlign: "center" },
  footnote: {
    color: C.muted,
    fontSize: 12,
    lineHeight: 20,
    textAlign: "center",
  },
});
