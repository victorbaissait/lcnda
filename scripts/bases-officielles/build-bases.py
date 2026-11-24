#!/usr/bin/env python3
"""LCNDA — 🎖️ Morts pour la France 1914–1918 et 🏅 Légion d'honneur (base Léonore) : fabrique les deux packs.

    python3 scripts/bases-officielles/build-bases.py mpf      [--dossier bo-sortie]
    python3 scripts/bases-officielles/build-bases.py leonore  [--dossier bo-sortie] [--sans-wikidata]
    python3 scripts/bases-officielles/build-bases.py fixture  DOSSIER     (packs d'essai : tests/test-bases-officielles.js)

Rien n'est livré avec l'app : .github/workflows/bases-officielles.yml dépose bo-mpf.sqlite.gz et bo-leonore.sqlite.gz
dans la version « bases-officielles-donnees » du dépôt, avec bases-officielles-manifest.json ; l'app les télécharge
(Réglages → 🎖️ Bases officielles → ⤓ Installer : lib/bases_officielles.php), vérifie l'empreinte, puis les range.

Sources (toutes téléchargées et relues le 24/11/2026) :

🏅 Léonore — « Les données du hackathon des Archives nationales », data.gouv.fr (Ministère de la Culture, 2018),
   fichier 01_le_citoyen_a_l_honneur.zip (metadonnees-leonore.zip, 159 681 310 octets) :
   export_complet_metadonnees_leonore_ordre_alphabetique_csv.csv (381 156 dossiers, ISO-8859-1, « ; »).
   Colonnes : COTE;DOSSIER;NOM;PRENOM(s);DATE-NAISS;DATE-REV;LIEU-NAISS;CODE;NOM2;NOM-JF;NOM-MARI;PRE-MARI;SEXE;SITFAM;
   SURNOM;NOTES;REF-MIST;VIDEO. Gardé : cote, dossier, nom, prénoms, naissance (date, lieu), nom de jeune fille, autre nom,
   sexe. Licence sur data.gouv.fr : « non spécifiée » ; ce sont des informations publiques publiées par l'administration
   pour être réutilisées (hackathon), réutilisables librement en citant la source et la date (CRPA, art. L321-1 et
   L322-1). Mention : « Archives nationales, base Léonore (export des métadonnées, 2018), data.gouv.fr ».
   Le lien direct vers une notice du nouveau site Léonore n'est pas dans l'export : il vient de Wikidata (CC0,
   propriétés P640 « cote Léonore » et P11152 « identifiant Léonore Web ») quand il y est (≈ 28 000 personnes) ;
   sinon l'app montre la cote et ouvre le site Léonore.

🎖️ Morts pour la France — il n'existe pas (novembre 2026) d'export national ouvert de la base « Morts pour la France
   de la Première Guerre mondiale » de Mémoire des hommes. Le pack réunit les listes ouvertes qui en sont tirées :
   1. Réseau Canopé, « Première Guerre mondiale - Les Poilus morts pour la France (à compléter) », data.gouv.fr,
      tracesdesoldats-lespoilus.csv (12 186 fiches, d'après les données indexées sur Mémoire des hommes, avec le lien
      vers la fiche numérisée) — Open Data Commons Attribution (ODC-BY 1.0).
   2. Ville de Nancy, « Mémorial virtuel des morts pour la France de Nancy lors des différents conflits militaires »,
      data.gouv.fr, morts-pour-la-france.csv (seulement le conflit « 1GM » : 4 497 fiches) — ODbL 1.0 (la partie
      Nancy du pack reste sous ODbL).
   Écartés : « Les soldats du Var » (licence non précisée, données de MémorialGenWeb), Antibes (pas de date de naissance),
   et les listes des villes et départements publiées ailleurs que sur data.gouv.fr (non vérifiables d'ici).

Format du pack (SQLite) : meta(key, value) ; sources(id, nom, licence, mention, url) ;
records(id, nom, prenoms, naiss, annee, lieu, dep, deces, lieu_deces, unite, grade, cote, ref, sexe, src, autre) ;
names(cle, id) : nom (et nom de jeune fille, autre nom) en MAJUSCULES sans accents ni espaces, pour chercher.
"""
import argparse
import base64
import csv
import datetime
import gzip
import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import sqlite3
import sys
import time
import unicodedata
import urllib.parse
import urllib.request

UA = 'Mozilla/5.0 (LCNDA, fabrication des bases officielles)'
HERE = os.path.dirname(os.path.abspath(__file__))

LEONORE_ZIP = 'https://static.data.gouv.fr/resources/les-donnees-du-hackathon-des-archives-nationales/20181203-162447/metadonnees-leonore.zip'
LEONORE_ZIP_SIZE = 159681310
LEONORE_CSV = 'metadonnes_leonore/export_complet_metadonnees_leonore_ordre_alphabetique_csv.csv'
CANOPE = 'https://static.data.gouv.fr/resources/premiere-guerre-mondiale-les-poilus-morts-pour-la-france-a-completer/20181112-001255/tracesdesoldats-lespoilus.csv'
NANCY = 'https://static.data.gouv.fr/resources/memorial-virtuel-des-morts-pour-la-france-de-nancy-lors-des-differents-conflits-militaires/20181214-161104/morts-pour-la-france.csv'
WDQS = 'https://query.wikidata.org/sparql'

SOURCES = {
    'leonore': ('Archives nationales — base Léonore (export des métadonnées, 2018)', 'Informations publiques (CRPA art. L321-1 et L322-1) : réutilisation libre en citant la source ; licence « non spécifiée » sur data.gouv.fr',
                'Archives nationales, base Léonore, export des métadonnées des dossiers de la Légion d’honneur (2018), publié sur data.gouv.fr (« Les données du hackathon des Archives nationales »)',
                'https://www.data.gouv.fr/datasets/les-donnees-du-hackathon-des-archives-nationales/'),
    'wikidata': ('Wikidata', 'CC0 1.0', 'Liens vers les notices du site Léonore : Wikidata (P640, P11152), CC0', 'https://www.wikidata.org/wiki/Property:P11152'),
    'canope': ('Réseau Canopé — Les Poilus morts pour la France (à compléter)', 'Open Data Commons Attribution (ODC-BY 1.0)',
               'Réseau Canopé, « Première Guerre mondiale - Les Poilus morts pour la France (à compléter) », data.gouv.fr (2018), d’après Mémoire des hommes (Ministère des Armées)',
               'https://www.data.gouv.fr/datasets/premiere-guerre-mondiale-les-poilus-morts-pour-la-france-a-completer/'),
    'nancy': ('Ville de Nancy — Mémorial virtuel des morts pour la France', 'Open Database License (ODbL 1.0)',
              'Ville de Nancy, « Mémorial virtuel des morts pour la France de Nancy lors des différents conflits militaires », data.gouv.fr (2018), ODbL',
              'https://www.data.gouv.fr/datasets/memorial-virtuel-des-morts-pour-la-france-de-nancy-lors-des-differents-conflits-militaires/'),
}

DEPTS = ("Ain=01;Aisne=02;Allier=03;Alpes-de-Haute-Provence=04;Basses-Alpes=04;Hautes-Alpes=05;Alpes-Maritimes=06;Ardèche=07;Ardennes=08;"
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
         "Martinique=972;Guyane=973;La Réunion=974;Réunion=974;Mayotte=976")


def fold(s):
    s = unicodedata.normalize('NFKD', str(s or '')).encode('ascii', 'ignore').decode().lower().replace('œ', 'oe')
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


DEPT_CODES = {fold(n): c for n, c in (p.split('=') for p in DEPTS.split(';'))}


def cle(s):
    """la clé d'un nom : MAJUSCULES sans accents, sans espaces ni tirets (« de La Tour » → « DELATOUR ») — comme bo_key() en PHP"""
    s = unicodedata.normalize('NFKD', str(s or '').replace('œ', 'oe').replace('Œ', 'OE')).encode('ascii', 'ignore').decode().upper()
    return re.sub(r'[^A-Z]+', '', s)


def clean(s, n=200):
    return re.sub(r'\s+', ' ', str(s or '').replace('\xa0', ' ')).strip()[:n]


def get(url, path, size=None):
    """télécharge une fois (le fichier gardé sert la fois suivante) ; plusieurs essais"""
    if os.path.exists(path) and (size is None or os.path.getsize(path) == size):
        return path
    for i in range(6):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=300) as r, open(path + '.tmp', 'wb') as out:
                shutil.copyfileobj(r, out, 1 << 20)
            if size is not None and os.path.getsize(path + '.tmp') != size:
                raise IOError('taille inattendue : %d au lieu de %d' % (os.path.getsize(path + '.tmp'), size))
            os.replace(path + '.tmp', path)
            return path
        except Exception as e:  # noqa: BLE001
            print('  essai %d : %s' % (i + 1, e), file=sys.stderr)
            time.sleep(10 * (i + 1))
    raise SystemExit('Téléchargement impossible : ' + url)


def iso_date(s):
    """« 1843/00/00 » → « 1843 » (mois ou jour inconnus)"""
    d = _iso_date(s)
    d = re.sub(r'-00(-00)?$', '', d)
    return re.sub(r'^(\d{4}-\d\d)-00$', r'\1', d)


def _iso_date(s):
    """« 1877/01/11 », « 22/05/1922 », « 1866/01 », « 06-05-1892 », « 1895 » → « 1877-01-11 », « 1866-01 », « 1895 »"""
    s = clean(s, 40)
    m = re.match(r'^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$', s)
    if m: return '%s-%02d-%02d' % (m[1], int(m[2]), int(m[3]))
    m = re.match(r'^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$', s)
    if m: return '%s-%02d-%02d' % (m[3], int(m[2]), int(m[1]))
    m = re.match(r'^(\d{4})[/-](\d{1,2})$', s)
    if m: return '%s-%02d' % (m[1], int(m[2]))
    m = re.match(r'^(\d{1,2})[/-](\d{4})$', s)
    if m: return '%s-%02d' % (m[2], int(m[1]))
    m = re.match(r'^(\d{4})$', s)
    if m: return m[1]
    return ''


def year_of(iso):
    return int(iso[:4]) if re.match(r'^\d{4}', iso or '') else None


def commune_dep(s):
    """« Gap (05) » → (Gap, 05) ; « 88 - Vosges » → ('', 88)"""
    s = clean(s)
    m = re.match(r'^(.*?)\s*\((\d{2,3}|2[AB])\)$', s)
    if m: return clean(m[1]), m[2]
    m = re.match(r'^(\d{2,3}|2[AB])\s*-\s*(.*)$', s)
    if m: return '', m[1]
    return s, ''


class Pack:
    def __init__(self, path, kind, title):
        if os.path.exists(path): os.remove(path)
        self.db = sqlite3.connect(path)
        self.kind = kind
        self.db.executescript('''
            PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; PRAGMA page_size=4096;
            CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);
            CREATE TABLE sources(id TEXT PRIMARY KEY, nom TEXT, licence TEXT, mention TEXT, url TEXT, n INTEGER DEFAULT 0);
            CREATE TABLE records(id INTEGER PRIMARY KEY, nom TEXT, prenoms TEXT, naiss TEXT, annee INTEGER, lieu TEXT, dep TEXT,
                deces TEXT, lieu_deces TEXT, unite TEXT, grade TEXT, cote TEXT, ref TEXT, sexe TEXT, src TEXT, autre TEXT);
            CREATE TABLE names(cle TEXT NOT NULL, id INTEGER NOT NULL, PRIMARY KEY(cle, id)) WITHOUT ROWID;''')
        self.meta = {'kind': kind, 'format': '1', 'title': title, 'built': datetime.date.today().isoformat()}
        self.n = 0
        self.by_src = {}

    def add(self, r, alt=()):
        if not cle(r['nom']): return False
        self.n += 1
        r = dict(r); r['id'] = self.n; r['annee'] = year_of(r.get('naiss', ''))
        cols = ['id', 'nom', 'prenoms', 'naiss', 'annee', 'lieu', 'dep', 'deces', 'lieu_deces', 'unite', 'grade', 'cote', 'ref', 'sexe', 'src', 'autre']
        self.db.execute('INSERT INTO records VALUES(%s)' % ','.join('?' * len(cols)), [r.get(c) if r.get(c) not in ('', None) else None for c in cols])
        for k in {cle(r['nom']), *[cle(a) for a in alt if a]}:
            if k: self.db.execute('INSERT OR IGNORE INTO names VALUES(?,?)', (k, self.n))
        self.by_src[r['src']] = self.by_src.get(r['src'], 0) + 1
        return True

    def close(self, sources, extra=None):
        for sid in sources:
            nom, lic, men, url = SOURCES[sid]
            self.db.execute('INSERT INTO sources VALUES(?,?,?,?,?,?)', (sid, nom, lic, men, url, self.by_src.get(sid, 0)))
        self.meta['count'] = str(self.n)
        self.meta.update(extra or {})
        self.db.executemany('INSERT INTO meta VALUES(?,?)', [(k, str(v)) for k, v in self.meta.items()])
        self.db.commit()
        self.db.execute('VACUUM')
        self.db.close()


def finish(path):
    """bo-<sorte>.sqlite → bo-<sorte>.sqlite.gz (+ taille et empreinte dans le rapport)"""
    gz = path + '.gz'
    with open(path, 'rb') as f, gzip.GzipFile(gz, 'wb', compresslevel=9, mtime=0) as out:
        shutil.copyfileobj(f, out, 1 << 20)
    h = hashlib.sha256(open(gz, 'rb').read()).hexdigest()
    return {'file': os.path.basename(gz), 'size': os.path.getsize(gz), 'sqlite_size': os.path.getsize(path), 'sha256': h}


# ═════════════════════════ 🎖️ Morts pour la France ═════════════════════════

ARKO_PREFIX = 'https://www.memoiredeshommes.sga.defense.gouv.fr/fr/arkotheque/arkotheque_visionneuse_archives.php?arko='


def arko(fid):
    """le lien de la visionneuse de Mémoire des hommes d'une fiche (même calcul que bo_mpf_url() en PHP)"""
    s = ('a:8:{s:10:"type_fonds";s:13:"specif_client";s:10:"specif_fct";s:23:"ArkMDHVisionneuseImages";s:18:"specif_nav_par_lot";'
         's:22:"ArkMDHNavigationParLot";s:13:"mdh_fonds_cle";i:1;s:4:"ref2";s:%d:"%s";s:12:"id_ark_fiche";s:%d:"%s";s:9:"pyramidal";b:0;'
         's:12:"image_depart";i:0;}') % (len(fid), fid, len(fid), fid)
    return ARKO_PREFIX + base64.b64encode(s.encode()).decode()


def mdh_ref(url):
    """lien de la liste Canopé → « v:<fiche> » (visionneuse), « d:<ref> » (fiche MPF), « f:<ref> » (fusillés) ou ''"""
    url = clean(url, 2000)
    if 'arko=' in url:
        try:
            s = base64.b64decode(url.split('arko=', 1)[1] + '===').decode('utf-8', 'replace')
        except Exception:  # noqa: BLE001
            return ''
        m = re.search(r'id_ark_fiche";s:\d+:"(\d+)"', s)
        if m and arko(m[1]).split('arko=')[1] == url.split('arko=', 1)[1]:
            return 'v:' + m[1]
        return ''
    m = re.search(r'/(base_morts_pour_la_france_premiere_guerre|fusilles_premiere_guerre)/detail_fiche\.php\?ref=(\d+)', url)
    if m: return ('d:' if m[1].startswith('base') else 'f:') + m[2]
    return ''


def split_canope_name(s):
    """« Emile Victor VALLON » → (VALLON, Emile Victor) ; le nom = les derniers mots en majuscules"""
    words = clean(s).split(' ')
    i = len(words)
    while i > 0 and re.search(r'[A-ZÀ-Ý]', words[i - 1]) and words[i - 1] == words[i - 1].upper():
        i -= 1
    if i == len(words): return clean(s), ''
    if i == 0: return ' '.join(words), ''
    return ' '.join(words[i:]), ' '.join(words[:i])


def read_canope(path):
    rows = []
    with open(path, encoding='utf-8-sig', newline='') as f:
        for x in csv.DictReader(f):
            nom, prenoms = split_canope_name(x.get('nom', ''))
            m = re.search(r'le/en\s+(\S+)', x.get('naissance', ''))
            lieu, dep = commune_dep(x.get('Lieu de naissance', ''))
            if not dep:
                m2 = re.search(r'\((\d{2,3}|2[AB]) - [^)]*\)\s*$', x.get('naissance', ''))
                dep = m2[1] if m2 else ''
            _, ddep = commune_dep(x.get('Département de décès', ''))
            ld = clean(x.get('Lieu de décès', ''))
            pays = clean(x.get('Pays de décès', ''))
            lieu_deces = ld + (' (%s)' % ddep if ddep else (' (%s)' % pays if pays and pays != 'France' else ''))
            rows.append({'nom': nom, 'prenoms': prenoms, 'naiss': iso_date(m[1]) if m else '', 'lieu': lieu, 'dep': dep,
                         'deces': iso_date(x.get('Date de décès', '')), 'lieu_deces': clean(lieu_deces), 'unite': clean(x.get('Unité', '')),
                         'grade': clean(x.get('Grade', '')), 'cote': clean('Classe ' + x['Classe'] if x.get('Classe') else '') + (', matricule ' + clean(x['Matricule au recrutement']) + ' au recrutement de ' + clean(x.get('Bureau de recrutement', '')) if x.get('Matricule au recrutement') else ''),
                         'ref': mdh_ref(x.get('images-href', '')), 'sexe': 'M', 'src': 'canope', 'autre': ''})
    return rows


def read_nancy(path):
    """une ligne entière est parfois entre guillemets (« "1GM,CARY,…" ») : remise d'aplomb avant lecture"""
    rows = []
    lines = open(path, encoding='utf-8-sig').read().splitlines()
    head = next(csv.reader([lines[0]]))
    for line in lines[1:]:
        if line.startswith('"') and line.endswith('"') and line.count(',') > 8 and not line.startswith('"1GM"'):
            line = line[1:-1].replace('""', '"')
        r = next(csv.reader([line]))
        if len(r) != len(head): continue
        x = dict(zip(head, r))
        if x['Nom conflit'] != '1GM': continue
        dep = DEPT_CODES.get(fold(x['Departement de naissance']), '')
        ddep = DEPT_CODES.get(fold(x['Departement de deces']), '')
        lieu_deces = clean(x['Commune de deces']) + (' (%s)' % ddep if ddep else (' (%s)' % clean(x['Pays de deces']) if clean(x['Pays de deces']) not in ('', 'France') else ''))
        rows.append({'nom': clean(x['Nom']).upper(), 'prenoms': clean(x['Prenoms']), 'naiss': iso_date(x['Date de naissance']), 'lieu': clean(x['Commune de naissance']),
                     'dep': dep, 'deces': iso_date(x['Date de deces']), 'lieu_deces': clean(lieu_deces), 'unite': clean(x['Corps']), 'grade': clean(x['Grade']),
                     'cote': re.sub(r'^(\S+) - (.+)$', r'matricule \1 au recrutement de \2', clean(x['Numero matricule'])) if clean(x['Numero matricule']) else '', 'ref': '', 'sexe': 'M', 'src': 'nancy', 'autre': ''})
    return rows


def build_mpf(out, cache, canope=None, nancy=None, fixture=False):
    canope = canope or get(CANOPE, os.path.join(cache, 'canope.csv'))
    nancy = nancy or get(NANCY, os.path.join(cache, 'nancy.csv'))
    path = os.path.join(out, 'bo-mpf.sqlite')
    p = Pack(path, 'mpf', 'Morts pour la France 1914–1918 (listes ouvertes)')
    rep = {}
    for sid, rows in (('canope', read_canope(canope)), ('nancy', read_nancy(nancy))):
        ok = sum(1 for r in rows if p.add(r))
        rep[sid] = {'lues': len(rows), 'gardées': ok, 'avec_naissance': sum(1 for r in rows if r['naiss']), 'avec_lien': sum(1 for r in rows if r['ref'])}
        if not fixture and ok < 1000: raise SystemExit('Trop peu de fiches lues dans %s (%d) : le format a changé ?' % (sid, ok))
    p.close(['canope', 'nancy'], {'fixture': '1' if fixture else ''})
    return {'mpf': {**finish(path), 'records': p.n, 'sources': rep}}


# ═════════════════════════ 🏅 Léonore ═════════════════════════

def leonore_key(cote, dossier):
    """« LH/7 » + « 29 » et « LH//7/29 » (Wikidata) → « LH/7/29 »"""
    return re.sub(r'/+', '/', clean(cote, 80) + ('/' + clean(dossier, 40) if dossier else '')).strip('/')


def wikidata_leonore():
    q = 'SELECT ?cote ?web WHERE { ?p wdt:P640 ?cote ; wdt:P11152 ?web . }'
    for i in range(4):
        try:
            req = urllib.request.Request(WDQS + '?' + urllib.parse.urlencode({'query': q}), headers={'User-Agent': UA, 'Accept': 'text/csv'})
            with urllib.request.urlopen(req, timeout=300) as r:
                rows = list(csv.DictReader(io.StringIO(r.read().decode('utf-8'))))
            out = {}
            for x in rows:
                if re.match(r'^\d{1,8}$', x['web']): out[re.sub(r'/+', '/', x['cote']).strip('/')] = x['web']
            return out
        except Exception as e:  # noqa: BLE001
            print('  Wikidata, essai %d : %s' % (i + 1, e), file=sys.stderr)
            time.sleep(65 * (i + 1))  # « 1 requête par minute » quand le service est chargé
    print('  Wikidata injoignable : pas de liens directs vers les notices cette fois', file=sys.stderr)
    return {}


def leonore_place(s):
    """« Vosges ; Rambervillers » → (Rambervillers, 88) ; « Paris » → (Paris, 75) ; « Algérie ; Oran ; Nédroma » → (Nédroma (Algérie, Oran), '')"""
    parts = [clean(x) for x in str(s or '').split(';') if clean(x)]
    if not parts: return '', ''
    if len(parts) == 1:
        return parts[0], DEPT_CODES.get(fold(parts[0]), '')
    dep = DEPT_CODES.get(fold(parts[0]), '')
    if dep: return ', '.join(parts[1:]), dep
    return '%s (%s)' % (parts[-1], ', '.join(parts[:-1])), ''


def read_leonore(fh):
    r = csv.reader(fh, delimiter=';')
    head = next(r)
    want = ['COTE', 'DOSSIER', 'NOM', 'PRENOM(s)', 'DATE-NAISS', 'LIEU-NAISS', 'NOM2', 'NOM-JF', 'SEXE']
    miss = [c for c in want if c not in head]
    if miss: raise SystemExit('Colonnes absentes de l’export Léonore : %s' % miss)
    ix = {c: head.index(c) for c in want}
    for row in r:
        if len(row) < len(head): continue
        g = lambda c: row[ix[c]]  # noqa: E731
        lieu, dep = leonore_place(g('LIEU-NAISS'))
        yield {'nom': clean(g('NOM')), 'prenoms': clean(g('PRENOM(s)')), 'naiss': iso_date(g('DATE-NAISS')), 'lieu': lieu, 'dep': dep, 'deces': '', 'lieu_deces': '',
               'unite': '', 'grade': '', 'cote': leonore_key(g('COTE'), g('DOSSIER')), 'ref': '', 'sexe': clean(g('SEXE'), 2), 'src': 'leonore',
               'autre': clean(' · '.join(x for x in [('née ' + clean(g('NOM-JF'))) if clean(g('NOM-JF')) else '', ('autre nom : ' + clean(g('NOM2'))) if clean(g('NOM2')) else ''] if x))}, \
              [g('NOM-JF'), g('NOM2') if re.match(r'^[A-ZÀ-Ý\' -]+$', clean(g('NOM2'))) else '']


def build_leonore(out, cache, csv_path=None, wiki=True, fixture=False, web=None):
    web = web if web is not None else (wikidata_leonore() if wiki else {})
    path = os.path.join(out, 'bo-leonore.sqlite')
    p = Pack(path, 'leonore', 'Légion d’honneur — base Léonore (Archives nationales)')
    if csv_path:
        fh = open(csv_path, encoding='latin-1', newline='')
    else:
        # le fichier est compressé en « Deflate64 », que Python ne lit pas : sorti avec l'outil unzip
        zp = get(LEONORE_ZIP, os.path.join(cache, 'metadonnees-leonore.zip'), LEONORE_ZIP_SIZE)
        csv_path = os.path.join(cache, 'leonore.csv')
        if not os.path.exists(csv_path):
            with open(csv_path + '.tmp', 'wb') as o:
                subprocess.run(['unzip', '-p', zp, LEONORE_CSV], stdout=o, check=True)
            os.replace(csv_path + '.tmp', csv_path)
        fh = open(csv_path, encoding='latin-1', newline='')
    lues = linked = 0
    for rec, alt in read_leonore(fh):
        lues += 1
        w = web.get(rec['cote'])
        if w: rec['ref'] = 'w:' + w; linked += 1
        p.add(rec, alt)
    if not fixture and p.n < 300000: raise SystemExit('Trop peu de dossiers lus dans l’export Léonore (%d)' % p.n)
    p.close(['leonore', 'wikidata'] if web else ['leonore'], {'fixture': '1' if fixture else '', 'linked': str(linked)})
    return {'leonore': {**finish(path), 'records': p.n, 'lues': lues, 'liens_wikidata': linked, 'wikidata_total': len(web)}}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('quoi', choices=['mpf', 'leonore', 'tout', 'fixture'])
    ap.add_argument('dossier_fixture', nargs='?')
    ap.add_argument('--dossier', default='bo-sortie')
    ap.add_argument('--sans-wikidata', action='store_true')
    a = ap.parse_args()
    if a.quoi == 'fixture':
        out = a.dossier_fixture or a.dossier
        os.makedirs(out, exist_ok=True)
        rep = build_mpf(out, out, os.path.join(HERE, 'fixture-canope.csv'), os.path.join(HERE, 'fixture-nancy.csv'), fixture=True)
        rep.update(build_leonore(out, out, os.path.join(HERE, 'fixture-leonore.csv'), fixture=True, web={'19800035/1303/50521': '3'}))
        print(json.dumps(rep, ensure_ascii=False, indent=1))
        return
    out = a.dossier; cache = os.path.join(out, 'cache')
    os.makedirs(cache, exist_ok=True)
    rep = {}
    if a.quoi in ('mpf', 'tout'): rep.update(build_mpf(out, cache))
    if a.quoi in ('leonore', 'tout'): rep.update(build_leonore(out, cache, wiki=not a.sans_wikidata))
    old = {}
    rp = os.path.join(out, 'bo-rapport.json')
    if os.path.exists(rp):
        try: old = json.load(open(rp))
        except Exception: old = {}  # noqa: E701
    old.update(rep)
    json.dump(old, open(rp, 'w'), ensure_ascii=False, indent=1)
    print(json.dumps(rep, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
