"""🛡️ Rietstap, Armorial général (2e éd., Gouda, 1884-1887 ; domaine public) → assets/data/cc-rietstap*.json.gz

Source : les deux tomes numérisés par l'Internet Archive (University of Toronto), sur Wikimedia Commons, marqués « Public domain » :
  File:Armorial général - précédé d'un dictionnaire des Termes du blason (IA armorialgnra01rietuoft).pdf (1218 pages)
  File:Armorial général - précédé d'un dictionnaire des Termes du blason (IA armorialgnra02rietuoft).pdf (1336 pages)
Le texte est celui de la reconnaissance automatique (OCR) jointe au PDF : `pdftotext -raw vol01.pdf vol01.txt` (poppler).
Il contient des erreurs : on garde chaque article (nom — pays. blason), sa page, et une note de qualité ; l'app montre le texte
seulement s'il paraît propre, et renvoie toujours à l'image de la page (le scan) pour vérifier.

  python3 build_rietstap.py vol01.txt vol02.txt OUT_DIR
Sorties : OUT_DIR/cc-rietstap.json.gz (index : clé → lettre) et OUT_DIR/cc-rietstap-<lettre>.json.gz ({n: {clé: [[nom, pays, blason, tome, page_pdf, page_imprimée, propre]…]}}).
"""
import gzip, json, os, re, sys, unicodedata

FILES = {1: "File:Armorial général - précédé d'un dictionnaire des Termes du blason (IA armorialgnra01rietuoft).pdf",
         2: "File:Armorial général - précédé d'un dictionnaire des Termes du blason (IA armorialgnra02rietuoft).pdf"}

def fold(s):
    s = unicodedata.normalize('NFD', s.lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = s.replace('œ', 'oe').replace('æ', 'ae')
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()

# « Fabre de l'Aude (Comte de l'Empire) — Lang. De gu. … » : le nom, un tiret long (ou court entouré d'espaces), la suite
HEAD = re.compile(r"^((?:(?:von|van|de|du|des|d'|la|le|di|da|del|della|ten|ter|zu|vom|af|op)\s+)?[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ'’\-]{1,30}(?:[ \-][A-Za-zÀ-ÖØ-öø-ÿ'’\.\-]{1,30}){0,6}(?: \([^)]{1,80}\))?)\s+[—–-]\s+(\S.*)$")
BLAZON_START = re.compile(r"(?:^|[.)]\s+)((?:D'|De |Ec[.:]|Ecartelé|Écartelé|Parti|Coupé|Tranché|Taillé|Fascé|Bandé|Palé|Losangé|Echiqueté|Échiqueté|Burelé|Gironné|Contre|Tiercé|Chevronné|Barré|Vairé|Fuselé|Coticé|Emmanché|D’)\S*.*)$")
CREST = re.compile(r"\s(Cq\.|C\.:|C:|T\.:|S\.:|D\.:|L\.:|Cimier|Supp\.|Cri:)")
BAD = re.compile(r"[<>^{}|\\»«■▼•*~_$#@%]|\b\w*\d\w*[a-z]\w*\b")

def clean_score(t):
    if not t: return 0
    bad = len(BAD.findall(t)); words = re.findall(r"[A-Za-zÀ-ÿ']+", t)
    odd = sum(1 for w in words if len(w) > 3 and not re.search(r"[aeiouyéèêàâîôûAEIOUY]", w))
    return 1 if bad == 0 and odd <= max(1, len(words) // 15) else 0

def parse(path, vol):
    pages = open(path, encoding='utf-8', errors='replace').read().split('\f')
    out = []
    for pi, page in enumerate(pages, start=1):
        lines = [l.strip() for l in page.split('\n') if l.strip()]
        if not lines: continue
        printed = ''
        m = re.match(r'^\S+\s+(\d{1,4})\s+\S+$', lines[0])
        if m: printed = m.group(1); lines = lines[1:]
        cur = None
        for l in lines:
            h = HEAD.match(l)
            if h and len(h.group(1)) <= 90 and not h.group(1).endswith('.'):
                if cur: out.append(cur)
                cur = {'name': h.group(1).strip(), 'rest': h.group(2), 'vol': vol, 'pdf': pi, 'page': printed}
            elif cur:
                cur['rest'] += (' ' if not cur['rest'].endswith('-') else '') + l if not cur['rest'].endswith('-') else ''
                if cur['rest'].endswith('-') is False and l: pass
                if cur['rest'] and cur['rest'][-1:] == '-': cur['rest'] = cur['rest'][:-1] + l
            if cur and len(cur['rest']) > 1200: out.append(cur); cur = None
        if cur: out.append(cur)
    return out

def split(e):
    rest = re.sub(r'\s+', ' ', e['rest']).strip()
    m = BLAZON_START.search(rest)
    where, blazon = (rest[:m.start(1)].strip(' .'), m.group(1)) if m else ('', rest)
    c = CREST.search(blazon)
    if c: blazon = blazon[:c.start()].strip()
    blazon = blazon[:400].strip()
    if len(where) > 120: where = where[:120] + '…'
    return where, blazon

def main(a, b, outdir):
    entries = parse(a, 1) + parse(b, 2)
    idx = {}
    for e in entries:
        name = re.sub(r'\s*\(.*?\)\s*', ' ', e['name']).strip()
        first = re.split(r"[ ]", name)[0]
        keys = {fold(name)}
        if fold(first) and len(fold(first)) >= 3: keys.add(fold(first))
        where, blazon = split(e)
        ok = clean_score(name + ' ' + blazon)
        row = [e['name'], where, blazon, e['vol'], e['pdf'], e['page'], ok]
        for k in keys:
            if not k or len(k) < 3: continue
            idx.setdefault(k, []).append(row)
    by = {}
    for k, rows in idx.items():
        by.setdefault(k[0] if k[0].isalpha() else '0', {})[k] = rows[:30]
    os.makedirs(outdir, exist_ok=True)
    meta = {'v': 1, 'attr': 'J.-B. Rietstap, Armorial général, précédé d’un dictionnaire des termes du blason, 2e éd., Gouda, G. B. van Goor Zonen, 1884-1887',
            'licence': 'domaine public', 'scan': 'Internet Archive (University of Toronto) via Wikimedia Commons', 'files': FILES,
            'note': 'texte tiré de la reconnaissance automatique des scans (OCR) : des erreurs sont possibles, la page du scan fait foi',
            'letters': sorted(by), 'entries': len(entries), 'keys': len(idx)}
    with gzip.open(os.path.join(outdir, 'cc-rietstap.json.gz'), 'wt', encoding='utf-8', compresslevel=9) as f: json.dump(meta, f, ensure_ascii=False, separators=(',', ':'))
    for L, d in by.items():
        with gzip.open(os.path.join(outdir, f'cc-rietstap-{L}.json.gz'), 'wt', encoding='utf-8', compresslevel=9) as f: json.dump({'n': d}, f, ensure_ascii=False, separators=(',', ':'))
    print(len(entries), 'articles', len(idx), 'clés', sum(1 for e in idx.values() for r in e if r[6]), 'propres')

if __name__ == '__main__':
    main(*sys.argv[1:4])
