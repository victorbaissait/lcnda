#!/usr/bin/env python3
"""🧸 Les jouets de son enfance — les images des catégories « 1900s toys », « 1910s toys »… de Wikimedia Commons, par décennie.
Seules les images sous licence libre (domaine public, CC0, CC BY, CC BY-SA) sont gardées ; auteur, licence et page de chaque image
sont relus sur Commons. Les images ne sont pas livrées : l'app les montre depuis Commons (vignette 320 px).
Sortie : assets/data/l9a-jouets.json.gz  {decades: {"1900": [{t, file, thumb, page, artist, lic, cat}]}}
"""
import re, urllib.parse
from common import jget, write, today

PER = 14
FREE = re.compile(r'^(CC0|CC BY(-SA)? [\d.]+|Public domain|PD\b|Domaine public|CC BY-SA [\d.]+|CC BY [\d.]+|Attribution|No restrictions|Copyrighted free use)', re.I)
API = 'https://commons.wikimedia.org/w/api.php?'


def members(cat, kind='file', n=200):
    u = API + urllib.parse.urlencode({'action': 'query', 'list': 'categorymembers', 'cmtitle': 'Category:' + cat, 'cmtype': kind, 'cmlimit': n, 'format': 'json'})
    try: return [m['title'] for m in jget(u)['query']['categorymembers']]
    except Exception as e: print('!', cat, e); return []


def meta(titles):
    out = []
    for i in range(0, len(titles), 40):
        u = API + urllib.parse.urlencode({'action': 'query', 'titles': '|'.join(titles[i:i + 40]), 'prop': 'imageinfo', 'iiprop': 'extmetadata|url|mime', 'iiurlwidth': 320, 'format': 'json'})
        for p in jget(u)['query']['pages'].values():
            ii = (p.get('imageinfo') or [{}])[0]; em = ii.get('extmetadata') or {}
            g = lambda k: re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', (em.get(k) or {}).get('value', ''))).strip()
            if not str(ii.get('mime', '')).startswith('image/'): continue
            out.append({'t': g('ObjectName')[:120] or p['title'][5:].rsplit('.', 1)[0][:120], 'file': p['title'][5:], 'thumb': ii.get('thumburl', ''), 'page': ii.get('descriptionurl', ''),
                        'artist': g('Artist')[:120], 'lic': g('LicenseShortName')[:60], 'date': g('DateTimeOriginal')[:40], 'desc': g('ImageDescription')[:200]})
    return out


decades = {}
for d in range(1850, 1970, 10):
    cat = f'{d}s toys'
    files = members(cat)
    for sc in members(cat, 'subcat', 30)[:8]:
        files += members(sc[9:], 'file', 60)
    if not files: continue
    ms = [m for m in meta(list(dict.fromkeys(files))) if FREE.search(m['lic'] or '') and m['thumb']]
    # de la variété : on écarte les quasi-doublons de nom
    seen, keep = set(), []
    for m in ms:
        k = re.sub(r'[\d_ ().,-]+', '', m['file'].lower())[:18]
        if k in seen: continue
        seen.add(k); m['cat'] = cat; keep.append(m)
        if len(keep) >= PER: break
    if keep: decades[str(d)] = keep
    print(d, len(files), 'fichiers,', len(ms), 'libres,', len(keep), 'gardés')
write('l9a-jouets', {'source': 'Wikimedia Commons — catégories « 1900s toys », « 1910s toys »…', 'url': 'https://commons.wikimedia.org/wiki/Category:Toys_by_decade',
                     'licence': 'Auteur et licence de chaque image relus sur Commons (domaine public, CC0, CC BY, CC BY-SA seulement)', 'built': today(), 'decades': decades})
