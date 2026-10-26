"""Build the DOCX from chapters-1-2.md with the supplied thesis formatting rules.
Run with the Codex bundled Python runtime. Does not modify application files.
"""
from pathlib import Path
import re
from docx import Document
from docx.shared import Mm, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

ROOT = Path(__file__).resolve().parent
DOC = Document()
sec=DOC.sections[0]
sec.page_width=Mm(210); sec.page_height=Mm(297)
sec.left_margin=Mm(30); sec.right_margin=Mm(10)
sec.top_margin=Mm(20); sec.bottom_margin=Mm(20)
sec.header_distance=Mm(8); sec.footer_distance=Mm(10)

for name in ['Normal','Title','Heading 1','Heading 2','Heading 3','Caption']:
 st=DOC.styles[name]
 st.font.name='Times New Roman'; st.font.size=Pt(14); st.font.color.rgb=RGBColor(0,0,0)
 fonts=st.element.get_or_add_rPr().get_or_add_rFonts()
 for a in list(fonts.attrib):
  if 'theme' in a.lower(): del fonts.attrib[a]
 for a in ['ascii','hAnsi','eastAsia','cs']: fonts.set(qn('w:'+a),'Times New Roman')
 pf=st.paragraph_format
 pf.line_spacing=1.5; pf.space_before=Pt(0); pf.space_after=Pt(0)
 pf.first_line_indent=Mm(10); pf.widow_control=True
 pf.alignment=WD_ALIGN_PARAGRAPH.JUSTIFY
for name in ['Heading 1','Heading 2','Heading 3']:
 st=DOC.styles[name]; st.font.bold=True
 pf=st.paragraph_format; pf.first_line_indent=Mm(0 if name=='Heading 1' else 10)
 pf.space_before=Pt(0 if name=='Heading 1' else 8); pf.space_after=Pt(10)
 pf.keep_with_next=True; pf.keep_together=True
DOC.styles['Heading 1'].paragraph_format.page_break_before=True
DOC.styles['Caption'].font.bold=False
DOC.styles['Caption'].font.italic=False
DOC.styles['Caption'].paragraph_format.first_line_indent=Mm(0)
DOC.styles['Caption'].paragraph_format.alignment=WD_ALIGN_PARAGRAPH.CENTER
DOC.styles['Caption'].paragraph_format.keep_together=True
DOC.core_properties.title='Главы 1 и 2 ВКР о приложении «Лад»'
DOC.core_properties.subject='Требования и проектирование мобильного приложения для учёта и планирования личных финансов'
DOC.core_properties.author=''
DOC.core_properties.last_modified_by=''
DOC.core_properties.comments=''
DOC.core_properties.language='ru-RU'
lang=OxmlElement('w:lang');lang.set(qn('w:val'),'ru-RU'); DOC.styles['Normal'].element.get_or_add_rPr().append(lang)
settings=DOC.settings.element
hy=OxmlElement('w:autoHyphenation');hy.set(qn('w:val'),'0');settings.append(hy)

foot=sec.footer.paragraphs[0]
foot.alignment=WD_ALIGN_PARAGRAPH.CENTER
foot.paragraph_format.first_line_indent=Mm(0)
run=foot.add_run();fld=OxmlElement('w:fldSimple');fld.set(qn('w:instr'),'PAGE')
r=OxmlElement('w:r');t=OxmlElement('w:t');t.text='1';r.append(t);fld.append(r);run._r.addnext(fld)


def inline(p,text):
 # Render simple Markdown emphasis; preserve numbered source references.
 for n,seg in enumerate(re.split(r'(\*\*.*?\*\*|`[^`]+`)',text)):
  if not seg: continue
  if seg.startswith('**'): r=p.add_run(seg[2:-2]); r.bold=True
  elif seg.startswith('`'): r=p.add_run(seg[1:-1])
  else: r=p.add_run(seg)
  r.font.color.rgb=RGBColor(0,0,0)
 for r in list(p.runs):
  if '⁸' in r.text:
   before,after=r.text.split('⁸',1); r.text=before
   s=p.add_run('8');s.font.superscript=True;r._r.addnext(s._r)
   if after:
    tail=p.add_run(after);s._r.addnext(tail._r)
 return p

TABLE_WIDTHS={1:[26,44,48,52],2:[33,58,79],3:[37,57,76],4:[37,57,76],5:[39,75,56],6:[47,65,58]}
table_no=0

def table(rows):
 global table_no
 table_no+=1
 tbl=DOC.add_table(rows=1,cols=len(rows[0]));tbl.alignment=WD_TABLE_ALIGNMENT.CENTER;tbl.autofit=False
 props=tbl._tbl.tblPr
 widths=TABLE_WIDTHS[table_no]
 for col,w in zip(tbl.columns,widths): col.width=Mm(w)
 borders=OxmlElement('w:tblBorders')
 for edge in ['top','left','bottom','right','insideH','insideV']:
  b=OxmlElement('w:'+edge);b.set(qn('w:val'),'single');b.set(qn('w:sz'),'4');b.set(qn('w:color'),'000000');borders.append(b)
 props.append(borders)
 for i,rowdata in enumerate(rows):
  row=tbl.rows[0] if i==0 else tbl.add_row()
  trpr=row._tr.get_or_add_trPr();trpr.append(OxmlElement('w:cantSplit'))
  for j,(cell,txt) in enumerate(zip(row.cells,rowdata)):
   cell.width=Mm(widths[j]);cell.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
   tcpr=cell._tc.get_or_add_tcPr()
   margins=OxmlElement('w:tcMar')
   for edge,val in [('top','50'),('bottom','50'),('left','75'),('right','75')]:
    el=OxmlElement('w:'+edge);el.set(qn('w:w'),val);el.set(qn('w:type'),'dxa');margins.append(el)
   tcpr.append(margins)
   p=cell.paragraphs[0];p.paragraph_format.first_line_indent=Mm(0);p.paragraph_format.line_spacing=1.5
   p.paragraph_format.alignment=WD_ALIGN_PARAGRAPH.LEFT
   p.paragraph_format.keep_with_next=(i<len(rows)-1)
   p.paragraph_format.keep_together=True
   inline(p,txt)
   for r in p.runs: r.font.size=Pt(12);r.bold=(i==0)
   if i==0:
    shade=OxmlElement('w:shd');shade.set(qn('w:fill'),'F2F2F2');tcpr.append(shade)
 return tbl

lines=(ROOT/'chapters-1-2.md').read_text().splitlines()
i=0
while i<len(lines):
 line=lines[i].strip()
 if not line:i+=1;continue
 if line.startswith('#'):
  m=re.match(r'^(#{1,3})\s+(.+)',line)
  p=DOC.add_paragraph(style=f'Heading {len(m.group(1))}');inline(p,m.group(2))
  if len(DOC.paragraphs)==1:p.paragraph_format.page_break_before=False
  i+=1;continue
 if line.startswith('|'):
  rows=[]
  while i<len(lines) and lines[i].strip().startswith('|'):
   cells=[x.strip() for x in lines[i].strip().strip('|').split('|')]
   if not all(re.fullmatch(r'[:\-\s]+',x) for x in cells):rows.append(cells)
   i+=1
  table(rows);continue
 image_match=re.fullmatch(r'!\[(.*)\]\((.*)\)',line)
 if image_match:
  caption,path=image_match.groups()
  p=DOC.add_paragraph();p.paragraph_format.first_line_indent=Mm(0);p.alignment=WD_ALIGN_PARAGRAPH.CENTER
  p.paragraph_format.keep_with_next=True;p.paragraph_format.keep_together=True
  p.paragraph_format.space_before=Pt(6);p.paragraph_format.line_spacing=1
  shape=p.add_run().add_picture(str(ROOT/path),width=Mm(160))
  shape._inline.docPr.set('descr',caption)
  cap=DOC.add_paragraph(style='Caption');inline(cap,caption);cap.paragraph_format.space_after=Pt(8)
  i+=1;continue
 if line.startswith('Таблица '):
  p=DOC.add_paragraph();p.paragraph_format.first_line_indent=Mm(0);p.alignment=WD_ALIGN_PARAGRAPH.LEFT
  p.paragraph_format.keep_with_next=True;p.paragraph_format.keep_together=True
  p.paragraph_format.space_before=Pt(6);p.paragraph_format.space_after=Pt(4)
  inline(p,line);i+=1;continue
 parts=[line];i+=1
 while i<len(lines) and lines[i].strip() and not lines[i].lstrip().startswith(('#','|','![')):
  parts.append(lines[i].strip());i+=1
 text=' '.join(parts)
 p=DOC.add_paragraph();inline(p,text)
 if p._p.getprevious() is not None and p._p.getprevious().tag==qn('w:tbl'):
  p.paragraph_format.space_before=Pt(6)
 if re.match(r'^\d+\. ',text) and 'дата обращения:' in text:
  p.paragraph_format.first_line_indent=Mm(0);p.paragraph_format.alignment=WD_ALIGN_PARAGRAPH.LEFT
  p.paragraph_format.space_after=Pt(6);p.paragraph_format.keep_together=True

DOC.save(ROOT/'chapters-1-2.docx')
print(f'Created {ROOT / "chapters-1-2.docx"}: {len(DOC.paragraphs)} paragraphs, {len(DOC.tables)} tables, {len(DOC.inline_shapes)} figures')
