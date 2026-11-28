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
    /* ═════════ 🎨 canaux de couleur, 🔦 lumière rasante (pixels RGBA, sur l'ordinateur) ═════════ */
    /** un canal seul (r, g, b), le négatif (neg), le gris (gray), sur place ; contrast en % (100 = tel quel) */
    function channel(px, mode, contrast = 100) {
        const k = Math.max(0.2, Number(contrast) || 100) / 100;
        for (let i = 0; i < px.length; i += 4) {
            const r = px[i], g = px[i + 1], b = px[i + 2];
            let v = mode === 'r' ? r : mode === 'g' ? g : mode === 'b' ? b : mode === 'gray' ? 0.299 * r + 0.587 * g + 0.114 * b : null;
            if (mode === 'neg') { px[i] = clamp(128 + (255 - r - 128) * k, 0, 255); px[i + 1] = clamp(128 + (255 - g - 128) * k, 0, 255); px[i + 2] = clamp(128 + (255 - b - 128) * k, 0, 255); continue; }
            if (v == null) { px[i] = clamp(128 + (r - 128) * k, 0, 255); px[i + 1] = clamp(128 + (g - 128) * k, 0, 255); px[i + 2] = clamp(128 + (b - 128) * k, 0, 255); continue; }
            v = clamp(128 + (v - 128) * k, 0, 255); px[i] = px[i + 1] = px[i + 2] = v;
        }
        return px;
    }
    /** 🔦 lumière rasante simulée (relief) : la pente du gris dans la direction de la lumière (az en degrés, 0 = vient du haut), renforcée */
    function emboss(src, w, h, az = 315, strength = 3) {
        const out = new Uint8ClampedArray(src.length), gray = new Float32Array(w * h);
        for (let i = 0, j = 0; i < src.length; i += 4, j++) gray[j] = 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2];
        const dx = Math.sin(az * RAD), dy = -Math.cos(az * RAD), s = Number(strength) || 3;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const x0 = Math.max(0, x - 1), x1 = Math.min(w - 1, x + 1), y0 = Math.max(0, y - 1), y1 = Math.min(h - 1, y + 1);
            const gx = gray[y * w + x1] - gray[y * w + x0], gy = gray[y1 * w + x] - gray[y0 * w + x];
            const v = clamp(128 + (gx * dx + gy * dy) * s, 0, 255), o = (y * w + x) * 4;
            out[o] = out[o + 1] = out[o + 2] = v; out[o + 3] = 255;
        }
        return out;
    }

    /* ═════════ 📏 mesurer d'après une taille connue ═════════ */
    /** segs : [{len (en points de l'image)}] ; ref : index du segment connu, size (en m), tol (marge de la taille connue, 0–1).
     *  → [{i, value, lo, hi, rel}] : la règle de trois, et sa marge (taille connue + 3 points de tracé à chaque bout) */
    function measure(segs, ref, size, tol = 0.1, px = 3) {
        const r = segs?.[ref], L = Number(r?.len); if (!(L > 0) || !(Number(size) > 0)) return [];
        return segs.map((s, i) => {
            const l = Number(s.len); if (!(l > 0)) return null;
            const value = size * l / L, rel = i === ref ? Number(tol) : Number(tol) + px / L + px / l;
            return {i, value, lo: value * (1 - rel), hi: value * (1 + rel), rel};
        }).filter(Boolean);
    }
    /** les tailles connues proposées (en m) et leur marge */
    const SIZES = [{k: 'porte', size: 2, tol: 0.1}, {k: 'brique', size: 0.22, tol: 0.05}, {k: 'moi', size: 0, tol: 0.05}];

    /* ═════════ 🧭 la boussole : le point du photographe, sa direction, le cône de vue ═════════ */
    /** cap de a vers b (degrés, 0 = nord, 90 = est) */
    function bearing(a, b) {
        const p1 = a.lat * RAD, p2 = b.lat * RAD, dl = (b.lon - a.lon) * RAD;
        return (Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) / RAD + 360) % 360;
    }
    /** le point à d km de (lat, lon) vers az */
    function destPoint(lat, lon, az, d) {
        const r = d / 6371, p1 = lat * RAD, l1 = lon * RAD, t = az * RAD;
        const p2 = Math.asin(Math.sin(p1) * Math.cos(r) + Math.cos(p1) * Math.sin(r) * Math.cos(t));
        const l2 = l1 + Math.atan2(Math.sin(t) * Math.sin(r) * Math.cos(p1), Math.cos(r) - Math.sin(p1) * Math.sin(p2));
        return {lat: p2 / RAD, lon: ((l2 / RAD + 540) % 360) - 180};
    }
    /** le contour du cône de vue : [[lat, lon], …] fermé (pour la carte) */
    function cone(c, steps = 12) {
        const half = (Number(c.fov) || 50) / 2, out = [[c.lat, c.lon]];
        for (let i = 0; i <= steps; i++) { const p = destPoint(c.lat, c.lon, c.az - half + (2 * half) * i / steps, Number(c.km) || 1); out.push([p.lat, p.lon]); }
        out.push([c.lat, c.lon]);
        return out;
    }
    /** un point est-il dans le cône ? → {inside, km, bearing, off (écart à l'axe, degrés)} */
    function inCone(c, p) {
        const d = km(c, p); if (d == null) return {inside: false, km: null};
        const b = bearing(c, p), off = Math.abs(((b - c.az + 540) % 360) - 180);
        return {inside: d <= (Number(c.km) || 1) && off <= (Number(c.fov) || 50) / 2, km: d, bearing: b, off};
    }

    /* ═════════ 🏗 dates de construction ou de démolition d'un bâtiment reconnu ═════════ */
    /** {built, gone, dates (texte)} → {from, to} : vu sur la photo, il existait déjà (« pas avant »), il n'était pas encore démoli (« pas après ») */
    function buildingDates(b) {
        const y = v => (Number.isFinite(Number(v)) && Number(v) > 1000 ? Number(v) : null);
        let from = y(b?.built) ?? y(b?.from); if (from == null && b?.dates) from = yearOf(b.dates);
        return {from, to: y(b?.gone) ?? y(b?.to)};
    }
    const STOP = new Set(['dans', 'avec', 'pour', 'sans', 'sous', 'vers', 'chez', 'entre', 'ancien', 'ancienne', 'grand', 'grande', 'petit', 'petite', 'notre', 'saint', 'sainte']);
    const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
    const words = s => fold(s).split(' ').filter(w => w.length >= 4 && !STOP.has(w));
    /** les indices qui ressemblent à un bâtiment des données (mots en commun) → [{clue, b, score, from, to}] (le plus ressemblant d'abord) */
    function matchBuildings(clues, buildings) {
        const out = [];
        (clues || []).filter(c => c && c.certainty !== 'refuted').forEach(c => {
            const cw = new Set(words(c.text)); if (!cw.size) return;
            (buildings || []).forEach(b => {
                const bw = words(b.name), hit = bw.filter(w => cw.has(w)).length; if (!hit) return;
                const d = buildingDates(b); if (d.from == null && d.to == null) return;
                out.push({clue: c, b, score: hit / Math.max(1, bw.length), ...d});
            });
        });
        return out.sort((a, b) => b.score - a.score || (a.b.km ?? 0) - (b.b.km ?? 0));
    }

    /* ═════════ 👪 qui pourrait-ce être ? (l'âge apparent, la date, le lieu ; jamais le visage) ═════════ */
    /** p : {birth, death, gender, km (le plus près de ses lieux au lieu supposé), close} ; ctx : {age, spread, from, to, gender, maxKm}
     *  → {fit, score, yes: [{k, …}], no: [{k, …}]} (clés de phrases, traduites à l'écran) */
    function whoFits(p, ctx) {
        const yes = [], no = [], from = Number(ctx.from) || null, to = Number(ctx.to) || from, age = Number(ctx.age), spread = Number(ctx.spread) || 3, maxKm = Number(ctx.maxKm) || 30;
        if (p.birth != null && from) {
            const a = from - p.birth, b = to - p.birth;
            if (b < 0) no.push({k: 'unborn', y: p.birth});
            else if (Number.isFinite(age) && ctx.age !== '' && ctx.age != null) { if (b >= age - spread && a <= age + spread) yes.push({k: 'age', a: Math.max(0, a), b}); else no.push({k: 'age', a: Math.max(0, a), b}); }
        } else no.push({k: 'nobirth'});
        if (p.death != null && from && p.death < from) no.push({k: 'dead', y: p.death});
        if (ctx.gender && p.gender && ['male', 'female'].includes(p.gender) && p.gender !== ctx.gender) no.push({k: 'gender'});
        if (p.km != null) { if (p.km <= maxKm) yes.push({k: 'place', km: Math.round(p.km)}); else no.push({k: 'far', km: Math.round(p.km)}); }
        else if (ctx.hasPlace) no.push({k: 'noplace'});
        if (p.close) yes.push({k: 'close'});
        const hard = no.some(x => ['unborn', 'dead', 'age', 'gender'].includes(x.k));
        return {fit: !hard && yes.some(x => x.k === 'age'), score: yes.length * 2 - no.length - (hard ? 5 : 0), yes, no};
    }
    /** 👤 une proposition de l'outil Visages : « Supposé » seule ; « Probable » seulement confirmée par un autre indice ; jamais « Prouvé » */
    function capFace(c, confirmed) { if (c === 'refuted') return 'refuted'; return confirmed && (c === 'proven' || c === 'probable') ? 'probable' : 'supposed'; }

    /* ═════════ 👶 ranger une série d'après l'âge des enfants ═════════ */
    /** rows : [{who, ages: {imageId: âge}}] → {order: [imageId…], t: {imageId: années depuis la 1ʳᵉ}, spread (désaccord en années), used} */
    function growthOrder(rows, imageIds) {
        const ids = (imageIds || []).map(String), sum = {}, n = {}, dev = [];
        const has = (r, id) => r?.ages && r.ages[id] !== '' && r.ages[id] != null && Number.isFinite(Number(r.ages[id]));
        (rows || []).forEach(r => {
            const pts = ids.filter(id => has(r, id)).map(id => [id, Number(r.ages[id])]);
            if (pts.length < 2) return;
            const mean = pts.reduce((s, [, a]) => s + a, 0) / pts.length;
            pts.forEach(([id, a]) => { sum[id] = (sum[id] || 0) + (a - mean); n[id] = (n[id] || 0) + 1; });
        });
        const used = ids.filter(id => n[id]);
        const t0 = {}; used.forEach(id => { t0[id] = sum[id] / n[id]; });
        // le désaccord : pour chaque enfant, l'écart entre ses âges et le temps commun
        (rows || []).forEach(r => { const pts = used.filter(id => has(r, id)); if (pts.length < 2) return;
            const off = pts.map(id => Number(r.ages[id]) - t0[id]), m = off.reduce((s, x) => s + x, 0) / off.length; off.forEach(x => dev.push(Math.abs(x - m))); });
        const order = used.slice().sort((a, b) => t0[a] - t0[b]), min = order.length ? t0[order[0]] : 0, t = {};
        order.forEach(id => { t[id] = Math.round((t0[id] - min) * 10) / 10; });
        return {order, t, spread: dev.length ? Math.round(Math.max(...dev) * 10) / 10 : 0, used: used.length};
    }

    /* ═════════ ☑ « Ai-je tout regardé ? », 🌡 niveau, 😈 avocat du diable ═════════ */
    const CHECKLIST = ['coins', 'fond', 'reflets', 'dos', 'bords', 'ombres', 'mains', 'habits', 'textes', 'ciel'];
    function checklistProgress(settings) { const c = settings?.checklist || {}; const done = CHECKLIST.filter(k => c[k]).length; return {done, total: CHECKLIST.length, all: done === CHECKLIST.length}; }
    const LEVELS = ['debutee', 'avancee', 'resolue', 'impossible'];
    /** le niveau choisi, sinon celui que l'enquête semble avoir */
    function levelOf(inq) {
        const l = inq?.settings?.level; if (LEVELS.includes(l)) return {level: l, chosen: true};
        const c = inq?.conclusion || {}, ok = x => x && ['proven', 'probable'].includes(x.certainty);
        const n = (inq?.clues || []).filter(x => x.certainty !== 'refuted').length;
        return {level: ok(c.place) && ok(c.date) ? 'resolue' : n >= 3 ? 'avancee' : 'debutee', chosen: false};
    }
    /** une durée en secondes → « 1 h 05 », « 12 min », « moins d'une minute » (clé pour le dernier) */
    function fmtDur(sec) { const s = Math.max(0, Math.round(Number(sec) || 0)); if (s < 60) return ''; const m = Math.floor(s / 60); if (m < 60) return `${m} min`; return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; }
    /** les conclusions à attaquer : lieu, date, la meilleure hypothèse, les indices « Prouvé » ou « Probable » — sauf celles qui ont déjà leur « à chercher » */
    function devilTargets(inq) {
        const out = [], c = inq?.conclusion || {}, done = new Set((inq?.clues || []).filter(x => x.data?.todo).map(x => String(x.data.against)));
        if (c.place?.name || c.place?.place_id) out.push({k: 'place', label: c.place.name || '', certainty: c.place.certainty});
        if (c.date?.text) out.push({k: 'date', label: c.date.text, certainty: c.date.certainty});
        ['lieu', 'date'].forEach(kind => { const hs = (inq?.hypotheses || []).filter(h => h.kind === kind).map(h => ({h, s: hypScore(h, inq.clues || [])})).sort((a, b) => b.s.score - a.s.score); if (hs[0]) out.push({k: `h${hs[0].h.id}`, label: hs[0].h.label, certainty: 'supposed', hyp: true}); });
        (inq?.clues || []).filter(x => ['proven', 'probable'].includes(x.certainty) && !x.data?.todo).slice(0, 6).forEach(x => out.push({k: `c${x.id}`, label: x.text, certainty: x.certainty, num: x.num}));
        return out.map(t => ({...t, done: done.has(t.k)}));
    }
    /** 🗺 la couleur d'une certitude (carte des enquêtes) */
    const CERT_COLOR = {proven: '#1a7f37', probable: '#055dff', supposed: '#bf8700', refuted: '#d1242f'};

    /* ═════════ 🏘 le profil des toits : comparer deux lignes de toits ═════════ */
    /** une ligne tracée [[x, y]…] (0–1) → 48 hauteurs, mises à l'échelle de sa boîte (0 = le haut, 1 = le bas) */
    function normLine(pts, n = 48) {
        const P = (pts || []).filter(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])).slice().sort((a, b) => a[0] - b[0]); if (P.length < 2) return null;
        const x0 = P[0][0], x1 = P[P.length - 1][0], ys = P.map(p => p[1]), y0 = Math.min(...ys), y1 = Math.max(...ys); if (x1 - x0 < 1e-6) return null;
        const out = []; let j = 0;
        for (let i = 0; i < n; i++) { const x = x0 + (x1 - x0) * i / (n - 1); while (j < P.length - 2 && P[j + 1][0] < x) j++; const a = P[j], b = P[j + 1], k = b[0] - a[0] > 1e-9 ? (x - a[0]) / (b[0] - a[0]) : 0; out.push(((a[1] + (b[1] - a[1]) * clamp(k, 0, 1)) - y0) / Math.max(1e-6, y1 - y0)); }
        return out;
    }
    /** l'écart moyen entre deux profils (0 = identiques, 1 = rien à voir) */
    function lineGap(a, b) { if (!a || !b || a.length !== b.length) return null; return Math.round(a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length * 100) / 100; }

    /* ═════════ la suite (heritage-enquete-photo-suite.js) ═════════ */
    /** 🔍🔍 double loupe : la zone vue (0–1) autour du centre, pour un grossissement k et une loupe w × h (points) sur une image W × H */
    function lensRect(cx, cy, k, W, H, w, h) {
        const kk = clamp(Number(k) || 4, 1, 16), sw = Math.min(1, w / kk / Math.max(1, W)), sh = Math.min(1, h / kk / Math.max(1, H));
        return {x: clamp(cx - sw / 2, 0, 1 - sw), y: clamp(cy - sh / 2, 0, 1 - sh), w: sw, h: sh};
    }
    /** la position liée : le même point sur l'autre image, avec le décalage choisi (pour deux tirages un peu décalés) */
    function linkedPoint(p, off) { return {x: clamp(p.x + (Number(off?.dx) || 0), 0, 1), y: clamp(p.y + (Number(off?.dy) || 0), 0, 1)}; }
    /** ▦ la grille de lecture : 3 × 3, 4 × 4 ou 6 × 6 ; les cases regardées → {done, total, all} */
    const GRID_SIZES = [3, 4, 6];
    function gridProgress(g) {
        const n = GRID_SIZES.includes(Number(g?.n)) ? Number(g.n) : 3, total = n * n;
        const done = [...new Set((g?.done || []).map(Number).filter(i => Number.isInteger(i) && i >= 0 && i < total))].length;
        return {n, done, total, all: done === total};
    }
    /** la case (0…n²−1) d'un point (0–1) */
    function gridCell(x, y, n) { const k = GRID_SIZES.includes(Number(n)) ? Number(n) : 3; return clamp(Math.floor(y * k), 0, k - 1) * k + clamp(Math.floor(x * k), 0, k - 1); }
    /** 1 2 3 : la légende des personnes numérotées. markers [{n, label, person_id, certainty}] ; people {id: {name, private}} ;
     *  safe : partage sans risque ou mode consultation → un vivant ou une fiche confidentielle n'est jamais nommé (même écrit à la main) */
    function legendLines(markers, {people = {}, safe = false, privNames = [], t = s => s} = {}) {
        const hidden = (privNames || []).filter(n => n && n.length >= 3).map(n => fold(n));
        return (markers || []).slice().sort((a, b) => a.n - b.n).map(m => {
            const p = m.person_id ? people[m.person_id] : null;
            let name = String(m.label || '').trim() || (p ? p.name : '') || t('inconnu');
            const priv = (p && p.private) || hidden.some(n => fold(name).includes(n));
            if (safe && priv) name = t('Personne confidentielle');
            const unknown = !m.person_id && (!m.label || [fold('inconnu'), fold(t('inconnu'))].includes(fold(m.label))); // « inconnu » : rien à douter
            const sure = m.certainty === 'proven' || unknown;
            return {n: m.n, text: `${name}${sure || (safe && priv) ? '' : ' ?'}`, private: !!priv, person_id: safe && priv ? 0 : (m.person_id || 0), certainty: m.certainty || 'supposed'};
        });
    }
    /** le prochain numéro libre */
    function nextNumber(markers) { const used = new Set((markers || []).map(m => m.n)); let n = 1; while (used.has(n)) n++; return n; }
    /** 👻 silhouette : la boîte d'un contour [[x, y]…] (0–1) */
    function polyBox(pts) {
        const P = (pts || []).filter(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])); if (P.length < 3) return null;
        const xs = P.map(p => p[0]), ys = P.map(p => p[1]), x = Math.min(...xs), y = Math.min(...ys);
        return {x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y};
    }
    /** le contour posé sur l'autre image : déplacé (dx, dy en 0–1), agrandi (k), en gardant les proportions des deux images
     *  (ratio = (hauteur A / largeur A) / (hauteur B / largeur B)) → les points sur B et la hauteur sur B (part de la hauteur de B) */
    function ghostOn(pts, {dx = 0, dy = 0, k = 1, ratio = 1} = {}) {
        const b = polyBox(pts); if (!b) return null;
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        const out = pts.map(([x, y]) => [cx + (x - cx) * k + dx, cy + (y - cy) * k * ratio + dy]);
        return {pts: out, h: b.h * k * ratio, box: polyBox(out)};
    }
    /** 🗺 la tournée d'un photographe : ses photos rangées par année (les années inconnues à la fin) */
    function byYear(photos) {
        const m = new Map(); (photos || []).forEach(p => { const y = Number.isFinite(Number(p.year)) && p.year ? Number(p.year) : null; if (!m.has(y)) m.set(y, []); m.get(y).push(p); });
        return [...m.entries()].sort((a, b) => (a[0] == null) - (b[0] == null) || (a[0] ?? 0) - (b[0] ?? 0)).map(([year, list]) => ({year, photos: list}));
    }
    /** ✍ « En une phrase » : la prudence suit la certitude (Prouvé → rien, Probable → « sans doute », Supposé → « peut-être ») */
    const HEDGE = {proven: '', probable: 'sans doute', supposed: 'peut-être'};
    const RANK = {proven: 3, probable: 2, supposed: 1};
    function whenText(text, t) {
        const s = String(text || '').trim(); if (!s) return '';
        if (/^\d{4}$/.test(s)) return t('en {y}').replace('{y}', s);
        if (/^\d{1,2}(er)?\s+\S+\s+\d{4}$/.test(s) || /^\d{4}-\d{2}-\d{2}$/.test(s) || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) return t('le {d}').replace('{d}', s);
        return s;
    }
    function sentence(conc, {t = s => s} = {}) {
        const p = conc?.place && (conc.place.name || '').trim() ? conc.place : null, d = conc?.date && (conc.date.text || '').trim() ? conc.date : null;
        if (!p && !d) return '';
        const cert = x => (RANK[x?.certainty] ? x.certainty : 'supposed'), main = cert(p || d);
        const parts = [];
        if (p) parts.push(t('à {lieu}').replace('{lieu}', p.name.trim()));
        if (d) { const w = whenText(d.text, t); parts.push(p && RANK[cert(d)] < RANK[main] ? `, ${t(HEDGE[cert(d)])} ${w}` : `${p ? ' ' : ''}${w}`); }
        const tpl = {proven: 'Cette photo a été prise {rest}.', probable: 'Cette photo a sans doute été prise {rest}.', supposed: 'Cette photo a peut-être été prise {rest}.'}[main];
        return t(tpl).replace('{rest}', parts.join(''));
    }
    /** 📜 « Ce qui a changé ma conclusion » : les lignes « ⚖ … » du journal, de la plus ancienne à la plus récente */
    function conclusionHistory(journal) { return (journal || []).filter(j => /^⚖/.test(String(j.what || ''))).slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || a.id - b.id); }

    return {declination, sunAlt, sunAz, elevationFrom, noonAlt, windows, shadowMonths, shadowOnDate, facing, compass, hhmm, agree, doy,
        readExif, dateWindow, bump, capAi, hypScore, QUESTIONS, questionDone, missing, tenMinutes, km, yearOf, dayOf, matrix, CERT_ORDER, WEIGHT,
        channel, emboss, measure, SIZES, bearing, destPoint, cone, inCone, buildingDates, matchBuildings, whoFits, capFace, growthOrder,
        CHECKLIST, checklistProgress, LEVELS, levelOf, fmtDur, devilTargets, CERT_COLOR, normLine, lineGap,
        lensRect, linkedPoint, GRID_SIZES, gridProgress, gridCell, legendLines, nextNumber, polyBox, ghostOn, byYear, HEDGE, sentence, conclusionHistory};
});
