/**
 * 🌒 La Lune et les éclipses — calculé, rien à télécharger (le moteur : assets/js/app-lune-core.js, d'après Jean Meeus).
 *  - bloc de fiche « 🌒 La Lune et le ciel » : pour chaque événement daté au jour près avec un lieu (sinon le lieu habituel de la
 *    personne) : la phase de la Lune (« Nuit de pleine lune », « Lune croissante (6 jours) »), le lever et le coucher du soleil,
 *    et l'éclipse visible de là ce jour-là ou à ±3 jours (« 87 % du soleil caché à 11 h 02 »).
 *    Case « Seulement ce qui sort de l'ordinaire » (pleine lune, éclipses), retenue dans localStorage « genealogie-lune-prefs ».
 *  - Listes → Histoire → « 🌒 Éclipses vues par la famille » : chaque éclipse visible des lieux où vivaient les membres de la
 *    famille de leur vivant (GET lune_family, lib/lune.php), qui l'a vue et combien.
 * Lecture seule (rien à annuler), marche en mode consultation. Essai : tests/test-lune.js
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI || {};
    const L = () => window.LCNDA_LUNE;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    ext.personBlocks = ext.personBlocks || {};
    ext.lists = ext.lists || {};
    const T = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const esc = v => A().escapeHtml(v ?? '');
    const S = () => A().state;
    const PREF = 'genealogie-lune-prefs';
    const pref = () => { try { return {rare: false, ...(JSON.parse(localStorage.getItem(PREF) || '{}') || {})}; } catch (_) { return {rare: false}; } };
    const setPref = p => { try { localStorage.setItem(PREF, JSON.stringify({...pref(), ...p})); } catch (_) {} };
    const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const dateFr = c => `${c.d === 1 ? '1er' : c.d} ${T(MOIS[c.m - 1])} ${c.y}`;
    const ICON = {new: '🌑', wax1: '🌒', first: '🌓', wax2: '🌔', full: '🌕', wan2: '🌖', last: '🌗', wan1: '🌘'};

    (function style() {
        if (document.getElementById('lune-style')) return;
        const st = document.createElement('style'); st.id = 'lune-style';
        st.textContent = `.lune-rows{list-style:none;margin:0;padding:0;display:grid;gap:.6rem}.lune-row{display:grid;grid-template-columns:2.2rem minmax(0,1fr);gap:.7rem;align-items:start;padding:.55rem .7rem;border:1px solid color-mix(in srgb,currentColor 14%,transparent);border-radius:10px}
.lune-row .lune-ico{font-size:1.6rem;line-height:1}.lune-row p{margin:.1rem 0}.lune-row .lune-ecl{font-weight:600}.lune-bar{display:flex;flex-wrap:wrap;justify-content:space-between;gap:.5rem;align-items:center;margin-bottom:.6rem}
.lune-card{border:1px solid color-mix(in srgb,currentColor 14%,transparent);border-radius:12px;padding:.8rem 1rem;margin:.6rem 0}.lune-card h3{margin:.1rem 0 .3rem;font-size:1.05rem}.lune-card ul{margin:.3rem 0 0;padding-left:1.1rem}.lune-card li{margin:.15rem 0}
.lune-meter{display:inline-block;width:4.5rem;height:.55rem;border-radius:99px;background:color-mix(in srgb,currentColor 15%,transparent);vertical-align:middle;overflow:hidden;margin-right:.35rem}.lune-meter i{display:block;height:100%;background:currentColor;opacity:.7}`;
        document.head.appendChild(st);
    })();

    /* ─────────── les phrases ─────────── */
    const clock = (j, p) => L().localClock(j, p.lat, p.lon, p.country);
    const hm = (j, p) => clock(j, p).text;
    const plural = (n, w) => (A()?.plural ? A().plural(n, w) : `${n} ${w}${n > 1 ? 's' : ''}`);
    function phaseText(ph) {
        const n = Math.max(1, Math.round(ph.age));
        return {new: T('Nuit de nouvelle lune (nuit sans lune)'), wax1: T('Lune croissante ({n} jours)', {n}), first: T('Premier quartier de lune'), wax2: T('Lune gibbeuse croissante ({n} jours)', {n}),
            full: T('Nuit de pleine lune'), wan2: T('Lune gibbeuse décroissante ({n} jours)', {n}), last: T('Dernier quartier de lune'), wan1: T('Lune décroissante ({n} jours)', {n})}[ph.key];
    }
    /** le jour de l'éclipse par rapport à l'événement : « ce jour-là », « 2 jours avant », « 1 jour après » */
    function whenText(dd) {
        if (!dd) return T('ce jour-là');
        const n = Math.abs(dd); return dd < 0 ? T(n > 1 ? '{n} jours avant' : '{n} jour avant', {n}) : T(n > 1 ? '{n} jours après' : '{n} jour après', {n});
    }
    const dur = s => { const m = Math.floor(s / 60), r = Math.round(s % 60); return m ? `${m} min ${String(r).padStart(2, '0')} s` : `${r} s`; };
    /** une éclipse vue d'un lieu → la phrase (sans le lieu ni le jour) et le pourcentage */
    function seenText(e, r, p) {
        if (e.kind === 'solar') {
            const pct = Math.round(r.obscuration);
            if (r.type === 'total') return {pct: 100, short: T('nuit en plein jour à {h} pendant {d}', {h: hm(r.jd, p), d: dur(r.duration)}), label: T('Éclipse totale de soleil')};
            if (r.type === 'annular') return {pct, short: T('un anneau de feu à {h}, {p} % du soleil caché', {h: hm(r.jd, p), p: pct}), label: T('Éclipse annulaire de soleil')};
            const edge = r.sunAlt < 2 ? ' ' + T(r.jd < e.jd ? '(au lever du soleil)' : '(au coucher du soleil)') : '';
            return {pct, short: T('{p} % du soleil caché à {h}', {p: pct, h: hm(r.jd, p)}) + edge, label: T('Éclipse de soleil')};
        }
        if (r.type === 'total') return {pct: 100, short: T('la lune rouge, toute dans l’ombre de {a} à {b}', {a: hm(r.total.from, p), b: hm(r.total.to, p)}), label: T('Éclipse totale de lune')};
        if (r.type === 'partial') return {pct: Math.round(Math.min(1, e.magUmb) * 100), short: T('la lune en partie dans l’ombre de {a} à {b}', {a: hm(r.umbral.from, p), b: hm(r.umbral.to, p)}), label: T('Éclipse partielle de lune')};
        return {pct: 0, short: T('par la pénombre seulement, de {a} à {b} (à peine visible)', {a: hm(r.penumbral.from, p), b: hm(r.penumbral.to, p)}), label: T('Éclipse de lune par la pénombre')};
    }
    const eclIcon = e => (e.kind === 'solar' ? '🌑' : '🌘');
    const yearCache = new Map();
    const eclipsesOf = y => { if (!yearCache.has(y)) yearCache.set(y, [...L().solarEclipses(y, y), ...L().lunarEclipses(y, y)]); return yearCache.get(y); };
    const seenFrom = (e, p) => (e.kind === 'solar' ? L().solarAt(e, p.lat, p.lon) : L().lunarAt(e, p.lat, p.lon));
    // une éclipse par la pénombre peu profonde ne se voit pas : seulement à partir de 0,6 de grandeur
    const visible = (e, r) => r && (e.kind === 'lunar' ? r.type !== 'penumbral' || e.magPen >= 0.6 : r.obscuration >= 1);

    /* ─────────── le bloc de la fiche ─────────── */
    const details = new Map();
    ext.personBlocks.lune = (index, detail) => {
        const pid = Number(detail.person?.id) || 0;
        if (!pid || detail.person?.kind === 'animal' || !L()) return '';
        details.set(pid, detail);
        return A().card(index, T('🌒 La Lune et le ciel'), '', `<div class="lune-block" data-lune-host="${pid}">${UI().spinner ? UI().spinner(T('On regarde le ciel…')) : ''}</div>`, 'span-12',
            `<label class="ui-toggle"><input type="checkbox" data-lune-rare ${pref().rare ? 'checked' : ''}><i></i>${T('Seulement ce qui sort de l’ordinaire')}</label>`);
    };
    const placeOf = e => (e && e.latitude != null && e.longitude != null && e.latitude !== '' && e.longitude !== '' ? {lat: Number(e.latitude), lon: Number(e.longitude), name: e.place_name || '', country: e.country || ''} : null);
    /** une journée : phase (22 h, ou l'heure de l'événement), soleil, lune, éclipses à ±3 jours */
    function dayInfo(c, p, time = '') {
        const X = L(), noon = X.jd(c.y, c.m, c.d, 12), tz = X.legalOffset(noon, p.lat, p.lon, p.country).h;
        const tm = String(time || '').match(/^(\d{1,2})[:h](\d{2})?/), hour = tm ? Number(tm[1]) + Number(tm[2] || 0) / 60 : 22;
        const ph = X.phase(X.jd(c.y, c.m, c.d, hour) - tz / 24), sun = X.riseSet('sun', c.y, c.m, c.d, p.lat, p.lon, tz), moon = X.riseSet('moon', c.y, c.m, c.d, p.lat, p.lon, tz);
        const day0 = X.jd(c.y, c.m, c.d);
        const ecl = [c.y - 1, c.y, c.y + 1].flatMap(eclipsesOf).filter(e => Math.abs(e.jd - noon) < 4.2).map(e => {
            const r = seenFrom(e, p); if (!visible(e, r)) return null;
            const lc = clock(e.kind === 'solar' ? r.jd : (r.total || r.umbral || r.penumbral).from, p), dd = Math.round(X.jd(lc.y, lc.m, lc.d) - day0);
            return Math.abs(dd) <= 3 ? {e, r, dd} : null;
        }).filter(Boolean);
        return {ph, sun, moon, ecl};
    }
    function rowHtml(ev, c, p, info, own) {
        const ph = info.ph, rare = ph.key === 'full' || info.ecl.length;
        const lines = [];
        info.ecl.forEach(({e, r, dd}) => { const s = seenText(e, r, p); lines.push(`<p class="lune-ecl">${eclIcon(e)} ${esc(T('{l} visible à {pl} {q}', {l: s.label, pl: p.name || T('cet endroit'), q: whenText(dd)}))}, ${esc(s.short)}</p>`); });
        lines.push(`<p>${ICON[ph.key]} ${esc(phaseText(ph))} <span class="muted">· ${esc(T('{n} % éclairée', {n: Math.round(ph.illumination)}))}</span></p>`);
        const sunT = [info.sun.rise && T('lever du soleil {h}', {h: hm(info.sun.rise, p)}), info.sun.set && T('coucher {h}', {h: hm(info.sun.set, p)})].filter(Boolean).join(' · ');
        const moonT = [info.moon.rise && T('lever de la lune {h}', {h: hm(info.moon.rise, p)}), info.moon.set && T('coucher de la lune {h}', {h: hm(info.moon.set, p)})].filter(Boolean).join(' · ');
        lines.push(`<p class="muted">${sunT ? '☀️ ' + esc(sunT) : ''}${moonT ? ` · 🌙 ${esc(moonT)}` : ''}</p>`);
        return {rare, html: `<li class="lune-row${rare ? ' is-rare' : ''}"><span class="lune-ico" aria-hidden="true">${info.ecl.length ? eclIcon(info.ecl[0].e) : ICON[ph.key]}</span>
            <div><p><strong>${esc(ev.type_label || T('Événement'))}</strong> — ${esc(dateFr(c))}${p.name ? ` · ${esc(p.name)}` : ''}${own ? '' : ` <small class="muted">${esc(T('(lieu habituel)'))}</small>`}</p>${lines.join('')}</div></li>`};
    }
    function fill(host) {
        const pid = Number(host.dataset.luneHost), detail = details.get(pid); if (!detail || !L()) { host.innerHTML = ''; return; }
        const X = L(), evs = (detail.events || []).filter(e => !e.is_private || !detail.person?.kiosk);
        const placed = evs.map(placeOf).filter(Boolean), home = placeOf(evs.find(e => /^(BIRT|CHR|BAPM)$/.test(e.gedcom_tag || '') && placeOf(e))) || placed[0] || null;
        const rows = [];
        evs.forEach(ev => {
            const c = X.dayOf(ev.date_text, ev.sort_date); if (!c || c.y < 1000 || c.y > 2150) return;
            const own = placeOf(ev), p = own || home; if (!p) return;
            try { rows.push({ev, c, ...rowHtml(ev, c, p, dayInfo(c, p, ev.event_time), !!own)}); } catch (err) { console.error(err); }
        });
        rows.sort((a, b) => X.jd(a.c.y, a.c.m, a.c.d) - X.jd(b.c.y, b.c.m, b.c.d));
        const rare = pref().rare, shown = rare ? rows.filter(r => r.rare) : rows;
        const first = detail.person?.first_name || T('cette personne');
        host.innerHTML = !rows.length ? A().empty(T('Il faut un événement daté au jour près et un lieu placé sur la carte.'), {icon: '🌒'})
            : `${shown.length ? `<ul class="lune-rows">${shown.map(r => r.html).join('')}</ul>` : A().empty(T('Rien d’extraordinaire dans le ciel aux dates de la vie de {p} : ni pleine lune, ni éclipse.', {p: first}), {icon: '🌒'})}
            <p class="muted"><small>${esc(T('Calculé d’après Jean Meeus (« Astronomical Algorithms »), à quelques minutes près. Heure légale française depuis 1891, heure solaire du lieu avant.'))}
            <button type="button" class="table-link" data-lune-list>${T('Voir les éclipses vues par la famille →')}</button></small></p>`;
    }
    const refreshBlocks = () => document.querySelectorAll('[data-lune-host]').forEach(fill);
    const scan = () => document.querySelectorAll('[data-lune-host]:not([data-lune-done])').forEach(h => { h.dataset.luneDone = '1'; setTimeout(() => { if (h.isConnected) fill(h); }, 0); });
    new MutationObserver(scan).observe(document.documentElement, {childList: true, subtree: true});

    /* ─────────── Listes → Histoire → 🌒 Éclipses vues par la famille ─────────── */
    const hashOf = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return h; };
    let computed = null; // {sig, items}
    /** les vies : de quand à quand, et où à chaque date */
    function livesOf(people) {
        const X = L(), now = X.jd(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, new Date().getUTCDate());
        return people.map(pp => {
            const evs = pp.events.map(([dt, sd, y, lat, lon, place, country, tag]) => {
                const c = X.dayOf(dt, sd); const jd = c ? X.jd(c.y, c.m, c.d, 12) : y ? X.jd(y, 7, 1) : null;
                return jd == null ? null : {jd, exact: !!c, lat, lon, name: place, country, tag};
            }).filter(Boolean).sort((a, b) => a.jd - b.jd);
            if (!evs.length) return null;
            const birth = evs.find(e => /^(BIRT|CHR|BAPM)$/.test(e.tag)), death = evs.find(e => /^(DEAT|BURI|CREM)$/.test(e.tag));
            const from = (birth || evs[0]).jd - 3, to = (death ? death.jd : pp.living ? now : evs[evs.length - 1].jd) + 3;
            const at = j => { let p = evs[0]; for (const e of evs) { if (e.jd <= j) p = e; else break; } return p; };
            return {...pp, evs, birth, from, to, at};
        }).filter(Boolean);
    }
    async function compute(d, onProgress, alive) {
        const X = L(), sig = hashOf(JSON.stringify(d));
        if (computed?.sig === sig) return computed.items;
        const lives = livesOf(d.people || []); if (!lives.length) return (computed = {sig, items: []}).items;
        const y1 = Math.max(1000, Math.min(...lives.map(l => X.fromJd(l.from).y))), y2 = Math.min(2150, Math.max(...lives.map(l => X.fromJd(l.to).y)));
        const all = [...X.solarEclipses(y1, y2), ...X.lunarEclipses(y1, y2)].sort((a, b) => a.jd - b.jd);
        const cache = new Map(), items = [];
        let t0 = performance.now();
        for (let i = 0; i < all.length; i++) {
            const e = all[i], who = [];
            for (const l of lives) {
                if (e.jd < l.from || e.jd > l.to) continue;
                const p = l.at(e.jd), key = `${e.id}|${p.lat.toFixed(2)}|${p.lon.toFixed(2)}`;
                if (!cache.has(key)) cache.set(key, seenFrom(e, p));
                const r = cache.get(key); if (!visible(e, r)) continue;
                const s = seenText(e, r, p), age = l.birth ? Math.floor((e.jd - l.birth.jd) / 365.25) : null;
                who.push({id: l.id, name: l.name, place: p.name, pct: s.pct, text: s.short, label: s.label, type: r.type, age: age != null && age >= 0 ? age : null, when: clock(e.kind === 'solar' ? r.jd : e.jd, p)});
            }
            if (who.length) {
                const best = who.reduce((a, b) => (b.pct > a.pct ? b : a));
                items.push({e, who: who.sort((a, b) => b.pct - a.pct || String(a.name).localeCompare(String(b.name), 'fr')), best, date: best.when});
            }
            if (performance.now() - t0 > 40) { onProgress?.(i / all.length); await new Promise(r => setTimeout(r, 0)); if (!alive()) return null; t0 = performance.now(); }
        }
        computed = {sig, items};
        return items;
    }
    const kindOf = it => `${it.e.kind}-${it.best.type}`;
    const KINDS = [['solar-total', '🌑 Soleil : totale'], ['solar-annular', '💍 Soleil : annulaire'], ['solar-partial', '🌗 Soleil : partielle'], ['lunar-total', '🔴 Lune : totale'], ['lunar-partial', '🌘 Lune : partielle'], ['lunar-penumbral', '🌫 Lune : pénombre']];
    function cardHtml(it) {
        const {e, who, best} = it;
        return `<article class="lune-card" data-lune-ecl="${esc(e.id)}"><h3>${eclIcon(e)} ${esc(best.label)} — ${esc(dateFr(it.date))}</h3>
            <p class="muted">${esc(T('Vue par {n}', {n: plural(who.length, T('personne'))}))}${e.kind === 'solar' ? ` · ${esc(T('gamma {g}', {g: e.gamma.toFixed(3)}))}` : ''}</p>
            <ul>${who.map(w => `<li>${e.kind === 'solar' || w.pct ? `<span class="lune-meter" title="${w.pct} %"><i style="width:${w.pct}%"></i></span>` : ''}<button type="button" class="table-link" data-lune-open="${w.id}">${esc(w.name || '?')}</button>
                <span class="muted">${esc(w.place ? T('à {pl}', {pl: w.place}) : '')}${w.age != null ? esc(', ' + (w.age ? T(w.age > 1 ? '{n} ans' : '{n} an', {n: w.age}) : T('moins d’un an'))) : ''}</span> : ${esc(w.text)}</li>`).join('')}</ul></article>`;
    }
    ext.lists.lune_eclipses = async token => {
        const ws = A().$('#workspace'), KEY = 'listes:lune_eclipses';
        const head = UI().pageHeader({title: T('🌒 Éclipses vues par la famille'), help: T('Chaque éclipse de Soleil ou de Lune visible des lieux où vivaient les membres de ta famille, de leur vivant : qui l’a vue, d’où, et combien. Tout est calculé (d’après Jean Meeus), sans rien télécharger.')});
        if (!L()) { ws.innerHTML = `<section class="page collection-page">${head}${A().emptyState({icon: '⛔', text: T('Le calcul des éclipses n’est pas chargé.')})}</section>`; return; }
        let d; try { d = await A().api('lune_family', {}); } catch (err) { ws.innerHTML = A().emptyState({icon: '⛔', text: err.message}); return; }
        const alive = () => token === S().workspaceToken && S().module === 'listes' && S().listType === 'lune_eclipses';
        if (!alive()) return;
        ws.innerHTML = `<section class="page collection-page lune-page">${head}<div data-lune-body>${UI().spinner ? UI().spinner(T('On calcule les éclipses…')) : T('On calcule les éclipses…')}<p class="muted" data-lune-progress></p></div></section>`;
        const items = await compute(d, f => { const el = ws.querySelector('[data-lune-progress]'); if (el) el.textContent = `${Math.round(f * 100)} %`; }, alive);
        if (!items || !alive()) return;
        const body = ws.querySelector('[data-lune-body]');
        const note = `<section class="maintenance-panel"><h3>${T('Comment c’est calculé ?')}</h3><p>${esc(T('Positions du Soleil et de la Lune d’après Jean Meeus, « Astronomical Algorithms » (chapitres 25, 47 et 54), ΔT d’Espenak et Meeus. Pour chaque lieu, la Lune et le Soleil sont suivis minute par minute, vus de l’endroit même. Les heures sont à quelques minutes près : heure légale française depuis 1891, heure solaire du lieu avant (et hors de France). Le lieu de chaque personne à une date est celui de son dernier événement noté.'))}</p></section>`;
        if (!items.length) {
            body.innerHTML = `${A().emptyState({icon: '🌒', text: T('Aucune éclipse trouvée pour ta famille'), hint: T('Il faut des événements datés avec un lieu placé sur la carte (naissance, mariage, décès, résidence…).')})}${note}`;
            return;
        }
        const counts = {}; items.forEach(it => { counts[kindOf(it)] = (counts[kindOf(it)] || 0) + 1; });
        const fold = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        const yearOf = v => { const m = String(v || '').match(/\b(\d{3,4})\b/); return m ? Number(m[1]) : 0; };
        body.innerHTML = `<div data-lune-bar></div><div data-lune-rows></div>${note}`;
        const bar = UI().listBar({key: KEY, search: {placeholder: T('Chercher… (un nom, un lieu, 1999)')},
            filters: [
                {id: 'kind', label: T('Sorte'), type: 'check', options: KINDS.filter(([k]) => counts[k]).map(([k, l]) => [k, T(l), T(l), counts[k]])},
                {id: 'big', label: T('Seulement les plus belles'), type: 'check', text: T('Seulement les plus belles (totales, annulaires, plus de 80 %)')},
                {id: 'from', group: T('Période'), label: T('À partir de'), type: 'date', placeholder: '1800', chipPrefix: T('Depuis')},
                {id: 'to', group: T('Période'), label: T('Jusqu’à'), type: 'date', placeholder: '1914', chipPrefix: T('Jusqu’à')}],
            sort: {options: [['old', T('Les plus anciennes d’abord')], ['recent', T('Les plus récentes d’abord')], ['most', T('Les plus vues d’abord')]], value: 'old'},
            onChange: () => paint()});
        body.querySelector('[data-lune-bar]').replaceWith(bar);
        function paint() {
            const st = bar.state, f = st.filters, words = fold(st.q).split(/\s+/).filter(Boolean), from = yearOf(f.from), to = yearOf(f.to);
            let rows = items.filter(it => (!f.kind?.length || f.kind.includes(kindOf(it))) && (!f.big || it.best.pct >= 80 || ['total', 'annular'].includes(it.best.type))
                && (!from || it.date.y >= from) && (!to || it.date.y <= to)
                && (!words.length || words.every(w => fold(`${it.best.label} ${it.date.y} ${dateFr(it.date)} ${it.who.map(x => `${x.name} ${x.place}`).join(' ')}`).includes(w))));
            if (st.sort === 'recent') rows = [...rows].reverse(); else if (st.sort === 'most') rows = [...rows].sort((a, b) => b.who.length - a.who.length || b.best.pct - a.best.pct);
            bar.setCount(`${plural(rows.length, T('éclipse'))}${rows.length !== items.length ? ` ${T('sur {n}', {n: items.length.toLocaleString('fr-FR')})}` : ''}`);
            body.querySelector('[data-lune-rows]').innerHTML = rows.length ? rows.slice(0, 400).map(cardHtml).join('') + (rows.length > 400 ? `<p class="muted">${esc(T('Les 400 premières seulement : précise la recherche.'))}</p>` : '')
                : A().emptyState({icon: '🔍', text: T('Aucune éclipse pour cette recherche'), hint: T('Change les mots cherchés ou retire un filtre.')});
        }
        paint();
    };

    /* ─────────── clics ─────────── */
    document.addEventListener('click', e => {
        const t = e.target;
        const op = t.closest?.('[data-lune-open]'); if (op) { S().currentPersonId = Number(op.dataset.luneOpen); A().setModule('personnes'); return; }
        if (t.closest?.('[data-lune-list]')) { e.preventDefault(); S().listType = 'lune_eclipses'; A().setModule('listes'); }
    });
    document.addEventListener('change', e => { if (e.target.matches?.('[data-lune-rare]')) { setPref({rare: e.target.checked}); refreshBlocks(); } });

    // le bloc (après « 🌍 Le monde autour ») et la liste (Listes → Histoire, après les grands mouvements)
    const boot = () => {
        const B = A()?.defaultPersonBlocks; if (Array.isArray(B) && !B.some(b => b[0] === 'lune')) { let i = B.findIndex(b => b[0] === 'world'); if (i < 0) i = B.findIndex(b => b[0] === 'bio'); B.splice(i < 0 ? B.length : i + 1, 0, ['lune', '🌒 La Lune et le ciel']); }
        const Ls = A()?.defaultListTypes; if (Array.isArray(Ls) && !Ls.some(x => x[0] === 'lune_eclipses')) { const i = Ls.findIndex(x => x[0] === 'historical_context'); Ls.splice(i < 0 ? Ls.length : i, 0, ['lune_eclipses', '34c', '🌒 Éclipses vues par la famille']); }
    };
    boot(); document.addEventListener('DOMContentLoaded', boot, {once: true});
    ext.lune = {dayInfo, seenText, livesOf, compute, phaseText};
})();
