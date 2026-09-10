import { useState } from "react";
import { View } from "react-native";
import { Segments } from "../../ui";
import type { OpenSheet } from "../../navigation/types";
import { ScreenHeading } from "../shared/ScreenHeading";
import { BudgetsPanel } from "./BudgetsPanel";
import { GoalsPanel } from "./GoalsPanel";
import { PaymentsPanel } from "./PaymentsPanel";

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
        ]}
      />
      {tab === "budgets" && <BudgetsPanel open={open} />}
      {tab === "goals" && <GoalsPanel open={open} />}
      {tab === "payments" && <PaymentsPanel open={open} />}
    </View>
  );
}
