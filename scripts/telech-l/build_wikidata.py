#!/usr/bin/env python3
"""🌐 Lot L — ce qui vient de Wikidata (CC0) : assets/data/tl-{memoriaux,cimetieres,villages,mesures}.json.gz

  memoriaux  🎖 monuments aux morts et mémoriaux de guerre du monde, hors de France (P31/P279* Q575759, avec une position) :
             nom, position, pays, commune, année, guerre commémorée (P547) — la France a déjà les siens dans l'app.
  cimetieres ✝️ cimetières du monde, hors de France (P31 Q39614, avec une position) : nom, position, pays, commune, ouverture.
  villages   🏚 villages désertés et disparus (P31/P279* Q350895 « abandoned village » ou Q21751582 « deserted medieval village » —
             dont les Wüstungen d'Allemagne et les villages médiévaux désertés d'Angleterre que Wikidata reprend de Historic England,
             P1216 → fiche officielle) : nom, position, pays, commune, fin (P576), identifiant Historic England.
  mesures    📏 unités de mesure liées à un pays (P31/P279* Q47574 et P17), avec leur valeur en unités du Système international
             (P2370) : nom, pays, grandeur (P111), valeur, unité SI.
Licence : https://www.wikidata.org/wiki/Wikidata:Copyright (relue à chaque fabrication) : « All structured data from the main,
Property, Lexeme, and EntitySchema namespaces is available under the Creative Commons CC0 License ».
Le service de requêtes est limité : une requête à la fois, une pause entre deux (TL_WDQS_GAP, 60 s par défaut), Retry-After respecté,
chaque liste coupée en 10 morceaux (dernier chiffre du Q) pour ne jamais dépasser le temps permis.

Lancer : python3 -I scripts/telech-l/build_wikidata.py [dossier de sortie] [memoriaux cimetieres villages mesures]
"""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
args = sys.argv[1:]
OUT = args[0] if args and not re.match(r'^[a-z]+$', args[0]) else os.path.join(ROOT, 'assets', 'data')
WANT = [a for a in args if re.match(r'^[a-z]+$', a)] or ['memoriaux', 'cimetieres', 'villages', 'mesures']
LANGS = 'fr,en,de,nl,it,es,pt,pl,da,sv,nb,fi,cs,hu,ro,el,ru,uk,ja,zh,mul'
LIC = 'https://www.wikidata.org/wiki/Wikidata:Copyright'


def licence():
    raw = wm.get('https://www.wikidata.org/w/index.php?title=Wikidata:Copyright&action=raw', '*/*').decode('utf-8')
    if 'Creative Commons CC0 License' not in raw:
        sys.exit('Wikidata:Copyright ne dit plus « Creative Commons CC0 License » : relire ' + LIC)


def parts(body):
    """la même requête en 10 morceaux (le dernier chiffre du Q)"""
    out = []
    for d in '0123456789':
        out += wm.sparql(body.replace('#PART#', f'FILTER(STRENDS(STR(?i), "{d}"))'))
    return out


def v(b, k):
    return (b.get(k) or {}).get('value', '')


def label_or_q(b, k):
    s = v(b, k)
    return '' if re.match(r'^Q\d+$', s) else s


def places(binds, kind):
    rows, cy, adm, extra = {}, [], [], []
    idx = lambda L, x: (L.index(x) if x in L else (L.append(x) or len(L) - 1))
    for b in binds:
        q = wm.qid(v(b, 'i'))
        lat, lon = wm.point(v(b, 'c'))
        name = label_or_q(b, 'iLabel')
        if not re.match(r'^Q\d+$', q) or lat is None or not name or q in rows:
            continue
        y = wm.year(v(b, 'y'))
        r = [q, name, round(lat, 4), round(lon, 4), idx(cy, label_or_q(b, 'cyLabel')), idx(adm, label_or_q(b, 'admLabel')), y]
        if kind == 'memoriaux':
            r.append(idx(extra, label_or_q(b, 'warLabel')))
        if kind == 'villages':
            r += [wm.year(v(b, 'end')), v(b, 'nhle') if re.match(r'^\d{7}$', v(b, 'nhle')) else '']
        rows[q] = r
    return list(rows.values()), cy, adm, extra


Q = {
    'memoriaux': '''SELECT ?i ?iLabel ?c ?cyLabel ?admLabel ?y ?warLabel WHERE { ?i wdt:P31/wdt:P279* wd:Q575759 ; wdt:P625 ?c . #PART#
        OPTIONAL { ?i wdt:P17 ?cy } FILTER(!BOUND(?cy) || ?cy != wd:Q142) OPTIONAL { ?i wdt:P131 ?adm } OPTIONAL { ?i wdt:P571 ?y } OPTIONAL { ?i wdt:P547 ?war }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "%s". } }''' % LANGS,
    'cimetieres': '''SELECT ?i ?iLabel ?c ?cyLabel ?admLabel ?y WHERE { ?i wdt:P31 wd:Q39614 ; wdt:P625 ?c . #PART#
        OPTIONAL { ?i wdt:P17 ?cy } FILTER(!BOUND(?cy) || ?cy != wd:Q142) OPTIONAL { ?i wdt:P131 ?adm } OPTIONAL { ?i wdt:P571 ?y }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "%s". } }''' % LANGS,
    'villages': '''SELECT ?i ?iLabel ?c ?cyLabel ?admLabel ?y ?end ?nhle WHERE { VALUES ?cls { wd:Q350895 wd:Q21751582 } ?i wdt:P31/wdt:P279* ?cls ; wdt:P625 ?c . #PART#
        OPTIONAL { ?i wdt:P17 ?cy } OPTIONAL { ?i wdt:P131 ?adm } OPTIONAL { ?i wdt:P571 ?y } OPTIONAL { ?i wdt:P576 ?end } OPTIONAL { ?i wdt:P1216 ?nhle }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "%s". } }''' % LANGS,
    'mesures': '''SELECT ?i ?iLabel ?cyLabel ?kindLabel ?amount ?siLabel WHERE { ?i wdt:P31/wdt:P279* wd:Q47574 ; wdt:P17 ?cy .
        ?i p:P2370/psv:P2370 [ wikibase:quantityAmount ?amount ; wikibase:quantityUnit ?si ] . OPTIONAL { ?i wdt:P111 ?kind }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "%s". } }''' % LANGS}

WHAT = {'memoriaux': 'Monuments aux morts et mémoriaux de guerre du monde, hors de France (Wikidata)',
        'cimetieres': 'Cimetières du monde, hors de France (Wikidata)',
        'villages': 'Villages désertés et disparus (Wüstungen, villages médiévaux désertés d’Angleterre…) (Wikidata)',
        'mesures': 'Unités de mesure anciennes ou locales liées à un pays, avec leur valeur en unités du Système international (Wikidata)'}


SI_OK = {'mètre', 'centimètre', 'millimètre', 'kilomètre', 'mètre carré', 'mètre cube', 'litre', 'kilogramme', 'gramme'}  # longueurs, aires, volumes, masses
SKIP = {'Q11524325'}  # « Tokyo Dome » (une unité pour rire, pas une mesure d'autrefois)


def build(kind):
    if kind == 'mesures':
        binds = wm.sparql(Q[kind])
        rows, cy, kinds, si = {}, [], [], []
        idx = lambda L, x: (L.index(x) if x in L else (L.append(x) or len(L) - 1))
        for b in binds:
            q = wm.qid(v(b, 'i')); name = label_or_q(b, 'iLabel')
            try:
                amount = float(v(b, 'amount'))
            except ValueError:
                continue
            unit = label_or_q(b, 'siLabel')
            if not re.match(r'^Q\d+$', q) or not name or amount <= 0 or unit not in SI_OK or q in SKIP:
                continue
            k = (q, label_or_q(b, 'cyLabel'))
            if k in rows:
                continue
            rows[k] = [q, name, idx(cy, k[1]), idx(kinds, label_or_q(b, 'kindLabel')), float(f'{amount:.6g}'), idx(si, label_or_q(b, 'siLabel'))]
        meta = {'countries': cy, 'kinds': kinds, 'units': si, 'fields': ['q', 'n', 'cy', 'k', 'v', 'u'], 'rows': sorted(rows.values(), key=lambda r: (cy[r[2]], r[1]))}
    else:
        rows, cy, adm, extra = places(parts(Q[kind]), kind)
        fields = ['q', 'n', 'lat', 'lon', 'cy', 'pl', 'y'] + (['war'] if kind == 'memoriaux' else []) + (['end', 'nhle'] if kind == 'villages' else [])
        meta = {'countries': cy, 'places': adm, 'fields': fields, 'rows': sorted(rows, key=lambda r: (r[4], r[1]))}
        if kind == 'memoriaux':
            meta['wars'] = extra
        if kind == 'villages':
            meta['nhle'] = 'https://historicengland.org.uk/listing/the-list/list-entry/{id}'
    assert len(meta['rows']) > 50, (kind, len(meta['rows']))
    meta = {'source': 'Wikidata', 'licence': 'CC0 1.0', 'licence_url': 'https://creativecommons.org/publicdomain/zero/1.0/deed.fr', 'url': LIC, 'built': wm.today(), 'what': WHAT[kind], **meta}
    size = wm.write_gz(OUT, f'tl-{kind}.json.gz', meta)
    print(f'tl-{kind} : {len(meta["rows"])} lignes, {size} octets', flush=True)


def main():
    licence()
    for k in WANT:
        if k not in Q:
            print('inconnu :', k); continue
        try:
            build(k)
        except Exception as e:  # noqa : une liste ratée n'empêche pas les autres
            print(f'tl-{k} : raté ({e})', flush=True)


if __name__ == '__main__':
    main()
