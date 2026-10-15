# T02: проверка копии и перенос большого снимка на Android

План обновлён 15.10.2026 по текущим YAML, фикстурам, manifest и журналам основного исполнителя. **B10, малый trial и большой отрицательный сценарий пройдены. Прежний SQLITE_FULL исправлен: тот же pending import, restart, полный actual plain/password oracle и source/control прошли на новой APK. Независимый перенос на чистый 5562 частично выполнен и отложен по указанию пользователя; его результат не подтверждён.** Итоговые результаты ведёт основной исполнитель в [отчёте T02](../../../docs/tasks/2026-10-06-follow-up/reports/T02-native-recovery.md); ниже отделены выполненные шаги от ожидаемых.

## Ограничение текущей сессии

Пользователь указал: «Не тестируй в эту сессию в эмуляторе. Пока тестируй только в браузере». **Все команды для устройств ниже сохранены только для воспроизводимости; в текущей сессии они не запускаются, включая read-only ADB/Maestro, снимки и управление AVD.** Уже запущенная операция оставлена без вмешательства. Последний снимок target от `2026-10-15 22:00:19.993 +04:00` показывал «Проверка пароля…» без видимой ошибки; последующий исход неизвестен. Это deferred by user, не app failure и не pass.

Последнее известное состояние: source 5560 штатно остановлен с активным A04; target 5562 запущен с выключенными Wi-Fi/mobile. Повторный опрос процессов/устройств не выполняется. Заключительный возврат source, включение сети и остановка target отложены по тому же указанию. Оставшиеся шаги сохранены для будущей сессии, в которой нативные проверки будут разрешены пользователем.

## Стенд и ограничения запуска

| Условие                                       | Значение                                                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Исходный стенд T02                            | `emulator-5560`, `Lad_T02_Recovery_Test`                                                                   |
| Независимый получатель                        | `emulator-5562`, `Lad_T02_Transfer_Test`; установка/baseline пройдены, результат переноса deferred by user |
| Сборка                                        | Default release, `arm64-v8a`, `app.lad.finance`; Demo/Fresh выключены                                      |
| APK подтверждённого FAIL SHA-256              | `4a9b484149b0620b8f5c999f6952ad8b297f5e86b140a3c1806badf20b035e0f`                                         |
| Manifest 344 исходных файлов, до/после сборки | `907109c6c44b0aab3d9fd76cea8ddb204c79ac6eeb3ae867e98d048c34161f9f`                                         |
| Наблюдавшееся окружение 5560                  | Android 17 / API 37, 720×1600, density 280; `Europe/Samara`, локальная дата `2026-10-15`                   |
| Запуск                                        | Локальный Maestro CLI 2.11.0; управление устройством и ADB — только основной исполнитель                   |
| Артефакты                                     | `test-artifacts/t02-native/`; каждый новый запуск — отдельный каталог                                      |

Старый `Lad_FirstRun_Test` / 5556 заменён после удаления общего `test-results/` параллельным браузерным запуском. До завершения старого AVD все пять синтетических профилей были заново экспортированы и проверены. Новый 5560 использует отдельные userdata/ключи; профиль A04 и контроль перенесены штатными файлами. Детали инцидента относятся к отчёту, а не к дефектам приложения. Нельзя вновь помещать AVD или native-артефакты в очищаемый `test-results/`.

Fresh, `clearState`, `pm clear`, повреждение каталога и удаление ключей здесь не применяются. Для проверок после перезапуска выбран default без очистки. Приведённый APK соответствует прогонам до исправления SQLITE_FULL. Исправленная APK установлена через `install -r`: SHA `b5683e98e9f6e9307e449fce5a2ded6bc73e4747a577f141981447fcba906068`, pre/post manifest 346 файлов `7ee99282df6dbcb367650e7842c73966e4fc4d27a5daf9687d7e56cdf06c1933`. Результаты прежней APK не приписываются исправленной. Исторические A04/A05 не считаются проверкой T02.

Перед передачей управления generator получает этот план, serial/AVD, APK manifest, режим, текущий экран и пути файлов. На одном устройстве работает один исполнитель; MCP и CLI параллельно не запускаются. Назначенный контроллер проверяет список устройств через доступный Maestro MCP; автор этого обновления MCP не вызывал. Если подключается новый контроллер, сначала проверяются serial/AVD и реальный экран, затем продолжается конкретный этап, без повторения уже выполненных действий.

Основа: [правила Maestro](../../../docs/MAESTRO_AGENTS.md), [мобильный запуск](../../../docs/DEVELOPMENT.md#мобильные-проверки-и-docker), [карточка T02](../../../docs/tasks/2026-10-06-follow-up/02-recovery-security.md), [контракт восстановления](../../../docs/tasks/2026-10-06-follow-up/analysis/recovery-security.md), [контракт повторного большого экспорта](../../../docs/tasks/2026-10-06-follow-up/reports/T02-recovery-decision.md).

## Данные и финансовые ожидания

Все суммы ниже — RUB; JSON хранит целые копейки. Все файлы и профили синтетические. Фиксированная дата финансовых ожиданий — `2026-10-15`. На другой дате сначала обновить условия и эталоны; не считать старый прогон проверкой нового дня.

| Профиль/файл                    | Полный эталон и проверяемые суммы                                                                                                                                                                                                                                                                                             |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Источник `A04-20261015-Android` | [a04-fixtures.ts](../fixtures/a04-fixtures.ts): 3 счёта, 3 операции от 06.10.2026, 1 цель. Начальная карта 10 000,00; доход 500,00; расход 200,00; перевод в накопления 1 000,00. Итог: карта **9 300,00**, наличные **0,00**, накопления **1 000,00**, всего **10 300,00**. Цель 2 000,00, обеспечено 1 000,00.              |
| Контроль `Личный` на 5560       | Восстановленный `A05-20261015-Offline-Control`, 3 счёта по **0,00**, 0 операций, 0 целей, автоматические курсы выключены. Полный JSON **2 404 байта**, SHA-256 `07fa687e130896bd21119e656885627facc6ef31ea3d8464a064952c79e79d91`; настройки также обязательны для сравнения. Это не прежний профиль «Личный» со старого AVD. |
| `T02-20261015-Trial`            | Создан из проверенного малого источника, его полный финансовый JSON равен A04. Перезапуск и actual export oracle пройдены.                                                                                                                                                                                                    |
| `t02-small-latest.json`         | Настоящий экспорт A04 на T02, **2 191 байт**, SHA-256 `4eb02ccaf79413515d63de172ebc56a0ec4704c05c60af30ef69b7e53a09ba5c`.                                                                                                                                                                                                     |
| `t02-same-state-pretty.json`    | Тот же полный JSON с другими пробелами, **3 237 байт**, SHA-256 `8449b9cf09db3ac857ffc95074dcc9756ae49371c3bfae18bbc751f0908cad9c`. `JSON.parse` обоих файлов глубоко равен; точные байты различаются.                                                                                                                        |
| `T02-20261015-Large`            | Создан на 5560 через тот же pending journal; restart и полный actual plain/password oracle прошли на исправленной APK.                                                                                                                                                                                                        |
| `T02-20261015-Transfer`         | Предлагаемое имя нового профиля на независимом 5562; создание не выполнялось, шаг отложен по указанию пользователя.                                                                                                                                                                                                           |

Малый актуальный снимок экспортируется обычным JSON/v1, в том числе при наличии recovery-основания. Большой v2 нужен, когда актуальный снимок превышает обычный лимит. Не менять исходный A04 ради подготовки большого случая.

### Большой набор

[t02-fixtures.ts](../fixtures/t02-fixtures.ts) расширяет [a03Fixtures.ts](../../a03Fixtures.ts): явно задаёт offline/onboarding-настройки и сокращает одну заметку исходника. Значения из `test-artifacts/t02-native/fixtures/manifest.json`:

| Параметр                                      | Значение                                                           |
| --------------------------------------------- | ------------------------------------------------------------------ |
| Нормализация исходника / дата текущего снимка | `2026-10-06` / `2026-10-15`                                        |
| Исходник                                      | **4 999 822 UTF-16 / 5 039 919 UTF-8 байт**                        |
| Актуальный снимок                             | **5 058 250 UTF-16 / 5 098 363 UTF-8 байта**                       |
| Вычисленный допуск                            | **5 059 822 UTF-16 / 5 099 919 UTF-8 байт**                        |
| Исходный раздел SHA-256                       | `21697923f17e2c4c07e5eb8429eceefcdbde41a0d54b65daeff8645e5d52e8d1` |
| Каноническое актуальное состояние SHA-256     | `4eb80d95737ebb9ba49d63bf10fa2e2fa8acd63eb10f58df89e7ec7cd551c9df` |
| Входной открытый v2                           | `t02-large.ladrescue`, **10 138 489 байт**, protection `none`      |
| Входной защищённый v2                         | `t02-large.ladbackup`, **10 138 656 байт**, protection `password`  |

Исходник содержит 10 000 доходов по **1 000,00 RUB**, карта **10 000 000,00 RUB**. В актуальном снимке удалены `a03-0`…`a03-3`, сохранены `a03-4`…`a03-9999`, добавлен `a03-later` от 15.10.2026 на **1 000,00 RUB** с заметкой `Изменение после восстановления`. Итог: **9 997 операций**, карта **9 997 000,00 RUB** (`999700000` копеек), наличные/накопления **0,00 RUB**, 0 целей. Актуальный снимок по-прежнему больше 5 млн UTF-16.

Публичный тестовый пароль: `T02-synthetic-2026`; неправильный: `T02-wrong-password`. Подготовленный helper-файл — вход проверки, не доказательство экспорта телефона. Старый A04 `.ladbackup` и его пароль не подменяют T02-файлы. Не включать автоматические курсы и не проходить настройку поверх восстановленной фикстуры: это изменит эталон.

## Файловый и финансовый oracle на компьютере

Каждый export-flow заканчивается в настоящем **A04 Test Receiver** с новым `SUCCESS`. До следующего UI-этапа контроллер сохраняет свежие receipt и байты через [pull.mjs](../support/share-receiver/pull.mjs). Скрипт проверяет serial/AVD, статус, размер и SHA-256. Оба T02 AVD уже входят в его разрешённый список. Старый принятый файл не считается новым экспортом.

```sh
node tests/mobile/support/share-receiver/pull.mjs emulator-5560 test-artifacts/t02-native/received/ИМЯ_ЭТАПА
node --import tsx tests/mobile/fixtures/a04-fixtures.ts verify ПУТЬ_ИЗ_ПОЛЯ_file
```

Вторая команда — для малого A04/trial JSON. Для большого файла вместо неё **обязателен явный ожидаемый режим защиты**:

```sh
node --import tsx tests/mobile/fixtures/t02-fixtures.ts verify ПУТЬ_ИЗ_ПОЛЯ_file none
node --import tsx tests/mobile/fixtures/t02-fixtures.ts verify ПУТЬ_ИЗ_ПОЛЯ_file password
```

Запускается одна подходящая команда: `none` после открытого экспорта, `password` после защищённого. Helper проверяет `LADRESC2`, `header.protection`, точное равенство исходного текста, полный актуальный JSON и нормализованное состояние. Переданный пароль сам по себе не доказывает шифрование. Приёмник сохраняет `application/octet-stream` с собственным суффиксом `.ladbackup` даже для открытого v2; расширение полученного файла не определяет protection.

Для target используют `pull.mjs emulator-5562 ...`; после его открытого экспорта oracle ожидает `none`. В независимый AVD передают только **реальные байты защищённого экспорта 5560**, уже прошедшие oracle `password`; не исходную Node-фикстуру и не открытый вариант. Размер/хеш до и после передачи должны совпасть. Userdata, ключи и каталоги Лада не копируются.

Контроль `Личный` сравнивается целиком с сохранённым A05 offline, например:

```sh
node --input-type=module - ПУТЬ_К_НОВОМУ_JSON_КОНТРОЛЯ <<'JS'
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const preserved = readJson('test-artifacts/t02-native/preserved/profiles-a05-offline.json');
assert.deepEqual(readJson(process.argv[2]), readJson(preserved.file));
console.log('passed-full-control-json');
JS
```

Oracle не удаляет поля и не сортирует массивы; порядок ключей объектов несущественен. UI-баланс и число строк не заменяют все записи, ссылки, настройки, планы, категории и заметки. Приёмник ограничен 15 000 000 байт; оба текущих больших архива помещаются. Превышение лимита при другом наборе — ограничение стенда, нельзя усекать файл.

**Экспорт ради oracle обновляет последнюю отметку копии.** Статусы B10 снимаются до следующего экспорта; после него нельзя ожидать прежний receipt. Все финансовые сравнения выполняются отдельно от служебных отметок подготовки/сохранения/чтения.

## Реальные flows, параметры и локаторы

Все файлы находятся в [default/recovery](../default/recovery/). Из исходных восьми общих flows удалены значения `env` по умолчанию; новые парольные подшаги также требуют явных параметров: parent или CLI должен передать каждую требуемую переменную. Комментарий о default в старой шапке не является значением. Не запускать всю папку: в ней есть подшаги с разными начальными экранами.

| Общий flow                    | Обязательные `-e` при прямом запуске                                                |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| `t02-open-data.yaml`          | `PROFILE`                                                                           |
| `t02-pick-file.yaml`          | `PICKER_ACTION`, `FILE_NAME`                                                        |
| `t02-unlock-password.yaml`    | `PASSWORD`, `EXPECTED_RESULT`; только новый выбор файла с пустым полем              |
| `t02-new-profile.yaml`        | `NAME`, `TRANSACTIONS`, `ACCOUNTS`, `GOALS`                                         |
| `t02-confirm-saved.yaml`      | `DATE_LABEL` (`15 октября` для этого прогона)                                       |
| `t02-verified-read-only.yaml` | `FILE_NAME`, `TRANSACTIONS`, `ACCOUNTS`, `GOALS`, `EXPECTED_MESSAGE`, `READ_STATUS` |
| `t02-export-json.yaml`        | Нет; нужен уже открытый экран данных правильного профиля                            |
| `t02-export-password.yaml`    | `PASSWORD`; форма нового пароля изначально закрыта                                  |

Дополнительные парольные подшаги: `t02-password-focus` и `t02-password-clear` не требуют env, но clear разрешён только после фокуса и `KEYCODE_MOVE_END`; `t02-password-fill` требует `PASSWORD`; `t02-unlock-entered-password` требует `EXPECTED_RESULT`. Последний не вводит и не очищает пароль. `t02-large-positive` теперь начинает именно с него: до запуска parent поле должно пройти host-проверки пустоты и нового ввода.

Parent-flows `t02-b10-start`, `t02-b10-read-check`, `t02-large-password-negative` передают свои параметры дочерним сами. `t02-trial-roundtrip` и `t02-large-positive` требуют `NAME`; `t02-return-source-large` и `t02-resume-source` — `CURRENT_PROFILE`; `t02-target-transfer` — `FILE_NAME` и `NAME`; `t02-switch-export` — `CURRENT_PROFILE` и `TARGET_PROFILE`. `t02-target-baseline` не требует переменных и предназначен только для настоящего первого входа независимого target. Каждый flow имеет собственное предусловие ниже. `600000` мс в ожидании KDF/большого чтения — верхняя граница ожидания теста, не измеренная производительность.

Явных `testID` новых Backup-компонентов нет. Проверенные в B10/trial локаторы: `Профиль и настройки`, `Данные и копии`, `Проверить копию`, `Я сохранил файл`, `Восстановить в новый профиль`, `Название нового профиля`, `Подготовить восстановление в новый профиль`, `Подтвердить создание профиля из копии`, `Текущий профиль: <имя>. Открыть профили`. На английском DocumentsUI подтверждён путь `Show roots` → `Downloads` → точное имя файла, без отдельного `Select`. Используются доступные подписи и экранированные значения, не старые координаты.

Парольные подписи из кода/YAML: `Новый пароль копии`, `Повтор пароля копии`, `Пароль для восстановления`, `Открыть защищённую копию`, `Отмена ввода пароля`. Открытие большого файла с правильным паролем прошло; создание нового профиля остановлено ошибкой native-хранилища. `tourId` не считается Maestro resource-id. Все `takeScreenshot` в актуальных parent-flows имеют относительные имена; каталог задаёт CLI. Два одновременно открытых маршрута picker могут создать одинаковые кнопки, поэтому сценарий использует один маршрут за раз.

## T02-B10-01 — подготовка, подтверждение и точный файл

**Режим:** default, 5560. **Начало:** главный экран A04, отдельный `Личный` сохранён. **Результат:** pass по фактическим логам, включая отдельные отметки; ранние ошибки тестовой обвязки сохранены.

1. `t02-b10-start` открывает данные A04, экспортирует обычный JSON через Sharesheet и заканчивает новым `SUCCESS` приёмника. Host pull и A04 oracle обязательны до продолжения: получены 2 191 байт.
2. Подготовить в Downloads точные байты этого экспорта под именем `t02-small-latest.json` и вариант `t02-same-state-pretty.json`. До UI-проверки доказать полное JSON-равенство и различие SHA/размеров; это сделано в `same-state-file-oracle.json`.
3. `t02-confirm-saved` начинается в receiver `SUCCESS`. Закрывает приёмник, проверяет дату подготовки, `Сохранение файла ещё не подтверждено вами.` и `Чтение этой копии ещё не проверено.`. Нажимает `Я сохранил файл`: сохранение подтверждено, чтение ещё не проверено.
4. `t02-b10-read-check` начинается в данных после ручного подтверждения. Читает pretty-файл: состав 3/3/1, сообщение `Файл читается, но это другая копия. Отметка о последнем экспорте не изменена.`, последнее чтение непроверено.
5. Тот же parent читает exact-файл: тот же состав, `Последняя подготовленная копия проверена чтением.`, статус `Эта копия успешно проверена чтением.`. Ручная отметка сохранения сохраняется; кнопки замены текущего учёта нет. Новый профиль здесь не создаётся.

Команды воспроизведения на подготовленном текущем APK; между первой и второй — host pull/oracle и подготовка двух файлов:

```sh
maestro --device emulator-5560 test --test-output-dir test-artifacts/t02-native/rerun-b10-start --debug-output test-artifacts/t02-native/rerun-b10-start tests/mobile/default/recovery/t02-b10-start.yaml
maestro --device emulator-5560 test --test-output-dir test-artifacts/t02-native/rerun-b10-confirm --debug-output test-artifacts/t02-native/rerun-b10-confirm -e 'DATE_LABEL=15 октября' tests/mobile/default/recovery/t02-confirm-saved.yaml
maestro --device emulator-5560 test --test-output-dir test-artifacts/t02-native/rerun-b10-read --debug-output test-artifacts/t02-native/rerun-b10-read tests/mobile/default/recovery/t02-b10-read-check.yaml
```

**Повтор:** сначала вернуться на главный экран A04, сделать новый экспорт и пересоздать exact/pretty пару именно из него. Не использовать другой последний export между шагами. Не приписывать этому прогону проверку двух парольных файлов E0/E1 или отмену Sharesheet: они не входят в фактически выполненный B10-маршрут.

## T02-B10-02 — подтверждённый trial и перезапуск

**Режим:** default, 5560. **Начало:** завершён B10-read-check, выбран exact малый файл, форма нового профиля закрыта. **Результат:** pass, включая полный actual export после перезапуска.

`t02-trial-roundtrip` открывает новую форму, вводит отсутствующее `NAME`, показывает заголовок `Создать профиль «<NAME>» из копии?` и состав 3 операции / 3 счёта / 1 цель. Только `Подтвердить создание профиля из копии` создаёт и активирует новый профиль. Затем flow выполняет stop/launch без очистки, проверяет тот же активный профиль, карту 9 300,00 RUB, наличные 0,00 RUB, накопления 1 000,00 RUB и все три именованные операции A04. Заканчивается реальным экспортом малого JSON и новым `SUCCESS`; host oracle подтвердил весь A04, не только показанные суммы.

```sh
maestro --device emulator-5560 test --test-output-dir test-artifacts/t02-native/rerun-trial --debug-output test-artifacts/t02-native/rerun-trial -e NAME=T02-20261015-Trial-02 tests/mobile/default/recovery/t02-trial-roundtrip.yaml
```

В фактическом первом запуске использовано `NAME=T02-20261015-Trial`; при повторе нужно новое отсутствующее имя, указанное здесь с `-02`. Не заменять существующую пробу. Сценарий не нажимает отмену создания профиля; проверку такой отмены не засчитывать. После `SUCCESS` выполнить pull и малый oracle, **не закрывать приёмник**, если дальше запускается parent следующего этапа.

## T02-A03-01 — отмена выбора пароля, отказ и исходный oracle

**Режим:** default, 5560. **Начало:** receiver `SUCCESS` от малого trial; host уже проверил этот экспорт, `CURRENT_PROFILE` — фактическое имя trial. В Downloads лежит manifest-файл `t02-large.ladbackup`. **Статус:** pass: отмена, повторный выбор, неверный пароль и полный исходный JSON проверены до положительной ветки (`large-negative.log`, `after-negative-oracle.log`). Получено 2 191 байт, SHA-256 `4eb02ccaf79413515d63de172ebc56a0ec4704c05c60af30ef69b7e53a09ba5c`.

```sh
maestro --device emulator-5560 test --test-output-dir test-artifacts/t02-native/rerun-large-negative --debug-output test-artifacts/t02-native/rerun-large-negative -e CURRENT_PROFILE=T02-20261015-Trial tests/mobile/default/recovery/t02-return-source-large.yaml
```

1. Parent закрывает приёмник/окно trial, выбирает сохранённый A04 и открывает данные. Затем вызывает `t02-large-password-negative`.
2. Через `Восстановить из файла` выбирается большой файл. До ввода пароля нажимается `Отмена ввода пароля`; поле исчезает. Это отмена выбранного парольного файла, не отмена системного picker после неверного пароля.
3. Файл выбирается заново. Вводится `T02-wrong-password`, выполняется открытие и явное ожидание `Пароль неверный или файл повреждён. Данные не изменены.`. Кнопки `Заменить данные этой копией` нет.
4. **Без успешного открытия/восстановления большого файла** экспортируется текущий A04. Flow заканчивается receiver `SUCCESS`; host pull и полный A04 oracle должны доказать отсутствие изменений до положительной ветки.
5. Выбранный зашифрованный файл остаётся в форме. Не закрывать окно данных и не выбирать файл заново после этого oracle: следующий parent должен проверить retry той же selection.

**Повтор:** возвращаться к явно известному начальному экрану и фактическому имени trial; дочерний negative можно вызвать напрямую только из данных A04 без старой открытой selection. При ошибке ждать её результат, не запускать положительную ветку параллельно. Изменение контрольной отметки из-за экспорта допустимо, финансового JSON — нет.

## T02-A03-02 — retry того же файла, новый большой профиль, открытый экспорт

**Режим:** default, 5560. **Начало подготовки:** неизменный A04 доказан host oracle отрицательной ветки, прежняя encrypted-selection сохранена; приёмник может ещё быть открыт. **Статус на прежней APK `4a9…35e0f`:** первая попытка — FAIL тестового ввода; guarded retry успешно расшифровал файл, затем создание профиля завершилось реальным SQLITE_FULL. В той попытке восстановление/restart/export не прошли. Отдельное успешное продолжение на исправленной APK описано ниже.

Первая попытка с KDF от 17:37:54.251+04:00 15.10.2026 сохранена в `large-positive.log`: ожидаемый Notice не появился, произошёл отказ пароля. По наблюдению контроллера переменная содержала 18 ASCII-символов, но скрытое поле после центрального tap/обычного erase показывало **22 маскирующих символа**. Ввод сохранил четыре лишних символа; их точное содержимое неизвестно. Объяснение положением caret следует из UI-событий, не из чтения пароля. Это ошибка тестового ввода: приложение получило строку, отличавшуюся от заданного пароля. Криптографический отказ такого ввода не доказывает дефект приложения. Исходный FAIL не перезаписывать успешным повтором.

Выполненный retry использовал следующие проверяемые этапы **без повторного выбора файла**. Сейчас устройство уже на pending-recovery экране: эти команды не следует повторять до исправления и отдельного определения предусловий продолжения.

1. `t02-password-focus` при необходимости закрывает приёмник и фокусирует прежнее поле. Контроллер явно переводит caret в конец через Android `KEYCODE_MOVE_END`, затем `t02-password-clear` удаляет 50 символов и скрывает клавиатуру. Это Android-подготовка только выбранного тестового AVD.

```sh
maestro --device emulator-5560 test --test-output-dir test-artifacts/t02-native/retry-password-focus --debug-output test-artifacts/t02-native/retry-password-focus tests/mobile/default/recovery/t02-password-focus.yaml
adb -s emulator-5560 shell input keyevent KEYCODE_MOVE_END
maestro --device emulator-5560 test --test-output-dir test-artifacts/t02-native/retry-password-clear --debug-output test-artifacts/t02-native/retry-password-clear tests/mobile/default/recovery/t02-password-clear.yaml
adb -s emulator-5560 shell uiautomator dump /sdcard/t02-password-empty.xml
adb -s emulator-5560 pull /sdcard/t02-password-empty.xml test-artifacts/t02-native/retry-password-empty.xml
python3 -c 'import sys,xml.etree.ElementTree as E; n=[v for v in E.parse(sys.argv[1]).iter("node") if v.get("content-desc")=="Пароль для восстановления" and v.get("class")=="android.widget.EditText"]; assert len(n)==1 and n[0].get("text")==""; print("passed-empty-password-field")' test-artifacts/t02-native/retry-password-empty.xml
```

2. Обязательная граница: в UIAutomator XML ровно одно нужное поле с `content-desc="Пароль для восстановления"`, его `text` **строго пуст**. Нельзя считать отсутствие видимых bullet на снимке достаточным. В текущей попытке эта граница уже пройдена: `password-empty.xml`, `password-empty-guard.json`, длина 0. Команды выше показывают отдельные имена артефактов для повторного запуска, не перезаписывают первое доказательство.
3. Только после пустого guard выполнить `t02-password-fill` с публичным тестовым паролем. Затем снять новый XML и проверить **ровно 18 U+2022** в том же поле. Не выводить содержимое secure-поля в лог. На момент обновления fill выполнен, результат guard 18 символов ещё не подтверждён.

```sh
maestro --device emulator-5560 test --test-output-dir test-artifacts/t02-native/retry-password-fill --debug-output test-artifacts/t02-native/retry-password-fill -e PASSWORD=T02-synthetic-2026 tests/mobile/default/recovery/t02-password-fill.yaml
adb -s emulator-5560 shell uiautomator dump /sdcard/t02-password-filled.xml
adb -s emulator-5560 pull /sdcard/t02-password-filled.xml test-artifacts/t02-native/retry-password-filled.xml
python3 -c 'import sys,xml.etree.ElementTree as E; n=[v for v in E.parse(sys.argv[1]).iter("node") if v.get("content-desc")=="Пароль для восстановления" and v.get("class")=="android.widget.EditText"]; assert len(n)==1 and n[0].get("text")=="\u2022"*18; print("passed-18-masked-password-characters")' test-artifacts/t02-native/retry-password-filled.xml
```

Маскирующая длина сама по себе не доказывает текст пароля; она дополняет проверенное пустое поле и последующий ввод известной строки. Если любая граница не прошла, KDF не запускать, заново выполнить focus→MOVE_END→clear и guard. Selection сохраняется; закрытие окна данных или повторный picker отменили бы смысл same-selection retry.

4. После обоих guard запустить обновлённый parent. Он **не закрывает приёмник и не вводит пароль**:

```sh
maestro --device emulator-5560 test --test-output-dir test-artifacts/t02-native/rerun-large-positive --debug-output test-artifacts/t02-native/rerun-large-positive -e NAME=T02-20261015-Large tests/mobile/default/recovery/t02-large-positive.yaml
```

`t02-unlock-entered-password` нажимает открытие один раз, сначала ждёт видимый `Проверка пароля…`, затем его исчезновение, отдельно проверяет отсутствие ошибки и явный Notice `Большая копия проверена. Для сохранности исходного учёта восстановите её в новый профиль.`. Исчезновение кнопки или завершение busy само по себе не является успехом. Кнопка замены текущего учёта отсутствует.

5. Создаётся отсутствующий `NAME` через отдельное подтверждение состава **9 997 / 3 / 0**. После stop/launch активен новый профиль: карта **9 997 000,00 RUB**, наличные/накопления **0,00 RUB**; пустой учёт не подставляется.
6. Parent открывает данные большого профиля и делает настоящий открытый экспорт, заканчивая receiver `SUCCESS`. Host выполняет pull и `t02-fixtures.ts verify <file> none`. Обязательны полный актуальный снимок >5 млн, точный исходник, `a03-later` и отсутствие первых четырёх ID.

**Повтор:** до создания профиля допускается продолжать ту же selection через staged очистку/ввод и новые артефакты; после создания нужен новый отсутствующий `NAME` и заново подготовленный сценарий. Для нового выбора файла, например на чистом target, `t02-unlock-password` предназначен **только для изначально пустого поля**: он вводит пароль без erase и вызывает тот же `t02-unlock-entered-password`. Его нельзя применять к старому значению. Тест не редактирует большой профиль через UI: он доказывает сохранность изменения, уже представленного актуальным разделом входного архива.

### Реальный исход guarded retry и граница продолжения

`password-empty-guard.json` подтвердил длину 0, `password-filled-guard.json` — ровно 18 U+2022 после известного ASCII-ввода. Нажатие открытия завершено `17:53:36.597 +04:00`, busy исчез `17:59:43.611`: **367,014 с**, единичный UI-интервал, не isolated KDF/benchmark. Явный Notice большого импорта, отсутствие ошибки и отсутствие замены прошли. Подтверждение создания 9 997 / 3 / 0 нажато в `18:00:39.181`.

Вместо активации появился экран «Восстановление не завершено…» с pending journal. Read-only `dumpsys dbinfo app.lad.finance` сохранил точный отказ `INSERT OR REPLACE INTO catalystLocalStorage VALUES (?, ?)` в `18:01:42.511`: **database or disk is full (code 13 SQLITE_FULL)**, 181 мс. Следующий rollback сообщает отсутствие активной транзакции. `/data` имел 8,8 GiB свободного места; `RKStorage` после отказа — 40 960 байт. Это подтверждённый дефект native storage, отдельно от прежней ошибки ввода теста.

Доказательства в `test-artifacts/t02-native/`: `large-positive-retry.log` и debug, `large-create-dbinfo-20261015-2024.txt`, `large-create-device-disk-20261015-2025.txt`, `large-create-failure-manifest.json`, снимки `large-create-observation.png` / `large-create-current-20261015-2022.png`. Последний read-only осмотр в 20:22 подтвердил тот же PID 20645 и pending-recovery экран. После обнаружения приложение/AVD не перезапускались, journal не откатывался, KDF не повторялся. На этом этапе повторное восстановление, большой экспорт и перенос ещё не выполнялись. После исправления выполнены отдельные шаги, описанные ниже; прежние FAIL-артефакты сохранены.

### UI-resume после исправления (pass)

После готового review/build, нового manifest и установки исправленной APK через `install -r` исходный pending journal сохраняется. Вход не откатывается и не заменяется новым восстановлением. Для продолжения допускается точный открытый v2 из того же набора: host-проверка `resume-candidate-equivalence.json` уже доказала строгую эквивалентность полного `candidate.identity`, исходного текста, текущего текста и state с ранее успешно расшифрованным защищённым файлом. Защита каждого файла отдельно проверена как `none` / `password`. Это продолжение native-записи через открытый файл, а не повтор защищённого чтения новой APK.

Успешно завершён [t02-resume-pending-large.yaml](../default/recovery/t02-resume-pending-large.yaml). Исправленная APK и fixture SHA `d4ee9fe7582afe7b55f6fb3882245bac0dffa3dc536a9543ffde51c5d85a3aca` проверены на устройстве. Перед установкой прежний процесс QEMU уже отсутствовал по неизвестной причине; тот же сохранённый диск поднят без wipe/snapshot. Первый assert подтвердил прежний pending journal, отдельный assert — неизменённое имя. Системный file picker индексирован только для данного синтетического файла. Артефакты установки/окружения/прогона — `test-artifacts/t02-native/file-storage-fix/`.

```sh
maestro --device emulator-5560 test -e FILE_NAME=t02-large.ladrescue -e NAME=T02-20261015-Large --debug-output test-artifacts/t02-native/file-storage-fix/resume-pending-debug tests/mobile/default/recovery/t02-resume-pending-large.yaml
```

Flow использует предусмотренное восстановление из pending-экрана, проверяет уже заполненное прежнее имя без его редактирования, состав 9 997 / 3 / 0 и отдельное подтверждение. Затем обязательны активация, stop/launch без очистки, все остатки и actual plain export с новым receiver `SUCCESS`. Только после host pull и `t02-fixtures.ts verify <file> none` этот этап может считаться пройденным. При несовпадении имени или identity остановиться с диагностикой; не создавать новый journal, не ослаблять проверку и не менять исходник. Фактический результат: resume/активация/restart/все остатки и полный actual plain oracle прошли; файл 10 138 489 байт, SHA `351eb266877a8b3b44c063fe5b48a278f71f10aeb74ea4a9cb62021fbf160d49`, protection `none`, полный state SHA `4eb80d95737ebb9ba49d63bf10fa2e2fa8acd63eb10f58df89e7ec7cd551c9df`. Артефакты `file-storage-fix/resume-pending.log`, `source-plain-pull.json`, `source-plain-oracle.log`. Actual защищённый экспорт исправленной APK впоследствии прошёл полный oracle. Его полный перенос на чистый target не завершён и отложен по указанию пользователя.

## T02-A03-03 — защищённый actual export и независимый получатель

**Режим:** default. Источник — 5560, независимый получатель — чистый `Lad_T02_Transfer_Test` / 5562. На обоих установлен проверенный APK `b5683e98e9f6e9307e449fce5a2ded6bc73e4747a577f141981447fcba906068`. **Статус:** source plain/password и source/control полные oracle прошли; target установлен, baseline и старт защищённого чтения подтверждены, результат переноса **deferred by user**. Шаги 6–8 в текущей сессии не выполняются.

Следующая последовательность — воспроизводимый протокол для будущего разрешённого прогона, не инструкция продолжать текущую сессию. Выполнять этапы последовательно, каждый после своего oracle. Одновременно работает один AVD. Ни один шаг не предполагает сохранение receiver Activity после остановки AVD.

1. После большого plain oracle запустить `t02-source-protected-export.yaml` с `PASSWORD=T02-synthetic-2026` из receiver SUCCESS. Получить свежий файл через receiver, выгрузить и выполнить `t02-fixtures.ts verify <file> password`. Только явно проверенный `protection=password` доказывает защищённую ветку. В текущем прогоне два 600-секундных ожидания завершились timeout при busy; без повторного export/KDF выполнено редкое наблюдение и `t02-receive-existing-export`. Actual файл 10 138 656 байт / SHA `3232c265c5f4a379c9327f142587e7d991738076ba8c87032d82220465bfeff5` прошёл полный source/current oracle (`file-storage-fix/source-password-oracle.log`).
2. **До остановки source** выполнить `t02-switch-export` Large → A04, полный A04 oracle, затем A04 → «Личный», полный контрольный oracle. Команды:

```sh
maestro --device emulator-5560 test -e CURRENT_PROFILE=T02-20261015-Large -e TARGET_PROFILE=A04-20261015-Android tests/mobile/default/recovery/t02-switch-export.yaml
node tests/mobile/support/share-receiver/pull.mjs emulator-5560 test-artifacts/t02-native/source-final-received
node --import tsx tests/mobile/fixtures/a04-fixtures.ts verify ПУТЬ_ИЗ_ПОЛЯ_file
maestro --device emulator-5560 test -e CURRENT_PROFILE=A04-20261015-Android -e TARGET_PROFILE=Личный tests/mobile/default/recovery/t02-switch-export.yaml
node tests/mobile/support/share-receiver/pull.mjs emulator-5560 test-artifacts/t02-native/control-final-received
```

Контроль — встроенный `personal` текущего 5560, baseline `avd-replacement/control-restored/received-1792069464386-eb28ef91.json`, 2 404 байта / SHA `07fa687e130896bd21119e656885627facc6ef31ea3d8464a064952c79e79d91`. Его происхождение из A05-offline отдельно проверено `avd-replacement/control-oracle.json`. Старый «Личный» с 5556 размером 2 475 байт не является этим baseline. Оба текущих oracle прошли (`file-storage-fix/source-final-oracle.log`, `control-final-oracle.json`). Затем `t02-return-a04.yaml` проверяет наличие Large/Trial и оставляет A04 активным; текущий flow прошёл.

3. Проверить сохранённые host-байты и receipt, штатно остановить **только** source5560 без wipe. Поднять чистый target5562 с собственными userdata. До первого старта в каталоге только config.ini, что фиксирует `transfer-target/preboot-isolation.json`; userdata/ключи не копируются. Установить тот же APK и receiver, проверить installed SHA. Передать **единственный actual password-файл** в Downloads как `t02-source-actual.ladbackup`, проверить SHA на устройстве. В текущем прогоне это подтверждено `transfer-target/installation-and-transfer.json`; дата 15 октября, Europe/Samara, сеть target временно выключена.
4. `t02-target-baseline.yaml` проходит настоящее приветствие, настраивает нулевой личный учёт и сохраняет его actual JSON через receiver. Сохранить полный baseline target **до** импорта. Он не подменяется контролем source.

```sh
maestro --device emulator-5562 test --test-output-dir test-artifacts/t02-native/transfer-target/baseline-output --debug-output test-artifacts/t02-native/transfer-target/baseline-debug tests/mobile/default/recovery/t02-target-baseline.yaml
node tests/mobile/support/share-receiver/pull.mjs emulator-5562 test-artifacts/t02-native/transfer-target/baseline-received
```

Фактический baseline target: 1 572 байта / SHA `2bbe04191a314fad0f0db7815822ffb65cd3db4f3a6ff8dab3aa036e98c080e7`, `transfer-target/baseline-oracle.json`; три нулевых счёта, 0 операций/целей.

5. После baseline использовать **один выбранный раздельный маршрут**, чтобы не опрашивать hierarchy непрерывно во время KDF. `t02-target-password-input.yaml` закрывает receiver, выбирает actual файл, заполняет свежий пароль и останавливается **до submit**. Контроллер снимает XML и проверяет ровно 18 U+2022 в `EditText` с `content-desc="Пароль для восстановления"`. При несовпадении ничего не отправлять; сохранить ошибку ввода и выполнить отдельную очистку/проверку. Затем `t02-start-entered-password.yaml` нажимает открытие **один раз**, подтверждает busy и заканчивается. Дальше — редкие read-only снимки; никакого повторного выбора, submit или restart.

```sh
maestro --device emulator-5562 test -e FILE_NAME=t02-source-actual.ladbackup -e PASSWORD=T02-synthetic-2026 tests/mobile/default/recovery/t02-target-password-input.yaml
# Здесь обязательный host XML guard: длина18, каждый символ U+2022.
maestro --device emulator-5562 test tests/mobile/default/recovery/t02-start-entered-password.yaml
```

В текущем прогоне guard длины 18 прошёл до submit; единственное нажатие завершилось в `21:52:45.520 +04:00`, busy подтверждён в `21:52:45.725`. Maestro завершён. Последнее редкое наблюдение `transfer-target/password-observation-03.png/.json` в `22:00:19.993` всё ещё показывало busy без ошибки. Дальнейшие наблюдения запрещены пользователем; исход операции неизвестен.

6. **Не выполнено; deferred by user.** Лишь после наблюдаемого результата чтения выполнить `t02-target-after-open.yaml` с `NAME=T02-20261015-Transfer`. Он требует явный Notice «Большая копия проверена…», отсутствие ошибки/замены текущего учёта, отдельное подтверждение нового профиля с составом 9 997/3/0. Затем stop/launch без очистки, сохранённый badge, все остатки **9 997 000,00 / 0,00 / 0,00 RUB**, actual **открытый** export и свежий SUCCESS. Выгрузить и проверить весь state и точный source с режимом `none`:

```sh
maestro --device emulator-5562 test -e NAME=T02-20261015-Transfer tests/mobile/default/recovery/t02-target-after-open.yaml
node tests/mobile/support/share-receiver/pull.mjs emulator-5562 test-artifacts/t02-native/transfer-target/received
node --import tsx tests/mobile/fixtures/t02-fixtures.ts verify ПУТЬ_ИЗ_ПОЛЯ_file none
```

Составной `t02-target-transfer.yaml` сохранён как **альтернатива**, объединяющая этапы5–6; его нельзя запускать после раздельных этапов. В текущем прогоне выбран раздельный маршрут. Busy/его исчезновение сами по себе не означают успех.

7. **Не выполнено; deferred by user.** После target full oracle выполнить `t02-switch-export` Transfer → «Личный». Сравнить новый полный JSON со свежим baseline target из шага4.

```sh
maestro --device emulator-5562 test -e CURRENT_PROFILE=T02-20261015-Transfer -e TARGET_PROFILE=Личный tests/mobile/default/recovery/t02-switch-export.yaml
node tests/mobile/support/share-receiver/pull.mjs emulator-5562 test-artifacts/t02-native/transfer-target/control-final
```

8. **Не выполнено; deferred by user.** После сохранения всех target-артефактов штатно остановить только5562 без wipe. Cold start прежнего source5560; `t02-final-source.yaml` должен открыть сохранённый A04, проверить три остатка и снять экран. Включить ранее временно выключенные Wi-Fi/mobile именно source; записать фактическую сеть/дату. Оставить одно видимое окно Лада на5560, target остановлен. Автоматические курсы в source-фикстуре остаются выключенными.

**Повтор:** новые каталоги артефактов, новый actual export и отсутствующее имя профиля. Заполненный target подтверждает новую запись в существующей установке; для утверждения о чистой установке нужна отдельная userdata. Не запускать папку flows целиком. CLI output/debug каждого фактического запуска сохраняются вне `test-results`; точные пути перечислены в отчёте.

## Что уже наблюдалось и что остаётся

| Проверка                                                            | Статус и доказательство на момент обновления                                                                                     |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Окончательный APK на 5560                                           | Исправленная APK: `file-storage-fix/installed-apk-sha.txt`, SHA `b568…906068`; manifest 346 файлов совпал                        |
| Малый источник и контроль на новом стенде                           | Полные actual export oracle пройдены: `avd-replacement/source-oracle.log`, `control-oracle.json`                                 |
| Подготовка / ручное сохранение / чтение                             | Pass: команды подтверждения завершились в `b10-statuses.log`; затем successful `b10-read-check.log`                              |
| Другая сериализация того же JSON / exact export                     | Pass: `same-state-file-oracle.json`, `b10-read-check.log`, относительные снимки                                                  |
| Trial, перезапуск, полный actual JSON                               | Pass: `trial-roundtrip.log`, `trial-oracle.log`, свежий receipt в `trial-roundtrip/`                                             |
| Большая отмена / неверный пароль / source oracle до успеха          | Pass: `large-negative.log`, `after-negative-pull.json`, `after-negative-oracle.log`; до любого успешного большого восстановления |
| Same-selection retry, большой restart, actual plain/password export | Прежняя APK: SQLITE_FULL; исправленная: same-journal resume/restart/actual plain и password full oracle pass                     |
| Перенос actual password-файла на независимый 5562                   | Partial / deferred by user: тот же APK, baseline и переданный SHA проверены, исход чтения после последнего busy неизвестен       |
| Финальный полный source/control oracle и видимое окно с сетью       | Source/control full pass; заключительный возврат source/visible/network не выполнен по указанию пользователя                     |

Все пути доказательств в таблице относительны `test-artifacts/t02-native/`. Первые попытки B10 содержат ошибки обвязки: абсолютный путь `takeScreenshot` и перекрывающие parent-параметры defaults дочерних flows. Они не скрываются: актуальные YAML используют относительные снимки и явные параметры, успешный повтор находится в отдельном логе. Такие ошибки не доказывают дефект приложения. Таблицу обновляет основной исполнитель только после фактического результата; продолжение работающего теста нельзя заранее отметить pass.

Финансовый oracle подтверждает весь учёт; UI — видимые статусы, подтверждения и суммы; receiver — получение новых полных байтов. Успешная навигация без host oracle недостаточна. Один AVD/trial не является независимым переносом; будущий перенос 5560→5562 требует actual source-файла и нового target-экспорта после перезапуска. Даже успешные два AVD не подтверждают физические iOS/Android, аппаратную биометрию, потерю SecureStore, прерывание записи или все внешние файловые провайдеры. Системные A01/B09, отмена Sharesheet и UI-редактирование большого профиля этим планом не закрываются.
