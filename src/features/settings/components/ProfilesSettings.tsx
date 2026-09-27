import { useState } from "react";
import { Pressable, View } from "react-native";
import type { FinanceProfile, LedgerProfile } from "../../../domain/profiles";
import {
  ProfileReadError,
  useFinance,
  useFinanceStatus,
} from "../../../state/finance";
import { RecoveryControls } from "../../data-transfer";
import {
  Button,
  C,
  Card,
  ErrorText,
  Field,
  font,
  Icon,
  IconTile,
  interactionStyles,
  Notice,
  Txt,
} from "../../../shared/ui";

type ProfileEditor = { id: FinanceProfile } | "create" | null;

export function ProfilesSettings({ close }: { close: () => void }) {
  const { profile, profiles, notify } = useFinance();
  const { switching, switchProfile, createProfile, renameProfile } =
    useFinanceStatus();
  const [editor, setEditor] = useState<ProfileEditor>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [recoveryTarget, setRecoveryTarget] = useState<LedgerProfile | null>(
    null,
  );
  const clearEditor = () => {
    setEditor(null);
    setName("");
    setError("");
  };
  const openProfile = async (target: LedgerProfile) => {
    setError("");
    setRecoveryTarget(null);
    try {
      await switchProfile(target.id);
      close();
    } catch (failure) {
      setEditor(null);
      setRecoveryTarget(failure instanceof ProfileReadError ? target : null);
      setError(
        failure instanceof Error
          ? failure.message
          : "Не удалось открыть профиль. Попробуйте ещё раз.",
      );
    }
  };
  const saveProfile = async () => {
    if (!editor || switching) return;
    setError("");
    try {
      if (editor === "create") {
        await createProfile(name);
        close();
      } else {
        await renameProfile(editor.id, name);
        clearEditor();
      }
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Не удалось сохранить профиль. Попробуйте ещё раз.",
      );
    }
  };
  return (
    <>
      <Txt style={{ color: C.muted, lineHeight: 22 }}>
        У каждого профиля свои счета, операции и планы. Добавьте отдельный
        профиль, если ведёте, например, семейный или рабочий бюджет.
      </Txt>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {profiles.map((item, index) => {
          const active = item.id === profile;
          const custom = item.id !== "personal" && item.id !== "demo";
          return (
            <View
              key={item.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                borderBottomWidth: index === profiles.length - 1 ? 0 : 1,
                borderColor: C.border,
                backgroundColor: active ? C.soft : C.surface,
              }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Открыть профиль: ${item.name}`}
                accessibilityState={{
                  selected: active,
                  disabled: switching || active,
                }}
                disabled={switching || active}
                onPress={() => void openProfile(item)}
                style={({ pressed }) => [
                  {
                    flex: 1,
                    minWidth: 0,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    minHeight: 76,
                    padding: 14,
                  },
                  switching && { opacity: 0.5 },
                  pressed && interactionStyles.pressed,
                ]}
              >
                <IconTile
                  name={item.id === "demo" ? "leaf-outline" : "person-outline"}
                  size={36}
                />
                <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                  <Txt style={{ fontFamily: font.semibold }}>{item.name}</Txt>
                  {active && (
                    <Txt style={{ color: C.green, fontSize: 11 }}>Текущий</Txt>
                  )}
                  {item.id === "demo" && (
                    <Txt style={{ color: C.muted, fontSize: 11 }}>
                      Пример с готовыми данными
                    </Txt>
                  )}
                </View>
                <Icon
                  name={active ? "checkmark-circle" : "chevron-forward"}
                  size={19}
                  color={active ? C.green : C.muted}
                />
              </Pressable>
              {custom && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Переименовать профиль: ${item.name}`}
                  accessibilityState={{ disabled: switching }}
                  disabled={switching}
                  onPress={() => {
                    setEditor({ id: item.id });
                    setRecoveryTarget(null);
                    setName(item.name);
                    setError("");
                  }}
                  style={({ pressed }) => [
                    {
                      width: 44,
                      height: 44,
                      marginRight: 8,
                      borderRadius: 22,
                      alignItems: "center",
                      justifyContent: "center",
                    },
                    switching && { opacity: 0.5 },
                    pressed && interactionStyles.pressed,
                  ]}
                >
                  <Icon name="pencil-outline" size={19} color={C.green} />
                </Pressable>
              )}
            </View>
          );
        })}
      </Card>
      {editor ? (
        <Card style={{ gap: 14 }}>
          <Field
            label={
              editor === "create"
                ? "Название профиля"
                : "Новое название профиля"
            }
            accessibilityLabel={
              editor === "create"
                ? "Название профиля"
                : "Новое название профиля"
            }
            value={name}
            onChangeText={setName}
            placeholder="Например, Семейный"
            editable={!switching}
            autoCapitalize="sentences"
            returnKeyType="done"
            onSubmitEditing={() => void saveProfile()}
          />
          <ErrorText error={error} />
          <Button
            label={
              switching
                ? "Сохраняем профиль…"
                : editor === "create"
                  ? "Создать профиль"
                  : "Сохранить название"
            }
            disabled={switching}
            onPress={() => void saveProfile()}
          />
          <Button
            label="Отмена"
            variant="secondary"
            disabled={switching}
            onPress={clearEditor}
          />
        </Card>
      ) : (
        <>
          <ErrorText error={error} />
          <Button
            label="Добавить профиль"
            icon="add-outline"
            variant="secondary"
            disabled={switching}
            onPress={() => {
              setEditor("create");
              setRecoveryTarget(null);
              setName("");
              setError("");
            }}
          />
        </>
      )}
      {recoveryTarget && (
        <View style={{ gap: 10 }}>
          <Txt style={{ fontFamily: font.semibold }}>
            Восстановление профиля «{recoveryTarget.name}»
          </Txt>
          <Notice>
            Если данные этого профиля повреждены, выберите его резервную копию.
            Восстановление потребует подтверждения.
          </Notice>
          <RecoveryControls
            key={recoveryTarget.id}
            target={recoveryTarget}
            onRecovered={() => {
              notify(`Профиль «${recoveryTarget.name}» восстановлен`);
              setRecoveryTarget(null);
              setError("");
            }}
          />
        </View>
      )}
    </>
  );
}
