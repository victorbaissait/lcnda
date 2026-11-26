/**
 * 💶 Ailleurs en Europe — un onglet du « 🪙 Convertisseur d'autrefois » (heritage-lecture-autrefois.js, crochet ext.autrefoisTabs).
 * « 10 florins en 1750 ≈ 96 g d'argent : à Amsterdam, ≈ 400 litres de blé ; à Paris, … ».
 * Données : assets/data/prix-europe.json (refait par scripts/monde/build-contexte.py) — prix de marché des villes d'Europe,
 * en grammes d'argent fin, de l'Allen-Unger Global Commodity Prices Dataset (Allen et Unger, IISG, CC BY-SA 4.0) ; la valeur
 * en argent d'une unité de monnaie est retrouvée à partir des prix donnés par la source à la fois dans la monnaie de la ville
 * et en argent. Pas de conversion en euros (ce ne serait pas sérieux) : des ordres de grandeur, en denrées.
 *   window.LCNDA_EXT.prixEurope = {load, moneys, silverOf, priceAt, convert}   (Node : module.exports, mêmes fonctions)
 * Essai : tests/test-monde-contexte.js
 */
(function (root) {
    'use strict';
    const T = (s, v) => (root.LCNDA_I18N ? root.LCNDA_I18N.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const GAP = 5; // un prix ou une valeur de monnaie : l'année même, sinon la plus proche à 5 ans près
    const nearest = (pts, year) => { let best = null; for (const [y, v] of pts || []) { const d = Math.abs(y - year); if (d <= GAP && (!best || d < Math.abs(best.y - year))) best = {y, v}; } return best; };
    /** les monnaies qu'on sait convertir : [{id, city, cityName, cur, curs, from, to}] */
    function moneys(P) {
        const out = [];
        for (const [k, c] of Object.entries(P.c)) for (const m of c.m || []) out.push({id: `${k}|${m.cur}`, city: k, cityName: c.n, cur: m.cur, curs: m.curs, from: m.g[0][0], to: m.g[m.g.length - 1][0]});
        return out.sort((a, b) => a.curs.localeCompare(b.curs, 'fr') || a.cityName.localeCompare(b.cityName, 'fr'));
    }
    /** grammes d'argent d'une unité de cette monnaie cette année-là : {y, v} ou null */
    function silverOf(P, id, year) {
        const [k, cur] = String(id).split('|'); const m = (P.c[k]?.m || []).find(x => x.cur === cur);
        return m ? nearest(m.g, year) : null;
    }
    const priceAt = (P, city, good, year) => nearest(P.c[city]?.g?.[good], year);
    const num = s => { const t = String(s ?? '').replace(/\s| /g, '').replace(',', '.'); return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN; };
    const GOOD_ORDER = ['pain', 'ble', 'seigle', 'farine', 'boeuf', 'porc', 'mouton', 'veau', 'beurre', 'fromage', 'oeufs', 'lait', 'biere', 'vin', 'sel', 'sucre', 'chandelles', 'savon', 'huile', 'riz', 'pois', 'orge', 'avoine', 'cafe'];
    /** {amount, money ('silver' ou un id de moneys()), year, city} → {ok, grams, rate, here: [{good, qty, unit, y, price}], elsewhere: [{city, name, pays, ble, pain}]} */
    function convert(P, {amount, money, year, city}) {
        const a = num(amount), y = Math.round(Number(year));
        if (!(a > 0)) return {ok: false, why: 'amount'};
        if (!(y >= 1200 && y <= 1914)) return {ok: false, why: 'year'};
        let grams = a, rate = null;
        if (money && money !== 'silver') { rate = silverOf(P, money, y); if (!rate) return {ok: false, why: 'rate'}; grams = a * rate.v; }
        const here = [];
        const c = P.c[city];
        if (c) for (const g of GOOD_ORDER) { const p = priceAt(P, city, g, y); if (p) here.push({good: g, name: P.goods[g].n, unit: P.goods[g].u, y: p.y, price: p.v, qty: grams / p.v}); }
        const elsewhere = [];
        for (const [k, x] of Object.entries(P.c)) {
            const b = priceAt(P, k, 'ble', y), s = priceAt(P, k, 'seigle', y), pn = priceAt(P, k, 'pain', y);
            if (!b && !s && !pn) continue;
            elsewhere.push({city: k, name: x.n, pays: x.pays, ble: b && {y: b.y, price: b.v, qty: grams / b.v}, seigle: s && {y: s.y, price: s.v, qty: grams / s.v}, pain: pn && {y: pn.y, price: pn.v, qty: grams / pn.v}});
        }
        elsewhere.sort((p, q) => ((q.ble?.qty ?? q.seigle?.qty ?? 0) - (p.ble?.qty ?? p.seigle?.qty ?? 0)));
        return {ok: true, amount: a, year: y, grams, rate, here, elsewhere};
    }
    const core = {moneys, silverOf, priceAt, convert, num, GAP};
    if (typeof module === 'object' && module.exports) { module.exports = core; return; }

    /* ═════════════ l'écran ═════════════ */
    const A = () => root.LCNDA_APP || {};
    const UI = () => root.LCNDA_UI || {};
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const nf = (n, d = 0) => Number(n).toLocaleString('fr-FR', {maximumFractionDigits: d});
    const qtyText = q => nf(q, q < 10 ? 1 : 0);
    const PREF = 'genealogie-prix-europe';
    const pref = () => { try { return {money: 'Arnhem|florin', city: 'Amsterdam', amount: '10', year: '1750', ...(JSON.parse(localStorage.getItem(PREF) || '{}') || {})}; } catch (_) { return {money: 'Arnhem|florin', city: 'Amsterdam', amount: '10', year: '1750'}; } };
    const setPref = p => { try { localStorage.setItem(PREF, JSON.stringify({...pref(), ...p})); } catch (_) {} };
    let data = null;
    function load() {
        if (!data) data = fetch('assets/data/prix-europe.json?v=1', {credentials: 'same-origin'}).then(r => { if (!r.ok) throw new Error(T('Le fichier des prix d’Europe est introuvable.')); return r.json(); }).catch(e => { data = null; throw e; });
        return data;
    }
    const emptyLine = (text, icon = '💶') => `<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">${icon}</span><span class="empty-line-text">${esc(text)}</span></p>`;
    const unitText = (u, q) => (u === 'kg' ? 'kg' : u === 'L' ? (q >= 2 ? T('litres') : T('litre')) : (q >= 2 ? T('pièces') : T('pièce', {ctx: 'unite'})));
    const yNote = (y, year) => (y !== year ? ` <small class="muted">(${esc(T('prix de {y}', {y: String(y)}))})</small>` : '');

    async function mount(pane, {year = '', value = ''} = {}) {
        pane.innerHTML = emptyLine(T('Chargement des prix…'), '⏳');
        let P; try { P = await load(); } catch (e) { pane.innerHTML = emptyLine((e?.name === 'AbortError' || e?.network === true || (e instanceof TypeError && /fetch|network|load failed/i.test(String(e.message || '')))) ? T('Pas de connexion avec LCNDA : rien n’est perdu, réessaie.') : e.message, '⚠️'); return; } // téléchargement coupé : « réessaie », pas « Failed to fetch »
        const st = pref(); if (year) st.year = String(year); if (value) st.amount = String(value).replace(/[^\d.,\s]/g, '').trim() || st.amount;
        const ms = moneys(P);
        if (st.money !== 'silver' && !ms.some(m => m.id === st.money)) st.money = ms[0]?.id || 'silver';
        if (!P.c[st.city]) st.city = 'Amsterdam';
        const cities = Object.entries(P.c).map(([k, c]) => [k, `${c.n} (${c.pays})`]);
        pane.innerHTML = `<div class="af-fields">
                <label class="af-field"><span>${esc(T('La somme'))}</span><input type="text" inputmode="decimal" data-pe-amount autocomplete="off" value="${esc(st.amount)}" placeholder="10"></label>
                <label class="af-field"><span>${esc(T('La monnaie'))}</span><select data-pe-money><option value="silver"${st.money === 'silver' ? ' selected' : ''}>${esc(T('grammes d’argent'))}</option>${ms.map(m => `<option value="${esc(m.id)}"${m.id === st.money ? ' selected' : ''}>${esc(T('{curs} — relevés à {ville} ({a}-{b})', {curs: m.curs, ville: m.cityName, a: String(m.from), b: String(m.to)}))}</option>`).join('')}</select></label>
                <label class="af-field af-year"><span>${esc(T('L’année'))}</span><input type="number" min="1200" max="1914" data-pe-year value="${esc(st.year)}"></label>
                <label class="af-field"><span>${esc(T('Dépensée à'))}</span><select data-pe-city>${cities.map(([k, l]) => `<option value="${esc(k)}"${k === st.city ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label></div>
            <p class="af-examples">${esc(T('Exemples :'))} ${[['10', 'Arnhem|florin', '1750', 'Amsterdam'], ['100', 'Paris|livre tournois', '1780', 'Paris'], ['20', 'Paris|franc', '1850', 'Strasbourg'], ['5', 'Krakow|złoty', '1880', 'Krakow']].filter(e => ms.some(m => m.id === e[1])).map(([a, m, y, c]) => `<button type="button" class="link-button" data-pe-ex="${esc([a, m, y, c].join('~'))}">${esc(`${a} ${ms.find(x => x.id === m).curs} ${T('en')} ${y}`)}</button>`).join(' · ')}</p>
            <div class="af-out" data-pe-out aria-live="polite"></div>
            <p class="ui-hint af-src">${esc(T('Ordre de grandeur : des prix de marché relevés par les historiens et convertis en grammes d’argent fin par Allen et Unger. Pas de conversion en euros : on compare ce que la somme achetait.'))}
                ${esc(T('Source :'))} <a href="${esc(P.url)}" target="_blank" rel="noopener noreferrer">${esc(P.src)} ↗</a> ${esc(T('Licence'))} <a href="${esc(P.licence_url)}" target="_blank" rel="noopener noreferrer">${esc(P.licence)} ↗</a>.</p>`;
        const $ = s => pane.querySelector(s);
        function draw() {
            const v = {amount: $('[data-pe-amount]').value, money: $('[data-pe-money]').value, year: $('[data-pe-year]').value, city: $('[data-pe-city]').value};
            setPref(v);
            const r = convert(P, v), out = $('[data-pe-out]');
            if (!r.ok) {
                out.innerHTML = emptyLine(r.why === 'amount' ? T('Écris une somme (un nombre : 10, 12,5…).') : r.why === 'year' ? T('Écris une année entre 1200 et 1914.') : T('Pas de valeur connue pour cette monnaie à 5 ans près de cette année : essaie une autre année ou une autre monnaie.'));
                return;
            }
            const m = ms.find(x => x.id === v.money), c = P.c[v.city];
            const head = m ? T('{a} {curs} en {y} ≈ {g} g d’argent', {a: nf(r.amount, 2), curs: r.amount < 2 ? m.cur : m.curs, y: String(r.year), g: nf(r.grams, r.grams < 10 ? 2 : 0)}) : T('{g} g d’argent en {y}', {g: nf(r.grams, 2), y: String(r.year)});
            const rateLine = m ? `<small>${esc(T('1 {cur} = {v} g d’argent en {y} (d’après les prix relevés à {ville} dans la source)', {cur: m.cur, v: nf(r.rate.v, 3), y: String(r.rate.y), ville: m.cityName}))}</small>` : '';
            const here = r.here.slice(0, 8);
            out.innerHTML = `<div class="af-big"><small>${esc(T('En argent'))}</small><strong>${esc(head)}</strong>${UI().badge ? UI().badge(T('Ordre de grandeur'), 'yellow') : ''}${rateLine}</div>
                <h4 class="af-h">${esc(T('À {ville}, avec cette somme', {ville: c ? c.n : v.city}))}</h4>
                ${here.length ? `<div class="af-cards">${here.map(h => `<div><small>${esc(h.name)}</small><b>≈ ${esc(qtyText(h.qty))} ${esc(unitText(h.unit, h.qty))}</b>${yNote(h.y, r.year)}</div>`).join('')}</div>` : emptyLine(T('Pas de prix pour cette ville à 5 ans près : regarde les autres villes ci-dessous.'), '🔍')}
                <h4 class="af-h">${esc(T('💶 Ailleurs en Europe, la même année'))}</h4>
                ${r.elsewhere.length ? `<table class="af-table pe-table" style="width:100%"><thead><tr><th>${esc(T('Ville'))}</th><th>${esc(T('Blé'))}</th><th>${esc(T('Seigle'))}</th><th>${esc(T('Pain'))}</th></tr></thead><tbody>
                    ${r.elsewhere.map(e => `<tr${e.city === v.city ? ' class="is-cur"' : ''}><td>${esc(e.name)} <small class="muted">${esc(e.pays)}</small></td>${['ble', 'seigle', 'pain'].map(k => `<td>${e[k] ? `≈ ${esc(qtyText(e[k].qty))} ${esc(k === 'pain' ? 'kg' : 'L')}${yNote(e[k].y, r.year)}` : '<span class="muted">—</span>'}</td>`).join('')}</tr>`).join('')}</tbody></table>`
                    : emptyLine(T('Aucune ville n’a de prix du blé, du seigle ou du pain à 5 ans près de cette année.'), '🔍')}
                ${c?.src?.length ? `<p class="ui-hint">${esc(T('Sources des prix ({ville}) : {src}', {ville: c.n, src: c.src.join(' ; ')}))}</p>` : ''}`;
        }
        pane.addEventListener('input', e => { if (e.target.matches('[data-pe-amount], [data-pe-year]')) draw(); });
        pane.addEventListener('change', e => { if (e.target.matches('select')) draw(); });
        pane.addEventListener('click', e => {
            const x = e.target.closest('[data-pe-ex]'); if (!x) return;
            const [a, m, y, c] = x.dataset.peEx.split('~');
            $('[data-pe-amount]').value = a; $('[data-pe-money]').value = m; $('[data-pe-year]').value = y; if (P.c[c]) $('[data-pe-city]').value = c; draw();
        });
        draw();
    }
    ext.autrefoisTabs = ext.autrefoisTabs || [];
    if (!ext.autrefoisTabs.some(t => t.id === 'europe')) ext.autrefoisTabs.push({id: 'europe', label: T('💶 Ailleurs en Europe'), mount});
    ext.prixEurope = {...core, load};
})(typeof window !== 'undefined' ? window : globalThis);
