#!/usr/bin/env python3
"""🏛 Lot N — archives et mémoire : les packs tn-*.json.gz (déposés dans la version « telech-n-donnees » du dépôt GitHub,
téléchargés par l'app sur demande : Réglages → 🗂 Données, ou le bouton ⤓ d'une fiche ; lib/sources_n1.php).

Chaque source a sa licence LUE sur data.gouv.fr au moment de la fabrication (champ « license ») : le script s'arrête si elle
n'est plus celle attendue. Rien sur des personnes vivantes : seulement des registres, des inventaires, des lieux, des familles et
institutions, des personnes dont la mort est connue (autorités, morts pour la France, plaques 1939-1945).

  registres     🏛 registres d'état civil en ligne, commune par commune et année par année : AD 04, AD 22 (paroissiaux et état
                civil), AD 65 (registres 1893-1922 prêtés par les communes) — Licence Ouverte 2.0
  inv-communes  📚 inventaires des archives communales sur FranceArchives (≈ 4 000) — Licence Ouverte 2.0
  inv-dep       📚 inventaires des Archives départementales sur FranceArchives (≈ 56 000) — Licence Ouverte 2.0
  lieux         📍 lieux indexés par FranceArchives (communes de France seulement, avec leur code INSEE) — Licence Ouverte 2.0
  autorites     👪 familles et institutions indexées par FranceArchives (+ personnes dont l'année de mort est connue) — Licence Ouverte 2.0
  mpf           🎖 morts pour la France publiés par les collectivités (Loire-Atlantique, Toulouse, Lorient, Orvault, Belfort 1914-1918
                et 1939-1945, Clermont-Ferrand : Licence Ouverte 2.0 ; Nancy : ODbL). Antibes exclu : pas de date de naissance.
  monuments     🗿 le lien vers la fiche MémorialGenWeb du monument aux morts de chaque commune (CC BY-SA ; aucun nom de soldat copié)
  plaques       🕯 plaques commémoratives 1939-1945 de Paris (Ville de Paris, ODbL)
En lien seulement (pas de pack) : notaires de Paris du Minutier central et naturalisations de 1887/1890 (hackathon des Archives
nationales : licence « non spécifiée » sur data.gouv.fr, page de réutilisation des Archives nationales non lue).

Lancer : python3 -I scripts/telech-n/build_archives.py <dossier de sortie> [tout|registres|inv-communes|…|manifest]
Essais : TN_FIXTURES=<dossier> (chaque source lue dans <dossier>/<id>) — tests/test-lot-n-archives.js
"""
import hashlib, json, os, re, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import nw

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DG = 'https://www.data.gouv.fr/datasets/'
LO = ('Licence Ouverte 2.0 (Etalab)', 'https://www.etalab.gouv.fr/licence-ouverte-open-licence/')
ODBL = ('ODbL 1.0', 'https://opendatacommons.org/licenses/odbl/1-0/')
CCBYSA = ('CC BY-SA', 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr')
NOW = int(time.strftime('%Y'))
FA_INV_C = 'liste-des-inventaires-darchives-communales-sur-francearchives'
FA_INV_D = 'liste-des-inventaires-darchives-departementales-sur-francearchives'
FA_LIEUX = 'portail-francearchives-les-lieux-des-archives'
FA_AUT = 'portail-francearchives-autorites-personnes-familles-et-institutions'
STATIC = 'https://static.data.gouv.fr/resources/'


def pack(key, rows, fields, sources, what, extra=None):
    lic = sorted({s['licence'] for s in sources})
    return {'kind': f'tn-{key}', 'v': 1, 'built': nw.today(), 'what': what, 'fields': fields, 'rows': rows, 'sources': sources,
            'licence': ' ; '.join(lic), 'licence_url': sources[0]['licence_url'] if sources else '', 'url': sources[0]['url'] if sources else '', **(extra or {})}


def src(label, slug, licence, publisher):
    return {'label': label, 'url': DG + slug, 'licence': licence[0], 'licence_url': licence[1], 'publisher': publisher}


def cut(s, n):
    s = re.sub(r'\s+', ' ', str(s or '')).strip()
    return s if len(s) <= n else s[:n - 1].rstrip() + '…'


# ───────── 🏛 registres en ligne ─────────
REG = [
    {'id': 'ad04', 'dep': '04', 'slug': 'registres-d-etat-civil-numerises-par-les-archives-departementales-des-alpes-de-haute-provence',
     'url': 'https://www.datasud.fr/fr/dataset/datasets/1768/resource/2219/download/', 'online': None,
     'label': 'Archives départementales des Alpes-de-Haute-Provence — registres d’état civil numérisés', 'publisher': 'Archives départementales des Alpes-de-Haute-Provence'},
    {'id': 'ad22-bms', 'dep': '22', 'slug': 'archives-departementales-des-cotes-darmor-inventaire-de-la-collection-des-registres-paroissiaux-accessible-en-ligne',
     'url': 'https://datarmor.cotesdarmor.fr/data-fair/api/v1/datasets/archives-departementales-des-cotes-darmor-inventaire-de-la-collection-des-registres-paroissiaux-accessible-en-ligne/raw',
     'online': 1, 'act': 'BMS', 'label': 'Archives départementales des Côtes-d’Armor — registres paroissiaux accessibles en ligne', 'publisher': 'Département des Côtes-d’Armor'},
    {'id': 'ad22-ec', 'dep': '22', 'slug': 'archives-departementales-des-cotes-darmor-inventaire-de-la-collection-des-registres-detat-civil-accessible-en-ligne',
     'url': 'https://datarmor.cotesdarmor.fr/data-fair/api/v1/datasets/archives-departementales-des-cotes-darmor-inventaire-de-la-collection-des-registres-detat-civil-accessible-en-ligne/raw',
     'online': 1, 'label': 'Archives départementales des Côtes-d’Armor — registres d’état civil accessibles en ligne', 'publisher': 'Département des Côtes-d’Armor'},
    {'id': 'ad65', 'dep': '65', 'slug': 'communes-dont-les-registres-detat-civil-de-1893-a-1922-pretes-par-les-communes-sont-en-ligne-sur-le-site-internet-des-archives-departementales',
     'url': 'https://opendata.ha-py.fr/api/explore/v2.1/catalog/datasets/departementdeshautespyrenees_numerisation_des_registres_d_etat_civil_empruntes_d/exports/csv?use_labels=true',
     'online': 1, 'from': 1893, 'to': 1922, 'label': 'Archives départementales des Hautes-Pyrénées — registres d’état civil de 1893 à 1922 en ligne', 'publisher': 'Département des Hautes-Pyrénées'},
]


def diag(sid, data, found):
    """une source qui ne donne aucune ligne : ses colonnes dans le journal, pour corriger la lecture au prochain passage"""
    print(f'⚠ {sid} : 0 ligne gardée — colonnes trouvées {found} ; {nw.headers(data)}', file=sys.stderr)
    print(f'⚠ {sid} : 0 ligne gardée — colonnes trouvées {found} ; {nw.headers(data)}')


def act_of(s, default='EC'):
    f = nw.fold(s)
    if not f:
        return default
    if re.search(r'\btable', f):
        return 'TD'
    if re.search(r'paroiss|bapt|\bbms\b|catholique|protestant', f):
        return 'BMS'
    if re.search(r'naiss', f):
        return 'N'
    if re.search(r'mari|publication', f):
        return 'M'
    if re.search(r'deces|sepult|inhum', f):
        return 'D'
    return default


def online_of(s, default):
    f = nw.fold(s)
    if not f:
        return default
    if re.search(r'\b(non|pas|a venir|en cours|bientot|indisponible|lacune|absent|false|0)\b', f):
        return 0
    if re.search(r'\b(oui|en ligne|ligne|consultable|disponible|true|1|x)\b', f) or re.match(r'^\d+$', f):
        return 1
    return default


def build_registres(com):
    rows, sources, report = [], [], {}
    for s in REG:
        try:
            lic = nw.licence_of(s['slug'], ['lov2', 'fr-lo'])
            data = nw.read_any(nw.get(s['id'], s['url']))
        except Exception as e:  # noqa — une source injoignable n'arrête pas les autres
            report[s['id']] = f'injoignable : {e}'
            print('⚠', s['id'], e, file=sys.stderr)
            continue
        c_ins = nw.col(data, 'code insee', 'insee', 'code commune', 'cog', 'code officiel geographique')
        c_com = nw.col(data, 'commune', 'nom commune', 'nom de la commune', 'localite', 'paroisse', 'lieu', 'nom', avoid=('canton', 'zone'))
        c_act = nw.col(data, 'type d acte', 'type acte', 'nature', 'type', 'acte', 'categorie', 'serie')
        c_from = nw.col(data, 'date debut', 'debut', 'annee debut', 'date de debut', 'du', 'premiere annee', 'date min')
        c_to = nw.col(data, 'date fin', 'fin', 'annee fin', 'date de fin', 'au', 'derniere annee', 'date max')
        c_dates = nw.col(data, 'dates extremes', 'dates', 'periode', 'annees', 'date')
        c_on = nw.col(data, 'mise en ligne', 'en ligne', 'statut', 'etat', 'online', 'disponibilite', 'consultation')
        c_vues = nw.col(data, 'nombre de vues', 'vues', 'nb vues', 'images')
        c_note = nw.col(data, 'observations', 'observation', 'remarque', 'remarques', 'commentaire', 'note')
        c_cote = nw.col(data, 'cote', 'cotes')
        n = 0
        for r in data:
            name = r.get(c_com, '') if c_com else ''
            raw = r.get(c_ins, '').strip().upper() if c_ins else ''
            digits = re.sub(r'\D', '', raw)
            ins = raw if re.match(r'^\d[\dAB]\d{3}$', raw) else (digits.zfill(5) if len(digits) in (4, 5) else '')
            if ins and nw.dep_of_insee(ins) != s['dep']:
                ins = ''
            if not ins:
                ins = com.find(s['dep'], name)
            if not ins and not name:
                continue
            y1 = nw.year(r.get(c_from)) if c_from else None
            y2 = nw.year(r.get(c_to)) if c_to else None
            if (y1 is None or y2 is None) and c_dates:
                ys = [int(y) for y in re.findall(r'(1[5-9]\d{2}|20[0-2]\d)', r.get(c_dates, ''))]
                if ys:
                    y1 = y1 if y1 is not None else min(ys)
                    y2 = y2 if y2 is not None else max(ys)
            y1 = y1 if y1 is not None else s.get('from')
            y2 = y2 if y2 is not None else s.get('to', y1)
            if y1 is None:
                continue
            if y2 is None or y2 < y1:
                y2 = y1
            on = online_of(r.get(c_on, ''), s['online']) if c_on else s['online']
            if on is None and c_vues:
                v = re.sub(r'\D', '', r.get(c_vues, ''))
                on = 1 if v and int(v) > 0 else (0 if v == '0' else None)
            note = cut(' · '.join(x for x in [r.get(c_cote, '') if c_cote else '', r.get(c_note, '') if c_note else ''] if x), 140)
            rows.append([s['dep'], ins, com.info.get(ins, (name,))[0] if ins else cut(name, 80), s.get('act') or act_of(r.get(c_act, '') if c_act else ''), y1, y2, on, note, len(sources)])
            n += 1
        sources.append({**src(s['label'], s['slug'], LO, s['publisher']), 'dep': s['dep'], 'licence_dg': lic})
        report[s['id']] = n
        if not n:
            diag(s['id'], data, {'commune': c_com, 'insee': c_ins, 'acte': c_act, 'debut': c_from, 'fin': c_to, 'dates': c_dates})
    if not rows:
        raise RuntimeError('aucun registre lu')
    rows.sort(key=lambda r: (r[0], r[1] or r[2], r[3], r[4]))
    return pack('registres', rows, ['dep', 'insee', 'commune', 'acte', 'from', 'to', 'online', 'note', 'src'], sources,
                'Registres d’état civil et paroissiaux numérisés et mis en ligne, commune par commune, par les Archives départementales qui publient cette liste.',
                {'report': report, 'deps': sorted({s['dep'] for s in sources})})


# ───────── 📚 inventaires FranceArchives ─────────
INV_C_URL = STATIC + FA_INV_C + '/20261108-121613/frac-liste-inventaires-francearchives.csv'
INV_D_URL = STATIC + FA_INV_D + '/20261108-120716/frad-liste-inventaires-francearchives.csv'


def dg_resource(slug, title_rx, fallback):
    """l'adresse du fichier le plus récent du jeu (elle change à chaque mise à jour) ; sinon celle notée ici"""
    if os.environ.get('TN_FIXTURES'):
        return fallback
    try:
        d = json.loads(nw.get('dg-' + slug, f'https://www.data.gouv.fr/api/1/datasets/{slug}/'))
        for r in d.get('resources') or []:
            if re.search(title_rx, str(r.get('title') or ''), re.I) and str(r.get('url') or '').startswith('https://'):
                return r['url']
    except Exception as e:  # noqa
        print('⚠', slug, e, file=sys.stderr)
    return fallback


def serie_of(cote):
    m = re.match(r'^\s*(\d{0,3}\s?[A-Z]{1,3})(?=[\s\d/._-]|$)', str(cote or ''))
    return re.sub(r'\s+', ' ', m.group(1)).strip() if m else ''


def build_inv(key, com):
    slug, url, sid = (FA_INV_C, INV_C_URL, 'fa-inv-communes') if key == 'inv-communes' else (FA_INV_D, INV_D_URL, 'fa-inv-dep')
    nw.licence_of(slug, ['lov2', 'fr-lo'])
    data = nw.read_csv(nw.get(sid, dg_resource(slug, r'inventaires.*\.csv$', url)))
    rows = []
    for r in data:
        dep = str(r.get('_departement', '')).strip()
        m = re.match(r'^(\d[\dAB]?\d?)', dep)
        dep = m.group(1).zfill(2) if m else nw.DEPT_BY_FOLD.get(nw.fold(dep), '')
        ins = str(r.get('_insee', '')).strip().upper()
        ins = ins if re.match(r'^\d[\dAB]\d{2,3}$', ins) else ''
        name = r.get('_commune', '')
        if not ins and name and dep:
            ins = com.find(dep, name)
        if ins and not dep:
            dep = nw.dep_of_insee(ins)
        titre = cut(r.get('titre') or r.get('intitule') or r.get('intitulé'), 180)
        if not titre:
            continue
        y1, y2 = nw.year(r.get('_date_debut')), nw.year(r.get('_date_fin'))
        dates = cut(r.get('dates'), 60)
        theme = cut(r.get('_theme'), 80)
        cotes = cut(r.get('cotes'), 50)
        fich = cut(r.get('fichier'), 80)
        if key == 'inv-communes':
            rows.append([ins, dep, cut(name, 80), titre, dates, y1, y2, cotes, theme, cut(r.get('producteur'), 100), fich])
        else:
            rows.append([dep, ins, cut(name, 80), titre, dates, y1, y2, cotes, theme, serie_of(cotes), fich])
    if not rows:
        raise RuntimeError(f'{key} : aucune ligne lue')
    if key == 'inv-communes':
        rows.sort(key=lambda r: (r[0] or r[1], r[5] or 9999))
        fields = ['insee', 'dep', 'commune', 'titre', 'dates', 'from', 'to', 'cotes', 'theme', 'producteur', 'fichier']
        what = 'Les inventaires des archives communales publiés sur FranceArchives : ce que la mairie a gardé (registres anciens, cadastre, délibérations…).'
        label = 'FranceArchives — liste des inventaires d’archives communales'
    else:
        rows.sort(key=lambda r: (r[0], r[9], r[5] or 9999))
        fields = ['dep', 'insee', 'commune', 'titre', 'dates', 'from', 'to', 'cotes', 'theme', 'serie', 'fichier']
        what = 'Les inventaires des Archives départementales publiés sur FranceArchives (séries B notaires et justice, L Révolution, Q biens nationaux, R conscription, X assistance…).'
        label = 'FranceArchives — liste des inventaires d’Archives départementales'
    return pack(key, rows, fields, [src(label, slug, LO, 'Ministère de la Culture — Service interministériel des Archives de France')], what)


# ───────── 📍 lieux FranceArchives ─────────
LIEUX_URL = STATIC + FA_LIEUX + '/20260625-083546/francearchives-autorites-lieux-donnees-ouvertes-202606.csv'


def build_lieux(com):
    nw.licence_of(FA_LIEUX, ['lov2', 'fr-lo'])
    data = nw.read_csv(nw.get('fa-lieux', dg_resource(FA_LIEUX, r'lieux.*\.csv$', LIEUX_URL)))
    c_url = nw.col(data, 'url de francearchives', 'francearchives')
    c_lab = nw.col(data, 'libelle de francearchives', 'libelle', 'label')
    c_pt = nw.col(data, 'latitude et longitude wgs 84', 'latitude et longitude', 'wgs 84', 'coordonnees')
    rows, seen = [], set()
    for r in data:
        m = re.search(r'/location/(\d+)', r.get(c_url, ''))
        lab = r.get(c_lab, '')
        mm = re.match(r'^(.*?)\s*\(([^()]*),\s*France\)\s*$', lab)
        if not m or not mm:
            continue
        name, dname = mm.group(1).strip(), mm.group(2).strip()
        dep = nw.DEPT_BY_FOLD.get(nw.fold(dname), '')
        ins = com.find(dep, name) if dep else ''
        if not ins or ins in seen:
            continue
        seen.add(ins)
        p = re.search(r'POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)', r.get(c_pt, '') if c_pt else '')
        rows.append([ins, int(m.group(1)), cut(name, 80), round(float(p.group(2)), 4) if p else None, round(float(p.group(1)), 4) if p else None])
    if not rows:
        raise RuntimeError('lieux : aucune commune reconnue')
    rows.sort()
    return pack('lieux', rows, ['insee', 'id', 'nom', 'lat', 'lon'],
                [src('FranceArchives — les lieux des archives (référentiel des lieux indexés)', FA_LIEUX, LO, 'Ministère de la Culture — Service interministériel des Archives de France')],
                'Pour chaque commune de France, la page FranceArchives de tout ce que les archives ont indexé sous son nom.')


# ───────── 👪 familles et institutions FranceArchives ─────────
AUT_URL = STATIC + FA_AUT + '/20260625-085644/francearchives-autorites-personnes-institutions-donnees-ouvertes-202606.csv'


def type_of(s):
    f = nw.fold(s)
    if re.search(r'fam', f):
        return 'f'
    if re.search(r'corp|collectiv|institution|organisation|organisme', f):
        return 'i'
    if re.search(r'pers', f):
        return 'p'
    return ''


def death_year(label):
    """« Dupont, Jean (1750-1820) » → 1820 ; « (….-1820) », « (? - 1820) », « (mort en 1820) » ; None si inconnue"""
    m = re.search(r'\(([^()]*?)\)\s*$', label or '')
    if not m:
        return None
    t = m.group(1)
    mm = re.search(r'(?:-|–|—|†|mort en|décédé en|deced)\s*(?:vers\s*|ca\.?\s*)?(\d{3,4})\s*$', t)
    if mm:
        y = int(mm.group(1))
        return y if y <= NOW else None
    return None


def build_autorites():
    nw.licence_of(FA_AUT, ['lov2', 'fr-lo'])
    data = nw.read_csv(nw.get('fa-autorites', dg_resource(FA_AUT, r'autorites.*\.csv$', AUT_URL)))
    c_type = nw.col(data, 'types', 'type', 'type d autorite')
    c_lab = nw.col(data, 'libelle de francearchives', 'libelle', 'label')
    c_url = nw.col(data, 'url de francearchives', 'francearchives', avoid=('producteur', 'notice'))
    c_wd = nw.col(data, 'url de wikidata', 'wikidata')
    c_bnf = nw.col(data, 'url de databnf', 'databnf', 'data bnf', 'bnf')
    rows, n_p = [], 0
    for r in data:
        t = type_of(r.get(c_type, ''))
        lab = cut(r.get(c_lab, ''), 160)
        m = re.search(r'/agent/(\d+)', r.get(c_url, '')) or re.search(r'(\d{5,})', r.get(c_url, ''))
        if not t or not lab or not m:
            continue
        d = None
        if t == 'p':
            d = death_year(lab)
            if d is None:
                continue      # une personne n'entre que si l'année de sa mort est connue (rien sur des vivants)
            n_p += 1
        wq = re.search(r'(Q\d+)', r.get(c_wd, '')) if c_wd else None
        bn = re.search(r'(ark:/12148/cb\w+|/(\d{8,})\b)', r.get(c_bnf, '')) if c_bnf else None
        rows.append([t, lab, int(m.group(1)), wq.group(1) if wq else '', bn.group(1) if bn else '', d])
    if not rows:
        raise RuntimeError('autorités : aucune ligne lue')
    rows.sort(key=lambda r: (r[0], nw.fold(r[1])))
    return pack('autorites', rows, ['t', 'label', 'id', 'wd', 'bnf', 'mort'],
                [src('FranceArchives — autorités personnes, familles et institutions', FA_AUT, LO, 'Ministère de la Culture — Service interministériel des Archives de France')],
                'Les fonds de famille, seigneuries, couvents, études de notaire, institutions indexés par FranceArchives ; une personne seulement si l’année de sa mort est connue.',
                {'persons': n_p})


# ───────── 🎖 morts pour la France des collectivités ─────────
ODS = '/api/explore/v2.1/catalog/datasets/{}/exports/json'
MPF = [
    {'id': 'mpf-44', 'slug': 'memorial-virtuel-des-morts-pour-la-france-de-loire-atlantique-au-cours-de-la-premiere-guerre-mondiale-2', 'lic': LO, 'dg': ['lov2', 'fr-lo'],
     'url': 'https://data.loire-atlantique.fr' + ODS.format('224400028_memorial-virtuel-morts-pour-france-loire-atlantique-1e-guerre-mond'), 'war': '1914-1918',
     'label': 'Mémorial virtuel des morts pour la France de Loire-Atlantique (1914-1918)', 'publisher': 'Département de Loire-Atlantique'},
    {'id': 'mpf-toulouse', 'slug': 'toulousains-morts-pour-la-france-1914-1919-ville-de-toulouse', 'lic': LO, 'dg': ['lov2', 'fr-lo'],
     'url': 'https://data.toulouse-metropole.fr' + ODS.format('toulousains-morts-pour-la-france-1914-1919'), 'war': '1914-1918',
     'label': 'Toulousains morts pour la France 1914-1919', 'publisher': 'Ville de Toulouse'},
    {'id': 'mpf-lorient', 'slug': 'lorientais-morts-pour-la-france-ville-de-lorient', 'lic': LO, 'dg': ['lov2', 'fr-lo'],
     'url': 'https://www.opendata56.fr' + ODS.format('lorientais-morts-pour-la-france-ville-de-lorient-analyse-par-commune'), 'war': '',
     'label': 'Lorientais morts pour la France', 'publisher': 'Ville de Lorient'},
    {'id': 'mpf-orvault', 'slug': 'morts-pour-la-france-1914-1918-de-la-ville-dorvault', 'lic': LO, 'dg': ['lov2', 'fr-lo'],
     'url': 'https://data.nantesmetropole.fr' + ODS.format('214401143_poilus_orvault'), 'war': '1914-1918',
     'label': 'Morts pour la France 1914-1918 de la ville d’Orvault', 'publisher': 'Ville d’Orvault (Nantes Métropole)'},
    {'id': 'mpf-belfort-1418', 'slug': 'noms-de-tous-les-belfortains-morts-pour-la-france-au-cours-de-la-grande-guerre-1', 'lic': LO, 'dg': ['lov2', 'fr-lo'],
     'url': 'https://dcat-server.azurewebsites.net/e9cc1c2ce0774524a11ae08a9d7e0f65/MeyPDoncyI2S14-3MUCdnH4tvQJw0/download/bfcea880f1f44e4fadb9a78573e44ef9/cd536677307e4f87a4c332ea0f6947c8',
     'war': '1914-1918', 'label': 'Belfortains morts pour la France (1914-1918)', 'publisher': 'Grand Belfort'},
    {'id': 'mpf-belfort-3945', 'slug': 'noms-de-tous-les-belfortains-morts-pour-la-france-au-cours-de-la-seconde-guerre-mondiale-1', 'lic': LO, 'dg': ['lov2', 'fr-lo'],
     'url': 'https://dcat-server.azurewebsites.net/e9cc1c2ce0774524a11ae08a9d7e0f65/MeyPDoncyI2S14-3MUCdnH4tvQJw0/download/bf2116b4935d4e75b2bce08f90face2c/8722a587e29d49beb5a9a252e2082d50',
     'war': '1939-1945', 'label': 'Belfortains morts pour la France (1939-1945)', 'publisher': 'Grand Belfort'},
    {'id': 'mpf-clermont', 'slug': 'soldats-morts-pour-la-france-nes-dans-le-puy-de-dome-ville-de-clermont-ferrand-4', 'lic': LO, 'dg': ['lov2', 'fr-lo'],
     'url': 'https://opendata.clermontmetropole.eu' + ODS.format('soldats-morts-pour-la-france-nes-dans-le-puy-de-dome-ville-de-clermont-ferrand'), 'war': '',
     'label': 'Soldats morts pour la France nés dans le Puy-de-Dôme (Clermont-Ferrand)', 'publisher': 'Clermont Auvergne Métropole'},
    {'id': 'mpf-nancy', 'slug': 'memorial-virtuel-des-morts-pour-la-france-de-nancy-lors-des-differents-conflits-militaires', 'lic': ODBL, 'dg': ['odc-odbl'],
     'url': STATIC + 'memorial-virtuel-des-morts-pour-la-france-de-nancy-lors-des-differents-conflits-militaires/20181214-161104/morts-pour-la-france.csv', 'war': '',
     'label': 'Mémorial virtuel des morts pour la France de Nancy', 'publisher': 'Ville de Nancy'},
]


def war_of(s, default, y):
    f = nw.fold(s)
    if re.search(r'1914|1918|grande guerre|premiere guerre|14 18', f):
        return '1914-1918'
    if re.search(r'1939|1945|seconde guerre|deuxieme guerre|39 45', f):
        return '1939-1945'
    if re.search(r'1870|1871', f):
        return '1870-1871'
    if re.search(r'indochine', f):
        return 'Indochine'
    if re.search(r'algerie|afn|afrique du nord', f):
        return 'Algérie'
    if default:
        return default
    if y:
        return '1914-1918' if 1914 <= y <= 1921 else '1939-1945' if 1939 <= y <= 1946 else '1870-1871' if 1870 <= y <= 1871 else ''
    return ''


def build_mpf():
    rows, sources, report = [], [], {}
    for s in MPF:
        try:
            nw.licence_of(s['slug'], s['dg'])
            data = nw.read_any(nw.get(s['id'], s['url']))
        except Exception as e:  # noqa
            report[s['id']] = f'injoignable : {e}'
            print('⚠', s['id'], e, file=sys.stderr)
            continue
        PLACE = ('lieu', 'commune', 'departement', 'ville', 'pays', 'dept', 'localite', 'cause', 'circonstance', 'insee', 'code', 'region')
        c_nom = nw.col(data, 'nom', 'nom de famille', 'patronyme', 'nom du soldat', 'nom usuel', avoid=('prenom', 'lieu', 'commune', 'unite', 'monument', 'ville', 'regiment'),
                       loose=('nomdefamille', 'patronyme', 'nomdusoldat', 'nom'))
        c_pre = nw.col(data, 'prenoms', 'prenom', 'prenom s', loose=('prenom',))
        c_full = nw.col(data, 'nom et prenoms', 'nom et prenom', 'nom prenom', 'nom prenoms', 'identite', 'nom complet', loose=('nometprenom', 'nomprenom', 'identite'))
        if c_full:   # « nom et prénoms » dans une seule colonne : ni le nom ni le prénom à part
            c_nom = None if c_nom == c_full else c_nom
            c_pre = None if c_pre == c_full else c_pre
        c_bd = nw.col(data, 'date de naissance', 'naissance date', 'date naissance', 'ne le', 'annee de naissance', 'naissance', avoid=PLACE, loose=('datenaiss', 'naissance', 'naiss', 'nele'))
        c_bp = nw.col(data, 'lieu de naissance', 'commune de naissance', 'lieu naissance', 'ne a', 'ville de naissance', loose=('lieudenaiss', 'lieunaiss', 'communedenaiss', 'villedenaiss'))
        c_dd = nw.col(data, 'date de deces', 'date deces', 'deces date', 'date du deces', 'mort le', 'annee de deces', 'deces', 'date de la mort',
                      avoid=PLACE, loose=('datedeces', 'datedudeces', 'deces', 'datedemort', 'mortle', 'disparu'))
        c_dp = nw.col(data, 'lieu de deces', 'commune de deces', 'lieu deces', 'lieu du deces', 'mort a', loose=('lieudedeces', 'lieudeces', 'lieududeces', 'communededeces'))
        c_war = nw.col(data, 'conflit', 'guerre', 'periode')
        c_gr = nw.col(data, 'grade')
        c_un = nw.col(data, 'unite', 'regiment', 'corps')
        c_url = nw.col(data, 'lien', 'url', 'fiche', 'lien vers la fiche')
        n = 0
        for r in data:
            nom, pre = (r.get(c_nom, '') if c_nom else ''), (r.get(c_pre, '') if c_pre else '')
            if not nom and c_full:
                parts = r.get(c_full, '').split()
                up = [p for p in parts if p.isupper() and len(p) > 1]
                nom = ' '.join(up) or (parts[0] if parts else '')
                pre = ' '.join(p for p in parts if p not in up) if up else ' '.join(parts[1:])
            nom, pre = cut(nom, 60), cut(pre, 80)
            bd = nw.iso_date(r.get(c_bd, '')) if c_bd else ''
            dd = nw.iso_date(r.get(c_dd, '')) if c_dd else ''
            if not nom or not (bd or dd):
                continue
            yd = nw.year(dd)
            if not yd and not nw.year(bd):
                continue
            u = r.get(c_url, '') if c_url else ''
            u = u if re.match(r'^https?://[^\s"<>]+$', u) else ''
            rows.append([len(sources), nom.upper(), pre, bd, cut(r.get(c_bp, ''), 80) if c_bp else '', dd, cut(r.get(c_dp, ''), 80) if c_dp else '',
                         war_of(r.get(c_war, '') if c_war else '', s['war'], yd), cut(r.get(c_gr, ''), 40) if c_gr else '', cut(r.get(c_un, ''), 80) if c_un else '', u])
            n += 1
        sources.append({**src(s['label'], s['slug'], s['lic'], s['publisher']), 'war': s['war']})
        report[s['id']] = n
        if not n:
            diag(s['id'], data, {'nom': c_nom, 'prenoms': c_pre, 'nom+prenoms': c_full, 'naissance': c_bd, 'deces': c_dd})
    if not rows:
        raise RuntimeError('morts pour la France : aucune ligne lue')
    rows.sort(key=lambda r: (nw.fold(r[1]), nw.fold(r[2]), r[3]))
    return pack('mpf', rows, ['src', 'nom', 'prenoms', 'naissance', 'lieu_naissance', 'deces', 'lieu_deces', 'conflit', 'grade', 'unite', 'url'], sources,
                'Les morts pour la France publiés par des collectivités (département, villes), avec leur date de naissance ou de mort.', {'report': report})


# ───────── 🗿 monuments aux morts (MémorialGenWeb) ─────────
MGW_URL = STATIC + 'liste-des-monuments-aux-morts/20160809-205040/mgw_mam.csv'


def build_monuments(com):
    nw.licence_of('liste-des-monuments-aux-morts', ['cc-by-sa'])
    data = nw.read_csv(nw.get('mgw-mam', MGW_URL))
    keys = nw.keys_of(data)
    c_dep = nw.col(data, 'departement pays', 'departement', 'dep', loose=('partement', 'pays')) or (keys[0] if keys else None)
    c_vil = nw.col(data, 'ville', 'commune', loose=('ville', 'commune')) or (keys[1] if len(keys) > 1 else None)
    c_url = nw.col(data, 'connexion', 'lien', 'url', loose=('connexion', 'lien', 'url'))
    if not c_url:   # la colonne du lien : celle dont les cases contiennent « idsource= »
        c_url = next((k for k in keys if any('idsource=' in str(r.get(k, '')) for r in data[:50])), None)
    rows = []
    for r in data:
        m = re.search(r'idsource=(\d+)', r.get(c_url, ''))
        dep = str(r.get(c_dep, '')).strip().upper()
        if not m or not re.match(r'^(\d{2,3}|2A|2B)$', dep):
            continue
        name = r.get(c_vil, '')
        rows.append([dep, com.find(dep, name), cut(name, 80), int(m.group(1))])
    if not rows:
        diag('mgw-mam', data, {'dep': c_dep, 'ville': c_vil, 'lien': c_url})
        raise RuntimeError('monuments : aucune ligne lue')
    rows.sort()
    return pack('monuments', rows, ['dep', 'insee', 'commune', 'id'],
                [src('MémorialGenWeb — liste des monuments aux morts', 'liste-des-monuments-aux-morts', CCBYSA, 'MémorialGenWeb')],
                'Le lien vers la fiche MémorialGenWeb du monument aux morts de chaque commune (les noms restent sur MémorialGenWeb).',
                {'link': 'https://www.memorialgenweb.org/memorial3/html/fr/resultcommune.php?idsource={id}', 'built_from': '2016'})


# ───────── 🕯 plaques 1939-1945 de Paris ─────────
PLAQUES_URL = 'https://opendata.paris.fr' + ODS.format('plaques_commemoratives_1939-1945')


def build_plaques():
    nw.licence_of('plaques-commemoratives-1939-1945', ['odc-odbl'])
    data = nw.read_any(nw.get('paris-plaques', PLAQUES_URL))
    c_txt = nw.col(data, 'texte', 'texte de la plaque', 'texte plaque', 'inscription', 'libelle', 'legende', 'titre', 'intitule', 'description', 'designation',
                   avoid=('adresse', 'voie', 'arrondissement'), loose=('texte', 'inscription', 'libelle', 'legende', 'plaque', 'description', 'commemor', 'hommage'))
    c_txt = c_txt or nw.longest(data, avoid=('adresse', 'voie', 'geo', 'url', 'lien', 'photo', 'image'))
    c_nom = nw.col(data, 'nom', 'nom de la personne', 'personne', 'personnalite', 'nom prenom', 'nom et prenom', avoid=('voie', 'rue', 'lieu', 'adresse'), loose=('personn', 'nomprenom', 'nom'))
    c_pre = nw.col(data, 'prenom', 'prenoms', loose=('prenom',))
    if c_nom and c_nom == c_pre:
        c_nom = None
    c_qual = nw.col(data, 'qualite', 'qualification', 'fonction', 'statut', 'motif', 'evenement', loose=('qualit', 'motif', 'evenement'))
    c_date = nw.col(data, 'date', 'date de deces', 'date deces', 'annee', avoid=('pose', 'maj', 'mise a jour', 'creation', 'modif'), loose=('datedeces', 'datedudeces'))
    c_adr = nw.col(data, 'adresse', 'lieu', 'adresse complete', 'voie', 'adresse de la plaque', loose=('adresse', 'voie', 'emplacement'))
    c_arr = nw.col(data, 'arrondissement', 'arr', 'code postal', 'ardt')
    c_id = nw.col(data, 'identifiant', 'id', 'objectid', 'recordid')
    c_pt = nw.col(data, 'geo point 2d', 'geo point', 'coordonnees', 'geom')
    rows = []
    for i, r in enumerate(data):
        t = r.get(c_txt, '') if c_txt else ''
        who = ' '.join(x for x in [r.get(c_pre, '') if c_pre and c_pre != c_nom else '', r.get(c_nom, '') if c_nom and c_nom != c_txt else ''] if x).strip()
        if who and nw.fold(who) not in nw.fold(t):   # sans texte (ou un texte qui ne nomme pas) : « Prénom NOM, qualité, date »
            t = ' — '.join(x for x in [', '.join(x for x in [who, r.get(c_qual, '') if c_qual else '', r.get(c_date, '') if c_date else ''] if x), t] if x)
        t = cut(t, 600)
        if not t:
            continue
        la, lo = r.get('_lat'), r.get('_lon')
        if la is None and c_pt:
            m = re.match(r'^\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)', r.get(c_pt, ''))
            la, lo = (float(m.group(1)), float(m.group(2))) if m else (None, None)
        arr = re.sub(r'\D', '', r.get(c_arr, '')) if c_arr else ''
        arr = int(arr[-2:]) if arr and len(arr) >= 2 and 1 <= int(arr[-2:]) <= 20 else (int(arr) if arr and 1 <= int(arr) <= 20 else None)
        rows.append([cut(r.get(c_id, '') if c_id else str(i + 1), 30), t, cut(r.get(c_adr, '') if c_adr else '', 120), arr,
                     round(float(la), 5) if la is not None else None, round(float(lo), 5) if lo is not None else None])
    if not rows:
        diag('paris-plaques', data, {'texte': c_txt, 'nom': c_nom, 'adresse': c_adr})
        raise RuntimeError('plaques : aucune ligne lue')
    return pack('plaques', rows, ['id', 'texte', 'adresse', 'arr', 'lat', 'lon'],
                [src('Ville de Paris — plaques commémoratives 1939-1945', 'plaques-commemoratives-1939-1945', ODBL, 'Ville de Paris')],
                'Les plaques qui honorent, à Paris, des résistants, des déportés, des fusillés de 1939-1945, là où ils vivaient ou sont tombés.')


# ───────── le sommaire de la version GitHub ─────────
def manifest(out):
    packs = {}
    for f in sorted(os.listdir(out)):
        m = re.match(r'^tn-([a-z-]+)\.json\.gz$', f)
        if not m:
            continue
        p = os.path.join(out, f)
        import gzip
        d = json.load(gzip.open(p))
        b = open(p, 'rb').read()
        packs[m.group(1)] = {'name': f, 'size': len(b), 'sha256': hashlib.sha256(b).hexdigest(), 'built': d.get('built', ''), 'rows': len(d.get('rows') or []),
                             'licence': d.get('licence', ''), 'what': d.get('what', '')}
    m = {'version': time.strftime('%Y-%m'), 'packs': packs}
    json.dump(m, open(os.path.join(out, 'telech-n-manifest.json'), 'w'), ensure_ascii=False, indent=1)
    return m


KEYS = ['registres', 'inv-communes', 'inv-dep', 'lieux', 'autorites', 'mpf', 'monuments', 'plaques']


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'tn-sortie')
    what = sys.argv[2] if len(sys.argv) > 2 else 'tout'
    todo = KEYS if what == 'tout' else [w for w in what.split(',') if w in KEYS]
    if what != 'manifest' and not todo:
        sys.exit(f'quoi = {what} : inconnu ({", ".join(KEYS)}, tout, manifest)')
    com = nw.Communes(ROOT) if set(todo) & {'registres', 'inv-communes', 'inv-dep', 'lieux', 'monuments'} else None
    failed = []
    for k in todo:
        try:
            p = {'registres': lambda: build_registres(com), 'inv-communes': lambda: build_inv('inv-communes', com), 'inv-dep': lambda: build_inv('inv-dep', com),
                 'lieux': lambda: build_lieux(com), 'autorites': build_autorites, 'mpf': build_mpf, 'monuments': lambda: build_monuments(com), 'plaques': build_plaques}[k]()
            size = nw.write_gz(out, f'tn-{k}.json.gz', p)
            print(f'✓ tn-{k} : {len(p["rows"])} lignes, {size} octets', p.get('report', ''))
        except Exception as e:  # noqa — un pack raté n'empêche pas les autres
            failed.append(k)
            print(f'✗ tn-{k} : {e}', file=sys.stderr)
    m = manifest(out)
    print(json.dumps({k: (v['rows'], v['size']) for k, v in m['packs'].items()}, ensure_ascii=False))
    if failed and len(failed) == len(todo):
        sys.exit('rien de fabriqué : ' + ', '.join(failed))


if __name__ == '__main__':
    main()
