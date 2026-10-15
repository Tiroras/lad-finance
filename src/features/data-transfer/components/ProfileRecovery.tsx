import { useState, type ReactNode } from "react";
import { View } from "react-native";
import type { FinanceProfile } from "../../../domain/profiles";
import { useFinanceStatus } from "../../../state/finance";
import { Button, Card, Notice, Txt } from "../../../shared/ui";
import { DataConfirmation } from "./DataConfirmation";

const statuses = {
  readable: "Снимок читается",
  unavailable: "Снимок пока недоступен; записи сохранены",
  damaged: "Не удалось проверить снимок; записи сохранены",
  missing: "Сохранённый снимок не найден",
};

export function ProfileRecovery({
  importControls,
}: {
  importControls?: ReactNode;
}) {
  const {
    recoveryPreview,
    pendingRecovery,
    switching,
    scanProfileRecovery,
    cancelProfileRecovery,
    confirmProfileRecovery,
    resumeProfileRecovery,
  } = useFinanceStatus();
  const [selected, setSelected] = useState<FinanceProfile | null>(null);
  const [rollback, setRollback] = useState(false);
  const [error, setError] = useState("");
  const run = async (task: () => Promise<void>) => {
    setError("");
    try {
      await task();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Не удалось завершить восстановление. Попробуйте ещё раз.",
      );
    }
  };
  const target = recoveryPreview?.entries.find((p) => p.id === selected);
  return (
    <View style={{ gap: 15, marginTop: 20, width: "100%", maxWidth: 380 }}>
      <Notice tone="warning">
        Список профилей можно восстановить по сохранённым записям. Проверка
        ничего не меняет и не удаляет. Названия профилей — открытые служебные
        данные.
      </Notice>
      {pendingRecovery ? (
        <>
          <Txt>
            Найдено прерванное восстановление. Продолжение использует ту же
            операцию и тот же профиль.
          </Txt>
          {pendingRecovery.kind === "import" && (
            <Txt>
              Если снимок ещё не записан, выберите исходную копию повторно.
              Новый дубликат профиля не создаётся.
            </Txt>
          )}
          <Button
            label={
              pendingRecovery.stage === "restoring-original"
                ? "Продолжить возврат списка"
                : "Продолжить восстановление списка"
            }
            disabled={switching}
            onPress={() =>
              void run(() =>
                resumeProfileRecovery(
                  pendingRecovery.stage === "restoring-original"
                    ? "restore-original"
                    : "continue",
                ),
              )
            }
          />
          <Button
            label="Вернуть прежний список профилей"
            variant="secondary"
            disabled={switching}
            onPress={() => setRollback(true)}
          />
          {rollback && (
            <DataConfirmation
              title="Вернуть прежний список?"
              confirmLabel="Подтвердить возврат списка"
              busy={switching}
              onConfirm={() =>
                void run(async () => {
                  await resumeProfileRecovery("restore-original");
                  setRollback(false);
                })
              }
              onCancel={() => setRollback(false)}
            >
              Вернутся только прежний список и выбор профиля. Финансовые записи,
              включая уже записанный новый профиль, не удаляются. Повреждённый
              прежний список по-прежнему потребует восстановления.
            </DataConfirmation>
          )}
        </>
      ) : (
        <>
          <Button
            label="Проверить сохранённые профили"
            disabled={switching}
            onPress={() =>
              void run(async () => {
                setSelected(null);
                await scanProfileRecovery();
              })
            }
          />
          {recoveryPreview && (
            <>
              {recoveryPreview.entries.map((entry) => (
                <Card key={entry.id} style={{ gap: 10 }}>
                  <Txt>{entry.name}</Txt>
                  <Txt>{statuses[entry.status]}</Txt>
                  {entry.summary && (
                    <Txt>
                      {entry.summary.accounts} счетов,{" "}
                      {entry.summary.transactions} операций,{" "}
                      {entry.summary.goals} целей
                    </Txt>
                  )}
                  <Button
                    label={`Выбрать профиль: ${entry.name}`}
                    variant={selected === entry.id ? "primary" : "secondary"}
                    disabled={switching || entry.status === "missing"}
                    onPress={() => setSelected(entry.id)}
                  />
                </Card>
              ))}
              {target && (
                <DataConfirmation
                  title={`Восстановить список и выбрать «${target.name}»?`}
                  confirmLabel="Подтвердить восстановление списка"
                  busy={switching}
                  onConfirm={() =>
                    void run(() => confirmProfileRecovery(target.id))
                  }
                  onCancel={() => setSelected(null)}
                >
                  Будет заменён только список профилей. Снимки и ключи останутся
                  на месте. Недоступный снимок не заменяется пустым учётом; его
                  можно будет прочитать повторно или восстановить из копии.
                </DataConfirmation>
              )}
              <Button
                label="Отмена проверки профилей"
                variant="secondary"
                disabled={switching}
                onPress={() => {
                  setSelected(null);
                  cancelProfileRecovery();
                  setError("");
                }}
              />
            </>
          )}
        </>
      )}
      {importControls}
      {!!error && <Notice tone="warning">{error}</Notice>}
    </View>
  );
}
