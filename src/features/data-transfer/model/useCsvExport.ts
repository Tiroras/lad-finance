import { useEffect, useMemo, useRef, useState } from "react";
import {
  exportTransactionsCsvParts,
  type CsvExportOptions,
} from "../../../domain/csvExport";
import { CSV_MAX_BYTES } from "../../../domain/csv";
import { uid } from "../../../domain/finance";
import { pickDocument } from "../../../infrastructure/files/documents";
import { shareFile } from "../../../infrastructure/files/shareFile";
import { getCsvExportReceiptStore } from "../../../infrastructure/storage/csvExportReceiptStore";
import {
  updateCsvExportReceipt,
  type CsvExportReceipt,
  type CsvReceiptAction,
} from "../../../infrastructure/storage/csvExportReceipts";
import { useFinance } from "../../../state/finance";
import {
  prepareCsvExportBatch,
  verifyCsvExportFile,
  type PreparedCsvBatch,
} from "../lib/csvExportBatch";

export function useCsvExport(options: CsvExportOptions) {
  const { state, today, profile, activeProfile } = useFinance();
  const [batch, setBatch] = useState<PreparedCsvBatch>();
  const [receipt, setReceipt] = useState<CsvExportReceipt>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const generation = useRef(0),
    busyRef = useRef(false),
    profileRef = useRef(profile);
  profileRef.current = profile;
  const preview = useMemo(() => {
    try {
      return {
        result: exportTransactionsCsvParts(state, options, today),
        error: "",
      };
    } catch (failure) {
      return {
        result: undefined,
        error:
          failure instanceof Error
            ? failure.message
            : "Не удалось подготовить CSV.",
      };
    }
  }, [
    state,
    today,
    options.format,
    options.accountId,
    options.from,
    options.through,
  ]);
  useEffect(() => {
    const current = ++generation.current;
    busyRef.current = false;
    setBusy(false);
    setBatch(undefined);
    setReceipt(undefined);
    setError("");
    setMessage("");
    void getCsvExportReceiptStore(profile)
      .read()
      .then((value) => {
        if (current === generation.current && profileRef.current === profile)
          setReceipt(value ?? undefined);
      })
      .catch((failure) => {
        if (current === generation.current && profileRef.current === profile)
          setError(
            failure instanceof Error
              ? failure.message
              : "Не удалось прочитать отметки CSV.",
          );
      });
    return () => {
      generation.current++;
    };
  }, [profile]);

  const run = (task: (live: () => boolean) => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    const current = ++generation.current,
      capturedProfile = profile;
    const live = () =>
      current === generation.current && profileRef.current === capturedProfile;
    setBusy(true);
    setError("");
    setMessage("");
    void task(live)
      .catch((failure) => {
        if (live())
          setError(
            failure instanceof Error
              ? failure.message
              : "Не удалось выполнить действие с CSV.",
          );
      })
      .finally(() => {
        if (live()) {
          busyRef.current = false;
          setBusy(false);
        }
      });
  };
  const mark = async (
    current: CsvExportReceipt,
    part: number,
    action: CsvReceiptAction,
    live: () => boolean,
  ) => {
    const at = new Date().toISOString();
    const next = updateCsvExportReceipt(current, part, action, at);
    if (live()) setReceipt(next);
    try {
      const stored = await getCsvExportReceiptStore(profile).update(
        current.batchId,
        part,
        action,
        at,
      );
      if (live()) setReceipt(stored);
      return stored;
    } catch {
      if (live())
        setError(
          "Действие выполнено, но отметку CSV сохранить не удалось. После закрытия окна она может быть потеряна.",
        );
      return next;
    }
  };
  const send = async (
    prepared: PreparedCsvBatch,
    current: CsvExportReceipt,
    part: number,
    live: () => boolean,
  ) => {
    const file = prepared.parts[part - 1];
    if (!file || prepared.profileId !== profile)
      throw new Error("Выберите CSV-набор текущего профиля.");
    if (!live()) return;
    try {
      await shareFile(file.content, file.name, "text/csv");
      await mark(current, part, { type: "transfer", status: "unknown" }, live);
      if (live())
        setMessage(
          `Часть ${part} передана системе. Сохранение файла пока не подтверждено.`,
        );
    } catch (failure) {
      await mark(current, part, { type: "transfer", status: "failed" }, live);
      throw failure;
    }
  };
  return {
    batch,
    receipt,
    busy,
    error: error || preview.error,
    message,
    preview: preview.result,
    invalidate() {
      if (busyRef.current) return false;
      setBatch(undefined);
      setError("");
      setMessage("Условия изменились. Подготовьте новый CSV-набор.");
      return true;
    },
    prepare() {
      run(async (live) => {
        // Snapshot, date, profile and filters are captured before the first await.
        const prepared = prepareCsvExportBatch(
          {
            state,
            profileId: profile,
            profileName: activeProfile.name,
            today,
            options: { ...options },
          },
          uid(),
          new Date().toISOString(),
        );
        setBatch(prepared);
        setReceipt(prepared.receipt);
        try {
          await getCsvExportReceiptStore(profile).prepared(prepared.receipt);
        } catch {
          if (live())
            setError(
              "CSV подготовлен, но отметки сохранить не удалось. Проверьте файлы после сохранения.",
            );
        }
        if (live()) await send(prepared, prepared.receipt, 1, live);
      });
    },
    share(part: number) {
      if (batch && receipt?.batchId === batch.id)
        run((live) => send(batch, receipt, part, live));
    },
    confirm(part: number, saved: boolean) {
      if (receipt)
        run(async (live) => {
          await mark(
            receipt,
            part,
            { type: saved ? "user-confirmed" : "not-confirmed" },
            live,
          );
        });
    },
    verify(part: number) {
      if (!receipt) return;
      run(async (live) => {
        const file = await pickDocument(["csv"], CSV_MAX_BYTES);
        if (!live()) return;
        if (!file) {
          setMessage("Проверка файла отменена. Отметки не изменены.");
          return;
        }
        const expected = receipt.parts[part - 1];
        if (!expected) throw new Error("Часть CSV не найдена.");
        const fingerprint = verifyCsvExportFile(
          expected,
          file.bytes,
          batch?.id === receipt.batchId
            ? batch.parts[part - 1]?.content
            : undefined,
        );
        await mark(
          receipt,
          part,
          { type: "read-verified", ...fingerprint },
          live,
        );
        if (live())
          setMessage(
            `Часть ${part}: точный файл проверен чтением. Учёт не изменён.`,
          );
      });
    },
  };
}
