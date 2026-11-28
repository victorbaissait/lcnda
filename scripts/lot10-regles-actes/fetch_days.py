"""Les 366 pages « jour » de Wikipédia en français (texte wiki) : dictons et saints du jour."""
import json, os, urllib.parse as u
from fetch import get_json
OUT = '/tmp/claude-0/-home-user-lcnda/ad8201b5-1353-5614-bebe-2d8bd96b57cd/scratchpad/l10/raw/days'
os.makedirs(OUT, exist_ok=True)
M = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
N = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
for m in range(12):
    for d in range(1, N[m] + 1):
        t = f"{'1er' if d == 1 else d} {M[m]}"
        f = f'{OUT}/{m + 1:02d}-{d:02d}.json'
        if os.path.exists(f): continue
        try:
            r = get_json('https://fr.wikipedia.org/w/api.php?action=parse&page=' + u.quote(t) + '&prop=wikitext|revid&redirects=1&format=json', pause=3)
            json.dump({'title': r['parse']['title'], 'rev': r['parse'].get('revid'), 'wt': r['parse']['wikitext']['*']}, open(f, 'w'), ensure_ascii=False)
            print(t, 'ok', flush=True)
        except Exception as e: print(t, 'ERR', e, flush=True)
