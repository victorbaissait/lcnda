#!/usr/bin/env python3
"""🎻 Lot 10 — Contes et chansons recueillis par les folkloristes du XIXe siècle (assets/data/l10-folklore.json.gz).

Source : fr.wikisource.org (textes du DOMAINE PUBLIC : les auteurs sont morts avant 1930 ; la mise en page de Wikisource est sous
CC BY-SA 4.0). On garde seulement : le titre, le recueil, le folkloriste, et la phrase du texte qui dit où et par qui le conte ou la
chanson a été recueilli (« Conté par Marie-Yvonne Guézennec, de Plouaret. »), avec le lien vers la page exacte. Le lieu est
rapproché d'une commune (assets/data/cc-communes.json.gz, IGN / Etalab, Licence Ouverte 2.0) des départements du recueil.

Lancer : python3 scripts/lot10-objets-traces/build_folklore.py [dossier de sortie]   (L10_RAW = cache des réponses)
Requêtes polies : une à la fois, 2,5 s entre deux appels à Wikisource, Retry-After respecté.
"""
import gzip, html, json, os, re, sys, time, unicodedata
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
WS = 'https://fr.wikisource.org/wiki/'
C = json.loads(gzip.open(os.path.join(ROOT, 'assets', 'data', 'cc-communes.json.gz')).read())['c']  # insee → [nom, lat, lon]

# (titre Wikisource, folkloriste, mort en, années de la collecte, départements, sorte, note)
WORKS = [
    ('Contes populaires de Basse-Bretagne', 'François-Marie Luzel', 1895, (1865, 1887), ['22', '29', '56'], 'conte', ''),
    ('Légendes chrétiennes de la Basse-Bretagne', 'François-Marie Luzel', 1895, (1865, 1881), ['22', '29', '56'], 'légende', ''),
    ('Chants populaires de la Basse-Bretagne', 'François-Marie Luzel', 1895, (1855, 1874), ['22', '29', '56'], 'chanson', 'Gwerziou Breiz-Izel : complaintes chantées en breton, traduites par Luzel.'),
    ('Contes de la Haute-Bretagne', 'Paul Sébillot', 1918, (1878, 1892), ['22', '35', '44', '56'], 'conte', ''),
    ('Contes des landes et des grèves', 'Paul Sébillot', 1918, (1878, 1900), ['22', '35', '44', '56'], 'conte', ''),
    ('Littérature orale de la Haute-Bretagne', 'Paul Sébillot', 1918, (1878, 1881), ['22', '35', '44', '56'], 'conte', ''),
    ('Contes populaires de la Gascogne', 'Jean-François Bladé', 1900, (1860, 1886), ['32', '47', '40', '82', '31', '65', '33', '64'], 'conte', ''),
    ('Littérature orale de la Picardie', 'Henry Carnoy', 1930, (1875, 1883), ['80', '60', '02', '62'], 'conte', ''),
    ('Littérature orale de la Basse-Normandie', 'Jean Fleury', 1894, (1870, 1883), ['50', '14', '61'], 'conte', ''),
    ('Légendes rustiques', 'George Sand', 1876, (1830, 1858), ['36', '18', '23'], 'légende', 'Légendes du Berry racontées par George Sand (pas un relevé mot à mot).'),
    ('Barzaz Breiz', 'Théodore Hersart de La Villemarqué', 1895, (1833, 1867), ['29', '22', '56'], 'chanson', 'Chants bretons publiés par La Villemarqué : il les a souvent arrangés, l’authenticité de certains est discutée.'),
]

FOLD = lambda s: re.sub(r'[^a-z0-9]+', ' ', unicodedata.normalize('NFD', str(s or '')).encode('ascii', 'ignore').decode().lower().replace('saint ', 'st ')).strip()
FOLD2 = lambda s: FOLD(str(s).replace('-', ' ').replace('’', ' ').replace("'", ' ')).replace('saint ', 'st ').replace('sainte ', 'ste ')
NAMES = {}
for insee, (nom, lat, lon) in C.items():
    NAMES.setdefault(FOLD2(nom), []).append((insee, nom, lat, lon))


PREFIX = {}
for _k, _hs in NAMES.items():
    PREFIX.setdefault(_k[:4], []).append((_k, _hs))


def subpages(base):
    out, cont = [], {}
    while True:
        d = wm.ws({'action': 'query', 'list': 'allpages', 'apprefix': base + ('' if base.startswith('Littérature orale de la Picardie') else '/'), 'apnamespace': 0, 'aplimit': 500, **cont})
        out += [p['title'] for p in d['query']['allpages']]
        if 'continue' not in d:
            return out
        cont = {'apcontinue': d['continue']['apcontinue']}


def contents(titles):
    """wikitext de plusieurs pages (50 par requête)"""
    out = {}
    for i in range(0, len(titles), 50):
        d = wm.ws({'action': 'query', 'prop': 'revisions', 'rvprop': 'content', 'rvslots': 'main', 'titles': '|'.join(titles[i:i + 50])})
        for pg in d.get('query', {}).get('pages', []):
            if pg.get('revisions'):
                out[pg['title']] = pg['revisions'][0]['slots']['main']['content']
    return out


PAGES = re.compile(r'<pages\s+index="([^"]+)"([^>]*)/?>', re.I)
ATTR = lambda a, k: (re.search(k + r'\s*=\s*"?([^"\s/>]+)"?', a) or [None, None])[1]


def plain(w):
    w = re.sub(r'<noinclude>.*?</noinclude>', ' ', w, flags=re.S)
    w = re.sub(r'\{\{(?:[^{}]|\{\{[^{}]*\}\})*\}\}', ' ', w)  # modèles
    w = re.sub(r'\[\[(?:[^|\]]*\|)?([^\]]*)\]\]', r'\1', w)
    w = re.sub(r'<[^>]+>', ' ', w)
    w = re.sub(r"'{2,}", '', w)
    return html.unescape(re.sub(r'[ \t]+', ' ', w))


def section(w, name):
    if not name:
        return w
    m = re.search(r'##\s*' + re.escape(name) + r'\s*##(.*?)(?=##\s*[^#\n]+\s*##|$)', w, re.S)
    if m:
        return m.group(1)
    m = re.search(r'<section\s+begin\s*=\s*"?' + re.escape(name) + r'"?\s*/>(.*?)<section\s+end\s*=\s*"?' + re.escape(name), w, re.S)
    return m.group(1) if m else None


# « Conté par Marie-Yvonne Guézennec, de Plouaret. » ; « Conté en 1879 par Rose Renaud, de Saint-Cast » ; « Dit par … de Lectoure » ;
# « Recueilli à Plouaret » ; « (Chanté par …, de Plufur, 1868) »
WHO = r'(?:Cont[ée]e?s?|Dit|Dite|Chant[ée]e?|Recueilli|Recueillie|Narr[ée]e?|Racont[ée]e?|Dict[ée]e?|Entendu|Communiqu[ée]e?)'
PAT = re.compile(WHO + r'[^.\n]{0,160}?\b(?:de|à|a|au|en)\s+((?:Saint|Sainte|Le|La|Les|L’|L\')?[-\s]?[A-ZÉÈÂÎÔ][\w’\'éèêëàâîïôöûüç-]+(?:[-\s](?:sur|sous|en|de|du|des|lès|les|la|le|aux|d’)?[-\s]?[A-ZÉÈÂÎÔ]?[\w’\'éèêëàâîïôöûüç-]+){0,4})')
YEAR = re.compile(r'\b(1[78]\d\d)\b')


def place_of(sentence, deps):
    """le premier nom de la phrase qui est une commune des départements du recueil"""
    for m in PAT.finditer(sentence):
        words = re.split(r'(\s+)', m.group(1).strip())
        cand = m.group(1).strip()
        # on essaie le nom entier, puis plus court (« Plouaret, près de Lannion » → « Plouaret »)
        parts = re.split(r'\s+', cand)
        for n in range(len(parts), 0, -1):
            name = ' '.join(parts[:n]).rstrip(',;:)')
            hits = [h for h in NAMES.get(FOLD2(name), []) if h[0][:2] in deps]
            if hits:
                return hits[0]
            # nom ancien devenu plus long (« Saint-Cast » → « Saint-Cast-le-Guildo ») : un seul candidat, sinon rien
            if n == len(parts) or n == 1:
                k = FOLD2(name)
                if len(k) >= 5:
                    pre = [h for kk, hs in PREFIX.get(k[:4], []) if kk.startswith(k + ' ') for h in hs if h[0][:2] in deps]
                    if len(pre) == 1:
                        return pre[0]
    return None


def main():
    rows, works = [], []
    for base, who, died, years, deps, kind, note in WORKS:
        titles = [t for t in subpages(base) if t != base and not re.search(r'(/| – )(Préface|Avant-propos|Additions|Table|Texte entier|Introduction|Références|Notes?|Index|Errata|Lettre)\b|/Breton$|Bilingue', t)]
        print(f'{base} : {len(titles)} pages', flush=True)
        found = 0
        main = contents(titles)
        want = {}  # titre → (page du livre, section)
        for t in titles:
            w = main.get(t, '')
            m = PAGES.search(w)
            if m:
                to = ATTR(m.group(2), 'to') or ATTR(m.group(2), 'from')
                if to:
                    want[t] = (f'Page:{m.group(1)}/{to}', ATTR(m.group(2), 'tosection'))
        pages = contents(sorted({v[0] for v in want.values()}))
        for t in titles:
            w = main.get(t, '')
            if t in want:
                pw = pages.get(want[t][0], '')
                sec = section(pw, want[t][1])
                if sec is None:
                    sec = pw if len(re.findall(WHO, plain(pw))) <= 1 else ''
                txt = plain(sec)
            elif len(w) > 600:
                txt = plain(w)
            else:
                continue  # sommaire
            tail = txt[-1500:]
            sents = [x.strip() for x in re.split(r'(?<=[.)\]])\s+|\n', tail) if re.search(WHO, x)]
            hit = None
            for x in reversed(sents):
                pl = place_of(x, deps)
                if pl:
                    hit = (x, pl)
                    break
            name = t.split('/')[-1].split(' – ')[-1]
            row = {'t': name, 'w': base, 'url': WS + t.replace(' ', '_'), 'k': kind}
            if hit:
                x, (insee, nom, lat, lon) = hit
                x = re.sub(r'\s+', ' ', x).strip(' ()[]')
                if len(x) > 220:
                    x = x[:219].rsplit(' ', 1)[0] + '…'
                y = YEAR.search(x)
                row.update({'q': x, 'insee': insee, 'p': nom, 'lat': lat, 'lon': lon, 'y': int(y.group(1)) if y else None})
                found += 1
            rows.append(row)
        works.append({'w': base, 'who': who, 'died': died, 'from': years[0], 'to': years[1], 'deps': deps, 'k': kind, 'note': note,
                      'url': WS + base.replace(' ', '_'), 'n': sum(1 for r in rows if r['w'] == base), 'placed': found})
        print(f'   placés : {found}', flush=True)
    os.makedirs(OUT, exist_ok=True)
    meta = {'source': 'Wikisource (fr)', 'url': 'https://fr.wikisource.org', 'licence': 'Textes du domaine public (auteurs morts avant 1931) ; pages Wikisource CC BY-SA 4.0',
            'licence_url': 'https://fr.wikisource.org/wiki/Wikisource:Droit_d%E2%80%99auteur', 'built': time.strftime('%Y-%m-%d'),
            'communes': 'IGN / Etalab (Licence Ouverte 2.0), assets/data/cc-communes.json.gz',
            'note': 'Le lieu vient de la phrase du texte (« Conté par …, de … ») ; quand il n’y en a pas, seul le recueil et sa région sont connus.'}
    fields = ['t', 'w', 'url', 'k', 'q', 'insee', 'p', 'lat', 'lon', 'y']
    out = {**meta, 'works': works, 'fields': fields, 'rows': [[r.get(k) for k in fields] for r in rows]}
    p = os.path.join(OUT, 'l10-folklore.json.gz')
    with gzip.GzipFile(p, 'wb', mtime=0, compresslevel=9) as f:
        f.write(json.dumps(out, ensure_ascii=False, separators=(',', ':')).encode())
    print(f'l10-folklore : {len(rows)} textes, {sum(1 for r in rows if r.get("insee"))} placés, {os.path.getsize(p)} octets')


if __name__ == '__main__':
    main()
