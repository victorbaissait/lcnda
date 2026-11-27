#!/usr/bin/env python3
"""📚 Lot O7 — livres anciens du domaine public sur Internet Archive : assets/data/lo-livres.json.gz (un pack de LIENS, aucun texte copié).

  statistiques  les « Statistique » / « Mémoire statistique » des départements (an IX – 1815, enquêtes des préfets) ;
  agricole      l'Enquête agricole de 1866 (volumes publiés de 1867 à 1872, par circonscription) ;
  patois        les recueils de la parabole de l'enfant prodigue en patois (Coquebert de Montbret, Mélanges… 1831).
Pour CHAQUE volume, la notice est lue (https://archive.org/metadata/<id>) et le volume n'est gardé que si elle dit qu'il est libre :
« licenseurl » vers la marque du domaine public ou CC0, ou « possible-copyright-status » = NOT_IN_COPYRIGHT. Sans l'un des deux
(ex. « Salaires et coût de l'existence… », 1911, sans champ de licence), le volume n'entre pas : il reste à confirmer à la main.
La page des conditions d'Internet Archive (https://archive.org/about/terms) ne s'affiche qu'avec JavaScript : c'est pour cela qu'on
lit la notice de chaque volume, comme pour tc-joanne.
Pack : {rows: [[id, titre, année, département (code d'aujourd'hui quand le nom est reconnu), sorte, licence lue, lien]]}.

Lancer : python3 -I scripts/lot-o/build_ia.py [dossier de sortie]
"""
import datetime, gzip, json, os, re, sys, unicodedata, urllib.parse
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'telech-l'))
import wm  # noqa: E402

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
TODAY = datetime.date.today().isoformat()
SEARCH = {
    'statistiques': '(title:(statistique du département) OR title:(mémoire statistique du département)) AND date:[1798 TO 1820] AND mediatype:texts',
    'agricole': 'title:(enquête agricole) AND date:[1866 TO 1873] AND mediatype:texts',
    'patois': 'title:(mélanges sur les langues dialectes et patois) AND mediatype:texts',
}


def fold(s):
    return ' '.join(unicodedata.normalize('NFD', str(s or '')).encode('ascii', 'ignore').decode().lower().replace('-', ' ').replace("'", ' ').split())


def deps():
    with gzip.open(os.path.join(ROOT, 'assets', 'data', 'communes-decoupage.json.gz'), 'rt', encoding='utf-8') as f:
        d = json.load(f).get('dep', {})
    return sorted(((fold(n), c) for c, n in d.items()), key=lambda x: -len(x[0]))


def free(meta):
    m = meta.get('metadata', {})
    lic = str(m.get('licenseurl') or '')
    if re.search(r'publicdomain/(mark|zero)/1\.0', lic):
        return 'domaine public (' + lic + ')'
    if str(m.get('possible-copyright-status') or '').upper() == 'NOT_IN_COPYRIGHT':
        return 'NOT_IN_COPYRIGHT (notice Internet Archive)'
    return ''


def main():
    D = deps(); rows, refused = [], []
    for kind, q in SEARCH.items():
        url = 'https://archive.org/advancedsearch.php?' + urllib.parse.urlencode({'q': q, 'fl[]': ['identifier', 'title', 'date'], 'rows': 400, 'output': 'json'}, doseq=True)
        for d in json.loads(wm.get(url))['response']['docs']:
            ident = d['identifier']
            meta = json.loads(wm.get(f'https://archive.org/metadata/{urllib.parse.quote(ident)}'))
            lic = free(meta)
            title = re.sub(r'\s+', ' ', str(d.get('title') or ''))[:200]
            if not lic:
                refused.append(ident); continue
            y = re.match(r'(\d{4})', str(d.get('date') or meta.get('metadata', {}).get('date') or ''))
            ft = fold(title); dep = next((c for n, c in D if re.search(rf'\b{re.escape(n)}\b', ft)), '')
            rows.append([ident, title, int(y.group(1)) if y else None, dep, kind, lic, f'https://archive.org/details/{ident}'])
    rows.sort(key=lambda r: (r[4], r[3] or 'zz', r[2] or 0))
    meta = {'v': 1, 'built': TODAY, 'title': 'Livres anciens du domaine public (Internet Archive)', 'source': 'Internet Archive — notice de chaque volume relue',
            'url': 'https://archive.org/', 'licence': 'domaine public (vérifié volume par volume)', 'licence_read': TODAY,
            'fields': ['id', 'title', 'year', 'dep', 'kind', 'licence', 'url'], 'rows': rows, 'refused': refused[:200]}
    print(f'lo-livres.json.gz : {len(rows)} volumes gardés, {len(refused)} écartés (pas de licence lisible), {wm.write_gz(OUT, "lo-livres.json.gz", meta)} octets')


if __name__ == '__main__':
    main()
