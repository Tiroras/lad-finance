import type { SheetName, SheetState } from "./types";

export type SheetNavigation = {
  current: SheetState | null;
  parents: SheetState[];
};

const settingsSections: SheetName[] = [
  "profiles",
  "guide",
  "profileSettings",
  "reminderSettings",
  "securitySettings",
  "dataSettings",
  "about",
];

const sameSheet = (a: SheetState, b: SheetState) => {
  const entries = Object.entries(a);
  return (
    entries.length === Object.keys(b).length &&
    entries.every(([key, value]) => b[key as keyof SheetState] === value)
  );
};

export function openSheet(
  navigation: SheetNavigation,
  next: SheetState,
): SheetNavigation {
  const { current, parents } = navigation;
  if (current && sameSheet(current, next)) return navigation;
  const parentIndex = parents.findIndex((parent) => sameSheet(parent, next));
  if (parentIndex >= 0)
    return { current: next, parents: parents.slice(0, parentIndex) };
  return {
    current: next,
    // Settings form a hierarchy. Other entry points retain their existing
    // replacement behavior, including account and transaction workflows.
    parents:
      current && (current.type === "settings" || parents.length > 0)
        ? [...parents, current]
        : settingsSections.includes(next.type)
          ? [{ type: "settings" }]
          : [],
  };
}

export function previousSheet(navigation: SheetNavigation): SheetNavigation {
  return {
    current: navigation.parents.at(-1) ?? null,
    parents: navigation.parents.slice(0, -1),
  };
}
