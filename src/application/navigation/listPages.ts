import type { ListPageName } from "./types";

export const listPageTitles: Record<ListPageName, string> = {
  paymentAgenda: "Календарь платежей",
  recurring: "Все регулярные платежи",
  goals: "Все цели",
  budgets: "Все бюджеты",
  incomes: "Все планы доходов",
  accounts: "Все активные счета",
  archivedAccounts: "Архив счетов",
  negativeAccounts: "Счета с отрицательным остатком",
  debts: "Все долги",
  creditCards: "Все кредитные карты",
  spendingCategories: "Расходы по всем категориям",
  spendingChanges: "Все изменения расходов",
  categoryRules: "Все правила категорий",
  templates: "Все шаблоны операций",
};
