#!/usr/bin/env python3
"""🌹 Lot F — Les villages qui couronnent une rosière (assets/data/tf-rosieres.json.gz).

Source : l'article « Rosière » de Wikipédia en français (CC BY-SA 4.0, les contributeurs de Wikipédia) : la liste des communes
qui élisent encore une rosière (section « Les rosières du XXIe siècle ») et les phrases de l'histoire qui nomment une commune.
Pour chaque commune : la phrase de l'article (citée telle quelle, sans balises), l'année « depuis » quand elle est écrite, la
position et le code INSEE (Wikidata, CC0). Aucune rosière n'est nommée : on garde la commune et la phrase, en coupant les noms de
personnes vivantes : la fin de phrase « élue … Prénom Nom » est coupée). Les communes nommées seulement en passant (Noyon, Paris…)
sont écartées (SKIP).
Lu avec action=raw. Lancer : python3 -I scripts/telech-f/build_rosieres.py [dossier de sortie]
"""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
ARTICLE = 'Rosière'
SKIP = {'Noyon', 'Paris', 'Pentecôte', 'Mittau', 'Louis XVIII', 'Napoléon Ier', 'Guy de Maupassant'}


def sentences(text):
    return [s.strip() for s in re.split(r'(?<=[.!?])\s+(?=[A-ZÉÀ«])', text) if s.strip()]


def main():
    w = wm.wp_raw(ARTICLE)
    out = {}
    # 1. la liste des communes d'aujourd'hui
    sec = w[w.index('== Les rosières du'):]
    sec = sec[:sec.index('\n== ', 5)]
    for line in sec.split('\n'):
        if not line.lstrip('*').strip() or not line.startswith('*'):
            continue
        ln = wm.links(line)
        txt = wm.plain(line.lstrip('* '))
        # le nom de la rosière élue (personne vivante) n'est pas gardé : on coupe la phrase à « , » qui précède un nom propre « Prénom Nom »
        txt = re.sub(r',?\s*(?:Laura|Marie|élue)\s+[A-ZÉ][a-zé]+\s+[A-ZÉ][A-Za-zé-]+.*$', '.', txt)
        if not ln:
            m = re.match(r'([A-ZÉ][\w’\'-]+(?:-[\w’\'-]+)*)\s*\(', txt)
            ln = [m.group(1)] if m else []
        if not ln:
            continue
        since = re.search(r'depuis\s+(?:le\s+\d+\s+\w+\s+)?(1\d{3}|20[0-2]\d)', txt) or re.search(r'(?:De|de)\s+(1\d{3})\s+à|à partir de\s+(1\d{3})|a eu lieu en\s+(1\d{3})', txt)
        out.setdefault(ln[0], {'wp': ln[0], 'since': int(next(g for g in since.groups() if g)) if since else None, 'now': True, 'quote': txt[:320]})
    # 2. l'histoire : les phrases qui disent « rosière » et nomment une commune
    hist = w[:w.index('== Les rosières du')]
    for par in hist.split('\n'):
        if par.startswith(('[[Fichier', '[[File', '{{', '=', ':')):
            continue
        for s in sentences(par):
            if 'osière' not in s:
                continue
            for t in wm.links(s):
                if re.fullmatch(r'\d{3,4}', t) or t in SKIP:
                    continue
                q = wm.plain(s)
                y = re.search(r'\b(1[5-9]\d\d)\b', q)
                if t not in out:
                    out[t] = {'wp': t, 'since': None, 'now': False, 'quote': q[:320], 'year': int(y.group(1)) if y else None}
                elif not out[t].get('old'):
                    out[t]['old'] = q[:320]
                    out[t]['year'] = out[t].get('year')
    geo = wm.wd_of_titles(list(out))
    rows = []
    for t, r in out.items():
        g = geo.get(t)
        if not g or not g['insee'] or g['lat'] is None:
            continue  # pas une commune française (un saint, un théâtre…)
        rows.append({'wp': t, 'q': g['q'], 'insee': g['insee'], 'lat': g['lat'], 'lon': g['lon'], 'since': r.get('since') if r['now'] else r.get('year'), 'now': r['now'], 'quote': r['quote'], 'old': r.get('old', '')})
    rows.sort(key=lambda r: r['wp'])
    assert len(rows) >= 15, f'{len(rows)} communes seulement'
    fields = ['wp', 'q', 'insee', 'lat', 'lon', 'since', 'now', 'quote', 'old']
    meta = {'source': 'Wikipédia — « Rosière » ; Wikidata', 'licence': 'CC BY-SA 4.0 (les contributeurs de Wikipédia) ; CC0 (Wikidata)', 'licence_url': 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr',
            'url': wm.wp_url(ARTICLE), 'history': wm.wp_url(ARTICLE).replace('/wiki/', '/w/index.php?title=') + '&action=history', 'built': wm.today(),
            'what': 'Les communes qui ont couronné ou couronnent encore une rosière, avec la phrase de Wikipédia qui le dit (liste non exhaustive)',
            'fields': fields, 'rows': [[r[k] for k in fields] for r in rows]}
    size = wm.write_gz(OUT, 'tf-rosieres.json.gz', meta)
    print(f'tf-rosieres : {len(rows)} communes ({sum(1 for r in rows if r["now"])} aujourd’hui), {size} octets')


if __name__ == '__main__':
    main()
