#!/usr/bin/env python3
"""Étape 2 des listes de 🎖️ « Soldats et noms » : écrit dans assets/data/
  l8b-prenoms.json          🇫🇷 les 360 noms des jours du calendrier républicain + la catégorie « Prénom révolutionnaire »
  l8b-enfants-trouves.json  👶 comment on nommait les enfants trouvés (règles rédigées ici, citations vérifiées mot pour mot)
  l8b-nationalite.json      🛂 changements de nationalité (idem) + 3 citations (CICR, hôpitaux, Journal officiel)
  l8b-personnages.json.gz   📚 personnages de fiction et leur nom de famille (Wikidata, CC0)
  l8b-variantes.json.gz     🔤 noms de famille « dits identiques » (Wikidata P460, CC0)
Usage : build_lot8.py DOSSIER_BRUT DOSSIER_SORTIE
  (DOSSIER_BRUT : articles-raw.json, more-raw.json de fetch_articles.py / fetch_more.py, noms-raw.json de fetch_noms.py)
Chaque citation doit se trouver telle quelle dans le texte (simplifié) de l'article téléchargé : sinon le script s'arrête."""
import datetime, gzip, json, os, re, sys, unicodedata, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wikitext import plain
import l8b_net as N

BUILT = datetime.date.today().isoformat()
WP_LIC = 'Citations de Wikipédia (CC BY-SA 4.0), avec lien vers l’article'
WP_LIC_URL = 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr'


def norm(s):
    return re.sub(r'\s+', ' ', s.replace('’', "'").replace(' ', ' ')).strip()


class Texts:
    def __init__(self, raw):
        self.raw = raw  # {titre: {title, text}}
        self.cache = {}

    def plain(self, title):
        if title not in self.cache:
            p = self.raw.get(title)
            if not p:
                raise SystemExit(f'article absent : {title}')
            self.cache[title] = norm(plain(p['text']))
        return self.cache[title]

    def src(self, title, quote, lang='fr', section=''):
        p = self.raw[title]
        t = self.plain(title)
        if norm(quote) not in t:
            raise SystemExit(f'citation introuvable dans « {title} » : {quote[:90]}…')
        real = p['title']
        url = f'https://{lang}.wikipedia.org/wiki/' + urllib.parse.quote(real.replace(' ', '_')) + (('#' + urllib.parse.quote(section.replace(' ', '_'))) if section else '')
        return {'title': f'Wikipédia, « {real} »' if lang == 'fr' else f'Wikipedia ({lang}), « {real} »', 'url': url, 'quote': norm(quote),
                'history': f'https://{lang}.wikipedia.org/w/index.php?title=' + urllib.parse.quote(real) + '&action=history'}


def write_json(path, doc, gz=False):
    if gz:
        with gzip.open(path, 'wt', encoding='utf-8', compresslevel=9) as f:
            json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
    else:
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
    print(os.path.basename(path), os.path.getsize(path), 'octets', file=sys.stderr)


# ───────────── 🇫🇷 prénoms ─────────────
def prenoms(X, more, out):
    t = X.raw['Calendrier républicain']['text']
    months = re.findall(r'\{\{FrRepCalHead\s*\|\s*\[\[([^\]|]+)(?:\|[^\]]*)?\]\]', t)
    assert len(months) == 12, months
    days, mo = [], 0
    for line in t.split('\n'):
        if line.strip().startswith('{{FrRepCalHead'):
            mo += 1
        m = re.match(r'\{\{FrRepCalLine\s*\|\s*(\d+)\s*\|[^|]*\|\s*(.*?)\s*\}\}\s*$', line.strip())
        if m and mo:
            cell = m.group(2)
            lk = re.match(r'\[\[([^\]|]+)(?:\|([^\]]+))?\]\]', cell)
            name = plain(lk.group(2) or lk.group(1)).strip() if lk else plain(cell).strip()
            days.append([mo, int(m.group(1)), name, lk.group(1).strip() if lk else ''])
    assert len(days) == 360, len(days)
    cat = []
    for title in more.get('cat_prenoms', []):
        name = re.sub(r'\s*\(.*\)\s*$', '', title).strip()
        if 1 < len(name) < 30:
            cat.append([name, title])
    src = X.src('Calendrier républicain', "Un autre legs du calendrier révolutionnaire est un certain nombre de prénoms tirés du calendrier", section='Prénoms')
    write_json(os.path.join(out, 'l8b-prenoms.json'), {'v': 1, 'built': BUILT, 'source': 'Wikipédia : « Calendrier républicain » et catégorie « Prénom révolutionnaire »',
        'source_url': src['url'], 'licence': WP_LIC, 'licence_url': WP_LIC_URL, 'count': len(days) + len(cat), 'months': months, 'days': days, 'cat': cat, 'src': src,
        'cat_url': 'https://fr.wikipedia.org/wiki/Cat%C3%A9gorie:Pr%C3%A9nom_r%C3%A9volutionnaire'})
    return days


# ───────────── 👶 enfants trouvés ─────────────
def trouves(X, more, out):
    NF = 'Nom de famille en France'
    rules = [
        {'id': 'trouve', 'title': 'Un nom qui rappelle l’abandon', 'surnames': ['Trouvé', 'Trouvat', 'Troubat', 'Trouvin'],
         'lead': 'Son nom {n} est un de ceux que l’on donnait aux enfants trouvés.',
         'src': X.src(NF, "noms rappelant directement l'abandon (Trouvé et ses variantes Trouvat, Troubat, Trouvin, sont les seuls surnoms, avec les noms de famille arbitraires donnés par des juges d'état civil, qui indiquent une présomption forte de descendance d'enfant abandonné, puis recueilli)", section="Noms d'enfants abandonnés")},
        {'id': 'lieu', 'title': 'Le nom du lieu où on l’a trouvé', 'surnames': ['Delaporte', 'Laporte', 'Lapierre', 'Dupont', 'Delavigne'][:1],
         'lead': 'Son nom {n} peut venir du lieu où un enfant avait été trouvé.',
         'src': X.src(NF, "noms de lieu et plus spécifiquement des lieux où l'enfant a été trouvé (exemples : Delaporte, Jean Le Rond d’Alembert)", section="Noms d'enfants abandonnés")},
        {'id': 'jour', 'title': 'Le nom du jour, du mois ou du saint', 'test': 'month',
         'lead': 'Son nom {n} est un nom de mois : on nommait parfois les enfants trouvés d’après le jour de l’abandon.',
         'src': X.src(NF, "noms liés aux circonstances de l'abandon (date, mois, jour, fête religieuse ou païenne du jour, souvent le saint du jour)", section="Noms d'enfants abandonnés")},
        {'id': 'jour2', 'title': 'Le nom du jour, du mois ou du saint', 'test': 'weekday',
         'lead': 'Son nom {n} est un nom de jour : on nommait parfois les enfants trouvés d’après le jour de l’abandon.',
         'src': X.src(NF, "noms liés aux circonstances de l'abandon (date, mois, jour, fête religieuse ou païenne du jour, souvent le saint du jour)", section="Noms d'enfants abandonnés")},
        {'id': 'calendrier', 'title': 'Le nom du jour dans le calendrier républicain', 'test': 'calendar', 'from': 1793, 'to': 1801,
         'lead': 'Son nom {n} est le nom d’un jour du calendrier républicain : entre l’an II et l’an IX, on en donnait aux enfants trouvés.',
         'src': X.src('Calendrier républicain', "le calendrier républicain a été utilisé — essentiellement de l'an II jusqu'en l'an IX — pour fournir un patronyme aux enfants trouvés", section='Prénoms')},
        {'id': 'revolution', 'title': 'Sous la Révolution : des noms républicains', 'test': 'none',
         'src': X.src(NF, "Le décret libéral du 29 floréal an II (18 mai 1794) fait ainsi disparaître du calendrier les noms des saints au profit de vocables républicains", section="Noms d'enfants abandonnés")},
        {'id': 'general', 'title': 'Comment les hospices nommaient les enfants', 'test': 'general',
         'src': X.src(NF, "L'abandon anonyme dans des hospices ou des tours d'exposition contraignait les agents de l'assistance à nommer les délaissés.", section="Noms d'enfants abandonnés")},
    ]
    en = more.get('en', {})
    for t in ['Expósito', 'Esposito (surname)']:
        if t in en:
            tx = norm(plain(en[t]['text']))
            m = re.search(r"[^.]*(?:foundling|abandoned)[^.]*\.", tx, re.I)
            if m:
                X.raw[f'en:{t}'] = en[t]
                X.cache[f'en:{t}'] = tx
                s = X.src(f'en:{t}', m.group(0).strip(), lang='en')
                rules.append({'id': 'exposito-' + str(len(rules)), 'title': 'Exposito, Esposito : « exposé »', 'surnames': ['Exposito', 'Expósito', 'Esposito', 'Espósito', 'Sposito', 'Degli Esposti', 'Esposti'],
                              'lead': 'Son nom {n} vient de l’italien ou de l’espagnol « exposé » : un nom donné aux enfants trouvés.', 'src': s})
                break
    rules = [r for r in rules if r['id'] != 'lieu' or True]
    write_json(os.path.join(out, 'l8b-enfants-trouves.json'), {'v': 1, 'built': BUILT, 'source': 'Wikipédia, « Nom de famille en France » et « Calendrier républicain »',
        'source_url': rules[0]['src']['url'], 'licence': WP_LIC, 'licence_url': WP_LIC_URL, 'count': len(rules), 'rules': rules})


# ───────────── 🛂 nationalité ─────────────
def nationalite(X, more, out):
    NAT = 'Réintégration dans la nationalité française'  # → article « Nationalité française »
    AL = 'Alsace-Lorraine'
    rows = [
        {'id': 'savoie-nice-1860', 'icon': '🇫🇷', 'title': 'Savoie et Nice deviennent françaises (1860)', 'from': '1860-03-24', 'to': '1861-06-14', 'where': {'depts': ['73', '74', '06']},
         'lead': 'En 1860, la Savoie et le comté de Nice deviennent français ({p}) : sa famille devient française, sauf choix contraire dans l’année.',
         'rule': 'Par le traité de Turin, les habitants deviennent Français ; ceux qui voulaient rester sardes avaient un an pour le déclarer et s’installer en Italie.',
         'src': X.src('Traité de Turin (1860)', "Les sujets sardes originaires de Savoie, ou de l'arrondissement de Nice, ou domiciliés effectivement dans ces provinces, qui voudraient conserver la nationalité sarde, jouiront pendant le délai d'un an, à dater de l'échange des ratifications")},
        {'id': 'alsace-1871', 'icon': '🥨', 'title': 'Alsace-Moselle allemande, l’option (1871-1872)', 'from': '1871-05-10', 'to': '1872-10-01', 'where': {'depts': ['67', '68', '57']},
         'lead': 'En 1871, l’Alsace-Moselle devient allemande ({p}) : pour rester Français, il fallait « opter » et partir avant le 1er octobre 1872.',
         'rule': 'Le traité de Francfort donne aux Alsaciens-Lorrains le choix de garder la nationalité française (l’« option »), à condition de quitter la région.',
         'src': X.src(AL, "Une clause du traité de Francfort permet aux Alsaciens-Lorrains la possibilité de conserver la nationalité française s'ils quittent la région avant le 1er octobre 1872."),
         'see': 'Le droit allemand de 1871-1918 est dans « ⚖️ Ce que la loi disait ».', 'search': 'optants'},
        {'id': 'alsace-1918', 'icon': '🇫🇷', 'title': 'Alsace-Moselle redevient française (1918-1919)', 'from': '1918-11-11', 'to': '1920-12-31', 'where': {'depts': ['67', '68', '57']},
         'lead': 'En 1918, l’Alsace-Moselle redevient française ({p}) : chacun reçoit une carte d’identité A, B, C ou D selon ses origines.',
         'rule': 'Le traité de Versailles rend l’Alsace-Moselle à la France ; une « commission des triages » classe les habitants en quatre catégories.',
         'src': X.src(AL, "Les Alsaciens-Lorrains furent divisés par une « commission des triages » en quatre classes de citoyens, celles-ci étaient marquées par les inscriptions A-B-C-D sur leur carte d'identité.")},
        {'id': 'algerie-1834', 'icon': '🌍', 'title': 'L’Algérie annexée (1834)', 'from': '1834-07-22', 'to': '1865-07-14', 'where': {'algeria': True},
         'lead': 'Sa famille a vécu en Algérie ({p}), annexée par la France en 1834.',
         'rule': 'Les habitants des territoires conquis suivent le statut de leur territoire, mais sans les droits des citoyens.',
         'src': X.src(NAT, "Après la Conquête de l'Algérie en 1830, la France annexe les territoires conquis par l’ordonnance du 22 juillet 1834.")},
        {'id': 'algerie-1865', 'icon': '🌍', 'title': 'Le sénatus-consulte de 1865 (Algérie)', 'from': '1865-07-14', 'to': '1946-12-31', 'where': {'algeria': True},
         'lead': 'En Algérie ({p}) : depuis 1865, les « indigènes » sont français sans être citoyens, sauf naturalisation à titre individuel.',
         'rule': 'Le sénatus-consulte crée le statut d’« indigène » : français, mais citoyen seulement en renonçant à son statut personnel.',
         'src': X.src('Sénatus-consulte du 14 juillet 1865', "Le sénatus-consulte du 14 juillet 1865 légifère sur le statut juridique personnel des indigènes musulmans et juifs, ainsi que les étrangers, en Algérie aux débuts de la colonisation française, leur offrant la possibilité d'acquérir la citoyenneté française à titre individuel")},
        {'id': 'cremieux-1870', 'icon': '✡', 'title': 'Le décret Crémieux (1870)', 'from': '1870-10-24', 'to': '1940-10-07', 'where': {'algeria': True},
         'lead': 'En Algérie ({p}) : si sa famille était juive d’Algérie, elle est devenue pleinement française en 1870 (décret Crémieux).',
         'rule': 'Le décret Crémieux donne la pleine nationalité française aux Juifs d’Algérie.',
         'src': X.src(NAT, "Par le décret Crémieux du 24 octobre 1870, la pleine nationalité française est attribuée à tous les « indigènes israélites » (Juifs d'Algérie).")},
        {'id': 'algerie-1889', 'icon': '🌍', 'title': 'Les Européens d’Algérie deviennent français (1889)', 'from': '1889-06-26', 'to': '1962-07-03', 'where': {'algeria': True},
         'lead': 'En Algérie ({p}) : si sa famille était espagnole, italienne ou maltaise, la loi de 1889 lui a ouvert la nationalité française.',
         'rule': 'La loi du 26 juin 1889 permet la naturalisation des étrangers installés en Algérie.',
         'src': X.src(NAT, "La loi du 26 juin 1889 permet la naturalisation des étrangers installés en Algérie.")},
        {'id': 'algerie-1962', 'icon': '🌍', 'title': 'L’indépendance de l’Algérie (1962)', 'from': '1962-07-03', 'to': '1975-12-31', 'where': {'algeria': True, 'born': True}, 'bornBefore': 1962,
         'lead': 'Né en Algérie ({p}) avant l’indépendance de 1962 : la nationalité française a pu être gardée ou « réintégrée ».',
         'rule': 'Les Algériens nés en Algérie française avant le 3 juillet 1962 peuvent demander leur réintégration dans la nationalité française.',
         'src': X.src(NAT, "existent des procédures comparables de réintégration dans la nationalité française de personnes qui établissent avoir possédé cette nationalité (par exemple les Algériens nés en Algérie française avant le 3 juillet 1962).")},
        {'id': 'colonies-1946', 'icon': '🌍', 'title': 'Les « indigènes » des colonies, nationaux non citoyens (jusqu’en 1946)', 'from': '1880-01-01', 'to': '1946-12-31', 'where': {'colony': True}, 'before': 60, 'after': 66,
         'lead': 'Sa famille a vécu dans une colonie ({p}) : les habitants de statut « indigène » étaient français sans être citoyens, jusqu’en 1946.',
         'rule': 'Dans les colonies, les personnes de statut « indigène » étaient des nationaux non citoyens jusqu’en 1946.',
         'src': X.src(NAT, "De même, dans les colonies, les personnes de statut « indigène » étaient des nationaux non citoyens jusqu'en 1946.")},
        {'id': 'naturalisation-1927', 'icon': '🏛️', 'title': 'La loi de 1927 : naturalisation après trois ans', 'from': '1927-08-10', 'to': '1940-07-22', 'where': {'natu': True},
         'lead': 'Naturalisé en {y} : sous la loi de 1927, il suffisait de trois ans en France pour demander la nationalité.',
         'rule': 'La loi du 10 août 1927 réduit de dix à trois ans la résidence demandée avant une naturalisation.',
         'src': X.src('Loi du 10 août 1927 sur la nationalité', "Le délai de domiciliation obligatoire en France avant de pouvoir solliciter une naturalisation est réduit de dix à trois ans.")},
        {'id': 'vichy-1940', 'icon': '⚠️', 'title': 'Vichy révise les naturalisations (1940)', 'from': '1927-08-10', 'to': '1940-07-22', 'where': {'natu': True},
         'lead': 'Naturalisé en {y} : en 1940, le régime de Vichy a fait réviser les naturalisations accordées depuis 1927.',
         'rule': 'Une commission de révision des naturalisations est créée par la loi du 22 juillet 1940.',
         'src': X.src(NAT, "À la suite de la loi du 22 juillet 1940, Alibert, ministre de la Justice, crée une commission de révision des naturalisations prononcées depuis 1927.")},
    ]
    quotes = {
        'cicr': X.src('Agence internationale des prisonniers de guerre', "Pendant la Première Guerre mondiale, c'est un bureau établi à Genève, destiné à retrouver les prisonniers et les déplacés de toutes nationalités"),
    }
    # le Journal officiel : la page du jeu de données JORF sur data.gouv.fr
    jorf = N.js('https://www.data.gouv.fr/api/1/datasets/jorf-les-donnees-de-l-edition-lois-et-decrets-du-journal-officiel/')
    q = "les décrets portant naturalisation, réintégration, mention d'enfant mineur bénéficiant de l'effet collectif attaché à l'acquisition de la nationalité française par les parents et francisation de noms et de prénoms"
    if norm(q) not in norm(jorf['description'].replace('* ', '')):
        raise SystemExit('citation du JORF introuvable')
    quotes['jorf'] = {'title': 'data.gouv.fr, « JORF : les données de l’édition Lois et décrets du Journal officiel » (ne sont pas reproduits, pour la vie privée)', 'url': jorf['page'], 'quote': q, 'licence': jorf.get('license')}
    fr = more.get('fr', {})
    for t in ['Union des femmes de France', 'Optant']:
        X.raw[t] = fr[t]
    quotes['hopital'] = X.src('Union des femmes de France', "l'association, au titre d'une des trois sociétés d'assistances, peut créer des hôpitaux auxiliaires destinés à recevoir des malades et blessés de l'armée")
    quotes['optant'] = X.src('Optant', "Un optant est un Lorrain ou un Alsacien qui a choisi de rester Français soit en restant en France non annexée soit en quittant les territoires cédés par la France en 1871")
    write_json(os.path.join(out, 'l8b-nationalite.json'), {'v': 1, 'built': BUILT, 'source': 'Wikipédia (citations) : traité de Turin, Alsace-Lorraine, Nationalité française, sénatus-consulte de 1865, loi de 1927',
        'source_url': rows[0]['src']['url'], 'licence': WP_LIC, 'licence_url': WP_LIC_URL, 'count': len(rows), 'rows': rows, 'quotes': quotes})


# ───────────── 📚 personnages, 🔤 variantes ─────────────
LATIN = re.compile(r"^[A-Za-zÀ-ÖØ-öø-ɏḀ-ỿ' .\-’]+$")


def label(L, q, prefer=('fr', 'en', 'mul', 'it', 'es', 'de')):
    d = L.get(q) or {}
    for k in prefer:
        if d.get(k):
            return d[k]
    return ''


def personnages(noms, out):
    L = noms['labels']
    by = {}
    for r in noms['fiction']:
        q = r['ch'].rsplit('/', 1)[-1]
        fnq = r['fn'].rsplit('/', 1)[-1]
        fn = (L.get(fnq) or {}).get('native') or label(L, fnq)
        ch = label(L, q)
        if not fn or not ch or not LATIN.match(fn) or re.match(r'^Q\d+$', ch):
            continue
        work = r.get('work', '').rsplit('/', 1)[-1] if r.get('work') else ''
        auth = (r.get('auth') or r.get('cre') or '').rsplit('/', 1)[-1]
        ym = re.match(r'^\+?(-?\d{1,4})-', r.get('wdate') or '')
        y = int(ym.group(1)) if ym else None
        cur = by.setdefault((q, fn), {'q': q, 'fn': fn, 'ch': ch, 'w': '', 'a': '', 'y': None})
        wl = label(L, work) if work else ''
        al = label(L, auth) if auth else ''
        if wl and not re.match(r'^Q\d+$', wl) and (not cur['w'] or (y and (not cur['y'] or y < cur['y']))):
            cur['w'] = wl; cur['y'] = y or cur['y']
            if al and not re.match(r'^Q\d+$', al):
                cur['a'] = al
        if al and not cur['a'] and not re.match(r'^Q\d+$', al):
            cur['a'] = al
    rows = [[x['fn'], x['ch'], x['q'], x['w'], x['a'], x['y']] for x in by.values()]
    rows.sort(key=lambda r: (r[0].lower(), r[5] or 9999))
    write_json(os.path.join(out, 'l8b-personnages.json.gz'), {'v': 1, 'built': BUILT, 'source': 'Wikidata : personnages de fiction (Q95074, Q15632617, Q3658341, Q15773347, Q15711870, Q17624054) avec un nom de famille (P734)',
        'source_url': 'https://www.wikidata.org/wiki/Q95074', 'licence': 'CC0 1.0 (Wikidata)', 'licence_url': 'https://creativecommons.org/publicdomain/zero/1.0/deed.fr', 'count': len(rows),
        'fields': ['fn', 'ch', 'q', 'w', 'a', 'y'], 'rows': rows}, gz=True)


def variantes(noms, out):
    names, idx, adj = [], {}, {}
    def node(q, lab):
        if q not in idx:
            idx[q] = len(names); names.append([lab, q, []])
        return idx[q]
    for r in noms['variants']:
        a, b = r['a'].rsplit('/', 1)[-1], r['b'].rsplit('/', 1)[-1]
        al, bl = r.get('al', ''), r.get('bl', '')
        if not al or not bl or not LATIN.match(al) or not LATIN.match(bl) or al == bl:
            continue
        i, j = node(a, al), node(b, bl)
        adj.setdefault(i, set()).add(j); adj.setdefault(j, set()).add(i)
    for i, s in adj.items():
        names[i][2] = sorted(s)
    write_json(os.path.join(out, 'l8b-variantes.json.gz'), {'v': 1, 'built': BUILT, 'source': 'Wikidata : noms de famille (Q101352) « dit être le même que » (P460)', 'source_url': 'https://www.wikidata.org/wiki/Property:P460',
        'licence': 'CC0 1.0 (Wikidata)', 'licence_url': 'https://creativecommons.org/publicdomain/zero/1.0/deed.fr', 'count': len(names), 'names': names}, gz=True)


def main(rawdir, out):
    arts = json.load(open(os.path.join(rawdir, 'articles-raw.json'), encoding='utf-8'))
    mp = os.path.join(rawdir, 'more-raw.json')
    more = json.load(open(mp, encoding='utf-8')) if os.path.exists(mp) else {}
    X = Texts(arts)
    prenoms(X, more, out)
    trouves(X, more, out)
    nationalite(X, more, out)
    np = os.path.join(rawdir, 'noms-raw.json')
    if os.path.exists(np):
        noms = json.load(open(np, encoding='utf-8'))
        personnages(noms, out)
        variantes(noms, out)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
