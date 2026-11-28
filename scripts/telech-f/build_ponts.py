#!/usr/bin/env python3
"""🌉 Lot F — Les ponts suspendus du XIXe siècle (ponts Seguin et les autres) : assets/data/tf-ponts.json.gz.

Sources :
 - Wikidata (CC0 1.0) : les éléments « pont suspendu » (Q12570, et ses sous-classes) situés en France avec une position ; date de
   construction ou d'ouverture (P571, P1619), de destruction (P576), rivière franchie (P177), architecte ou ingénieur (P84, P287),
   ce qu'il remplace (P1365, quand c'est écrit), commune (P131 → P374), article de Wikipédia ;
 - Wikipédia en français, « Liste de ponts de France » (CC BY-SA 4.0) : les lignes « Suspendu » du tableau (nom, année, commune,
   position {{Coord}}, la remarque « conçu par Marc Seguin »).
Les deux listes sont réunies (même article de Wikipédia, ou moins de 300 m). L'app ne dit « remplace le bac » que si Wikidata le dit.
Lancer : python3 -I scripts/telech-f/build_ponts.py [dossier de sortie]
"""
import math, os, re, sys, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
LIST = 'Liste de ponts de France'
qid = lambda u: (u or '').rsplit('/', 1)[-1]


def year(t):
    m = re.match(r'^\+?(-?\d{1,4})-', t or '')
    return int(m.group(1)) if m else None


def km(a, b, c, d):
    r = math.pi / 180
    x = math.sin((c - a) * r / 2) ** 2 + math.cos(a * r) * math.cos(c * r) * math.sin((d - b) * r / 2) ** 2
    return 12742 * math.asin(min(1, math.sqrt(x)))


def coord(t):
    m = re.search(r'\{\{[Cc]oord\|([^}]*)\}\}', t)
    if not m:
        return None, None
    p = [x.strip() for x in m.group(1).split('|') if '=' not in x and not x.startswith('type')]
    try:
        i = next(i for i, x in enumerate(p) if x in ('N', 'S'))
        la = sum(float(v) / 60 ** k for k, v in enumerate(p[:i])) * (-1 if p[i] == 'S' else 1)
        j = next(j for j, x in enumerate(p) if x in ('E', 'W', 'O') and j > i)
        lo = sum(float(v) / 60 ** k for k, v in enumerate(p[i + 1:j])) * (-1 if p[j] in ('W', 'O') else 1)
        return round(la, 5), round(lo, 5)
    except (StopIteration, ValueError):
        try:
            return round(float(p[0]), 5), round(float(p[1]), 5)
        except (ValueError, IndexError):
            return None, None


def from_wikidata():
    q = '''SELECT ?x ?xl ?c ?s ?e ?riv ?rivl ?arc ?arcl ?rep ?repl ?ins ?coml ?fr WHERE {
      ?x wdt:P31/wdt:P279* wd:Q12570 ; wdt:P17 wd:Q142 ; wdt:P625 ?c .
      OPTIONAL { ?x wdt:P571|wdt:P1619 ?s } OPTIONAL { ?x wdt:P576 ?e }
      OPTIONAL { ?x wdt:P177 ?riv . ?riv rdfs:label ?rivl FILTER(LANG(?rivl)="fr") }
      OPTIONAL { ?x wdt:P84|wdt:P287 ?arc . ?arc rdfs:label ?arcl FILTER(LANG(?arcl)="fr") }
      OPTIONAL { ?x wdt:P1365 ?rep . ?rep rdfs:label ?repl FILTER(LANG(?repl)="fr") }
      OPTIONAL { ?x wdt:P131 ?com . ?com wdt:P374 ?ins ; rdfs:label ?coml FILTER(LANG(?coml)="fr") }
      OPTIONAL { ?fr schema:about ?x ; schema:isPartOf <https://fr.wikipedia.org/> }
      ?x rdfs:label ?xl FILTER(LANG(?xl)="fr") }'''
    rows = {}
    for b in wm.sparql(q):
        x = qid(b['x']['value'])
        m = re.match(r'Point\(([-\d.eE]+) ([-\d.eE]+)\)', b['c']['value'])
        if not m:
            continue
        r = rows.setdefault(x, {'q': x, 'n': b['xl']['value'], 'lat': round(float(m.group(2)), 5), 'lon': round(float(m.group(1)), 5), 'from': None, 'to': None,
                                'river': '', 'by': '', 'replaces': '', 'insee': '', 'commune': '', 'frwiki': '', 'seguin': False, 'via': 'wd'})
        s, e = year(b.get('s', {}).get('value')), year(b.get('e', {}).get('value'))
        if s is not None and (r['from'] is None or s < r['from']):
            r['from'] = s
        if e is not None and (r['to'] is None or e > r['to']):
            r['to'] = e
        for k, v in (('river', 'rivl'), ('by', 'arcl'), ('replaces', 'repl'), ('insee', 'ins'), ('commune', 'coml')):
            if b.get(v) and not r[k]:
                r[k] = b[v]['value']
        if b.get('fr') and not r['frwiki']:
            r['frwiki'] = urllib.parse.unquote(b['fr']['value'].rsplit('/wiki/', 1)[-1]).replace('_', ' ')
        if 'Seguin' in r['by']:
            r['seguin'] = True
    return rows


def from_list():
    w = wm.wp_raw(LIST)
    out = []
    for row in w.split('\n|-'):
        if 'Suspendu' not in row:
            continue
        c = [x.strip() for x in ' '.join(row.split('\n')).split('||')]
        name = next((x for x in c if re.match(r"^\[\[(?!Image|Fichier|File)", x)), '')
        ln = wm.links(name)
        yrs = [int(x) for x in c if re.fullmatch(r'1[6-9]\d\d', wm.plain(x))]
        la, lo = coord(row)
        if not ln or la is None:
            continue
        desc = ' '.join(wm.plain(x) for x in c if 'bgcolor' in x)
        com = next((wm.links(x)[0] for x in c if '{{Coord' in x or '{{coord' in x if wm.links(x)), '')
        nm = wm.plain(name).split('  ')[0].strip()
        dz = re.search(r'\s*détruit\s+en\s+(1\d{3}|20\d\d)', nm)
        out.append({'wp': ln[0], 'n': nm[:dz.start()].strip() if dz else nm, 'to': int(dz.group(1)) if dz else None, 'from': yrs[0] if yrs else None, 'lat': la, 'lon': lo, 'seguin': 'Seguin' in row, 'commune_wp': com, 'destroyed': 'détruit' in row.lower()})
    return out


def main():
    rows = from_wikidata()
    for L in from_list():
        hit = next((r for r in rows.values() if (r['frwiki'] and r['frwiki'] == L['wp']) or km(r['lat'], r['lon'], L['lat'], L['lon']) < 0.3), None)
        if hit:
            hit['seguin'] = hit['seguin'] or L['seguin']
            if hit['from'] is None:
                hit['from'] = L['from']
            continue
        rows['wp:' + L['wp']] = {'q': '', 'n': L['n'], 'lat': L['lat'], 'lon': L['lon'], 'from': L['from'], 'to': L['to'], 'river': '', 'by': 'Marc Seguin' if L['seguin'] else '', 'replaces': '',
                                 'insee': '', 'commune': L['commune_wp'], 'frwiki': L['wp'], 'seguin': L['seguin'], 'via': 'wp'}
    out = sorted(rows.values(), key=lambda r: (r['from'] is None, r['from'] or 0, r['n']))
    fields = ['q', 'n', 'lat', 'lon', 'from', 'to', 'river', 'by', 'replaces', 'insee', 'commune', 'frwiki', 'seguin', 'via']
    meta = {'source': 'Wikidata ; Wikipédia — « Liste de ponts de France »', 'licence': 'CC0 1.0 (Wikidata) ; CC BY-SA 4.0 (les contributeurs de Wikipédia)', 'licence_url': 'https://creativecommons.org/publicdomain/zero/1.0/deed.fr',
            'url': 'https://www.wikidata.org/wiki/Q12570', 'url2': wm.wp_url(LIST), 'built': wm.today(),
            'what': 'Les ponts suspendus de France (dont les ponts Seguin, à partir de 1823) : date de construction, rivière, ingénieur, ce qu’ils remplacent quand c’est écrit',
            'fields': fields, 'rows': [[r[k] for k in fields] for r in out]}
    size = wm.write_gz(OUT, 'tf-ponts.json.gz', meta)
    print(f'tf-ponts : {len(out)} ponts ({sum(1 for r in out if r["from"])} datés, {sum(1 for r in out if r["seguin"])} Seguin, {sum(1 for r in out if r["replaces"])} « remplace »), {size} octets')


if __name__ == '__main__':
    main()
