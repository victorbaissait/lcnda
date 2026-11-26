#!/usr/bin/env python3
"""LCNDA — lot N2 des téléchargements : 🗺 les cadastres napoléoniens et 🛣 les anciens noms des rues publiés en données ouvertes
sur data.gouv.fr (catalogue national, API https://www.data.gouv.fr/api/1/).

    python3 -I scripts/telech-n2/build_cadastres.py OUT_DIR [cadastres] [rues]

  🗺 tn2-cadastres  le CATALOGUE des cadastres napoléoniens ouverts (qui, où, quelle licence, quels fichiers, leur adresse) :
                    les images elles-mêmes (des centaines de Mo à plusieurs Go) ne sont pas copiées dans l'app ; la fiche du
                    village et Cartes anciennes ouvrent le jeu de son département ou de sa ville.
  🛣 tn2-rues        les anciens noms des rues hors de Paris (Paris : br-paris). Aujourd'hui Boulogne-Billancourt
                    (« Historique des dénominations des voies », Licence Ouverte) ; les autres jeux trouvés par la même
                    recherche sont ajoutés s'ils sont sous licence ouverte et ont un fichier CSV ou JSON.

Licence lue pour chaque jeu dans la réponse de data.gouv.fr (champ « license ») : seuls fr-lo, lov2, odc-odbl, cc-by, cc-by-sa,
cc-zero sont gardés ; les autres jeux restent « en lien seulement » (liste link_only), jamais recopiés.
"""
import csv
import io
import json
import os
import re
import sys
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm  # noqa: E402

API = 'https://www.data.gouv.fr/api/1/datasets/'
OPEN = {'fr-lo': 'Licence Ouverte 1.0', 'lov2': 'Licence Ouverte 2.0', 'odc-odbl': 'ODbL 1.0', 'cc-by': 'CC BY 4.0', 'cc-by-sa': 'CC BY-SA 4.0', 'cc-zero': 'CC0 1.0'}
LIC_URL = {'fr-lo': 'https://www.etalab.gouv.fr/licence-ouverte-open-licence', 'lov2': 'https://www.etalab.gouv.fr/licence-ouverte-open-licence',
           'odc-odbl': 'https://opendatacommons.org/licenses/odbl/', 'cc-by': 'https://creativecommons.org/licenses/by/4.0/deed.fr',
           'cc-by-sa': 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr', 'cc-zero': 'https://creativecommons.org/publicdomain/zero/1.0/deed.fr'}
DEPS = {'Hauts-de-Seine': ['92'], 'Doubs': ['25'], 'Vaucluse': ['84'], 'Loiret': ['45'], 'Haute-Garonne': ['31'], 'Bretagne': ['22', '29', '35', '56'],
        'Brest': ['29'], 'Avignon': ['84']}
CITIES = {'Brest': '29019', 'Avignon': '84007', 'Boulogne-Billancourt': '92012'}


def search(q, pages=2):
    out = {}
    for p in range(1, pages + 1):
        d = json.loads(wm.get('https://www.data.gouv.fr/api/2/datasets/search/?' + urllib.parse.urlencode({'q': q, 'page_size': 50, 'page': p})))
        for x in d.get('data') or []:
            out[x['id']] = x
        if not d.get('next_page'):
            break
    return out


def full(did):
    return json.loads(wm.get(API + did + '/'))


def where(title, org):
    t = f'{title} {org}'
    for k, codes in DEPS.items():
        if k.lower() in t.lower():
            return k, codes, CITIES.get(k, '')
    return '', [], ''


def cadastres(out):
    found = search('cadastre napoléonien')
    rows, link_only = [], []
    for did in sorted(found):
        d = full(did)
        if not re.search(r'napol[ée]on|cadastre ancien', d['title'], re.I):
            continue
        org = (d.get('organization') or {}).get('name', '') or (d.get('owner') or {}).get('slug', '')
        zone, deps, ins = where(d['title'], org)
        res = [[r.get('title') or '', (r.get('format') or '').lower(), r.get('url') or '', r.get('filesize')] for r in d.get('resources') or [] if (r.get('url') or '').startswith('https://')]
        row = {'id': did, 'n': d['title'], 'org': org, 'zone': zone, 'deps': deps, 'ins': ins, 'lic': d.get('license') or '', 'url': d.get('page') or f'https://www.data.gouv.fr/datasets/{did}/',
               'upd': (d.get('last_update') or '')[:10], 'res': res[:12], 'kind': 'toponymes' if re.search(r'toponym', d['title'], re.I) else 'parcelles' if re.search(r'parcell|états de section', d['title'], re.I) else 'plans'}
        (rows if row['lic'] in OPEN and res else link_only).append(row)
    for r in rows:
        r['licence'] = OPEN[r['lic']]
        r['licence_url'] = LIC_URL[r['lic']]
    meta = {'source': 'data.gouv.fr (catalogue)', 'url': 'https://www.data.gouv.fr/datasets/?q=cadastre%20napol%C3%A9onien', 'licence': 'Licence de chaque jeu (Licence Ouverte, ODbL), lue dans data.gouv.fr',
            'licence_url': 'https://www.data.gouv.fr/pages/legal/licences/', 'built': wm.today(),
            'what': 'Cadastres napoléoniens publiés en données ouvertes (départements, villes) : le catalogue et l’adresse des fichiers, pas les images',
            'note': 'Les images ne sont pas recopiées dans l’app (trop lourdes) : on ouvre le jeu sur data.gouv.fr ; un plan géoréférencé (WMS, XYZ) peut être posé dans 🗺 Cartes anciennes. Pour les autres départements : les archives départementales (voir 🗺 Cadastre).',
            'fields': ['id', 'n', 'org', 'zone', 'deps', 'ins', 'licence', 'licence_url', 'url', 'upd', 'res', 'kind'], 'rows': [[r[k] for k in ['id', 'n', 'org', 'zone', 'deps', 'ins', 'licence', 'licence_url', 'url', 'upd', 'res', 'kind']] for r in rows],
            'link_only': [{'n': r['n'], 'org': r['org'], 'url': r['url'], 'why': f"licence « {r['lic'] or 'non dite'} »" + ('' if r['res'] else ', aucun fichier')} for r in link_only]}
    print('tn2-cadastres', len(rows), wm.write_gz(out, 'tn2-cadastres.json.gz', meta))


def pick(row, *pats):
    for k in row:
        if any(re.search(p, k, re.I) for p in pats):
            v = str(row[k] or '').strip()
            if v:
                return v
    return ''


def rues(out):
    found = search('historique dénominations voies')
    found.update(search('anciens noms des rues'))
    cities, link_only = [], []
    for did in sorted(found):
        d = full(did)
        if not re.search(r'ancien|historique|caduqu', d['title'], re.I) or not re.search(r'rue|voie', d['title'], re.I):
            continue
        org = (d.get('organization') or {}).get('name', '')
        if 'Ville de Paris' in org:
            continue   # Paris : br-paris (boussole des rues)
        lic = d.get('license') or ''
        res = [r for r in d.get('resources') or [] if (r.get('format') or '').lower() in ('json', 'csv') and (r.get('url') or '').startswith('https://')]
        if lic not in OPEN or not res:
            link_only.append({'n': d['title'], 'org': org, 'url': d.get('page'), 'why': f'licence « {lic or "non dite"} »' + ('' if res else ', aucun fichier')})
            continue
        r = sorted(res, key=lambda r: (r.get('format') or '').lower() != 'json')[0]
        body = wm.get(r['url'], 'application/json' if r['format'].lower() == 'json' else 'text/csv')
        if r['format'].lower() == 'json':
            items = json.loads(body)
            items = items if isinstance(items, list) else items.get('results') or items.get('records') or []
            items = [x.get('fields', x) if isinstance(x, dict) else {} for x in items]
        else:
            txt = body.decode('utf-8-sig', 'replace')
            items = list(csv.DictReader(io.StringIO(txt), delimiter=';' if txt.count(';') > txt.count(',') else ','))
        streets = []
        for it in items:
            old = pick(it, r'ancien', r'^old', r'denomination_?anc', r'nom_?anc')
            new = pick(it, r'actuel', r'nouveau', r'^new', r'nom_?act', r'denomination_?act')
            if not old or not new or old == new:
                continue
            streets.append({'old': old, 'new': new, 'date': pick(it, r'date', r'annee', r'délib|delib'), 'note': pick(it, r'observ', r'comment', r'histor', r'motif')[:300]})
        city = re.sub(r'^(Ville|Commune) d[eu] ', '', org) or d['title']
        zone, deps, ins = where(d['title'], org)
        cities.append({'city': city, 'insee': ins, 'n': d['title'], 'url': d.get('page'), 'licence': OPEN[lic], 'licence_url': LIC_URL[lic], 'upd': (d.get('last_update') or '')[:10], 'streets': streets})
    if not any(c['streets'] for c in cities):
        sys.exit('tn2-rues : aucune rue lue (fichiers changés ?) : rien n’est enregistré')
    meta = {'source': 'data.gouv.fr (jeux des villes)', 'url': 'https://www.data.gouv.fr/datasets/historique-des-denominations-des-voies-de-boulogne-billancourt',
            'licence': ' ; '.join(sorted({c['licence'] for c in cities})), 'licence_url': cities[0]['licence_url'], 'built': wm.today(),
            'what': 'Anciens noms des rues hors de Paris (correspondance ancien nom → nom actuel)', 'cities': cities, 'rows': [s for c in cities for s in c['streets']], 'link_only': link_only}
    print('tn2-rues', sum(len(c['streets']) for c in cities), wm.write_gz(out, 'tn2-rues.json.gz', meta))


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    for k in (sys.argv[2:] or ['cadastres', 'rues']):
        {'cadastres': cadastres, 'rues': rues}[k](sys.argv[1])
