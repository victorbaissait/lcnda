"""Petit client SPARQL Wikidata (query.wikidata.org), avec attente polie quand le service dit « trop de requêtes » (429).
Usage en ligne de commande (essais) : python3 -I wd.py requete.rq  → imprime les lignes en TSV."""
import json, sys, time, urllib.parse, urllib.request, urllib.error

UA = 'LCNDA-genealogy-app/1.0 (offline genealogy desktop app; data build script)'
ENDPOINT = 'https://query.wikidata.org/sparql'


def sparql(query, tries=8):
    data = urllib.parse.urlencode({'query': query}).encode()
    wait = 20
    for i in range(tries):
        req = urllib.request.Request(ENDPOINT, data=data, headers={'User-Agent': UA, 'Accept': 'application/sparql-results+json',
                                                                    'Content-Type': 'application/x-www-form-urlencoded'})
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                return json.loads(r.read().decode('utf-8'))['results']['bindings']
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504):
                ra = e.headers.get('Retry-After')
                t = int(ra) + 2 if ra and ra.isdigit() else wait
                print(f'  (Wikidata {e.code}, on attend {t} s)', file=sys.stderr)
                time.sleep(t); wait = min(wait * 2, 180); continue
            raise
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            print(f'  (réseau : {e}, on attend {wait} s)', file=sys.stderr)
            time.sleep(wait); wait = min(wait * 2, 180)
    raise RuntimeError('Wikidata ne répond pas')


def val(b, k):
    v = b.get(k)
    return v['value'] if v else ''


def qid(u):
    return u.rsplit('/', 1)[-1] if u else ''


if __name__ == '__main__':
    rows = sparql(open(sys.argv[1], encoding='utf-8').read())
    for b in rows:
        print('\t'.join(f"{k}={v['value']}" for k, v in b.items()))
