/**
 * ✨ Trésors — 🌌 Le ciel de naissance (groupe Découvrir) : le ciel tel qu'il était au-dessus du lieu de naissance, la nuit de la
 * naissance — une image (PNG) à télécharger ou à garder dans les médias, et un petit bloc sur la fiche.
 * Les calculs (sans réseau) : les 100 étoiles les plus brillantes (positions J2000 ramenées à la date par la précession), les tracés
 * des constellations connues, la Lune (position et phase) et le Soleil (formules simplifiées), Vénus, Mars, Jupiter et Saturne
 * (éléments orbitaux moyens, valables de 1800 à 2050), l'heure du coucher et du lever du soleil. Précision : de l'ordre du degré,
 * largement assez pour une image ; l'heure de naissance est rarement connue, 22 h (heure solaire du lieu) par défaut.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const F = ext.tresorFeatures = ext.tresorFeatures || [];
    const A = () => window.LCNDA_APP;
    const R = Math.PI / 180, sin = d => Math.sin(d * R), cos = d => Math.cos(d * R), norm = d => ((d % 360) + 360) % 360;
    // [nom, ascension droite (heures), déclinaison (degrés), magnitude] — J2000
    const STARS = [['Sirius', 6.752, -16.716, -1.46], ['Canopus', 6.399, -52.696, -0.74], ['Arcturus', 14.261, 19.182, -0.05], ['Rigil Kentaurus', 14.66, -60.834, -0.27], ['Véga', 18.616, 38.784, 0.03], ['Capella', 5.278, 45.998, 0.08],
        ['Rigel', 5.242, -8.202, 0.13], ['Procyon', 7.655, 5.225, 0.34], ['Achernar', 1.629, -57.237, 0.46], ['Bételgeuse', 5.919, 7.407, 0.5], ['Hadar', 14.064, -60.373, 0.61], ['Altaïr', 19.846, 8.868, 0.76], ['Acrux', 12.443, -63.099, 0.76],
        ['Aldébaran', 4.599, 16.509, 0.86], ['Antarès', 16.49, -26.432, 0.96], ['Spica', 13.42, -11.161, 0.97], ['Pollux', 7.755, 28.026, 1.14], ['Fomalhaut', 22.961, -29.622, 1.16], ['Deneb', 20.69, 45.28, 1.25], ['Mimosa', 12.795, -59.689, 1.25],
        ['Régulus', 10.139, 11.967, 1.35], ['Adhara', 6.977, -28.972, 1.5], ['Castor', 7.577, 31.888, 1.58], ['Gacrux', 12.519, -57.113, 1.63], ['Shaula', 17.56, -37.104, 1.62], ['Bellatrix', 5.419, 6.35, 1.64], ['Elnath', 5.438, 28.608, 1.65],
        ['Alnilam', 5.604, -1.202, 1.69], ['Alnitak', 5.679, -1.943, 1.74], ['Mintaka', 5.533, -0.299, 2.23], ['Saïph', 5.796, -9.67, 2.09], ['Alioth', 12.9, 55.96, 1.77], ['Dubhe', 11.062, 61.751, 1.79], ['Merak', 11.031, 56.383, 2.37],
        ['Phecda', 11.897, 53.695, 2.44], ['Megrez', 12.257, 57.033, 3.31], ['Mizar', 13.399, 54.925, 2.23], ['Alkaid', 13.792, 49.313, 1.86], ['Mirfak', 3.405, 49.861, 1.79], ['Algol', 3.136, 40.956, 2.1], ['Polaris', 2.53, 89.264, 1.98],
        ['Kochab', 14.845, 74.156, 2.08], ['Pherkad', 15.346, 71.834, 3.0], ['Alphératz', 0.14, 29.091, 2.06], ['Mirach', 1.162, 35.621, 2.05], ['Almach', 2.065, 42.33, 2.1], ['Hamal', 2.12, 23.462, 2.0], ['Schedar', 0.675, 56.537, 2.24],
        ['Caph', 0.153, 59.15, 2.27], ['Navi', 0.945, 60.717, 2.47], ['Ruchbah', 1.43, 60.235, 2.68], ['Segin', 1.907, 63.67, 3.37], ['Markab', 23.079, 15.205, 2.49], ['Scheat', 23.063, 28.083, 2.42], ['Algenib', 0.22, 15.184, 2.83],
        ['Enif', 21.736, 9.875, 2.39], ['Sadr', 20.37, 40.257, 2.23], ['Gienah', 20.77, 33.97, 2.48], ['Albireo', 19.512, 27.96, 3.08], ['Fawaris', 19.75, 45.131, 2.87], ['Rasalhague', 17.582, 12.56, 2.08], ['Eltanin', 17.943, 51.489, 2.23],
        ['Denebola', 11.818, 14.572, 2.14], ['Algieba', 10.333, 19.842, 2.08], ['Zosma', 11.235, 20.524, 2.56], ['Chertan', 11.237, 15.43, 3.33], ['Ras Elased', 9.764, 23.774, 2.98], ['Alphard', 9.46, -8.659, 1.99], ['Menkalinan', 5.992, 44.948, 1.9],
        ['Alhena', 6.629, 16.399, 1.93], ['Mirzam', 6.378, -17.956, 1.98], ['Wezen', 7.14, -26.393, 1.83], ['Nunki', 18.921, -26.297, 2.05], ['Kaus Australis', 18.403, -34.385, 1.85], ['Sargas', 17.622, -42.998, 1.87], ['Dschubba', 16.006, -22.622, 2.29],
        ['Acrab', 16.091, -19.806, 2.62], ['Atria', 16.811, -69.028, 1.91], ['Peacock', 20.427, -56.735, 1.94], ['Alnair', 22.137, -46.961, 1.74], ['Avior', 8.375, -59.51, 1.86], ['Miaplacidus', 9.22, -69.717, 1.68], ['Menkar', 3.038, 4.09, 2.53],
        ['Diphda', 0.727, -17.987, 2.04], ['Zubenelgenubi', 14.848, -16.042, 2.75], ['Vindemiatrix', 13.036, 10.959, 2.83], ['Izar', 14.75, 27.074, 2.37], ['Alphecca', 15.578, 26.715, 2.23], ['Kornephoros', 16.504, 21.49, 2.78], ['Cor Caroli', 12.934, 38.318, 2.9],
        ['Alcyone', 3.791, 24.105, 2.87], ['Unukalhai', 15.738, 6.426, 2.65], ['Sabik', 17.173, -15.725, 2.43], ['Sheliak', 18.835, 33.363, 3.52], ['Sulafat', 18.982, 32.69, 3.25], ['Tarazed', 19.771, 10.613, 2.72], ['Alderamin', 21.31, 62.586, 2.45],
        ['Zubeneschamali', 15.283, -9.383, 2.61], ['Porrima', 12.694, -1.449, 2.74], ['Muphrid', 13.911, 18.398, 2.68], ['Seginus', 14.535, 38.308, 3.04]];
    // les tracés : [nom de la constellation, [[étoile, étoile], …]]
    const LINES = [['Grande Ourse', [['Dubhe', 'Merak'], ['Merak', 'Phecda'], ['Phecda', 'Megrez'], ['Megrez', 'Dubhe'], ['Megrez', 'Alioth'], ['Alioth', 'Mizar'], ['Mizar', 'Alkaid']]],
        ['Orion', [['Bételgeuse', 'Bellatrix'], ['Bellatrix', 'Mintaka'], ['Mintaka', 'Alnilam'], ['Alnilam', 'Alnitak'], ['Alnitak', 'Saïph'], ['Mintaka', 'Rigel'], ['Bételgeuse', 'Alnitak'], ['Saïph', 'Rigel']]],
        ['Cassiopée', [['Caph', 'Schedar'], ['Schedar', 'Navi'], ['Navi', 'Ruchbah'], ['Ruchbah', 'Segin']]], ['Cygne', [['Deneb', 'Sadr'], ['Sadr', 'Albireo'], ['Fawaris', 'Sadr'], ['Sadr', 'Gienah']]],
        ['Lion', [['Régulus', 'Algieba'], ['Algieba', 'Zosma'], ['Zosma', 'Denebola'], ['Denebola', 'Chertan'], ['Chertan', 'Régulus'], ['Algieba', 'Ras Elased']]], ['Pégase', [['Markab', 'Scheat'], ['Scheat', 'Alphératz'], ['Alphératz', 'Algenib'], ['Algenib', 'Markab'], ['Markab', 'Enif']]],
        ['Andromède', [['Alphératz', 'Mirach'], ['Mirach', 'Almach']]], ['Scorpion', [['Acrab', 'Dschubba'], ['Dschubba', 'Antarès'], ['Antarès', 'Shaula'], ['Shaula', 'Sargas']]], ['Croix du Sud', [['Acrux', 'Gacrux'], ['Mimosa', 'Acrux']]],
        ['Gémeaux', [['Castor', 'Pollux'], ['Pollux', 'Alhena']]], ['Bouvier', [['Arcturus', 'Izar'], ['Izar', 'Seginus'], ['Arcturus', 'Muphrid']]], ['Taureau', [['Aldébaran', 'Elnath'], ['Aldébaran', 'Alcyone']]], ['Persée', [['Mirfak', 'Algol']]],
        ['Petite Ourse', [['Polaris', 'Kochab'], ['Kochab', 'Pherkad']]], ['Lyre', [['Véga', 'Sheliak'], ['Sheliak', 'Sulafat'], ['Sulafat', 'Véga']]], ['Aigle', [['Altaïr', 'Tarazed']]], ['Cocher', [['Capella', 'Menkalinan'], ['Capella', 'Elnath']]],
        ['Grand Chien', [['Sirius', 'Mirzam'], ['Sirius', 'Wezen'], ['Wezen', 'Adhara']]], ['Vierge', [['Spica', 'Porrima'], ['Porrima', 'Vindemiatrix']]], ['Balance', [['Zubenelgenubi', 'Zubeneschamali']]], ['Sagittaire', [['Kaus Australis', 'Nunki']]]];
    // éléments orbitaux moyens (Standish, JPL) : a, e, I, L, ϖ, Ω à J2000 et leur variation par siècle
    const PLANETS = {Vénus: [[0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255], [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418], '#fff6d0', -4],
        Mars: [[1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891], [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343], '#ff9a6a', 0.5],
        Jupiter: [[5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909], [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106], '#ffe7b0', -2.2],
        Saturne: [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448], [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794], '#f3dfa0', 0.6]};
    const EARTH = [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0], [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0]];

    const jd = (y, m, d, ut) => { if (m <= 2) { y--; m += 12; } const a = Math.floor(y / 100), b = 2 - a + Math.floor(a / 4); return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + b - 1524.5 + ut / 24; };
    /** la précession (IAU 1976) : coordonnées J2000 → de la date (T : siècles depuis 2000) */
    function precess(ra, dec, T) {
        const z0 = 0.6406161 * T + 0.0000839 * T * T, z = 0.6406161 * T + 0.0003041 * T * T, th = 0.556753 * T - 0.0001185 * T * T;
        const a = cos(dec) * sin(ra + z0), b = cos(th) * cos(dec) * cos(ra + z0) - sin(th) * sin(dec), c = sin(th) * cos(dec) * cos(ra + z0) + cos(th) * sin(dec);
        return [norm(Math.atan2(a, b) / R + z), Math.asin(Math.max(-1, Math.min(1, c))) / R];
    }
    function helio([e0, r], T) {
        const [a, e, I, L, w, O] = e0.map((v, k) => v + r[k] * T), M = norm(L - w) * R, om = (w - O) * R; let E = M; for (let k = 0; k < 8; k++) E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
        const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E), cO = Math.cos(O * R), sO = Math.sin(O * R), cI = Math.cos(I * R), sI = Math.sin(I * R), cw = Math.cos(om), sw = Math.sin(om);
        return [(cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp, (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp, sw * sI * xp + cw * sI * yp];
    }
    const eqOf = ([x, y, z], eps = 23.4393) => { const Y = y * cos(eps) - z * sin(eps), Z = y * sin(eps) + z * cos(eps); return [norm(Math.atan2(Y, x) / R), Math.atan2(Z, Math.hypot(x, Y)) / R]; };
    function sunMoon(d) {
        const L = 280.46 + 0.9856474 * d, g = 357.528 + 0.9856003 * d, ls = norm(L + 1.915 * sin(g) + 0.02 * sin(2 * g)), eps = 23.439 - 0.0000004 * d;
        const Lm = 218.316 + 13.176396 * d, Mm = 134.963 + 13.064993 * d, Fm = 93.272 + 13.22935 * d, lm = norm(Lm + 6.289 * sin(Mm)), bm = 5.128 * sin(Fm);
        const toEq = (l, b) => eqOf([cos(b) * cos(l), cos(b) * sin(l), sin(b)], eps);
        return {sun: toEq(ls, 0), moon: toEq(lm, bm), elong: norm(lm - ls)};
    }
    const PHASES = ['nouvelle lune', 'premier croissant', 'premier quartier', 'lune gibbeuse croissante', 'pleine lune', 'lune gibbeuse décroissante', 'dernier quartier', 'dernier croissant', 'nouvelle lune'];
    const altaz = (ra, dec, lst, lat) => { const H = lst - ra, s = sin(lat) * sin(dec) + cos(lat) * cos(dec) * cos(H), alt = Math.asin(s) / R; return [alt, norm(Math.atan2(-cos(dec) * sin(H), sin(dec) * cos(lat) - cos(dec) * sin(lat) * cos(H)) / R)]; };
    /** le ciel d'un lieu à une date et une heure (solaire du lieu) → étoiles, planètes, lune, soleil, en hauteur et azimut */
    function sky({date, hour = 22, lat, lng}) {
        const [y, m, dd] = date.split('-').map(Number), ut = hour - lng / 15, J = jd(y, m, dd, ut), d = J - 2451545, T = d / 36525, lst = norm(280.46061837 + 360.98564736629 * d + 0.000387933 * T * T + lng);
        const stars = STARS.map(([n, ra, dec, mag]) => { const [a, de] = precess(ra * 15, dec, T), [alt, az] = altaz(a, de, lst, lat); return {n, mag, alt, az}; });
        const earth = helio(EARTH, T), planets = Object.entries(PLANETS).map(([n, [e0, r, col, mag]]) => { const p = helio([e0, r], T), [ra, dec] = eqOf([p[0] - earth[0], p[1] - earth[1], p[2] - earth[2]]), [a, de] = precess(ra, dec, T), [alt, az] = altaz(a, de, lst, lat); return {n, col, mag, alt, az}; });
        const sm = sunMoon(d), [salt, saz] = altaz(sm.sun[0], sm.sun[1], lst, lat), [malt, maz] = altaz(sm.moon[0], sm.moon[1], lst, lat);
        // le coucher (avant l'heure choisie) et le lever (après) du soleil, en heure solaire du lieu
        const sunAlt = h => { const dj = jd(y, m, dd, h - lng / 15) - 2451545, s = sunMoon(dj).sun, l = norm(280.46061837 + 360.98564736629 * dj + lng); return altaz(s[0], s[1], l, lat)[0]; };
        let set = null, rise = null; for (let h = 12; h < 24; h += 1 / 30) if (sunAlt(h) > -0.83 && sunAlt(h + 1 / 30) <= -0.83) { set = h; break; }
        for (let h = 0; h < 12; h += 1 / 30) if (sunAlt(h) < -0.83 && sunAlt(h + 1 / 30) >= -0.83) { rise = h; break; }
        return {stars, planets, sun: {alt: salt, az: saz}, moon: {alt: malt, az: maz, elong: sm.elong, lit: (1 - cos(sm.elong)) / 2, phase: PHASES[Math.round(sm.elong / 45)]}, set, rise, lst};
    }
    const hm = h => (h == null ? '' : `${Math.floor(h)} h ${String(Math.round((h % 1) * 60)).padStart(2, '0')}`.replace(/ 60$/, ' 59'));
    const THEMES = {nuit: {bg: ['#0b1a3a', '#020611'], star: '#ffffff', line: 'rgba(170,200,255,.35)', text: '#f2ead8', ring: 'rgba(255,255,255,.5)', paper: '#050b1c'},
        papier: {bg: ['#13213f', '#0a1328'], star: '#fffbe8', line: 'rgba(255,230,170,.3)', text: '#1f2a44', ring: '#c9a646', paper: '#f6f0e1'},
        or: {bg: ['#0d0d0d', '#000000'], star: '#f2d27a', line: 'rgba(242,210,122,.35)', text: '#f2d27a', ring: '#c9a646', paper: '#000000'},
        encre: {bg: ['#ffffff', '#f4f4f4'], star: '#111111', line: 'rgba(0,0,0,.35)', text: '#111111', ring: '#111111', paper: '#ffffff'},
        aube: {bg: ['#f7c9b8', '#5b6fa8'], star: '#ffffff', line: 'rgba(255,255,255,.45)', text: '#3b3a5a', ring: '#8c7aa8', paper: '#fbf3ee'},
        aquarelle: {bg: ['#9fc3e6', '#36507e'], star: '#ffffff', line: 'rgba(255,255,255,.4)', text: '#36507e', ring: '#7da1c9', paper: '#f5f8fb'},
        foret: {bg: ['#1f3a2c', '#0b1610'], star: '#f6efd6', line: 'rgba(246,239,214,.35)', text: '#f6efd6', ring: '#c9b77a', paper: '#132219'},
        bordeaux: {bg: ['#3a0f1c', '#14050a'], star: '#ffe9d0', line: 'rgba(255,233,208,.35)', text: '#ffe9d0', ring: '#d8a25a', paper: '#22080f'}};
    const SKY_FONTS = {georgia: 'Georgia', didot: '"Didot", "Bodoni MT", "Times New Roman"', script: '"Brush Script MT", "Segoe Script", "Apple Chancery", cursive', baton: '"Futura", "Century Gothic", "Trebuchet MS", sans-serif'};
    const SKY_FORMATS = {affiche: [1200, 1340, 'Affiche'], carre: [1200, 1200, 'Carré'], a4: [1200, 1697, 'A4 (portrait)']};
    /** dessine le ciel (image d'affiche) : {canvas} ; opts : names, lines, title, sub */
    function drawSky(cv, s, {theme = 'nuit', names = true, lines = true, title = '', sub = '', foot = '', shape = 'rond', font = 'georgia', grid = false, milky = false, frame = false} = {}) {
        const th = THEMES[theme] || THEMES.nuit, W = cv.width, H = cv.height, x = cv.getContext('2d'), k = W / 1200, fm = frame ? 50 * k : 0, rad = Math.min(W * 0.41 - fm / 2, (H - 330 * k - 2 * fm) / 2), cx = W / 2, cy = (H - (2 * rad + 300 * k)) / 2 + 60 * k + rad, FF = SKY_FONTS[font] || 'Georgia';
        x.fillStyle = th.paper; x.fillRect(0, 0, W, H);
        if (frame) { x.strokeStyle = th.ring; x.lineWidth = 4 * k; x.strokeRect(24 * k, 24 * k, W - 48 * k, H - 48 * k); x.lineWidth = 1.2 * k; x.strokeRect(36 * k, 36 * k, W - 72 * k, H - 72 * k); }
        /** la forme de la fenêtre sur le ciel : rond, carré aux coins doux, ou fenêtre en arc */
        const outline = (r = rad) => { x.beginPath(); if (shape === 'carre') { const a = r, q = 24 * k; x.roundRect ? x.roundRect(cx - a, cy - a, 2 * a, 2 * a, q) : x.rect(cx - a, cy - a, 2 * a, 2 * a); } else if (shape === 'arche') { x.moveTo(cx - r * 0.85, cy + r); x.lineTo(cx - r * 0.85, cy - r * 0.15); x.arc(cx, cy - r * 0.15, r * 0.85, Math.PI, 0); x.lineTo(cx + r * 0.85, cy + r); x.closePath(); } else x.arc(cx, cy, r, 0, 7); };
        const day = s.sun.alt > -6, g = x.createRadialGradient(cx, cy, rad * 0.1, cx, cy, rad * 1.4); g.addColorStop(0, day ? '#3f6aa8' : th.bg[0]); g.addColorStop(1, day ? '#1a3563' : th.bg[1]);
        x.save(); outline(); x.fillStyle = g; x.fill(); x.clip();
        if (milky) { x.save(); x.translate(cx, cy); x.rotate(((s.lst || 0) % 360) * R); const mg = x.createLinearGradient(0, -rad * 0.25, 0, rad * 0.25); mg.addColorStop(0, 'rgba(255,255,255,0)'); mg.addColorStop(0.5, 'rgba(255,255,255,.13)'); mg.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = mg; x.fillRect(-rad * 1.5, -rad * 0.25, rad * 3, rad * 0.5); x.restore(); }
        if (grid) { x.strokeStyle = th.line; x.globalAlpha = 0.5; x.lineWidth = 0.8 * k; [30, 60].forEach(a => { const r = rad * Math.tan((90 - a) * R / 2); x.beginPath(); x.arc(cx, cy, r, 0, 7); x.stroke(); }); for (let a = 0; a < 360; a += 30) { x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx - rad * sin(a), cy - rad * cos(a)); x.stroke(); } x.globalAlpha = 1; }
        const pos = (alt, az) => { const r = rad * Math.tan((90 - alt) * R / 2); return [cx - r * sin(az), cy - r * cos(az)]; };
        const byName = new Map(s.stars.map(st => [st.n, st]));
        if (lines) { x.strokeStyle = th.line; x.lineWidth = 1.6 * k; x.font = `${15 * k}px Georgia`; x.fillStyle = th.line;
            LINES.forEach(([cn, segs]) => { const pts = []; segs.forEach(([a, b]) => { const A1 = byName.get(a), B1 = byName.get(b); if (!A1 || !B1 || A1.alt < 0 || B1.alt < 0) return; const p = pos(A1.alt, A1.az), q = pos(B1.alt, B1.az); x.beginPath(); x.moveTo(...p); x.lineTo(...q); x.stroke(); pts.push(p, q); });
                if (names && pts.length > 2) { const mx = pts.reduce((n, p) => n + p[0], 0) / pts.length, my = pts.reduce((n, p) => n + p[1], 0) / pts.length; x.globalAlpha = 0.9; x.fillText(cn.toUpperCase(), mx + 8 * k, my + 26 * k); x.globalAlpha = 1; } }); }
        s.stars.filter(st => st.alt > 0).forEach(st => { const [px, py] = pos(st.alt, st.az), r = Math.max(1.1, 4.6 - 1.05 * st.mag) * k; x.fillStyle = th.star; x.shadowColor = th.star; x.shadowBlur = 6 * k; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill(); x.shadowBlur = 0;
            if (names && st.mag < 1.3) { x.fillStyle = th.star; x.globalAlpha = 0.8; x.font = `${14 * k}px system-ui`; x.fillText(st.n, px + r + 4 * k, py - r); x.globalAlpha = 1; } });
        s.planets.filter(p => p.alt > 0).forEach(p => { const [px, py] = pos(p.alt, p.az), r = Math.max(2.5, 5 - 0.6 * p.mag) * k; x.fillStyle = p.col; x.shadowColor = p.col; x.shadowBlur = 10 * k; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill(); x.shadowBlur = 0; x.font = `italic ${16 * k}px Georgia`; x.fillText(p.n, px + r + 5 * k, py + 5 * k); });
        if (s.moon.alt > -1) { const [mx, my] = pos(Math.max(0.5, s.moon.alt), s.moon.az), mr = 20 * k, c = cos(s.moon.elong), waxing = s.moon.elong < 180;
            x.fillStyle = 'rgba(40,45,60,.9)'; x.beginPath(); x.arc(mx, my, mr, 0, 7); x.fill(); x.fillStyle = '#f4f1e6'; x.shadowColor = '#fff'; x.shadowBlur = 14 * k; x.beginPath();
            x.arc(mx, my, mr, -Math.PI / 2, Math.PI / 2, !waxing); x.ellipse(mx, my, Math.abs(mr * c), mr, 0, Math.PI / 2, -Math.PI / 2, waxing ? c > 0 : c <= 0); x.fill(); x.shadowBlur = 0; }
        x.restore();
        x.strokeStyle = th.ring; x.lineWidth = 3 * k; outline(); x.stroke(); x.lineWidth = 1 * k; outline(rad + 10 * k); x.stroke();
        x.fillStyle = th.ring; x.font = `bold ${22 * k}px ${FF}`; x.textAlign = 'center'; [['N', 0], ['E', 90], ['S', 180], ['O', 270]].forEach(([l, az]) => { const r = rad + 34 * k; x.fillText(l, cx - r * sin(az), cy - r * cos(az) + 8 * k); });
        x.fillStyle = th.text; x.font = `${font === 'baton' ? '' : 'italic '}${54 * k}px ${FF}`; x.fillText(title, cx, cy + rad + 120 * k); x.font = `${26 * k}px ${FF}`; x.fillText(sub, cx, cy + rad + 170 * k);
        x.globalAlpha = 0.75; x.font = `${19 * k}px ${FF}`; x.fillText(foot, cx, cy + rad + 215 * k); x.globalAlpha = 1; x.textAlign = 'left';
        return cv;
    }
    /** la naissance de quelqu'un : la date, le lieu (placé sur la carte) et ce qui manque */
    function birthOf(T, tr, p) {
        if (!p?.by) return null; const pl = p.bplace && tr.places[p.bplace], ok = pl && pl.lat != null && pl.lng != null;
        return {date: p.bd || `${p.by}-07-01`, exact: !!p.bd, lat: ok ? pl.lat : 48.857, lng: ok ? pl.lng : 2.352, place: ok ? pl.name : (pl?.name ? `${pl.name} (pas placé sur la carte : ciel de Paris)` : 'Paris (lieu inconnu)'), placed: ok};
    }
    function caption(T, p, b, s, hour) {
        const vis = s.planets.filter(x => x.alt > 0).map(x => x.n), day = s.sun.alt > -6;
        return {title: T.name(p), sub: `${b.place.replace(/ \(.*$/, '')} — ${b.exact ? 'le ' : 'en '}${b.exact ? T.dateFr(b.date) : b.date.slice(0, 4)}, vers ${hm(hour)}`,
            foot: `${s.moon.phase}${s.moon.alt > 0 ? '' : ' (sous l’horizon)'}${vis.length ? ` · ${vis.join(', ')} ${vis.length > 1 ? 'brillaient' : 'brillait'}` : ''}${day ? ' · il faisait jour : voici les étoiles cachées par le soleil' : ''}`};
    }
    async function renderSky(host, T) {
        const tr = await T.tree(), st = T.start(tr), pend = ext.tresorSky.pending; ext.tresorSky.pending = null;
        const first = pend || (tr.byId.get(st?.id)?.by ? st.id : tr.people.find(p => p.by)?.id);
        host.innerHTML = `<div class="h-tr-split"><form class="h-tr-panel" data-sk><div><span class="pk-lab">La naissance de</span>${T.personField('who', first)}</div>
            <label>Vers quelle heure (heure solaire du lieu)<input name="h" value="22:00" data-ui-time></label>
            <label>Le style<select name="th"><option value="nuit">Nuit bleue</option><option value="papier">Affiche (fond crème)</option><option value="or">Noir et or</option><option value="encre">Encre sur papier (à imprimer)</option><option value="aube">Aube (rose et bleu)</option><option value="aquarelle">Aquarelle</option><option value="foret">Vert forêt</option><option value="bordeaux">Bordeaux et or</option></select></label>
            <label>La forme<select name="shape"><option value="rond">Ronde</option><option value="carre">Carrée</option><option value="arche">Fenêtre en arc</option></select></label>
            <label>Le format<select name="fmt">${Object.entries(SKY_FORMATS).map(([k, [, , l]]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
            <label>L’écriture<select name="font"><option value="georgia">Classique</option><option value="didot">Élégante</option><option value="script">À la plume</option><option value="baton">Bâton</option></select></label>
            <label class="checkbox-line"><input type="checkbox" name="lines" checked> Les constellations</label><label class="checkbox-line"><input type="checkbox" name="names" checked> Les noms</label>
            <label class="checkbox-line"><input type="checkbox" name="milky"> La Voie lactée (évocation)</label><label class="checkbox-line"><input type="checkbox" name="grid"> Les repères (hauteur, directions)</label><label class="checkbox-line"><input type="checkbox" name="frame"> Un cadre</label>
            <details><summary>✏️ Les textes</summary><label>Titre<input name="tt" placeholder="(le nom)"></label><label>Sous-titre<input name="ts" placeholder="(le lieu et la date)"></label><label>Dernière ligne<input name="tf" placeholder="(la lune, les planètes)"></label></details>
            <div data-sk-info class="h-tr-muted"></div></form>
            <div class="h-tr-view"><canvas class="h-tr-canvas" data-sk-c width="1200" height="1340" style="max-width:min(520px, 100%)"></canvas></div></div>`;
        const form = host.querySelector('[data-sk]'), cv = host.querySelector('[data-sk-c]'), info = host.querySelector('[data-sk-info]');
        let cur = null;
        const draw = () => {
            const p = tr.byId.get(Number(form.elements.who.value)), b = birthOf(T, tr, p);
            if (!b) { info.textContent = 'Il faut au moins l’année de naissance.'; cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); cur = null; return; }
            const [hh, mm] = (form.elements.h.value || '22:00').split(':').map(Number), hour = hh + (mm || 0) / 60, s = sky({date: b.date, hour, lat: b.lat, lng: b.lng}), c = caption(T, p, b, s, hour), e = form.elements;
            const [fw, fh] = SKY_FORMATS[e.fmt.value] || SKY_FORMATS.affiche; if (cv.width !== fw || cv.height !== fh) { cv.width = fw; cv.height = fh; }
            drawSky(cv, s, {theme: e.th.value, names: e.names.checked, lines: e.lines.checked, shape: e.shape.value, font: e.font.value, milky: e.milky.checked, grid: e.grid.checked, frame: e.frame.checked, title: e.tt.value.trim() || c.title, sub: e.ts.value.trim() || c.sub, foot: e.tf.value.trim() || c.foot}); cur = {p, b, s};
            const up = s.stars.filter(x => x.alt > 0).length;
            info.innerHTML = `${b.exact ? '' : '⚠️ Date exacte inconnue : ciel du 1er juillet. '}${b.placed ? '' : '⚠️ Lieu non placé sur la carte. '}<br>🌙 ${T.esc(s.moon.phase)} (${Math.round(s.moon.lit * 100)} % éclairée)${s.moon.alt > 0 ? '' : ', sous l’horizon'}<br>🌇 coucher du soleil vers ${hm(s.set) || '—'} · 🌅 lever vers ${hm(s.rise) || '—'}<br>✨ ${up} étoiles brillantes au-dessus de l’horizon${s.planets.filter(x => x.alt > 0).length ? ` · 🪐 ${s.planets.filter(x => x.alt > 0).map(x => x.n).join(', ')}` : ''}`;
            cv.dataset.moon = s.moon.phase;
        };
        form.addEventListener('change', draw); form.addEventListener('input', e => { if (['h', 'tt', 'ts', 'tf'].includes(e.target.name)) draw(); });
        const fname = () => `ciel-de-naissance-${(cur?.p?.first || 'x').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-')}.png`;
        T.actions(host, {exports: [{icon: '🖼', label: 'Image PNG', name: fname, make: () => (cur ? T.canvasPng(cv) : null)}],
            layout: () => cur && T.toLayout(`Le ciel de naissance de ${T.name(cur.p)}`, cv.toDataURL('image/png'), {w: 210, h: Math.round(210 * cv.height / cv.width)}),
            media: {title: () => `Le ciel de naissance de ${T.name(cur?.p)}`, person: () => cur?.p?.id, help: 'Aussi rangée sur sa fiche', make: async () => (cur ? {blob: await T.canvasPng(cv), name: fname()} : null)}});
        draw();
    }
    F.push({key: 'ciel', group: 'decouvrir', icon: '🌌', title: 'Le ciel de naissance', desc: 'Les étoiles, la Lune et les planètes au-dessus du village, la nuit de la naissance : une image à garder ou à offrir.', render: renderSky});
    ext.tresorSky = {sky, drawSky, birthOf, caption, pending: null};

    /* le bloc de la fiche : une petite image du ciel, « Agrandir » ouvre la page */
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks.birth_sky = (index, detail) => {
        const pid = Number(detail?.person?.id); if (!pid || detail.person.kind === 'animal') return '';
        return A().card(index, '🌌 Le ciel de sa naissance', '', `<div class="h-tr-skyblock" data-sky-block="${pid}"><canvas width="600" height="670"></canvas><p class="muted" data-sky-txt></p></div>`, 'span-6', `<button type="button" class="button small secondary" data-sky-big="${pid}">Agrandir</button>`);
    };
    ext.afterPerson = ext.afterPerson || [];
    ext.afterPerson.push(async detail => {
        const pid = Number(detail?.person?.id), el = document.querySelector(`#workspace [data-sky-block="${pid}"]`); if (!el || !ext.tresors) return;
        const T = ext.tresors.T, tr = await T.tree().catch(() => null), p = tr?.byId.get(pid), b = birthOf(T, tr, p);
        if (!b) { el.innerHTML = '<p class="muted">Il faut au moins l’année de naissance pour voir le ciel.</p>'; return; }
        const s = sky({date: b.date, hour: 22, lat: b.lat, lng: b.lng}); drawSky(el.querySelector('canvas'), s, caption(T, p, b, s, 22));
        el.querySelector('[data-sky-txt]').textContent = `${s.moon.phase}${s.planets.some(x => x.alt > 0) ? ' · ' + s.planets.filter(x => x.alt > 0).map(x => x.n).join(', ') : ''}${b.exact ? '' : ' · date exacte inconnue'}`;
    });
    document.addEventListener('click', e => { const b = e.target.closest('[data-sky-big]'); if (b) { ext.tresorSky.pending = Number(b.dataset.skyBig); ext.tresors?.open('ciel'); } });
})();
