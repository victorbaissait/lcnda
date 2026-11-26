#!/usr/bin/env python3
"""LCNDA — lot N2 des téléchargements : ce que Wikidata (CC0) sait et que l'app n'avait pas.

    python3 -I scripts/telech-n2/build_wikidata.py OUT_DIR [ordres|patrons|generaux|quebec ...]

  ✝️ tn2-ordres            abbayes, prieurés et couvents → leur ordre religieux (P611), fondation (P571), suppression (P576)
                           PROLONGE ha-institutions (même identifiant Wikidata : l'ordre s'ajoute à la ligne, rien n'est recopié)
  ⛪ tn2-patrons           églises et chapelles → leur saint patron (P825 « dédié à », P417 « patron »), sa fête (P841)
  ⚔️ tn2-generaux          généraux, maréchaux et amiraux nés en France entre 1715 et 1800 (Révolution et Empire), commune de naissance
  🍁 tn2-quebec-paroisses  églises catholiques du Québec avec leur date d'ouverture (P571) ; PROLONGE l10t-quebec

Licence : Wikidata, CC0 1.0 (https://www.wikidata.org/wiki/Wikidata:Copyright, lu : « All structured data from the main,
Property, Lexeme, and EntitySchema namespaces is available under the Creative Commons CC0 License »).
Une requête à la fois, avec des pauses (wm.py). Rien sur les personnes vivantes : les généraux sont nés avant 1801.
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm  # noqa: E402

CC0 = {'source': 'Wikidata', 'licence': 'CC0 1.0', 'licence_url': 'https://www.wikidata.org/wiki/Wikidata:Copyright',
       'credit': 'Données : Wikidata (CC0 1.0), service de requêtes query.wikidata.org.'}
COUNTRIES = {'Q142': 'France', 'Q31': 'Belgique', 'Q39': 'Suisse', 'Q32': 'Luxembourg', 'Q38': 'Italie', 'Q29': 'Espagne', 'Q183': 'Allemagne', 'Q16': 'Canada'}


def v(b, k):
    return b[k]['value'] if k in b else ''


def q_of(u):
    return u.rsplit('/', 1)[-1] if u else ''


def year(s):
    m = re.match(r'^(-?\d{1,4})-', s or '')
    return int(m.group(1)) if m else None


def pt(s):
    m = re.match(r'Point\(([-\d.eE]+) ([-\d.eE]+)\)', s or '')
    return (round(float(m.group(2)), 5), round(float(m.group(1)), 5)) if m else (None, None)


def label_ok(s, q):
    return s and not re.fullmatch(r'Q\d+', s) and s != q


def ordres(out):
    rows = {}
    for cq, cn in COUNTRIES.items():
        if cq == 'Q16':
            continue
        B = wm.sparql(f'''SELECT ?it ?itLabel ?o ?oLabel ?inc ?dis ?c ?ins ?comLabel ?fr WHERE {{
  ?it wdt:P611 ?o ; wdt:P17 wd:{cq} .
  OPTIONAL {{ ?it wdt:P571 ?inc }} OPTIONAL {{ ?it wdt:P576 ?dis }} OPTIONAL {{ ?it wdt:P625 ?c }}
  OPTIONAL {{ ?it wdt:P131 ?com . OPTIONAL {{ ?com wdt:P374 ?ins }} }}
  OPTIONAL {{ ?fr schema:about ?it ; schema:isPartOf <https://fr.wikipedia.org/> ; schema:name ?frn }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "fr,en,it,de,es,nl". }} }}''')
        for b in B:
            q, oq = q_of(v(b, 'it')), q_of(v(b, 'o'))
            n, on = v(b, 'itLabel'), v(b, 'oLabel')
            if not label_ok(n, q) or not label_ok(on, oq):
                continue
            lat, lon = pt(v(b, 'c'))
            r = rows.setdefault(q, {'q': q, 'n': n, 'o': [], 'from': None, 'to': None, 'lat': lat, 'lon': lon, 'ins': '', 'commune': '', 'country': cn, 'fr': ''})
            if [oq, on] not in r['o']:
                r['o'].append([oq, on])
            for k, key in (('inc', 'from'), ('dis', 'to')):
                y = year(v(b, k))
                if y is not None and (r[key] is None or y < r[key]):
                    r[key] = y
            if v(b, 'ins') and not r['ins']:
                r['ins'] = v(b, 'ins')
            if v(b, 'comLabel') and not r['commune'] and label_ok(v(b, 'comLabel'), ''):
                r['commune'] = v(b, 'comLabel')
            if v(b, 'fr'):
                r['fr'] = v(b, 'fr')
    rs = sorted(rows.values(), key=lambda r: (r['country'] != 'France', r['n']))
    fields = ['q', 'n', 'o', 'from', 'to', 'lat', 'lon', 'ins', 'commune', 'country', 'fr']
    meta = {**CC0, 'built': wm.today(), 'url': 'https://www.wikidata.org/wiki/Property:P611',
            'what': 'Abbayes, prieurés, couvents et monastères avec leur ordre religieux (Wikidata P611), fondation (P571) et suppression (P576) — France, Belgique, Suisse, Luxembourg, Italie, Espagne, Allemagne',
            'note': 'Prolonge ha-institutions : même identifiant Wikidata, l’ordre s’ajoute à la ligne. Une abbaye a pu changer d’ordre : Wikidata en donne parfois plusieurs.',
            'fields': fields, 'rows': [[r[k] for k in fields] for r in rs]}
    print('tn2-ordres', len(rs), wm.write_gz(out, 'tn2-ordres.json.gz', meta))


def patrons(out):
    rows = {}
    for prop in ('P825', 'P417'):
        B = wm.sparql(f'''SELECT ?it ?itLabel ?s ?sLabel ?feastLabel ?inc ?c ?ins ?comLabel WHERE {{
  ?it wdt:{prop} ?s ; wdt:P17 wd:Q142 .
  OPTIONAL {{ ?s wdt:P841 ?feast }} OPTIONAL {{ ?it wdt:P571 ?inc }} OPTIONAL {{ ?it wdt:P625 ?c }}
  OPTIONAL {{ ?it wdt:P131 ?com . ?com wdt:P374 ?ins }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "fr,en". }} }}''')
        for b in B:
            q, sq = q_of(v(b, 'it')), q_of(v(b, 's'))
            n, sn = v(b, 'itLabel'), v(b, 'sLabel')
            if not label_ok(n, q) or not label_ok(sn, sq):
                continue
            lat, lon = pt(v(b, 'c'))
            r = rows.setdefault(q, {'q': q, 'n': n, 's': [], 'feast': '', 'from': year(v(b, 'inc')), 'lat': lat, 'lon': lon, 'ins': v(b, 'ins'), 'commune': v(b, 'comLabel')})
            if [sq, sn] not in r['s']:
                r['s'].append([sq, sn])
            f = v(b, 'feastLabel')
            if f and not r['feast'] and not re.fullmatch(r'Q\d+', f):
                r['feast'] = f
            if not r['ins'] and v(b, 'ins'):
                r['ins'], r['commune'] = v(b, 'ins'), v(b, 'comLabel')
    rs = sorted((r for r in rows.values() if r['ins'] or r['lat'] is not None), key=lambda r: (r['ins'], r['n']))
    fields = ['q', 'n', 's', 'feast', 'from', 'lat', 'lon', 'ins', 'commune']
    meta = {**CC0, 'built': wm.today(), 'url': 'https://www.wikidata.org/wiki/Property:P825',
            'what': 'Églises et chapelles de France avec leur saint patron (Wikidata P825 « dédié à », P417 « saint patron ») et le jour de sa fête (P841)',
            'note': 'C’est l’église d’aujourd’hui : la paroisse d’avant 1790 portait le plus souvent le même vocable, mais pas toujours (église reconstruite, paroisses réunies). La fête patronale du village se tenait le jour du saint, ou le dimanche le plus proche.',
            'fields': fields, 'rows': [[r[k] for k in fields] for r in rs]}
    print('tn2-patrons', len(rs), wm.write_gz(out, 'tn2-patrons.json.gz', meta))


RANKS = 'wd:Q152956 wd:Q2487961 wd:Q83460 wd:Q12786490 wd:Q18398926 wd:Q2579265 wd:Q152951 wd:Q22955346 wd:Q474485 wd:Q22806998 wd:Q132851 wd:Q22957305 wd:Q19289194 wd:Q437767 wd:Q7821620 wd:Q13360884 wd:Q1110629 wd:Q93710715'


def generaux(out):
    rows = {}
    for a, z in ((1715, 1755), (1756, 1770), (1771, 1785), (1786, 1800)):
        B = wm.sparql(f'''SELECT ?p ?pLabel ?b ?d ?r ?rLabel ?ins ?bpLabel ?c ?dpLabel ?fr WHERE {{
  VALUES ?r {{ {RANKS} }}
  ?p wdt:P410 ?r ; wdt:P569 ?b ; wdt:P19 ?bp . ?bp wdt:P374 ?ins .
  FILTER(YEAR(?b) >= {a} && YEAR(?b) <= {z})
  OPTIONAL {{ ?p wdt:P570 ?d }} OPTIONAL {{ ?bp wdt:P625 ?c }} OPTIONAL {{ ?p wdt:P20 ?dp }}
  OPTIONAL {{ ?fr schema:about ?p ; schema:isPartOf <https://fr.wikipedia.org/> }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "fr,en". }} }}''')
        for b in B:
            q = q_of(v(b, 'p'))
            n = v(b, 'pLabel')
            if not label_ok(n, q):
                continue
            by, dy = year(v(b, 'b')), year(v(b, 'd'))
            if by is None or by > 1800:
                continue
            lat, lon = pt(v(b, 'c'))
            r = rows.setdefault(q, {'q': q, 'n': n, 'b': by, 'd': dy, 'r': [], 'ins': v(b, 'ins'), 'commune': v(b, 'bpLabel'), 'lat': lat, 'lon': lon, 'dp': v(b, 'dpLabel'), 'fr': v(b, 'fr')})
            rl = v(b, 'rLabel')
            if rl and rl not in r['r'] and not re.fullmatch(r'Q\d+', rl):
                r['r'].append(rl)
            if dy is not None and (r['d'] is None or dy < r['d']):
                r['d'] = dy
    rs = sorted(rows.values(), key=lambda r: (r['ins'], r['b'] or 0))
    fields = ['q', 'n', 'b', 'd', 'r', 'ins', 'commune', 'lat', 'lon', 'dp', 'fr']
    meta = {**CC0, 'built': wm.today(), 'url': 'https://www.wikidata.org/wiki/Q152956',
            'what': 'Généraux, maréchaux et amiraux nés dans une commune de France entre 1715 et 1800 (Révolution et Empire), avec leur grade (Wikidata P410)',
            'note': 'Le Dictionnaire des généraux et amiraux de G. Six (1934) n’est pas recopié (droits non vérifiés) : les données viennent de Wikidata seulement.',
            'six_url': 'https://gallica.bnf.fr/services/engine/search/sru?operation=searchRetrieve&query=(gallica%20all%20%22Dictionnaire%20biographique%20des%20g%C3%A9n%C3%A9raux%22)',
            'fields': fields, 'rows': [[r[k] for k in fields] for r in rs]}
    print('tn2-generaux', len(rs), wm.write_gz(out, 'tn2-generaux.json.gz', meta))


def quebec(out):
    rows = {}
    B = wm.sparql('''SELECT ?it ?itLabel ?inc ?c ?sLabel ?admLabel ?fr WHERE {
  ?it wdt:P31 wd:Q16970 ; wdt:P17 wd:Q16 ; wdt:P625 ?c .
  OPTIONAL { ?it wdt:P571 ?inc } OPTIONAL { ?it wdt:P825 ?s } OPTIONAL { ?it wdt:P131 ?adm }
  OPTIONAL { ?fr schema:about ?it ; schema:isPartOf <https://fr.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". } }''')
    for b in B:
        q, n = q_of(v(b, 'it')), v(b, 'itLabel')
        lat, lon = pt(v(b, 'c'))
        # le Québec : à l'est de -79,8 et au nord de 45 ; on écarte l'Ontario (à l'ouest de l'Outaouais), le Nouveau-Brunswick, Terre-Neuve
        if not label_ok(n, q) or lat is None or not (44.99 <= lat <= 62.6 and -79.8 <= lon <= -57.1):
            continue
        if lon > -66.5 and lat < 48.0:   # Nouveau-Brunswick, Nouvelle-Écosse
            continue
        if lon < -74.4 and lat < 45.6:   # Ontario (Cornwall, Ottawa)
            continue
        r = rows.setdefault(q, {'q': q, 'n': n, 'y': year(v(b, 'inc')), 's': v(b, 'sLabel'), 'lat': lat, 'lon': lon, 'where': v(b, 'admLabel'), 'fr': v(b, 'fr')})
        y = year(v(b, 'inc'))
        if y is not None and (r['y'] is None or y < r['y']):
            r['y'] = y
    rs = sorted(rows.values(), key=lambda r: (r['y'] or 9999, r['n']))
    fields = ['q', 'n', 'y', 's', 'lat', 'lon', 'where', 'fr']
    meta = {**CC0, 'built': wm.today(), 'url': 'https://www.wikidata.org/wiki/Q16970',
            'what': 'Églises catholiques et paroisses du Québec avec leur date d’ouverture quand Wikidata la connaît (P571), leur saint patron (P825)',
            'note': 'Avant 1900, l’acte se trouve dans la paroisse ouverte la plus proche à la date de l’événement : une paroisse plus récente n’a pas d’acte plus ancien que sa fondation. Prolonge l10t-quebec (patrimoine).',
            'fields': fields, 'rows': [[r[k] for k in fields] for r in rs]}
    print('tn2-quebec-paroisses', len(rs), wm.write_gz(out, 'tn2-quebec-paroisses.json.gz', meta))


JOBS = {'ordres': ordres, 'patrons': patrons, 'generaux': generaux, 'quebec': quebec}

if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    for k in (sys.argv[2:] or list(JOBS)):
        JOBS[k](sys.argv[1])
