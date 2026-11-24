"""Petit client Wikidata (SPARQL) pour les scripts « châteaux et territoires ».
Les réponses sont gardées dans un dossier cache (rejouer le script ne refait pas les requêtes).
Données Wikidata : CC0 1.0 (https://www.wikidata.org/wiki/Wikidata:Licensing).
"""
import hashlib
import json
import os
import time
import urllib.parse
import urllib.request

UA = 'LCNDA-build/1.0 (genealogy app open-data build; https://github.com/)'
ENDPOINT = 'https://query.wikidata.org/sparql'


def sparql(query, cache_dir, tries=4):
    os.makedirs(cache_dir, exist_ok=True)
    key = hashlib.sha256(query.encode()).hexdigest()[:24]
    path = os.path.join(cache_dir, key + '.json')
    if os.path.exists(path):
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    data = urllib.parse.urlencode({'query': query}).encode()
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(ENDPOINT, data=data, headers={'User-Agent': UA, 'Accept': 'application/sparql-results+json',
                                                                       'Content-Type': 'application/x-www-form-urlencoded'})
            with urllib.request.urlopen(req, timeout=320) as r:
                out = json.loads(r.read().decode('utf-8'))['results']['bindings']
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(out, f)
            return out
        except Exception as e:  # 429, 500 (timeout), réseau : on attend et on recommence
            last = e
            time.sleep(15 * (i + 1))
    raise RuntimeError(f'SPARQL failed: {last}')


def val(b, k):
    v = b.get(k)
    return v['value'] if v else None


def qid(uri):
    return uri.rsplit('/', 1)[-1] if uri else None


def point(wkt):
    """'Point(lon lat)' → (lat, lon) arrondis à 5 décimales"""
    if not wkt or not wkt.startswith('Point('):
        return None
    try:
        lon, lat = wkt[6:-1].split()
        return round(float(lat), 5), round(float(lon), 5)
    except ValueError:
        return None


def year(t):
    """'1250-01-01T00:00:00Z' → 1250 ; '-0050-…' → -50"""
    if not t:
        return None
    try:
        neg = t.startswith('-')
        y = int(t.lstrip('+-').split('-')[0])
        return -y if neg else y
    except ValueError:
        return None


def commons_file(uri):
    """http://commons.wikimedia.org/wiki/Special:FilePath/X.jpg → 'X.jpg'"""
    if not uri:
        return None
    return urllib.parse.unquote(uri.rsplit('/', 1)[-1]).replace('_', ' ')


def batches(seq, n):
    for i in range(0, len(seq), n):
        yield seq[i:i + n]
