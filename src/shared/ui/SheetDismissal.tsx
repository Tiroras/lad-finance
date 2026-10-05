import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";
import { View } from "react-native";
import type {
  DismissalController,
  DismissalGuard,
  PendingDismissal,
} from "../lib/dismissal";
import { Button } from "./Button";
import { Txt } from "./Txt";
import { C, font } from "./theme";

const DismissalContext = createContext<DismissalController | null>(null);

export function SheetDismissalProvider({
  controller,
  children,
}: {
  controller: DismissalController;
  children: ReactNode;
}) {
  return <DismissalContext value={controller}>{children}</DismissalContext>;
}

export function usePreventSheetDismiss(guard: DismissalGuard) {
  const controller = useContext(DismissalContext);
  const latest = useRef(guard);
  latest.current = guard;
  useLayoutEffect(
    () =>
      controller?.register({
        hasChanges: () => latest.current.hasChanges(),
        description: guard.description,
      }),
    [controller, guard.description],
  );
}

export function SheetDismissalConfirmation({
  pending,
  controller,
}: {
  pending: PendingDismissal;
  controller: DismissalController;
}) {
  return (
    <View style={{ padding: 24, gap: 18 }}>
      <Txt
        accessibilityRole="header"
        style={{ fontFamily: font.bold, fontSize: 22 }}
      >
        Сбросить изменения?
      </Txt>
      <Txt accessibilityRole="alert" style={{ color: C.muted, lineHeight: 22 }}>
        {pending.description}
      </Txt>
      <Button label="Продолжить ввод" onPress={controller.cancel} />
      <Button
        label="Сбросить и закрыть"
        variant="danger"
        onPress={controller.discard}
      />
    </View>
  );
}
