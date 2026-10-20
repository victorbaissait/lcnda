/**
 * 📅 Maintenance → Calendrier / mesures : huit cadres de plus, ajoutés après « Alphabets et langues des actes »
 *  📏 Mesures anciennes par région · 🎂 Âge ↔ date de naissance · ↔ Écart entre deux dates · 📆 Jour de la semaine
 *  ✝ Saint du jour et fêtes mobiles · 🔔 Heures canoniques · 🪙 Monnaies étrangères anciennes · 🌳 Calculateur de générations
 * (« le lundi après la Saint-Martin », « 3 jours avant Pâques » : dans « Fêtes religieuses → date exacte », heritage-tools.js.)
 * Les calculs sont des fonctions pures, exposées dans window.LCNDA_EXT.calendarMore. Test : tests/test-calendar-more.js.
 * Tout se fait dans le navigateur, sauf le saint du jour (même calendrier que le widget « Prénom et saint du jour », lib/saints.php).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    for (const key of ['calendarPanels', 'afterCalendar']) ext[key] = ext[key] || [];
    const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const fold = text => String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, "'");
    const num = (n, d = 2) => Number(n).toLocaleString('fr-FR', {maximumFractionDigits: d});
    const plural = (n, one, many) => `${num(n, 0)} ${Math.abs(n) > 1 ? (many || one + 's') : one}`;
    const store = {get(k, d) { try { return localStorage.getItem('lcnda-calmore-' + k) ?? d; } catch (_) { return d; } }, set(k, v) { try { localStorage.setItem('lcnda-calmore-' + k, v); } catch (_) {} }};

    /* ═════════════ Dates : jours juliens, calendriers julien et grégorien ═════════════ */
    const jdnG = (y, m, d) => { const a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3; return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045; };
    const jdnJ = (y, m, d) => { const a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3; return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - 32083; };
    const fromG = j => { const a = j + 32044, b = Math.floor((4 * a + 3) / 146097), c = a - Math.floor(146097 * b / 4), d = Math.floor((4 * c + 3) / 1461), e = c - Math.floor(1461 * d / 4), m = Math.floor((5 * e + 2) / 153); return {y: 100 * b + d - 4800 + Math.floor(m / 10), m: m + 3 - 12 * Math.floor(m / 10), d: e - Math.floor((153 * m + 2) / 5) + 1}; };
    const fromJ = j => { const c = j + 32082, d = Math.floor((4 * c + 3) / 1461), e = c - Math.floor(1461 * d / 4), m = Math.floor((5 * e + 2) / 153); return {y: d - 4800 + Math.floor(m / 10), m: m + 3 - 12 * Math.floor(m / 10), d: e - Math.floor((153 * m + 2) / 5) + 1}; };
    const leapG = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const monthDays = (y, m) => [31, leapG(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
    const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const WEEKDAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']; // jour julien 0 = lundi
    const weekdayOfJdn = j => WEEKDAYS[((j % 7) + 7) % 7];
    const pad = n => String(n).padStart(2, '0');
    const dmy = o => `${pad(o.d)}/${pad(o.m)}/${o.y}`;
    const longDate = o => `${o.d === 1 ? '1er' : o.d} ${MONTHS[o.m - 1]} ${o.y}`;
    /** Passage au grégorien : France (9 → 20 décembre 1582), Rome (4 → 15 octobre 1582), ou toujours l'un des deux. */
    const SWITCH = {france: jdnG(1582, 12, 20), rome: jdnG(1582, 10, 15)};
    /** Calendrier en usage pour une date écrite (y, m, d) : 'julian' ou 'gregorian'. */
    function calendarFor(y, m, d, mode = 'france') {
        if (mode === 'julian' || mode === 'gregorian') return mode;
        return jdnJ(y, m, d) < SWITCH[mode === 'rome' ? 'rome' : 'france'] ? 'julian' : 'gregorian';
    }
    /** Jour de la semaine d'une date écrite dans le calendrier en usage. */
    function weekday(y, m, d, mode = 'france') {
        const cal = calendarFor(y, m, d, mode), j = cal === 'julian' ? jdnJ(y, m, d) : jdnG(y, m, d);
        const other = cal === 'julian' ? fromG(j) : fromJ(j);
        return {weekday: weekdayOfJdn(j), calendar: cal, jdn: j, other, gap: Math.abs(jdnG(y, m, d) - jdnJ(y, m, d))};
    }

    /**
     * Date écrite → {y, m?, d?} : « 12/03/1790 », « 1790-03-12 », « 12 mars 1790 », « 1er mars 1790 », « mars 1790 », « 03/1790 », « 1790 ».
     * Renvoie null si rien n'est reconnu ou si le jour n'existe pas.
     */
    function parseDate(text) {
        const t = fold(text).trim().replace(/\s+/g, ' ');
        if (!t) return null;
        let y, m, d, r;
        if ((r = t.match(/^(\d{3,4})-(\d{1,2})(?:-(\d{1,2}))?$/))) [y, m, d] = [r[1], r[2], r[3]];
        else if ((r = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{3,4})$/))) [d, m, y] = [r[1], r[2], r[3]];
        else if ((r = t.match(/^(\d{1,2})[/.-](\d{3,4})$/))) [m, y] = [r[1], r[2]];
        else if ((r = t.match(/^(?:vers |en |an )?(\d{3,4})$/))) y = r[1];
        else if ((r = t.match(/^(?:le )?(?:(\d{1,2})(?:er|e)? )?([a-z]+)\.? (\d{3,4})$/))) {
            const hits = r[2].length >= 3 ? MONTHS.map((x, i) => fold(x).startsWith(r[2]) ? i : -1).filter(i => i >= 0) : [];
            if (hits.length !== 1) return null; // « jui » : juin ou juillet ?
            [d, m, y] = [r[1], hits[0] + 1, r[3]];
        } else return null;
        y = Number(y); m = m === undefined ? undefined : Number(m); d = d === undefined ? undefined : Number(d);
        if (!y || (m !== undefined && (m < 1 || m > 12)) || (d !== undefined && (d < 1 || d > monthDays(y, m)))) return null;
        const o = {y};
        if (m) o.m = m;
        if (m && d) o.d = d;
        return o;
    }
    /** Début et fin (jours juliens grégoriens) d'une date peut-être incomplète. */
    const span = p => p.d ? [jdnG(p.y, p.m, p.d), jdnG(p.y, p.m, p.d)] : p.m ? [jdnG(p.y, p.m, 1), jdnG(p.y, p.m, monthDays(p.y, p.m))] : [jdnG(p.y, 1, 1), jdnG(p.y, 12, 31)];
    const partialText = p => p.d ? dmy(p) : p.m ? `${MONTHS[p.m - 1]} ${p.y}` : String(p.y);
    /** Années, mois, jours entre deux dates complètes (a ≤ b). */
    function ymdDiff(a, b) {
        // nombre de mois entiers (le 31 janvier + 1 mois = le 28 ou 29 février), puis les jours qui restent
        const plusMonths = k => { const t = a.m - 1 + k, y = a.y + Math.floor(t / 12), m = (t % 12) + 1; return {y, m, d: Math.min(a.d, monthDays(y, m))}; };
        const jb = jdnG(b.y, b.m, b.d);
        let k = (b.y - a.y) * 12 + b.m - a.m;
        while (k > 0) { const x = plusMonths(k); if (jdnG(x.y, x.m, x.d) <= jb) break; k--; }
        const x = plusMonths(k);
        return {years: Math.floor(k / 12), months: k % 12, days: jb - jdnG(x.y, x.m, x.d)};
    }
    const ymdText = r => [r.years ? plural(r.years, 'an') : '', r.months ? `${r.months} mois` : '', r.days || (!r.years && !r.months) ? plural(r.days, 'jour') : ''].filter(Boolean).join(', ');
    /**
     * Écart entre deux dates, même incomplètes (« mars 1790 », « 1802 ») : {exact, years, months, days, totalDays, weeks}
     * ou, si une date est incomplète, {exact: false, min, max} (chacun avec years, months, days, totalDays).
     */
    function dateDiff(aText, bText) {
        const a0 = typeof aText === 'object' ? aText : parseDate(aText), b0 = typeof bText === 'object' ? bText : parseDate(bText);
        if (!a0 || !b0) return null;
        let a = a0, b = b0, swapped = false;
        if (span(a)[0] > span(b)[0]) { [a, b] = [b, a]; swapped = true; }
        const one = (x, y) => ({...ymdDiff(x, y), totalDays: jdnG(y.y, y.m, y.d) - jdnG(x.y, x.m, x.d)});
        if (a.d && b.d) { const r = one(a, b); return {exact: true, swapped, from: a, to: b, ...r, weeks: Math.floor(r.totalDays / 7), weekDays: r.totalDays % 7}; }
        const [as, ae] = span(a), [bs, be] = span(b);
        const lo = Math.max(0, bs - ae);
        const minFrom = fromG(lo === 0 ? as : ae), minTo = fromG(lo === 0 ? as : bs), maxFrom = fromG(as), maxTo = fromG(be);
        return {exact: false, swapped, from: a, to: b, min: one(minFrom, minTo), max: one(maxFrom, maxTo)};
    }
    /** Ajoute (ou retire) des années à une date complète ; le 29 février devient le 28 si besoin. */
    const addYears = (o, n) => { const y = o.y + n; return {y, m: o.m, d: Math.min(o.d, monthDays(y, o.m))}; };
    /**
     * « 32 ans au décès le 12/03/1790 » → née entre le 13/03/1757 et le 12/03/1758.
     * margin : 0 (âge exact, en années révolues), 2 (« environ »), 5 (âge arrondi), 10 (très vague).
     * Renvoie {from, to} (dates grégoriennes complètes) ou null.
     */
    function birthRange(age, refText, margin = 0) {
        const ref = typeof refText === 'object' ? refText : parseDate(refText);
        age = Number(age);
        if (!ref || !Number.isFinite(age) || age < 0 || age > 130) return null;
        const [rs, re] = span(ref), start = fromG(rs), end = fromG(re);
        const hi = Math.floor(age) + margin, lo = Math.max(0, Math.floor(age) - margin);
        const s = addYears(start, -(hi + 1)), from = fromG(jdnG(s.y, s.m, s.d) + 1), to = addYears(end, -lo);
        return {from, to, hi, lo};
    }
    /** Âge exact à une date : {years, months, days} (null si la date est avant la naissance). */
    function ageAt(birthText, dateText) {
        const r = dateDiff(birthText, dateText);
        if (!r || r.swapped) return null;
        return r;
    }

    /* ═════════════ Pâques et fêtes mobiles ═════════════ */
    /** Pâques d'une année ; julian = comput julien (date dans le calendrier julien), sinon grégorien. */
    function easter(year, julian = year < 1583) {
        if (julian) {
            const a = year % 4, b = year % 7, c = year % 19, d = (19 * c + 15) % 30, e = (2 * a + 4 * b - d + 34) % 7;
            const m = Math.floor((d + e + 114) / 31), dd = ((d + e + 114) % 31) + 1;
            return {y: year, m, d: dd, jdn: jdnJ(year, m, dd), calendar: 'julian'};
        }
        const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
        const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, mm = Math.floor((a + 11 * h + 22 * l) / 451);
        const m = Math.floor((h + l - 7 * mm + 114) / 31), dd = ((h + l - 7 * mm + 114) % 31) + 1;
        return {y: year, m, d: dd, jdn: jdnG(year, m, dd), calendar: 'gregorian'};
    }
    const MOVABLE = [
        ['Septuagésime', -63, 'dimanche, début du temps de la Septuagésime'], ['Sexagésime', -56, 'dimanche'], ['Quinquagésime', -49, 'dimanche gras'],
        ['Mardi gras', -47, 'veille des Cendres, fin du carnaval'], ['Mercredi des Cendres', -46, 'début du Carême : plus de mariages jusqu’à Pâques'],
        ['1er dimanche de Carême', -42, 'dimanche des Brandons'], ['Mi-Carême', -24, 'jeudi'], ['Dimanche de la Passion', -14, ''], ['Rameaux', -7, 'Pâques fleuries'],
        ['Jeudi saint', -3, ''], ['Vendredi saint', -2, ''], ['Samedi saint', -1, 'baptêmes solennels'], ['Pâques', 0, ''], ['Lundi de Pâques', 1, ''],
        ['Quasimodo', 7, 'dimanche, fin du temps pascal des mariages interdits'], ['Rogations', 36, 'lundi, processions dans les champs'], ['Ascension', 39, 'jeudi'],
        ['Pentecôte', 49, 'baptêmes solennels'], ['Lundi de Pentecôte', 50, ''], ['Trinité', 56, 'dimanche'], ['Fête-Dieu', 60, 'jeudi (fêtée le dimanche suivant après 1802)'], ['Sacré-Cœur', 68, 'vendredi'],
    ];
    /** Fêtes mobiles d'une année : [{name, offset, note, date, weekday, calendar}] (dates dans le calendrier du comput). */
    function movableFeasts(year, julian = year < 1583) {
        const e = easter(year, julian), conv = julian ? fromJ : fromG;
        return MOVABLE.map(([name, offset, note]) => ({name, offset, note, date: conv(e.jdn + offset), weekday: weekdayOfJdn(e.jdn + offset), calendar: e.calendar}));
    }

    /* ═════════════ Générations ═════════════ */
    const GEN = {min: 25, max: 33, male: 30, female: 27};
    /** Nombre de générations entre deux années : {years, min, max, male, female}. */
    function generationsBetween(y1, y2) {
        const years = Math.abs(Number(y2) - Number(y1));
        if (!Number.isFinite(years)) return null;
        return {years, min: years / GEN.max, max: years / GEN.min, male: years / GEN.male, female: years / GEN.female};
    }
    /** n générations en arrière depuis une année de naissance : années de naissance probables de l'ancêtre. */
    function generationsBack(n, fromYear) {
        n = Math.max(0, Math.floor(Number(n))); fromYear = Number(fromYear);
        if (!Number.isFinite(n) || !Number.isFinite(fromYear)) return null;
        return {n, from: fromYear - GEN.max * n, to: fromYear - GEN.min * n, male: fromYear - GEN.male * n, female: fromYear - GEN.female * n};
    }
    /** Ancêtres théoriques à la génération n (1 = les parents) : 2^n ; cumul des générations 1 à n : 2^(n+1) − 2 ; numéros Sosa 2^n à 2^(n+1) − 1. */
    function ancestors(n) {
        n = Math.max(0, Math.floor(Number(n)));
        if (!Number.isFinite(n) || n > 60) return null;
        const at = 2 ** n;
        return {n, at, total: 2 ** (n + 1) - 2, sosaFrom: at, sosaTo: 2 ** (n + 1) - 1};
    }

    /* ═════════════ Heures canoniques ═════════════ */
    const dayOfYear = (m, d) => jdnG(2001, m, d) - jdnG(2001, 1, 1) + 1;
    /** Lever et coucher du soleil en heure solaire (en heures décimales), latitude du centre de la France par défaut. */
    function sunTimes(month, day = 15, lat = 47) {
        const n = dayOfYear(month, day), rad = Math.PI / 180;
        const decl = -23.44 * Math.cos(2 * Math.PI / 365 * (n + 10)) * rad, phi = lat * rad;
        const cosH = (Math.sin(-0.833 * rad) - Math.sin(phi) * Math.sin(decl)) / (Math.cos(phi) * Math.cos(decl));
        const H = Math.acos(Math.max(-1, Math.min(1, cosH))) / rad / 15;
        return {rise: 12 - H, set: 12 + H};
    }
    const HOURS = [
        ['matines', 'Matines', 'office de la nuit (dans les paroisses, souvent chanté la veille au soir ou au petit matin)'],
        ['laudes', 'Laudes', 'à l’aube, avant le lever du soleil'],
        ['prime', 'Prime', '1re heure du jour, au lever du soleil'],
        ['tierce', 'Tierce', '3e heure, milieu de la matinée (heure de la grand-messe)'],
        ['sexte', 'Sexte', '6e heure, midi'],
        ['none', 'None', '9e heure, milieu de l’après-midi'],
        ['vepres', 'Vêpres', 'à la tombée du jour (le dimanche, à la paroisse, souvent dès le début de l’après-midi)'],
        ['complies', 'Complies', 'à la nuit, avant le coucher'],
        ['angelus', 'Angélus', 'cloche du matin, de midi et du soir'],
    ];
    /** Heure approximative (heure solaire, en heures décimales) d'une heure canonique pour un mois donné : heures « inégales » (le jour divisé en 12). */
    function canonicalTime(key, month = 3, day = 21) {
        const {rise, set} = sunTimes(month, day), h = (set - rise) / 12, night = (24 - set + rise) / 12;
        const t = {matines: (set + 8 * night) % 24, laudes: rise - 0.75, prime: rise, tierce: rise + 3 * h, sexte: 12, none: rise + 9 * h, vepres: set, complies: (set + 1) % 24, angelus: rise}[key];
        return t === undefined ? null : t;
    }
    const clock = (t, step = 0.25) => { let x = Math.round(((t % 24) + 24) % 24 / step) * step; if (x >= 24) x -= 24; const hh = Math.floor(x), mm = Math.round((x - hh) * 60); return `${hh} h${mm ? ' ' + pad(mm) : ''}`; };
    /** « à l'heure de vêpres en mars » → {key, label, month, time, text: « vers 18 h »} ; le mois du texte l'emporte sur celui donné. */
    function canonicalFromText(text, month = 3) {
        const t = fold(text);
        const keys = {matines: /matines?|matutin/, laudes: /laudes?/, prime: /\bprimes?\b/, tierce: /tierces?/, sexte: /sextes?/, none: /\bnones?\b/, vepres: /vespres|vepres/, complies: /complies?/, angelus: /angelus/};
        const key = Object.keys(keys).find(k => keys[k].test(t));
        if (!key) return null;
        const mi = MONTHS.findIndex(x => t.includes(fold(x)));
        const m = mi >= 0 ? mi + 1 : Number(month) || 3;
        const time = canonicalTime(key, m, 21);
        return {key, label: HOURS.find(x => x[0] === key)[1], month: m, time, text: `vers ${clock(time, 0.5)}`};
    }

    /* ═════════════ Mesures anciennes par région ═════════════ */
    // Unités : [id, nom, genre (long, surf, grain, liq), valeur en m, m² ou litres, approchée ?, note]
    const METRIC = {long: [['m', 'mètre', 1], ['km', 'kilomètre', 1000]], surf: [['m2', 'mètre carré', 1], ['a', 'are', 100], ['ha', 'hectare', 10000]],
        grain: [['l', 'litre', 1], ['hl', 'hectolitre', 100]], liq: [['l', 'litre', 1], ['hl', 'hectolitre', 100]]};
    const KINDS = {long: 'Longueurs', surf: 'Surfaces', grain: 'Grains (matières sèches)', liq: 'Liquides (vin, cidre, huile)'};
    const REGIONS = [
        {id: 'paris', label: 'Paris, Île-de-France (mesures du roi)', units: [
            ['ligne', 'ligne', 'long', 0.0022558], ['pouce', 'pouce', 'long', 0.027070], ['pied', 'pied du roi', 'long', 0.324839], ['aune', 'aune de Paris', 'long', 1.18845],
            ['toise', 'toise', 'long', 1.949036], ['perche', 'perche de Paris (18 pieds)', 'long', 5.847102], ['perche_ef', 'perche des eaux et forêts (22 pieds)', 'long', 7.146458],
            ['lieue', 'lieue de Paris (2 000 toises)', 'long', 3898.07], ['lieue_poste', 'lieue de poste (2 200 toises)', 'long', 4287.88],
            ['toise2', 'toise carrée', 'surf', 3.79874], ['perche2', 'perche carrée de Paris', 'surf', 34.1886], ['perche2_ef', 'perche carrée des eaux et forêts', 'surf', 51.0719],
            ['arpent', 'arpent de Paris (100 perches de 18 pieds)', 'surf', 3418.86], ['arpent_c', 'arpent commun (perches de 20 pieds)', 'surf', 4220.83], ['arpent_ef', 'arpent des eaux et forêts (perches de 22 pieds)', 'surf', 5107.19],
            ['litron', 'litron', 'grain', 0.813], ['boisseau', 'boisseau', 'grain', 13.008], ['minot', 'minot (3 boisseaux)', 'grain', 39.02], ['mine', 'mine (6 boisseaux)', 'grain', 78.05],
            ['setier', 'setier (12 boisseaux)', 'grain', 156.10], ['muid', 'muid de grains (12 setiers)', 'grain', 1873.2],
            ['roquille', 'roquille', 'liq', 0.0291], ['demiard', 'demi-setier ou demiard', 'liq', 0.2328], ['chopine', 'chopine', 'liq', 0.4656], ['pinte', 'pinte de Paris', 'liq', 0.9313],
            ['velte', 'velte ou setier de vin (8 pintes)', 'liq', 7.45], ['quartaut', 'quartaut ou quarteau (72 pintes)', 'liq', 67.05], ['feuillette', 'feuillette (144 pintes)', 'liq', 134.1], ['muid_vin', 'muid de vin (288 pintes)', 'liq', 268.2],
        ]},
        {id: 'lyon', label: 'Lyon, Lyonnais', units: [
            ['pied', 'pied de ville de Lyon', 'long', 0.3425, true], ['aune', 'aune de Lyon', 'long', 1.191, true],
            ['bicheree', 'bicherée (terre semée d’un bichet)', 'surf', 1293, true],
            ['bichet', 'bichet', 'grain', 32.5, true], ['pot', 'pot de Lyon', 'liq', 1.04, true], ['anee', 'ânée de vin', 'liq', 93, true],
        ]},
        {id: 'bretagne', label: 'Bretagne (Rennes)', units: [
            ['pied', 'pied du roi', 'long', 0.324839], ['corde', 'corde (24 pieds)', 'long', 7.796],
            ['corde2', 'corde carrée', 'surf', 60.78], ['hommee', 'hommée (vigne, pré)', 'surf', 500, true, 'très variable'], ['journal', 'journal (80 cordes)', 'surf', 4862.4],
            ['boisseau', 'boisseau de Rennes', 'grain', 40, true, 'très variable d’une ville à l’autre'], ['barrique', 'barrique (Nantes)', 'liq', 228, true],
        ]},
        {id: 'normandie', label: 'Normandie (Rouen)', units: [
            ['pied', 'pied du roi', 'long', 0.324839], ['perche', 'perche (22 pieds)', 'long', 7.146458],
            ['perche2', 'perche carrée', 'surf', 51.0719], ['vergee', 'vergée (40 perches)', 'surf', 2042.88], ['acre', 'acre (4 vergées)', 'surf', 8171.5],
            ['pot', 'pot (2 pintes, cidre)', 'liq', 1.86, true],
        ]},
        {id: 'bourgogne', label: 'Bourgogne (Dijon, Beaune)', units: [
            ['pied', 'pied du roi', 'long', 0.324839], ['perche', 'perche de Bourgogne (9 pieds ½)', 'long', 3.08597],
            ['perche2', 'perche carrée', 'surf', 9.5232], ['ouvree', 'ouvrée (vigne, 45 perches)', 'surf', 428.5], ['journal', 'journal ou soiture (360 perches)', 'surf', 3428.4],
            ['quarteau', 'quarteau', 'liq', 57], ['feuillette', 'feuillette', 'liq', 114], ['piece', 'pièce de Bourgogne', 'liq', 228], ['queue', 'queue (2 pièces)', 'liq', 456],
        ]},
        {id: 'provence', label: 'Provence (Marseille)', units: [
            ['pan', 'pan', 'long', 0.2514], ['canne', 'canne (8 pans)', 'long', 2.0116],
            ['canne2', 'canne carrée', 'surf', 4.0465], ['seteree', 'sétérée', 'surf', 2000, true, 'très variable (de 1 500 à 3 000 m² selon le lieu)'],
            ['millerole', 'millerole (huile, vin)', 'liq', 64.39],
        ]},
        {id: 'lorraine', label: 'Lorraine (Nancy)', units: [
            ['pied', 'pied de Lorraine', 'long', 0.28586], ['toise', 'toise de Lorraine (10 pieds)', 'long', 2.8586], ['aune', 'aune de Lorraine', 'long', 0.6395, true],
            ['toise2', 'toise carrée de Lorraine', 'surf', 8.1716], ['jour', 'jour ou journal (250 toises carrées)', 'surf', 2042.9],
        ]},
        {id: 'alsace', label: 'Alsace (Strasbourg)', units: [
            ['pied', 'pied de Strasbourg', 'long', 0.28877], ['aune', 'aune (Elle) de Strasbourg', 'long', 0.578, true],
            ['arpent', 'arpent (Acker)', 'surf', 2000, true], ['ohm', 'ohm (vin)', 'liq', 47, true, 'de 45 à 50 litres selon le lieu'],
        ]},
        {id: 'flandre', label: 'Flandre (Lille)', units: [
            ['pied', 'pied de Lille', 'long', 0.297, true], ['aune', 'aune de Lille', 'long', 0.694, true],
            ['mesure', 'mesure', 'surf', 3546, true], ['bonnier', 'bonnier (4 mesures)', 'surf', 14185, true],
            ['rasiere', 'rasière (blé)', 'grain', 70, true],
        ]},
    ];
    const regionById = id => REGIONS.find(r => r.id === id) || REGIONS[0];
    const unitOf = (region, id) => {
        const r = regionById(region), u = r.units.find(x => x[0] === id);
        if (u) return {id: u[0], label: u[1], kind: u[2], value: u[3], approx: !!u[4], note: u[5] || ''};
        const [prefix, kind, mid] = String(id).split('_'), mu = prefix === 'metric' ? METRIC[kind]?.find(x => x[0] === mid) : null;
        return mu ? {id, label: mu[1], kind, value: mu[2], approx: false, metric: true} : null;
    };
    /**
     * Convertit une mesure ancienne : {value, unit, metric: [valeur, nom], others: [[nombre, unité], …]} (autres unités du même genre dans la région).
     * unit : id d'une unité de la région, ou « metric_<genre>_<m|km|m2|a|ha|l|hl> ».
     */
    function convertMeasure(value, region, unit) {
        const u = unitOf(region, unit), v = Number(value);
        if (!u || !Number.isFinite(v)) return null;
        const base = v * u.value, r = regionById(region);
        const others = r.units.filter(x => x[2] === u.kind && x[0] !== u.id).map(x => ({value: base / x[3], label: x[1], approx: !!x[4] || u.approx}));
        const metric = u.kind === 'long' ? (base >= 1000 ? [base / 1000, 'km'] : [base, 'm']) : u.kind === 'surf' ? (base >= 10000 ? [base / 10000, 'ha'] : base >= 100 ? [base / 100, 'a'] : [base, 'm²']) : (base >= 100 ? [base / 100, 'hl'] : [base, 'l']);
        return {value: v, unit: u, base, metric, approx: u.approx, others};
    }

    /* ═════════════ Monnaies étrangères anciennes (en livres tournois) ═════════════ */
    // [id, nom, XVIIe (vers 1640-1700), XVIIIe (1726-1789), note]
    const COINS = [
        ['louis', 'Louis d’or (France)', 11, 24, 'créé en 1640 à 10 livres ; 24 livres de 1726 à la Révolution'],
        ['ecu_or', 'Écu d’or au soleil (France)', 5.2, null, 'plus frappé après 1640'],
        ['ecu', 'Écu blanc ou louis d’argent (France)', 3, 6, '3 livres en 1641 ; gros écu de 6 livres (et petit écu de 3 livres) au XVIIIe'],
        ['pistole', 'Pistole (Espagne, Italie)', 10.5, 20, 'souvent une monnaie de compte valant 10 livres'],
        ['ducat', 'Ducat d’or (Venise, Hollande, Empire)', 6, 11, ''],
        ['florin', 'Florin de Hollande (gulden)', 1.25, 2.1, ''],
        ['gulden', 'Gulden ou florin du Rhin (Allemagne, Alsace, Suisse)', 1.5, 2.5, ''],
        ['thaler', 'Thaler, rixdale (Empire, Saxe, Prusse)', 3, 5.25, ''],
        ['piastre', 'Piastre ou réal de huit (Espagne)', 3, 5.25, '« piastre gourde » des colonies'],
        ['sterling', 'Livre sterling (Angleterre)', 13, 23.5, 'monnaie de compte, d’après le cours du change'],
        ['lorraine', 'Livre de Lorraine', null, 0.775, '15 sols 6 deniers tournois'],
    ];
    /** Livres décimales → « 5 livres 4 sols 6 deniers ». */
    function lsd(livres) {
        let den = Math.round(Number(livres) * 240);
        if (!Number.isFinite(den)) return '';
        const neg = den < 0; den = Math.abs(den);
        const l = Math.floor(den / 240), s = Math.floor((den % 240) / 12), d = den % 12;
        return (neg ? '− ' : '') + ([l ? plural(l, 'livre') : '', s ? plural(s, 'sol') : '', d ? plural(d, 'denier') : ''].filter(Boolean).join(' ') || '0 livre');
    }
    /** Valeur approchée en livres tournois : {livres, text} ou null si la pièce n'a pas cours à cette époque. */
    function coinValue(id, period, qty = 1) {
        const c = COINS.find(x => x[0] === id), rate = c?.[period === '17' ? 2 : 3];
        if (rate === null || rate === undefined) return null;
        const livres = rate * Number(qty);
        return {livres, text: lsd(livres), label: c[1], note: c[4]};
    }

    ext.calendarMore = {jdnG, jdnJ, fromG, fromJ, parseDate, weekday, calendarFor, dateDiff, ymdDiff, birthRange, ageAt, easter, movableFeasts,
        generationsBetween, generationsBack, ancestors, sunTimes, canonicalTime, canonicalFromText, clock, convertMeasure, REGIONS, COINS, coinValue, lsd};

    /* ═════════════ Cadres ═════════════ */
    const panel = (id, title, help, body, note = '') => `<section class="maintenance-panel h-cm-panel" id="${id}"><h3>${title}</h3><p>${help}</p>${body}${note ? `<p class="muted h-cm-note">${note}</p>` : ''}</section>`;
    const out = (id, html = '') => `<div class="unit-result h-cm-out" id="${id}" aria-live="polite">${html}</div>`;
    const approx = a => a ? '≈ ' : '';

    function measuresPanel() {
        const region = regionById(store.get('region', 'paris')).id;
        return panel('h-cm-measures', 'Mesures anciennes par région', 'Les mesures changeaient d’une province, parfois d’un village à l’autre. Choisis la région, la valeur et l’unité : l’app donne l’équivalent en mètres, ares ou litres, et dans les autres mesures du lieu.',
            `<form class="form-grid" style="padding:0" id="h-cm-measure-form"><label class="span-2">Région / ville<select name="region">${REGIONS.map(r => `<option value="${r.id}"${r.id === region ? ' selected' : ''}>${esc(r.label)}</option>`).join('')}</select></label>
            <label>Valeur<input name="value" type="number" step="any" min="0" value="1"></label><label>Unité<select name="unit">${measureOptions(region)}</select></label></form>${out('h-cm-measure-out')}`,
            '≈ : valeur approchée ou variable selon la ville. Sources : loi du 19 frimaire an VIII (pied du roi, toise) et « Tables de comparaison entre les mesures anciennes et celles qui les remplacent » publiées par département (an X – 1812). Pour une commune précise, cherche la table de ton département aux archives départementales.');
    }
    function measureOptions(region) {
        const r = regionById(region);
        return Object.entries(KINDS).map(([k, label]) => {
            const list = r.units.filter(u => u[2] === k);
            if (!list.length) return '';
            return `<optgroup label="${esc(label)}">${list.map(u => `<option value="${u[0]}">${esc(u[1])}${u[4] ? ' ≈' : ''}</option>`).join('')}${METRIC[k].map(([id, name]) => `<option value="metric_${k}_${id}">${esc(name)}</option>`).join('')}</optgroup>`;
        }).join('');
    }
    function measureHtml(r) {
        if (!r) return 'Entre une valeur.';
        // assez de décimales pour garder 3 chiffres significatifs (1 ligne = 0,000 001 13 lieue, pas « 0 »)
        const digits = x => { const a = Math.abs(x); return !a ? 0 : a >= 100 ? 1 : a >= 1 ? 3 : Math.min(12, 2 - Math.floor(Math.log10(a)) + 1); };
        return `<div class="h-cm-result"><strong>${num(r.value, 4)} × ${esc(r.unit.label)} = ${approx(r.approx)}${num(r.metric[0], digits(r.metric[0]))} ${r.metric[1]}</strong>${r.unit.note ? `<small>${esc(r.unit.note)}</small>` : ''}${r.others.length ? `<ul class="h-cm-list">${r.others.map(o => `<li>${esc(o.label)} : <b>${approx(o.approx)}${num(o.value, digits(o.value))}</b></li>`).join('')}</ul>` : ''}</div>`;
    }

    function agePanel() {
        return panel('h-cm-age', 'Âge ↔ date de naissance', 'Les actes donnent souvent l’âge plutôt que la date de naissance. « 32 ans au décès le 12/03/1790 » → né entre deux dates. Ou l’inverse : l’âge exact à une date.',
            `<form class="form-grid" style="padding:0" id="h-cm-age-form"><label>Âge (en années)<input name="age" type="number" min="0" max="130" step="1" placeholder="32"></label>
            <label>Précision<select name="margin"><option value="0">exact (ans révolus)</option><option value="2">« environ » (± 2 ans)</option><option value="5">arrondi (± 5 ans)</option><option value="10">très vague (± 10 ans)</option></select></label>
            <label class="span-2">À la date de<input name="date" placeholder="12/03/1790, mars 1790 ou 1790" autocomplete="off"></label></form>${out('h-cm-age-out', 'Entre un âge et la date de l’acte.')}
            <form class="form-grid h-cm-sub" style="padding:0" id="h-cm-ageat-form"><label>Né(e) le<input name="birth" placeholder="13/03/1757" autocomplete="off"></label><label>Âge le<input name="date" placeholder="12/03/1790" autocomplete="off"></label></form>${out('h-cm-ageat-out', 'Entre une date de naissance et une autre date.')}`,
            'Dates du calendrier grégorien. Les âges des actes anciens sont souvent approximatifs : « environ 40 ans » peut cacher 35 ou 45 ans.');
    }
    function ageHtml(f) {
        const age = f.age.value.trim(), date = f.date.value.trim();
        if (!age || !date) return 'Entre un âge et la date de l’acte.';
        const r = birthRange(age, date, Number(f.margin.value));
        if (!r) return 'Date non reconnue : écris par exemple 12/03/1790, 12 mars 1790, mars 1790 ou 1790.';
        return `<div class="h-cm-result"><strong>Né(e) entre le ${dmy(r.from)} et le ${dmy(r.to)}</strong><span>soit vers ${r.from.y === r.to.y ? r.to.y : `${r.from.y}–${r.to.y}`}${r.lo !== r.hi ? ` (entre ${plural(r.lo, 'an')} et ${plural(r.hi, 'an')} révolus)` : ''}</span></div>`;
    }
    function ageAtHtml(f) {
        const b = f.birth.value.trim(), d = f.date.value.trim();
        if (!b || !d) return 'Entre une date de naissance et une autre date.';
        const r = dateDiff(b, d);
        if (!r) return 'Date non reconnue : écris par exemple 13/03/1757.';
        if (r.swapped) return 'La seconde date est avant la naissance.';
        return r.exact ? `<div class="h-cm-result"><strong>${ymdText(r)}</strong><span>soit ${plural(r.totalDays, 'jour')} de vie</span></div>`
            : `<div class="h-cm-result"><strong>Entre ${ymdText(r.min)} et ${ymdText(r.max)}</strong><small>Une des dates est incomplète.</small></div>`;
    }

    function diffPanel() {
        return panel('h-cm-diff', 'Écart entre deux dates', 'Combien de temps entre deux actes ? Années, mois, jours, nombre total de jours et de semaines. Une date incomplète (« mars 1790 », « 1802 ») donne un écart minimum et maximum.',
            `<form class="form-grid" style="padding:0" id="h-cm-diff-form"><label>Du<input name="a" placeholder="14/07/1789" autocomplete="off"></label><label>Au<input name="b" placeholder="9 novembre 1799" autocomplete="off"></label></form>${out('h-cm-diff-out', 'Entre deux dates.')}`);
    }
    function diffHtml(f) {
        const a = f.a.value.trim(), b = f.b.value.trim();
        if (!a || !b) return 'Entre deux dates.';
        const r = dateDiff(a, b);
        if (!r) return 'Date non reconnue : écris par exemple 14/07/1789, 14 juillet 1789, juillet 1789 ou 1789.';
        const order = r.swapped ? '<small>(la seconde date est la plus ancienne : écart compté à l’envers)</small>' : '';
        if (r.exact) return `<div class="h-cm-result"><strong>${ymdText(r)}</strong><span>${plural(r.totalDays, 'jour')} · ${plural(r.weeks, 'semaine')}${r.weekDays ? ` et ${plural(r.weekDays, 'jour')}` : ''}</span>${order}</div>`;
        return `<div class="h-cm-result"><strong>Entre ${ymdText(r.min)} et ${ymdText(r.max)}</strong><span>de ${num(r.min.totalDays, 0)} à ${plural(r.max.totalDays, 'jour')}</span><small>Du ${esc(partialText(r.from))} au ${esc(partialText(r.to))} : une date est incomplète.</small>${order}</div>`;
    }

    const CAL_MODES = [['france', 'France (julien jusqu’au 9 déc. 1582)'], ['rome', 'Rome (julien jusqu’au 4 oct. 1582)'], ['gregorian', 'Toujours grégorien'], ['julian', 'Toujours julien']];
    const WEEKDAY_HINTS = {
        dimanche: 'Jour du Seigneur : beaucoup de baptêmes (souvent le jour même ou le lendemain de la naissance) ; mariages rares.',
        lundi: 'Jour courant des mariages à la campagne sous l’Ancien Régime.',
        mardi: 'Jour préféré des mariages dans bien des paroisses sous l’Ancien Régime.',
        mercredi: 'Jour maigre dans certains diocèses : mariages moins fréquents.',
        jeudi: 'Jour ordinaire ; fêtes de l’Ascension et de la Fête-Dieu.',
        vendredi: 'Jour maigre (souvenir de la Passion) : on évitait de s’y marier.',
        samedi: 'Jour maigre jusqu’au XVIIIe siècle dans beaucoup de diocèses ; au XIXe, jour fréquent des mariages civils.',
    };
    function weekdayPanel() {
        return panel('h-cm-weekday', 'Jour de la semaine', 'Quel jour tombait une date ? Avant 1582, le calendrier julien s’applique : choisis l’usage.',
            `<form class="form-grid" style="padding:0" id="h-cm-weekday-form"><label>Date<input name="date" placeholder="14/07/1789" autocomplete="off"></label>
            <label>Calendrier<select name="mode">${CAL_MODES.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label>
            <label class="checkbox-line span-2"><input type="checkbox" name="hints" checked> Indices pour la recherche (baptêmes, mariages…)</label></form>${out('h-cm-weekday-out', 'Entre une date complète.')}`);
    }
    function weekdayHtml(f) {
        const p = parseDate(f.date.value);
        if (!f.date.value.trim()) return 'Entre une date complète.';
        if (!p?.d) return 'Il faut une date complète : jour, mois et année (ex. 14/07/1789).';
        if (f.mode.value === 'france' && p.y === 1582 && p.m === 12 && p.d > 9 && p.d < 20) return 'Ce jour n’a pas existé en France : le 9 décembre 1582 a été suivi du 20 décembre.';
        if (f.mode.value === 'rome' && p.y === 1582 && p.m === 10 && p.d > 4 && p.d < 15) return 'Ce jour n’a pas existé à Rome : le 4 octobre 1582 a été suivi du 15 octobre.';
        const r = weekday(p.y, p.m, p.d, f.mode.value);
        const other = r.calendar === 'julian' ? `soit le ${longDate(r.other)} dans le calendrier grégorien` : `soit le ${longDate(r.other)} dans le calendrier julien`;
        return `<div class="h-cm-result"><strong>C’était un ${r.weekday}</strong><span>${longDate(p)} (${r.calendar === 'julian' ? 'julien' : 'grégorien'}), ${other}</span>${f.hints.checked ? `<small>${esc(WEEKDAY_HINTS[r.weekday])}</small>` : ''}</div>`;
    }

    function feastsPanel() {
        const now = new Date();
        return panel('h-cm-feasts', 'Saint du jour et fêtes mobiles', 'Les fêtes mobiles dépendent de Pâques. Le saint du jour aide à comprendre un prénom : on donnait souvent celui du saint de la naissance ou du baptême.',
            `<form class="form-grid" style="padding:0" id="h-cm-feasts-form"><label>Année<input name="year" type="number" min="400" max="2400" value="1754"></label>
            <label>Comput<select name="cal"><option value="auto">auto (julien avant 1583)</option><option value="gregorian">grégorien</option><option value="julian">julien</option></select></label></form>
            <div id="h-cm-feasts-out" class="h-cm-table"></div>
            <form class="form-grid h-cm-sub" style="padding:0" id="h-cm-saint-form"><label>Jour<input name="day" type="number" min="1" max="31" value="${now.getDate()}"></label><label>Mois<select name="month">${MONTHS.map((m, i) => `<option value="${i + 1}"${i === now.getMonth() ? ' selected' : ''}>${m}</option>`).join('')}</select></label></form>${out('h-cm-saint-out', '…')}`,
            'Saints : calendrier usuel des almanachs français (celui du widget « Prénom et saint du jour ») ; il a varié selon les époques et les diocèses.');
    }
    function feastsHtml(f) {
        const y = Number(f.year.value) || 0;
        if (y < 400 || y > 2400) return '<p class="muted">Entre une année entre 400 et 2400.</p>';
        const julian = f.cal.value === 'julian' || (f.cal.value === 'auto' && y < 1583);
        return `<table class="data-table"><tbody>${movableFeasts(y, julian).map(x => `<tr${x.offset === 0 ? ' class="is-easter"' : ''}><td>${esc(x.name)}${x.note ? ` <small class="muted">${esc(x.note)}</small>` : ''}</td><td>${esc(x.weekday)} ${esc(longDate(x.date).replace(/ \d+$/, ''))}</td></tr>`).join('')}</tbody></table>${julian ? '<p class="muted">Dates dans le calendrier julien.</p>' : ''}`;
    }
    let saintSeq = 0;
    async function drawSaint(f) {
        const day = Number(f.day.value), month = Number(f.month.value), target = document.getElementById('h-cm-saint-out');
        if (!target) return;
        if (!day || day > monthDays(2000, month)) { target.textContent = 'Ce jour n’existe pas.'; return; }
        const seq = ++saintSeq;
        try {
            const r = await A().api('saint_of_day', {month, day});
            if (seq !== saintSeq) return;
            const people = (r.people || []).slice(0, 6);
            target.innerHTML = `<div class="h-cm-result"><strong>${esc(r.day_label)} : ${esc((r.saints || []).join(', ') || '—')}</strong>${people.length ? `<span>Dans ta base, nés ou baptisés ce jour : ${people.map(x => `<button type="button" class="table-link" data-h-person="${Number(x.person.id)}">${esc([x.person.first_name, x.person.last_name].filter(Boolean).join(' '))}</button>${x.named_after ? ' ✶' : ''}`).join(', ')}${r.people_total > people.length ? ` … (${r.people_total})` : ''}</span>${r.named_after ? '<small>✶ porte le prénom du saint du jour</small>' : ''}` : ''}</div>`;
        } catch (_) { if (seq === saintSeq) target.textContent = 'Saint du jour indisponible.'; }
    }

    function hoursPanel() {
        const month = Number(store.get('hours-month', '3'));
        return panel('h-cm-hours', 'Heures canoniques', 'Les actes datent parfois à « l’heure de vêpres » ou « à l’issue de la grand-messe ». Les heures de l’Église suivaient le soleil : le jour était coupé en 12 heures, plus longues en été qu’en hiver.',
            `<form class="form-grid" style="padding:0" id="h-cm-hours-form"><label class="span-2">Mention de l’acte<input name="text" placeholder="à l’heure de vêpres" autocomplete="off"></label>
            <label class="span-2">Mois<select name="month">${MONTHS.map((m, i) => `<option value="${i + 1}"${i + 1 === month ? ' selected' : ''}>${m}${i === 2 || i === 8 ? ' (équinoxe)' : i === 5 ? ' (jours les plus longs)' : i === 11 ? ' (jours les plus courts)' : ''}</option>`).join('')}</select></label></form>
            ${out('h-cm-hours-out')}<div id="h-cm-hours-table" class="h-cm-table"></div>`,
            'Heure solaire (midi = soleil au plus haut), calculée pour le centre de la France ; l’heure légale n’existe qu’à partir de 1891. Les horaires réels variaient selon les paroisses et les couvents.');
    }
    function hoursHtml(f) {
        const month = Number(f.month.value) || 3, text = f.text.value.trim();
        const table = `<table class="data-table"><tbody>${HOURS.map(([k, label, note]) => {
            const t = canonicalTime(k, month, 21), w = canonicalTime(k, 12, 21), s = canonicalTime(k, 6, 21);
            const time = k === 'angelus' ? `${clock(t, 0.5)}, 12 h, ${clock(canonicalTime('vepres', month, 21), 0.5)}` : `vers ${clock(t, 0.5)}`;
            return `<tr><td><strong>${esc(label)}</strong> <small class="muted">${esc(note)}</small></td><td>${time}${k === 'sexte' || k === 'angelus' ? '' : ` <small class="muted">(${clock(w, 0.5)} en hiver, ${clock(s, 0.5)} en été)</small>`}</td></tr>`;
        }).join('')}</tbody></table>`;
        let result = 'Écris la mention (« à l’heure de vêpres », « après complies »…) ou lis le tableau.';
        if (text) {
            const r = canonicalFromText(text, month);
            result = r ? `<div class="h-cm-result"><strong>${esc(r.label)} en ${MONTHS[r.month - 1]} : ${r.text}</strong><span>entre ${clock(canonicalTime(r.key, 12, 21), 0.5)} en décembre et ${clock(canonicalTime(r.key, 6, 21), 0.5)} en juin</span></div>`
                : 'Heure non reconnue : matines, laudes, prime, tierce, sexte, none, vêpres, complies ou angélus.';
        }
        return [result, table];
    }

    function coinsPanel() {
        return panel('h-cm-coins', 'Monnaies étrangères anciennes', 'Dans les contrats et inventaires, on trouve des pistoles, ducats, florins ou piastres. Leur valeur en livres tournois, monnaie de compte du royaume, selon l’époque.',
            `<form class="form-grid" style="padding:0" id="h-cm-coins-form"><label>Nombre<input name="qty" type="number" min="0" step="any" value="1"></label>
            <label>Époque<select name="period"><option value="17">XVIIe siècle (1640-1700)</option><option value="18" selected>XVIIIe siècle (1726-1789)</option></select></label>
            <label class="span-2">Monnaie<select name="coin">${COINS.map(c => `<option value="${c[0]}">${esc(c[1])}</option>`).join('')}</select></label></form>${out('h-cm-coins-out')}
            <details class="h-cm-details"><summary>Toutes les monnaies à cette époque</summary><div id="h-cm-coins-table" class="h-cm-table"></div></details>`,
            'Valeurs approchées (≈), d’après les ordonnances monétaires de Louis XIII à Louis XVI, le poids d’or ou d’argent fin des pièces et le cours du change à Paris (Savary, « Dictionnaire universel de commerce »). Les cours bougeaient souvent, surtout de 1689 à 1726 : c’est un ordre de grandeur.');
    }
    function coinsHtml(f) {
        const r = coinValue(f.coin.value, f.period.value, Number(f.qty.value) || 0);
        const head = r ? `<div class="h-cm-result"><strong>≈ ${esc(r.text)} tournois</strong>${Number.isInteger(r.livres) ? '' : `<span>soit ≈ ${num(r.livres, 2)} livres</span>`}${r.note ? `<small>${esc(r.note)}</small>` : ''}</div>` : 'Cette monnaie n’avait pas cours en France à cette époque.';
        const table = `<table class="data-table"><tbody>${COINS.map(c => { const v = coinValue(c[0], f.period.value); return `<tr><td>${esc(c[1])}</td><td>${v ? `≈ ${esc(v.text)}` : '—'}</td></tr>`; }).join('')}</tbody></table>`;
        return [head, table];
    }

    function generationsPanel() {
        return panel('h-cm-gen', 'Calculateur de générations', 'Combien de générations entre deux années ? En moyenne 25 à 33 ans par génération : environ 30 ans en lignée masculine, 27 ans en lignée féminine.',
            `<form class="form-grid" style="padding:0" id="h-cm-gen-form"><label>Année (ta naissance)<input name="y1" type="number" placeholder="1980"></label><label>Année (l’ancêtre)<input name="y2" type="number" placeholder="1700"></label></form>${out('h-cm-gen-out', 'Entre deux années.')}
            <form class="form-grid h-cm-sub" style="padding:0" id="h-cm-genback-form"><label>Générations en arrière<input name="n" type="number" min="1" max="40" value="8"></label><label>Depuis l’année<input name="from" type="number" value="1980"></label></form>${out('h-cm-genback-out')}`,
            'Le nombre d’ancêtres double à chaque génération en théorie ; en pratique il y en a moins, car des cousins se sont mariés entre eux (l’implexe).');
    }
    function genHtml(f) {
        const y1 = f.y1.value.trim(), y2 = f.y2.value.trim();
        if (!y1 || !y2) return 'Entre deux années.';
        const r = generationsBetween(y1, y2);
        if (!r || !r.years) return 'Entre deux années différentes.';
        return `<div class="h-cm-result"><strong>Environ ${num(r.min, 0)} à ${num(r.max, 0)} générations</strong><span>${plural(r.years, 'an')} : ≈ ${num(r.male, 1)} générations en lignée masculine (30 ans), ≈ ${num(r.female, 1)} en lignée féminine (27 ans)</span></div>`;
    }
    function genBackHtml(f) {
        const n = Number(f.n.value), from = Number(f.from.value);
        if (!n || !from || n < 1 || n > 40) return 'Entre un nombre de générations (1 à 40) et une année.';
        const r = generationsBack(n, from), a = ancestors(n);
        const label = n === 1 ? 'parents' : n === 2 ? 'grands-parents' : n === 3 ? 'arrière-grands-parents' : `ancêtres de la génération ${n}`;
        return `<div class="h-cm-result"><strong>${plural(n, 'génération')} en arrière → nés vers ${Math.round(r.from)}–${Math.round(r.to)}</strong><span>≈ ${Math.round(r.male)} en lignée masculine, ≈ ${Math.round(r.female)} en lignée féminine</span><span>${num(a.at, 0)} ${label} en théorie (Sosa ${num(a.sosaFrom, 0)} à ${num(a.sosaTo, 0)}) ; ${num(a.total, 0)} ancêtres en tout jusqu’à cette génération</span></div>`;
    }

    ext.calendarPanels.push(() => measuresPanel() + agePanel() + diffPanel() + weekdayPanel() + feastsPanel() + hoursPanel() + coinsPanel() + generationsPanel());
    ext.afterCalendar.push(() => {
        const $ = id => document.getElementById(id);
        if (!$('h-cm-measures')) return;
        const live = (formId, fn) => { const f = $(formId); if (!f) return; f.addEventListener('submit', e => e.preventDefault()); const run = () => fn(f); f.addEventListener('input', run); f.addEventListener('change', run); run(); };
        live('h-cm-measure-form', f => { $('h-cm-measure-out').innerHTML = measureHtml(convertMeasure(f.value.value || 0, f.region.value, f.unit.value)); });
        $('h-cm-measure-form').region.addEventListener('change', e => { const f = e.target.form; store.set('region', f.region.value); f.unit.innerHTML = measureOptions(f.region.value); $('h-cm-measure-out').innerHTML = measureHtml(convertMeasure(f.value.value || 0, f.region.value, f.unit.value)); });
        live('h-cm-age-form', f => { $('h-cm-age-out').innerHTML = ageHtml(f); });
        live('h-cm-ageat-form', f => { $('h-cm-ageat-out').innerHTML = ageAtHtml(f); });
        live('h-cm-diff-form', f => { $('h-cm-diff-out').innerHTML = diffHtml(f); });
        live('h-cm-weekday-form', f => { $('h-cm-weekday-out').innerHTML = weekdayHtml(f); });
        live('h-cm-feasts-form', f => { $('h-cm-feasts-out').innerHTML = feastsHtml(f); });
        const sf = $('h-cm-saint-form');
        if (sf) { sf.addEventListener('submit', e => e.preventDefault()); let t = 0; const go = () => { clearTimeout(t); t = setTimeout(() => drawSaint(sf), 200); }; sf.addEventListener('input', go); sf.addEventListener('change', go); drawSaint(sf); }
        live('h-cm-hours-form', f => { store.set('hours-month', f.month.value); const [r, table] = hoursHtml(f); $('h-cm-hours-out').innerHTML = r; $('h-cm-hours-table').innerHTML = table; });
        live('h-cm-coins-form', f => { const [r, table] = coinsHtml(f); $('h-cm-coins-out').innerHTML = r; $('h-cm-coins-table').innerHTML = table; });
        live('h-cm-gen-form', f => { $('h-cm-gen-out').innerHTML = genHtml(f); });
        live('h-cm-genback-form', f => { $('h-cm-genback-out').innerHTML = genBackHtml(f); });
    });
})();
