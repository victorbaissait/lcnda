#!/usr/bin/env python3
"""🧭 Lot I — « Le Tour de la France par deux enfants » (G. Bruno, Belin ; édition de 1904 transcrite sur Wikisource) → ti-tour.json.gz.

Le livre est du domaine public (G. Bruno = Augustine Fouillée, morte en 1923) ; la transcription de Wikisource est sous CC BY-SA 4.0
(« Les textes sont disponibles sous licence Creative Commons Attribution-partage dans les mêmes conditions »).
On lit la table des matières (pages 311-314 du fac-similé, action=raw) puis chaque chapitre (action=render : une page, pas l'API).
Pour chaque ville nommée dans le titre d'un chapitre (« XLIV. — Mâcon. … ») et qui est une commune française (cc-communes, déjà
dans l'app, Licence Ouverte), on garde : le chapitre, son titre, son lien, et LA PHRASE du chapitre qui nomme la ville, recopiée
telle quelle (coupée à 320 signes au plus, « … » ajouté). Le script refuse d'écrire une phrase qu'il ne retrouve pas dans le texte.
Lancer : python3 -I scripts/telech-i/build_tour.py [dossier de sortie]
"""
import os, re, sys, unicodedata, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
BOOK = 'Le Tour de la France par deux enfants'
INDEX = 'G. Bruno - Le Tour de la France par deux enfants, 1904.djvu'
# noms portés par plusieurs communes : celle du livre (vérifiée à la lecture du chapitre)
PICK = {'valence': '26362', 'beaucaire': '30032', 'saint etienne': '42218', 'aix': '13001', 'vienne': '38544', 'orange': '84087', 'montbard': '21425',
        'bourg': '01053', 'laval': '53130', 'dole': '39198', 'tours': '37261', 'blois': '41018', 'nevers': '58194', 'cette': '34301', 'sete': '34301',
        'troyes': '10387', 'reims': '51454', 'sedan': '51454', 'lille': '59350', 'dunkerque': '59183', 'clermont': '63113', 'clermont ferrand': '63113',
        'saint malo': '35288', 'chalons': '51108', 'nancy': '54395', 'lyon': '69123', 'marseille': '13055', 'paris': '75056', 'bordeaux': '33063'}
NOT = {'france', 'alpes', 'jura', 'suisse', 'savoie', 'bourgogne', 'ain', 'rhone', 'loire', 'seine', 'auvergne', 'bretagne', 'normandie', 'flandre', 'lorraine',
       'alsace', 'provence', 'gascogne', 'languedoc', 'landes', 'dauphine', 'cevennes', 'pyrenees', 'garonne', 'mediterranee', 'manche', 'ocean', 'europe',
       'angleterre', 'algerie', 'corse', 'champagne', 'picardie', 'limousin', 'perigord', 'berry', 'touraine', 'anjou', 'vendee', 'poitou', 'charente',
       'beauce', 'brie', 'vosges', 'marne', 'meuse', 'moselle', 'doubs', 'saone', 'isere', 'durance', 'gironde', 'dordogne', 'lot', 'tarn', 'aude', 'herault',
       'gard', 'var', 'cher', 'allier', 'yonne', 'aube', 'oise', 'somme', 'nord', 'mont blanc', 'saint', 'julien', 'andre', 'etienne', 'gertal', 'guillaume',
       'pierrot', 'vauban', 'buffon', 'descartes', 'les halles', 'perpignan', 'pau', 'cujas', 'jacquard', 'puget', 'la', 'le', 'les', 'un', 'une', 'une ferme', 'geneve', 'midi', 'sud', 'arrivee', 'depart'}


def fold(s):
    return re.sub(r'[^a-z0-9]+', ' ', unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode().lower()).strip()


def main():
    toc = ''
    for p in (311, 312, 313, 314):
        toc += wm.get(f'https://fr.wikisource.org/w/index.php?' + urllib.parse.urlencode({'title': f'Page:{INDEX}/{p}', 'action': 'raw'}), 'text/plain').decode('utf-8')
    chapters = []
    for m in re.finditer(r'titre=\[\[' + re.escape(BOOK) + r'/(\d{3})\|([^\]]+)\]\]\s*(.*?)\|page=', toc, flags=re.S):
        title = ' '.join(re.sub(r"''+|<br\s*/?>|<[^>]+>", ' ', m.group(3)).split()).strip(' —')
        chapters.append((m.group(1), m.group(2).strip(' —.'), title))
    assert len(chapters) > 100, f'{len(chapters)} chapitres seulement'
    com = wm.communes(ROOT)
    by_name = {}
    for ins, (n, la, lo) in com.items():
        by_name.setdefault(fold(n), []).append(ins)
    rows = []
    for num, roman, title in chapters:
        cands = []
        for seg in re.split(r'\s+—\s+|\.\s+|,\s+|\s+et\s+|\s+à\s+|\s+de\s+|\s+du\s+|\s+aux?\s+', title):
            for mm in re.finditer(r"\b([A-ZÉÈ][\wéèêàâîôûç’'-]+(?:[ -](?:sur|en|de|du|le|la|les|lès|[A-ZÉ][\wéèêàâîôûç-]+))*)", seg):
                f = fold(mm.group(1))
                if f in NOT or len(f) < 3:
                    continue
                ins = PICK.get(f) or (by_name[f][0] if len(by_name.get(f, [])) == 1 else None)
                if ins and ins not in [c[0] for c in cands]:
                    cands.append((ins, mm.group(1)))
        if not cands:
            continue
        h = wm.render(f'{BOOK}/{num}')
        if not h:
            continue
        txt = wm.text_of(h)
        body = txt.split(f'{roman}. —', 1)[-1] if f'{roman}. —' in txt else txt
        sentences = re.split(r'(?<=[.!?»])\s+(?=[«—A-ZÉÀ])', body.replace('\n', ' '))
        for ins, word in cands:
            hits = [x for x in sentences if re.search(r'\b' + re.escape(word) + r'\b', x) and len(x) > 30]
            # une phrase du récit plutôt que le sommaire du chapitre (qui répète le titre)
            s = next((x for x in hits if fold(x.strip(' —.')) not in fold(title) and not x.lstrip().startswith('—  ')), hits[0] if hits else '')
            if not s:
                print(f'  ? {num} {word} : pas de phrase', file=sys.stderr)
                continue
            q = s if len(s) <= 320 else s[:317].rsplit(' ', 1)[0] + ' …'
            assert q.rstrip(' …') in txt.replace('\n', ' '), q
            n, la, lo = com[ins]
            rows.append([int(num), roman, title, n, ins, la, lo, q])
            print(f'{num} {roman} {n} ({ins})')
    assert len(rows) > 20, f'{len(rows)} villes seulement'
    fields = ['ch', 'roman', 'title', 'commune', 'insee', 'lat', 'lon', 'q']
    meta = {'source': 'G. Bruno, « Le Tour de la France par deux enfants » (Belin, 1904), transcription de Wikisource',
            'licence': 'Domaine public (texte) ; transcription Wikisource CC BY-SA 4.0', 'licence_url': 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr',
            'url': 'https://fr.wikisource.org/wiki/' + urllib.parse.quote(BOOK.replace(' ', '_')),
            'chapter_url': 'https://fr.wikisource.org/wiki/' + urllib.parse.quote(BOOK.replace(' ', '_')) + '/{c}', 'built': wm.today(),
            'what': 'Les villes où passent André et Julien, avec la phrase du chapitre qui les nomme', 'fields': fields, 'rows': rows}
    size = wm.write_gz(OUT, 'ti-tour.json.gz', meta)
    print(f'ti-tour : {len(rows)} passages, {len({r[4] for r in rows})} villes, {size} octets')


if __name__ == '__main__':
    main()
