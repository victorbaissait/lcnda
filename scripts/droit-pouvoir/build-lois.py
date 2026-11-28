#!/usr/bin/env python3
"""⚖️ Ce que la loi disait — fabrique assets/data/dp-lois.json depuis scripts/droit-pouvoir/lois.json (règles choisies à la main)
et les articles de Wikipédia en français qu'elles citent.

  python3 -I scripts/droit-pouvoir/build-lois.py [dossier_cache]

Pour chaque règle : on télécharge l'article (texte rendu), on vérifie que la phrase citée y est MOT POUR MOT (sinon on s'arrête :
on ne publie jamais une phrase qu'on n'a pas lue), on trouve la section où elle est (lien direct « #section ») et les références
que Wikipédia donne pour ce paragraphe (liens Légifrance, Gallica, Wikisource, sites officiels…), avec leur texte.
Licence des phrases citées : Wikipédia, CC BY-SA 4.0 (citation courte, avec lien vers l'article et son historique).
"""
import html as H, json, os, re, sys, time, urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wp import fetch  # noqa: E402
from wptext import text_of, norm  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lois.json')
OUT = os.path.join(ROOT, 'assets', 'data', 'dp-lois.json')
GOOD = ('legifrance.gouv.fr', 'gallica.bnf.fr', 'wikisource.org', 'senat.fr', 'assemblee-nationale.fr', 'archives-nationales', 'conseil-constitutionnel.fr',
        'service-public.fr', 'persee.fr', 'cairn.info', 'openedition.org', 'hal.science', 'archive.org', 'doi.org', 'books.google', 'jstor.org')


def strip(s):
    s = re.sub(r'(?is)<sup[^>]*class="[^"]*reference[^"]*"[^>]*>.*?</sup>', '', s)
    s = re.sub(r'<[^>]+>', '', s)
    return norm(H.unescape(s))


def references(html):
    """{id de note : [{url, text}]} : la liste des notes en bas d'article"""
    out = {}
    for m in re.finditer(r'<li\b[^>]*\bid="(cite_note-[^"]+)"[^>]*>(.*?)</li>', html, re.S):
        body = m.group(2)
        text = strip(re.sub(r'(?is)<span class="mw-cite-backlink">.*?</span>', '', body))
        links = []
        for a in re.finditer(r'<a\b([^>]*)>', body):
            attrs = a.group(1)
            if 'ExtLink' not in attrs and 'external' not in attrs:
                continue
            h = re.search(r'href="([^"]+)"', attrs)
            u = H.unescape(h.group(1)) if h else ''
            if u.startswith('//'):
                u = 'https:' + u
            if u.startswith('http') and 'wikipedia.org' not in u and 'wikidata.org' not in u and 'wikiwix' not in u:
                links.append(u)
        out[m.group(1)] = {'text': text[:300], 'links': links}
    return out


def locate(html, quote):
    """→ (ancre de la section, [ids des notes du paragraphe]) ; None si la phrase n'est pas dans un paragraphe"""
    q = norm(quote)
    heads = [(m.start(), m.group(1)) for m in re.finditer(r'<h[2-4][^>]*\bid="([^"]+)"', html)]
    for m in re.finditer(r'<(p|li|dd|blockquote|div)\b[^>]*>(.*?)</\1>', html, re.S):
        if q not in strip(m.group(2)):
            continue
        sec = ''
        for pos, hid in heads:
            if pos < m.start():
                sec = hid
        notes = re.findall(r'href="#(cite_note-[^"]+)"', m.group(2))
        return sec, list(dict.fromkeys(notes))
    return None


def main():
    cache = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'data', 'cache', 'droit-pouvoir-wp')
    src = json.load(open(SRC, encoding='utf-8'))
    pages, bad = {}, []

    def page(title):
        if title not in pages:
            final, wt, html = fetch(cache, title)
            if not html:
                raise SystemExit(f'Article introuvable : {title}')
            pages[title] = (final, html, norm(text_of(html)), references(html))
        return pages[title]

    def source(item):
        final, html, text, refs = page(item['page'])
        if norm(item['quote']) not in text:
            bad.append(f"{item['id']} : la phrase n'est pas dans « {final} »")
            return None
        loc = locate(html, item['quote']) or ('', [])
        rs = []
        for n in loc[1]:
            r = refs.get(n)
            if not r:
                continue
            links = sorted(r['links'], key=lambda u: (not any(g in u for g in GOOD), len(u)))
            rs.append({'text': r['text'], 'url': links[0] if links else ''})
        url = 'https://fr.wikipedia.org/wiki/' + urllib.parse.quote(final.replace(' ', '_'), safe='()_,\'')
        return {'title': final, 'url': url + ('#' + urllib.parse.quote(loc[0], safe='_.-') if loc[0] else ''), 'section': loc[0].replace('_', ' '),
                'history': 'https://fr.wikipedia.org/w/index.php?' + urllib.parse.urlencode({'title': final, 'action': 'history'}),
                'quote': item['quote'], 'refs': [r for i, r in enumerate(rs) if r not in rs[:i]][:4]}

    rows = []
    for r in src['rows']:
        s = source(r)
        if s:
            rows.append({k: v for k, v in r.items() if k not in ('page', 'quote')} | {'src': s})
    arch = []
    for a in src.get('archives', []):
        s = source(a)
        if s:
            arch.append({k: v for k, v in a.items() if k not in ('page', 'quote')} | {'src': s})
    if bad:
        print('\n'.join(bad), file=sys.stderr)
        raise SystemExit(f'{len(bad)} phrase(s) introuvable(s) : rien n\'est écrit.')
    data = {'v': 1, 'built': time.strftime('%Y-%m-%d'), 'licence': 'Citations de Wikipédia (CC BY-SA 4.0), avec lien vers l’article',
            'licence_url': 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr', 'rows': rows, 'archives': arch}
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    nref = sum(len(r['src']['refs']) for r in rows)
    lf = sum(1 for r in rows for x in r['src']['refs'] if 'legifrance' in x['url'])
    print(f'{OUT} : {os.path.getsize(OUT)} octets ; {len(rows)} règles, {len(arch)} repères d\'archives, {len(pages)} articles, {nref} références ({lf} Légifrance)')


if __name__ == '__main__':
    main()
