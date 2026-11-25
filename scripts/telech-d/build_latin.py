#!/usr/bin/env python3
"""📜 Lot D — Vocabulaire latin des actes paroissiaux, tiré du Wiktionnaire (assets/data/td-latin.json.gz).

Source : Wiktionnaire en français (https://fr.wiktionary.org), textes sous licence Creative Commons Attribution - Partage dans les
mêmes conditions 4.0 (CC BY-SA 4.0) ; auteurs : les contributeurs du Wiktionnaire (historique de chaque page). On ne garde que la
section « Latin » des pages dont le titre est dans la liste MOTS ci-dessous (le vocabulaire des registres : baptême, mariage,
sépulture, parenté, dates, mois, nombres, métiers et lieux de l'église), et pour chacune : la nature (nom, verbe, forme fléchie…)
et les deux premières définitions, nettoyées. Chaque ligne garde l'adresse de sa page (lien « ↗ source ») et la licence.

Deux façons de lancer :
  python3 scripts/telech-d/build_latin.py [dossier de sortie]
        → l'API du Wiktionnaire, page par page (paquets de 50 titres, une requête à la fois, pause de 3 s) ;
  python3 scripts/telech-d/build_latin.py --dump frwiktionary-latest-pages-articles.xml.bz2 [dossier de sortie]
        → le fichier complet du Wiktionnaire (dumps.wikimedia.org, ≈ 1 Go, téléchargé par .github/workflows/telech-d.yml) :
          en plus des mots de la liste, toutes les FORMES FLÉCHIES latines qui renvoient à un mot de la liste
          (« Génitif singulier de filius » → filii), pour que l'aide à la lecture reconnaisse aussi filii, filio, filiorum…
(TD_RAW = cache des réponses de l'API)
"""
import bz2, os, re, sys, time, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
args = sys.argv[1:]
DUMP = args[args.index('--dump') + 1] if '--dump' in args else ''
rest = [a for i, a in enumerate(args) if a != '--dump' and (i == 0 or args[i - 1] != '--dump')]
OUT = rest[0] if rest else os.path.join(ROOT, 'assets', 'data')

# le vocabulaire des registres, rangé par sorte d'acte (a) et de mot (k) — même rangement que l'aide à la lecture
MOTS = {
    ('bapteme', 'mot'): 'baptizo baptizavi baptizatus baptizata baptisma baptismus natus nata nascor infans proles patrinus matrina susceptor levans '
                        'legitimus legitima naturalis illegitimus spurius gemellus expositus obstetrix fons sacer impono nomen hodie heri nudius',
    ('mariage', 'mot'): 'matrimonium conjux conjunx conjuges coniunx copulo conjungo sponsus sponsa sponsalia uxor maritus viduus vidua relicta adolescens '
                        'virgo puella testis bannum proclamatio denuntiatio impedimentum dispensatio consanguinitas affinitas gradus consensus benedictio nuptiae nuptialis',
    ('sepulture', 'mot'): 'obeo obiit decedo decessit morior mortuus mortua defunctus defuncta sepelio sepultus sepulta sepultura coemeterium cadaver corpus '
                          'anima sacramentum extremus unctio viaticum requiesco aetas annus circiter',
    ('general', 'parente'): 'filius filia pater mater frater soror avus avia nepos neptis patruus avunculus amita matertera consobrinus sobrinus '
                            'privignus vitricus noverca socer socrus gener nurus levir cognatus parens quondam',
    ('general', 'mois'): 'mensis ianuarius januarius februarius martius aprilis maius iunius junius iulius julius augustus september october november december '
                         'dies kalendae nonae idus hebdomada feria dominica sabbatum',
    ('general', 'nombre'): 'unus duo tres quattuor quinque sex septem octo novem decem undecim duodecim viginti triginta quadraginta quinquaginta '
                           'sexaginta septuaginta octoginta nonaginta centum mille primus secundus tertius quartus quintus sextus septimus octavus nonus decimus '
                           'vigesimus trigesimus centesimus millesimus',
    ('general', 'metier'): 'parochus curatus vicarius presbyter sacerdos rector capellanus clericus agricola colonus faber sutor sartor molitor textor '
                           'pistor caupo mercator miles nobilis dominus magister famulus ancilla pauper',
    ('general', 'mot'): 'parochia ecclesia paroecia dioecesis capella oppidum villa vicus pagus domus locus incola habitator praesens infrascriptus '
                        'supradictus praedictus idem ejusdem eiusdem hujus huius anno domini ego et vero etiam scilicet testor signum subscripsi',
}
LEMMAS = {}
for (a, k), words in MOTS.items():
    for w in words.split():
        LEMMAS.setdefault(w, (a, k))

POS = {'nom': 'nom', 'verbe': 'verbe', 'adjectif': 'adjectif', 'adverbe': 'adverbe', 'adjectif numéral': 'nombre', 'nom propre': 'nom propre',
       'pronom': 'pronom', 'conjonction': 'conjonction', 'préposition': 'préposition', 'pronom personnel': 'pronom', 'pronom démonstratif': 'pronom',
       'participe': 'participe', 'adjectif démonstratif': 'adjectif'}


def clean(s):
    """une ligne de définition (wikicode) → texte simple"""
    s = re.sub(r'<ref[^>]*/>|<ref[^>]*>.*?</ref>', '', s)
    s = re.sub(r'\{\{(?:lien|l)\|([^|}]+)[^}]*\}\}', r'\1', s)
    s = re.sub(r'\{\{w\|([^|}]+)(?:\|([^}]+))?\}\}', lambda m: m.group(2) or m.group(1), s)
    s = re.sub(r'\{\{[^{}]*\}\}', '', s)
    s = re.sub(r'\{\{[^{}]*\}\}', '', s)
    s = re.sub(r'\[\[(?:[^|\]]*\|)?([^\]]+)\]\]', r'\1', s)
    s = re.sub(r"'''?", '', s)
    s = re.sub(r'<[^>]+>', '', s)
    s = re.sub(r'\s+', ' ', s).strip(' :;,')
    return s


def latin_section(text):
    m = re.search(r'^==\s*\{\{langue\|la\}\}\s*==\s*$', text, re.M)
    if not m:
        return ''
    nxt = re.search(r'^==\s*\{\{langue\|', text[m.end():], re.M)
    return text[m.end(): m.end() + nxt.start()] if nxt else text[m.end():]


def parse(title, text):
    """→ [{pos, flex, defs, of}] pour la section latine"""
    sec = latin_section(text)
    out = []
    for h in re.finditer(r'^===\s*\{\{S\|([^|}]+)\|la(\|flexion)?[^}]*\}\}\s*===\s*$', sec, re.M):
        pos = h.group(1).strip()
        if pos not in POS:
            continue
        body = sec[h.end():]
        nxt = re.search(r'^===?\s', body, re.M)
        body = body[:nxt.start()] if nxt else body
        defs, of = [], ''
        for line in body.splitlines():
            if re.match(r'^#(?![*:#])', line):
                raw = line[1:]
                ofm = re.search(r"\bd(?:e|u|’|')(?:'')?\s*(?:'')?\s*(?:\[\[|\{\{(?:lien|l)\|)([^\]|#}]+)", raw) if h.group(2) else None
                if ofm and not of:
                    of = ofm.group(1).strip()
                d = clean(raw)
                if d and re.search(r'\w{2}', d) and len(defs) < 2:
                    defs.append(d[:160])
        if defs:
            out.append({'pos': POS[pos], 'flex': bool(h.group(2)), 'defs': defs, 'of': of})
    return out


def row_of(title, parsed, a, k):
    first = parsed[0]
    d = ' ; '.join(first['defs'])
    if len(parsed) > 1 and parsed[1]['pos'] != first['pos']:
        d += f" — ({parsed[1]['pos']}) " + parsed[1]['defs'][0]
    return {'t': title, 'd': d[:260], 'pos': first['pos'] + (' (forme)' if first['flex'] else ''), 'of': first['of'], 'a': a, 'k': k,
            'url': 'https://fr.wiktionary.org/wiki/' + urllib.parse.quote(title.replace(' ', '_'))}


def from_api():
    rows = []
    titles = sorted(LEMMAS)
    for i in range(0, len(titles), 50):
        d = wm.mw('fr.wiktionary.org', {'action': 'query', 'prop': 'revisions', 'rvprop': 'content', 'rvslots': 'main', 'titles': '|'.join(titles[i:i + 50])})
        for p in d['query'].get('pages', []):
            if p.get('missing') or not p.get('revisions'):
                continue
            parsed = parse(p['title'], p['revisions'][0]['slots']['main']['content'])
            if parsed:
                a, k = LEMMAS[p['title']]
                rows.append(row_of(p['title'], parsed, a, k))
    return rows


def from_dump(path):
    """parcourt le fichier complet : les pages de la liste + les formes fléchies qui renvoient à un mot de la liste"""
    rows, title, buf, intext = [], None, [], False
    with bz2.open(path, 'rt', encoding='utf-8') as f:
        for line in f:
            if '<title>' in line:
                title = re.sub(r'.*<title>(.*?)</title>.*', r'\1', line.strip())
            if '<text' in line and not intext:
                intext = True
                buf = [re.sub(r'.*<text[^>]*>', '', line)]
                if '</text>' in line:
                    intext = False
            elif intext:
                buf.append(line)
                if '</text>' in line:
                    intext = False
            if not intext and buf and title is not None:
                text = ''.join(buf).replace('</text>', '')
                buf = []
                if ':' in title or '{{langue|la}}' not in text:
                    continue
                import html
                text = html.unescape(text)
                parsed = parse(title, text)
                if not parsed:
                    continue
                if title in LEMMAS:
                    rows.append(row_of(title, parsed, *LEMMAS[title]))
                elif parsed[0]['flex'] and parsed[0]['of'] in LEMMAS:
                    rows.append(row_of(title, parsed, *LEMMAS[parsed[0]['of']]))
    return rows


def main():
    rows = from_dump(DUMP) if DUMP else from_api()
    rows.sort(key=lambda r: (r['t'].lower()))
    fields = ['t', 'd', 'pos', 'of', 'a', 'k', 'url']
    meta = {'source': 'Wiktionnaire (fr.wiktionary.org)', 'licence': 'CC BY-SA 4.0', 'licence_url': 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr',
            'authors': 'les contributeurs du Wiktionnaire (historique de chaque page)', 'url': 'https://fr.wiktionary.org/wiki/Catégorie:latin',
            'built': time.strftime('%Y-%m-%d'), 'mode': 'dump' if DUMP else 'api', 'lemmas': len(LEMMAS),
            'what': 'Vocabulaire latin des registres paroissiaux (baptême, mariage, sépulture, parenté, dates, nombres, métiers) : définitions du Wiktionnaire',
            'fields': fields, 'rows': [[r[k] for k in fields] for r in rows]}
    size = wm.write_gz(OUT, 'td-latin.json.gz', meta)
    print(f'td-latin : {len(rows)} mots ({len(LEMMAS)} dans la liste, mode {meta["mode"]}), {size} octets')


if __name__ == '__main__':
    main()
