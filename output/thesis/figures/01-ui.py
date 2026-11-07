"""Пять компактных композиций из 14 структурных схем интерфейса.

Запуск: bundled Python; SVG и PNG создаются через bundled Node/Sharp.
Активная модель COMPOSITIONS содержит группы 3+3+3+3+2; прежние 20 панелей
сохранены в LEGACY_PAIRS как исходные данные, старые файлы не регенерируются.
Ширина вставки — 170 мм, viewBox — 1200 единиц. Минимальный шрифт 25 единиц
соответствует 10,04 пт, заголовок 30 единиц — 12,05 пт. Все подписи сохранены;
переносы длинных названий внутри горизонтальных переключателей условны.
Денежные значения и персональные сведения не заполнены.
"""

from dataclasses import dataclass
from html import escape
from pathlib import Path
import argparse
import json
import subprocess

from PIL import ImageFont

HERE = Path(__file__).resolve().parent
RUNTIME = Path.home() / '.cache/codex-runtimes/codex-primary-runtime/dependencies'
NODE = RUNTIME / 'node/bin/node'
SHARP = RUNTIME / 'node/node_modules/sharp'
FONT_DIR = Path('/System/Library/Fonts/Supplemental')
FONT_SIZE, TITLE_SIZE, WIDTH, INSERT_WIDTH_MM, PNG_WIDTH = 25, 30, 1200, 170, 2008
LINE, GAP, MARGIN, PANEL_GAP = 31, 7, 12, 18
FONTS = {
    'normal': ImageFont.truetype(str(FONT_DIR / 'Arial.ttf'), FONT_SIZE),
    'bold': ImageFont.truetype(str(FONT_DIR / 'Arial Bold.ttf'), FONT_SIZE),
    'title': ImageFont.truetype(str(FONT_DIR / 'Arial Bold.ttf'), TITLE_SIZE),
}
LEGACY_FONTS = {
    'normal': ImageFont.truetype(str(FONT_DIR / 'Arial.ttf'), 30),
    'bold': ImageFont.truetype(str(FONT_DIR / 'Arial Bold.ttf'), 30),
}
BREAKS = {
    'Бюджеты': ('Бюд-', 'жеты'),
    'Платежи': ('Пла-', 'тежи'),
    'Прогноз': ('Прог-', 'ноз'),
    'Операции': ('Опера-', 'ции'),
    'Аналитика': ('Ана-', 'литика'),
}


@dataclass
class Block:
    kind: str
    title: str = ''
    lines: tuple = ()
    selected: int = -1


@dataclass
class Panel:
    title: str
    blocks: tuple
    tab: int = -1
    back: bool = False


def card(title, *lines):
    return Block('card', title, lines)


def rows(title, *lines):
    return Block('rows', title, lines)


def field(label):
    return Block('field', label)


def button(label):
    return Block('button', label)


def note(text):
    return Block('note', text)


def tabs(*labels, selected=0):
    return Block('tabs', lines=labels, selected=selected)


def plan_tabs(selected):
    return tabs('Бюджеты', 'Цели', 'Платежи', 'Прогноз', selected=selected)


def wrap(text, max_width, style='normal'):
    words = text.split()
    lines = []
    current = ''
    for word in words:
        trial = f'{current} {word}'.strip()
        if current and FONTS[style].getlength(trial) > max_width:
            lines.append(current)
            current = word
        else:
            current = trial
    if current:
        lines.append(current)
    result = []
    for line in lines:
        if FONTS[style].getlength(line) > max_width:
            assert line in BREAKS, (line, max_width)
            result.extend(BREAKS[line])
        else:
            result.append(line)
    assert all(FONTS[style].getlength(line) <= max_width for line in result), (text, max_width)
    return result


class Drawing:
    def __init__(self, panel_width):
        self.parts = []
        self.panel_width = panel_width
        self.content_width = panel_width - 24
        self.text_bounds = []
        self.panel_x = 0

    def text(self, x, y, text, style='normal', anchor='start'):
        width = FONTS[style].getlength(text)
        left = x - (width / 2 if anchor == 'middle' else width if anchor == 'end' else 0)
        top, bottom = FONTS[style].getbbox(text, anchor='ls')[1::2]
        assert left >= self.panel_x + 3, (text, left, self.panel_x)
        assert left + width <= self.panel_x + self.panel_width - 3, (text, left + width)
        self.text_bounds.append((left, y + top, left + width, y + bottom, text))
        self.parts.append(
            f'<text x="{x:.1f}" y="{y:.1f}" class="{style}" '
            f'text-anchor="{anchor}">{escape(text)}</text>'
        )

    def box(self, x, y, w, h, radius=5, dashed=False):
        dash = ' stroke-dasharray="6 5"' if dashed else ''
        self.parts.append(
            f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" '
            f'height="{h:.1f}" rx="{radius}"{dash}/>'
        )

    def line(self, x1, y1, x2, y2, width=1.6):
        self.parts.append(
            f'<line x1="{x1:.1f}" y1="{y1:.1f}" '
            f'x2="{x2:.1f}" y2="{y2:.1f}" stroke-width="{width}"/>'
        )

    def paragraphs(self, x, y, lines, style='normal', leading=LINE):
        for line in lines:
            self.text(x, y, line, style)
            y += leading
        return y

    def choices(self, x, y, labels, selected, widths, navigation=False):
        texts = []
        for i, (label, width) in enumerate(zip(labels, widths)):
            style = 'bold' if i == selected else 'normal'
            texts.append(wrap(label, width - (6 if navigation else 12), style))
        height = 14 + LINE * max(map(len, texts))
        self.box(x, y, sum(widths), height, radius=3)
        left = x
        for i, (label, width, lines) in enumerate(zip(labels, widths, texts)):
            style = 'bold' if i == selected else 'normal'
            if i:
                self.line(left, y, left, y + height)
            first = y + 26 + (height - 14 - LINE * len(lines)) / 2
            self.parts.append(f'<g data-label="{escape(label, quote=True)}">')
            for j, line in enumerate(lines):
                self.text(left + width / 2, first + LINE * j, line, style, 'middle')
            self.parts.append('</g>')
            if i == selected:
                self.line(left + 6, y + height - 5, left + width - 6, y + height - 5, 2.2)
            left += width
        return y + height + GAP

    def block(self, x, y, block):
        width = self.content_width
        if block.kind == 'tabs':
            labels = block.lines
            padding = 6 if len(labels) == 4 else 20
            # Preserve the original horizontal or stacked arrangement of choices.
            legacy_width = sum(LEGACY_FONTS['bold' if i == block.selected else 'normal'].getlength(t) + padding
                               for i, t in enumerate(labels))
            if legacy_width > 504:
                for i, label in enumerate(labels):
                    y = self.choices(x, y, (label,), 0 if i == block.selected else -1, (width,))
                return y
            return self.choices(x, y, labels, block.selected, [width / len(labels)] * len(labels))
        if block.kind in ('field', 'button', 'note'):
            style = 'bold' if block.kind == 'button' else 'normal'
            lines = wrap(block.title, width - (48 if block.kind == 'field' else 20), style)
            height = 12 + LINE * len(lines)
            self.box(x, y, width, height, dashed=block.kind == 'note')
            if block.kind == 'button':
                for j, text in enumerate(lines):
                    self.text(x + width / 2, y + 27 + LINE * j, text, style, 'middle')
            else:
                self.paragraphs(x + 10, y + 27, lines, style)
            if block.kind == 'field':
                self.text(x + width - 10, y + height - 11, '—', anchor='end')
            return y + height + GAP
        title_lines = wrap(block.title, width - 20, 'bold')
        body = [line for text in block.lines for line in wrap(text, width - 20)]
        height = 12 + (len(title_lines) + len(body)) * LINE
        self.box(x, y, width, height)
        after_title = self.paragraphs(x + 10, y + 27, title_lines, 'bold')
        self.paragraphs(x + 10, after_title, body)
        return y + height + GAP

    def panel(self, x, panel, panel_id):
        self.panel_x = x
        self.parts.append(f'<g data-panel="{panel_id}">')
        title_lines = wrap(panel.title, self.panel_width - 58, 'title')
        self.paragraphs(x + 12, 49, title_lines, 'title', 36)
        header_bottom = 63 + (len(title_lines) - 1) * 36
        icon_x = x + self.panel_width - 25
        if panel.tab >= 0:
            self.parts.append(f'<circle cx="{icon_x}" cy="31" r="7"/>')
            self.parts.append(f'<path d="M {icon_x - 12} 53 Q {icon_x} 34 {icon_x + 12} 53"/>')
        else:
            self.line(icon_x - 8, 28, icon_x + 8, 44)
            self.line(icon_x + 8, 28, icon_x - 8, 44)
        self.line(x + 8, header_bottom, x + self.panel_width - 8, header_bottom)
        y = header_bottom + 11
        if panel.back:
            self.text(x + 12, y + 24, '‹ Назад')
            y += 37
        for block in panel.blocks:
            y = self.block(x + 12, y, block)
        self.parts.append('</g>')
        return y

    def nav(self, x, y, selected):
        self.panel_x = x
        labels = ('Обзор', 'Операции', 'План', 'Аналитика')
        self.choices(x + 6, y, labels, selected, [(self.panel_width - 12) / 4] * 4, navigation=True)
LEGACY_PAIRS = [
    ('01-ui',
     Panel('Обзор', (
         note('Приветствие'),
         card('Можно потратить', 'Доступная сумма и ориентир на день'),
         tabs('Расход', 'Перевод', 'Проверить покупку', selected=-1),
         card('Этот месяц', 'Доходы / расходы · Подробнее'),
         card('Счета'), card('Будущая покупка'), button('Прогноз по дням'),
         card('Расходы по категориям'), card('Цели'), card('Последние операции'),
         card('Ближайший платёж'),
     ), tab=0),
     Panel('Операции', (
         tabs('Месяц', 'Вся история'), button('Добавить операцию'), field('Выбор месяца'),
         field('Поиск'), card('Фильтры', 'Тип / статус / счёт / категория'),
         card('Итоги', 'Доходы / расходы'),
         rows('Операции по датам', 'Дата · название · категория', 'Счёт · сумма · статус'),
         button('Показать ещё'), button('Экспортировать операции'),
     ), tab=1)),
    ('01-ui-02-plan',
     Panel('План', (
         plan_tabs(0), card('Общие лимиты', 'Лимит / расход'), button('Категории и подкатегории'),
         note('Подкатегории используют общий бюджет'),
         card('Бюджет категории', 'Период', 'Потрачено / лимит / остаток', 'Индикатор · раскрыть'),
         card('Другие категории', 'Карточки бюджетов'),
     ), tab=2),
     Panel('План', (
         plan_tabs(1), button('Новая цель'),
         card('Цель', 'Название', 'Накоплено / требуется', 'График и прогресс'),
         tabs('Изменить', 'Пополнить цель', selected=-1),
         button('Вывести из цели'),
         card('Другие цели', 'Карточки накоплений'),
     ), tab=2)),
    ('01-ui-03-forecast',
     Panel('План', (
         plan_tabs(2), card('Календарь платежей', 'Дата · название · сумма', 'Статус платежа'),
         card('Платежи в вашем плане', 'За 30 / 365 дней по графику'),
         card('Регулярные платежи'), button('Добавить платёж'),
         note('Оплата отмечается отдельно'),
         card('План платежа', 'Название · сумма · график', 'Счёт · изменить'),
     ), tab=2),
     Panel('План', (
         plan_tabs(3), tabs('30 дней', '60 дней', '90 дней'), button('Настроить прогноз'),
         card('Итоговые показатели'), card('График остатков'), card('Остатки счетов'),
         card('Календарь', 'Сетка дней · выбранный день'),
         button('Мои сценарии'), card('Планы доходов', 'Список · добавить'),
         note('Будущие события не меняют фактический остаток'), button('Примерить покупку'),
     ), tab=2)),
    ('01-ui-04-settings',
     Panel('Аналитика', (
         field('Ваш месяц'), card('Доходы и расходы'), card('Сравнение расходов'),
         card('Динамика', 'График и главная категория'), card('Структура категорий'),
         card('Накопления'), card('Итог месяца'), card('Риски и подсказки'),
         button('Проверить будущую покупку'),
     ), tab=3),
     Panel('Профиль и настройки', (
         card('Профиль', 'Имя пользователя'),
         rows('Финансы', 'Профиль и планирование', 'Валюты и курсы',
              'Категории и подкатегории', 'Правила и шаблоны операций'),
         rows('Приложение', 'Профили', 'Напоминания', 'Защита данных',
              'Данные и копии', 'Обучение', 'О приложении'),
     ))),
    ('01-ui-05-profiles',
     Panel('Профиль и планирование', (
         field('Как к вам обращаться?'), field('Запасной день дохода'),
         note('Используется без запланированных поступлений'),
         field('До какого дохода планировать траты'),
         card('Выбор дохода', 'Ближайший по плану или выбранный план'),
         field('Неприкосновенный остаток'), button('Сохранить настройки'),
     ), back=True),
     Panel('Профили', (
         rows('Текущий профиль', 'Выбранный набор данных', 'Переименовать · удалить'),
         rows('Другие профили', 'Выбрать · переименовать', 'Удалить'),
         button('Добавить профиль'),
         note('Название нового профиля вводится после нажатия'),
         button('Удалить все профили и данные'),
     ), back=True)),
    ('01-ui-06-data',
     Panel('Данные и копии', (
         rows('Импорт и экспорт', 'Импортировать банковский CSV',
              'Экспортировать операции в CSV', 'Результаты импорта'),
         rows('Резервные копии', 'Создать копию с паролем',
              'Экспортировать резервную копию', 'Восстановить из файла'),
         button('Очистить учёт'), rows('Удаление данных', 'Удалить все профили и данные'),
     ), back=True),
     Panel('Новая операция', (
         tabs('Проведена', 'Ожидается'), tabs('Расход', 'Доход', 'Перевод'),
         tabs('Быстрый ввод', 'Шаблоны', selected=-1), field('Сумма и валюта'),
         field('На что или откуда?'), field('Категория'), field('Счёт'), field('Дата'),
         button('Добавить операцию'),
         card('Заметка и части покупки', 'Раскрываемые поля'),
     ))),
    ('01-ui-07-accounts-goals',
     Panel('Новый счёт', (
         field('Название'), tabs('Повседневный', 'Накопительный', 'Кредитная карта'),
         field('Валюта'), field('Текущий остаток'), button('Сохранить счёт'),
     )),
     Panel('Новая цель', (
         field('Значок'), field('Название'), field('Валюта'),
         field('Сколько нужно накопить'), field('Планирую откладывать в месяц'),
         button('Настроить индивидуальный график'), button('Создать цель'),
     ))),
    ('01-ui-08-income-payments',
     Panel('План дохода', (
         note('План не зачисляет деньги'), field('Название'), field('Ожидаемая сумма'),
         tabs('Повторять', 'Один раз'), field('График повторения'), field('Первое поступление'),
         field('Куда ожидается доход'), button('Сохранить план дохода'),
     )),
     Panel('Новый платёж', (
         field('Название'),
         field('Сумма одного платежа'), field('График повторения'), field('Счёт'),
         field('Учитывать с даты'), field('Категория'), button('Сохранить платёж'),
     ))),
    ('01-ui-09-scenarios',
     Panel('Примерка покупки', (
         note('Расчёт без списания денег'), field('Счёт покупки'), field('Стоимость'),
         card('Быстрые суммы'), field('Дата покупки'), tabs('30 дней', '60 дней', '90 дней'),
         card('Возможная покупка', 'Допустимая сумма / ближайшая дата'),
         tabs('Подставить', 'Выбрать', selected=-1), card('Оценка доступности'), card('Сравнение прогноза'),
     )),
     Panel('Сценарий', (
         note('Отдельный вариант планирования'), field('Название'),
         tabs('30 дней', '60 дней', '90 дней'), tabs('Условия', 'Сравнение'),
         card('Повседневные расходы', 'Как в плане / своя сумма'),
         card('Изменить условия плана', 'Суммы · сдвиги · включатели'),
         card('Разовые события', 'Название · вид · сумма · дата', 'Счёт · участие в расчёте'),
         button('Сравнить с планом'), button('Сохранить сценарий'),
     ))),
    ('01-ui-10-list-withdrawal',
     Panel('Все цели', (
         rows('То, ради чего', 'Новая цель'),
         note('Показано 50 из 60'),
         card('Цель', 'Название · изменить', 'Накоплено / требуется', 'График и прогресс'),
         button('Пополнить цель'), button('Вывести из цели'),
         card('Другие цели', 'Карточки в прежнем порядке'),
         button('Показать ещё (10)'),
         note('Пополнение — перевод между своими счетами'),
     ), back=True),
     Panel('Вывести из цели', (
         card('Название цели', 'Накоплено · сумма и валюта'),
         field('Сколько вывести, валюта'), button('Вывести всю сумму'),
         field('С накопительного счёта'), field('На повседневный счёт'),
         field('Зачислено, другая валюта'),
         note('Отмечайте вывод после фактического перевода. Это не доход и не расход.'),
         button('Записать вывод из цели'),
     ))),
]


PANELS = {
    'overview': LEGACY_PAIRS[0][1],
    'operations': LEGACY_PAIRS[0][2],
    'transaction': LEGACY_PAIRS[5][2],
    'budgets': LEGACY_PAIRS[1][1],
    'goals': LEGACY_PAIRS[1][2],
    'withdrawal': LEGACY_PAIRS[9][2],
    'payments': LEGACY_PAIRS[2][1],
    'forecast': LEGACY_PAIRS[2][2],
    'purchase': LEGACY_PAIRS[8][1],
    'analytics': LEGACY_PAIRS[3][1],
    'scenario': LEGACY_PAIRS[8][2],
    'full_list': LEGACY_PAIRS[9][1],
    'settings': LEGACY_PAIRS[3][2],
    'data': LEGACY_PAIRS[5][1],
}

COMPOSITIONS = [
    {'basename': '01-ui-compact-01-operations', 'panels': ('overview', 'operations', 'transaction')},
    {'basename': '01-ui-compact-02-goals', 'panels': ('budgets', 'goals', 'withdrawal')},
    {'basename': '01-ui-compact-03-forecast', 'panels': ('payments', 'forecast', 'purchase')},
    {'basename': '01-ui-compact-04-analysis', 'panels': ('analytics', 'scenario', 'full_list')},
    {'basename': '01-ui-compact-05-settings', 'panels': ('settings', 'data')},
]


def make_svg(composition):
    panel_ids = composition['panels']
    panels = [PANELS[panel_id] for panel_id in panel_ids]
    panel_width = (WIDTH - 2 * MARGIN - PANEL_GAP * (len(panels) - 1)) / len(panels)
    drawing = Drawing(panel_width)
    positions = [MARGIN + i * (panel_width + PANEL_GAP) for i in range(len(panels))]
    ends = [drawing.panel(x, panel, panel_id) for x, panel, panel_id in zip(positions, panels, panel_ids)]
    nav_height = 88 if any(panel.tab >= 0 for panel in panels) else 0
    panel_bottom = max(ends) + nav_height + 8
    height = panel_bottom + MARGIN
    for x, panel in zip(positions, panels):
        drawing.parts.insert(0, f'<rect x="{x}" y="{MARGIN}" width="{panel_width}" height="{panel_bottom - MARGIN}" rx="10"/>')
        if panel.tab >= 0:
            drawing.nav(x, panel_bottom - 84, panel.tab)
    assert all(y1 >= MARGIN and y2 <= panel_bottom for _, y1, _, y2, _ in drawing.text_bounds)
    assert height <= 1700, (composition['basename'], height)
    description = ('Структурные схемы расположения элементов; области прокрутки показаны условно. '
                   'Порядок полей и горизонтальная навигация сохранены. Длинные подписи внутри ячеек '
                   'перенесены для читаемости. Денежные значения и персональные сведения не заполнены. ')
    if 'transaction' in panel_ids:
        description += 'Форма операции показывает новый проведённый расход без разделения на части. '
    if 'scenario' in panel_ids:
        description += 'В сценарии выбран раздел условий. '
    if 'full_list' in panel_ids:
        description += 'Показан полный список более 50 целей с условным количеством записей. '
    if 'withdrawal' in panel_ids:
        description += 'Поле зачисления в выводе доступно только при обмене валют; дата записи не редактируется. '
    svg = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{INSERT_WIDTH_MM}mm" height="{height * INSERT_WIDTH_MM / WIDTH:.2f}mm" '
        f'viewBox="0 0 {WIDTH} {height}" data-min-text-size="{FONT_SIZE}" data-insert-width-mm="{INSERT_WIDTH_MM}">',
        f'<title>{escape(" · ".join(panel.title for panel in panels))}</title>',
        f'<desc>{escape(description.strip())}</desc>',
        f'<style>text{{font-family:Arial,sans-serif;font-size:{FONT_SIZE}px;fill:#000}}'
        f'.bold{{font-weight:700}}.title{{font-size:{TITLE_SIZE}px;font-weight:700}}'
        'rect,line,path,circle{stroke:#000;stroke-width:1.6;fill:#fff}'
        'line,path{fill:none}</style>',
        f'<rect width="{WIDTH}" height="{height}" style="fill:#fff;stroke:none"/>',
        *drawing.parts, '</svg>',
    ]
    for i, a in enumerate(drawing.text_bounds):
        for b in drawing.text_bounds[i + 1:]:
            assert not (a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]), ('overlapping text', a, b)
    return '\n'.join(svg), {'basename': composition['basename'], 'panels': panel_ids, 'width': WIDTH, 'height': height,
                            'insert_width_mm': INSERT_WIDTH_MM, 'insert_height_mm': round(height * INSERT_WIDTH_MM / WIDTH, 2),
                            'minimum_font_pt': round(FONT_SIZE * INSERT_WIDTH_MM / WIDTH * 72 / 25.4, 2),
                            'text_elements': len(drawing.text_bounds)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, default=HERE)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for composition in COMPOSITIONS:
        svg, report = make_svg(composition)
        path = args.output_dir / f"{composition['basename']}.svg"
        path.write_text(svg, encoding='utf-8')
        paths.append(str(path))
        print(json.dumps(report, ensure_ascii=False))
    code = r'''const sharp=require(process.argv[1]); const paths=JSON.parse(process.argv[2]); const width=Number(process.argv[3]); (async()=>{for(const p of paths)await sharp(p).resize({width}).flatten({background:'#fff'}).withMetadata({density:300}).png().toFile(p.replace(/\.svg$/,'.png'));})().catch(e=>{console.error(e);process.exit(1)});'''
    subprocess.run([str(NODE), '-e', code, str(SHARP), json.dumps(paths), str(PNG_WIDTH)], check=True)


if __name__ == '__main__':
    main()
