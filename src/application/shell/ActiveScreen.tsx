import {
  HomeScreen,
  TransactionsScreen,
  PlanScreen,
  AnalyticsScreen,
} from "../../screens";
import type { Tab, OpenSheet, Navigate } from "../navigation/types";

export function ActiveScreen({
  tab,
  open,
  navigate,
  hidden,
}: {
  tab: Tab;
  open: OpenSheet;
  navigate: Navigate;
  hidden: boolean;
}) {
  return (
    <>
      {tab === "home" && (
        <HomeScreen open={open} navigate={navigate} hidden={hidden} />
      )}
      {tab === "transactions" && <TransactionsScreen open={open} />}
      {tab === "plan" && <PlanScreen open={open} />}
      {tab === "analytics" && <AnalyticsScreen open={open} />}
    </>
  );
}
