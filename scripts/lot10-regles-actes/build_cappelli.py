"""✂️ Cappelli, Lexicon abbreviaturarum (Leipzig, J. J. Weber, 1901) — domaine public (Commons : PD-old-70-expired, CC-PD-Mark).
Lit la couche texte du PDF de Wikimedia Commons (API imageinfo, metadata « text » : la lecture OCR faite par Internet Archive),
garde les paires « (abréviation transcrite par Cappelli) développement » et la page.  Sortie : assets/data/l10-cappelli.json.gz"""
import json, re, gzip, os, sys, urllib.parse as u
from fetch import get
FILE = 'Adriano Cappelli (1859-1942) - Lexicon Abbreviaturarum, J.J. Weber Leipzig, 1901.pdf'
r = json.loads(get('https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=metadata&iimetadataversion=latest&titles=' + u.quote('File:' + FILE) + '&format=json', pause=3))
md = list(r['query']['pages'].values())[0]['imageinfo'][0]['metadata']
pages = {x['name']: x['value'] for x in [m for m in md if m['name'] == 'text'][0]['value']}
RX = re.compile(r"\(([^()\s]{1,16})\)\s*([^\n()]{2,70})")
CENT = re.compile(r"\s+(?:[xvi]{1,5}m*\.?\s*(?:[fmp]\.)?)$", re.I)
rows, heads = [], {}
for p, t in pages.items():
    p = int(p)
    if p < 50 or p > 520: continue
    m = re.match(r"\s*([A-Z0-9]{1,8})\s*[-–]\s*([A-Z0-9]{1,8})", t)
    if m: heads[p] = [m.group(1), m.group(2)]
    for a, b in RX.findall(t):
        b = b.strip().rstrip(',;')
        b = re.sub(r"\s*\{[^}]*\}?", '', b)                     # les formes italiennes entre accolades
        b = CENT.sub('', b).strip()
        b = re.sub(r"\s+(?:x{0,2}v?i{0,3}[mfp]?\.?)$", '', b).strip()
        if re.match(r"^[xvi]{1,5}[mfp]{0,2}\.?(\s.*)?$", b, re.I): continue      # un siècle (« xv m. »), pas un mot
        b = re.sub(r"[¬-]$", '…', b)
        if not re.match(r"^-?[A-Za-zÆŒæœ]", b) or not re.search(r"[a-z]{2}", b): continue
        if len(re.findall(r"[^A-Za-zÆŒæœ ,.'’-]", b)) > 2: continue
        rows.append([a, b[:60], p + 1])                          # p + 1 : numéro de page du PDF sur Commons (1 = première)
seen, out = set(), []
for a, b, p in rows:
    k = (a.lower(), b.lower())
    if k in seen: continue
    seen.add(k); out.append([a, b, p])
data = {'v': 1, 'file': FILE, 'page_url': 'https://commons.wikimedia.org/w/index.php?title=File:' + u.quote(FILE.replace(' ', '_')) + '&page={p}',
        'thumb': 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/' + u.quote(FILE.replace(' ', '_')) + '/page{p}-1024px-' + u.quote(FILE.replace(' ', '_')) + '.jpg',
        'licence': 'domaine public (Wikimedia Commons : PD-old-70-expired, marque du domaine public)', 'read': '2026-11-25',
        'note': 'Texte lu par la reconnaissance de caractères d’Internet Archive (numérisation de l’Université de Toronto, 2019) : des erreurs sont possibles, la page scannée fait foi.',
        'rows': out}
dst = os.path.join(os.path.dirname(__file__), '../../assets/data/l10-cappelli.json.gz')
with gzip.open(dst, 'wt', encoding='utf-8') as f: json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
print(len(out), os.path.getsize(dst))
