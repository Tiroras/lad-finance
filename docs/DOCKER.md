# Переносимое окружение через Docker

Окружение рассчитано на macOS, Windows и Linux. Docker устанавливает Node.js из версии проекта, npm-зависимости из lock-файла, Chromium для Playwright, Java, Android SDK/NDK и Maestro CLI/MCP. Android-эмулятор работает на компьютере и подключается к контейнеру через локальный ADB.

Контейнеры собирают Android APK и выполняют мобильные тесты. iOS Simulator и сборка IPA требуют macOS и Xcode; экспорт JavaScript и ресурсов iOS доступен в контейнере.

## Первый запуск на новом компьютере

1. Установите Docker Desktop с Linux-контейнерами. На Linux также подходит Docker Engine с плагином Compose.
2. Для мобильных проверок установите Android Studio, SDK Platform-Tools и Android Emulator. В Device Manager создайте виртуальный телефон, например Pixel_8, с образом для архитектуры компьютера и запустите его.
3. В Docker Desktop включите **Settings → Resources → Network → Enable host networking → Apply & restart**. Нужна версия Docker Desktop 4.34 или новее. При Docker Engine на Linux отдельная настройка не нужна.
4. Клонируйте репозиторий и выполните из его корня:

```sh
docker compose build android
docker compose run --rm android doctor
docker compose run --rm android
```

Последняя команда собирает актуальный APK, устанавливает его с сохранением данных и выполняет сценарии из `tests/mobile/`. Если подключено несколько эмуляторов, укажите `--device emulator-5554`, подставив идентификатор нужного устройства. Физический телефон автоматически не выбирается.

Node.js, npm, Java, Maestro и инструменты сборки Android на новом компьютере отдельно устанавливать не нужно. Первый Docker build скачивает несколько гигабайт; следующие запуски используют кэш. На Apple Silicon Android-инструменты запускаются в `linux/amd64`, поскольку Linux SDK/NDK содержат исполняемые файлы x86_64: первая нативная сборка будет медленнее, чем сборка напрямую на Mac. Web и Playwright используют архитектуру компьютера.

На Linux ARM64 для Android-контейнера нужна поддержка запуска `amd64` через QEMU/binfmt. Docker Desktop включает эмуляцию; для отдельного Docker Engine это зависит от установки. Подробности — в [документации Docker об архитектурах](https://docs.docker.com/build/building/multi-platform/).

На Windows команды выполняются в PowerShell из папки клона. Для файлов оболочки в репозитории закреплены окончания строк LF. Контейнерные `node_modules` и сгенерированный каталог `android/` находятся в отдельных томах Docker и не заменяют одноимённые каталоги на компьютере.

В конфигурации уже предусмотрены IPv4 для локального ADB и Java, UTF-8 для русских текстов и получение имени AVD через Android `getprop`. Это позволяет Maestro обнаруживать телефон без доступа к консоли эмулятора и её локальному файлу авторизации. Остальные команды ADB передаются инструменту Android SDK без изменений. Пустой том Android инициализируется автоматически; последующие `prebuild` используют `--no-clean`, необходимый с поведением Expo SDK 57.

## Мобильные команды и три режима

| Команда                                                        | Результат                                                       |
| -------------------------------------------------------------- | --------------------------------------------------------------- |
| `docker compose run --rm android`                              | Дефолтная release-сборка, установка и Maestro                   |
| `docker compose run --rm android test --mode demo`             | Release-сборка с доступным профилем «Демо», установка и Maestro |
| `docker compose run --rm android test --mode fresh`            | Debug-сборка с очисткой, отдельный Metro и Maestro              |
| `docker compose run --rm android test --no-build`              | Повторная проверка установленной release-сборки                 |
| `docker compose run --rm android build`                        | Только APK, без подключения к эмулятору                         |
| `docker compose run --rm android build --mode demo`            | Только APK с демоопцией                                         |
| `docker compose run --rm android build --mode fresh`           | Debug-APK; для запуска нужен Metro с опцией Fresh               |
| `docker compose run --rm android test tests/mobile/smoke.yaml` | Сборка и один выбранный сценарий                                |
| `docker compose run --rm android doctor`                       | Проверка ADB и готовности Android                               |

Демо включает отдельный профиль с примерами; сценарий должен сам выбрать «Демо», если проверяет эти данные. Текущий smoke проверяет навигацию и не переключает профиль.

**Fresh удаляет локальные данные всех профилей «Лада» на выбранном эмуляторе при новом запуске JS или полном Reload.** Для него используйте отдельное виртуальное устройство с тестовыми данными. Контейнер запускает собственный Metro на порту 8095, настраивает ADB reverse и убирает своё перенаправление после теста. Metro работает в headless-режиме Expo без установки графической оболочки React Native DevTools. Если порт занят, команда завершается с объяснением; можно указать `--port 8096`. Работающий чужой сервер не останавливается.

`--no-build` не меняет режим установленного APK и не собирает изменения исходников. Для Fresh используйте полный запуск: ему нужен сервер разработки. Смена режима через `--mode` всегда сопровождается сборкой.

APK сохраняются в `test-results/mobile/docker/app-default.apk`, `app-demo.apk` или `app-fresh.apk`. Там же находятся артефакты Maestro. При отдельной сборке APK включает arm64 и x86_64; при тестовом запуске собирается архитектура выбранного эмулятора. Её можно указать явно через `--abi arm64-v8a`.

## Web и остальные проверки

Для этих команд Android Studio и эмулятор не требуются:

```sh
docker compose up --build web
docker compose up --build demo
docker compose up --build fresh
```

Адреса: дефолтный режим — <http://localhost:8081>, демо — <http://localhost:8082>, Fresh — <http://localhost:8083>. Разные порты дают отдельные браузерные хранилища. Остановить запущенный предпросмотр можно через `Ctrl+C`.

```sh
docker compose build web
docker compose run --rm tools npm run typecheck
docker compose run --rm tools npm test
docker compose run --rm tools npm run test:e2e
docker compose run --rm tools npx expo install --check
docker compose run --rm tools npm run build -- --max-workers 2
```

Playwright сам поднимает изолированные серверы для дефолтного, демо- и Fresh-режимов. Отчёты и экспорт записываются в обычные игнорируемые `test-results/`, `playwright-report/` и `dist/` проекта. В контейнерах выключена автоматическая загрузка `.env*`: режимы задают Compose и команда мобильного запуска.

## Maestro MCP из контейнера

После сборки Android-образа MCP запускается той же конфигурацией Compose. В настройках Codex добавьте сервер со следующими параметрами, указав абсолютный путь к клону в `cwd`:

```toml
[mcp_servers.maestro_docker]
command = "docker"
args = ["compose", "run", "--rm", "--no-deps", "-T", "maestro-mcp"]
cwd = "/абсолютный/путь/к/Ладу"
startup_timeout_sec = 60
tool_timeout_sec = 180
```

В Windows для `cwd` можно использовать путь вида `C:/Projects/Lad`. Если Docker не найден из IDE, укажите полный путь к Docker CLI в `command`. На одном компьютере используйте одно активное подключение Maestro: локальное или контейнерное. После изменения перезапустите расширение Codex.

Сначала попросите агента получить список устройств через Maestro MCP, затем выбрать Android-эмулятор. Пути к сценариям внутри контейнера начинаются с `/workspace`, например `/workspace/tests/mobile/smoke.yaml`. APK нужно подготовить командой мобильного запуска до проверки интерфейса. Контейнер не запускает AVD на компьютере: это делает Android Studio. На macOS/Linux также можно использовать существующую локальную команду `npm run emulator`, если установлен Node.js.

Не запускайте обычные тесты и MCP-действия одновременно на одном виртуальном телефоне. Существующее локальное подключение Maestro при добавлении файлов Docker автоматически не изменяется.

## Кэш и обновления

Исходники подключаются из клона репозитория. npm-зависимости, кэши Expo, Gradle и Maestro и сгенерированный Android-проект сохраняются в томах Docker. При изменении `package.json` или `package-lock.json` контейнер обновляет свои зависимости через `npm ci`; после обновления Playwright пересоберите web-образ, чтобы версия браузера соответствовала пакету. Gradle учитывает режим приложения при проверке кэша: переключение дефолтного и деморежима пересобирает JavaScript.

```sh
docker compose build web android
docker compose down
```

Обычный `down` сохраняет кэши. `docker compose down --volumes` удаляет тома этого Compose-проекта, включая Android-проект и кэш сборки; на следующем запуске они создадутся заново. Данные приложения хранятся на эмуляторе и этой командой не удаляются. На Linux контейнерные команды работают от root, поэтому созданным ими отчётам и APK при необходимости нужно вернуть владельца пользователя; исходники редактируйте в IDE на компьютере.

Версия Node.js закреплена в Dockerfile и проверяется по `.nvmrc` при сборке. Java — 17, Android platform — 36, build-tools — 36.0.0 и 35.0.0 для зависимостей, NDK — 27.1.12297006, Maestro — 2.11.0; архивы command-line tools и Maestro проверяются по контрольным суммам. При смене Expo SDK сверяйте этот набор с требованиями нового SDK.

Источники: [аппаратное ускорение Android Emulator](https://developer.android.com/studio/run/emulator-acceleration), [host networking Docker](https://docs.docker.com/engine/network/drivers/host/), [Playwright в Docker](https://playwright.dev/docs/docker), [Maestro MCP](https://docs.maestro.dev/get-started/maestro-mcp), [настройки MCP в Codex](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).
