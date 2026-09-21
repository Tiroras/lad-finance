import { View, useWindowDimensions } from "react-native";
import { Txt, Row, Icon, Button } from "../../shared/ui";
import type { OpenSheet, Navigate } from "../../application/navigation/types";
import { RecentTransactions } from "../../features/transactions";
import { HomeHeader } from "./HomeHeader";
import { SpendableCard, PurchaseInsight } from "../../features/forecast";
import { QuickActions } from "./QuickActions";
import { AccountsSummary } from "../../features/accounts";
import { SpendingSummary } from "./SpendingSummary";
import { GoalsSummary } from "../../features/goals";
import { NextPaymentCard } from "../../features/payments";

export function HomeScreen({
  open,
  navigate,
  hidden,
}: {
  open: OpenSheet;
  navigate: Navigate;
  hidden: boolean;
}) {
  const { width } = useWindowDimensions();
  const wide = width >= 1120;
  return (
    <View style={{ gap: 25 }}>
      <HomeHeader />
      <View style={{ flexDirection: wide ? "row" : "column", gap: 24 }}>
        <View style={{ flex: wide ? 1 : undefined, gap: 22 }}>
          <SpendableCard open={open} hidden={hidden} />
          <QuickActions open={open} />
          <AccountsSummary open={open} hidden={hidden} />
          {wide && <RecentTransactions open={open} navigate={navigate} />}
        </View>
        <View style={{ flex: wide ? 1 : undefined, gap: 24 }}>
          <PurchaseInsight open={open} wide={wide} />
          <Button
            label="Прогноз по дням"
            icon="calendar-outline"
            variant="secondary"
            onPress={() => open({ type: "forecast" })}
          />
          <SpendingSummary navigate={navigate} hidden={hidden} />
          <GoalsSummary open={open} navigate={navigate} />
        </View>
      </View>
      {!wide && <RecentTransactions open={open} navigate={navigate} />}
      <NextPaymentCard open={open} />
      <Row style={{ justifyContent: "center", paddingBottom: 4, gap: 6 }}>
        <Icon name="lock-closed-outline" color="#959D90" size={11} />
        <Txt style={{ color: "#959D90", fontSize: 10 }}>
          Ваши деньги. Ваш темп. Ваш Лад.
        </Txt>
      </Row>
    </View>
  );
}
