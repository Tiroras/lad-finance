import type { Category, FinanceState } from "./types";

export const categoryLabel = (state: FinanceState, id: string) => {
  const category = state.categories.find((c) => c.id === id);
  const parent = state.categories.find((c) => c.id === category?.parentId);
  return category
    ? `${parent ? `${parent.name} / ` : ""}${category.name}`
    : "Другое";
};

export const categoryMatches = (
  state: FinanceState,
  id: string,
  filter: string,
) =>
  id === filter ||
  state.categories.some((c) => c.id === id && c.parentId === filter);

export function orderedCategories(state: FinanceState): Category[] {
  return state.categories
    .filter((c) => !c.parentId)
    .flatMap((parent) => [
      parent,
      ...state.categories.filter((c) => c.parentId === parent.id),
    ]);
}

export const activeCategory = (state: FinanceState, id: string) =>
  state.categories.find((c) => c.id === id && !c.archived)?.id ?? "other";

export function validateCategories(categories: Category[]) {
  const other = categories.find((c) => c.id === "other");
  if (!other || other.parentId || other.archived)
    throw new Error("Основная категория «Другое» должна оставаться доступной.");
  const names = new Set<string>();
  for (const category of categories) {
    const key = JSON.stringify([
      category.parentId ?? "",
      category.name.trim().toLocaleLowerCase("ru-RU"),
    ]);
    if (names.has(key))
      throw new Error("Названия категорий одного уровня должны различаться.");
    names.add(key);
    if (category.parentId) {
      const parent = categories.find((c) => c.id === category.parentId);
      if (!parent || parent.id === category.id || parent.parentId)
        throw new Error("Подкатегория должна относиться к основной категории.");
      if (category.budget !== 0)
        throw new Error(
          "Подкатегории используют общий бюджет основной категории.",
        );
      if (parent.archived && !category.archived)
        throw new Error(
          "У архивной категории не может быть активных подкатегорий.",
        );
    }
  }
}
