"""Télécharge des articles de Wikipédia en français (texte wiki et page rendue), un à la fois, en suivant les redirections.
Usage : python3 -I wp.py dossier_cache "Titre 1" "Titre 2" …"""
import os, re, sys, time, urllib.parse, urllib.request, urllib.error

UA = 'LCNDA-genealogy-app/1.0 (offline genealogy desktop app; data build script)'


def get(url, tries=6):
    wait = 15
    for _ in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=120) as r:
                return r.read().decode('utf-8')
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if e.code in (429, 500, 502, 503):
                time.sleep(wait); wait = min(wait * 2, 120); continue
            raise
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            time.sleep(wait); wait = min(wait * 2, 120)
    raise RuntimeError('Wikipédia ne répond pas : ' + url)


def safe(t):
    return re.sub(r'[^\w.-]+', '_', t)


def fetch(cache, title):
    """→ (titre final, wikitexte, html) ; gardé dans le cache"""
    os.makedirs(cache, exist_ok=True)
    for _ in range(3):
        f = os.path.join(cache, safe(title) + '.wiki')
        if os.path.exists(f):
            wt = open(f, encoding='utf-8').read()
        else:
            wt = get('https://fr.wikipedia.org/w/index.php?' + urllib.parse.urlencode({'title': title, 'action': 'raw'}))
            if wt is None:
                return title, None, None
            open(f, 'w', encoding='utf-8').write(wt); time.sleep(1.5)
        m = re.match(r'\s*#(?:REDIRECTION|REDIRECT)\s*\[\[([^\]#|]+)', wt, re.I)
        if m:
            title = m.group(1).strip(); continue
        h = os.path.join(cache, safe(title) + '.html')
        if os.path.exists(h):
            html = open(h, encoding='utf-8').read()
        else:
            html = get('https://fr.wikipedia.org/w/index.php?' + urllib.parse.urlencode({'title': title, 'action': 'render'})) or ''
            open(h, 'w', encoding='utf-8').write(html); time.sleep(1.5)
        return title, wt, html
    return title, None, None


if __name__ == '__main__':
    cache = sys.argv[1]
    for t in sys.argv[2:]:
        final, wt, html = fetch(cache, t)
        print(('OK  ' if wt else 'ABSENT ') + t + (' → ' + final if final != t else '') + (f'  ({len(wt)} c.)' if wt else ''))
