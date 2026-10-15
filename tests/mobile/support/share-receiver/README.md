# A04 Test Receiver

Минимальный отдельный Android APK для сохранения синтетического JSON/.ladbackup из настоящего Sharesheet Лада и последующей полной проверки A04/A05/T02. Только выделенные `Lad_FirstRun_Test`, `Lad_A04_Transfer_Test`, `Lad_T02_Recovery_Test` и `Lad_T02_Transfer_Test`; приложение Лад, его хранилище, зависимости и ключи не изменяются.

Приёмник `app.lad.testreceiver` обрабатывает один `ACTION_SEND` с `application/json` или `application/octet-stream`. Сразу запускает однократное чтение переданного `content://` URI, без повторов, обходных путей и заранее подготовленного файла. Лимит — 15 000 000 байт; пустой файл и превышение отклоняются. `SUCCESS` появляется только после EOF, записи, `fsync`, повторного чтения и совпадения SHA-256. Поэтому преждевременное удаление исходного файла отправителем не маскируется fallback; ошибки открытия/чтения остаются `ERROR`. Доступность файла после открытия дескриптора зависит от платформы, поэтому один успешный приём не исключает гонку у других системных получателей.

Файлы сохраняются в собственном `files/received/`, без доступа к сети, общему хранилищу, другим профилям или ключам Лада. Manifest не запрашивает разрешений; `debuggable` и `testOnly` включены специально для выгрузки через `run-as`. Содержимое файлов и исходный URI не выводятся в логи. Экран и `files/last-receipt.json` содержат только результат, имя собственного файла, размер, SHA-256 и время этапов. Исходное имя не используется в пути назначения; частичный файл удаляется при ошибке. `SUCCESS` подтверждает передачу байтов, а не корректность финансовой модели.

## Сборка

Из корня проекта, без сети и Gradle:

```sh
node tests/mobile/support/share-receiver/build.mjs
```

Нужны уже установленные JDK 17+, Android SDK platform 36 и build-tools 36.0.0. SDK выбирается из `ANDROID_HOME`, `ANDROID_SDK_ROOT` или стандартного пути; JDK — из `JAVA_HOME`, SDKMAN или Android Studio. Проверенная сборка: macOS arm64, JDK 21.0.7, SDK 36. Скрипт выполняет `javac`, `d8`, `aapt2`, `zipalign`, `apksigner`, проверяет подпись, package ID и отсутствие запрошенных разрешений. Новые зависимости не устанавливаются.

Артефакты: `test-results/t01/a04/share-receiver/a04-test-receiver.apk`, `build-manifest.json` (хеш APK/исходников) и `apk-verification.txt`. Отдельный тестовый ключ подписи создаётся в той же игнорируемой папке; публичный тестовый пароль `a04-test-only` не защищает пользовательские данные и не связан с ключами Лада. Сохранение этого ключа позволяет повторную установку через `-r`.

## Приём и выгрузка

Следующие команды запускает только оператор выделенного AVD. `adb` должен быть доступен в `PATH`; serial здесь явно выбран — `emulator-5556`.

```sh
adb -s emulator-5556 install -t -r test-results/t01/a04/share-receiver/a04-test-receiver.apk
```

В Ладе откройте экспорт JSON или защищённой копии, в настоящем системном меню выберите **A04 Test Receiver** и дождитесь `SUCCESS`. Не закрывайте приёмник до результата. На `ERROR` сохраните снимок и метаданные; не засчитывайте прежний принятый файл как новый экспорт.

```sh
adb -s emulator-5556 exec-out run-as app.lad.testreceiver cat files/last-receipt.json
node tests/mobile/support/share-receiver/pull.mjs emulator-5556 test-results/t01/a04/received
```

`pull.mjs` сначала проверяет точное имя AVD по списку `Lad_FirstRun_Test` / `Lad_A04_Transfer_Test` / `Lad_T02_Recovery_Test` / `Lad_T02_Transfer_Test`, затем статус последнего приёма, безопасный путь, размер и SHA-256 выгруженных байтов. Никакие данные устройства не изменяются. JSON/.ladbackup и его `.receipt.json` сохраняются в указанную папку; точный локальный путь выводится в поле `file`.

Для T02 используются `emulator-5560` (`Lad_T02_Recovery_Test`) и независимый `emulator-5562` (`Lad_T02_Transfer_Test`) и отдельный каталог `test-artifacts/t02-native/`. Открытый `.ladrescue` передаётся как `application/octet-stream`; приёмник сохраняет эти точные байты с расширением `.ladbackup`, выбираемым по MIME. Oracle определяет wire-формат по magic/header, а не по этому имени. Общий предел приёмника остаётся 15 000 000 байт; большой синтетический T02-архив около 10,14 МБ укладывается в него. Это ограничение тестового получателя, не новый лимит приложения.

Для последовательного переноса S06 второй AVD создаётся с независимым чистым userdata; исходный AVD останавливается до запуска второго. На `Lad_A04_Transfer_Test` используйте явно выбранный `emulator-5558` и отдельную папку результата:

```sh
adb -s emulator-5558 install -t -r test-results/t01/a04/share-receiver/a04-test-receiver.apk
node tests/mobile/support/share-receiver/pull.mjs emulator-5558 test-results/t01/a04/transfer-avd/received
```

Выгрузку запускайте после нового `SUCCESS` на втором AVD. Переносите только реально экспортированную `.ladbackup`; userdata, ключи и файлы приложения между AVD не копируются.

Для исходного набора A04 запустите полный oracle с этим путём:

```sh
node --import tsx tests/mobile/fixtures/a04-fixtures.ts verify ПУТЬ_ИЗ_ПОЛЯ_file
```

Для изменённого состояния A05 сравнивайте весь декодированный JSON с ожидаемым состоянием соответствующего шага, а не только суммы на экране. Пароль защищённого набора A04 — публичный `A04-synthetic-2026`; приёмник не расшифровывает файлы и не запрашивает пароль.

После завершения всех проверок APK можно удалить с **этого же тестового AVD**; это удалит только файлы приёмника:

```sh
adb -s emulator-5556 uninstall app.lad.testreceiver
```

Основа реализации: [Android — получение ACTION_SEND](https://developer.android.com/develop/ui/compose/sharing/receive), [AAPT2](https://developer.android.com/tools/aapt2), [d8](https://developer.android.com/tools/d8), [apksigner](https://developer.android.com/tools/apksigner). Сборка и проверка подписи сами по себе не подтверждают приём URI: фактический результат записывается отдельно в отчётах A04/A05 после запуска на устройстве.
