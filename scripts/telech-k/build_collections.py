#!/usr/bin/env python3
"""🖼 Lot K — un petit index des collections ouvertes, choisi pour la généalogie (assets/data/tk-collections.json.gz).

Source : The Metropolitan Museum of Art, Open Access (https://github.com/metmuseum/openaccess, fichier MetObjects.csv) — README
relu à chaque fabrication : « To the extent possible under law, The Metropolitan Museum of Art has waived all copyright and related or
neighboring rights to this dataset using Creative Commons Zero » ; les images ne sont pas dans le jeu de données (« Images not
included ») et ne sont pas copiées : chaque ligne ouvre la fiche du musée, sur un clic.
Gardé : les œuvres du domaine public (« Is Public Domain »), de 1500 à 1950, estampes, dessins, photographies, peintures, éphémères,
textiles et costumes, monnaies et médailles, qui montrent la vie de tous les jours (métiers, enfants, familles, mariages, maisons,
villes, églises, marchés, fermes, bateaux, soldats, portraits photographiques…) : titre, années, ville, pays, culture, nationalité
de l'artiste, sorte, sujets. Pas les millions d'images : quelques dizaines de milliers de lignes, cherchées sur l'ordinateur.

Les autres collections ouvertes (Smithsonian, Art Institute of Chicago, Cleveland, National Gallery of Art, Rijksmuseum, SMK, Paris
Musées…) sont cherchées EN LIGNE, sur un clic, par le nom du lieu (liens dans l'app) : rien n'est copié d'elles ici.

Lancer : python3 -I scripts/telech-k/build_collections.py [dossier de sortie]   (TK_RAW = cache ; le fichier fait ≈ 340 Mo)
"""
import csv, io, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
README = 'https://raw.githubusercontent.com/metmuseum/openaccess/master/README.md'
CSV = 'https://media.githubusercontent.com/media/metmuseum/openaccess/master/MetObjects.csv'
MUST = 'has waived all copyright and related or neighboring rights to this dataset using [Creative Commons Zero]'
# les sujets qui parlent de la vie des gens (étiquettes du Met, vocabulaire AAT) → mot français
SUJETS = {'Working': 'métiers', 'Infants': 'enfants', 'Children': 'enfants', 'Boys': 'enfants', 'Girls': 'enfants', 'Mothers': 'familles', 'Families': 'familles',
          'Couples': 'couples', 'Weddings': 'mariages', 'Death': 'la mort', 'Houses': 'maisons', 'Interiors': 'intérieurs', 'Cities': 'villes', 'Cityscapes': 'villes',
          'Villages': 'villages', 'Buildings': 'bâtiments', 'Churches': 'églises', 'Bridges': 'ponts', 'Rivers': 'rivières', 'Crowd': 'foules', 'Markets': 'marchés',
          'Shops': 'boutiques', 'Farms': 'fermes', 'Cows': 'bêtes', 'Sheep': 'bêtes', 'Fishing': 'pêche', 'Boats': 'bateaux', 'Ships': 'bateaux', 'Carriages': 'voitures',
          'Trains': 'trains', 'Soldiers': 'soldats', 'Military': 'soldats', 'Reading': 'lecture', 'Schools': 'écoles', 'Drinking': 'boire', 'Food': 'repas', 'Smoking': 'tabac',
          'Dancing': 'danse', 'Musicians': 'musique', 'Games': 'jeux', 'Coins': 'monnaies', 'Maps': 'cartes géographiques', 'Portraits': 'portraits'}
SORTES = [('Photographs', 'photographie'), ('Prints', 'estampe'), ('Drawings', 'dessin'), ('Paintings', 'peinture'), ('Ephemera', 'éphémère'), ('Textiles', 'textile'),
          ('Costume', 'costume'), ('Coins', 'monnaie'), ('Medals', 'médaille')]


def main():
    readme = wm.get(README, 'text/plain').decode('utf-8', 'replace')
    if MUST not in readme:
        sys.exit(f'Met Open Access : la licence a changé, relire {README}')
    data = wm.get(CSV, 'text/csv').decode('utf-8-sig')
    rows, subj, kinds, cult = [], {}, {}, {}
    for r in csv.DictReader(io.StringIO(data)):
        if r['Is Public Domain'] != 'True':
            continue
        try:
            a, b = int(r['Object Begin Date']), int(r['Object End Date'])
        except ValueError:
            continue
        if b < 1500 or a > 1950:
            continue
        kind = next((fr for en, fr in SORTES if en in r['Classification']), '')
        if not kind:
            continue
        tg = sorted({SUJETS[t] for t in r['Tags'].split('|') if t in SUJETS})
        # un portrait seul ne compte que s'il est photographique (cartes de visite : des gens ordinaires) ; sinon il faut un autre sujet
        if not tg or (tg == ['portraits'] and kind != 'photographie'):
            continue
        oid = r['Object ID']
        if not oid.isdigit():
            continue
        place = ' '.join(dict.fromkeys(x for x in (r['City'], r['State'], r['Country']) if x))[:80]
        c = (r['Culture'] or r['Artist Nationality'].split('|')[0]).strip()[:40]
        rows.append([int(oid), ' '.join(r['Title'].split())[:110], a, b, place, cult.setdefault(c, len(cult)), kinds.setdefault(kind, len(kinds)),
                     [subj.setdefault(t, len(subj)) for t in tg]])
    assert len(rows) > 10000, len(rows)
    rows.sort(key=lambda x: (x[2], x[0]))
    meta = {'source': 'The Metropolitan Museum of Art, Open Access (MetObjects.csv) : œuvres du domaine public sur la vie de tous les jours, 1500-1950',
            'licence': 'CC0 1.0', 'licence_url': 'https://creativecommons.org/publicdomain/zero/1.0/deed.fr', 'url': 'https://github.com/metmuseum/openaccess',
            'licence_page': README, 'built': wm.today(), 'object_url': 'https://www.metmuseum.org/art/collection/search/{id}',
            'what': 'Titre, années, lieu, culture, sorte et sujets des œuvres du domaine public qui montrent la vie des gens (métiers, enfants, mariages, maisons, villes…) ; les images restent au musée (un clic ouvre sa fiche)',
            'museum': 'The Metropolitan Museum of Art (New York)', 'cultures': list(cult), 'kinds': list(kinds), 'subjects': list(subj),
            'fields': ['id', 't', 'y0', 'y1', 'pl', 'cu', 'k', 's'], 'rows': rows}
    size = wm.write_gz(OUT, 'tk-collections.json.gz', meta)
    print(f'tk-collections : {len(rows)} œuvres, {size} octets')


if __name__ == '__main__':
    main()
