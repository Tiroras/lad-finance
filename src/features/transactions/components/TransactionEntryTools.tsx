import { useState } from "react";
import { Keyboard, Pressable, StyleSheet, View } from "react-native";
import type { TransactionTemplate } from "../../../domain/automation";
import {
  C,
  ErrorText,
  font,
  Icon,
  interactionStyles,
  Txt,
} from "../../../shared/ui";
import { QuickEntry } from "./QuickEntry";
import { TransactionTemplates } from "./TransactionTemplates";

export type EntryTool = "quick" | "templates" | null;

export function TransactionEntryTools({
  active,
  onChange,
  canQuickEnter,
  quick,
  onQuickChange,
  onQuickApply,
  templateId,
  onTemplateApply,
  onTemplateSave,
  error,
}: {
  active: EntryTool;
  onChange: (tool: EntryTool) => void;
  canQuickEnter: boolean;
  quick: string;
  onQuickChange: (value: string) => void;
  onQuickApply: (value: string) => void;
  templateId?: string;
  onTemplateApply: (template: TransactionTemplate) => void;
  onTemplateSave: (name: string, id?: string) => void;
  error: string;
}) {
  const [templateName, setTemplateName] = useState("");
  return (
    <View style={{ gap: 12 }}>
      <View style={s.tools}>
        {(
          [...(canQuickEnter ? (["quick"] as const) : []), "templates"] as const
        ).map((tool) => {
          const expanded = active === tool;
          const label = tool === "quick" ? "Быстрый ввод" : "Шаблоны";
          return (
            <Pressable
              key={tool}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ expanded }}
              aria-expanded={expanded}
              onPress={() => {
                Keyboard.dismiss();
                onChange(expanded ? null : tool);
              }}
              style={({ pressed }) => [
                s.tool,
                expanded && { backgroundColor: C.soft },
                pressed && interactionStyles.pressed,
              ]}
            >
              <Txt style={s.label}>{label}</Txt>
              <Icon
                name={expanded ? "chevron-up" : "chevron-down"}
                color={C.muted}
                size={16}
              />
            </Pressable>
          );
        })}
      </View>
      {active === "quick" && canQuickEnter && (
        <QuickEntry
          value={quick}
          onChange={onQuickChange}
          onApply={onQuickApply}
        />
      )}
      {active === "templates" && (
        <TransactionTemplates
          embedded
          selectedId={templateId}
          onApply={onTemplateApply}
          onSave={onTemplateSave}
          name={templateName}
          onNameChange={setTemplateName}
        />
      )}
      {(active !== "quick" || canQuickEnter) && <ErrorText error={error} />}
    </View>
  );
}

const s = StyleSheet.create({
  tools: { flexDirection: "row", gap: 8 },
  tool: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 12,
  },
  label: {
    flexShrink: 1,
    color: C.green,
    fontFamily: font.semibold,
    fontSize: 13,
  },
});
