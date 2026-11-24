/* LCNDA — 🌒 La Lune et les éclipses : les calculs, sans page et sans données à télécharger.
 * window.LCNDA_LUNE (aussi require() dans Node : tests/test-lune.js). Affiché par assets/js/heritage-lune.js.
 *
 * D'après Jean Meeus, « Astronomical Algorithms » (2e éd., 1998) :
 *   ch. 7  jour julien (calendrier julien avant le 15 octobre 1582, grégorien après) ;
 *   ch. 12 temps sidéral ; ch. 22 nutation (termes principaux) ; ch. 25 Soleil (méthode à 0,01°) ;
 *   ch. 47 Lune (ELP-2000/82 abrégée, tables 47.A et 47.B complètes : ~10″ en longitude, ~4″ en latitude) ;
 *   ch. 40 parallaxe (positions topocentriques, faites ici en coordonnées rectangulaires) ; ch. 48 fraction éclairée ;
 *   ch. 49 phases moyennes et ch. 54 éclipses (dates, type, gamma, grandeur, demi-durées).
 * ΔT (TT − UT) : polynômes d'Espenak et Meeus (NASA, 2006), valables de −500 à 2150, les meilleurs entre 1500 et 2100.
 *
 * Précision obtenue (vérifiée par tests/test-lune.js) : phases (nouvelle / pleine lune) à quelques minutes près ;
 * maximum des éclipses (ch. 54) à quelques minutes ; circonstances locales d'une éclipse de Soleil (calcul minute par minute
 * de la séparation topocentrique des centres) : heures des contacts à ±2 min, grandeur à ±0,01 environ ; lever et coucher
 * à ±2 min (réfraction moyenne). Avant 1600, l'incertitude de ΔT (minutes) déplace un peu les bandes de totalité (quelques km).
 *
 *   jd(y, m, d, h=0) / fromJd(jd) / dayOf(texte)         jours juliens (UT) ; une date écrite (« 11 août 1999 », « 1999-08-11 », « 11 AUG 1999 »)
 *   deltaT(année décimale)                               secondes
 *   sun(jde) / moon(jde)                                 positions géocentriques apparentes {lon, lat, ra, dec, dist (km)}
 *   topo(body, jdUT, lat, lon)                           {alt, az, ra, dec, dist, radius} vus du lieu (body : 'sun' | 'moon')
 *   phase(jdUT)                                          {key, name, illumination (%), age (jours), elongation, waxing}
 *   nextPhase(jdUT, angle) / prevPhase(jdUT, angle)      0 nouvelle lune, 90 premier quartier, 180 pleine lune, 270 dernier quartier
 *   riseSet(body, y, m, d, lat, lon, tz)                 {rise, set} (jours juliens UT, ou null) pour la journée locale (tz en heures)
 *   solarEclipses(y1, y2) / lunarEclipses(y1, y2)        [{kind, jd (maximum, UT), type, gamma, mag, …}]
 *   solarAt(éclipse, lat, lon) / lunarAt(éclipse, lat, lon)  ce qu'on en voyait du lieu (null : rien)
 *   legalOffset(jdUT, lon, pays)                         {h (heures à ajouter à UT), legal} : heure légale française (≈ 1891 →), sinon heure solaire du lieu
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.LCNDA_LUNE = api;
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';
    const R = Math.PI / 180;
    const sin = d => Math.sin(d * R), cos = d => Math.cos(d * R), norm = d => ((d % 360) + 360) % 360;
    const asinD = x => Math.asin(Math.max(-1, Math.min(1, x))) / R, atan2D = (y, x) => Math.atan2(y, x) / R;
    const RE = 6378.14, AU = 149597870.7, R_MOON = 1737.4, R_SUN = 695700;

    /* ─────────── ch. 7 : jour julien ─────────── */
    function jd(y, m, d, h = 0) {
        if (m <= 2) { y -= 1; m += 12; }
        const greg = y > 1582 || (y === 1582 && (m > 10 || (m === 10 && d >= 15)));
        const a = Math.floor(y / 100), b = greg ? 2 - a + Math.floor(a / 4) : 0;
        return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + h / 24 + b - 1524.5;
    }
    function fromJd(j) {
        const jm = Math.round((j + 0.5) * 1440) / 1440, z = Math.floor(jm), f = jm - z;
        let a = z; if (z >= 2299161) { const al = Math.floor((z - 1867216.25) / 36524.25); a = z + 1 + al - Math.floor(al / 4); }
        const b = a + 1524, c = Math.floor((b - 122.1) / 365.25), d = Math.floor(365.25 * c), e = Math.floor((b - d) / 30.6001);
        const day = b - d - Math.floor(30.6001 * e), m = e < 14 ? e - 1 : e - 13, y = m > 2 ? c - 4716 : c - 4715, mins = Math.round(f * 1440);
        return {y, m, d: day, hour: Math.floor(mins / 60), min: mins % 60, h: (j + 0.5 - Math.floor(j + 0.5)) * 24};
    }
    const yearOf = j => { const c = fromJd(j); return c.y + (c.m - 0.5) / 12; };

    /* une date écrite → {y, m, d} (au jour près seulement ; « vers », « avant », « entre » → null) */
    const MOIS = ['janv', 'fev', 'mars', 'avr', 'mai', 'juin', 'juil', 'aou', 'sep', 'oct', 'nov', 'dec'];
    const GED = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    function dayOf(text, sortDate = '') {
        const s = String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
        if (/\b(vers|env|environ|avant|apres|entre|abt|bef|aft|bet|est|cal|from|to|circa|ca)\b|\?|~/.test(s)) return null;
        const ok = (y, m, d) => (y > 0 && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? {y, m, d} : null);
        let x = s.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/); if (x) return ok(+x[1], +x[2], +x[3]);
        x = s.match(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/); if (x) return ok(+x[3], +x[2], +x[1]);
        x = s.match(/\b(\d{1,2})(?:er)?\s+([a-z]+)\.?\s+(\d{3,4})\b/);
        if (x) { let k = MOIS.findIndex(p => x[2].startsWith(p)); if (k < 0) k = GED.findIndex(p => x[2].startsWith(p)); if (k >= 0) return ok(+x[3], k + 1, +x[1]); }
        x = String(sortDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); if (x && !s) return ok(+x[1], +x[2], +x[3]);
        return null;
    }

    /* ─────────── ΔT, Espenak & Meeus ─────────── */
    function deltaT(y) {
        let t, u;
        if (y < -500 || y >= 2150) { u = (y - 1820) / 100; return -20 + 32 * u * u; }
        if (y < 500) { u = y / 100; return 10583.6 - 1014.41 * u + 33.78311 * u ** 2 - 5.952053 * u ** 3 - 0.1798452 * u ** 4 + 0.022174192 * u ** 5 + 0.0090316521 * u ** 6; }
        if (y < 1600) { u = (y - 1000) / 100; return 1574.2 - 556.01 * u + 71.23472 * u ** 2 + 0.319781 * u ** 3 - 0.8503463 * u ** 4 - 0.005050998 * u ** 5 + 0.0083572073 * u ** 6; }
        if (y < 1700) { t = y - 1600; return 120 - 0.9808 * t - 0.01532 * t ** 2 + t ** 3 / 7129; }
        if (y < 1800) { t = y - 1700; return 8.83 + 0.1603 * t - 0.0059285 * t ** 2 + 0.00013336 * t ** 3 - t ** 4 / 1174000; }
        if (y < 1860) { t = y - 1800; return 13.72 - 0.332447 * t + 0.0068612 * t ** 2 + 0.0041116 * t ** 3 - 0.00037436 * t ** 4 + 0.0000121272 * t ** 5 - 0.0000001699 * t ** 6 + 0.000000000875 * t ** 7; }
        if (y < 1900) { t = y - 1860; return 7.62 + 0.5737 * t - 0.251754 * t ** 2 + 0.01680668 * t ** 3 - 0.0004473624 * t ** 4 + t ** 5 / 233174; }
        if (y < 1920) { t = y - 1900; return -2.79 + 1.494119 * t - 0.0598939 * t ** 2 + 0.0061966 * t ** 3 - 0.000197 * t ** 4; }
        if (y < 1941) { t = y - 1920; return 21.20 + 0.84493 * t - 0.076100 * t ** 2 + 0.0020936 * t ** 3; }
        if (y < 1961) { t = y - 1950; return 29.07 + 0.407 * t - t ** 2 / 233 + t ** 3 / 2547; }
        if (y < 1986) { t = y - 1975; return 45.45 + 1.067 * t - t ** 2 / 260 - t ** 3 / 718; }
        if (y < 2005) { t = y - 2000; return 63.86 + 0.3345 * t - 0.060374 * t ** 2 + 0.0017275 * t ** 3 + 0.000651814 * t ** 4 + 0.00002373599 * t ** 5; }
        if (y < 2050) { t = y - 2000; return 62.92 + 0.32217 * t + 0.005589 * t ** 2; }
        u = (y - 1820) / 100; return -20 + 32 * u * u - 0.5628 * (2150 - y);
    }
    const jde = jdUT => jdUT + deltaT(yearOf(jdUT)) / 86400;

    /* ─────────── ch. 22 : nutation et obliquité ─────────── */
    function nutation(T) {
        const om = 125.04452 - 1934.136261 * T, L = 280.4665 + 36000.7698 * T, Lp = 218.3165 + 481267.8813 * T;
        const dpsi = (-17.20 * sin(om) - 1.32 * sin(2 * L) - 0.23 * sin(2 * Lp) + 0.21 * sin(2 * om)) / 3600;
        const deps = (9.20 * cos(om) + 0.57 * cos(2 * L) + 0.10 * cos(2 * Lp) - 0.09 * cos(2 * om)) / 3600;
        const eps0 = 23.4392911111 - (46.8150 * T + 0.00059 * T * T - 0.001813 * T ** 3) / 3600;
        return {dpsi, eps: eps0 + deps};
    }
    function toEq(lon, lat, eps) {
        const ra = norm(atan2D(sin(lon) * cos(eps) - Math.tan(lat * R) * sin(eps), cos(lon)));
        return {ra, dec: asinD(sin(lat) * cos(eps) + cos(lat) * sin(eps) * sin(lon))};
    }

    /* ─────────── ch. 25 : le Soleil ─────────── */
    function sun(J) {
        const T = (J - 2451545) / 36525;
        const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T, M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
        const e = 0.016708634 - 0.000042037 * T - 0.0000001267 * T * T;
        const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * sin(M) + (0.019993 - 0.000101 * T) * sin(2 * M) + 0.000289 * sin(3 * M);
        const v = M + C, Rau = 1.000001018 * (1 - e * e) / (1 + e * cos(v)), n = nutation(T);
        const lon = norm(L0 + C + n.dpsi - 20.4898 / 3600 / Rau);
        return {lon, lat: 0, dist: Rau * AU, ...toEq(lon, 0, n.eps)};
    }

    /* ─────────── ch. 47 : la Lune (tables 47.A et 47.B complètes) ─────────── */
    // [D, M, M', F, Σl, Σr]
    const TA = [[0, 0, 1, 0, 6288774, -20905355], [2, 0, -1, 0, 1274027, -3699111], [2, 0, 0, 0, 658314, -2955968], [0, 0, 2, 0, 213618, -569925], [0, 1, 0, 0, -185116, 48888],
        [0, 0, 0, 2, -114332, -3149], [2, 0, -2, 0, 58793, 246158], [2, -1, -1, 0, 57066, -152138], [2, 0, 1, 0, 53322, -170733], [2, -1, 0, 0, 45758, -204586],
        [0, 1, -1, 0, -40923, -129620], [1, 0, 0, 0, -34720, 108743], [0, 1, 1, 0, -30383, 104755], [2, 0, 0, -2, 15327, 10321], [0, 0, 1, 2, -12528, 0],
        [0, 0, 1, -2, 10980, 79661], [4, 0, -1, 0, 10675, -34782], [0, 0, 3, 0, 10034, -23210], [4, 0, -2, 0, 8548, -21636], [2, 1, -1, 0, -7888, 24208],
        [2, 1, 0, 0, -6766, 30824], [1, 0, -1, 0, -5163, -8379], [1, 1, 0, 0, 4987, -16675], [2, -1, 1, 0, 4036, -12831], [2, 0, 2, 0, 3994, -10445],
        [4, 0, 0, 0, 3861, -11650], [2, 0, -3, 0, 3665, 14403], [0, 1, -2, 0, -2689, -7003], [2, 0, -1, 2, -2602, 0], [2, -1, -2, 0, 2390, 10056],
        [1, 0, 1, 0, -2348, 6322], [2, -2, 0, 0, 2236, -9884], [0, 1, 2, 0, -2120, 5751], [0, 2, 0, 0, -2069, 0], [2, -2, -1, 0, 2048, -4950],
        [2, 0, 1, -2, -1773, 4130], [2, 0, 0, 2, -1595, 0], [4, -1, -1, 0, 1215, -3958], [0, 0, 2, 2, -1110, 0], [3, 0, -1, 0, -892, 3258],
        [2, 1, 1, 0, -810, 2616], [4, -1, -2, 0, 759, -1897], [0, 2, -1, 0, -713, -2117], [2, 2, -1, 0, -700, 2354], [2, 1, -2, 0, 691, 0],
        [2, -1, 0, -2, 596, 0], [4, 0, 1, 0, 549, -1423], [0, 0, 4, 0, 537, -1117], [4, -1, 0, 0, 520, -1571], [1, 0, -2, 0, -487, -1739],
        [2, 1, 0, -2, -399, 0], [0, 0, 2, -2, -381, -4421], [1, 1, 1, 0, 351, 0], [3, 0, -2, 0, -340, 0], [4, 0, -3, 0, 330, 0],
        [2, -1, 2, 0, 327, 0], [0, 2, 1, 0, -323, 1165], [1, 1, -1, 0, 299, 0], [2, 0, 3, 0, 294, 0], [2, 0, -1, -2, 0, 8752]];
    // [D, M, M', F, Σb]
    const TB = [[0, 0, 0, 1, 5128122], [0, 0, 1, 1, 280602], [0, 0, 1, -1, 277693], [2, 0, 0, -1, 173237], [2, 0, -1, 1, 55413], [2, 0, -1, -1, 46271],
        [2, 0, 0, 1, 32573], [0, 0, 2, 1, 17198], [2, 0, 1, -1, 9266], [0, 0, 2, -1, 8822], [2, -1, 0, -1, 8216], [2, 0, -2, -1, 4324],
        [2, 0, 1, 1, 4200], [2, 1, 0, -1, -3359], [2, -1, -1, 1, 2463], [2, -1, 0, 1, 2211], [2, -1, -1, -1, 2065], [0, 1, -1, -1, -1870],
        [4, 0, -1, -1, 1828], [0, 1, 0, 1, -1794], [0, 0, 0, 3, -1749], [0, 1, -1, 1, -1565], [1, 0, 0, 1, -1491], [0, 1, 1, 1, -1475],
        [0, 1, 1, -1, -1410], [0, 1, 0, -1, -1344], [1, 0, 0, -1, -1335], [0, 0, 3, 1, 1107], [4, 0, 0, -1, 1021], [4, 0, -1, 1, 833],
        [0, 0, 1, -3, 777], [4, 0, -2, 1, 671], [2, 0, 0, -3, 607], [2, 0, 2, -1, 596], [2, -1, 1, -1, 491], [2, 0, -2, 1, -451],
        [0, 0, 3, -1, 439], [2, 0, 2, 1, 422], [2, 0, -3, -1, 421], [2, 1, -1, 1, -366], [2, 1, 0, 1, -351], [4, 0, 0, 1, 331],
        [2, -1, 1, 1, 315], [2, -2, 0, -1, 302], [0, 0, 1, 3, -283], [2, 1, 1, -1, -229], [1, 1, 0, -1, 223], [1, 1, 0, 1, 223],
        [0, 1, -2, -1, -220], [2, 1, -1, -1, -220], [1, 0, 1, 1, -185], [2, -1, -2, -1, 181], [0, 1, 2, 1, -177], [4, 0, -2, -1, 176],
        [4, -1, -1, -1, 166], [1, 0, 1, -1, -164], [4, 0, 1, -1, 132], [1, 0, -1, -1, -119], [4, -1, 0, -1, 115], [2, -2, 0, 1, 107]];
    function moon(J) {
        const T = (J - 2451545) / 36525, T2 = T * T, T3 = T2 * T, T4 = T3 * T;
        const Lp = norm(218.3164477 + 481267.88123421 * T - 0.0015786 * T2 + T3 / 538841 - T4 / 65194000);
        const D = norm(297.8501921 + 445267.1114034 * T - 0.0018819 * T2 + T3 / 545868 - T4 / 113065000);
        const M = norm(357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000);
        const Mp = norm(134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + T3 / 69699 - T4 / 14712000);
        const F = norm(93.2720950 + 483202.0175233 * T - 0.0036539 * T2 - T3 / 3526000 + T4 / 863310000);
        const A1 = 119.75 + 131.849 * T, A2 = 53.09 + 479264.290 * T, A3 = 313.45 + 481266.484 * T, E = 1 - 0.002516 * T - 0.0000074 * T2;
        let sl = 0, sr = 0, sb = 0;
        for (const [d, m, mp, f, l, r] of TA) {
            const arg = d * D + m * M + mp * Mp + f * F, e = m === 0 ? 1 : (m === 1 || m === -1) ? E : E * E;
            sl += l * e * sin(arg); sr += r * e * cos(arg);
        }
        for (const [d, m, mp, f, b] of TB) { const e = m === 0 ? 1 : (m === 1 || m === -1) ? E : E * E; sb += b * e * sin(d * D + m * M + mp * Mp + f * F); }
        sl += 3958 * sin(A1) + 1962 * sin(Lp - F) + 318 * sin(A2);
        sb += -2235 * sin(Lp) + 382 * sin(A3) + 175 * sin(A1 - F) + 175 * sin(A1 + F) + 127 * sin(Lp - Mp) - 115 * sin(Lp + Mp);
        const n = nutation(T), lon = norm(Lp + sl / 1e6 + n.dpsi), lat = sb / 1e6;
        return {lon, lat, dist: 385000.56 + sr / 1000, ...toEq(lon, lat, n.eps)};
    }

    /* ─────────── ch. 12 : temps sidéral (apparent, en degrés) ─────────── */
    function sidereal(jdUT) {
        const T = (jdUT - 2451545) / 36525, n = nutation(T);
        return norm(280.46061837 + 360.98564736629 * (jdUT - 2451545) + 0.000387933 * T * T - T ** 3 / 38710000 + n.dpsi * cos(n.eps));
    }

    /* ─────────── ch. 40 : vu du lieu (vecteurs équatoriaux, km) ─────────── */
    const vecOf = p => [p.dist * cos(p.dec) * cos(p.ra), p.dist * cos(p.dec) * sin(p.ra), p.dist * sin(p.dec)];
    function observer(lat, lst) {
        const u = Math.atan(0.99664719 * Math.tan(lat * R)), rc = Math.cos(u), rs = 0.99664719 * Math.sin(u);
        return [RE * rc * cos(lst), RE * rc * sin(lst), RE * rs];
    }
    function topoOf(v, lat, lst, radius) {
        const o = observer(lat, lst), x = v[0] - o[0], y = v[1] - o[1], z = v[2] - o[2], dist = Math.hypot(x, y, z);
        const ra = norm(atan2D(y, x)), dec = asinD(z / dist), H = lst - ra;
        const alt = asinD(sin(lat) * sin(dec) + cos(lat) * cos(dec) * cos(H));
        const az = norm(atan2D(sin(H), cos(H) * sin(lat) - Math.tan(dec * R) * cos(lat)) + 180);
        return {alt, az, ra, dec, dist, vec: [x, y, z], radius: asinD(radius / dist)};
    }
    function topo(body, jdUT, lat, lon) {
        const p = body === 'moon' ? moon(jde(jdUT)) : sun(jde(jdUT));
        return topoOf(vecOf(p), lat, sidereal(jdUT) + lon, body === 'moon' ? R_MOON : R_SUN);
    }
    const angle = (a, b) => { const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; return atan2D(Math.hypot(...c), a[0] * b[0] + a[1] * b[1] + a[2] * b[2]); };

    /* ─────────── phases (ch. 48 pour la fraction éclairée) ─────────── */
    const elong = jdUT => { const J = jde(jdUT); return norm(moon(J).lon - sun(J).lon); };
    const wrap = d => ((d + 540) % 360) - 180;
    function phaseAt(jdUT, target, dir) { // l'instant où l'élongation vaut target, le plus proche dans la direction dir (+1 après, −1 avant)
        let t = jdUT + (dir > 0 ? norm(target - elong(jdUT)) : -norm(elong(jdUT) - target)) / 12.19;
        for (let i = 0; i < 8; i++) { const e = wrap(elong(t) - target), r = wrap(elong(t + 0.01) - elong(t - 0.01)) / 0.02; t -= e / r; if (Math.abs(e) < 1e-5) break; }
        if (dir > 0 && t < jdUT - 1e-6) return phaseAt(jdUT + 2, target, dir);
        if (dir < 0 && t > jdUT + 1e-6) return phaseAt(jdUT - 2, target, dir);
        return t;
    }
    const nextPhase = (jdUT, a) => phaseAt(jdUT, a, 1), prevPhase = (jdUT, a) => phaseAt(jdUT, a, -1);
    const PHASES = {new: 'nouvelle lune', wax1: 'premier croissant', first: 'premier quartier', wax2: 'gibbeuse croissante', full: 'pleine lune', wan2: 'gibbeuse décroissante', last: 'dernier quartier', wan1: 'dernier croissant'};
    function phase(jdUT) {
        const J = jde(jdUT), m = moon(J), s = sun(J), E = norm(m.lon - s.lon);
        const psi = Math.acos(cos(m.lat) * cos(m.lon - s.lon)) / R, i = atan2D(s.dist * sin(psi), m.dist - s.dist * cos(psi));
        const illumination = (1 + cos(i)) / 2 * 100;
        // les quatre phases principales : le jour (±12 h) où elles tombent
        const e0 = elong(jdUT - 0.5), e1 = elong(jdUT + 0.5);
        let key = '';
        for (const [a, k] of [[0, 'new'], [90, 'first'], [180, 'full'], [270, 'last']]) { if (wrap(e0 - a) <= 0 && wrap(e1 - a) > 0) key = k; }
        if (!key) key = E < 90 ? 'wax1' : E < 180 ? 'wax2' : E < 270 ? 'wan2' : 'wan1';
        const lastNew = prevPhase(jdUT, 0);
        return {key, name: PHASES[key], illumination, age: jdUT - lastNew, elongation: E, waxing: E < 180, lastNew};
    }

    /* ─────────── lever et coucher ─────────── */
    function riseSet(body, y, m, d, lat, lon, tz = 0) {
        const j0 = jd(y, m, d) - tz / 24, step = 10 / 1440;
        const h0 = (t, p) => (body === 'moon' ? -(0.5667 + p.radius) : -0.8333);
        const f = t => { const p = topo(body, t, lat, lon); return p.alt - h0(t, p); };
        const out = {rise: null, set: null};
        let a = f(j0);
        for (let t = j0; t < j0 + 1 - 1e-9; t += step) {
            const b = f(t + step);
            if ((a < 0) !== (b < 0)) {
                let lo = t, hi = t + step, fa = a;
                for (let k = 0; k < 12; k++) { const mid = (lo + hi) / 2, fm = f(mid); if ((fm < 0) === (fa < 0)) { lo = mid; fa = fm; } else hi = mid; }
                const key = a < 0 ? 'rise' : 'set'; if (out[key] == null) out[key] = (lo + hi) / 2;
            }
            a = b;
        }
        return out;
    }

    /* ─────────── ch. 49 + 54 : les éclipses ─────────── */
    function eclipseAt(k, solar) {
        const T = k / 1236.85, T2 = T * T, T3 = T2 * T, T4 = T3 * T;
        const JDE = 2451550.09766 + 29.530588861 * k + 0.00015437 * T2 - 0.00000015 * T3 + 0.00000000073 * T4;
        const M = 2.5534 + 29.10535670 * k - 0.0000014 * T2 - 0.00000011 * T3;
        const Mp = 201.5643 + 385.81693528 * k + 0.0107582 * T2 + 0.00001238 * T3 - 0.000000058 * T4;
        const F = 160.7108 + 390.67050284 * k - 0.0016118 * T2 - 0.00000227 * T3 + 0.000000011 * T4;
        const Om = 124.7746 - 1.56375588 * k + 0.0020672 * T2 + 0.00000215 * T3;
        if (Math.abs(sin(F)) > 0.36) return null;
        const E = 1 - 0.002516 * T - 0.0000074 * T2, F1 = F - 0.02665 * sin(Om), A1 = 299.77 + 0.107408 * k - 0.009173 * T2;
        const t = JDE + (solar ? -0.4075 * sin(Mp) + 0.1721 * E * sin(M) : -0.4065 * sin(Mp) + 0.1727 * E * sin(M))
            + 0.0161 * sin(2 * Mp) - 0.0097 * sin(2 * F1) + 0.0073 * E * sin(Mp - M) - 0.0050 * E * sin(Mp + M) - 0.0023 * sin(Mp - 2 * F1)
            + 0.0021 * E * sin(2 * M) + 0.0012 * sin(Mp + 2 * F1) + 0.0006 * E * sin(2 * Mp + M) - 0.0004 * sin(3 * Mp) - 0.0003 * E * sin(M + 2 * F1)
            + 0.0003 * sin(A1) - 0.0002 * E * sin(M - 2 * F1) - 0.0002 * E * sin(2 * Mp - M) - 0.0002 * sin(Om);
        const P = 0.2070 * E * sin(M) + 0.0024 * E * sin(2 * M) - 0.0392 * sin(Mp) + 0.0116 * sin(2 * Mp) - 0.0073 * E * sin(Mp + M) + 0.0067 * E * sin(Mp - M) + 0.0118 * sin(2 * F1);
        const Q = 5.2207 - 0.0048 * E * cos(M) + 0.0020 * E * cos(2 * M) - 0.3299 * cos(Mp) - 0.0060 * E * cos(Mp + M) + 0.0041 * E * cos(Mp - M);
        const W = Math.abs(cos(F1)), gamma = (P * cos(F1) + Q * sin(F1)) * (1 - 0.0048 * W);
        const u = 0.0059 + 0.0046 * E * cos(M) - 0.0182 * cos(Mp) + 0.0004 * cos(2 * Mp) - 0.0005 * cos(M + Mp);
        const g = Math.abs(gamma), jdUT = t - deltaT(yearOf(t)) / 86400, c = fromJd(jdUT);
        const id = `${solar ? 's' : 'l'}${c.y}-${String(c.m).padStart(2, '0')}-${String(c.d).padStart(2, '0')}`;
        if (solar) {
            if (g > 1.5433 + u) return null;
            let type;
            if (g < 0.9972) type = u < 0 ? 'total' : u > 0.0047 ? 'annular' : u < 0.00464 * Math.sqrt(1 - gamma * gamma) ? 'hybrid' : 'annular';
            else type = g < 0.9972 + Math.abs(u) ? (u < 0 ? 'total' : 'annular') : 'partial';
            const mag = type === 'partial' ? (1.5433 + u - g) / (0.5461 + 2 * u) : null;
            return {kind: 'solar', id, jd: jdUT, jde: t, type, gamma, u, mag, central: g < 0.9972};
        }
        const magPen = (1.5573 + u - g) / 0.5450, magUmb = (1.0128 - u - g) / 0.5450;
        if (magPen <= 0) return null;
        const n = 0.5458 + 0.0400 * cos(Mp), semi = x => (x > g ? 60 / n * Math.sqrt(x * x - gamma * gamma) / 1440 : 0);
        const sp = semi(1.5573 + u), su = semi(1.0128 - u), st = semi(0.4678 - u);
        const type = magUmb >= 1 ? 'total' : magUmb > 0 ? 'partial' : 'penumbral';
        const ct = {p1: jdUT - sp, p4: jdUT + sp}; if (su) { ct.u1 = jdUT - su; ct.u4 = jdUT + su; } if (st) { ct.u2 = jdUT - st; ct.u3 = jdUT + st; }
        return {kind: 'lunar', id, jd: jdUT, jde: t, type, gamma, u, magPen, magUmb, contacts: ct};
    }
    function eclipses(y1, y2, solar) {
        const out = [], k0 = Math.floor((y1 - 2000) * 12.3685) - 1, k1 = Math.ceil((y2 + 1 - 2000) * 12.3685) + 1;
        for (let k = k0; k <= k1; k++) {
            const e = eclipseAt(solar ? k : k + 0.5, solar); if (!e) continue;
            const y = fromJd(e.jd).y; if (y >= y1 && y <= y2) out.push(e);
        }
        return out;
    }
    const solarEclipses = (y1, y2 = y1) => eclipses(y1, y2, true), lunarEclipses = (y1, y2 = y1) => eclipses(y1, y2, false);

    /* la course du Soleil et de la Lune autour d'une éclipse : positions géocentriques tous les 10 min, interpolées ensuite
       (partagées par tous les lieux : un lieu de plus ne coûte presque rien) */
    const tracks = new Map();
    function track(e) {
        if (tracks.has(e.id)) return tracks.get(e.id);
        const t0 = e.jd - 4 / 24, step = 10 / 1440, n = 49, ms = [], ss = [];
        for (let i = 0; i < n; i++) { const J = jde(t0 + i * step); ms.push(vecOf(moon(J))); ss.push(vecOf(sun(J))); }
        const at = (arr, t) => { const x = Math.max(0, Math.min(n - 1.000001, (t - t0) / step)), i = Math.floor(x), f = x - i, a = arr[i], b = arr[i + 1]; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]; };
        const tr = {t0, t1: t0 + (n - 1) * step, moon: t => at(ms, t), sun: t => at(ss, t)};
        if (tracks.size > 400) tracks.clear();
        tracks.set(e.id, tr); return tr;
    }
    /** la part du disque du Soleil cachée par la Lune (rayons rs, rm, distance des centres d, en degrés) */
    function obscuration(rs, rm, d) {
        if (d >= rs + rm) return 0;
        if (d <= Math.abs(rm - rs)) return rm >= rs ? 1 : (rm / rs) ** 2;
        const a = Math.acos(Math.max(-1, Math.min(1, (d * d + rs * rs - rm * rm) / (2 * d * rs)))), b = Math.acos(Math.max(-1, Math.min(1, (d * d + rm * rm - rs * rs) / (2 * d * rm))));
        const area = rs * rs * a + rm * rm * b - 0.5 * Math.sqrt(Math.max(0, (-d + rs + rm) * (d + rs - rm) * (d - rs + rm) * (d + rs + rm)));
        return area / (Math.PI * rs * rs);
    }
    /** une éclipse de Soleil vue d'un lieu : séparation topocentrique des centres minute par minute (Soleil levé) */
    function solarAt(e, lat, lon) {
        if (!e || e.kind !== 'solar') return null;
        const tr = track(e), st = j => {
            const lst = sidereal(j) + lon, m = topoOf(tr.moon(j), lat, lst, R_MOON), s = topoOf(tr.sun(j), lat, lst, R_SUN), d = angle(m.vec, s.vec);
            return {j, d, rm: m.radius, rs: s.radius, alt: s.alt, f: d - (m.radius + s.radius), g: d - Math.abs(m.radius - s.radius)};
        };
        // un premier tour tous les 15 min : la Lune ne passe pas devant le Soleil vu d'ici (ou le Soleil est couché) → rien
        let a = null, b = null;
        for (let j = tr.t0; j <= tr.t1 + 1e-9; j += 15 / 1440) { const p = st(j); if (p.f < 0.3 && p.alt > -3) { if (a == null) a = j; b = j; } }
        if (a == null) return null;
        const pts = []; for (let j = Math.max(tr.t0, a - 15 / 1440); j <= Math.min(tr.t1, b + 15 / 1440) + 1e-9; j += 1 / 1440) pts.push(st(j));
        const magOf = p => (p.rs + p.rm - p.d) / (2 * p.rs);
        let best = null;
        for (const p of pts) { if (p.f < 0 && p.alt > -0.8333 && (!best || magOf(p) > magOf(best))) best = p; }
        if (!best) return null;
        // affiner le maximum à la seconde près (si le Soleil n'est pas au bord de l'horizon)
        let lo = best.j - 1 / 1440, hi = best.j + 1 / 1440;
        for (let i = 0; i < 20; i++) { const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3, pa = st(a), pb = st(b); if (magOf(pa) < magOf(pb)) lo = a; else hi = b; }
        const ref = st((lo + hi) / 2); if (ref.alt > -0.8333 && magOf(ref) >= magOf(best)) best = ref;
        const cross = key => { const out = []; for (let i = 1; i < pts.length; i++) { const a = pts[i - 1][key], b = pts[i][key]; if ((a < 0) !== (b < 0)) out.push(pts[i - 1].j + (pts[i].j - pts[i - 1].j) * a / (a - b)); } return out; };
        const c14 = cross('f'), c23 = cross('g'), sunUp = j => st(j).alt > -0.8333;
        const c1 = c14.find(j => j < best.j) ?? null, c4 = [...c14].reverse().find(j => j > best.j) ?? null;
        const c2 = c23.find(j => j < best.j && (c1 == null || j > c1)) ?? null, c3 = [...c23].reverse().find(j => j > best.j && (c4 == null || j < c4)) ?? null;
        const central = best.g < 0, type = central ? (best.rm > best.rs ? 'total' : 'annular') : 'partial';
        const centralSeen = central && sunUp(best.j);
        return {jd: best.j, mag: magOf(best), obscuration: obscuration(best.rs, best.rm, best.d) * 100, type: centralSeen ? type : 'partial', sunAlt: best.alt,
            c1, c2: centralSeen ? c2 : null, c3: centralSeen ? c3 : null, c4, c1Up: c1 != null && sunUp(c1), c4Up: c4 != null && sunUp(c4),
            duration: centralSeen && c2 != null && c3 != null ? (c3 - c2) * 86400 : 0};
    }
    /** une éclipse de Lune vue d'un lieu : la Lune est-elle levée pendant la pénombre, l'ombre, la totalité ? */
    function lunarAt(e, lat, lon) {
        if (!e || e.kind !== 'lunar') return null;
        const c = e.contacts, tr = track(e), up = j => { const m = topoOf(tr.moon(j), lat, sidereal(j) + lon, R_MOON); return m.alt > -(0.5667 + m.radius); };
        const seen = (a, b) => {
            if (a == null || b == null) return null;
            let first = null, last = null; const n = Math.max(1, Math.ceil((b - a) * 720)), h = (b - a) / n; // tous les 2 min environ
            for (let i = 0; i <= n; i++) { const j = a + i * h; if (up(j)) { if (first == null) first = j; last = j; } }
            if (first == null) return null;
            const edge = (lo, hi) => { const ulo = up(lo); for (let k = 0; k < 10; k++) { const mid = (lo + hi) / 2; if (up(mid) === ulo) lo = mid; else hi = mid; } return (lo + hi) / 2; };
            if (first > a) first = edge(first - h, first); if (last < b) last = edge(last, last + h);
            return {from: first, to: last};
        };
        const pen = seen(c.p1, c.p4); if (!pen) return null;
        const umb = seen(c.u1, c.u4), tot = seen(c.u2, c.u3), mx = topo('moon', e.jd, lat, lon), sunAlt = topo('sun', e.jd, lat, lon).alt;
        const seenType = tot ? 'total' : umb ? 'partial' : 'penumbral';
        return {type: seenType, penumbral: pen, umbral: umb, total: tot, maxVisible: mx.alt > -(0.5667 + mx.radius), moonAlt: mx.alt, sunAlt,
            mag: seenType === 'penumbral' ? e.magPen : e.magUmb};
    }

    /* ─────────── l'heure du lieu ─────────── */
    const lastSunday = (y, m) => { const j = jd(y, m + 1, 1) - 1; const dow = (Math.floor(j + 1.5)) % 7; return j - dow; }; // jd (0 h) du dernier dimanche du mois
    const inFrance = (lat, lon, country) => (country ? /france|^fr$/i.test(String(country)) : lat > 41 && lat < 51.3 && lon > -5.3 && lon < 9.7);
    function legalOffset(jdUT, lat, lon, country = '') {
        const solar = {h: lon / 15, legal: false};
        if (!inFrance(lat, lon, country)) return solar;
        const c = fromJd(jdUT), y = c.y, md = c.m * 100 + c.d;
        if (jdUT < jd(1891, 3, 15)) return solar; // l'heure solaire de chaque ville
        if (jdUT < jd(1911, 3, 11)) return {h: 9.35 / 60, legal: true}; // l'heure de Paris
        if (jdUT < jd(1940, 6, 14)) return {h: y >= 1916 && md >= 415 && md < 1005 ? 1 : 0, legal: true}; // GMT, heure d'été ≈ mi-avril → début octobre
        if (jdUT < jd(1945, 9, 16)) return {h: md >= 401 && md < 1005 ? 2 : 1, legal: true}; // heure allemande, puis la Libération
        if (y < 1976) return {h: 1, legal: true};
        const start = lastSunday(y, 3) + 1 / 24, end = y < 1996 ? lastSunday(y, 9) + 1 / 24 : lastSunday(y, 10) + 1 / 24;
        return {h: jdUT >= start && jdUT < end ? 2 : 1, legal: true};
    }
    /** « 11 h 02 » à l'heure du lieu */
    function localClock(jdUT, lat, lon, country = '') {
        const o = legalOffset(jdUT, lat, lon, country), c = fromJd(jdUT + o.h / 24);
        return {...c, text: `${c.hour} h ${String(c.min).padStart(2, '0')}`, legal: o.legal};
    }

    return {jd, fromJd, dayOf, deltaT, jde, nutation, sun, moon, sidereal, topo, phase, nextPhase, prevPhase, PHASES, riseSet,
        solarEclipses, lunarEclipses, eclipseAt, solarAt, lunarAt, obscuration, legalOffset, localClock, inFrance};
});
