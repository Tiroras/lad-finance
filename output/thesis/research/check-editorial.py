"""Check the five current thesis DOCX artifacts, Markdown and rendered pages.

Run with bundled Python and --render-root DIR. DIR contains one subdirectory
per scope, each with SCOPE.pdf and page-N.png from render_docx.py. Page ranges
are discovered from section headings; visual review remains a separate step.
"""
from pathlib import Path
from collections import Counter
import argparse
import hashlib
import json
import re
import subprocess

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from PIL import Image
import pdfplumber

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'research/editorial-checks.json'
BIBLIOGRAPHY = '# Список использованных источников'
SECTION_PREFIXES = {
    'introduction': r'^Введение\b',
    'chapter_1': r'^1 Требования\b',
    'chapter_2': r'^2 Проектирование\b',
    'chapter_3': r'^3 Реализация\b',
    'conclusion': r'^Заключение\b',
    'bibliography': r'^Список использованных источников\b',
}
# These guards target editorial claims, not descriptions of validation algorithms.
FORBIDDEN = [
    r'\bконтрольн\w*',
    r'\bсовпали\s+с\s+ожидаемыми\b',
    r'\b(?:провед[её]н\w*|выполнен\w*|пройден\w*|запущен\w*)\s+(?:\w+\s+){0,3}(?:тест\w*|испытан\w*)',
    r'\b(?:тест\w*|испытан\w*)\s+(?:\w+\s+){0,2}(?:подтверд\w*|пройден\w*|прошл\w*|выполнен\w*)',
]
# Formulas, figures and logical tables. Physical continuation parts are separate.
COUNTS = {
    'chapters-1-2': (0, 18, 6),
    'chapter-3': (18, 11, 1),
    'chapters-1-3': (18, 29, 7),
    'introduction-conclusion': (0, 0, 0),
    'thesis': (18, 29, 7),
}


def norm(value):
    return ' '.join(value.replace('\u2060', '').replace('⁸', '8').split())


def sha(data):
    return hashlib.sha256(data).hexdigest()


def plain(value):
    return value.replace('**', '').replace('`', '')


def section_key(title):
    return next((key for key, pattern in SECTION_PREFIXES.items()
                 if re.match(pattern, norm(title))), None)


def sources():
    previous = (ROOT / 'chapters-1-2.md').read_text()
    chapter = (ROOT / 'chapter-3.md').read_text()
    intro = (ROOT / 'introduction.md').read_text().rstrip()
    conclusion = (ROOT / 'conclusion.md').read_text().rstrip()
    body, bibliography = previous.split(BIBLIOGRAPHY, 1)
    chapters = body.rstrip() + '\n\n' + chapter.rstrip()
    return {
        'chapters-1-2': previous,
        'chapter-3': chapter,
        'chapters-1-3': chapters + '\n\n' + BIBLIOGRAPHY + bibliography,
        'introduction-conclusion': intro + '\n\n' + conclusion,
        'thesis': intro + '\n\n' + chapters + '\n\n' + conclusion + '\n\n' + BIBLIOGRAPHY + bibliography,
    }


def paragraphs(md):
    result = []
    for block in re.split(r'\n\s*\n', md.strip()):
        if block.startswith(('|', '$$')):
            continue
        image = re.fullmatch(r'!\[(.*?)\]\([^\n]+\)', block)
        value = image[1] if image else re.sub(r'^#{1,3} ', '', block)
        result.append(norm(plain(value)))
    return result


def rows(md):
    result = []
    for line in md.splitlines():
        if line.startswith('|'):
            cells = [cell.strip() for cell in line.strip('|').split('|')]
            if not all(re.fullmatch(r'[:\-\s]+', cell) for cell in cells):
                result.append([norm(plain(cell)) for cell in cells])
    return result


def editorial_hits(text):
    return [match[0] for pattern in FORBIDDEN for match in re.finditer(pattern, norm(text), re.I)]


def body_hash(path, body_bottom, page_height):
    with Image.open(path) as image:
        crop = image.convert('RGB').crop((0, 0, image.width, round(image.height * body_bottom / page_height)))
        return sha(str(crop.size).encode() + b'\0' + crop.tobytes())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--render-root', type=Path, required=True)
    args = parser.parse_args()
    checks, reports, bodies = {}, {}, {}

    def check(name, value):
        checks[name] = bool(value)
        if not value:
            print('FAILED:', name)

    for scope, md in sources().items():
        prefix = scope + ':'
        docx = ROOT / (scope + '.docx')
        directory = args.render_root / scope
        pdf_path = directory / (scope + '.pdf')
        present = docx.exists() and pdf_path.exists()
        check(prefix + 'artifacts_present', present)
        if not present:
            reports[scope] = {'error': 'DOCX or PDF is missing'}
            continue
        doc = Document(docx)
        formulas, images, logical_tables = COUNTS[scope]
        source_formulas = re.findall(r'^\$\$ (.+) \\tag\{(3\.\d+)\} \$\$$', md, re.M)
        equations = doc.element.findall('.//' + qn('m:oMath'))
        actual = [norm(p.text) for p in doc.paragraphs if p.text
                  and not re.fullmatch(r'Продолжение таблицы \d+', norm(p.text))
                  and p._p.find('.//' + qn('m:oMath')) is None]
        check(prefix + 'paragraphs_match_markdown', actual == paragraphs(md))
        actual_rows = [[norm(c.text) for c in row.cells] for table in doc.tables for row in table.rows
                       if [norm(c.text) for c in row.cells] != ['1', '2', '3', '4', '5', '6']]
        check(prefix + 'table_cells_match_markdown', actual_rows == rows(md))
        numbers = re.findall(r'^Таблица (\d+) [–-]', md, re.M)
        continuations = sum(norm(p.text).startswith('Продолжение таблицы ') for p in doc.paragraphs)
        check(prefix + 'logical_tables_and_parts', len(numbers) == logical_tables
              and len(set(numbers)) == logical_tables and len(doc.tables) == logical_tables + continuations)
        check(prefix + 'editable_equation_count_and_numbers', len(equations) == formulas
              and [number for _, number in source_formulas] == [f'3.{i}' for i in range(1, formulas + 1)])
        flat_math = lambda text: norm(re.sub(r'[_^](?:\{([^{}]*)\}|(.))', lambda m: m[1] if m[1] is not None else m[2], text))
        check(prefix + 'equation_content_matches', [norm(''.join(n.text or '' for n in e.iter(qn('m:t')))) for e in equations]
              == [flat_math(expr) for expr, _ in source_formulas])
        paths = re.findall(r'^!\[[^\n]+\]\(([^\n]+)\)$', md, re.M)
        check(prefix + 'figure_count', len(doc.inline_shapes) == len(paths) == images)
        check(prefix + 'embedded_images_match', all((ROOT / path).exists()
              and doc.part.rels[shape._inline.graphic.graphicData.pic.blipFill.blip.get(qn('r:embed'))].target_part.blob == (ROOT / path).read_bytes()
              for shape, path in zip(doc.inline_shapes, paths)))
        check(prefix + 'a4_margins', all(abs(value.mm - expected) < 0.06 for sec in doc.sections for value, expected in [
            (sec.page_width, 210), (sec.page_height, 297), (sec.left_margin, 30),
            (sec.right_margin, 10), (sec.top_margin, 20), (sec.bottom_margin, 20)]))
        normal = doc.styles['Normal']
        pf = normal.paragraph_format
        check(prefix + 'body_format', normal.font.name == 'Times New Roman' and normal.font.size.pt == 14
              and pf.line_spacing == 1.5 and abs(pf.first_line_indent.mm - 10) < 0.06)
        check(prefix + 'headings_kept', all(doc.styles[name].paragraph_format.keep_with_next
              and doc.styles[name].font.name == 'Times New Roman' for name in ['Heading 1', 'Heading 2', 'Heading 3']))
        check(prefix + 'table_format', all(row._tr.find('.//' + qn('w:cantSplit')) is not None
              for table in doc.tables for row in table.rows) and all(run.font.size and run.font.size.pt == 12
              for table in doc.tables for row in table.rows for cell in row.cells for p in cell.paragraphs for run in p.runs))
        check(prefix + 'page_field_centered', all(sec.footer.paragraphs[0].alignment == WD_ALIGN_PARAGRAPH.CENTER
              and any('PAGE' in node.get(qn('w:instr'), '') for node in sec.footer._element.iter(qn('w:fldSimple'))) for sec in doc.sections))
        doc_text = ' '.join(actual + [' '.join(row) for row in actual_rows])
        hits = editorial_hits(md) + editorial_hits(doc_text)
        check(prefix + 'editorial_claims_removed', not hits)

        with pdfplumber.open(pdf_path) as pdf:
            texts = [page.extract_text() or '' for page in pdf.pages]
            count = len(pdf.pages)
            pngs = sorted(int(path.stem.split('-')[1]) for path in directory.glob('page-*.png'))
            check(prefix + 'pdf_and_png_page_counts', count > 0 and pngs == list(range(1, count + 1)))
            seen_sections, page_hashes, bad_bounds, fonts = {}, [], [], set()
            image_pages, caption_pages, nonempty, footers = [], {}, [], []
            for i, (page, text) in enumerate(zip(pdf.pages, texts), 1):
                key = section_key(text)
                if key:
                    seen_sections.setdefault(key, []).append(i)
                bottom = page.height - doc.sections[0].bottom_margin.pt
                footers.append(norm(page.crop((0, bottom, page.width, page.height)).extract_text() or '') == str(i))
                nonempty.append(bool(page.images) or any(c['text'].strip() and c['top'] < bottom for c in page.chars))
                image_pages.extend([i] * len(page.images))
                for number in re.findall(r'Рисунок\s+(\d+)\s*[–-]', text):
                    caption_pages.setdefault(number, []).append(i)
                bands = [(w['top'] - 12, w['bottom'] + 12) for w in page.extract_words()
                         if re.fullmatch(r'\(3\.\d+\)', w['text']) and w['x0'] > page.width * 0.7]
                for char in page.chars:
                    if not char['text'].strip():
                        continue
                    if char['x0'] < doc.sections[0].left_margin.pt - 1 or char['x1'] > page.width - doc.sections[0].right_margin.pt + 1 or char['top'] < 55 or char['bottom'] > page.height - 20:
                        bad_bounds.append([i, char['text']])
                    if not any(top <= char['top'] <= end for top, end in bands):
                        fonts.add(char['fontname'].split('+')[-1])
                if (directory / f'page-{i}.png').exists():
                    page_hashes.append(body_hash(directory / f'page-{i}.png', bottom, page.height))
            check(prefix + 'page_numbers', all(footers))
            check(prefix + 'no_empty_pages', all(nonempty))
            check(prefix + 'text_within_page_bounds', not bad_bounds)
            check(prefix + 'prose_fonts', all(name.startswith(('TimesNewRoman', 'CourierNew')) for name in fonts))
            expected_captions = re.findall(r'^!\[Рисунок (\d+)', md, re.M)
            check(prefix + 'figures_and_captions_same_page', sorted(image_pages) == sorted(p for pages in caption_pages.values() for p in pages)
                  and set(caption_pages) == set(expected_captions) and all(len(pages) == 1 for pages in caption_pages.values()))
            check(prefix + 'equations_rendered', Counter(re.findall(r'\(3\.\d+\)', '\n'.join(texts))) == Counter('(' + n + ')' for _, n in source_formulas))
            pdf_hits = editorial_hits(' '.join(texts))
            check(prefix + 'rendered_editorial_claims_removed', not pdf_hits)
            expected_sections = [section_key(title) for title in re.findall(r'^# (.+)', md, re.M)]
            ordered = sorted(((key, values[0]) for key, values in seen_sections.items()), key=lambda item: item[1])
            check(prefix + 'section_starts', [key for key, _ in ordered] == expected_sections
                  and all(len(values) == 1 for values in seen_sections.values()))
            sections = {}
            for index, (key, start) in enumerate(ordered):
                end = ordered[index + 1][1] - 1 if index + 1 < len(ordered) else count
                hashes = page_hashes[start - 1:end]
                bodies[(scope, key)] = hashes
                sections[key] = {'pages': [start, end], 'body_sha256': sha(''.join(hashes).encode())}
            reports[scope] = {'pages': count, 'docx_sha256': sha(docx.read_bytes()), 'pdf_sha256': sha(pdf_path.read_bytes()),
                'markdown_sha256': sha(md.encode()), 'figures': len(paths), 'logical_tables': len(numbers), 'table_parts': len(doc.tables),
                'equations': len(equations), 'sections': sections, 'prose_fonts': sorted(fonts),
                'caption_pages': caption_pages, 'editorial_hits': hits + pdf_hits, 'bounds_violations': bad_bounds}

    for (scope, section), hashes in bodies.items():
        if scope != 'thesis':
            check(scope + ':' + section + '_body_identical_in_thesis', bool(hashes) and hashes == bodies.get(('thesis', section)))
    previous = json.loads(OUTPUT.read_text()) if OUTPUT.exists() else {}
    same = all(previous.get('documents', {}).get(scope, {}).get('docx_sha256') == data.get('docx_sha256')
               and previous.get('documents', {}).get(scope, {}).get('pdf_sha256') == data.get('pdf_sha256') for scope, data in reports.items())
    result = {'checked_on': '2026-10-29', 'project_commit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
        'documents': reports, 'structural_checks': checks, 'checks_passed': sum(checks.values()), 'checks_total': len(checks),
        'visual_review': previous.get('visual_review', {'required': True}) if same else {'required': True},
        'notes': ['Предел количества страниц не применяется. Смещения разделов определены по текстовым началам, а не заданным номерам страниц.',
                  'Пиксельные хеши включают полосу страницы до нижнего поля и исключают футер. Визуальное ревью выполняется отдельно.',
                  'Автоматический редакторский фильтр намеренно узок и не заменяет смысловое чтение; описания алгоритмической валидации допустимы.']}
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'passed': sum(checks.values()), 'total': len(checks), 'pages': {scope: data.get('pages') for scope, data in reports.items()}}, ensure_ascii=False))
    return 0 if all(checks.values()) else 1


if __name__ == '__main__':
    raise SystemExit(main())
