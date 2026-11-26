#!/usr/bin/env python3
"""✈️ Lot G — Les pionniers de l'aviation : les brevets de pilote de l'Aéro-Club de France (1909-1911) : assets/data/tg-aviateurs.json.gz.

Source : Wikipédia en anglais (CC BY-SA 4.0), « List of pilots awarded an Aviator's Certificate by the Aéro-Club de France in 1909 »,
« … in 1910 », « … in 1911 » (d'après L'Aérophile, 1911, et « Flying Pioneers – Les Vieilles Tiges »). Il n'existe pas de liste
pour 1912-1914 sur Wikipédia : l'app le dit. Gardé : numéro du brevet, nom, date, pays d'origine (si pas la France), mort en
accident ou au combat (couleur de la ligne), l'article Wikipédia s'il existe, la remarque (texte de Wikipédia, cité, coupé à 240 signes).
Ce sont des personnes mortes depuis longtemps ; rien sur les personnes de la généalogie n'est envoyé.
Lancer : python3 -I scripts/telech-g/build_aviateurs.py [dossier de sortie]
"""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
TITLE = "List of pilots awarded an Aviator's Certificate by the Aéro-Club de France in {y}"
YEARS = (1909, 1910, 1911)
FIELDS = ['no', 'n', 'fam', 'giv', 'date', 'country', 'killed', 'enwiki', 'note', 'y']


def cells_of(block):
    """une ligne de tableau (entre deux « |- ») → [(style, wikitexte)]"""
    out = []
    for line in block.split('\n'):
        if not line.startswith('|') or line.startswith('|+') or line.startswith('|}'):
            if out and line and not line.startswith('!'):
                out[-1] = (out[-1][0], out[-1][1] + '\n' + line)  # une remarque sur plusieurs lignes
            continue
        for c in re.split(r'\|\|', line[1:]):
            m = re.match(r'^\s*((?:style|align|colspan|rowspan)="[^"]*"\s*)+\|(.*)$', c, re.S)
            out.append((m.group(1) if m else '', (m.group(2) if m else c).strip()))
    return out


def main():
    rows = []
    for y in YEARS:
        w = wm.wp_raw(TITLE.format(y=y), 'en.wikipedia.org')
        t0 = w.find('{| class="wikitable')
        if t0 < 0:
            raise SystemExit(f'{y} : tableau introuvable — rien n’est écrit')
        body = w[t0:w.find('\n|}', t0)]
        for block in body.split('\n|-')[1:]:
            c = cells_of(block)
            if len(c) < 3:
                continue
            no = re.sub(r"[^0-9a-z ]", '', wm.plain(c[0][1]).lower()).strip()
            if not re.match(r'^\d+', no):
                continue
            style = c[1][0] + c[0][0]
            killed = 'a' if '#e3d9ff' in style.lower() else 'w' if '#999999' in style.lower() else ''
            raw = c[1][1]
            link = re.search(r'\[\[([^\]|]+)(?:\|[^\]]*)?\]\]', raw)
            name = re.sub(r'\s*\((Captain|Lieutenant|Lt\.?|Commandant|Capt\.?)\)', '', wm.plain(raw)).strip()
            fam, _, giv = name.partition(',')
            m = re.search(r'(\d{4})-(\d\d)-(\d\d)', c[2][1])
            date = f'{m.group(1)}-{m.group(2)}-{m.group(3)}' if m else ''
            country = wm.plain(c[3][1]) if len(c) > 3 else ''
            note = wm.plain(c[4][1]) if len(c) > 4 else ''
            note = re.sub(r'\s+', ' ', note).strip()
            if len(note) > 240:
                note = note[:239].rsplit(' ', 1)[0] + '…'
            rows.append({'no': no.replace(' bis', ' bis'), 'n': f'{giv.strip()} {fam.strip()}'.strip() if giv else name, 'fam': fam.strip(), 'giv': giv.strip(), 'date': date,
                         'country': country, 'killed': killed, 'enwiki': link.group(1).strip() if link else '', 'note': note, 'y': int(date[:4]) if date else y})
        print(f'{y} : {sum(1 for r in rows if r["y"] == y)} brevets')
    if len(rows) < 500:
        raise SystemExit(f'seulement {len(rows)} brevets lus — la mise en page a changé, rien n’est écrit')
    meta = {'source': 'Wikipédia en anglais, listes des brevets de pilote de l’Aéro-Club de France (1909, 1910, 1911)', 'licence': 'CC BY-SA 4.0',
            'licence_url': 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr', 'url': wm.wp_url(TITLE.format(y=1909), 'en.wikipedia.org'),
            'urls': {str(y): wm.wp_url(TITLE.format(y=y), 'en.wikipedia.org') for y in YEARS}, 'built': wm.today(),
            'what': 'Les pilotes brevetés par l’Aéro-Club de France de 1909 à 1911 (n° 1 à 705 environ) : numéro, nom, date, pays, mort en vol ; '
                    'les années 1912-1914 n’ont pas de liste ouverte',
            'fields': FIELDS, 'rows': [[r[k] for k in FIELDS] for r in rows]}
    size = wm.write_gz(OUT, 'tg-aviateurs.json.gz', meta)
    print(f'tg-aviateurs : {len(rows)} brevets ({sum(1 for r in rows if r["killed"])} morts en vol), {size} octets')


if __name__ == '__main__':
    main()
