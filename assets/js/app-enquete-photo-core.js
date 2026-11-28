/* LCNDA — 🔎 Enquête photo : les calculs, sans page et sans Internet (maquette validée docs/design/enquete-photo.html).
 * window.LCNDA_EP_CORE (aussi require() dans Node : tests/test-enquete-photo.js). Affiché par assets/js/heritage-enquete-photo*.js.
 *
 *  ☀️ Ombres (§ 5 bis) — position du Soleil par les formules usuelles (déclinaison de Spencer, angle horaire) en HEURE DU SOLEIL :
 *     declination(jour de l'année) en degrés ; sunAlt(lat, décl, heure) ; sunAz(lat, décl, heure) (0 = nord, 90 = est) ;
 *     elevationFrom(longueur de l'objet, longueur de l'ombre) ; shadowMonths(lat, hauteur, tolérance) → ce qui est possible mois par mois ;
 *     shadowOnDate(lat, hauteur, mois, jour) → heures du matin / de l'après-midi, azimut du Soleil ; facing(azimut, sens de l'ombre).
 *     Une ombre ne prouve jamais un lieu ou une date : au mieux « Probable » avec d'autres indices ; elle sait surtout réfuter.
 *  🏷 EXIF (§ 7 bis) — readExif(ArrayBuffer) → {date, make, model, lat, lon} lus dans le fichier JPEG, sur l'ordinateur.
 *  📏 Frise (§ 7 bis) — dateWindow(indices) → {from, to, conflict, steps} : chaque indice réduit la fenêtre (« pas avant 1904 »).
 *  ⚖ Hypothèses — hypScore(hypothèse, indices) ; ❓ missing(enquête) ; ⏱ tenMinutes(enquête) ; 📍 km(a, b) ; ↑ bump(certitude).
 * Aucun nom, aucune donnée : seulement des nombres et des textes faits ici.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.LCNDA_EP_CORE = api;
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';
    const RAD = Math.PI / 180;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const doy = (m, d) => MONTH_DAYS.slice(0, m - 1).reduce((s, x) => s + x, 0) + d; // année ordinaire (assez juste pour les ombres)

    /* ═════════ ☀️ le Soleil ═════════ */
    /** déclinaison du Soleil (degrés) — série de Spencer (1971), à ±0,05° près */
    function declination(dayOfYear, hour = 12) {
        const g = 2 * Math.PI / 365 * (dayOfYear - 1 + (hour - 12) / 24);
        return (0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g)
            - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g)) / RAD;
    }
    /** hauteur du Soleil (degrés) à l'heure du soleil t (12 = midi vrai) */
    function sunAlt(lat, dec, t) {
        const H = 15 * (t - 12) * RAD, p = lat * RAD, d = dec * RAD;
        return Math.asin(clamp(Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(H), -1, 1)) / RAD;
    }
    /** azimut du Soleil (degrés, 0 = nord, 90 = est, 180 = sud) */
    function sunAz(lat, dec, t) {
        const H = 15 * (t - 12) * RAD, p = lat * RAD, d = dec * RAD;
        return (Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(p) - Math.tan(d) * Math.cos(p)) / RAD + 180 + 360) % 360;
    }
    /** hauteur du Soleil d'après un objet droit et son ombre (mêmes unités) : tan(h) = objet / ombre */
    function elevationFrom(objectLen, shadowLen) {
        const o = Number(objectLen), s = Number(shadowLen);
        if (!(o > 0) || !(s > 0)) return null;
        return Math.atan(o / s) / RAD;
    }
    /** midi vrai : la plus grande hauteur du jour */
    const noonAlt = (lat, dec) => 90 - Math.abs(lat - dec);
    /** les heures (du soleil) où la hauteur est dans [h − tol, h + tol], par pas de 5 min → intervalles [[début, fin], …] */
    function windows(lat, dec, h, tol) {
        const out = []; let cur = null;
        for (let m = 0; m <= 24 * 60; m += 5) {
            const t = m / 60, a = sunAlt(lat, dec, t), ok = a > 0 && Math.abs(a - h) <= tol;
            if (ok && !cur) cur = [t, t]; else if (ok) cur[1] = t; else if (cur) { out.push(cur); cur = null; }
        }
        if (cur) out.push(cur);
        return out;
    }
    function merge(rs) {
        const v = rs.slice().sort((a, b) => a[0] - b[0]), out = [];
        v.forEach(r => { const l = out[out.length - 1]; if (l && r[0] <= l[1] + 0.09) l[1] = Math.max(l[1], r[1]); else out.push(r.slice()); });
        return out;
    }
    /**
     * Ce que dit une hauteur de Soleil à une latitude, mois par mois (le 1er, le 15 et le dernier jour pour « impossible »).
     * → {months: [{m, possible, maxNoon, ranges: [[début, fin]], noon: bool}], impossible: [mois], noon: [mois], other: [{months, ranges}]}
     */
    function shadowMonths(lat, h, tol = 6) {
        const months = [];
        for (let m = 1; m <= 12; m++) {
            const days = [1, 15, MONTH_DAYS[m - 1]], maxNoon = Math.max(...days.map(d => noonAlt(lat, declination(doy(m, d)))));
            const possible = maxNoon >= h - tol;
            // les heures possibles : celles du 1er, du 15 et du dernier jour du mois, réunies
            const ranges = possible ? merge(days.flatMap(d => windows(lat, declination(doy(m, d)), h, tol))) : [];
            const ok = possible && ranges.length > 0;
            const noon = ok && ranges.length === 1 && ranges[0][0] <= 12 && ranges[0][1] >= 12 && ranges[0][1] - ranges[0][0] <= 5;
            months.push({m, possible: ok, maxNoon: Math.round(maxNoon * 10) / 10, ranges: ranges.map(r => r.map(x => Math.round(x * 4) / 4)), noon});
        }
        const impossible = months.filter(x => !x.possible).map(x => x.m), noon = months.filter(x => x.noon).map(x => x.m);
        // les autres mois : regroupés quand ils se suivent et que leurs heures se ressemblent (à 45 min près)
        const other = []; const near = (a, b) => a.length === b.length && a.every((r, i) => Math.abs(r[0] - b[i][0]) <= 0.75 && Math.abs(r[1] - b[i][1]) <= 0.75);
        months.filter(x => x.possible && !x.noon).forEach(x => {
            const last = other[other.length - 1];
            if (last && last.months[last.months.length - 1] === x.m - 1 && near(last.ranges, x.ranges)) { last.months.push(x.m); last.ranges = last.ranges.map((r, i) => [Math.min(r[0], x.ranges[i][0]), Math.max(r[1], x.ranges[i][1])]); }
            else other.push({months: [x.m], ranges: x.ranges.map(r => r.slice())});
        });
        return {lat, h, tol, months, impossible, noon, other};
    }
    /** une date connue : à quelles heures (du soleil) le Soleil avait cette hauteur, et d'où il venait */
    function shadowOnDate(lat, h, month, day) {
        const dec = declination(doy(month, day)), p = lat * RAD, d = dec * RAD;
        const c = (Math.sin(h * RAD) - Math.sin(p) * Math.sin(d)) / (Math.cos(p) * Math.cos(d));
        if (c > 1 || c < -1) return {possible: false, dec, maxNoon: noonAlt(lat, dec)};
        const H = Math.acos(c) / RAD / 15; // en heures depuis midi
        const morning = 12 - H, afternoon = 12 + H;
        return {possible: true, dec, maxNoon: noonAlt(lat, dec), morning, afternoon, azMorning: sunAz(lat, dec, morning), azAfternoon: sunAz(lat, dec, afternoon)};
    }
    /** vers où regarde la photo, d'après l'azimut du Soleil et le sens de l'ombre sur l'image (right, left, toward = vers moi, away = vers le fond) */
    function facing(sunAzimuth, shadowDir) {
        const k = {right: 90, left: -90, toward: 0, away: 180}[shadowDir];
        if (k === undefined || !Number.isFinite(sunAzimuth)) return null;
        return ((sunAzimuth + k) % 360 + 360) % 360;
    }
    const COMPASS = ['nord', 'nord-nord-est', 'nord-est', 'est-nord-est', 'est', 'est-sud-est', 'sud-est', 'sud-sud-est', 'sud', 'sud-sud-ouest', 'sud-ouest', 'ouest-sud-ouest', 'ouest', 'ouest-nord-ouest', 'nord-ouest', 'nord-nord-ouest'];
    const compass = az => COMPASS[Math.round(((az % 360) + 360) % 360 / 22.5) % 16];
    /** « 8 h 30 » (heure arrondie au quart d'heure) */
    function hhmm(t) {
        const q = Math.round(t * 4) / 4, h = Math.floor(q), m = Math.round((q - h) * 60);
        return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
    }
    /** deux objets ou plus : donnent-ils le même Soleil ? (écart en degrés) */
    function agree(elevations, maxGap = 8) {
        const v = elevations.filter(Number.isFinite); if (v.length < 2) return {ok: true, gap: 0, mean: v[0] ?? null};
        const gap = Math.max(...v) - Math.min(...v);
        return {ok: gap <= maxGap, gap, mean: v.reduce((s, x) => s + x, 0) / v.length};
    }

    /* ═════════ 🏷 EXIF d'un JPEG ═════════ */
    function readExif(buf) {
        try {
            const u8 = new Uint8Array(buf); if (u8.length < 4 || u8[0] !== 0xFF || u8[1] !== 0xD8) return null;
            const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
            let o = 2;
            while (o + 4 < u8.length) {
                if (u8[o] !== 0xFF) return null;
                const mk = u8[o + 1], len = dv.getUint16(o + 2);
                if (mk === 0xDA || mk === 0xD9) return null; // début de l'image : pas d'EXIF
                if (mk === 0xE1 && u8[o + 4] === 0x45 && u8[o + 5] === 0x78 && u8[o + 6] === 0x69 && u8[o + 7] === 0x66) return tiff(dv, o + 10, o + 2 + len);
                o += 2 + len;
            }
        } catch (_) {}
        return null;
    }
    function tiff(dv, t0, end) {
        const le = dv.getUint16(t0) === 0x4949;
        const u16 = a => dv.getUint16(a, le), u32 = a => dv.getUint32(a, le);
        const SIZE = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8};
        const ifd = at => {
            const out = {}; if (at <= 0 || t0 + at + 2 > end) return out;
            const n = u16(t0 + at);
            for (let i = 0; i < n && i < 400; i++) {
                const e = t0 + at + 2 + i * 12; if (e + 12 > end) break;
                const tag = u16(e), type = u16(e + 2), count = u32(e + 4), size = (SIZE[type] || 1) * count;
                const vo = size > 4 ? t0 + u32(e + 8) : e + 8; if (vo + size > end) continue;
                if (type === 2) { let s = ''; for (let k = 0; k < count; k++) { const c = dv.getUint8(vo + k); if (!c) break; s += String.fromCharCode(c); } out[tag] = s.trim(); }
                else if (type === 3) out[tag] = count === 1 ? u16(vo) : Array.from({length: count}, (_, k) => u16(vo + 2 * k));
                else if (type === 4) out[tag] = count === 1 ? u32(vo) : Array.from({length: count}, (_, k) => u32(vo + 4 * k));
                else if (type === 5 || type === 10) out[tag] = Array.from({length: count}, (_, k) => { const a = type === 5 ? u32(vo + 8 * k) : dv.getInt32(vo + 8 * k, le), b = type === 5 ? u32(vo + 8 * k + 4) : dv.getInt32(vo + 8 * k + 4, le); return b ? a / b : 0; });
            }
            return out;
        };
        const ifd0 = ifd(u32(t0 + 4)), ex = ifd0[0x8769] ? ifd(ifd0[0x8769]) : {}, gps = ifd0[0x8825] ? ifd(ifd0[0x8825]) : {};
        const dms = v => (Array.isArray(v) && v.length >= 3 ? v[0] + v[1] / 60 + v[2] / 3600 : null);
        let lat = dms(gps[2]), lon = dms(gps[4]);
        if (lat != null && gps[1] === 'S') lat = -lat; if (lon != null && gps[3] === 'W') lon = -lon;
        if (lat === 0 && lon === 0) { lat = null; lon = null; }
        const raw = ex[0x9003] || ex[0x9004] || ifd0[0x0132] || '';
        const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(raw);
        const date = m && m[1] !== '0000' ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}` : '';
        const r = {date, make: ifd0[0x010F] || '', model: ifd0[0x0110] || '', lat: lat != null ? Math.round(lat * 1e6) / 1e6 : null, lon: lon != null ? Math.round(lon * 1e6) / 1e6 : null, software: ifd0[0x0131] || ''};
        return r.date || r.make || r.model || r.lat != null ? r : null;
    }

    /* ═════════ 📏 la frise : la fenêtre de dates ═════════ */
    const CERT_ORDER = ['refuted', 'supposed', 'probable', 'proven'];
    /** chaque indice non réfuté qui dit « pas avant » (date_from) ou « pas après » (date_to) réduit la fenêtre */
    function dateWindow(clues) {
        let from = null, to = null; const steps = [];
        (clues || []).forEach(c => {
            if (!c || c.certainty === 'refuted') return;
            const f = Number(c.date_from) || null, t = Number(c.date_to) || null; if (!f && !t) return;
            if (f && (from == null || f > from)) from = f;
            if (t && (to == null || t < to)) to = t;
            steps.push({id: c.id, num: c.num, text: c.text, from: f, to: t, certainty: c.certainty});
        });
        steps.sort((a, b) => (a.from || a.to || 0) - (b.from || b.to || 0));
        return {from, to, conflict: from != null && to != null && from > to, width: from != null && to != null ? to - from : null, steps};
    }
    /** ↑ monter d'un cran (jamais jusqu'à « Prouvé » tout seul : il faut une trace solide, que la personne choisit) */
    function bump(c) { return c === 'supposed' ? 'probable' : c; }
    /** une réponse de l'IA ne monte jamais seule au-dessus de « Supposé » */
    function capAi(c) { return c === 'refuted' ? 'refuted' : 'supposed'; }
    const WEIGHT = {proven: 3, probable: 2, supposed: 1, refuted: 0};
    /** une hypothèse : les indices pour, contre, à vérifier → un score (plus haut = tient mieux) */
    function hypScore(h, clues) {
        const st = h?.stances || {}; let pour = 0, contre = 0, check = 0, score = 0;
        (clues || []).forEach(c => {
            const s = st[c.id]; if (!s) return;
            const w = WEIGHT[c.certainty] ?? 1;
            if (s === 'pour') { if (c.certainty === 'supposed') check++; else pour++; score += w; }
            else if (s === 'contre') { contre++; score -= w + (c.certainty === 'proven' ? 3 : 0); }
            else if (s === 'deux') { /* pour les deux : ne départage pas */ }
        });
        return {pour, contre, check, score};
    }
    /** les questions guidées (dans l'ordre de la maquette) et de quelles sortes d'indices elles se nourrissent */
    const QUESTIONS = [
        {k: 'support', kinds: ['support']}, {k: 'dos', kinds: ['dos']}, {k: 'texte', kinds: ['texte']}, {k: 'lieu', kinds: ['lieu']},
        {k: 'gens', kinds: ['gens']}, {k: 'objets', kinds: ['objet']}, {k: 'date', kinds: ['date']}, {k: 'conclusion', kinds: []},
    ];
    /** une question est « faite » quand un indice de sa sorte existe, ou qu'on l'a marquée (passée, « pas de texte ») */
    function questionDone(q, clues, marks) {
        if (marks && marks[q.k]) return true;
        return q.kinds.some(k => (clues || []).some(c => c.kind === k || (k === 'dos' && c.kind === 'support' && /dos|verso|tampon|cachet/i.test(c.text || ''))));
    }
    /** ❓ ce qui manque : la question qui départagerait le plus vite (clés de phrases, traduites à l'écran) */
    function missing(inq) {
        const clues = (inq?.clues || []).filter(c => c.certainty !== 'refuted'), out = [];
        const hyps = inq?.hypotheses || [];
        ['lieu', 'date'].forEach(kind => {
            const hs = hyps.filter(h => h.kind === kind).map(h => ({h, s: hypScore(h, inq.clues || [])})).sort((a, b) => b.s.score - a.s.score);
            if (hs.length >= 2 && hs[0].s.score - hs[1].s.score <= 1) out.push({k: 'tie', kind, a: hs[0].h.label, b: hs[1].h.label});
        });
        if (!clues.some(c => c.kind === 'texte')) out.push({k: 'text'});
        if (!clues.some(c => c.kind === 'date' || c.date_from || c.date_to)) out.push({k: 'date'});
        const w = dateWindow(clues);
        if (w.conflict) out.push({k: 'conflict'});
        else if (w.width != null && w.width > 30) out.push({k: 'wide', from: w.from, to: w.to});
        else if ((w.from != null) !== (w.to != null)) out.push({k: 'half', from: w.from, to: w.to});
        if (!clues.some(c => c.kind === 'lieu')) out.push({k: 'place'});
        const place = inq?.conclusion?.place;
        if (place && place.certainty && place.certainty !== 'proven') out.push({k: 'proveplace', name: place.name || ''});
        if (!clues.some(c => c.kind === 'support')) out.push({k: 'support'});
        if ((inq?.images || []).length < 2) out.push({k: 'more'});
        return out.slice(0, 6);
    }
    /** ⏱ mode « 10 minutes » : les trois questions les plus utiles qui restent */
    function tenMinutes(inq) {
        const pref = ['texte', 'support', 'date', 'lieu', 'gens', 'dos', 'objets'];
        return pref.filter(k => !questionDone(QUESTIONS.find(q => q.k === k), inq?.clues || [], inq?.settings?.marks)).slice(0, 3);
    }
    /** 📍 distance en km (haversine) */
    function km(a, b) {
        if (!a || !b || ![a.lat, a.lon, b.lat, b.lon].every(Number.isFinite)) return null;
        const p1 = a.lat * RAD, p2 = b.lat * RAD, dp = (b.lat - a.lat) * RAD, dl = (b.lon - a.lon) * RAD;
        const x = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
        return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
    }
    /** une année dans un texte libre (« vers 1910 », « 14 juillet 1911 ») */
    function yearOf(s) { const m = /\b(1[5-9]\d\d|20\d\d)\b/.exec(String(s || '')); return m ? Number(m[1]) : null; }
    /** une date complète (« 14 juillet 1911 », « 1911-07-14 », « 14/07/1911 ») → {y, m, d} */
    const MOIS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
    function dayOf(s) {
        const t = String(s || '').toLowerCase().normalize('NFC');
        let m = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(t); if (m) return {y: +m[1], m: +m[2], d: +m[3]};
        m = /\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/.exec(t); if (m) return {y: +m[3], m: +m[2], d: +m[1]};
        m = /\b(\d{1,2})(?:er)?\s+([a-zéû]+)\.?\s+(\d{4})\b/.exec(t);
        if (m) { const k = MOIS.findIndex(x => m[2].startsWith(x.slice(0, 3)) && (x !== 'juin' || m[2].startsWith('juin')) && (x !== 'juil' || m[2].startsWith('juil'))); if (k >= 0) return {y: +m[3], m: k + 1, d: +m[1]}; }
        return null;
    }
    /** les indices qui s'appliquent à chaque image : 'yes' (vu), 'check' (pas encore vérifié), '' (rien) */
    function matrix(clues, images) {
        return (clues || []).map(c => ({clue: c, cells: (images || []).map(im => (c.images || {})[im.id] || '')}));
    }
    return {declination, sunAlt, sunAz, elevationFrom, noonAlt, windows, shadowMonths, shadowOnDate, facing, compass, hhmm, agree, doy,
        readExif, dateWindow, bump, capAi, hypScore, QUESTIONS, questionDone, missing, tenMinutes, km, yearOf, dayOf, matrix, CERT_ORDER, WEIGHT};
});
