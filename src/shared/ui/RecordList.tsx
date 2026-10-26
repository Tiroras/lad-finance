import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { Button } from "./Button";
import { Txt } from "./Txt";
import { C } from "./theme";

/** Compact overview; the destination keeps the same ordering and full data. */
export function RecordList<T>({
  items,
  renderItem,
  keyExtractor,
  full = false,
  onShowAll,
  showAllLabel,
  testID,
}: {
  items: readonly T[];
  renderItem: (item: T) => ReactNode;
  keyExtractor: (item: T) => string;
  full?: boolean;
  onShowAll: () => void;
  showAllLabel: string;
  testID?: string;
}) {
  const [visibleCount, setVisibleCount] = useState(50);
  const visible = items.slice(0, full ? visibleCount : 5);
  return (
    <View testID={testID} style={{ gap: 12 }}>
      {full && items.length > 50 && (
        <Txt style={{ color: C.muted }}>
          Показано {visible.length} из {items.length}
        </Txt>
      )}
      {visible.map((item) => (
        <View key={keyExtractor(item)}>{renderItem(item)}</View>
      ))}
      {!full && items.length > 5 && (
        <Button
          label={`${showAllLabel} (${items.length})`}
          variant="secondary"
          icon="arrow-forward"
          onPress={onShowAll}
        />
      )}
      {full && items.length > visibleCount && (
        <Button
          label={`Показать ещё (${items.length - visibleCount})`}
          variant="secondary"
          onPress={() => setVisibleCount((count) => count + 50)}
        />
      )}
    </View>
  );
}
