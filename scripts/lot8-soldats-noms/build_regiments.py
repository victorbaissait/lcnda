#!/usr/bin/env python3
"""Étape 2 de 🎖️ « L'histoire de son régiment » : lit regiments-raw.json (fetch_regiments.py) et écrit
assets/data/l8b-regiments.json.gz. Pour chaque article : garnison (encadré), « Casernement » de 1914, ce que l'article dit
de chaque année (sections « 1914 », « 1915 »… ou lignes « * 1840 : … »), les batailles liées (liens vers « Bataille de… »,
« Siège de… », « Offensive… ») avec leur année. Texte : Wikipédia (CC BY-SA 4.0), avec le lien de l'article.
Usage : build_regiments.py regiments-raw.json SORTIE.json.gz"""
import datetime, gzip, json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wikitext import plain, links, sections, infobox_field, squash

YEAR_HEAD = re.compile(r'^(?:Année\s+|En\s+)?(1[6-9]\d\d)(?:\s*[-–à]\s*(1[6-9]\d\d))?\s*$')
BATTLE = re.compile(r"^(Bataille|Batailles|Siège|Offensive|Combat|Combats|Prise|Chemin des Dames|Course à la mer|Front d'Orient|Expédition|Campagne|Opération)\b", re.I)
SKIP_SECTIONS = re.compile(r'création|dénomination|appellation|filiation|chefs? de corps|colonels?|drapeau|insigne|devise|décoration|personnalit|sources|bibliograph|notes|références|voir aussi|liens|articles connexes|traditions|fourragère|chant', re.I)
TITLE_RX = re.compile(r"^(1er|\d+e)\s+(.*?)(?:\s+\(France\))?$")


def guess_kind(title):
    m = TITLE_RX.match(title)
    if not m:
        return None, None
    n = 1 if m.group(1) == '1er' else int(m.group(1)[:-1])
    name = m.group(2).lower()
    order = [('RIT', "régiment d'infanterie territoriale"), ('RIC', "régiment d'infanterie coloniale"), ('RIM', "régiment d'infanterie de marine"), ('RIL', "régiment d'infanterie légère"),
             ('BCA', 'bataillon de chasseurs alpins'), ('BCP', 'bataillon de chasseurs à pied'), ('BCP', 'bataillon de chasseurs'), ('RCA', "régiment de chasseurs d'afrique"),
             ('RCC', 'régiment de chasseurs à cheval'), ('RD', 'régiment de dragons'), ('RC', 'régiment de cuirassiers'), ('RH', 'régiment de hussards'), ('RSA', 'régiment de spahis algériens'),
             ('RAC', "régiment d'artillerie de campagne"), ('RAL', "régiment d'artillerie lourde"), ('RAP', "régiment d'artillerie à pied"), ('RAM', "régiment d'artillerie de montagne"),
             ('RACol', "régiment d'artillerie coloniale"), ('RAMa', "régiment d'artillerie de marine"), ('RA', "régiment d'artillerie"), ('RG', 'régiment du génie'), ('RT', 'régiment du train'),
             ('RZ', 'régiment de zouaves'), ('RTA', 'régiment de tirailleurs algériens'), ('RTS', 'régiment de tirailleurs sénégalais'), ('RTM', 'régiment de tirailleurs marocains'),
             ('RTT', 'régiment de tirailleurs tunisiens'), ('REI', "régiment étranger d'infanterie"), ('RI', "régiment d'infanterie de ligne"), ('RI', "régiment d'infanterie")]
    for k, w in order:
        if name == w:
            return k, n
    return None, n


CASE_RX = re.compile(r"(?i)(?:casernement|caserné à|cantonné à|en garnison à|garnison à|tient garnison à)\s*(?:[:,]\s*)?(?:casernement\s*)?(?:à\s*)?(.+)")


def clean_case(s):
    seg = re.split(r';|\.\s|\{\{\s*\d+e\|brigade|\{\{\d+e\}\}\s*B|brigade|division|corps d|<ref', s, maxsplit=1)[0]
    towns = [lab for tgt, lab in links(seg) if not re.search(r'brigade|division|corps|régiment|caserne', tgt, re.I)]
    if not towns:
        txt = re.sub(r'\s+', ' ', plain(seg)).strip(' :,')
        towns = [w.strip() for w in re.split(r',| et ', txt) if w.strip() and len(w.strip()) < 40 and w.strip()[:1].isupper() and not re.search(r'caserne|quartier', w, re.I)]
    towns = [re.sub(r'[\[\]{}|]', '', x).strip() for x in towns]
    out = ', '.join(dict.fromkeys(x for x in towns if x and not re.match(r'^\d', x) and not re.search(r'compagnie|bataillon|escadron|batterie', x, re.I)))
    return out if 2 < len(out) < 120 else ''


def find_case1914(t, wwi_bodies):
    for body in wwi_bodies:
        for line in body.split('\n')[:12]:
            m = CASE_RX.search(line)
            if m:
                c = clean_case(m.group(1))
                if c:
                    return c
    for line in t.split('\n'):
        if '1914' in line[:200]:
            m = CASE_RX.search(line)
            if m and m.start() < 160:
                c = clean_case(m.group(1))
                if c:
                    return c
    return ''


def parse(page):
    t = page['text']
    if re.search(r'^\s*#\s*(REDIRECT|REDIRECTION)', t, re.I):
        return None
    garrison = infobox_field(t, 'garnison')
    garrison = re.sub(r'\s+', ' ', garrison).strip(' ,;')[:160]
    years, spans, battles = {}, [], []
    case1914 = ''
    wwi = []
    ctx_year = None
    seen_b = set()
    for lvl, head, body in sections(t):
        hp = plain(head).strip()
        if SKIP_SECTIONS.search(hp):
            continue
        hy = YEAR_HEAD.match(hp)
        if hy:
            a = int(hy.group(1)); b = int(hy.group(2)) if hy.group(2) else a
            if b < a:
                b = a
            text = squash(re.sub(r'\s*\n\*+\s*', ' ; ', plain(re.sub(r'^\s*\[\[(?:Fichier|File|Image):.*$', '', body, flags=re.M))).lstrip('* ;'), 380)
            if text:
                if a == b:
                    years[str(a)] = (years.get(str(a), '') + ' ' + text).strip()[:500]
                elif b - a <= 12:
                    spans.append([a, b, text])
            ctx_year = (a, b)
        elif lvl <= 3:
            ctx_year = None
            m = re.search(r'(1[6-9]\d\d)\s*[-–à]\s*(1[6-9]\d\d)', hp)
            if m and 0 <= int(m.group(2)) - int(m.group(1)) <= 12:
                ctx_year = (int(m.group(1)), int(m.group(2)))
            elif re.search(r'Première Guerre mondiale', hp):
                ctx_year = (1914, 1918)
            elif re.search(r'Seconde Guerre mondiale', hp):
                ctx_year = (1939, 1945)
        if re.search(r'Première Guerre mondiale|^1914', hp):
            wwi.append(body)
        # lignes « * 1840 : garnison à Nîmes… » (hors des sections d'années)
        if not hy:
            for line in body.split('\n'):
                m = re.match(r"^\*+\s*'*\[*(1[6-9]\d\d)\]*'*(?:\s*[-–à]\s*'*\[*(1[6-9]\d\d)\]*'*)?\s*[:\-–,]\s*(.+)$", line.strip())
                if not m:
                    continue
                a = int(m.group(1)); b = int(m.group(2)) if m.group(2) else a
                text = squash(plain(m.group(3)), 300)
                if not text or len(text) < 4:
                    continue
                if a == b:
                    if str(a) not in years:
                        years[str(a)] = text
                    elif len(years[str(a)]) < 400 and text not in years[str(a)]:
                        years[str(a)] = (years[str(a)] + ' ; ' + text)[:500]
                elif 0 < b - a <= 12:
                    spans.append([a, b, text])
        # batailles liées, avec leur année
        for line in body.split('\n'):
            ly = None
            m = re.match(r"^\*+\s*'*\[*(1[6-9]\d\d)", line.strip())
            if m:
                ly = int(m.group(1))
            for target, label in links(line):
                if target.startswith(('Fichier:', 'File:', 'Image:', 'Catégorie:')) or (not BATTLE.match(target) and not re.search(r'\bBataille\b', label, re.I)):
                    continue
                if re.search(r'^(Ordre de bataille|Liste|Campagne de France \(1940\)$)', target):
                    pass
                ty = re.search(r'\((?:[^()]*?)(1[6-9]\d\d)\)', target)
                y = int(ty.group(1)) if ty else (hy and int(hy.group(1))) or ly or (ctx_year[0] if ctx_year and ctx_year[0] == ctx_year[1] else None)
                if not y and ctx_year:
                    ym = re.search(r'(1[6-9]\d\d)', line)
                    if ym and ctx_year[0] <= int(ym.group(1)) <= ctx_year[1]:
                        y = int(ym.group(1))
                if not y:
                    continue
                noun = re.sub(r'\s*\([^)]*\)\s*$', '', target).strip()
                noun = noun[:1].upper() + noun[1:]
                k = (y, noun)
                if k in seen_b:
                    continue
                seen_b.add(k)
                battles.append([y, noun, target])
    battles.sort(key=lambda b: b[0])
    case1914 = find_case1914(t, wwi)
    return {'garrison': garrison, 'case1914': case1914, 'years': years, 'spans': spans, 'battles': battles}


def main(src, out):
    raw = json.load(open(src, encoding='utf-8'))
    rows, seen = [], set()
    for title, page in sorted(raw.items()):
        kind = page.get('kind') or []
        k, n = (kind[0], kind[1]) if kind and kind[0] else guess_kind(title)
        if not k:
            k, n = guess_kind(title)
        if not k or not n:
            continue
        if (k, n) in seen:
            continue
        p = parse(page)
        if not p or not (p['years'] or p['garrison'] or p['battles'] or p['case1914']):
            continue
        seen.add((k, n))
        rows.append([k, n, title, page.get('q', ''), page.get('revid'), p['garrison'], p['case1914'], p['years'], p['spans'], p['battles']])
    built = datetime.date.today().isoformat()
    doc = {'v': 1, 'built': built, 'source': 'Wikipédia en français, articles sur les régiments', 'source_url': 'https://fr.wikipedia.org/wiki/Liste_de_r%C3%A9giments_fran%C3%A7ais',
           'licence': 'CC BY-SA 4.0 (extraits de Wikipédia, auteurs : historique de chaque article)', 'licence_url': 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr', 'count': len(rows),
           'fields': ['k', 'n', 't', 'q', 'rev', 'garrison', 'case1914', 'years', 'spans', 'battles'], 'rows': rows}
    with gzip.open(out, 'wt', encoding='utf-8', compresslevel=9) as f:
        json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
    print('régiments', len(rows), 'avec années', sum(1 for r in rows if r[7]), 'avec batailles', sum(1 for r in rows if r[9]), 'caserne 1914', sum(1 for r in rows if r[6]), os.path.getsize(out), 'octets', file=sys.stderr)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
