import { createContext, useContext, type ReactNode } from "react";

const Context = createContext<(() => void) | undefined>(undefined);

export function SheetScrollProvider({
  children,
  scrollToStart,
}: {
  children: ReactNode;
  scrollToStart: () => void;
}) {
  return <Context value={scrollToStart}>{children}</Context>;
}

export function useSheetScrollToStart() {
  return useContext(Context);
}
