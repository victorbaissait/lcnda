#!/usr/bin/env python3
"""📖 Lot I — les phrases de contexte (Wikipédia en français, CC BY-SA 4.0) → ti-contexte.json.gz.

Pour chaque sujet du lot, la ou les premières phrases de l'article (texte lu par action=raw, une page), recopiées telles quelles après
nettoyage du wikitexte (liens, gras, références). Rien n'est réécrit : l'écran cite la phrase, avec le lien de l'article et
« les contributeurs de Wikipédia ». Les sujets trop pauvres en données (sociétés de secours mutuels, de tir, de gymnastique, orphéons)
n'ont que cette phrase et des liens.
Lancer : python3 -I scripts/telech-i/build_contexte.py [dossier de sortie]
"""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
TOPICS = [('navals', 'Chantier naval'), ('corderie', 'Corderie royale'), ('autos', 'Industrie automobile en France'), ('sucreries', 'Usine sucrière'),
          ('sanas', 'Sanatorium'), ('centrales', 'Maison centrale'), ('ecrou', 'Écrou (droit)'), ('grottes', 'Grotte ornée'), ('romains', 'Pont romain'),
          ('hippodromes', 'Hippodrome'), ('mutuelles', 'Société de secours mutuel'), ('tir', 'Société de tir'),
          ('gym', 'Union des sociétés de gymnastique de France'), ('orpheons', 'Orphéon'), ('tour', 'Le Tour de la France par deux enfants'),
          ('larousse', 'Le Petit Larousse'), ('certif', 'Certificat d\'études primaires (France)'), ('maregraphe', 'Marégraphe')]


def intro(w):
    # les images (dont la légende contient des liens [[…]]) d'abord, puis les modèles sauf les dates, siècles et nombres
    while True:
        w2 = re.sub(r'\[\[(?:Fichier|File|Image):(?:[^\[\]]|\[\[[^\[\]]*\]\])*\]\]', '', w, flags=re.I)
        if w2 == w:
            break
        w = w2
    keep = re.compile(r'\{\{(date|s-?|siècle|unité|nombre|nobr|\d+(e|er|re)|[IVXL]+e siècle)\b', re.I)
    for _ in range(3):
        w = re.sub(r'\{\{(?:[^{}]|\{\{[^{}]*\}\})*\}\}', lambda m: m.group(0) if keep.match(m.group(0)) else '', w)
    head = re.split(r'\n==', w, maxsplit=1)[0]
    paras = [p for p in (wm.plain(x) for x in head.split('\n')) if len(p) > 60 and not p.startswith(('|', '{', '!', '*'))]
    MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
    p = paras[0] if paras else ''
    return re.sub(r'\b(\d{1,2}) (\d{1,2}) (\d{3,4})\b', lambda m: f'{m.group(1)} {MOIS[int(m.group(2)) - 1]} {m.group(3)}' if 1 <= int(m.group(2)) <= 12 else m.group(0), p)


def sentences(p, n=2, cap=380):
    parts = re.split(r'(?<=[.!?])\s+(?=[A-ZÉÀ«])', p)
    out = ''
    for s in parts[:n]:
        if out and len(out) + len(s) > cap:
            break
        out = (out + ' ' + s).strip()
    return out


def main():
    rows = []
    for key, title in TOPICS:
        try:
            w = wm.wp_raw(title)
        except RuntimeError as e:
            print(f'  ! {title} : {e}', file=sys.stderr)
            continue
        m = re.match(r'#(?:REDIRECT|REDIRECTION)\s*\[\[([^\]]+)\]\]', w, re.I)
        if m:
            title = m.group(1).split('#')[0]
            w = wm.wp_raw(title)
        q = sentences(intro(w))
        if len(q) < 40:
            print(f'  ! {title} : pas de phrase', file=sys.stderr)
            continue
        rows.append([key, title, q, wm.wp_url(title)])
        print(f'{key} : {q[:110]}…')
    fields = ['key', 'title', 'q', 'url']
    meta = {'source': 'Wikipédia en français', 'licence': 'CC BY-SA 4.0 (les contributeurs de Wikipédia)', 'licence_url': 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr',
            'url': 'https://fr.wikipedia.org/', 'built': wm.today(), 'what': 'La première phrase des articles de Wikipédia sur chaque sujet du lot, recopiée telle quelle',
            'fields': fields, 'rows': rows}
    size = wm.write_gz(OUT, 'ti-contexte.json.gz', meta)
    print(f'ti-contexte : {len(rows)} phrases, {size} octets')


if __name__ == '__main__':
    main()
