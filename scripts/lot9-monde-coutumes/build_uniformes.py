"""👕 Les uniformes de son époque : gravures et planches d'uniformes français du DOMAINE PUBLIC sur Wikimedia Commons →
assets/data/l9b-uniformes.json.gz. Chaque image garde son auteur, sa licence (domaine public seulement), sa page et une
vignette ; l'année de l'uniforme est lue dans le titre du fichier (« Cuirassiers 1805.jpg »), l'arme d'après les mots du titre.
Usage : python3 build_uniformes.py"""
import os, re, sys, html
sys.path.insert(0, os.path.dirname(__file__))
import common

API = 'https://commons.wikimedia.org/w/api.php'
CATS = ["Category:Les Uniformes De L'Armee Francaise 1690-1894", "Category:Les Uniformes De L'Armee Francaise 1690-1894 Volume 1",
        "Category:Dragons 1745-1828. - Notes et aquarelles par E. Fort - btv1b8426895q",
        "Category:Description de l'Uniforme de l'Infanterie de ligne, des bataillons d'infanterie légère d'Afrique... - btv1b84269618",
        "Category:Description de l'uniforme du régiment des Guides (des chasseurs à cheval, - des cuirassiers, dragons, lanciers et chasseurs de la garde impériale, - du corps du génie,) - btv1b8426949t"]
EXTRA_SEARCH = ['Lienhart Humbert', 'uniformes armée française Lienhart']
ARMS = [('cavalerie', r'cavaler|cuirass|dragon|hussard|lancier|chevau|chasseurs? à cheval|carabinier|guides|spahi|light cavalry|line cavalry|hussars|gendarmes? d.ordonnance'),
        ('artillerie', r'artill|canonn|bombard|ordnance|poudres'), ('genie', r'génie|genie|sapeur|pontonn|mineur'), ('marine', r'marine|matelot|naval|navy'),
        ('gendarmerie', r'gendarmerie|maréchaussée'), ('infanterie', r'infanterie|fusilier|grenadier|voltigeur|chasseurs? à pied|zouave|tirailleur|ligne|infantry|légère')]

def members(cat):
    out, cont = [], {}
    while True:
        j = common.get_json(API, {'action': 'query', 'list': 'categorymembers', 'cmtitle': cat, 'cmlimit': 500, 'cmtype': 'file', 'format': 'json', **cont})
        out += [m['title'] for m in j['query']['categorymembers']]
        if 'continue' not in j:
            return out
        cont = {'cmcontinue': j['continue']['cmcontinue']}

def strip(s):
    return html.unescape(re.sub(r'<[^>]+>', '', s or '')).strip()

files = []
for c in CATS:
    try:
        files += members(c)
    except Exception as e:  # noqa
        print('catégorie sautée', c, e)
files = sorted(set(f for f in files if re.search(r'\.(jpe?g|png|tiff?)$', f, re.I)))
print('fichiers', len(files))
rows = []
for i in range(0, len(files), 12):
    part = files[i:i + 12]
    j = common.get_json(API, {'action': 'query', 'titles': '|'.join(part), 'prop': 'imageinfo', 'iiprop': 'url|extmetadata', 'iiurlwidth': 240, 'format': 'json'})
    for p in j['query']['pages'].values():
        ii = (p.get('imageinfo') or [None])[0]
        if not ii:
            continue
        md = ii.get('extmetadata', {})
        lic = strip(md.get('LicenseShortName', {}).get('value', ''))
        if not re.search(r'public domain|domaine public|^pd|cc0', lic, re.I):
            continue
        t = p['title'][5:]
        name = re.sub(r'\.(jpe?g|png|tiff?)$', '', t, flags=re.I)
        m = re.search(r'\b(1[6-9]\d\d)\b', name) or re.search(r'\b(1[6-9]\d\d)\b', strip(md.get('ObjectName', {}).get('value', '')))
        if not m:
            continue
        y = int(m.group(1))
        if not 1680 <= y <= 1950:
            continue
        low = name.lower()
        arm = next((a for a, rx in ARMS if re.search(rx, low)), '')
        rows.append({'title': name.replace('_', ' '), 'y': y, 'arm': arm, 'file': t, 'thumb': ii.get('thumburl', ''), 'page': ii.get('descriptionurl', ''),
                     'author': strip(md.get('Artist', {}).get('value', ''))[:120], 'licence': lic, 'licence_url': strip(md.get('LicenseUrl', {}).get('value', '')),
                     'date': strip(md.get('DateTimeOriginal', {}).get('value', ''))[:40]})
rows.sort(key=lambda r: (r['y'], r['title']))
print('gravures datées, domaine public', len(rows))
common.write_gz('l9b-uniformes.json.gz', {'v': 1, 'src': {'label': 'Wikimedia Commons — planches de Lienhart et Humbert, « Les Uniformes de l’armée française 1690-1894 » (1897-1906), aquarelles et recueils numérisés par la BnF', 'licence': 'domaine public (licence de chaque image sur sa page)', 'url': 'https://commons.wikimedia.org/wiki/Category:Les_Uniformes_De_L%27Armee_Francaise_1690-1894'}, 'rows': rows})
