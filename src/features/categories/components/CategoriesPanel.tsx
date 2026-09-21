import { useState } from "react";
import { View } from "react-native";
import { categoryLabel, orderedCategories } from "../../../domain/categories";
import type { OpenSheet } from "../../../application/navigation/types";
import { useFinance } from "../../../state/finance";
import {
  Button,
  Card,
  Chip,
  IconTile,
  Notice,
  Row,
  Txt,
  font,
} from "../../../shared/ui";

export function CategoriesPanel({ open }: { open: OpenSheet }) {
  const { state } = useFinance();
  const [archived, setArchived] = useState(false);
  const categories = orderedCategories(state).filter(
    (c) => !!c.archived === archived,
  );
  return (
    <View style={{ gap: 16 }}>
      <Notice>
        Подкатегории делят бюджет основной категории. Архив скрывает категорию
        при новом вводе, сохраняя операции и аналитику. Уже запланированные
        платежи продолжают учитываться.
      </Notice>
      <Button
        label="Создать категорию"
        icon="add"
        onPress={() => open({ type: "category" })}
      />
      <Row style={{ flexWrap: "wrap" }}>
        <Chip
          label="Активные категории"
          active={!archived}
          onPress={() => setArchived(false)}
        />
        <Chip
          label="Архив категорий"
          active={archived}
          onPress={() => setArchived(true)}
        />
      </Row>
      {categories.length === 0 && <Txt>Здесь пока нет категорий.</Txt>}
      {categories.map((c) => (
        <Card key={c.id} style={{ gap: 12, marginLeft: c.parentId ? 12 : 0 }}>
          <Row>
            <IconTile
              name={c.icon}
              color={c.color}
              background={c.background}
              size={36}
            />
            <Txt style={{ flex: 1, fontFamily: font.semibold }}>
              {categoryLabel(state, c.id)}
            </Txt>
          </Row>
          <Button
            label={`Настроить: ${categoryLabel(state, c.id)}`}
            variant="secondary"
            onPress={() => open({ type: "category", id: c.id })}
          />
          {!c.parentId && !c.archived && (
            <Button
              label={`Бюджет: ${c.name}`}
              variant="secondary"
              onPress={() => open({ type: "budget", id: c.id })}
            />
          )}
        </Card>
      ))}
    </View>
  );
}
