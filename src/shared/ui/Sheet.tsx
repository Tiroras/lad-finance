import { useRef, type ReactNode } from "react";
import {
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

export function Sheet({
  title,
  subtitle,
  children,
  onClose,
  onBack,
  visible,
  blockingContent,
  contentKey,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  onBack?: () => void;
  visible: boolean;
  blockingContent?: ReactNode;
  contentKey?: string;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
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
        <Pressable
          accessibilityLabel="Закрыть окно"
          accessibilityRole="button"
          onPress={onClose}
          disabled={!!blockingContent}
          aria-hidden={!!blockingContent}
          style={StyleSheet.absoluteFill}
        />
        <View
          accessibilityViewIsModal
          style={[
            s.sheet,
            {
              maxHeight: height - Math.max(insets.top, 24),
              paddingBottom: Math.max(insets.bottom, 20),
            },
            width > 700 && {
              borderRadius: 28,
              maxHeight: Math.min(860, height - 64),
            },
          ]}
        >
          {!!blockingContent && blockingContent}
          <View style={[s.handle, !!blockingContent && { display: "none" }]} />
          <Row
            style={{
              justifyContent: "space-between",
              paddingHorizontal: 24,
              marginBottom: 20,
              display: blockingContent ? "none" : "flex",
            }}
          >
            {onBack && (
              <IconButton
                name="arrow-back"
                label="Назад"
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
                <Txt style={{ fontSize: 12, color: C.muted }}>{subtitle}</Txt>
              )}
            </View>
            <IconButton
              name="close"
              label="Закрыть"
              onPress={onClose}
              style={{ backgroundColor: C.soft }}
            />
          </Row>
          <FormFields
            key={contentKey}
            disabled={!!blockingContent}
            scrollRef={scrollRef}
            contentRef={contentRef}
          >
            {(onViewportLayout) => (
              <ScrollView
                ref={scrollRef}
                removeClippedSubviews={false}
                key={contentKey}
                onLayout={onViewportLayout}
                style={[s.scroll, !!blockingContent && { display: "none" }]}
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
                <View ref={contentRef} collapsable={false} style={{ gap: 20 }}>
                  {children}
                </View>
              </ScrollView>
            )}
          </FormFields>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(20, 35, 27, 0.4)",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  sheet: {
    flexShrink: 1,
    backgroundColor: C.bg,
    width: "100%",
    maxWidth: 560,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
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
