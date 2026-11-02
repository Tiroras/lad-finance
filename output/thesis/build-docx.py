"""Build the complete thesis.docx from the single thesis.md source.
Run with the Codex bundled Python runtime. Does not modify application files.
"""
from pathlib import Path
import argparse
import re
from docx import Document
from docx.shared import Mm, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.enum.text import WD_TAB_ALIGNMENT

ROOT = Path(__file__).resolve().parent
parser=argparse.ArgumentParser(description=__doc__)
# Accept the former full-document command without producing separate versions.
parser.add_argument('--scope',choices=['thesis'],default='thesis',help=argparse.SUPPRESS)
parser.parse_args()
source=(ROOT/'thesis.md').read_text()
in_chapter3=False
in_appendix=False
appendix_number=None
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
THESIS_TOPIC='Разработка мобильного приложения для управления личными финансами'
DOC.core_properties.title=THESIS_TOPIC
DOC.core_properties.subject=THESIS_TOPIC
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
 if current_heading in ('Введение','Заключение'):
  text=re.sub(r'^- ', '-\u00a0', text)
  text=text.replace('В контрольном', 'В\u00a0контрольном')
 if in_chapter3 or current_heading in ('Введение','Заключение'):
  text=re.sub(r'(?<=\d) (?=\d{3}(?:\D|$))','\u00a0',text)
  text=re.sub(r'(?<=\d) (?=(?:RUB|USD|JPY|KWD|байт|копеек)\b)','\u00a0',text)
  text=re.sub(r'\b(рисун(?:ок|ке|ка)|таблиц[аеы]|подраздел[ае]) (?=\d)',r'\1'+'\u00a0',text,flags=re.I)
 # Keep numeric ranges on one line without changing their visible punctuation.
 text=re.sub(r'(?<=\d)–(?=\d)', '\u2060–\u2060', text)
 # Render simple Markdown emphasis; preserve numbered source references.
 for n,seg in enumerate(re.split(r'(\*\*.*?\*\*|`[^`]+`)',text)):
  if not seg: continue
  if seg.startswith('**'): r=p.add_run(seg[2:-2]); r.bold=True
  elif seg.startswith('`'):
   r=p.add_run(seg[1:-1])
   if in_chapter3: r.font.name='Courier New';r.font.size=Pt(12)
  else: r=p.add_run(seg)
  r.font.color.rgb=RGBColor(0,0,0)
 for r in list(p.runs):
  if '⁸' in r.text:
   before,after=r.text.split('⁸',1); r.text=before
   s=p.add_run('8');s.font.superscript=True;r._r.addnext(s._r)
   if after:
    tail=p.add_run(after);s._r.addnext(tail._r)
 return p

TABLE_WIDTHS={1:[30,28,28,28,28,28],2:[33,58,79],3:[37,57,76],4:[37,57,76],5:[39,75,56]}
table_no=0

def table(rows, continuation=False):
 global table_no
 if not continuation:
  table_no+=1
 # Keep the comparison readable at 12 pt: three parts of one logical table.
 # Continuations use numbered columns, following the supplied methodology.
 if table_no==1 and not continuation:
  numbers=[str(n) for n in range(1,len(rows[0])+1)]
  body=rows[1:]
  for part_index,start in enumerate(range(0,len(body),5)):
   if part_index:
    # One explicit break, outside both tables. Keep it separate from the
    # continuation caption so table pagination cannot carry the break forward.
    page_break=DOC.add_paragraph()
    break_format=page_break.paragraph_format
    break_format.first_line_indent=Mm(0)
    break_format.space_before=Pt(0);break_format.space_after=Pt(0)
    break_format.line_spacing=Pt(1)
    break_format.keep_with_next=False;break_format.keep_together=False
    break_format.widow_control=False
    break_run=page_break.add_run();break_run.font.size=Pt(1)
    break_run.add_break(WD_BREAK.PAGE)
    p=DOC.add_paragraph()
    p.paragraph_format.first_line_indent=Mm(0)
    p.paragraph_format.alignment=WD_ALIGN_PARAGRAPH.LEFT
    p.paragraph_format.page_break_before=False
    p.paragraph_format.keep_with_next=True
    p.paragraph_format.space_after=Pt(4)
    inline(p,'Продолжение таблицы 1')
   headers=[rows[0],numbers] if part_index==0 else [numbers]
   tbl=table(headers+body[start:start+5],continuation=True)
  return tbl
 tbl=DOC.add_table(rows=1,cols=len(rows[0]));tbl.alignment=WD_TABLE_ALIGNMENT.CENTER;tbl.autofit=False
 props=tbl._tbl.tblPr
 widths=TABLE_WIDTHS.get(table_no,[170/len(rows[0])]*len(rows[0]))
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
   numbered_header=all(value.isdigit() for value in rowdata)
   p.paragraph_format.alignment=WD_ALIGN_PARAGRAPH.CENTER if numbered_header else WD_ALIGN_PARAGRAPH.LEFT
   # Table 1 spans three parts: attach only its headings to the first data row.
   # Linking every data row makes an entire part an indivisible page block.
   p.paragraph_format.keep_with_next=(i==0 or numbered_header) if table_no==1 else (i<len(rows)-1)
   p.paragraph_format.keep_together=True
   inline(p,txt)
   is_text_header=i==0 and not numbered_header
   for r in p.runs: r.font.size=Pt(12);r.bold=is_text_header
   if is_text_header:
    shade=OxmlElement('w:shd');shade.set(qn('w:fill'),'F2F2F2');tcpr.append(shade)
 return tbl

def math_runs(expr):
 # Small OMML authoring path: literal operators plus braced subscripts/superscripts.
 # These equations remain editable in Word; no rasterized formulas are inserted.
 parts=[];i=0
 while i<len(expr):
  if expr[i] in '_^':
   kind=expr[i];i+=1
   if expr[i]=='{':
    j=i+1;depth=1
    while depth:
     depth+=(expr[j]=='{')-(expr[j]=='}');j+=1
    script=expr[i+1:j-1];i=j
   else: script=expr[i];i+=1
   base=parts.pop()
   node=OxmlElement('m:sSub' if kind=='_' else 'm:sSup')
   e=OxmlElement('m:e');e.append(base);node.append(e)
   sub=OxmlElement('m:sub' if kind=='_' else 'm:sup')
   for item in math_runs(script):sub.append(item)
   node.append(sub);parts.append(node)
  else:
   r=OxmlElement('m:r');rp=OxmlElement('m:rPr');style=OxmlElement('m:sty');style.set(qn('m:val'),'p');rp.append(style);r.append(rp)
   wrp=OxmlElement('w:rPr');size=OxmlElement('w:sz');size.set(qn('w:val'),'28');wrp.append(size);r.append(wrp)
   t=OxmlElement('m:t');t.set(qn('xml:space'),'preserve');t.text=expr[i];r.append(t);parts.append(r);i+=1
 return parts

def equation(number,expr):
 p=DOC.add_paragraph();pf=p.paragraph_format
 pf.first_line_indent=Mm(0);pf.alignment=WD_ALIGN_PARAGRAPH.LEFT
 pf.space_before=Pt(5);pf.space_after=Pt(5);pf.keep_with_next=True;pf.keep_together=True
 pf.tab_stops.add_tab_stop(Mm(78),WD_TAB_ALIGNMENT.CENTER)
 pf.tab_stops.add_tab_stop(Mm(170),WD_TAB_ALIGNMENT.RIGHT)
 p.add_run('\t');m=OxmlElement('m:oMath')
 for node in math_runs(expr):m.append(node)
 p._p.append(m);p.add_run('\t('+number+')')

lines=source.splitlines()
current_heading=''
i=0
while i<len(lines):
 line=lines[i].strip()
 if not line:i+=1;continue
 if line.startswith('#'):
  m=re.match(r'^(#{1,3})\s+(.+)',line)
  if len(m.group(1))==1:
   current_heading=m.group(2)
   in_chapter3=current_heading.startswith('3 ')
  if len(m.group(1))==1 and current_heading.startswith('Приложение '):
   in_appendix=True
   appendix_number=current_heading.rsplit(' ',1)[-1]
  p=DOC.add_paragraph(style=f'Heading {len(m.group(1))}');inline(p,m.group(2))
  if in_appendix and (appendix_number=='1' or len(m.group(1))<3):
   p.paragraph_format.alignment=WD_ALIGN_PARAGRAPH.CENTER
   p.paragraph_format.first_line_indent=Mm(0)
   p.paragraph_format.page_break_before=(len(m.group(1))==1)
   p.paragraph_format.space_before=Pt(0)
   p.paragraph_format.space_after=Pt(4)
   p.paragraph_format.line_spacing=1
  if len(DOC.paragraphs)==1:p.paragraph_format.page_break_before=False
  i+=1;continue
 if line.startswith('$$'):
  match=re.fullmatch(r'\$\$ (.+) \\tag\{([^}]+)\} \$\$',line)
  if not match: raise ValueError('Invalid numbered formula: '+line)
  equation(match[2],match[1]);i+=1;continue
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
  if appendix_number=='1' and not caption.startswith('Рисунок 1.1 '):
   p.paragraph_format.page_break_before=True
  width=72 if 'control-screen' in path else 160
  shape=p.add_run().add_picture(str(ROOT/path),width=Mm(width))
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
 if appendix_number=='2':
  if re.fullmatch(r'\*\*[^*]+\*\*',text):
   p.paragraph_format.keep_with_next=True
   p.paragraph_format.keep_together=True
   p.paragraph_format.space_before=Pt(8)
   p.paragraph_format.space_after=Pt(4)
  if re.match(r'^\d+\. ',text):
   p.paragraph_format.left_indent=Mm(10)
   p.paragraph_format.first_line_indent=Mm(-10)
   p.paragraph_format.keep_together=True
 j=i
 while j<len(lines) and not lines[j].strip(): j+=1
 # Keep the short introduction with its UI sketch or behavioural diagram.
 # Longer scenario explanations remain normal paragraphs around the figure.
 if j<len(lines) and re.match(r'!\[.*\]\(figures/(?:01-ui|02-use-cases-|02-activity-)[^)]*\)',lines[j].strip()):
  p.paragraph_format.keep_with_next=True
  p.paragraph_format.keep_together=True
 if in_chapter3 and j<len(lines) and lines[j].strip().startswith('$$'):
  p.paragraph_format.keep_with_next=True
 if p._p.getprevious() is not None and p._p.getprevious().tag==qn('w:tbl'):
  p.paragraph_format.space_before=Pt(6)
 if re.match(r'^\d+\. ',text) and 'дата обращения:' in text:
  p.paragraph_format.first_line_indent=Mm(0);p.paragraph_format.alignment=WD_ALIGN_PARAGRAPH.LEFT
  p.paragraph_format.space_after=Pt(6);p.paragraph_format.keep_together=True

output=ROOT/'thesis.docx'
DOC.save(output)
print(f'Created {output}: {len(DOC.paragraphs)} paragraphs, {len(DOC.tables)} tables, {len(DOC.inline_shapes)} figures')
