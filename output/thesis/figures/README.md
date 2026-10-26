# Иллюстрации к главам 1–2

Комплект включает 17 иллюстраций: девять UI-макетов и восемь диаграмм. Редактируемые источники отделены от готовых SVG и PNG. Растровые изображения получают из соответствующих SVG; геометрию связей вручную не исправляют.

**Имена файлов — идентификаторы ресурсов (asset ID), а не печатные номера рисунков.** Например, `02-use-cases-ledger` соответствует рисунку 10, а `09-domain-plans` — рисунку 17. Номер для подписи в тексте указан в первом столбце.

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
| 10        | Прецеденты UC-01–UC-08                   | `02-use-cases-ledger`      | [02-use-cases-ledger.puml](02-use-cases-ledger.puml)     | [SVG](02-use-cases-ledger.svg), [PNG](02-use-cases-ledger.png)           |
| 11        | Прецеденты UC-09–UC-16                   | `03-use-cases-planning`    | [03-use-cases-planning.puml](03-use-cases-planning.puml) | [SVG](03-use-cases-planning.svg), [PNG](03-use-cases-planning.png)       |
| 12        | Логические связи данных текущего учёта   | `04-er-ledger`             | [04-er-ledger.puml](04-er-ledger.puml)                   | [SVG](04-er-ledger.svg), [PNG](04-er-ledger.png)                         |
| 13        | Логические связи планов и событий        | `05-er-plans`              | [05-er-plans.puml](05-er-plans.puml)                     | [SVG](05-er-plans.svg), [PNG](05-er-plans.png)                           |
| 14        | Дерево подсистем и модулей               | `06-structure`             | [06-structure.puml](06-structure.puml)                   | [SVG](06-structure.svg), [PNG](06-structure.png)                         |
| 15        | Изменение финансового состояния и запись | `07-data-flow`             | [07-data-flow.puml](07-data-flow.puml)                   | [SVG](07-data-flow.svg), [PNG](07-data-flow.png)                         |
| 16        | Концептуальная модель текущего учёта     | `08-domain-ledger`         | [08-domain-ledger.puml](08-domain-ledger.puml)           | [SVG](08-domain-ledger.svg), [PNG](08-domain-ledger.png)                 |
| 17        | Концептуальная модель планирования       | `09-domain-plans`          | [09-domain-plans.puml](09-domain-plans.puml)             | [SVG](09-domain-plans.svg), [PNG](09-domain-plans.png)                   |

Рисунки 1–9 — UI-макеты. Все девять SVG создаёт один скрипт `01-ui.py`. Рисунки 12–13 описывают логические связи JSON-агрегата, а не физическую SQL-схему. Рисунки 16–17 — концептуальные классы предметной области, а не утверждение об объектной иерархии реализации на TypeScript. Линии рисунка 14 обозначают состав подсистем, а не разрешённые программные импорты.

## Проверенные средства подготовки

| Средство                    | Версия, использованная при подготовке |
| --------------------------- | ------------------------------------- |
| PlantUML                    | 1.2026.1, внешний `plantuml.jar`      |
| Java                        | OpenJDK 21.0.7, JBR 21.0.7+9          |
| Graphviz для рисунков 10–11 | 16.1.0 в WebAssembly-сборке Viz.js    |
| Пакет Viz.js                | `@viz-js/viz` 3.31.0                  |
| Node.js для растеризации    | 24.19.0                               |
| Sharp                       | 0.35.4                                |
| Python для рисунков 1–9     | 3.12.14                               |
| Шрифт схем                  | Arial                                 |

Эти средства использованы как внешнее окружение подготовки документа. Они не добавлены в зависимости приложения «Лад». В частности, Node.js 24.19.0 относится к растеризации иллюстраций; версия Node.js приложения остаётся заданной его `.nvmrc`. JAR, npm-пакеты и временный Graphviz-адаптер в комплект иллюстраций не включены.

Ресурсы `02-use-cases-ledger` и `03-use-cases-planning` (рисунки 10–11) требуют внешнего Graphviz: у использованного Smetana обнаружились зазоры между линиями и овалами прецедентов. Эти две диаграммы пересозданы через Graphviz и проверены визуально. Не заменяйте этот движок на Smetana при общем повторном экспорте.

Ресурсы `04-er-ledger`, `05-er-plans`, `08-domain-ledger` и `09-domain-plans` (рисунки 12, 13, 16 и 17) задают Smetana через `!pragma layout smetana`. `06-structure` (рисунок 14) использует встроенную нотацию PlantUML `mindmap`, а `07-data-flow` (рисунок 15) — встроенную диаграмму последовательности; они не требуют внешнего `dot`, несмотря на оставленную в исходнике директиву Smetana.

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

Команда ниже переводит все 17 готовых SVG в PNG шириной 1889 пикселей, с белым фоном и метаданными 300 dpi. Соотношение сторон сохраняется. В документе размер задаётся отдельно: метаданные DPI сами по себе не гарантируют нужную ширину вставки.

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

Для UI-макетов 1–9 при ширине вставки 160 мм подтверждён минимальный кегль 11,34 pt; заголовки имеют кегль 13,61 pt. Ширина каждого SVG составляет 1200 единиц, ширина PNG — 1889 пикселей. Все макеты укладываются в ограничение высоты 180 мм.

| № рисунка | Идентификатор ресурса      | Высота SVG, единиц | Размер PNG, px | Высота при ширине 160 мм, мм |
| --------- | -------------------------- | ------------------ | -------------- | ---------------------------- |
| 1         | `01-ui`                    | 1243               | 1889 × 1957    | 165,73                       |
| 2         | `01-ui-02-plan`            | 892                | 1889 × 1404    | 118,93                       |
| 3         | `01-ui-03-forecast`        | 1132               | 1889 × 1782    | 150,93                       |
| 4         | `01-ui-04-settings`        | 916                | 1889 × 1442    | 122,13                       |
| 5         | `01-ui-05-profiles`        | 896                | 1889 × 1410    | 119,47                       |
| 6         | `01-ui-06-data`            | 896                | 1889 × 1410    | 119,47                       |
| 7         | `01-ui-07-accounts-goals`  | 728                | 1889 × 1146    | 97,07                        |
| 8         | `01-ui-08-income-payments` | 770                | 1889 × 1212    | 102,67                       |
| 9         | `01-ui-09-scenarios`       | 983                | 1889 × 1547    | 131,07                       |

26.10.2026 каждый из девяти итоговых UI-PNG просмотрен отдельно: обрезания текста, нарушений границ и переносов не обнаружено. Проверена корректность XML всех девяти SVG. PNG имеют белый фон, цветовую модель RGB и не содержат альфа-канала. Эти проверки относятся к отдельным файлам иллюстраций; размещение, подписи и переходы между страницами проверяются в рендере документа.

Для диаграмм при ширине 160 мм рассчитан следующий минимальный кегль:

| № рисунка | Идентификатор ресурса   | Минимальный кегль, pt |
| --------- | ----------------------- | --------------------- |
| 10        | `02-use-cases-ledger`   | 12,44                 |
| 11        | `03-use-cases-planning` | 11,98                 |
| 12        | `04-er-ledger`          | 11,66                 |
| 13        | `05-er-plans`           | 12,54                 |
| 14        | `06-structure`          | 11,87                 |
| 15        | `07-data-flow`          | 11,25                 |
| 16        | `08-domain-ledger`      | 11,19                 |
| 17        | `09-domain-plans`       | 12,82                 |

Не уменьшайте рисунки без новой проверки читаемости. После любых изменений проверяйте соединения, кратности, переносы, отсутствие обрезания, а также совпадение нумерации и подписей с текстом глав. Проверку отдельных SVG/PNG и проверку всей вёрстки в итоговом DOCX учитывайте отдельно.
