import type { Category, FinanceState, Transaction } from "./types";
import { localDate, shiftDate, uid } from "./finance";

export const CATEGORIES: Category[] = [
  {
    id: "groceries",
    name: "Продукты",
    icon: "leaf-outline",
    color: "#537967",
    background: "#EAF0E8",
    budget: 1800000,
  },
  {
    id: "cafe",
    name: "Кафе и рестораны",
    icon: "cafe-outline",
    color: "#B97A49",
    background: "#F8EEE2",
    budget: 1000000,
  },
  {
    id: "transport",
    name: "Транспорт",
    icon: "car-outline",
    color: "#7C7CAF",
    background: "#EEEFFA",
    budget: 600000,
  },
  {
    id: "shopping",
    name: "Покупки",
    icon: "bag-handle-outline",
    color: "#B77F8A",
    background: "#F6E9EE",
    budget: 1400000,
  },
  {
    id: "fun",
    name: "Впечатления",
    icon: "sparkles-outline",
    color: "#A39255",
    background: "#F4F0DE",
    budget: 600000,
  },
  {
    id: "health",
    name: "Здоровье",
    icon: "heart-outline",
    color: "#609F9A",
    background: "#E5F1EF",
    budget: 500000,
  },
  {
    id: "home",
    name: "Дом",
    icon: "home-outline",
    color: "#8294A2",
    background: "#EDF1F4",
    budget: 3500000,
  },
  {
    id: "other",
    name: "Другое",
    icon: "grid-outline",
    color: "#929184",
    background: "#EFEFEA",
    budget: 500000,
  },
];

export function createInitialState(
  demo = true,
  today = localDate(),
): FinanceState {
  const state: FinanceState = {
    version: 1,
    demo,
    settings: { name: "", payday: 25, buffer: demo ? 1000000 : 0 },
    accounts: [
      {
        id: "card",
        name: "Основная карта",
        kind: "spending",
        openingBalance: 0,
        icon: "card-outline",
        color: "#254D3E",
      },
      {
        id: "cash",
        name: "Наличные",
        kind: "spending",
        openingBalance: 0,
        icon: "cash-outline",
        color: "#AB8659",
      },
      {
        id: "savings",
        name: "Накопления",
        kind: "savings",
        openingBalance: 0,
        icon: "wallet-outline",
        color: "#8984AD",
      },
    ],
    transactions: [],
    categories: CATEGORIES.map((c) => ({ ...c })),
    goals: [],
    recurring: [],
  };
  if (!demo) return state;
  state.goals = [
    {
      id: "travel",
      name: "Путешествие к морю",
      target: 10000000,
      initialSaved: 4200000,
      monthly: 1000000,
      icon: "airplane-outline",
      color: "#EAF0E8",
    },
    {
      id: "cushion",
      name: "Подушка спокойствия",
      target: 30000000,
      initialSaved: 14300000,
      monthly: 500000,
      icon: "shield-checkmark-outline",
      color: "#EEEBF5",
    },
  ];
  state.recurring = [
    {
      id: "plus",
      name: "Яндекс Плюс",
      amount: 44900,
      day: 12,
      kind: "subscription",
      active: true,
      icon: "musical-notes-outline",
      color: "#F1E5F1",
      category: "fun",
      accountId: "card",
    },
    {
      id: "cloud",
      name: "iCloud+",
      amount: 14900,
      day: 15,
      kind: "subscription",
      active: true,
      icon: "cloud-outline",
      color: "#E8EDF9",
      category: "other",
      accountId: "card",
    },
    {
      id: "fitness",
      name: "Фитнес-клуб",
      amount: 240000,
      day: 18,
      kind: "subscription",
      active: true,
      icon: "barbell-outline",
      color: "#EDF0DE",
      category: "health",
      accountId: "card",
    },
    {
      id: "internet",
      name: "Домашний интернет",
      amount: 75000,
      day: 20,
      kind: "bill",
      active: true,
      icon: "wifi-outline",
      color: "#E9EEEE",
      category: "home",
      accountId: "card",
    },
    {
      id: "rent",
      name: "Аренда квартиры",
      amount: 3000000,
      day: 1,
      kind: "bill",
      active: true,
      icon: "home-outline",
      color: "#EAEAE7",
      category: "home",
      accountId: "card",
    },
  ];
  const patterns: [string, number, Transaction["category"]][] = [
    ["ВкусВилл", 148500, "groceries"],
    ["Surf Coffee", 32000, "cafe"],
    ["Яндекс Go", 46000, "transport"],
    ["Перекрёсток", 234000, "groceries"],
    ["Обед в городе", 89000, "cafe"],
    ["Ozon", 249000, "shopping"],
    ["Кино с друзьями", 85000, "fun"],
    ["Аптека", 64000, "health"],
    ["Кофе с собой", 28000, "cafe"],
    ["Продукты домой", 176000, "groceries"],
    ["Метро", 6500, "transport"],
    ["Ужин в Бюро", 184000, "cafe"],
  ];
  for (let offset = 0; offset < 45; offset++) {
    if (offset % 7 === 5) continue;
    const [title, amount, category] = patterns[offset % patterns.length];
    state.transactions.push({
      id: uid(),
      type: "expense",
      title,
      amount: amount + (offset > 20 ? 12000 : 0),
      date: shiftDate(today, -offset),
      category,
      accountId: offset % 9 === 8 ? "cash" : "card",
    });
  }
  const months = new Set(state.transactions.map((t) => t.date.slice(0, 7)));
  months.forEach((month) => {
    state.transactions.push({
      id: uid(),
      type: "income",
      title: "Зарплата",
      amount: 12000000,
      date: `${month}-01`,
      category: "other",
      accountId: "card",
    });
    state.transactions.push({
      id: uid(),
      type: "expense",
      title: "Аренда квартиры",
      amount: 3000000,
      date: `${month}-01`,
      category: "home",
      accountId: "card",
      recurringId: "rent",
      occurrenceDate: `${month}-01`,
    });
  });
  const desired: Record<string, number> = {
    card: 7856000,
    cash: 420000,
    savings: 18500000,
  };
  state.accounts.forEach((account) => {
    const net = state.transactions
      .filter((t) => t.accountId === account.id)
      .reduce((n, t) => n + (t.type === "income" ? t.amount : -t.amount), 0);
    account.openingBalance = desired[account.id] - net;
  });
  return state;
}
