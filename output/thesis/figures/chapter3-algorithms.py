"""Блок-схемы девяти основных прецедентов главы 3.

Запуск: bundled Python; PNG создаются через bundled Node и Sharp.
Ширина SVG 800 px, PNG 1889 px (300 dpi); вставка 160 мм даёт Arial 11,34 пт.
Используются начало/конец, процесс, предопределённый процесс, решение,
ввод/вывод. Ветви и циклы соответствуют описанию прецедентов 3.1–3.9.
Низкоуровневые ограничения общих проверок раскрываются в тексте главы.
Прежние схемы вспомогательных функций не регенерируются и не удаляются.
"""
from dataclasses import dataclass
from html import escape
from pathlib import Path
import json
import subprocess
from PIL import ImageFont

HERE = Path(__file__).resolve().parent
RUNTIME = Path.home() / '.cache/codex-runtimes/codex-primary-runtime/dependencies'
NODE = RUNTIME / 'node/bin/node'
SHARP = RUNTIME / 'node/node_modules/sharp'
FONT_PATH = Path('/System/Library/Fonts/Supplemental/Arial.ttf')
FONT_SIZE, LINE, WIDTH, PNG_WIDTH = 20, 26, 800, 1889
FONT = ImageFont.truetype(str(FONT_PATH), FONT_SIZE)

@dataclass
class Node:
    name: str
    kind: str
    text: str
    x: float
    y: float
    width: float
    height: float

    @property
    def top(self): return (self.x, self.y)
    @property
    def bottom(self): return (self.x, self.y + self.height)
    @property
    def left(self): return (self.x - self.width / 2 + (9 if self.kind == 'io' else 0), self.y + self.height / 2)
    @property
    def right(self): return (self.x + self.width / 2 - (9 if self.kind == 'io' else 0), self.y + self.height / 2)
    @property
    def bounds(self): return (self.x-self.width/2,self.y,self.x+self.width/2,self.y+self.height)

@dataclass
class Edge:
    source: Node
    target: Node
    points: tuple
    condition: str = ''

class Diagram:
    def __init__(self, name, height):
        self.name, self.height = name, height
        self.nodes, self.edges, self.labels = [], [], []

    def node(self, name, kind, text, x, y, width, height):
        n = Node(name, kind, text, x, y, width, height)
        self.nodes.append(n)
        return n

    def edge(self, source, target, *points, condition='', label=None):
        if not points: points = (source.bottom, target.top)
        self.edges.append(Edge(source,target,points,condition))
        if label: self.labels.append((condition,*label))

    def text(self, text, x, center):
        box=FONT.getbbox(text,anchor='ls')
        baseline=center-(box[1]+box[3])/2
        return f'<text x="{x:g}" y="{baseline:g}" text-anchor="middle" font-family="Arial" font-size="{FONT_SIZE}" fill="#000">{escape(text)}</text>'

    def svg(self):
        out=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{self.height}" viewBox="0 0 {WIDTH} {self.height}" data-diagram="{self.name}">',
            '<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#000"/></marker></defs>',
            f'<rect width="{WIDTH}" height="{self.height}" fill="#fff"/>']
        for e in self.edges:
            p=' '.join(f'{x:g},{y:g}' for x,y in e.points)
            out.append(f'<polyline data-from="{e.source.name}" data-to="{e.target.name}" data-condition="{escape(e.condition)}" points="{p}" fill="none" stroke="#000" stroke-width="1.8" stroke-linejoin="round" marker-end="url(#arrow)"/>')
        for n in self.nodes:
            l,t,r,b=n.bounds
            style='fill="#fff" stroke="#000" stroke-width="1.8"'
            out.append(f'<g data-node="{n.name}" data-kind="{n.kind}">')
            if n.kind=='decision':
                p=f'{n.x:g},{t:g} {r:g},{(t+b)/2:g} {n.x:g},{b:g} {l:g},{(t+b)/2:g}'
                out.append(f'<polygon points="{p}" {style}/>')
            elif n.kind=='io':
                p=f'{l+18:g},{t:g} {r:g},{t:g} {r-18:g},{b:g} {l:g},{b:g}'
                out.append(f'<polygon points="{p}" {style}/>')
            else:
                radius=f' rx="{n.height/2:g}"' if n.kind=='term' else ''
                out.append(f'<rect x="{l:g}" y="{t:g}" width="{n.width:g}" height="{n.height:g}"{radius} {style}/>')
                if n.kind=='subprocess':
                    out.append(f'<path d="M {l+16:g} {t:g} V {b:g} M {r-16:g} {t:g} V {b:g}" fill="none" stroke="#000" stroke-width="1.8"/>')
            lines=n.text.split('\n')
            assert len(lines)*LINE<=n.height-8, (self.name,n.name,'text height')
            for i,line in enumerate(lines):
                center=t+n.height/2+(i-(len(lines)-1)/2)*LINE
                available=n.width-(52 if n.kind=='io' else 40)
                if n.kind=='decision':
                    available=n.width*(1-(abs(center-(t+b)/2)+10)/(n.height/2))-24
                assert FONT.getlength(line)<=available,(self.name,n.name,line,FONT.getlength(line),available)
                out.append(self.text(line,n.x,center))
            out.append('</g>')
        for text,x,y in self.labels: out.append(self.text(text,x,y))
        out.append('</svg>')
        return '\n'.join(out)+'\n'


def transfer_flow():
    d=Diagram('transfer',950);x,w=270,440
    start=d.node('start','term','Начало',x,18,220,40)
    inp=d.node('input','io','Счета, дата, суммы перевода\nи необязательная комиссия',x,86,w,66)
    prepare=d.node('prepare','process','Проверить ввод и условия комиссии;\nподготовить перевод',x,180,w,68)
    valid=d.node('valid-transfer','decision','Перевод\nдопустим?',x,280,w,100)
    fee=d.node('fee-selected','decision','Комиссия\nвыбрана?',x,416,w,100)
    prepare_fee=d.node('prepare-fee','process','Подготовить и проверить\nотдельный расход комиссии',x,554,w,68)
    valid_fee=d.node('valid-fee','decision','Расход комиссии\nдопустим?',x,656,w,100)
    output=d.node('output','io','Применить выбранные записи\nодним состоянием',x,796,w,66)
    end=d.node('end','term','Конец',x,894,220,40)
    err=d.node('error','io','Ошибка;\nучёт не изменён',660,658,230,96)
    for a,b in [(start,inp),(inp,prepare),(prepare,valid),(prepare_fee,valid_fee),(output,end)]:d.edge(a,b)
    d.edge(valid,fee,condition='Да',label=(295,398))
    d.edge(valid,err,valid.right,(540,330),(540,706),err.left,condition='Нет',label=(518,312))
    d.edge(fee,prepare_fee,condition='Да',label=(295,537))
    d.edge(fee,output,fee.left,(24,466),(24,778),(270,778),output.top,condition='Нет',label=(42,445))
    d.edge(valid_fee,output,condition='Да',label=(295,776))
    d.edge(valid_fee,err,valid_fee.right,err.left,condition='Нет',label=(518,688))
    d.edge(err,end,err.bottom,(660,914),end.right)
    return d

def transaction_flow():
    d=Diagram('transaction',950)
    s=d.node('start','term','Начало',400,18,220,40)
    i=d.node('input','io','Сумма, дата, счёт, вид операции\nи данные выбранного вида',400,86,650,66)
    k=d.node('kind','decision','Вид\nоперации',400,188,400,110)
    income=d.node('income','process','Подготовить\nдоход',140,350,240,80)
    expense=d.node('expense','process','Подготовить расход\nи выбранные части',400,350,240,80)
    refund=d.node('refund','process','Связать возврат\nс покупкой',660,350,240,80)
    check=d.node('check','process','Проверить суммы, даты и ссылки;\nограничения частей и возврата;\nфинансовую согласованность кандидата',400,478,650,96)
    valid=d.node('valid','decision','Изменение\nдопустимо?',270,620,440,100)
    out=d.node('output','io','Вернуть состояние с операцией;\nпересчитать остатки и аналитику',270,770,440,76)
    end=d.node('end','term','Конец',270,890,220,40)
    err=d.node('error','io','Ошибка;\nучёт не изменён',660,622,230,96)
    ee=d.node('end-error','term','Конец',660,770,200,40)
    for a,b in [(s,i),(i,k),(check,valid),(out,end),(err,ee)]:
        if a is check:d.edge(a,b,a.bottom,(400,596),(270,596),b.top)
        else:d.edge(a,b)
    d.edge(k,income,k.left,(140,243),income.top,condition='Доход',label=(145,220))
    d.edge(k,expense,condition='Расход',label=(447,324))
    d.edge(k,refund,k.right,(660,243),refund.top,condition='Возврат',label=(657,220))
    d.edge(income,check,income.bottom,(140,454),(400,454),check.top)
    d.edge(expense,check)
    d.edge(refund,check,refund.bottom,(660,454),(400,454),check.top)
    d.edge(valid,out,condition='Да',label=(295,745))
    d.edge(valid,err,valid.right,err.left,condition='Нет',label=(518,652))
    return d


def contribution_flow():
    d=Diagram('contribution',910);x,w=270,440
    s=d.node('start','term','Начало',x,18,220,40)
    i=d.node('input','io','Цель, счета и суммы\nсписания и зачисления',x,86,w,66)
    prep=d.node('prepare','process','Найти цель и накопительный счёт\nв её валюте; проверить ввод',x,180,w,80)
    schedule=d.node('schedule','decision','Есть событие\nграфика?',x,300,w,100)
    identity=d.node('identity','process','Определить\nверсию и дату\nсобытия',660,298,230,104)
    candidate=d.node('candidate','process','Подготовить перевод с целью;\nпроверить остаток цели,\nисточник и финансовые ограничения',x,450,w,100)
    valid=d.node('valid','decision','Взнос\nдопустим?',x,590,w,100)
    out=d.node('output','io','Применить перевод;\nпоказать прогресс по зачислению',x,734,w,76)
    end=d.node('end','term','Конец',x,854,220,40)
    err=d.node('error','io','Ошибка;\nучёт не изменён',660,592,230,96)
    for a,b in [(s,i),(i,prep),(prep,schedule),(candidate,valid),(out,end)]:d.edge(a,b)
    d.edge(schedule,identity,schedule.right,identity.left,condition='Да',label=(518,332))
    d.edge(schedule,candidate,condition='Нет',label=(300,414))
    d.edge(identity,candidate,identity.bottom,(660,432),(270,432),candidate.top)
    d.edge(valid,out,condition='Да',label=(295,714))
    d.edge(valid,err,valid.right,err.left,condition='Нет',label=(518,622))
    d.edge(err,end,err.bottom,(660,874),end.right)
    return d


def goal_flow():
    d=Diagram('goal',950);x,w=270,440
    s=d.node('start','term','Начало',x,18,220,40)
    i=d.node('input','io','Цель, счета, суммы\nсписания и зачисления',x,86,w,66)
    prep=d.node('prepare','process','Проверить цель, сумму,\nвиды счетов и валюту источника',x,180,w,70)
    valid=d.node('valid-input','decision','Вывод\nдопустим?',x,280,w,100)
    release=d.node('release','process','Подготовить освобождение суммы\nиз цели и идентификатор перевода',x,420,w,76)
    transfer=d.node('transfer','process','Подготовить связанный перевод;\nпроверить доступность источника\nи обеспечение оставшихся целей',x,534,w,96)
    ok=d.node('valid-state','decision','Учёт\nсогласован?',x,668,w,100)
    out=d.node('output','io','Применить освобождение\nи перевод одним состоянием',x,808,w,76)
    end=d.node('end','term','Конец',x,916,220,40)
    d.height=976
    err=d.node('error','io','Ошибка;\nучёт не изменён',660,670,230,96)
    for a,b in [(s,i),(i,prep),(prep,valid),(release,transfer),(transfer,ok),(out,end)]:d.edge(a,b)
    d.edge(valid,release,condition='Да',label=(295,400))
    d.edge(valid,err,valid.right,(540,330),(540,718),err.left,condition='Нет',label=(518,312))
    d.edge(ok,out,condition='Да',label=(295,788))
    d.edge(ok,err,ok.right,err.left,condition='Нет',label=(518,700))
    d.edge(err,end,err.bottom,(660,936),end.right)
    return d


def reconciliation_flow():
    d=Diagram('reconciliation',1050);x,w=270,440
    s=d.node('start','term','Начало',x,18,220,40)
    i=d.node('input','io','Счёт, дата, известный остаток\nи заметка',x,86,w,66)
    calc=d.node('calculate','process','Рассчитать фактический остаток,\nразницу и отпечаток записей',x,180,w,70)
    same=d.node('same','decision','Остатки\nсовпали?',x,280,w,100)
    confirm=d.node('confirm','subprocess','Подтвердить без корректировки:\nпроверки и запись сверки',x,430,w,90)
    diff=d.node('difference','io','Показать разницу\nи операции',660,282,230,96)
    consent=d.node('consent','decision','Есть\nсогласие?',660,430,230,100)
    correction=d.node('correction','subprocess','UC-06:\nкорректировка',660,570,230,90)
    success=d.node('success','decision','Подтверждение\nуспешно?',x,730,w,100)
    result=d.node('output','io','Показать сохранённую сверку\nи её актуальность',x,880,w,76)
    error=d.node('error','io','Ошибка;\nучёт не изменён',660,852,230,96)
    end=d.node('end','term','Конец',x,990,220,40)
    for a,b in [(s,i),(i,calc),(calc,same),(diff,consent),(result,end)]:d.edge(a,b)
    d.edge(same,confirm,condition='Да',label=(295,404))
    d.edge(same,diff,same.right,diff.left,condition='Нет',label=(518,312))
    d.edge(confirm,success)
    d.edge(consent,correction,condition='Да',label=(685,550))
    d.edge(consent,end,consent.right,(788,480),(788,1010),end.right,condition='Нет',label=(775,458))
    d.edge(correction,success,correction.bottom,(660,710),(270,710),success.top)
    d.edge(success,result,condition='Да',label=(295,856))
    d.edge(success,error,success.right,(530,780),(530,900),error.left,condition='Нет',label=(518,760))
    d.edge(error,end,error.bottom,(660,1010),end.right)
    return d


def adjustment_flow():
    d=Diagram('adjustment',1050);x,w=270,440
    s=d.node('start','term','Начало',x,18,220,40)
    i=d.node('input','io','Счёт, дата, остаток,\nсогласие и причина',x,80,w,66)
    check=d.node('check','process','Проверить ввод и отпечаток;\nзаново определить разницу',x,170,w,70)
    valid=d.node('valid','decision','Ввод\nдопустим?',x,266,w,90)
    nonzero=d.node('nonzero','decision','Разница\nненулевая?',x,390,w,90)
    candidate=d.node('candidate','process','Проверить согласие, счёт и причину;\nподготовить датированную\nкорректировку в новом состоянии',x,520,w,96)
    finance=d.node('finance','process','Проверить цели и их освобождения,\nкредит и числовые пределы',x,646,w,70)
    ok=d.node('valid-state','decision','Все проверки\nпройдены?',530,746,w,90)
    out=d.node('output','io','Вернуть корректировку и сверку\nс обновлённым отпечатком',x,876,w,80)
    end=d.node('end','term','Конец',x,990,220,40)
    err=d.node('error','io','Ошибка;\nучёт не изменён',145,746,230,90)
    zero=d.node('zero','subprocess','Обычная сверка\nбез корректировки',660,450,230,80)
    for a,b in [(s,i),(i,check),(check,valid),(candidate,finance),(out,end)]:d.edge(a,b)
    d.edge(valid,nonzero,condition='Да',label=(295,374))
    d.edge(valid,err,valid.left,(24,311),(24,728),(145,728),err.top,condition='Нет',label=(28,293))
    d.edge(nonzero,candidate,condition='Да',label=(295,501))
    d.edge(nonzero,zero,nonzero.right,(520,435),(520,490),zero.left,condition='Нет',label=(518,414))
    d.edge(finance,ok,finance.bottom,(270,730),(530,730),ok.top)
    d.edge(ok,out,ok.bottom,(530,856),(270,856),out.top,condition='Да',label=(555,856))
    d.edge(ok,err,ok.left,err.right,condition='Нет',label=(282,773))
    d.edge(err,end,err.bottom,(145,856),(24,856),(24,1010),end.left)
    d.edge(zero,end,zero.right,(788,490),(788,1010),end.right)
    return d


def forecast_flow():
    d=Diagram('forecast',1020);x,w=270,440
    s=d.node('start','term','Начало',x,18,220,40)
    i=d.node('input','io','Состояние, дата, горизонт\nи назначения счетов',x,80,w,66)
    events=d.node('events','process','Проверить параметры и курсы;\nсобрать события по датам;\nначать с сегодняшнего дня',x,174,w,96)
    valid=d.node('valid','decision','Расчёт\nвозможен?',x,300,w,100)
    day=d.node('day','process','Обработать день:\nдвижения по счетам\nи снятие удержаний',x,440,w,96)
    total=d.node('total','process','Переоценить остатки;\nдобавить неназначенное влияние;\nсопоставить с резервом',x,566,w,96)
    more=d.node('more','decision','Есть следующий\nдень?',x,702,w,100)
    advance=d.node('advance','process','Перейти\nк следующему\nдню',660,700,230,104)
    out=d.node('output','io','Остатки, минимумы, дефицит\nи предупреждения',x,846,w,76)
    end=d.node('end','term','Конец',x,962,220,40)
    err=d.node('error','io','Ошибка\nисходных данных',660,302,230,96)
    for a,b in [(s,i),(i,events),(events,valid),(day,total),(total,more),(out,end)]:d.edge(a,b)
    d.edge(valid,day,condition='Да',label=(295,420))
    d.edge(valid,err,valid.right,err.left,condition='Нет',label=(518,332))
    d.edge(more,advance,more.right,advance.left,condition='Да',label=(518,734))
    d.edge(advance,day,advance.top,(660,488),day.right)
    d.edge(more,out,condition='Нет',label=(300,824))
    d.edge(err,end,err.right,(788,350),(788,982),end.right)
    return d


def purchase_flow():
    d=Diagram('purchase',1070);x,w=270,440
    s=d.node('start','term','Начало',x,18,220,40)
    i=d.node('input','io','Сумма, дата, повседневный счёт\nи горизонт расчёта',x,80,w,66)
    base=d.node('base','subprocess','Проверить ввод; построить прогноз;\nвыбрать последний день',x,174,w,70)
    obstacles=d.node('obstacles','decision','Есть исходные\nпрепятствия?',x,276,w,100)
    zero=d.node('zero','process','Максимум — 0;\nподходящей даты\nнет',660,274,230,104)
    limit=d.node('limit','subprocess','Двоичный поиск предела дня;\nучесть последующие пределы',x,418,w,80)
    more=d.node('more','decision','Есть предыдущий\nдень?',x,538,w,100)
    previous=d.node('previous','process','Перейти\nк предыдущему\nдню',660,536,230,104)
    purchase=d.node('purchase','subprocess','Рассчитать вариант с покупкой;\nсопоставить с исходным прогнозом',x,680,w,76)
    today=d.node('today','decision','Покупка\nсегодня?',x,792,w,100)
    daily=d.node('daily','process','Оценить\nдневную сумму\nпосле покупки',660,790,230,104)
    out=d.node('output','io','Вывод о покупке, сумма, дата\nи ограничения расчёта',x,940,w,66)
    end=d.node('end','term','Конец',x,1028,220,40)
    d.height=1090
    for a,b in [(s,i),(i,base),(base,obstacles),(limit,more),(purchase,today),(out,end)]:d.edge(a,b)
    d.edge(obstacles,zero,obstacles.right,zero.left,condition='Да',label=(518,308))
    d.edge(obstacles,limit,condition='Нет',label=(300,398))
    d.edge(zero,purchase,zero.right,(788,326),(788,660),(270,660),purchase.top)
    d.edge(more,previous,more.right,previous.left,condition='Да',label=(518,570))
    d.edge(previous,limit,previous.top,(660,458),limit.right)
    d.edge(more,purchase,condition='Нет',label=(300,649))
    d.edge(today,daily,today.right,daily.left,condition='Да',label=(518,824))
    d.edge(today,out,condition='Нет',label=(300,904))
    d.edge(daily,out,daily.bottom,(660,922),(270,922),out.top)
    return d


def scenario_flow():
    d=Diagram('scenario',1050);x,w=270,440
    s=d.node('start','term','Начало',x,12,220,36)
    i=d.node('input','io','Условия, горизонт\nи выбранное действие',x,70,w,60)
    valid=d.node('valid','decision','Условия\nдопустимы?',x,160,w,90)
    compare=d.node('compare','decision','Показать\nсравнение?',x,290,w,90)
    forecasts=d.node('forecasts','subprocess','Построить два прогноза\nиз одного состояния;\nсопоставить показатели',x,410,w,96)
    result=d.node('result','io','Сравнение остатков, минимумов\nи имеющиеся предупреждения',x,536,w,66)
    save=d.node('save','decision','Сохранить\nусловия?',x,640,w,90)
    revalidate=d.node('revalidate','decision','Повторная проверка\nпройдена?',x,772,w,100)
    saved=d.node('saved','io','Вернуть состояние\nс сохранёнными условиями сценария',x,912,w,76)
    end=d.node('end','term','Конец',x,1020,220,40)
    d.height=1080
    err=d.node('error-input','io','Ошибка условий;\nисправить ввод',660,160,230,90)
    errsave=d.node('error-save','io','Ошибка;\nсценарий\nне сохранён',660,770,230,104)
    for a,b in [(s,i),(forecasts,result),(result,save),(saved,end)]:d.edge(a,b)
    d.edge(i,valid)
    d.edge(valid,compare,condition='Да',label=(295,270))
    d.edge(valid,err,valid.right,err.left,condition='Нет',label=(518,187))
    d.edge(compare,forecasts,condition='Да',label=(295,395))
    d.edge(compare,save,compare.left,(24,335),(24,620),(270,620),save.top,condition='Нет',label=(42,313))
    d.edge(save,revalidate,condition='Да',label=(295,751))
    d.edge(save,end,save.right,(788,685),(788,1040),end.right,condition='Нет',label=(518,663))
    d.edge(revalidate,saved,condition='Да',label=(295,892))
    d.edge(revalidate,errsave,revalidate.right,errsave.left,condition='Нет',label=(518,804))
    d.edge(err,end,err.right,(788,205),(788,1040),end.right)
    d.edge(errsave,end,errsave.bottom,(660,1040),end.right)
    return d

DIAGRAMS = {
    'transaction': transaction_flow(),
    'transfer': transfer_flow(),
    'contribution': contribution_flow(),
    'goal': goal_flow(),
    'reconciliation': reconciliation_flow(),
    'adjustment': adjustment_flow(),
    'forecast': forecast_flow(),
    'purchase': purchase_flow(),
    'scenario': scenario_flow(),
}


def main():
    paths=[]
    for name,d in DIAGRAMS.items():
        p=HERE/f'chapter3-flow-{name}.svg';p.write_text(d.svg());paths.append(str(p))
    code='''const sharp=require(process.argv[1]); const paths=JSON.parse(process.argv[2]); (async()=>{for(const p of paths)await sharp(p).resize({width:1889}).flatten({background:'#fff'}).withMetadata({density:300}).png().toFile(p.replace(/\\.svg$/,'.png'));})().catch(e=>{console.error(e);process.exit(1)});'''
    subprocess.run([str(NODE),'-e',code,str(SHARP),json.dumps(paths)],check=True)
    for name,d in DIAGRAMS.items():print(name,len(d.nodes),len(d.edges),d.height)

if __name__=='__main__':main()
