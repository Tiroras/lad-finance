import { useState } from "react";
import type { CurrencyCode } from "../../../domain/currency";
import { canStartOnboarding } from "../../../domain/onboarding";
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
} from "../../../shared/ui";
import { OnboardingBalanceStep } from "./OnboardingBalanceStep";
import { OnboardingPlanStep } from "./OnboardingPlanStep";

export function OnboardingFlow({
  close,
  startWithAccounts = false,
}: {
  close: () => void;
  startWithAccounts?: boolean;
}) {
  const { state, today, notify } = useFinance();
  const { switching, switchProfile } = useFinanceStatus();
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
  const startPersonal = async () => {
    setError("");
    if (!state.demo) {
      setStep(1);
      return;
    }
    try {
      const personal = await switchProfile("personal");
      if (canStartOnboarding(personal)) {
        setName(personal.settings.name);
        setStep(1);
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
          disabled={switching}
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
        disabled={switching}
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
              setStep(step + 1);
              return;
            }
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
            notify(
              "Собственный учёт готов. Посмотрите, как рассчитана сумма на день.",
            );
            close();
          })
        }
      />
      <Button
        label="Назад"
        variant="secondary"
        disabled={switching}
        onPress={() => {
          setError("");
          setStep(step - 1);
        }}
      />
    </>
  );
}
