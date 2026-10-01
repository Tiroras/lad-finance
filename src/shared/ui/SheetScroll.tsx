import { createContext, useContext, type ReactNode } from "react";
import type { View } from "react-native";

const Context = createContext<
  | {
      scrollToStart: () => void;
      reveal: (target: View) => void;
    }
  | undefined
>(undefined);

export function SheetScrollProvider({
  children,
  scrollToStart,
  reveal,
}: {
  children: ReactNode;
  scrollToStart: () => void;
  reveal: (target: View) => void;
}) {
  return <Context value={{ scrollToStart, reveal }}>{children}</Context>;
}

export function useSheetReveal() {
  return useContext(Context)?.reveal;
}

export function useSheetScrollToStart() {
  return useContext(Context)?.scrollToStart;
}
