#!/usr/bin/env python3
"""🏆 Lot M — les compétitions sportives, une ligne par édition → ts-competitions.json.gz (+ ts-etapes.json.gz : vainqueurs d'étape du Tour).

Sources (licences lues, voir docs/telechargements-lot-m.md) :
  - Wikidata (CC0) : les éditions de chaque compétition (P3450 « saison de la compétition » ou P31), leurs dates (P585, P580, P582),
    leur lieu (P276, sa position P625 et son code INSEE P374), leur pays (P17), leurs vainqueurs (P1346) avec le qualificatif
    P2501 « résultat » (« vainqueur du classement général » Q20882667) ; « non attribué » (Q66666778) = titre retiré.
    Les vainqueurs d'étape du Tour de France : P1346 des étapes (les étapes elles-mêmes sont déjà dans l8c-tour, pas recopiées).
  - Wikipédia en anglais (CC BY-SA 4.0, « les contributeurs de Wikipédia ») : les listes de vainqueurs que Wikidata n'a pas
    (simple messieurs et dames des quatre tournois du Grand Chelem, 24 Heures du Mans, championnats du monde sur route, Prix de
    l'Arc de Triomphe avant 1971, Route du Rhum, marathons de Paris et de New York) : seulement l'année et le nom, avec le lien de la liste.
  - martj42/international_results (CC0) : le vainqueur de la finale de la Coupe du monde et de l'Euro quand Wikidata ne le dit pas.
Lancer : python3 -I scripts/telech-m/build_competitions.py [dossier de sortie]      (TM_RAW = dossier du cache des réponses)
"""
import csv, io, os, re, sys, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
GC = 'Q20882667'          # vainqueur du classement général
WITHDRAWN = 'Q66666778'   # non attribué (titre retiré)
EN = 'en.wikipedia.org'
# id, Wikidata, icône, nom, sport, lieu par défaut (nom, lat, lon, insee) ou None, listes de Wikipédia (titre, [(colonne, rôle)]), fr = en France
COMPS = [
    ('tdf', 'Q33881', '🚲', 'Tour de France', 'cyclisme', None, [], 1),
    ('giro', 'Q33861', '🚴', 'Tour d’Italie', 'cyclisme', ('Italie', None, None, ''), [], 0),
    ('vuelta', 'Q33937', '🚴', 'Tour d’Espagne', 'cyclisme', ('Espagne', None, None, ''), [], 0),
    ('roubaix', 'Q33992', '🚴', 'Paris-Roubaix', 'cyclisme', ('Roubaix', 50.69, 3.18, '59512'), [], 1),
    ('msr', 'Q33951', '🚴', 'Milan-San Remo', 'cyclisme', ('Sanremo', 43.8175, 7.7758, ''), [], 0),
    ('mondiaux', 'Q506424', '🌈', 'Championnats du monde de cyclisme sur route', 'cyclisme', None, [('UCI Road World Championships – Men\'s road race', 'mondiaux')], 0),
    ('jo', 'Q159821', '🏅', 'Jeux olympiques d’été', 'olympisme', None, [], 0),
    ('joh', 'Q82414', '⛷', 'Jeux olympiques d’hiver', 'olympisme', None, [], 0),
    ('wc', 'Q19317', '⚽', 'Coupe du monde de football', 'football', None, [], 0),
    ('euro', 'Q260858', '⚽', 'Championnat d’Europe de football', 'football', None, [], 0),
    ('l1', 'Q13394', '⚽', 'Championnat de France de football', 'football', ('France', None, None, ''), [], 1),
    ('cdf', 'Q212412', '⚽', 'Coupe de France de football', 'football', ('France', None, None, ''), [], 1),
    ('ucl', 'Q18756', '⚽', 'Coupe des clubs champions / Ligue des champions', 'football', None, [], 0),
    ('6n', 'Q16642', '🏉', 'Tournoi des Cinq / Six Nations', 'rugby', None, [], 0),
    ('top14', 'Q5798', '🏉', 'Championnat de France de rugby', 'rugby', ('France', None, None, ''), [], 1),
    ('rg', 'Q43605', '🎾', 'Roland-Garros', 'tennis', ('Paris', 48.8469, 2.2492, '75056'),
     [('List of French Open men\'s singles champions', 'simple messieurs'), ('List of French Open women\'s singles champions', 'simple dames')], 1),
    ('wimbledon', 'Q41520', '🎾', 'Wimbledon', 'tennis', ('Londres', 51.4343, -0.2141, ''),
     [('List of Wimbledon gentlemen\'s singles champions', 'simple messieurs'), ('List of Wimbledon ladies\' singles champions', 'simple dames')], 0),
    ('usopen', 'Q123577', '🎾', 'US Open de tennis', 'tennis', ('New York', 40.7498, -73.8462, ''),
     [('List of US Open men\'s singles champions', 'simple messieurs'), ('List of US Open women\'s singles champions', 'simple dames')], 0),
    ('ao', 'Q60874', '🎾', 'Open d’Australie', 'tennis', ('Melbourne', -37.8215, 144.9784, ''),
     [('List of Australian Open men\'s singles champions', 'simple messieurs'), ('List of Australian Open women\'s singles champions', 'simple dames')], 0),
    ('lemans', 'Q187579', '🏁', '24 Heures du Mans', 'automobile', ('Le Mans', 47.9561, 0.2078, '72181'), [('List of 24 Hours of Le Mans winners', 'lemans')], 1),
    ('monte', 'Q725531', '🚗', 'Rallye Monte-Carlo', 'automobile', ('Monaco', 43.7384, 7.4246, ''), [], 0),
    ('dakar', 'Q181336', '🏜', 'Rallye Dakar', 'automobile', None, [], 0),
    ('vendee', 'Q1137923', '⛵', 'Vendée Globe', 'voile', ('Les Sables-d’Olonne', 46.4969, -1.7833, '85194'), [], 1),
    ('rhum', 'Q833088', '⛵', 'Route du Rhum', 'voile', ('Saint-Malo', 48.6493, -2.0257, '35288'), [('Route du Rhum', 'rhum')], 1),
    ('arc', 'Q422296', '🐎', 'Prix de l’Arc de Triomphe', 'hippisme', ('Paris (Longchamp)', 48.8569, 2.2340, '75056'), [('Prix de l\'Arc de Triomphe', 'arc')], 1),
    ('marathon_paris', 'Q1071285', '🏃', 'Marathon de Paris', 'course à pied', ('Paris', 48.8566, 2.3522, '75056'), [('Paris Marathon', 'marathon')], 1),
    ('marathon_ny', 'Q752138', '🏃', 'Marathon de New York', 'course à pied', ('New York', 40.7128, -74.006, ''), [('List of winners of the New York City Marathon', 'marathon')], 0),
    ('marathon_boston', 'Q826087', '🏃', 'Marathon de Boston', 'course à pied', ('Boston', 42.3497, -71.0782, ''), [('List of winners of the Boston Marathon', 'marathon')], 0),
]
NOCOORD = {'tdf', 'giro', 'vuelta', '6n', 'top14', 'l1', 'cdf', 'ucl', 'dakar'}
LINK_ONLY = [
    ('boxe', '🥊', 'Championnats du monde de boxe', 'BoxRec (base privée, conditions d’utilisation restrictives)', 'https://boxrec.com/'),
    ('f1', '🏎', 'Grands Prix de Formule 1', 'jolpica-f1 / Ergast (CC BY-NC-SA 4.0 : pas d’usage commercial)', 'https://github.com/jolpica/jolpica-f1/blob/main/TERMS.md'),
    ('tennis_matchs', '🎾', 'Tous les matchs de tennis (ATP/WTA)', 'Jeff Sackmann (CC BY-NC-SA 4.0 : pas d’usage commercial)', 'https://github.com/JeffSackmann/tennis_atp'),
]


def wd_editions(q):
    Q = '''SELECT ?ed ?edl ?d ?dp ?s ?sp ?e ?loc ?locl ?ll ?ins ?cty ?ctyl ?frwiki ?w ?wl ?qv ?rk WHERE {
 ?ed wdt:P3450|wdt:P31 wd:%s .
 OPTIONAL { ?ed p:P585/psv:P585 [ wikibase:timeValue ?d ; wikibase:timePrecision ?dp ] }
 OPTIONAL { ?ed p:P580/psv:P580 [ wikibase:timeValue ?s ; wikibase:timePrecision ?sp ] } OPTIONAL { ?ed wdt:P582 ?e }
 OPTIONAL { ?ed wdt:P276 ?loc . OPTIONAL { ?loc wdt:P625 ?ll } OPTIONAL { ?loc wdt:P374 ?ins } }
 OPTIONAL { ?ed wdt:P17 ?cty }
 OPTIONAL { ?ed p:P1346 ?st . ?st ps:P1346 ?w . OPTIONAL { ?st pq:P2501 ?qv } OPTIONAL { ?st pq:P1352 ?rk } }
 OPTIONAL { ?frwiki schema:about ?ed ; schema:isPartOf <https://fr.wikipedia.org/> }
 SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". ?ed rdfs:label ?edl . ?w rdfs:label ?wl . ?loc rdfs:label ?locl . ?cty rdfs:label ?ctyl }
}''' % q
    eds = {}
    for b in wm.sparql(Q):
        g = lambda k: b.get(k, {}).get('value', '')
        k = wm.qid(g('ed'))
        e = eds.setdefault(k, {'q': k, 'n': g('edl'), 'd1': '', 'd2': '', 'y': None, 'locs': {}, 'cty': {}, 'fr': '', 'ws': {}})
        for t, p in ((g('d'), g('dp')), (g('s'), g('sp'))):
            if t and not e['d1']:
                e['y'] = wm.year(t)
                e['d1'] = t[:10].lstrip('+') if p and int(p) >= 11 else ''
        if g('e') and not e['d2']:
            e['d2'] = g('e')[:10].lstrip('+')
        if g('loc') and not re.match(r'^Q\d+$', g('locl')):
            la, lo = wm.point(g('ll'))
            e['locs'].setdefault(wm.qid(g('loc')), (g('locl'), la, lo, g('ins')))
        if g('cty') and not re.match(r'^Q\d+$', g('ctyl')):
            e['cty'][wm.qid(g('cty'))] = g('ctyl')
        if g('frwiki'):
            e['fr'] = urllib.parse.unquote(g('frwiki').rsplit('/wiki/', 1)[-1]).replace('_', ' ')
        if g('w'):
            wq, qv, rk = wm.qid(g('w')), wm.qid(g('qv')), g('rk')
            cur = e['ws'].setdefault(wq, {'n': g('wl'), 'gc': False, 'other': False, 'rk': ''})
            if qv == GC or rk == '1':
                cur['gc'] = True
            elif qv or (rk and rk != '1'):
                cur['other'] = True
        if e['y'] is None:
            m = re.search(r'\b(1[89]\d\d|20\d\d)\b', e['n'])
            e['y'] = int(m.group(1)) if m else None
    return eds


def winners_of(e):
    """le ou les vainqueurs d'une édition : le vainqueur du classement général s'il est dit, sinon les vainqueurs sans qualificatif"""
    gc = [(q, w) for q, w in e['ws'].items() if w['gc']]
    plain = [(q, w) for q, w in e['ws'].items() if not w['gc'] and not w['other']]
    pick = gc or plain
    out, retired = [], False
    for q, w in pick:
        if q == WITHDRAWN:
            retired = True
            continue
        if re.match(r'^Q\d+$', w['n']):
            continue
        out.append([w['n'], q, ''])
    return out, retired


YEAR = re.compile(r'\b(18[5-9]\d|19\d\d|20[0-3]\d)\b')


def wp_winners(title, role):
    """une liste de vainqueurs de Wikipédia (en) → {année: [[nom, titre de l'article, rôle], …]}"""
    w = wm.wp_raw(title, EN)
    out = {}
    tabs = wm.wp_tables(w)
    if role == 'mondiaux':
        for r in tabs[0]:
            m = YEAR.search(r[0])
            if m and len(r) > 1:
                n, t = wm.name_in(r[1])
                if n:
                    out.setdefault(int(m.group(1)), []).append([n, t, 'course en ligne messieurs'])
        return out
    if role == 'lemans':
        tab = next(t for t in tabs if t and t[0] and t[0][0] == 'Year' and any('Drivers' in c for c in t[0]))
        cur = None
        for r in tab[1:]:
            m = re.match(r'\{\{24hLM\|(\d{4})\}\}', r[0])
            if m:
                cur = int(m.group(1))
                cells = r[1:2]
            elif cur and r and 'flagathlete' in r[0]:
                cells = r[:1]
            else:
                continue
            for c in cells:
                n, t = wm.name_in(c)
                if n and 'flagathlete' in c:
                    out.setdefault(cur, []).append([n, t, 'pilote'])
        return out
    for tab in tabs:
        if not tab or len(tab[0]) < 2:
            continue
        head = [wm.plain(c).lower() for c in tab[0]]
        if not head[0].startswith('year'):
            continue
        cols = []
        for i, h in enumerate(head):
            if role in ('simple messieurs', 'simple dames') and h == 'champion':
                cols.append((i, role))
            elif role == 'arc' and h == 'winner':
                cols.append((i, 'cheval'))
            elif role == 'rhum' and h in ('winning sailor',):
                cols.append((i, 'vainqueur'))
            elif role == 'marathon' and h.startswith("men's winner"):
                cols.append((i, 'hommes'))
            elif role == 'marathon' and h.startswith("women's winner"):
                cols.append((i, 'femmes'))
            elif role == 'marathon' and h in ('athlete', 'winner') and not cols:
                cols.append((i, ''))
        if not cols:
            continue
        for r in tab[1:]:
            if len(r) < max(c for c, _ in cols) + 1:
                continue
            m = YEAR.search(r[0])
            if not m:
                continue
            y = int(m.group(1))
            for i, lab in cols:
                c = r[i]
                if re.search(r'(?i)no (competition|race|tournament|women)|not held|cancel|annulé|tournament not', c):
                    continue
                n, t = wm.name_in(c)
                if n and len(n) > 2 and not re.match(r'^[\d:–\-.\s]+$', n):
                    note = 'non reconnu' if '††' in c else ''
                    out.setdefault(y, []).append([n, t, lab + (f' ({note})' if note else '')])
        if role == 'rhum':
            break
    return out


def finals_from_results():
    """martj42/international_results (CC0) : le vainqueur du dernier match de chaque Coupe du monde et Euro (tirs au but compris)"""
    base = 'https://raw.githubusercontent.com/martj42/international_results/master/'
    res = list(csv.DictReader(io.StringIO(wm.get(base + 'results.csv', 'text/csv').decode('utf-8'))))
    sho = {(r['date'], r['home_team'], r['away_team']): r['winner'] for r in csv.DictReader(io.StringIO(wm.get(base + 'shootouts.csv', 'text/csv').decode('utf-8')))}
    out = {}
    for name, key in (('FIFA World Cup', 'wc'), ('UEFA Euro', 'euro')):
        last = {}
        for r in res:
            if r['tournament'] == name and r['home_score'] not in ('', 'NA'):
                y = int(r['date'][:4])
                if y not in last or r['date'] >= last[y]['date']:
                    last[y] = r
        for y, r in last.items():
            hs, as_ = int(r['home_score']), int(r['away_score'])
            w = r['home_team'] if hs > as_ else r['away_team'] if as_ > hs else sho.get((r['date'], r['home_team'], r['away_team']), '')
            if w:
                out[(key, y)] = (w, r['date'], f"{r['home_team']} {hs}–{as_} {r['away_team']}", r['city'])
    return out


def main():
    rows, comps = [], []
    finals = finals_from_results()
    enq = {}
    for cid, q, icon, label, sport, place, lists, fr in COMPS:
        eds = wd_editions(q)
        wpw = {}
        for title, role in lists:
            try:
                for y, ws in wp_winners(title, role).items():
                    wpw.setdefault(y, []).extend(ws)
            except Exception as ex:  # noqa
                print(f'  ! {title} : {ex}', file=sys.stderr)
        n0 = len(rows)
        seen_years = set()
        for e in sorted(eds.values(), key=lambda e: (e['y'] or 0, e['d1'])):
            y = e['y']
            # les Jeux annulés (1916, 1940, 1944) ont un élément Wikidata : pas une édition
            if not y or y > 2026 or (cid in ('jo', 'joh') and y in (1916, 1940, 1944)):
                continue
            ws, retired = winners_of(e)
            src = 'wd'
            if cid in ('rg', 'wimbledon', 'usopen', 'ao', 'lemans') and wpw.get(y):
                ws, src = [[n, 'wp:' + t, role] for n, t, role in wpw[y]], 'wp'
                for n, t, role in wpw[y]:
                    enq[t] = None
            elif not ws and not retired and wpw.get(y):
                ws, src = [[n, 'wp:' + t, role] for n, t, role in wpw[y]], 'wp'
                for n, t, role in wpw[y]:
                    enq[t] = None
            extra = ''
            if not ws and (cid, y) in finals:
                w, d, score, city = finals[(cid, y)]
                ws, src, extra = [[w, '', 'finale']], 'res', f'{score} ({city}, {d})'
            elif (cid, y) in finals:
                extra = f'{finals[(cid, y)][2]} ({finals[(cid, y)][3]}, {finals[(cid, y)][1]})'
            if e['locs']:
                lq, (pl, la, lo, ins) = next(iter(sorted(e['locs'].items(), key=lambda kv: kv[1][1] is None)))
            elif place:
                pl, la, lo, ins = place
            else:
                pl, la, lo, ins = (', '.join(sorted(e['cty'].values())), None, None, '')
            # un pays ou une région n'est pas un lieu : pas de position (sinon « près de chez lui » au centre du pays)
            if cid in NOCOORD or pl in e['cty'].values() or re.search(r'(?i)^(France|France métropolitaine|Angleterre|Écosse|Irlande|Pays de Galles|Italie|Espagne|Europe|Afrique|Amérique du Sud|Arabie saoudite|Argentine|Chili|Pérou|Bolivie)$', pl or ''):
                la = lo = None
            rows.append({'c': cid, 'y': y, 'd1': e['d1'], 'd2': e['d2'], 'n': e['n'], 'place': pl, 'lat': la, 'lon': lo, 'ins': ins or '',
                         'w': ws, 'ret': 1 if retired else 0, 'src': src, 'x': extra, 'q': e['q'], 'fr': e['fr']})
            seen_years.add(y)
        # les années de la liste de Wikipédia qui n'ont pas d'élément Wikidata (Arc avant 1971, Mans, marathons…)
        for y, ws in sorted(wpw.items()):
            if y in seen_years or y > 2026:
                continue
            pl, la, lo, ins = place or ('', None, None, '')
            rows.append({'c': cid, 'y': y, 'd1': '', 'd2': '', 'n': f'{label} {y}', 'place': pl, 'lat': la, 'lon': lo, 'ins': ins or '',
                         'w': [[n, 'wp:' + t, role] for n, t, role in ws], 'ret': 0, 'src': 'wp', 'x': '', 'q': '', 'fr': ''})
            for n, t, role in ws:
                enq[t] = None
        # une ligne par année : sans les éliminatoires, et la mieux renseignée quand Wikidata a deux éléments pour la même année
        mine = [r for r in rows[n0:] if not re.search(r'(?i)qualif|éliminatoire|preliminar|tour préliminaire|qualifying', r['n'])]
        best = {}
        for r in mine:
            k = r['y']
            score = (bool(r['w']) or bool(r['ret'])) * 4 + bool(r['fr']) * 2 + bool(r['q'])
            if k not in best or score > best[k][0]:
                best[k] = (score, r)
        del rows[n0:]
        rows.extend(sorted((v[1] for v in best.values()), key=lambda r: r['y']))
        got = rows[n0:]
        ys = [r['y'] for r in got]
        print(f'{cid:15} {len(got):4} éditions {min(ys) if ys else "-"}–{max(ys) if ys else "-"} ; avec vainqueur {sum(1 for r in got if r["w"] or r["ret"])}', file=sys.stderr)
        comps.append({'id': cid, 'q': q, 'icon': icon, 'label': label, 'sport': sport, 'fr': fr,
                      'lists': [wm.wp_url(t, EN) for t, _ in lists], 'n': len(got), 'from': min(ys) if ys else None, 'to': max(ys) if ys else None})
    # les vainqueurs pris dans Wikipédia : leur élément Wikidata (pour relier les homonymes), par le titre de l'article
    titles = [t for t in enq if t]
    wq = wm.wd_of_titles(titles, EN) if titles else {}
    fields = ['c', 'y', 'd1', 'd2', 'n', 'place', 'lat', 'lon', 'ins', 'w', 'ret', 'src', 'x', 'q', 'fr']
    for r in rows:
        for w in r['w']:
            if str(w[1]).startswith('wp:'):
                w[1] = (wq.get(w[1][3:]) or {}).get('q', '')
    meta = {'source': 'Wikidata ; Wikipédia (en) pour les vainqueurs manquants ; martj42/international_results (finales)',
            'licence': 'CC0 (Wikidata, résultats) ; CC BY-SA 4.0 (listes de Wikipédia, les contributeurs de Wikipédia)',
            'licence_url': 'https://www.wikidata.org/wiki/Wikidata:Copyright', 'url': 'https://www.wikidata.org/wiki/Q13406554', 'built': wm.today(),
            'what': 'Les éditions des grandes compétitions sportives : dates, lieu, vainqueur (Wikidata P1346 ; « non attribué » = titre retiré)',
            'comps': comps, 'link_only': [{'id': a, 'icon': b, 'label': c, 'why': d, 'url': e} for a, b, c, d, e in LINK_ONLY],
            'wp_licence_url': 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr', 'res_url': 'https://github.com/martj42/international_results',
            'fields': fields, 'rows': [[r[k] for k in fields] for r in rows]}
    size = wm.write_gz(OUT, 'ts-competitions.json.gz', meta)
    print(f'ts-competitions : {len(rows)} éditions, {len(comps)} compétitions, {size} octets')
    build_stages()


def build_stages():
    """les vainqueurs d'étape du Tour de France (P1346 des étapes) : clé = l'étape (même Q que dans l8c-tour)"""
    Q = '''SELECT ?s ?w ?wl ?qv WHERE { ?ed wdt:P31 wd:Q33881 ; wdt:P527 ?s . ?s p:P1346 ?st . ?st ps:P1346 ?w . OPTIONAL { ?st pq:P2501 ?qv }
 SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". ?w rdfs:label ?wl } }'''
    by = {}
    for b in wm.sparql(Q):
        s, w, wl, qv = wm.qid(b['s']['value']), wm.qid(b['w']['value']), b['wl']['value'], wm.qid(b.get('qv', {}).get('value', ''))
        if re.match(r'^Q\d+$', wl) and w != WITHDRAWN:
            continue
        cur = by.setdefault(s, ['', '', ''])
        name = 'titre retiré' if w == WITHDRAWN else wl
        if qv == 'Q20882747' or (not qv and not cur[0]):      # vainqueur d'étape
            cur[0], cur[1] = name, '' if w == WITHDRAWN else w
        elif qv == 'Q20882763':                                # maillot jaune à l'issue de l'étape
            cur[2] = name
    by = {k: v for k, v in by.items() if v[0] or v[2]}
    rows = sorted([[s, *v] for s, v in by.items()])
    meta = {'source': 'Wikidata', 'licence': 'CC0 1.0', 'licence_url': 'https://creativecommons.org/publicdomain/zero/1.0/deed.fr', 'url': 'https://www.wikidata.org/wiki/Q33881',
            'built': wm.today(), 'what': 'Vainqueurs d’étape du Tour de France et maillot jaune à l’issue de l’étape (P1346 des étapes, qualificatif P2501) ; les étapes elles-mêmes sont dans l8c-tour',
            'fields': ['s', 'w', 'wq', 'jaune'], 'rows': rows}
    size = wm.write_gz(OUT, 'ts-etapes.json.gz', meta)
    print(f'ts-etapes : {len(rows)} étapes avec vainqueur, {size} octets')


if __name__ == '__main__':
    main()
