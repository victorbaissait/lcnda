#!/usr/bin/env python3
"""LCNDA — lot C : l'article de chaque commune dans le « Dictionnaire géographique, administratif, postal, statistique,
archéologique, etc. de la France, de l'Algérie et des colonies » d'Adolphe Joanne (Hachette, 1869).

    python3 -I scripts/telech-c/build_joanne.py CACHE_DIR [--out assets/data/tc-joanne]

Source : Internet Archive, https://archive.org/details/dictionnairego00joanuoft (scan de l'Université de Toronto,
« possible-copyright-status: NOT_IN_COPYRIGHT ») ; Adolphe Joanne est mort en 1881 : le texte est dans le domaine public.
On lit le texte OCR fourni par Internet Archive (fichiers _hocr_searchtext.txt.gz et _hocr_pageindex.json.gz, pour savoir à
quelle page est chaque article). Rien n'est réécrit : l'article est copié tel que l'OCR l'a lu (quelques lettres fausses).

Prudence (un article attribué à la mauvaise commune serait pire que rien) : on garde un article seulement si
  - il commence au début d'une ligne par « Nom, » ;
  - il nomme son département (nom de 1869) juste après « Nom, », même un peu mal lu par l'OCR (rapprochement prudent) ;
  - il donne un nombre d'habitants (« 1,234 hab. » ou « 1,234 h. ») ;
  - il fait entre 25 et 9 000 caractères (les chefs-lieux ont de longs articles).
Le résultat est rangé par département d'aujourd'hui (assets/data/tc-joanne/<code>.json.gz) ; l'app cherche la commune par son
nom dans le fichier de son département. Le script s'arrête en erreur (et le workflow n'enregistre rien) si moins de
8 000 articles sont reconnus ou si les communes témoins manquent.

Fabriqué sur GitHub (.github/workflows/telech-c-joanne.yml) : les serveurs de fichiers d'Internet Archive ne sont pas
joignables depuis l'atelier de développement.
"""
import difflib
import gzip
import json
import os
import re
import sys
import unicodedata
import urllib.request
from bisect import bisect_right
from datetime import date

ITEM = 'dictionnairego00joanuoft'
DL = f'https://archive.org/download/{ITEM}/'
UA = {'User-Agent': 'LCNDA data build (genealogy app; one-time download)'}

DEPS = {  # nom en 1869 → codes d'aujourd'hui
    'Ain': ['01'], 'Aisne': ['02'], 'Allier': ['03'], 'Basses-Alpes': ['04'], 'Hautes-Alpes': ['05'], 'Alpes-Maritimes': ['06'], 'Ardèche': ['07'], 'Ardennes': ['08'],
    'Ariège': ['09'], 'Aube': ['10'], 'Aude': ['11'], 'Aveyron': ['12'], 'Bouches-du-Rhône': ['13'], 'Calvados': ['14'], 'Cantal': ['15'], 'Charente': ['16'],
    'Charente-Inférieure': ['17'], 'Cher': ['18'], 'Corrèze': ['19'], 'Corse': ['2A', '2B'], "Côte-d'Or": ['21'], 'Côtes-du-Nord': ['22'], 'Creuse': ['23'],
    'Dordogne': ['24'], 'Doubs': ['25'], 'Drôme': ['26'], 'Eure': ['27'], 'Eure-et-Loir': ['28'], 'Finistère': ['29'], 'Gard': ['30'], 'Haute-Garonne': ['31'],
    'Gers': ['32'], 'Gironde': ['33'], 'Hérault': ['34'], 'Ille-et-Vilaine': ['35'], 'Indre': ['36'], 'Indre-et-Loire': ['37'], 'Isère': ['38'], 'Jura': ['39'],
    'Landes': ['40'], 'Loir-et-Cher': ['41'], 'Loire': ['42'], 'Haute-Loire': ['43'], 'Loire-Inférieure': ['44'], 'Loiret': ['45'], 'Lot': ['46'],
    'Lot-et-Garonne': ['47'], 'Lozère': ['48'], 'Maine-et-Loire': ['49'], 'Manche': ['50'], 'Marne': ['51'], 'Haute-Marne': ['52'], 'Mayenne': ['53'],
    'Meurthe': ['54', '57'], 'Meuse': ['55'], 'Morbihan': ['56'], 'Moselle': ['57', '54'], 'Nièvre': ['58'], 'Nord': ['59'], 'Oise': ['60'], 'Orne': ['61'],
    'Pas-de-Calais': ['62'], 'Puy-de-Dôme': ['63'], 'Basses-Pyrénées': ['64'], 'Hautes-Pyrénées': ['65'], 'Pyrénées-Orientales': ['66'], 'Bas-Rhin': ['67'],
    'Haut-Rhin': ['68', '90'], 'Rhône': ['69'], 'Haute-Saône': ['70'], 'Saône-et-Loire': ['71'], 'Sarthe': ['72'], 'Savoie': ['73'], 'Haute-Savoie': ['74'],
    'Seine': ['75', '92', '93', '94'], 'Seine-Inférieure': ['76'], 'Seine-et-Marne': ['77'], 'Seine-et-Oise': ['78', '91', '95'], 'Deux-Sèvres': ['79'],
    'Somme': ['80'], 'Tarn': ['81'], 'Tarn-et-Garonne': ['82'], 'Var': ['83'], 'Vaucluse': ['84'], 'Vendée': ['85'], 'Vienne': ['86'], 'Haute-Vienne': ['87'],
    'Vosges': ['88'], 'Yonne': ['89']}
# communes témoins : (nom, code du département) qui doivent être trouvées
WITNESS = [('Allanche', '15'), ('Tulle', '19'), ('Plouaret', '22'), ('Aubagne', '13'), ('Lannion', '22')]


def fold(s):
    s = unicodedata.normalize('NFD', str(s)).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


# un nom en plusieurs mots (« Côtes-du-Nord ») : les mots séparés par une ou plusieurs espaces
DEP_RE = [(re.compile(r'(?<![a-z])' + r'\s+'.join(re.escape(w) for w in fold(n).split()) + r'(?![a-z])'), n) for n in sorted(DEPS, key=len, reverse=True)]
DEP_FOLD = {fold(n): n for n in DEPS}
# chef-lieu de chaque département en 1869 : l'article dit « 75 kil. de St-Brieuc » (distance au chef-lieu), ce qui permet
# de retrouver le département quand son nom est trop mal lu par l'OCR
PREF = {'Ain': 'Bourg', 'Aisne': 'Laon', 'Allier': 'Moulins', 'Basses-Alpes': 'Digne', 'Hautes-Alpes': 'Gap', 'Alpes-Maritimes': 'Nice',
    'Ardèche': 'Privas', 'Ardennes': 'Mézières', 'Ariège': 'Foix', 'Aube': 'Troyes', 'Aude': 'Carcassonne', 'Aveyron': 'Rodez',
    'Bouches-du-Rhône': 'Marseille', 'Calvados': 'Caen', 'Cantal': 'Aurillac', 'Charente': 'Angoulême', 'Charente-Inférieure': 'La Rochelle',
    'Cher': 'Bourges', 'Corrèze': 'Tulle', 'Corse': 'Ajaccio', "Côte-d'Or": 'Dijon', 'Côtes-du-Nord': 'Saint-Brieuc', 'Creuse': 'Guéret',
    'Dordogne': 'Périgueux', 'Doubs': 'Besançon', 'Drôme': 'Valence', 'Eure': 'Évreux', 'Eure-et-Loir': 'Chartres', 'Finistère': 'Quimper',
    'Gard': 'Nîmes', 'Haute-Garonne': 'Toulouse', 'Gers': 'Auch', 'Gironde': 'Bordeaux', 'Hérault': 'Montpellier', 'Ille-et-Vilaine': 'Rennes',
    'Indre': 'Châteauroux', 'Indre-et-Loire': 'Tours', 'Isère': 'Grenoble', 'Jura': 'Lons-le-Saunier', 'Landes': 'Mont-de-Marsan',
    'Loir-et-Cher': 'Blois', 'Loire': 'Saint-Étienne', 'Haute-Loire': 'Le Puy', 'Loire-Inférieure': 'Nantes', 'Loiret': 'Orléans',
    'Lot': 'Cahors', 'Lot-et-Garonne': 'Agen', 'Lozère': 'Mende', 'Maine-et-Loire': 'Angers', 'Manche': 'Saint-Lô', 'Marne': 'Châlons',
    'Haute-Marne': 'Chaumont', 'Mayenne': 'Laval', 'Meurthe': 'Nancy', 'Meuse': 'Bar-le-Duc', 'Morbihan': 'Vannes', 'Moselle': 'Metz',
    'Nièvre': 'Nevers', 'Nord': 'Lille', 'Oise': 'Beauvais', 'Orne': 'Alençon', 'Pas-de-Calais': 'Arras', 'Puy-de-Dôme': 'Clermont',
    'Basses-Pyrénées': 'Pau', 'Hautes-Pyrénées': 'Tarbes', 'Pyrénées-Orientales': 'Perpignan', 'Bas-Rhin': 'Strasbourg', 'Haut-Rhin': 'Colmar',
    'Rhône': 'Lyon', 'Haute-Saône': 'Vesoul', 'Saône-et-Loire': 'Mâcon', 'Sarthe': 'Le Mans', 'Savoie': 'Chambéry', 'Haute-Savoie': 'Annecy',
    'Seine': 'Paris', 'Seine-Inférieure': 'Rouen', 'Seine-et-Marne': 'Melun', 'Seine-et-Oise': 'Versailles', 'Deux-Sèvres': 'Niort',
    'Somme': 'Amiens', 'Tarn': 'Albi', 'Tarn-et-Garonne': 'Montauban', 'Var': 'Draguignan', 'Vaucluse': 'Avignon', 'Vendée': 'Napoléon',
    'Vienne': 'Poitiers', 'Haute-Vienne': 'Limoges', 'Vosges': 'Épinal', 'Yonne': 'Auxerre'}
# Paris est cité dans presque tous les articles (« 513 kil. de Paris ») : la Seine se reconnaît par son nom seulement
PREF_RE = [(re.compile(r'kil\s*(?:de|d)\s*' + r'\s+'.join(re.escape(w) for w in fold(v).split()) + r'(?![a-z])'), d) for d, v in PREF.items() if d != 'Seine']


def by_pref(t):
    head = re.sub(r'\bst(e?)\b', r'saint\1', fold(t[:400]))
    found = {d for rx, d in PREF_RE if rx.search(head)}
    return found.pop() if len(found) == 1 else None


def dep_of(t, name):
    """Le département de l'article : d'abord le nom exact dans le début, sinon le morceau juste après « Nom, »
    rapproché d'un nom de département malgré les lettres mal lues par l'OCR (« C(5leï-du-JVord », « Boiuhes-du-Rhône »)."""
    rest = t[len(name):].lstrip(' ,')
    chunk = fold(re.split(r',', rest, maxsplit=1)[0])[:40]
    if chunk in DEP_FOLD:
        return DEP_FOLD[chunk]
    pref = by_pref(t)  # la distance au chef-lieu d'abord : « C6les-du-Nord » ne doit pas devenir « Nord »
    if pref:
        return pref
    for rx, n in DEP_RE:  # le nom exact dans le morceau, s'il en couvre presque tout
        m = rx.search(chunk)
        if m and m.end() - m.start() >= 0.8 * len(chunk):
            return n
    near = difflib.get_close_matches(chunk, list(DEP_FOLD), n=2, cutoff=0.72)
    # prudence : un seul candidat net (deux noms proches, comme « haute loire » et « loire », on ne devine pas)
    if near and (len(near) == 1 or difflib.SequenceMatcher(None, chunk, near[0]).ratio() - difflib.SequenceMatcher(None, chunk, near[1]).ratio() > 0.08):
        return DEP_FOLD[near[0]]
    return None
HEAD = re.compile(r"^([A-ZÀ-Ý][A-Za-zÀ-ÿ'’\-]+(?:[ \-](?:[A-Za-zÀ-ÿ'’]+|\([^)]{1,25}\)))*?)\s*,\s+(.{20,})$")
POP = re.compile(r'\d[\d,. ]*\s*(?:hab|h)\.')


def fetch(cache, name):
    p = os.path.join(cache, name)
    if not os.path.exists(p) or os.path.getsize(p) < 1000:
        req = urllib.request.Request(DL + name, headers=UA)
        with urllib.request.urlopen(req, timeout=600) as r, open(p, 'wb') as o:
            while True:
                b = r.read(1 << 20)
                if not b:
                    break
                o.write(b)
    return p


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    cache = sys.argv[1]
    out = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else os.path.join(os.path.dirname(__file__), '..', '..', 'assets', 'data', 'tc-joanne')
    os.makedirs(cache, exist_ok=True)
    text = gzip.open(fetch(cache, f'{ITEM}_hocr_searchtext.txt.gz'), 'rt', encoding='utf-8').read()
    try:
        pidx = json.load(gzip.open(fetch(cache, f'{ITEM}_hocr_pageindex.json.gz'), 'rt'))
        starts = [int(p[0]) for p in pidx]
    except Exception as e:  # pas de numéro de page : le lien ira vers la recherche dans le livre
        print('index des pages illisible :', e, file=sys.stderr)
        starts = []
    # les lignes, avec leur position dans le texte
    pos, lines = 0, []
    for ln in text.split('\n'):
        lines.append((pos, ln.strip()))
        pos += len(ln) + 1
    entries, cur = [], None
    for at, ln in lines:
        m = HEAD.match(ln)
        if m and not re.match(r'^(Le|La|Les|Pop|Arr|Ch|Cant|Comm|Voir|V)\b\.?$', m.group(1)):
            if cur:
                entries.append(cur)
            cur = {'n': m.group(1).strip(), 't': ln, 'at': at}
        elif cur and ln:
            cur['t'] += ' ' + ln
    if cur:
        entries.append(cur)
    by_dep, kept = {}, 0
    for e in entries:
        t = re.sub(r'\s+', ' ', e['t']).replace('- ', '').strip()
        if not (25 <= len(t) <= 9000) or not POP.search(t[:600]):
            continue
        dep = dep_of(t, e['n'])
        if not dep:
            continue
        page = bisect_right(starts, e['at']) - 1 if starts else None
        row = {'n': e['n'], 't': t, 'p': page if page is not None and page >= 0 else None, 'dep1869': dep}
        for code in DEPS[dep]:
            by_dep.setdefault(code, []).append(row)
        kept += 1
    print(f'{len(entries)} débuts d’article, {kept} articles de communes gardés')
    missing = [w for w in WITNESS if not any(fold(r['n']) == fold(w[0]) for r in by_dep.get(w[1], []))]
    if missing:  # diagnostic dans le journal : comment les communes témoins apparaissent dans le texte
        for w in missing:
            hits = [ln for _, ln in lines if fold(ln).startswith(fold(w[0]))][:4] or [ln for _, ln in lines if fold(w[0]) in fold(ln)][:4]
            for e in entries:
                if fold(e['n']) == fold(w[0]):
                    t = re.sub(r'\s+', ' ', e['t']).replace('- ', '').strip()
                    print(f'    article {e["n"]!r} : {len(t)} car., habitants={bool(POP.search(t[:600]))}, département={dep_of(t, e["n"])} | {t[:200]}')
            print(f'— témoin {w[0]} ({w[1]}) : {len(hits)} ligne(s) contenant le nom')
            for h in hits:
                print('   ', h[:260])
            near = [r for r in sum(by_dep.values(), []) if fold(w[0]) in fold(r['n'])][:3]
            for r in near:
                print('    gardé sous', repr(r['n']), r['dep1869'], '|', r['t'][:160])
    if kept < 8000 or len(missing) > 1:
        sys.exit(f'trop peu d’articles reconnus ({kept}) ou communes témoins absentes : {missing} — rien n’est écrit')
    os.makedirs(out, exist_ok=True)
    meta = {'title': 'Joanne, Dictionnaire géographique, administratif, postal… de la France (1869) — articles des communes',
            'source': 'Adolphe Joanne, Dictionnaire géographique, administratif, postal, statistique, archéologique, etc. de la France, de l’Algérie et des colonies, Hachette, 1869 — texte OCR d’Internet Archive',
            'url': f'https://archive.org/details/{ITEM}', 'licence': 'Domaine public (Adolphe Joanne, mort en 1881) ; scan Internet Archive / University of Toronto (NOT_IN_COPYRIGHT)',
            'built': date.today().isoformat(), 'note': 'Texte OCR brut (quelques lettres fausses) ; p = numéro de la page du scan (lien /page/n<p>).'}
    for code, rows in sorted(by_dep.items()):
        with gzip.open(os.path.join(out, f'{code}.json.gz'), 'wt', encoding='utf-8') as o:
            json.dump({**meta, 'dep': code, 'rows': rows}, o, ensure_ascii=False, separators=(',', ':'))
    total = sum(os.path.getsize(os.path.join(out, f)) for f in os.listdir(out))
    print(f'{out} : {len(by_dep)} départements, {total} octets ; témoins absents : {missing}')


if __name__ == '__main__':
    main()
