"""Verify the new sections and unchanged thesis body against their renders.

Run with bundled Python. Render directories must contain PDF and page PNGs.
Visual inspection remains a separate step.
"""
from pathlib import Path
import argparse
import hashlib
import json
import re
from docx import Document
from docx.oxml.ns import qn
from lxml import etree
from PIL import Image, ImageChops
import pdfplumber

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--sections', type=Path, required=True)
parser.add_argument('--combined', type=Path, required=True)
parser.add_argument('--previous', type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
checks = {}
documents = {}

def norm(text):
    return ' '.join(text.replace('\u2060', '').split())

def check(name, passed):
    checks[name] = bool(passed)
    if not passed:
        print('FAILED:', name)

def source_paragraphs(name):
    return [norm(re.sub(r'^# ', '', p)) for p in (root / name).read_text().strip().split('\n\n')]

def same_body(left, right):
    with Image.open(left) as a, Image.open(right) as b:
        # At 120 dpi the footer starts below this crop; body content is retained.
        return a.size == b.size and ImageChops.difference(a.crop((0, 0, a.width, 1310)), b.crop((0, 0, b.width, 1310))).getbbox() is None

introduction = source_paragraphs('introduction.md')
conclusion = source_paragraphs('conclusion.md')
previous = Document(root / 'chapters-1-3.docx')
old = [norm(p.text) for p in previous.paragraphs]
bibliography_index = old.index('Список использованных источников')
expected = {
    'introduction-conclusion': introduction + conclusion,
    'thesis': introduction + old[:bibliography_index] + conclusion + old[bibliography_index:],
}

for name, directory, page_count in [('introduction-conclusion', args.sections, 6), ('thesis', args.combined, 98)]:
    path = root / (name + '.docx')
    doc = Document(path)
    check(name + ':paragraphs_match', [norm(p.text) for p in doc.paragraphs] == expected[name])
    sec = doc.sections[0]
    check(name + ':a4_margins', all(abs(a.mm-b)<0.06 for a,b in [(sec.page_width,210),(sec.page_height,297),(sec.left_margin,30),(sec.right_margin,10),(sec.top_margin,20),(sec.bottom_margin,20)]))
    normal = doc.styles['Normal']
    check(name + ':body_format', normal.font.name == 'Times New Roman' and normal.font.size.pt == 14 and normal.paragraph_format.line_spacing == 1.5 and abs(normal.paragraph_format.first_line_indent.mm-10)<0.06)
    check(name + ':section_headings', all(p.style.name == 'Heading 1' for p in doc.paragraphs if p.text in ('Введение','Заключение')))
    with pdfplumber.open(directory / (name + '.pdf')) as pdf:
        texts = [page.extract_text() or '' for page in pdf.pages]
        check(name + ':page_count', len(pdf.pages) == page_count and len(list(directory.glob('page-*.png'))) == page_count)
        check(name + ':page_numbers', all(t.rstrip().endswith(str(i)) for i,t in enumerate(texts,1)))
        check(name + ':no_blank_pages', all(len(t.split())>1 for t in texts))
        check(name + ':within_page_bounds', all(not c['text'].strip() or c['x0']>=84 and c['x1']<=568 and c['top']>=55 and c['bottom']<=820 for p in pdf.pages for c in p.chars))
        documents[name] = {'pages': len(pdf.pages), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}

combined = Document(root / 'thesis.docx')
check('all_previous_tables_preserved', [[c.text for row in t.rows for c in row.cells] for t in previous.tables] == [[c.text for row in t.rows for c in row.cells] for t in combined.tables])
old_equations = previous.element.findall('.//' + qn('m:oMath'))
new_equations = combined.element.findall('.//' + qn('m:oMath'))
check('all_18_equations_preserved', len(new_equations) == 18 and [etree.tostring(e) for e in old_equations] == [etree.tostring(e) for e in new_equations])
check('all_29_images_preserved', len(previous.inline_shapes) == len(combined.inline_shapes) == 29 and all(previous.part.rels[a._inline.graphic.graphicData.pic.blipFill.blip.get(qn('r:embed'))].target_part.blob == combined.part.rels[b._inline.graphic.graphicData.pic.blipFill.blip.get(qn('r:embed'))].target_part.blob for a,b in zip(previous.inline_shapes,combined.inline_shapes)))
check('introduction_pages_match', all(same_body(args.sections/f'page-{i}.png',args.combined/f'page-{i}.png') for i in range(1,4)))
check('conclusion_pages_match', all(same_body(args.sections/f'page-{i}.png',args.combined/f'page-{i+90}.png') for i in range(4,7)))
check('previous_90_chapter_pages_preserved', all(same_body(args.previous/f'page-{i}.png',args.combined/f'page-{i+3}.png') for i in range(1,91)))
check('previous_bibliography_pages_preserved', all(same_body(args.previous/f'page-{i}.png',args.combined/f'page-{i+6}.png') for i in range(91,93)))
check('seven_tasks_use_hyphens', sum(p.startswith('- ') for p in introduction) == 7)

report = {'checked_on': '2026-10-29', 'documents': documents, 'checks': checks, 'passed': sum(checks.values()), 'total': len(checks)}
target = root / 'research/introduction-conclusion-checks.json'
if target.exists():
    old_report = json.loads(target.read_text())
    if old_report.get('documents') == documents and 'visual_review' in old_report:
        report['visual_review'] = old_report['visual_review']
target.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(f'{report["passed"]}/{report["total"]} checks passed')
raise SystemExit(0 if all(checks.values()) else 1)
