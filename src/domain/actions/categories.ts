import { uid } from "../finance";
import { validateCategories } from "../categories";
import { ICON_NAMES, type Category, type FinanceState } from "../types";
import { checkName, ensure } from "./validation";

export type CategoryInput = Pick<
  Category,
  "name" | "icon" | "color" | "background" | "parentId"
> & { id?: string };

export function saveCategory(
  state: FinanceState,
  input: CategoryInput,
): FinanceState {
  const original = state.categories.find((c) => c.id === input.id);
  ensure(!input.id || original, "Категория уже удалена.");
  ensure(
    original || state.categories.length < 200,
    "Можно создать не более 200 категорий вместе с архивом.",
  );
  checkName(input.name);
  ensure(ICON_NAMES.includes(input.icon), "Выберите значок категории.");
  ensure(
    input.parentId === undefined || input.parentId.length > 0,
    "Выберите основную категорию.",
  );
  ensure(
    /^[#][0-9a-fA-F]{6}$/.test(input.color) &&
      /^[#][0-9a-fA-F]{6}$/.test(input.background),
    "Выберите цвет категории.",
  );
  ensure(
    !original || original.parentId === input.parentId,
    "Родительскую категорию нельзя менять после создания: это изменит историю бюджетов.",
  );
  const category: Category = {
    ...input,
    id: original?.id ?? uid(),
    name: input.name.trim(),
    budget: original?.budget ?? 0,
    archived: original?.archived ?? false,
  };
  const categories = original
    ? state.categories.map((c) => (c.id === original.id ? category : c))
    : [...state.categories, category];
  validateCategories(categories);
  return { ...state, categories };
}

export function setCategoryArchived(
  state: FinanceState,
  id: string,
  archived: boolean,
): FinanceState {
  const category = state.categories.find((c) => c.id === id);
  ensure(category, "Категория не найдена.");
  ensure(
    id !== "other",
    "Категория «Другое» нужна для операций без выбранной категории.",
  );
  ensure(
    archived ||
      !state.categories.find((c) => c.id === category.parentId)?.archived,
    "Сначала верните из архива основную категорию.",
  );
  const categories = state.categories.map((c) =>
    c.id === id || (archived && c.parentId === id) ? { ...c, archived } : c,
  );
  validateCategories(categories);
  return { ...state, categories };
}
