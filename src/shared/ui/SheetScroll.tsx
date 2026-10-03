import { createContext, useContext, type ReactNode } from "react";
import type { View } from "react-native";
import type { TourScrollScope } from "./TourContext";

const Context = createContext<
  | (TourScrollScope & {
      scrollToStart: () => void;
      reveal: (target: View) => void;
    })
  | undefined
>(undefined);

export function SheetScrollProvider({
  children,
  scrollToStart,
  reveal,
  scrollRef,
  contentRef,
}: {
  children: ReactNode;
  scrollToStart: () => void;
  reveal: (target: View) => void;
} & Omit<TourScrollScope, "contentInsetTop">) {
  return (
    <Context
      value={{
        scrollToStart,
        reveal,
        scrollRef,
        contentRef,
        contentInsetTop: 0,
      }}
    >
      {children}
    </Context>
  );
}

export function useSheetTourScroll() {
  return useContext(Context);
}

export function useSheetScrollToStart() {
  return useContext(Context)?.scrollToStart;
}
