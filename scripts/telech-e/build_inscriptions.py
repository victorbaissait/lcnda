#!/usr/bin/env python3
"""🏛 Lot E — Inscriptions romaines trouvées en France, Belgique, Suisse et Luxembourg (assets/data/te-inscriptions.json.gz).

Source : Epigraphic Database Heidelberg (EDH), « Epigraphic Database Heidelberg EpiDoc files », Zenodo,
doi:10.5281/zenodo.3575155 (Cowey, Feraudi-Gruénais, Gräf, Grieshaber, Klar, Osnabrügge, 2019). Licence lue le 2026-11-26 sur
la notice Zenodo : « These files can be reused under the CC BY-SA 4.0 licence. » ; chaque fichier le redit (<licence
target="http://creativecommons.org/licenses/by-sa/4.0/">) — le script vérifie les deux et écarte un fichier qui dirait autre chose.
Gardé par inscription : n° HD, lieu de découverte (moderne et antique), province, sorte (traduite de l'allemand), datation,
le texte latin en transcription simple (celui que l'EDH met en tête de l'édition), et l'adresse de sa fiche. Rien d'autre.
Position : la commune GeoNames de la fiche → Wikidata (P1566 → P625, P374), CC0 ; sinon le nom de la commune s'il est unique en
France (cc-communes.json.gz de l'app) ; « bei » (près de) et les noms retrouvés ainsi sont marqués « approché ».

Lancer : python3 -I scripts/telech-e/build_inscriptions.py [dossier de sortie]   (TE_RAW = cache ; 8 archives ≈ 180 Mo)
"""
import gzip, io, json, os, re, sys, time, unicodedata, zipfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
REC = 'https://zenodo.org/api/records/3575155'
LIC = 'These files can be reused under the CC BY-SA 4.0 licence.'
COUNTRIES = {'fr': 'France', 'be': 'Belgique', 'ch': 'Suisse', 'lu': 'Luxembourg'}
KIND = {'grabinschrift': 'épitaphe', 'weihinschrift': 'dédicace aux dieux', 'ehreninschrift': 'inscription honorifique', 'bauinschrift': 'inscription de construction',
        'meilenstein': 'borne milliaire', 'besitzerinschrift': 'marque de propriétaire', 'grenzinschrift': 'borne de limite', 'fluchtafel': 'tablette de malédiction',
        'militärdiplom': 'diplôme militaire', 'akklamation': 'acclamation', 'inschrift unbestimmter funktion': 'inscription', 'stempel': 'estampille',
        'kaiser-/königsinschrift': 'inscription impériale', 'weih-/bauinschrift': 'dédicace et construction', 'votivinschrift': 'ex-voto', 'kalender': 'calendrier',
        'rechtsurkunde': 'acte juridique', 'erlass': 'décret', 'gesetz': 'loi', 'liste': 'liste', 'graffito': 'graffito', 'christliche inschrift': 'inscription chrétienne',
        'unbestimmt': 'inscription', 'besitzer-/herstellerinschrift': 'marque de propriétaire ou de fabricant', 'aufschrift': 'inscription sur un objet',
        'bau-/stifterinschrift': 'inscription de construction ou de don', 'meilen-/leugenstein': 'borne milliaire', 'beischrift': 'légende d’une image',
        'grenzmarkierung': 'borne de limite', 'verzeichnis': 'liste de noms', 'sitzinschrift': 'place réservée (théâtre, amphithéâtre)', 'defixio': 'tablette de malédiction',
        'elogium': 'éloge'}
fold = lambda s: re.sub(r'[^a-z0-9]+', ' ', unicodedata.normalize('NFD', str(s or '')).encode('ascii', 'ignore').decode().lower()).strip()
txt = lambda s: re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', s or '')).strip()


def parse(xml):
    if 'creativecommons.org/licenses/by-sa/4.0' not in xml:
        return None
    m = re.search(r'<placeName type="modernCountry" ref="http://www\.geonames\.org/countries/([a-z]{2})/"', xml)
    if not m or m.group(1) not in COUNTRIES:
        return None
    hd = re.search(r'<idno type="localID">(HD\d+)</idno>', xml)
    prov = re.search(r'<provenance type="found">(.*?)</provenance>', xml, re.S)
    pv = prov.group(1) if prov else ''
    spot = re.search(r'<placeName ref="http://www\.geonames\.org/(\d*)">([^<]*)</placeName>', pv)
    orig = re.search(r'<origPlace>(.*?)</origPlace>', xml, re.S)
    op = orig.group(1) if orig else ''
    province = re.search(r'<placeName type="provinceItalicRegion"[^>]*>([^<]*)</placeName>', op)
    ancient = [t for t in re.findall(r'<placeName ref="http://www\.trismegistos\.org/place/\d*">([^<]*)</placeName>', op)]
    date = re.search(r'<origDate notBefore-custom="(-?\d+)"\s+notAfter-custom="(-?\d+)"', xml) or re.search(r'<origDate[^>]*notBefore-custom="(-?\d+)"[^>]*notAfter-custom="(-?\d+)"', xml)
    kind = re.search(r'<term ref="[^"]*typeins[^"]*">([^<]*)</term>', xml)
    text = re.search(r'<!--\s*(.*?)\s*-->\s*<div type="edition"', xml, re.S)
    obj = re.search(r'<objectType[^>]*>([^<]*)</objectType>', xml)
    if not hd or not text:
        return None
    t = re.sub(r'\s+', ' ', text.group(1)).strip()
    if not t or t in ('-', '?'):
        return None
    spot_name = txt(spot.group(2)) if spot else ''
    k0 = (kind.group(1).strip().lower() if kind else '')
    k = k0.rstrip('?').strip()
    return {'hd': hd.group(1), 'cc': m.group(1), 'gn': spot.group(1) if spot else '', 'spot': spot_name, 'near': bool(re.search(r',\s*bei\b', spot_name)),
            'anc': txt(ancient[-1]) if ancient else '', 'prov': txt(province.group(1)) if province else '',
            'from': int(date.group(1)) if date else None, 'to': int(date.group(2)) if date else None,
            'kind': (KIND.get(k, '') + (' (?)' if k0.endswith('?') and k in KIND else '')), 'kind_de': k if k not in KIND else '', 'obj': txt(obj.group(1)) if obj else '', 'text': t[:600]}


def wikidata_points(ids):
    out = {}
    ids = sorted(set(i for i in ids if i))
    for i in range(0, len(ids), 300):
        vals = ' '.join(f'"{g}"' for g in ids[i:i + 300])
        for b in wm.sparql(f'SELECT ?g ?c ?ins WHERE {{ VALUES ?g {{ {vals} }} ?x wdt:P1566 ?g ; wdt:P625 ?c . OPTIONAL {{ ?x wdt:P374 ?ins }} }}'):
            m = re.match(r'Point\(([-\d.eE]+) ([-\d.eE]+)\)', b['c']['value'])
            if m and b['g']['value'] not in out:
                out[b['g']['value']] = (round(float(m.group(2)), 4), round(float(m.group(1)), 4), b.get('ins', {}).get('value', ''))
    return out


def main():
    rec = json.loads(wm.get(REC))
    desc = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', rec['metadata'].get('description', '')))
    if LIC not in desc or (rec['metadata'].get('license') or {}).get('id') not in ('cc-by-4.0', 'cc-by-sa-4.0'):
        sys.exit('La licence de la notice Zenodo a changé : relire ' + REC)
    rows = []
    for f in rec['files']:
        url = f['links']['self']
        if not url.startswith('https://zenodo.org/api/records/3575155/files/'):   # une adresse venue de la réponse : seulement ce dépôt
            sys.exit('Adresse de fichier inattendue dans la notice Zenodo : ' + url[:120])
        z = zipfile.ZipFile(io.BytesIO(wm.get(url, '*/*')))
        for n in z.namelist():
            if n.endswith('.xml'):
                r = parse(z.read(n).decode('utf-8', 'replace'))
                if r:
                    rows.append(r)
        print(f['key'], len(rows), flush=True)
    pts = wikidata_points([r['gn'] for r in rows])
    com = json.loads(gzip.open(os.path.join(ROOT, 'assets', 'data', 'cc-communes.json.gz')).read())['c']
    by_name = {}
    for insee, (name, lat, lon) in com.items():
        by_name.setdefault(fold(name), []).append((lat, lon, insee))
    out, missing = [], 0
    for r in rows:
        p, approx = pts.get(r['gn']), r['near']
        if not p and r['cc'] == 'fr':
            base = fold(re.sub(r',.*$', '', r['spot']))
            hit = by_name.get(base, [])
            if len(hit) == 1:
                p, approx = hit[0], True
        if not p:
            missing += 1
            continue
        out.append([r['hd'], p[0], p[1], p[2], r['cc'], r['spot'], r['anc'], r['prov'], r['kind'] or r['kind_de'], r['from'], r['to'], r['text'], 1 if approx else 0])
    out.sort(key=lambda x: x[0])
    fields = ['hd', 'lat', 'lon', 'insee', 'cc', 'spot', 'anc', 'prov', 'kind', 'from', 'to', 'text', 'approx']
    meta = {'source': 'Epigraphic Database Heidelberg (EDH), fichiers EpiDoc (Zenodo)', 'licence': 'CC BY-SA 4.0', 'licence_url': 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr',
            'quote': LIC, 'url': 'https://doi.org/10.5281/zenodo.3575155', 'item_url': 'https://edh.ub.uni-heidelberg.de/edh/inschrift/{hd}', 'built': time.strftime('%Y-%m-%d'),
            'cite': 'Epigraphic Database Heidelberg (Heidelberger Akademie der Wissenschaften), EpiDoc files, Zenodo 2019, doi:10.5281/zenodo.3575155 ; positions : Wikidata (CC0), communes (IGN/Etalab, Licence Ouverte)',
            'what': 'Inscriptions latines et grecques d’époque romaine trouvées en France, Belgique, Suisse et Luxembourg : lieu de découverte, sorte, date, texte (transcription de l’EDH)',
            'fields': fields, 'rows': out}
    size = wm.write_gz(OUT, 'te-inscriptions.json.gz', meta)
    print(f'te-inscriptions : {len(out)} inscriptions placées ({missing} sans position), {size} octets')


if __name__ == '__main__':
    main()
