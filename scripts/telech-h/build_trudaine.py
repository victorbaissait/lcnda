#!/usr/bin/env python3
"""🗺 Lot H — Atlas de Trudaine (1745-1780) : th-trudaine, les planches déposées sur Wikimedia Commons, par commune.

L'Atlas lui-même (Archives nationales, CP/F/14/8443 à 8507, base Archim) n'est pas joignable depuis l'atelier : on ne copie rien
de la base, et l'app n'y fait que des liens. Sur Wikimedia Commons, des planches et extraits ont été déposés (catégorie
« Atlas de Trudaine » et ses sous-catégories) : on garde pour chaque fichier le TITRE, la licence écrite par Commons
(extmetadata LicenseShortName, en général « Public domain » : œuvre du XVIIIe siècle) et la commune que le titre nomme
(un nom de commune de France unique, d'au moins 4 lettres, hors « généralité de … ») — l'image n'est pas copiée : l'app met un
lien « ↗ la planche » qui s'ouvre sur un clic. Communes : assets/data/cc-communes.json.gz (Licence Ouverte), déjà dans l'app.
Lancer : python3 -I scripts/telech-h/build_trudaine.py [dossier de sortie]
"""
import json, os, re, sys, unicodedata, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
CAT = 'Category:Atlas de Trudaine'
API = 'https://commons.wikimedia.org/w/api.php?'


def api(params):
    return json.loads(wm.get(API + urllib.parse.urlencode({**params, 'format': 'json', 'formatversion': '2'})))


def members(cat, depth, seen, files):
    if cat in seen or len(files) > 4000:
        return
    seen.add(cat)
    cont = {}
    while True:
        d = api({'action': 'query', 'list': 'categorymembers', 'cmtitle': cat, 'cmlimit': '500', 'cmtype': 'file|subcat', **cont})
        for m in d['query']['categorymembers']:
            if m['ns'] == 6:
                files.setdefault(m['title'], cat)
            elif m['ns'] == 14 and depth > 0:
                members(m['title'], depth - 1, seen, files)
        if 'continue' not in d:
            break
        cont = {'cmcontinue': d['continue']['cmcontinue']}


def fold(s):
    return re.sub(r'[^a-z0-9]+', ' ', unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode().lower()).strip()


def main():
    files = {}
    members(CAT, 2, set(), files)
    print(f'  {len(files)} fichiers dans la catégorie et ses sous-catégories')
    lic = {}
    titles = list(files)
    for i in range(0, len(titles), 50):
        d = api({'action': 'query', 'prop': 'imageinfo', 'iiprop': 'extmetadata', 'iiextmetadatafilter': 'LicenseShortName|DateTimeOriginal', 'titles': '|'.join(titles[i:i + 50])})
        for p in d['query']['pages']:
            md = (p.get('imageinfo') or [{}])[0].get('extmetadata', {})
            lic[p['title']] = re.sub(r'<[^>]+>', '', md.get('LicenseShortName', {}).get('value', ''))
    com = wm.communes(ROOT)
    byname = {}
    for insee, (n, lat, lon) in com.items():
        byname.setdefault(fold(n), []).append((insee, n, lat, lon))
    uniq = {k: v[0] for k, v in byname.items() if len(v) == 1 and len(k) >= 4}
    rows = []
    for t in titles:
        if not re.match(r'(?i)^(public domain|pd|cc0|cc[- ]by)', lic.get(t, '')):
            continue
        name = re.sub(r'^File:', '', t).rsplit('.', 1)[0]
        clean = re.sub(r'(?i)g[ée]n[ée]ralit[ée] (de |du |d.)\S+( \S+)?|archives nationales|atlas( de)? trudaine|cp[- ]f[- ]14\S*|btv1b\w+', ' ', name)
        words = fold(clean).split()
        hit = None
        for n in (4, 3, 2, 1):  # le nom le plus long d'abord (« Saint-Denis » avant « Denis »)
            for j in range(len(words) - n + 1):
                k = ' '.join(words[j:j + n])
                if k in uniq:
                    hit = uniq[k]; break
            if hit:
                break
        if not hit:
            continue
        insee, n, lat, lon = hit
        rows.append([t[5:], insee, n, lat, lon, lic[t][:40]])
    rows.sort(key=lambda r: r[1])
    meta = {'source': 'Wikimedia Commons, catégorie « Atlas de Trudaine »', 'licence': 'Domaine public (planches du XVIIIe siècle, licence écrite par Commons fichier par fichier)',
            'licence_url': 'https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia/fr', 'url': 'https://commons.wikimedia.org/wiki/' + urllib.parse.quote(CAT.replace(' ', '_')),
            'built': wm.today(), 'what': 'Planches de l’Atlas de Trudaine (1745-1780) déposées sur Wikimedia Commons, par commune nommée dans le titre (seulement le titre et le lien : l’image n’est pas copiée)',
            'archim': 'https://www.culture.gouv.fr/documentation/archim/atlasdetrudaine.htm', 'cotes': 'Archives nationales, CP/F/14/8443 à 8507',
            'files_seen': len(files), 'fields': ['file', 'insee', 'commune', 'lat', 'lon', 'lic'], 'rows': rows}
    size = wm.write_gz(OUT, 'th-trudaine.json.gz', meta)
    print(f'th-trudaine : {len(rows)} planches placées sur {len(files)}, {size} octets')


if __name__ == '__main__':
    main()
