#!/usr/bin/env python3
"""🏰 Lot H — Les bastides du Sud-Ouest : th-bastides.

Source : l'article « Liste de bastides » de Wikipédia (CC BY-SA 4.0, « les contributeurs de Wikipédia »), lui-même d'après
G. Bernard (1993) et J. Dubourg (2002) : les communes par département, l'année de fondation (« Liste par année ») et le fondateur
(« Liste par fondateur » : Alphonse de Poitiers, Eustache de Beaumarchès, Édouard Ier…). La liste dit elle-même qu'elle n'est pas
exhaustive et que les dates varient selon les auteurs. Position et code INSEE de la commune : Wikidata (CC0). On garde aussi le
fondateur (P112) et la date de fondation (P571) de Wikidata quand l'élément « bastide » de la commune les donne.
Lancer : python3 -I scripts/telech-h/build_bastides.py [dossier de sortie]
"""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
TITLE = 'Liste de bastides'


def section(w, name):
    m = re.search(r'^==\s*' + re.escape(name) + r'\s*==\s*$(.*?)(?=^==[^=])', w, re.M | re.S)
    return m.group(1) if m else ''


def main():
    w = wm.wp_raw(TITLE)
    rows = {}
    # par département
    for line in section(w, 'Liste par département').split('\n'):
        m = re.match(r"\*\s*'''\[\[([^\]|]+)(?:\|([^\]]+))?\]\]'''\s*:(.*)", line)
        if not m:
            continue
        dep = (m.group(2) or m.group(1)).replace(' (département)', '')
        for t in wm.links(m.group(3)):
            rows.setdefault(t, {'t': t, 'dep': dep, 'y': None, 'by': ''})
    # par année
    for line in section(w, 'Liste par année').split('\n'):
        m = re.match(r"\*\s*'''(\d{4})'''\s*:(.*)", line)
        if not m:
            continue
        for t in wm.links(m.group(2)):
            r = rows.setdefault(t, {'t': t, 'dep': '', 'y': None, 'by': ''})
            r['y'] = r['y'] or int(m.group(1))
    # par fondateur
    for line in section(w, 'Liste par fondateur').split('\n'):
        m = re.match(r"\*\s*(?:Par\s*)?'''\[\[([^\]|]+)(?:\|([^\]]+))?\]\]'''(.*)", line)
        if not m:
            continue
        lab = re.sub(r'\{\{([IVX]+)(er|e)?\}\}', r'\1\2', m.group(2) or '')
        who = wm.plain('[[' + m.group(1) + ('|' + lab if lab else '') + ']]').replace('Edouard', 'Édouard')
        for t in wm.links(re.sub(r'<ref[^>]*>.*?</ref>', '', m.group(3)))[0:]:
            if t in rows and not rows[t]['by'] and t != m.group(1):
                rows[t]['by'] = who
    places = wm.wd_of_titles(list(rows))
    # Wikidata : fondateur et date de la commune (ou de l'élément « bastide » qui s'y trouve)
    qs = ' '.join('wd:' + p['q'] for p in places.values() if p.get('q'))
    wd = {}
    if qs:
        for b in wm.sparql('SELECT ?c ?byl ?s WHERE { VALUES ?c { ' + qs + ' } OPTIONAL { ?c wdt:P112 ?by . ?by rdfs:label ?byl FILTER(LANG(?byl)="fr") } OPTIONAL { ?c wdt:P571 ?s } }'):
            c = b['c']['value'].rsplit('/', 1)[-1]
            d = wd.setdefault(c, {'by': '', 's': None})
            if b.get('byl') and not d['by']:
                d['by'] = b['byl']['value']
            m = re.match(r'^\+?(\d{3,4})-', b.get('s', {}).get('value', ''))
            if m and d['s'] is None and 1150 <= int(m.group(1)) <= 1400:
                d['s'] = int(m.group(1))
    out = []
    for t, r in rows.items():
        p = places.get(t)
        if not p or p['lat'] is None or not p['insee']:
            continue
        d = wd.get(p['q'], {})
        out.append([t, p['insee'], p['lat'], p['lon'], r['dep'], r['y'] or d.get('s'), r['by'] or d.get('by', ''), 'wp' if r['y'] or r['by'] else ('wd' if d.get('s') or d.get('by') else 'wp'), p['q']])
    out.sort(key=lambda r: (r[5] or 9999, r[0]))
    meta = {'source': 'Wikipédia, « Liste de bastides » ; Wikidata', 'licence': 'CC BY-SA 4.0 (Wikipédia, les contributeurs) ; CC0 (Wikidata)', 'licence_url': 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr',
            'url': wm.wp_url(TITLE), 'built': wm.today(), 'what': 'Les bastides du Sud-Ouest : commune, année de fondation, fondateur (liste non exhaustive ; dates variables selon les auteurs)',
            'fields': ['wp', 'insee', 'lat', 'lon', 'dep', 'y', 'by', 'via', 'q'], 'rows': out}
    size = wm.write_gz(OUT, 'th-bastides.json.gz', meta)
    print(f'th-bastides : {len(out)} bastides ({sum(1 for r in out if r[5])} datées, {sum(1 for r in out if r[6])} avec fondateur), {size} octets')


if __name__ == '__main__':
    main()
