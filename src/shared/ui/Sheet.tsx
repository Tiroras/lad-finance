import { useCallback, useContext, useRef, type ReactNode } from "react";
import {
  Animated,
  View,
  Pressable,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { C, font } from "./theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Txt } from "./Txt";
import { Row } from "./Row";
import { IconButton } from "./IconButton";
import { FormFields } from "./FormFields";
import { useSheetDrag } from "./useSheetDrag";
import { SheetScrollProvider } from "./SheetScroll";
import { TourFrame, type TourFrameHandle } from "./TourFrame";
import { TourFrameContext } from "./TourContext";

export function Sheet({
  title,
  subtitle,
  children,
  onClose,
  onBack,
  visible,
  blockingContent,
  contentKey,
  headerAccessory,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  onBack?: () => void;
  visible: boolean;
  blockingContent?: ReactNode;
  contentKey?: string;
  headerAccessory?: ReactNode;
}) {
  const { width, height } = useWindowDimensions();
  const parentTourFrame = useContext(TourFrameContext);
  const tourFrame = useRef<TourFrameHandle>(null);
  const revealTour = useCallback(() => tourFrame.current?.reveal(), []);
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const scrollToStart = useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []);
  const contentRef = useRef<View>(null);
  const reveal = useCallback((target: View) => {
    target.measureInWindow((_x, targetY, _width, targetHeight) => {
      if (!targetHeight) return;
      scrollRef.current
        ?.getNativeScrollRef()
        ?.measureInWindow((_sx, viewportY, _sw, viewportHeight) => {
          if (
            !viewportHeight ||
            (targetY >= viewportY &&
              targetY + targetHeight <= viewportY + viewportHeight)
          )
            return;
          if (!contentRef.current) return;
          target.measureLayout(contentRef.current, (_left, top) => {
            scrollRef.current?.scrollTo({
              y: Math.max(0, top - 12),
              animated: false,
            });
          });
        });
    });
  }, []);
  const { translateY, panHandlers } = useSheetDrag({
    visible,
    blocked: !!blockingContent,
    contentKey,
    height,
    onClose,
  });
  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      // Native Modal has its own window and may get its final layout after
      // child layout effects. Refresh the frame belonging to this window.
      onShow={revealTour}
      // Web Modal restores focus to its opener after dismissal and can scroll
      // the underlying screen. Reveal the current tour target after that.
      onDismiss={parentTourFrame?.reveal}
      onRequestClose={() => {
        if (!blockingContent) (onBack ?? onClose)();
      }}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={[
          s.overlay,
          { paddingTop: Math.max(insets.top, 24) },
          width > 700 && { justifyContent: "center" },
        ]}
      >
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: translateY.interpolate({
                inputRange: [0, height],
                outputRange: [1, 0],
                extrapolate: "clamp",
              }),
            },
          ]}
        >
          <Pressable
            accessibilityLabel="Закрыть окно"
            accessibilityRole="button"
            onPress={onClose}
            disabled={!!blockingContent}
            aria-hidden={!!blockingContent}
            style={[StyleSheet.absoluteFill, s.backdrop]}
          />
        </Animated.View>
        <Animated.View
          testID="sheet"
          accessibilityViewIsModal
          style={[
            s.sheet,
            {
              maxHeight: height - Math.max(insets.top, 24),
              paddingBottom: Math.max(insets.bottom, 20),
              transform: [{ translateY }],
            },
            width > 700 && {
              borderRadius: 28,
              maxHeight: Math.min(860, height - 64),
            },
          ]}
        >
          <TourFrame
            ref={tourFrame}
            coach={!blockingContent ? headerAccessory : undefined}
            extendShade
            scrollKey={contentKey}
            // Yoga still resolves a positive `flex` to a zero basis when
            // flexBasis is auto. Clear the frame's flex: 1 so this sheet can
            // measure its contents instead of collapsing to bottom padding.
            style={{ flex: 0, flexGrow: 0, flexShrink: 1, flexBasis: "auto" }}
          >
            {({ coach, onScroll, onLayout }) => (
              <>
                {!!blockingContent && blockingContent}
                <View
                  {...panHandlers}
                  testID="sheet-drag-area"
                  style={[s.header, !!blockingContent && { display: "none" }]}
                >
                  <View style={s.handle} />
                  <Row
                    style={{
                      justifyContent: "space-between",
                      paddingHorizontal: 24,
                      marginBottom: 20,
                    }}
                  >
                    {onBack && (
                      <IconButton
                        name="arrow-back"
                        label="Назад"
                        tourId="sheet.back"
                        onPress={onBack}
                        style={{ backgroundColor: C.soft }}
                      />
                    )}
                    <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
                      <Txt
                        accessibilityRole="header"
                        style={{ fontFamily: font.bold, fontSize: 23 }}
                      >
                        {title}
                      </Txt>
                      {subtitle && (
                        <Txt style={{ fontSize: 12, color: C.muted }}>
                          {subtitle}
                        </Txt>
                      )}
                    </View>
                    <IconButton
                      name="close"
                      label="Закрыть"
                      tourId="sheet.close"
                      onPress={onClose}
                      style={{ backgroundColor: C.soft }}
                    />
                  </Row>
                </View>
                {!!coach && (
                  <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                    {coach}
                  </View>
                )}
                <FormFields
                  key={contentKey}
                  disabled={!!blockingContent}
                  scrollRef={scrollRef}
                  contentRef={contentRef}
                >
                  {(onViewportLayout) => (
                    <Animated.ScrollView
                      ref={scrollRef}
                      testID="sheet-scroll"
                      removeClippedSubviews={false}
                      key={contentKey}
                      onLayout={() => {
                        onViewportLayout();
                        onLayout();
                      }}
                      onScroll={onScroll}
                      scrollEventThrottle={16}
                      overScrollMode={headerAccessory ? "never" : "auto"}
                      style={[
                        s.scroll,
                        !!blockingContent && { display: "none" },
                      ]}
                      aria-hidden={!!blockingContent}
                      importantForAccessibility={
                        blockingContent ? "no-hide-descendants" : "auto"
                      }
                      keyboardShouldPersistTaps="handled"
                      showsVerticalScrollIndicator={false}
                      contentContainerStyle={{
                        paddingHorizontal: 24,
                        paddingBottom: 8,
                        gap: 20,
                      }}
                    >
                      <View
                        ref={contentRef}
                        collapsable={false}
                        style={{ gap: 20 }}
                      >
                        <SheetScrollProvider
                          scrollToStart={scrollToStart}
                          reveal={reveal}
                          scrollRef={scrollRef}
                          contentRef={contentRef}
                        >
                          {children}
                        </SheetScrollProvider>
                      </View>
                    </Animated.ScrollView>
                  )}
                </FormFields>
              </>
            )}
          </TourFrame>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  backdrop: {
    backgroundColor: "rgba(20, 35, 27, 0.4)",
  },
  sheet: {
    flexShrink: 1,
    backgroundColor: C.bg,
    width: "100%",
    maxWidth: 560,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  header: {
    paddingTop: 10,
    flexShrink: 0,
    // Let PanResponder own touch drags in the web preview as well.
    ...(Platform.OS === "web"
      ? { touchAction: "none", userSelect: "none" }
      : {}),
  },
  scroll: {
    flexShrink: 1,
    minHeight: 0,
  },
  handle: {
    width: 34,
    height: 4,
    borderRadius: 3,
    backgroundColor: "#D9DED3",
    alignSelf: "center",
    marginBottom: 20,
  },
});
