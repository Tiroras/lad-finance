import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  InputAccessoryView,
  Keyboard,
  Platform,
  Pressable,
  View,
  type ScrollViewInstance,
  type TextInputInstance,
  type ViewInstance,
} from "react-native";
import { Txt } from "./Txt";
import { C, font } from "./theme";

type FormNavigation = {
  accessoryID?: string;
  active?: { id: string; hasNext: boolean };
  register: (id: string, input: TextInputInstance) => () => void;
  focus: (id: string) => void;
  blur: (id: string) => void;
  refresh: () => void;
  next: (id: string) => Promise<void>;
};

const Context = createContext<FormNavigation | null>(null);
export const useFormFields = () => useContext(Context);

// Measure the current layout so conditionally inserted fields keep their visual
// order, rather than the order in which their refs happened to register.
export function FormFields({
  children,
  disabled,
  scrollRef,
  contentRef,
}: {
  children: (onViewportLayout: () => void) => ReactNode;
  disabled: boolean;
  scrollRef: RefObject<ScrollViewInstance | null>;
  contentRef: RefObject<ViewInstance | null>;
}) {
  const accessoryID = useId();
  const inputs = useRef(new Map<string, TextInputInstance>());
  const focused = useRef<string | undefined>(undefined);
  const enabled = useRef(!disabled);
  const revision = useRef(0);
  const [active, setActive] = useState<FormNavigation["active"]>();

  const measure = useCallback(async () => {
    const positions = await Promise.all(
      [...inputs.current].map(
        ([id, input]) =>
          new Promise<{
            id: string;
            input: TextInputInstance;
            x: number;
            y: number;
            width: number;
            height: number;
          }>((resolve) =>
            input.measureInWindow((x, y, width, height) =>
              resolve({ id, input, x, y, width, height }),
            ),
          ),
      ),
    );
    return positions
      .filter(
        (entry) =>
          entry.width > 0 &&
          entry.height > 0 &&
          inputs.current.get(entry.id) === entry.input,
      )
      .sort((a, b) => (Math.abs(a.y - b.y) > 1 ? a.y - b.y : a.x - b.x));
  }, []);

  const refresh = useCallback(() => {
    const id = focused.current;
    if (!id || !enabled.current) return;
    const request = ++revision.current;
    void measure().then((fields) => {
      if (
        request !== revision.current ||
        focused.current !== id ||
        !enabled.current
      )
        return;
      const index = fields.findIndex((field) => field.id === id);
      const hasNext = index >= 0 && index < fields.length - 1;
      setActive((current) =>
        current?.id === id && current.hasNext === hasNext
          ? current
          : { id, hasNext },
      );
    });
  }, [measure]);

  const scrollToFocused = useCallback(() => {
    if (!enabled.current) return;
    const id = focused.current;
    const input = id && inputs.current.get(id);
    const scroll = scrollRef.current;
    const content = contentRef.current;
    const viewport = scroll?.getNativeScrollRef();
    if (!input || !scroll || !content || !viewport) return;
    // The sheet occupies only part of the window. Use its actual visible
    // height, rather than assuming a scroll view that starts at screen y=0.
    input.measureLayout(
      content,
      (_left, top, _width, inputHeight) => {
        viewport.measureInWindow((_x, y, _w, height) => {
          input.measureInWindow((_inputX, inputY) => {
            if (!enabled.current || focused.current !== id) return;
            // RN Web has no Keyboard.metrics; its resized viewport supplies
            // the visible bounds. Native also accounts for the keyboard frame.
            const bottom = Math.min(
              y + height,
              Keyboard.metrics?.()?.screenY ?? Infinity,
            );
            const visibleHeight = Math.max(0, bottom - y - 20);
            if (!visibleHeight) return;
            // Keep a visible field in place; leave room for its label when
            // bringing an input back from above the scroll viewport.
            if (inputY >= y + 28 && inputY + inputHeight <= bottom - 20) return;
            scroll.scrollTo({
              y: Math.max(
                0,
                inputY < y + 28
                  ? top - 28
                  : top + Math.min(inputHeight, visibleHeight) - visibleHeight,
              ),
              animated: true,
            });
          });
        });
      },
      () => {},
    );
  }, [scrollRef, contentRef]);

  const register = useCallback(
    (id: string, input: TextInputInstance) => {
      inputs.current.set(id, input);
      refresh();
      return () => {
        inputs.current.delete(id);
        if (focused.current === id) {
          focused.current = undefined;
          setActive(undefined);
        }
        refresh();
      };
    },
    [refresh],
  );

  const focus = useCallback(
    (id: string) => {
      focused.current = id;
      refresh();
      scrollToFocused();
    },
    [refresh, scrollToFocused],
  );
  const blur = useCallback((id: string) => {
    if (focused.current !== id) return;
    focused.current = undefined;
    revision.current++;
    setActive(undefined);
  }, []);
  const next = useCallback(
    async (id: string) => {
      const fields = await measure();
      if (!enabled.current || focused.current !== id) return;
      const index = fields.findIndex((field) => field.id === id);
      if (index < 0) return;
      const following = fields[index + 1];
      if (following) following.input.focus();
      else fields[index].input.blur();
    },
    [measure],
  );

  useEffect(() => {
    enabled.current = !disabled;
    if (disabled) {
      focused.current = undefined;
      revision.current++;
      setActive(undefined);
      Keyboard.dismiss();
    }
    const subscription = Keyboard.addListener(
      "keyboardDidShow",
      scrollToFocused,
    );
    return () => {
      subscription.remove();
      enabled.current = false;
      revision.current++;
    };
  }, [disabled, scrollToFocused]);

  const navigation = useMemo(
    () => ({
      accessoryID: Platform.OS === "ios" ? accessoryID : undefined,
      active,
      register,
      focus,
      blur,
      refresh,
      next,
    }),
    [accessoryID, active, register, focus, blur, refresh, next],
  );

  return (
    <Context value={navigation}>
      {children(scrollToFocused)}
      {Platform.OS === "ios" && !disabled && (
        <InputAccessoryView nativeID={accessoryID} backgroundColor={C.surface}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              paddingHorizontal: 16,
              borderTopWidth: 1,
              borderColor: C.border,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Следующее поле"
              disabled={!active?.hasNext}
              onPress={() => {
                if (active) void next(active.id);
              }}
              style={{
                minHeight: 44,
                justifyContent: "center",
                paddingHorizontal: 12,
                opacity: active?.hasNext ? 1 : 0.4,
              }}
            >
              <Txt style={{ color: C.green, fontFamily: font.semibold }}>
                Далее
              </Txt>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Завершить ввод"
              onPress={() => Keyboard.dismiss()}
              style={{
                minHeight: 44,
                justifyContent: "center",
                paddingHorizontal: 12,
              }}
            >
              <Txt style={{ color: C.green, fontFamily: font.semibold }}>
                Готово
              </Txt>
            </Pressable>
          </View>
        </InputAccessoryView>
      )}
    </Context>
  );
}
