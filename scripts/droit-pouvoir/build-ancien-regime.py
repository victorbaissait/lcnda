#!/usr/bin/env python3
"""🏛️ Sa paroisse sous l'Ancien Régime — fabrique assets/data/dp-ancien-regime.json.gz depuis l'« Atlas d'Ancien Régime »
de Thomas Fressin (https://github.com/t-fressin/atlas-ancien-regime, version 1.0.3).

  git clone --depth 1 https://github.com/t-fressin/atlas-ancien-regime.git /chemin/atlas
  python3 -I scripts/droit-pouvoir/build-ancien-regime.py /chemin/atlas

Ce qu'on lit : donnees/lieux/lieux_1789.csv (une ligne par commune actuelle : généralité, bailliage ou sénéchaussée, diocèse,
province, gouvernement, parlement, en 1789, avec la certitude de chaque rattachement) et les propriétés (sans les tracés) des
couches GeoJSON (nom de Brette, rang, bailliage principal, chef-lieu et son code INSEE ; province ecclésiastique du diocèse ;
nature de la cour et cour d'appel ; classe du gouvernement ; attribution complète de chaque entité).
Licence : CC BY-SA 4.0 pour le tableau des lieux (il réunit les diocèses et provinces, qui dérivent de cartes de Wikimedia
Commons sous CC BY-SA 4.0) ; généralités, bailliages et parlements CC BY 4.0. On reprend l'attribution demandée mot pour mot.
Ce qui n'existe pas dans l'atlas (et qu'on ne remplace par rien) : les élections, les coutumes, les subdélégations ; l'état
d'avant 1789 (l'atlas décrit l'état de 1789) ; la paroisse elle-même (le rattachement est celui de la commune actuelle).
"""
import csv, gzip, hashlib, json, os, subprocess, sys, time

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'data', 'dp-ancien-regime.json.gz')
LAYERS = [('g', 'generalite', 'generalites/generalites_1789.geojson'), ('b', 'bailliage', 'bailliages/bailliages_1789.geojson'),
          ('d', 'diocese', 'dioceses/dioceses_1789.geojson'), ('p', 'province', 'provinces/provinces_1789.geojson'),
          ('gv', 'gouvernement', 'gouvernements/gouvernements_1789.geojson'), ('pa', 'parlement', 'parlements/parlements_1789.geojson')]
CERT = {'base': 0, 'confirmé': 1, 'corrigé': 2, 'douteux': 3}


def main():
    atlas = sys.argv[1]
    try:
        commit = subprocess.run(['git', '-C', atlas, 'rev-parse', 'HEAD'], capture_output=True, text=True, check=True).stdout.strip()
    except Exception:  # noqa: BLE001
        commit = ''
    ents, by_name = {}, {}
    for key, kind, rel in LAYERS:
        with open(os.path.join(atlas, 'donnees', rel), encoding='utf-8') as f:
            feats = json.load(f)['features']
        rows = []
        for ft in feats:
            p = ft['properties']
            r = {'id': p['id'], 'n': p['nom'], 'src': p.get('source', ''), 'lic': p.get('licence', '')}
            if kind == 'bailliage':
                r.update({'nb': p.get('nom_brette') or '', 'rang': p.get('rang') or '', 'pr': p.get('bailliage_principal') or '',
                          'gen': p.get('generalite') or '', 'cl': p.get('chef_lieu') or '', 'cli': p.get('chef_lieu_insee') or ''})
            elif kind == 'diocese':
                r['pe'] = p.get('province_ecclesiastique') or ''
            elif kind == 'parlement':
                r.update({'nat': p.get('nature') or '', 'app': p.get('appel') or ''})
            elif kind == 'gouvernement':
                r['cls'] = p.get('classe') or ''
            elif kind == 'province':
                r['ens'] = p.get('ensemble') or ''
            rows.append(r)
        rows.sort(key=lambda r: r['n'])
        ents[key] = rows
        by_name[key] = {}
        for i, r in enumerate(rows):
            by_name[key].setdefault(r['n'], i)
    # les sources longues reviennent souvent : on les range une fois
    srcs = []; sidx = {}
    for rows in ents.values():
        for r in rows:
            s = r.pop('src')
            if s not in sidx:
                sidx[s] = len(srcs); srcs.append(s)
            r['s'] = sidx[s]
    communes, missing = {}, {k: 0 for k, _, _ in LAYERS}
    with open(os.path.join(atlas, 'donnees', 'lieux', 'lieux_1789.csv'), encoding='utf-8') as f:
        for r in csv.DictReader(f):
            insee = r['code_insee']
            if not insee:
                continue  # territoires aujourd'hui hors de France : pas de commune de la base à y rattacher
            row = []
            for key, kind, _ in LAYERS:
                v = r.get(kind, '')
                i = by_name[key].get(v, -1) if v else -1
                if v and i < 0:
                    missing[key] += 1
                row.append(i)
            cert = ''.join(str(CERT.get(r.get(f'{k}_certitude', '') or 'base', 0)) for k in ('generalite', 'bailliage', 'diocese', 'province'))
            royaume = {'oui': 1, 'non': 0}.get(r['royaume_1789'], 2)
            communes[insee] = [r['commune'], royaume, cert] + row
    # noms des départements (pour dire « archives départementales de la Corrèze ») : INSEE, COG 2025 (Licence Ouverte), déjà livré
    deps, deps_src = {}, ''
    dec = os.path.join(ROOT, 'assets', 'data', 'communes-decoupage.json.gz')
    if os.path.exists(dec):
        with gzip.open(dec, 'rt', encoding='utf-8') as f:
            j = json.load(f)
        deps = j.get('dep', {}); deps_src = f"{j.get('attr', '')} ({j.get('licence', '')})"
    data = {'v': 1, 'built': time.strftime('%Y-%m-%d'), 'atlas_version': '1.0.3', 'atlas_commit': commit,
            'url': 'https://github.com/t-fressin/atlas-ancien-regime', 'site': 'https://t-fressin.github.io/atlas-ancien-regime/',
            'csv_url': 'https://github.com/t-fressin/atlas-ancien-regime/blob/main/donnees/lieux/lieux_1789.csv',
            'licence': 'CC BY-SA 4.0', 'licence_url': 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr',
            'attribution': open(os.path.join(atlas, 'donnees', 'lieux', 'LICENCE.md'), encoding='utf-8').read().split('Attribution à reprendre : « ', 1)[1].split(' »', 1)[0].strip(),
            'cite': "Thomas Fressin, Atlas d'Ancien Régime : généralités, bailliages, diocèses, provinces, gouvernements, parlements et territoires extérieurs en 1789, version 1.0.3, 2026",
            'layers': [k for k, _, _ in LAYERS], 'cert': ['base', 'confirmé', 'corrigé', 'douteux'],
            'ents': ents, 'srcs': srcs, 'c': communes, 'deps': deps, 'deps_src': deps_src}
    raw = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    with gzip.GzipFile(OUT, 'wb', mtime=0, compresslevel=9) as f:
        f.write(raw)
    print(f'{OUT} : {os.path.getsize(OUT)} octets ({len(raw)} décompressé) ; {len(communes)} communes ; '
          + ', '.join(f'{k} {len(v)}' for k, v in ents.items()) + f' ; noms non retrouvés {missing} ; sha256 {hashlib.sha256(open(OUT, "rb").read()).hexdigest()[:12]}')


if __name__ == '__main__':
    main()
