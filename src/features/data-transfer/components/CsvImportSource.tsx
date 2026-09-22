import type { CsvImportModel } from "../model/useCsvImport";
import { Button, ErrorText, Field, Notice, Segments } from "../../../shared/ui";
import { CsvProfiles } from "./CsvProfiles";

export function CsvImportSource({ model }: { model: CsvImportModel }) {
  const {
    source,
    configured,
    draft,
    preview,
    busy,
    selectFile,
    changeSource,
    configure,
    useProfile,
    saveProfile,
  } = model;
  return (
    <>
      <Notice>
        Выписка обрабатывается на устройстве. Поддерживаются CSV и TSV, UTF-8 и
        Windows-1251, до 2 МБ и 5000 строк. Импорт добавляет операции к текущим
        данным.
      </Notice>
      <Button
        label={source.file ? "Выбрать другой CSV" : "Выбрать CSV-файл"}
        icon="document-text-outline"
        disabled={busy}
        onPress={() => void selectFile()}
      />
      <CsvProfiles
        selectedId={draft.profileId}
        canSave={configured && !!source.table && !preview.error}
        onApply={useProfile}
        onSave={saveProfile}
      />
      {source.file && (
        <>
          <Segments
            value={source.encoding}
            options={[
              { value: "auto", label: "Авто" },
              { value: "utf8", label: "UTF-8" },
              { value: "windows1251", label: "Windows-1251" },
            ]}
            onChange={(encoding) => changeSource({ encoding })}
          />
          <Segments
            value={source.separator}
            options={[
              { value: "auto", label: "Авто" },
              { value: ";", label: ";" },
              { value: ",", label: "," },
              { value: "\t", label: "Табуляция" },
            ]}
            onChange={(separator) => changeSource({ separator })}
          />
          <Field
            label="Номер строки с заголовками"
            accessibilityLabel="Строка заголовков CSV"
            value={source.headerRow}
            keyboardType="number-pad"
            onChangeText={(headerRow) => changeSource({ headerRow })}
            maxLength={2}
          />
          <ErrorText error={source.error} />
          {source.table && (
            <Button
              label={
                configured ? "Распознать колонки заново" : "Распознать колонки"
              }
              variant="secondary"
              onPress={configure}
            />
          )}
        </>
      )}
    </>
  );
}
