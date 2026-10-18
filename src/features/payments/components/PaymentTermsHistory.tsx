import { useState } from "react";
import type { Recurring } from "../../../domain/types";
import {
  paymentVersions,
  skippedPaymentOccurrences,
} from "../../../domain/payments";
import type { OpenSheet } from "../../../application/navigation/types";
import { accountCurrency } from "../../../domain/currency";
import { scheduleLabel } from "../../../domain/recurrence";
import { dateLabel } from "../../../shared/lib/dates";
import { useFinance, useMoney } from "../../../state/finance";
import { Button, Notice, Section, Txt } from "../../../shared/ui";

export function PaymentTermsHistory({
  payment,
  open,
}: {
  payment: Recurring;
  open: OpenSheet;
}) {
  const { state, today } = useFinance();
  const { money } = useMoney();
  const versions = paymentVersions(payment, today);
  const skipped = skippedPaymentOccurrences(payment);
  const [limit, setLimit] = useState(20);
  return (
    <>
      <Section title="История условий" />
      {!versions.length && (
        <Notice>
          Прежний выключенный план: неизвестные обязательства не
          восстанавливаются.
        </Notice>
      )}
      {versions.map((version) => (
        <Notice key={version.id}>
          {version.voided && "Отменены до начала. "}С{" "}
          {dateLabel(version.effectiveFrom)}
          {version.effectiveTo
            ? ` до ${dateLabel(version.effectiveTo)} (не включая)`
            : " без даты окончания"}
          .{" "}
          {money(
            version.amount,
            false,
            accountCurrency(state, version.accountId),
          )}{" "}
          ·{" "}
          {version.schedule
            ? scheduleLabel(version.schedule)
            : `ежемесячно ${version.day}-го`}
          . Счёт:{" "}
          {state.accounts.find((account) => account.id === version.accountId)
            ?.name ?? "Удалён"}
          ; категория:{" "}
          {state.categories.find((category) => category.id === version.category)
            ?.name ?? version.category}
          .
          {version.inactiveLegacy &&
            " Только известная история выключенного плана, без генерации обязательств."}
          {!!(version.history?.length || version.amountHistory?.length) &&
            " Сохранена прежняя история изменений суммы и дня."}
          {!!(version.skippedDates?.length || version.skippedMonths?.length) &&
            ` Пропущено: ${(version.skippedDates?.length ?? 0) + (version.skippedMonths?.length ?? 0)}.`}
        </Notice>
      ))}
      <Txt>
        Условия относятся к исходной дате обязательства. Остановка будущих
        повторений не удаляет просрочки.
      </Txt>
      {skipped.length > 0 && (
        <>
          <Section title="Пропущенные обязательства" />
          <Notice>
            Откройте прежнее обязательство, чтобы проверить его условия и
            вернуть в расчёт.
          </Notice>
          {skipped.slice(0, limit).map((occurrence) => (
            <Button
              key={`${occurrence.versionId}:${occurrence.date}`}
              label={`Открыть пропущенный платёж · ${dateLabel(occurrence.date)} · ${money(occurrence.payment.amount, false, accountCurrency(state, occurrence.payment.accountId))}`}
              variant="secondary"
              onPress={() =>
                open({
                  type: "payment",
                  id: payment.id,
                  date: occurrence.date,
                  versionId: occurrence.versionId,
                })
              }
            />
          ))}
          {skipped.length > limit && (
            <Button
              label="Показать ещё пропущенные обязательства"
              variant="secondary"
              onPress={() => setLimit(limit + 20)}
            />
          )}
        </>
      )}
    </>
  );
}
