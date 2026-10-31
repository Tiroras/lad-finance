# Воспроизводимые контрольные примеры главы 3

Сценарии вызывают функции проекта на синтетическом состоянии. Они не запускают приложение, не читают пользовательское хранилище и не обращаются к банковским данным. Результаты описаны в [главе 3](../../archive/sections-2026-10-30/chapter-3.md) и [протоколе](../chapter3-review.md). База проверки — `96089bf`, 29 октября 2026 года, Node.js 22.21.1.

Запуск из корня проекта с установленными зависимостями:

```sh
node --import tsx output/thesis/research/controls/forecast-control.ts
node --import tsx output/thesis/research/controls/platform-control.mts > /private/tmp/lad-platform-control-result.json
```

Первый сценарий сохраняет [forecast-control-results.json](forecast-control-results.json), проверяет доступную сумму, прогноз, покупку и сценарий, а также вызывает 49 существующих helper-кейсов. Его массивы дней являются источником [графика](../../figures/chapter3-forecast-chart.png). Второй пишет JSON в stdout; зафиксированный результат — [platform-control-results.json](platform-control-results.json). Проверены профиль, аналитика возврата, состав CSV-пакета и парольный round-trip через реальную криптографию. Используемый пароль — синтетическое значение контрольного примера, не секрет пользователя. Случайные соль и nonce не фиксируются в JSON результата.

Другие контрольные примеры опираются на исполненные существующие тесты. Точные команды, ожидаемые значения и ограничения приведены в [доказательствах учёта](../chapter3-ledger-evidence.md), [прогноза](../chapter3-forecast-evidence.md) и [платформенных функций](../chapter3-platform-evidence.md). Пересечение наборов не следует считать дополнительными уникальными тестами.

Текущий диплом собирается из единого [thesis.md](../../thesis.md). Генерация Word-документа выполняется bundled Python из корня проекта:

```sh
/Users/gamkrelidzetimur/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 output/thesis/build-docx.py
```

Результат — полный `thesis.docx`. Нумерация формул 3.1–3.18, рисунков 19–29 и таблицы 7 сохраняется внутри общего документа. Прежние отдельные файлы и скрипты находятся в [архиве](../../archive/sections-2026-10-30/README.md).

После `render_docx.py` структурная проверка запускается bundled Python с `pdfplumber` и Pillow:

```sh
/Users/gamkrelidzetimur/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 output/thesis/research/check-editorial.py \
  --render-root /absolute/path/to/render-root \
  --introduction-max-pages 2
```

В каталоге рендера должны находиться `thesis/thesis.pdf` и `thesis/page-N.png`. Проверка сопоставляет текст, таблицы, OMML-формулы, встроенные изображения, поля, номера и размещение подписей. PNG страниц нужно просматривать отдельно: автоматические проверки не доказывают визуальную читаемость. Исторический отчёт главы 3 отражает проверку редакции 29.10.2026 и не заменяет новый просмотр после изменения текста.
