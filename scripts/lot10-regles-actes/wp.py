from fetch import get_json
import urllib.parse as u, json, os
OUT='/tmp/claude-0/-home-user-lcnda/ad8201b5-1353-5614-bebe-2d8bd96b57cd/scratchpad/l10/raw/wp'
os.makedirs(OUT,exist_ok=True)
def text(title, lang='fr'):
    r=get_json(f'https://{lang}.wikipedia.org/w/api.php?action=query&prop=extracts|info|revisions&rvprop=ids&explaintext=1&redirects=1&inprop=url&titles={u.quote(title)}&format=json', pause=3)
    p=list(r['query']['pages'].values())[0]
    return {'title':p.get('title'),'url':p.get('fullurl'),'rev':(p.get('revisions') or [{}])[0].get('revid'),'text':p.get('extract','')}
