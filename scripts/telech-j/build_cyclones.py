# LCNDA — lot J (🌍 Partir et nommer) : 🌀 tj-cyclones — les cyclones depuis 1842 près des Antilles, de la Louisiane, de la Réunion,
# de Maurice, de Madagascar, de la Nouvelle-Calédonie et de la Polynésie (NOAA NCEI, IBTrACS v04r01 ; données publiques du gouvernement
# des États-Unis, citation demandée : voir CITE).
#   python3 -I scripts/telech-j/build_cyclones.py assets/data
# On garde les tempêtes dont au moins un point passe dans une des zones, et leurs points (toutes les 6 heures) dans la zone élargie
# de 6° : de quoi dire « le cyclone X est passé à N km de ce lieu » sur l'ordinateur.
import csv, io, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm  # noqa: E402

OUT = sys.argv[1] if len(sys.argv) > 1 else 'assets/data'
BASE = 'https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-stewardship-ibtracs/v04r01/access/csv/'
LANDING = 'https://www.ncei.noaa.gov/products/international-best-track-archive'
META_URL = 'https://www.ncei.noaa.gov/metadata/geoportal/rest/metadata/item/gov.noaa.ncdc:C01552/html'
CITE = ('Gahtan, J., Knapp, K. R., Schreck, C. J. III, Diamond, H. J., Kossin, J. P., Kruk, M. C. (2024). International Best Track Archive '
        'for Climate Stewardship (IBTrACS) Project, Version 4.01. NOAA National Centers for Environmental Information. '
        'https://doi.org/10.25921/82ty-9e16 ; Knapp et al. 2010, BAMS 91, 363-376, doi:10.1175/2009BAMS2755.1')
# zones : [id, libellé, lat min, lat max, lon min, lon max]
ZONES = [['antilles', 'Antilles et Haïti', 10.0, 20.5, -75.5, -59.0], ['louisiane', 'Louisiane et golfe du Mexique', 27.5, 33.5, -95.5, -87.5],
         ['reunion', 'La Réunion et Maurice', -23.0, -18.5, 54.5, 58.5], ['madagascar', 'Madagascar et Mayotte', -26.0, -11.5, 43.0, 51.0],
         ['caledonie', 'Nouvelle-Calédonie', -23.5, -19.0, 163.0, 168.5], ['polynesie', 'Polynésie française', -28.0, -7.0, -155.0, -134.0],
         ['guyane', 'Guyane et Amazonie', 1.0, 6.5, -55.0, -51.0], ['spm', 'Saint-Pierre-et-Miquelon et Terre-Neuve', 45.5, 48.5, -57.5, -52.0]]
PAD = 6.0


def inz(la, lo, pad=0.0):
    return [z[0] for z in ZONES if z[2] - pad <= la <= z[3] + pad and z[4] - pad <= lo <= z[5] + pad]


def fnum(v):
    try:
        return float(v)
    except Exception:  # noqa
        return None


def main():
    # la page de la NOAA qui dit les conditions d'usage : on la relit, et l'on s'arrête si elle pose une restriction nouvelle
    lic = wm.get(META_URL, 'text/html').decode('utf-8', 'replace')
    if 'Cite as' not in lic or 'Use liability' not in lic:
        sys.exit('IBTrACS : la page des conditions d’usage a changé ; relire ' + META_URL)
    storms = {}
    for basin in ('NA', 'SI', 'SP'):
        body = wm.get(BASE + f'ibtracs.{basin}.list.v04r01.csv', 'text/csv').decode('utf-8', 'replace')
        rd = csv.reader(io.StringIO(body))
        head = next(rd)
        next(rd)  # la ligne des unités
        ix = {k: i for i, k in enumerate(head)}
        for r in rd:
            la, lo = fnum(r[ix['LAT']]), fnum(r[ix['LON']])
            if la is None or lo is None:
                continue
            if lo > 180:
                lo -= 360
            t = r[ix['ISO_TIME']]  # 1851-06-25 00:00:00
            if t[11:13] not in ('00', '06', '12', '18') or t[14:16] != '00':
                continue
            zs = inz(la, lo, PAD)
            if not zs:
                continue
            sid = r[ix['SID']]
            s = storms.setdefault(sid, {'sid': sid, 'name': r[ix['NAME']], 'season': int(r[ix['SEASON']]), 'basin': basin, 'zones': set(), 'pts': [], 'wmax': 0})
            if inz(la, lo):
                s['zones'].update(inz(la, lo))
            w = fnum(r[ix['USA_WIND']]) or fnum(r[ix['WMO_WIND']])
            if w:
                s['wmax'] = max(s['wmax'], w)
            s['pts'].append([t[:4] + t[5:7] + t[8:10] + t[11:13], round(la, 1), round(lo, 1), int(w) if w else None])
    rows = []
    for s in storms.values():
        if not s['zones'] or not s['pts']:
            continue
        name = '' if s['name'] in ('NOT_NAMED', 'UNNAMED', '') else s['name'].title()
        rows.append([s['sid'], name, s['season'], s['basin'], ' '.join(sorted(s['zones'])), int(s['wmax']) or None, s['pts']])
    rows.sort(key=lambda r: (r[6][0][0], r[0]))
    meta = {'v': 1, 'source': 'NOAA NCEI — IBTrACS v04r01', 'url': LANDING, 'licence': 'Données publiques (NOAA, gouvernement des États-Unis) ; citation demandée',
            'licence_url': META_URL, 'credit': CITE, 'built': wm.today(),
            'what': 'Cyclones et tempêtes tropicales passés près des Antilles, de la Louisiane, de la Réunion, de Maurice, de Madagascar, de Mayotte, '
                    'de la Nouvelle-Calédonie, de la Polynésie, de la Guyane et de Saint-Pierre-et-Miquelon (bassins NA, SI, SP), depuis 1842 ; '
                    'points toutes les 6 heures (date AAAAMMJJHH UTC, lat, lon, vent max en nœuds)',
            'zones': ZONES, 'fields': ['sid', 'name', 'season', 'basin', 'zones', 'wmax', 'pts'], 'rows': rows}
    size = wm.write_gz(OUT, 'tj-cyclones.json.gz', meta)
    print(f'tj-cyclones : {len(rows)} tempêtes ({rows[0][2]}–{rows[-1][2]}), {sum(len(r[6]) for r in rows)} points, {size} octets')


if __name__ == '__main__':
    main()
