#!/usr/bin/env python3
"""📖 Lot O5 — les textes rédigés pour LCNDA (CC BY-SA 4.0), un seul fichier source : scripts/lot-o/textes.tsv
(une ligne = un sujet : id, icône, titre, thème, de, à, métiers qui le déclenchent, lieux, texte, source, lien de la source).
Chaque texte est court, écrit pour l'app d'après la page citée (Wikipédia en français, CC BY-SA 4.0) ; aucune phrase n'est copiée.
→ assets/data/lo-textes.json.gz. Option --liens : vérifie que chaque page citée existe encore (une requête toutes les 3 s).

Lancer : python3 -I scripts/lot-o/build_textes.py [--liens]
"""
import csv, datetime, gzip, json, os, sys, urllib.parse
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'scripts', 'lot-o', 'textes.tsv')
OUT = os.path.join(ROOT, 'assets', 'data', 'lo-textes.json.gz')


def main():
    rows = []
    with open(SRC, encoding='utf-8') as f:
        for r in csv.DictReader(f, delimiter='\t'):
            if not r['id'] or not r['texte'] or not r['url'].startswith('https://'):
                sys.exit(f"ligne incomplète : {r.get('id')}")
            split = lambda s: [x.strip() for x in (s or '').split(',') if x.strip()]
            rows.append([r['id'], r['icon'], r['titre'], r['theme'], int(r['de']), int(r['a']), split(r['metiers']), split(r['lieux']), r['texte'], r['source'], r['url']])
    if '--liens' in sys.argv:
        sys.path.insert(0, os.path.join(ROOT, 'scripts', 'telech-l')); import wm  # noqa
        for r in rows:
            title = urllib.parse.unquote(r[10].split('/wiki/', 1)[1].split('#')[0])
            wm.get('https://fr.wikipedia.org/w/index.php?' + urllib.parse.urlencode({'title': title, 'action': 'raw'}), '*/*')
    meta = {'v': 1, 'built': datetime.date.today().isoformat(), 'title': 'Textes d’histoire rédigés pour LCNDA (lot O)', 'licence': 'CC BY-SA 4.0',
            'licence_url': 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr', 'source': 'Rédigé pour LCNDA d’après Wikipédia en français (CC BY-SA 4.0), chaque texte avec sa page',
            'url': 'https://fr.wikipedia.org/', 'fields': ['id', 'icon', 'title', 'theme', 'from', 'to', 'jobs', 'places', 'text', 'src', 'url'], 'rows': rows}
    with gzip.GzipFile(OUT, 'wb', mtime=0, compresslevel=9) as f:
        f.write(json.dumps(meta, ensure_ascii=False, separators=(',', ':')).encode())
    print(f'{len(rows)} textes → {OUT} ({os.path.getsize(OUT)} octets)')


if __name__ == '__main__':
    main()
