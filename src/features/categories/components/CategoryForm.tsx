import { useState } from "react";
import { View } from "react-native";
import type { IconName } from "../../../domain/types";
import { categoryLabel } from "../../../domain/categories";
import {
  ErrorText,
  Button,
  C,
  Card,
  Field,
  IconTile,
  Notice,
  Row,
  Segments,
  SelectField,
  Txt,
  font,
} from "../../../shared/ui";
import { useActionError } from "../../../shared/lib/useActionError";
import { useFinanceActions, useFinance } from "../../../state/finance";
import { CategoryColorPicker, categoryColors } from "./CategoryColorPicker";

const icons: [IconName, string][] = [
  ["leaf-outline", "Продукты"],
  ["cafe-outline", "Кафе"],
  ["car-outline", "Транспорт"],
  ["bag-handle-outline", "Покупки"],
  ["sparkles-outline", "Впечатления"],
  ["heart-outline", "Здоровье"],
  ["home-outline", "Дом"],
  ["barbell-outline", "Спорт"],
  ["airplane-outline", "Поездки"],
  ["shield-checkmark-outline", "Защита"],
  ["wallet-outline", "Кошелёк"],
  ["card-outline", "Карта"],
  ["cash-outline", "Наличные"],
  ["musical-notes-outline", "Музыка"],
  ["cloud-outline", "Облако"],
  ["paper-plane-outline", "Посылки"],
  ["wifi-outline", "Связь"],
  ["grid-outline", "Другое"],
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
  const [level, setLevel] = useState<"main" | "sub">(
    original?.parentId ? "sub" : "main",
  );
  const [parentId, setParent] = useState(original?.parentId ?? "");
  const [icon, setIcon] = useState<IconName>(original?.icon ?? "grid-outline");
  const [color, setColor] = useState<string>(
    original?.color ?? categoryColors[0][1],
  );
  const [background, setBackground] = useState<string>(
    original?.background ?? categoryColors[0][2],
  );
  const parent = state.categories.find((c) => c.id === parentId);
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
          <View style={{ gap: 8 }}>
            <Txt
              style={{
                fontSize: 12,
                fontFamily: font.semibold,
                color: C.muted,
              }}
            >
              Уровень категории
            </Txt>
            <Segments
              value={level}
              onChange={setLevel}
              options={[
                { value: "main", label: "Основная категория" },
                { value: "sub", label: "Подкатегория" },
              ]}
            />
          </View>
          {level === "sub" && (
            <SelectField
              label="Основная категория"
              placeholder="Выберите основную категорию"
              value={parentId}
              onChange={setParent}
              options={state.categories
                .filter((c) => !c.parentId && !c.archived)
                .map((c) => ({
                  value: c.id,
                  label: c.name,
                  icon: c.icon,
                  color: c.color,
                  background: c.background,
                }))}
            />
          )}
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
      <SelectField
        label="Значок"
        value={icon}
        onChange={setIcon}
        options={icons.map(([value, label]) => ({
          value,
          label,
          icon: value,
          color,
          background,
        }))}
      />
      <CategoryColorPicker
        color={color}
        background={background}
        onChange={(value, bg) => {
          setColor(value);
          setBackground(bg);
        }}
      />
      <Card style={{ gap: 10 }}>
        <Txt style={{ color: C.muted, fontSize: 12 }}>
          Так будет выглядеть категория
        </Txt>
        <Row>
          <IconTile name={icon} color={color} background={background} />
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <Txt style={{ fontFamily: font.semibold }}>
              {name.trim() || "Новая категория"}
            </Txt>
            <Txt style={{ color: C.muted, fontSize: 12 }}>
              {level === "sub"
                ? parent
                  ? `Подкатегория · ${parent.name}`
                  : "Подкатегория"
                : "Основная категория"}
            </Txt>
          </View>
        </Row>
      </Card>
      <ErrorText error={error} />
      <Button
        label="Сохранить категорию"
        onPress={() =>
          run(() => {
            actions.saveCategory({
              id,
              name,
              parentId: level === "sub" ? parentId : undefined,
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
