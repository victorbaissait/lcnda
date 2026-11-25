#!/usr/bin/env python3
"""💰 🍽️ Le budget d'une famille comme la sienne — d'après les monographies de Frédéric Le Play et de ses élèves.

Source : É. Cheysson et A. Toqué, « Les Budgets comparés des cent monographies de familles publiées d'après un cadre
uniforme dans “les Ouvriers européens” et “les Ouvriers des deux mondes” », Rome, Imprimerie héritiers Botta, 1890
(domaine public), numérisé par Internet Archive : https://archive.org/details/sc_0000871518_00000000631821
(tableau B, « Tableau synoptique des cent budgets » : a) recettes, b) dépenses).

On lit le texte reconnu (OCR, fichier _djvu.xml : chaque mot avec sa position) et on reconstitue les lignes des tableaux.
Rien n'est deviné : une famille n'est gardée que si les chiffres se recoupent :
  · le total des recettes (tableau a) = le total général des dépenses (tableau b) à 1 % près, ou Nature + Argent = Total ;
  · la somme des 8 colonnes « Nourriture » (en francs) ÷ le total = la somme des 8 pourcentages imprimés, à 0,6 point près.
Chaque ligne garde le numéro de la monographie, le métier et le lieu tels qu'imprimés, l'année d'observation, et la
page du livre (lien vers la page numérisée).

Les repas : quelques phrases recopiées des monographies elles-mêmes (§ « Aliments et repas »), voir MEALS ci-dessous,
vérifiées mot pour mot dans le texte de la page citée (Internet Archive) au moment de la fabrication.

Usage : python3 -I build_leplay.py <budgets_djvu.xml> [<dossier des _djvu.txt des volumes>]  → assets/data/l8a-leplay.json.gz
"""
import html, json, os, re, sys, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import l8common as C

IA = 'sc_0000871518_00000000631821'
PAGE_URL = 'https://archive.org/details/' + IA + '/page/n{n}/mode/1up'


def pages_of(xml):
    return re.findall(r'<OBJECT (.*?)</OBJECT>', xml, re.S)


def words(p):
    out = []
    for m in re.finditer(r'<WORD coords="(\d+),(\d+),(\d+),(\d+)[^"]*"[^>]*>(.*?)</WORD>', p, re.S):
        x0, y1, x1, y0 = map(int, m.groups()[:4])
        out.append((x0, y0, x1, y1, html.unescape(m.group(5))))
    return out


def rows(p, tol=18):
    ws = sorted(words(p), key=lambda w: (w[3] + w[1]) / 2)
    lines = []
    for w in ws:
        yc = (w[1] + w[3]) / 2
        if lines and abs(lines[-1][0] - yc) < tol:
            lines[-1][1].append(w); lines[-1][0] = (lines[-1][0] + yc) / 2
        else:
            lines.append([yc, [w]])
    return [sorted(l[1]) for l in lines]


def text(row):
    return ' '.join(w[4] for w in row)


NUM = re.compile(r'^\d{1,3}(\d{3})*(\.\d{1,2})?$|^\d+(\.\d{1,2})?$')


def cells(row, xmin=0, gap=140):
    """les nombres d'une ligne : morceaux voisins recollés (« 1 » « 751.10 » → 1751.10 ; « 264. » « 40 » → 264.40)"""
    toks = [w for w in row if w[0] >= xmin and re.search(r'\d', w[4])]
    out, cur, last = [], '', None
    for w in toks:
        t = w[4].replace(',', '.').replace('-', '.').strip('|;:!•*■\'"')
        g = w[0] - last if last is not None else 1e9
        if g < gap and ((cur.endswith('.') and re.fullmatch(r'\d{1,2}', t)) or (re.fullmatch(r'\d{1,2}', cur) and g < 90 and re.fullmatch(r'\.?\d{1,2}', t)) or (re.fullmatch(r'\d{1,3}', cur) and re.match(r'\d{3}\.\d', t))):
            cur += t
        else:
            if cur: out.append(cur)
            cur = t
        last = w[2]
    if cur: out.append(cur)
    vals = []
    for c in out:
        c = c.rstrip('.')
        if NUM.match(c): vals.append(float(c))
    return vals


HEAD = re.compile(r'(\d{1,3})\s*\.\s*[—–-]+\s*(.+?)\s*\[\s*1\s*[8S]\s*([0-9OoSG]{2})\s*[—–-]+\s*[O0]\s*\.\s*([EM])')


def fixyear(s):
    return int('18' + s.replace('O', '0').replace('o', '0').replace('S', '5').replace('G', '6'))


def parse_recettes(pages):
    fam = {}
    for idx, p in enumerate(pages):
        rs = rows(p)
        head = text(rs[0]) + ' ' + text(rs[1]) if len(rs) > 1 else ''
        if 'Recettes' not in ' '.join(text(r) for r in rs[:4]): continue
        cur = None; seen_total = False
        for r in rs:
            t = text(r)
            m = HEAD.search(t)
            if m:
                cur = {'n': int(m.group(1)), 'name': m.group(2).strip(' .'), 'year': fixyear(m.group(3)), 'ed': 'O. ' + m.group(4) + '.', 'page_r': idx}
                fam[cur['n']] = cur; seen_total = False; continue
            if cur and not seen_total and re.match(r'^(Total|Nature|Argent)', t):
                key = t.split()[0].rstrip('.')
                v = cells(r, xmin=1500)
                if v: cur.setdefault('r_' + key.lower(), v)
                if key == 'Total': seen_total = True
    return fam


def parse_depenses(pages, fam):
    for idx, p in enumerate(pages):
        rs = rows(p)
        top = ' '.join(text(r) for r in rs[:12])
        if not re.search(r'C[ée]r[ée]ales', top): continue   # page de gauche : la nourriture
        cur = None; state = 0
        for r in rs:
            t = text(r)
            m = re.search(r'(?:^|\s)(\d{1,3})\s*\.\s*[—–-]', t)
            if m and len(t) < 160 and not re.match(r'^(Total|Nature|Argent)', t):
                n = int(m.group(1))
                if n in fam: cur = fam[n]; cur['page_d'] = idx; state = 0
                continue
            if not cur or not t.startswith(('Total', 'Nature', 'Argent')): continue
            if t.startswith('Total'):
                v = cells(r, xmin=1500)
                if state == 0: cur['food_abs'] = v; state = 1
                elif state == 1: cur['food_pct'] = v; state = 2
    # page de droite : le total général des dépenses (dernière colonne)
    for idx, p in enumerate(pages):
        rs = rows(p)
        top = ' '.join(text(r) for r in rs[:12])
        if 'Mobilier' not in top or re.search(r'C[ée]r[ée]ales', top): continue
        # les familles de cette page sont celles de la page de gauche (idx - 1)
        left = [f for f in fam.values() if f.get('page_d') == idx - 1]
        totals = []
        for r in rs:
            t = text(r)
            if re.search(r'Total', t) and re.search(r'\d', t): pass
            v = cells(r, xmin=3400)
            if v and max(v) > 30: totals.append((r[0][1], v[-1]))
        for f in left: f['_right'] = idx
        fam_right = {}
        for f in left: fam_right[f['n']] = totals
    return fam


def check(f):
    rt = f.get('r_total') or []
    if not rt: return None, 'pas de total des recettes'
    total = rt[-1]
    nat, arg = (f.get('r_nature') or [None])[-1], (f.get('r_argent') or [None])[-1]
    # le total est vérifié par la nourriture : francs ÷ total = pourcentages imprimés (ci-dessous)
    if total < 100: return None, f'total illisible ({total})'
    a, p = f.get('food_abs') or [], f.get('food_pct') or []
    if len(a) < 5 or len(p) < 5: return None, 'colonnes nourriture illisibles'
    sa, sp = sum(a), sum(p)
    share = sa / total * 100
    if abs(share - sp) > 0.6: return None, f'nourriture {sa:.2f} F = {share:.1f} % mais les pourcentages imprimés font {sp:.1f} %'
    if not (15 <= sp <= 90): return None, 'part de la nourriture invraisemblable'
    return {'total': round(total, 2), 'food': round(sa, 2), 'food_pct': round(sp, 1), 'cereals_pct': round(p[0], 1) if p else None}, ''


# ── où chercher le lieu et le métier dans le nom imprimé (« Charpentier de Paris de la corporation… ») ──
COUNTRY = [('Paris', 'France'), ('Seine', 'France'), ('Belgique', 'Belgique'), ('Angleterre', 'Royaume-Uni'), ('Derbyshire', 'Royaume-Uni'), ('Sheffield', 'Royaume-Uni'), ('Londres', 'Royaume-Uni'),
           ('Espagne', 'Espagne'), ('Italie', 'Italie'), ('Rome', 'Italie'), ('Naples', 'Italie'), ('Suisse', 'Suisse'), ('Genève', 'Suisse'), ('Prusse', 'Allemagne'), ('Allemagne', 'Allemagne'),
           ('Rhénane', 'Allemagne'), ('Hanovre', 'Allemagne'), ('Autriche', 'Autriche'), ('Vienne', 'Autriche'), ('Hongrie', 'Hongrie'), ('Russie', 'Russie'), ('Oural', 'Russie'), ('Suède', 'Suède'),
           ('Norvège', 'Norvège'), ('Danemark', 'Danemark'), ('Turquie', 'Turquie'), ('Pays-Bas', 'Pays-Bas'), ('Hollande', 'Pays-Bas'), ('Californie', 'États-Unis'), ('Canada', 'Canada'),
           ('Algérie', 'Algérie'), ('Tunisie', 'Tunisie'), ('Égypte', 'Égypte'), ('Syrie', 'Syrie'), ('Liban', 'Liban'), ('Chine', 'Chine'), ('Bohême', 'Autriche'), ('Saxe', 'Allemagne'), ('Westphalie', 'Allemagne')]


def split_name(name):
    name = re.sub(r'\s+', ' ', name).replace(' ,', ',')
    m = re.match(r"^(.+?)\s+(?:de la fabrique|des usines|de la|du|des|de l['’]|d['’]|de|à|aux|au)\s+(.+)$", name)
    job, place = (m.group(1), m.group(2)) if m else (name, '')
    country = next((c for k, c in COUNTRY if k in name), 'France' if re.search(r'\((?:[A-Z][a-zé]+[- ]?)+\)', name) or not place else '')
    return job.strip(' ,.'), place.strip(' ,.'), country


# Le titre imprimé, débarrassé des fautes de lecture de l'OCR (« Linsfère de Iiille » = Lingère de Lille), le métier, le
# lieu, le pays, et les métiers de l'app qui s'en rapprochent (pour la ligne de la fiche) — relu à la main sur les pages
CLEAN = {
    1: ('Compositeur-typographe de Paris', 'compositeur-typographe', 'Paris', 'France', r'typograph|compositeur|imprimeu'),
    2: ('Chiffonnier de Paris', 'chiffonnier', 'Paris', 'France', r'chiffonn'),
    6: ('Tailleur d’habits de Paris', 'tailleur d’habits', 'Paris', 'France', r'tailleu?r d|tailleur$|tailleur\b(?! de pierre)'),
    7: ('Tisseur en châles d’une fabrique de Paris', 'tisseur en châles', 'Paris', 'France', r'tisseu|tisserand|chal'),
    14: ('Brigadier de la garde républicaine de Paris', 'brigadier de la garde républicaine', 'Paris', 'France', r'garde republicain|brigadier|gendarme'),
    18: ('Monteur d’outils en acier de la fabrique d’Hérimoncourt (Doubs)', 'monteur d’outils en acier', 'Hérimoncourt (Doubs)', 'France', r'monteur|outill|taillandier|horloger'),
    21: ('Faïenciers de Nevers (Nièvre)', 'faïencier', 'Nevers (Nièvre)', 'France', r'faiencier|potier'),
    22: ('Maréchal-ferrant du Maine', 'maréchal-ferrant', 'le Maine', 'France', r'marechal'),
    25: ('Lingère de Lille', 'lingère', 'Lille', 'France', r'linger|couturi|blanchiss'),
    33: ('Bordier émigrant du Laonnais', 'bordier émigrant', 'le Laonnais (Aisne)', 'France', r'bordier|journalier|manouvrier|manoeuvre'),
    34: ('Bordier, dit brassier, des vignobles de l’Armagnac', 'brassier', 'l’Armagnac', 'France', r'brassier|bordier|journalier|vigner'),
    35: ('Bordier, dit pen-ty, de la Basse-Bretagne', 'bordier (pen-ty)', 'la Basse-Bretagne', 'France', r'bordier|journalier|penty|pen-ty|journali'),
    41: ('Bordier-vigneron de l’Aunis', 'bordier-vigneron', 'l’Aunis', 'France', r'vigner|bordier'),
    42: ('Manœuvre-vigneron de la Basse-Bourgogne', 'manœuvre-vigneron', 'la Basse-Bourgogne', 'France', r'vigner|manoeuvre'),
    43: ('Paysan d’un village à banlieue morcelée du Laonnais (Aisne)', 'paysan', 'le Laonnais (Aisne)', 'France', r'cultivateur|laboureur|paysan|menager|fermier'),
    45: ('Pêcheur côtier, maître de barques, de Martigues (Bouches-du-Rhône)', 'pêcheur côtier', 'Martigues (Bouches-du-Rhône)', 'France', r'pecheu|patron de barque|marin'),
    49: ('Cultivateur-maraîcher de Deuil (Seine-et-Oise)', 'cultivateur-maraîcher', 'Deuil (Seine-et-Oise)', 'France', r'maraich|jardinier'),
    52: ('Mineur des corporations de mines du Haut-Hartz (Hanovre)', 'mineur', 'le Haut-Hartz (Hanovre)', 'Allemagne', r'mineur'),
    53: ('Fondeur au bois du Hundsrücke (Province rhénane)', 'fondeur', 'le Hunsrück (Province rhénane)', 'Allemagne', r'fondeur'),
    54: ('Armurier de la fabrique demi-rurale collective de Solingen (Westphalie)', 'armurier', 'Solingen', 'Allemagne', r'armurier|coutelier'),
    55: ('Mineur silésien du bassin houiller de la Ruhr (Prusse rhénane)', 'mineur', 'la Ruhr', 'Allemagne', r'mineur|houilleur'),
    56: ('Tisserand de Godesberg (Province rhénane)', 'tisserand', 'Godesberg', 'Allemagne', r'tisserand|tisseu'),
    57: ('Fondeur des usines à fer à la houille du Derbyshire', 'fondeur', 'le Derbyshire', 'Royaume-Uni', r'fondeur'),
    63: ('Charbonnier des Alpes de la Carinthie', 'charbonnier', 'la Carinthie', 'Autriche', r'charbonn'),
    73: ('Pêcheur côtier de Saint-Sébastien (Espagne)', 'pêcheur côtier', 'Saint-Sébastien', 'Espagne', r'pecheu|marin'),
    74: ('Fondeur de plomb de la Toscane', 'fondeur', 'la Toscane', 'Italie', r'fondeur'),
    75: ('Mineur de la Maremme de Toscane', 'mineur', 'la Maremme (Toscane)', 'Italie', r'mineur'),
    77: ('Métayer de la Toscane', 'métayer', 'la Toscane', 'Italie', r'metayer|cultivateur|colon'),
    79: ('Pêcheur côtier, maître de barques, de Marken (Hollande)', 'pêcheur côtier', 'Marken', 'Pays-Bas', r'pecheu|marin'),
    80: ('Forgeron des usines à fer de Dannemora (Suède)', 'forgeron', 'Dannemora', 'Suède', r'forgeron|forgeur'),
    83: ('Charpentier et marchand de grains des lavoirs d’or de l’Oural', 'charpentier', 'l’Oural', 'Russie', r'charpentier'),
    87: ('Bordiers émancipés en communauté rurale de la Grande-Russie', 'paysan', 'la Grande-Russie', 'Russie', r'cultivateur|paysan|laboureur'),
    88: ('Horloger de la fabrique collective de Genève (jeune ménage)', 'horloger', 'Genève', 'Suisse', r'horloger'),
    97: ('Mineur des placers du comté de Mariposa (Californie)', 'mineur d’or', 'Mariposa (Californie)', 'États-Unis', r'mineur|orpailleur'),
}


def norm_text(t):
    t = re.sub(r'\s+', ' ', t)
    return re.sub(r'-\s+(?=[a-zéèàùâêîôûç])', '', t)


# Les repas : phrases recopiées des monographies (vérifiées dans le texte de la page citée). Remplies par
# meals.json (même dossier) : [{"n": numéro, "quote": "…", "src": "titre, tome, page", "url": "https://archive.org/details/…/page/n…"}]
def main(xml_path, meals_path=None):
    xml = open(xml_path, encoding='utf-8').read()
    pages = pages_of(xml)
    fam = parse_recettes(pages)
    parse_depenses(pages, fam)
    keep, skipped = [], {}
    for n in sorted(fam):
        f = fam[n]
        res, why = check(f)
        if not res:
            skipped[f"{n}. {f['name']}"] = why; continue
        if n not in CLEAN:
            skipped[f"{n}. {f['name']}"] = 'titre pas encore relu à la main'; continue
        title, job, place, country, jobs = CLEAN[n]
        keep.append({'n': n, 'title': title, 'job': job, 'place': place, 'country': country, 'jobs': jobs, 'year': f['year'], 'ed': f['ed'], **res,
                     'page': PAGE_URL.format(n=f['page_r']), 'page_d': PAGE_URL.format(n=f['page_d']) if f.get('page_d') is not None else ''})
    meals = []
    for m in json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'leplay_meals.json'))):
        txt = os.path.join(meals_path or '', m['ia'] + '.txt')
        if not os.path.exists(txt): print('  repas non vérifié (texte absent) :', m['n']); continue
        if norm_text(m['quote']) not in norm_text(open(txt, encoding='utf-8').read()): print('  repas écarté (phrase introuvable) :', m['n'], m['quote'][:60]); continue
        meals.append({**m, 'url': f"https://archive.org/details/{m['ia']}/mode/1up?q=" + urllib.parse.quote('"' + m['q'] + '"')})
    data = {'title': 'Budgets de familles ouvrières (Le Play et ses élèves, 1844–1886)', 'version': 1, 'built': __import__('datetime').date.today().isoformat(),
            'source': 'É. Cheysson et A. Toqué, Les Budgets comparés des cent monographies de familles publiées d’après un cadre uniforme dans « les Ouvriers européens » et « les Ouvriers des deux mondes », Rome, 1890',
            'url': 'https://archive.org/details/' + IA, 'licence': 'domaine public (livre de 1890) ; chiffres relevés par LCNDA',
            'note': 'O. E. = Les Ouvriers européens (Le Play) ; O. M. = Les Ouvriers des deux mondes (Société d’économie sociale). Total = recettes de l’année (en francs de l’époque, nature comprise) ; nourriture = 8 colonnes du tableau (céréales, corps gras, laitages et œufs, viandes et poissons, légumes et fruits, condiments, boissons, repas pris dehors). Une famille n’est gardée que si les chiffres se recoupent.',
            'count': len(keep), 'skipped': skipped, 'rows': keep, 'meals': meals}
    print(f'{len(keep)} familles gardées, {len(skipped)} écartées (chiffres qui ne se recoupent pas)')
    for k, v in list(skipped.items())[:200]: print('  écartée', k, '—', v)
    C.write('l8a-leplay.json.gz', data)


if __name__ == '__main__':
    main(*sys.argv[1:3])
