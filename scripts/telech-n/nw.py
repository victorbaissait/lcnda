# LCNDA — lot N « archives et mémoire » : outils communs des scripts de fabrication (Python 3 ; xlrd/openpyxl seulement pour les .xls/.xlsx).
# Téléchargements polis (une requête à la fois, pause par site, réponses gardées dans le cache), lecture CSV / JSON / Excel,
# colonnes trouvées par leur nom (les jeux des collectivités n'ont pas tous les mêmes), communes de France (cc-communes.json.gz).
# Essais : TN_FIXTURES=<dossier> → chaque source est lue dans <dossier>/<id de la source> au lieu d'Internet.
import csv, gzip, hashlib, io, json, os, re, time, unicodedata, urllib.parse, urllib.request

CACHE = os.environ.get('TN_RAW') or os.path.join(os.path.expanduser('~'), '.cache', 'lcnda-tn')
UA = 'LCNDA-genealogie-build/1.0 (open-source genealogy app; data build script)'
_last = {}


def get(src_id, url, tries=5):
    fx = os.environ.get('TN_FIXTURES')
    if fx:
        p = os.path.join(fx, src_id)
        if not os.path.exists(p):
            raise FileNotFoundError(p)
        return open(p, 'rb').read()
    os.makedirs(CACHE, exist_ok=True)
    f = os.path.join(CACHE, hashlib.sha1(url.encode()).hexdigest())
    if os.path.exists(f):
        return open(f, 'rb').read()
    host = urllib.parse.urlparse(url).hostname or ''
    last = None
    for i in range(tries):
        wait = 2.0 - (time.time() - _last.get(host, 0))
        if wait > 0:
            time.sleep(wait)
        _last[host] = time.time()
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=300) as r:
                body = r.read()
            open(f, 'wb').write(body)
            return body
        except Exception as e:  # noqa
            last = e
            if getattr(e, 'code', 0) in (400, 401, 403, 404):
                break
            time.sleep(10 * (i + 1))
    raise RuntimeError(f'{url[:160]} : {last}')


def licence_of(dataset_slug, want):
    """la licence déclarée sur data.gouv.fr (champ « license ») : on s'arrête si ce n'est plus une licence ouverte attendue"""
    if os.environ.get('TN_FIXTURES'):
        return want[0]
    d = json.loads(get('dg-' + dataset_slug, f'https://www.data.gouv.fr/api/1/datasets/{dataset_slug}/'))
    lic = str(d.get('license') or '')
    assert lic in want, f'{dataset_slug} : licence « {lic} » (attendu {want}) — on s’arrête'
    return lic


def fold(s):
    s = unicodedata.normalize('NFKD', str(s or '')).replace('œ', 'oe').replace('Œ', 'oe').encode('ascii', 'ignore').decode().lower()
    s = re.sub(r'[^a-z0-9]+', ' ', s).strip()
    return re.sub(r'\bste\b', 'sainte', re.sub(r'\bst\b', 'saint', s))


def text(b):
    for enc in ('utf-8-sig', 'cp1252'):
        try:
            return b.decode(enc)
        except UnicodeDecodeError:
            pass
    return b.decode('utf-8', 'replace')


def read_csv(b):
    t = text(b)
    head = t[:5000]
    delim = max([';', ',', '\t', '|'], key=lambda c: head.split('\n', 1)[0].count(c))
    return [{(k or '').strip(): (v or '').strip() for k, v in r.items()} for r in csv.DictReader(io.StringIO(t), delimiter=delim)]


def read_ods_json(b):
    """export JSON d'un portail Opendatasoft (liste d'objets) ; geo_point_2d → lat/lon"""
    out = []
    for r in json.loads(text(b)):
        row = {}
        for k, v in r.items():
            if isinstance(v, dict) and 'lat' in v and 'lon' in v:
                row['_lat'], row['_lon'] = v['lat'], v['lon']
            elif isinstance(v, (list, dict)):
                continue
            else:
                row[k] = '' if v is None else str(v).strip()
        out.append(row)
    return out


def read_xls(b, name=''):
    if b[:4] == b'PK\x03\x04':
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(b), read_only=True, data_only=True)
        rows = [[('' if c is None else (c.isoformat()[:10] if hasattr(c, 'isoformat') else str(c))).strip() for c in r] for r in wb.worksheets[0].iter_rows(values_only=True)]
    else:
        import xlrd
        sh = xlrd.open_workbook(file_contents=b).sheet_by_index(0)
        rows = []
        for i in range(sh.nrows):
            line = []
            for c in sh.row(i):
                if c.ctype == xlrd.XL_CELL_DATE:
                    try:
                        line.append(xlrd.xldate.xldate_as_datetime(c.value, 0).date().isoformat())
                    except Exception:  # noqa
                        line.append(str(c.value))
                elif c.ctype == xlrd.XL_CELL_NUMBER and float(c.value).is_integer():
                    line.append(str(int(c.value)))
                else:
                    line.append(str(c.value).strip())
            rows.append(line)
    # la ligne d'en-tête : la première qui a au moins deux cases remplies
    h = next((i for i, r in enumerate(rows) if sum(1 for c in r if c) >= 2), 0)
    head = [c or f'col{i}' for i, c in enumerate(rows[h])] if rows else []
    return [dict(zip(head, r)) for r in rows[h + 1:] if any(r)]


def read_any(b):
    s = b.lstrip()[:1]
    if b[:4] == b'PK\x03\x04' or b[:8] == b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1':
        return read_xls(b)
    if s == b'[':
        return read_ods_json(b)
    return read_csv(b)


def col(rows, *words, avoid=()):
    """la colonne dont le nom (plié) contient un des mots, dans l'ordre des mots ; None si aucune"""
    if not rows:
        return None
    keys = list(rows[0].keys())
    for w in words:
        for k in keys:
            fk = fold(k)
            if (fk == w or re.search(r'(^|\s)' + re.escape(w) + r'($|\s)', fk)) and not any(a in fk for a in avoid):
                return k
    return None


def year(s):
    m = re.search(r'(1[0-9]{3}|20[0-9]{2})', str(s or ''))
    return int(m.group(1)) if m else None


def iso_date(s):
    """« 12/03/1915 », « 1915-03-12 », « 12 mars 1915 », « 1915 » → « 1915-03-12 » ou « 1915 » ; '' sinon"""
    s = str(s or '').strip()
    m = re.match(r'^(\d{4})-(\d{2})-(\d{2})', s)
    if m:
        return m.group(0)
    m = re.match(r'^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})', s)
    if m:
        return f'{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}'
    MO = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre']
    m = re.match(r'^(\d{1,2})(?:er)?\s+([a-z]+)\s+(\d{4})', fold(s))
    if m and m.group(2) in MO:
        return f'{m.group(3)}-{MO.index(m.group(2)) + 1:02d}-{int(m.group(1)):02d}'
    y = year(s)
    return str(y) if y else ''


DEPTS = dict(x.split('=') for x in (
    "Ain=01;Aisne=02;Allier=03;Alpes-de-Haute-Provence=04;Basses-Alpes=04;Hautes-Alpes=05;Alpes-Maritimes=06;Ardèche=07;Ardennes=08;"
    "Ariège=09;Aube=10;Aude=11;Aveyron=12;Bouches-du-Rhône=13;Calvados=14;Cantal=15;Charente=16;Charente-Maritime=17;Charente-Inférieure=17;"
    "Cher=18;Corrèze=19;Corse-du-Sud=2A;Haute-Corse=2B;Corse=20;Côte-d'Or=21;Côtes-d'Armor=22;Côtes-du-Nord=22;Creuse=23;Dordogne=24;Doubs=25;"
    "Drôme=26;Eure=27;Eure-et-Loir=28;Finistère=29;Gard=30;Haute-Garonne=31;Gers=32;Gironde=33;Hérault=34;Ille-et-Vilaine=35;Indre=36;"
    "Indre-et-Loire=37;Isère=38;Jura=39;Landes=40;Loir-et-Cher=41;Loire=42;Haute-Loire=43;Loire-Atlantique=44;Loire-Inférieure=44;Loiret=45;"
    "Lot=46;Lot-et-Garonne=47;Lozère=48;Maine-et-Loire=49;Manche=50;Marne=51;Haute-Marne=52;Mayenne=53;Meurthe-et-Moselle=54;Meurthe=54;"
    "Meuse=55;Morbihan=56;Moselle=57;Nièvre=58;Nord=59;Oise=60;Orne=61;Pas-de-Calais=62;Puy-de-Dôme=63;Pyrénées-Atlantiques=64;"
    "Basses-Pyrénées=64;Hautes-Pyrénées=65;Pyrénées-Orientales=66;Bas-Rhin=67;Haut-Rhin=68;Rhône=69;Haute-Saône=70;Saône-et-Loire=71;"
    "Sarthe=72;Savoie=73;Haute-Savoie=74;Paris=75;Seine=75;Seine-Maritime=76;Seine-Inférieure=76;Seine-et-Marne=77;Yvelines=78;"
    "Seine-et-Oise=78;Deux-Sèvres=79;Somme=80;Tarn=81;Tarn-et-Garonne=82;Var=83;Vaucluse=84;Vendée=85;Vienne=86;Haute-Vienne=87;Vosges=88;"
    "Yonne=89;Territoire de Belfort=90;Essonne=91;Hauts-de-Seine=92;Seine-Saint-Denis=93;Val-de-Marne=94;Val-d'Oise=95;Guadeloupe=971;"
    "Martinique=972;Guyane=973;La Réunion=974;Réunion=974;Mayotte=976").split(';'))
DEPT_BY_FOLD = {fold(k): v for k, v in DEPTS.items()}


def dep_of_insee(ins):
    ins = str(ins or '')
    return ins[:3] if ins[:2] == '97' else ins[:2]


class Communes:
    """les communes de France livrées avec l'app (assets/data/cc-communes.json.gz, Licence Ouverte) : (département, nom plié) → INSEE"""
    def __init__(self, root):
        d = json.load(gzip.open(os.path.join(root, 'assets', 'data', 'cc-communes.json.gz')))
        c = d['c']
        self.by = {}
        self.info = {}
        for ins, v in (c.items() if isinstance(c, dict) else c):
            self.info[ins] = (v[0], v[1], v[2])
            self.by.setdefault((dep_of_insee(ins), fold(v[0])), ins)
            self.by.setdefault((dep_of_insee(ins), fold(re.sub(r'^(le|la|les|l)\s+', '', fold(v[0])))), ins)

    def find(self, dep, name):
        dep = str(dep or '').zfill(2) if str(dep or '').isdigit() and len(str(dep)) < 3 else str(dep or '')
        f = fold(re.sub(r'\s*\(.*?\)\s*', ' ', str(name or '')))
        if not f:
            return ''
        if dep in ('20',):
            return self.by.get(('2A', f)) or self.by.get(('2B', f)) or ''
        return self.by.get((dep, f)) or self.by.get((dep, fold(re.sub(r'^(le|la|les|l)\s+', '', f)))) or ''


def write_gz(out_dir, name, meta):
    os.makedirs(out_dir, exist_ok=True)
    p = os.path.join(out_dir, name)
    with gzip.GzipFile(p, 'wb', mtime=0, compresslevel=9) as f:
        f.write(json.dumps(meta, ensure_ascii=False, separators=(',', ':')).encode())
    return os.path.getsize(p)


def today():
    return time.strftime('%Y-%m-%d')
