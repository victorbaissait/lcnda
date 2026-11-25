#!/usr/bin/env python3
"""🧭 La boussole de son époque et 📍 les anciens noms des rues : fabrique les données livrées avec l'app (assets/data/br-*.json.gz).

Sources (téléchargées par ce script, gardées dans raw/ : relancer ne refait pas les appels ; BR_FRESH=1 pour tout reprendre) :
  - gufm1 (Jackson, Jonkers et Walker, 2000, « Four centuries of geomagnetic secular variation from historical records »,
    Phil. Trans. R. Soc. Lond. A 358, 957-990) : le fichier du modèle (harmoniques sphériques jusqu'au degré 14, 163 B-splines
    cubiques de 1590 à 1990, 36 512 nombres) tel que distribué par les auteurs avec leur programme d'exemple (gufm.f, Bloxham et
    Jackson) ; copie publique : github.com/martinrehfeld/gufm1-webservice (reçue du GFZ Potsdam, M. Korte, « zur Weitergabe
    freigegeben ») ; le NOAA NCEI l'utilise dans ses calculateurs (www.ngdc.noaa.gov/geomag/faqgeom.shtml : « IGRF+ »).
  - IGRF-14 (IAGA, 2024) : www.ngdc.noaa.gov/IAGA/vmod/coeffs/igrf14coeffs.txt (1900-2025 + variation séculaire 2025-2030).
  - Paris : « Dénominations des emprises des voies actuelles » et « Dénominations caduques des voies » (Ville de Paris,
    opendata.paris.fr, licence ODbL 1.0) : nom, arrondissement, date de l'arrêté, historique, ancien nom → nouveau nom.
Lyon (data.grandlyon.com, « Dénomination des voies ») et Bordeaux (opendata.bordeaux-metropole.fr, fv_voie_a) n'ont que les noms
d'aujourd'hui (la date de création de la fiche, pas celle du nom) : rien à en tirer pour les anciens noms.
Lancer :  python3 build-boussole-rues.py [dossier de sortie]   (par défaut : assets/data/ de l'app)
"""
import datetime, gzip, hashlib, json, os, re, sys, time, unicodedata, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', '..', 'assets', 'data')
RAW = os.environ.get('BR_RAW') or os.path.join(HERE, 'raw')
TODAY = datetime.date.today().isoformat()
UA = 'LCNDA-genealogie/1.0 (application de bureau ; donnees ouvertes)'
SRC = {
    'gufm1': 'https://raw.githubusercontent.com/martinrehfeld/gufm1-webservice/master/gufm1',
    'igrf': 'https://www.ngdc.noaa.gov/IAGA/vmod/coeffs/igrf14coeffs.txt',
    'paris_cur': 'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/denominations-emprises-voies-actuelles/exports/json?lang=fr&timezone=Europe%2FParis',
    'paris_cad': 'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/denominations-des-voies-caduques/exports/json?lang=fr&timezone=Europe%2FParis',
}
GUFM1_MD5 = 'd3ad5c7c1f956e93de77520d59ddc94e'


def fetch(key):
    os.makedirs(RAW, exist_ok=True)
    p = os.path.join(RAW, key)
    if os.path.exists(p) and not os.environ.get('BR_FRESH'):
        return open(p, 'rb').read()
    for i in range(6):
        try:
            req = urllib.request.Request(SRC[key], headers={'User-Agent': UA, 'Accept-Encoding': 'identity'})
            data = urllib.request.urlopen(req, timeout=300).read()
            open(p, 'wb').write(data)
            return data
        except Exception as e:  # le réseau coupe souvent : on réessaie
            print(f'{key} : {e} (essai {i + 1})', flush=True)
            time.sleep(15)
    raise SystemExit(f'{key} : téléchargement impossible')


def write(name, obj):
    p = os.path.join(OUT, f'br-{name}.json.gz')
    with gzip.open(p, 'wt', encoding='utf-8', compresslevel=9) as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
    print(f'br-{name}.json.gz : {os.path.getsize(p):,} octets', flush=True)


# ═════════════ 🧭 gufm1 + IGRF ═════════════
def build_field():
    raw = fetch('gufm1')
    md5 = hashlib.md5(raw).hexdigest()
    if md5 != GUFM1_MD5:
        print(f'⚠️ gufm1 : empreinte {md5} différente de celle vérifiée ({GUFM1_MD5})')
    lines = raw.decode('ascii').split('\n')
    nums = ' '.join(lines[1:]).split()
    lmax, nspl = int(nums[0]), int(nums[1])
    knots = [float(x) for x in nums[2:2 + nspl + 4]]
    gt = [float(x.replace('D', 'E')) for x in nums[2 + nspl + 4:]]
    n = lmax * (lmax + 2)
    assert len(gt) == n * nspl, (len(gt), n * nspl)
    # gt(n, nspl) en Fortran : pour chaque B-spline, les n coefficients g10 g11 h11 g20 g21 h21 g22 h22 …
    spl = [[round(v * 10) for v in gt[j * n:(j + 1) * n]] for j in range(nspl)]  # en dixièmes de nT
    write('gufm1', {'model': 'gufm1', 'lmax': lmax, 'nspl': nspl, 'order': 4, 'unit': '0.1 nT', 'knots': knots, 'spl': spl,
        'from': 1590, 'to': 1990, 'md5': md5,
        'src': 'Jackson, A., Jonkers, A. R. T. et Walker, M. R. (2000), « Four centuries of geomagnetic secular variation from historical records », Phil. Trans. R. Soc. Lond. A 358, 957-990',
        'url': 'https://doi.org/10.1098/rsta.2000.0569', 'file_url': SRC['gufm1'], 'built': TODAY})

    txt = fetch('igrf').decode('ascii')
    rows = [l.split() for l in txt.split('\n') if l[:2] in ('g ', 'h ')]
    head = [l.split() for l in txt.split('\n') if l.startswith('g/h')][0]
    epochs = [float(x) for x in head[3:-1]]  # la dernière colonne : la variation séculaire (2025-30)
    # ordre : g10 g11 h11 g20 … (comme gufm1)
    coef = {e: [] for e in epochs}; sv = []
    for r in rows:
        vals = [float(x) for x in r[3:]]
        for i, e in enumerate(epochs):
            coef[e].append(vals[i])
        sv.append(vals[-1])
    nmax = 13
    assert all(len(v) == nmax * (nmax + 2) for v in coef.values())
    write('igrf', {'model': 'IGRF-14', 'nmax': nmax, 'epochs': epochs, 'g': [coef[e] for e in epochs], 'sv': sv, 'sv_to': 2030,
        'src': 'IAGA, International Geomagnetic Reference Field, 14e génération (2024)', 'url': 'https://www.ncei.noaa.gov/products/international-geomagnetic-reference-field',
        'file_url': SRC['igrf'], 'built': TODAY})


# ═════════════ 📍 Paris ═════════════
def fold(s):
    s = unicodedata.normalize('NFD', (s or '').lower().replace('œ', 'oe').replace('æ', 'ae'))
    return ''.join(c for c in s if unicodedata.category(c) != 'Mn')


ABBR = {'r': 'rue', 'av': 'avenue', 'bd': 'boulevard', 'bld': 'boulevard', 'boul': 'boulevard', 'pl': 'place', 'imp': 'impasse', 'pass': 'passage',
        'fg': 'faubourg', 'fbg': 'faubourg', 'faub': 'faubourg', 'st': 'saint', 'ste': 'sainte', 'sq': 'square', 'all': 'allee', 'ch': 'chemin', 'crs': 'cours', 'gd': 'grand', 'gde': 'grande'}
STOP = {'de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'a', 'au', 'aux', 'en', 'et'}


def key(s):
    """« R. de la Paix » = « rue Paix » : même clé que l'écran (heritage-boussole-rues.js streetKey)"""
    w = re.sub(r'[^a-z0-9]+', ' ', fold(s)).split()
    out = []
    for i, x in enumerate(w):
        if x in ABBR and (i == 0 or x in ('st', 'ste', 'gd', 'gde', 'fg', 'fbg', 'faub')):
            x = ABBR[x]
        if x not in STOP:
            out.append(x)
    return ' '.join(out)


MONTHS = {m: i + 1 for i, m in enumerate(['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'])}


def text_date(s):
    """« … par arrêté préfectoral du 2 août 1899 » → '1899-08-02' (la première date écrite en toutes lettres)"""
    m = re.search(r'\b(\d{1,2})(?:er)?\s+(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre)\s+(\d{4})\b', s or '', re.I)
    if not m:
        return ''
    return f'{m.group(3)}-{MONTHS[fold(m.group(2))]:02d}-{int(m.group(1)):02d}'


def cut(s, n):
    s = re.sub(r'\s+', ' ', (s or '').strip())
    if len(s) <= n:
        return s
    c = s[:n]; d = c.rfind('. ')
    return c[:d + 1] if d > n * 0.5 else c.rstrip() + '…'


def arr(a):
    if isinstance(a, list):
        a = ','.join(a)
    return ','.join(str(int(x[:2])) for x in re.findall(r'\d{1,2}e', a or '')) if a else ''


NAME_TO = re.compile(r"^(?:Ou [^.]*\.\s*)?(?:Dénommée?s?|Devenue?s?|Actuellement|Réunie?s? à|Incorporée? à|Englobée? dans|Absorbée? par)\s+(partie\s+(?:de\s+la\s+|de\s+l'|du\s+|des\s+|de\s+)?)?(.+?)(?:\s+par\s+|\.|;|,\s|\s\(|$)", re.I)
PLACEHOLDER = re.compile(r'^(voie|sentier|impasse|chemin)\s+([a-z]{1,3}\s*/\s*\d+|[a-z]{1,3}\d*|n°?\s*\d+)$|^voie projet', re.I)


def build_paris():
    cur = json.loads(fetch('paris_cur'))
    cad = json.loads(fetch('paris_cad'))
    streets, by_key = [], {}
    for r in cur:
        name = (r.get('typo_min') or '').strip()
        if not name:
            continue
        pt = r.get('geo_point_2d') or {}
        s = {'n': name, 'a': arr(r.get('arrdt')), 'd': r.get('date_arret') or '', 'h': cut(r.get('historique'), 420), 'o': cut(r.get('orig'), 220),
             'p': [round(pt['lat'], 5), round(pt['lon'], 5)] if pt.get('lat') else None, 'id': str(r.get('id') or '')}
        if not s['d']:
            s['d'] = text_date(r.get('denomination'))
        by_key.setdefault(key(name), []).append(len(streets))
        streets.append(s)
    old, linked = [], 0
    for r in cad:
        name = (r.get('typo_min') or '').strip()
        if not name or PLACEHOLDER.match(name):
            continue
        h = re.sub(r'\s+', ' ', (r.get('historique') or '').strip())
        to, part = None, 0
        # « Voir : … » renvoie à une autre fiche caduque ; sinon la première phrase qui donne le nom suivant
        for sent in re.split(r'(?<=\.)\s+', h):
            m = NAME_TO.match(sent)
            if not m:
                continue
            target = m.group(2).strip()
            hits = by_key.get(key(target))
            if hits:
                a = arr(r.get('arrdt'))
                pick = [i for i in hits if a and set(a.split(',')) & set(streets[i]['a'].split(','))] or hits
                to, part = pick[0], 1 if m.group(1) else 0
                # « Dénommée rue X … Actuellement rue Y » : le nom d'aujourd'hui est le dernier
            if re.match(r'^Actuellement', sent, re.I) and hits:
                break
        d = r.get('date_voie_ancienne') or text_date(h)
        old.append({'n': name, 'a': arr(r.get('arrdt')), 'd': d or '', 'h': cut(h, 300), 'to': to, 'part': part, 'id': str(r.get('id') or '')})
    # « Voir : Hermite (rue de l’). » : une autre graphie, qui renvoie à une autre fiche caduque → on suit le renvoi
    old_by_key = {}
    for i, o in enumerate(old):
        old_by_key.setdefault(key(o['n']), i)
    for _ in range(3):
        for o in old:
            if o['to'] is not None:
                continue
            m = re.search(r"Voir\s*:\s*([^().;]+?)\s*\(([^)]+)\)", o['h'])
            if not m:
                continue
            typ = m.group(2).strip()
            j = old_by_key.get(key(typ + ('' if typ.endswith("'") or typ.endswith('’') else ' ') + m.group(1).strip()))
            if j is not None and old[j]['to'] is not None:
                o['to'], o['part'], o['via'] = old[j]['to'], old[j]['part'], old[j]['n']
    linked = sum(o['to'] is not None for o in old)
    print(f'Paris : {len(streets)} voies actuelles, {len(old)} dénominations caduques dont {linked} reliées à une voie actuelle', flush=True)
    write('paris', {'city': 'Paris', 'insee': '75056', 'streets': streets, 'old': old, 'built': TODAY,
        'src': 'Ville de Paris — Nomenclature officielle des voies : « Dénominations des emprises des voies actuelles » et « Dénominations caduques des voies »',
        'licence': 'ODbL 1.0', 'licence_url': 'https://opendatacommons.org/licenses/odbl/1-0/',
        'url_cur': 'https://opendata.paris.fr/explore/dataset/denominations-emprises-voies-actuelles/',
        'url_old': 'https://opendata.paris.fr/explore/dataset/denominations-des-voies-caduques/',
        'url_app': 'https://capgeo.sig.paris.fr/Apps/NomenclatureVoies/'})


if __name__ == '__main__':
    what = os.environ.get('BR_ONLY', 'field,paris').split(',')
    if 'field' in what:
        build_field()
    if 'paris' in what:
        build_paris()
