#!/usr/bin/env python3
"""LCNDA — lot N2 des téléchargements : les petits packs de texte rédigés pour LCNDA, et les chiffres anciens de mortalité.

    python3 -I scripts/telech-n2/build_textes.py OUT_DIR [--offline]

  🩺 tn2-maladies   dictionnaire des maladies et causes de mort d'autrefois (scripts/telech-n2/textes/maladies.tsv)
  📜 tn2-formules   petit glossaire des formules des actes en français ancien (textes/formules.tsv)
  🇨🇭 tn2-heimatort  Suisse : le lieu d'origine et la commune de bourgeoisie (textes/heimatort.json)
  ⏳ tn2-mortalite  ce que disaient les tables de mortalité anciennes (Deparcieux 1746, Duvillard 1806) : des phrases d'auteurs
                   du XIXᵉ siècle (domaine public) recopiées de Wikisource (transcription CC BY-SA 4.0), avec leur page.
                   Les tables complètes ne sont pas recopiées : aucune transcription vérifiée n'a été trouvée (pas de chiffres
                   inventés). Sans --offline, les phrases sont relues sur fr.wikisource.org ; le script s'arrête si elles manquent.

Les textes rédigés pour LCNDA sont sous CC BY-SA 4.0, d'après le Dictionnaire de la langue française d'É. Littré (1873, domaine
public) et le Wiktionnaire (CC BY-SA 4.0) : aucune définition n'est recopiée mot pour mot.
"""
import json
import os
import re
import sys
import unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm  # noqa: E402

HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'textes')
BYSA = {'licence': 'CC BY-SA 4.0', 'licence_url': 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr'}
LITTRE = 'https://fr.wikisource.org/wiki/Dictionnaire_de_la_langue_fran%C3%A7aise_(Littr%C3%A9)'


def fold(s):
    s = unicodedata.normalize('NFD', str(s)).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


def tsv(name, cols):
    rows = []
    for line in open(os.path.join(HERE, name), encoding='utf-8'):
        if not line.strip() or line.startswith('#'):
            continue
        parts = line.rstrip('\n').split('\t')
        parts += [''] * (len(cols) - len(parts))
        r = dict(zip(cols, parts))
        r['alt'] = [a.strip() for a in r.get('alt', '').split('|') if a.strip()]
        rows.append(r)
    keys = [fold(r['w']) for r in rows]
    dup = {k for k in keys if keys.count(k) > 1}
    if dup:
        sys.exit(f'{name} : mots en double {sorted(dup)}')
    return rows


# les phrases de mortalité : (page Wikisource, mots qui doivent y être, début et fin de la phrase recopiée)
MORT = [
    ('De la Vie humaine', 'Jules Haime, « De la vie humaine », Revue des Deux Mondes, 1855',
     r'ainsi, sur 100 naissances, il n.y aurait plus que 80 survivans au bout de deux ans[^.]*\.',
     r'Avant la révolution, Duvillard ne portait qu.à 50 le nombre des jeunes gens.*?au moins de 60 sur 100'),
    ('Des assurances sur la vie', 'Alexis Bailleux de Marisy, « Des assurances sur la vie », Revue des Deux Mondes, 1867',
     r'Deparcieux la dressa en 1746[^.]*\.', r'Si la première table de mortalité est due[^.]*\.'),
]


def mortalite(offline):
    quotes = []
    if not offline:
        for title, label, *pats in MORT:
            body = wm.get('https://fr.wikisource.org/w/index.php?' + __import__('urllib.parse').parse.urlencode({'title': title, 'action': 'render'}), 'text/html').decode('utf-8', 'replace')
            import html as H
            t = re.sub(r'\s+', ' ', H.unescape(re.sub(r'<[^>]+>', ' ', body)))
            for p in pats:
                m = re.search(p, t, re.I)
                if not m:
                    sys.exit(f'Wikisource « {title} » : la phrase {p[:40]}… est introuvable')
                quotes.append({'q': m.group(0).strip(), 'from': label, 'url': 'https://fr.wikisource.org/wiki/' + title.replace(' ', '_')})
    else:
        old = os.path.join(sys.argv[1], 'tn2-mortalite.json.gz')
        if os.path.exists(old):
            import gzip
            quotes = json.load(gzip.open(old))['quotes']
    return {'source': 'Wikisource (textes du domaine public ; transcription CC BY-SA 4.0)', 'url': 'https://fr.wikisource.org/wiki/De_la_Vie_humaine',
            **BYSA, 'built': wm.today(), 'what': 'Ce que disaient les tables de mortalité anciennes (Deparcieux 1746, Duvillard 1806), en phrases d’auteurs du XIXᵉ siècle',
            'note': 'Les tables complètes de Deparcieux et de Duvillard ne sont pas recopiées : aucune transcription vérifiée n’a été trouvée. Ces tables ne valent que pour leur temps et leur population (rentiers des tontines pour Deparcieux).',
            'tables': [{'id': 'deparcieux', 'n': 'Antoine Deparcieux, Essai sur les probabilités de la durée de la vie humaine (1746)', 'pop': 'rentiers des tontines de 1689 et 1696, religieux et religieuses',
                        'url': 'https://gallica.bnf.fr/services/engine/search/sru?operation=searchRetrieve&query=(gallica%20all%20%22Deparcieux%22%20and%20gallica%20all%20%22dur%C3%A9e%20de%20la%20vie%20humaine%22)'},
                       {'id': 'duvillard', 'n': 'Emmanuel-Étienne Duvillard, Analyse et tableaux de l’influence de la petite vérole sur la mortalité à chaque âge (1806)', 'pop': 'la France d’avant 1789',
                        'url': 'https://gallica.bnf.fr/services/engine/search/sru?operation=searchRetrieve&query=(gallica%20all%20%22Duvillard%22%20and%20gallica%20all%20%22petite%20v%C3%A9role%22)'}],
            'quotes': quotes, 'rows': quotes}


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    out, offline = sys.argv[1], '--offline' in sys.argv
    common = {'source': 'Rédigé pour LCNDA, d’après le Dictionnaire de la langue française d’É. Littré (1873, domaine public) et le Wiktionnaire (CC BY-SA 4.0)',
              'url': LITTRE, **BYSA, 'built': wm.today()}
    M = tsv('maladies.tsv', ['w', 'alt', 'm', 'k'])
    meta = {**common, 'what': 'Maladies et causes de mort d’autrefois, en mots d’aujourd’hui (« fièvre putride », « mal caduc », « suites de couches »…)',
            'note': 'Le sens donné est le plus fréquent : un mot ancien couvrait souvent plusieurs maladies. Ce n’est jamais un diagnostic.',
            'kinds': {'fievre': 'Fièvres', 'poumons': 'Poumons et poitrine', 'ventre': 'Ventre', 'enfant': 'Maladies d’enfants', 'couches': 'Grossesse et accouchement',
                      'peau': 'Peau et plaies', 'nerfs': 'Tête et nerfs', 'coeur': 'Cœur et sang', 'accident': 'Accidents', 'vieillesse': 'Vieillesse', 'epidemie': 'Épidémies', 'autre': 'Autres'},
            'fields': ['w', 'alt', 'm', 'k'], 'rows': [[r['w'], r['alt'], r['m'], r['k']] for r in M]}
    print('tn2-maladies', len(M), wm.write_gz(out, 'tn2-maladies.json.gz', meta))
    F = tsv('formules.tsv', ['w', 'alt', 'm', 'k', 'tip'])
    meta = {**common, 'what': 'Les formules des actes en français ancien (« feu », « honnête femme », « veuve en premières noces », « majeur de vingt-cinq ans »…)',
            'kinds': {'famille': 'Famille', 'titre': 'Titres et qualités', 'age': 'Âge', 'religion': 'Religion et sacrements', 'date': 'Dates', 'lieu': 'Lieux', 'metier': 'Métiers',
                      'signature': 'Signatures', 'notaire': 'Chez le notaire', 'autre': 'Mots de liaison'},
            'fields': ['w', 'alt', 'm', 'k', 'tip'], 'rows': [[r['w'], r['alt'], r['m'], r['k'], r['tip']] for r in F]}
    print('tn2-formules', len(F), wm.write_gz(out, 'tn2-formules.json.gz', meta))
    Hm = json.load(open(os.path.join(HERE, 'heimatort.json'), encoding='utf-8'))
    meta = {**Hm, 'source': 'Rédigé pour LCNDA', 'url': 'https://www.agvchapp.bfs.admin.ch/fr', 'built': wm.today(), 'what': Hm['title'], 'rows': Hm['links']}
    print('tn2-heimatort', len(Hm['paras']), wm.write_gz(out, 'tn2-heimatort.json.gz', meta))
    D = mortalite(offline)
    print('tn2-mortalite', len(D['quotes']), wm.write_gz(out, 'tn2-mortalite.json.gz', D))


if __name__ == '__main__':
    main()
