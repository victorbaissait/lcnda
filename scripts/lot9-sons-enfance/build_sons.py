#!/usr/bin/env python3
"""🔊 Les sons de son époque — enregistrements anciens en français sur Internet Archive (78 tours, cylindres),
SEULEMENT ceux dont la notice porte une licence ouverte : Public Domain Mark, CC0 ou CC BY (relue notice par notice).
Sortie : assets/data/l9a-sons.json.gz  {source, licence, built, rows:[[id, titre, année, interprète, fichier, durée s, licence]]}
Le son n'est pas livré : l'app le lit depuis archive.org (lien et crédit sur chaque ligne).
Usage : python3 scripts/lot9-sons-enfance/build_sons.py [--per-year 8]
"""
import collections, re, sys, urllib.parse
from concurrent.futures import ThreadPoolExecutor
from common import jget, write, today

PER_YEAR = int(sys.argv[sys.argv.index('--per-year') + 1]) if '--per-year' in sys.argv else 8
OPEN = re.compile(r'creativecommons\.org/(publicdomain/(mark|zero)/1\.0|licenses/by/[34]\.0)/?', re.I)
LIC_NAME = lambda u: 'Domaine public' if 'mark' in u else 'CC0' if 'zero' in u else 'CC BY ' + re.search(r'by/([\d.]+)', u).group(1)
UPLOADER = re.compile(r'^(l[ée]o472|[a-z0-9_.-]+\d{2,})$', re.I)

q = ('mediatype:audio AND language:(fre OR french OR fr) AND date:[1890-01-01 TO 1962-12-31] '
     'AND collection:(78rpm OR emilios78heritage OR emilios78popular OR emiliosunforgottenmusic OR cylinders)')
url = 'https://archive.org/advancedsearch.php?' + urllib.parse.urlencode(
    [('q', q)] + [('fl[]', f) for f in ('identifier', 'title', 'date', 'licenseurl', 'creator', 'subject', 'downloads')] + [('rows', '10000'), ('output', 'json')])
docs = jget(url)['response']['docs']
docs = [d for d in docs if OPEN.search(d.get('licenseurl') or '')]
print(len(docs), 'notices sous licence ouverte')

def year(d):
    m = re.match(r'(\d{4})', str(d.get('date') or ''))
    return int(m.group(1)) if m else None

def who(d):
    c = d.get('creator'); c = c if isinstance(c, list) else [c] if c else []
    c = [x for x in c if x and not UPLOADER.match(x.strip())]
    if c: return '; '.join(c[:2])
    s = d.get('subject'); s = s if isinstance(s, list) else [s] if s else []
    return s[0] if s else ''

by = collections.defaultdict(list)
for d in docs:
    y = year(d)
    if y and 1890 <= y <= 1962: by[y].append(d)
pick = []
for y, lst in sorted(by.items()):
    lst.sort(key=lambda d: -int(d.get('downloads') or 0))
    seen = collections.Counter(); out = []
    for d in lst:
        w = who(d).lower()[:25]
        if seen[w] >= 2: continue  # de la variété : deux par interprète au plus
        seen[w] += 1; out.append(d)
        if len(out) >= PER_YEAR * 2: break
    pick += [(y, d) for d in out]

def meta(yd):
    y, d = yd
    try: m = jget('https://archive.org/metadata/' + urllib.parse.quote(d['identifier']))
    except Exception as e: print('!', d['identifier'], e); return None
    md = m.get('metadata') or {}
    lic = md.get('licenseurl') or ''
    if not OPEN.search(lic): return None  # relue sur la notice même
    mp3 = [f for f in m.get('files', []) if str(f.get('name', '')).lower().endswith('.mp3')]
    if not mp3: return None
    mp3.sort(key=lambda f: (f.get('source') != 'original', len(f['name'])))
    f = mp3[0]
    try: dur = int(float(f.get('length') or 0))
    except ValueError:
        p = str(f.get('length') or '').split(':'); dur = int(p[0]) * 60 + int(float(p[1])) if len(p) == 2 else 0
    t = md.get('title') or d.get('title') or ''
    t = t if isinstance(t, str) else t[0]
    return [d['identifier'], re.sub(r'\s+', ' ', t).strip()[:160], y, who(d)[:120], f['name'], dur, LIC_NAME(lic)]

with ThreadPoolExecutor(4) as ex:
    rows = [r for r in ex.map(meta, pick) if r]
cnt = collections.Counter(); final = []
for r in rows:
    if cnt[r[2]] >= PER_YEAR: continue
    cnt[r[2]] += 1; final.append(r)
print(len(final), 'enregistrements gardés,', len(cnt), 'années')
write('l9a-sons', {'source': 'Internet Archive — collections « 78rpm » et voisines (78 tours et cylindres)', 'url': 'https://archive.org/details/78rpm',
                   'licence': 'Licence lue sur chaque notice : Public Domain Mark 1.0, CC0 1.0 ou CC BY (les autres sont écartées)', 'built': today(),
                   'note': 'Le son reste sur archive.org : l’app le lit en ligne. L’année est celle écrite sur la notice (souvent l’année de l’enregistrement ou du disque).',
                   'fields': ['id', 't', 'y', 'who', 'file', 'dur', 'lic'], 'rows': final})
