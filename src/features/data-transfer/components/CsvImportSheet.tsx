import { ErrorText, font, Txt } from "../../../shared/ui";
import { useCsvImport } from "../model/useCsvImport";
import { CsvImportSource } from "./CsvImportSource";
import { CsvImportMapping } from "./CsvImportMapping";
import { CsvImportReview } from "./CsvImportReview";

export function CsvImportSheet({ close }: { close: () => void }) {
  const model = useCsvImport(close);
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
