import { createContext } from "react";
import type { RefObject } from "react";
import type { ScrollViewInstance, ViewInstance } from "react-native";

export type TourMeasurable = Pick<
  ViewInstance,
  "measureInWindow" | "measureLayout"
>;

export interface TourScrollScope {
  scrollRef: RefObject<ScrollViewInstance | null>;
  contentRef: RefObject<ViewInstance | null>;
  contentInsetTop: number;
}

export interface TourAnchor {
  id: string;
  node: ViewInstance;
  scroll?: TourScrollScope;
  reveal?: (node: ViewInstance) => void;
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
