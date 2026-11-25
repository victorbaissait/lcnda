"""💬 Les mots de son coin : quelques mots du français régional, par région, tirés du Wiktionnaire (fr.wiktionary.org, CC BY-SA 4.0).
Pour chaque catégorie « français de … » choisie : la liste des pages, puis le texte de 40 pages, et la définition marquée pour la région.
Réponses gardées dans TM_RAW. Utilisé par build-terre-mots.py."""
import sys, os, re, json, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

API = 'https://fr.wiktionary.org/w/api.php?'
# catégorie → (départements ou pays, mot-clé du modèle de région dans la définition)
REGIONS = {
    'français de Lorraine': (['54', '55', '57', '88'], 'lorraine'), 'français de Moselle': (['57'], 'moselle'), 'français des Vosges': (['88'], 'vosges'),
    'français de Normandie': (['14', '27', '50', '61', '76'], 'normandie'), 'français de la Manche': (['50'], 'manche'),
    'français de Bretagne': (['22', '29', '35', '56', '44'], 'bretagne'), 'français de Nantes': (['44'], 'nantes'), 'français de Loire-Atlantique': (['44'], 'loire'),
    'français de Bourgogne': (['21', '58', '71', '89'], 'bourgogne'), 'français de l’Yonne': (['89'], 'yonne'),
    'français de Champagne': (['10', '51', '52', '08'], 'champagne'), 'français des Ardennes': (['08'], 'ardennes'), 'français de la Haute-Marne': (['52'], 'marne'),
    'français de Franche-Comté': (['25', '39', '70', '90'], 'comt'), 'français du Jura': (['39'], 'jura'),
    'français de Provence': (['04', '05', '06', '13', '83', '84'], 'provence'), 'français de Marseille': (['13'], 'marseille'), 'français du Var': (['83'], 'var'),
    'français de Savoie': (['73', '74'], 'savoie'), 'français de Picardie': (['02', '60', '80'], 'picardie'), 'français de l’Oise': (['60'], 'oise'),
    'français du Nord': (['59'], 'nord'), 'français du Nord-Pas-de-Calais': (['59', '62'], 'nord'), 'français d’Alsace': (['67', '68'], 'alsace'),
    'français du Lyonnais': (['69'], 'lyon'), 'français du Beaujolais': (['69'], 'beaujolais'), 'français de la région stéphanoise': (['42'], 'st'),
    'français du Forez': (['42'], 'forez'), 'français de la Loire': (['42'], 'loire'),
    'français du Dauphiné': (['38', '26', '05'], 'dauphin'), 'français de la Drôme': (['26'], 'drôme'), 'français de Grenoble': (['38'], 'grenoble'),
    'français d’Auvergne': (['03', '15', '43', '63'], 'auvergne'), 'français du Velay': (['43'], 'velay'), 'français du Puy-de-Dôme': (['63'], 'puy'),
    'français d’Occitanie': (['09', '11', '12', '30', '31', '32', '34', '46', '48', '65', '66', '81', '82'], 'occitanie'),
    'français du Languedoc': (['11', '30', '34', '48'], 'languedoc'), 'français du Midi toulousain': (['31'], 'toulous'),
    'français de Gascogne': (['32', '40', '47', '65'], 'gascogne'), 'français du Bordelais': (['33'], 'bordelais'), 'français d’Aquitaine': (['24', '33', '40', '47', '64'], 'aquitaine'),
    'français du Pays basque': (['64'], 'basque'), 'français du Limousin': (['19', '23', '87'], 'limousin'),
    'français du Poitou': (['79', '86'], 'poitou'), 'français de Vendée': (['85'], 'vendée'), 'français des Charentes': (['16', '17'], 'charente'), 'français de la Charente-Maritime': (['17'], 'charente'),
    'français du Berry': (['18', '36'], 'berry'), 'français du Bourbonnais': (['03'], 'bourbonnais'), 'français de Touraine': (['37'], 'touraine'), 'français d’Anjou': (['49'], 'anjou'),
    'français de la Sologne': (['41', '45'], 'sologne'), 'français du Mans': (['72'], 'mans'), 'français de la Sarthe': (['72'], 'sarthe'), 'français de Mayenne': (['53'], 'mayenne'),
    'français de Paris': (['75'], 'paris'), 'français d’Île-de-France': (['75', '77', '78', '91', '92', '93', '94', '95'], 'france'),
    'français de Corse': (['2A', '2B'], 'corse'), 'français de l’Ardèche': (['07'], 'ardèche'),
    'français de la Réunion': (['974'], 'réunion'), 'français de Guadeloupe': (['971'], 'guadeloupe'), 'français de Martinique': (['972'], 'martinique'), 'français de Guyane': (['973'], 'guyane'),
    'français de Belgique': (['BE'], 'belgique'), 'français de la Wallonie': (['BE'], 'wallonie'), 'français de Suisse': (['CH'], 'suisse'), 'français du Luxembourg': (['LU'], 'luxembourg'),
}
PER_CAT = 40

def members(cat):
    j = json.loads(wm.get(API + urllib.parse.urlencode({'action': 'query', 'list': 'categorymembers', 'cmtitle': 'Catégorie:' + cat, 'cmtype': 'page', 'cmnamespace': 0, 'cmlimit': 200, 'format': 'json'}), gap=3))
    return [m['title'] for m in j.get('query', {}).get('categorymembers', [])]

def texts(titles):
    j = json.loads(wm.get(API + urllib.parse.urlencode({'action': 'query', 'prop': 'revisions', 'rvprop': 'content|ids', 'rvslots': 'main', 'titles': '|'.join(titles), 'format': 'json', 'formatversion': 2}), gap=3))
    out = {}
    for p in j.get('query', {}).get('pages', []):
        r = (p.get('revisions') or [{}])[0]
        out[p['title']] = (r.get('slots', {}).get('main', {}).get('content', ''), r.get('revid'))
    return out

POS = {'nom': 'nom', 'verbe': 'verbe', 'adjectif': 'adjectif', 'adverbe': 'adverbe', 'interjection': 'interjection', 'locution-phrase': 'expression', 'locution': 'expression', 'nom-pr': 'nom propre'}

def clean(s):
    s = re.sub(r'<ref[^>]*/>|<ref[^>]*>.*?</ref>', '', s)
    s = re.sub(r'\{\{(?:w|lien|l|ws|pc|smcp)\|([^|}]+)[^}]*\}\}', r'\1', s)
    s = re.sub(r'\{\{[^{}]*\}\}', '', s); s = re.sub(r'\{\{[^{}]*\}\}', '', s)
    s = re.sub(r'\[\[(?:[^|\]]*\|)?([^\]]+)\]\]', r'\1', s)
    s = re.sub(r"'''?", '', s); s = re.sub(r'<[^>]+>', '', s)
    s = re.sub(r'\(\s*[,;]?\s*\)', '', s); s = re.sub(r'\s+([,.;:)])', r'\1', s); s = re.sub(r'([,;])\s*([,.;])', r'\2', s); s = re.sub(r'\(\s+', '(', s)
    return re.sub(r'\s+', ' ', s).strip(' :;,')

def definition(text, key):
    """la définition (française) marquée pour la région ; sinon la première ; et la sorte de mot"""
    m = re.search(r'==\s*\{\{langue\|fr\}\}\s*==(.*?)(?:\n==\s*\{\{langue\||\Z)', text, re.S)
    if not m: return None
    sec, pos, first, best = m.group(1), '', None, None
    for line in sec.split('\n'):
        h = re.match(r'===\s*\{\{S\|([^|}]+)', line)
        if h: pos = POS.get(h.group(1).strip(), h.group(1).strip()); continue
        if re.match(r'#[^*:#]', line):
            raw = line[1:]
            d = clean(raw)
            if len(d) < 4: continue
            tpl = ' '.join(re.findall(r'\{\{([^}]+)\}\}', raw)).lower()
            if first is None: first = (pos, d)
            if best is None and key in tpl: best = (pos, d)
    return best or first

def fetch():
    out = {}
    for cat, (where, key) in REGIONS.items():
        try: titles = [t for t in members(cat) if not t[0].isupper() or ' ' not in t][:PER_CAT]
        except Exception as e: print(cat, 'ÉCHEC', e); continue
        words = []
        for i in range(0, len(titles), 50):
            try: got = texts(titles[i:i + 50])
            except Exception as e: print(cat, 'ÉCHEC', e); got = {}
            for t, (txt, rev) in got.items():
                d = definition(txt, key)
                if d and 4 <= len(d[1]) <= 300: words.append({'w': t, 'pos': d[0], 'def': d[1], 'rev': rev})
        words.sort(key=lambda w: w['w'].lower())
        out[cat] = {'where': where, 'words': words}
        print(cat, len(titles), '→', len(words), flush=True)
    return out

if __name__ == '__main__':
    r = fetch()
    print(sum(len(v['words']) for v in r.values()), 'mots')
