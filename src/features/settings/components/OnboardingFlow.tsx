import { useEffect, useRef, useState } from "react";
import { BackHandler } from "react-native";
import type { CurrencyCode } from "../../../domain/currency";
import { canStartOnboarding } from "../../../domain/onboarding";
import type { FinanceState } from "../../../domain/types";
import { useStoredDraft } from "../../../infrastructure/storage/useStoredDraft";
import { useSecurity } from "../../security";
import {
  parseOnboardingDraft,
  type OnboardingDraft,
} from "../model/onboardingDraft";
import { DEMO_ENABLED } from "../../../shared/lib/buildOptions";
import { dateLabel, shiftDate, validDate } from "../../../shared/lib/dates";
import { useActionError } from "../../../shared/lib/useActionError";
import {
  useFinance,
  useFinanceActions,
  useFinanceStatus,
  useMoney,
} from "../../../state/finance";
import {
  Button,
  Card,
  ErrorText,
  Notice,
  Section,
  Txt,
  AmountField,
  font,
} from "../../../shared/ui";
import { OnboardingBalanceStep } from "./OnboardingBalanceStep";
import { OnboardingPlanStep } from "./OnboardingPlanStep";

export function OnboardingFlow({
  close,
  startWithAccounts = false,
  onBack,
  onStepChange,
  active = true,
}: {
  close: () => void;
  startWithAccounts?: boolean;
  onBack?: () => void;
  onStepChange?: () => void;
  active?: boolean;
}) {
  const { state, today, notify, profile, profiles } = useFinance();
  const { switching, switchProfile, confirmCurrentSave } = useFinanceStatus();
  const { locked } = useSecurity();
  const actions = useFinanceActions();
  const { parseMoney, money } = useMoney();
  const [step, setStep] = useState(startWithAccounts ? 1 : 0);
  const [name, setName] = useState(state.settings.name);
  const [accountName, setAccountName] = useState("Основная карта");
  const [currency, setCurrency] = useState<CurrencyCode>("RUB");
  const [balance, setBalance] = useState("");
  const [savings, setSavings] = useState("");
  const [buffer, setBuffer] = useState("");
  const [incomeName, setIncomeName] = useState("Зарплата");
  const [incomeAmount, setIncomeAmount] = useState("");
  const [incomeDate, setIncomeDate] = useState(shiftDate(today, 7));
  const [billName, setBillName] = useState("Жильё");
  const [billAmount, setBillAmount] = useState("");
  const [billDate, setBillDate] = useState(shiftDate(today, 10));
  const { error, setError, run } = useActionError();
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [pendingSnapshot, setPendingSnapshot] = useState<FinanceState | null>(
    null,
  );
  const payload: OnboardingDraft = {
    version: 1,
    step,
    name,
    accountName,
    currency,
    balance,
    savings,
    buffer,
    incomeName,
    incomeAmount,
    incomeDate,
    billName,
    billAmount,
    billDate,
  };
  const draft = useStoredDraft({
    profileId: profile,
    slot: "onboarding",
    recordId: "setup",
    payload,
    enabled: active && !locked && !switching && !state.demo,
    parse: parseOnboardingDraft,
    onRestore(value) {
      setStep(value.step || 1);
      setName(value.name);
      setAccountName(value.accountName);
      setCurrency(value.currency);
      setBalance(value.balance);
      setSavings(value.savings);
      setBuffer(value.buffer);
      setIncomeName(value.incomeName);
      setIncomeAmount(value.incomeAmount);
      setIncomeDate(value.incomeDate);
      setBillName(value.billName);
      setBillAmount(value.billAmount);
      setBillDate(value.billDate);
      onStepChange?.();
    },
  });
  const draftOffer = draft.offer && (
    <Card style={{ gap: 12 }}>
      <Txt style={{ fontFamily: font.semibold }}>Есть черновик настройки</Txt>
      <Notice>
        Восстановите введённые поля или удалите черновик. Финансовые записи пока
        не изменятся.
      </Notice>
      <Button
        label="Восстановить черновик настройки"
        onPress={() => void draft.restore().catch(() => undefined)}
      />
      <Button
        label="Удалить черновик настройки"
        variant="secondary"
        onPress={() => void draft.discard().catch(() => undefined)}
      />
    </Card>
  );
  const draftRecovery = draft.error && (
    <>
      <ErrorText error={draft.error} />
      <Button
        label="Повторить чтение черновика настройки"
        onPress={draft.retryLoad}
      />
      <Button
        label="Удалить все черновики профиля"
        variant="danger"
        onPress={() =>
          void draft
            .discardAll()
            .catch((failure: unknown) =>
              setError(
                failure instanceof Error
                  ? failure.message
                  : "Не удалось удалить черновики.",
              ),
            )
        }
      />
    </>
  );
  const changeStep = (next: number) => {
    setError("");
    onStepChange?.();
    setStep(next);
  };
  const goBack = () => {
    if (step === 1 && onBack) onBack();
    else changeStep(step - 1);
  };
  useEffect(() => {
    if (!onBack || !active) return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (!switching && !saving) goBack();
        return true;
      },
    );
    return () => subscription.remove();
  });
  const startPersonal = async () => {
    setError("");
    if (!state.demo) {
      changeStep(1);
      return;
    }
    try {
      const target = profiles.find((p) => p.id !== "demo");
      if (!target)
        throw new Error("Сначала создайте профиль в разделе «Профили».");
      const personal = await switchProfile(target.id);
      if (canStartOnboarding(personal)) {
        setName(personal.settings.name);
        changeStep(1);
      } else {
        close();
      }
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Не удалось открыть личный профиль. Попробуйте ещё раз.",
      );
    }
  };
  const parse = (v: string) => {
    const value = parseMoney(v.trim() || "0", currency);
    if (value === null)
      throw new Error(
        "Проверьте суммы: используйте неотрицательные числа в выбранной валюте.",
      );
    return value;
  };
  const submit = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setError("");
    try {
      if (!pendingSnapshot) await draft.flush();
      draft.suspend();
      setSaving(true);
      const next =
        pendingSnapshot ??
        actions.completeOnboarding({
          name,
          accountName,
          currency,
          balance: parse(balance),
          savings: parse(savings),
          buffer: parse(buffer),
          incomeName,
          incomeAmount: parse(incomeAmount),
          incomeDate,
          billName,
          billAmount: parse(billAmount),
          billDate,
        });
      setPendingSnapshot(next);
      // FirstRunFlow switches to its dedicated save/retry view immediately.
      // That view performs the same read-back proof and draft cleanup.
      if (onBack) return;
      await confirmCurrentSave(profile, next);
      await draft.clear();
      notify(
        "Собственный учёт готов. Посмотрите, как рассчитана сумма на день.",
      );
      close();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Не удалось подтвердить сохранение учёта.",
      );
      if (!pendingSnapshot && canStartOnboarding(state)) draft.resume();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  if (pendingSnapshot && !canStartOnboarding(state))
    return (
      <>
        <Notice>
          Настройка применена. Проверяем её сохранение перед удалением
          черновика.
        </Notice>
        <ErrorText error={error || draft.error} />
        <Button
          label="Повторить сохранение настройки"
          disabled={saving || switching}
          onPress={() => void submit()}
        />
      </>
    );
  if (!canStartOnboarding(state))
    return (
      <>
        <Notice>
          Собственный учёт уже начат. Настройте дополнительные счета и планы
          через профиль и вкладку «План».
        </Notice>
        <Button label="Готово" onPress={close} />
      </>
    );
  if (step === 0)
    return (
      <>
        <Section title="Больше ясности с первого дня" />
        {draftOffer}
        {draftRecovery}
        <Txt>
          {state.demo
            ? "Посмотрите возможности на примере или настройте собственный учёт: остатки, ближайший доход и обязательные платежи."
            : "Настройте собственный учёт: остатки на счетах, ближайший доход и обязательные платежи."}
        </Txt>
        {state.demo && (
          <Notice>
            Собственный учёт хранится в отдельном личном профиле. Его записи и
            пример сохраняются при переключении.
          </Notice>
        )}
        <ErrorText error={error} />
        <Button
          label={
            switching ? "Открываем личный профиль…" : "Настроить свой учёт"
          }
          disabled={switching || !!draft.offer}
          onPress={() => void startPersonal()}
        />
        {DEMO_ENABLED && state.demo && (
          <Button
            label="Посмотреть пример"
            variant="secondary"
            disabled={switching}
            onPress={() =>
              run(() => {
                actions.acceptDemo();
                close();
              })
            }
          />
        )}
        <Notice>
          Для начала не нужны регистрация и подключение банка. Данные
          сохраняются на этом устройстве.
        </Notice>
      </>
    );
  return (
    <>
      <Section title={`Шаг ${step} из 4`} />
      {draftOffer}
      {draftRecovery}
      {step === 1 && (
        <OnboardingBalanceStep
          {...{
            name,
            accountName,
            balance,
            savings,
            currency,
            setName,
            setAccountName,
            setBalance,
            setSavings,
            setCurrency,
          }}
        />
      )}
      {step === 2 && (
        <OnboardingPlanStep
          kind="income"
          name={incomeName}
          amount={incomeAmount}
          date={incomeDate}
          {...{ currency }}
          setName={setIncomeName}
          setAmount={setIncomeAmount}
          setDate={setIncomeDate}
        />
      )}
      {step === 3 && (
        <OnboardingPlanStep
          kind="bill"
          name={billName}
          amount={billAmount}
          date={billDate}
          {...{ currency }}
          setName={setBillName}
          setAmount={setBillAmount}
          setDate={setBillDate}
        />
      )}
      {step === 4 && (
        <>
          <AmountField
            label={`Неприкосновенный остаток, ${currency}`}
            accessibilityLabel="Резерв при настройке"
            value={buffer}
            onChangeText={setBuffer}
          />
          <Card>
            <Txt>
              {accountName}:{" "}
              {money(parseMoney(balance, currency) ?? 0, true, currency)}
            </Txt>
            <Txt>
              Накопления:{" "}
              {money(parseMoney(savings, currency) ?? 0, true, currency)}
            </Txt>
            <Txt>
              {(parseMoney(incomeAmount, currency) ?? 0) > 0
                ? `${incomeName}: ${incomeAmount} ${currency} · ${dateLabel(incomeDate)}`
                : "Доходы добавите позже"}
            </Txt>
            <Txt>
              {(parseMoney(billAmount, currency) ?? 0) > 0
                ? `${billName}: ${billAmount} ${currency} · ${dateLabel(billDate)}`
                : "Платежи добавите позже"}
            </Txt>
          </Card>
          <Notice>
            Подтверждение сохранит ваши остатки и планы. На главной появится
            сумма на день; кнопка с информацией объясняет каждый резерв.
            Ожидаемый доход ещё не считается полученным.
          </Notice>
        </>
      )}
      <ErrorText error={error} />
      <Button
        label={step < 4 ? "Продолжить" : "Начать учёт с этими данными"}
        disabled={switching || saving || !draft.ready || !!draft.offer}
        onPress={() =>
          run(() => {
            if (step === 1) {
              parse(balance);
              parse(savings);
              if (!accountName.trim())
                throw new Error("Укажите название счёта.");
            }
            if (step === 2 && parse(incomeAmount) > 0) {
              if (
                !incomeName.trim() ||
                !validDate(incomeDate) ||
                incomeDate < today
              )
                throw new Error(
                  "Укажите название и дату дохода не раньше сегодня.",
                );
            }
            if (step === 3 && parse(billAmount) > 0) {
              if (!billName.trim() || !validDate(billDate) || billDate < today)
                throw new Error(
                  "Укажите название и дату платежа не раньше сегодня.",
                );
            }
            if (step < 4) {
              changeStep(step + 1);
              return;
            }
            void submit();
          })
        }
      />
      <Button
        label="Назад"
        variant="secondary"
        disabled={switching || saving}
        onPress={goBack}
      />
    </>
  );
}
