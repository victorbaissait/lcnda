#!/usr/bin/env python3
"""🗣 Lot K — les langues du monde (assets/data/tk-langues.json.gz).

Source : Glottolog (Hammarström, Forkel, Haspelmath, Bank, Max Planck Institute for Evolutionary Anthropology), en CLDF :
https://github.com/glottolog/glottolog-cldf — README relu à chaque fabrication : « This dataset is licensed under a CC-BY-4.0
license ». Gardé : les langues (pas les familles ni les dialectes) qui ont un point sur la carte : nom, point, famille, code ISO,
grande région, pays, première année documentée, éteinte ou non (vitalité AES de Glottolog). Le point d'une langue est un point « au milieu » de là où elle se parle, pas une
frontière : l'app dit « une langue dont le point est à N km », jamais « on parlait ici ».

Lancer : python3 -I scripts/telech-k/build_langues.py [dossier de sortie]   (TK_RAW = cache)
"""
import csv, io, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
RAW = 'https://raw.githubusercontent.com/glottolog/glottolog-cldf/master'


def main():
    readme = wm.get(f'{RAW}/README.md', 'text/plain').decode('utf-8', 'replace')
    if 'This dataset is licensed under a CC-BY-4.0 license' not in readme:
        sys.exit(f'Glottolog : la licence a changé, relire {RAW}/README.md')
    m = re.search(r'Glottolog database ([\d.]+)', readme)
    version = m.group(1) if m else ''
    cite = re.search(r'> (Hammarström[^\n]+)', readme)
    rows = list(csv.DictReader(io.StringIO(wm.get(f'{RAW}/cldf/languages.csv', 'text/csv').decode('utf-8'))))
    name = {r['ID']: r['Name'] for r in rows}
    # la vitalité (AES) : une langue éteinte reste dans la liste, mais l'app ne la dit pas « autour » d'un ancêtre
    extinct = {v['Language_ID'] for v in csv.DictReader(io.StringIO(wm.get(f'{RAW}/cldf/values.csv', 'text/csv').decode('utf-8'))) if v['Parameter_ID'] == 'aes' and v['Code_ID'] == 'aes-extinct'}
    fams, out = {}, []
    for r in rows:
        if r['Level'] != 'language' or not r['Latitude'] or not r['Longitude']:
            continue
        f = name.get(r['Family_ID'], '') if r['Family_ID'] else ('isolat' if r['Is_Isolate'] == 'True' else '')
        fi = fams.setdefault(f, len(fams))
        y = r.get('First_Year_Of_Documentation') or ''
        out.append([r['ID'], r['Name'], round(float(r['Latitude']), 4), round(float(r['Longitude']), 4), fi, r['ISO639P3code'] or '', r['Macroarea'] or '',
                    r['Countries'].replace(';', ' ')[:60], int(y) if y.lstrip('-').isdigit() else None, 1 if r['ID'] in extinct else 0])
    assert len(out) > 7000, len(out)
    meta = {'source': f'Glottolog {version} (Max Planck Institute for Evolutionary Anthropology), en CLDF', 'licence': 'CC BY 4.0',
            'licence_url': 'https://creativecommons.org/licenses/by/4.0/deed.fr', 'url': 'https://glottolog.org', 'data_url': 'https://github.com/glottolog/glottolog-cldf',
            'cite': cite.group(1).strip() if cite else 'Hammarström, Harald & Forkel, Robert & Haspelmath, Martin & Bank, Sebastian. Glottolog. Leipzig: Max Planck Institute for Evolutionary Anthropology.',
            'built': wm.today(), 'what': 'Les langues du monde qui ont un point sur la carte (un point au milieu de là où elles se parlent) : famille, code ISO 639-3, pays, première année écrite',
            'families': list(fams), 'fields': ['g', 'n', 'lat', 'lon', 'f', 'iso', 'area', 'cc', 'y1', 'x'], 'rows': out}
    size = wm.write_gz(OUT, 'tk-langues.json.gz', meta)
    print(f'tk-langues : {len(out)} langues, {len(fams)} familles, {size} octets')


if __name__ == '__main__':
    main()
