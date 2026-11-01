"""Move PlantUML relation labels off paths and composition diamonds.

Run after PlantUML exports 08-domain-ledger.svg and 09-domain-plans.svg,
then rasterize the two SVGs. The operation is idempotent. Canvas dimensions,
class rectangles, relation paths, label text and multiplicities stay unchanged.

A role label distinguishes the two Account–Transaction associations.
For the three Terms–Schedule links, repeated 0..1 labels follow PlantUML's
export order: occurrence 0 is at Schedule, occurrence 1 is at the Terms class.
"""
from pathlib import Path
import xml.etree.ElementTree as ET

SVG = 'http://www.w3.org/2000/svg'
ET.register_namespace('', SVG)
ET.register_namespace('xlink', 'http://www.w3.org/1999/xlink')
DIRECTORY = Path(__file__).parent
VERSION = 'clearance-v2'
# Endpoints, optional association role, label, occurrence, horizontal/vertical shift.
ADJUSTMENTS = {
    '08-domain-ledger': [
        ({'Category', 'Transaction'}, None, '0..*', 0, -14, 16),
        ({'Category', 'Transaction'}, None, '1', 0, -6, 0),
        ({'Split', 'Transaction'}, None, '1', 0, -9, 0),
        ({'Split', 'Transaction'}, None, '0..*', 0, -6, 0),
        ({'Debt', 'Transaction'}, None, '0..*', 0, -6, 0),
        ({'Debt', 'Transaction'}, None, '0..1', 0, 34, 5),
        ({'Debt', 'Account'}, None, '0..*', 0, 35, 0),
        ({'Debt', 'Account'}, None, '1', 0, -6, 0),
        ({'Account', 'Transaction'}, 'основной', 'основной', 0, 6, 0),
        ({'Account', 'Transaction'}, 'основной', '1', 0, -8, 0),
        ({'Account', 'Transaction'}, 'основной', '0..*', 0, -6, 0),
        ({'Account', 'Transaction'}, 'получатель', 'получатель', 0, 1, -6),
        ({'Account', 'Transaction'}, 'получатель', '0..1', 0, -25, 0),
        ({'Account', 'Transaction'}, 'получатель', '0..*', 0, -10, 0),
    ],
    '09-domain-plans': [
        ({'Income', 'IncomeTerms'}, None, '0..*', 0, -6, 0),
        ({'Income', 'IncomeTerms'}, None, '1', 0, -10, 0),
        ({'Payment', 'PaymentTerms'}, None, '0..*', 0, -6, 0),
        ({'Payment', 'PaymentTerms'}, None, '1', 0, -10, 0),
        ({'Goal', 'GoalTerms'}, None, '0..*', 0, 6, 0),
        ({'Goal', 'GoalTerms'}, None, '1', 0, -10, 0),
        ({'IncomeTerms', 'Schedule'}, None, '0..1', 0, -34, 0),
        ({'IncomeTerms', 'Schedule'}, None, '0..1', 1, -7, 0),
        ({'PaymentTerms', 'Schedule'}, None, '0..1', 0, -9, 0),
        ({'PaymentTerms', 'Schedule'}, None, '0..1', 1, -9, 0),
        ({'GoalTerms', 'Schedule'}, None, '0..1', 0, -7, 0),
        ({'GoalTerms', 'Schedule'}, None, '0..1', 1, 36, 0),
    ],
}


def adjust(name, rules):
    source = DIRECTORY / f'{name}.svg'
    document = ET.parse(source)
    root = document.getroot()
    names = {element.get('id'): element.get('data-qualified-name')
             for element in root.iter() if element.get('class') == 'entity'}
    changed = 0
    for endpoints, role, cardinality, occurrence, dx, dy in rules:
        links = [element for element in root.iter()
                 if element.get('class') == 'link'
                 and {names.get(element.get('data-entity-1')),
                      names.get(element.get('data-entity-2'))} == endpoints
                 and (role is None or role in
                      [t.text for t in element.findall(f'{{{SVG}}}text')])]
        if len(links) != 1:
            raise ValueError(f'Expected exactly one {endpoints} relation with role {role}')
        labels = [element for element in links[0].findall(f'{{{SVG}}}text')
                  if element.text == cardinality]
        if occurrence >= len(labels):
            raise ValueError(f'Missing occurrence {occurrence} of {cardinality}: {endpoints}')
        label = labels[occurrence]
        if label.get('data-label-position') == VERSION:
            continue
        if label.get('data-cardinality-position'):
            raise ValueError('Re-export the SVG with PlantUML before applying the new label layout')
        label.set('x', f"{float(label.get('x')) + dx:.4f}")
        label.set('y', f"{float(label.get('y')) + dy:.4f}")
        label.set('data-label-position', VERSION)
        changed += 1
    if changed:
        document.write(source, encoding='unicode', xml_declaration=False)
    print(f'{source.name}: {changed} label positions adjusted')


def main():
    for name, rules in ADJUSTMENTS.items():
        adjust(name, rules)


if __name__ == '__main__':
    main()
