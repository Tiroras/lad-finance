"""Check both Word deliverables against Markdown and rendered pages.

Use bundled Python. Arguments point to render_docx.py output directories.
Visual inspection is recorded separately; this script cannot replace it.
"""
from pathlib import Path
import argparse
import hashlib
import json
import re
import subprocess
from docx import Document
from docx.oxml.ns import qn
import pdfplumber
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--render-dir', type=Path, required=True)
parser.add_argument('--combined-dir', type=Path, required=True)
parser.add_argument('--previous-dir', type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
chapter = (root / 'chapter-3.md').read_text()
previous = (root / 'chapters-1-2.md').read_text()
body, bibliography = previous.split('# Список использованных источников', 1)
combined = body.rstrip() + '\n\n' + chapter.rstrip() + '\n\n# Список использованных источников' + bibliography
checks = {}

def check(name, value):
    checks[name] = bool(value)
    if not value:
        print('FAILED:', name)

def norm(text):
    return ' '.join(text.replace('\u2060', '').replace('⁸', '8').split())

def expected_paragraphs(md):
    result = []
    for block in md.strip().split('\n\n'):
        if block.startswith(('|', '$$')):
            continue
        if block.startswith('!['):
            block = re.match(r'!\[(.*?)\]', block)[1]
        else:
            block = re.sub(r'^#{1,3} ', '', block).replace('**', '').replace('`', '')
        result.append(norm(block))
    return result

def md_rows(md):
    result = []
    for line in md.splitlines():
        if not line.startswith('|'):
            continue
        row = [cell.strip() for cell in line.strip('|').split('|')]
        if all(re.fullmatch(r'[:\-\s]+', cell) for cell in row):
            continue
        result.append([norm(c.replace('**', '').replace('`', '')) for c in row])
    return result

check('all_16_use_case_sections', re.findall(r'^## 3\.(\d+) ', chapter, re.M) == [str(n) for n in range(1, 17)])
check('18_numbered_formulas', re.findall(r'\\tag\{(3\.\d+)\}', chapter) == [f'3.{n}' for n in range(1, 19)])
check('chapter_figures_19_to_29', re.findall(r'!\[Рисунок (\d+)', chapter) == [str(n) for n in range(19, 30)])
check('combined_bibliography_unchanged', combined.split('# Список использованных источников', 1)[1] == bibliography)
reports = {}
for scope, md, directory, expected_pages, expected_images, expected_tables in [
    ('chapter-3', chapter, args.render_dir, 42, 11, 1),
    ('chapters-1-3', combined, args.combined_dir, 92, 29, 9),
]:
    docx = root / f'{scope}.docx'
    doc = Document(docx)
    actual = [norm(p.text) for p in doc.paragraphs if p.text and p.text != 'Продолжение таблицы 1' and p._p.find(qn('m:oMath')) is None]
    check(scope + ':paragraphs_match', actual == expected_paragraphs(md))
    rows = [[norm(c.text) for c in row.cells] for table in doc.tables for row in table.rows if [c.text for c in row.cells] != ['1','2','3','4','5','6']]
    check(scope + ':tables_match', rows == md_rows(md))
    check(scope + ':table_parts_count', len(doc.tables) == expected_tables)
    check(scope + ':18_editable_omml_equations', len(doc.element.findall('.//' + qn('m:oMath'))) == 18)
    check(scope + ':image_count', len(doc.inline_shapes) == expected_images)
    paths = re.findall(r'!\[[^\]]+\]\(([^)]+)\)', md)
    check(scope + ':embedded_images_match', all(doc.part.rels[s._inline.graphic.graphicData.pic.blipFill.blip.get(qn('r:embed'))].target_part.blob == (root / path).read_bytes() for s, path in zip(doc.inline_shapes, paths)))
    sec = doc.sections[0]
    check(scope + ':a4_margins', all(abs(a.mm-b)<0.06 for a,b in [(sec.page_width,210),(sec.page_height,297),(sec.left_margin,30),(sec.right_margin,10),(sec.top_margin,20),(sec.bottom_margin,20)]))
    normal = doc.styles['Normal']
    check(scope + ':body_format', normal.font.name == 'Times New Roman' and normal.font.size.pt == 14 and normal.paragraph_format.line_spacing == 1.5 and abs(normal.paragraph_format.first_line_indent.mm-10)<0.06)
    check(scope + ':headings_kept', all(doc.styles[name].paragraph_format.keep_with_next for name in ['Heading 1','Heading 2','Heading 3']))
    check(scope + ':table_rows_kept', all(row._tr.find(qn('w:trPr')).find(qn('w:cantSplit')) is not None for t in doc.tables for row in t.rows))
    with pdfplumber.open(directory / f'{scope}.pdf') as pdf:
        texts = [page.extract_text() or '' for page in pdf.pages]
        check(scope + ':page_count_and_pngs', len(pdf.pages) == expected_pages and len(list(directory.glob('page-*.png'))) == expected_pages)
        check(scope + ':page_numbers', all(t.rstrip().endswith(str(i)) for i,t in enumerate(texts,1)))
        check(scope + ':formulas_rendered', all(f'(3.{i})' in '\n'.join(texts) for i in range(1,19)))
        bad = []
        image_pages = []
        caption_pages = {}
        for i, (page,text) in enumerate(zip(pdf.pages,texts),1):
            image_pages += [i] * len(page.images)
            for n in re.findall(r'Рисунок\s+(\d+)\s*[–-]',text):
                caption_pages[n] = i
            for c in page.chars:
                if c['text'].strip() and (c['x0']<84 or c['x1']>568 or c['top']<55 or c['bottom']>820):
                    bad.append([i,c['text']])
        check(scope + ':within_page_bounds', not bad)
        check(scope + ':figures_with_captions', sorted(image_pages) == sorted(caption_pages.values()) and len(caption_pages) == expected_images)
        check(scope + ':no_empty_pages', all(len(t.strip().split())>1 for t in texts))
        reports[scope] = {'pages':len(pdf.pages),'sha256':hashlib.sha256(docx.read_bytes()).hexdigest(),'images':expected_images,'table_parts':expected_tables,'equations':18,'caption_pages':caption_pages}

check('combined_first_48_pages_identical', all((args.previous_dir/f'page-{i}.png').read_bytes() == (args.combined_dir/f'page-{i}.png').read_bytes() for i in range(1,49)))
identical = True
for i in range(1,43):
    a = Image.open(args.render_dir/f'page-{i}.png')
    b = Image.open(args.combined_dir/f'page-{48+i}.png')
    identical &= a.crop((0,0,a.width,1310)).tobytes() == b.crop((0,0,b.width,1310)).tobytes()
check('chapter3_body_identical_in_combined', identical)
report_path = root/'research/chapter3-document-checks.json'
old_report = json.loads(report_path.read_text()) if report_path.exists() else {}
same_artifacts = all(old_report.get('documents',{}).get(k,{}).get('sha256') == v['sha256'] for k,v in reports.items())
visual_review = old_report.get('visual_review', {'required':True}) if same_artifacts else {'required':True}
result = {'checked_on':'2026-10-29','project_commit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'documents':reports,'structural_checks':checks,'checks_passed':sum(checks.values()),'checks_total':len(checks),'visual_review':visual_review,'notes':['Визуальная проверка снимков страниц выполняется отдельно; её запись сохраняется только при совпадении SHA-256 обоих DOCX.','Объём 42/92 страницы не ограничен отменённым пользователем максимумом.']}
report_path.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'passed':sum(checks.values()),'total':len(checks),'pages':{k:v['pages'] for k,v in reports.items()}},ensure_ascii=False))
if not all(checks.values()):
    raise SystemExit(1)
