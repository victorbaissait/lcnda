#!/usr/bin/env python3
"""🥕 Lot F — Le potager de 1883 : Vilmorin-Andrieux, « Les Plantes potagères » (1883) — assets/data/tf-potager.json.gz.

Le livre est du domaine public (1883 ; Internet Archive, lesplantespotag00conggoog : « possible-copyright-status: NOT_IN_COPYRIGHT »).
On lit sa transcription sur Wikisource (textes du domaine public ; pages de Wikisource sous CC BY-SA 4.0), par l'API de
fr.wikisource.org (une requête pour 50 pages) :
 - les chapitres (un légume par chapitre) et leurs pages ;
 - le nom de chaque variété (titres en capitales du livre : « HARICOT DE SOISSONS. ») ;
 - quand le nom d'une variété porte le nom d'une commune française (« … de Soissons », « … des Vertus »), cette commune (liste des
   communes livrée avec l'app, cc-communes : Licence Ouverte) ; un nom porté par plusieurs communes n'est pas placé.
 - la gravure de la page : seulement son NOM de fichier (Wikimedia Commons, domaine public) ; l'app met un lien, rien n'est copié.
Lancer : python3 -I scripts/telech-f/build_potager.py [dossier de sortie]
"""
import os, re, sys, unicodedata, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
BOOK = 'Les Plantes potagères'
INDEX = 'Vilmorin-Andrieux - Les plantes potagères, 1883.djvu'
IA = 'https://archive.org/details/lesplantespotag00conggoog'
NOT_PLACES = {'france', 'paris', 'hollande', 'italie', 'espagne', 'allemagne', 'angleterre', 'chine', 'japon', 'russie', 'naples', 'milan', 'prague', 'erfurt', 'bruxelles',
              'malte', 'chypre', 'turquie', 'egypte', 'amerique', 'alger', 'madere', 'portugal', 'hongrie', 'suisse', 'belgique', 'flandre', 'bretagne', 'normandie', 'provence'}


def fold(s):
    return re.sub(r'[^a-z0-9]+', ' ', unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode().lower()).strip()


def contents(titles):
    out = {}
    for i in range(0, len(titles), 50):
        j = wm.ws({'action': 'query', 'prop': 'revisions', 'rvprop': 'content', 'rvslots': 'main', 'titles': '|'.join(titles[i:i + 50])})
        for p in j['query']['pages']:
            out[p['title']] = (p.get('revisions') or [{}])[0].get('slots', {}).get('main', {}).get('content', '')
    return out


def main():
    titles, cont = [], {}
    while True:
        j = wm.ws({'action': 'query', 'list': 'allpages', 'apprefix': BOOK + '/', 'aplimit': 'max', **cont})
        titles += [x['title'] for x in j['query']['allpages']]
        if not j.get('continue'):
            break
        cont = j['continue']
    chap = contents(titles)
    ranges = []
    for t, w in chap.items():
        m = re.search(r'from=(\d+)\s+to=(\d+)', w)
        name = t.split('/', 1)[1]
        if m and name not in ('Introduction', 'Table', 'Tableau-résumé', 'Liste des auteurs'):
            ranges.append((int(m.group(1)), int(m.group(2)), name, t))
    pages = sorted({p for a, b, _, _ in ranges for p in range(a, b + 1)})
    ptxt = contents([f'Page:{INDEX}/{p}' for p in pages])
    com = wm.communes(ROOT)
    by_name = {}
    for ins, (n, la, lo) in com.items():
        by_name.setdefault(fold(n), []).append((ins, n, la, lo))
    rows, seen = [], set()
    for a, b, veg, t in sorted(ranges):
        for p in range(a, b + 1):
            w = ptxt.get(f'Page:{INDEX}/{p}', '')
            imgs = re.findall(r'\[\[(?:File|Fichier)\s*:\s*([^|\]]+)', w)
            for h in re.findall(r"\{\{c\|'''([^']{4,80}?)\.?\s*'''\}\}", w):
                v = ' '.join(h.split()).strip(' .')
                if not re.search(r'[A-ZÉ]{3}', v) or (veg, v) in seen:
                    continue
                seen.add((veg, v))
                nice = v[0] + v[1:].lower()
                place = None
                m = re.search(r"\b(?:DE|DES|DU|D’|D')\s*(?:LA |LE |LES |L’|L')?([A-ZÉÈÊÀÂÎÔÛÇ][A-ZÉÈÊÀÂÎÔÛÇ’' -]+)$", v)
                if m:
                    cand = fold(m.group(1))
                    for c in (cand, ' '.join(cand.split()[:2]), cand.split()[0] if cand else ''):
                        if c and c not in NOT_PLACES and len(by_name.get(c, [])) == 1:
                            place = by_name[c][0]
                            break
                img = next((i.strip() for i in imgs if fold(v.split()[-1]) in fold(i)), '')
                rows.append([veg, nice, p, place[0] if place else '', place[1] if place else '', place[2] if place else None, place[3] if place else None, img])
    assert len(rows) > 300, f'{len(rows)} variétés seulement'
    fields = ['veg', 'v', 'page', 'insee', 'commune', 'lat', 'lon', 'img']
    meta = {'source': 'Vilmorin-Andrieux, « Les Plantes potagères » (Paris, 1883), transcription de Wikisource', 'licence': 'Domaine public (livre de 1883) ; transcription Wikisource CC BY-SA 4.0',
            'licence_url': 'https://fr.wikisource.org/wiki/Wikisource:Droit_d%E2%80%99auteur', 'url': 'https://fr.wikisource.org/wiki/' + urllib.parse.quote(BOOK.replace(' ', '_')), 'url2': IA,
            'page_url': 'https://fr.wikisource.org/wiki/Page:' + urllib.parse.quote(INDEX.replace(' ', '_')) + '/{p}', 'built': wm.today(),
            'what': 'Les légumes et les variétés décrits par Vilmorin en 1883 ; celles qui portent le nom d’une commune sont placées sur la carte',
            'fields': fields, 'rows': rows}
    size = wm.write_gz(OUT, 'tf-potager.json.gz', meta)
    print(f'tf-potager : {len(rows)} variétés de {len({r[0] for r in rows})} légumes, {sum(1 for r in rows if r[3])} placées, {size} octets')


if __name__ == '__main__':
    main()
