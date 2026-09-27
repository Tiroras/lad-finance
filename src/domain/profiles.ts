export type FinanceProfile = "personal" | "demo" | `profile-${string}`;

export type LedgerProfile = {
  id: FinanceProfile;
  name: string;
};

const CUSTOM_PROFILE_ID =
  /^profile-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/;
const BUILTIN_NAMES = ["Личный", "Демо"];

export function createDefaultProfiles(): LedgerProfile[] {
  return [{ id: "personal", name: "Личный" }];
}

export function isFinanceProfile(value: unknown): value is FinanceProfile {
  return (
    value === "personal" ||
    value === "demo" ||
    (typeof value === "string" && CUSTOM_PROFILE_ID.test(value))
  );
}

export function assertProfileId(
  value: unknown,
): asserts value is FinanceProfile {
  if (!isFinanceProfile(value)) {
    throw new Error("Не удалось определить профиль. Выберите его заново.");
  }
}

function profileName(value: unknown): string {
  if (typeof value !== "string" || CONTROL_CHARACTERS.test(value)) {
    throw new Error("Введите название профиля без переносов строк.");
  }
  const name = value.trim().normalize("NFC");
  if (!name || [...name].length > 40) {
    throw new Error("Название профиля должно содержать от 1 до 40 символов.");
  }
  return name;
}

const comparableName = (name: string) => name.toLocaleLowerCase("ru-RU");

function uniqueProfileName(
  profiles: readonly LedgerProfile[],
  value: unknown,
  except?: FinanceProfile,
) {
  const name = profileName(value);
  const normalized = comparableName(name);
  if (
    BUILTIN_NAMES.some((builtin) => comparableName(builtin) === normalized) ||
    profiles.some(
      (profile) =>
        profile.id !== except && comparableName(profile.name) === normalized,
    )
  ) {
    throw new Error("Профиль с таким названием уже есть. Выберите другое.");
  }
  return name;
}

export function validateProfiles(value: unknown): LedgerProfile[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("Список профилей повреждён: отсутствует личный профиль.");
  }
  const result: LedgerProfile[] = [];
  const ids = new Set<FinanceProfile>();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Список профилей повреждён: неверная запись профиля.");
    }
    const { id } = item;
    assertProfileId(id);
    if (id === "demo" || ids.has(id)) {
      throw new Error("Список профилей повреждён: повторяющийся профиль.");
    }
    const name =
      id === "personal"
        ? profileName(item.name)
        : uniqueProfileName(result, item.name);
    if (id === "personal" && name !== "Личный") {
      throw new Error("Список профилей повреждён: неверный личный профиль.");
    }
    ids.add(id);
    result.push({ id, name });
  }
  if (result[0]?.id !== "personal") {
    throw new Error("Список профилей повреждён: отсутствует личный профиль.");
  }
  return result;
}

export function addProfile(
  profiles: readonly LedgerProfile[],
  id: FinanceProfile,
  name: string,
): LedgerProfile[] {
  const checked = validateProfiles(profiles);
  assertProfileId(id);
  if (id === "personal" || id === "demo" || checked.some((p) => p.id === id)) {
    throw new Error("Такой профиль уже есть. Попробуйте создать его ещё раз.");
  }
  return [...checked, { id, name: uniqueProfileName(checked, name) }];
}

export function renameProfile(
  profiles: readonly LedgerProfile[],
  id: FinanceProfile,
  name: string,
): LedgerProfile[] {
  const checked = validateProfiles(profiles);
  assertProfileId(id);
  if (id === "personal" || id === "demo") {
    throw new Error("Название встроенного профиля изменить нельзя.");
  }
  if (!checked.some((profile) => profile.id === id)) {
    throw new Error("Профиль не найден. Выберите его заново.");
  }
  const nextName = uniqueProfileName(checked, name, id);
  return checked.map((profile) =>
    profile.id === id ? { ...profile, name: nextName } : profile,
  );
}
