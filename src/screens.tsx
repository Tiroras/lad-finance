import React, { useMemo, useState } from "react";
import {
  View,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  Switch,
} from "react-native";
import { useFinance } from "./store";
import {
  C,
  font,
  Txt,
  Row,
  Card,
  Icon,
  IconTile,
  IconButton,
  Section,
  Chip,
  Segments,
  Field,
  Progress,
  Empty,
  Notice,
  Donut,
  BarChart,
  HeroArt,
  Button,
  s,
} from "./ui";
import {
  accountBalance,
  categorySpending,
  dateLabel,
  goalSaved,
  localDate,
  money,
  monthKey,
  shiftDate,
  shiftMonth,
  spendable,
  totals,
  upcoming,
} from "./domain/finance";
import type { Goal, Transaction } from "./domain/types";

export type Tab = "home" | "transactions" | "plan" | "analytics";
export type SheetName =
  | "transaction"
  | "simulate"
  | "formula"
  | "accounts"
  | "account"
  | "settings"
  | "goal"
  | "fund"
  | "recurring"
  | "budget"
  | "payment";
export interface SheetState {
  type: SheetName;
  id?: string;
  transactionType?: Transaction["type"];
  date?: string;
}
export type OpenSheet = (sheet: SheetState) => void;

export function MonthPicker({
  month,
  onChange,
}: {
  month: string;
  onChange: (month: string) => void;
}) {
  return (
    <Row style={{ gap: 2 }}>
      <IconButton
        name="chevron-back"
        label="Предыдущий месяц"
        onPress={() => onChange(monthKey(shiftMonth(`${month}-01`, -1)))}
        style={{ width: 32, height: 36 }}
      />
      <Txt
        style={{
          fontFamily: font.semibold,
          fontSize: 12,
          textTransform: "capitalize",
          minWidth: 110,
          textAlign: "center",
        }}
      >
        {dateLabel(`${month}-01`, { month: "long", year: "numeric" }).replace(
          " г.",
          "",
        )}
      </Txt>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Следующий месяц"
        disabled={month >= monthKey()}
        onPress={() => onChange(monthKey(shiftMonth(`${month}-01`, 1)))}
        style={{ padding: 8, opacity: month >= monthKey() ? 0.25 : 1 }}
      >
        <Icon name="chevron-forward" size={18} />
      </Pressable>
    </Row>
  );
}

export function TransactionRow({
  transaction,
  onPress,
  last = false,
}: {
  transaction: Transaction;
  onPress: () => void;
  last?: boolean;
}) {
  const { state } = useFinance();
  const category = state.categories.find((c) => c.id === transaction.category)!;
  const income = transaction.type === "income",
    transfer = transaction.type === "transfer";
  const account = state.accounts.find((a) => a.id === transaction.accountId);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${transaction.title}, ${money(transaction.amount)}, открыть операцию`}
      onPress={onPress}
      style={({ pressed }) => [
        st.transaction,
        !last && { borderBottomWidth: 1, borderBottomColor: "#F0F2EC" },
        pressed && s.pressed,
      ]}
    >
      <IconTile
        name={
          income
            ? "arrow-down-outline"
            : transfer
              ? "swap-horizontal-outline"
              : category.icon
        }
        color={income ? C.green : transfer ? "#8984AD" : category.color}
        background={
          income ? C.soft : transfer ? C.lavender : category.background
        }
      />
      <View style={{ flex: 1, gap: 5 }}>
        <Txt
          numberOfLines={1}
          style={{ fontFamily: font.semibold, fontSize: 13 }}
        >
          {transaction.title}
        </Txt>
        <Txt numberOfLines={1} style={{ color: C.muted, fontSize: 10 }}>
          {income ? "Доход" : transfer ? "Перевод" : category.name} ·{" "}
          {account?.name}
        </Txt>
      </View>
      <View style={{ alignItems: "flex-end", gap: 5 }}>
        <Txt
          style={{
            fontFamily: font.bold,
            fontSize: 13,
            color: income ? "#538466" : C.ink,
          }}
        >
          {income ? "+" : transfer ? "" : "−"}
          {money(transaction.amount, transaction.amount % 100 !== 0)}
        </Txt>
        <Txt style={{ color: C.muted, fontSize: 10 }}>
          {dateLabel(transaction.date, { day: "numeric", month: "short" })}
        </Txt>
      </View>
    </Pressable>
  );
}

function GoalPreview({ goal, onPress }: { goal: Goal; onPress: () => void }) {
  const { state } = useFinance();
  const saved = goalSaved(state, goal),
    progress = saved / goal.target;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Цель ${goal.name}`}
      onPress={onPress}
      style={({ pressed }) => [
        st.goalPreview,
        { backgroundColor: goal.color },
        pressed && s.pressed,
      ]}
    >
      <Row style={{ justifyContent: "space-between", marginBottom: 19 }}>
        <Icon name={goal.icon} size={24} color={C.green} />
        <Txt style={{ fontFamily: font.bold, fontSize: 11 }}>
          {Math.floor(progress * 100)}%
        </Txt>
      </Row>
      <Txt
        style={{ fontFamily: font.bold, fontSize: 13, marginBottom: 6 }}
        numberOfLines={1}
      >
        {goal.name}
      </Txt>
      <Txt style={{ fontSize: 11, color: "#71806D", marginBottom: 14 }}>
        {money(saved)}{" "}
        <Txt style={{ fontSize: 10, color: "#71806D" }}>
          из {money(goal.target)}
        </Txt>
      </Txt>
      <Progress
        value={progress}
        color={goal.id === "cushion" ? "#9C94B6" : "#6E8D60"}
        background="#FFFFFF88"
      />
    </Pressable>
  );
}

export function HomeScreen({
  open,
  navigate,
  hidden,
}: {
  open: OpenSheet;
  navigate: (tab: Tab) => void;
  hidden: boolean;
}) {
  const { state, today } = useFinance();
  const { width } = useWindowDimensions();
  const wide = width >= 1120;
  const safe = spendable(state, today),
    balance = state.accounts.reduce(
      (sum, account) => sum + accountBalance(state, account.id),
      0,
    );
  const spending = categorySpending(state).sort((a, b) => b.spent - a.spent);
  const monthTotals = totals(state);
  const latest = [...state.transactions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 4);
  const next = upcoming(state).find((p) => !p.paid);
  return (
    <View style={{ gap: 25 }}>
      <Row style={{ justifyContent: "space-between" }}>
        <View style={{ flex: 1, gap: 7 }}>
          <Txt style={st.eyebrow}>ВАША ФИНАНСОВАЯ КАРТИНА</Txt>
          <Txt style={st.pageTitle}>
            {state.settings.name
              ? `${state.settings.name}, всё на виду.`
              : "Больше ясности."}
          </Txt>
          <Txt style={{ color: C.muted, fontSize: 13 }}>
            Меньше забот о деньгах. Больше жизни.
          </Txt>
        </View>
        <View style={st.dayBadge}>
          <Txt style={{ fontSize: 19, fontFamily: font.bold }}>
            {today.slice(-2)}
          </Txt>
          <Txt
            style={{ color: C.muted, fontSize: 9, textTransform: "uppercase" }}
          >
            {dateLabel(today, { month: "short" }).replace(".", "")}
          </Txt>
        </View>
      </Row>
      <View style={{ flexDirection: wide ? "row" : "column", gap: 24 }}>
        <View style={{ flex: 1, gap: 22 }}>
          <View style={st.hero}>
            <HeroArt />
            <Row style={{ justifyContent: "space-between" }}>
              <Row style={{ gap: 7 }}>
                <View style={st.heroDot} />
                <Txt style={{ color: "#D7E4D8", fontSize: 12 }}>
                  Можно потратить
                </Txt>
              </Row>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Как рассчитана доступная сумма"
                onPress={() => open({ type: "formula" })}
                style={st.heroInfo}
              >
                <Icon name="information" color="#D7E4D8" size={16} />
              </Pressable>
            </Row>
            <Txt adjustsFontSizeToFit numberOfLines={1} style={st.heroAmount}>
              {hidden ? "••• ••• ₽" : money(safe.available)}
            </Txt>
            <Txt style={{ color: "#AFC5B6", fontSize: 11 }}>
              до {dateLabel(safe.payday)} · следующего дохода
            </Txt>
            <View style={st.heroDivider} />
            <Row
              style={{
                justifyContent: "space-between",
                flexWrap: "wrap",
                rowGap: 14,
              }}
            >
              <View style={{ gap: 5 }}>
                <Txt style={{ color: "#AFC5B6", fontSize: 10 }}>
                  Комфортно на день
                </Txt>
                <Txt
                  style={{ color: C.lime, fontSize: 22, fontFamily: font.bold }}
                >
                  {hidden ? "••• ₽" : money(safe.daily)}
                </Txt>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => open({ type: "formula" })}
                style={st.heroPill}
              >
                <Icon
                  name={
                    safe.raw < 0
                      ? "alert-circle-outline"
                      : "shield-checkmark-outline"
                  }
                  size={15}
                  color={C.lime}
                />
                <Txt
                  style={{
                    color: C.lime,
                    fontSize: 10,
                    fontFamily: font.medium,
                  }}
                >
                  {safe.raw < 0
                    ? "План требует внимания"
                    : "Счета и цели учтены"}
                </Txt>
              </Pressable>
            </Row>
          </View>
          <Row style={{ gap: 10 }}>
            {(
              [
                {
                  icon: "add-outline",
                  label: "Расход",
                  sheet: { type: "transaction", transactionType: "expense" },
                },
                {
                  icon: "swap-horizontal-outline",
                  label: "Перевод",
                  sheet: { type: "transaction", transactionType: "transfer" },
                },
                {
                  icon: "scan-outline",
                  label: "Проверить покупку",
                  sheet: { type: "simulate" },
                },
              ] as const
            ).map((action) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={action.label}
                key={action.label}
                onPress={() => open(action.sheet)}
                style={({ pressed }) => [st.quickAction, pressed && s.pressed]}
              >
                <View style={st.quickIcon}>
                  <Icon name={action.icon} size={22} />
                </View>
                <Txt style={{ fontFamily: font.semibold, fontSize: 10 }}>
                  {action.label}
                </Txt>
              </Pressable>
            ))}
          </Row>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Открыть мои счета"
            onPress={() => open({ type: "accounts" })}
          >
            <Card style={{ padding: 17 }}>
              <Row>
                <IconTile
                  name="wallet-outline"
                  background="#F1F3EC"
                  size={40}
                />
                <View style={{ flex: 1, gap: 5 }}>
                  <Txt style={{ color: C.muted, fontSize: 10 }}>
                    На всех счетах
                  </Txt>
                  <Txt style={{ fontSize: 20, fontFamily: font.bold }}>
                    {hidden ? "••• ••• ₽" : money(balance)}
                  </Txt>
                </View>
                <Txt style={{ color: C.muted, fontSize: 10 }}>
                  {state.accounts.length} счёта
                </Txt>
                <Icon name="chevron-forward" size={16} color={C.muted} />
              </Row>
            </Card>
          </Pressable>
          {wide && (
            <RecentTransactions
              latest={latest}
              open={open}
              navigate={navigate}
            />
          )}
        </View>
        <View style={{ flex: 1, gap: 24 }}>
          <Pressable
            accessibilityRole="button"
            onPress={() => open({ type: "simulate" })}
            style={({ pressed }) => [st.insight, pressed && s.pressed]}
          >
            <View style={{ flex: 1, gap: 8 }}>
              <Row style={{ gap: 6 }}>
                <Icon name="sparkles-outline" size={14} color="#81729C" />
                <Txt
                  style={{
                    fontFamily: font.bold,
                    color: "#81729C",
                    fontSize: 9,
                    letterSpacing: 1,
                  }}
                >
                  НА ШАГ ВПЕРЁД
                </Txt>
              </Row>
              <Txt style={{ fontFamily: font.bold, fontSize: 16 }}>
                А если купить сейчас?
              </Txt>
              <Txt style={{ fontSize: 11, color: "#898196", lineHeight: 18 }}>
                Примерьте покупку к своему бюджету.{wide ? "\n" : " "}План
                покажет, что изменится.
              </Txt>
            </View>
            <View style={st.insightArrow}>
              <Icon name="arrow-forward" size={22} color="#81729C" />
            </View>
          </Pressable>
          <Card>
            <Section
              title="Куда уходят деньги"
              action="Аналитика"
              onPress={() => navigate("analytics")}
            />
            <Txt
              style={{
                color: C.muted,
                fontSize: 10,
                marginTop: -8,
                marginBottom: 16,
                textTransform: "capitalize",
              }}
            >
              {dateLabel(today, { month: "long" })}
            </Txt>
            {monthTotals.expense > 0 ? (
              <Row style={{ gap: 18, justifyContent: "space-between" }}>
                <Donut
                  size={146}
                  data={spending.map((c) => ({
                    value: c.spent,
                    color: c.color,
                  }))}
                  center={hidden ? "••• ₽" : money(monthTotals.expense)}
                  subtitle="всего за месяц"
                />
                <View style={{ flex: 1, gap: 17 }}>
                  {spending
                    .filter((c) => c.spent > 0)
                    .slice(0, 3)
                    .map((c) => (
                      <View key={c.id} style={{ gap: 5 }}>
                        <Row style={{ gap: 6 }}>
                          <View
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: 3,
                              backgroundColor: c.color,
                            }}
                          />
                          <Txt
                            numberOfLines={1}
                            style={{ fontSize: 10, color: C.muted, flex: 1 }}
                          >
                            {c.name}
                          </Txt>
                        </Row>
                        <Txt
                          style={{
                            marginLeft: 12,
                            fontSize: 13,
                            fontFamily: font.bold,
                          }}
                        >
                          {hidden ? "••• ₽" : money(c.spent)}
                        </Txt>
                      </View>
                    ))}
                </View>
              </Row>
            ) : (
              <Empty
                title="Чистый лист"
                description="Добавьте первый расход — здесь появится ваша картина месяца."
              />
            )}
          </Card>
          <View>
            <Section
              title="Ближе к мечте"
              action="Все цели"
              onPress={() => navigate("plan")}
            />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              {state.goals.length ? (
                state.goals
                  .slice(0, 2)
                  .map((goal) => (
                    <GoalPreview
                      key={goal.id}
                      goal={goal}
                      onPress={() => open({ type: "fund", id: goal.id })}
                    />
                  ))
              ) : (
                <Card style={{ flex: 1 }}>
                  <Empty
                    icon="flag-outline"
                    title="У денег может быть мечта"
                    description="Создайте цель и двигайтесь к ней в своём темпе."
                    action="Создать цель"
                    onPress={() => open({ type: "goal" })}
                  />
                </Card>
              )}
            </View>
          </View>
        </View>
      </View>
      {!wide && (
        <RecentTransactions latest={latest} open={open} navigate={navigate} />
      )}
      {next && (
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            open({ type: "payment", id: next.payment.id, date: next.date })
          }
        >
          <Row style={st.upcoming}>
            <Icon name="calendar-outline" color={C.muted} size={20} />
            <View style={{ flex: 1 }}>
              <Txt style={{ fontSize: 11, fontFamily: font.semibold }}>
                Впереди: {next.payment.name}
              </Txt>
              <Txt style={{ color: C.muted, fontSize: 10, marginTop: 4 }}>
                {dateLabel(next.date)} · уже учтено в плане платежей
              </Txt>
            </View>
            <Txt style={{ fontFamily: font.bold, fontSize: 12 }}>
              {money(next.payment.amount)}
            </Txt>
            <Icon name="chevron-forward" size={15} color={C.muted} />
          </Row>
        </Pressable>
      )}
      <Row style={{ justifyContent: "center", paddingBottom: 4, gap: 6 }}>
        <Icon name="lock-closed-outline" color="#959D90" size={11} />
        <Txt style={{ color: "#959D90", fontSize: 10 }}>
          Ваши деньги. Ваш темп. Ваш Лад.
        </Txt>
      </Row>
    </View>
  );
}

function RecentTransactions({
  latest,
  open,
  navigate,
}: {
  latest: Transaction[];
  open: OpenSheet;
  navigate: (tab: Tab) => void;
}) {
  return (
    <View>
      <Section
        title="Последние операции"
        action="Все"
        onPress={() => navigate("transactions")}
      />
      <Card style={{ paddingVertical: 1, paddingHorizontal: 16 }}>
        {latest.length ? (
          latest.map((t, i) => (
            <TransactionRow
              key={t.id}
              transaction={t}
              onPress={() => open({ type: "transaction", id: t.id })}
              last={i === latest.length - 1}
            />
          ))
        ) : (
          <Empty
            title="Пока без операций"
            description="Запишите расход или доход с помощью кнопки +."
          />
        )}
      </Card>
    </View>
  );
}

export function TransactionsScreen({ open }: { open: OpenSheet }) {
  const { state } = useFinance();
  const [month, setMonth] = useState(monthKey());
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [account, setAccount] = useState("all");
  const [category, setCategory] = useState("all");
  const [limit, setLimit] = useState(60);
  const filtered = useMemo(
    () =>
      state.transactions
        .filter(
          (t) =>
            monthKey(t.date) === month &&
            (type === "all" || t.type === type) &&
            (account === "all" ||
              t.accountId === account ||
              t.toAccountId === account) &&
            (category === "all" || t.category === category) &&
            `${t.title} ${t.note ?? ""}`
              .toLocaleLowerCase("ru-RU")
              .includes(query.trim().toLocaleLowerCase("ru-RU")),
        )
        .sort((a, b) => b.date.localeCompare(a.date)),
    [state.transactions, month, type, query, account, category],
  );
  const income = filtered
      .filter((t) => t.type === "income")
      .reduce((n, t) => n + t.amount, 0),
    expense = filtered
      .filter((t) => t.type === "expense")
      .reduce((n, t) => n + t.amount, 0);
  const groups = new Map<string, Transaction[]>();
  filtered
    .slice(0, limit)
    .forEach((t) => groups.set(t.date, [...(groups.get(t.date) ?? []), t]));
  return (
    <View style={{ gap: 22 }}>
      <View style={{ gap: 8 }}>
        <Txt style={st.eyebrow}>НИЧЕГО НЕ ТЕРЯЕТСЯ</Txt>
        <Txt style={st.pageTitle}>Ваши операции</Txt>
        <Txt style={st.subtitle}>
          Каждая мелочь складывается в общую картину.
        </Txt>
      </View>
      <Row style={{ justifyContent: "space-between" }}>
        <MonthPicker
          month={month}
          onChange={(value) => {
            setMonth(value);
            setLimit(60);
          }}
        />
        <IconButton
          name="add"
          label="Добавить операцию"
          onPress={() => open({ type: "transaction" })}
          style={{ backgroundColor: C.green }}
          color="#fff"
        />
      </Row>
      <Field
        accessibilityLabel="Поиск операций"
        placeholder="Найти кофе, продукты, такси…"
        value={query}
        onChangeText={setQuery}
      />
      <Segments
        value={type}
        onChange={setType}
        options={[
          { value: "all", label: "Все" },
          { value: "expense", label: "Расходы" },
          { value: "income", label: "Доходы" },
          { value: "transfer", label: "Переводы" },
        ]}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        <Chip
          label="Все счета"
          active={account === "all"}
          onPress={() => setAccount("all")}
        />
        {state.accounts.map((a) => (
          <Chip
            key={a.id}
            label={a.name}
            active={a.id === account}
            onPress={() => setAccount(a.id)}
          />
        ))}
      </ScrollView>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        <Chip
          label="Все категории"
          active={category === "all"}
          onPress={() => setCategory("all")}
        />
        {state.categories.map((c) => (
          <Chip
            key={c.id}
            label={c.name}
            icon={c.icon}
            active={c.id === category}
            onPress={() => setCategory(c.id)}
          />
        ))}
      </ScrollView>
      <Row style={{ gap: 12 }}>
        <Card style={{ flex: 1, padding: 16 }}>
          <Txt style={st.metricLabel}>Поступило</Txt>
          <Txt style={[st.metricValue, { color: "#59816A" }]}>
            +{money(income)}
          </Txt>
        </Card>
        <Card style={{ flex: 1, padding: 16 }}>
          <Txt style={st.metricLabel}>Потрачено</Txt>
          <Txt style={st.metricValue}>−{money(expense)}</Txt>
        </Card>
      </Row>
      <Txt style={{ color: C.muted, fontSize: 11 }}>
        По выбранным фильтрам · операций: {filtered.length}
      </Txt>
      {groups.size ? (
        [...groups].map(([date, transactions]) => (
          <View key={date}>
            <Txt
              style={{
                fontSize: 12,
                color: C.muted,
                fontFamily: font.semibold,
                marginBottom: 12,
              }}
            >
              {date === localDate()
                ? "Сегодня"
                : date === shiftDate(localDate(), -1)
                  ? "Вчера"
                  : dateLabel(date)}
            </Txt>
            <Card style={{ paddingVertical: 0, paddingHorizontal: 16 }}>
              {transactions.map((t, i) => (
                <TransactionRow
                  transaction={t}
                  key={t.id}
                  onPress={() => open({ type: "transaction", id: t.id })}
                  last={i === transactions.length - 1}
                />
              ))}
            </Card>
          </View>
        ))
      ) : (
        <Empty
          icon="search-outline"
          title="Здесь пока тихо"
          description="Попробуйте другой месяц или фильтр. Новые операции появятся здесь."
          action="Добавить операцию"
          onPress={() => open({ type: "transaction" })}
        />
      )}
      {filtered.length > limit && (
        <Button
          variant="secondary"
          label="Показать ещё"
          onPress={() => setLimit((n) => n + 60)}
        />
      )}
    </View>
  );
}

export function PlanScreen({ open }: { open: OpenSheet }) {
  const { state, update, notify } = useFinance();
  const [tab, setTab] = useState("budgets");
  const categories = categorySpending(state);
  const budget = categories.reduce((n, c) => n + c.budget, 0),
    spent = categories.reduce((n, c) => n + c.spent, 0);
  const monthly = state.recurring
    .filter((p) => p.active && p.kind === "subscription")
    .reduce((sum, p) => sum + p.amount, 0);
  return (
    <View style={{ gap: 24 }}>
      <View style={{ gap: 8 }}>
        <Txt style={st.eyebrow}>МАЛЕНЬКИМИ ШАГАМИ К БОЛЬШОМУ</Txt>
        <Txt style={st.pageTitle}>У всего есть план</Txt>
        <Txt style={st.subtitle}>
          Оставьте место и для нужного, и для приятного.
        </Txt>
      </View>
      <Segments
        value={tab}
        onChange={setTab}
        options={[
          { value: "budgets", label: "Бюджеты" },
          { value: "goals", label: "Цели" },
          { value: "payments", label: "Платежи" },
        ]}
      />
      {tab === "budgets" && (
        <>
          <Card style={{ backgroundColor: C.green, borderColor: C.green }}>
            <Txt style={{ color: "#C4D2C3", fontSize: 12, marginBottom: 12 }}>
              Ваш план на {dateLabel(localDate(), { month: "long" })}
            </Txt>
            <Txt style={{ color: "#fff", fontFamily: font.bold, fontSize: 30 }}>
              {money(Math.max(0, budget - spent))}
            </Txt>
            <Txt
              style={{
                color: "#C4D2C3",
                fontSize: 11,
                marginTop: 6,
                marginBottom: 22,
              }}
            >
              {spent > budget
                ? `Превышение на ${money(spent - budget)}`
                : `осталось из ${money(budget)}`}
            </Txt>
            <Progress
              value={budget ? spent / budget : 0}
              color={C.lime}
              background="#42614D"
              height={7}
            />
          </Card>
          <Notice>
            Лимиты категорий помогают видеть темп расходов. Сумма «можно
            потратить» рассчитывается отдельно — по вашим счетам и
            обязательствам.
          </Notice>
          <View style={{ gap: 12 }}>
            {categories.map((c) => (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                accessibilityLabel={`Изменить бюджет: ${c.name}`}
                onPress={() => open({ type: "budget", id: c.id })}
              >
                <Card style={{ padding: 17 }}>
                  <Row style={{ marginBottom: 16 }}>
                    <IconTile
                      name={c.icon}
                      color={c.color}
                      background={c.background}
                      size={40}
                    />
                    <View style={{ flex: 1, gap: 5 }}>
                      <Txt style={{ fontFamily: font.bold, fontSize: 13 }}>
                        {c.name}
                      </Txt>
                      <Txt
                        style={{
                          fontSize: 10,
                          color: c.spent > c.budget ? C.red : C.muted,
                        }}
                      >
                        {c.spent > c.budget
                          ? `Сверх плана ${money(c.spent - c.budget)}`
                          : `Осталось ${money(c.budget - c.spent)}`}
                      </Txt>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 5 }}>
                      <Txt style={{ fontFamily: font.bold, fontSize: 13 }}>
                        {money(c.spent)}
                      </Txt>
                      <Txt style={{ color: C.muted, fontSize: 10 }}>
                        из {money(c.budget)}
                      </Txt>
                    </View>
                  </Row>
                  <Progress
                    value={c.budget ? c.spent / c.budget : c.spent ? 1 : 0}
                    color={c.spent > c.budget ? "#CA8B78" : c.color}
                  />
                </Card>
              </Pressable>
            ))}
          </View>
        </>
      )}
      {tab === "goals" && (
        <>
          <Section
            title="То, ради чего"
            action="Новая цель"
            onPress={() => open({ type: "goal" })}
          />
          {state.goals.length ? (
            state.goals.map((goal) => {
              const saved = goalSaved(state, goal),
                remaining = Math.max(0, goal.target - saved);
              const months = goal.monthly
                ? Math.ceil(remaining / goal.monthly)
                : null;
              return (
                <Card key={goal.id} style={{ gap: 19 }}>
                  <Row>
                    <IconTile
                      name={goal.icon}
                      background={goal.color}
                      size={50}
                    />
                    <View style={{ flex: 1, gap: 6 }}>
                      <Txt style={{ fontFamily: font.bold, fontSize: 16 }}>
                        {goal.name}
                      </Txt>
                      <Txt style={{ color: C.muted, fontSize: 11 }}>
                        {remaining === 0
                          ? "Цель достигнута. Это ваш момент!"
                          : months
                            ? `Ещё ${months} мес. при ${money(goal.monthly)} в месяц`
                            : "Накопления в свободном темпе"}
                      </Txt>
                    </View>
                    <IconButton
                      name="ellipsis-horizontal"
                      label={`Изменить цель ${goal.name}`}
                      onPress={() => open({ type: "goal", id: goal.id })}
                    />
                  </Row>
                  <Row style={{ justifyContent: "space-between" }}>
                    <Txt style={{ fontFamily: font.bold, fontSize: 23 }}>
                      {money(saved)}
                    </Txt>
                    <Txt style={{ color: C.muted, fontSize: 12 }}>
                      из {money(goal.target)}
                    </Txt>
                  </Row>
                  <Progress
                    value={saved / goal.target}
                    color="#78986A"
                    height={8}
                  />
                  <Button
                    label={
                      remaining === 0
                        ? "Посмотреть накопления"
                        : "Пополнить цель"
                    }
                    variant="secondary"
                    icon="add"
                    onPress={() => open({ type: "fund", id: goal.id })}
                  />
                </Card>
              );
            })
          ) : (
            <Empty
              icon="flag-outline"
              title="На что вы мечтаете накопить?"
              description="От поездки на выходные до подушки спокойствия. Начните с одной цели."
              action="Создать цель"
              onPress={() => open({ type: "goal" })}
            />
          )}
          <Notice>
            Пополнение цели — перевод между вашими счетами. Оно не увеличивает
            расходы и не меняет общий баланс.
          </Notice>
        </>
      )}
      {tab === "payments" && (
        <>
          <Card style={{ backgroundColor: C.lavender, borderColor: "#E4E0ED" }}>
            <Row style={{ justifyContent: "space-between" }}>
              <View style={{ gap: 8 }}>
                <Txt style={{ fontSize: 12, color: "#82768F" }}>
                  Подписки в вашем плане
                </Txt>
                <Txt style={{ fontFamily: font.bold, fontSize: 28 }}>
                  {money(monthly)}{" "}
                  <Txt style={{ fontSize: 12, color: "#82768F" }}>/ мес.</Txt>
                </Txt>
                <Txt style={{ fontSize: 11, color: "#82768F" }}>
                  {money(monthly * 12)} за год — если цены не изменятся
                </Txt>
              </View>
              <Icon name="repeat-outline" color="#9B8AAF" size={35} />
            </Row>
          </Card>
          <Section
            title="Регулярные платежи"
            action="Добавить"
            onPress={() => open({ type: "recurring" })}
          />
          <Notice>
            Выключите платёж, чтобы оценить экономию в плане. Отменить реальную
            подписку нужно в самом сервисе.
          </Notice>
          {state.recurring.length ? (
            state.recurring.map((p) => (
              <Card
                key={p.id}
                style={{ padding: 16, opacity: p.active ? 1 : 0.65 }}
              >
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
                      <Txt style={{ fontFamily: font.bold, fontSize: 13 }}>
                        {p.name}
                      </Txt>
                      <Txt style={{ color: C.muted, fontSize: 10 }}>
                        {p.active
                          ? `Каждый месяц, ${p.day}-го числа`
                          : "Исключён из плана"}
                      </Txt>
                    </View>
                  </Pressable>
                  <View style={{ alignItems: "flex-end", gap: 8 }}>
                    <Txt style={{ fontFamily: font.bold, fontSize: 13 }}>
                      {money(p.amount)}
                    </Txt>
                    <Switch
                      accessibilityLabel={`Учитывать ${p.name} в плане`}
                      value={p.active}
                      onValueChange={(active) => {
                        update((s) => ({
                          ...s,
                          recurring: s.recurring.map((item) =>
                            item.id === p.id ? { ...item, active } : item,
                          ),
                        }));
                        notify(
                          active
                            ? "Платёж снова учтён в плане"
                            : "Платёж исключён из прогноза",
                        );
                      }}
                      trackColor={{ false: "#DADDDA", true: "#73986C" }}
                      thumbColor="#fff"
                    />
                  </View>
                </Row>
              </Card>
            ))
          ) : (
            <Empty
              icon="calendar-outline"
              title="Без неожиданных платежей"
              description="Добавьте аренду, интернет или подписку. Лад учтёт их при расчёте доступных денег."
              action="Добавить платёж"
              onPress={() => open({ type: "recurring" })}
            />
          )}
          <Section title="Ближайшие даты" />
          <View style={{ gap: 10 }}>
            {upcoming(state).map(({ payment, date, paid }) => (
              <Pressable
                key={`${payment.id}-${date}`}
                accessibilityRole="button"
                onPress={() => open({ type: "payment", id: payment.id, date })}
              >
                <Row style={st.upcoming}>
                  <View style={st.calendarDay}>
                    <Txt style={{ fontFamily: font.bold, fontSize: 17 }}>
                      {date.slice(-2)}
                    </Txt>
                    <Txt style={{ fontSize: 8, color: C.muted }}>
                      {dateLabel(date, { month: "short" }).replace(".", "")}
                    </Txt>
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Txt style={{ fontFamily: font.semibold, fontSize: 12 }}>
                      {payment.name}
                    </Txt>
                    <Txt
                      style={{
                        color: paid ? "#6E9065" : C.muted,
                        fontSize: 10,
                      }}
                    >
                      {paid ? "Оплачен" : "Запланирован"}
                    </Txt>
                  </View>
                  <Txt style={{ fontFamily: font.bold, fontSize: 12 }}>
                    {money(payment.amount)}
                  </Txt>
                  <Icon
                    name={paid ? "checkmark-circle" : "chevron-forward"}
                    size={17}
                    color={paid ? "#6E9065" : C.muted}
                  />
                </Row>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

export function AnalyticsScreen({ open }: { open: OpenSheet }) {
  const { state, today } = useFinance();
  const [month, setMonth] = useState(monthKey());
  const [period, setPeriod] = useState("week");
  const spending = categorySpending(state, month).sort(
      (a, b) => b.spent - a.spent,
    ),
    monthTotals = totals(state, month);
  const end =
    month === monthKey(today)
      ? today
      : shiftDate(shiftMonth(`${month}-01`, 1), -1);
  const count =
    period === "week"
      ? Math.min(7, Number(end.slice(-2)))
      : Number(end.slice(-2));
  const dates = Array.from({ length: count }, (_, i) =>
    shiftDate(end, i - count + 1),
  );
  const values = dates.map((date) =>
    state.transactions
      .filter((t) => t.type === "expense" && t.date === date)
      .reduce((n, t) => n + t.amount, 0),
  );
  const savingsRate =
    monthTotals.income > 0
      ? (monthTotals.income - monthTotals.expense) / monthTotals.income
      : null;
  const biggest = spending.find((c) => c.spent > 0);
  const daily = monthTotals.expense / Math.max(1, Number(end.slice(-2)));
  return (
    <View style={{ gap: 24 }}>
      <View style={{ gap: 8 }}>
        <Txt style={st.eyebrow}>ЦИФРЫ, КОТОРЫЕ ПОМОГАЮТ</Txt>
        <Txt style={st.pageTitle}>Понять свои привычки</Txt>
        <Txt style={st.subtitle}>
          Смотрите на картину целиком, без осуждения.
        </Txt>
      </View>
      <Row style={{ justifyContent: "space-between" }}>
        <Txt style={{ fontFamily: font.bold, fontSize: 14 }}>Ваш месяц</Txt>
        <MonthPicker month={month} onChange={setMonth} />
      </Row>
      <Row style={{ gap: 12 }}>
        <Card style={{ flex: 1, padding: 16 }}>
          <IconTile name="arrow-down-outline" size={34} />
          <Txt style={[st.metricLabel, { marginTop: 12 }]}>Доходы</Txt>
          <Txt style={[st.metricValue, { color: "#59816A" }]}>
            {money(monthTotals.income)}
          </Txt>
        </Card>
        <Card style={{ flex: 1, padding: 16 }}>
          <IconTile
            name="arrow-up-outline"
            size={34}
            color="#A88056"
            background="#F5EEE3"
          />
          <Txt style={[st.metricLabel, { marginTop: 12 }]}>Расходы</Txt>
          <Txt style={st.metricValue}>{money(monthTotals.expense)}</Txt>
        </Card>
      </Row>
      <Card>
        <Section title="В вашем ритме" />
        <Segments
          value={period}
          onChange={setPeriod}
          options={[
            { value: "week", label: "Последние 7 дней" },
            { value: "month", label: "Весь месяц" },
          ]}
        />
        <View style={{ marginTop: 24 }}>
          <BarChart
            key={`${month}-${period}`}
            values={values}
            labels={dates.map((d) =>
              period === "week"
                ? dateLabel(d, { weekday: "short" })
                : dateLabel(d, { day: "numeric", month: "short" }),
            )}
          />
        </View>
      </Card>
      {biggest && (
        <Notice>
          Больше всего в этом месяце — «{biggest.name}»:{" "}
          {Math.round((biggest.spent / monthTotals.expense) * 100)}% расходов. В
          среднем за день вы тратите {money(daily)}.
        </Notice>
      )}
      <Card>
        <Section title="Расходы по категориям" />
        {monthTotals.expense > 0 ? (
          <>
            <View style={{ alignItems: "center", marginVertical: 10 }}>
              <Donut
                data={spending.map((c) => ({ value: c.spent, color: c.color }))}
                center={money(monthTotals.expense)}
                subtitle="расходы за месяц"
                size={205}
              />
            </View>
            <View style={{ marginTop: 20, gap: 22 }}>
              {spending
                .filter((c) => c.spent > 0)
                .map((c) => (
                  <View key={c.id} style={{ gap: 10 }}>
                    <Row>
                      <IconTile
                        name={c.icon}
                        color={c.color}
                        background={c.background}
                        size={35}
                      />
                      <Txt
                        style={{
                          flex: 1,
                          fontFamily: font.semibold,
                          fontSize: 12,
                        }}
                      >
                        {c.name}
                      </Txt>
                      <Txt style={{ fontSize: 10, color: C.muted }}>
                        {Math.round((c.spent / monthTotals.expense) * 100)}%
                      </Txt>
                      <Txt
                        style={{
                          fontFamily: font.bold,
                          fontSize: 12,
                          minWidth: 80,
                          textAlign: "right",
                        }}
                      >
                        {money(c.spent)}
                      </Txt>
                    </Row>
                    <Progress
                      value={c.spent / monthTotals.expense}
                      color={c.color}
                    />
                  </View>
                ))}
            </View>
          </>
        ) : (
          <Empty
            icon="pie-chart-outline"
            title="Ваш график ещё впереди"
            description="В этом месяце пока нет расходов."
          />
        )}
      </Card>
      <Card style={{ backgroundColor: "#EAF0E5" }}>
        <Row>
          <IconTile name="leaf-outline" background="#DCE7D1" size={46} />
          <View style={{ flex: 1, gap: 6 }}>
            <Txt style={{ fontFamily: font.bold, fontSize: 15 }}>
              {savingsRate === null
                ? "Доходы пока не добавлены"
                : savingsRate >= 0
                  ? `${Math.round(savingsRate * 100)}% дохода осталось с вами`
                  : "Расходы превысили доходы"}
            </Txt>
            <Txt style={{ color: "#78816F", fontSize: 11, lineHeight: 18 }}>
              Разница доходов и расходов:{" "}
              {money(monthTotals.income - monthTotals.expense)}. Переводы между
              счетами не учитываются.
            </Txt>
          </View>
        </Row>
      </Card>
      <Button
        variant="secondary"
        label="Проверить будущую покупку"
        icon="scan-outline"
        onPress={() => open({ type: "simulate" })}
      />
    </View>
  );
}

const st = StyleSheet.create({
  eyebrow: {
    color: "#8B9585",
    fontFamily: font.semibold,
    fontSize: 9,
    letterSpacing: 1.55,
  },
  pageTitle: {
    fontFamily: font.extra,
    fontSize: 29,
    letterSpacing: -1.1,
    lineHeight: 37,
  },
  subtitle: { color: C.muted, fontSize: 12, lineHeight: 20 },
  dayBadge: {
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: "#fff",
    width: 47,
    height: 55,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  hero: {
    backgroundColor: C.green,
    borderRadius: 25,
    padding: 24,
    overflow: "hidden",
    boxShadow: "0 8px 22px rgba(35, 75, 60, 0.12)",
  },
  heroDot: { width: 6, height: 6, backgroundColor: C.lime, borderRadius: 3 },
  heroInfo: {
    width: 27,
    height: 27,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#6D8674",
  },
  heroAmount: {
    color: "#F6F8EB",
    fontFamily: font.medium,
    fontSize: 44,
    letterSpacing: -1.9,
    marginTop: 15,
    marginBottom: 7,
  },
  heroDivider: {
    height: 1,
    backgroundColor: "#4A6856",
    opacity: 0.7,
    marginTop: 24,
    marginBottom: 20,
  },
  heroPill: {
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
    borderRadius: 14,
    backgroundColor: "#355846",
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  quickAction: { flex: 1, alignItems: "center", gap: 9, paddingVertical: 2 },
  quickIcon: {
    backgroundColor: "#EAF0E3",
    height: 46,
    width: 57,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 17,
  },
  insight: {
    backgroundColor: C.lavender,
    padding: 20,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#E8E4F0",
  },
  insightArrow: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: "#D4CCE0",
    alignItems: "center",
    justifyContent: "center",
  },
  goalPreview: { flex: 1, minWidth: 140, borderRadius: 19, padding: 16 },
  transaction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingVertical: 15,
  },
  upcoming: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: "#F0F3EB",
    borderRadius: 16,
    padding: 15,
  },
  metricLabel: { color: C.muted, fontSize: 11, marginBottom: 8 },
  metricValue: { fontFamily: font.bold, fontSize: 21, letterSpacing: -0.5 },
  calendarDay: {
    width: 42,
    height: 46,
    borderRadius: 10,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
  },
});
