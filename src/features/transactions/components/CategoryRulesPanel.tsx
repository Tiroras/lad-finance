import { useState } from "react";
import type { OpenSheet } from "../../../application/navigation/types";
import { View } from "react-native";
import { categoryLabel } from "../../../domain/categories";
import { useActionError } from "../../../shared/lib/useActionError";
import { useRequestSheetDismiss } from "../../../shared/ui/SheetDismissal";
import {
  Button,
  Card,
  Chip,
  DeleteButton,
  ErrorText,
  Notice,
  RecordList,
  Section,
  Txt,
} from "../../../shared/ui";
import { useFinance, useFinanceActions } from "../../../state/finance";
import { CategoryRuleEditor } from "./CategoryRuleEditor";

export function CategoryRulesPanel({
  open,
  full = false,
}: {
  open: OpenSheet;
  full?: boolean;
}) {
  const { state } = useFinance();
  const requestDismiss = useRequestSheetDismiss();
  const actions = useFinanceActions();
  const [editing, setEditing] = useState<string | null>(null);
  const { error, run } = useActionError();
  const rules = state.categoryRules ?? [];
  return (
    <>
      <Section title="Правила категорий" />
      <Notice>
        Правила применяются сверху вниз к новым расходам и предпросмотру CSV.
        Первое совпадение задаёт категорию; ручное исправление имеет приоритет.
        История не меняется.
      </Notice>
      <RecordList
        items={rules.map((rule, index) => ({ rule, index }))}
        full={full}
        keyExtractor={({ rule }) => rule.id}
        showAllLabel="Все правила категорий"
        onShowAll={() =>
          requestDismiss(() => open({ type: "list", list: "categoryRules" }))
        }
        testID="category-rules-list"
        renderItem={({ rule, index }) => (
          <Card style={{ gap: 10 }}>
            <Txt>
              {index + 1}. {rule.match === "exact" ? "Название" : "Содержит"} «
              {rule.pattern}» → {categoryLabel(state, rule.category)}
            </Txt>
            {state.categories.find((c) => c.id === rule.category)?.archived && (
              <Notice>
                Категория в архиве: правило сейчас не применяется.
              </Notice>
            )}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <Chip
                label={rule.enabled ? "Включено" : "Отключено"}
                active={rule.enabled}
                onPress={() =>
                  run(() =>
                    actions.saveCategoryRule({
                      ...rule,
                      enabled: !rule.enabled,
                    }),
                  )
                }
              />
              <Chip
                label={`Изменить правило ${index + 1}`}
                onPress={() => setEditing(rule.id)}
              />
              {index > 0 && (
                <Chip
                  label={`Правило ${index + 1} выше`}
                  onPress={() =>
                    run(() => actions.moveCategoryRule(rule.id, -1))
                  }
                />
              )}
              {index < rules.length - 1 && (
                <Chip
                  label={`Правило ${index + 1} ниже`}
                  onPress={() =>
                    run(() => actions.moveCategoryRule(rule.id, 1))
                  }
                />
              )}
            </View>
            <DeleteButton
              explanation="Удалится только настройка. Записанные операции сохранятся."
              label={`Удалить правило «${rule.pattern}»`}
              onDelete={() => run(() => actions.deleteCategoryRule(rule.id))}
            />
          </Card>
        )}
      />
      {!rules.length && <Txt>Сохранённых правил пока нет.</Txt>}
      {editing !== null ? (
        <CategoryRuleEditor
          key={editing}
          rule={rules.find((rule) => rule.id === editing)}
          done={() => setEditing(null)}
        />
      ) : (
        <Button
          label="Добавить правило"
          variant="secondary"
          onPress={() => setEditing("new")}
        />
      )}
      <ErrorText error={error} />
    </>
  );
}
