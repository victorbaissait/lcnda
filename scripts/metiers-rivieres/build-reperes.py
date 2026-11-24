#!/usr/bin/env python3
"""LCNDA — 🌊 Repères de crues : fabrique assets/data/reperes-crues.json.gz (LIVRÉ avec l'app, < 2 Mo).

Source : plateforme nationale collaborative des repères de crues (ministère de la Transition écologique, réseau Vigicrues),
https://www.reperesdecrues.developpement-durable.gouv.fr — export CSV de la recherche, Licence Ouverte (Etalab).
L'export s'arrête à 500 repères par demande : on demande département par département, et, au-delà de 500, par tranches de
dates coupées en deux jusqu'à passer sous 500. Les repères SANS date de crue ne sortent qu'avec la demande entière du
département (quand elle fait moins de 500) : ailleurs ils manquent (c'est dit dans « À propos »).

    python3 scripts/metiers-rivieres/build-reperes.py                 # tous les départements → assets/data/reperes-crues.json.gz
    python3 scripts/metiers-rivieres/build-reperes.py --dep 19 --dep 87 --sortie /tmp/essai.json.gz

Format : {"source", "licence", "url", "built", "cols": [...], "rows": [[lat, lon, insee, commune, rivière, année, mois, jour,
max (1 = plus haute crue connue ici), altitude NGF de l'eau ou null, description, id]]} ; la page du repère (avec sa photo) :
https://www.reperesdecrues.developpement-durable.gouv.fr/repere/<id>.
"""
import argparse
import csv
import datetime
import gzip
import io
import json
import re
import sys
import time
import urllib.parse
import urllib.request

BASE = 'https://www.reperesdecrues.developpement-durable.gouv.fr'
EXPORT = BASE + '/recherche/recherche_repere/export/csv'
DEPS = [f'{i:02d}' for i in range(1, 96) if i != 20] + ['2A', '2B', '971', '972', '973', '974', '976']
CAP = 500


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def fetch(dep, d1=None, d2=None):
    q = [('departement[]', dep)]
    if d1:
        q += [('date_crue_debut', d1), ('date_crue_fin', d2)]
    url = EXPORT + '?' + urllib.parse.urlencode(q)
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'LCNDA-build (genealogie; donnees ouvertes)'})
            with urllib.request.urlopen(req, timeout=300) as r:
                text = r.read().decode('utf-8-sig', 'replace')
            rows = list(csv.reader(io.StringIO(text), delimiter=';'))
            if not rows or not rows[0] or 'Description' not in rows[0][0]:
                raise RuntimeError('export illisible')
            return rows[0], rows[1:]
        except Exception as e:  # noqa: BLE001
            log('  erreur', dep, d1, d2, e)
            time.sleep(5 * (attempt + 1))
    raise RuntimeError(f'export impossible : {dep} {d1} {d2}')


def mid(d1, d2):
    a = datetime.date.fromisoformat(d1).toordinal()
    b = datetime.date.fromisoformat(d2).toordinal()
    m = (a + b) // 2
    return datetime.date.fromordinal(m).isoformat(), datetime.date.fromordinal(m + 1).isoformat()


def collect(dep):
    head, rows = fetch(dep)
    if len(rows) < CAP:
        return head, rows
    out = []
    stack = [('1000-01-01', datetime.date.today().isoformat())]
    while stack:
        d1, d2 = stack.pop()
        _, part = fetch(dep, d1, d2)
        if len(part) >= CAP and d1 != d2:
            a, b = mid(d1, d2)
            stack += [(d1, a), (b, d2)]
            continue
        if len(part) >= CAP:
            log('  ! plus de 500 repères le même jour', dep, d1)
        out += part
    return head, out


def num(s):
    try:
        return float(str(s).replace(',', '.'))
    except ValueError:
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dep', action='append')
    ap.add_argument('--sortie', default='assets/data/reperes-crues.json.gz')
    a = ap.parse_args()
    seen, rows = set(), []
    for dep in a.dep or DEPS:
        head, part = collect(dep)
        ix = {h: i for i, h in enumerate(head)}
        n = 0
        for r in part:
            if len(r) < len(head):
                continue
            url = r[ix['URL']]
            m = re.search(r'/(\d+)/?$', url)
            if not m or m.group(1) in seen:
                continue
            seen.add(m.group(1))
            lat, lon = num(r[ix['Y (WGS84)']]), num(r[ix['X (WGS84)']])
            y = int(r[ix['Année']]) if r[ix['Année']].isdigit() else None
            if lat is None or lon is None or not y:
                continue
            mo = int(r[ix['Mois']]) if r[ix['Mois']].isdigit() else 0
            d = int(r[ix['Jour']]) if r[ix['Jour']].isdigit() else 0
            alt = num(r[ix["Altitude calculée de l'eau (nivellement le plus récent)"]])
            desc = re.sub(r'\s+', ' ', r[ix['Description']]).strip(' -')
            rows.append([round(lat, 5), round(lon, 5), r[ix['Code INSEE']], r[ix['Commune']].title(), r[ix['Hydrographies']].strip(),
                         y, mo, d, 1 if r[ix["Maximum de l'inondation"]] == 'Oui' else 0, round(alt, 2) if alt is not None else None, desc[:140], int(m.group(1))])
            n += 1
        log(dep, n, 'repères')
    rows.sort(key=lambda x: (x[2], x[5]))
    out = {'source': 'Plateforme nationale des repères de crues (ministère de la Transition écologique, Vigicrues)', 'licence': 'Licence Ouverte (Etalab)',
           'url': BASE, 'built': datetime.date.today().isoformat(),
           'note': 'Seuls les repères datés et placés ; export de la recherche par département.',
           'cols': ['lat', 'lon', 'insee', 'commune', 'riviere', 'annee', 'mois', 'jour', 'max', 'alt_ngf', 'description', 'id'], 'rows': rows}
    with gzip.open(a.sortie, 'wt', encoding='utf-8', compresslevel=9) as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    log('écrit', a.sortie, len(rows), 'repères')


if __name__ == '__main__':
    main()
