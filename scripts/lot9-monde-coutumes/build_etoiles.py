"""✨ Les étoiles nouvelles : les novae et supernovae visibles À L'ŒIL NU depuis la France → assets/data/l9b-etoiles.json.gz.
Sources : Wikipédia en anglais, « List of novae in the Milky Way galaxy » (année, nom, éclat maximal — CC BY-SA 4.0) ; pour chaque
étoile, son élément Wikidata (CC0) : déclinaison (P6258), constellation (P59), date de découverte (P575) et l'article Wikipédia en
français quand il existe ; les supernovae de Tycho Brahe (SN 1572) et de Kepler (SN 1604) : Wikidata.
Gardées : éclat 4,5 ou plus brillant (visible à l'œil nu) et déclinaison au-dessus de −30° (assez haute dans le ciel de France).
Usage : python3 build_etoiles.py"""
import os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
import common

LIST = 'List of novae in the Milky Way galaxy'
w, rev, ti = common.wp_wikitext(LIST, 'en')
rows = []
for block in w.split('\n|-')[1:]:
    cells = [c.strip() for c in re.split(r'\n\||\|\|', '\n' + block.strip()) if c.strip()]
    if len(cells) < 3 or not re.match(r'^\d{4}$', cells[0]):
        continue
    m = re.search(r'\[\[([^\]|]+)(?:\|([^\]]+))?\]\]', cells[1])
    mag = re.search(r'([+\-−–]?\d+(?:\.\d+)?)', cells[2].replace('−', '-').replace('–', '-'))
    if not m or not mag:
        continue
    rows.append({'y': int(cells[0]), 'page': m.group(1).strip(), 'label': (m.group(2) or m.group(1)).strip(), 'mag': float(mag.group(1))})
bright = [r for r in rows if r['mag'] <= 4.5]
print('novae de la liste', len(rows), 'à l’œil nu', len(bright))
pages = [r['page'] for r in bright] + ['SN 1572', 'SN 1604']
qids = {}
for i in range(0, len(pages), 40):
    j = common.get_json('https://en.wikipedia.org/w/api.php', {'action': 'query', 'titles': '|'.join(pages[i:i + 40]), 'prop': 'pageprops', 'ppprop': 'wikibase_item', 'redirects': 1, 'format': 'json', 'formatversion': 2})
    back = {}
    for x in j['query'].get('normalized', []) + j['query'].get('redirects', []):
        back[x['to']] = back.get(x['from'], x['from'])
    for p in j['query']['pages']:
        q = p.get('pageprops', {}).get('wikibase_item')
        if q:
            qids[back.get(p['title'], p['title'])] = q
            qids[p['title']] = q
ents = {}
ids = sorted(set(qids.values()))
for i in range(0, len(ids), 40):
    j = common.get_json('https://www.wikidata.org/w/api.php', {'action': 'wbgetentities', 'ids': '|'.join(ids[i:i + 40]), 'props': 'claims|labels|sitelinks', 'languages': 'fr|en', 'format': 'json'})
    ents.update(j['entities'])

def claim(e, p):
    for c in e.get('claims', {}).get(p, []):
        v = c.get('mainsnak', {}).get('datavalue', {}).get('value')
        if v is not None:
            return v
    return None
cons = set()
for e in ents.values():
    c = claim(e, 'P59')
    if c:
        cons.add(c['id'])
clab = {}
if cons:
    j = common.get_json('https://www.wikidata.org/w/api.php', {'action': 'wbgetentities', 'ids': '|'.join(sorted(cons)), 'props': 'labels', 'languages': 'fr|en', 'format': 'json'})
    for k, e in j['entities'].items():
        clab[k] = (e.get('labels', {}).get('fr') or e.get('labels', {}).get('en') or {}).get('value', '')
out, skipped = [], []
def item(page, y, mag, label, kind):
    q = qids.get(page)
    e = ents.get(q or '', {})
    dec = claim(e, 'P6258')
    dec = float(dec['amount']) if isinstance(dec, dict) and 'amount' in dec else None
    if dec is None or dec < -30:
        skipped.append((label, y, dec)); return
    d = claim(e, 'P575') or claim(e, 'P585')
    date = ''
    if isinstance(d, dict) and d.get('time'):
        mm = re.match(r'^\+(\d{4})-(\d\d)-(\d\d)', d['time'])
        if mm and int(mm.group(1)) == y:
            date = f'{mm.group(1)}-{mm.group(2)}' + (f'-{mm.group(3)}' if d.get('precision', 0) >= 11 else '') if d.get('precision', 0) >= 10 else ''
    sl = e.get('sitelinks', {})
    fr = sl.get('frwiki', {}).get('title')
    con = claim(e, 'P59')
    out.append({'n': fr or label, 'y': y, 'd': date, 'mag': mag, 'dec': round(dec, 1), 'con': clab.get(con['id'], '') if con else '', 'kind': kind, 'q': q,
                'wp': common.wp_url(fr) if fr else common.wp_url(page, 'en'), 'src': common.wp_url(ti, 'en')})
for r in bright:
    item(r['page'], r['y'], r['mag'], r['label'], 'nova')
for page, y in (('SN 1572', 1572), ('SN 1604', 1604)):
    e = ents.get(qids.get(page, ''), {})
    m = claim(e, 'P1215')
    mag = float(m['amount']) if isinstance(m, dict) else None
    if mag is None:
        skipped.append((page, y, 'éclat inconnu')); continue
    item(page, y, mag, page, 'supernova')
    if out and out[-1]['y'] == y:
        out[-1]['src'] = f'https://www.wikidata.org/wiki/{out[-1]["q"]}'
out.sort(key=lambda r: (r['y'], r['n']))
print('gardées', len(out), 'écartées (trop au sud, ou sans déclinaison sur Wikidata)', skipped)
common.write_gz('l9b-etoiles.json.gz', {'v': 1, 'src': {'label': 'Wikipédia, « List of novae in the Milky Way galaxy » (année, éclat) ; Wikidata (déclinaison, constellation, date)', 'licence': 'CC BY-SA 4.0 ; CC0 1.0', 'url': common.wp_url(ti, 'en')}, 'rows': out})
