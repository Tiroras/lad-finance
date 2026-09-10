import React, { useEffect, useRef, useState } from "react";
import {
  View,
  ScrollView,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  ActivityIndicator,
  Platform,
  BackHandler,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import { Manrope_400Regular } from "@expo-google-fonts/manrope/400Regular";
import { Manrope_500Medium } from "@expo-google-fonts/manrope/500Medium";
import { Manrope_600SemiBold } from "@expo-google-fonts/manrope/600SemiBold";
import { Manrope_700Bold } from "@expo-google-fonts/manrope/700Bold";
import { Manrope_800ExtraBold } from "@expo-google-fonts/manrope/800ExtraBold";
import { FinanceProvider, useFinance } from "./store";
import {
  C,
  font,
  Txt,
  Row,
  Icon,
  IconButton,
  Button,
  Sheet,
  s,
  type IName,
} from "./ui";
import {
  HomeScreen,
  TransactionsScreen,
  PlanScreen,
  AnalyticsScreen,
  type Tab,
  type SheetState,
} from "./screens";
import {
  TransactionForm,
  FormulaContent,
  Simulator,
  AccountsContent,
  AccountForm,
  BudgetForm,
  GoalForm,
  FundGoalForm,
  RecurringForm,
  PaymentContent,
  SettingsForm,
} from "./forms";

const tabs: { id: Tab; label: string; icon: IName; active: IName }[] = [
  { id: "home", label: "Обзор", icon: "grid-outline", active: "grid" },
  {
    id: "transactions",
    label: "Операции",
    icon: "swap-horizontal-outline",
    active: "swap-horizontal",
  },
  { id: "plan", label: "План", icon: "albums-outline", active: "albums" },
  {
    id: "analytics",
    label: "Аналитика",
    icon: "stats-chart-outline",
    active: "stats-chart",
  },
];

function Brand({ small = false }: { small?: boolean }) {
  return (
    <Row style={{ gap: 8 }}>
      <View style={{ width: 27, height: 31, justifyContent: "center" }}>
        <View
          style={{
            position: "absolute",
            left: 4,
            bottom: 3,
            height: 23,
            width: 10,
            borderTopLeftRadius: 10,
            borderBottomRightRadius: 10,
            backgroundColor: "#829B65",
            transform: [{ rotate: "27deg" }],
          }}
        />
        <View
          style={{
            position: "absolute",
            left: 17,
            top: 2,
            height: 13,
            width: 8,
            borderTopRightRadius: 8,
            borderBottomLeftRadius: 8,
            backgroundColor: "#B8CC94",
            transform: [{ rotate: "27deg" }],
          }}
        />
      </View>
      <Txt
        style={{
          fontFamily: font.extra,
          letterSpacing: -1.8,
          fontSize: small ? 29 : 35,
        }}
      >
        лад
      </Txt>
      {!small && (
        <View
          style={{
            width: 4,
            height: 4,
            backgroundColor: "#A9BC8D",
            borderRadius: 2,
            marginTop: 16,
            marginLeft: -5,
          }}
        />
      )}
    </Row>
  );
}

function Application() {
  const { state, ready, loadError, saveError, reload, retrySave, toast } =
    useFinance();
  const [tab, setTab] = useState<Tab>("home");
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [hidden, setHidden] = useState(false);
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const navigate = (value: Tab) => {
    setTab(value);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const close = () => setSheet(null);
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (sheet) {
          close();
          return true;
        }
        if (tab !== "home") {
          navigate("home");
          return true;
        }
        return false;
      },
    );
    return () => subscription.remove();
  }, [tab, sheet]);
  if (!ready)
    return (
      <SafeAreaView style={st.loading}>
        <Brand />
        <View style={{ height: 24 }} />
        {loadError ? (
          <>
            <Txt style={{ textAlign: "center", lineHeight: 22, maxWidth: 340 }}>
              {loadError}
            </Txt>
            <Button
              label="Повторить загрузку"
              onPress={reload}
              style={{ marginTop: 22 }}
            />
          </>
        ) : (
          <ActivityIndicator color={C.green} />
        )}
      </SafeAreaView>
    );
  const titles: Record<SheetState["type"], string> = {
    transaction: sheet?.id ? "Детали операции" : "Новая операция",
    formula: "Всё прозрачно",
    simulate: "А если купить сейчас?",
    accounts: "Мои счета",
    account: sheet?.id ? "Настроить счёт" : "Новый счёт",
    settings: "Ваш Лад",
    goal: sheet?.id ? "Настроить цель" : "Новая мечта",
    fund: "Ближе к цели",
    recurring: sheet?.id ? "Настроить платёж" : "Новый платёж",
    budget: "Бюджет категории",
    payment: "Запланированный платёж",
  };
  const renderSheet = () => {
    if (!sheet) return null;
    switch (sheet.type) {
      case "transaction":
        return <TransactionForm sheet={sheet} close={close} />;
      case "formula":
        return <FormulaContent />;
      case "simulate":
        return <Simulator />;
      case "accounts":
        return <AccountsContent open={setSheet} />;
      case "account":
        return <AccountForm id={sheet.id} close={close} />;
      case "settings":
        return <SettingsForm close={close} />;
      case "goal":
        return <GoalForm id={sheet.id} close={close} />;
      case "fund":
        return <FundGoalForm id={sheet.id} close={close} open={setSheet} />;
      case "recurring":
        return <RecurringForm id={sheet.id} close={close} />;
      case "budget":
        return <BudgetForm id={sheet.id} close={close} />;
      case "payment":
        return <PaymentContent sheet={sheet} close={close} open={setSheet} />;
    }
  };
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={st.safe}>
      <StatusBar style="dark" />
      <View
        style={st.appFrame}
        aria-hidden={!!sheet}
        importantForAccessibility={sheet ? "no-hide-descendants" : "auto"}
      >
        {wide && (
          <View style={st.sidebar}>
            <View style={{ paddingHorizontal: 22, paddingTop: 14 }}>
              <Brand />
              <Txt style={{ fontSize: 10, color: C.muted, marginTop: 10 }}>
                Финансы в вашем ритме
              </Txt>
            </View>
            <View style={{ marginTop: 56, gap: 8 }}>
              {tabs.map((item) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="tab"
                  accessibilityLabel={item.label}
                  accessibilityState={{ selected: tab === item.id }}
                  onPress={() => navigate(item.id)}
                  style={({ pressed }) => [
                    st.sideItem,
                    tab === item.id && { backgroundColor: "#E8EFDF" },
                    pressed && s.pressed,
                  ]}
                >
                  <Icon
                    name={tab === item.id ? item.active : item.icon}
                    size={20}
                    color={tab === item.id ? C.green : "#92998C"}
                  />
                  <Txt
                    style={{
                      fontFamily: tab === item.id ? font.bold : font.medium,
                      fontSize: 13,
                      color: tab === item.id ? C.green : C.muted,
                    }}
                  >
                    {item.label}
                  </Txt>
                  {tab === item.id && (
                    <View
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: 3,
                        marginLeft: "auto",
                        backgroundColor: "#6F8B56",
                      }}
                    />
                  )}
                </Pressable>
              ))}
            </View>
            <Button
              label="Добавить операцию"
              icon="add"
              style={{ marginTop: 32 }}
              onPress={() => setSheet({ type: "transaction" })}
            />
            <View style={{ flex: 1 }} />
            <View style={st.sideNote}>
              <Icon name="leaf-outline" size={26} color="#839975" />
              <Txt
                style={{
                  fontSize: 15,
                  fontFamily: font.bold,
                  marginTop: 13,
                  lineHeight: 23,
                }}
              >
                Спокойствие начинается с ясности.
              </Txt>
              <Txt
                style={{
                  color: "#919B88",
                  fontSize: 10,
                  lineHeight: 18,
                  marginTop: 9,
                }}
              >
                Один маленький шаг для себя каждый день.
              </Txt>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Настройки"
              onPress={() => setSheet({ type: "settings" })}
              style={st.sideItem}
            >
              <Icon name="settings-outline" size={20} color={C.muted} />
              <Txt style={{ color: C.muted, fontSize: 12 }}>Настройки</Txt>
            </Pressable>
            <Row style={{ paddingHorizontal: 20, paddingVertical: 16, gap: 6 }}>
              <Icon name="lock-closed-outline" size={11} color="#9AA28F" />
              <Txt style={{ color: "#9AA28F", fontSize: 9 }}>
                Данные на вашем устройстве
              </Txt>
            </Row>
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Row
            style={[st.header, wide && { paddingHorizontal: 38, height: 80 }]}
          >
            {wide ? (
              <Row style={{ gap: 7 }}>
                <View
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: 3,
                    backgroundColor: "#87A477",
                  }}
                />
                <Txt style={{ color: C.muted, fontSize: 11 }}>
                  Ваше личное пространство
                </Txt>
              </Row>
            ) : (
              <Brand small />
            )}
            <View style={{ flex: 1 }} />
            {state.demo && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Деморежим, открыть настройки"
                onPress={() => setSheet({ type: "settings" })}
                style={st.demoBadge}
              >
                <Txt
                  style={{
                    color: "#7E8E6A",
                    fontSize: 9,
                    fontFamily: font.bold,
                    letterSpacing: 0.7,
                  }}
                >
                  ДЕМО
                </Txt>
              </Pressable>
            )}
            <IconButton
              name={hidden ? "eye-off-outline" : "eye-outline"}
              label={hidden ? "Показать баланс" : "Скрыть баланс"}
              onPress={() => setHidden((v) => !v)}
              color="#8A9383"
              style={{ width: 34, height: 38 }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Профиль и настройки"
              onPress={() => setSheet({ type: "settings" })}
              style={st.avatar}
            >
              <Txt style={{ fontFamily: font.bold, fontSize: 13 }}>
                {state.settings.name
                  ? state.settings.name[0].toLocaleUpperCase("ru-RU")
                  : "Я"}
              </Txt>
            </Pressable>
          </Row>
          {saveError && (
            <Pressable
              accessibilityRole="button"
              onPress={retrySave}
              style={{ padding: 12, backgroundColor: "#F8E8DA" }}
            >
              <Txt
                accessibilityRole="alert"
                style={{ color: C.red, fontSize: 12, textAlign: "center" }}
              >
                Не удалось сохранить изменения. Нажмите, чтобы повторить. Можно
                экспортировать копию в настройках.
              </Txt>
            </Pressable>
          )}
          <ScrollView
            ref={scroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[
              st.content,
              wide && { paddingHorizontal: 38, paddingTop: 28, maxWidth: 1220 },
            ]}
          >
            {tab === "home" && (
              <HomeScreen open={setSheet} navigate={navigate} hidden={hidden} />
            )}
            {tab === "transactions" && <TransactionsScreen open={setSheet} />}
            {tab === "plan" && <PlanScreen open={setSheet} />}
            {tab === "analytics" && <AnalyticsScreen open={setSheet} />}
          </ScrollView>
          {!wide && (
            <View
              style={[
                st.bottomNav,
                { paddingBottom: Math.max(12, insets.bottom) },
              ]}
            >
              {tabs.map((item, index) => (
                <React.Fragment key={item.id}>
                  {index === 2 && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Добавить операцию"
                      onPress={() => setSheet({ type: "transaction" })}
                      style={({ pressed }) => [
                        st.addButton,
                        pressed && s.pressed,
                      ]}
                    >
                      <Icon name="add" size={29} color="#fff" />
                    </Pressable>
                  )}
                  <Pressable
                    accessibilityRole="tab"
                    accessibilityLabel={item.label}
                    accessibilityState={{ selected: tab === item.id }}
                    onPress={() => navigate(item.id)}
                    style={st.navItem}
                  >
                    <Icon
                      name={tab === item.id ? item.active : item.icon}
                      size={21}
                      color={tab === item.id ? C.green : "#A2AA9B"}
                    />
                    <Txt
                      style={{
                        fontFamily: tab === item.id ? font.bold : font.medium,
                        fontSize: 9,
                        color: tab === item.id ? C.green : "#A2AA9B",
                      }}
                    >
                      {item.label}
                    </Txt>
                    <View
                      style={{
                        height: 3,
                        width: 3,
                        borderRadius: 2,
                        backgroundColor:
                          tab === item.id ? "#7B9464" : "transparent",
                      }}
                    />
                  </Pressable>
                </React.Fragment>
              ))}
            </View>
          )}
        </View>
        {!!toast && !sheet && (
          <View
            pointerEvents="none"
            style={[st.toast, { bottom: wide ? 25 : 95 + insets.bottom }]}
          >
            <Icon name="checkmark-circle" size={18} color={C.lime} />
            <Txt
              accessibilityRole="alert"
              style={{ color: "#fff", fontSize: 12, flexShrink: 1 }}
            >
              {toast}
            </Txt>
          </View>
        )}
      </View>
      <Sheet
        visible={!!sheet}
        title={sheet ? titles[sheet.type] : ""}
        onClose={close}
      >
        <View key={`${sheet?.type}-${sheet?.id ?? "new"}`} style={{ gap: 20 }}>
          {renderSheet()}
          {!!toast && (
            <Txt
              accessibilityRole="alert"
              style={{ color: C.green, fontSize: 12 }}
            >
              {toast}
            </Txt>
          )}
        </View>
      </Sheet>
    </SafeAreaView>
  );
}

export default function App() {
  const [loaded, error] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });
  return (
    <SafeAreaProvider>
      {!loaded && !error ? (
        <View style={st.loading}>
          <ActivityIndicator color={C.green} />
        </View>
      ) : (
        <FinanceProvider>
          <Application />
        </FinanceProvider>
      )}
    </SafeAreaProvider>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  loading: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  appFrame: {
    flex: 1,
    flexDirection: "row",
    width: "100%",
    maxWidth: 1600,
    alignSelf: "center",
  },
  sidebar: {
    width: 245,
    paddingHorizontal: 14,
    paddingTop: 26,
    backgroundColor: "#F2F5EB",
    borderRightWidth: 1,
    borderRightColor: "#E5EADF",
  },
  sideItem: {
    minHeight: 51,
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
    paddingHorizontal: 20,
    borderRadius: 13,
  },
  sideNote: { padding: 22, marginBottom: 24 },
  header: {
    height: 75,
    paddingHorizontal: 21,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF0E9",
  },
  avatar: {
    width: 37,
    height: 37,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E8EEDC",
    borderWidth: 3,
    borderColor: "#fff",
  },
  demoBadge: {
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#DAE2CF",
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: "#F2F5EB",
  },
  content: {
    width: "100%",
    paddingHorizontal: 21,
    paddingTop: 25,
    paddingBottom: 30,
    alignSelf: "center",
  },
  bottomNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingTop: 12,
    paddingHorizontal: 10,
    backgroundColor: "#FCFDF9",
    borderTopWidth: 1,
    borderTopColor: "#E8ECE1",
  },
  navItem: {
    flex: 1,
    alignItems: "center",
    gap: 5,
    paddingTop: 3,
    minHeight: 48,
    justifyContent: "center",
  },
  addButton: {
    backgroundColor: C.green,
    height: 49,
    width: 49,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 9,
    marginBottom: 3,
    boxShadow: "0 4px 10px rgba(35,75,60,.18)",
  },
  toast: {
    position: "absolute",
    alignSelf: "center",
    left: 24,
    right: 24,
    maxWidth: 500,
    marginHorizontal: "auto",
    padding: 16,
    backgroundColor: C.green,
    borderRadius: 16,
    flexDirection: "row",
    gap: 9,
    alignItems: "center",
    boxShadow: "0 5px 15px rgba(20,35,25,.15)",
  },
});
