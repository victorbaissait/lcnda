#!/usr/bin/env python3
"""👥 Lot G — « Ils y étaient » : des listes de noms d'autrefois, d'après Wikidata (CC0 1.0).

  tg-filles     👰 les Filles du Roy (1663-1673) : P106 ou P463 = Q747471 ; + le tableau « Provinces et lieux d'origine » de
                l'article « Filles du Roy » de Wikipédia (CC BY-SA 4.0 : nombres cités, avec le lien)
  tg-carignan   ⚔️ les soldats et officiers du régiment de Carignan-Salières (1665) : P7779, P463 ou P241 = Q3455247 ; + le
                tableau des navires arrivés à Québec en 1665 (Wikipédia, « Régiment de Carignan-Salières », CC BY-SA 4.0)
  tg-deputes    🏛 les députés aux États généraux de 1789 (P39 = Q59309522), à l'Assemblée constituante (P39 = Q28218485, mandat
                P2937 = Q876424) et à la Convention nationale (P39 = Q20808382)
  tg-compagnons ✠ les Compagnons de la Libération (P166 = Q2990283) — personnes seulement, et seulement avec une date de mort
                (Wikidata P570) : aucune personne vivante n'est copiée

Pour chacun : nom, nom de famille (P734), prénom (P735), sexe, années de naissance et de mort, lieu de naissance (P19 : nom, code
INSEE P374, position P625), article de Wikipédia. Ce sont des personnes mortes depuis longtemps, connues par Wikidata ; rien sur
les personnes de la généalogie n'est envoyé (la comparaison avec l'arbre se fait dans l'app, sur l'ordinateur).
Lancer : python3 -I scripts/telech-g/build_noms.py [dossier de sortie] [filles,carignan,deputes,compagnons]
"""
import os, re, sys, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
ONLY = set((sys.argv[2] if len(sys.argv) > 2 else 'filles,carignan,deputes,compagnons').split(','))
qid = lambda u: (u or '').rsplit('/', 1)[-1]
CC0 = {'licence': 'CC0 1.0', 'licence_url': 'https://creativecommons.org/publicdomain/zero/1.0/deed.fr'}
FIELDS = ['q', 'n', 'fam', 'giv', 'g', 'b', 'd', 'bp', 'insee', 'lat', 'lon', 'frwiki', 'role', 'extra']


def year(v):
    m = re.match(r'^(-?\d{1,4})-', v or '')
    return int(m.group(1)) if m else None


def people(where, role_of=None):
    """les personnes (Q5) qui répondent à « where » (?x … ; ?st pour un qualificatif éventuel) → {q: ligne}"""
    q = f'''SELECT ?x ?xl ?role ?extra WHERE {{ {where} ?x wdt:P31 wd:Q5 .
      OPTIONAL {{ ?x rdfs:label ?xl FILTER(LANG(?xl)="fr") }} }}'''
    rows = {}
    for b in wm.sparql(q):
        x = qid(b['x']['value'])
        r = rows.setdefault(x, {'q': x, 'n': b.get('xl', {}).get('value', ''), 'fam': '', 'giv': '', 'g': '', 'b': None, 'd': None, 'bp': '', 'insee': '', 'lat': None, 'lon': None,
                                'frwiki': '', 'role': [], 'extra': ''})
        if b.get('role') and b['role']['value'] not in r['role']:
            r['role'].append(b['role']['value'])
        if b.get('extra') and not r['extra']:
            r['extra'] = b['extra']['value']
    return rows


def details(rows):
    ids = list(rows)
    for i in range(0, len(ids), 150):
        vals = ' '.join('wd:' + x for x in ids[i:i + 150])
        q = f'''SELECT ?x ?b ?d ?g ?fr ?en WHERE {{ VALUES ?x {{ {vals} }}
          OPTIONAL {{ ?x wdt:P569 ?b }} OPTIONAL {{ ?x wdt:P570 ?d }} OPTIONAL {{ ?x wdt:P21 ?g }}
          OPTIONAL {{ ?x rdfs:label ?en FILTER(LANG(?en)="mul" || LANG(?en)="en") }}
          OPTIONAL {{ ?fr schema:about ?x ; schema:isPartOf <https://fr.wikipedia.org/> }} }}'''
        for b in wm.sparql(q):
            r = rows[qid(b['x']['value'])]
            if b.get('b') and r['b'] is None:
                r['b'] = year(b['b']['value'])
            if b.get('d') and r['d'] is None:
                r['d'] = year(b['d']['value'])
            if b.get('g') and not r['g']:
                r['g'] = {'Q6581072': 'f', 'Q6581097': 'm'}.get(qid(b['g']['value']), '')
            if b.get('fr') and not r['frwiki']:
                r['frwiki'] = urllib.parse.unquote(b['fr']['value'].rsplit('/wiki/', 1)[-1]).replace('_', ' ')
            if not r['n'] and b.get('en'):
                r['n'] = b['en']['value']
        q2 = f'''SELECT ?x ?fam ?giv WHERE {{ VALUES ?x {{ {vals} }}
          OPTIONAL {{ ?x wdt:P734 ?f . ?f rdfs:label ?fam FILTER(LANG(?fam)="fr" || LANG(?fam)="mul") }}
          OPTIONAL {{ ?x p:P735 ?gs . ?gs ps:P735 ?gv . ?gv rdfs:label ?giv FILTER(LANG(?giv)="fr" || LANG(?giv)="mul") OPTIONAL {{ ?gs pq:P1545 ?ord }} FILTER(!BOUND(?ord) || ?ord = "1") }} }}'''
        for b in wm.sparql(q2):
            r = rows[qid(b['x']['value'])]
            if b.get('fam') and not r['fam']:
                r['fam'] = b['fam']['value']
            if b.get('giv') and not r['giv']:
                r['giv'] = b['giv']['value']
        q3 = f'''SELECT ?x ?pl ?c ?ins WHERE {{ VALUES ?x {{ {vals} }} ?x wdt:P19 ?p .
          OPTIONAL {{ ?p rdfs:label ?pl FILTER(LANG(?pl)="fr") }} OPTIONAL {{ ?p wdt:P625 ?c }} OPTIONAL {{ ?p wdt:P374 ?ins }} }}'''
        for b in wm.sparql(q3):
            r = rows[qid(b['x']['value'])]
            m = re.match(r'Point\(([-\d.eE]+) ([-\d.eE]+)\)', b.get('c', {}).get('value', ''))
            if r['bp'] and r['lat'] is not None:
                continue
            r['bp'] = b.get('pl', {}).get('value', '') or r['bp']
            r['insee'] = b.get('ins', {}).get('value', '') or r['insee']
            if m:
                r['lat'], r['lon'] = round(float(m.group(2)), 5), round(float(m.group(1)), 5)
    return rows


def finish(rows, name, meta, keep=lambda r: True):
    out = []
    for r in rows.values():
        if not r['n'] or re.match(r'^Q\d+$', r['n']):
            continue
        # jamais une personne qui pourrait être en vie : née depuis 1900 et sans date de mort → pas copiée
        if r['d'] is None and (r['b'] is None or r['b'] >= 1900):
            continue
        if not keep(r):
            continue
        r = dict(r, role=','.join(sorted(r['role'])))
        out.append(r)
    out.sort(key=lambda r: (wm_fold(r['fam'] or r['n'].split(' ')[-1]), wm_fold(r['n'])))
    meta = {**meta, **CC0, 'built': wm.today(), 'fields': FIELDS, 'rows': [[r[k] for k in FIELDS] for r in out]}
    size = wm.write_gz(OUT, name, meta)
    print(f'{name} : {len(out)} personnes ({sum(1 for r in out if r["lat"] is not None)} avec un lieu de naissance placé), {size} octets')
    return out


def wm_fold(s):
    import unicodedata
    return ''.join(c for c in unicodedata.normalize('NFD', s or '') if unicodedata.category(c) != 'Mn').lower()


def wiki_table(title, start_pat):
    """le premier tableau (wikitexte) après start_pat, en lignes de cellules (texte lisible)"""
    w = wm.wp_raw(title)
    i = w.find(start_pat)
    if i < 0:
        raise SystemExit(f'{title} : « {start_pat} » introuvable — l’article a changé, rien n’est écrit')
    j = w.rfind('{|', 0, i)  # le motif est peut-être la légende ou l'en-tête du tableau
    if j < 0 or w.find('|}', j, i) >= 0:
        j = w.find('{|', i)
    k = w.find('|}', j)
    rows, cur = [], []
    for line in w[j:k].split('\n')[1:]:
        line = line.strip()
        if line.startswith('|-'):
            if cur:
                rows.append(cur)
            cur = []
        elif line.startswith('|+') or line.startswith('!'):
            continue
        elif line.startswith('|'):
            for cell in re.split(r'\|\|', line[1:]):
                cell = re.sub(r'^\s*(colspan|rowspan|style|align)=[^|]*\|', '', cell)
                cur.append(wm.plain(cell).strip())
    if cur:
        rows.append(cur)
    return rows


def main():
    if 'filles' in ONLY:
        rows = details(people('{ ?x wdt:P106 wd:Q747471 } UNION { ?x wdt:P463 wd:Q747471 }'))
        prov = []
        for r in wiki_table('Filles du Roy', "Provinces et lieux d'origine"):
            if len(r) >= 2 and re.match(r'^\d+$', r[-1].replace("'", '')) and 'Total' not in r[0]:
                prov.append([r[0], int(r[-1])])
        if len(prov) < 5:
            raise SystemExit('Filles du Roy : le tableau des provinces a changé — rien n’est écrit')
        finish(rows, 'tg-filles.json.gz', {'source': 'Wikidata (fille du Roi, Q747471) ; Wikipédia, « Filles du Roy »', 'url': 'https://www.wikidata.org/wiki/Q747471',
                                           'url2': wm.wp_url('Filles du Roy'), 'provinces': prov, 'provinces_src': 'Silvio Dumas, 1972, p. 126, cité par Wikipédia (CC BY-SA 4.0)',
                                           'what': 'Les Filles du Roy connues de Wikidata (liste très incomplète : environ 770 sont parties), avec leur lieu de naissance ; '
                                                   'et les provinces d’origine de toutes (Wikipédia)'})
    if 'carignan' in ONLY:
        rows = details(people('{ ?x wdt:P7779 wd:Q3455247 } UNION { ?x wdt:P463 wd:Q3455247 } UNION { ?x wdt:P241 wd:Q3455247 }'))
        ships = []
        for r in wiki_table('Régiment de Carignan-Salières', 'Navire'):
            r = [c for c in r if c]
            if len(r) >= 3 and re.search(r'1665', r[1]):
                ships.append([r[0], r[1], r[2]])
        if len(ships) < 4:
            raise SystemExit('Carignan-Salières : le tableau des navires a changé — rien n’est écrit')
        finish(rows, 'tg-carignan.json.gz', {'source': 'Wikidata (régiment de Carignan-Salières, Q3455247) ; Wikipédia, « Régiment de Carignan-Salières »',
                                             'url': 'https://www.wikidata.org/wiki/Q3455247', 'url2': wm.wp_url('Régiment de Carignan-Salières'), 'ships': ships,
                                             'what': 'Les soldats et officiers du régiment de Carignan-Salières connus de Wikidata (liste très incomplète : environ '
                                                     '1 200 hommes partis en 1665) ; et les navires arrivés à Québec en 1665 avec leurs compagnies (Wikipédia)'})
    if 'deputes' in ONLY:
        rows = people('''{ ?x wdt:P39 wd:Q59309522 . BIND("eg" AS ?role) }
          UNION { ?x p:P39 ?st . ?st ps:P39 wd:Q28218485 ; pq:P2937 wd:Q876424 . BIND("const" AS ?role) OPTIONAL { ?st pq:P768 ?dist . ?dist rdfs:label ?extra FILTER(LANG(?extra)="fr") } }
          UNION { ?x wdt:P39 wd:Q20808382 . BIND("conv" AS ?role) }''')
        details(rows)
        finish(rows, 'tg-deputes.json.gz', {'source': 'Wikidata (député aux États généraux de 1789 Q59309522 ; député de l’Assemblée constituante Q28218485, mandat Q876424 ; '
                                                      'député de la Convention nationale Q20808382)', 'url': 'https://www.wikidata.org/wiki/Q59309522',
                                            'what': 'Les députés aux États généraux et à l’Assemblée constituante (1789-1791) et les conventionnels (1792-1795) connus de '
                                                    'Wikidata, avec leur lieu de naissance'},
               keep=lambda r: r['b'] is None or r['b'] < 1780)
    if 'compagnons' in ONLY:
        rows = details(people('?x wdt:P166 wd:Q2990283 .'))
        finish(rows, 'tg-compagnons.json.gz', {'source': 'Wikidata (compagnon de la Libération, Q2990283)', 'url': 'https://www.wikidata.org/wiki/Q2990283',
                                               'what': 'Les Compagnons de la Libération connus de Wikidata (personnes seulement, toutes décédées), avec leur lieu de naissance'},
               keep=lambda r: r['d'] is not None)


if __name__ == '__main__':
    main()
