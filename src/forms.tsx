import React, { useState } from "react";
import { View, ScrollView, Pressable } from "react-native";
import {
  C,
  font,
  Txt,
  Row,
  Card,
  Icon,
  IconTile,
  Button,
  Chip,
  Segments,
  Field,
  Notice,
  Progress,
  Section,
} from "./ui";
import { useFinance } from "./store";
import {
  accountBalance,
  dateLabel,
  goalSaved,
  localDate,
  money,
  moneyInput,
  parseMoney,
  parseQuickEntry,
  simulatePurchase,
  spendable,
  uid,
  validateTransaction,
} from "./domain/finance";
import { createInitialState } from "./domain/seed";
import { exportBackup, importBackup } from "./backup";
import type {
  Account,
  CategoryId,
  FinanceState,
  Goal,
  Transaction,
} from "./domain/types";
import type { OpenSheet, SheetState } from "./screens";

function ErrorText({ error }: { error: string }) {
  return error ? (
    <Txt
      accessibilityRole="alert"
      style={{ fontSize: 12, lineHeight: 20, color: C.red }}
    >
      {error}
    </Txt>
  ) : null;
}
function AccountPicker({
  selected,
  onChange,
  exclude,
  spendingOnly = false,
  label = "Счёт",
}: {
  selected: string;
  onChange: (id: string) => void;
  exclude?: string;
  spendingOnly?: boolean;
  label?: string;
}) {
  const { state } = useFinance();
  return (
    <View style={{ gap: 10 }}>
      <Txt style={{ fontFamily: font.semibold, fontSize: 12, color: C.muted }}>
        {label}
      </Txt>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {state.accounts
          .filter(
            (a) => a.id !== exclude && (!spendingOnly || a.kind === "spending"),
          )
          .map((a) => (
            <Chip
              label={a.name}
              icon={a.icon}
              key={a.id}
              active={selected === a.id}
              onPress={() => onChange(a.id)}
            />
          ))}
      </ScrollView>
    </View>
  );
}
function CategoryPicker({
  value,
  onChange,
}: {
  value: CategoryId;
  onChange: (id: CategoryId) => void;
}) {
  const { state } = useFinance();
  return (
    <View style={{ gap: 10 }}>
      <Txt style={{ fontFamily: font.semibold, fontSize: 12, color: C.muted }}>
        Категория
      </Txt>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {state.categories.map((c) => (
          <Chip
            key={c.id}
            label={c.name}
            icon={c.icon}
            active={c.id === value}
            onPress={() => onChange(c.id)}
          />
        ))}
      </View>
    </View>
  );
}
function DeleteButton({
  onDelete,
  label = "Удалить запись",
  explanation = "Это действие изменит ваш баланс и расчёты.",
}: {
  onDelete: () => void;
  label?: string;
  explanation?: string;
}) {
  const [confirm, setConfirm] = useState(false);
  return confirm ? (
    <Card style={{ gap: 14, backgroundColor: "#FBF0EA" }}>
      <Txt style={{ fontSize: 12, color: C.red, lineHeight: 20 }}>
        {explanation}
      </Txt>
      <Row>
        <Button
          label="Отмена"
          variant="secondary"
          onPress={() => setConfirm(false)}
          style={{ flex: 1 }}
        />
        <Button
          label="Да, удалить"
          variant="danger"
          onPress={onDelete}
          style={{ flex: 1 }}
        />
      </Row>
    </Card>
  ) : (
    <Button
      label={label}
      variant="danger"
      icon="trash-outline"
      onPress={() => setConfirm(true)}
    />
  );
}

export function TransactionForm({
  sheet,
  close,
}: {
  sheet: SheetState;
  close: () => void;
}) {
  const { state, update, notify, today } = useFinance();
  const original = state.transactions.find((t) => t.id === sheet.id);
  const [type, setType] = useState<Transaction["type"]>(
    original?.type ?? sheet.transactionType ?? "expense",
  );
  const [title, setTitle] = useState(original?.title ?? "");
  const [amount, setAmount] = useState(
    original ? moneyInput(original.amount) : "",
  );
  const [category, setCategory] = useState<CategoryId>(
    original?.category ?? "other",
  );
  const [accountId, setAccountId] = useState(
    original?.accountId ??
      state.accounts.find((a) => a.kind === "spending")!.id,
  );
  const [toAccountId, setToAccountId] = useState(
    original?.toAccountId ??
      state.accounts.find((a) => a.kind === "savings")!.id,
  );
  const [date, setDate] = useState(original?.date ?? today);
  const [note, setNote] = useState(original?.note ?? "");
  const [quick, setQuick] = useState("");
  const [error, setError] = useState("");
  const applyQuick = (input = quick) => {
    const parsed = parseQuickEntry(input);
    if (!parsed)
      return setError(
        "Напишите название и одну сумму: например, «кофе 320» или «продукты 1 450,50».",
      );
    setType(parsed.type);
    setTitle(parsed.title);
    setAmount(moneyInput(parsed.amount));
    setCategory(parsed.category);
    setError("");
    notify("Распознано. Проверьте категорию и счёт перед сохранением.");
  };
  const save = () => {
    const parsed = parseMoney(amount);
    const transaction: Transaction = {
      id: original?.id ?? uid(),
      type,
      title:
        title.trim() || (type === "transfer" ? "Перевод между счетами" : ""),
      amount: parsed ?? 0,
      date,
      category,
      accountId,
      note: note.trim(),
    };
    if (type === "transfer") {
      transaction.toAccountId = toAccountId;
      if (original?.goalId) transaction.goalId = original.goalId;
    }
    if (type === "expense" && original?.recurringId) {
      transaction.recurringId = original.recurringId;
      transaction.occurrenceDate = original.occurrenceDate;
    }
    const withoutOriginal = {
      ...state,
      transactions: state.transactions.filter((t) => t.id !== original?.id),
    };
    const validation = validateTransaction(withoutOriginal, transaction, today);
    if (validation) return setError(validation);
    if (
      original?.goalId &&
      (state.accounts.find((a) => a.id === accountId)?.kind !== "spending" ||
        state.accounts.find((a) => a.id === toAccountId)?.kind !== "savings")
    )
      return setError(
        "Пополнять цель можно только с обычного счёта на накопительный.",
      );
    if (
      type === "transfer" &&
      state.accounts.find((a) => a.id === accountId)?.kind === "savings"
    ) {
      const allocated = state.goals.reduce(
        (n, g) => n + goalSaved(withoutOriginal, g),
        0,
      );
      const allSavings = state.accounts
        .filter((a) => a.kind === "savings")
        .reduce((n, a) => n + accountBalance(withoutOriginal, a.id), 0);
      if (
        state.accounts.find((a) => a.id === toAccountId)?.kind !== "savings" &&
        transaction.amount > allSavings - allocated
      )
        return setError(
          "Эти накопления распределены по целям. Сначала освободите средства, удалив соответствующую цель.",
        );
    }
    if (
      type === "expense" &&
      state.accounts.find((a) => a.id === accountId)?.kind === "savings"
    )
      return setError(
        "Для расхода сначала переведите свободные накопления на обычный счёт.",
      );
    update((s) => ({
      ...s,
      transactions: [
        transaction,
        ...s.transactions.filter((t) => t.id !== original?.id),
      ],
    }));
    notify(
      original
        ? "Операция обновлена"
        : type === "transfer"
          ? "Перевод записан"
          : "Операция добавлена",
    );
    close();
  };
  return (
    <>
      {!original && type !== "transfer" && (
        <Card
          style={{
            backgroundColor: C.lavender,
            borderColor: "#E5E0EE",
            gap: 12,
          }}
        >
          <Row>
            <Icon name="flash-outline" color="#8C7FA4" size={18} />
            <Txt
              style={{ fontFamily: font.bold, color: "#756785", fontSize: 12 }}
            >
              Запишите как говорите
            </Txt>
          </Row>
          <Row>
            <Field
              containerStyle={{ flex: 1 }}
              style={{ backgroundColor: "#fff" }}
              accessibilityLabel="Быстрый ввод"
              placeholder="Кофе 320"
              value={quick}
              onChangeText={setQuick}
              onSubmitEditing={() => applyQuick()}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Распознать запись"
              onPress={() => applyQuick()}
              style={{
                padding: 13,
                backgroundColor: "#DED7E8",
                borderRadius: 13,
              }}
            >
              <Icon name="arrow-forward" color="#756785" />
            </Pressable>
          </Row>
          <Txt style={{ color: "#91869E", fontSize: 10 }}>
            Распознаётся на устройстве · проверьте перед сохранением
          </Txt>
        </Card>
      )}
      {original?.goalId ? (
        <Notice>
          Это пополнение цели «
          {state.goals.find((g) => g.id === original.goalId)?.name}». Изменения
          отразятся в накоплениях.
        </Notice>
      ) : (
        <Segments
          value={type}
          onChange={setType}
          options={[
            { value: "expense", label: "Расход" },
            { value: "income", label: "Доход" },
            { value: "transfer", label: "Перевод" },
          ]}
        />
      )}
      <Field
        label="Сумма, ₽"
        accessibilityLabel="Сумма операции"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        placeholder="0"
        style={{ fontSize: 36, fontFamily: font.semibold, paddingVertical: 18 }}
        maxLength={16}
      />
      <Field
        label={type === "transfer" ? "Название перевода" : "На что или откуда?"}
        accessibilityLabel="Название операции"
        placeholder={
          type === "expense"
            ? "Например, продукты домой"
            : type === "income"
              ? "Например, зарплата"
              : "Перевод между счетами"
        }
        value={title}
        onChangeText={setTitle}
        maxLength={120}
      />
      {type === "expense" && (
        <CategoryPicker value={category} onChange={setCategory} />
      )}
      <AccountPicker
        selected={accountId}
        onChange={setAccountId}
        spendingOnly={!!original?.goalId || type === "expense"}
        label={type === "transfer" ? "Откуда" : "Счёт"}
      />
      {type === "transfer" && !original?.goalId && (
        <AccountPicker
          label="Куда"
          selected={toAccountId}
          exclude={accountId}
          onChange={setToAccountId}
        />
      )}
      <Field
        label="Дата · ГГГГ-ММ-ДД"
        accessibilityLabel="Дата операции"
        value={date}
        onChangeText={setDate}
        placeholder={today}
        maxLength={10}
        autoCapitalize="none"
      />
      <Field
        label="Заметка · необязательно"
        accessibilityLabel="Заметка"
        placeholder="Что хочется запомнить?"
        value={note}
        onChangeText={setNote}
        maxLength={500}
        multiline
      />
      <ErrorText error={error} />
      <Button
        label={
          original
            ? "Сохранить изменения"
            : type === "transfer"
              ? "Записать перевод"
              : "Добавить операцию"
        }
        icon="checkmark"
        onPress={save}
      />
      {original && (
        <DeleteButton
          label="Удалить операцию"
          onDelete={() => {
            update((s) => ({
              ...s,
              transactions: s.transactions.filter((t) => t.id !== original.id),
            }));
            notify("Операция удалена, баланс пересчитан");
            close();
          }}
        />
      )}
    </>
  );
}

export function FormulaContent() {
  const { state, today } = useFinance();
  const safe = spendable(state, today);
  return (
    <>
      <Notice>
        Считаем только деньги, которые уже есть. Будущий доход и накопительные
        счета в доступную сумму не входят.
      </Notice>
      <Card style={{ gap: 22 }}>
        {[
          { label: "На повседневных счетах", value: safe.liquid, sign: "" },
          {
            label: "Платежи до следующего дохода",
            value: safe.payments,
            sign: "−",
          },
          {
            label: "Осталось отложить на цели в этом месяце",
            value: safe.goals,
            sign: "−",
          },
          { label: "Неприкосновенный остаток", value: safe.buffer, sign: "−" },
        ].map((row) => (
          <Row
            key={row.label}
            style={{
              justifyContent: "space-between",
              alignItems: "flex-start",
            }}
          >
            <Txt
              style={{ flex: 1, fontSize: 12, lineHeight: 19, color: C.muted }}
            >
              {row.label}
            </Txt>
            <Txt style={{ fontFamily: font.semibold, fontSize: 13 }}>
              {row.sign}
              {money(row.value)}
            </Txt>
          </Row>
        ))}
        <View style={{ height: 1, backgroundColor: C.border }} />
        <Row style={{ justifyContent: "space-between" }}>
          <Txt style={{ fontFamily: font.bold }}>Можно потратить</Txt>
          <Txt style={{ fontSize: 23, fontFamily: font.bold }}>
            {money(safe.available)}
          </Txt>
        </Row>
      </Card>
      {safe.raw < 0 && (
        <Notice tone="warning">
          Для сохранения всего плана не хватает {money(-safe.raw)}. Проверьте
          будущие платежи и взносы на цели.
        </Notice>
      )}
      <Txt style={{ fontSize: 12, lineHeight: 21, color: C.muted }}>
        {money(safe.available)} ÷ {safe.days} дн. до {dateLabel(safe.payday)} ={" "}
        {money(safe.daily)} в день. В расчёте дня используется округление вниз
        до копейки.
      </Txt>
      <Txt style={{ fontSize: 12, lineHeight: 21, color: C.muted }}>
        Это ориентир по внесённым данным. Он не учитывает расходы, которые вы
        ещё не записали или не запланировали. После фактической оплаты отметьте
        платёж — тогда сумма не будет зарезервирована повторно.
      </Txt>
    </>
  );
}

export function Simulator() {
  const { state, today } = useFinance();
  const [amount, setAmount] = useState("12000");
  const parsed = parseMoney(amount);
  const result = simulatePurchase(state, parsed ?? 0, today);
  return (
    <>
      <Notice>
        Примерьте покупку к плану. Это сценарий: деньги не списываются, операция
        не создаётся.
      </Notice>
      <Field
        label="Сколько стоит покупка, ₽"
        accessibilityLabel="Стоимость покупки"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        style={{ fontSize: 36, fontFamily: font.semibold }}
        maxLength={16}
      />
      <Row style={{ flexWrap: "wrap" }}>
        {[3000, 12000, 30000, 60000].map((n) => (
          <Chip
            key={n}
            label={money(n * 100)}
            active={parsed === n * 100}
            onPress={() => setAmount(String(n))}
          />
        ))}
      </Row>
      {parsed !== null && parsed > 0 ? (
        <>
          <Card
            style={{
              backgroundColor: result.affordable ? "#EAF0E4" : "#FAEEE5",
              borderColor: result.affordable ? "#DFE8D6" : "#F0DFD1",
              gap: 20,
            }}
          >
            <Row>
              <IconTile
                name={result.affordable ? "checkmark-outline" : "alert-outline"}
                background={result.affordable ? "#D9E6CB" : "#F3DCC9"}
                color={result.affordable ? C.green : C.orange}
              />
              <View style={{ flex: 1, gap: 6 }}>
                <Txt style={{ fontFamily: font.bold, fontSize: 18 }}>
                  {result.affordable
                    ? "Вписывается в ваш план"
                    : "Плану понадобится место"}
                </Txt>
                <Txt style={{ color: "#7D8574", fontSize: 11, lineHeight: 18 }}>
                  {result.affordable
                    ? "Платежи, резерв и взносы на цели сохраняются."
                    : `Для сохранения плана не хватает ${money(result.shortfall)}.`}
                </Txt>
              </View>
            </Row>
            <View style={{ height: 1, backgroundColor: "#D7DECD" }} />
            <Row style={{ justifyContent: "space-between" }}>
              <View style={{ gap: 6 }}>
                <Txt style={{ color: C.muted, fontSize: 11 }}>
                  На день сейчас
                </Txt>
                <Txt style={{ fontFamily: font.semibold, fontSize: 23 }}>
                  {money(result.daily)}
                </Txt>
              </View>
              <Icon name="arrow-forward" color="#97A18C" />
              <View style={{ gap: 6, alignItems: "flex-end" }}>
                <Txt style={{ color: C.muted, fontSize: 11 }}>
                  После покупки
                </Txt>
                <Txt
                  style={{
                    fontFamily: font.bold,
                    fontSize: 27,
                    color: result.affordable ? C.green : C.orange,
                  }}
                >
                  {money(result.dailyAfter)}
                </Txt>
              </View>
            </Row>
          </Card>
          <Row style={{ justifyContent: "space-between" }}>
            <Txt style={{ color: C.muted, fontSize: 12 }}>
              Останется свободных денег
            </Txt>
            <Txt style={{ fontFamily: font.bold }}>
              {money(Math.max(0, result.after))}
            </Txt>
          </Row>
          {!result.affordable && (
            <Notice tone="warning">
              Можно уменьшить стоимость покупки или пересмотреть план вручную.
              Лад не забирает деньги из ваших целей автоматически.
            </Notice>
          )}
          <Txt style={{ color: C.muted, fontSize: 11, lineHeight: 19 }}>
            Расчёт до {dateLabel(result.payday)} по текущим остаткам и известным
            платежам. Неучтённые расходы могут изменить результат.
          </Txt>
        </>
      ) : (
        <ErrorText error="Введите стоимость покупки больше нуля, не более 1 млрд ₽." />
      )}
    </>
  );
}

export function AccountsContent({ open }: { open: OpenSheet }) {
  const { state } = useFinance();
  return (
    <>
      <Notice>
        Это ручной учёт. Названия счетов и остатки можно изменить; подключения к
        банкам в этой версии нет.
      </Notice>
      {state.accounts.map((account) => (
        <Pressable
          key={account.id}
          accessibilityRole="button"
          onPress={() => open({ type: "account", id: account.id })}
        >
          <Card>
            <Row>
              <IconTile name={account.icon} color={account.color} />
              <View style={{ flex: 1, gap: 6 }}>
                <Txt style={{ fontFamily: font.bold }}>{account.name}</Txt>
                <Txt style={{ color: C.muted, fontSize: 11 }}>
                  {account.kind === "savings"
                    ? "Накопления · вне доступного бюджета"
                    : "Повседневные расходы"}
                </Txt>
              </View>
              <Icon name="create-outline" size={18} color={C.muted} />
            </Row>
            <Txt style={{ fontFamily: font.bold, fontSize: 27, marginTop: 17 }}>
              {money(accountBalance(state, account.id))}
            </Txt>
          </Card>
        </Pressable>
      ))}
      <Button
        label="Добавить счёт"
        icon="add"
        variant="secondary"
        onPress={() => open({ type: "account" })}
      />
    </>
  );
}

export function AccountForm({ id, close }: { id?: string; close: () => void }) {
  const { state, update, notify } = useFinance();
  const original = state.accounts.find((a) => a.id === id);
  const [name, setName] = useState(original?.name ?? "");
  const [kind, setKind] = useState<Account["kind"]>(
    original?.kind ?? "spending",
  );
  const [amount, setAmount] = useState(
    original ? moneyInput(accountBalance(state, original.id)) : "0",
  );
  const [error, setError] = useState("");
  const save = () => {
    const parsed = parseMoney(amount);
    if (!name.trim() || name.length > 120 || parsed === null)
      return setError(
        "Укажите название и неотрицательный остаток до 1 млрд ₽.",
      );
    const currentBalance = original ? accountBalance(state, original.id) : 0;
    const openingBalance =
      parsed - currentBalance + (original?.openingBalance ?? 0);
    if (kind === "savings") {
      const saved = state.goals.reduce((n, g) => n + g.initialSaved, 0);
      const otherOpening = state.accounts
        .filter((a) => a.kind === "savings" && a.id !== id)
        .reduce((n, a) => n + a.openingBalance, 0);
      if (openingBalance + otherOpening < saved)
        return setError(
          "Остаток меньше средств, уже распределённых по целям. Сначала освободите нужную сумму в целях.",
        );
    }
    const account: Account = {
      id: original?.id ?? uid(),
      name: name.trim(),
      kind,
      openingBalance,
      icon:
        original?.icon ??
        (kind === "savings" ? "wallet-outline" : "card-outline"),
      color: original?.color ?? C.green,
    };
    update((s) => ({
      ...s,
      accounts: original
        ? s.accounts.map((a) => (a.id === id ? account : a))
        : [...s.accounts, account],
    }));
    notify("Счёт сохранён");
    close();
  };
  return (
    <>
      <Field
        label="Название счёта"
        accessibilityLabel="Название счёта"
        placeholder="Например, карта для покупок"
        value={name}
        onChangeText={setName}
        maxLength={120}
      />
      {!original && (
        <Segments
          value={kind}
          onChange={setKind}
          options={[
            { value: "spending", label: "Повседневный" },
            { value: "savings", label: "Накопительный" },
          ]}
        />
      )}
      <Field
        label="Текущий остаток, ₽"
        accessibilityLabel="Остаток на счёте"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        maxLength={16}
      />
      <Notice>
        Корректировка остатка не считается доходом или расходом.{" "}
        {kind === "savings"
          ? "Накопительный счёт не входит в сумму «можно потратить»."
          : "Доходы и расходы записывайте в операциях."}
      </Notice>
      <ErrorText error={error} />
      <Button label="Сохранить счёт" onPress={save} />
    </>
  );
}

export function BudgetForm({ id, close }: { id?: string; close: () => void }) {
  const { state, update, notify } = useFinance();
  const category = state.categories.find((c) => c.id === id)!;
  const [amount, setAmount] = useState(moneyInput(category.budget));
  const [error, setError] = useState("");
  return (
    <>
      <Row>
        <IconTile
          name={category.icon}
          color={category.color}
          background={category.background}
        />
        <Txt style={{ fontFamily: font.bold, fontSize: 19 }}>
          {category.name}
        </Txt>
      </Row>
      <Field
        label="Лимит на месяц, ₽"
        accessibilityLabel="Лимит категории"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        maxLength={16}
      />
      <Notice>
        Лимит повторяется каждый месяц. Его изменение не меняет записанные
        расходы.
      </Notice>
      <ErrorText error={error} />
      <Button
        label="Сохранить лимит"
        onPress={() => {
          const parsed = parseMoney(amount);
          if (parsed === null)
            return setError("Введите сумму от 0 до 1 млрд ₽.");
          update((s) => ({
            ...s,
            categories: s.categories.map((c) =>
              c.id === id ? { ...c, budget: parsed } : c,
            ),
          }));
          notify("Лимит обновлён");
          close();
        }}
      />
    </>
  );
}

export function GoalForm({ id, close }: { id?: string; close: () => void }) {
  const { state, update, notify } = useFinance();
  const original = state.goals.find((g) => g.id === id);
  const [name, setName] = useState(original?.name ?? "");
  const [target, setTarget] = useState(
    original ? moneyInput(original.target) : "100000",
  );
  const [monthly, setMonthly] = useState(
    original ? moneyInput(original.monthly) : "5000",
  );
  const [icon, setIcon] = useState<Goal["icon"]>(
    original?.icon ?? "airplane-outline",
  );
  const [error, setError] = useState("");
  const save = () => {
    const targetAmount = parseMoney(target),
      monthlyAmount = parseMoney(monthly);
    if (!name.trim() || !targetAmount || monthlyAmount === null)
      return setError(
        "Укажите название, положительную сумму цели и ежемесячный взнос от 0 ₽.",
      );
    if (original && targetAmount < goalSaved(state, original))
      return setError("Сумма цели не может быть меньше уже накопленного.");
    const goal: Goal = {
      id: original?.id ?? uid(),
      name: name.trim(),
      target: targetAmount,
      monthly: monthlyAmount,
      initialSaved: original?.initialSaved ?? 0,
      icon,
      color: icon === "shield-checkmark-outline" ? C.lavender : "#EAF0E8",
    };
    update((s) => ({
      ...s,
      goals: original
        ? s.goals.map((g) => (g.id === id ? goal : g))
        : [...s.goals, goal],
    }));
    notify(original ? "Цель обновлена" : "Первый шаг к мечте сделан");
    close();
  };
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
            onPress={() => setIcon(value)}
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
        onChangeText={setName}
        maxLength={120}
      />
      <Field
        label="Сколько нужно накопить, ₽"
        accessibilityLabel="Сумма цели"
        value={target}
        onChangeText={setTarget}
        keyboardType="decimal-pad"
        maxLength={16}
      />
      <Field
        label="Планирую откладывать в месяц, ₽"
        accessibilityLabel="Ежемесячный взнос"
        value={monthly}
        onChangeText={setMonthly}
        keyboardType="decimal-pad"
        maxLength={16}
      />
      <Notice>
        Лад зарезервирует взнос в расчёте доступных денег. Само пополнение вы
        отмечаете вручную — когда действительно отложили средства.
      </Notice>
      <ErrorText error={error} />
      <Button
        label={original ? "Сохранить цель" : "Создать цель"}
        onPress={save}
      />
      {original && (
        <DeleteButton
          label="Удалить цель"
          explanation="Цель исчезнет из плана. Все накопленные деньги останутся на счетах, а переводы — в истории."
          onDelete={() => {
            update((s) => ({
              ...s,
              goals: s.goals.filter((g) => g.id !== id),
              transactions: s.transactions.map((t) =>
                t.goalId === id ? { ...t, goalId: undefined } : t,
              ),
            }));
            notify("Цель удалена, деньги остались на счетах");
            close();
          }}
        />
      )}
    </>
  );
}

export function FundGoalForm({
  id,
  close,
  open,
}: {
  id?: string;
  close: () => void;
  open: OpenSheet;
}) {
  const { state, update, notify, today } = useFinance();
  const goal = state.goals.find((g) => g.id === id)!;
  const saved = goalSaved(state, goal),
    remaining = Math.max(0, goal.target - saved);
  const [amount, setAmount] = useState(
    moneyInput(Math.min(goal.monthly || remaining, remaining)),
  );
  const [accountId, setAccountId] = useState(
    state.accounts.find((a) => a.kind === "spending")!.id,
  );
  const [error, setError] = useState("");
  const save = () => {
    const parsed = parseMoney(amount);
    if (!parsed || parsed > remaining)
      return setError(`Введите сумму от 0,01 ₽ до ${money(remaining, true)}.`);
    const transaction: Transaction = {
      id: uid(),
      type: "transfer",
      title: goal.name,
      amount: parsed,
      date: today,
      category: "other",
      accountId,
      toAccountId: state.accounts.find((a) => a.kind === "savings")!.id,
      goalId: goal.id,
    };
    const validation = validateTransaction(state, transaction);
    if (validation) return setError(validation);
    update((s) => ({ ...s, transactions: [transaction, ...s.transactions] }));
    notify("Вы стали ближе к цели");
    close();
  };
  return (
    <>
      <View style={{ alignItems: "center", gap: 14 }}>
        <IconTile name={goal.icon} background={goal.color} size={64} />
        <Txt
          style={{ fontFamily: font.bold, fontSize: 21, textAlign: "center" }}
        >
          {goal.name}
        </Txt>
        <Txt style={{ fontSize: 12, color: C.muted }}>
          {money(saved)} из {money(goal.target)}
        </Txt>
      </View>
      <Progress value={saved / goal.target} color="#78986A" height={8} />
      {remaining > 0 ? (
        <>
          <Field
            label="Сколько вы отложили, ₽"
            accessibilityLabel="Сумма пополнения цели"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            maxLength={16}
          />
          <AccountPicker
            selected={accountId}
            onChange={setAccountId}
            spendingOnly
            label="Со счёта"
          />
          <Notice>
            Запишем перевод на счёт «
            {state.accounts.find((a) => a.kind === "savings")!.name}». Отмечайте
            пополнение после фактического перевода денег.
          </Notice>
          <ErrorText error={error} />
          <Button label="Записать пополнение" icon="add" onPress={save} />
        </>
      ) : (
        <Notice>
          Вы достигли цели. Можно дать себе время порадоваться — или выбрать
          новую мечту.
        </Notice>
      )}
      <Button
        label="Изменить цель"
        variant="secondary"
        onPress={() => open({ type: "goal", id: goal.id })}
      />
    </>
  );
}

export function RecurringForm({
  id,
  close,
}: {
  id?: string;
  close: () => void;
}) {
  const { state, update, notify } = useFinance();
  const original = state.recurring.find((p) => p.id === id);
  const [name, setName] = useState(original?.name ?? "");
  const [amount, setAmount] = useState(
    original ? moneyInput(original.amount) : "",
  );
  const [day, setDay] = useState(String(original?.day ?? 15));
  const [kind, setKind] = useState<"bill" | "subscription">(
    original?.kind ?? "subscription",
  );
  const [category, setCategory] = useState<CategoryId>(
    original?.category ?? "other",
  );
  const [accountId, setAccountId] = useState(
    original?.accountId ??
      state.accounts.find((a) => a.kind === "spending")!.id,
  );
  const [error, setError] = useState("");
  const save = () => {
    const parsed = parseMoney(amount),
      dayNumber = Number(day);
    if (
      !name.trim() ||
      !parsed ||
      !/^\d{1,2}$/.test(day) ||
      dayNumber < 1 ||
      dayNumber > 31
    )
      return setError("Укажите название, сумму больше нуля и день от 1 до 31.");
    const payment = {
      id: original?.id ?? uid(),
      name: name.trim(),
      amount: parsed,
      day: dayNumber,
      kind,
      category,
      accountId,
      active: original?.active ?? true,
      icon:
        original?.icon ??
        ((kind === "bill" ? "home-outline" : "musical-notes-outline") as
          "home-outline" | "musical-notes-outline"),
      color: original?.color ?? "#EEEBF5",
    };
    update((s) => ({
      ...s,
      recurring: original
        ? s.recurring.map((p) => (p.id === id ? payment : p))
        : [...s.recurring, payment],
    }));
    notify("Платёж сохранён");
    close();
  };
  return (
    <>
      <Segments
        value={kind}
        onChange={setKind}
        options={[
          { value: "subscription", label: "Подписка" },
          { value: "bill", label: "Обязательный платёж" },
        ]}
      />
      <Field
        label="Название"
        accessibilityLabel="Название платежа"
        placeholder="Например, домашний интернет"
        value={name}
        onChangeText={setName}
        maxLength={120}
      />
      <Field
        label="Сумма в месяц, ₽"
        accessibilityLabel="Сумма платежа"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        maxLength={16}
      />
      <Field
        label="День списания · от 1 до 31"
        accessibilityLabel="День списания"
        value={day}
        onChangeText={setDay}
        keyboardType="number-pad"
        maxLength={2}
      />
      <AccountPicker
        selected={accountId}
        onChange={setAccountId}
        spendingOnly
      />
      <CategoryPicker value={category} onChange={setCategory} />
      <Notice>
        Если в месяце нет выбранного числа, платёж планируется на последний день
        месяца. Реального списания приложение не выполняет.
      </Notice>
      <ErrorText error={error} />
      <Button label="Сохранить платёж" onPress={save} />
      {original && (
        <DeleteButton
          label="Удалить из плана"
          explanation="Платёж исчезнет из прогноза. Записанные расходы останутся в истории. Подписка в самом сервисе продолжит действовать."
          onDelete={() => {
            update((s) => ({
              ...s,
              recurring: s.recurring.filter((p) => p.id !== id),
              transactions: s.transactions.map((t) =>
                t.recurringId === id
                  ? { ...t, recurringId: undefined, occurrenceDate: undefined }
                  : t,
              ),
            }));
            notify("Платёж удалён из плана");
            close();
          }}
        />
      )}
    </>
  );
}

export function PaymentContent({
  sheet,
  close,
  open,
}: {
  sheet: SheetState;
  close: () => void;
  open: OpenSheet;
}) {
  const { state, update, notify, today } = useFinance();
  const payment = state.recurring.find((p) => p.id === sheet.id)!;
  const date = sheet.date ?? today;
  const recorded = state.transactions.find(
    (t) =>
      t.recurringId === payment.id &&
      t.occurrenceDate?.slice(0, 7) === date.slice(0, 7),
  );
  return (
    <>
      <View style={{ alignItems: "center", gap: 16 }}>
        <IconTile name={payment.icon} background={payment.color} size={64} />
        <Txt style={{ fontSize: 21, fontFamily: font.bold }}>
          {payment.name}
        </Txt>
        <Txt style={{ fontSize: 37, fontFamily: font.semibold }}>
          {money(payment.amount)}
        </Txt>
        <Txt style={{ fontSize: 12, color: C.muted }}>
          По плану — {dateLabel(date)}
        </Txt>
      </View>
      <Notice>
        {recorded
          ? "Этот платёж уже записан в расходах и не резервируется повторно."
          : "Если вы уже оплатили, запишите расход. Баланс уменьшится, а соответствующий платёж будет отмечен выполненным."}
      </Notice>
      {recorded ? (
        <Button
          label="Открыть записанную операцию"
          onPress={() => open({ type: "transaction", id: recorded.id })}
        />
      ) : (
        <Button
          label="Я оплатил — записать расход"
          icon="checkmark"
          onPress={() => {
            update((s) => {
              if (
                s.transactions.some(
                  (t) =>
                    t.recurringId === payment.id &&
                    t.occurrenceDate?.slice(0, 7) === date.slice(0, 7),
                )
              )
                return s;
              return {
                ...s,
                transactions: [
                  {
                    id: uid(),
                    type: "expense",
                    title: payment.name,
                    amount: payment.amount,
                    date: today,
                    category: payment.category,
                    accountId: payment.accountId,
                    recurringId: payment.id,
                    occurrenceDate: date,
                  },
                  ...s.transactions,
                ],
              };
            });
            notify("Оплата записана");
            close();
          }}
        />
      )}
      <Button
        label="Изменить регулярный платёж"
        variant="secondary"
        onPress={() => open({ type: "recurring", id: payment.id })}
      />
    </>
  );
}

export function SettingsForm({ close }: { close: () => void }) {
  const { state, update, replace, notify } = useFinance();
  const [name, setName] = useState(state.settings.name);
  const [payday, setPayday] = useState(String(state.settings.payday));
  const [buffer, setBuffer] = useState(moneyInput(state.settings.buffer));
  const [error, setError] = useState("");
  const [pending, setPending] = useState<FinanceState | null>(null);
  const [reset, setReset] = useState<"clean" | "demo" | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Не удалось выполнить действие. Повторите попытку.",
      );
    } finally {
      setBusy(false);
    }
  };
  const save = () => {
    const parsed = parseMoney(buffer),
      day = Number(payday);
    if (parsed === null || !/^\d{1,2}$/.test(payday) || day < 1 || day > 31)
      return setError(
        "Укажите день дохода от 1 до 31 и резерв от 0 до 1 млрд ₽.",
      );
    update((s) => ({
      ...s,
      settings: { name: name.trim(), payday: day, buffer: parsed },
    }));
    notify("Настройки сохранены");
    close();
  };
  return (
    <>
      <Card style={{ backgroundColor: C.soft, gap: 12 }}>
        <Row>
          <IconTile name="leaf-outline" background="#DCE7CF" size={45} />
          <View style={{ flex: 1, gap: 5 }}>
            <Txt style={{ fontFamily: font.bold, fontSize: 17 }}>
              Лад — ваши личные финансы
            </Txt>
            <Txt style={{ color: C.muted, fontSize: 11 }}>
              Версия 1.0 ·{" "}
              {state.demo ? "демонстрационный режим" : "ваш личный учёт"}
            </Txt>
          </View>
        </Row>
        <Txt style={{ fontSize: 11, lineHeight: 19, color: "#728068" }}>
          Записи хранятся локально на этом устройстве. Регистрация, реклама и
          передача финансовых данных на сервер отсутствуют.
        </Txt>
      </Card>
      <Field
        label="Как к вам обращаться?"
        accessibilityLabel="Ваше имя"
        value={name}
        onChangeText={setName}
        placeholder="Ваше имя"
        maxLength={40}
      />
      <Field
        label="День следующего регулярного дохода"
        accessibilityLabel="День дохода"
        value={payday}
        onChangeText={setPayday}
        keyboardType="number-pad"
        maxLength={2}
      />
      <Field
        label="Неприкосновенный остаток, ₽"
        accessibilityLabel="Неприкосновенный остаток"
        value={buffer}
        onChangeText={setBuffer}
        keyboardType="decimal-pad"
        maxLength={16}
      />
      <Txt style={{ fontSize: 11, color: C.muted, lineHeight: 19 }}>
        Остаток — деньги на повседневных счетах, которые вы не хотите тратить.
        Он вычитается перед расчётом доступной суммы. День дохода задаёт
        горизонт расчёта и не создаёт поступление автоматически.
      </Txt>
      <ErrorText error={error} />
      <Button label="Сохранить настройки" onPress={save} />
      <View
        style={{ height: 1, backgroundColor: C.border, marginVertical: 4 }}
      />
      <Section title="Данные под вашим контролем" />
      <Txt style={{ fontSize: 11, color: C.muted, lineHeight: 19 }}>
        Экспортируйте копию перед сменой устройства или удалением приложения.
        Копия и локальное хранилище не зашифрованы приложением; облачной
        синхронизации нет.
      </Txt>
      <Button
        label="Экспортировать резервную копию"
        icon="download-outline"
        variant="secondary"
        disabled={busy}
        onPress={() =>
          void run(async () => {
            await exportBackup(state);
            notify("Резервная копия подготовлена");
          })
        }
      />
      <Button
        label="Восстановить из файла"
        icon="cloud-upload-outline"
        variant="secondary"
        disabled={busy}
        onPress={() =>
          void run(async () => {
            const value = await importBackup();
            if (value) {
              setPending(value);
              setReset(null);
            }
          })
        }
      />
      {pending && (
        <Card style={{ gap: 15, backgroundColor: "#FAF0E4" }}>
          <Txt style={{ fontFamily: font.bold }}>Копия проверена</Txt>
          <Txt style={{ fontSize: 12, lineHeight: 20 }}>
            В файле {pending.transactions.length} операций,{" "}
            {pending.accounts.length} счетов и {pending.goals.length} целей.
            Восстановление заменит все текущие данные. Сначала экспортируйте их,
            если хотите сохранить.
          </Txt>
          <Button
            label="Заменить данные этой копией"
            onPress={() => {
              replace(pending);
              notify("Данные восстановлены");
              close();
            }}
          />
          <Button
            label="Отмена восстановления"
            variant="secondary"
            onPress={() => setPending(null)}
          />
        </Card>
      )}
      <View
        style={{ height: 1, backgroundColor: C.border, marginVertical: 4 }}
      />
      {state.demo ? (
        <Button
          label="Начать свой учёт с нуля"
          icon="leaf-outline"
          variant="secondary"
          onPress={() => {
            setReset("clean");
            setPending(null);
          }}
        />
      ) : (
        <Row>
          <Button
            label="Очистить учёт"
            variant="danger"
            style={{ flex: 1 }}
            onPress={() => {
              setReset("clean");
              setPending(null);
            }}
          />
          <Button
            label="Загрузить демо"
            variant="secondary"
            style={{ flex: 1 }}
            onPress={() => {
              setReset("demo");
              setPending(null);
            }}
          />
        </Row>
      )}
      {reset && (
        <Card style={{ gap: 15, backgroundColor: "#FAF0E4" }}>
          <Txt style={{ fontFamily: font.bold }}>
            {reset === "demo" ? "Загрузить пример?" : "Начать с чистого листа?"}
          </Txt>
          <Txt style={{ fontSize: 12, lineHeight: 20 }}>
            Текущие операции, цели, платежи и остатки будут заменены. При
            необходимости сначала экспортируйте резервную копию.
          </Txt>
          <Button
            label={
              reset === "demo"
                ? "Да, заменить демоданными"
                : "Да, начать с пустых счетов"
            }
            onPress={() => {
              const value = createInitialState(reset === "demo");
              value.settings.name = state.settings.name;
              replace(value);
              notify(
                reset === "demo"
                  ? "Демонстрационные данные загружены"
                  : "Всё готово для вашего первого шага",
              );
              close();
            }}
          />
          <Button
            label="Отмена"
            variant="secondary"
            onPress={() => setReset(null)}
          />
        </Card>
      )}
      <Txt
        style={{
          color: "#9BA391",
          fontSize: 10,
          textAlign: "center",
          marginVertical: 12,
        }}
      >
        Сделано, чтобы с деньгами было спокойнее.
      </Txt>
    </>
  );
}
