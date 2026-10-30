# Иллюстрации к главам 1–2

Комплект включает 18 иллюстраций: десять UI-макетов и восемь диаграмм. Редактируемые источники отделены от готовых SVG и PNG. Растровые изображения получают из соответствующих SVG; геометрию связей вручную не исправляют.

**Имена файлов — идентификаторы ресурсов (asset ID), а не печатные номера рисунков.** Например, `02-use-cases-ledger` соответствует рисунку 11, а `09-domain-plans` — рисунку 18. Номер для подписи в тексте указан в первом столбце.

| № рисунка | Содержание                               | Идентификатор ресурса      | Редактируемый источник                                   | Готовые изображения                                                      |
| --------- | ---------------------------------------- | -------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1         | Обзор / Операции                         | `01-ui`                    | [01-ui.py](01-ui.py)                                     | [SVG](01-ui.svg), [PNG](01-ui.png)                                       |
| 2         | Бюджеты / Цели                           | `01-ui-02-plan`            | [01-ui.py](01-ui.py)                                     | [SVG](01-ui-02-plan.svg), [PNG](01-ui-02-plan.png)                       |
| 3         | Платежи / Прогноз                        | `01-ui-03-forecast`        | [01-ui.py](01-ui.py)                                     | [SVG](01-ui-03-forecast.svg), [PNG](01-ui-03-forecast.png)               |
| 4         | Аналитика / Настройки                    | `01-ui-04-settings`        | [01-ui.py](01-ui.py)                                     | [SVG](01-ui-04-settings.svg), [PNG](01-ui-04-settings.png)               |
| 5         | Финансовые настройки / Профили           | `01-ui-05-profiles`        | [01-ui.py](01-ui.py)                                     | [SVG](01-ui-05-profiles.svg), [PNG](01-ui-05-profiles.png)               |
| 6         | Данные / Операция                        | `01-ui-06-data`            | [01-ui.py](01-ui.py)                                     | [SVG](01-ui-06-data.svg), [PNG](01-ui-06-data.png)                       |
| 7         | Счёт / Цель                              | `01-ui-07-accounts-goals`  | [01-ui.py](01-ui.py)                                     | [SVG](01-ui-07-accounts-goals.svg), [PNG](01-ui-07-accounts-goals.png)   |
| 8         | Доход / Платёж                           | `01-ui-08-income-payments` | [01-ui.py](01-ui.py)                                     | [SVG](01-ui-08-income-payments.svg), [PNG](01-ui-08-income-payments.png) |
| 9         | Покупка / Сценарий                       | `01-ui-09-scenarios`       | [01-ui.py](01-ui.py)                                     | [SVG](01-ui-09-scenarios.svg), [PNG](01-ui-09-scenarios.png)             |
| 10        | Полный список целей / Вывод из цели      | `01-ui-10-list-withdrawal` | [01-ui.py](01-ui.py)                                     | [SVG](01-ui-10-list-withdrawal.svg), [PNG](01-ui-10-list-withdrawal.png) |
| 11        | Прецеденты UC-01–UC-08                   | `02-use-cases-ledger`      | [02-use-cases-ledger.puml](02-use-cases-ledger.puml)     | [SVG](02-use-cases-ledger.svg), [PNG](02-use-cases-ledger.png)           |
| 12        | Прецеденты UC-09–UC-16                   | `03-use-cases-planning`    | [03-use-cases-planning.puml](03-use-cases-planning.puml) | [SVG](03-use-cases-planning.svg), [PNG](03-use-cases-planning.png)       |
| 13        | Логические связи данных текущего учёта   | `04-er-ledger`             | [04-er-ledger.puml](04-er-ledger.puml)                   | [SVG](04-er-ledger.svg), [PNG](04-er-ledger.png)                         |
| 14        | Логические связи планов и событий        | `05-er-plans`              | [05-er-plans.puml](05-er-plans.puml)                     | [SVG](05-er-plans.svg), [PNG](05-er-plans.png)                           |
| 15        | Дерево подсистем и модулей               | `06-structure`             | [06-structure.puml](06-structure.puml)                   | [SVG](06-structure.svg), [PNG](06-structure.png)                         |
| 16        | Изменение финансового состояния и запись | `07-data-flow`             | [07-data-flow.puml](07-data-flow.puml)                   | [SVG](07-data-flow.svg), [PNG](07-data-flow.png)                         |
| 17        | Концептуальная модель текущего учёта     | `08-domain-ledger`         | [08-domain-ledger.puml](08-domain-ledger.puml)           | [SVG](08-domain-ledger.svg), [PNG](08-domain-ledger.png)                 |
| 18        | Концептуальная модель планирования       | `09-domain-plans`          | [09-domain-plans.puml](09-domain-plans.puml)             | [SVG](09-domain-plans.svg), [PNG](09-domain-plans.png)                   |

Рисунки 1–10 — UI-макеты. Все десять SVG создаёт один скрипт `01-ui.py`. Рисунки 13–14 описывают логические связи JSON-агрегата, а не физическую SQL-схему. Рисунки 17–18 — концептуальные классы предметной области, а не утверждение об объектной иерархии реализации на TypeScript. Линии рисунка 15 обозначают состав подсистем, а не разрешённые программные импорты.

## Проверенные средства подготовки

| Средство                    | Версия, использованная при подготовке |
| --------------------------- | ------------------------------------- |
| PlantUML                    | 1.2026.1, внешний `plantuml.jar`      |
| Java                        | OpenJDK 21.0.7, JBR 21.0.7+9          |
| Graphviz для рисунков 11–12 | 16.1.0 в WebAssembly-сборке Viz.js    |
| Пакет Viz.js                | `@viz-js/viz` 3.31.0                  |
| Node.js для растеризации    | 24.19.0                               |
| Sharp                       | 0.35.4                                |
| Python для рисунков 1–10    | 3.12.14                               |
| Шрифт схем                  | Arial                                 |

Эти средства использованы как внешнее окружение подготовки документа. Они не добавлены в зависимости приложения «Лад». В частности, Node.js 24.19.0 относится к растеризации иллюстраций; версия Node.js приложения остаётся заданной его `.nvmrc`. JAR, npm-пакеты и временный Graphviz-адаптер в комплект иллюстраций не включены.

Ресурсы `02-use-cases-ledger` и `03-use-cases-planning` (рисунки 11–12) требуют внешнего Graphviz: у использованного Smetana обнаружились зазоры между линиями и овалами прецедентов. Эти две диаграммы пересозданы через Graphviz и проверены визуально. Не заменяйте этот движок на Smetana при общем повторном экспорте.

Ресурсы `04-er-ledger`, `05-er-plans`, `08-domain-ledger` и `09-domain-plans` (рисунки 13, 14, 17 и 18) задают Smetana через `!pragma layout smetana`. `06-structure` (рисунок 15) использует встроенную нотацию PlantUML `mindmap`, а `07-data-flow` (рисунок 16) — встроенную диаграмму последовательности; они не требуют внешнего `dot`, несмотря на оставленную в исходнике директиву Smetana.

## Повторная генерация SVG

Ниже используются переменные с абсолютными путями. Замените примеры своими путями; `plantuml.jar`, Java, Python, Node.js, Graphviz и Sharp должны быть доступны во внешнем окружении. Каталог `THESIS_FIGURES_DIR` должен указывать на копию этого каталога. Команды перезапишут одноимённые готовые изображения после изменения источников.

```sh
export THESIS_FIGURES_DIR="/absolute/path/to/figures"
export THESIS_PLANTUML_JAR="/absolute/path/to/plantuml.jar"
export THESIS_JAVA_BIN="/absolute/path/to/java"
export THESIS_PYTHON_BIN="/absolute/path/to/python3"
export THESIS_NODE_BIN="/absolute/path/to/node"
export THESIS_DOT_BIN="/absolute/path/to/dot"
export THESIS_SHARP_PATH="/absolute/path/to/node_modules/sharp"

"$THESIS_PYTHON_BIN" "$THESIS_FIGURES_DIR/01-ui.py"

"$THESIS_JAVA_BIN" -Djava.awt.headless=true \
  -jar "$THESIS_PLANTUML_JAR" \
  -graphvizdot "$THESIS_DOT_BIN" -tsvg \
  "$THESIS_FIGURES_DIR/02-use-cases-ledger.puml" \
  "$THESIS_FIGURES_DIR/03-use-cases-planning.puml"

"$THESIS_JAVA_BIN" -Djava.awt.headless=true \
  -jar "$THESIS_PLANTUML_JAR" -tsvg \
  "$THESIS_FIGURES_DIR/04-er-ledger.puml" \
  "$THESIS_FIGURES_DIR/05-er-plans.puml" \
  "$THESIS_FIGURES_DIR/06-structure.puml" \
  "$THESIS_FIGURES_DIR/07-data-flow.puml" \
  "$THESIS_FIGURES_DIR/08-domain-ledger.puml" \
  "$THESIS_FIGURES_DIR/09-domain-plans.puml"
```

`THESIS_DOT_BIN` может указывать на установленный Graphviz `dot`. Подготовленные изображения проверены именно с указанной выше WebAssembly-сборкой; другая версия Graphviz или другой набор шрифтов могут изменить переносы и компоновку. После повторного экспорта изображения нужно просмотреть заново.

Для воспроизведения использованной WebAssembly-сборки вместо установки системного `dot` можно создать небольшой внешний адаптер. Следующие команды устанавливают пакеты **в отдельный каталог инструментов**, не в репозиторий приложения. Понадобится доступ к npm.

```sh
export THESIS_TOOLS_DIR="/absolute/path/to/thesis-diagram-tools"
mkdir -p "$THESIS_TOOLS_DIR"
npm install --prefix "$THESIS_TOOLS_DIR" --no-audit --no-fund \
  @viz-js/viz@3.31.0 sharp@0.35.4

cat > "$THESIS_TOOLS_DIR/dot.cjs" <<'JS'
const fs = require('node:fs');
const { instance, graphvizVersion } = require('@viz-js/viz');
const args = process.argv.slice(2);
if (args.includes('-V') || args.includes('--version')) {
  process.stderr.write(`dot - graphviz version ${graphvizVersion} (Viz.js WebAssembly)\n`);
  process.exit(0);
}
const input = fs.readFileSync(0, 'utf8');
const formatArg = args.find(value => value.startsWith('-T'));
const format = formatArg ? formatArg.slice(2).split(':')[0] : 'dot';
instance().then(viz => {
  const output = viz.renderString(input, { format, engine: 'dot' });
  const outputIndex = args.indexOf('-o');
  if (outputIndex >= 0) fs.writeFileSync(args[outputIndex + 1], output);
  else process.stdout.write(output);
}).catch(error => {
  process.stderr.write(String(error));
  process.exitCode = 1;
});
JS

cat > "$THESIS_TOOLS_DIR/dot" <<'SH'
#!/bin/sh
exec "$THESIS_NODE_BIN" "$THESIS_TOOLS_DIR/dot.cjs" "$@"
SH
chmod +x "$THESIS_TOOLS_DIR/dot"

export THESIS_DOT_BIN="$THESIS_TOOLS_DIR/dot"
export THESIS_SHARP_PATH="$THESIS_TOOLS_DIR/node_modules/sharp"
"$THESIS_DOT_BIN" -V
```

Адаптер реализует необходимый здесь вызов Graphviz через stdin и `-Tsvg`; это не полная замена всех возможностей системной команды `dot`. После установки адаптера повторите команду PlantUML для `02-use-cases-ledger` и `03-use-cases-planning` из предыдущего блока.

## Растеризация SVG в PNG

Команда ниже переводит все 18 готовых SVG в PNG шириной 1889 пикселей, с белым фоном и метаданными 300 dpi. Соотношение сторон сохраняется. В документе размер задаётся отдельно: метаданные DPI сами по себе не гарантируют нужную ширину вставки.

```sh
"$THESIS_NODE_BIN" <<'JS'
const path = require('node:path');
const sharp = require(process.env.THESIS_SHARP_PATH);
const folder = process.env.THESIS_FIGURES_DIR;
const names = [
  '01-ui',
  '01-ui-02-plan',
  '01-ui-03-forecast',
  '01-ui-04-settings',
  '01-ui-05-profiles',
  '01-ui-06-data',
  '01-ui-07-accounts-goals',
  '01-ui-08-income-payments',
  '01-ui-09-scenarios',
  '01-ui-10-list-withdrawal',
  '02-use-cases-ledger',
  '03-use-cases-planning',
  '04-er-ledger',
  '05-er-plans',
  '06-structure',
  '07-data-flow',
  '08-domain-ledger',
  '09-domain-plans',
];
(async () => {
  for (const name of names) {
    await sharp(path.join(folder, `${name}.svg`))
      .resize({ width: 1889 })
      .flatten({ background: '#ffffff' })
      .withMetadata({ density: 300 })
      .png()
      .toFile(path.join(folder, `${name}.png`));
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
JS
```

## Размеры и визуальная проверка

Для UI-макетов 1–10 при ширине вставки 160 мм подтверждён минимальный кегль 11,34 pt; заголовки имеют кегль 13,61 pt. Ширина каждого SVG составляет 1200 единиц, ширина PNG — 1889 пикселей. Все макеты укладываются в ограничение высоты 180 мм.

| № рисунка | Идентификатор ресурса      | Высота SVG, единиц | Размер PNG, px | Высота при ширине 160 мм, мм |
| --------- | -------------------------- | ------------------ | -------------- | ---------------------------- |
| 1         | `01-ui`                    | 1243               | 1889 × 1957    | 165.73                       |
| 2         | `01-ui-02-plan`            | 892                | 1889 × 1404    | 118.93                       |
| 3         | `01-ui-03-forecast`        | 1132               | 1889 × 1782    | 150.93                       |
| 4         | `01-ui-04-settings`        | 916                | 1889 × 1442    | 122.13                       |
| 5         | `01-ui-05-profiles`        | 896                | 1889 × 1410    | 119.47                       |
| 6         | `01-ui-06-data`            | 896                | 1889 × 1410    | 119.47                       |
| 7         | `01-ui-07-accounts-goals`  | 728                | 1889 × 1146    | 97.07                        |
| 8         | `01-ui-08-income-payments` | 719                | 1889 × 1132    | 95.87                        |
| 9         | `01-ui-09-scenarios`       | 983                | 1889 × 1547    | 131.07                       |
| 10        | `01-ui-10-list-withdrawal` | 1003               | 1889 × 1579    | 133.73                       |

26.10.2026 каждый из девяти итоговых UI-PNG просмотрен отдельно: обрезания текста, нарушений границ и переносов не обнаружено. Проверена корректность XML всех девяти SVG. PNG имеют белый фон, цветовую модель RGB и не содержат альфа-канала. Эти проверки относятся к отдельным файлам иллюстраций; размещение, подписи и переходы между страницами проверяются в рендере документа.

Для диаграмм при ширине 160 мм рассчитан следующий минимальный кегль:

| № рисунка | Идентификатор ресурса   | Минимальный кегль, pt |
| --------- | ----------------------- | --------------------- |
| 11        | `02-use-cases-ledger`   | 12.33                 |
| 12        | `03-use-cases-planning` | 11.98                 |
| 13        | `04-er-ledger`          | 11.66                 |
| 14        | `05-er-plans`           | 12.54                 |
| 15        | `06-structure`          | 11.87                 |
| 16        | `07-data-flow`          | 11.25                 |
| 17        | `08-domain-ledger`      | 11.19                 |
| 18        | `09-domain-plans`       | 13.13                 |

Не уменьшайте рисунки без новой проверки читаемости. После любых изменений проверяйте соединения, кратности, переносы, отсутствие обрезания, а также совпадение нумерации и подписей с текстом глав. Проверку отдельных SVG/PNG и проверку всей вёрстки в итоговом DOCX учитывайте отдельно.

## Актуализация 29 октября 2026 года

По исходникам на базе `035f2abdfdb99049a8f3081b032da777685cf095` обновлены `01-ui-02-plan`, `01-ui-03-forecast`, `01-ui-08-income-payments`, `02-use-cases-ledger`, `05-er-plans` и `09-domain-plans`; добавлен `01-ui-10-list-withdrawal`. Все семь итоговых PNG просмотрены отдельно после генерации. Текст помещается внутри блоков, связи и подписи различимы. Корректность XML проверена для всех 18 SVG. Это проверка иллюстраций по коду, без запуска приложения.

В десятой UI-паре слева показан полный список «Все цели»: условный пример с 60 записями демонстрирует первую порцию из 50 и переход к оставшимся десяти. Повторяющиеся карточки представлены сокращённо. Справа показан вывод с обменом валют: поле фактического зачисления отсутствует при одинаковых валютах. Дата ввода не изображена, поскольку форма записывает вывод сегодняшним днём. Кнопка вывода в карточке цели доступна при положительных накоплениях.

В двух моделях планов категория заменяет устаревший обязательный вид «платёж / подписка». Легенда логической схемы уточняет самостоятельное освобождение накоплений без `cycleId` и обязательную связь с переводом. Условные схемы не являются снимками работающего приложения; их состав сопоставлен с `GoalsPanel`, `GoalCard`, `WithdrawGoalForm`, `RecordList`, `RecurringForm` и `PaymentsPanel`.

## Иллюстрации главы 3 от 29 октября 2026 года

Рисунки **1–18** и средства их подготовки, описанные выше, относятся к главам 1–2. Для [главы 3](../chapter-3.md) добавлены **11 отдельных иллюстраций 19–29**: девять схем алгоритмов, один график по результатам расчёта и один фактический снимок Web-интерфейса. Суммарно объединённые главы содержат 29 рисунков. Нумерация в таблице ниже является печатной и не зависит от имени ресурса.

| № рисунка | Содержание                                       | Источник                                                                                                                                                             | Изображения                                                                                                  |
| --------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 19        | Переключение локального профиля                  | [chapter3-algorithms.py](chapter3-algorithms.py)                                                                                                                     | [SVG](chapter3-flow-profiles.svg), [PNG](chapter3-flow-profiles.png)                                         |
| 20        | Проверяемое изменение финансового состояния      | [chapter3-algorithms.py](chapter3-algorithms.py)                                                                                                                     | [SVG](chapter3-flow-transaction.svg), [PNG](chapter3-flow-transaction.png)                                   |
| 21        | Переход на новый график бюджета                  | [chapter3-algorithms.py](chapter3-algorithms.py)                                                                                                                     | [SVG](chapter3-flow-budget.svg), [PNG](chapter3-flow-budget.png)                                             |
| 22        | Вывод накоплений из цели                         | [chapter3-algorithms.py](chapter3-algorithms.py)                                                                                                                     | [SVG](chapter3-flow-goal.svg), [PNG](chapter3-flow-goal.png)                                                 |
| 23        | Отметка факта по событию плана                   | [chapter3-algorithms.py](chapter3-algorithms.py)                                                                                                                     | [SVG](chapter3-flow-occurrence.svg), [PNG](chapter3-flow-occurrence.png)                                     |
| 24        | Прогноз по дням и счетам                         | [chapter3-algorithms.py](chapter3-algorithms.py)                                                                                                                     | [SVG](chapter3-flow-forecast.svg), [PNG](chapter3-flow-forecast.png)                                         |
| 25        | Прогноз общей суммы повседневных счетов          | [Генератор XLSX](chapter3-forecast-chart.mjs), [экспорт изображений](chapter3-forecast-chart.py), [JSON расчёта](../research/controls/forecast-control-results.json) | [XLSX](chapter3-forecast-chart.xlsx), [SVG](chapter3-forecast-chart.svg), [PNG](chapter3-forecast-chart.png) |
| 26        | Нехватка на счёте при положительной общей сводке | Целевой [Playwright-сценарий](../../../tests/e2e/t07-forecast.spec.ts)                                                                                               | [PNG](chapter3-control-screen.png); SVG не создавался                                                        |
| 27        | Проверка покупки на всём горизонте               | [chapter3-algorithms.py](chapter3-algorithms.py)                                                                                                                     | [SVG](chapter3-flow-purchase.svg), [PNG](chapter3-flow-purchase.png)                                         |
| 28        | Проверка выбранного пакета CSV                   | [chapter3-algorithms.py](chapter3-algorithms.py)                                                                                                                     | [SVG](chapter3-flow-csv.svg), [PNG](chapter3-flow-csv.png)                                                   |
| 29        | Проверка копии перед восстановлением             | [chapter3-algorithms.py](chapter3-algorithms.py)                                                                                                                     | [SVG](chapter3-flow-backup.svg), [PNG](chapter3-flow-backup.png)                                             |

Схемы используют символы начала/конца, процесса, решения и ввода/вывода; детали алгоритмов раскрыты в тексте главы. PNG схем создаются шириной 1889 px. При вставке шириной 160 мм минимальный кегль подписей схем составляет 11,34 пт. График использует 30 вычисленных точек конца дня с 20.10.2026 по 18.11.2026 из воспроизводимого [forecast-control.ts](../research/controls/forecast-control.ts), без подбора точек или сглаживания исходных данных. Сплошная линия суммы и пунктир резерва различаются начертанием, названия рядов приведены в легенде.

Повторная генерация схем и графика из корня репозитория использует Python, Node и Sharp из bundled runtime; зависимости приложения не изменяются:

```sh
node --import tsx output/thesis/research/controls/forecast-control.ts
/Users/gamkrelidzetimur/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 output/thesis/figures/chapter3-algorithms.py
/Users/gamkrelidzetimur/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 output/thesis/figures/chapter3-forecast-chart.py
```

Рисунок 26 имеет иное происхождение: это копия `local-shortage-summary-320.png` из каталога `test-artifacts/thesis-chapter3-20261029/browser/`. Прогон выполнен 29.10.2026 в Chrome, режиме default, с viewport 320 × 900 и часовым поясом Europe/Samara; контрольная дата — 20.10.2026, данные синтетические. Сценарий `summary warns about local shortage` подтвердил общую сводку 8000 RUB и предупреждение о нехватке на отдельном счёте. Для него использован разрешённый изолированный сервер на 8196 после отказа sandbox открыть 8089. PNG не является UI-макетом; он показывает доступную область прокручиваемого окна, а не все его разделы одновременно. SVG-версия снимка не создавалась.

При первоначальной подготовке главы все новые схемы и график проверены отдельно, а размещение 11 новых рисунков с подписями проверено на всех страницах документа. В той редакции отдельный документ содержал 42 страницы, объединённый — 92; глава 3 занимала с. 49–90. Исправлены переносы сумм и ссылок на номера рисунков; изменившиеся страницы повторно просмотрены. Подробности — в [отчёте ревью главы 3](../research/chapter3-review.md). Исторические сведения о макетах и 18 рисунках выше сохранены и не считаются подтверждением нового браузерного прогона.

### Новая редакция рисунка 25 и раздела 3.11.4

В первой переработке от 29.10.2026 рисунок 25 был посвящён текущему плану. Синяя линия показывала общую сумму повседневных счетов, красный пунктир — резерв 5 000 RUB. Доход 25 октября и платёж 28 октября сопровождались стрелками и суммами, нижняя составная полоса раскрывала конечный остаток по счетам. Эта редакция заменена минималистичной по следующему уточнению пользователя, описанному ниже.

В той редакции SVG имел размер 1000 × 810, PNG — 2000 × 1620 px; размер вставки составлял 160 × 129,6 мм. Расчётные значения и исходный JSON сохранены; генератор дополнительно проверяет ключевые даты, минимум, резерв и сумму конечных остатков. Сравнение сценариев в 3.13.4 сохранено в тексте, ссылка на прежнее содержание рисунка 25 удалена.

Проверки первой переработки документов и размещения рисунка отражены в [протоколе](../research/forecast-section-checks.json) и [исследовательской записке](../research-notes.md). Нового запуска приложения или браузерного сценария при этой редактуре не было.

### Минималистичная редакция рисунка 25

В следующей редакции по уточнению пользователя остались одна синяя линия прогноза, серый пунктир резерва, тонкая горизонтальная сетка и даты. Прямо подписывались только начальные 40 000 RUB, пик 47 500 RUB, конечные 17 500 RUB и резерв 5 000 RUB. Стрелки, заливка, дополнительная диаграмма счетов и повторяющие текст пояснения были удалены. Пользователь отметил, что без подписей причин движения линия стала непонятной; последующее уточнение описано ниже.

Размеры этой редакции: SVG 1000 × 520, PNG 2000 × 1040 px, вставка в Word 160 × 83,2 мм. Минимальный кегль — 11,34 пт. Все 30 исходных значений прогноза сохранены. Проверки — в [протоколе минималистичной редакции](../research/forecast-minimal-checks.json).

### Компактный график с поясняющими подписями

В промежуточной редакции к точкам дохода и платежа были добавлены короткие подписи «Доход +10 000» и «Платёж −18 000» с соответствующими остатками 47 500 и 28 000 RUB. Плавное снижение поясняла надпись «Расходы −500 RUB/день», итог обозначался как минимум. Верхняя строка называла величину — прогноз остатка на конец дня — и год; даты событий читались по горизонтальной шкале. Сохранялись один синий акцент, серый пунктир резерва, тонкая сетка и прежний размер 160 × 83,2 мм. Две короткие соединительные линии связывали подписи с точками; стрелок, заливки и дополнительных диаграмм не было.

Генератор проверял каждое суточное изменение, включая ежедневные 500 RUB, доход 25 октября и платёж 28 октября. В трёх DOCX было заменено только встроенное изображение; остальные части Word-файлов сохранялись. Проверки этой редакции — в [протоколе подписей графика](../research/forecast-labels-checks.json).

### Стандартная диаграмма Excel от 30 октября 2026 года

По уточнению пользователя рисунок 25 заменён обычной линейной диаграммой в стиле Excel: белый фон, синяя линия остатка, оранжевый пунктир резерва, горизонтальная серая сетка, названия осей и легенда снизу. Выноски и подписи поверх линий удалены. Вертикальная шкала начинается с нуля и заканчивается 50 000 руб.; шаг — 10 000 руб. Все 30 значений обоих рядов сохранены.

Редактируемая диаграмма хранится в [XLSX](chapter3-forecast-chart.xlsx) и связана с ячейками листа «Прогноз». [JS-генератор](chapter3-forecast-chart.mjs) создаёт книгу через `@oai/artifact-tool`; [Python-скрипт](chapter3-forecast-chart.py) дополняет кэши рядов в OOXML, задаёт область печати и экспортирует диаграмму через bundled LibreOffice и Poppler в SVG, затем через Sharp в PNG. Microsoft Excel для экспорта не запускался. Данные расположены под диаграммой и не входят в изображение. Команда генерации Python, приведённая выше, остаётся точкой входа.

PNG имеет размер 2000 × 1040 px, вставка в Word — 160 × 83,2 мм. Читаемость подписей и размещение проверены в рендерах трёх документов. В DOCX заменено только изображение: текст и остальные части архивов сохранены. Подробности адресной проверки — в [протоколе диаграммы Excel](../research/forecast-excel-checks.json).
