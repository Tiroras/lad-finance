import {
  matchCategoryRule,
  normalizeRuleText,
} from "../../../domain/automation";
import { categoryLabel } from "../../../domain/categories";
import { useActionError } from "../../../shared/lib/useActionError";
import { Button, ErrorText, Notice } from "../../../shared/ui";
import { useFinance, useFinanceActions } from "../../../state/finance";

export function CategoryRuleSuggestion({
  title,
  category,
}: {
  title: string;
  category: string;
}) {
  const { state, notify } = useFinance();
  const actions = useFinanceActions();
  const { error, run } = useActionError();
  const rule = matchCategoryRule(state, title);
  const exact = state.categoryRules?.find(
    (r) =>
      r.match === "exact" &&
      normalizeRuleText(r.pattern) === normalizeRuleText(title),
  );
  const canSave =
    title.trim() &&
    state.categories.some((c) => c.id === category && !c.archived) &&
    (!exact || exact.category !== category || !exact.enabled);
  return (
    <>
      {!!rule && (
        <Notice>
          Правило «{rule.pattern}» предлагает:{" "}
          {categoryLabel(state, rule.category)}.
          {rule.category !== category
            ? " Выбрана другая категория вручную."
            : ""}
        </Notice>
      )}
      {!!canSave && (
        <Button
          label={`Запомнить категорию для «${title.trim()}»`}
          variant="secondary"
          onPress={() =>
            run(() => {
              actions.saveCategoryRule({
                id: exact?.id,
                pattern: title.trim(),
                category,
                match: "exact",
                enabled: true,
                first: true,
              });
              notify(
                "Правило точного названия сохранено первым. Приоритет можно изменить в настройках правил.",
              );
            })
          }
        />
      )}
      <ErrorText error={error} />
    </>
  );
}
