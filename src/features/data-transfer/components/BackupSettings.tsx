import { useEffect, useRef, useState } from "react";
import {
  prepareBackup,
  sharePreparedBackup,
  type PreparedBackup,
  type VerifiedBackup,
} from "../lib/backup";
import {
  dateLabel,
  localDate,
  shiftDate,
  uid,
  validDate,
} from "../../../domain/finance";
import {
  ErrorText,
  Button,
  Card,
  Field,
  Notice,
  Txt,
  TourTarget,
  useTourActive,
} from "../../../shared/ui";
import { validateBackupPassword } from "../../../infrastructure/crypto/passwordBackup";
import { readLastBackupDate } from "../../../infrastructure/storage/backupHistory";
import {
  getBackupReceiptStore,
  type BackupReceipt,
} from "../../../infrastructure/storage/backupReceipts";
import {
  useFinance,
  useFinanceStatus,
  type BackupSourceResult,
} from "../../../state/finance";
import { BackupPicker } from "./BackupPicker";
import { BackupVerification } from "./BackupVerification";
import { DataConfirmation } from "./DataConfirmation";

export function BackupSettings({
  onReady,
  onStart,
  disabled = false,
}: {
  onReady: (backup: VerifiedBackup) => void;
  onStart: () => void;
  disabled?: boolean;
}) {
  const { notify, today, profile } = useFinance();
  const { getBackupSource } = useFinanceStatus();
  const touring = useTourActive();
  const readOnly = disabled || touring;
  const mounted = useRef(true);
  const generation = useRef(0),
    busyRef = useRef(false),
    profileRef = useRef(profile);
  profileRef.current = profile;
  const [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState("");
  const [protect, setProtect] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [last, setLast] = useState<string>();
  const [receipt, setReceipt] = useState<BackupReceipt>();
  const [retained, setRetained] = useState<{
    backup: PreparedBackup;
    exportId: string;
    profileId: typeof profile;
    profileName: string;
    preparedAt: string;
  }>();
  const [transfer, setTransfer] = useState<{
    status: "unknown" | "failed";
    at: string;
  }>();
  const [notConfirmedAt, setNotConfirmedAt] = useState<string>();
  const [fallback, setFallback] = useState<{
    source: BackupSourceResult;
    password?: string;
  }>();
  useEffect(() => {
    mounted.current = true;
    const current = ++generation.current;
    let active = true;
    busyRef.current = false;
    setBusy(false);
    setReceipt(undefined);
    setLast(undefined);
    setRetained(undefined);
    setTransfer(undefined);
    setNotConfirmedAt(undefined);
    setFallback(undefined);
    setPassword("");
    setConfirmation("");
    setProtect(false);
    setError("");
    void Promise.all([
      getBackupReceiptStore(profile).read(),
      readLastBackupDate(profile),
    ])
      .then(([value, legacy]) => {
        if (
          !active ||
          current !== generation.current ||
          profileRef.current !== profile
        )
          return;
        setReceipt(value ?? undefined);
        if (legacy && validDate(legacy)) setLast(legacy);
      })
      .catch((failure) => {
        if (
          active &&
          current === generation.current &&
          profileRef.current === profile
        )
          setError(
            failure instanceof Error
              ? failure.message
              : "Не удалось прочитать отметку копии.",
          );
      });
    return () => {
      active = false;
      mounted.current = false;
      generation.current++;
    };
  }, [profile]);
  const clearPassword = () => {
    setPassword("");
    setConfirmation("");
    setProtect(false);
  };
  const run = async (task: (live: () => boolean) => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    const current = ++generation.current,
      capturedProfile = profile;
    const live = () =>
      mounted.current &&
      current === generation.current &&
      profileRef.current === capturedProfile;
    setBusy(true);
    setError("");
    try {
      await task(live);
    } catch (failure) {
      if (live())
        setError(
          failure instanceof Error
            ? failure.message
            : "Не удалось подготовить копию.",
        );
    } finally {
      if (live()) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };
  const transferFile = async (backup: PreparedBackup, live: () => boolean) => {
    if (!live()) return;
    try {
      await sharePreparedBackup(backup);
      if (live()) {
        setTransfer({ status: "unknown", at: new Date().toISOString() });
        notify(
          "Резервная копия подготовлена. Сохраните файл в выбранном месте.",
        );
      }
    } catch (failure) {
      if (live())
        setTransfer({ status: "failed", at: new Date().toISOString() });
      throw failure;
    }
  };
  const send = async (
    source: BackupSourceResult,
    secret: string | undefined,
    live: () => boolean,
  ) => {
    const backup = await prepareBackup(source, secret);
    if (!live()) return;
    // Keep the prepared bytes, never the password. Retry shares this exact file.
    clearPassword();
    setFallback(undefined);
    setReceipt(undefined);
    setTransfer(undefined);
    setNotConfirmedAt(undefined);
    const exportId = uid(),
      preparedAt = new Date().toISOString();
    setRetained({
      backup,
      exportId,
      preparedAt,
      profileId: source.profileId,
      profileName: source.profileName,
    });
    let metadataError = "";
    try {
      const saved = await getBackupReceiptStore(source.profileId).prepared({
        exportId,
        fileName: backup.name,
        ...backup.fingerprint,
        encrypted: backup.encrypted,
        sourceKind: source.kind,
        preparedAt,
      });
      if (live()) setReceipt(saved);
    } catch {
      metadataError =
        "Файл подготовлен, но отметку о нём сохранить не удалось. Проверьте файл после сохранения.";
    }
    if (live()) {
      if (metadataError) setError(metadataError);
      await transferFile(backup, live);
    }
  };
  const save = (encrypted: boolean) =>
    run(async (live) => {
      if (encrypted) {
        validateBackupPassword(password);
        if (password !== confirmation) throw new Error("Пароли не совпадают.");
      }
      const secret = encrypted ? password : undefined;
      const source = await getBackupSource();
      if (!live()) return;
      if (source.kind === "last-readable-saved") {
        setFallback({ source, password: secret });
        return;
      }
      await send(source, secret, live);
    });
  const preparedAt = retained?.preparedAt ?? receipt?.preparedAt;
  const preparedDay = preparedAt ? localDate(new Date(preparedAt)) : last;
  const blocked = busy || readOnly || !!fallback;
  return (
    <TourTarget id="data.backups" style={{ gap: 16 }}>
      <Notice>
        Полная копия содержит финансовые данные и настройки текущего профиля:
        счета, операции, категории, бюджеты, цели, долги, планы доходов и
        платежей, курсы и сценарии. Она не включает другие профили, их названия,
        ключ устройства, настройки блокировки, обучение и системные уведомления.
        Сохраните файл вне приложения перед сменой устройства.
      </Notice>
      <Txt>
        {preparedDay
          ? `Последняя подготовленная копия: ${dateLabel(preparedDay)}.`
          : "Копия на этом устройстве ещё не создавалась."}
      </Txt>
      {retained && (
        <>
          <Txt>
            Подготовлена копия профиля «{retained.profileName}»:{" "}
            {retained.backup.name}. Подготовлено:{" "}
            {new Date(retained.preparedAt).toLocaleString("ru-RU")}.
          </Txt>
          <Button
            label="Повторить передачу этой копии"
            variant="secondary"
            disabled={blocked || retained.profileId !== profile}
            onPress={() =>
              void run((live) => transferFile(retained.backup, live))
            }
          />
          <Notice>
            Повтор использует те же байты и не создаёт новую копию. Кнопки
            создания ниже подготовят новый файл из актуального учёта.
          </Notice>
        </>
      )}
      {!retained && receipt && (
        <Notice>
          Для новой передачи создайте новую копию. Прежний подготовленный файл
          не хранится в приложении после закрытия этого окна.
        </Notice>
      )}
      {transfer && (
        <Notice tone={transfer.status === "failed" ? "warning" : "normal"}>
          {transfer.status === "failed"
            ? "Передача файла завершилась ошибкой. Можно повторить передачу этой же копии."
            : "Файл передан системе. Результат сохранения неизвестен; подтвердите сохранение сами или проверьте точный файл чтением."}{" "}
          {new Date(transfer.at).toLocaleString("ru-RU")}.
        </Notice>
      )}
      {receipt ? (
        <>
          <Txt>
            {receipt.userConfirmedAt
              ? `Сохранение файла подтверждено вами: ${new Date(receipt.userConfirmedAt).toLocaleString("ru-RU")}.`
              : "Сохранение файла ещё не подтверждено вами."}
          </Txt>
          <Txt>
            {receipt.readVerifiedAt
              ? `Эта копия успешно проверена чтением: ${new Date(receipt.readVerifiedAt).toLocaleString("ru-RU")}.`
              : "Чтение этой копии ещё не проверено."}
          </Txt>
          {receipt.sourceKind === "last-readable-saved" && (
            <Notice tone="warning">
              Копия содержит последний читаемый сохранённый снимок.
              Несохранённые изменения в неё не вошли.
            </Notice>
          )}
          {!receipt.userConfirmedAt && (
            <Button
              label="Я сохранил файл"
              variant="secondary"
              disabled={blocked}
              onPress={() =>
                void run(async (live) => {
                  const updated = await getBackupReceiptStore(
                    profile,
                  ).confirmSaved(receipt.exportId);
                  if (!updated)
                    throw new Error(
                      "Последняя копия изменилась. Откройте настройки ещё раз.",
                    );
                  if (live()) {
                    setReceipt(updated);
                    setNotConfirmedAt(undefined);
                  }
                })
              }
            />
          )}
          {!receipt.userConfirmedAt && (
            <Button
              label="Ещё нет"
              variant="secondary"
              disabled={blocked}
              onPress={() => setNotConfirmedAt(new Date().toISOString())}
            />
          )}
          {notConfirmedAt && !receipt.userConfirmedAt && (
            <Txt>
              Сохранение ещё не подтверждено (
              {new Date(notConfirmedAt).toLocaleString("ru-RU")}). Можно
              повторить передачу подготовленной копии.
            </Txt>
          )}
        </>
      ) : (
        last && (
          <Notice>
            Это старая отметка о подготовке файла. Она не подтверждает
            сохранение или успешное чтение копии.
          </Notice>
        )
      )}
      {preparedDay && preparedDay < shiftDate(today, -30) && (
        <Notice>
          С последней подготовки копии прошло больше месяца. Создайте новую,
          чтобы сохранить свежие записи.
        </Notice>
      )}
      <Button
        label="Создать копию с паролем"
        icon="lock-closed-outline"
        variant="secondary"
        disabled={blocked}
        onPress={() => {
          if (protect) clearPassword();
          else setProtect(true);
        }}
      />
      {protect && (
        <Card style={{ gap: 14 }}>
          <Notice>
            Придумайте отдельный пароль от 10 символов. Он нужен для
            восстановления на любом устройстве; приложение не хранит и не
            восстанавливает его.
          </Notice>
          <Field
            label="Пароль копии"
            accessibilityLabel="Новый пароль копии"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={256}
            editable={!blocked}
          />
          <Field
            label="Повторите пароль"
            accessibilityLabel="Повтор пароля копии"
            value={confirmation}
            onChangeText={setConfirmation}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={256}
            editable={!blocked}
          />
          <Button
            label={busy ? "Защищаем копию…" : "Сохранить защищённую копию"}
            disabled={blocked}
            onPress={() => void save(true)}
          />
        </Card>
      )}
      <Txt>
        Копия без пароля — JSON или большой архив восстановления — содержит
        открытый учёт. Не публикуйте её. Потеря устройства и всех копий
        одновременно невосстановима.
      </Txt>
      <Button
        label="Экспортировать резервную копию"
        icon="download-outline"
        variant="secondary"
        disabled={blocked}
        onPress={() => void save(false)}
      />
      {fallback && (
        <DataConfirmation
          title="Экспортировать последний сохранённый снимок?"
          confirmLabel="Экспортировать сохранённый снимок"
          busy={busy || readOnly}
          onCancel={() => {
            setFallback(undefined);
            clearPassword();
          }}
          onConfirm={() =>
            void run((live) => send(fallback.source, fallback.password, live))
          }
        >
          Текущие изменения профиля «{fallback.source.profileName}» не удалось
          подтвердить в хранилище. В копию попадёт только последний читаемый
          сохранённый снимок. Несохранённые изменения в памяти могут быть новее.
        </DataConfirmation>
      )}
      <ErrorText error={error} />
      <BackupVerification
        key={`verification-${profile}`}
        profile={profile}
        receipt={receipt}
        disabled={blocked}
        onReceipt={(value) => {
          if (mounted.current) setReceipt(value);
        }}
      />
      <BackupPicker
        key={`restore-${profile}`}
        label="Восстановить из файла"
        disabled={blocked}
        onStart={onStart}
        onReady={onReady}
      />
    </TourTarget>
  );
}
