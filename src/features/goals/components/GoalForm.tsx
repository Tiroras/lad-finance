import { useState } from "react";
import { Pressable, View } from "react-native";
import { currencySymbol, type CurrencyCode } from "../../../domain/currency";
import {
  goalTermsChanged,
  saveGoal,
  type GoalInput,
} from "../../../domain/actions/goals";
import { goalScheduleSummary, goalVersions } from "../../../domain/goals";
import {
  scheduleLabel,
  type RecurrenceSchedule,
} from "../../../domain/recurrence";
import type { Goal } from "../../../domain/types";
import { dateLabel, shiftDate, shiftMonth } from "../../../shared/lib/dates";
import { CurrencyPicker } from "../../currencies";
import { RecurrenceFields } from "../../payments";
import { useActionError } from "../../../shared/lib/useActionError";
import {
  useFinanceActions,
  useMoney,
  useFinance,
} from "../../../state/finance";
import {
  Button,
  C,
  Field,
  IconTile,
  Notice,
  Row,
  DeleteButton,
  ErrorText,
  AmountField,
  DateField,
  Txt,
} from "../../../shared/ui";

export function GoalForm({ id, close }: { id?: string; close: () => void }) {
  const { money, moneyInput, parseMoney, currency: baseCode } = useMoney();
  const { state, notify, today } = useFinance();
  const actions = useFinanceActions();
  const original = state.goals.find((g) => g.id === id);
  const legacyDay = state.settings.forecast?.goalDay ?? 31;
  const current = original
    ? goalVersions(original, legacyDay)
        .filter((entry) => !entry.voided)
        .at(-1)
    : undefined;
  const [currency, setCurrency] = useState<CurrencyCode>(
    original ? (original.currency ?? "RUB") : baseCode,
  );
  const [name, setName] = useState(original?.name ?? "");
  const [target, setTarget] = useState(
    original ? moneyInput(original.target, currency) : "100000",
  );
  const [monthly, setMonthly] = useState(
    original
      ? moneyInput(current?.amount ?? original.monthly, currency)
      : "5000",
  );
  const [individual, setIndividual] = useState(!!original?.versions);
  const [day, setDay] = useState(String(current?.day ?? legacyDay));
  const [schedule, setSchedule] = useState<RecurrenceSchedule | undefined>(
    current?.schedule,
  );
  const firstBoundary =
    original && !original.versions ? shiftMonth(today, 1) : shiftDate(today, 1);
  const [anchor, setAnchor] = useState(
    current?.schedule?.anchor ?? firstBoundary,
  );
  const [deadline, setDeadline] = useState(current?.deadline ?? "");
  const [effectiveFrom, setEffectiveFrom] = useState(firstBoundary);
  const [preview, setPreview] = useState<ReturnType<
    typeof goalScheduleSummary
  > | null>(null);
  const [icon, setIcon] = useState<Goal["icon"]>(
    original?.icon ?? "airplane-outline",
  );
  const { error, setError, run } = useActionError();
  const edit =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setPreview(null);
      setError("");
    };
  const input = (): GoalInput | undefined => {
    const targetAmount = parseMoney(target, currency),
      monthlyAmount = parseMoney(monthly, currency);
    if (targetAmount === null || monthlyAmount === null) {
      setError("Укажите сумму цели и взнос в выбранной валюте.");
      return undefined;
    }
    return {
      id,
      name,
      target: targetAmount,
      monthly: monthlyAmount,
      icon,
      currency,
      ...(individual
        ? {
            ...(schedule ? { schedule } : { day: Number(day) }),
            deadline: deadline || undefined,
          }
        : {}),
      effectiveFrom,
    };
  };
  const save = (confirmed = false) =>
    run(() => {
      const draft = input();
      if (!draft) return;
      const transition = original
        ? goalTermsChanged(original, draft, legacyDay)
        : individual;
      if (transition && !confirmed) {
        const next = saveGoal(state, draft, today);
        const candidate =
          next.goals.find((entry) => entry.id === id) ?? next.goals.at(-1)!;
        setPreview(goalScheduleSummary(next, candidate, today, legacyDay));
        return;
      }
      actions.saveGoal(draft);
      notify(original ? "Цель обновлена" : "Первый шаг к мечте сделан");
      close();
    });
  return (
    <>
      <Row style={{ justifyContent: "center", gap: 14 }}>
        {(
          [
            "airplane-outline",
            "shield-checkmark-outline",
            "home-outline",
            "heart-outline",
            "bag-handle-outline",
          ] as const
        ).map((value) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityLabel={`Значок цели: ${value}`}
            accessibilityState={{ selected: value === icon }}
            onPress={() => edit(setIcon)(value)}
          >
            <IconTile
              name={value}
              background={value === icon ? "#DCE8C9" : C.soft}
              size={48}
            />
          </Pressable>
        ))}
      </Row>
      <Field
        label="Название цели"
        accessibilityLabel="Название цели"
        placeholder="Например, отпуск у моря"
        value={name}
        onChangeText={edit(setName)}
        maxLength={120}
      />
      <CurrencyPicker
        value={currency}
        onChange={edit(setCurrency)}
        disabled={!!original}
      />
      <AmountField
        label={`Сколько нужно накопить, ${currencySymbol(currency)}`}
        accessibilityLabel="Сумма цели"
        value={target}
        onChangeText={edit(setTarget)}
      />
      <AmountField
        label={`${individual ? "Взнос по графику" : "Планирую откладывать в месяц"}, ${currencySymbol(currency)}`}
        accessibilityLabel={schedule ? "Взнос по графику" : "Ежемесячный взнос"}
        value={monthly}
        onChangeText={edit(setMonthly)}
      />
      {!individual ? (
        <>
          <Notice>
            Месячный взнос использует общий день из настроек прогноза:{" "}
            {legacyDay}. Можно задать собственные даты и срок.
          </Notice>
          <Button
            label="Настроить индивидуальный график"
            variant="secondary"
            onPress={() => edit(setIndividual)(true)}
          />
        </>
      ) : (
        <>
          <RecurrenceFields
            schedule={schedule}
            anchor={anchor}
            onChange={edit(setSchedule)}
          />
          {schedule ? (
            <DateField
              label="Первая дата графика цели"
              value={anchor}
              onChangeText={(value) => {
                edit(setAnchor)(value);
                setSchedule({ ...schedule, anchor: value });
              }}
            />
          ) : (
            <Field
              label="День ежемесячного взноса · 1–31"
              accessibilityLabel="День взноса цели"
              value={day}
              onChangeText={edit(setDay)}
              keyboardType="number-pad"
              maxLength={2}
            />
          )}
          <DateField
            label="Срок цели · необязательно"
            accessibilityLabel="Срок цели"
            value={deadline}
            onChangeText={edit(setDeadline)}
            allowClear
          />
        </>
      )}
      {original && !original.versions && (
        <Notice>
          Первый индивидуальный график начнётся с ближайшего нового месяца:{" "}
          {dateLabel(firstBoundary)}. В текущем месяце сохраняются прежние
          условия.
        </Notice>
      )}
      {(original || individual) && (
        <DateField
          label="Новые условия цели с"
          value={effectiveFrom}
          onChangeText={edit(setEffectiveFrom)}
        />
      )}
      <Notice>
        В расчёте доступных денег учитываются взносы по графику. Пополнение
        отмечайте после фактического перевода. Срок зависит от будущих взносов,
        доходность не предполагается. Накопления должны покрывать все цели
        отдельно в каждой валюте.
      </Notice>
      {preview && (
        <View testID="goal-transition-preview" style={{ gap: 12 }}>
          <Notice>
            Новые условия с {dateLabel(effectiveFrom)}. Уже отмеченные взносы и
            прежние условия сохранятся.{" "}
            {original && !original.versions
              ? "До начала нового графика учитывается прежний месячный взнос; число дат включает его, если он ещё впереди. "
              : ""}{" "}
            {preview.remaining === 0
              ? "Цель уже достигнута."
              : preview.deadline
                ? preview.requiredContribution === null
                  ? "До срока нет будущих дат: срок недостижим в выбранном графике."
                  : `До срока ${preview.remainingDates} дат. Требуется по ${money(preview.requiredContribution, true, currency)} на дату. ${preview.reachable ? "План покрывает остаток цели." : "Текущего взноса недостаточно для срока."}`
                : preview.estimatedDate
                  ? `При выбранном взносе цель достижима к ${dateLabel(preview.estimatedDate, { day: "numeric", month: "long", year: "numeric" })}.`
                  : "При нулевом взносе срок достижения не рассчитывается."}
          </Notice>
          {preview.requiredContribution !== null &&
            preview.requiredContribution > 0 && (
              <Button
                label="Применить требуемый взнос"
                variant="secondary"
                onPress={() =>
                  edit(setMonthly)(
                    moneyInput(preview.requiredContribution!, currency),
                  )
                }
              />
            )}
          <Button label="Подтвердить условия цели" onPress={() => save(true)} />
        </View>
      )}
      <ErrorText error={error} />
      <Button
        label={original ? "Сохранить цель" : "Создать цель"}
        onPress={() => save()}
      />
      {original?.versions && (
        <View testID="goal-terms-history" style={{ gap: 10 }}>
          <Txt style={{ color: C.muted }}>История условий</Txt>
          {original.versions.map((version) => (
            <Notice key={version.id}>
              {version.voided
                ? "Отменены до начала действия"
                : `С ${dateLabel(version.effectiveFrom)}${version.effectiveTo ? ` до ${dateLabel(shiftDate(version.effectiveTo, -1))}` : ""}`}
              : {money(version.amount, false, currency)} ·{" "}
              {version.schedule
                ? scheduleLabel(version.schedule)
                : `${version.day}-го числа каждого месяца`}
              {version.deadline ? ` · срок ${dateLabel(version.deadline)}` : ""}
              .
            </Notice>
          ))}
        </View>
      )}
      {original && (
        <DeleteButton
          label="Удалить цель"
          explanation="Цель исчезнет из плана. Все накопленные деньги останутся на счетах, а переводы — в истории."
          onDelete={() =>
            run(() => {
              actions.deleteGoal(original.id);
              notify("Цель удалена, деньги остались на счетах");
              close();
            })
          }
        />
      )}
    </>
  );
}
