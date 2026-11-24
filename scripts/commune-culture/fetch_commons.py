"""Étape 3 : l'auteur et la licence de chaque image d'armoiries (Wikimedia Commons, extmetadata), 50 fichiers par appel."""
import json, os, sys, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

def files_from_sparql():
    j = json.loads(open(os.path.join(wm.RAW, 'sparql-arms'), 'rb').read())
    return sorted({urllib.parse.unquote(b['img']['value'].rsplit('/', 1)[1]) for b in j['results']['bindings']})

def credits(files, gap=2.5):
    out = {}
    for i in range(0, len(files), 50):
        chunk = files[i:i + 50]
        j = json.loads(wm.get('https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode({'action': 'query', 'titles': '|'.join('File:' + f for f in chunk), 'prop': 'imageinfo',
            'iiprop': 'extmetadata', 'iiextmetadatafilter': 'Artist|LicenseShortName|LicenseUrl|Credit|AttributionRequired', 'format': 'json', 'formatversion': '2'}), gap=gap))
        norm = {n['to']: n['from'] for n in j.get('query', {}).get('normalized', [])}
        for p in j.get('query', {}).get('pages', []):
            t = p.get('title', ''); t = norm.get(t, t)
            md = (p.get('imageinfo') or [{}])[0].get('extmetadata', {})
            out[t[5:] if t.startswith('File:') else t] = {k: md.get(k, {}).get('value', '') for k in ('Artist', 'LicenseShortName', 'LicenseUrl', 'Credit')}
        if i % 1000 == 0: print(i, len(files), flush=True)
    return out

if __name__ == '__main__':
    fs = files_from_sparql()
    c = credits(fs)
    print(len(c), 'crédits', flush=True)
