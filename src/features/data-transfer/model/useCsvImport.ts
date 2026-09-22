import { useMemo, useRef, useState } from "react";
import {
  applyCsvProfile,
  type CsvSourceProfile,
} from "../../../domain/automation";
import {
  CSV_MAX_BYTES,
  guessCsvMapping,
  previewCsv,
  type CsvOptions,
  type CsvOverride,
} from "../../../domain/csv";
import { accountCurrency } from "../../../domain/currency";
import { useFinance, useFinanceActions } from "../../../state/finance";
import { pickDocument } from "../../../infrastructure/files/documents";
import { prepareCsvSource, type CsvSourceSettings } from "../lib/csvImport";

type Stage = "source" | "mapping" | "review";
const progress = (stage: Stage, profileId?: string) => ({
  stage,
  profileId,
  excluded: new Set<number>(),
  overrides: {} as Record<number, CsvOverride>,
  page: 0,
});

export function useCsvImport(close: () => void) {
  const { state, notify, today } = useFinance();
  const actions = useFinanceActions();
  const [source, setSource] = useState(() =>
    prepareCsvSource(null, {
      encoding: "auto",
      separator: "auto",
      headerRow: "1",
    }),
  );
  const [options, setOptions] = useState<CsvOptions>(() => ({
    accountId:
      state.accounts.find((account) => account.kind === "spending")?.id ?? "",
    mapping: guessCsvMapping([]),
    mode: "signed",
    positive: "income",
    dateOrder: "dmy",
  }));
  const [draft, setDraft] = useState(() => progress("source"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitted = useRef(false);
  const configured = draft.stage !== "source";
  const preview = useMemo(() => {
    if (!source.table || !configured) return { rows: [], error: "" };
    try {
      return {
        rows: previewCsv(state, source.table, options, draft.overrides, today),
        error: "",
      };
    } catch (failure) {
      return {
        rows: [],
        error:
          failure instanceof Error
            ? failure.message
            : "Проверьте сопоставление колонок.",
      };
    }
  }, [state, source.table, options, configured, draft.overrides, today]);
  const selected = preview.rows.filter(
    (row) =>
      row.transaction &&
      !row.error &&
      !row.duplicate &&
      !draft.excluded.has(row.line),
  );
  const reset = (stage: Stage, profileId?: string) => {
    setDraft(progress(stage, profileId));
    setError("");
  };
  const selectFile = async () => {
    setBusy(true);
    setError("");
    try {
      const file = await pickDocument(["csv", "tsv"], CSV_MAX_BYTES);
      if (file) {
        setSource(prepareCsvSource(file, { ...source, headerRow: "1" }));
        reset("source");
      }
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Не удалось открыть файл.",
      );
    } finally {
      setBusy(false);
    }
  };
  const changeSource = (patch: Partial<CsvSourceSettings>) => {
    setSource(prepareCsvSource(source.file, { ...source, ...patch }));
    reset("source", draft.profileId);
  };
  const configure = () => {
    if (!source.table) return;
    const mapping = guessCsvMapping(source.table.headers);
    const split =
      mapping.amount < 0 && mapping.expense >= 0 && mapping.income >= 0;
    setOptions((current) => ({
      ...current,
      mapping: {
        ...mapping,
        ...(split ? { amount: -1 } : { expense: -1, income: -1 }),
      },
      mode: split ? "split" : "signed",
    }));
    reset("mapping", draft.profileId);
  };
  const useProfile = (profile: CsvSourceProfile) => {
    if (!source.file) return setError("Сначала выберите CSV-файл.");
    try {
      const nextSource = prepareCsvSource(source.file, {
        ...profile,
        headerRow: String(profile.headerRow),
      });
      if (!nextSource.table) throw new Error(nextSource.error);
      const nextOptions = applyCsvProfile(
        state,
        profile,
        nextSource.table.headers,
      );
      setSource(nextSource);
      setOptions(nextOptions);
      reset("mapping", profile.id);
      notify(`Применён профиль «${profile.name}». Проверьте счёт и операции.`);
    } catch (failure) {
      setDraft(progress("source"));
      setError(
        failure instanceof Error
          ? failure.message
          : "Не удалось применить профиль.",
      );
    }
  };
  const saveProfile = (name: string, id?: string) => {
    if (!source.table || !configured) return;
    try {
      const next = actions.saveCsvProfile({
        id,
        name,
        encoding: source.encoding,
        separator: source.separator,
        headerRow: Number(source.headerRow),
        headers: source.table.headers,
        currency: accountCurrency(state, options.accountId),
        options,
      });
      setDraft((current) => ({
        ...current,
        profileId: next.csvProfiles?.find((entry) => entry.name === name.trim())
          ?.id,
      }));
      setError("");
      notify("Профиль CSV сохранён");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Не удалось сохранить профиль.",
      );
    }
  };
  const commit = () => {
    if (!source.table || submitted.current) return;
    try {
      // The action validates the entire import against the latest finance state.
      submitted.current = true;
      const next = actions.importCsv(
        source.table,
        options,
        draft.excluded,
        draft.overrides,
      );
      notify(
        `Импортировано операций: ${next.transactions.length - state.transactions.length}`,
      );
      close();
    } catch (failure) {
      submitted.current = false;
      setError(
        failure instanceof Error
          ? failure.message
          : "Не удалось импортировать операции.",
      );
    }
  };
  return {
    source,
    options,
    configured,
    draft,
    preview,
    selected,
    busy,
    error,
    selectFile,
    changeSource,
    configure,
    useProfile,
    saveProfile,
    setOptions,
    commit,
    review: () => reset("review", draft.profileId),
    back: () => setDraft((current) => ({ ...current, stage: "mapping" })),
    setPage: (page: number) => setDraft((current) => ({ ...current, page })),
    override: (line: number, value: CsvOverride) =>
      setDraft((current) => ({
        ...current,
        overrides: { ...current.overrides, [line]: value },
      })),
    toggle: (line: number) =>
      setDraft((current) => {
        const excluded = new Set(current.excluded);
        if (excluded.has(line)) excluded.delete(line);
        else excluded.add(line);
        return { ...current, excluded };
      }),
  };
}

export type CsvImportModel = ReturnType<typeof useCsvImport>;
