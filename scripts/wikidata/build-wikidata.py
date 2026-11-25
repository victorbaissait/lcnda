#!/usr/bin/env python3
"""LCNDA — 🌟 Wikidata : le FABRICANT des données « Autour de sa vie » (à lancer une fois, sur un ordinateur qui a Internet).

    python3 scripts/wikidata/build-wikidata.py                 # tout (≈ 2 à 4 heures : des milliers de petites questions, avec des pauses)
    python3 scripts/wikidata/build-wikidata.py --test          # essai rapide : la Belgique et le Luxembourg seulement
    python3 scripts/wikidata/build-wikidata.py --hors-ligne    # refait seulement les fichiers, depuis les réponses gardées

Source : Wikidata (https://www.wikidata.org), interrogé par le service de requêtes https://query.wikidata.org/sparql.
Licence des données : CC0 1.0 (domaine public, https://creativecommons.org/publicdomain/zero/1.0/) — redistribution libre.
Chaque ligne produite garde le numéro « Q… » de Wikidata : l'app montre toujours le lien ↗ vers la page en ligne.

Politesse envers le service : une seule question à la fois, une pause entre deux questions, un User-Agent qui décrit
l'outil (sans adresse), les grosses questions découpées (par pays de nationalité, puis par chiffre final du numéro
si le pays est trop gros), et chaque réponse gardée dans le dossier --cache : le programme REPREND où il s'était arrêté.

Ce qui est demandé (chaque étape = une sorte de question) :
  countries : les États d'Europe et des Amériques (P30 continent), les États où le français est langue officielle (P37 = Q150),
              et les pays historiques (Q3024240) de ces continents ou de langue française — pour découper les personnes.
  people    : les personnes (P31 = Q5) de nationalité (P27) d'un de ces États, avec un lieu de naissance (P19) et au moins
              N liens vers les Wikipédias (wikibase:sitelinks) : N = 4 pour les États de langue française, 12 pour les autres (pour tenir sous 15 Mo).
  details   : pour chaque personne retenue (par paquets de 400) : nom fr/en, nom de famille (P734), naissance (P569, avec la
              précision), décès (P570), lieu de décès (P20), un métier (P106), et si elle a une page sur fr/en.wikipedia.
  places    : pour chaque lieu de naissance ou de décès (par paquets de 300) : nom fr/en, coordonnées (P625), pays (P17),
              noms officiels (P1448, avec début P580 / fin P582), surnoms (P1449), noms courts (P1813).
  events    : batailles (Q178561), catastrophes naturelles (Q8065), épidémies (Q44512), incendies (Q3196, Q168983),
              inondations (Q8068), traités (Q131569) et leurs sous-classes (P279*), avec une date (P585 ou P580/P582)
              et des coordonnées (P625, ou celles du lieu P276).
  oldnames  : les anciens noms officiels (P1448 avec un début ou une fin) des communes et villes (une question par
              sorte de commune : communes de France, de Belgique, de Suisse, d'Italie, villes, villages…).
  songs     : chansons (Q7366), singles (Q134556) et œuvres musicales (Q105543609) avec une date de publication (P577),
              un interprète (P175 : celui né le plus tôt, l'interprète d'origine), le pays (P495) et la langue (P407),
              au moins 2 liens Wikipédia ; par décennie.
  write     : les fichiers compacts de l'app, dans assets/data/wikidata/ (gzip) — voir README dans la sortie.

Seulement la bibliothèque standard de Python.
"""
import argparse
import collections
import gzip
import hashlib
import http.client
import json
import math
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

ENDPOINT = 'https://query.wikidata.org/sparql'
UA = 'genealogy-offline-dataset-builder/1.0 (non-commercial batch build of a small CC0 extract; one request at a time, with pauses)'
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'assets', 'data', 'wikidata')
PAUSE = 1.0
EUROPE, N_AMERICA, S_AMERICA = 'Q46', 'Q49', 'Q18'
FRENCH = 'Q150'
SL_FRANCO, SL_OTHER = 4, 12
TILE = 5  # degrés : les fichiers des personnes et des événements sont découpés en carreaux de 5° × 5°

EVENT_KINDS = [  # (clé, classes) — l'ordre compte : une épidémie qui est aussi une catastrophe reste « épidémie »
    ('epidemic', ['Q44512']),
    ('fire', ['Q3196', 'Q168983']),
    ('flood', ['Q8068']),
    ('battle', ['Q178561']),
    ('treaty', ['Q131569']),
    ('disaster', ['Q8065']),
]
SETTLEMENT_CLASSES = ['Q484170', 'Q21869758', 'Q2989454', 'Q493522', 'Q70208', 'Q747074', 'Q2074737', 'Q262166',
                      'Q42744322', 'Q116457956', 'Q22865', 'Q2039348', 'Q667509', 'Q2616791', 'Q3558970', 'Q515',
                      'Q3957', 'Q532', 'Q1549591', 'Q5119', 'Q486972', 'Q15284', 'Q1093829', 'Q3184121']


def log(*a):
    print(*a, file=sys.stderr, flush=True)


class Wdqs:
    def __init__(self, cache, offline=False):
        self.cache = cache
        self.offline = offline
        os.makedirs(cache, exist_ok=True)
        self.last = 0.0
        self.asked = 0

    def ask(self, query, tag=''):
        """Une question SPARQL → liste de dictionnaires {variable: valeur}. None si le service a abandonné (trop long)."""
        h = hashlib.sha1(query.encode()).hexdigest()[:20]
        path = os.path.join(self.cache, f'{tag}-{h}.json.gz' if tag else f'{h}.json.gz')
        if os.path.exists(path):
            with gzip.open(path, 'rt', encoding='utf-8') as f:
                d = json.load(f)
            return d['rows'] if d.get('ok') else None
        if self.offline:
            raise RuntimeError('pas en cache (mode hors ligne) : ' + tag)
        rows = None
        for attempt in range(4):
            wait = PAUSE - (time.time() - self.last)
            if wait > 0:
                time.sleep(wait)
            req = urllib.request.Request(ENDPOINT, data=urllib.parse.urlencode({'query': query}).encode(),
                                         headers={'User-Agent': UA, 'Accept': 'application/sparql-results+json',
                                                  'Content-Type': 'application/x-www-form-urlencoded'})
            t0 = time.time()
            try:
                with urllib.request.urlopen(req, timeout=90) as r:
                    raw = r.read()
                self.last = time.time()
                self.asked += 1
                try:
                    data = json.loads(raw)
                except ValueError:
                    log(f'  … réponse coupée ({tag}, {len(raw)} octets, {time.time() - t0:.0f} s) : trop long pour le service')
                    rows = None
                    break
                rows = [{k: v['value'] for k, v in b.items()} for b in data['results']['bindings']]
                break
            except urllib.error.HTTPError as e:
                self.last = time.time()
                if e.code == 429:
                    ra = int(e.headers.get('Retry-After') or 60)
                    log(f'  … le service demande une pause de {ra} s')
                    time.sleep(ra)
                    continue
                if e.code in (500, 502, 503, 504):
                    log(f'  … erreur {e.code} ({tag}, {time.time() - t0:.0f} s)')
                    if time.time() - t0 > 50:  # dépassement du temps : inutile de reposer la même question
                        rows = None
                        break
                    time.sleep(10 * (attempt + 1))
                    continue
                raise
            except (urllib.error.URLError, TimeoutError, ConnectionError, http.client.HTTPException, OSError) as e:
                self.last = time.time()
                log(f'  … réseau : {e} — nouvel essai dans 30 s')
                time.sleep(30)
        with gzip.open(path, 'wt', encoding='utf-8') as f:
            json.dump({'ok': rows is not None, 'rows': rows or []}, f)
        return rows


def qid(uri):
    return uri.rsplit('/', 1)[-1] if uri else ''


def qnum(uri):
    q = qid(uri)
    return int(q[1:]) if re.fullmatch(r'Q\d+', q or '') else 0


def values(ids):
    return ' '.join('wd:' + i for i in ids)


def chunks(seq, n):
    seq = list(seq)
    for i in range(0, len(seq), n):
        yield seq[i:i + n]


def wdate(v, prec):
    """« +1850-03-07T00:00:00Z » + précision (9 année, 10 mois, 11 jour) → « 1850 », « 1850-03 », « 1850-03-07 » ; '' si avant l'an 1 ou trop vague."""
    m = re.match(r'^(-?)(\d{1,5})-(\d\d)-(\d\d)', v or '')
    if not m or m.group(1) == '-':
        return ''
    y = int(m.group(2))
    try:
        p = int(float(prec)) if prec not in (None, '') else 9
    except ValueError:
        p = 9
    if p < 9 or y == 0:
        return ''
    if p == 9:
        return str(y)
    if p == 10:
        return f'{y}-{m.group(3)}'
    return f'{y}-{m.group(3)}-{m.group(4)}'


def fold(s):
    s = unicodedata.normalize('NFKD', str(s or '')).encode('ascii', 'ignore').decode().lower()
    s = re.sub(r"[’'`\-]", ' ', s)
    s = re.sub(r'[^a-z0-9 ]', '', s)
    return re.sub(r'\s+', ' ', s).strip()


def point(wkt):
    m = re.match(r'Point\(([-\d.eE]+) ([-\d.eE]+)\)', wkt or '')
    if not m:
        return None
    lon, lat = float(m.group(1)), float(m.group(2))
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None
    return round(lat, 4), round(lon, 4)


def in_scope(lat, lon):
    """Europe (avec Maghreb et Proche-Orient proches), les Amériques, et l'Afrique de langue française (gros rectangle)."""
    if 27 <= lat <= 72 and -32 <= lon <= 50:
        return True
    if -57 <= lat <= 84 and -170 <= lon <= -25:
        return True
    if -35 <= lat <= 27 and -26 <= lon <= 52:  # Afrique (dont l'Afrique de langue française, la Réunion, Madagascar)
        return True
    return False


def tile_key(lat, lon):
    return f'{int(math.floor(lat / TILE) * TILE)}_{int(math.floor(lon / TILE) * TILE)}'


# ───────────────────────── étapes ─────────────────────────

def step_countries(w):
    q = f'''SELECT DISTINCT ?c ?franco WHERE {{
      {{ ?c wdt:P31 wd:Q3624078 . }} UNION {{ ?c wdt:P31/wdt:P279* wd:Q3024240 . }} UNION {{ ?c wdt:P31 wd:Q6256 . }}
      OPTIONAL {{ ?c wdt:P37 ?lang . FILTER(?lang = wd:{FRENCH}) BIND(1 AS ?franco) }}
      OPTIONAL {{ ?c wdt:P30 ?cont . }}
      FILTER(BOUND(?franco) || ?cont IN (wd:{EUROPE}, wd:{N_AMERICA}, wd:{S_AMERICA}))
    }}'''
    rows = w.ask(q, 'countries') or []
    out = {}
    for r in rows:
        c = qid(r['c'])
        out[c] = max(out.get(c, 0), 1 if r.get('franco') else 0)
    log(f'États et pays historiques : {len(out)} (dont {sum(out.values())} de langue française)')
    return out


def ask_people(w, country, minsl, digit=None):
    filt = f'FILTER(STRENDS(STR(?p), "{digit}"))' if digit is not None else ''
    q = f'''SELECT ?p ?sl ?pl WHERE {{
      ?p wdt:P27 wd:{country} . {filt}
      ?p wikibase:sitelinks ?sl . FILTER(?sl >= {minsl})
      ?p wdt:P19 ?pl .
    }}'''
    return w.ask(q, f'people-{country}-{digit if digit is not None else "all"}')


def step_people(w, countries):
    people = {}
    for i, (c, franco) in enumerate(sorted(countries.items())):
        minsl = SL_FRANCO if franco else SL_OTHER
        rows = ask_people(w, c, minsl)
        if rows is None:
            rows = []
            for d in range(10):
                part = ask_people(w, c, minsl, d)
                if part is None:
                    log(f'  ⚠ {c} chiffre {d} : trop long, abandonné')
                    continue
                rows += part
        for r in rows:
            p = qnum(r['p'])
            if p and (p not in people or (franco and not people[p][2])):
                people[p] = (int(r['sl']), qnum(r['pl']), franco)
        if i % 20 == 0:
            log(f'  personnes : {i + 1}/{len(countries)} pays, {len(people)} personnes')
    log(f'Personnes trouvées : {len(people)}')
    return people


def step_details(w, people):
    det = {}
    ids = sorted(people)
    for n, part in enumerate(chunks(ids, 400)):
        q = f'''SELECT ?p (SAMPLE(?lfr) AS ?fr) (SAMPLE(?len) AS ?en) (SAMPLE(?famL) AS ?fam) (SAMPLE(?b) AS ?b) (SAMPLE(?bp) AS ?bp)
          (SAMPLE(?d) AS ?d) (SAMPLE(?dp) AS ?dp) (SAMPLE(?dpl) AS ?dpl) (SAMPLE(?occ) AS ?occ) (SAMPLE(?frw) AS ?frw) (SAMPLE(?enw) AS ?enw) WHERE {{
          VALUES ?p {{ {values('Q%d' % i for i in part)} }}
          OPTIONAL {{ ?p rdfs:label ?lfr . FILTER(LANG(?lfr) = "fr") }}
          OPTIONAL {{ ?p rdfs:label ?len . FILTER(LANG(?len) = "en") }}
          OPTIONAL {{ ?p wdt:P734 ?famQ . ?famQ rdfs:label ?famL . FILTER(LANG(?famL) IN ("fr", "en", "mul")) }}
          OPTIONAL {{ ?p p:P569 ?bs . ?bs a wikibase:BestRank ; psv:P569 [ wikibase:timeValue ?b ; wikibase:timePrecision ?bp ] . }}
          OPTIONAL {{ ?p p:P570 ?ds . ?ds a wikibase:BestRank ; psv:P570 [ wikibase:timeValue ?d ; wikibase:timePrecision ?dp ] . }}
          OPTIONAL {{ ?p wdt:P20 ?dpl . }}
          OPTIONAL {{ ?p wdt:P106 ?occ . }}
          OPTIONAL {{ ?frw schema:about ?p ; schema:isPartOf <https://fr.wikipedia.org/> . }}
          OPTIONAL {{ ?enw schema:about ?p ; schema:isPartOf <https://en.wikipedia.org/> . }}
        }} GROUP BY ?p'''
        rows = w.ask(q, f'det4-{n:05d}')
        if rows is None:  # paquet trop lourd : en deux moitiés
            rows = []
            for half in chunks(part, 200):
                q2 = q.replace(values('Q%d' % i for i in part), values('Q%d' % i for i in half))
                rows += w.ask(q2, f'det{n:05d}h{half[0]}') or []
        for r in rows:
            det[qnum(r['p'])] = r
        if n % 50 == 0:
            log(f'  détails : {min((n + 1) * 400, len(ids))}/{len(ids)}')
    return det


def step_places(w, place_ids, tag='pl'):
    out = {}
    names = collections.defaultdict(list)
    ids = sorted(i for i in place_ids if i)
    for n, part in enumerate(chunks(ids, 300)):
        q = f'''SELECT ?pl (SAMPLE(?lfr) AS ?fr) (SAMPLE(?len) AS ?en) (SAMPLE(?co) AS ?co) (SAMPLE(?c) AS ?c) WHERE {{
          VALUES ?pl {{ {values('Q%d' % i for i in part)} }}
          OPTIONAL {{ ?pl rdfs:label ?lfr . FILTER(LANG(?lfr) = "fr") }}
          OPTIONAL {{ ?pl rdfs:label ?len . FILTER(LANG(?len) = "en") }}
          OPTIONAL {{ ?pl wdt:P625 ?co . }}
          OPTIONAL {{ ?pl wdt:P17 ?c . }}
        }} GROUP BY ?pl'''
        for r in w.ask(q, f'{tag}{n:05d}') or []:
            out[qnum(r['pl'])] = r
        q = f'''SELECT ?pl ?k ?name ?s ?e WHERE {{
          VALUES ?pl {{ {values('Q%d' % i for i in part)} }}
          {{ ?pl p:P1448 ?st . ?st ps:P1448 ?name . BIND("o" AS ?k) OPTIONAL {{ ?st pq:P580 ?s }} OPTIONAL {{ ?st pq:P582 ?e }} }}
          UNION {{ ?pl wdt:P1449 ?name . BIND("n" AS ?k) }}
          UNION {{ ?pl wdt:P1813 ?name . BIND("s" AS ?k) }}
        }}'''
        for r in w.ask(q, f'{tag}n{n:05d}') or []:
            names[qnum(r['pl'])].append(r)
        if n % 50 == 0:
            log(f'  lieux : {min((n + 1) * 300, len(ids))}/{len(ids)}')
    return out, names


def step_events(w):
    seen, out = set(), []
    for kind, classes in EVENT_KINDS:
        for cls in classes:
            q = f'''SELECT ?e (SAMPLE(?lfr) AS ?fr) (SAMPLE(?len) AS ?en) (SAMPLE(?d) AS ?d) (SAMPLE(?dp) AS ?dp) (SAMPLE(?e2) AS ?end)
              (SAMPLE(?co) AS ?co) (SAMPLE(?sl) AS ?sl) (SAMPLE(?frw) AS ?frw) (SAMPLE(?enw) AS ?enw) WHERE {{
              ?cls wdt:P279* wd:{cls} . ?e wdt:P31 ?cls .
              {{ ?e p:P585/psv:P585 [ wikibase:timeValue ?d ; wikibase:timePrecision ?dp ] . }}
              UNION {{ ?e p:P580/psv:P580 [ wikibase:timeValue ?d ; wikibase:timePrecision ?dp ] . OPTIONAL {{ ?e wdt:P582 ?e2 }} }}
              {{ ?e wdt:P625 ?co . }} UNION {{ ?e wdt:P276 ?loc . ?loc wdt:P625 ?co . }}
              ?e wikibase:sitelinks ?sl .
              OPTIONAL {{ ?e rdfs:label ?lfr . FILTER(LANG(?lfr) = "fr") }}
              OPTIONAL {{ ?e rdfs:label ?len . FILTER(LANG(?len) = "en") }}
              OPTIONAL {{ ?frw schema:about ?e ; schema:isPartOf <https://fr.wikipedia.org/> . }}
              OPTIONAL {{ ?enw schema:about ?e ; schema:isPartOf <https://en.wikipedia.org/> . }}
            }} GROUP BY ?e'''
            rows = w.ask(q, f'ev-{kind}-{cls}')
            if rows is None:
                log(f'  ⚠ événements {kind} ({cls}) : trop long, sans les libellés')
                rows = []
            k = 0
            for r in rows:
                e = qnum(r['e'])
                if e in seen:
                    continue
                seen.add(e)
                r['kind'] = kind
                out.append(r)
                k += 1
            log(f'  événements {kind} ({cls}) : {k}')
    return out


def step_oldnames(w):
    rows = []
    for cls in SETTLEMENT_CLASSES:
        q = f'''SELECT ?pl ?name ?s ?e (SAMPLE(?lfr) AS ?fr) (SAMPLE(?len) AS ?en) (SAMPLE(?co) AS ?co) WHERE {{
          ?pl wdt:P31 wd:{cls} ; p:P1448 ?st . ?st ps:P1448 ?name .
          OPTIONAL {{ ?st pq:P580 ?s }} OPTIONAL {{ ?st pq:P582 ?e }}
          FILTER(BOUND(?s) || BOUND(?e))
          OPTIONAL {{ ?pl wdt:P625 ?co }}
          OPTIONAL {{ ?pl rdfs:label ?lfr . FILTER(LANG(?lfr) = "fr") }}
          OPTIONAL {{ ?pl rdfs:label ?len . FILTER(LANG(?len) = "en") }}
        }} GROUP BY ?pl ?name ?s ?e'''
        r = w.ask(q, f'old-{cls}')
        if r is None:  # trop gros (les communes de France) : en dix morceaux, par le dernier chiffre du numéro
            r = []
            for d in range(10):
                part = w.ask(q.replace(f'?pl wdt:P31 wd:{cls} ;', f'?pl wdt:P31 wd:{cls} . FILTER(STRENDS(STR(?pl), "{d}")) ?pl'), f'old-{cls}-{d}')
                if part is None:
                    log(f'  ⚠ anciens noms {cls} chiffre {d} : trop long, abandonné')
                    continue
                r += part
        log(f'  anciens noms {cls} : {len(r)}')
        rows += r
    return rows


def step_songs(w):
    """Chansons (Q7366), singles (Q134556) et œuvres musicales (Q105543609, la classe des vieilles chansons comme
    « Parlez-moi d'amour ») avec une date de publication et au moins un interprète ; par décennie (puis par année)."""
    q = '''SELECT ?s (SAMPLE(?lfr) AS ?fr) (SAMPLE(?len) AS ?en) (SAMPLE(?lmul) AS ?mul) (MIN(?pd) AS ?d) (SAMPLE(?sl0) AS ?sl)
      (GROUP_CONCAT(DISTINCT CONCAT(STR(?perf), "|", COALESCE(STR(YEAR(?pb)), ""), "|", COALESCE(?pfr, ?pen, ?pmul, "")); separator="§") AS ?perfs)
      (GROUP_CONCAT(DISTINCT STRAFTER(STR(?c), "entity/"); separator=",") AS ?cs)
      (GROUP_CONCAT(DISTINCT STRAFTER(STR(?lang), "entity/"); separator=",") AS ?langs) (SAMPLE(?frw) AS ?frw) (SAMPLE(?enw) AS ?enw) WHERE {
      ?s wdt:P31 wd:CLS ; wdt:P577 ?pd ; wikibase:sitelinks ?sl0 . FILTER(?sl0 >= 2 && RANGE)
      ?s wdt:P175 ?perf .
      OPTIONAL { ?perf wdt:P569 ?pb }
      OPTIONAL { ?perf rdfs:label ?pfr . FILTER(LANG(?pfr) = "fr") }
      OPTIONAL { ?perf rdfs:label ?pen . FILTER(LANG(?pen) = "en") }
      OPTIONAL { ?perf rdfs:label ?pmul . FILTER(LANG(?pmul) = "mul") }
      OPTIONAL { ?s wdt:P495 ?c } OPTIONAL { ?s wdt:P407 ?lang }
      OPTIONAL { ?s rdfs:label ?lfr . FILTER(LANG(?lfr) = "fr") }
      OPTIONAL { ?s rdfs:label ?len . FILTER(LANG(?len) = "en") }
      OPTIONAL { ?s rdfs:label ?lmul . FILTER(LANG(?lmul) = "mul") }
      OPTIONAL { ?frw schema:about ?s ; schema:isPartOf <https://fr.wikipedia.org/> . }
      OPTIONAL { ?enw schema:about ?s ; schema:isPartOf <https://en.wikipedia.org/> . }
    } GROUP BY ?s'''
    rng = lambda a, b: f'?pd >= "{a}-01-01T00:00:00Z"^^xsd:dateTime && ?pd < "{b}-01-01T00:00:00Z"^^xsd:dateTime'
    rows, seen = [], set()
    for cls in ('Q7366', 'Q134556', 'Q105543609'):
        for dec in range(1850, 2030, 10):
            part = w.ask(q.replace('CLS', cls).replace('RANGE', rng(dec, dec + 10)), f'song2-{cls}-{dec}')
            if part is None:  # trop gros : année par année
                part = []
                for y in range(dec, dec + 10):
                    p1 = w.ask(q.replace('CLS', cls).replace('RANGE', rng(y, y + 1)), f'song2-{cls}-{y}')
                    if p1 is None:
                        log(f'  ⚠ chansons {cls} {y} : trop long, abandonné')
                    part += p1 or []
            for r in part:
                if r['s'] not in seen:
                    seen.add(r['s'])
                    # l'interprète d'origine : celui qui est né le plus tôt (les reprises viennent après)
                    perfs = [x.split('|') for x in (r.get('perfs') or '').split('§') if x.count('|') == 2]
                    perfs = [(int(y) if y.lstrip('-').isdigit() else 9999, lab) for _, y, lab in perfs if lab and not re.fullmatch(r'Q\d+', lab)]
                    r['pfr'] = min(perfs)[1] if perfs else ''
                    rows.append(r)
    log(f'  chansons : {len(rows)}')
    return rows


def step_mul_labels(w, rows, key, tag):
    """Le nom « mul » (toutes langues) quand il n'y a ni nom français ni nom anglais : Wikidata range de plus en plus
    les noms propres ainsi (Marie Curie, Varsovie…)."""
    missing = sorted(q for q, r in rows.items() if q and not (r.get('fr') or r.get('en')))
    for n, part in enumerate(chunks(missing, 400)):
        q = f'''SELECT ?x ?l WHERE {{ VALUES ?x {{ {values('Q%d' % i for i in part)} }} ?x rdfs:label ?l . FILTER(LANG(?l) = "mul") }}'''
        for r in w.ask(q, f'{tag}{n:05d}') or []:
            x = rows.get(qnum(r['x']))
            if x is not None:
                x['fr'] = r['l']
    log(f'  noms « mul » ({tag}) : {len(missing)} demandés')


def step_occupations(w, occ_ids):
    out = {}
    for n, part in enumerate(chunks(sorted(occ_ids), 400)):
        q = f'''SELECT ?o (SAMPLE(?f) AS ?fr) (SAMPLE(?e) AS ?en) (SAMPLE(?ff) AS ?ffem) WHERE {{ VALUES ?o {{ {values('Q%d' % i for i in part)} }}
          OPTIONAL {{ ?o rdfs:label ?f . FILTER(LANG(?f) = "fr") }} OPTIONAL {{ ?o rdfs:label ?e . FILTER(LANG(?e) = "en") }}
          OPTIONAL {{ ?o wdt:P2521 ?ff . FILTER(LANG(?ff) = "fr") }} }} GROUP BY ?o'''
        for r in w.ask(q, f'occ{n:04d}') or []:
            out[qnum(r['o'])] = r.get('fr') or r.get('en') or ''
    return out


# ───────────────────────── écriture ─────────────────────────

def links_flag(r):
    return (1 if r.get('frw') else 0) | (2 if r.get('enw') else 0)


def write_gz(name, obj):
    os.makedirs(os.path.dirname(os.path.join(OUT, name)), exist_ok=True)
    data = json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    with open(os.path.join(OUT, name), 'wb') as f:
        f.write(gzip.compress(data, 9, mtime=0))
    return os.path.getsize(os.path.join(OUT, name))


META = {'source': 'Wikidata', 'url': 'https://www.wikidata.org', 'licence': 'CC0 1.0',
        'licence_url': 'https://creativecommons.org/publicdomain/zero/1.0/',
        'credit': 'Données : Wikidata (CC0 1.0, domaine public), extraites avec le service de requêtes query.wikidata.org.'}


def step_write(people, det, places, pnames, occ, events, oldrows, songs, built, min_franco=SL_FRANCO, min_other=SL_OTHER):
    sizes = {}
    if os.path.isdir(OUT):  # on repart de zéro : pas de vieux carreaux oubliés
        import shutil
        shutil.rmtree(OUT)
    # les lieux (coordonnées + nom), pour les personnes
    place = {}
    for q, r in places.items():
        pt = point(r.get('co'))
        if pt:
            place[q] = (pt[0], pt[1], r.get('fr') or r.get('en') or '')
    tiles = collections.defaultdict(lambda: {'p': [], 'pl': {}})
    by_surname = collections.defaultdict(list)
    by_day = collections.defaultdict(list)
    kept = 0
    occ_used = set()
    for p, (sl, bpl, franco) in people.items():
        if sl < (min_franco if franco else min_other):
            continue
        r = det.get(p)
        if not r or bpl not in place:
            continue
        lat, lon, plabel = place[bpl]
        if not in_scope(lat, lon):
            continue
        name = r.get('fr') or r.get('en') or ''
        birth = wdate(r.get('b'), r.get('bp'))
        if not name or not birth or re.fullmatch(r'Q\d+', name):
            continue
        death = wdate(r.get('d'), r.get('dp'))
        dpl = qnum(r.get('dpl'))
        o = qnum(r.get('occ'))
        if o:
            occ_used.add(o)
        fl = links_flag(r)
        t = tiles[tile_key(lat, lon)]
        t['p'].append([p, name, birth, death, bpl, dpl if dpl in place else 0, o, fl, sl])
        t['pl'][bpl] = place[bpl]
        if dpl in place:
            t['pl'][dpl] = place[dpl]
        kept += 1
        fam = fold(r.get('fam') or '')
        if fam and len(fam) >= 2:
            by_surname[fam].append([p, name, birth, death, plabel, fl, sl])
        if len(birth) == 10:
            by_day[birth[5:7]].append([p, name, birth, plabel, bpl, fl, sl])
    for k, t in tiles.items():
        t['p'].sort(key=lambda x: -x[8])
        sizes[f'people/{k}.json.gz'] = write_gz(f'people/{k}.json.gz', {'v': 1, 'tile': k, 'p': t['p'], 'pl': {str(q): v for q, v in t['pl'].items()}})
    sizes['people-index.json.gz'] = write_gz('people-index.json.gz', {'v': 1, 'size': TILE, 'built': built, **META,
        'cols': ['qid', 'nom', 'naissance', 'décès', 'lieu de naissance', 'lieu de décès', 'métier', 'liens (1 fr, 2 en)', 'sitelinks'],
        'tiles': {k: len(t['p']) for k, t in tiles.items()}, 'count': kept, 'sitelinks_min': {'langue française': min_franco, 'autres': min_other}})
    sizes['occupations.json.gz'] = write_gz('occupations.json.gz', {'v': 1, 'o': {str(q): occ.get(q, '') for q in sorted(occ_used) if occ.get(q)}})
    sur = {}
    for k, rows in by_surname.items():
        rows.sort(key=lambda x: -x[6])
        sur[k] = rows[:30]
    sizes['surnames.json.gz'] = write_gz('surnames.json.gz', {'v': 1, **META, 'cols': ['qid', 'nom', 'naissance', 'décès', 'lieu de naissance', 'liens', 'sitelinks'], 's': sur})
    for mm, rows in by_day.items():
        d = collections.defaultdict(list)
        for x in rows:
            d[x[2][5:10]].append(x)
        for k in d:
            d[k].sort(key=lambda x: -x[6])
        sizes[f'days/{mm}.json.gz'] = write_gz(f'days/{mm}.json.gz', {'v': 1, 'cols': ['qid', 'nom', 'naissance', 'lieu de naissance', 'qid du lieu', 'liens', 'sitelinks'], 'd': d})
    log(f'Personnes écrites : {kept} dans {len(tiles)} carreaux')

    # les événements
    etiles = collections.defaultdict(list)
    counts = collections.Counter()
    for r in events:
        pt = point(r.get('co'))
        if not pt or not in_scope(*pt):
            continue
        d = wdate(r.get('d'), r.get('dp'))
        lab = r.get('fr') or r.get('en') or ''
        if not d or not lab or re.fullmatch(r'Q\d+', lab):
            continue
        end = wdate(r.get('end'), 9) if r.get('end') else ''
        etiles[tile_key(*pt)].append([qnum(r['e']), lab, r['kind'], d, end, pt[0], pt[1], links_flag(r), int(r.get('sl') or 0)])
        counts[r['kind']] += 1
    for k, rows in etiles.items():
        rows.sort(key=lambda x: x[3])
        sizes[f'events/{k}.json.gz'] = write_gz(f'events/{k}.json.gz', {'v': 1, 'tile': k, 'e': rows})
    sizes['events-index.json.gz'] = write_gz('events-index.json.gz', {'v': 1, 'size': TILE, 'built': built, **META,
        'cols': ['qid', 'nom', 'sorte', 'date', 'fin', 'lat', 'lon', 'liens', 'sitelinks'], 'tiles': {k: len(v) for k, v in etiles.items()}, 'kinds': dict(counts)})
    log(f'Événements écrits : {sum(counts.values())} {dict(counts)}')

    # les anciens noms : d'abord les communes et villes (step oldnames), puis les lieux des personnes
    old = collections.defaultdict(list)
    seen = set()

    def add(plq, name, kind, s, e, lab, pt):
        if not name or not plq or not pt:
            return
        k = fold(name)
        if not k or k == fold(lab) or len(k) < 3:
            return
        key = (k, plq, kind, s, e)
        if key in seen:
            return
        seen.add(key)
        old[k].append([plq, lab, name, kind, s, e, pt[0], pt[1]])

    for r in oldrows:
        pt = point(r.get('co'))
        if pt and in_scope(*pt):
            add(qnum(r['pl']), r.get('name'), 'o', wdate(r.get('s'), 9) if r.get('s') else '', wdate(r.get('e'), 9) if r.get('e') else '', r.get('fr') or r.get('en') or '', pt)
    for q, rows in pnames.items():
        pr = places.get(q) or {}
        pt = point(pr.get('co'))
        if not pt or not in_scope(*pt):
            continue
        lab = pr.get('fr') or pr.get('en') or ''
        for r in rows:
            k = r.get('k')
            s = wdate(r.get('s'), 9) if r.get('s') else ''
            e = wdate(r.get('e'), 9) if r.get('e') else ''
            if k == 'o' and not (s or e):
                continue  # nom officiel actuel, sans date : pas un « ancien nom »
            add(q, r.get('name'), k, s, e, lab, pt)
    sizes['oldnames.json.gz'] = write_gz('oldnames.json.gz', {'v': 1, 'built': built, **META,
        'cols': ['qid', 'nom actuel', 'ancien nom', 'sorte (o officiel, n surnom, s nom court)', 'depuis', "jusqu'à", 'lat', 'lon'], 'n': old})
    log(f'Anciens noms : {sum(len(v) for v in old.values())} ({len(old)} noms différents)')

    # les chansons : par année, d'abord celles de langue française / pays francophones, puis le monde
    FR_C = {'Q142', 'Q31', 'Q39', 'Q32', 'Q16', 'Q235'}
    years = collections.defaultdict(list)
    for r in songs:
        m = re.match(r'^(\d{4})-', r.get('d') or '')
        if not m:
            continue
        y = int(m.group(1))
        if y < 1850 or y > 2030:
            continue
        cs, langs = set((r.get('cs') or '').split(',')), set((r.get('langs') or '').split(','))
        fr = FRENCH in langs or bool(cs & FR_C)
        title = r.get('fr') or r.get('en') or r.get('mul') or ''
        perf = r.get('pfr') or r.get('pen') or ''
        if not title or not perf or re.fullmatch(r'Q\d+', title):
            continue
        years[y].append([qnum(r['s']), title, perf, 1 if fr else 0, links_flag(r), int(r.get('sl') or 0)])
    sy = {}
    for y, rows in years.items():
        rows.sort(key=lambda x: (-x[3], -x[5]))
        frs = [x for x in rows if x[3]][:5]
        wor = sorted([x for x in rows if not x[3]], key=lambda x: -x[5])[:3]
        sy[str(y)] = frs + wor
    sizes['songs.json.gz'] = write_gz('songs.json.gz', {'v': 1, 'built': built, **META,
        'cols': ['qid', 'titre', 'interprète', 'langue française ou pays francophone', 'liens', 'sitelinks'], 'y': sy})
    log(f'Chansons : {sum(len(v) for v in sy.values())} sur {len(sy)} années')
    return sizes


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--cache', default=os.path.join(os.getcwd(), 'wikidata-sortie', 'cache'))
    ap.add_argument('--test', action='store_true', help='Belgique et Luxembourg seulement')
    ap.add_argument('--max-mo', type=float, default=15, help='taille totale permise (Mo), 15 par défaut')
    ap.add_argument('--max-personnes', type=int, default=150000, help='combien de personnes au plus (150 000 par défaut)')
    ap.add_argument('--hors-ligne', action='store_true', help='ne lit que le cache (aucune question au service)')
    a = ap.parse_args()
    global OUT
    if a.test:
        OUT = os.path.join(ROOT, 'wikidata-sortie', 'test')
    w = Wdqs(a.cache, a.hors_ligne)
    built = time.strftime('%Y-%m-%d')
    countries = {'Q31': 1, 'Q32': 1} if a.test else step_countries(w)
    people = step_people(w, countries)
    # d'abord les lieux de naissance : on ne garde que les personnes nées dans la zone (Europe, Amériques, Afrique
    # francophone), puis les plus connues jusqu'à --max-personnes (langue française d'abord) — avant les détails, qui coûtent cher
    places, pnames = step_places(w, set(v[1] for v in people.values()), 'pl')
    def scoped(v):
        pt = point((places.get(v[1]) or {}).get('co'))
        return bool(pt and in_scope(*pt))
    keep = sorted((p for p, v in people.items() if scoped(v)), key=lambda p: (-people[p][2], -people[p][0]))
    franco = [p for p in keep if people[p][2]]
    others = [p for p in keep if not people[p][2]][:max(0, a.max_personnes - len(franco))]
    people = {p: people[p] for p in franco + others}
    log(f'Personnes nées dans la zone, retenues : {len(people)} ({len(franco)} de langue française)'
        + (f', autres : au moins {people[others[-1]][0]} pages Wikipédia' if others else ''))
    det = step_details(w, people)
    more = set(qnum(r.get('dpl')) for r in det.values()) - set(places) - {0}
    p2, n2 = step_places(w, more, 'pld')
    places.update(p2)
    pnames.update(n2)
    step_mul_labels(w, det, 'p', 'mulp')
    step_mul_labels(w, places, 'pl', 'mulpl')
    occ = step_occupations(w, set(qnum(r.get('occ')) for r in det.values()) - {0})
    events = [] if a.test else step_events(w)
    oldrows = [] if a.test else step_oldnames(w)
    songs = step_songs(w)
    mf, mo = SL_FRANCO, SL_OTHER
    while True:
        sizes = step_write(people, det, places, pnames, occ, events, oldrows, songs, built, mf, mo)
        total = sum(sizes.values())
        if total <= a.max_mo * 1e6 or mo > 60:
            break
        log(f'Trop gros ({total / 1e6:.1f} Mo > {a.max_mo} Mo) : on garde moins de personnes')
        mo += 2
        if mo % 4 == 0:
            mf += 1
    log(f'Seuils retenus : au moins {mf} pages Wikipédia (langue française), {mo} (autres)')
    log(f'Questions posées au service : {w.asked}')
    log(f'Fichiers : {len(sizes)} — total {total / 1e6:.1f} Mo dans {OUT}')
    for k in ['people-index.json.gz', 'occupations.json.gz', 'surnames.json.gz', 'events-index.json.gz', 'oldnames.json.gz', 'songs.json.gz']:
        if k in sizes:
            log(f'  {k} : {sizes[k] / 1e3:.0f} Ko')
    for pfx in ('people/', 'events/', 'days/'):
        s = [v for k, v in sizes.items() if k.startswith(pfx)]
        log(f'  {pfx} : {len(s)} fichiers, {sum(s) / 1e6:.1f} Mo (le plus gros {max(s or [0]) / 1e3:.0f} Ko)')


if __name__ == '__main__':
    main()
