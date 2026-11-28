"""Étape 2 : les pages « Armorial des communes de … » de Wikipédia en français (texte des blasons, CC BY-SA 4.0)."""
import json, os, sys, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

def api(params):
    return json.loads(wm.get('https://fr.wikipedia.org/w/api.php?' + urllib.parse.urlencode({**params, 'format': 'json', 'formatversion': '2'}), gap=2))

def armorial_titles():
    out, cont = [], {}
    while True:
        j = api({'action': 'query', 'list': 'prefixsearch', 'pssearch': 'Armorial des communes d', 'pslimit': 500, 'psnamespace': 0, **cont})
        out += [p['title'] for p in j['query']['prefixsearch']]
        if 'continue' not in j: break
        cont = {'psoffset': j['continue']['psoffset']}
    return sorted(set(out))

def page(title):
    j = api({'action': 'parse', 'page': title, 'prop': 'wikitext|revid', 'redirects': 1})
    return j['parse']

if __name__ == '__main__':
    ts = armorial_titles()
    print(len(ts), 'pages', flush=True)
    for t in ts:
        p = page(t)
        print(t, len(p['wikitext']), flush=True)
