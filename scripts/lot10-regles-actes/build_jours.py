"""🌦️ Dictons et ✝️ saints du jour — fabrique assets/data/l10-jours.json.gz depuis les 366 pages « jour » de Wikipédia en français
(CC BY-SA 4.0, lues le 2026-11-25 par fetch_days.py) : parties « Dictons » et « Saints des Églises catholiques (et orthodoxes) ».
Chaque jour garde le numéro de version de la page (lien permanent possible)."""
import gzip, json, os, re, glob
RAW = '/tmp/claude-0/-home-user-lcnda/ad8201b5-1353-5614-bebe-2d8bd96b57cd/scratchpad/l10/raw/days'

def section(wt, title_re, level):
    m = re.search(r'^' + '=' * level + r'\s*' + title_re + r'.*?$', wt, re.M)
    if not m: return ''
    rest = wt[m.end():]
    end = re.search(r'^={2,%d}[^=]' % level, rest, re.M)
    return rest[:end.start()] if end else rest

def clean(s):
    s = re.sub(r'<ref[^>]*/>', '', s); s = re.sub(r'<ref[^>]*>.*?</ref>', '', s, flags=re.S); s = re.sub(r'<[^>]+>', '', s)
    for _ in range(3): s = re.sub(r'\{\{(?:date\+?|date-)\|([^{}|]*)[^{}]*\}\}', r'\1', s)
    s = re.sub(r'\{\{s-\|([IVXL]+)\}\}', r'\1e siècle', s); s = re.sub(r'\{\{([IVXL]+)e siècle\}\}', r'\1e siècle', s)
    s = re.sub(r'\{\{(1er|\d+e|Ier|\d+re)\}\}', r'\1', s)
    for _ in range(3): s = re.sub(r'\{\{[^{}]*\}\}', '', s)
    s = re.sub(r'\[\[(?:[^|\]]*\|)?([^\]]*)\]\]', r'\1', s); s = re.sub(r'\[https?://\S+ ([^\]]*)\]', r'\1', s)
    s = re.sub(r"'{2,}", '', s)
    return re.sub(r'\s+', ' ', s).strip()

days, saints = {}, []
for f in sorted(glob.glob(RAW + '/*.json')):
    md = os.path.basename(f)[:5]; d = json.load(open(f)); wt = d['wt']
    dic = []
    for line in section(wt, r'Dictons', 3).splitlines():
        if not line.startswith('* '): continue
        t = clean(line[2:])
        m = re.match(r'^«\s*(.+?)\s*»\s*(.*)$', t)
        if not m: continue
        txt, note = m.group(1), m.group(2).strip(' .')
        if len(txt) > 260: continue
        dic.append([txt, note[:120]])
    sts = []
    for sec in [r"Saints des Églises catholiques et orthodoxes", r"Saints et bienheureux des Églises catholiques", r"Saints des Églises catholiques\s*="]:
        body = section(wt, sec, 4) or section(wt, sec, 3)
        for line in body.splitlines():
            if not line.startswith('* '): continue
            raw = line[2:]
            m = re.match(r'^\s*(?:[^\[\(]{0,30}?)\[\[([^\]|]+)(?:\|([^\]]+))?\]\]', raw)
            name = clean(m.group(2) or m.group(1)) if m else clean(re.split(r'\s[\(—–-]\s?', raw)[0])
            desc = clean(raw)
            name = re.sub(r'\s*\(.*$', '', name).strip()
            if not name or len(name) > 60 or name.lower().startswith(('notre-dame', 'saint ', 'sainte ')) and ' de ' not in name.lower() and False: continue
            if any(name == x[0] for x in sts): continue
            sts.append([name, desc[:160]])
    days[md] = {'t': d['title'], 'rev': d['rev'], 'd': dic[:12], 's': sts[:40]}
data = {'v': 1, 'built': '2026-11-25', 'licence': 'CC BY-SA 4.0', 'src': 'Wikipédia en français, pages des jours (parties « Dictons » et « Saints »)', 'days': days}
dst = os.path.join(os.path.dirname(__file__), '../../assets/data/l10-jours.json.gz')
with gzip.open(dst, 'wt', encoding='utf-8') as f: json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
print(len(days), 'jours ;', sum(len(v['d']) for v in days.values()), 'dictons ;', sum(len(v['s']) for v in days.values()), 'saints ;', os.path.getsize(dst), 'octets')
