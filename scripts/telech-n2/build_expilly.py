#!/usr/bin/env python3
"""LCNDA — lot N2 des téléchargements : l'article de chaque paroisse dans le « Dictionnaire géographique, historique et
politique des Gaules et de la France » de l'abbé Jean-Joseph Expilly (6 volumes, 1762-1770, de A à S : le reste n'a jamais paru).

    python3 -I scripts/telech-n2/build_expilly.py OUT_DIR [--min 3000]

Source : Internet Archive, scans Google Books des bibliothèques de Lyon et de Lausanne (collection europeanlibraries).
LICENCE LUE À CHAQUE FABRICATION dans les métadonnées de chaque volume (https://archive.org/metadata/<id>) : on garde un volume
seulement si « licenseurl » est la Public Domain Mark (creativecommons.org/publicdomain/mark/1.0/) ou CC0 ; sinon il reste en
lien. Expilly est mort en 1793 : le texte est dans le domaine public.
On lit le texte OCR fourni par Internet Archive (<id>_djvu.txt). Rien n'est réécrit : l'article est copié tel que l'OCR l'a lu
(les « ſ » longs souvent lus « f », des lettres fausses).

Prudence (un article attribué à la mauvaise paroisse serait pire que rien) : on garde un article seulement si
  - il commence au début d'une ligne par « NOM, » (le nom en capitales, comme dans le livre) ;
  - il nomme sa province (ou son diocèse, son élection) dans ses 300 premiers caractères, et cette province couvre la commune ;
  - le nom désigne UNE SEULE commune d'aujourd'hui dans les départements de cette province ;
  - il fait entre 40 et 8 000 caractères.
Le résultat est rangé par département d'aujourd'hui (assets/data/tn2-expilly/<code>.json.gz). Le script s'arrête en erreur (rien
n'est enregistré) si moins de --min articles sont reconnus. Fabriqué sur GitHub (.github/workflows/telech-n2.yml) : les serveurs
de fichiers d'Internet Archive ne sont pas joignables depuis l'atelier de développement.
"""
import gzip
import json
import os
import re
import sys
import unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm  # noqa: E402

# les volumes (titre Internet Archive « / 1 A - B », etc.) ; le sixième (1770) va de R à S
VOLUMES = [('bub_gb_OPA2c3XRzxAC', 1, 'A-B'), ('bub_gb_EVk_AAAAcAAJ', 2, 'C-E'), ('bub_gb_LlpEAAAAcAAJ', 3, 'F-K'), ('bub_gb_UFpEAAAAcAAJ', 4, 'L-M'),
           ('bub_gb_T1Q_AAAAcAAJ', 5, 'N-Q'), ('bub_gb_U6xl_qMmSWgC', 6, 'R-S')]
OPEN_LIC = re.compile(r'creativecommons\.org/(publicdomain/(mark|zero)/1\.0)')
# provinces et pays d'Ancien Régime (mots tels qu'Expilly les écrit, sans accents) → départements d'aujourd'hui qui les couvrent
PROV = {
    'alsace': ['67', '68', '90'], 'angoumois': ['16'], 'anjou': ['49', '53', '72', '37'], 'artois': ['62'], 'auvergne': ['15', '63', '43', '03'], 'aunis': ['17'],
    'bearn': ['64'], 'berry': ['18', '36'], 'beauce': ['28', '45', '41'], 'bourbonnois': ['03', '18'], 'bourgogne': ['21', '71', '89', '58', '01'], 'bresse': ['01'],
    'bretagne': ['22', '29', '35', '44', '56'], 'bugey': ['01'], 'champagne': ['08', '10', '51', '52', '02', '77', '89'], 'comte de foix': ['09'], 'dauphine': ['05', '26', '38'],
    'flandre': ['59'], 'franche comte': ['25', '39', '70', '90'], 'gascogne': ['32', '40', '64', '65', '31'], 'guienne': ['24', '33', '46', '47', '12', '82', '40'], 'hainaut': ['59'],
    'isle de france': ['75', '77', '78', '91', '92', '93', '94', '95', '60', '02'], 'ile de france': ['75', '77', '78', '91', '92', '93', '94', '95', '60', '02'],
    'languedoc': ['07', '11', '30', '31', '34', '48', '81', '43', '82'], 'limosin': ['19', '87', '23'], 'limousin': ['19', '87', '23'], 'lorraine': ['54', '55', '57', '88'],
    'barrois': ['55', '54', '52'], 'lyonnois': ['69', '42'], 'forez': ['42'], 'beaujolois': ['69'], 'maine': ['72', '53'], 'marche': ['23', '87', '36'],
    'nivernois': ['58'], 'normandie': ['14', '27', '50', '61', '76'], 'orleanois': ['45', '41', '28'], 'perche': ['61', '28'], 'perigord': ['24'], 'picardie': ['80', '02', '60', '62'],
    'poitou': ['79', '86', '85'], 'provence': ['04', '13', '83', '84', '06'], 'quercy': ['46', '82'], 'rouergue': ['12'], 'roussillon': ['66'], 'saintonge': ['17'],
    'touraine': ['37'], 'vivarais': ['07'], 'velay': ['43'], 'gevaudan': ['48'], 'bigorre': ['65'], 'comminges': ['31'], 'boulonnois': ['62'], 'vexin': ['27', '95', '60'],
    'brie': ['77', '51', '02'], 'gatinois': ['45', '77', '89'], 'sologne': ['41', '45', '18'], 'cambresis': ['59'], 'soissonnois': ['02'], 'vermandois': ['02'],
    'beauvoisis': ['60'], 'valois': ['60', '02'], 'hurepoix': ['91', '78'], 'mantois': ['78'], 'nebouzan': ['31', '65'], 'agenois': ['47'], 'bazadois': ['33'], 'condomois': ['32', '47'],
    'armagnac': ['32'], 'lomagne': ['82', '32'], 'albigeois': ['81'], 'lauraguais': ['11', '31'], 'couserans': ['09'], 'navarre': ['64'], 'soule': ['64'], 'labour': ['64'],
    'medoc': ['33'], 'bordelois': ['33'], 'chalosse': ['40'], 'marsan': ['40'], 'charollois': ['71'], 'maconnois': ['71'], 'auxois': ['21'], 'dombes': ['01'], 'pays de gex': ['01'],
    'thierache': ['02'], 'laonnois': ['02'], 'rethelois': ['08'], 'perthois': ['51', '52'], 'bassigny': ['52'], 'senonois': ['89'], 'auxerrois': ['89'], 'morvan': ['58', '71', '21', '89'],
    'corse': ['2A', '2B'], 'comtat venaissin': ['84'], 'savoie': ['73', '74'], 'nice': ['06']}
PROV_RE = [(re.compile(r'(?<![a-z])' + r'\s+'.join(re.escape(w) for w in k.split()) + r'(?![a-z])'), k) for k in sorted(PROV, key=len, reverse=True)]
HEAD = re.compile(r"^([A-ZÀ-ÝŒ][A-ZÀ-ÝŒ'’\- ]{1,40}?)\s*[,.]\s+(.{20,})$")


def fold(s):
    s = unicodedata.normalize('NFD', str(s)).encode('ascii', 'ignore').decode().lower()
    s = s.replace('œ', 'oe')
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


def name_key(s):
    k = fold(s)
    k = re.sub(r'\b(st|sainct|s)\b', 'saint', k)
    k = re.sub(r'\b(ste)\b', 'sainte', k)
    return re.sub(r'\b(le|la|les|l)\b', ' ', k).replace(' ', '')


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    out = sys.argv[1]
    mn = int(sys.argv[sys.argv.index('--min') + 1]) if '--min' in sys.argv else 3000
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
    com = wm.communes(root)   # {insee: (nom, lat, lon)}
    by_name = {}
    for ins, (n, la, lo) in com.items():
        dep = ins[:3] if ins.startswith('97') else ins[:2]
        by_name.setdefault(name_key(n), []).append((ins, dep, n))
    kept, link_only, vols = {}, [], []
    for ident, no, letters in VOLUMES:
        md = json.loads(wm.get(f'https://archive.org/metadata/{ident}/metadata'))['result']
        lic = md.get('licenseurl') or ''
        if not OPEN_LIC.search(lic):
            link_only.append({'id': ident, 'vol': no, 'letters': letters, 'why': f'licence « {lic or "non dite"} »'})
            print(f'volume {no} ({ident}) : licence « {lic} » → lien seulement')
            continue
        print(f'volume {no} ({ident}) : licence lue « {lic} »')
        vols.append({'id': ident, 'vol': no, 'letters': letters, 'licence': lic, 'date': md.get('date'), 'contributor': md.get('contributor')})
        txt = wm.get(f'https://archive.org/download/{ident}/{ident}_djvu.txt', 'text/plain').decode('utf-8', 'replace')
        lines = txt.split('\n')
        arts, cur = [], None
        for ln in lines:
            m = HEAD.match(ln.strip())
            if m and len(m.group(1).strip()) >= 3:
                if cur:
                    arts.append(cur)
                cur = [m.group(1).strip(), ln.strip()]
            elif cur:
                cur[1] += ' ' + ln.strip()
        if cur:
            arts.append(cur)
        n_ok = 0
        for name, body in arts:
            body = re.sub(r'\s+', ' ', body).strip()
            if not 40 <= len(body) <= 8000:
                continue
            head = fold(body[:300])
            provs = [k for rx, k in PROV_RE if rx.search(head)]
            if not provs:
                continue
            deps = set(PROV[provs[0]])
            cands = [c for c in by_name.get(name_key(name), []) if c[1] in deps]
            if len(cands) != 1:
                continue
            ins, dep, cname = cands[0]
            if ins in kept and len(kept[ins]['t']) >= len(body):
                continue
            kept[ins] = {'ins': ins, 'n': cname, 'h': name, 'prov': provs[0], 'vol': no, 'id': ident, 't': body}
            n_ok += 1
        print(f'volume {no} : {len(arts)} débuts d’article, {n_ok} rattachés à une commune')
    if len(kept) < mn:
        sys.exit(f'Expilly : {len(kept)} articles seulement (< {mn}) : rien n’est enregistré')
    os.makedirs(os.path.join(out, 'tn2-expilly'), exist_ok=True)
    by_dep = {}
    for r in kept.values():
        by_dep.setdefault(r['ins'][:3] if r['ins'].startswith('97') else r['ins'][:2], []).append(r)
    meta0 = {'source': 'Expilly, Dictionnaire géographique, historique et politique des Gaules et de la France (1762-1770), Internet Archive',
             'url': 'https://archive.org/details/bub_gb_OPA2c3XRzxAC', 'licence': 'Domaine public (Expilly, mort en 1793) ; scans marqués Public Domain Mark 1.0 sur Internet Archive',
             'licence_url': 'https://creativecommons.org/publicdomain/mark/1.0/deed.fr', 'built': wm.today(),
             'note': 'Texte OCR copié tel quel (des lettres fausses, « f » pour « s » long). Le dictionnaire s’arrête à la lettre S.'}
    for dep, rs in sorted(by_dep.items()):
        with gzip.GzipFile(os.path.join(out, 'tn2-expilly', f'{dep}.json.gz'), 'wb', mtime=0, compresslevel=9) as f:
            f.write(json.dumps({**meta0, 'dep': dep, 'fields': ['ins', 'n', 'h', 'prov', 'vol', 'id', 't'], 'rows': [[r[k] for k in ['ins', 'n', 'h', 'prov', 'vol', 'id', 't']] for r in sorted(rs, key=lambda r: r['ins'])]},
                               ensure_ascii=False, separators=(',', ':')).encode())
    wm.write_gz(os.path.join(out, 'tn2-expilly'), 'index.json.gz', {**meta0, 'volumes': vols, 'link_only': link_only, 'deps': {d: len(rs) for d, rs in by_dep.items()}, 'rows': [[d, len(rs)] for d, rs in sorted(by_dep.items())]})
    print(f'tn2-expilly : {len(kept)} articles, {len(by_dep)} départements')


if __name__ == '__main__':
    main()
