import { memo } from "react";
import {
  HomeScreen,
  TransactionsScreen,
  PlanScreen,
  AnalyticsScreen,
} from "../../screens";
import type { Tab, OpenSheet, Navigate } from "../navigation/types";

export const ActiveScreen = memo(function ActiveScreen({
  tab,
  open,
  navigate,
  hidden,
  planSection,
}: {
  tab: Tab;
  open: OpenSheet;
  navigate: Navigate;
  hidden: boolean;
  planSection?: string;
}) {
  return (
    <>
      {tab === "home" && (
        <HomeScreen open={open} navigate={navigate} hidden={hidden} />
      )}
      {tab === "transactions" && <TransactionsScreen open={open} />}
      {tab === "plan" && <PlanScreen open={open} section={planSection} />}
      {tab === "analytics" && <AnalyticsScreen open={open} />}
    </>
  );
});
