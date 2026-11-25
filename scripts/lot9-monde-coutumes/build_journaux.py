"""🗞️ Les journaux de son département : la « Presse locale ancienne » de la BnF (data.bnf.fr, Licence Ouverte Etalab) →
assets/data/l9b-journaux.json.gz. Chaque titre : nom, lieu de publication, première et dernière année, périodicité, lien
data.bnf.fr / catalogue, lien Gallica quand il est numérisé. Le lieu est relié à une commune (code INSEE) par son nom,
grâce à assets/data/cc-communes.json.gz ; un nom porté par plusieurs communes garde toutes les possibilités (« amb »)."""
import gzip, json, os, re, sys, unicodedata
sys.path.insert(0, os.path.dirname(__file__))
import common

EP = 'https://data.bnf.fr/sparql'
rows = {}
off = 0
while True:
    q = '''SELECT ?s ?t ?pl ?fy ?ly ?fr ?er WHERE {
      ?s a <http://purl.org/ontology/bibo/Periodical> . ?s <http://www.w3.org/2002/07/owl#sameAs> ?pla .
      FILTER(STRSTARTS(STR(?pla), "http://presselocaleancienne"))
      ?s <http://purl.org/dc/terms/title> ?t .
      OPTIONAL { ?s <http://rdvocab.info/Elements/placeOfPublication> ?pl }
      OPTIONAL { ?s <http://data.bnf.fr/ontology/bnf-onto/firstYear> ?fy }
      OPTIONAL { ?s <http://data.bnf.fr/ontology/bnf-onto/lastYear> ?ly }
      OPTIONAL { ?s <http://rdvocab.info/Elements/frequency> ?fr }
      OPTIONAL { ?s <http://rdvocab.info/Elements/electronicReproduction> ?er }
    } ORDER BY ?s LIMIT 10000 OFFSET %d''' % off
    j = common.get_json(EP, {'query': q, 'format': 'application/json'})
    b = j['results']['bindings']
    for x in b:
        ark = re.search(r'ark:/12148/(cb\w+)', x['s']['value']).group(1)
        r = rows.setdefault(ark, {'a': ark, 't': x['t']['value'].strip()})
        for k, kk in (('pl', 'p'), ('fr', 'f')):
            if k in x and kk not in r:
                r[kk] = x[k]['value'].strip()
        for k, kk in (('fy', 'y1'), ('ly', 'y2')):
            if k in x:
                try:
                    v = int(x[k]['value'][:4])
                    r[kk] = min(r.get(kk, v), v) if kk == 'y1' else max(r.get(kk, v), v)
                except ValueError:
                    pass
        if 'er' in x and 'gallica' in x['er']['value']:
            r['g'] = 1
    print('offset', off, len(b), len(rows))
    if len(b) < 10000:
        break
    off += 10000

def fold(s):
    s = unicodedata.normalize('NFD', s.lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r"[’'`]", ' ', s)
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()

cc = json.load(gzip.open(os.path.join(common.ROOT, 'assets/data/cc-communes.json.gz')))['c']
byname = {}
for insee, v in cc.items():
    byname.setdefault(fold(v[0]), []).append(insee)
# les anciens noms courants (« Saint-Malo » etc. sont déjà là) ; on retire la précision entre parenthèses ou après une virgule
nomatch = 0
for r in rows.values():
    p = r.get('p', '')
    base = re.split(r'[\[(,;:]| et ', p)[0].strip() if p else ''
    ins = byname.get(fold(base), []) if base else []
    if not ins and base:
        ins = byname.get(fold(re.sub(r'^(le|la|les|l)\s+', '', fold(base))), [])
    if ins:
        r['i'] = ins[0] if len(ins) == 1 else ins
    elif p:
        nomatch += 1
out = sorted(rows.values(), key=lambda r: (r.get('y1') or 9999, r['t']))
print('titres', len(out), 'sans commune trouvée', nomatch)
common.write_gz('l9b-journaux.json.gz', {'v': 1, 'src': 'BnF, data.bnf.fr — titres de la « Presse locale ancienne » (bibliographie de la presse française politique et d’information générale)',
    'licence': 'Licence Ouverte (Etalab)', 'licence_url': 'https://www.etalab.gouv.fr/licence-ouverte-open-licence/', 'url': 'https://data.bnf.fr/', 'rows': out})
