/**
 * 🕰️ La vraie heure de l'acte, ☄️ Il a pu voir… (comètes et aurores), et les données du 🌌 ciel de naissance.
 *
 *  - 🕰️ À côté de l'heure écrite dans un acte (« Heure de l'événement »), ce qu'elle voulait dire : l'heure du soleil de la commune
 *    avant l'heure nationale (calculée avec la longitude), l'heure de Paris (1891–1911), l'heure de Greenwich (1911), les heures
 *    d'été, l'heure allemande (zone occupée 1940–1944, Alsace-Moselle 1871–1918)… et la même heure à nos montres d'aujourd'hui.
 *    Règles : extrait de la base des fuseaux horaires IANA (tzdata, domaine public) — assets/data/tz-europe-amerique.json,
 *    fabriqué par scripts/ciel-heure/build-tz.py. Montré dans la fenêtre de l'événement (sous la case) et dans la liste des
 *    événements de la fiche.
 *  - ☄️ Les grandes comètes vues à l'œil nu depuis l'Europe et les grandes aurores vues en France : assets/data/comets-aurores.json
 *    (chaque ligne a sa source). Bloc de fiche « ☄️ Il a pu voir… » (à partir de 5 ans, de son vivant) et colonne « Contexte »
 *    de la Chronologie (à côté de « 🌍 Le monde autour »).
 *  - 🌌 Pour le ciel de naissance (heritage-tresors-ciel.js) : la position d'une comète une nuit donnée (éléments d'orbite de la liste).
 * Données chargées seulement quand on en a besoin. Calculs : lib/ciel_heure.php (GET ciel_heure_ctx) lit la date et le lieu.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const once = {};
    const load = (key, url) => (once[key] ||= fetch(url).then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))).catch(e => { delete once[key]; throw e; }));
    const loadTz = () => load('tz', 'assets/data/tz-europe-amerique.json');
    const loadSkyEvents = () => load('ev', 'assets/data/comets-aurores.json');

    /* ═════════════════ 🕰️ les fuseaux ═════════════════ */
    const fold = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]+/g, ' ').trim();
    const COUNTRIES = [['FR', /^(france|fr|republique francaise|royaume de france|empire francais)$/], ['BE', /^(belgique|belgium|belgie|be)$/], ['CH', /^(suisse|switzerland|schweiz|svizzera|ch)$/],
        ['LU', /^(luxembourg|lu|letzebuerg)$/], ['DE', /^(allemagne|germany|deutschland|de|prusse|baviere|wurtemberg|saxe|bade)$/], ['IT', /^(italie|italy|italia|it|piemont|sardaigne|savoie italienne)$/],
        ['ES', /^(espagne|spain|espana|es)$/], ['GB', /^(royaume uni|united kingdom|uk|gb|angleterre|england|ecosse|scotland|pays de galles|wales|grande bretagne|great britain|irlande du nord|northern ireland)$/],
        ['US', /^(etats unis|etats unis d amerique|usa|us|united states|united states of america|amerique)$/], ['CA', /^(canada|quebec|ontario)$/]];
    // la longitude des villes dont l'heure a servi de référence (l'Observatoire de Paris : 2° 20′ 14″ E)
    const CAP = {FR: ['Paris', 2.3372], BE: ['Bruxelles', 4.3517], CH: ['Berne', 7.4474], LU: ['Luxembourg', 6.1296], DE: ['Berlin', 13.4050], IT: ['Rome', 12.4964], ES: ['Madrid', -3.7038], GB: ['Greenwich', 0]};
    const NAT = {FR: 'la France', BE: 'la Belgique', CH: 'la Suisse', LU: 'le Luxembourg', DE: 'l’Allemagne', IT: 'l’Italie', ES: 'l’Espagne', GB: 'le Royaume-Uni', US: 'les États-Unis', CA: 'le Canada'};
    /** le pays d'un lieu (le nom du pays, sinon les coordonnées pour les pays proches) */
    function countryOf(pl) {
        const c = fold(pl?.country);
        for (const [k, re] of COUNTRIES) if (re.test(c)) return k;
        if (c) return '';
        const lat = Number(pl?.lat), lng = Number(pl?.lng); if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';
        if (lat >= 49.44 && lat <= 50.19 && lng >= 5.73 && lng <= 6.53) return 'LU';
        if (lat >= 45.8 && lat <= 47.81 && lng >= 6.0 && lng <= 10.5 && !(lng < 7.0 && lat > 47.5)) return 'CH';
        if (lat >= 50.1 && lat <= 51.51 && lng >= 2.55 && lng <= 6.4 && lat > 50.75 - (lng - 2.55) * 0.12) return 'BE';
        if (lat >= 41.3 && lat <= 51.1 && lng >= -5.2 && lng <= 9.6) return 'FR';
        return '';
    }
    // la ligne de démarcation de 1940 (tracé simplifié, le même que la météo) : la zone occupée est au nord et à l'ouest
    const OCC = [[-1.24, 43.16], [-0.85, 43.6], [-0.5, 43.9], [-0.24, 44.55], [-0.24, 44.92], [0.15, 45.65], [0.67, 46.01], [0.85, 46.6], [1.0, 47.13], [2.07, 47.22], [2.5, 46.72], [3.33, 46.57], [4.1, 46.45], [4.85, 46.78], [5.49, 47.1], [6.0, 46.4], [9.0, 49.0], [9.0, 52.0], [-6.0, 52.0], [-6.0, 43.3], [-1.8, 43.3]];
    const occupied = (lat, lng) => { let inside = false; for (let i = 0, j = OCC.length - 1; i < OCC.length; j = i++) { const [xi, yi] = OCC[i], [xj, yj] = OCC[j]; if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / ((yj - yi) || 1e-9) + xi) inside = !inside; } return inside; };
    const ALSACE = /\b(bas rhin|haut rhin|alsace|moselle)\b/;
    /** le fuseau tzdata d'un lieu, à une date (AAAA-MM-JJ) */
    function zoneFor(pl, date = '') {
        const cc = countryOf(pl), lat = Number(pl?.lat), lng = Number(pl?.lng);
        switch (cc) {
            case 'FR': {
                const dep = fold([pl?.county, pl?.state, pl?.subdivision].filter(Boolean).join(' '));
                if (ALSACE.test(dep) && !/meurthe/.test(dep)) return 'Europe/Paris~alsace';
                if (date >= '1940-06-14' && date < '1942-11-03' && Number.isFinite(lat) && !occupied(lat, lng)) return 'Europe/Paris~libre';
                return 'Europe/Paris';
            }
            case 'BE': return 'Europe/Brussels';
            case 'CH': return 'Europe/Zurich';
            case 'LU': return 'Europe/Luxembourg';
            case 'DE': return 'Europe/Berlin';
            case 'IT': return 'Europe/Rome';
            case 'ES': return 'Europe/Madrid';
            case 'GB': return 'Europe/London';
            case 'US': if (!Number.isFinite(lng)) return '';
                if (/arizona/.test(fold(pl?.state))) return 'America/Phoenix';
                return lng > -87.5 ? 'America/New_York' : lng > -101.5 ? 'America/Chicago' : lng > -114.5 ? 'America/Denver' : 'America/Los_Angeles';
            case 'CA': return Number.isFinite(lng) && lng > -90 ? 'America/Toronto' : '';
        }
        return '';
    }
    const rowAt = (rows, u) => { let lo = 0, hi = rows.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (rows[mid][0] == null || rows[mid][0] <= u) lo = mid; else hi = mid - 1; } return rows[lo]; };
    /** l'année (heure du lieu) où une règle commence */
    const localYear = (rows, row) => { const k = rows.indexOf(row), before = k > 0 ? rows[k - 1][1] : row[1]; return new Date((row[0] + before / 60 + 1) * 60000).getUTCFullYear(); };
    /** l'heure locale (minutes depuis 1970, « au mur ») → la minute UTC et la ligne de règle */
    function toUtc(rows, L) { let r = rowAt(rows, L), u = L - r[1] / 60; r = rowAt(rows, u); u = L - r[1] / 60; const r2 = rowAt(rows, u); if (r2 !== r) { u = L - r2[1] / 60; r = r2; } return [u, r]; }
    const CITY = {PMT: 'Paris', RMT: 'Rome', BMT: off => (off === 1050 ? 'Bruxelles' : 'Berne')};
    // l'heure allemande (occupations et annexion) : [fuseau, de, à, phrase]
    const GERMAN = [['Europe/Paris', '1940-06-14', '1944-08-25', 'occ'], ['Europe/Paris~libre', '1942-11-02', '1944-08-25', 'sud'], ['Europe/Paris~alsace', '1871-05-10', '1918-11-11', 'alsace'],
        ['Europe/Paris~alsace', '1940-06-14', '1944-11-23', 'occ'], ['Europe/Brussels', '1914-11-08', '1918-11-11', 'be14'], ['Europe/Brussels', '1940-05-20', '1944-09-03', 'occ'], ['Europe/Luxembourg', '1940-05-14', '1944-09-18', 'occ']];
    const pad = n => String(n).padStart(2, '0');
    const hm = min => { min = Math.round(min); const m = ((min % 1440) + 1440) % 1440; return m % 60 ? `${Math.floor(m / 60)} h ${pad(m % 60)}` : `${Math.floor(m / 60)} h`; };
    const ymd = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    const utcLabel = s => { const m = Math.round(s / 60), h = Math.floor(Math.abs(m) / 60), r = Math.abs(m) % 60; return `UTC${m < 0 ? '−' : '+'}${h}${r ? ':' + pad(r) : ''}`; };
    const secWords = s => i18n('{m} min {s} s', {m: String(Math.floor(s / 60)), s: String(s % 60)}).replace(/ 0 s$/, '');
    const minWords = m => { m = Math.round(Math.abs(m)); return m >= 60 ? (m % 60 ? i18n('{h} h {m} min', {h: String(Math.floor(m / 60)), m: String(m % 60)}) : i18n('{h} h', {h: String(Math.floor(m / 60))})) : i18n('{m} min', {m: String(m)}); };

    /**
     * L'heure écrite dans un acte → ce qu'elle voulait dire. ev : {date: 'AAAA-MM-JJ', time: 'HH:MM', place: {name, country, county, state, lat, lng}}
     * → {zone, kind ('soleil' | 'ville' | 'legale' | 'ete' | 'allemande' | 'libre'), line, sentence, utc: 'AAAA-MM-JJTHH:MM', solar (heure solaire du lieu, en heures), today: {min, summer}} ou null
     */
    function realHour(ev, TZ) {
        const m = String(ev?.time || '').match(/^(\d{1,2}):(\d{2})/), d = String(ev?.date || '').match(/^(-?\d{3,4})-(\d{2})-(\d{2})$/), pl = ev?.place || {};
        if (!m || !d || !TZ?.zones) return null;
        const zone = zoneFor(pl, ev.date), rows = TZ.zones[zone]; if (!rows) return null;
        const lat = Number(pl.lat), lng = Number(pl.lng), hasLng = pl.lng != null && pl.lng !== '' && Number.isFinite(lng);
        const [Y, Mo, D] = [Number(d[1]), Number(d[2]), Number(d[3])], hh = Number(m[1]), mi = Number(m[2]);
        const L = Date.UTC(Y, Mo - 1, D, hh, mi) / 60000, cc = countryOf(pl), place = String(pl.name || '').replace(/\s*\(.*$/, '').trim() || i18n('ce lieu');
        let [u, r] = toUtc(rows, L), kind, off = r[1], sentence = '', parts = [];
        const written = hm(hh * 60 + mi);
        if (r[3] === 'LMT') {
            if (!hasLng) return null;
            kind = 'soleil'; off = lng * 240; u = L - lng * 4;
            const end = rows.find(x => x[0] != null && x[3] !== 'LMT'), endY = end ? localYear(rows, end) : null;
            parts.push(i18n('{h} (heure du soleil à {place})', {h: written, place}));
            // l'heure de la ville de référence qui a suivi (Paris, Bruxelles, Berne, Rome), sinon l'heure de la capitale
            const cap = CAP[cc];
            if (end && CITY[end[3]]) { const city = typeof CITY[end[3]] === 'function' ? CITY[end[3]](end[1]) : CITY[end[3]]; if (fold(city) !== fold(place)) parts.push(i18n('{h} à l’heure de {city}', {h: hm(u + end[1] / 60), city})); }
            const diff = cap ? (lng - cap[1]) * 4 : null;
            sentence = endY ? i18n('Avant {y}, chaque village vivait à l’heure de son soleil (midi, c’était quand le soleil était au plus haut)', {y: String(endY)}) : i18n('Chaque village vivait alors à l’heure de son soleil (midi, c’était quand le soleil était au plus haut)');
            if (cap && Math.abs(diff) >= 1 && fold(cap[0]) !== fold(place)) sentence += (diff < 0 ? i18n(' : à {place}, les horloges avaient {n} de retard sur {city}.', {place, n: minWords(diff), city: cap[0]}) : i18n(' : à {place}, les horloges avaient {n} d’avance sur {city}.', {place, n: minWords(diff), city: cap[0]}));
            else sentence += '.';
        } else if (CITY[r[3]]) {
            const city = typeof CITY[r[3]] === 'function' ? CITY[r[3]](r[1]) : CITY[r[3]];
            kind = 'ville'; parts.push(i18n('{h} (heure de {city})', {h: written, city}));
            const k = rows.indexOf(r), next = rows[k + 1];
            sentence = i18n('De {a} à {b}, tout le pays vivait à l’heure de {city}, {n} en avance sur l’heure de Greenwich.', {a: r[0] != null ? String(localYear(rows, r)) : '…', b: next ? String(localYear(rows, next)) : '…', city, n: secWords(r[1])});
        } else {
            const g = GERMAN.find(([z, a, b]) => z === zone && ev.date >= a && ev.date < b);
            if (g) {
                kind = 'allemande'; parts.push(i18n('{h} (heure allemande, {utc})', {h: written, utc: utcLabel(r[1])}));
                sentence = {occ: i18n('Pendant l’occupation allemande, on vivait à l’heure de Berlin ({utc}{ete}) : une heure de plus qu’en France avant la guerre.', {utc: utcLabel(r[1]), ete: r[2] ? i18n(', heure d’été') : ''}),
                    sud: i18n('Depuis novembre 1942, toute la France vivait à l’heure allemande ({utc}).', {utc: utcLabel(r[1])}),
                    alsace: i18n('De 1871 à 1918, l’Alsace-Moselle était allemande : on y vivait à l’heure de Berlin ({utc}).', {utc: utcLabel(r[1])}),
                    be14: i18n('Pendant l’occupation de 1914–1918, la Belgique vivait à l’heure allemande ({utc}).', {utc: utcLabel(r[1])})}[g[3]];
            } else if (zone === 'Europe/Paris~libre' && ev.date < '1942-11-02') {
                kind = 'libre'; parts.push(i18n('{h} (heure de la zone libre, {utc})', {h: written, utc: utcLabel(r[1])}));
                const occ = rowAt(TZ.zones['Europe/Paris'], u)[1];
                sentence = occ !== r[1] ? i18n('En zone libre, on gardait l’heure française ({utc}) : {n} de moins qu’en zone occupée, à l’heure allemande.', {utc: utcLabel(r[1]), n: minWords((occ - r[1]) / 60)}) : i18n('En zone libre, on gardait l’heure française ({utc}) ; ce jour-là, c’était la même qu’en zone occupée.', {utc: utcLabel(r[1])});
            } else if (r[2]) {
                kind = 'ete'; parts.push(i18n('{h} (heure d’été, {utc})', {h: written, utc: utcLabel(r[1])}));
                sentence = r[3] === 'WEMT' || r[3] === 'BDST' || r[3] === 'CEMT' ? i18n('C’était une « double » heure d’été : les montres avaient deux heures d’avance sur le soleil de Greenwich.') : i18n('C’était l’heure d’été : on avait avancé les montres d’une heure.');
            } else {
                kind = 'legale'; parts.push(i18n('{h} (heure légale, {utc})', {h: written, utc: utcLabel(r[1])}));
                sentence = cc === 'FR' && ev.date >= '1911-03-11' && ev.date < '1940-06-15' ? i18n('Depuis le 11 mars 1911, la France vit à l’heure de Greenwich : 9 min 21 s de moins que l’ancienne heure de Paris.')
                    : i18n('C’était l’heure légale de {country} ({utc}), sans heure d’été ce jour-là.', {country: i18n(NAT[cc] || 'ce pays'), utc: utcLabel(r[1])});
            }
        }
        // la même heure à nos montres d'aujourd'hui (les règles de cette année, le même jour)
        const today = new Date().getUTCFullYear(), zToday = zone.split('~')[0], dayMin = ((u % 1440) + 1440) % 1440;
        const [, rt] = toUtc(TZ.zones[zToday], Date.UTC(today, Mo - 1, Math.min(D, 28), 12) / 60000), nowMin = dayMin + rt[1] / 60;
        const shift = Math.floor((u + rt[1] / 60 - (L - hh * 60 - mi)) / 1440);
        const dayWord = shift < 0 ? i18n(' (la veille)') : shift > 0 ? i18n(' (le lendemain)') : '';
        parts.push(i18n('{h} à nos montres d’aujourd’hui ({season})', {h: hm(nowMin), season: rt[2] ? i18n('heure d’été') : i18n('heure d’hiver')}) + dayWord);
        const ut = new Date(u * 60000), solar = hasLng ? (((u + lng * 4) % 1440 + 1440) % 1440) / 60 : null;
        return {zone, kind, offset: off, line: parts.join(' = '), sentence, utc: `${ymd(ut)}T${pad(ut.getUTCHours())}:${pad(ut.getUTCMinutes())}`, utcHour: ut.getUTCHours() + ut.getUTCMinutes() / 60, solar, today: {min: nowMin, summer: !!rt[2], shift}, same: Math.round(nowMin) === hh * 60 + mi && !shift};
    }

    /* l'affichage : une ligne courte et la phrase qui explique */
    const hintHtml = r => `<span class="ch-line">🕰️ ${esc(r.line)}</span>${r.sentence ? `<span class="ch-why">${esc(r.sentence)}</span>` : ''}`;
    const dateOf = e => { const s = String(e?.sort_date || ''); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; };

    /* la fenêtre de l'événement : sous la case « Heure de l'événement » */
    let formTimer = 0, formSeq = 0;
    async function formHint(form) {
        const field = form?.querySelector('[name="event_time"]'); if (!field) return;
        const lab = field.closest('label') || field.parentElement; let hint = lab.querySelector('[data-ch-hint]');
        if (!hint) { hint = document.createElement('small'); hint.className = 'ch-hint'; hint.dataset.chHint = ''; hint.hidden = true; lab.appendChild(hint); }
        const time = field.value || '', date = form.elements.date_text?.value || '', pid = form.elements.place_id?.value || '', seq = ++formSeq;
        if (!/^\d{1,2}:\d{2}/.test(time) || !date) { hint.hidden = true; return; }
        try {
            const [ctx, TZ] = await Promise.all([A().api('ciel_heure_ctx', {date, place_id: pid}), loadTz()]);
            if (seq !== formSeq) return;
            const r = ctx?.date && ctx.place ? realHour({date: ctx.date, time, place: ctx.place}, TZ) : null;
            hint.hidden = !r; if (r) { hint.innerHTML = hintHtml(r); hint.dataset.kind = r.kind; }
        } catch (_) { hint.hidden = true; }
    }
    const kick = (form, ms) => { clearTimeout(formTimer); formTimer = setTimeout(() => formHint(form), ms); };
    document.addEventListener('input', e => { const f = e.target.closest?.('#event-form'); if (f && (e.target.name === 'event_time' || e.target.name === 'date_text' || e.target.closest('.ui-time'))) kick(f, 500); }, true);
    document.addEventListener('change', e => { const f = e.target.closest?.('#event-form'); if (f && ['event_time', 'date_text', 'place_id', 'place_name'].includes(e.target.name)) kick(f, 250); }, true);
    // à l'ouverture de la fenêtre (heure déjà remplie)
    new MutationObserver(() => { const f = document.querySelector('#event-form'), dlg = f?.closest('dialog'); if (dlg?.open && !dlg.dataset.chSeen) { dlg.dataset.chSeen = '1'; kick(f, 300); } else if (dlg && !dlg.open) delete dlg.dataset.chSeen; })
        .observe(document.documentElement, {subtree: true, attributes: true, attributeFilter: ['open']});

    /* la liste des événements de la fiche : un petit « 🕰️ » sous l'heure */
    async function decorateEvents(detail) {
        const list = (detail?.events || []).filter(e => /^\d{1,2}:\d{2}/.test(String(e.event_time || '')) && dateOf(e));
        if (!list.length) return;
        let TZ; try { TZ = await loadTz(); } catch (_) { return; }
        list.forEach(e => {
            const row = document.querySelector(`#workspace .event-row[data-event-id="${Number(e.id)}"]`), at = row?.querySelector('.event-time'); if (!at || row.querySelector('.ch-real')) return;
            const r = realHour({date: dateOf(e), time: e.event_time, place: {name: e.place_name, country: e.country, county: e.county, state: e.state, subdivision: e.subdivision, lat: e.latitude, lng: e.longitude}}, TZ);
            if (!r || r.same) return;
            at.insertAdjacentHTML('afterend', `<details class="ch-real" data-ch-event="${Number(e.id)}"><summary title="${esc(i18n('Ce que cette heure voulait dire'))}">${esc(i18n('🕰️ {h} aujourd’hui', {h: hm(r.today.min)}))}</summary><p>${hintHtml(r)}</p></details>`);
        });
    }

    /* ═════════════════ ☄️ Il a pu voir… ═════════════════ */
    const BIRTH = ['BIRT', 'CHR', 'BAPM'], DEATH = ['DEAT', 'BURI'];
    /** naissance et décès d'une fiche (dates AAAA-MM-JJ, ou l'année seule) */
    function lifeOf(detail) {
        const ev = detail?.events || [], pick = tags => { for (const t of tags) { const e = ev.find(x => x.gedcom_tag === t && (dateOf(x) || Number(x.year))); if (e) return dateOf(e) || `${Number(e.year)}-07-01`; } return ''; };
        return {birth: pick(BIRTH), death: pick(DEATH), gender: detail?.person?.gender || '', first: detail?.person?.first_name || ''};
    }
    const yearsBetween = (a, b) => { const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number); return y2 - y1 - ((m2 < m1 || (m2 === m1 && d2 < d1)) ? 1 : 0); };
    /** les comètes et aurores de sa vie : vues à 5 ans ou plus, de son vivant (sans date de décès : jusqu'à 90 ans, « s'il vivait encore ») */
    function seenDuring(life, data) {
        if (!life?.birth || !data?.events) return [];
        const now = new Date().toISOString().slice(0, 10), maxEnd = life.death || (() => { const y = Number(life.birth.slice(0, 4)) + 90; return `${y}${life.birth.slice(4)}` < now ? `${y}${life.birth.slice(4)}` : now; })();
        return data.events.filter(e => e.to >= life.birth && e.from <= maxEnd).map(e => {
            const seenOn = e.from > life.birth ? e.from : life.birth, age = yearsBetween(life.birth, e.peak && e.peak >= seenOn && e.peak <= maxEnd ? e.peak : seenOn);
            return {...e, age, unsure: !life.death && yearsBetween(life.birth, e.from) >= 60};
        }).filter(e => e.age >= 5);
    }
    const yearsTxt = e => (e.from.slice(0, 4) === e.to.slice(0, 4) ? e.from.slice(0, 4) : `${e.from.slice(0, 4)}–${e.to.slice(0, 4)}`);
    const seenTxt = e => i18n('{name} ({y}, à {age} ans)', {name: i18n(e.name), y: yearsTxt(e), age: String(e.age)}) + (e.unsure ? i18n(' — s’il vivait encore') : '');
    const srcHtml = e => (e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">${esc(e.src)} ↗</a>` : esc(e.src || ''));

    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks.sky_seen = (index, detail) => {
        const pid = Number(detail?.person?.id); if (!pid || detail.person.kind === 'animal') return '';
        return A().card(index, i18n('☄️ Il a pu voir…'), '', `<div class="ch-seen" data-ch-seen="${pid}"><p class="muted">${esc(i18n('On regarde le ciel de sa vie…'))}</p></div>`, 'span-6');
    };
    async function fillSeen(detail) {
        const pid = Number(detail?.person?.id), host = document.querySelector(`#workspace [data-ch-seen="${pid}"]`); if (!host) return;
        let data; try { data = await loadSkyEvents(); } catch (_) { host.innerHTML = `<p class="muted">${esc(i18n('La liste des comètes et des aurores n’a pas pu être lue.'))}</p>`; return; }
        const life = lifeOf(detail); lives.set(pid, life);
        if (!life.birth) { host.innerHTML = `<p class="muted">${esc(i18n('Il faut sa date de naissance pour savoir ce qu’on voyait dans le ciel.'))}</p>`; return; }
        const list = seenDuring(life, data), fem = life.gender === 'F';
        if (!list.length) { host.innerHTML = `<p class="muted">${esc(i18n('Pas de grande comète ni de grande aurore connue pendant sa vie (à partir de ses 5 ans).'))}</p>`; return; }
        host.innerHTML = `<p class="ch-seen-lead">${esc(fem ? i18n('Elle a pu voir :') : i18n('Il a pu voir :'))}</p><ul class="ch-seen-list">${list.map(e => `<li data-kind="${esc(e.kind)}"><span class="ch-seen-ico" aria-hidden="true">${e.kind === 'aurore' ? '🌌' : '☄️'}</span><div><strong>${esc(seenTxt(e))}</strong>${e.desc ? `<p class="muted">${esc(i18n(e.desc))}</p>` : ''}<small class="ch-src">${esc(i18n('Source :'))} ${srcHtml(e)}</small></div></li>`).join('')}</ul>
            <p class="muted ch-seen-note"><small>${esc(i18n('« A pu voir » : l’événement se voyait à l’œil nu depuis la France ou l’Europe de l’Ouest, quand le ciel était dégagé.'))}</small></p>`;
    }

    /* la Chronologie : les comètes et aurores rejoignent la colonne « Contexte » (🌍 Le monde autour) */
    const lives = new Map(); let wrapped = false, chronoBusy = false;
    function wrapTimeline() {
        if (wrapped || typeof ext.worldTimeline !== 'function') return; wrapped = true;
        const orig = ext.worldTimeline;
        ext.worldTimeline = id => {
            const base = orig(id); if (base == null) return base;
            const life = lives.get(Number(id)), data = once.evData;
            if (!life || !data) {
                if (!chronoBusy) { chronoBusy = true; Promise.all([loadSkyEvents().then(d => { once.evData = d; }), life ? null : A().api('person', {id}).then(d => { lives.set(Number(id), lifeOf(d)); })]).catch(() => {}).finally(() => { if (A().state?.module === 'chronologie' && A().state?.timeline?.history) window.LCNDA_PARTS?.renderTimeline?.(); setTimeout(() => { chronoBusy = false; }, 2000); }); }
                return base;
            }
            const mine = seenDuring(life, data).map(e => ({start_year: Number(e.from.slice(0, 4)), end_year: Number(e.to.slice(0, 4)), title: i18n(e.name), label: i18n(e.name), category: [e.kind === 'aurore' ? i18n('🌌 Aurores') : i18n('☄️ Comètes'), i18n('à {age} ans', {age: String(e.age)})].join(' · '), parent_label: '', hidden: false}));
            return [...base, ...mine];
        };
    }
    wrapTimeline(); document.addEventListener('DOMContentLoaded', wrapTimeline, {once: true});

    ext.afterPerson = ext.afterPerson || [];
    ext.afterPerson.push(detail => { wrapTimeline(); const pid = Number(detail?.person?.id); if (pid) lives.set(pid, lifeOf(detail)); decorateEvents(detail); fillSeen(detail); });
    // le bloc, juste après « 🌍 Le monde autour » (ou la biographie)
    const boot = () => { const B = A()?.defaultPersonBlocks; if (Array.isArray(B) && !B.some(b => b[0] === 'sky_seen')) { let i = B.findIndex(b => b[0] === 'world'); if (i < 0) i = B.findIndex(b => b[0] === 'bio'); B.splice(i < 0 ? B.length : i + 1, 0, ['sky_seen', '☄️ Il a pu voir… (comètes, aurores)']); } };
    boot(); document.addEventListener('DOMContentLoaded', boot, {once: true});

    /* ═════════════════ 🌌 une comète dans le ciel d'une nuit ═════════════════ */
    const R = Math.PI / 180;
    /** la position (ascension droite, déclinaison J2000, en degrés) et la distance au Soleil d'une comète, d'après ses éléments d'orbite
     *  el : {T: jour julien du périhélie, q, e, i, w (argument du périhélie), node (nœud ascendant)} ; earth : [x, y, z] héliocentrique écliptique */
    function cometRaDec(el, jd, earth) {
        const k = 0.01720209895, dt = jd - el.T; let x, y, rr;
        if (el.e < 0.98) { const a = el.q / (1 - el.e), n = k / Math.pow(a, 1.5), M = n * dt; let E = M; for (let j = 0; j < 30; j++) E -= (E - el.e * Math.sin(E) - M) / (1 - el.e * Math.cos(E)); x = a * (Math.cos(E) - el.e); y = a * Math.sqrt(1 - el.e * el.e) * Math.sin(E); }
        else { const W = 3 * k / Math.sqrt(2 * el.q ** 3) * dt, s = Math.cbrt(W / 2 + Math.sqrt(W * W / 4 + 1)) - Math.cbrt(Math.sqrt(W * W / 4 + 1) - W / 2), nu = 2 * Math.atan(s); rr = el.q * (1 + s * s); x = rr * Math.cos(nu); y = rr * Math.sin(nu); }
        rr = Math.hypot(x, y);
        const cO = Math.cos(el.node * R), sO = Math.sin(el.node * R), ci = Math.cos(el.i * R), si = Math.sin(el.i * R), cw = Math.cos(el.w * R), sw = Math.sin(el.w * R);
        const X = (cw * cO - sw * sO * ci) * x + (-sw * cO - cw * sO * ci) * y, Y = (cw * sO + sw * cO * ci) * x + (-sw * sO + cw * cO * ci) * y, Z = sw * si * x + cw * si * y;
        const g = [X - earth[0], Y - earth[1], Z - earth[2]], eps = 23.4393 * R, gy = g[1] * Math.cos(eps) - g[2] * Math.sin(eps), gz = g[1] * Math.sin(eps) + g[2] * Math.cos(eps);
        return {ra: ((Math.atan2(gy, g[0]) / R) + 360) % 360, dec: Math.atan2(gz, Math.hypot(g[0], gy)) / R, r: rr, delta: Math.hypot(...g)};
    }
    /** les comètes de la liste visibles à l'œil nu à cette date (AAAA-MM-JJ) et qui ont des éléments d'orbite */
    const cometsOn = (data, date) => (data?.events || []).filter(e => e.kind === 'comete' && e.el && e.from <= date && e.to >= date);
    ext.cielHeure = {loadTz, loadSkyEvents, zoneFor, countryOf, realHour, hm, lifeOf, seenDuring, cometRaDec, cometsOn, ctx: q => A().api('ciel_heure_ctx', q)};
})();
