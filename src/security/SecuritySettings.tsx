import { Platform } from "react-native";
import { Button, C, Card, Notice, Section, Txt } from "../ui";
import { useSecurity } from "./SecurityProvider";

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
        Экспортируемая JSON-копия не зашифрована. Сохраните её в надёжном месте:
        ключ устройства не переносится на другой телефон.
      </Notice>
    </Card>
  );
}
