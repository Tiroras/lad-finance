"""Independent ER contracts derived from the TypeScript model and validators.

This audits the diagram data only; it is not an application test.
"""
import argparse
from collections import Counter
import hashlib
import json
import re
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
REPOSITORY = ROOT.parents[1]
MODEL = ROOT / 'figures/er-model.json'
OUTPUT = ROOT / 'research/er-model-checks.json'

# One profile is the scope. Endpoint multiplicities are independent of drawing.
# columns: source, target, source cardinality, target cardinality, relation kind.
CONTRACT = '''
Profile Settings 1 1 composition
Settings Forecast 1 0..1 composition
Settings Rate 1 0..* composition
Rate Currency 0..1 1 reference
Settings Currency 0..1 1 reference
Settings Income 0..1 0..1 reference
Account Currency 0..* 1 reference
Goal Currency 0..* 1 reference
Debt Currency 0..* 1 reference
Transaction Account 0..* 1 reference
Transaction Account 0..* 0..1 reference
Transaction Category 0..* 1 reference
Transaction Split 1 0..* composition
Split Category 0..* 1 reference
Transaction Transaction 0..* 0..1 reference
Transaction Debt 0..* 0..1 reference
Debt Account 0..* 1 reference
Adjustment Account 0..* 1 reference
Reconciliation Account 0..* 1 reference
Category Category 0..* 0..1 reference
Budget Category 0..1 1 reference
Budget BudgetVersion 1 0..* composition
Goal GoalVersion 1 0..* composition
Payment PaymentVersion 1 0..* composition
Income IncomeVersion 1 0..* composition
Income IncomeOverride 1 0..* composition
IncomeOverride IncomeVersion 0..* 0..1 reference
Payment Account 0..* 1 reference
Payment Category 0..* 1 reference
PaymentVersion Account 0..* 1 reference
PaymentVersion Category 0..* 1 reference
Income Account 0..* 1 reference
IncomeVersion Account 0..* 1 reference
Transaction Goal 0..* 0..1 reference
Transaction GoalVersion 0..* 0..1 reference
Transaction Payment 0..* 0..1 reference
Transaction PaymentVersion 0..* 0..1 reference
Transaction Income 0..* 0..1 reference
Transaction IncomeVersion 0..* 0..1 reference
Cycle Goal 0..* 1 reference
Cycle Payment 0..* 0..1 reference
Cycle PaymentVersion 0..* 0..1 reference
Cycle Transaction 0..1 0..1 reference
Release Goal 0..* 1 reference
Release Cycle 0..1 0..1 reference
Release Transaction 0..1 1 reference
Scenario Change 1 0..* composition
Scenario Event 1 0..* composition
Event Account 0..* 0..1 reference
Change Goal 0..* 0..1 soft
Change Payment 0..* 0..1 soft
Change Income 0..* 0..1 soft
Change Currency 0..* 0..1 reference
Rule Category 0..* 1 reference
Template Account 0..* 1 reference
Template Account 0..* 0..1 reference
Template Category 0..* 1 reference
Template Currency 0..* 1 reference
Template Currency 0..* 0..1 reference
Template TemplateSplit 1 0..* composition
TemplateSplit Category 0..* 1 reference
Csv Account 0..* 1 reference
Csv Currency 0..* 1 reference
Forecast Account 0..1 0..1 reference
Forecast GoalAssignment 1 0..* composition
Forecast Repayment 1 0..* composition
Forecast Transfer 1 0..* composition
GoalAssignment Goal 0..1 1 reference
GoalAssignment Account 0..* 1 reference
GoalAssignment Account 0..* 1 reference
Repayment Account 0..* 1 reference
Repayment Account 0..1 0..1 reference
Repayment Debt 0..1 0..1 reference
Transfer Account 0..* 1 reference
Transfer Account 0..* 1 reference
'''
KEYS = {
    'Profile': 'id', 'Settings': 'профиль', 'Forecast': 'профиль',
    'Currency': 'код', 'Rate': 'профиль + код', 'Account': 'id',
    'Category': 'id', 'Transaction': 'id',
    'Split': 'операция + категория', 'Debt': 'id',
    'Adjustment': 'id', 'Reconciliation': 'id', 'Goal': 'id',
    'GoalVersion': 'цель + id', 'Payment': 'id',
    'PaymentVersion': 'платёж + id', 'Income': 'id',
    'IncomeVersion': 'доход + id',
    'IncomeOverride': 'план + версия + дата', 'Cycle': 'id',
    'Release': 'id', 'Budget': 'categoryId',
    'BudgetVersion': 'бюджет + id', 'Scenario': 'id',
    'Change': 'сценарий + вид + источник', 'Event': 'сценарий + id',
    'Rule': 'id', 'Template': 'id',
    'TemplateSplit': 'шаблон + категория', 'Csv': 'id',
    'GoalAssignment': 'goalId', 'Repayment': 'вид + источник',
    'Transfer': 'id',
}
COLLECTIONS = {
    'accounts': 'Account', 'transactions': 'Transaction',
    'categories': 'Category', 'goals': 'Goal',
    'goalFundCycles': 'Cycle', 'goalReleases': 'Release',
    'recurring': 'Payment', 'plannedIncomes': 'Income',
    'scenarios': 'Scenario', 'categoryRules': 'Rule',
    'transactionTemplates': 'Template', 'csvProfiles': 'Csv',
    'balanceAdjustments': 'Adjustment', 'reconciliations': 'Reconciliation',
    'budgetPlans': 'Budget', 'debts': 'Debt',
}

def geometry_checks(model, check):
    """Compare the drawing, seam manifest and each SVG, not only their counts."""
    geometry = model.get('geometry', {})
    tiles = model.get('tiles', [])
    nodes = {node['id']: node for node in model['nodes']}
    relationships = geometry.get('relationships', [])
    crossings = geometry.get('crossings', [])
    edges = {edge['id']: edge for edge in model['edges']}
    epsilon = 0.001

    def within(node, tile):
        return (node['x'] >= tile['x'] - epsilon and
                node['y'] >= tile['y'] - epsilon and
                node['x'] + node['width'] <= tile['x'] + tile['width'] + epsilon and
                node['y'] + node['height'] <= tile['y'] + tile['height'] + epsilon)

    def intersects(a, b):
        return (min(a['x'] + a['width'], b['x'] + b['width']) >
                max(a['x'], b['x']) + epsilon and
                min(a['y'] + a['height'], b['y'] + b['height']) >
                max(a['y'], b['y']) + epsilon)

    def segment_enters_card(a, b, node):
        """Segment/slab clipping, with card borders excluded from its interior."""
        lower, upper = 0, 1
        for axis, coordinate, dimension in [(0, 'x', 'width'), (1, 'y', 'height')]:
            minimum = node[coordinate] + epsilon
            maximum = node[coordinate] + node[dimension] - epsilon
            delta = b[axis] - a[axis]
            if abs(delta) <= epsilon:
                if not minimum < a[axis] < maximum:
                    return False
            else:
                entering, leaving = sorted(((minimum - a[axis]) / delta,
                                            (maximum - a[axis]) / delta))
                lower, upper = max(lower, entering), min(upper, leaving)
                if lower >= upper:
                    return False
        return lower < upper

    check('geometry:four tiles in a complete 2 by 2 arrangement',
          len(tiles) == 4 and
          {(t['row'], t['column']) for t in tiles} == {(0, 0), (0, 1), (1, 0), (1, 1)})
    check('geometry:equal A4-fragment scale and no inter-tile gaps',
          all(t['width'] == 454 and t['height'] == 582 and
              t['x'] == t['column'] * 454 and t['y'] == t['row'] * 582
              for t in tiles))
    assignments = {node_id: [t['id'] for t in tiles if within(node, t)]
                   for node_id, node in nodes.items()}
    check('geometry:all 33 entities wholly within exactly one tile',
          all(len(t) == 1 for t in assignments.values()),
          str({n: t for n, t in assignments.items() if len(t) != 1}))
    check('geometry:tile node manifests agree with bounding boxes',
          all(set(t['nodes']) == {n for n, assigned in assignments.items()
                                  if t['id'] in assigned} for t in tiles))
    node_list = list(nodes.values())
    overlap = [(a['id'], b['id']) for i, a in enumerate(node_list)
               for b in node_list[i + 1:] if intersects(a, b)]
    check('geometry:no overlapping entity cards', not overlap, str(overlap))
    check('geometry:all 75 relationships have one route',
          Counter(r['id'] for r in relationships) == Counter(edges.keys()))
    endpoint_errors = []
    for route in relationships:
        edge = edges.get(route['id'])
        if not edge:
            endpoint_errors.append(route['id'])
            continue
        points = route['points']
        if len(points) < 2 or points[0] != route['ap'] or points[-1] != route['bp']:
            endpoint_errors.append(route['id'])
        for point, side, node in [(route['ap'], route['as'], nodes[edge['source']]),
                                  (route['bp'], route['bs'], nodes[edge['target']])]:
            if side in ('left', 'right'):
                expected = node['x'] + (node['width'] if side == 'right' else 0)
                ok = abs(point[0] - expected) <= epsilon and node['y'] <= point[1] <= node['y'] + node['height']
            elif side in ('top', 'bottom'):
                expected = node['y'] + (node['height'] if side == 'bottom' else 0)
                ok = abs(point[1] - expected) <= epsilon and node['x'] <= point[0] <= node['x'] + node['width']
            else:
                ok = False
            if not ok:
                endpoint_errors.append(route['id'])
    check('geometry:route endpoints attach to their declared entity borders',
          not endpoint_errors, str(endpoint_errors))
    check('geometry:all route coordinates inside assembled canvas',
          all(0 <= x <= 908 and 0 <= y <= 1164 for r in relationships for x, y in r['points']))
    through_cards = [(r['id'], n['id']) for r in relationships for n in node_list
                     if any(segment_enters_card(a, b, n)
                            for a, b in zip(r['points'], r['points'][1:]))]
    check('geometry:no relationship line passes through an entity card',
          not through_cards, str(through_cards))

    # Seams lie between routing-grid coordinates. Derive actual intersections
    # independently from each route rather than trusting declared stitch totals.
    actual = []
    for route in relationships:
        for a, b in zip(route['points'], route['points'][1:]):
            for axis, boundary in [(0, 454), (1, 582)]:
                if min(a[axis], b[axis]) < boundary < max(a[axis], b[axis]):
                    fraction = (boundary - a[axis]) / (b[axis] - a[axis])
                    point = tuple(round(a[k] + fraction * (b[k] - a[k]), 6) for k in (0, 1))
                    actual.append((route['id'], axis, point))
    declared = [(c['edgeId'], c['axis'], tuple(round(v, 6) for v in c['point']))
                for c in crossings]
    check('geometry:every crossed seam has exactly one manifest entry',
          Counter(actual) == Counter(declared),
          f'route crossings={len(actual)}; manifest crossings={len(declared)}')
    check('geometry:stitch IDs unique', len({c['id'] for c in crossings}) == len(crossings))

    tile_by_id = {t['id']: t for t in tiles}
    adjacency_errors = []
    for crossing in crossings:
        pair = crossing['tiles']
        if len(set(pair)) != 2 or not all(i in tile_by_id for i in pair):
            adjacency_errors.append(crossing['id'])
            continue
        a, b = [tile_by_id[i] for i in pair]
        axis = crossing['axis']
        if axis == 0:
            ok = a['row'] == b['row'] and abs(a['column'] - b['column']) == 1
            ok = ok and abs(crossing['point'][0] - 454) <= epsilon
        else:
            ok = a['column'] == b['column'] and abs(a['row'] - b['row']) == 1
            ok = ok and abs(crossing['point'][1] - 582) <= epsilon
        if not ok:
            adjacency_errors.append(crossing['id'])
    check('geometry:stitches join adjacent tiles on the shared boundary',
          not adjacency_errors, str(adjacency_errors))

    full_svg = ROOT / 'figures/04-er-complete.svg'
    check('geometry:complete SVG exists', full_svg.exists())
    hashes = {}
    if full_svg.exists():
        tree = ET.parse(full_svg)
        route_groups = [g for g in tree.iter() if g.get('data-source') and g.get('data-relation')]
        check('geometry:75 visible SVG relationship groups',
              Counter(g.get('data-relation') for g in route_groups) == Counter(edges.keys()))
        check('geometry:all SVG relationship groups contain a visible line',
              all(any(p.tag.endswith('path') and p.get('d') and
                      p.get('stroke') not in (None, 'none', 'white', '#fff', '#ffffff')
                      for p in g) for g in route_groups))
        check('geometry:all 33 entity cards in complete SVG',
              Counter(g.get('data-entity') for g in tree.iter() if g.get('data-entity')) == Counter(nodes.keys()))
        route_by_id = {r['id']: r for r in relationships}
        path_errors = []
        for group in route_groups:
            path = next((p for p in group if p.tag.endswith('path') and
                         p.get('stroke') not in (None, 'none', 'white', '#fff', '#ffffff')), None)
            actual_points = [float(n) for n in re.findall(r'-?\d+(?:\.\d+)?', path.get('d', ''))] if path is not None else []
            expected_points = [n for p in route_by_id.get(group.get('data-relation'), {}).get('points', []) for n in p]
            if (len(actual_points) != len(expected_points) or
                    any(abs(a - b) > epsilon for a, b in zip(actual_points, expected_points))):
                path_errors.append(group.get('data-relation'))
        check('geometry:actual SVG routes agree with geometry manifest',
              not path_errors, str(path_errors))
        hashes[full_svg.name] = hashlib.sha256(full_svg.read_bytes()).hexdigest()

    port_counts = Counter()
    for tile in tiles:
        svg = ROOT / f"figures/04-er-complete-{tile['id']}.svg"
        check(f"geometry:tile {tile['id']} SVG exists", svg.exists())
        if not svg.exists():
            continue
        root = ET.parse(svg).getroot()
        view_box = [float(v) for v in root.get('viewBox', '').split()]
        check(f"geometry:tile {tile['id']} exact crop and scale",
              view_box == [tile[k] for k in ('x', 'y', 'width', 'height')])
        ports = [g for g in root.iter() if g.get('data-stitch')]
        expected = {c['id']: c for c in crossings if tile['id'] in c['tiles']}
        check(f"geometry:tile {tile['id']} all expected stitch labels drawn once",
              Counter(g.get('data-stitch') for g in ports) == Counter(expected.keys()))
        errors = []
        port_boxes = []
        for port in ports:
            identifier = port.get('data-stitch')
            port_counts[identifier] += 1
            c = expected.get(identifier)
            neighbor = next((n for n in c['tiles'] if n != tile['id']), None) if c else None
            label_text = ' '.join(''.join(t.itertext()) for t in port if t.tag.endswith('text'))
            if (not c or port.get('data-edge') != c['edgeId'] or port.get('data-tile') != tile['id'] or
                    port.get('data-neighbor') != neighbor or identifier not in label_text or
                    'А.' + str(neighbor) not in label_text):
                errors.append(identifier)
            rect = next((r for r in port if r.tag.endswith('rect')), None)
            if rect is not None:
                box = {k: float(rect.get(k)) for k in ('x', 'y', 'width', 'height')}
                port_boxes.append({'id': identifier, **box})
                if not within(box, tile):
                    errors.append(identifier + ':outside tile')
        check(f"geometry:tile {tile['id']} stitch direction, text and bounds",
              not errors, str(errors))
        port_overlaps = [(a['id'], b['id']) for i, a in enumerate(port_boxes)
                         for b in port_boxes[i + 1:] if intersects(a, b)]
        card_overlaps = [(p['id'], n['id']) for p in port_boxes for n in node_list
                         if intersects(p, n)]
        check(f"geometry:tile {tile['id']} stitch boxes do not overlap each other or entity cards",
              not port_overlaps and not card_overlaps,
              f'ports={port_overlaps}; cards={card_overlaps}')
        hashes[svg.name] = hashlib.sha256(svg.read_bytes()).hexdigest()
    check('geometry:each seam label has exactly two drawn ends',
          port_counts == Counter({c['id']: 2 for c in crossings}), str(dict(port_counts)))
    return {'tiles': len(tiles), 'relationships': len(relationships),
            'stitches': len(crossings), 'svg_sha256': hashes}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=OUTPUT)
    parser.add_argument('--require-geometry', action='store_true',
                        help='Fail if final A4 drawing geometry is not yet available')
    args = parser.parse_args()
    model = json.loads(MODEL.read_text())
    nodes = {node['id']: node for node in model['nodes']}
    edges = {edge['id']: edge for edge in model['edges']}
    checks = []

    def check(name, ok, detail=''):
        checks.append({'name': name, 'passed': bool(ok), 'detail': detail})

    check('33 distinct entity/configuration/value-record nodes',
          len(model['nodes']) == len(nodes) == 33 and set(nodes) == set(KEYS))
    check('75 distinct relationships', len(model['edges']) == len(edges) == 75)
    for identifier, key in KEYS.items():
        actual = nodes.get(identifier, {}).get('key')
        check(f'key:{identifier}', actual == key, f'{actual!r}; expected {key!r}')
    for index, row in enumerate(CONTRACT.strip().splitlines(), 1):
        expected = row.split()
        edge = edges.get(f'R{index}', {})
        actual = [edge.get(k) for k in
                  ['source', 'target', 'sourceCardinality', 'targetCardinality', 'kind']]
        check(f'relationship:R{index}', actual == expected,
              f'actual={actual}; expected={expected}')

    source = (REPOSITORY / 'src/domain/types.ts').read_text()
    finance_state = source.split('export interface FinanceState {', 1)[1].split('  settings:', 1)[0]
    actual_collections = set(re.findall(r'^  (\w+)\??: \w+\[\];', finance_state, re.M))
    check('all 16 FinanceState collections covered',
          actual_collections == set(COLLECTIONS) and
          all(n in nodes for n in COLLECTIONS.values()),
          ', '.join(sorted(actual_collections)))
    check('goal stores initial rather than computed savings',
          any('нач' in f.lower() and 'накоп' in f.lower()
              for f in nodes.get('Goal', {}).get('fields', [])))
    check('three optional soft polymorphic scenario source links',
          {e['target'] for e in edges.values() if e['kind'] == 'soft'} ==
          {'Goal', 'Payment', 'Income'} and
          all(e['source'] == 'Change' and e['targetCardinality'] == '0..1'
              for e in edges.values() if e['kind'] == 'soft'))
    check('no invented actual-to-planned transfer FK',
          not any({e['source'], e['target']} == {'Transaction', 'Transfer'}
                  for e in edges.values()))
    check('no invented direct transaction-currency FK',
          not any({e['source'], e['target']} == {'Transaction', 'Currency'}
                  for e in edges.values()))
    check('no single savings account assigned directly to goal',
          not any({e['source'], e['target']} == {'Goal', 'Account'}
                  for e in edges.values()))
    check('no invented balance baseline relationship',
          not any('baseline' in str(e).lower() for e in edges.values()))

    geometry = None
    if model.get('geometry'):
        geometry = geometry_checks(model, check)
    elif args.require_geometry:
        check('geometry:final A4 drawing geometry available', False)
    report = {
        'scope': 'Independent documentation-model audit; no app tests executed',
        'model_sha256': hashlib.sha256(MODEL.read_bytes()).hexdigest(),
        'checks': checks,
        'passed': sum(c['passed'] for c in checks),
        'total': len(checks),
        'geometry': geometry,
        'visual_review': {'required': True},
    }
    previous = json.loads(args.output.read_text()) if args.output.exists() else {}
    if (previous.get('model_sha256') == report['model_sha256'] and
            previous.get('geometry') == report['geometry']):
        report['visual_review'] = previous.get('visual_review', {'required': True})
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(f"{report['passed']}/{report['total']} ER contracts passed")
    for c in checks:
        if not c['passed']:
            print('FAIL', c['name'], c['detail'])
    return 0 if all(c['passed'] for c in checks) else 1


if __name__ == '__main__':
    raise SystemExit(main())
