import { useState } from "react";
import { Pressable, View } from "react-native";
import { accountCurrency } from "../../../domain/currency";
import type { Recurring } from "../../../domain/types";
import { goalFundCycleForPayment } from "../../../domain/goalFunds";
import { scheduleLabel } from "../../../domain/recurrence";
import { recurringPausePreview } from "../../../domain/actions/recurring";
import {
  annualPreparation,
  overduePayments,
  paymentVersions,
  resolvePaymentOccurrence,
} from "../../../domain/payments";
import { dateLabel } from "../../../shared/lib/dates";
import {
  ErrorText,
  C,
  Card,
  font,
  IconTile,
  Row,
  Txt,
  Toggle,
  Button,
  Notice,
} from "../../../shared/ui";
import { useActionError } from "../../../shared/lib/useActionError";
import {
  useFinanceActions,
  useMoney,
  useFinance,
} from "../../../state/finance";
import type { OpenSheet } from "../../../application/navigation/types";

export function RecurringPaymentCard({
  payment: p,
  open,
}: {
  payment: Recurring;
  open: OpenSheet;
}) {
  const { money } = useMoney();
  const { state, today, notify } = useFinance();
  const preparation = annualPreparation(state, p, today);
  const latestTerms = paymentVersions(p, today)
    .filter((version) => !version.voided)
    .at(-1);
  const futureFrom =
    p.active && latestTerms && latestTerms.effectiveFrom > today
      ? latestTerms.effectiveFrom
      : undefined;
  const actions = useFinanceActions();
  const { error, run } = useActionError();
  const [confirmActive, setConfirmActive] = useState<boolean | null>(null);
  const preview =
    confirmActive === false
      ? recurringPausePreview(state, p.id, today)
      : undefined;
  const arrears =
    confirmActive !== null
      ? overduePayments(state, today).filter((item) => item.payment.id === p.id)
      : [];
  return (
    <Card style={{ padding: 16, opacity: p.active ? 1 : 0.65 }}>
      <Row>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Изменить платёж ${p.name}`}
          onPress={() => open({ type: "recurring", id: p.id })}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            flex: 1,
          }}
        >
          <IconTile name={p.icon} background={p.color} size={42} />
          <View style={{ flex: 1, gap: 5 }}>
            <Txt style={{ fontFamily: font.bold, fontSize: 13 }}>{p.name}</Txt>
            <Txt style={{ color: C.muted, fontSize: 10 }}>
              {p.active
                ? p.schedule
                  ? scheduleLabel(p.schedule)
                  : `Каждый месяц, ${p.day}-го числа`
                : "Будущие повторения остановлены"}
            </Txt>
          </View>
        </Pressable>
        <View style={{ alignItems: "flex-end", gap: 8 }}>
          <Txt style={{ fontFamily: font.bold, fontSize: 13 }}>
            {money(p.amount, false, accountCurrency(state, p.accountId))}
          </Txt>
          <Toggle
            accessibilityLabel={`Учитывать ${p.name} в плане`}
            value={p.active}
            onValueChange={setConfirmActive}
          />
        </View>
      </Row>
      {futureFrom && (
        <Txt
          style={{
            color: C.muted,
            fontSize: 11,
            lineHeight: 18,
            marginTop: 12,
          }}
        >
          Показанные сумма и график действуют с {dateLabel(futureFrom)}.
          {p.versions &&
          p.versions.filter((version) => !version.voided).length > 1
            ? " До этой даты сохраняются прежние условия."
            : ""}
        </Txt>
      )}
      <ErrorText error={error} />
      {confirmActive !== null && (
        <View style={{ gap: 12, marginTop: 12 }}>
          <Notice tone="warning">
            {confirmActive
              ? "Возобновить прежние условия с сегодняшнего дня? Даты внутри паузы не появятся. Для изменения суммы или графика используйте форму платежа."
              : `Остановить будущие повторения с завтрашнего дня? В ближайшие 90 дней исключаются даты: ${
                  preview?.affected
                    .slice(0, 8)
                    .map((item) => dateLabel(item.date))
                    .join(", ") || "нет"
                }${(preview?.affected.length ?? 0) > 8 ? "…" : ""}.`}
            {` Сохраняются просрочки: ${arrears.length}${
              arrears.length
                ? ` (${arrears
                    .slice(0, 8)
                    .map((item) => dateLabel(item.date))
                    .join(", ")})`
                : ""
            }. Их можно оплатить или отдельно пропустить в календаре.`}
            {!!preview?.replacedVersions.length &&
              ` Ранее назначенные будущие условия с дат ${preview.replacedVersions.map((version) => dateLabel(version.effectiveFrom)).join(", ")} будут отменены до начала, их история сохранится.`}
            {!!preview?.conflicts.length &&
              ` Есть отмеченные будущие события: ${preview.conflicts
                .map((item) => dateLabel(item.date))
                .slice(0, 8)
                .join(
                  ", ",
                )}. Остановка сейчас недоступна: сначала завершите ожидания либо выберите новые условия не раньше ${preview.suggestedFrom}.`}
          </Notice>
          <Button
            label={
              confirmActive
                ? "Подтвердить возобновление"
                : "Подтвердить остановку"
            }
            disabled={!!preview?.conflicts.length}
            onPress={() =>
              run(() => {
                actions.setRecurringActive(p.id, confirmActive);
                setConfirmActive(null);
                notify(
                  confirmActive
                    ? "Повторения возобновлены"
                    : "Будущие повторения остановлены; обязательства сохранены",
                );
              })
            }
          />
          <Button
            label="Отмена изменения повторений"
            variant="secondary"
            onPress={() => setConfirmActive(null)}
          />
        </View>
      )}

      {preparation && (
        <View style={{ gap: 12 }}>
          <Txt
            style={{
              color: C.muted,
              fontSize: 11,
              lineHeight: 18,
              marginTop: 12,
            }}
          >
            Подготовка с нуля к {dateLabel(preparation.date)}: около{" "}
            {money(
              preparation.monthly,
              true,
              accountCurrency(state, p.accountId),
            )}{" "}
            в месяц за {preparation.months} мес. Настройте фонд в обязательстве,
            чтобы учитывать подготовленные накопления.
          </Txt>
          <Button
            label={
              goalFundCycleForPayment(
                state,
                p.id,
                preparation.date,
                resolvePaymentOccurrence(p, preparation.date)?.versionId,
              )?.status === "active"
                ? "Открыть годовой фонд"
                : "Подготовить годовой фонд"
            }
            variant="secondary"
            onPress={() =>
              open({ type: "payment", id: p.id, date: preparation.date })
            }
          />
        </View>
      )}
    </Card>
  );
}
