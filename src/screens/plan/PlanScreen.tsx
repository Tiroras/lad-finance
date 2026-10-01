import { useEffect, useState } from "react";
import { View } from "react-native";
import { Segments, ScreenHeading } from "../../shared/ui";
import type { OpenSheet } from "../../application/navigation/types";
import { BudgetsPanel } from "../../features/budgets";
import { GoalsPanel } from "../../features/goals";
import { PaymentsPanel } from "../../features/payments";
import { ForecastPanel } from "../../features/forecast";

export function PlanScreen({
  open,
  section,
}: {
  open: OpenSheet;
  section?: string;
}) {
  const [selectedTab, setTab] = useState("budgets");
  const tab = section ?? selectedTab;
  useEffect(() => {
    if (section) setTab(section);
  }, [section]);
  return (
    <View testID="screen-plan" style={{ gap: 24 }}>
      <ScreenHeading
        eyebrow="МАЛЕНЬКИМИ ШАГАМИ К БОЛЬШОМУ"
        title="У всего есть план"
        subtitle="Оставьте место и для нужного, и для приятного."
      />
      <Segments
        value={tab}
        onChange={setTab}
        options={[
          { value: "budgets", label: "Бюджеты", tourId: "plan.budgets" },
          { value: "goals", label: "Цели", tourId: "plan.goals" },
          { value: "payments", label: "Платежи", tourId: "plan.payments" },
          { value: "forecast", label: "Прогноз", tourId: "plan.forecast" },
        ]}
      />
      {tab === "budgets" && <BudgetsPanel open={open} />}
      {tab === "goals" && <GoalsPanel open={open} />}
      {tab === "payments" && <PaymentsPanel open={open} />}
      {tab === "forecast" && <ForecastPanel open={open} />}
    </View>
  );
}
