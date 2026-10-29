"""Draw the chapter 3 forecast chart from actual domain calculation output.

Run from repository root with the bundled Python runtime after:
  node --import tsx output/thesis/research/controls/forecast-control.ts
The chart uses the 30 calculated end-of-day points without synthetic smoothing.
"""
from pathlib import Path
import json
import subprocess
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parent
DATA = ROOT.parent / 'research/controls/forecast-control-results.json'
SVG = ROOT / 'chapter3-forecast-chart.svg'
PNG = ROOT / 'chapter3-forecast-chart.png'
DEPENDENCIES = Path.home() / '.cache/codex-runtimes/codex-primary-runtime/dependencies'
NODE = DEPENDENCIES / 'node/bin/node'
SHARP = DEPENDENCIES / 'node/node_modules/sharp'

payload = json.loads(DATA.read_text())
points = payload['chart']
assert len(points) == 30
assert points[0]['date'] == '2026-10-20'
assert points[-1]['date'] == '2026-11-18'
assert all(row['reserve'] == 500_000 for row in points)
base_min = min(points, key=lambda row: row['baseline'])
scenario_min = min(points, key=lambda row: row['scenario'])
assert base_min['baseline'] == 1_750_000
assert scenario_min['scenario'] == 1_700_000
assert points[-1]['scenario'] == 1_950_000

# At the document insertion width of 160 mm, 25 SVG px = 11.34 pt.
W, H = 1000, 620
LEFT, RIGHT, TOP, BOTTOM = 115, 950, 105, 430
MAX_RUB = 50_000

def x(i):
    return LEFT + (RIGHT - LEFT) * i / (len(points) - 1)

def y(minor_units):
    return BOTTOM - minor_units / 100 / MAX_RUB * (BOTTOM - TOP)

def fmt_rub(value):
    return f'{int(value):,}'.replace(',', ' ')

def date_label(value):
    return value[8:10] + '.' + value[5:7]

parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
 '<title>Сравнение базового прогноза и сценария с 20 октября по 18 ноября 2026 года</title>',
 '<desc>График построен из результатов forecast. Базовый минимум и итог 17500 рублей. Минимум сценария 17000 рублей 3 ноября, итог 19500 рублей. Резерв 5000 рублей.</desc>',
 '<rect width="1000" height="620" fill="white"/>',
 '<g font-family="Arial, sans-serif" font-size="25" fill="#111111">']

def line(x1, y1, x2, y2, attrs=''):
    parts.append(f'<line x1="{x1:.2f}" y1="{y1:.2f}" x2="{x2:.2f}" y2="{y2:.2f}" {attrs}/>')

def text(tx, ty, content, attrs=''):
    parts.append(f'<text x="{tx:.2f}" y="{ty:.2f}" {attrs}>{escape(content)}</text>')

# Legend relies on line pattern as well as shade, for monochrome printing.
line(45, 32, 115, 32, 'stroke="#111111" stroke-width="4"')
text(128, 40, 'Текущий план')
line(375, 32, 445, 32, 'stroke="#555555" stroke-width="4" stroke-dasharray="13 8"')
text(458, 40, 'Сценарий')
line(670, 32, 740, 32, 'stroke="#333333" stroke-width="3" stroke-dasharray="3 8"')
text(753, 40, 'Резерв 5 000')

text(LEFT - 3, 81, 'RUB')
for amount in range(0, MAX_RUB + 1, 10_000):
    yy = y(amount * 100)
    line(LEFT, yy, RIGHT, yy, 'stroke="#d6d6d6" stroke-width="1"')
    text(LEFT - 13, yy + 8, fmt_rub(amount), 'text-anchor="end"')
line(LEFT, TOP, LEFT, BOTTOM, 'stroke="#111111" stroke-width="1.5"')
line(LEFT, BOTTOM, RIGHT, BOTTOM, 'stroke="#111111" stroke-width="1.5"')
for i in [0, 5, 10, 15, 20, 25, 29]:
    xx = x(i)
    line(xx, BOTTOM, xx, BOTTOM + 8, 'stroke="#111111" stroke-width="1.5"')
    text(xx, BOTTOM + 36, date_label(points[i]['date']), 'text-anchor="middle"')
text((LEFT + RIGHT) / 2, 505, 'Дата', 'text-anchor="middle"')

reserve_y = y(points[0]['reserve'])
line(LEFT, reserve_y, RIGHT, reserve_y, 'stroke="#333333" stroke-width="3" stroke-dasharray="3 8"')
for field, colour, dash in [('baseline', '#111111', ''), ('scenario', '#555555', ' stroke-dasharray="13 8"')]:
    coords = ' '.join(f'{x(i):.2f},{y(row[field]):.2f}' for i, row in enumerate(points))
    parts.append(f'<polyline points="{coords}" fill="none" stroke="{colour}" stroke-width="4" stroke-linejoin="round"{dash}/>')

# Mark real minima and endpoints; numerical explanations below remain readable.
bi = next(i for i, row in enumerate(points) if row is base_min)
si = next(i for i, row in enumerate(points) if row is scenario_min)
parts.append(f'<circle cx="{x(bi):.2f}" cy="{y(base_min["baseline"]):.2f}" r="7" fill="#111111"/>')
for i, val in [(si, scenario_min['scenario']), (len(points)-1, points[-1]['scenario'])]:
    xx, yy, r = x(i), y(val), 8
    parts.append(f'<polygon points="{xx:.2f},{yy-r:.2f} {xx+r:.2f},{yy:.2f} {xx:.2f},{yy+r:.2f} {xx-r:.2f},{yy:.2f}" fill="white" stroke="#555555" stroke-width="3"/>')

text(45, 553, f'Текущий план: минимум = итог = {fmt_rub(base_min["baseline"]/100)} RUB ({date_label(base_min["date"])}).')
text(45, 593, f'Сценарий: минимум {fmt_rub(scenario_min["scenario"]/100)} RUB ({date_label(scenario_min["date"])}); итог {fmt_rub(points[-1]["scenario"]/100)} RUB.')
parts.extend(['</g>', '</svg>'])
SVG.write_text('\n'.join(parts) + '\n')
subprocess.run([str(NODE), '-e',
  'const sharp=require(process.argv[1]); sharp(process.argv[2]).resize({width:2000}).png().toFile(process.argv[3]).catch(e=>{console.error(e);process.exit(1)});',
  str(SHARP), str(SVG), str(PNG)], check=True)
print(f'Created {SVG.name}, {PNG.name}; 30 computed points; insertion size 160 × 99.2 mm; minimum text 11.34 pt.')
