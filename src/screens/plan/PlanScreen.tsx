import { useState } from "react";
import { View } from "react-native";
import { Segments, ScreenHeading } from "../../shared/ui";
import type { OpenSheet } from "../../application/navigation/types";
import { BudgetsPanel } from "../../features/budgets";
import { GoalsPanel } from "../../features/goals";
import { PaymentsPanel } from "../../features/payments";
import { ForecastPanel } from "../../features/forecast";

export function PlanScreen({ open }: { open: OpenSheet }) {
  const [tab, setTab] = useState("budgets");
  return (
    <View style={{ gap: 24 }}>
      <ScreenHeading
        eyebrow="МАЛЕНЬКИМИ ШАГАМИ К БОЛЬШОМУ"
        title="У всего есть план"
        subtitle="Оставьте место и для нужного, и для приятного."
      />
      <Segments
        value={tab}
        onChange={setTab}
        options={[
          { value: "budgets", label: "Бюджеты" },
          { value: "goals", label: "Цели" },
          { value: "payments", label: "Платежи" },
          { value: "forecast", label: "Прогноз" },
        ]}
      />
      {tab === "budgets" && <BudgetsPanel open={open} />}
      {tab === "goals" && <GoalsPanel open={open} />}
      {tab === "payments" && <PaymentsPanel open={open} />}
      {tab === "forecast" && <ForecastPanel open={open} />}
    </View>
  );
}
