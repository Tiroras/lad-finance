import type { SheetState, Tab } from "../../../application/navigation/types";

export interface TourStep {
  id: string;
  target: string;
  /** A read-only highlight may advance through a different control. */
  action?: string;
  title: string;
  text: string;
  tab: Tab;
  section?: "budgets" | "goals" | "payments" | "forecast";
  sheets: SheetState[];
}
const home = { tab: "home" as const, sheets: [] };
const plan = { tab: "plan" as const, sheets: [] };
const settings = {
  tab: "analytics" as const,
  sheets: [{ type: "settings" as const }],
};
const settingsVisits: {
  type:
    | "profileSettings"
    | "currencies"
    | "categories"
    | "automation"
    | "profiles"
    | "reminderSettings"
    | "securitySettings";
  title: string;
  text: string;
}[] = [
  {
    type: "profileSettings",
    title: "Профиль и планирование",
    text: "Здесь настраиваются имя, резерв и ориентиры планирования. Сейчас достаточно осмотреть экран и вернуться стрелкой назад.",
  },
  {
    type: "currencies",
    title: "Валюты и курсы",
    text: "Здесь выбирают основную валюту и управляют автоматическими и ручными курсами. Вернитесь стрелкой назад.",
  },
  {
    type: "categories",
    title: "Категории и подкатегории",
    text: "Здесь можно создавать, редактировать и архивировать категории. История сохраняется. Вернитесь стрелкой назад.",
  },
  {
    type: "automation",
    title: "Правила и шаблоны",
    text: "Шаблоны ускоряют запись операций, а правила помогают распределять их по категориям. Вернитесь стрелкой назад.",
  },
  {
    type: "profiles",
    title: "Профили",
    text: "Каждый профиль хранит отдельные счета, операции и планы. Экскурсия общая. Вернитесь назад, сохранив текущий профиль.",
  },
  {
    type: "reminderSettings",
    title: "Напоминания",
    text: "Здесь настраиваются напоминания о платежах. На телефоне они потребуют системного разрешения. Вернитесь стрелкой назад.",
  },
  {
    type: "securitySettings",
    title: "Защита данных",
    text: "На телефоне здесь включают блокировку приложения. Посмотрите доступные настройки и вернитесь назад.",
  },
];

export const tourSteps: readonly TourStep[] = [
  {
    ...home,
    id: "home-formula",
    target: "home.formula",
    title: "Обзор: сколько можно потратить",
    text: "Вы на главном экране. Здесь собраны остатки и сумма на день. Нажмите значок информации в карточке «Можно потратить».",
  },
  {
    ...home,
    sheets: [{ type: "formula" }],
    id: "formula",
    target: "sheet.close",
    title: "Из чего складывается сумма",
    text: "Это ваш настоящий расчёт: деньги, обязательства и резерв. Его можно прокрутить. Закройте окно крестиком, чтобы продолжить.",
  },
  {
    ...home,
    id: "home-accounts",
    target: "home.accounts",
    title: "Счета и остатки",
    text: "Нажмите карточку «На всех счетах». Здесь открывается список ваших счетов и долгов.",
  },
  {
    ...home,
    sheets: [{ type: "accounts" }],
    id: "accounts",
    target: "sheet.close",
    title: "Ваши счета и долги",
    text: "Здесь добавляют счета, сверяют остатки и учитывают долги. Посмотрите список и закройте окно крестиком.",
  },
  {
    ...home,
    id: "home-purchase",
    target: "home.simulate",
    title: "Проверка будущей покупки",
    text: "Кнопка «Проверить покупку» позволяет оценить решение до записи расхода. Нажмите её.",
  },
  {
    ...home,
    sheets: [{ type: "simulate" }],
    id: "purchase",
    target: "sheet.close",
    title: "Примерка покупки",
    text: "Сумма, дата и горизонт меняют прогноз, а не счета. Здесь можно попробовать расчёт. Для экскурсии закройте окно крестиком.",
  },
  {
    ...home,
    id: "open-transactions",
    target: "nav.transactions",
    title: "Перейдите к истории",
    text: "Нажмите вкладку «Операции» в панели навигации. Откроется настоящая история текущего профиля.",
  },
  {
    tab: "transactions",
    sheets: [],
    id: "transactions-filter",
    target: "transactions.expense",
    title: "Поиск и фильтры операций",
    text: "Здесь можно искать записи, выбирать период, счёт и категорию. Нажмите фильтр «Расходы».",
  },
  {
    tab: "transactions",
    sheets: [],
    id: "transactions-export",
    target: "transactions.export",
    title: "Выгрузка истории",
    text: "Нажмите «Экспортировать операции в CSV», чтобы посмотреть настройки выгрузки.",
  },
  {
    tab: "transactions",
    sheets: [{ type: "export" }],
    id: "export",
    target: "sheet.close",
    title: "Экспорт операций",
    text: "Перед выгрузкой выбираются период, счета и формат. Сейчас файл создавать не нужно: закройте окно крестиком.",
  },
  {
    tab: "transactions",
    sheets: [],
    id: "open-plan",
    target: "nav.plan",
    title: "Переходим к планированию",
    text: "Нажмите вкладку «План». Здесь бюджеты, цели, платежи и прогноз находятся в отдельных разделах.",
  },
  {
    ...plan,
    section: "budgets",
    id: "plan-budgets",
    target: "plan.goals",
    title: "План: бюджеты",
    text: "Открыты ваши бюджеты по категориям. Лимиты помогают контролировать расходы. Теперь нажмите раздел «Цели» рядом с бюджетами.",
  },
  {
    ...plan,
    section: "goals",
    id: "plan-goals",
    target: "plan.payments",
    title: "План: цели",
    text: "Здесь создают цели и вносят деньги на накопления. Теперь нажмите «Платежи», чтобы увидеть будущие обязательства.",
  },
  {
    ...plan,
    section: "payments",
    id: "plan-payments",
    target: "plan.forecast",
    title: "План: платежи",
    text: "На этом экране собраны регулярные платежи с категориями расходов. Следующий раздел — «Прогноз». Нажмите его.",
  },
  {
    ...plan,
    section: "forecast",
    id: "plan-forecast",
    target: "forecast.60",
    title: "Прогноз по дням",
    text: "Здесь видны будущие остатки, платежи и ожидаемые доходы. Нажмите «60 дней», чтобы увеличить горизонт.",
  },
  {
    ...plan,
    section: "forecast",
    id: "forecast-scenarios",
    target: "forecast.scenarios",
    title: "Проверка вариантов",
    text: "Нажмите «Мои сценарии». В них можно проверить изменение планов отдельно от реального учёта.",
  },
  {
    ...plan,
    section: "forecast",
    sheets: [{ type: "scenarios" }],
    id: "scenarios",
    target: "sheet.close",
    title: "Сохранённые сценарии",
    text: "Здесь создают и сравнивают варианты будущего: например, задержку зарплаты. Закройте окно, чтобы перейти к аналитике.",
  },
  {
    ...plan,
    section: "forecast",
    id: "open-analytics",
    target: "nav.analytics",
    title: "Теперь посмотрим итоги",
    text: "Нажмите вкладку «Аналитика». Она объясняет, куда уходят деньги и как меняются привычки.",
  },
  {
    tab: "analytics",
    sheets: [],
    id: "analytics-month",
    target: "analytics.month",
    title: "Аналитика за выбранный месяц",
    text: "Нажмите стрелку предыдущего месяца. Итоги и категории на настоящем экране пересчитаются за другой период.",
  },
  {
    tab: "analytics",
    sheets: [],
    id: "open-settings",
    target: "header.settings",
    title: "Настройки и остальные разделы",
    text: "Нажмите значок профиля в правом верхнем углу. Здесь находятся валюты, категории, защита и работа с данными.",
  },
  ...settingsVisits.flatMap(({ type, title, text }): TourStep[] => [
    {
      ...settings,
      id: `open-${type}`,
      target: `settings.${type}`,
      title: `Откройте «${title}»`,
      text: "Нажмите выделенный пункт в настоящем меню настроек.",
    },
    {
      tab: "analytics",
      sheets: [{ type: "settings" }, { type }],
      id: type,
      target: "sheet.back",
      title,
      text,
    },
  ]),
  {
    ...settings,
    id: "open-data",
    target: "settings.dataSettings",
    title: "Сохранность и перенос учёта",
    text: "Откройте «Данные и копии». Здесь импортируют выписки и готовят резервные копии.",
  },
  {
    tab: "analytics",
    sheets: [{ type: "settings" }, { type: "dataSettings" }],
    id: "data-import",
    target: "data.csv",
    title: "Импорт и резервные копии",
    text: "Это настоящий раздел копий и переноса. Нажмите «Импортировать банковский CSV», чтобы увидеть, как начинается импорт.",
  },
  {
    tab: "analytics",
    sheets: [{ type: "settings" }, { type: "dataSettings" }, { type: "csv" }],
    id: "csv",
    target: "sheet.back",
    title: "Импорт банковской выписки",
    text: "После выбора файла вы увидите предпросмотр и повторы. Данные добавляются только после подтверждения. Сейчас вернитесь стрелкой назад.",
  },
  {
    tab: "analytics",
    sheets: [{ type: "settings" }, { type: "dataSettings" }],
    id: "data-back",
    target: "data.backups",
    action: "sheet.back",
    title: "Копии вашего профиля",
    text: "Здесь находятся резервные копии и восстановление. Во время экскурсии эти действия отключены. Посмотрите блок и вернитесь стрелкой в меню настроек.",
  },
  {
    ...settings,
    id: "open-about",
    target: "settings.about",
    title: "О приложении",
    text: "Откройте последний раздел — «О приложении».",
  },
  {
    tab: "analytics",
    sheets: [{ type: "settings" }, { type: "about" }],
    id: "about",
    target: "sheet.back",
    title: "Справочная информация",
    text: "Здесь собрана информация о Ладе и его возможностях. Вернитесь в меню настроек.",
  },
  {
    ...settings,
    id: "settings-close",
    target: "settings.guide",
    action: "sheet.close",
    title: "Экскурсия всегда под рукой",
    text: "В пункте «Обучение» можно повторить весь маршрут или выбрать раздел. Во время экскурсии он недоступен. Сейчас закройте настройки крестиком.",
  },
  {
    tab: "analytics",
    sheets: [],
    id: "finish",
    target: "nav.home",
    title: "Вы прошли все разделы",
    text: "Нажмите «Обзор», чтобы вернуться к главному экрану и завершить экскурсию. Счета и планы можно настроить в своём темпе.",
  },
];

export function tourStepIndex(id: string) {
  return Math.max(
    0,
    tourSteps.findIndex((step) => step.id === id),
  );
}
