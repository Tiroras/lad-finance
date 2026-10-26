import { useRef, useState } from "react";
import type { FinanceProfile } from "../../../domain/profiles";
import { useFinance, useFinanceStatus } from "../../../state/finance";
import {
  Button,
  Card,
  ErrorText,
  Field,
  Notice,
  Txt,
  font,
} from "../../../shared/ui";

export function DeleteDataConfirmation({
  profileId,
  cancel,
}: {
  profileId?: FinanceProfile;
  cancel: () => void;
}) {
  const { profiles } = useFinance();
  const { deleteData, financeWriteBlocked } = useFinanceStatus();
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const running = useRef(false);
  const target = profiles.find((profile) => profile.id === profileId);
  const all = profileId === undefined;
  const blocked = financeWriteBlocked || busy;
  const last = !all && profiles.filter((p) => p.id !== "demo").length === 1;
  const remove = async () => {
    if (blocked || running.current || confirmation.trim() !== "УДАЛИТЬ") return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await deleteData(
        all ? { type: "all" } : { type: "profile", profile: profileId },
      );
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Не удалось начать удаление. Повторите попытку.",
      );
      running.current = false;
      setBusy(false);
    }
  };
  return (
    <>
      <Txt
        accessibilityRole="header"
        style={{ fontFamily: font.bold, fontSize: 20 }}
      >
        {all
          ? "Удалить все профили и данные?"
          : `Удалить профиль «${target?.name ?? "не найден"}»?`}
      </Txt>
      <Notice tone="warning">
        {all
          ? "Все локальные профили, их счета, операции, остатки, категории, бюджеты, цели, долги, планы и сценарии будут удалены. Также удалятся черновики, настройки, напоминания и прогресс обучения."
          : `Все данные профиля «${target?.name ?? "не найден"}»: счета, операции, остатки, категории, бюджеты, цели, долги, планы, сценарии, настройки и черновики будут удалены вместе с его напоминаниями. Другие профили и общая защита приложения сохранятся.`}
      </Notice>
      <Txt style={{ lineHeight: 22 }}>
        Отменить удаление невозможно.{" "}
        {all
          ? "Если данные нужны, сначала по очереди откройте каждый нужный профиль и сохраните отдельную резервную копию в разделе «Данные и копии»."
          : `Если данные нужны, сначала откройте профиль «${target?.name ?? "не найден"}» и сохраните его резервную копию в разделе «Данные и копии».`}{" "}
        Ранее экспортированные файлы останутся у вас — приложение их не удаляет.
      </Txt>
      {(all || last) && (
        <Card>
          <Txt style={{ lineHeight: 22 }}>
            {all ? "После сброса" : "После удаления последнего профиля"}{" "}
            откроется «Добро пожаловать в Лад». Можно будет заново пройти
            настройку и обучение.
          </Txt>
        </Card>
      )}
      <Field
        label="Для подтверждения введите УДАЛИТЬ"
        accessibilityLabel="Для подтверждения введите УДАЛИТЬ"
        value={confirmation}
        onChangeText={setConfirmation}
        editable={!blocked}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      <ErrorText error={error} />
      <Button
        label={
          busy
            ? "Удаляем данные…"
            : all
              ? "Удалить все данные безвозвратно"
              : "Удалить профиль безвозвратно"
        }
        variant="danger"
        disabled={
          blocked || (!all && !target) || confirmation.trim() !== "УДАЛИТЬ"
        }
        onPress={() => void remove()}
      />
      <Button
        label="Отмена удаления"
        variant="secondary"
        disabled={busy}
        onPress={cancel}
      />
    </>
  );
}
