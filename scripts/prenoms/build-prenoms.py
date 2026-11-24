#!/usr/bin/env python3
"""
LCNDA — 📊 Prénoms d'ici et d'ailleurs : fabrique le pack « prenoms-pays » (scripts/prenoms/, .github/workflows/prenoms.yml).

Le pack est une base SQLite compressée (prenoms-pays.sqlite.gz). L'app (lib/prenoms_pays.php) le télécharge depuis la
version GitHub « prenoms-donnees » (prenoms-manifest.json : taille, empreinte sha256, morceaux), vérifie l'empreinte, le
décompresse et le range dans SHARED_DATA_DIR/prenoms/prenoms-pays.sqlite.

Sources (vérifiées en les téléchargeant, novembre 2026) :
  FR  Insee, « Fichier des prénoms », édition 2024 (naissances 1900–2023), fichier par département de naissance
      (prenoms-2023-dpt_csv.zip) et fichier France (prenoms-2023-nat_csv.zip). Licence Ouverte / Open Licence 2.0 (Etalab).
  CH  Office fédéral de la statistique (OFS), STATPOP : « Prénoms féminins / masculins de la population selon l'année de
      naissance, Suisse, 2025 » (su-f-01.04.00.10 et su-f-01.04.00.09). Ce sont les personnes qui vivent en Suisse fin 2025,
      comptées selon leur année de naissance (1919 →) : pas les naissances. Conditions OFS « OPEN-BY » (libre, source obligatoire).
  QC  Retraite Québec, « Banque de prénoms – Filles / Garçons » (1980–2025), Données Québec. CC BY 4.0.
      Les prénoms donnés à moins de 5 enfants une année sont notés « <5 » : ils ne sont pas comptés.
Non retenus : Belgique (Statbel : le site refuse les programmes, fichier non vérifié), Luxembourg (seulement une liste des
prénoms les plus portés en 2020, sans année de naissance).

Tables : meta(key, value) ; sources(pays, nom, licence, mention, url, annees, quoi) ; zones(id, pays, code, nom) ;
names(id, prenom) ; counts(zone, name, sexe, annee, n, rang) ; totals(zone, sexe, annee, n).
Le prénom est rangé comme lib/heritage.php prenom_key : le premier mot, sans accents, en majuscules (« Marie-Thérèse » →
« MARIE-THERESE ») ; le rang est celui du prénom parmi ceux du même sexe, même année, même zone (1 = le plus donné).

    python3 scripts/prenoms/build-prenoms.py --dossier prenoms-sortie [--cache prenoms-cache] [--essai]
--essai : un petit pack pour les tests (quelques prénoms, Cantal et France), fait des MÊMES fichiers (aucun chiffre inventé).
"""
import argparse, csv, datetime, gzip, hashlib, io, json, os, re, sqlite3, sys, unicodedata, urllib.request, zipfile

SOURCES = {
    'fr_dpt': 'https://www.insee.fr/fr/statistiques/fichier/8205621/prenoms-2023-dpt_csv.zip',
    'fr_nat': 'https://www.insee.fr/fr/statistiques/fichier/8205621/prenoms-2023-nat_csv.zip',
    'ch_f': 'https://dam-api.bfs.admin.ch/hub/api/dam/assets/36752511/master',
    'ch_m': 'https://dam-api.bfs.admin.ch/hub/api/dam/assets/36752505/master',
    'qc_f': 'https://www.donneesquebec.ca/recherche/dataset/13db2583-427a-4e5f-b679-8532d3df571f/resource/bf77b504-54b9-4db8-be53-b92156175c12/download/grande_listef_csv.csv',
    'qc_g': 'https://www.donneesquebec.ca/recherche/dataset/93d640ec-d059-4768-b7ed-388604b278aa/resource/039539f5-af55-4d8f-9010-ca718e45c2a5/download/grande_listeg_csv.csv',
}

EXT = {'fr_dpt': '.zip', 'fr_nat': '.zip', 'ch_f': '.xlsx', 'ch_m': '.xlsx', 'qc_f': '.csv', 'qc_g': '.csv'}

SOURCE_ROWS = [
    ('FR', 'Insee — Fichier des prénoms (édition 2024)', 'Licence Ouverte / Open Licence 2.0 (Etalab)',
     'Source : Insee, Fichier des prénoms, édition 2024 (état civil).', 'https://www.insee.fr/fr/statistiques/8205621', '1900–2023',
     'Naissances en France par prénom, sexe, année et département de naissance. Les données avant 1946 sont incomplètes ; un prénom donné moins de 3 fois une année (ou moins de 20 fois de 1900 à 1945 et de 1946 à 2023) est rangé dans « prénoms rares ».'),
    ('CH', 'OFS — Prénoms de la population selon l’année de naissance (STATPOP 2025)', 'OFS : libre utilisation, source obligatoire (OPEN-BY)',
     'Source : Office fédéral de la statistique (OFS), STATPOP, état au 31.12.2025.', 'https://www.bfs.admin.ch/asset/fr/36752511', '1919–2025',
     'Personnes vivant en Suisse fin 2025, par prénom, sexe et année de naissance : ce ne sont pas les naissances (les personnes mortes ou parties ne sont pas comptées, celles arrivées après leur naissance le sont). Suisse entière, pas de détail par canton pour ces années.'),
    ('QC', 'Retraite Québec — Banque de prénoms (filles, garçons)', 'CC BY 4.0',
     'Source : Retraite Québec, Banque de prénoms, Données Québec (CC BY 4.0).', 'https://www.donneesquebec.ca/recherche/dataset/banque-de-prenoms-filles', '1980–2025',
     'Enfants admissibles aux prestations familiales (nés au Québec ou arrivés bébés), par prénom, sexe et année. Les prénoms donnés à moins de 5 enfants une année ne sont pas comptés.'),
]

FR_DEPTS = {'01': 'Ain', '02': 'Aisne', '03': 'Allier', '04': 'Alpes-de-Haute-Provence', '05': 'Hautes-Alpes', '06': 'Alpes-Maritimes', '07': 'Ardèche', '08': 'Ardennes', '09': 'Ariège', '10': 'Aube', '11': 'Aude', '12': 'Aveyron', '13': 'Bouches-du-Rhône', '14': 'Calvados', '15': 'Cantal', '16': 'Charente', '17': 'Charente-Maritime', '18': 'Cher', '19': 'Corrèze', '20': 'Corse', '21': 'Côte-d’Or', '22': 'Côtes-d’Armor', '23': 'Creuse', '24': 'Dordogne', '25': 'Doubs', '26': 'Drôme', '27': 'Eure', '28': 'Eure-et-Loir', '29': 'Finistère', '30': 'Gard', '31': 'Haute-Garonne', '32': 'Gers', '33': 'Gironde', '34': 'Hérault', '35': 'Ille-et-Vilaine', '36': 'Indre', '37': 'Indre-et-Loire', '38': 'Isère', '39': 'Jura', '40': 'Landes', '41': 'Loir-et-Cher', '42': 'Loire', '43': 'Haute-Loire', '44': 'Loire-Atlantique', '45': 'Loiret', '46': 'Lot', '47': 'Lot-et-Garonne', '48': 'Lozère', '49': 'Maine-et-Loire', '50': 'Manche', '51': 'Marne', '52': 'Haute-Marne', '53': 'Mayenne', '54': 'Meurthe-et-Moselle', '55': 'Meuse', '56': 'Morbihan', '57': 'Moselle', '58': 'Nièvre', '59': 'Nord', '60': 'Oise', '61': 'Orne', '62': 'Pas-de-Calais', '63': 'Puy-de-Dôme', '64': 'Pyrénées-Atlantiques', '65': 'Hautes-Pyrénées', '66': 'Pyrénées-Orientales', '67': 'Bas-Rhin', '68': 'Haut-Rhin', '69': 'Rhône', '70': 'Haute-Saône', '71': 'Saône-et-Loire', '72': 'Sarthe', '73': 'Savoie', '74': 'Haute-Savoie', '75': 'Paris', '76': 'Seine-Maritime', '77': 'Seine-et-Marne', '78': 'Yvelines', '79': 'Deux-Sèvres', '80': 'Somme', '81': 'Tarn', '82': 'Tarn-et-Garonne', '83': 'Var', '84': 'Vaucluse', '85': 'Vendée', '86': 'Vienne', '87': 'Haute-Vienne', '88': 'Vosges', '89': 'Yonne', '90': 'Territoire de Belfort', '91': 'Essonne', '92': 'Hauts-de-Seine', '93': 'Seine-Saint-Denis', '94': 'Val-de-Marne', '95': 'Val-d’Oise', '971': 'Guadeloupe', '972': 'Martinique', '973': 'Guyane', '974': 'La Réunion', '976': 'Mayotte'}

ESSAI_NAMES = {'MARIE', 'JEAN', 'PIERRE', 'ANNE', 'LOUIS', 'JEANNE', 'MARGUERITE', 'ANTOINE', 'SOFIA', 'NOAH', 'ROSA', 'ALICE'}
ESSAI_DEPTS = {'15'}


def key(name):
    """comme lib/heritage.php prenom_key : premier mot (espaces, virgules), sans accents, majuscules"""
    first = re.split(r'[\s,]+', name.strip())[0] if name.strip() else ''
    s = first.replace('Œ', 'OE').replace('œ', 'oe').replace('Æ', 'AE').replace('æ', 'ae').replace('ß', 'ss')
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode('ascii')
    return s.upper()


def fetch(name, cache):
    os.makedirs(cache, exist_ok=True)
    path = os.path.join(cache, name + EXT[name])
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return path
    print('téléchargement', SOURCES[name], file=sys.stderr)
    req = urllib.request.Request(SOURCES[name], headers={'User-Agent': 'LCNDA build-prenoms'})
    with urllib.request.urlopen(req, timeout=300) as r, open(path + '.tmp', 'wb') as out:
        while True:
            b = r.read(1 << 20)
            if not b:
                break
            out.write(b)
    os.replace(path + '.tmp', path)
    return path


def zip_csv(path):
    z = zipfile.ZipFile(path)
    n = [x for x in z.namelist() if x.lower().endswith('.csv')][0]
    return io.TextIOWrapper(z.open(n), encoding='utf-8-sig', newline='')


class Acc:
    """compte : (zone, sexe, année) → {prénom: n} et le total des naissances (prénoms rares compris)"""
    def __init__(self):
        self.c = {}
        self.t = {}

    def add(self, zone, sex, year, name, n, rare=False):
        k = (zone, sex, year)
        self.t[k] = self.t.get(k, 0) + n
        if not rare:
            d = self.c.setdefault(k, {})
            d[name] = d.get(name, 0) + n


def read_insee(path, acc, zone_of, essai, dept_col):
    rd = csv.reader(zip_csv(path), delimiter=';')
    head = [h.strip().lower() for h in next(rd)]
    i_s, i_n, i_y, i_c = head.index('sexe'), head.index('preusuel'), head.index('annais'), head.index('nombre')
    i_d = head.index('dpt') if dept_col else None
    for row in rd:
        y = row[i_y]
        if not y.isdigit():
            continue
        if i_d is not None:
            d = row[i_d]
            if d not in FR_DEPTS or (essai and d not in ESSAI_DEPTS):
                continue
            zone = zone_of('FR', d)
        else:
            zone = zone_of('FR', '')
        name = row[i_n]
        rare = name.startswith('_')
        k = '' if rare else key(name)
        if not rare and not k:
            continue
        acc.add(zone, int(row[i_s]), int(y), k, int(row[i_c]), rare)


def read_ch(path, sex, acc, zone, essai):
    import openpyxl  # pip install openpyxl
    wb = openpyxl.load_workbook(path, read_only=True)
    ws = wb.worksheets[0]  # « Suisse » (les autres feuilles : régions linguistiques)
    ws.reset_dimensions()
    head = None
    for row in ws.iter_rows(values_only=True):
        if head is None:
            if row and row[0] == 'firstname':
                head = list(row)
            continue
        if not row or not isinstance(row[0], str) or not row[0].strip():
            continue
        k = key(row[0])
        for i in range(2, min(len(row), len(head))):
            h, v = head[i], row[i]
            if isinstance(h, str) and h.startswith('J_') and isinstance(v, (int, float)) and v > 0:
                acc.add(zone, sex, int(h[2:]), k, int(v))


def read_qc(path, sex, acc, zone, essai):
    with open(path, encoding='utf-8-sig', newline='') as f:
        rd = csv.reader(f)
        head = next(rd)
        years = [(i, int(h[2:])) for i, h in enumerate(head) if h.startswith('A_')]
        for row in rd:
            if not row or not row[0].strip():
                continue
            k = key(re.sub(r'\s+', '-', row[0].strip()))  # « MARIE EVE » (prénom composé) → MARIE-EVE
            for i, y in years:
                v = row[i].strip() if i < len(row) else ''
                if v.isdigit() and int(v) > 0:
                    acc.add(zone, sex, y, k, int(v))


def build(args):
    acc = Acc()
    zones = {}

    def zone_of(cc, code):
        if (cc, code) not in zones:
            zones[(cc, code)] = len(zones) + 1
        return zones[(cc, code)]

    cache = args.cache
    read_insee(fetch('fr_nat', cache), acc, zone_of, args.essai, False)
    read_insee(fetch('fr_dpt', cache), acc, zone_of, args.essai, True)
    read_ch(fetch('ch_f', cache), 2, acc, zone_of('CH', ''), args.essai)
    read_ch(fetch('ch_m', cache), 1, acc, zone_of('CH', ''), args.essai)
    read_qc(fetch('qc_f', cache), 2, acc, zone_of('QC', ''), args.essai)
    read_qc(fetch('qc_g', cache), 1, acc, zone_of('QC', ''), args.essai)

    os.makedirs(args.dossier, exist_ok=True)
    db_path = os.path.join(args.dossier, 'prenoms-pays.sqlite')
    if os.path.exists(db_path):
        os.remove(db_path)
    db = sqlite3.connect(db_path)
    db.executescript('''
        PRAGMA page_size=4096; PRAGMA journal_mode=OFF;
        CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);
        CREATE TABLE sources(pays TEXT PRIMARY KEY, nom TEXT, licence TEXT, mention TEXT, url TEXT, annees TEXT, quoi TEXT);
        CREATE TABLE zones(id INTEGER PRIMARY KEY, pays TEXT NOT NULL, code TEXT NOT NULL, nom TEXT NOT NULL);
        CREATE TABLE names(id INTEGER PRIMARY KEY, prenom TEXT NOT NULL UNIQUE);
        CREATE TABLE counts(name INTEGER NOT NULL, zone INTEGER NOT NULL, sexe INTEGER NOT NULL, annee INTEGER NOT NULL, n INTEGER NOT NULL, rang INTEGER NOT NULL,
            PRIMARY KEY(name, zone, sexe, annee)) WITHOUT ROWID;
        CREATE TABLE totals(zone INTEGER NOT NULL, sexe INTEGER NOT NULL, annee INTEGER NOT NULL, n INTEGER NOT NULL, prenoms INTEGER NOT NULL,
            PRIMARY KEY(zone, sexe, annee)) WITHOUT ROWID;
    ''')
    names = {}
    for (cc, code), zid in zones.items():
        nom = {'FR': 'France', 'CH': 'Suisse', 'QC': 'Québec'}[cc] if code == '' else FR_DEPTS[code]
        db.execute('INSERT INTO zones VALUES(?,?,?,?)', (zid, cc, code, nom))
    rows = []
    for (zone, sex, year), d in acc.c.items():
        ranked = sorted(d.items(), key=lambda kv: -kv[1])
        rank, prev = 0, None
        for i, (nm, n) in enumerate(ranked):
            if n != prev:
                rank, prev = i + 1, n
            if args.essai and nm not in ESSAI_NAMES:  # le pack d'essai garde quelques prénoms, avec leur vrai rang
                continue
            if nm not in names:
                names[nm] = len(names) + 1
            rows.append((names[nm], zone, sex, year, n, rank))
    db.executemany('INSERT INTO names VALUES(?,?)', [(i, n) for n, i in names.items()])
    rows.sort()
    db.executemany('INSERT INTO counts VALUES(?,?,?,?,?,?)', rows)
    db.executemany('INSERT INTO totals VALUES(?,?,?,?,?)', [(z, s, y, n, len(acc.c.get((z, s, y), {}))) for (z, s, y), n in sorted(acc.t.items())])
    db.executemany('INSERT INTO sources VALUES(?,?,?,?,?,?,?)', SOURCE_ROWS)
    # les années vraiment couvertes (lues dans les fichiers)
    db.execute("UPDATE sources SET annees=(SELECT MIN(t.annee) || '–' || MAX(t.annee) FROM totals t JOIN zones z ON z.id=t.zone WHERE z.pays=sources.pays)")
    built = datetime.date.today().isoformat()
    meta = {'kind': 'pays', 'format': '1', 'built': built, 'countries': 'FR,CH,QC', 'title': 'Prénoms : France (départements), Suisse, Québec',
            'essai': '1' if args.essai else '', 'not_included': 'BE: Statbel refuse les programmes (fichier non vérifié) ; LU: pas de fichier par année de naissance'}
    db.executemany('INSERT INTO meta VALUES(?,?)', list(meta.items()))
    db.commit()
    db.execute('VACUUM')
    db.close()

    raw = open(db_path, 'rb').read()
    comp = gzip.compress(raw, 9, mtime=0)
    pack = os.path.join(args.dossier, 'prenoms-pays.sqlite.gz')
    with open(pack, 'wb') as out:
        out.write(comp)
    print(json.dumps({'pack': pack, 'raw': len(raw), 'gz': len(comp), 'sha256': hashlib.sha256(comp).hexdigest(), 'rows': len(rows), 'names': len(names), 'zones': len(zones)}))


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--dossier', default='prenoms-sortie')
    ap.add_argument('--cache', default='prenoms-cache')
    ap.add_argument('--essai', action='store_true')
    build(ap.parse_args())
