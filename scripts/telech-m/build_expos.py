#!/usr/bin/env python3
"""🎪 Lot M — les Expositions du monde → tx-expos.json.gz (PROLONGE l8c-expos : ses 22 lignes choisies à la main ne sont pas recopiées).

Sources (licences lues, voir docs/telechargements-lot-m.md) :
  - Wikidata (CC0) : les expositions universelles et internationales (instance d'une sous-classe de « exposition internationale »
    Q172754 : expositions universelles, spécialisées, horticoles, Floriades…), les expositions coloniales (Q3062234), et les
    expositions (Q464980) situées en France dont le nom commence par « Exposition » et qui ont eu lieu avant 1960 (Lyon 1894,
    Rouen 1896, Nancy 1909…). Dates P585/P580/P582, lieu P276 (ou P131), position P625, code INSEE P374, visiteurs P1110.
  - Wikipédia en français (CC BY-SA 4.0, les contributeurs de Wikipédia) :
      · « Exposition des produits de l'industrie française » : les 11 expositions de 1798 à 1849 (la ligne de la liste, recopiée) ;
      · pour chaque exposition coloniale, la phrase de son article qui parle des « villages » où des personnes des colonies étaient
        exhibées, recopiée telle quelle ; sinon rien d'inventé : l'app cite l'article « Zoo humain » et ses sources
        (Bancel, Blanchard, Lemaire, Le Monde diplomatique, août 2000 ; exposition « Exhibitions. L'invention du sauvage »,
        musée du quai Branly, 2011-2012).
  - Internet Archive (liens seulement) : des catalogues d'exposants de l'époque (recherche par l'API advancedsearch ; on garde
    l'identifiant, le titre, l'année et la licence affichée du volume ; aucune page n'est copiée).
Lancer : python3 -I scripts/telech-m/build_expos.py [dossier de sortie]
"""
import gzip, json, os, re, sys, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
HUMAN = re.compile(r"(?i)(zoos? humains?|villages? (indigènes?|nègres?|noirs?|sénégalais|africains?|annamites?|kanaks?|canaques?|malgaches?|soudanais|dahoméens?|ethnographiques?)|exhib(é|ée|és|ées|ition)s? (de|d['’]|des)|(indigènes|autochtones|figurants?) (y )?(étaient|furent|sont) (exposés|exhibés|présentés|installés|logés)|reconstitution d['’]un village)")
PRODUITS = 'Exposition des produits de l\'industrie française'


def title(u):
    return urllib.parse.unquote(u.rsplit('/wiki/', 1)[-1]).replace('_', ' ') if u else ''


def query(where):
    Q = '''SELECT ?x ?xl ?k ?d ?s ?e ?inc ?loc ?locl ?ll ?ins ?cty ?ctyl ?vis ?fr WHERE {
 %s
 OPTIONAL { ?x wdt:P585 ?d } OPTIONAL { ?x wdt:P580 ?s } OPTIONAL { ?x wdt:P582 ?e } OPTIONAL { ?x wdt:P571 ?inc }
 OPTIONAL { ?x wdt:P276|wdt:P131 ?loc . OPTIONAL { ?loc wdt:P625 ?ll } OPTIONAL { ?loc wdt:P374 ?ins } }
 OPTIONAL { ?x wdt:P17 ?cty } OPTIONAL { ?x wdt:P1110 ?vis }
 OPTIONAL { ?fr schema:about ?x ; schema:isPartOf <https://fr.wikipedia.org/> }
 SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". ?x rdfs:label ?xl . ?loc rdfs:label ?locl . ?cty rdfs:label ?ctyl }
}''' % where
    return wm.sparql(Q)


def main():
    old = json.load(gzip.open(os.path.join(ROOT, 'assets', 'data', 'l8c-expos.json.gz')))
    oldq = {r['q'] for r in old['rows'] if r.get('q')}
    by = {}
    parts = [('internationale', '?x wdt:P31/wdt:P279* wd:Q172754 .'), ('coloniale', '?x wdt:P31 wd:Q3062234 .'),
             ('nationale', '?x wdt:P31 wd:Q464980 ; wdt:P17 wd:Q142 ; rdfs:label ?lab . FILTER(lang(?lab) = "fr" && STRSTARTS(?lab, "Exposition"))')]
    for kind, where in parts:
        for b in query(where):
            g = lambda k: b.get(k, {}).get('value', '')
            q = wm.qid(g('x'))
            if re.match(r'^Q\d+$', g('xl')):
                continue
            e = by.setdefault(q, {'q': q, 'n': g('xl'), 'k': kind, 'y': None, 'y2': None, 'city': '', 'lat': None, 'lon': None, 'ins': '', 'country': '', 'vis': None, 'fr': ''})
            if kind == 'coloniale' or (kind == 'internationale' and e['k'] == 'nationale'):
                e['k'] = kind
            for t in (g('d'), g('s'), g('inc')):
                if t and e['y'] is None:
                    e['y'] = wm.year(t)
            if g('e') and e['y2'] is None:
                e['y2'] = wm.year(g('e'))
            if g('loc') and not re.match(r'^Q\d+$', g('locl')) and (e['lat'] is None or (g('ins') and not e['ins'])):
                la, lo = wm.point(g('ll'))
                if la is not None or not e['city']:
                    e['city'], e['lat'], e['lon'] = g('locl'), la, lo
                if g('ins'):
                    e['ins'] = g('ins')
            if g('ctyl') and not re.match(r'^Q\d+$', g('ctyl')):
                e['country'] = e['country'] or g('ctyl')
            if g('vis'):
                try:
                    e['vis'] = max(e['vis'] or 0, int(float(g('vis'))))
                except ValueError:
                    pass
            if g('fr'):
                e['fr'] = title(g('fr'))
            if e['y'] is None:
                m = re.search(r'\b(1[789]\d\d|20\d\d)\b', e['n'])
                e['y'] = int(m.group(1)) if m else None
    rows = [e for e in by.values() if e['y'] and e['y'] <= 2026 and not (e['k'] == 'nationale' and e['y'] > 1960)]
    # les expositions coloniales : la phrase de l'article qui parle des personnes exhibées
    for e in rows:
        e['zoo'] = ''
        if e['k'] != 'coloniale' or not e['fr']:
            continue
        try:
            txt = wm.plain(wm.wp_raw(e['fr']))
        except Exception:  # noqa
            continue
        for s in re.split(r'(?<=[.!?»])\s+(?=[«A-ZÉÀ])', txt.replace('\n', ' ')):
            if HUMAN.search(s) and 40 < len(s) < 600:
                e['zoo'] = s if len(s) <= 360 else s[:357].rsplit(' ', 1)[0] + ' …'
                break
    # les Expositions des produits de l'industrie française (1798-1849) : la liste de l'article de Wikipédia
    raw = wm.wp_raw(PRODUITS)
    sec = raw.split('== Expositions ==', 1)[1].split('\n==', 1)[0]
    prod = []
    for line in sec.split('\n'):
        m = re.match(r"^\*\s*(\{\{refnec\|)?\s*(1[78]\d\d)\s*:\s*(.*)$", line)
        if not m:
            continue
        y = int(m.group(2))
        t = wm.plain(re.sub(r'\{\{(refnec|quand|pourquoi|qui)\}\}', '', m.group(3)))
        t = re.sub(r'\s+', ' ', t).strip(' .}')
        mx = re.search(r'(\d[\d  ]*) exposants', t)
        place = next((p for p in ('Champ-de-Mars', 'Louvre', 'Invalides', 'place de la Concorde', 'Champs-Élysées') if p in t), '')
        prod.append({'q': '', 'n': f'Exposition des produits de l’industrie française de {y}', 'k': 'produits', 'y': y, 'y2': y, 'city': 'Paris' + (f' ({place})' if place else ''),
                     'lat': 48.8566, 'lon': 2.3522, 'ins': '75056', 'country': 'France', 'vis': None, 'fr': PRODUITS, 'zoo': '',
                     'line': f'{y} : {t}', 'exposants': int(re.sub(r'\D', '', mx.group(1))) if mx else None, 'refnec': 1 if m.group(1) else 0})
    assert len(prod) >= 10, f'{len(prod)} expositions des produits seulement'
    prodq = {e['y'] for e in prod}
    rows = [e for e in rows if not (re.search(r'(?i)produits de l.industrie', e['n']) and e['y'] in prodq)] + prod
    # les catalogues d'exposants (Internet Archive, liens seulement), pour les expositions de France jusqu'en 1937
    for e in rows:
        e['cat'] = []
        if e['country'] != 'France' and not e['ins']:
            continue
        if e['y'] > 1937:
            continue
        kw = 'catalogue AND (exposition OR exposants)'
        ys = f'[{e["y"]} TO {e["y"] + 1}]'
        city = re.sub(r'\s*\(.*\)', '', e['city'] or '')
        q = f'title:({kw}) AND year:{ys} AND mediatype:texts' + (f' AND title:("{city}")' if city and city != 'Paris' else '')
        url = 'https://archive.org/advancedsearch.php?' + urllib.parse.urlencode({'q': q, 'fl[]': ['identifier', 'title', 'year', 'licenseurl', 'rights'], 'rows': 6, 'output': 'json', 'sort[]': 'downloads desc'}, doseq=True)
        try:
            docs = json.loads(wm.get(url))['response']['docs']
        except Exception:  # noqa
            docs = []
        for d in docs[:4]:
            t = d.get('title') if isinstance(d.get('title'), str) else (d.get('title') or [''])[0]
            if not re.match(r'^[A-Za-z0-9._-]+$', d.get('identifier', '')):
                continue
            e['cat'].append([d['identifier'], t[:160], str(d.get('year', ''))[:4], d.get('licenseurl', '') if isinstance(d.get('licenseurl', ''), str) else ''])
    fields = ['q', 'n', 'k', 'y', 'y2', 'city', 'lat', 'lon', 'ins', 'country', 'vis', 'fr', 'zoo', 'line', 'exposants', 'refnec', 'cat', 'hand']
    out = []
    for e in sorted(rows, key=lambda e: (e['y'], e['n'])):
        e['hand'] = 1 if e['q'] in oldq else 0
        out.append([e.get(k) if e.get(k) is not None else ('' if k in ('line',) else None) for k in fields])
    meta = {'source': 'Wikidata ; Wikipédia (fr) ; Internet Archive (liens)', 'licence': 'CC0 (Wikidata) ; CC BY-SA 4.0 (phrases de Wikipédia, les contributeurs de Wikipédia)',
            'licence_url': 'https://www.wikidata.org/wiki/Wikidata:Copyright', 'url': 'https://www.wikidata.org/wiki/Q172754', 'built': wm.today(),
            'what': 'Expositions universelles, internationales, coloniales, nationales et régionales ; Expositions des produits de l’industrie française (1798-1849) ; catalogues d’exposants (liens)',
            'wp_licence_url': 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr', 'produits_url': wm.wp_url(PRODUITS),
            'zoo': {'url': 'https://fr.wikipedia.org/wiki/Zoo_humain',
                    'refs': [['Nicolas Bancel, Pascal Blanchard et Sandrine Lemaire, « Ces zoos humains de la République coloniale », Le Monde diplomatique, août 2000, p. 16-17', 'https://www.monde-diplomatique.fr/2000/08/BANCEL/1944'],
                             ['Pascal Blanchard et Nanette Jacomijn Snoep, « Exhibitions. L’invention du sauvage », musée du quai Branly, 29 novembre 2011 – 3 juin 2012', 'https://www.quaibranly.fr/fr/expositions-evenements/au-musee/expositions/details-de-levenement/e/exhibitions-36623/']]},
            'fields': fields, 'rows': out}
    size = wm.write_gz(OUT, 'tx-expos.json.gz', meta)
    from collections import Counter
    print(f'tx-expos : {len(out)} expositions ({Counter(e["k"] for e in rows)}), {sum(1 for e in rows if e["hand"])} déjà choisies à la main, '
          f'{sum(1 for e in rows if e["zoo"])} phrases « villages », {sum(1 for e in rows if e["cat"])} avec catalogues, {size} octets')


if __name__ == '__main__':
    main()
