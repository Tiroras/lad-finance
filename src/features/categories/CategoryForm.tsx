import { useState } from "react";
import { View } from "react-native";
import type { IconName } from "../../domain/types";
import { categoryLabel } from "../../domain/categories";
import { ErrorText } from "../../forms/ErrorText";
import { useActionError } from "../../hooks/useActionError";
import { useFinanceActions } from "../../hooks/useFinanceActions";
import { useFinance } from "../../store";
import { Button, Chip, Field, Notice, Row, Txt } from "../../ui";

const icons: [IconName, string][] = [
  ["leaf-outline", "Продукты"],
  ["cafe-outline", "Кафе"],
  ["car-outline", "Транспорт"],
  ["bag-handle-outline", "Покупки"],
  ["heart-outline", "Здоровье"],
  ["home-outline", "Дом"],
  ["barbell-outline", "Спорт"],
  ["airplane-outline", "Поездки"],
  ["grid-outline", "Другое"],
];
const colors = [
  ["Зелёный", "#365A46", "#EAF0E8"],
  ["Сиреневый", "#81729C", "#EEEBF5"],
  ["Терракотовый", "#A2684C", "#F8EDE4"],
  ["Синий", "#52768A", "#E8F0F5"],
];

export function CategoryForm({
  id,
  close,
}: {
  id?: string;
  close: () => void;
}) {
  const { state, notify } = useFinance();
  const original = state.categories.find((c) => c.id === id);
  const actions = useFinanceActions();
  const { error, run } = useActionError();
  const [name, setName] = useState(original?.name ?? "");
  const [parentId, setParent] = useState(original?.parentId);
  const [icon, setIcon] = useState<IconName>(original?.icon ?? "grid-outline");
  const [color, setColor] = useState(original?.color ?? colors[0][1]);
  const [background, setBackground] = useState(
    original?.background ?? colors[0][2],
  );
  return (
    <View style={{ gap: 18 }}>
      <Field
        label="Название категории"
        accessibilityLabel="Название категории"
        value={name}
        onChangeText={setName}
        maxLength={120}
      />
      {!original ? (
        <>
          <Txt>Уровень категории</Txt>
          <Row style={{ flexWrap: "wrap" }}>
            <Chip
              label="Основная категория"
              active={!parentId}
              onPress={() => setParent(undefined)}
            />
            {state.categories
              .filter((c) => !c.parentId && !c.archived)
              .map((c) => (
                <Chip
                  key={c.id}
                  label={`Внутри: ${c.name}`}
                  active={parentId === c.id}
                  onPress={() => setParent(c.id)}
                />
              ))}
          </Row>
        </>
      ) : (
        <Notice>
          {original.parentId
            ? `Подкатегория: ${categoryLabel(state, original.id)}. Бюджет общий с основной категорией.`
            : "Основная категория со своим месячным бюджетом."}{" "}
          Уровень задаётся при создании, чтобы сохранить историю распределения
          расходов.
        </Notice>
      )}
      <Txt>Значок</Txt>
      <Row style={{ flexWrap: "wrap" }}>
        {icons.map(([value, label]) => (
          <Chip
            key={value}
            label={label}
            icon={value}
            active={icon === value}
            onPress={() => setIcon(value)}
          />
        ))}
      </Row>
      <Txt>Цвет</Txt>
      <Row style={{ flexWrap: "wrap" }}>
        {colors.map(([label, value, bg]) => (
          <Chip
            key={value}
            label={label}
            active={color === value}
            onPress={() => {
              setColor(value);
              setBackground(bg);
            }}
          />
        ))}
      </Row>
      <ErrorText error={error} />
      <Button
        label="Сохранить категорию"
        onPress={() =>
          run(() => {
            actions.saveCategory({
              id,
              name,
              parentId,
              icon,
              color,
              background,
            });
            notify("Категория сохранена");
            close();
          })
        }
      />
      {original && original.id !== "other" && (
        <>
          <Notice>
            {original.parentId
              ? original.archived
                ? "Подкатегория снова появится при новом вводе. История операций сохранится."
                : "Подкатегория скроется при новом вводе. Её прошлые расходы останутся в общем бюджете основной категории."
              : original.archived
                ? "При возвращении основной категории её подкатегории остаются в архиве. Их можно вернуть отдельно."
                : "В архив отправятся и подкатегории. История сохранится, а лимит перестанет участвовать в текущем бюджете."}
          </Notice>
          <Button
            label={
              original.archived
                ? "Вернуть категорию из архива"
                : "Архивировать категорию"
            }
            variant="secondary"
            onPress={() =>
              run(() => {
                actions.setCategoryArchived(original.id, !original.archived);
                notify(
                  original.archived
                    ? "Категория снова доступна"
                    : "Категория в архиве, история сохранена",
                );
                close();
              })
            }
          />
        </>
      )}
    </View>
  );
}
