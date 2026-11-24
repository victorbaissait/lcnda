#!/usr/bin/env python3
"""🏰 Châteaux d'Europe, d'après Wikidata (CC0 1.0).

Refait assets/data/chateaux/chateaux-<PAYS>.json.gz (un fichier par pays, chargé à la demande) et
assets/data/chateaux/index.json (pays, nombre, taille, date, source).

  python3 -I scripts/chateaux-territoires/build-chateaux.py [--cache DOSSIER] [--only FR,DE]

Ce qui est gardé pour chaque château (clés courtes, pour la taille) :
  q  : numéro Wikidata (Q…)                     n  : nom (français s'il existe, sinon la langue du pays, sinon anglais)
  k  : sorte (c château fort, h château/Schloss, r ruine ou site, f forteresse/fort, m manoir/maison forte, t tour, o motte)
  la, lo : position                              cq, cn : commune (Wikidata P131) et son nom ; ci : code INSEE (France)
  y0 : construction (P571, année) ; y1 : démoli/disparu (P576) ; st : état (P5816, ex. « ruine »)
  hs : protections (P1435, noms)                 im : image (fichier Commons, P18) ; me : Mérimée (P380)
  w  : article Wikipédia en français (titre)     wl : [langue, titre] de l'article dans la langue du pays
  ow : propriétaires/seigneurs (P127) : [[nom, Q, année début, année fin], …]
"""
import argparse
import datetime
import gzip
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wd  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'data', 'chateaux')

# Les classes Wikidata retenues (instance de, P31, sans les sous-classes : on choisit à la main)
CLASSES = {
    'Q23413': 'c', 'Q15710038': 'c', 'Q1404207': 'c', 'Q2312233': 'c', 'Q1970243': 'c', 'Q365216': 'c', 'Q2776067': 'c',
    'Q92107': 'c', 'Q615810': 'c',                                     # château fort, de hauteur, rupestre, d'éperon, de plaine, Ordensburg, borg, quadrangulaire, Wasserburg
    'Q751876': 'h', 'Q16823155': 'h', 'Q1424449': 'h',                  # château (résidence), Schloss, pavillon de chasse
    'Q17715832': 'r', 'Q1015644': 'r', 'Q58271381': 'r',                # ruine de château, Burgstall, Wasserburgstall
    'Q57831': 'f', 'Q1785071': 'f', 'Q1195705': 'f',                    # forteresse, fort, rocca
    'Q879050': 'm', 'Q2116450': 'm', 'Q1802963': 'm', 'Q2066754': 'm', 'Q1408475': 'm', 'Q32164125': 'm', 'Q3802482': 'm',
    #                                                                     manoir, domaine seigneurial, Herrenhaus, manoir, maison forte, manoir fortifié, stins
    'Q91312': 't', 'Q1535658': 't', 'Q3898745': 't', 'Q91165': 't',     # maison-tour, tour, peel tower, donjon
    'Q92062': 'o', 'Q7335033': 'o',                                     # motte castrale, ringwork
}
# Pays d'Europe : code, Q, langue du pays (pour le nom et la Wikipédia « locale »)
COUNTRIES = [
    ('FR', 'Q142', 'fr'), ('DE', 'Q183', 'de'), ('IT', 'Q38', 'it'), ('ES', 'Q29', 'es'), ('GB', 'Q145', 'en'), ('IE', 'Q27', 'en'),
    ('PT', 'Q45', 'pt'), ('BE', 'Q31', 'nl'), ('NL', 'Q55', 'nl'), ('LU', 'Q32', 'lb'), ('CH', 'Q39', 'de'), ('AT', 'Q40', 'de'),
    ('CZ', 'Q213', 'cs'), ('SK', 'Q214', 'sk'), ('PL', 'Q36', 'pl'), ('HU', 'Q28', 'hu'), ('SI', 'Q215', 'sl'), ('HR', 'Q224', 'hr'),
    ('BA', 'Q225', 'bs'), ('RS', 'Q403', 'sr'), ('ME', 'Q236', 'sr'), ('MK', 'Q221', 'mk'), ('AL', 'Q222', 'sq'), ('GR', 'Q41', 'el'),
    ('BG', 'Q219', 'bg'), ('RO', 'Q218', 'ro'), ('MD', 'Q217', 'ro'), ('UA', 'Q212', 'uk'), ('BY', 'Q184', 'be'), ('LT', 'Q37', 'lt'),
    ('LV', 'Q211', 'lv'), ('EE', 'Q191', 'et'), ('FI', 'Q33', 'fi'), ('SE', 'Q34', 'sv'), ('NO', 'Q20', 'nb'), ('DK', 'Q35', 'da'),
    ('IS', 'Q189', 'is'), ('RU', 'Q159', 'ru'), ('MT', 'Q233', 'mt'), ('CY', 'Q229', 'el'), ('LI', 'Q347', 'de'), ('MC', 'Q235', 'fr'),
    ('SM', 'Q238', 'it'), ('AD', 'Q228', 'ca'), ('VA', 'Q237', 'it'), ('XK', 'Q1246', 'sq'),
]
BOX = (34.0, 72.0, -25.0, 60.0)  # Europe (la Russie et la Turquie d'Asie sont coupées)


def items_of(cq, cache):
    vals = ' '.join('wd:' + c for c in CLASSES)
    q = f"""SELECT ?x ?c ?co WHERE {{ VALUES ?c {{ {vals} }} ?x wdt:P31 ?c ; wdt:P17 wd:{cq} . OPTIONAL {{ ?x wdt:P625 ?co }} }}"""
    out = {}
    for b in wd.sparql(q, cache):
        x = wd.qid(wd.val(b, 'x'))
        k = CLASSES.get(wd.qid(wd.val(b, 'c')), 'c')
        it = out.setdefault(x, {'q': x, 'k': k})
        # plusieurs classes : la plus « château » d'abord (c > h > f > m > t > o > r)
        if 'chfmtor'.index(k) < 'chfmtor'.index(it['k']):
            it['k'] = k
        p = wd.point(wd.val(b, 'co'))
        if p and 'la' not in it:
            it['la'], it['lo'] = p
    return out


def details(ids, lang, cache):
    vals = ' '.join('wd:' + i for i in ids)
    q = f"""SELECT ?x (SAMPLE(?fr) AS ?nfr) (SAMPLE(?ll) AS ?nl) (SAMPLE(?en) AS ?nen) (SAMPLE(?com) AS ?c) (MIN(?inc) AS ?i) (MIN(?dis) AS ?d)
      (SAMPLE(?stl) AS ?st) (SAMPLE(?img) AS ?im) (SAMPLE(?mer) AS ?me) (SAMPLE(?wfr) AS ?wf) (SAMPLE(?wlo) AS ?wl)
      (GROUP_CONCAT(DISTINCT ?hl; separator="|") AS ?hs) WHERE {{
      VALUES ?x {{ {vals} }}
      OPTIONAL {{ ?x rdfs:label ?fr FILTER(lang(?fr)="fr") }}
      OPTIONAL {{ ?x rdfs:label ?ll FILTER(lang(?ll)="{lang}") }}
      OPTIONAL {{ ?x rdfs:label ?en FILTER(lang(?en)="en") }}
      OPTIONAL {{ ?x wdt:P131 ?com }}
      OPTIONAL {{ ?x wdt:P571 ?inc }}
      OPTIONAL {{ ?x wdt:P576 ?dis }}
      OPTIONAL {{ ?x wdt:P5816 ?s . ?s rdfs:label ?stl FILTER(lang(?stl)="fr") }}
      OPTIONAL {{ ?x wdt:P18 ?img }}
      OPTIONAL {{ ?x wdt:P380 ?mer }}
      OPTIONAL {{ ?x wdt:P1435 ?h . ?h rdfs:label ?hl FILTER(lang(?hl)="fr") }}
      OPTIONAL {{ ?wfr schema:about ?x ; schema:isPartOf <https://fr.wikipedia.org/> }}
      OPTIONAL {{ ?wlo schema:about ?x ; schema:isPartOf <https://{lang}.wikipedia.org/> }}
    }} GROUP BY ?x"""
    return wd.sparql(q, cache)


def owners(ids, cache):
    vals = ' '.join('wd:' + i for i in ids)
    q = f"""SELECT ?x ?o ?ol2 ?s ?e WHERE {{ VALUES ?x {{ {vals} }} ?x p:P127 ?st . ?st ps:P127 ?o .
      OPTIONAL {{ ?st pq:P580 ?s }} OPTIONAL {{ ?st pq:P582 ?e }}
      OPTIONAL {{ ?o rdfs:label ?ol FILTER(lang(?ol)="fr") }} OPTIONAL {{ ?o rdfs:label ?oe FILTER(lang(?oe)="en") }}
      BIND(COALESCE(?ol, ?oe) AS ?ol2) }}"""
    return wd.sparql(q, cache)


def communes(ids, cache):
    vals = ' '.join('wd:' + i for i in ids)
    q = f"""SELECT ?c (SAMPLE(?fr) AS ?nfr) (SAMPLE(?any) AS ?n) (SAMPLE(?ins) AS ?insee) WHERE {{ VALUES ?c {{ {vals} }}
      OPTIONAL {{ ?c rdfs:label ?fr FILTER(lang(?fr)="fr") }} OPTIONAL {{ ?c rdfs:label ?any FILTER(lang(?any)="en") }}
      OPTIONAL {{ ?c wdt:P374 ?ins }} }} GROUP BY ?c"""
    return wd.sparql(q, cache)


def title_of(url):
    import urllib.parse
    return urllib.parse.unquote(url.rsplit('/wiki/', 1)[-1]).replace('_', ' ') if url else None


def build_country(code, cq, lang, cache):
    items = items_of(cq, cache)
    ids = sorted(items)
    for chunk in wd.batches(ids, 250):
        for b in details(chunk, lang, cache):
            it = items[wd.qid(wd.val(b, 'x'))]
            nfr, nl, nen = wd.val(b, 'nfr'), wd.val(b, 'nl'), wd.val(b, 'nen')
            it['n'] = nfr or nl or nen or it['q']
            if nl and nfr and nl != nfr:
                it['nl'] = nl
            c = wd.qid(wd.val(b, 'c'))
            if c:
                it['cq'] = c
            y0, y1 = wd.year(wd.val(b, 'i')), wd.year(wd.val(b, 'd'))
            if y0:
                it['y0'] = y0
            if y1:
                it['y1'] = y1
            for k, src in (('st', 'st'), ('me', 'me')):
                if wd.val(b, src):
                    it[k] = wd.val(b, src)
            if wd.val(b, 'im'):
                it['im'] = wd.commons_file(wd.val(b, 'im'))
            hs = [h for h in (wd.val(b, 'hs') or '').split('|') if h]
            if hs:
                it['hs'] = hs[:3]
            if wd.val(b, 'wf'):
                it['w'] = title_of(wd.val(b, 'wf'))
            if wd.val(b, 'wl') and lang != 'fr':
                it['wl'] = [lang, title_of(wd.val(b, 'wl'))]
        for b in owners(chunk, cache):
            it = items[wd.qid(wd.val(b, 'x'))]
            o = wd.qid(wd.val(b, 'o'))
            row = [wd.val(b, 'ol2') or o, o, wd.year(wd.val(b, 's')), wd.year(wd.val(b, 'e'))]
            ow = it.setdefault('ow', [])
            if row not in ow and len(ow) < 12:
                ow.append(row)
    for it in items.values():
        if it.get('ow'):
            it['ow'].sort(key=lambda r: (r[2] is None, r[2] or 0))
            it['ow'] = [[r[0], r[1]] + ([r[2], r[3]] if (r[2] or r[3]) else []) for r in it['ow']]
    cids = sorted({it['cq'] for it in items.values() if it.get('cq')})
    cnames = {}
    for chunk in wd.batches(cids, 400):
        for b in communes(chunk, cache):
            cnames[wd.qid(wd.val(b, 'c'))] = (wd.val(b, 'nfr') or wd.val(b, 'n'), wd.val(b, 'insee'))
    rows = []
    for it in items.values():
        if 'la' in it and not (BOX[0] <= it['la'] <= BOX[1] and BOX[2] <= it['lo'] <= BOX[3]):
            continue
        if it.get('cq') in cnames:
            n, ins = cnames[it['cq']]
            if n:
                it['cn'] = n
            if ins and code == 'FR':
                it['ci'] = ins
        if 'n' not in it:
            it['n'] = it['q']
        rows.append(it)
    rows.sort(key=lambda r: (r.get('la') is None, -(r.get('la') or 0), r['q']))
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cache', default=os.path.join(ROOT, '.cache', 'chateaux-territoires'))
    ap.add_argument('--only', default='')
    a = ap.parse_args()
    only = set(x for x in a.only.split(',') if x)
    os.makedirs(OUT, exist_ok=True)
    index_path = os.path.join(OUT, 'index.json')
    index = {'countries': {}}
    if os.path.exists(index_path):
        index = json.load(open(index_path, encoding='utf-8'))
    for code, cq, lang in COUNTRIES:
        if only and code not in only:
            continue
        rows = build_country(code, cq, lang, a.cache)
        path = os.path.join(OUT, f'chateaux-{code}.json.gz')
        if not rows:
            if os.path.exists(path):
                os.remove(path)
            index['countries'].pop(code, None)
            continue
        raw = json.dumps({'country': code, 'items': rows}, ensure_ascii=False, separators=(',', ':')).encode()
        with gzip.GzipFile(path, 'wb', compresslevel=9, mtime=0) as f:
            f.write(raw)
        kinds = {}
        for r in rows:
            kinds[r['k']] = kinds.get(r['k'], 0) + 1
        index['countries'][code] = {'n': len(rows), 'geo': sum(1 for r in rows if 'la' in r), 'bytes': os.path.getsize(path), 'kinds': kinds, 'q': cq}
        print(code, len(rows), os.path.getsize(path), flush=True)
    index.update({'v': 1, 'built': datetime.date.today().isoformat(),
                  'source': 'Wikidata (requête SPARQL, classes « château », « château fort », « ruine de château », « forteresse », « manoir », « maison forte », « motte »…)',
                  'licence': 'CC0 1.0', 'licence_url': 'https://creativecommons.org/publicdomain/zero/1.0/', 'url': 'https://www.wikidata.org/',
                  'classes': CLASSES,
                  'total': sum(c['n'] for c in index['countries'].values())})
    with open(index_path, 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False, indent=0, sort_keys=True)
    print('total', index['total'])


if __name__ == '__main__':
    main()
