#!/usr/bin/env python3
"""🌊 Lot L — les grandes crues d'Europe depuis 1870 (assets/data/tl-crues.json.gz), pour la liste réunie « 🌊 Crues réunies ».

Source : HANZE — « HANZE database of historical flood impacts in Europe, 1870-2025 » (Paprotny, Zenodo, doi:10.5281/zenodo.23670886).
Licence lue dans la notice Zenodo (API, relue à chaque fabrication) : « cc-by-4.0 ». Fichiers : HANZE_events (une ligne par crue :
dates, sorte, rivières, régions NUTS 3 touchées, morts, personnes touchées, pertes, cause, sources citées) ; S2 (noms des régions) ;
Regions_v2024_simplified (contours des régions NUTS 3, projection ETRS89-LAEA) → le centre de chaque région, en degrés.
Une crue = une ligne : sa date, le centre de la PREMIÈRE région touchée (un point « dans la région », pas le lieu exact), les noms
des régions (3 au plus), le pays, les rivières, les morts, les personnes touchées, la cause, les sources citées par HANZE.

Lancer : python3 -I scripts/telech-l/build_crues.py [dossier de sortie]   (TL_RAW = cache)
"""
import csv, io, json, math, os, struct, sys, zipfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
REC = 'https://zenodo.org/api/records/23670886'


def laea_inv(x, y):
    """ETRS89-LAEA (EPSG:3035) → (lat, lon), formules de Snyder sur l'ellipsoïde GRS80"""
    a, f = 6378137.0, 1 / 298.257222101
    e2 = f * (2 - f); e = math.sqrt(e2)
    lat0, lon0, x0, y0 = math.radians(52), math.radians(10), 4321000.0, 3210000.0
    q = lambda p: (1 - e2) * (math.sin(p) / (1 - e2 * math.sin(p) ** 2) - (1 / (2 * e)) * math.log((1 - e * math.sin(p)) / (1 + e * math.sin(p))))
    qp, q0 = q(math.pi / 2), q(lat0)
    b1 = math.asin(q0 / qp); Rq = a * math.sqrt(qp / 2)
    m1 = math.cos(lat0) / math.sqrt(1 - e2 * math.sin(lat0) ** 2)
    D = a * m1 / (Rq * math.cos(b1))
    X, Y = x - x0, y - y0
    rho = math.hypot(X / D, D * Y)
    if rho < 1e-9:
        return math.degrees(lat0), math.degrees(lon0)
    ce = 2 * math.asin(rho / (2 * Rq))
    qq = qp * (math.cos(ce) * math.sin(b1) + D * Y * math.sin(ce) * math.cos(b1) / rho)
    beta = math.asin(qq / qp)
    lat = beta + (e2 / 3 + 31 * e2 ** 2 / 180 + 517 * e2 ** 3 / 5040) * math.sin(2 * beta) + (23 * e2 ** 2 / 360 + 251 * e2 ** 3 / 3780) * math.sin(4 * beta) + (761 * e2 ** 3 / 45360) * math.sin(6 * beta)
    lon = lon0 + math.atan2(X * math.sin(ce), D * rho * math.cos(b1) * math.cos(ce) - D * D * Y * math.sin(b1) * math.sin(ce))
    return math.degrees(lat), math.degrees(lon)


def dbf_codes(b):
    n, hl, rl = struct.unpack('<IHH', b[4:12])
    fields, off = [], 32
    while b[off] != 0x0D:
        name = b[off:off + 11].split(b'\0')[0].decode('latin-1'); ln = b[off + 16]
        fields.append((name, ln)); off += 32
    out = []
    for i in range(n):
        r = b[hl + i * rl: hl + (i + 1) * rl]; p = 1; rec = {}
        for name, ln in fields:
            rec[name] = r[p:p + ln].decode('utf-8', 'replace').strip(); p += ln
        out.append(rec)
    return out


def shp_centers(b):
    """le centre (moyenne pondérée par l'aire) de la plus grande partie de chaque polygone"""
    out, off = [], 100
    while off < len(b):
        _, ln = struct.unpack('>II', b[off:off + 8]); c = b[off + 8: off + 8 + ln * 2]; off += 8 + ln * 2
        if struct.unpack('<i', c[:4])[0] != 5:
            out.append(None); continue
        nparts, npts = struct.unpack('<ii', c[36:44])
        parts = list(struct.unpack(f'<{nparts}i', c[44:44 + 4 * nparts])) + [npts]
        pts = struct.unpack(f'<{2 * npts}d', c[44 + 4 * nparts: 44 + 4 * nparts + 16 * npts])
        best = None
        for k in range(nparts):
            A = cx = cy = 0.0
            for i in range(parts[k], parts[k + 1] - 1):
                x1, y1, x2, y2 = pts[2 * i], pts[2 * i + 1], pts[2 * i + 2], pts[2 * i + 3]
                w = x1 * y2 - x2 * y1; A += w; cx += (x1 + x2) * w; cy += (y1 + y2) * w
            if A and (best is None or abs(A) > abs(best[0])):
                best = (A, cx / (3 * A), cy / (3 * A))
        out.append(laea_inv(best[1], best[2]) if best else None)
    return out


def main():
    rec = json.loads(wm.get(REC))
    lic = (rec['metadata'].get('license') or {}).get('id', '')
    if lic != 'cc-by-4.0':
        sys.exit(f'HANZE : la licence de la notice Zenodo n’est plus CC BY 4.0 ({lic}) : relire {REC}')
    files = {f['key']: f['links']['self'] for f in rec['files']}
    ev_key = next(k for k in files if k.startswith('HANZE_events'))
    ev = list(csv.DictReader(io.StringIO(wm.get(files[ev_key], '*/*').decode('utf-8-sig'))))
    names = {r['Code']: r['Name'] for r in csv.DictReader(io.StringIO(wm.get(files['S2_regions_codes_and_names_v2024.csv'], '*/*').decode('utf-8-sig')))}
    z = zipfile.ZipFile(io.BytesIO(wm.get(files['Regions_v2024_simplified.zip'], '*/*')))
    shp = next(n for n in z.namelist() if n.endswith('.shp')); dbf = shp[:-4] + '.dbf'
    codes = dbf_codes(z.read(dbf)); cent = shp_centers(z.read(shp))
    key = next(k for k in codes[0] if k.lower() in ('code', 'nuts_id', 'nuts3', 'id'))
    centre = {c[key]: p for c, p in zip(codes, cent) if p}
    rows, kinds, countries = [], [], []
    idx = lambda L, v: (L.index(v) if v in L else (L.append(v) or len(L) - 1))
    for r in ev:
        regs = [c for c in (r.get('admin_unit_code') or '').split(';') if c]
        p = next((centre[c] for c in regs if c in centre), None)
        if not p:
            continue
        num = lambda k: int(float(r[k])) if (r.get(k) or '').strip() not in ('', 'NA') else None
        rows.append([int(r['id']), r['start_date'][:10], (r.get('end_date') or '')[:10], round(p[0], 3), round(p[1], 3),
                     '; '.join(names.get(c, c).strip() for c in regs[:3]) + (f' (+{len(regs) - 3})' if len(regs) > 3 else ''), idx(countries, r['country_name']),
                     idx(kinds, r.get('hips_label') or r.get('event_type') or ''), (r.get('event_source') or '')[:120], num('casualty_count'), num('ppl_affected'),
                     (r.get('cause') or '')[:120], (r.get('sources_author_year') or '')[:200]])
    rows.sort(key=lambda x: x[1])
    assert len(rows) > 2000, len(rows)
    lats = [x[3] for x in rows]; lons = [x[4] for x in rows]
    meta = {'source': 'HANZE — historical flood impacts in Europe (Paprotny, Zenodo)', 'licence': 'CC BY 4.0', 'licence_url': 'https://creativecommons.org/licenses/by/4.0/deed.fr',
            'url': 'https://doi.org/10.5281/zenodo.23670886', 'version': rec['metadata'].get('version', ''), 'built': wm.today(),
            'cite': f"Paprotny, D. (2026). HANZE database of historical flood impacts in Europe, 1870-2025 ({rec['metadata'].get('version', '')}). Zenodo. https://doi.org/10.5281/zenodo.23670886",
            'what': 'Grandes crues d’Europe depuis 1870 : une ligne par crue, le centre de la première région NUTS 3 touchée',
            'bbox': [round(min(lons), 1), round(min(lats), 1), round(max(lons), 1), round(max(lats), 1)],
            'countries': countries, 'kinds': kinds, 'fields': ['id', 'd', 'd2', 'lat', 'lon', 'reg', 'cy', 'k', 'riv', 'dead', 'ppl', 'cause', 'src'], 'rows': rows}
    size = wm.write_gz(OUT, 'tl-crues.json.gz', meta)
    print(f'tl-crues : {len(rows)} crues, {size} octets')


if __name__ == '__main__':
    main()
