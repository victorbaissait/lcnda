#!/usr/bin/env python3
"""🎶 Lot I — les chansons de métier des recueils du domaine public de Wikisource → ti-chansons.json.gz.

PROLONGE « 🎼 Les chansons de son enfance » (l9a-chansons, lot 9 : 20 chansons populaires datées — aucune n'est une chanson de
métier) : ici un index PAR MÉTIER. Pour chaque mot de métier, on cherche sur Wikisource (page de recherche du site, une par mot)
les poèmes ou chansons dont le TITRE nomme ce métier et qui font partie d'un recueil de chansons ou de chants (le titre du
recueil contient « chanson » ou « chant ») publié en 1900 au plus tard. On lit la page (action=render) pour recopier son premier vers
tel quel, le recueil, l'auteur et l'année.
Textes du domaine public ; transcriptions Wikisource sous CC BY-SA 4.0.
Lancer : python3 -I scripts/telech-i/build_chansons.py [dossier de sortie]
"""
import os, re, sys, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
# mot cherché dans le titre → clé de métier (celle de metiers-anciens.json quand elle existe) et motif pour la fiche
JOBS = {'forgeron': 'forgeron', 'forgerons': 'forgeron', 'fileuse': 'fileuse', 'fileuses': 'fileuse', 'meunier': 'meunier', 'meunière': 'meunier',
        'marin': 'marin', 'marins': 'marin', 'matelot': 'marin', 'matelots': 'marin', 'berger': 'berger', 'bergère': 'berger', 'bergers': 'berger',
        'laboureur': 'laboureur', 'laboureurs': 'laboureur', 'scieurs': 'scieur de long', 'tisserand': 'tisserand', 'tisserands': 'tisserand',
        'vigneron': 'vigneron', 'vignerons': 'vigneron', 'vendangeurs': 'vigneron', 'sabotier': 'sabotier', 'cordonnier': 'cordonnier', 'maçon': 'maçon',
        'maçons': 'maçon', 'pêcheur': 'pêcheur', 'pêcheurs': 'pêcheur', 'moissonneurs': 'moissonneur', 'moissonneur': 'moissonneur', 'faucheurs': 'faucheur',
        'lavandière': 'lavandière', 'lavandières': 'lavandière', 'laveuses': 'lavandière', 'tailleur': 'tailleur', 'charpentier': 'charpentier',
        'bûcheron': 'bûcheron', 'bûcherons': 'bûcheron', 'charbonnier': 'charbonnier', 'mineur': 'mineur', 'mineurs': 'mineur', 'boulanger': 'boulanger',
        'tonnelier': 'tonnelier', 'batelier': 'batelier', 'bateliers': 'batelier', 'roulier': 'roulier', 'rouliers': 'roulier', 'compagnons': 'compagnon',
        'canuts': 'tisserand', 'ouvriers': 'ouvrier', 'paysans': 'laboureur', 'vachère': 'berger', 'pâtre': 'berger', 'meuniers': 'meunier',
        'tisseuse': 'tisserand', 'dentellière': 'dentellière', 'menuisier': 'menuisier', 'cocher': 'cocher', 'postillon': 'postillon', 'ramoneur': 'ramoneur',
        'chiffonnier': 'chiffonnier', 'nourrice': 'nourrice', 'soldat': 'soldat', 'conscrit': 'soldat', 'conscrits': 'soldat'}


def search(word):
    u = 'https://fr.wikisource.org/w/index.php?' + urllib.parse.urlencode({'search': f'intitle:{word}', 'fulltext': '1', 'ns0': '1', 'limit': '100'})
    h = wm.get(u, 'text/html').decode('utf-8')
    return [t.replace('&#039;', "'").replace('&amp;', '&') for t in re.findall(r'<a href="/wiki/[^"]+" title="([^"]+)" data-serp', h)]


def fold_t(s):
    return re.sub(r'\W+', ' ', s.lower()).strip()


def year_of(h):
    h = re.sub(r'<[^>]+>', '', h[:30000])
    m = re.search(r',(?:&nbsp;|\s)*(1[5-9]\d\d)(?:&nbsp;|\s)*\(', h) or re.search(r'itemprop="datePublished"[^>]*>(1[5-9]\d\d)', h) or re.search(r'(?:&nbsp;|,\s)(1[5-9]\d\d)</span>', h)
    return int(m.group(1)) if m else None


def main():
    seen, rows, books = set(), [], {}
    for word, key in JOBS.items():
        for t in search(word):
            if '/' not in t or t in seen:
                continue
            parent, leaf = t.rsplit('/', 1)
            if not re.search(r'(?i)chanson|chants?\b', parent) or not re.search(r'(?i)\b' + re.escape(word) + r'\b', leaf):
                continue
            seen.add(t)
            h = wm.render(t)
            if not h:
                continue
            full = re.sub(r'<style.*?</style>', '', h, flags=re.S)
            y, am = year_of(full), re.search(r'title="Auteur:([^"]+)"', full)
            if y is None or not am:  # la page d'une chanson n'a souvent ni année ni auteur : ceux du recueil
                if parent not in books:
                    ph = wm.render(parent)
                    books[parent] = re.sub(r'<style.*?</style>', '', ph, flags=re.S) if ph else ''
                y = y if y is not None else year_of(books[parent])
                am = am or re.search(r'title="Auteur:([^"]+)"', books[parent])
            if y is None or y > 1900:
                print(f'  - {t} : année {y}', file=sys.stderr)
                continue
            body = [l for l in wm.text_of(h).split('\n') if len(l) > 12 and not re.search(r'\(p\.|◄|►|^\d+$', l) and fold_t(l) != fold_t(leaf)]
            # le premier vers : pas l'air indiqué (« Air : … »), une dédicace, une note de l'éditeur ou une mention du site
            body = [l.replace('\ufeff', '').lstrip('_ ').strip() for l in body]
            first = next((l for l in body if len(l) > 12 and not l.isupper() and not re.match(r'(?i)(air\b|\(|pour les autres éditions|voir aussi|à la mémoire|à mon|à m\.|les partitions|musique|paroles|version|refrain|dédié)', l)), '')
            if not first:
                continue
            first = first if len(first) <= 160 else first[:157].rsplit(' ', 1)[0] + ' …'
            rows.append([key, leaf, parent, am.group(1) if am else '', y, first, 'https://fr.wikisource.org/wiki/' + urllib.parse.quote(t.replace(' ', '_'))])
            print(f'{key} : {leaf} ({parent}, {y}) — {first[:60]}')
    assert len(rows) >= 10, f'{len(rows)} chansons seulement'
    rows.sort(key=lambda r: (r[0], r[4], r[1]))
    fields = ['job', 't', 'book', 'author', 'y', 'first', 'url']
    meta = {'source': 'Wikisource — recueils de chansons et de chants du domaine public', 'licence': 'Domaine public (textes) ; transcriptions Wikisource CC BY-SA 4.0',
            'licence_url': 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr', 'url': 'https://fr.wikisource.org/wiki/Catégorie:Chansons',
            'built': wm.today(), 'what': 'Chansons de métier (forgeron, fileuse, marin, meunier…) : titre, recueil, année, premier vers', 'fields': fields, 'rows': rows}
    size = wm.write_gz(OUT, 'ti-chansons.json.gz', meta)
    print(f'ti-chansons : {len(rows)} chansons pour {len({r[0] for r in rows})} métiers, {size} octets')


if __name__ == '__main__':
    main()
