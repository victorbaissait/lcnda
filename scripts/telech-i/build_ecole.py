#!/usr/bin/env python3
"""✏️ Lot I — « Ce que grand-père devait savoir à 12 ans » : une petite sélection de textes d'école du domaine public → ti-ecole.json.gz.

PROLONGE le lot 9 (l9a : livres de classe et le lien « recherche des sujets du certificat d'études » sur Gallica) : ici, des textes
recopiés. Chaque élément vient d'une page de Wikisource (textes du domaine public ; transcriptions CC BY-SA 4.0) ; le script lit la
page (action=render), retrouve le passage à partir de ses premiers mots et le recopie TEL QUEL jusqu'à la fin de la phrase (au plus
~600 signes). Si le passage n'est plus dans la page, le script s'arrête : rien n'est réécrit, rien n'est inventé.
Sujets de problèmes : aucun recueil transcrit sur Wikisource (le recueil de B. Subercaze n'existe qu'en scan) → liens seulement.
Lancer : python3 -I scripts/telech-i/build_ecole.py [dossier de sortie]
"""
import os, re, sys, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
# (sorte, titre affiché, page Wikisource, auteur et livre, année, premiers mots du passage, nombre de phrases)
ITEMS = [
    ('dictee', 'Dictée : « L’art de donner »', 'Cours de dictées orthologiques en texte suivi', 'Théodore Lepetit, « Cours de dictées orthologiques en texte suivi »', 1860,
     'Turenne aperçut un jour dans son armée', 3),
    ('dictee', 'Dictée : « Le trépied d’or »', 'Cours de dictées orthologiques en texte suivi', 'Théodore Lepetit, « Cours de dictées orthologiques en texte suivi »', 1860,
     'Un jour, des étrangers de Milet', 2),
    ('examen', 'Les épreuves écrites du certificat', 'Le certificat d’études primaires de M. B. Subercaze', 'Revue pédagogique (compte rendu du recueil de B. Subercaze)', 1890,
     'À la suite des documents', 2),
    ('examen', 'Le débat sur la dictée au certificat', 'De la réforme de l’orthographe et de la suppression de la dictée aux examens du certificat d’études primaires',
     'R. Aubert, Revue pédagogique', 1890, 'Deux questions sont aujourd’hui soulevées', 1),
    ('examen', 'Moins sévère pour les fautes de la dictée (1891)', 'La circulaire ministérielle du 27 avril 1891 sur l’abus des exigences grammaticales dans la dictée',
     'Manuel général de l’instruction primaire, repris par la Revue pédagogique', 1891, 'Naguère, à propos de l’enseignement de la langue française', 1),
    ('chiffres', 'Combien d’élèves l’obtenaient (Paris, 1873-1877)', 'Certificats d’études des écoles primaires de Paris, en 1873 et en 1877', 'Revue pédagogique', 1877,
     'La Ville de Paris a délivré', 2),
]


def main():
    rows, cache = [], {}
    for kind, label, page, book, year, start, n in ITEMS:
        if page not in cache:
            h = wm.render(page)
            assert h, f'page introuvable : {page}'
            cache[page] = ' '.join(wm.text_of(h).split())
        txt = cache[page]
        i = txt.find(start)
        assert i >= 0, f'passage introuvable : {start} ({page})'
        rest = txt[i:]
        cut, k = 0, 0
        for m in re.finditer(r'[.!?»](?=\s+[A-ZÉÀ«—]|\s*$)', rest):
            cut, k = m.end(), k + 1
            if k >= n or cut > 600:
                break
        q = rest[:cut or 600].strip()
        if len(q) > 640:
            q = q[:600].rsplit(' ', 1)[0] + ' …'
        assert q.rstrip(' …') in txt
        rows.append([kind, label, book, year, q, 'https://fr.wikisource.org/wiki/' + urllib.parse.quote(page.replace(' ', '_'))])
        print(f'{label} : {q[:80]}…')
    fields = ['k', 'label', 'book', 'y', 'q', 'url']
    meta = {'source': 'Wikisource — livres et revues d’école du domaine public (Lepetit 1860, Revue pédagogique 1877-1891)',
            'licence': 'Domaine public (textes) ; transcriptions Wikisource CC BY-SA 4.0', 'licence_url': 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr',
            'url': 'https://fr.wikisource.org/wiki/' + urllib.parse.quote(ITEMS[0][2].replace(' ', '_')), 'built': wm.today(),
            'what': 'Une petite sélection de dictées et de textes sur le certificat d’études, recopiés tels quels avec leur source', 'fields': fields, 'rows': rows,
            'links': [['Le recueil de B. Subercaze (sujets du certificat) sur Internet Archive', 'https://archive.org/search?query=Subercaze+certificat'],
                      ['Recueils de sujets du certificat d’études sur Gallica', 'https://gallica.bnf.fr/services/engine/search/sru?operation=searchRetrieve&version=1.2&query=%28gallica%20all%20%22sujets%22%20and%20gallica%20all%20%22certificat%20d%27%C3%A9tudes%22%29']]}
    size = wm.write_gz(OUT, 'ti-ecole.json.gz', meta)
    print(f'ti-ecole : {len(rows)} textes, {size} octets')


if __name__ == '__main__':
    main()
