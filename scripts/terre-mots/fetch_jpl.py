"""🌟 Les astéroïdes qui portent un nom : NASA/JPL Small-Body Database (ssd-api.jpl.nasa.gov ; données publiques de la NASA).
 - la liste des astéroïdes nommés (numéro, nom) : sbdb_query.api ;
 - pour ceux dont le nom est celui d'une commune, d'un département ou d'une province de France : la citation de nommage
   (texte du Minor Planet Center, repris par le JPL : sbdb.api&discovery=1). On garde ceux dont la citation parle bien de ce lieu de France.
Réponses gardées dans TM_RAW."""
import sys, os, json, re, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

def named():
    j = json.loads(wm.get('https://ssd-api.jpl.nasa.gov/sbdb_query.api?' + urllib.parse.urlencode({'fields': 'pdes,name', 'sb-ns': 'n', 'sb-cdata': '{"AND":["name|DF"]}'}), gap=2, key='jpl-named.json'))
    return [(d[0], d[1]) for d in j['data'] if d[1]]

def citation(num):
    j = json.loads(wm.get('https://ssd-api.jpl.nasa.gov/sbdb.api?' + urllib.parse.urlencode({'sstr': num, 'discovery': 1}), gap=1.2, key=f'jpl-{num}.json'))
    d = j.get('discovery') or {}
    return {'citation': d.get('citation') or '', 'discovery': d.get('discovery') or '', 'who': d.get('who') or '', 'date': d.get('date') or '', 'site': d.get('location') or '', 'ref': d.get('ref') or ''}

FRENCH = re.compile(r'\b(France|French|Fran[cç]aise?|Brittany|Normandy|Burgundy|Provence|Alsace|Lorraine|Auvergne|Gascony|Corsica|Savoy|Picardy|Champagne|Languedoc|Dauphin[eé]|Périgord|Perigord)\b')
PLACE = re.compile(r'\b(town|city|village|commune|region|province|department|d[eé]partement|capital|county|island|valley|river|mountain|located|situated|port)\b', re.I)
