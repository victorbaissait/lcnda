#!/usr/bin/env python3
"""📕 Lot I — les métiers de l'app dans un petit dictionnaire d'époque → ti-dico.json.gz.

Le Petit Larousse de 1906 n'est PAS transcrit sur Wikisource (Internet Archive n'a que l'édition de 1911, en images et en OCR brut) :
l'écran met un lien vers la recherche dans le scan de 1911 (« Public Domain Mark 1.0 ») — rien n'est recopié de ce livre.
Ce qui est transcrit et relu : Théodore Soulice, « Petit dictionnaire de la langue française » (Hachette, 1860), sur Wikisource,
un article par page (« Petit dictionnaire de la langue française (1860)/FORGERON »). Domaine public ; transcription CC BY-SA 4.0.
Pour chaque métier du dictionnaire des métiers de l'app (assets/data/metiers-anciens.json, un seul mot), on lit l'article
(index.php?action=render, une page à la fois) et on recopie la définition telle quelle.
Lancer : python3 -I scripts/telech-i/build_dico.py [dossier de sortie]
"""
import json, os, re, sys, unicodedata, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
BOOK = 'Petit dictionnaire de la langue française (1860)'
IA = 'https://archive.org/details/petitlarousseillustre1911'


def fold(s):
    return re.sub(r'[^a-z0-9]+', ' ', unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode().lower()).strip()


def main():
    trades = json.load(open(os.path.join(ROOT, 'assets', 'data', 'metiers-anciens.json'), encoding='utf-8'))['trades']
    words = []
    for t in trades:
        for w in (t['name'],):  # le masculin seulement : un féminin est souvent un autre mot (SAUNIÈRE : un coffre à sel)
            w = w.strip()
            if w and ' ' not in w and "'" not in w and '’' not in w and w.upper() not in [x[1] for x in words]:
                words.append((t['key'], w.upper()))
    rows = []
    for key, W in words:
        h = wm.render(f'{BOOK}/{W}')
        if not h:
            continue
        txt = wm.text_of(h)
        m = re.search(r'(?m)^' + re.escape(W) + r',?\s.*$', txt)
        if not m:
            continue
        d = ' '.join(txt[m.start():].split('\n')[0:3]) if len(m.group(0)) < 40 else m.group(0)
        d = re.split(r'\s(?=[A-ZÉÈ]{3,}[,.\s])', d)[0].strip()  # s'arrêter à l'article suivant s'il est sur la même page
        if len(d) < len(W) + 8 or not re.search(r'\bs\. ?m\.', d[:60]):  # un nom de personne (s. m.), pas un verbe ni un adjectif seul
            continue
        rows.append([key, W, d[:400], f'https://fr.wikisource.org/wiki/{urllib.parse.quote((BOOK + "/" + W).replace(" ", "_"))}'])
        print(f'{W} : {d[:90]}')
    assert len(rows) > 50, f'{len(rows)} articles seulement'
    fields = ['key', 'w', 'def', 'url']
    meta = {'source': 'Théodore Soulice, « Petit dictionnaire de la langue française » (Hachette, 1860), transcription de Wikisource',
            'licence': 'Domaine public (livre de 1860) ; transcription Wikisource CC BY-SA 4.0', 'licence_url': 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr',
            'url': 'https://fr.wikisource.org/wiki/' + urllib.parse.quote(BOOK.replace(' ', '_')), 'url2': IA,
            'search_1911': IA + '/mode/2up?q={q}', 'built': wm.today(),
            'what': 'La définition de 1860 des métiers du dictionnaire de l’app ; le Petit Larousse (1911, scan Internet Archive) en lien seulement',
            'fields': fields, 'rows': rows}
    size = wm.write_gz(OUT, 'ti-dico.json.gz', meta)
    print(f'ti-dico : {len(rows)} définitions, {size} octets')


if __name__ == '__main__':
    main()
