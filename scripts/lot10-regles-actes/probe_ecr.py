from fetch import get_json
import urllib.parse as u, json, re
cats = ['Category:Calligraphers from France','Category:Louis Barbedor','Category:Jean de Beauchesne','Category:Jean de Beaugrand (master scribe)','Category:Jean-Joseph Bernard','Category:Guillaume Le Gangneur','Category:Lucas Materot','Category:Basile Morin','Category:Pierre Le Bé','Category:Honoré Sébastien Roillet','Category:Joseph-Balthazar Silvestre','Category:Luc Templier']
files = set(['File:EcritureRonde-Encyclopedie.jpg','File:EcritureBatarde-Encyclopedie.jpg','File:EcritureCoulee-Encyclopedie.jpg','File:Académie écriture 1771.jpg','File:Bourgoin - Expédiée.jpg','File:Bedigis154.png','File:Berey.jpg','File:BernyNogent.jpg'])
for c in cats:
    r = get_json('https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers&cmtitle=' + u.quote(c) + '&cmtype=file&cmlimit=200&format=json', pause=1.5)
    files |= {x['title'] for x in r['query']['categorymembers']}
files = sorted(files); out = []
for i in range(0, len(files), 40):
    r = get_json('https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=extmetadata|url|size&iiurlwidth=640&titles=' + u.quote('|'.join(files[i:i+40])) + '&format=json', pause=1.5)
    for p in r['query']['pages'].values():
        ii = (p.get('imageinfo') or [{}])[0]; m = ii.get('extmetadata', {})
        g = lambda k: re.sub(r'<[^>]+>', '', m.get(k, {}).get('value', ''))[:200]
        out.append({'t': p['title'], 'date': g('DateTimeOriginal'), 'lic': g('LicenseShortName'), 'lu': m.get('LicenseUrl', {}).get('value', ''), 'artist': g('Artist'), 'desc': g('ImageDescription'), 'page': ii.get('descriptionurl'), 'thumb': ii.get('thumburl'), 'w': ii.get('width'), 'h': ii.get('height')})
json.dump(out, open('/tmp/claude-0/-home-user-lcnda/ad8201b5-1353-5614-bebe-2d8bd96b57cd/scratchpad/l10/raw/ecr.json', 'w'), ensure_ascii=False, indent=0)
for x in out: print(x['t'][5:70], '|', x['date'][:30], '|', x['lic'], '|', x['artist'][:30], '|', x['desc'][:90])
