"""Десять пар структурных схем мобильного интерфейса.

Запуск: bundled Python. Выход: 01-ui*.svg в каталоге этого файла.
Денежные значения и персональные сведения не заполнены.
При ширине вставки 160 мм минимальный текст 30 единиц равен 11,34 пт.
"""

from dataclasses import dataclass
from html import escape
from pathlib import Path

from PIL import ImageFont

HERE = Path(__file__).resolve().parent
FONT_DIR = Path('/System/Library/Fonts/Supplemental')
FONTS = {
    'normal': ImageFont.truetype(str(FONT_DIR / 'Arial.ttf'), 30),
    'bold': ImageFont.truetype(str(FONT_DIR / 'Arial Bold.ttf'), 30),
    'title': ImageFont.truetype(str(FONT_DIR / 'Arial Bold.ttf'), 36),
}
WIDTH = 1200
PANEL_W = 552
CONTENT_W = 504


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
    assert all(FONTS[style].getlength(line) <= max_width for line in lines), text
    return lines


class Drawing:
    def __init__(self):
        self.parts = []

    def text(self, x, y, text, style='normal', anchor='start'):
        self.parts.append(
            f'<text x="{x:.1f}" y="{y:.1f}" class="{style}" '
            f'text-anchor="{anchor}">{escape(text)}</text>'
        )

    def box(self, x, y, w, h, radius=7, dashed=False):
        dash = ' stroke-dasharray="8 6"' if dashed else ''
        self.parts.append(
            f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" '
            f'height="{h:.1f}" rx="{radius}"{dash}/>'
        )

    def line(self, x1, y1, x2, y2, width=2):
        self.parts.append(
            f'<line x1="{x1:.1f}" y1="{y1:.1f}" '
            f'x2="{x2:.1f}" y2="{y2:.1f}" stroke-width="{width}"/>'
        )

    def paragraphs(self, x, y, lines, style='normal', leading=39):
        for line in lines:
            self.text(x, y, line, style)
            y += leading
        return y

    def block(self, x, y, block):
        if block.kind == 'tabs':
            labels = block.lines
            # Proportional widths retain all mobile labels at the same text size.
            padding = 6 if len(labels) == 4 else 20
            desired = [FONTS['bold' if i == block.selected else 'normal'].getlength(t) + padding
                       for i, t in enumerate(labels)]
            if sum(desired) > CONTENT_W:
                # Long choices form a vertical group at the fixed legible size.
                for i, label in enumerate(labels):
                    self.box(x, y + i * 57, CONTENT_W, 49)
                    self.text(x + CONTENT_W / 2, y + i * 57 + 35, label,
                              'bold' if i == block.selected else 'normal', 'middle')
                return y + len(labels) * 57 + 6
            extra = (CONTENT_W - sum(desired)) / len(labels)
            widths = [w + extra for w in desired]
            self.box(x, y, CONTENT_W, 57)
            left = x
            for i, (label, w) in enumerate(zip(labels, widths)):
                if i:
                    self.line(left, y, left, y + 57)
                self.text(left + w / 2, y + 38, label,
                          'bold' if i == block.selected else 'normal', 'middle')
                if i == block.selected:
                    self.line(left + 11, y + 49, left + w - 11, y + 49, 3)
                left += w
            return y + 69
        if block.kind in ('field', 'button', 'note'):
            style = 'bold' if block.kind == 'button' else 'normal'
            lines = wrap(block.title, CONTENT_W - (72 if block.kind == 'field' else 32), style)
            height = 21 + 39 * len(lines)
            self.box(x, y, CONTENT_W, height, dashed=block.kind == 'note')
            if block.kind == 'button':
                for j, text in enumerate(lines):
                    self.text(x + CONTENT_W / 2, y + 39 + 39 * j, text, style, 'middle')
            else:
                self.paragraphs(x + 16, y + 39, lines, style)
            if block.kind == 'field':
                self.text(x + CONTENT_W - 18, y + height - 20, '—', anchor='end')
            return y + height + 12
        title_lines = wrap(block.title, CONTENT_W - 32, 'bold')
        body = [line for text in block.lines for line in wrap(text, CONTENT_W - 32)]
        height = 21 + (len(title_lines) + len(body)) * 39
        self.box(x, y, CONTENT_W, height)
        after_title = self.paragraphs(x + 16, y + 39, title_lines, 'bold')
        self.paragraphs(x + 16, after_title, body)
        return y + height + 12

    def panel(self, x, panel):
        title_lines = wrap(panel.title, 454, 'title')
        self.paragraphs(x + 24, 70, title_lines, 'title', 43)
        header_bottom = 92 + (len(title_lines) - 1) * 43
        if panel.tab >= 0:
            # Neutral profile control, without a brand or personal name.
            self.parts.append(f'<circle cx="{x + 514}" cy="47" r="9"/>')
            self.parts.append(f'<path d="M {x + 498} 73 Q {x + 514} 49 {x + 530} 73"/>')
        else:
            self.line(x + 503, 45, x + 524, 66)
            self.line(x + 524, 45, x + 503, 66)
        self.line(x + 16, header_bottom, x + PANEL_W - 16, header_bottom)
        y = header_bottom + 18
        if panel.back:
            self.text(x + 24, y + 28, '‹ Назад')
            y += 47
        for block in panel.blocks:
            y = self.block(x + 24, y, block)
        return y

    def nav(self, x, y, selected):
        labels = ['Обзор', 'Операции', 'План', 'Аналитика']
        widths = [109, 157, 101, 173]
        left = x + 6
        self.line(x + 6, y, x + PANEL_W - 6, y)
        for i, (label, w) in enumerate(zip(labels, widths)):
            if i:
                self.line(left, y, left, y + 65)
            self.text(left + w / 2, y + 42, label,
                      'bold' if i == selected else 'normal', 'middle')
            if i == selected:
                self.line(left + 10, y + 54, left + w - 10, y + 54, 3)
            left += w


PAIRS = [
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


for basename, left, right in PAIRS:
    drawing = Drawing()
    ends = [drawing.panel(24, left), drawing.panel(624, right)]
    nav_height = 83 if left.tab >= 0 or right.tab >= 0 else 0
    panel_bottom = max(ends) + nav_height + 12
    height = panel_bottom + 24
    assert height <= 1350, (basename, height)
    for x, panel in [(24, left), (624, right)]:
        drawing.parts.insert(0, f'<rect x="{x}" y="24" width="552" height="{panel_bottom - 24}" rx="14"/>')
        if panel.tab >= 0:
            drawing.nav(x, panel_bottom - 77, panel.tab)
    title = f'{left.title} и {right.title}'
    description = ('Структурные схемы расположения элементов. Области прокрутки показаны условно. '
                   'Денежные значения и персональные сведения не заполнены.')
    if basename == '01-ui-06-data':
        description += ' Форма операции показывает новый проведённый расход без разделения на части.'
    elif basename == '01-ui-07-accounts-goals':
        description += ' Показаны повседневный счёт и простая новая цель со свёрнутым графиком.'
    elif basename == '01-ui-08-income-payments':
        description += ' Показаны новые повторяющиеся планы без истории прежних условий.'
    elif basename == '01-ui-09-scenarios':
        description += ' В сценарии выбран раздел условий.'
    elif basename == '01-ui-10-list-withdrawal':
        description += (' Показан полный список более 50 целей с условным количеством записей; '
                        'поле зачисления в выводе доступно только при обмене валют. '
                        'Дата записи в форме не редактируется.')
    svg = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="160mm" height="{height * 160 / WIDTH:.2f}mm" viewBox="0 0 1200 {height}">',
        f'<title>{escape(title)}</title>', f'<desc>{escape(description)}</desc>',
        '<style>text{font-family:Arial,sans-serif;font-size:30px;fill:#000}'
        '.bold{font-weight:700}.title{font-size:36px;font-weight:700}'
        'rect,line,path,circle{stroke:#000;stroke-width:2;fill:#fff}'
        'line,path{fill:none}</style>',
        f'<rect width="1200" height="{height}" style="fill:#fff;stroke:none"/>',
        *drawing.parts, '</svg>',
    ]
    (HERE / f'{basename}.svg').write_text('\n'.join(svg), encoding='utf-8')
    print(f'{basename}.svg: 1200×{height}; 160×{height * 160 / WIDTH:.1f} мм')
