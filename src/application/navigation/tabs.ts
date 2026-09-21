import type { IName } from "../../shared/ui";
import type { Tab } from "./types";

export const tabs: { id: Tab; label: string; icon: IName; active: IName }[] = [
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
