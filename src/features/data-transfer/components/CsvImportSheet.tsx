import type { OpenSheet } from "../../../application/navigation/types";
import { useFinance } from "../../../state/finance";
import { AccountChoiceEmpty } from "../../accounts";
import { ErrorText, font, Txt } from "../../../shared/ui";
import { useCsvImport } from "../model/useCsvImport";
import { CsvImportSource } from "./CsvImportSource";
import { CsvImportMapping } from "./CsvImportMapping";
import { CsvImportReview } from "./CsvImportReview";

function CsvImportSheetContent() {
  const model = useCsvImport();
  const reviewing = model.draft.stage === "review";
  return (
    <>
      {!reviewing && <CsvImportSource model={model} />}
      {model.source.file && (
        <Txt style={{ fontFamily: font.bold }}>{model.source.file.name}</Txt>
      )}
      {model.configured &&
        model.source.table &&
        (reviewing ? (
          <CsvImportReview model={model} />
        ) : (
          <CsvImportMapping model={model} />
        ))}
      <ErrorText error={model.error} />
    </>
  );
}

export function CsvImportSheet({ open }: { open: OpenSheet }) {
  const { state } = useFinance();
  if (
    !state.accounts.some(
      (account) => !account.archived && account.kind === "spending",
    )
  )
    return <AccountChoiceEmpty open={open} />;
  return <CsvImportSheetContent />;
}
