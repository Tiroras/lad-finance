"""Build a native Excel line chart and export it through bundled LibreOffice.

The JS builder owns the workbook. OOXML post-processing supplies chart caches,
standard Office chart formatting and a print range for the chart export.
"""
from pathlib import Path
from zipfile import ZipFile
import json
import shutil
import subprocess
import tempfile

from lxml import etree as ET
import pdfplumber
from pypdf import PdfReader, PdfWriter
from pypdf.generic import RectangleObject

ROOT = Path(__file__).resolve().parent
DEPS = Path.home() / '.cache/codex-runtimes/codex-primary-runtime/dependencies'
NODE = DEPS / 'node/bin/node'
MODULES = DEPS / 'node/node_modules'
SOFFICE = DEPS / 'bin/override/soffice'
CAIRO = DEPS / 'native/poppler/poppler/bin/pdftocairo'
BOOK = ROOT / 'chapter3-forecast-chart.xlsx'
SVG = ROOT / 'chapter3-forecast-chart.svg'
PNG = ROOT / 'chapter3-forecast-chart.png'
NS = {
    'c': 'http://schemas.openxmlformats.org/drawingml/2006/chart',
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
    's': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
    'xdr': 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing',
}


def tag(prefix, name):
    return f'{{{NS[prefix]}}}{name}'


def put(parent, prefix, node_name, **attrs):
    return ET.SubElement(parent, tag(prefix, node_name), **{k: str(v) for k, v in attrs.items()})


def cache(parent, values, numeric=False):
    for child in list(parent):
        parent.remove(child)
    if numeric:
        put(parent, 'c', 'formatCode').text = '0'
    put(parent, 'c', 'ptCount', val=len(values))
    for i, value in enumerate(values):
        point = put(parent, 'c', 'pt', idx=i)
        put(point, 'c', 'v').text = str(value)


points = json.loads((ROOT.parent / 'research/controls/forecast-control-results.json').read_text())['chart']
labels = [f'{int(p["date"][8:10])}.{int(p["date"][5:7])}' for p in points]
with tempfile.TemporaryDirectory(prefix='lad-excel-chart-') as directory:
    work = Path(directory)
    (work / 'node_modules').symlink_to(MODULES, target_is_directory=True)
    shutil.copy2(ROOT / 'chapter3-forecast-chart.mjs', work / 'chart.mjs')
    subprocess.run([str(NODE), str(work / 'chart.mjs'), str(ROOT)], check=True)
    inspect_file = BOOK.with_suffix('.xlsx.inspect.ndjson')
    if inspect_file.exists():
        inspect_file.unlink()

    with ZipFile(BOOK) as archive:
        files = {name: archive.read(name) for name in archive.namelist()}
    chart_name = next(name for name in files if name.endswith('/chart1.xml'))
    chart = ET.fromstring(files[chart_name])
    chart.find('c:lang', NS).set('val', 'ru-RU')
    for series, field in zip(chart.findall('.//c:ser', NS), ['baseline', 'reserve']):
        cache(series.find('c:cat/c:strRef/c:strCache', NS), labels)
        cache(series.find('c:val/c:numRef/c:numCache', NS), [p[field] // 100 for p in points], True)
    x_axis = chart.find('.//c:catAx', NS)
    for grid in x_axis.findall('c:majorGridlines', NS):
        x_axis.remove(grid)
    y_axis = chart.find('.//c:valAx', NS)
    scaling = y_axis.find('c:scaling', NS)
    put(scaling, 'c', 'max', val=50000)
    put(scaling, 'c', 'min', val=0)
    put(y_axis, 'c', 'majorUnit', val=10000)
    grid = y_axis.find('c:majorGridlines', NS)
    grid.find('.//a:srgbClr', NS).set('val', 'D9D9D9')
    grid.find('.//a:prstDash', NS).set('val', 'solid')
    for title in chart.findall('.//c:catAx/c:title', NS) + chart.findall('.//c:valAx/c:title', NS):
        for run in title.findall('.//a:r', NS):
            props = ET.Element(tag('a', 'rPr'), sz='1650')
            put(props, 'a', 'latin', typeface='Arial')
            run.insert(0, props)
    files[chart_name] = ET.tostring(chart, xml_declaration=True, encoding='UTF-8', standalone=True)

    drawing_name = 'xl/drawings/drawing1.xml'
    drawing = ET.fromstring(files[drawing_name])
    anchor = drawing[0]
    anchor.tag = tag('xdr', 'oneCellAnchor')
    anchor.remove(anchor.find('xdr:to', NS))
    extent = ET.Element(tag('xdr', 'ext'), cx=str(1000 * 9525), cy=str(520 * 9525))
    anchor.insert(1, extent)
    frame_extent = anchor.find('.//a:ext', NS)
    frame_extent.set('cx', str(1000 * 9525))
    frame_extent.set('cy', str(520 * 9525))
    files[drawing_name] = ET.tostring(drawing, xml_declaration=True, encoding='UTF-8', standalone=True)

    sheet_name = 'xl/worksheets/sheet1.xml'
    sheet = ET.fromstring(files[sheet_name])
    sheet_props = sheet.find('s:sheetPr', NS)
    if sheet_props is None:
        sheet_props = ET.Element(tag('s', 'sheetPr'))
        sheet.insert(0, sheet_props)
    for setup_props in sheet_props.findall('s:pageSetUpPr', NS):
        sheet_props.remove(setup_props)
    put(sheet_props, 's', 'pageSetUpPr', fitToPage=1)
    for name in ['pageMargins', 'pageSetup', 'printOptions']:
        for element in sheet.findall(f's:{name}', NS):
            sheet.remove(element)
    print_opts = ET.Element(tag('s', 'printOptions'), headings='0', gridLines='0')
    margins = ET.Element(tag('s', 'pageMargins'), left='0', right='0', top='0', bottom='0', header='0', footer='0')
    setup = ET.Element(tag('s', 'pageSetup'), paperSize='9', orientation='landscape', fitToWidth='1', fitToHeight='1')
    drawing_index = list(sheet).index(sheet.find('s:drawing', NS))
    for offset, element in enumerate([print_opts, margins, setup]):
        sheet.insert(drawing_index + offset, element)
    files[sheet_name] = ET.tostring(sheet, xml_declaration=True, encoding='UTF-8', standalone=True)
    workbook = ET.fromstring(files['xl/workbook.xml'])
    names = workbook.find('s:definedNames', NS)
    if names is None:
        names = ET.Element(tag('s', 'definedNames'))
        workbook.insert(list(workbook).index(workbook.find('s:sheets', NS)) + 1, names)
    put(names, 's', 'definedName', name='_xlnm.Print_Area', localSheetId=0).text = "'Прогноз'!$A$1:$T$28"
    files['xl/workbook.xml'] = ET.tostring(workbook, xml_declaration=True, encoding='UTF-8', standalone=True)
    with ZipFile(BOOK, 'w', compression=8) as archive:
        for name, data in files.items():
            archive.writestr(name, data)

    command = [str(SOFFICE), f'-env:UserInstallation={(work / "lo-profile").as_uri()}', '--headless', '--convert-to', 'pdf', '--outdir', str(work), str(BOOK)]
    subprocess.run(command, check=True, capture_output=True, text=True, timeout=90)
    pdf_path = work / BOOK.with_suffix('.pdf').name
    with pdfplumber.open(pdf_path) as pdf:
        assert len(pdf.pages) == 1
        page = pdf.pages[0]
        candidates = [rect for rect in [*page.rects, *page.curves] if rect['width'] > 300 and rect['height'] > 150 and abs(rect['width'] / rect['height'] - 1000 / 520) < 0.06]
        assert candidates, 'Native chart frame not found'
        frame = max(candidates, key=lambda rect: rect['width'] * rect['height'])
        height = page.height
    reader = PdfReader(pdf_path)
    page = reader.pages[0]
    box = RectangleObject([max(0, frame['x0'] - 0.35), height - frame['bottom'] - 0.35, frame['x1'] + 0.35, height - frame['top'] + 0.35])
    page.mediabox = box
    page.cropbox = box
    writer = PdfWriter()
    writer.add_page(page)
    cropped = work / 'chart.pdf'
    with cropped.open('wb') as stream:
        writer.write(stream)
    subprocess.run([str(CAIRO), '-svg', str(cropped), str(SVG)], check=True)
    subprocess.run([str(NODE), '-e', 'const sharp=require(process.argv[1]); sharp(process.argv[2],{density:300}).resize({width:2000,height:1040,fit:"contain",background:"white"}).flatten({background:"white"}).png().toFile(process.argv[3]).catch(e=>{console.error(e);process.exit(1)});', str(MODULES / 'sharp'), str(SVG), str(PNG)], check=True)
    print(json.dumps({'native_chart': str(BOOK), 'png': str(PNG), 'points_per_series': len(points), 'chart_size_px': [2000, 1040]}, ensure_ascii=False))
