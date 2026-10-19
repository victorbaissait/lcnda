/* LCNDA — 📸 Cartes de photos : le temps (sans rien d'autre, testable seul : tests/test-photomaps.js).
 *  - les instants sont des millisecondes « heure locale de prise de vue » rangées comme si c'était du temps universel
 *    (Date.UTC) : 14 h 30 sur la photo reste 14 h 30 partout, quel que soit le fuseau de l'ordinateur qui regarde ;
 *  - parseDate(texte) : une date C4 (« 7 mai 1925 à 14 h 30 », « 12/08/2019 18:42:07 », « vers 1950 », « entre 1880 et 1885 »)
 *    → {from, to, t, time, prec} ;
 *  - parseStep(texte) : un pas de lecture (« 3j », « 1 mois 12 j 3 h 49 min 28 s », « 2 ans 6 mois », « 90 min ») → {y, mo, w, d, h, mi, s, label} ;
 *  - addStep(t, pas, sens) : mois et années comptés dans le calendrier (31 janvier + 1 mois = 28 ou 29 février) ;
 *  - unitFor(durée) / floorTo / nextTick / ticks : une frise qui passe des siècles aux secondes selon le zoom.
 */
(() => {
    'use strict';
    const DAY = 864e5, HOUR = 36e5, MIN = 6e4, SEC = 1e3;
    const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const MONTHS_S = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/’/g, "'").replace(/,/g, ' ').replace(/\s+/g, ' ').trim();

    /** Date.UTC qui accepte les années 0 à 99 (sinon comprises comme 1900 à 1999) */
    function utc(y, mo = 1, d = 1, h = 0, mi = 0, s = 0) { const x = new Date(Date.UTC(2000, mo - 1, d, h, mi, s)); x.setUTCFullYear(y); return x.getTime(); }
    function parts(t) { const x = new Date(t); return {y: x.getUTCFullYear(), mo: x.getUTCMonth() + 1, d: x.getUTCDate(), h: x.getUTCHours(), mi: x.getUTCMinutes(), s: x.getUTCSeconds()}; }
    const dim = (y, mo) => new Date(utc(y, mo + 1, 1) - DAY).getUTCDate();
    /** « 2023-07-14 » ou « 2023-07-14 10:22:05 » → ms */
    function isoToT(iso) {
        const m = String(iso || '').match(/^(-?\d{1,4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
        return m ? utc(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) : NaN;
    }
    const pad = n => String(n).padStart(2, '0');
    function tToIso(t, withTime = false) { const p = parts(t); return `${String(p.y).padStart(4, '0')}-${pad(p.mo)}-${pad(p.d)}${withTime ? ` ${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}` : ''}`; }

    /* ─── Dates C4 ─── */
    const MONTH_KEYS = [['janv', 1], ['jan', 1], ['fevr', 2], ['fev', 2], ['mars', 3], ['mar', 3], ['avr', 4], ['mai', 5], ['juin', 6], ['juil', 7], ['aout', 8], ['sept', 9], ['sep', 9], ['oct', 10], ['nov', 11], ['dec', 12]];
    const monthOf = w => { w = w.replace(/\.$/, ''); if (/^\d{1,2}$/.test(w)) return +w; const k = MONTH_KEYS.find(([p]) => w.startsWith(p)); return k ? k[1] : 0; };
    const okY = y => y >= 1 && y <= 2100;
    function oneDate(s) {
        s = s.trim().replace(/^le\s+/, ''); let m;
        const day = (d, mo, y) => (okY(y) && mo >= 1 && mo <= 12 && d >= 1 && d <= dim(y, mo) ? {from: utc(y, mo, d), to: utc(y, mo, d) + DAY - 1, prec: 'day'} : null);
        const month = (mo, y) => (okY(y) && mo >= 1 && mo <= 12 ? {from: utc(y, mo, 1), to: utc(y, mo + 1, 1) - 1, prec: 'month'} : null);
        if ((m = s.match(/^(\d{4})[:\-/](\d{1,2})[:\-/](\d{1,2})$/))) return day(+m[3], +m[2], +m[1]);
        if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{3,4})$/))) return day(+m[1], +m[2], +m[3]);
        if ((m = s.match(/^(\d{1,2})[/.-](\d{4})$/))) return month(+m[1], +m[2]);
        if ((m = s.match(/^(1er|\d{1,2})\s+([a-z0-9]+\.?)\s+(\d{3,4})$/))) { const mo = monthOf(m[2]); return mo ? day(m[1] === '1er' ? 1 : +m[1], mo, +m[3]) : null; }
        if ((m = s.match(/^([a-z]+\.?)\s+(\d{3,4})$/))) { const mo = monthOf(m[1]); return mo ? month(mo, +m[2]) : null; }
        if ((m = s.match(/^(?:les\s+)?annees\s+(\d{3})0$/)) || (m = s.match(/^(\d{3})0s$/))) { const y = +m[1] * 10; return okY(y) ? {from: utc(y, 1, 1), to: utc(Math.min(2100, y + 9) + 1, 1, 1) - 1, prec: 'decade'} : null; }
        if ((m = s.match(/^(?:de\s+l'?)?an\s+([ivx]+|\d{1,2})$/))) { // calendrier républicain : de septembre à septembre
            const r = m[1].toUpperCase(), V = {I: 1, V: 5, X: 10}; let n = /^\d+$/.test(r) ? +r : 0;
            if (!n) for (let i = 0; i < r.length; i++) n += V[r[i]] < (V[r[i + 1]] || 0) ? -V[r[i]] : V[r[i]];
            return n >= 1 && n <= 14 ? {from: utc(1791 + n, 9, 22), to: utc(1792 + n, 9, 22) - 1, prec: 'year'} : null;
        }
        if ((m = s.match(/^(\d{3,4})$/))) { const y = +m[1]; return okY(y) ? {from: utc(y, 1, 1), to: utc(y + 1, 1, 1) - 1, prec: 'year'} : null; }
        return null;
    }
    /**
     * Une date C4 → {from, to, t, prec, time} (ms) ou null. t = l'instant qui la représente sur la frise : l'heure exacte si
     * elle est donnée, sinon le milieu de la période (une journée sans heure : midi).
     */
    function parseDate(raw) {
        const s = fold(raw); if (!s) return null; let m;
        if ((m = s.match(/^(?:entre|de|du)\s+(.+?)\s+(?:et|a|au|-)\s+(.+)$/))) { const a = oneDate(m[1]), b = oneDate(m[2]); return a && b && a.from <= b.to ? {from: a.from, to: b.to, prec: 'range', t: (a.from + b.to) / 2} : null; }
        if ((m = s.match(/^(?:vers|environ|env\.?|circa|ca\.?|c\.|~)\s*(.+)$/))) { const d = oneDate(m[1]); return d ? {...d, prec: 'approx', t: (d.from + d.to) / 2} : null; }
        if ((m = s.match(/^(?:avant|av\.?)\s+(.+)$/))) { const d = oneDate(m[1]); return d ? {from: d.from, to: d.from, prec: 'before', t: d.from} : null; }
        if ((m = s.match(/^(?:apres|ap\.?|depuis)\s+(.+)$/))) { const d = oneDate(m[1]); return d ? {from: d.to, to: d.to, prec: 'after', t: d.to} : null; }
        if ((m = s.match(/^(.+?)(?:\s+a|\s+vers|\s*t|\s)\s*(\d{1,2})\s*(?:h|:)\s*(?:(\d{1,2})\s*(?:min|mn|m|:)?\s*(?:(\d{1,2})\s*s?)?)?\s*$/))) {
            const d = oneDate(m[1]), h = +m[2], mi = +(m[3] || 0), se = +(m[4] || 0);
            if (d && d.prec === 'day' && h <= 23 && mi <= 59 && se <= 59) { const t = d.from + h * HOUR + mi * MIN + se * SEC; return {from: d.from, to: d.to, prec: 'time', t, time: true}; }
            if (d) return null;
        }
        const d = oneDate(s); return d ? {...d, t: d.prec === 'day' ? d.from + 12 * HOUR : (d.from + d.to) / 2} : null;
    }
    /** l'instant d'un élément de carte : heure exacte (taken) sinon milieu de sa période ; {t, exact, prec} ou null */
    function itemTime(it) {
        if (it.taken) { const t = isoToT(it.taken); if (Number.isFinite(t)) return {t, exact: true, prec: 'time'}; }
        if (it.from) {
            const a = isoToT(it.from), b = isoToT(it.to || it.from) + DAY - 1;
            if (Number.isFinite(a)) { const one = (it.to || it.from) === it.from; return {t: one ? a + 12 * HOUR : (a + b) / 2, exact: false, prec: one ? 'day' : 'period'}; }
        }
        return null;
    }

    /* ─── Pas de lecture : « 1 mois 12 j 3 h 49 min 28 s » ─── */
    const UNITS = [
        ['y', /^(ans?|annees?|a|y|yrs?|years?)$/], ['mo', /^(mois|mo)$/], ['w', /^(semaines?|sem|w)$/], ['d', /^(jours?|j|d|days?)$/],
        ['h', /^(heures?|hr?s?|h)$/], ['mi', /^(minutes?|mins?|mn|m)$/], ['s', /^(secondes?|secs?|s)$/],
    ];
    const UNIT_LABEL = {y: ['an', 'ans'], mo: ['mois', 'mois'], w: ['semaine', 'semaines'], d: ['jour', 'jours'], h: ['h', 'h'], mi: ['min', 'min'], s: ['s', 's']};
    function stepLabel(st) { return ['y', 'mo', 'w', 'd', 'h', 'mi', 's'].filter(k => st[k]).map(k => `${st[k].toLocaleString('fr-FR')} ${UNIT_LABEL[k][st[k] > 1 ? 1 : 0]}`).join(' '); }
    /** → {ok: true, step: {y, mo, w, d, h, mi, s}, label} ou {ok: false, error} ou null (vide) */
    function parseStep(raw) {
        let s = fold(String(raw ?? '').replace(/(\d),(\d)/g, '$1.$2')).replace(/\bet\b/g, ' ').replace(/(\d)\s*h\s*(\d{1,2})(?!\s*[a-z\d])/g, '$1 h $2 min'); // « 1h30 »
        if (!s) return null;
        const st = {y: 0, mo: 0, w: 0, d: 0, h: 0, mi: 0, s: 0};
        const re = /(\d+(?:[.,]\d+)?)\s*([a-z]+)/g; let m, rest = s, any = false;
        while ((m = re.exec(s))) {
            const u = UNITS.find(([, r]) => r.test(m[2]));
            if (!u) return {ok: false, error: `je ne comprends pas « ${m[2]} » (écris par exemple 3 j, 2 h, 1 mois 12 j, 90 min)`};
            const n = Number(m[1].replace(',', '.'));
            if (!Number.isFinite(n) || n < 0) return {ok: false, error: 'nombre impossible'};
            if (!Number.isInteger(n) && ['y', 'mo'].includes(u[0])) return {ok: false, error: 'les mois et les années se comptent en nombres entiers (écris « 1 mois 15 j » plutôt que « 1,5 mois »)'};
            if (Number.isInteger(n)) st[u[0]] += n;
            else { const ms = n * {w: 7 * DAY, d: DAY, h: HOUR, mi: MIN, s: SEC}[u[0]]; const add = splitMs(ms); Object.keys(add).forEach(k => { st[k] += add[k]; }); }
            any = true; rest = rest.replace(m[0], ' ');
        }
        if (rest.replace(/[\s:+]/g, '') !== '') return {ok: false, error: /\d/.test(rest) ? 'un nombre sans unité : ajoute j, h, min, s, mois ou ans' : `je ne comprends pas « ${rest.trim()} »`};
        if (!any || !Object.values(st).some(Boolean)) return {ok: false, error: 'un pas de 0 n’avance pas : écris par exemple 1 j'};
        if (st.y > 5000 || st.d + st.w * 7 > 2e6 || st.h > 5e7 || st.mi > 3e9) return {ok: false, error: 'pas trop grand'};
        return {ok: true, step: st, label: stepLabel(st)};
    }
    function splitMs(ms) { const out = {d: 0, h: 0, mi: 0, s: 0}; out.d = Math.floor(ms / DAY); ms -= out.d * DAY; out.h = Math.floor(ms / HOUR); ms -= out.h * HOUR; out.mi = Math.floor(ms / MIN); ms -= out.mi * MIN; out.s = Math.round(ms / SEC); return out; }
    /** t + pas (sens = 1) ou t − pas (sens = -1) ; années et mois dans le calendrier, le jour ramené à la fin du mois si besoin */
    function addStep(t, st, dir = 1) {
        const p = parts(t);
        const months = dir * ((st.y || 0) * 12 + (st.mo || 0));
        if (months) {
            const total = p.y * 12 + (p.mo - 1) + months, y = Math.floor(total / 12), mo = total - y * 12 + 1;
            t = utc(y, mo, Math.min(p.d, dim(y, mo)), p.h, p.mi, p.s) + (t % SEC + SEC) % SEC;
        }
        return t + dir * (((st.w || 0) * 7 + (st.d || 0)) * DAY + (st.h || 0) * HOUR + (st.mi || 0) * MIN + (st.s || 0) * SEC);
    }
    /** durée moyenne d'un pas (pour la vitesse et les frises) */
    const stepMs = st => ((st.y || 0) * 365.2425 + (st.mo || 0) * 30.436875 + (st.w || 0) * 7 + (st.d || 0)) * DAY + (st.h || 0) * HOUR + (st.mi || 0) * MIN + (st.s || 0) * SEC;

    /* ─── Frise : unités qui suivent le zoom ─── */
    const TICK_UNITS = [
        ['s', 1], ['s', 5], ['s', 15], ['s', 30], ['mi', 1], ['mi', 5], ['mi', 15], ['mi', 30], ['h', 1], ['h', 3], ['h', 6], ['h', 12],
        ['d', 1], ['d', 2], ['w', 1], ['mo', 1], ['mo', 3], ['mo', 6], ['y', 1], ['y', 2], ['y', 5], ['y', 10], ['y', 25], ['y', 50], ['y', 100], ['y', 250], ['y', 500],
    ];
    const unitMs = ([u, n]) => n * {s: SEC, mi: MIN, h: HOUR, d: DAY, w: 7 * DAY, mo: 30.436875 * DAY, y: 365.2425 * DAY}[u];
    /** la plus petite unité qui donne au plus maxCount graduations sur la durée */
    function unitFor(span, maxCount = 10) { return TICK_UNITS.find(u => span / unitMs(u) <= maxCount) || TICK_UNITS[TICK_UNITS.length - 1]; }
    function floorTo(t, [u, n]) {
        const p = parts(t);
        if (u === 'y') return utc(Math.floor(p.y / n) * n, 1, 1);
        if (u === 'mo') { const m0 = Math.floor((p.mo - 1) / n) * n; return utc(p.y, m0 + 1, 1); }
        if (u === 'w') { const d0 = utc(p.y, p.mo, p.d), wd = (new Date(d0).getUTCDay() + 6) % 7; return d0 - wd * DAY; }
        if (u === 'd') return utc(p.y, p.mo, p.d);
        const size = unitMs([u, n]); const day = utc(p.y, p.mo, p.d); return day + Math.floor((t - day) / size) * size;
    }
    function nextTick(t, [u, n]) {
        if (u === 'y') return addStep(t, {y: n});
        if (u === 'mo') return addStep(t, {mo: n});
        return t + unitMs([u, n]);
    }
    function ticks(t0, t1, unit) { const out = []; let t = floorTo(t0, unit); for (let i = 0; t <= t1 && i < 2000; i++) { if (t >= t0) out.push(t); t = nextTick(t, unit); } return out; }
    /** l'étiquette d'une graduation, précise comme l'unité */
    function tickLabel(t, [u]) {
        const p = parts(t);
        if (u === 'y') return String(p.y);
        if (u === 'mo') return p.mo === 1 ? `${MONTHS_S[0]} ${p.y}` : MONTHS_S[p.mo - 1];
        if (u === 'd' || u === 'w') return p.d === 1 ? `1er ${MONTHS_S[p.mo - 1]}` : `${p.d} ${MONTHS_S[p.mo - 1]}`;
        if (u === 'h') return p.h === 0 ? `${p.d} ${MONTHS_S[p.mo - 1]}` : `${p.h} h`;
        if (u === 'mi') return `${p.h} h ${pad(p.mi)}`;
        return `${p.h}:${pad(p.mi)}:${pad(p.s)}`;
    }
    /** une date lisible, avec l'heure si on la connaît (précision : 'time' | 'day' | 'month' | 'year') */
    function label(t, prec = 'day') {
        if (!Number.isFinite(t)) return '';
        const p = parts(t), d = `${p.d === 1 ? '1er' : p.d} ${MONTHS[p.mo - 1]} ${p.y}`;
        if (prec === 'year') return String(p.y);
        if (prec === 'month') return `${MONTHS[p.mo - 1]} ${p.y}`;
        if (prec === 'time') return `${d} · ${p.h} h ${pad(p.mi)}${p.s ? ` min ${pad(p.s)} s` : ''}`;
        return d;
    }
    /** pour les regroupements de l'histogramme : 'auto' | 'h' | 'd' | 'mo' | 'y' */
    function bucketUnit(choice, span) {
        if (choice === 'y') return ['y', 1]; if (choice === 'mo') return ['mo', 1]; if (choice === 'd') return ['d', 1]; if (choice === 'h') return ['h', 1];
        return unitFor(span, 90);
    }

    window.LCNDA_PMTIME = {DAY, HOUR, MIN, SEC, utc, parts, isoToT, tToIso, parseDate, itemTime, parseStep, stepLabel, addStep, stepMs, unitFor, floorTo, nextTick, ticks, tickLabel, label, bucketUnit, dim};
})();
