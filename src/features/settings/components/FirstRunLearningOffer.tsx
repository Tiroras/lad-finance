import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { View } from "react-native";
import { useFinance, useFinanceStatus } from "../../../state/finance";
import { getDraftStorage } from "../../../infrastructure/storage/draftStorage";
import { Button, C, ErrorText, font, Txt } from "../../../shared/ui";
import { tourSteps } from "../lib/tourSteps";
import { useLearningProgress } from "../model/useLearningProgress";

export function FirstRunLearningOffer({
  brand,
  onLearn,
}: {
  brand: ReactNode;
  onLearn: () => void;
}) {
  const { saveCurrentProfile, confirmCurrentSave } = useFinanceStatus();
  const { profile, state } = useFinance();
  const learning = useLearningProgress();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const run = useCallback(async (action: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Не удалось сохранить изменения. Попробуйте ещё раз.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }, []);
  const save = useCallback(
    () =>
      run(async () => {
        // Confirm the existing snapshot, never repeat completeOnboarding on retry.
        await confirmCurrentSave(profile, state);
        const drafts = getDraftStorage(profile);
        const stored = await drafts.load("onboarding");
        if (stored.draft) await drafts.clear(stored.draft.lease);
        setSaved(true);
      }),
    [run, confirmCurrentSave, profile, state],
  );
  useEffect(() => {
    void save();
  }, [save]);
  const finish = (learn: boolean) =>
    run(async () => {
      await saveCurrentProfile();
      await learning.update((value) => ({
        ...value,
        status: learn ? "started" : "skipped",
        step: tourSteps[0].id,
        firstRun: undefined,
      }));
      if (learn) onLearn();
    });
  return (
    <>
      <View style={{ alignItems: "center" }}>{brand}</View>
      <Txt
        accessibilityRole="header"
        accessibilityLiveRegion="polite"
        style={{
          fontFamily: font.bold,
          fontSize: 28,
          lineHeight: 37,
          textAlign: "center",
        }}
      >
        {saved
          ? "Хотите пройти обучение?"
          : busy
            ? "Сохраняем ваш учёт…"
            : "Не удалось сохранить учёт"}
      </Txt>
      {saved && (
        <>
          <Txt style={{ color: C.muted, lineHeight: 23, textAlign: "center" }}>
            Учёт настроен. Покажем, как записывать расходы, планировать платежи
            и понимать, сколько можно потратить.
          </Txt>
          <Txt style={{ color: C.muted, lineHeight: 23, textAlign: "center" }}>
            Обучение можно пропустить и открыть позже: Профиль → Обучение.
          </Txt>
        </>
      )}
      <ErrorText error={error} />
      {saved ? (
        <>
          <Button
            label="Пройти обучение"
            disabled={busy}
            onPress={() => void finish(true)}
          />
          <Button
            label="Начать без обучения"
            variant="secondary"
            disabled={busy}
            onPress={() => void finish(false)}
          />
        </>
      ) : (
        !busy && (
          <Button label="Повторить сохранение" onPress={() => void save()} />
        )
      )}
    </>
  );
}
