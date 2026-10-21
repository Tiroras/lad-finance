import { View } from "react-native";
import type { ReminderStatus } from "../../../infrastructure/notifications/notifications.types";
import { dateLabel } from "../../../shared/lib/dates";
import { Button, C, Notice, Txt } from "../../../shared/ui";

const timeLabel = (at: number) =>
  new Date(at).toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export function ReminderQueueStatus({
  profileName,
  result,
  error,
  updating,
  lastSuccessAt,
  retry,
}: {
  profileName: string;
  result: ReminderStatus | null;
  error: string;
  updating: boolean;
  lastSuccessAt?: number;
  retry: () => void;
}) {
  const failure =
    error ||
    (result?.status === "error"
      ? result.error || "Не удалось обновить напоминания."
      : "");
  const ready = !updating && !failure && result?.status === "ready";
  return (
    <View style={{ gap: 12 }} accessibilityLiveRegion="polite">
      <Txt style={{ fontSize: 12, color: C.muted }}>
        Текущий профиль: {profileName}. При смене профиля очередь заменяется.
      </Txt>
      {updating ? (
        <Notice>
          Обновляем очередь напоминаний. Её состав ещё не подтверждён.
        </Notice>
      ) : failure ? (
        <>
          <Notice tone="warning">
            {failure} Очередь может содержать только часть нужных или прежние
            уведомления.
          </Notice>
          <Txt style={{ fontSize: 12, color: C.muted }}>
            {result?.count == null
              ? "Число уведомлений на устройстве сейчас неизвестно."
              : `В очереди этого профиля найдено: ${result.count}. Соответствие плану не подтверждено.`}
          </Txt>
          <Button label="Повторить настройку напоминаний" onPress={retry} />
        </>
      ) : result?.status === "denied" ? (
        <Notice tone="warning">
          {result.deniedReason === "channel"
            ? "Канал «Напоминания о платежах» отключён в настройках телефона."
            : "Разрешение на уведомления отключено в системе."}
        </Notice>
      ) : result?.status === "off" ? (
        <Txt style={{ fontSize: 12, color: C.muted }}>
          Напоминания выключены. Очередь Лада очищена.
        </Txt>
      ) : null}
      {ready && (
        <>
          <Txt style={{ fontSize: 12 }}>
            В очереди этого профиля: {result.count}.
            {result.count === 0 ? " В этом окне нет будущих напоминаний." : ""}
          </Txt>
          <Txt style={{ fontSize: 12, color: C.muted }}>
            Очередь проверена: {timeLabel(result.syncedAt)}.
          </Txt>
          <Txt style={{ fontSize: 12, color: C.muted }}>
            Окно планирования — по{" "}
            {dateLabel(result.windowEnd, {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}{" "}
            включительно.
          </Txt>
          {result.lastNotificationAt !== undefined && (
            <Txt style={{ fontSize: 12, color: C.muted }}>
              Последнее сообщение в очереди:{" "}
              {timeLabel(result.lastNotificationAt)}.
            </Txt>
          )}
          {result.truncated && (
            <Notice tone="warning">
              Очередь заполнена.
              {result.firstOmittedAt !== undefined
                ? ` Первое непоместившееся сообщение: ${timeLabel(result.firstOmittedAt)}.`
                : ""}{" "}
              Последнее сообщение в очереди не означает полного покрытия этой
              даты. При следующих открытиях добавим актуальные будущие
              сообщения, если освободятся места. Сообщения с уже прошедшим
              временем могут быть пропущены.
            </Notice>
          )}
        </>
      )}
      {!ready &&
        (updating || !!failure || result?.status === "denied") &&
        lastSuccessAt !== undefined && (
          <Txt style={{ fontSize: 12, color: C.muted }}>
            Последнее успешное обновление: {timeLabel(lastSuccessAt)}. Это не
            подтверждает текущий состав очереди.
          </Txt>
        )}
      <Txt style={{ fontSize: 12, lineHeight: 20, color: C.muted }}>
        До 60 уведомлений на 60 календарных дней, включая сегодня. Платежи,
        просрочки и напоминания о выписке делят эту очередь. Обновляем её при
        открытии, возвращении в приложение и изменении планов. Без новых
        запусков очередь не пополняется. О просрочках напоминаем раз в день в
        течение ближайшей недели. Все даты и время — местные; доставка зависит
        от настроек телефона и ограничений системы.
      </Txt>
    </View>
  );
}
