#!/usr/bin/env python3
"""📅 Lot D — Almanachs populaires et annuaires mondains, année par année (assets/data/td-almanachs.json.gz) : des LIENS.

Les livres restent sur leur site ; on garde seulement, pour chaque volume, la série, l'année, le titre et l'adresse.
 - Internet Archive (archive.org, recherche « advancedsearch », sans clé) : les volumes numérisés (livres) des séries SERIES
   publiés jusqu'en 1925 (domaine public aux États-Unis où sont les scans ; l'auteur, souvent collectif ou inconnu, est mort il y
   a plus de 70 ans pour ces vieux almanachs). La mention de droits de chaque volume est gardée (« Public Domain Mark », « FREE »…)
   et montrée ; l'app ne copie ni texte ni image.
 - Gallica (BnF) : les conditions d'utilisation de Gallica (réutilisation non commerciale libre, commerciale payante) ne sont
   pas une licence ouverte : AUCUNE donnée copiée, seulement un lien de recherche par année, fabriqué par l'app (GALLICA ci-dessous).
Lancer : python3 scripts/telech-d/build_almanachs.py [dossier de sortie]   (TD_RAW = cache des réponses)
"""
import json, os, re, sys, time, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
LAST = 1925
# série → [icône, nom, ce qu'on y trouve, requête archive.org]
SERIES = {
    'royal': ['👑', 'Almanach royal / impérial / national', 'L’annuaire officiel de l’État : les officiers, magistrats, curés de Paris, préfets, maires des grandes villes, notaires…', 'title:("almanach royal" OR "almanach impérial" OR "almanach national")'],
    'gotha': ['🏰', 'Almanach de Gotha', 'Les familles régnantes et la haute noblesse d’Europe, année par année.', 'title:("almanach de gotha")'],
    'commerce': ['📒', 'Almanach du commerce (Bottin)', 'Les commerçants de Paris et des départements : nom, métier, adresse.', 'title:("almanach du commerce")'],
    'chateaux': ['🏯', 'Annuaire des châteaux', 'Les propriétaires des châteaux et villégiatures de France : nom et adresse.', 'title:(annuaire chateaux)'],
    'messager': ['🗞', 'Le Messager boiteux et almanachs populaires', 'Les almanachs vendus par les colporteurs : calendrier, foires, prédictions, histoires.', 'title:("messager boiteux" OR "almanach du cultivateur" OR "almanach populaire")'],
}
# des liens de recherche Gallica par année (rien de copié) : [clé, icône, nom, titre cherché, de, à, ce qu'on y trouve]
GALLICA = [
    ['vermot', '📕', 'Almanach Vermot', 'almanach vermot', 1886, 1925, 'L’almanach populaire au rabat rouge : calendrier, bons mots, conseils, histoires.'],
    ['hachette', '📗', 'Almanach Hachette', 'almanach hachette', 1894, 1925, 'La « petite encyclopédie populaire de la vie pratique » de l’année.'],
    ['bottin', '📒', 'Annuaire-almanach du commerce (Didot-Bottin)', 'annuaire almanach du commerce', 1857, 1925, 'Les commerçants, artisans et professions de Paris et des départements.'],
    ['mondain', '🎩', 'Bottin mondain (« Tout-Paris »)', 'tout-paris annuaire de la société', 1885, 1925, 'Les adresses de la « bonne société » parisienne.'],
    ['chateaux', '🏯', 'Annuaire des châteaux', 'annuaire des châteaux', 1887, 1925, 'Les propriétaires des châteaux et villégiatures de France.'],
    ['postes', '📮', 'Almanach des postes (calendrier du facteur)', 'almanach des postes', 1850, 1925, 'Le calendrier des PTT : saints, foires, plans du département.'],
]


def ia(q):
    url = 'https://archive.org/advancedsearch.php?' + urllib.parse.urlencode([('q', q + ' AND mediatype:texts'), ('fl[]', 'identifier'), ('fl[]', 'title'), ('fl[]', 'year'),
                                                                               ('fl[]', 'date'), ('fl[]', 'licenseurl'), ('fl[]', 'rights'), ('rows', '1000'), ('output', 'json')])
    return json.loads(wm.get(url))['response']['docs']


def year_of(x):
    for k in ('year', 'date'):
        m = re.search(r'\b(1[5-9]\d\d)\b', str(x.get(k) or ''))
        if m:
            return int(m.group(1))
    m = re.search(r'\b(1[5-9]\d\d)\b', str(x.get('title') or ''))
    return int(m.group(1)) if m else None


def rights_of(x):
    lic = str(x.get('licenseurl') or '')
    r = x.get('rights') or ''
    r = ' '.join(r) if isinstance(r, list) else str(r)
    if 'publicdomain' in lic:
        return 'Public Domain Mark'
    return re.sub(r'\s+', ' ', r).strip()[:80]


def main():
    rows = []
    for key, (icon, name, what, q) in SERIES.items():
        for x in ia(q):
            y = year_of(x)
            # l'« année » d'archive.org est parfois celle de la série (1700) : on la relit dans le titre quand il en donne une
            ty = re.search(r'\b(1[5-9]\d\d)\b', str(x.get('title') or ''))
            if ty:
                y = int(ty.group(1))
            if y is None or y > LAST:
                continue
            rows.append({'s': key, 'y': y, 't': re.sub(r'\s+', ' ', str(x.get('title') or ''))[:160], 'id': x['identifier'], 'r': rights_of(x)})
    rows.sort(key=lambda r: (r['s'], r['y'], r['id']))
    fields = ['s', 'y', 't', 'id', 'r']
    meta = {'source': 'Internet Archive (archive.org) ; Gallica (liens de recherche seulement)', 'licence': 'liens et années (rien de copié) ; mention de droits de chaque volume',
            'licence_url': 'https://archive.org/about/terms.php', 'url': 'https://archive.org/advancedsearch.php', 'built': time.strftime('%Y-%m-%d'), 'last': LAST,
            'series': {k: {'icon': v[0], 'name': v[1], 'what': v[2]} for k, v in SERIES.items()},
            'gallica': [dict(zip(['k', 'icon', 'name', 'q', 'from', 'to', 'what'], g)) for g in GALLICA],
            'what': 'Almanachs et annuaires anciens numérisés (jusqu’en 1925), année par année : liens vers Internet Archive, et recherches Gallica par année',
            'fields': fields, 'rows': [[r[k] for k in fields] for r in rows]}
    size = wm.write_gz(OUT, 'td-almanachs.json.gz', meta)
    from collections import Counter
    print(f'td-almanachs : {len(rows)} volumes {dict(Counter(r["s"] for r in rows))}, {size} octets')


if __name__ == '__main__':
    main()
