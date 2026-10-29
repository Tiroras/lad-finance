"""Блок-схемы выбранных алгоритмов главы 3.

Запуск: bundled Python. Скрипт создаёт SVG и PNG шириной 1889 px.
При ширине вставки 160 мм минимальный кегль Arial — 11,34 пт.
Используются обычные символы схем программ: начало/конец, процесс,
решение, ввод/вывод. Схемы намеренно обобщают детали, раскрытые в тексте.
"""

from dataclasses import dataclass
from html import escape
import json
from pathlib import Path
import subprocess

from PIL import ImageFont

HERE = Path(__file__).resolve().parent
RUNTIME = Path.home() / '.cache/codex-runtimes/codex-primary-runtime/dependencies'
NODE = RUNTIME / 'node/bin/node'
SHARP = RUNTIME / 'node/node_modules/sharp'
FONT_PATH = Path('/System/Library/Fonts/Supplemental/Arial.ttf')
FONT_SIZE = 20
FONT = ImageFont.truetype(str(FONT_PATH), FONT_SIZE)
WIDTH = 800
PNG_WIDTH = 1889
LINE = 26


@dataclass
class Node:
    kind: str
    text: str
    x: float
    y: float
    width: float
    height: float

    @property
    def top(self):
        return (self.x, self.y)

    @property
    def bottom(self):
        return (self.x, self.y + self.height)

    @property
    def left(self):
        inset = 9 if self.kind == 'io' else 0
        return (self.x - self.width / 2 + inset, self.y + self.height / 2)

    @property
    def right(self):
        inset = 9 if self.kind == 'io' else 0
        return (self.x + self.width / 2 - inset, self.y + self.height / 2)


class Diagram:
    def __init__(self, height=760):
        self.height = height
        self.nodes = []
        self.edges = []
        self.labels = []

    def node(self, kind, text, x, y, width, height):
        node = Node(kind, text, x, y, width, height)
        self.nodes.append(node)
        return node

    def edge(self, *points):
        self.edges.append(points)

    def label(self, text, x, y):
        self.labels.append((text, x, y))

    def svg(self):
        out = [
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{self.height}" viewBox="0 0 {WIDTH} {self.height}">',
            '<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#000"/></marker></defs>',
            f'<rect width="{WIDTH}" height="{self.height}" fill="#fff"/>',
            '<g fill="none" stroke="#000" stroke-width="1.8" stroke-linejoin="round" marker-end="url(#arrow)">',
        ]
        for points in self.edges:
            coordinates = ' '.join(f'{x:g},{y:g}' for x, y in points)
            out.append(f'<polyline points="{coordinates}"/>')
        out.append('</g>')
        for node in self.nodes:
            left, right = node.x - node.width / 2, node.x + node.width / 2
            top, bottom = node.y, node.y + node.height
            style = 'fill="#fff" stroke="#000" stroke-width="1.8"'
            if node.kind == 'decision':
                points = [(node.x, top), (right, (top+bottom)/2), (node.x, bottom), (left, (top+bottom)/2)]
                coords = ' '.join(f'{x:g},{y:g}' for x,y in points)
                out.append(f'<polygon points="{coords}" {style}/>')
            elif node.kind == 'io':
                points = [(left+18, top), (right, top), (right-18, bottom), (left, bottom)]
                coords = ' '.join(f'{x:g},{y:g}' for x,y in points)
                out.append(f'<polygon points="{coords}" {style}/>')
            else:
                radius = ' rx="22"' if node.kind == 'term' else ''
                out.append(f'<rect x="{left:g}" y="{top:g}" width="{node.width:g}" height="{node.height:g}"{radius} {style}/>')
            lines = node.text.split('\n')
            available = node.width - (52 if node.kind == 'io' else 30)
            if node.kind == 'decision':
                available = node.width * 0.60
            for line in lines:
                assert FONT.getlength(line) <= available, (line, FONT.getlength(line), available)
            assert len(lines) * LINE <= node.height - 12, (node.text, node.height)
            baseline = top + node.height / 2 - ((len(lines)-1)*LINE)/2 + 7
            for i, line in enumerate(lines):
                out.append(f'<text x="{node.x:g}" y="{baseline+i*LINE:g}" text-anchor="middle" font-family="Arial" font-size="{FONT_SIZE}" fill="#000">{escape(line)}</text>')
        for text, x, y in self.labels:
            out.append(f'<text x="{x:g}" y="{y:g}" text-anchor="middle" font-family="Arial" font-size="{FONT_SIZE}" fill="#000">{escape(text)}</text>')
        out.append('</svg>')
        return '\n'.join(out)+'\n'


def checked_flow(input_text, prepare, question, finish, output, branch, side_label='Нет', down_label='Да'):
    """Одна решающая проверка; боковой путь заканчивается без публикации."""
    d = Diagram()
    x, width = 280, 450
    nodes = [
        d.node('term', 'Начало', x, 24, 220, 40),
        d.node('io', input_text, x, 92, width, 64),
        d.node('process', prepare, x, 186, width, 96),
        d.node('decision', question, x, 314, width, 104),
        d.node('process', finish, x, 450, width, 96),
        d.node('io', output, x, 578, width, 78),
        d.node('term', 'Конец', x, 690, 220, 44),
    ]
    for first, second in zip(nodes, nodes[1:]):
        d.edge(first.bottom, second.top)
    alternate = d.node('io', branch, 660, 314, 230, 104)
    d.edge(nodes[3].right, alternate.left)
    d.edge(alternate.bottom, (660, 712), nodes[-1].right)
    d.label(side_label, 526, 348)
    d.label(down_label, 300, 440)
    return d


def forecast_flow():
    d = Diagram(780)
    x, w = 400, 610
    nodes = [
        d.node('term', 'Начало', x, 18, 240, 38),
        d.node('io', 'Состояние, дата, горизонт\nи назначения счетов', x, 77, w, 66),
        d.node('process', 'Собрать события с исходными\nключами и версиями условий', x, 164, w, 66),
        d.node('process', 'Задать движения по счетам;\nвыделить неназначенное влияние', x, 251, w, 66),
        d.node('process', 'Обработать очередной день:\nостатки счетов и снятие удержаний', x, 338, w, 66),
        d.node('process', 'Переоценить доступные повседневные остатки;\nдобавить неназначенное влияние;\nсравнить сводку с резервом', x, 425, w, 90),
        d.node('decision', 'Есть следующий\nдень?', x, 536, 430, 98),
        d.node('io', 'Траектории, минимумы и предупреждения;\nфактический учёт не меняется', x, 655, w, 66),
        d.node('term', 'Конец', x, 742, 240, 38),
    ]
    d.height = 800
    for first, second in zip(nodes, nodes[1:]):
        d.edge(first.bottom, second.top)
    d.edge(nodes[6].left, (42, 585), (42, 371), nodes[4].left)
    d.label('Да', 147, 576)
    d.label('Нет', 425, 650)
    return d


DIAGRAMS = {
    'profiles': checked_flow(
        'Команда, имя\nи идентификатор профиля',
        'Проверить запрос; завершить запись;\nподготовить целевой снимок\nи сохранённый выбор',
        'Чтение и запись\nуспешны?',
        'Активировать целевой профиль\nпосле сохранения его снимка',
        'Учёт выбранного профиля',
        'Ошибка;\nтекущий учёт\nне заменять',
    ),
    'transaction': checked_flow(
        'Сумма, дата, счёт, статус\nи связи операции',
        'Собрать запись и предметные связи;\nпроверить суммы, статусы\nи новый финансовый агрегат',
        'Все проверки\nпройдены?',
        'Вернуть новое состояние\nбез изменения исходного объекта',
        'Остатки, история\nи вклады в аналитику',
        'Ошибка;\nисходный учёт\nсохранить',
    ),
    'budget': checked_flow(
        'Категория, лимит,\nновый график и дата',
        'Определить прежний период\nи ближайшую будущую границу;\nпроверить конфликты лимитов',
        'Переход\nдопустим?',
        'Добавить версию; перенести остаток\nна границе по прежним условиям',
        'Период, лимит,\nперенос и расходы',
        'Ошибка;\nисторию бюджета\nне изменять',
    ),
    'goal': checked_flow(
        'Цель, сумма вывода,\nисточник и получатель',
        'Подготовить освобождение и перевод;\nпроверить накопленное, доступность\nи обеспеченность остальных целей',
        'Вывод\nдопустим?',
        'Вернуть освобождение и перевод\nодним состоянием формата 9',
        'Новые остатки и прогресс;\nистория взносов сохранена',
        'Ошибка;\nцели и счета\nне изменять',
    ),
    'occurrence': checked_flow(
        'План, версия условий\nи исходный ключ события',
        'Разрешить исходное событие\nи исторические условия;\nпроверить существующие отметки',
        'Факт уже\nзаписан?',
        'Провести ожидание, связать\nготовую операцию или создать факт;\nпроверить новый агрегат',
        'Согласованные план и факт\nбез повторного движения денег',
        'Вернуть\nпрежний учёт',
        side_label='Да', down_label='Нет',
    ),
    'forecast': forecast_flow(),
    'purchase': checked_flow(
        'Базовый прогноз, сумма,\nдата и повседневный счёт',
        'Проверить весь исходный горизонт:\nрезерв, достаточность счёта,\nпредупреждения и назначения',
        'Есть исходные\nпрепятствия?',
        'Дни справа налево: двоичный поиск\nс переоценкой остатка;\nминимум последующих пределов',
        'Предел покупки и ближайшая дата;\nреальная история не меняется',
        'Максимум 0;\nбезопасная дата\nне определена',
        side_label='Да', down_label='Нет',
    ),
    'csv': checked_flow(
        'Текст CSV, настройки\nи выбор строк',
        'Разобрать файл и повторить\nпредпросмотр на актуальном учёте;\nвыделить выбранные строки',
        'Весь пакет\nдопустим?',
        'Добавить все выбранные записи\nодним обновлением состояния',
        'Новый учёт\nи итог импорта',
        'Ошибка;\nисходный учёт\nсохранить',
    ),
    'backup': checked_flow(
        'Байты копии, пароль\nи профиль назначения',
        'Проверить формат и параметры;\nаутентифицировать при шифровании;\nпроверить финансовый снимок',
        'Кандидат проверен\nи подтверждён?',
        'Применить проверенный снимок;\nбольшую копию — в новый профиль',
        'Учёт\nи итог восстановления',
        'Отказ или отмена;\nдействующий учёт\nне заменять',
    ),
}


def main():
    paths = []
    for name, diagram in DIAGRAMS.items():
        path = HERE / f'chapter3-flow-{name}.svg'
        path.write_text(diagram.svg(), encoding='utf-8')
        paths.append(str(path))
    code = '''
const sharp = require(process.argv[1]);
const width = Number(process.argv[2]);
const paths = JSON.parse(process.argv[3]);
(async () => {
  for (const source of paths) {
    await sharp(source).resize({ width }).png().toFile(source.replace(/\\.svg$/, '.png'));
  }
})().catch((error) => { console.error(error); process.exit(1); });
'''
    subprocess.run([str(NODE), '-e', code, str(SHARP), str(PNG_WIDTH), json.dumps(paths)], check=True)
    for name, diagram in DIAGRAMS.items():
        print(f'{name}: {WIDTH}×{diagram.height}, height at 160 mm = {160*diagram.height/WIDTH:.1f} mm; minimum Arial {FONT_SIZE*160/WIDTH*72/25.4:.2f} pt')


if __name__ == '__main__':
    main()
