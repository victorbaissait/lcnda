#!/usr/bin/env python3
"""LCNDA — 🏡 Pays et mémoire : fabrique les données livrées avec l'app (assets/data/pm-*.json[.gz]).

    PM_WORK=/tmp/pm-work python3 -I scripts/pays-memoire/build-data.py all          # tout (≈ 15 min : Wikidata est bridé à 1 requête/min)
    PM_WORK=/tmp/pm-work python3 -I scripts/pays-memoire/build-data.py monuments    # une seule partie
    parties : musique parlers fontaines monuments faune doleances ecoles

Les réponses brutes sont gardées dans PM_WORK (relancer ne retélécharge rien). Rien n'est inventé : chaque ligne vient d'une source
téléchargée, avec son lien.

Sources (vérifiées le 25/11/2026, redistribution permise) :
  · Wikidata (CC0 1.0) — danses (Q107357104 « type de danse »), instruments (Q110295396), genres et chants régionaux, éléments de
    l'Inventaire du patrimoine culturel immatériel en France (P3259 = Q117197442) ; fontaines à dévotion (Q1371047), sources et
    fontaines « Saint-… », lieux de pèlerinage (Q15135589, Q840482) et le saint à qui elles sont dédiées (P825) ; monuments aux
    morts de France (Q575759, P131 → code INSEE P374, image P18, date P571, sculpteur P170, identifiant de la base de
    l'Université de Lille P6238) ; anciens élèves (P69) de l'École polytechnique, de l'ENS et de Saint-Cyr, avec année de
    naissance (P569).
  · Wikimedia Commons — les sons et vidéos cités par Wikidata (P51, P10) : licence lue fichier par fichier (API imageinfo).
  · Atlas sonore des langues régionales de France (CNRS-LISN, P. Boula de Mareüil et al.), atlas.lisn.upsaclay.fr — CC BY-NC-SA 4.0 :
    on ne garde QUE le nom du point, sa position et le nom du fichier son (l'app fait écouter le son depuis le site de l'Atlas,
    elle ne le copie pas ; les textes ne sont pas recopiés).
  · GBIF — « Répartition historique du loup en France métropolitaine » (INPN, UAR PatriNat OFB-MNHN-CNRS-IRD, 2020,
    doi:10.15468/dosqyf, CC BY 4.0) et les autres jeux GBIF (CC0 / CC BY) pour l'ours, le castor, le lynx avant 1971.
  · data.gouv.fr — « Principaux corpus d'archives numérisés et mis en ligne par les archives départementales » (Licence Ouverte 2.0) :
    les départements dont les cahiers de doléances sont en ligne, et l'adresse du site des Archives.
  · Wikisource — transcriptions de cahiers de doléances (CC BY-SA ; texte de 1789 du domaine public) : seulement le titre et le lien.
Communes (code INSEE → nom, position) : assets/data/cc-communes.json.gz (déjà dans l'app, Licence Ouverte) ; départements :
assets/data/geo/fr-departements.json.
"""
import csv
import gzip
import io
import json
import math
import os
import re
import sys
import unicodedata
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pm_common as C  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.environ.get('PM_OUT') or os.path.join(ROOT, 'assets', 'data')
BUILT = os.environ.get('PM_BUILT') or '2026-11-25'
Q = lambda u: u.rsplit('/', 1)[-1]


def fold(s):
    s = unicodedata.normalize('NFD', str(s or '').lower())
    return re.sub(r'[^a-z0-9]+', ' ', ''.join(c for c in s if unicodedata.category(c) != 'Mn')).strip()


def load_communes():
    with gzip.open(os.path.join(ROOT, 'assets', 'data', 'cc-communes.json.gz')) as f:
        return json.load(f)['c']


def load_deps():
    d = json.load(open(os.path.join(ROOT, 'assets', 'data', 'geo', 'fr-departements.json'), encoding='utf-8'))
    geoms = list(d['topo']['objects'].values())[0]['geometries']
    return {g['properties']['i']: {'n': g['properties']['n'], 'lon': g['properties']['l'][0], 'lat': g['properties']['l'][1]} for g in geoms}


def dep_of(insee):
    m = re.match(r'^(97\d|2[AB]|\d{2})', str(insee or '').upper())
    return m.group(1) if m else ''


class Near:
    """la commune la plus proche d'un point (grille de 0,1°)"""
    def __init__(self, communes):
        self.g = {}
        for code, (n, lat, lon) in communes.items():
            self.g.setdefault((int(lat * 10), int(lon * 10)), []).append((lat, lon, code))

    def __call__(self, lat, lon, km=15):
        best = None
        for i in range(-2, 3):
            for j in range(-2, 3):
                for (a, b, code) in self.g.get((int(lat * 10) + i, int(lon * 10) + j), []):
                    d = km_between(lat, lon, a, b)
                    if best is None or d < best[0]:
                        best = (d, code)
        return best[1] if best and best[0] <= km else ''


def km_between(a, b, c, d):
    r = math.pi / 180
    x = (d - b) * r * math.cos((a + c) / 2 * r)
    y = (c - a) * r
    return 6371 * math.sqrt(x * x + y * y)


def point(v):
    m = re.match(r'Point\(([-\d.eE]+) ([-\d.eE]+)\)', v or '')
    return (round(float(m.group(2)), 5), round(float(m.group(1)), 5)) if m else None


def year(v):
    m = re.match(r'^(-?\d{1,4})-', v or '')
    return int(m.group(1)) if m else None


def val(b, k):
    return b[k]['value'] if k in b else ''


def report(name, path, raw, gz, n):
    print(f'{name}: {n} lignes → {os.path.relpath(path, ROOT)} ({raw / 1024:.0f} Ko brut, {gz / 1024:.0f} Ko compressé)')


def write_json(path, obj):
    raw = json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    open(path, 'wb').write(raw)
    return len(raw), len(raw)


def commons_licences(files):
    """licence et auteur de fichiers Commons (API imageinfo, lots de 40)"""
    out = {}
    files = sorted(set(f for f in files if f))
    for i in range(0, len(files), 40):
        titles = '|'.join('File:' + f for f in files[i:i + 40])
        u = 'https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode({'action': 'query', 'format': 'json', 'prop': 'imageinfo', 'iiprop': 'extmetadata|mediatype',
            'iiextmetadatafilter': 'LicenseShortName|Artist|DateTimeOriginal', 'titles': titles})
        d = C.fetch_json(u, min_gap=3)
        norm = {x['to']: x['from'] for x in d.get('query', {}).get('normalized', [])}
        for p in d.get('query', {}).get('pages', {}).values():
            ii = (p.get('imageinfo') or [{}])[0]
            m = ii.get('extmetadata', {})
            g = lambda k: re.sub(r'<[^>]+>', '', m.get(k, {}).get('value', '')).strip()[:120]
            t = norm.get(p['title'], p['title'])[5:]
            out[t.replace(' ', '_')] = out[t] = {'lic': g('LicenseShortName'), 'by': g('Artist'), 'date': g('DateTimeOriginal')[:40], 'type': ii.get('mediatype', '')}
    return out


# ═════════════ 💃 musique et danses ═════════════
MUSIC_Q = '''SELECT ?d ?dl ?k ?o ?ol ?img ?audio ?video ?wp ?pci WHERE {
  VALUES ?k { wd:Q107357104 wd:Q110295396 wd:Q188451 wd:Q943929 wd:Q27939 }
  ?d wdt:P31 ?k .
  ?d wdt:P495|wdt:P2341|wdt:P276|wdt:P131|wdt:P17 ?o .
  { ?o wdt:P17 wd:Q142 } UNION { VALUES ?o { wd:Q142 } }
  ?d rdfs:label ?dl FILTER(LANG(?dl) = "fr")
  OPTIONAL { ?o rdfs:label ?ol FILTER(LANG(?ol) = "fr") }
  OPTIONAL { ?d wdt:P18 ?img } OPTIONAL { ?d wdt:P51 ?audio } OPTIONAL { ?d wdt:P10 ?video }
  OPTIONAL { ?wp schema:about ?d ; schema:isPartOf <https://fr.wikipedia.org/> }
  OPTIONAL { ?d wdt:P3259 ?pci }
}'''
PCI_Q = '''SELECT ?d ?dl ?k ?o ?ol ?img ?audio ?video ?wp WHERE {
  ?d wdt:P3259 wd:Q117197442 . OPTIONAL { ?d wdt:P31 ?k }
  OPTIONAL { ?d wdt:P2341|wdt:P276|wdt:P131 ?o . OPTIONAL { ?o rdfs:label ?ol FILTER(LANG(?ol) = "fr") } }
  ?d rdfs:label ?dl FILTER(LANG(?dl) = "fr")
  OPTIONAL { ?d wdt:P18 ?img } OPTIONAL { ?d wdt:P51 ?audio } OPTIONAL { ?d wdt:P10 ?video }
  OPTIONAL { ?wp schema:about ?d ; schema:isPartOf <https://fr.wikipedia.org/> }
}'''
# les lieux cités → départements (le lieu lui-même, ses parents, ses enfants), code INSEE, position
PLACE_Q = '''SELECT ?o ?dep ?insee ?coord WHERE { VALUES ?o { %s }
  OPTIONAL { ?o wdt:P374 ?insee } OPTIONAL { ?o wdt:P625 ?coord }
  OPTIONAL { { ?o wdt:P2586 ?dep } UNION { ?o wdt:P131+ ?x . ?x wdt:P2586 ?dep } UNION { ?y wdt:P131 ?o ; wdt:P2586 ?dep } UNION { ?y wdt:P131/wdt:P131 ?o ; wdt:P2586 ?dep } UNION { ?o wdt:P150 ?z . ?z wdt:P2586 ?dep } }
}'''
KIND = {'Q107357104': 'danse', 'Q110295396': 'instrument', 'Q188451': 'musique', 'Q943929': 'chant', 'Q27939': 'chant'}
PCI_MUSIC = {'Q107357104', 'Q110295396', 'Q188451', 'Q27939', 'Q943929', 'Q42889517', 'Q11264216', 'Q868557', 'Q73012175'}


def resolve_places(qids, communes, near):
    """{QID: [codes de département]} pour les lieux cités"""
    out = {}
    qids = sorted(q for q in qids if q and q != 'Q142')
    for i in range(0, len(qids), 150):
        for b in C.sparql(PLACE_Q % ' '.join('wd:' + q for q in qids[i:i + 150])):
            o = Q(val(b, 'o'))
            s = out.setdefault(o, set())
            if val(b, 'dep'):
                s.add(val(b, 'dep').upper().zfill(2) if val(b, 'dep').isdigit() else val(b, 'dep').upper())
            if val(b, 'insee'):
                s.add(dep_of(val(b, 'insee')))
            if not s and val(b, 'coord'):
                p = point(val(b, 'coord'))
                if p:
                    c = near(p[0], p[1], km=30)
                    if c:
                        s.add(dep_of(c))
    return {k: sorted(x for x in v if x) for k, v in out.items()}


def build_musique():
    communes = load_communes()
    near = Near(communes)
    rows = {}
    for is_pci, b in [(False, x) for x in C.sparql(MUSIC_Q)] + [(True, x) for x in C.sparql(PCI_Q)]:
        q = Q(val(b, 'd'))
        k = Q(val(b, 'k')) if val(b, 'k') else ''
        r = rows.setdefault(q, {'q': q, 'n': val(b, 'dl'), 'k': set(), 'o': {}, 'img': '', 'audio': set(), 'video': set(), 'wp': '', 'pci': False})
        if k:
            r['k'].add(k)
        if is_pci or val(b, 'pci').endswith('Q117197442'):
            r['pci'] = True
        if val(b, 'o'):
            r['o'][Q(val(b, 'o'))] = val(b, 'ol')
        if val(b, 'img') and not r['img']:
            r['img'] = urllib.parse.unquote(val(b, 'img').rsplit('/', 1)[-1])
        if val(b, 'audio'):
            r['audio'].add(urllib.parse.unquote(val(b, 'audio').rsplit('/', 1)[-1]))
        if val(b, 'video'):
            r['video'].add(urllib.parse.unquote(val(b, 'video').rsplit('/', 1)[-1]))
        if val(b, 'wp'):
            r['wp'] = urllib.parse.unquote(val(b, 'wp').rsplit('/wiki/', 1)[-1])
    # les éléments de l'Inventaire du PCI : seulement la musique, la danse, le chant
    keep = []
    for r in rows.values():
        kinds = r['k']
        music = kinds & {'Q107357104', 'Q110295396', 'Q943929', 'Q27939'}
        regional = {o: l for o, l in r['o'].items() if o != 'Q142'}
        if r['pci'] and not (kinds & PCI_MUSIC):
            continue
        if not music and not regional:
            continue  # un genre musical « France » tout court : trop vague
        if kinds == {'Q188451'} and not regional:
            continue
        keep.append(r)
    deps = resolve_places({o for r in keep for o in r['o']}, communes, near)
    files = [f for r in keep for f in list(r['audio']) + list(r['video'])]
    lic = commons_licences(files) if files else {}
    out = []
    for r in sorted(keep, key=lambda x: fold(x['n'])):
        regional = {o: l for o, l in r['o'].items() if o != 'Q142' and l}
        dd = sorted({d for o in regional for d in deps.get(o, [])})
        kind = next((KIND[k] for k in ('Q107357104', 'Q110295396', 'Q943929', 'Q27939', 'Q188451') if k in r['k']), 'tradition')
        media = []
        for f in sorted(r['audio']):
            L = lic.get(f) or lic.get(f.replace('_', ' ')) or {}
            media.append({'f': f, 't': 'audio', 'lic': L.get('lic', ''), 'by': L.get('by', '')})
        for f in sorted(r['video']):
            L = lic.get(f) or lic.get(f.replace('_', ' ')) or {}
            media.append({'f': f, 't': 'video', 'lic': L.get('lic', ''), 'by': L.get('by', '')})
        out.append({'q': r['q'], 'n': r['n'], 'k': kind, 'pci': bool(r['pci']), 'regions': sorted(set(regional.values())), 'deps': dd,
                    'img': r['img'], 'media': [m for m in media if m['lic']], 'wp': r['wp']})
    data = {'v': 1, 'built': BUILT, 'attr': 'Wikidata (CC0 1.0) ; sons et vidéos : Wikimedia Commons (licence de chaque fichier)', 'licence': 'CC0 1.0',
            'url': 'https://www.wikidata.org/', 'rows': out}
    path = os.path.join(OUT, 'pm-musique.json')
    raw, gz = write_json(path, data)
    report('musique', path, raw, gz, len(out))


# ═════════════ 🎙️ l'Atlas sonore ═════════════
def build_parlers():
    raw = C.fetch_json('https://atlas.lisn.upsaclay.fr/atlas.json', min_gap=2)
    seen, out = set(), []
    for r in raw['tabres']:
        try:
            lat, lon = float(r['lat']), float(r['lon'])
        except (TypeError, ValueError):
            continue
        snd = str(r.get('soundfile') or '').strip()
        name = re.sub(r'\s+', ' ', str(r.get('name') or '')).strip()
        if not snd or not snd.startswith('sounds/') or not name or name.startswith('___'):
            continue
        if not (41.0 < lat < 51.6 and -5.6 < lon < 10.0):
            continue  # la France d'Europe et ses voisins (Belgique, Suisse, Luxembourg, Val d'Aoste, Catalogne)
        if snd in seen:
            continue
        seen.add(snd)
        nm = re.sub(r'\d+$', '', name).strip()
        out.append([nm, round(lat, 4), round(lon, 4), snd[7:], str(r.get('country') or '').strip()])
    out.sort(key=lambda x: fold(x[0]))
    data = {'v': 1, 'built': BUILT, 'attr': 'Atlas sonore des langues régionales de France — Philippe Boula de Mareüil, Albert Rilliard, Frédéric Vernier (CNRS, LISN, Université Paris-Saclay)',
            'licence': 'CC BY-NC-SA 4.0', 'licence_url': 'https://creativecommons.org/licenses/by-nc-sa/4.0/', 'url': 'https://atlas.lisn.upsaclay.fr/', 'sound_base': 'https://atlas.lisn.upsaclay.fr/sounds/',
            'note': 'Seuls le nom du point, sa position et le nom du fichier son sont gardés ; le son est écouté sur le site de l’Atlas.',
            'fields': ['nom', 'lat', 'lon', 'son', 'groupe'], 'rows': out}
    path = os.path.join(OUT, 'pm-parlers.json')
    raw_n, gz = write_json(path, data)
    report('parlers', path, raw_n, gz, len(out))


# ═════════════ ⛲ fontaines et saints ═════════════
FONT_Q = '''SELECT ?f ?fl ?k ?coord ?insee ?saint ?sl ?dom ?doml ?img ?wp WHERE {
  { ?f wdt:P31/wdt:P279* wd:Q1371047 } UNION { ?f wdt:P31 wd:Q121746926 } UNION { VALUES ?pk { wd:Q15135589 wd:Q840482 } ?f wdt:P31 ?pk }
  UNION { VALUES ?fk { wd:Q483453 wd:Q124714 wd:Q1131896 } ?f wdt:P31 ?fk ; wdt:P17 wd:Q142 ; rdfs:label ?x FILTER(LANG(?x)="fr" && REGEX(?x, "^(([Ff]ontaine|[Ss]ource|[Pp]uits|[Bb]onne [Ff]ontaine)( de la| du| de| des| d’| d')? ?)?(Saint|Sainte|Notre-Dame|St-|Ste-)")) }
  ?f wdt:P17 wd:Q142 .
  OPTIONAL { ?f wdt:P31 ?k }
  ?f rdfs:label ?fl FILTER(LANG(?fl) = "fr")
  OPTIONAL { ?f wdt:P625 ?coord } OPTIONAL { ?f wdt:P131 ?c . ?c wdt:P374 ?insee }
  OPTIONAL { ?f wdt:P825 ?saint . ?saint rdfs:label ?sl FILTER(LANG(?sl) = "fr") OPTIONAL { ?saint wdt:P2925 ?dom . ?dom rdfs:label ?doml FILTER(LANG(?doml) = "fr") } }
  OPTIONAL { ?f wdt:P18 ?img }
  OPTIONAL { ?wp schema:about ?f ; schema:isPartOf <https://fr.wikipedia.org/> }
}'''


def build_fontaines():
    communes = load_communes()
    near = Near(communes)
    rows = {}
    for b in C.sparql(FONT_Q):
        q = Q(val(b, 'f'))
        r = rows.setdefault(q, {'q': q, 'n': val(b, 'fl'), 'k': set(), 'pos': None, 'insee': '', 'saint': '', 'sq': '', 'dom': set(), 'img': '', 'wp': ''})
        if val(b, 'k'):
            r['k'].add(Q(val(b, 'k')))
        if val(b, 'coord') and not r['pos']:
            r['pos'] = point(val(b, 'coord'))
        if val(b, 'insee') and not r['insee']:
            r['insee'] = val(b, 'insee')
        if val(b, 'saint') and not r['saint']:
            r['saint'], r['sq'] = val(b, 'sl'), Q(val(b, 'saint'))
        if val(b, 'doml'):
            r['dom'].add(val(b, 'doml'))
        if val(b, 'img') and not r['img']:
            r['img'] = urllib.parse.unquote(val(b, 'img').rsplit('/', 1)[-1])
        if val(b, 'wp'):
            r['wp'] = urllib.parse.unquote(val(b, 'wp').rsplit('/wiki/', 1)[-1])
    out = []
    for r in rows.values():
        if not r['insee'] and r['pos']:
            r['insee'] = near(*r['pos'], km=8)
        if not r['pos'] and r['insee'] in communes:
            r['pos'] = (communes[r['insee']][1], communes[r['insee']][2])
        if not r['pos'] and not r['insee']:
            continue
        kind = 'pelerinage' if r['k'] & {'Q15135589', 'Q840482'} else 'fontaine'
        devotion = bool(r['k'] & {'Q1371047', 'Q121746926'}) or kind == 'pelerinage'
        cn = fold(communes.get(r['insee'], [''])[0])
        rest = fold(re.sub(r'^(fontaine|source|puits|bonne fontaine)( de la| du| des| de| d’| d\')?\s*', '', r['n'], flags=re.I))
        if not devotion and not r['saint'] and (re.match(r'^(fontaine|source|puits) (de|du|des|d’|d\')\b', r['n'], re.I) or (cn and rest.startswith(cn))):
            continue  # « fontaine de Saint-Bonnet-le-Château » : la fontaine de la commune, pas celle d'un saint
        if not r['saint']:  # le saint écrit dans le nom (« Fontaine Saint-Clair ») : on le dit comme tel
            m = re.search(r'(Notre-Dame(?:[- ](?:de |des |du |de la )?[A-ZÉÈ][\w’\'-]+)?|(?:Saint|Sainte)[- ][A-ZÉÈ][\w’\'-]+)', r['n'])
            name_saint = m.group(0).replace('Saint ', 'Saint-').replace('Sainte ', 'Sainte-') if m else ''
        else:
            name_saint = ''
        out.append({'q': r['q'], 'n': r['n'], 'kind': kind, 'insee': r['insee'], 'lat': r['pos'][0] if r['pos'] else None, 'lon': r['pos'][1] if r['pos'] else None,
                    'saint': r['saint'], 'sq': r['sq'], 'in_name': name_saint, 'dom': sorted(r['dom']), 'img': r['img'], 'wp': r['wp']})
    out.sort(key=lambda x: (x['insee'], fold(x['n'])))
    data = {'v': 1, 'built': BUILT, 'attr': 'Wikidata (CC0 1.0)', 'licence': 'CC0 1.0', 'url': 'https://www.wikidata.org/wiki/Q1371047', 'rows': out}
    path = os.path.join(OUT, 'pm-fontaines.json.gz')
    raw, gz = C.write_gz(path, data)
    report('fontaines', path, raw, gz, len(out))


# ═════════════ 🪦 monuments aux morts ═════════════
MON_Q = '''SELECT ?m ?insee ?coord ?img ?inc ?cr ?lille WHERE { ?m wdt:P31 wd:Q575759 ; wdt:P17 wd:Q142 ; wdt:P131 ?c . ?c wdt:P374 ?insee .
  OPTIONAL{?m wdt:P625 ?coord} OPTIONAL{?m wdt:P18 ?img} OPTIONAL{?m wdt:P571 ?inc} OPTIONAL{?m wdt:P170 ?cr} OPTIONAL{?m wdt:P6238 ?lille} }'''
MON_L = '''SELECT ?m ?l WHERE { ?m wdt:P31 wd:Q575759 ; wdt:P17 wd:Q142 ; rdfs:label ?l FILTER(LANG(?l) = "fr") }'''
MON_C = '''SELECT DISTINCT ?cr ?l WHERE { ?m wdt:P31 wd:Q575759 ; wdt:P17 wd:Q142 ; wdt:P170 ?cr . ?cr rdfs:label ?l FILTER(LANG(?l) = "fr") }'''


def build_monuments():
    communes = load_communes()
    rows = {}
    for b in C.sparql(MON_Q):
        q = Q(val(b, 'm'))
        r = rows.setdefault(q, {'insee': val(b, 'insee'), 'pos': None, 'img': '', 'y': None, 'cr': set(), 'lille': ''})
        if val(b, 'coord') and not r['pos']:
            r['pos'] = point(val(b, 'coord'))
        if val(b, 'img') and not r['img']:
            r['img'] = urllib.parse.unquote(val(b, 'img').rsplit('/', 1)[-1])
        y = year(val(b, 'inc'))
        if y and (r['y'] is None or y < r['y']):
            r['y'] = y
        if val(b, 'cr'):
            r['cr'].add(Q(val(b, 'cr')))
        if val(b, 'lille'):
            r['lille'] = val(b, 'lille')
    labels = {Q(val(b, 'm')): val(b, 'l') for b in C.sparql(MON_L)}
    crl = {Q(val(b, 'cr')): val(b, 'l') for b in C.sparql(MON_C)}
    fmt = C.wd_entities(['P6238'], props='claims').get('P6238', {})
    lille_url = (C.claims(fmt, 'P1630') or [''])[0]
    cr_list = sorted({c for r in rows.values() for c in r['cr'] if c in crl})
    cr_idx = {c: i for i, c in enumerate(cr_list)}
    out = []
    for q, r in rows.items():
        name = labels.get(q, '')
        ci = communes.get(r['insee'])
        if not ci and not r['pos']:
            continue
        pos = r['pos'] or (round(ci[1], 4), round(ci[2], 4))
        # le nom : on enlève « monument aux morts de <commune> », qui se répète (l'app le refait)
        nm = name
        if ci and fold(name) in (fold('monument aux morts de ' + ci[0]), fold('monument aux morts d ' + ci[0]), fold('monument aux morts du ' + ci[0]), fold('monument aux morts')):
            nm = ''
        out.append([q[1:], r['insee'], round(pos[0], 5), round(pos[1], 5), nm, r['img'], r['y'] or 0, [cr_idx[c] for c in sorted(r['cr']) if c in cr_idx], r['lille'], 0 if r['pos'] else 1])
    out.sort(key=lambda x: (x[1], int(x[0])))
    data = {'v': 1, 'built': BUILT, 'attr': 'Wikidata (CC0 1.0) ; photos : Wikimedia Commons ; identifiant : base « Monuments aux morts » de l’Université de Lille (P6238)',
            'licence': 'CC0 1.0', 'url': 'https://www.wikidata.org/wiki/Q575759', 'lille_url': lille_url,
            'fields': ['qid sans Q', 'insee', 'lat', 'lon', 'nom (vide = monument aux morts de la commune)', 'image Commons', 'année (P571, 0 = inconnue)', 'sculpteurs (index)', 'id Lille', 'position = centre de la commune'],
            'creators': [[c, crl[c]] for c in cr_list], 'rows': out}
    path = os.path.join(OUT, 'pm-monuments.json.gz')
    raw, gz = C.write_gz(path, data)
    report('monuments', path, raw, gz, len(out))


# ═════════════ 🐺 loups et bêtes sauvages (GBIF) ═════════════
# le loup : seulement l'inventaire historique de l'INPN (les autres jeux mêlent des observations récentes, après le retour du loup)
WOLF_DS = '50de8011-5291-4689-ae08-f35d2d2c17e2'
SPECIES = [('loup', 5219173, 'Canis lupus', 1600, 1985), ('ours', 2433433, 'Ursus arctos', 1600, 1970), ('castor', 4409131, 'Castor fiber', 1600, 1970), ('lynx', 2435240, 'Lynx lynx', 1600, 1970)]


def build_faune():
    deps = load_deps()
    communes = load_communes()
    near = Near(communes)
    by_name = {fold(v['n']): k for k, v in deps.items()}
    by_name.update({fold('Seine-et-Oise'): '78', fold('Seine'): '75', fold('Seine-Inférieure'): '76', fold('Loire-Inférieure'): '44', fold('Basses-Pyrénées'): '64', fold('Basses-Alpes'): '04', fold('Côtes-du-Nord'): '22', fold('Charente-Inférieure'): '17'})
    agg, ds_count = {}, {}
    base = 'https://api.gbif.org/v1/occurrence/search?'
    for sp, key, sci, y0, y1 in SPECIES:
        # par facettes (léger) : les départements (GADM niveau 2), puis pour chacun les années et les jeux de données
        only = [('datasetKey', WOLF_DS)] if sp == 'loup' else []
        top = C.fetch_json(base + urllib.parse.urlencode([('country', 'FR'), ('taxonKey', key), ('year', f'{y0},{y1}'), ('limit', 0), ('facet', 'gadmLevel2Gid'), ('gadmLevel2Gid.facetLimit', 200)] + only), min_gap=0.5)
        for g in (top.get('facets') or [{}])[0].get('counts', []):
            d = C.fetch_json(base + urllib.parse.urlencode([('country', 'FR'), ('taxonKey', key), ('year', f'{y0},{y1}'), ('gadmLevel2Gid', g['name']), ('limit', 1),
                                                             ('facet', 'year'), ('facet', 'datasetKey'), ('year.facetLimit', 500), ('datasetKey.facetLimit', 50)] + only), min_gap=0.5)
            r0 = (d.get('results') or [{}])[0]
            nm = ((r0.get('gadm') or {}).get('level2') or {}).get('name') or r0.get('county') or ''
            code = by_name.get(fold(nm), '')
            if not code and r0.get('decimalLatitude') is not None:
                code = dep_of(near(r0['decimalLatitude'], r0['decimalLongitude'], km=20))
            if not code or code not in deps:
                print(f'  {sp}: {g["name"]} « {nm} » sans département', file=sys.stderr)
                continue
            fac = {f['field']: f['counts'] for f in d.get('facets', [])}
            years = {int(x['name']): x['count'] for x in fac.get('YEAR', [])}
            if not years:
                continue
            a = agg.setdefault((sp, code), {'first': min(years), 'last': max(years), 'n': 0, 'dec': {}, 'ds': {}})
            a['first'], a['last'] = min(a['first'], min(years)), max(a['last'], max(years))
            for y, n in years.items():
                a['n'] += n
                a['dec'][y // 10 * 10] = a['dec'].get(y // 10 * 10, 0) + n
            for x in fac.get('DATASET_KEY', []):
                a['ds'][x['name']] = a['ds'].get(x['name'], 0) + x['count']
                ds_count[x['name']] = ds_count.get(x['name'], 0) + x['count']
    datasets = []
    for k in sorted(ds_count, key=lambda x: -ds_count[x]):
        m = C.fetch_json('https://api.gbif.org/v1/dataset/' + k, min_gap=0.4)
        lic = m.get('license', '')
        L = 'CC0 1.0' if 'zero' in lic else 'CC BY 4.0' if '/by/4.0' in lic else 'CC BY-NC 4.0' if 'by-nc' in lic else lic
        datasets.append({'key': k, 'title': m.get('title', ''), 'licence': L, 'doi': m.get('doi', ''), 'citation': re.sub(r' accessed via GBIF\.org on [\d-]+\.?', '', (m.get('citation') or {}).get('text', '')), 'n': ds_count[k]})
    ds_idx = {d['key']: i for i, d in enumerate(datasets)}
    rows = []
    for (sp, code), a in sorted(agg.items()):
        rows.append({'sp': sp, 'dep': code, 'first': a['first'], 'last': a['last'], 'n': a['n'], 'dec': {str(k): v for k, v in sorted(a['dec'].items())}, 'ds': {str(ds_idx[k]): v for k, v in a['ds'].items()}})
    data = {'v': 1, 'built': BUILT, 'attr': 'GBIF.org — occurrences (voir les jeux de données)', 'url': 'https://www.gbif.org/',
            'species': {sp: {'sci': sci, 'key': key, 'url': f'https://www.gbif.org/species/{key}'} for sp, key, sci, _, _ in SPECIES},
            'deps': {k: [v['n'], round(v['lat'], 3), round(v['lon'], 3)] for k, v in deps.items()}, 'datasets': datasets, 'rows': rows,
            'note': 'Une occurrence = une mention datée (loup tué, vu, prime payée…) dans un jeu de données publié sur GBIF. « Dernière mention » ≠ dernier animal : c’est la dernière trace connue de ces jeux.'}
    path = os.path.join(OUT, 'pm-faune.json.gz')
    raw, gz = C.write_gz(path, data)
    report('faune', path, raw, gz, len(rows))


# ═════════════ 📜 cahiers de doléances ═════════════
AD_CSV = 'https://static.data.gouv.fr/resources/principaux-corpus-darchives-numerises-et-mis-en-ligne-par-les-archives-departementales/20251015-075937/ad-corpus-archives-numerisees-3-.csv'
AD_PAGE = 'https://www.data.gouv.fr/datasets/principaux-corpus-darchives-numerises-et-mis-en-ligne-par-les-archives-departementales'
# transcriptions sur Wikisource trouvées par la recherche « intitle:doléances » (25/11/2026) : [titre, code INSEE de la paroisse]
WIKISOURCE = [['Cahier de doléances d’Ahuillé', '53001', 'Cahiers de plaintes & doléances des paroisses de la province du Maine pour les États Généraux de 1789, tome 1 (A. Bellée, 1881)']]


def build_doleances():
    deps = load_deps()
    by_name = {fold(v['n']): k for k, v in deps.items()}
    raw = C.fetch(AD_CSV, min_gap=1).decode('utf-8-sig')
    out = {}
    for r in csv.DictReader(io.StringIO(raw)):
        if 'doléances' not in (r.get('type_document') or '').lower():
            continue
        code = by_name.get(fold(r.get('lieu')))
        if not code:
            m = re.match(r'FRAD0*(\d+)', r.get('id_institution') or '')
            code = m.group(1).zfill(2) if m else ''
        if not code:
            continue
        out[code] = {'dep': code, 'name': deps.get(code, {}).get('n', r.get('lieu')), 'service': r.get('institution', ''), 'url': r.get('url_site', ''), 'title': r.get('intitule', ''), 'note': r.get('observations', '')}
    communes = load_communes()
    ws = [{'title': t, 'insee': i, 'commune': communes.get(i, [''])[0], 'book': b, 'url': 'https://fr.wikisource.org/wiki/' + urllib.parse.quote(t.replace(' ', '_'))} for t, i, b in WIKISOURCE]
    data = {'v': 1, 'built': BUILT, 'attr': 'data.gouv.fr — « Principaux corpus d’archives numérisés et mis en ligne par les archives départementales » (Licence Ouverte 2.0) ; Wikisource (CC BY-SA 4.0)',
            'url': AD_PAGE, 'licence': 'Licence Ouverte 2.0', 'deps': [out[k] for k in sorted(out)], 'wikisource': ws}
    path = os.path.join(OUT, 'pm-doleances.json')
    raw_n, gz = write_json(path, data)
    report('doléances', path, raw_n, gz, len(out) + len(ws))


# ═════════════ 🎓 grandes écoles (Wikidata) ═════════════
ECOLE_Q = '''SELECT ?p ?pl ?b ?s ?sl ?start ?bpl WHERE {
  VALUES ?s { wd:Q273626 wd:Q83259 wd:Q1132066 wd:Q481762 }
  ?p p:P69 ?st . ?st ps:P69 ?s . OPTIONAL { ?st pq:P580 ?start }
  ?p wdt:P569 ?b . ?p rdfs:label ?pl FILTER(LANG(?pl) = "fr")
  ?s rdfs:label ?sl FILTER(LANG(?sl) = "fr")
  OPTIONAL { ?p wdt:P19 ?bp . ?bp rdfs:label ?bpl FILTER(LANG(?bpl) = "fr") }
}'''
ECOLE_SITES = '''SELECT ?s ?sl ?web WHERE { VALUES ?s { wd:Q273626 wd:Q83259 wd:Q1132066 wd:Q481762 } ?s rdfs:label ?sl FILTER(LANG(?sl) = "fr") OPTIONAL { ?s wdt:P856 ?web } }'''


def build_ecoles():
    schools = {}
    for b in C.sparql(ECOLE_SITES):
        s = Q(val(b, 's'))
        schools.setdefault(s, {'q': s, 'n': val(b, 'sl'), 'web': val(b, 'web')})
    print('écoles :', {k: v['n'] for k, v in schools.items()}, file=sys.stderr)
    rows = {}
    for b in C.sparql(ECOLE_Q):
        q, s = Q(val(b, 'p')), Q(val(b, 's'))
        y = year(val(b, 'b'))
        if not y or y < 1740 or y > 1960:
            continue
        r = rows.setdefault((q, s), {'q': q, 'n': val(b, 'pl'), 'b': y, 's': s, 'start': None, 'bp': val(b, 'bpl')})
        st = year(val(b, 'start'))
        if st and (r['start'] is None or st < r['start']):
            r['start'] = st
    keys = sorted(schools)
    out = [[r['q'][1:], r['n'], r['b'], keys.index(r['s']), r['start'] or 0, r['bp']] for r in sorted(rows.values(), key=lambda x: (fold(x['n']), x['b']))]
    data = {'v': 1, 'built': BUILT, 'attr': 'Wikidata (CC0 1.0) — « scolarité » (P69) et date de naissance (P569)', 'licence': 'CC0 1.0', 'url': 'https://www.wikidata.org/wiki/Property:P69',
            'schools': [schools[k] for k in keys], 'fields': ['qid sans Q', 'nom', 'né en', 'école (index)', 'entrée (P580, 0 = inconnue)', 'lieu de naissance'], 'rows': out,
            'note': 'Seulement les anciens élèves connus de Wikidata (souvent des personnes célèbres) : ce n’est pas le registre complet des écoles.'}
    path = os.path.join(OUT, 'pm-ecoles.json.gz')
    raw, gz = C.write_gz(path, data)
    report('écoles', path, raw, gz, len(out))


PARTS = {'parlers': build_parlers, 'doleances': build_doleances, 'faune': build_faune, 'musique': build_musique, 'fontaines': build_fontaines, 'monuments': build_monuments, 'ecoles': build_ecoles}

if __name__ == '__main__':
    what = sys.argv[1:] or ['all']
    for name, fn in PARTS.items():
        if 'all' in what or name in what:
            fn()
