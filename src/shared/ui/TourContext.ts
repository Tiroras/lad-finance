import { createContext } from "react";
import type { RefObject } from "react";
import type { NativeMethods, ScrollView, View } from "react-native";

export type TourMeasurable = Pick<
  NativeMethods,
  "measureInWindow" | "measureLayout"
>;

export interface TourScrollScope {
  scrollRef: RefObject<ScrollView | null>;
  contentRef: RefObject<View | null>;
  contentInsetTop: number;
}

export interface TourAnchor {
  id: string;
  node: View;
  scroll?: TourScrollScope;
  reveal?: (node: View) => void;
}

export const TourContext = createContext<{
  active: boolean;
  target: string | null;
  onAction: (id: string) => void;
}>({ active: false, target: null, onAction: () => undefined });

export const TourFrameContext = createContext<{
  register: (anchor: TourAnchor) => () => void;
  refresh: () => void;
  reveal: () => void;
} | null>(null);
