"""🪨 Une phrase de Wikipédia (CC BY-SA 4.0) sur chaque famille de roches : texte brut des articles (extracts), gardé dans TM_RAW."""
import sys, os, json, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm
ARTICLES = {'granite': 'Granite', 'volcan': 'Roche volcanique', 'gabbro': 'Gabbro', 'gneiss': 'Gneiss', 'schiste': 'Schiste', 'marbre': 'Marbre',
            'quartzite': 'Quartzite', 'calcaire': 'Calcaire', 'dolomie': 'Dolomie', 'craie': 'Craie', 'gres': 'Grès (géologie)', 'conglomerat': 'Conglomérat (géologie)',
            'argile': 'Argile', 'limon': 'Limon', 'sable': 'Alluvions', 'tourbe': 'Tourbe', 'gypse': 'Gypse', 'ardoise': 'Ardoise', 'basalte': 'Basalte', 'marne': 'Marne (géologie)'}
def extract(title):
    j = json.loads(wm.get('https://fr.wikipedia.org/w/api.php?' + urllib.parse.urlencode({'action': 'query', 'prop': 'extracts|revisions', 'rvprop': 'ids', 'explaintext': 1, 'redirects': 1, 'titles': title, 'format': 'json', 'formatversion': 2}), gap=4))
    p = j['query']['pages'][0]
    return {'title': p['title'], 'text': p.get('extract', ''), 'rev': (p.get('revisions') or [{}])[0].get('revid')}
if __name__ == '__main__':
    import re
    for k, t in ARTICLES.items():
        e = extract(t)
        print('=====', k, e['title'], e['rev'], len(e['text']))
        for s in re.split(r'(?<=[.!?])\s+', e['text']):
            if re.search(r'construc|bâti|pierre de taille|maison|toit|couvertur|agricol|cultiv|vigne|fertil|terres? |sols? ', s) and 20 < len(s) < 320: print('  -', s.replace('\n', ' '))
