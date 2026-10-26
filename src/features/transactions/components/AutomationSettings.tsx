import type { OpenSheet } from "../../../application/navigation/types";
import { CategoryRulesPanel } from "./CategoryRulesPanel";
import { TemplateManager } from "./TemplateManager";

export function AutomationSettings({ open }: { open: OpenSheet }) {
  return (
    <>
      <CategoryRulesPanel open={open} />
      <TemplateManager open={open} />
    </>
  );
}
