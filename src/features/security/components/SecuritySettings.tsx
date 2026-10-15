import { Platform } from "react-native";
import { Button, C, Card, Notice, Section, Txt } from "../../../shared/ui";
import { useSecurity } from "../model/SecurityContext";

export function SecuritySettings() {
  const { supported, enabled, busy, error, setEnabled, lock } = useSecurity();
  if (!supported)
    return (
      <Notice>
        В браузере данные хранятся без шифрования приложения. Шифрование и
        системная блокировка доступны в нативном Ладе для iOS и Android.
      </Notice>
    );
  return (
    <Card style={{ gap: 14 }}>
      <Section title="Защита данных" />
      <Txt style={{ color: C.muted, fontSize: 12, lineHeight: 20 }}>
        Записи сохраняются с шифрованием AES-256-GCM. Ключ хранится в{" "}
        {Platform.OS === "ios" ? "Keychain" : "Keystore"} этого устройства.
      </Txt>
      <Txt style={{ fontSize: 12, lineHeight: 20 }}>
        Блокировка {enabled ? "включена" : "выключена"}. Когда она включена,
        после выхода из приложения потребуется Face ID, отпечаток или код
        устройства, а содержимое скрывается в списке недавних приложений.
        {Platform.OS === "android" ? " Также запрещены скриншоты." : ""}
      </Txt>
      <Button
        label={enabled ? "Выключить блокировку" : "Включить блокировку"}
        icon="finger-print-outline"
        variant="secondary"
        disabled={busy}
        onPress={() => void setEnabled(!enabled)}
      />
      {enabled && (
        <Button
          label="Заблокировать сейчас"
          variant="secondary"
          onPress={lock}
        />
      )}
      {!!error && <Notice tone="warning">{error}</Notice>}
      <Notice>
        Профили разделяют учёт, но не ограничивают доступ разных людей. Их
        названия хранятся без шифрования — выбирайте нейтральные имена, если
        название раскрывает личные сведения.
      </Notice>
      <Notice>
        Блокировка закрывает интерфейс; она не защищает от взломанной системы
        или чтения памяти устройства. Ключ не привязан к текущему набору
        отпечатков или Face ID.
      </Notice>
      <Notice>
        Ключ устройства не переносится на другой телефон. Для переноса создайте
        копию с отдельным паролем в разделе «Данные и копии». Обычные JSON и CSV
        не зашифрованы. При утрате устройства и всех внешних копий восстановить
        учёт не получится.
      </Notice>
    </Card>
  );
}
