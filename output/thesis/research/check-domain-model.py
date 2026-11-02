"""Independent audit of the conceptual UML model in thesis section 2.4.

The expected concepts and relations come from the agreed domain contract, not
from the renderer. This is a documentation audit, not an application test.
Text meaning and raster legibility require a separately recorded human review.
"""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET

from PIL import ImageFont

ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / 'figures/domain-models.json'
OUTPUT = ROOT / 'research/domain-model-checks.json'

# Conceptual properties deliberately differ from persisted TypeScript fields.
CLASS_ROWS = '''
Account|Счёт|вид: ВидСчёта;валюта: Код;/остаток: Деньги
Transaction|Операция|вид: ВидОперации;дата: Дата;сумма: Деньги;зачисление?: Деньги;статус: Статус
Category|Категория|название: Текст;архив: Логика
Split|Часть расхода|сумма: Деньги
Debt|Долг|вид: взят / выдан;/остаток: Деньги
Adjustment|Корректировка|дата: Дата;изменение: Деньги
Reconciliation|Сверка|дата: Дата;остаток: Деньги
Income|План дохода|название: Текст
Payment|План платежа|название: Текст
Goal|Цель|целевая сумма: Деньги;валюта: Код;/накоплено: Деньги
Terms|Условия плана|начало: Дата;конец?: Дата;сумма: Деньги
Schedule|График|единица: Период;интервал: Целое;опорная дата: Дата
FundCycle|Цикл фонда|дата платежа: Дата;статус: СтатусЦикла
Release|Освобождение накоплений|дата: Дата;сумма: Деньги
IncomeOverride|Уточнение дохода|ожидается?: Дата;пропуск: Логика
Budget|Бюджет|/доступно: Деньги
BudgetTerms|Условия бюджета|период: ПериодБюджета;лимит: Деньги;перенос: Правило
Scenario|Сценарий|название: Текст;горизонт: Дни
Change|Изменение сценария|сумма: Деньги;сдвиг: Дни;включено: Логика
Event|Разовое событие|вид: доход / расход;дата: Дата;сумма: Деньги;включено: Логика
PlannedTransfer|Плановый перевод|дата: Дата;списание: Деньги;зачисление: Деньги
Forecast|Прогноз|горизонт: Дни;резерв: Деньги;/минимум: Деньги
Purchase|Оценка покупки|/максимум: Деньги;/ближайшая дата?: Дата
'''
CLASSES = {}
for row in CLASS_ROWS.strip().splitlines():
    identifier, title, fields = row.split('|')
    CLASSES[identifier] = {'title': title, 'attributes': fields.split(';')}

DIAGRAMS = {
    '08-domain-ledger': {
        'full': 'Account Transaction Category Split Debt Adjustment Reconciliation'.split(),
        'context': [],
        'relations': '''
association|Account|Transaction|1|0..*|основной
association|Account|Transaction|0..1|0..*|получатель
association|Category|Transaction|1|0..*|
composition|Transaction|Split|1|0..*|
association|Category|Split|1|0..*|
association|Account|Debt|1|0..*|исходный
association|Debt|Transaction|0..1|0..*|
association|Account|Adjustment|1|0..*|
association|Account|Reconciliation|1|0..*|
association|Category|Category|0..1|0..*|родитель/подкатегории
association|Transaction|Transaction|0..1|0..*|покупка/возвраты
''',
    },
    '09-domain-plans': {
        'full': 'Income Payment Goal Terms Schedule FundCycle Release IncomeOverride'.split(),
        'context': ['Transaction'],
        'relations': '''
composition|Income|Terms|0..1|1..*|
composition|Payment|Terms|0..1|1..*|
composition|Goal|Terms|0..1|1..*|
composition|Terms|Schedule|1|0..1|
composition|Income|IncomeOverride|1|0..*|
association|Goal|FundCycle|1|0..*|
association|Goal|Release|1|0..*|
association|FundCycle|Release|0..1|0..1|
association|Transaction|Release|1|0..1|перевод
association|Payment|FundCycle|0..1|0..*|обязательство
association|Transaction|FundCycle|0..1|0..1|оплата
association|Goal|Transaction|0..1|0..*|взнос
''',
    },
    '10-domain-decisions': {
        'full': 'Budget BudgetTerms Scenario Change Event PlannedTransfer Forecast Purchase'.split(),
        'context': 'Category Account Payment Terms Debt'.split(),
        'relations': '''
association|Category|Budget|1|0..1|
composition|Budget|BudgetTerms|1|1..*|
association|Category|Payment|1|0..*|
composition|Payment|Terms|0..1|1..*|
composition|Scenario|Change|1|0..*|
composition|Scenario|Event|1|0..*|
dependency|Change|Terms|||
association|Account|Event|0..1|0..*|
association|Account|PlannedTransfer|1|0..*|источник
association|Account|PlannedTransfer|1|0..*|получатель
dependency|Forecast|Account|||
dependency|Forecast|Debt|||
dependency|Forecast|Terms|||
dependency|Forecast|Scenario|||
dependency|Forecast|PlannedTransfer|||
dependency|Purchase|Forecast|||
association|Account|Purchase|1|0..*|выбранный
''',
    },
}


def semantic_key(edge):
    return tuple(edge.get(k) or '' for k in
                 ('kind', 'source', 'target', 'sourceCardinality', 'targetCardinality'))


def normalized(text):
    return re.sub(r'\s+', ' ', text).strip()


def semantic_checks(model, check):
    diagrams = model.get('diagrams', [])
    check('semantic:exactly three agreed diagram views',
          Counter(d.get('id') for d in diagrams) == Counter(DIAGRAMS.keys()))
    all_nodes = [n for d in diagrams for n in d.get('nodes', [])]
    all_edges = [e for d in diagrams for e in d.get('edges', [])]
    check('semantic:23 concepts and 29 appearances',
          len(all_nodes) == 29 and {n.get('id') for n in all_nodes} == set(CLASSES))
    check('semantic:40 relationships, 39 unique conceptual relationships',
          len(all_edges) == 40 and len({semantic_key(e) + (e.get('role', ''), e.get('sourceRole', ''), e.get('targetRole', ''))
                                       for e in all_edges}) == 39)
    for diagram in diagrams:
        identifier = diagram.get('id')
        expected = DIAGRAMS.get(identifier)
        if not expected:
            continue
        nodes = diagram.get('nodes', [])
        edges = diagram.get('edges', [])
        check(identifier + ':complete distinct class set',
              Counter(n.get('id') for n in nodes) == Counter(expected['full'] + expected['context']))
        for node in nodes:
            contract = CLASSES.get(node.get('id'), {})
            context = node.get('id') in expected['context']
            check(identifier + ':class:' + str(node.get('id')),
                  normalized(node.get('title', '')) == contract.get('title') and
                  bool(node.get('context')) == context and
                  node.get('attributes', []) == ([] if context else contract.get('attributes')))
        rows = [row.split('|') for row in expected['relations'].strip().splitlines()]
        check(identifier + ':all relations have the agreed kind, direction and endpoint multiplicities',
              Counter(semantic_key(e) for e in edges) == Counter(tuple(r[:5]) for r in rows))
        role_errors = []
        for row in rows:
            role = row[5]
            if not role:
                continue
            matches = [e for e in edges if semantic_key(e) == tuple(row[:5])]
            if not any(role in (e.get('role'), '/'.join((e.get('sourceRole', ''), e.get('targetRole', ''))))
                       for e in matches):
                role_errors.append(role)
        check(identifier + ':parallel and self-association roles remain distinguishable', not role_errors, str(role_errors))
        check(identifier + ':edge identifiers are distinct within the view',
              len({e.get('id') for e in edges}) == len(edges))
        reached = {nodes[0]['id']} if nodes else set()
        while True:
            expanded = reached | {e[k] for e in edges if e['source'] in reached or e['target'] in reached for k in ('source', 'target')}
            if expanded == reached:
                break
            reached = expanded
        check(identifier + ':one connected conceptual view without isolated classes', reached == {n['id'] for n in nodes})
    check('semantic:no budget subtraction dependency on forecast',
          not any({e.get('source'), e.get('target')} == {'Budget', 'Forecast'} for e in all_edges))
    check('semantic:no automatic planned-to-actual transfer association',
          not any({e.get('source'), e.get('target')} == {'PlannedTransfer', 'Transaction'} for e in all_edges))
    check('semantic:scenario change depends on current conditions without a persisted-version association',
          [semantic_key(e) for e in all_edges if e.get('source') == 'Change' and e.get('target') == 'Terms'] ==
          [('dependency', 'Change', 'Terms', '', '')])


def inside(box, area, epsilon=0.05):
    return all(box[k] >= area[k] - epsilon and box[k] + box[size] <= area[k] + area[size] + epsilon
               for k, size in [('x', 'width'), ('y', 'height')])


def overlap(a, b, epsilon=0.05):
    return all(min(a[k] + a[size], b[k] + b[size]) > max(a[k], b[k]) + epsilon
               for k, size in [('x', 'width'), ('y', 'height')])


def segment_box(a, b, box, epsilon=0.05):
    lower, upper = 0.0, 1.0
    for axis, coordinate, dimension in [(0, 'x', 'width'), (1, 'y', 'height')]:
        minimum, maximum = box[coordinate] + epsilon, box[coordinate] + box[dimension] - epsilon
        delta = b[axis] - a[axis]
        if abs(delta) <= epsilon:
            if not minimum < a[axis] < maximum:
                return False
        else:
            enter, leave = sorted(((minimum - a[axis]) / delta, (maximum - a[axis]) / delta))
            lower, upper = max(lower, enter), min(upper, leave)
            if lower >= upper:
                return False
    return lower < upper


def svg_texts(root):
    """Measure actual SVG text with Arial; do not trust renderer label boxes."""
    measured, errors = [], []
    font_cache = {}

    def walk(element, inherited, ownership):
        style = dict(inherited)
        style.update(dict(part.split(':', 1) for part in element.get('style', '').split(';') if ':' in part))
        for key in ('font-family', 'font-size', 'font-weight', 'text-anchor'):
            if key in element.attrib:
                style[key] = element.attrib[key]
        owner = dict(ownership)
        for attribute in ('data-class', 'data-attribute', 'data-relation', 'data-label-kind'):
            if attribute in element.attrib:
                owner[attribute] = element.attrib[attribute]
        if element.get('data-label-relation'):
            owner['data-relation'] = element.get('data-label-relation')
        local = element.tag.rsplit('}', 1)[-1]
        rotation = None
        if element.get('transform'):
            match = re.fullmatch(r'rotate\((-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\)', element.get('transform'))
            if local == 'text' and match and float(match[1]) in (-90, 90):
                rotation = tuple(float(match[i]) for i in (1, 2, 3))
            else:
                errors.append('unsupported transform: ' + element.get('transform'))
        if local == 'text':
            value = ''.join(element.itertext())
            if list(element) or 'x' not in element.attrib or 'y' not in element.attrib:
                errors.append('unsupported text coordinates: ' + value)
                return
            size = float(style.get('font-size', 0))
            bold = style.get('font-weight') in ('bold', '600', '700')
            if size <= 0 or style.get('font-family', '').split(',')[0].strip(' "\'') != 'Arial':
                errors.append('unknown font: ' + value)
                return
            key = (size, bold)
            if key not in font_cache:
                name = 'Arial Bold.ttf' if bold else 'Arial.ttf'
                font_cache[key] = ImageFont.truetype('/System/Library/Fonts/Supplemental/' + name, round(size * 4))
            font = font_cache[key]
            left, top, right, bottom = (v / 4 for v in font.getbbox(value, anchor='ls'))
            advance = font.getlength(value) / 4
            anchor = style.get('text-anchor', 'start')
            x = float(element.get('x')) - (advance / 2 if anchor == 'middle' else advance if anchor == 'end' else 0)
            y = float(element.get('y'))
            corners = [(x + dx, y + dy) for dx in (left, right) for dy in (top, bottom)]
            if rotation:
                angle, cx, cy = rotation
                sign = 1 if angle == 90 else -1
                corners = [(cx - sign * (py - cy), cy + sign * (px - cx)) for px, py in corners]
            xs, ys = [p[0] for p in corners], [p[1] for p in corners]
            measured.append({'text': value, 'fontSize': size, 'bold': bold,
                             'x': min(xs), 'y': min(ys), 'width': max(xs) - min(xs), 'height': max(ys) - min(ys), **owner})
        for child in element:
            walk(child, style, owner)

    walk(root, {}, {})
    return measured, errors


def marker_checks(root, diagram, texts, check):
    prefix = diagram['id'] + ':'
    edges = {e['id']: e for e in diagram['edges']}
    markers, errors = [], []
    for attribute, kind in [('data-composition', 'composition'), ('data-dependency-arrow', 'dependency')]:
        groups = [g for g in root.iter() if g.get(attribute)]
        expected = {e['id'] for e in edges.values() if e['kind'] == kind}
        check(prefix + kind + ' markers exist only for the agreed relations',
              Counter(g.get(attribute) for g in groups) == Counter(expected))
        for group in groups:
            identifier = group.get(attribute)
            edge = edges.get(identifier)
            shape = next(iter(group), None)
            if edge is None or shape is None:
                errors.append(identifier)
                continue
            numbers = [float(x) for x in re.findall(r'-?\d+(?:\.\d+)?', shape.get('points', ''))]
            points = list(zip(numbers[::2], numbers[1::2]))
            anchor = edge['points'][0 if kind == 'composition' else -1]
            if len(points) != (4 if kind == 'composition' else 3):
                errors.append(identifier + ':wrong marker shape')
                continue
            if min(sum((p[i] - anchor[i]) ** 2 for i in (0, 1)) ** 0.5 for p in points) > 0.05:
                errors.append(identifier + ':marker at wrong endpoint')
            if kind == 'composition':
                lengths = [sum((b[k] - a[k]) ** 2 for k in (0, 1)) for a, b in zip(points, points[1:] + points[:1])]
                if shape.tag.rsplit('}', 1)[-1] != 'polygon' or shape.get('fill') not in ('black', '#000', '#000000') or max(lengths) - min(lengths) > 0.1:
                    errors.append(identifier + ':owner marker is not a filled rhombus')
                for axis in (0, 1):
                    if abs(points[0][axis] + points[2][axis] - points[1][axis] - points[3][axis]) > 0.05:
                        errors.append(identifier + ':asymmetric rhombus')
            else:
                if any(abs(points[1][i] - anchor[i]) > 0.05 for i in (0, 1)):
                    errors.append(identifier + ':arrow does not point to its dependency target')
                previous = edge['points'][-2]
                direction = [anchor[i] - previous[i] for i in (0, 1)]
                if any(sum((p[i] - anchor[i]) * direction[i] for i in (0, 1)) >= 0 for p in (points[0], points[-1])):
                    errors.append(identifier + ':arrow arms point in the wrong direction')
            xs, ys = [p[0] for p in points], [p[1] for p in points]
            markers.append({'id': identifier, 'x': min(xs), 'y': min(ys), 'width': max(xs) - min(xs),
                            'height': max(ys) - min(ys), 'points': points, 'kind': kind})
    check(prefix + 'filled diamonds identify owners and dependency arrows identify targets', not errors, str(errors))
    text_hits = [(m['id'], t['text']) for m in markers for t in texts if overlap(m, t)]
    check(prefix + 'relationship markers do not overlap text', not text_hits, str(text_hits))


def puml_checks(model, check):
    hashes = {}
    for diagram in model['diagrams']:
        path = ROOT / f"figures/{diagram['id']}.puml"
        check(diagram['id'] + ':PUML source exists', path.exists())
        if not path.exists():
            continue
        source = path.read_text()
        parsed_classes = []
        for title, identifier, body in re.findall(r'class "([^\"]+)" as (\w+)\s*\{([^}]*)\}', source, re.S):
            parsed_classes.append((identifier, normalized(title.replace('\\n', ' ')),
                                   tuple(normalized(row) for row in body.splitlines() if row.strip())))
        expected_classes = [(n['id'], normalized(n['title']), tuple(n['attributes'])) for n in diagram['nodes']]
        check(diagram['id'] + ':PUML classes and attributes agree with the conceptual contract',
              Counter(parsed_classes) == Counter(expected_classes))
        parsed_edges = []
        for row in source.splitlines():
            match = re.fullmatch(r'(\w+)(?: "([^\"]+)")? (\*--|--|\.\.>)(?: "([^\"]+)")? (\w+)(?: : (.+))?', row)
            if match:
                a, ca, symbol, cb, b, role = match.groups()
                parsed_edges.append(({'*--': 'composition', '--': 'association', '..>': 'dependency'}[symbol],
                                     a, b, ca or '', cb or '', re.sub(r'\s*/\s*', '/', role or '')))
        expected_edges = []
        for edge in diagram['edges']:
            role = edge.get('role') or ' / '.join(edge[k] for k in ('sourceRole', 'targetRole') if edge.get(k))
            expected_edges.append(semantic_key(edge) + (re.sub(r'\s*/\s*', '/', role),))
        check(diagram['id'] + ':PUML includes every relationship, role and endpoint multiplicity',
              Counter(parsed_edges) == Counter(expected_edges))
        check(diagram['id'] + ':PUML has no methods, note blocks or legends',
              not re.search(r'^\s*(?:note\b|legend\b)|^\s*\w+\([^)]*\)', source, re.M))
        hashes[path.name] = hashlib.sha256(path.read_bytes()).hexdigest()
    return hashes


def geometry_checks(model, check):
    hashes, summaries = {}, []
    check('geometry:common 160 mm print width', model.get('widthMm') == 160)
    for diagram in model.get('diagrams', []):
        identifier = diagram['id']
        prefix = identifier + ':'
        nodes, edges = diagram['nodes'], diagram['edges']
        by_id = {n['id']: n for n in nodes}
        canvas = {'x': 0, 'y': 0, 'width': diagram['width'], 'height': diagram['height']}
        check(prefix + 'portrait A4 print area', diagram['width'] == 800 and diagram['height'] > 0 and
              diagram['height'] * model['widthMm'] / diagram['width'] <= 240)
        check(prefix + 'all class cards wholly inside canvas', all(inside(n, canvas) for n in nodes))
        collisions = [(a['id'], b['id']) for i, a in enumerate(nodes) for b in nodes[i + 1:] if overlap(a, b)]
        check(prefix + 'class cards do not overlap', not collisions, str(collisions))
        endpoint_errors, through_cards = [], []
        for edge in edges:
            points = edge.get('points', [])
            if len(points) < 2 or any(not (0 <= p[0] <= canvas['width'] and 0 <= p[1] <= canvas['height']) for p in points):
                endpoint_errors.append(edge['id'] + ':invalid route')
                continue
            for point, endpoint in [(points[0], edge['source']), (points[-1], edge['target'])]:
                node = by_id[endpoint]
                x, y = point
                on_border = ((abs(x - node['x']) < 0.05 or abs(x - node['x'] - node['width']) < 0.05) and
                             node['y'] - 0.05 <= y <= node['y'] + node['height'] + 0.05) or (
                                 (abs(y - node['y']) < 0.05 or abs(y - node['y'] - node['height']) < 0.05) and
                                 node['x'] - 0.05 <= x <= node['x'] + node['width'] + 0.05)
                if not on_border:
                    endpoint_errors.append(edge['id'] + ':' + endpoint)
            through_cards.extend((edge['id'], n['id']) for n in nodes
                                 if any(segment_box(a, b, n) for a, b in zip(points, points[1:])))
        check(prefix + 'routes attach to the declared endpoint cards', not endpoint_errors, str(endpoint_errors))
        check(prefix + 'no route passes through any class card', not through_cards, str(through_cards))
        svg_path = ROOT / f'figures/{identifier}.svg'
        check(prefix + 'SVG exists', svg_path.exists())
        if not svg_path.exists():
            continue
        root = ET.parse(svg_path).getroot()
        check(prefix + 'SVG has exact canvas viewBox',
              [float(v) for v in root.get('viewBox', '').split()] == [0, 0, diagram['width'], diagram['height']])
        texts, unsupported = svg_texts(root)
        check(prefix + 'actual SVG text can be independently measured', not unsupported, str(unsupported))
        unowned = [t['text'] for t in texts if 'data-class' not in t and 'data-relation' not in t]
        check(prefix + 'no notes, legends or unrelated text blocks', not unowned, str(unowned))
        class_groups = [g for g in root.iter() if g.get('data-class')]
        check(prefix + 'all class groups visible exactly once',
              Counter(g.get('data-class') for g in class_groups) == Counter(by_id.keys()))
        content_errors = []
        for node in nodes:
            own = [t for t in texts if t.get('data-class') == node['id']]
            title = normalized(' '.join(t['text'] for t in own if 'data-attribute' not in t))
            if title != normalized(node['title']):
                content_errors.append(node['id'] + ':title split or altered')
            actual_indices = {t['data-attribute'] for t in own if 'data-attribute' in t}
            if actual_indices != {str(i) for i in range(len(node['attributes']))}:
                content_errors.append(node['id'] + ':missing/extra attributes')
            for i, attribute in enumerate(node['attributes']):
                value = normalized(' '.join(t['text'] for t in own if t.get('data-attribute') == str(i)))
                if value != normalized(attribute):
                    content_errors.append(node['id'] + ':' + attribute)
            if not all(inside(t, node) for t in own):
                content_errors.append(node['id'] + ':glyphs outside card')
            group = next((g for g in class_groups if g.get('data-class') == node['id']), None)
            rect = next((r for r in group if r.tag.endswith('rect')), None) if group is not None else None
            if rect is None or any(k not in rect.attrib or abs(float(rect.get(k)) - node[k]) > 0.05 for k in ('x', 'y', 'width', 'height')):
                content_errors.append(node['id'] + ':actual card boundary differs from model')
        check(prefix + 'actual SVG titles and properties match the independent contract', not content_errors, str(content_errors))
        route_groups = [g for g in root.iter() if g.get('data-relation') and g.tag.endswith('g')]
        check(prefix + 'every relation has exactly one SVG group',
              Counter(g.get('data-relation') for g in route_groups) == Counter(e['id'] for e in edges))
        route_errors = []
        edge_by_id = {e['id']: e for e in edges}
        for group in route_groups:
            edge = edge_by_id.get(group.get('data-relation'))
            if not edge:
                continue
            if any(group.get('data-' + k) != edge[k] for k in ('source', 'target', 'kind')):
                route_errors.append(edge['id'] + ':wrong semantic endpoints')
            path = next((p for p in group if p.tag.rsplit('}', 1)[-1] in ('path', 'polyline') and
                         p.get('stroke') not in (None, 'none', 'white', '#fff', '#ffffff')), None)
            values = [float(v) for v in re.findall(r'-?\d+(?:\.\d+)?', path.get('points', path.get('d', '')))] if path is not None else []
            expected = [v for point in edge['points'] for v in point]
            if len(values) != len(expected) or any(abs(a - b) > 0.05 for a, b in zip(values, expected)):
                route_errors.append(edge['id'] + ':SVG path differs from route')
            if path is None or bool(path.get('stroke-dasharray')) != (edge['kind'] == 'dependency'):
                route_errors.append(edge['id'] + ':dependency line style')
            labels = [t for t in texts if t.get('data-relation') == edge['id']]
            for endpoint in ('sourceCardinality', 'targetCardinality'):
                actual = [t['text'] for t in labels if t.get('data-label-kind') == endpoint]
                desired = [] if edge['kind'] == 'dependency' else [edge[endpoint]]
                if actual != desired:
                    route_errors.append(edge['id'] + ':' + endpoint)
            for role in ('role', 'sourceRole', 'targetRole'):
                actual = normalized(' '.join(t['text'] for t in labels if t.get('data-label-kind') == role))
                if actual != (edge.get(role) or ''):
                    route_errors.append(edge['id'] + ':' + role)
        check(prefix + 'visible SVG paths, multiplicities and roles match their conceptual relations', not route_errors, str(route_errors))
        clipped = [t['text'] for t in texts if not inside(t, canvas)]
        overlaps = [(a['text'], b['text']) for i, a in enumerate(texts) for b in texts[i + 1:] if overlap(a, b)]
        under_text = [(e['id'], t['text']) for e in edges for t in texts
                      if t.get('data-relation') != e['id'] and
                      any(segment_box(a, b, t) for a, b in zip(e['points'], e['points'][1:]))]
        check(prefix + 'no clipped text', not clipped, str(clipped))
        check(prefix + 'no overlapping text glyphs', not overlaps, str(overlaps))
        check(prefix + 'no route passes through another label or class text', not under_text, str(under_text))
        marker_checks(root, diagram, texts, check)
        hidden_routes = []
        for group in (g for g in root.iter() if g.get('data-label-relation')):
            edge_id = group.get('data-label-relation')
            for rect in (r for r in group if r.tag.endswith('rect') and r.get('fill') in ('white', '#fff', '#ffffff')):
                box = {k: float(rect.get(k)) for k in ('x', 'y', 'width', 'height')}
                hidden_routes.extend((edge_id, e['id']) for e in edges if e['id'] != edge_id and
                                     any(segment_box(a, b, box) for a, b in zip(e['points'], e['points'][1:])))
        check(prefix + 'label backgrounds do not hide unrelated routes', not hidden_routes, str(hidden_routes))
        scale = model['widthMm'] / diagram['width'] / 25.4 * 72
        fields = [t['fontSize'] * scale for t in texts if t.get('data-class')]
        labels = [t['fontSize'] * scale for t in texts if t.get('data-relation')]
        check(prefix + 'print size keeps classes at 11.3 pt and labels at 10.7 pt',
              bool(fields) and min(fields) >= 11.3 and bool(labels) and min(labels) >= 10.7)
        hashes[svg_path.name] = hashlib.sha256(svg_path.read_bytes()).hexdigest()
        summaries.append({'diagram': identifier, 'classes': len(nodes), 'relations': len(edges),
                          'height_mm': diagram['height'] * model['widthMm'] / diagram['width'],
                          'minimum_class_font_pt': min(fields) if fields else None,
                          'minimum_label_font_pt': min(labels) if labels else None})
    return {'diagrams': summaries, 'svg_sha256': hashes}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=OUTPUT)
    args = parser.parse_args()
    model = json.loads(MODEL.read_text())
    checks = []

    def check(name, passed, detail=''):
        checks.append({'name': name, 'passed': bool(passed), 'detail': detail})

    semantic_checks(model, check)
    geometry = geometry_checks(model, check)
    puml_hashes = puml_checks(model, check)
    thesis = (ROOT / 'thesis.md').read_text()
    section = thesis.split('## 2.4 ', 1)[1].split('\n# 3 ', 1)[0]
    section_hash = hashlib.sha256(section.encode()).hexdigest()
    section_line = len(thesis.split('## 2.4 ', 1)[0].splitlines()) + 1
    png_hashes = {d['id']: hashlib.sha256((ROOT / f"figures/{d['id']}.png").read_bytes()).hexdigest()
                  for d in model['diagrams'] if (ROOT / f"figures/{d['id']}.png").exists()}
    source_files = [
        'src/domain/types.ts', 'src/domain/debts.ts', 'src/domain/reconciliation.ts',
        'src/domain/planHistory.ts', 'src/domain/goals.ts', 'src/domain/incomes.ts',
        'src/domain/goalFunds.ts', 'src/domain/budgets.ts', 'src/domain/scenarios.ts',
        'src/domain/forecast.ts', 'src/domain/purchasePlanner.ts',
        'src/domain/actions/incomes.ts', 'src/domain/actions/goalFunds.ts',
        'src/domain/actions/goals.ts', 'src/domain/actions/budgets.ts', 'src/domain/actions/scenarios.ts',
    ]
    source_hashes = {name: hashlib.sha256((ROOT.parents[1] / name).read_bytes()).hexdigest() for name in source_files}
    report = {
        'scope': 'Independent conceptual-model documentation audit; no application tests executed',
        'model_sha256': hashlib.sha256(MODEL.read_bytes()).hexdigest(),
        'checks': checks,
        'passed': sum(item['passed'] for item in checks),
        'total': len(checks),
        'geometry': geometry,
        'puml_sha256': puml_hashes,
        'png_sha256': png_hashes,
        'section_2_4': {'sha256': section_hash, 'start_line': section_line},
        'source_sha256': source_hashes,
        'text_review': {'required': True},
        'visual_review': {'required': True},
    }
    previous = json.loads(args.output.read_text()) if args.output.exists() else {}
    if previous.get('section_2_4', {}).get('sha256') == section_hash and previous.get('source_sha256') == source_hashes:
        report['text_review'] = previous.get('text_review', {'required': True})
    if (previous.get('geometry') == geometry and previous.get('png_sha256') == png_hashes and
            previous.get('model_sha256') == report['model_sha256'] and report['passed'] == report['total']):
        report['visual_review'] = previous.get('visual_review', {'required': True})
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(f"{report['passed']}/{report['total']} domain-model checks passed")
    for item in checks:
        if not item['passed']:
            print('FAIL', item['name'], item['detail'])
    return 0 if report['passed'] == report['total'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
