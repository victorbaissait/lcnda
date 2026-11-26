/* LCNDA — 📊 Données téléchargées, pour un projet : une liste de données (séismes, guerres, Tour de France…) filtrée et montrée ailleurs.
 *
 *  Un seul code, trois endroits :
 *   · 🧩 le widget « 📊 Données téléchargées » d'un projet de l'Atelier (heritage-atelier-widgets.js) : réglé DANS le widget
 *     (pas de fenêtre), enregistré avec les autres widgets du projet (localStorage « genealogie-atelier-widgets ») ;
 *   · le widget du tableau de bord « 📊 Données téléchargées » (donnees_widget : ext.dashboard / ext.dashboardConfig) ;
 *   · l'élément « Venant du logiciel » → « 📊 Une donnée téléchargée » (heritage-research.js : quelques lignes cochées, ou toute
 *     la liste filtrée ; l'élément reste vivant, « ↗ Ouvrir » mène à la liste ; l'export écrit le texte et la source, jamais le pack).
 *  Le choix de la liste : LCNDA_EXT.dataListPicker (app-listes-themes.js, le même que Listes → 🧰 Données, en compact), ou
 *  « 💬 ou pose une question » (LCNDA_EXT.dataAsk, app-donnees-accueil.js). Filtres : 📅 de l'an … à l'an …, 📍 autour d'un lieu ou
 *  👪 près des lieux de la famille (à N km : le critère « famille » du moteur, app-listes-famille.js), « seulement quand quelqu'un
 *  de la famille vivait près de là ». Les lignes viennent du moteur commun (LCNDA_EXT.dataListsEngine.fetchPage).
 *  Rapide : rien n'est lu avant que le widget soit visible (IntersectionObserver) ; seules les données présentes ici sont proposées ;
 *  une liste « en ligne » n'est jamais proposée (mode consultation et invités du réseau local : rien ne part sur Internet).
 *  API : LCNDA_EXT.atelierData = {chooser, run, mountWidget, view, appForm, preview, open, exportText, eligible}
 *  Essai : tests/test-widget-donnees.js
 */
(() => {
    'use strict';
    const T = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const E = () => ext.dataListsEngine || {};
    const LF = () => ext.listesFamille || null;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const fold = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const nf = n => Number(n || 0).toLocaleString('fr-FR');
    const spin = t => (UI().spinner ? UI().spinner(T(t), {inline: true}) : `<p class="muted">${esc(T(t))}</p>`);
    const emptyLine = (ico, html) => `<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">${ico}</span><span class="empty-line-text">${html}</span></p>`;
    const DEF = {src: '', also: [], ask: '', q: '', from: '', to: '', where: '', place: '', lat: null, lon: null, km: 15, famOnly: false, view: 'list', n: 5, chart: 'bar', cols: [], sort: '', dir: 'asc', group: '', title: '', subtitle: '', icon: '', accent: '', density: 'normal', size: 'M', showSource: true, click: 'list', famHi: false, emptyText: '', auto: false};
    const cfgOf = c => ({...DEF, ...(c && typeof c === 'object' ? c : {})});
    const VIEWS = [['list', '📋 Liste'], ['table', '▦ Tableau compact'], ['cards', '🃏 Cartes'], ['count', '📈 Nombre et petit graphique'], ['chart', '📊 Petit graphique'], ['map', '🗺 Petite carte'], ['timeline', '🕰 Petite frise'], ['day', '📅 Ce jour-là (ou la ligne du jour)'], ['ticker', '🎞 Défilant']];
    const NS = [3, 5, 8, 12, 20];

    /** les listes qu'on peut proposer : montrées, lues ici (pas un lien, pas « en ligne ») */
    const eligible = d => !!d && !d.link && !d.online && !d.needsInternet && (typeof d.load === 'function' || typeof d.query === 'function') && E().shown?.(d) !== false;
    const listById = id => (E().list?.() || []).find(d => d.id === id) || null;

    /* ═════════ les lignes ═════════ */
    const fieldsOf = d => (d.fields || []).filter(f => f.type !== 'url' && !f.hidden && f.key !== 'sources');
    function rowTitle(d, r) {
        if (r?._src?.d && r._src.d !== d) return rowTitle(r._src.d, r);
        const fs = fieldsOf(d), f = fs.find(x => ['text', 'place', 'enum'].includes(x.type || 'text') && r[x.key] != null && r[x.key] !== '') || fs.find(x => r[x.key] != null && r[x.key] !== '');
        const v = f ? r[f.key] : r.title || r.name || r.label || '';
        return String(Array.isArray(v) ? v.join(', ') : v).slice(0, 200);
    }
    function rowSub(d, r) {
        if (r?._src?.d && r._src.d !== d) d = r._src.d;
        const p = E().periodOf?.(d, r), out = [];
        if (p) out.push(p[0] === p[1] || p[1] >= 9999 ? String(p[0]) : `${p[0]}–${p[1]}`);
        const t = rowTitle(d, r), pl = (d.fields || []).find(f => f.type === 'place' && r[f.key] && String(r[f.key]) !== t);
        if (pl) out.push(String(r[pl.key]));
        if (r._km != null) out.push(T('à {km} km', {km: nf(r._km)}));
        if (r._src) out.push(`${r._src.icon} ${r._src.label}${r._also ? ` + ${r._also.join(' + ')}` : ''}`); // 🔀 la source de la ligne
        return out.join(' · ');
    }
    const okUrl = u => (/^https?:\/\/[^\s"'<>]+$/i.test(String(u || '')) ? String(u) : '');
    function rowUrl(d, r) {
        if (r?._src?.d && r._src.d !== d) d = r._src.d;
        for (const f of (d.fields || []).filter(x => x.type === 'url')) { const u = okUrl(Array.isArray(r[f.key]) ? r[f.key][0] : r[f.key]); if (u) return u; }
        return okUrl(r.url) || okUrl((r._members || []).map(m => m.rec?.url || m.src?.url).find(okUrl)) || okUrl(d.sourceUrl);
    }
    const rowKey = (d, r) => { try { if (d.rowKey) return String(d.rowKey(r)); } catch (_) {} return `${rowTitle(d, r)}|${rowSub(d, r)}`.slice(0, 200); };

    /* ═════════ chercher : les filtres → l'état du moteur ═════════ */
    const placeCache = new Map();
    async function placeLL(name) {
        const k = fold(name).trim(); if (!k) return null; if (placeCache.has(k)) return placeCache.get(k);
        let p = null; try { const r = await A().api('picker_search', {kind: 'place', q: name, limit: 5}); const its = (r.groups || []).flatMap(g => g.items || []).filter(x => x.lat != null && x.lon != null); p = its.find(x => fold(x.title || x.name).startsWith(k)) || its[0] || null; } catch (_) {}
        const v = p ? {lat: Number(p.lat), lon: Number(p.lon)} : null; placeCache.set(k, v); return v;
    }
    async function stateFor(c) {
        const st = {...(E().blank?.() || {}), q: '', crit: []};
        const from = c.from === '' || c.from == null ? null : Number(c.from), to = c.to === '' || c.to == null ? null : Number(c.to);
        if (Number.isFinite(from) || Number.isFinite(to)) st.period = {from: Number.isFinite(from) ? from : -9999, to: Number.isFinite(to) ? to : 9999, mode: 'overlap', label: `📅 ${Number.isFinite(from) ? from : '…'} → ${Number.isFinite(to) ? to : '…'}`};
        const km = Math.max(1, Math.min(500, Number(c.km) || 15));
        if (c.where === 'place' && c.place) {
            if (c.lat == null || c.lon == null) { const g = await placeLL(c.place); if (g) { c.lat = g.lat; c.lon = g.lon; } }
            if (c.lat != null) { st.near = {lat: Number(c.lat), lon: Number(c.lon), km, title: c.place}; st.sort = '_km'; st.dir = 'asc'; }
        }
        if (c.where === 'family') st.crit = [{kind: 'xf', fid: 'famille', value: String(km), valueLabel: T('à {km} km', {km})}];
        if (c.q) st.q = String(c.q);
        if (c.sort) { st.sort = c.sort; st.dir = c.dir === 'desc' ? 'desc' : 'asc'; }
        return st;
    }
    /** {d, st, rows, total, all?, missing?, notInstalled?, note?} — limit : combien de lignes au plus */
    /* 🔀 plusieurs listes réunies dans un widget : l'union, une colonne « source », sans doublon quand un identifiant est partagé (qid, id…) */
    const ID_KEYS = ['qid', 'wikidata', 'wd', 'merimee', 'insee', 'code', 'id'];
    const idOf = r => { for (const k of ID_KEYS) { const v = r?.[k]; if (v != null && v !== '') return `${k}:${String(v).toLowerCase()}`; } return ''; };
    async function runMany(c, limit) {
        const ids = [c.src, ...(Array.isArray(c.also) ? c.also : [])].filter((x, i, a) => x && a.indexOf(x) === i).slice(0, 6);
        const parts = await Promise.all(ids.map(id => run({...c, src: id, also: [], ask: ''}, limit).catch(() => ({rows: [], all: [], total: 0}))));
        const ok = parts.filter(r => r.d && !r.missing && !r.notInstalled);
        if (!ok.length) return parts[0] || {rows: [], total: 0, missing: true};
        const seen = new Map(), all = []; let dup = 0;
        ok.forEach(r => (r.all || r.rows).forEach(x => { const row = {...x, _src: {id: r.d.id, label: T(r.d.label), icon: r.d.icon || '📋', d: r.d}}; const k = idOf(x);
            if (k && seen.has(k)) { dup++; const o = seen.get(k); o._also = [...(o._also || []), row._src.label]; return; } if (k) seen.set(k, row); all.push(row); }));
        const d0 = ok[0].d, d = {...d0, id: d0.id, label: ok.map(r => T(r.d.label)).join(' + '), icon: '🔀', merged: true, _parts: ok.map(r => r.d), source: ok.map(r => r.d.source).filter(Boolean).join(' ; '), sourceUrl: d0.sourceUrl,
            geo: r => (r._src?.d || d0).geo?.(r), period: r => (r._src?.d || d0).period?.(r), fields: d0.fields};
        if (c.sort) all.sort((a, b) => { const x = a[c.sort], y = b[c.sort]; const n = Number(x) - Number(y); const v = Number.isFinite(n) ? n : String(x ?? '').localeCompare(String(y ?? ''), 'fr', {numeric: true}); return c.dir === 'desc' ? -v : v; });
        const total = ok.reduce((a, r) => a + (Number(r.total) || 0), 0) - dup;
        return {d, st: ok[0].st, rows: all.slice(0, limit), all, total: Math.max(all.length, total), dup, parts: ok.map(r => ({d: r.d, total: r.total}))};
    }
    async function run(c0, limit = 5) {
        const c = cfgOf(c0);
        if (!c.ask && Array.isArray(c.also) && c.also.filter(x => x && x !== c.src).length) return runMany(c, limit);
        if (c.ask && !c.src) {
            if (!ext.dataAsk) return {rows: [], total: 0, note: T('La question en français n’est pas chargée.')};
            const r = await ext.dataAsk(c.ask);
            if (!r.d || !eligible(r.d)) return {rows: [], total: 0, note: T('Je n’ai pas trouvé de liste pour cette question.')};
            const st = r.st || {...(E().blank?.() || {})};
            return {d: r.d, st, rows: (r.rows || []).slice(0, limit), all: r.all || r.rows || [], total: Number(r.total) || (r.rows || []).length};
        }
        const d = listById(c.src);
        if (!d) return {rows: [], total: 0, missing: true};
        if (!eligible(d)) return {d, rows: [], total: 0, missing: true};
        let inst; try { inst = await E().isInstalled?.(d); } catch (e) { return {d, rows: [], total: 0, note: '⚠ ' + T('Impossible de vérifier si ces données sont installées : {e}', {e: e?.message || String(e)})}; } // une vérification ratée n'est pas « pas installée »
        if (!inst) return {d, rows: [], total: 0, notInstalled: true};
        const st = await stateFor(c);
        if (c.famOnly && LF()) { // seulement quand quelqu'un de la famille vivait près de là (calculé ici)
            await LF().ready();
            const p = await E().fetchPage(d, st, 0, d.query ? 2000 : 100000), km = Math.max(1, Number(c.km) || LF().km?.() || 15);
            const keep = (p.all || p.rows || []).filter(r => { const g = E().geoOf?.(d, r), y = E().periodOf?.(d, r); return g && y && LF().presence(g[0], g[1], y[0], km).who.length; });
            return {d, st, rows: keep.slice(0, limit), all: keep, total: keep.length};
        }
        const p = await E().fetchPage(d, st, 0, Math.max(limit, 1));
        return {d, st, rows: (p.rows || []).slice(0, limit), all: p.all || p.rows || [], total: Number(p.total) || (p.rows || []).length, more: !!p.more};
    }
    const filtersText = c => [c.q ? `🔎 « ${c.q} »` : '', c.from !== '' || c.to !== '' ? `📅 ${c.from || '…'} → ${c.to || '…'}` : '', c.where === 'place' && c.place ? T('📍 à {km} km de {p}', {km: c.km, p: c.place}) : '', c.where === 'family' ? T('👪 à {km} km des lieux de la famille', {km: c.km}) : '', c.famOnly ? T('👪 quand la famille y vivait') : ''].filter(Boolean).join(' · ');
    function open(c0) { const c = cfgOf(c0), d = listById(c.src); if (c.ask && !c.src) return ext.dataHome?.ask ? (A().setModule?.('listes'), ext.dataHome.ask(c.ask)) : null; if (!d) return A().toast?.(T('Cette liste n’existe plus.'), 'error'); stateFor(c).then(st => E().open?.(d.id, st)); }
    const sourceLine = d => (d?.source ? `<p class="atd-lic">${esc(T('Source :'))} ${okUrl(d.sourceUrl) ? `<a href="${esc(d.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(d.source)} ↗</a>` : esc(d.source)}</p>` : '');
    const goDonnees = () => { const st = A().state; if (!st) return; st.listType = 'donnees'; A().setModule?.('listes'); };
    const noneHtml = () => emptyLine('📦', `${esc(T('Aucune donnée téléchargée pour l’instant.'))} <button type="button" class="link-button" data-atd-gods>${esc(T('Voir les données à télécharger'))} →</button>`);

    /* ═════════ ⚙️ Personnaliser : les réglages de forme (jamais les données) ═════════ */
    const ACCENTS = {blue: '#055dff', green: '#2b8a3e', orange: '#d9480f', red: '#c92a2a', purple: '#7048e8', grey: '#5c636e'};
    const ACCENT_L = [['blue', 'Bleu'], ['green', 'Vert'], ['orange', 'Orange'], ['red', 'Rouge'], ['purple', 'Violet'], ['grey', 'Gris']];
    const FMT = ['view', 'chart', 'n', 'sort', 'dir', 'group', 'title', 'subtitle', 'icon', 'accent', 'density', 'size', 'showSource', 'click', 'famHi', 'emptyText', 'auto']; // un modèle : la forme seulement
    const K_TPL = 'genealogie-donnees-widget-modeles';
    const K_PRESETS = 'genealogie-donnees-widget-filtres', FILTERS = ['q', 'from', 'to', 'where', 'place', 'lat', 'lon', 'km', 'famOnly']; // 💾 des filtres gardés sous un nom (pas la liste)
    const presets = () => (Array.isArray(readJ(K_PRESETS, [])) ? readJ(K_PRESETS, []) : []);
    const readJ = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch (_) { return d; } };
    const writeJ = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
    const templates = () => (Array.isArray(readJ(K_TPL, [])) ? readJ(K_TPL, []) : []);
    const fmtOf = c => Object.fromEntries(FMT.filter(k => c[k] !== undefined).map(k => [k, c[k]]));
    const yearOf = (d, r) => E().periodOf?.(d, r)?.[0];
    const fieldVal = (r, k) => { const v = r?.[k]; return Array.isArray(v) ? v.join(', ') : v ?? ''; };
    function groupKey(d, r, g) {
        if (g === 'decade') { const y = yearOf(d, r); return Number.isFinite(y) ? `${Math.floor(y / 10) * 10}–${Math.floor(y / 10) * 10 + 9}` : T('sans date'); }
        if (g === 'century') { const y = yearOf(d, r); return Number.isFinite(y) ? T('{n}e siècle', {n: Math.floor((y - 1) / 100) + 1}) : T('sans date'); }
        return String(fieldVal(r, g) || '—');
    }
    const cellsOf = (d, c) => { const fs = fieldsOf(d); const cs = (c.cols || []).map(k => fs.find(f => f.key === k)).filter(Boolean); return cs.length ? cs : fs.slice(0, 3); };
    const bucket = (ys, max = 12) => { const lo = Math.min(...ys), hi = Math.max(...ys), step = Math.max(10, Math.ceil((hi - lo + 1) / max / 10) * 10), a = Math.floor(lo / step) * step, n = Math.floor((hi - a) / step) + 1, b = new Array(n).fill(0); ys.forEach(y => { b[Math.floor((y - a) / step)]++; }); return {a, step, b}; };
    function chartHtml(ys, kind) {
        if (ys.length < 2) return '';
        const {a, step, b} = bucket(ys), mx = Math.max(...b), lab = esc(T('Par période, de {a} à {b}', {a: a, b: a + step * b.length - 1}));
        if (kind === 'line') { const w = 300, h = 64, pts = b.map((v, i) => `${Math.round(i / Math.max(1, b.length - 1) * w)},${Math.round(h - v / mx * (h - 4) - 2)}`).join(' ');
            return `<svg class="atd-line" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${lab}"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg><div class="atd-axis"><span>${a}</span><span>${a + step * b.length - 1}</span></div>`; }
        return `<div class="atd-bars" role="img" aria-label="${lab}">${b.map((v, i) => `<span style="height:${Math.max(4, Math.round(v / mx * 100))}%" title="${a + i * step}–${a + (i + 1) * step - 1} : ${v}"></span>`).join('')}</div><div class="atd-axis"><span>${a}</span><span>${a + step * b.length - 1}</span></div>`;
    }
    const srcA = (d, r) => { const u = rowUrl(d, r); return u ? ` <a class="atd-src" href="${esc(u)}" target="_blank" rel="noopener noreferrer">↗ ${esc(T('source'))}</a>` : ''; };
    const famMark = r => (r._fam ? ` <span class="atd-fam" title="${esc(r._fam)}">👪</span>` : '');
    const rowLi = (d, r, i) => { const sub = rowSub(d, r); return `<li class="${r._fam ? 'is-fam' : ''}"><button type="button" class="link-button" data-atd-row="${i}">${esc(rowTitle(d, r) || '—')}</button>${sub ? ` <small>${esc(sub)}</small>` : ''}${famMark(r)}${srcA(d, r)}</li>`; };
    const dayKey = () => { const t = new Date(); return `${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };

    /** le corps montré : liste, tableau, cartes, nombre, graphique, carte, frise, ce jour-là, défilant (+ regroupement, « + N autres ») */
    function view(res, c0) {
        const c = cfgOf(c0), d = res.d;
        if (res.note) return emptyLine('💬', esc(res.note));
        if (res.missing) return emptyLine('📦', `${esc(T('Cette liste n’est pas disponible ici.'))} <button type="button" class="link-button" data-atd-gods>${esc(T('Voir les données'))} →</button>`);
        if (res.notInstalled) return emptyLine('⤓', `${esc(T('{l} : pas encore téléchargée sur cet ordinateur.', {l: T(d.label)}))} <button type="button" class="link-button" data-atd-gods>${esc(T('Voir les données à télécharger'))} →</button>`);
        const title = c.title || `${T(d.label)}`, icon = c.icon || d.icon || '📋';
        const head = `<div class="atd-head"><b>${esc(icon)} ${esc(title)}</b><button type="button" class="link-button" data-atd-go>${esc(T('Ouvrir la liste'))} ↗</button></div>${c.subtitle ? `<small class="atd-subt">${esc(c.subtitle)}</small>` : ''}${filtersText(c) || c.ask ? `<small class="muted">${esc(c.ask && !c.src ? `💬 « ${c.ask} »` : filtersText(c))}</small>` : ''}`;
        const all = res.all || res.rows, n = Math.max(1, Number(c.n) || 5), rows = res.rows.slice(0, n), more = res.total - rows.length;
        const moreLine = more > 0 ? `<button type="button" class="link-button atd-more" data-atd-go>${esc(T('+ {n} autres', {n: nf(more)}))}</button>` : '';
        const idx = r => res.rows.indexOf(r);
        let body;
        if (!res.total) body = emptyLine('🔎', esc(c.emptyText || T('Rien pour ces filtres.')));
        else if (c.view === 'count' || c.view === 'chart') {
            const ys = all.map(r => yearOf(d, r)).filter(Number.isFinite);
            body = `${c.view === 'count' ? `<div class="atd-big">${nf(res.total)}${res.more ? '+' : ''} <small>${esc(T('lignes'))}</small></div>` : ''}${chartHtml(ys, c.chart)}`;
        } else if (c.view === 'map' && ext.miniMap && d.geo) {
            const pts = all.slice(0, 300).map(r => { const g = E().geoOf?.(d, r); return g ? {lat: g[0], lon: g[1], label: rowTitle(d, r)} : null; }).filter(Boolean);
            body = `${ext.miniMap(pts, [], {height: c.size === 'S' ? 160 : 220})}<small class="muted">${esc(T('Lignes : {n}', {n: nf(res.total)}))}</small>`;
        } else if (c.view === 'table') {
            const cs = cellsOf(d, c);
            body = `<div class="atd-tablewrap"><table class="atd-table"><thead><tr>${cs.map(f => `<th>${esc(T(f.label))}</th>`).join('')}${d._parts ? `<th>${esc(T('Liste'))}</th>` : ''}<th><span class="atd-sr">${esc(T('Source'))}</span></th></tr></thead><tbody>${rows.map(r => `<tr class="${r._fam ? 'is-fam' : ''}" data-atd-row="${idx(r)}">${cs.map(f => `<td>${esc(fieldVal(r, f.key))}</td>`).join('')}${d._parts ? `<td>${esc(`${r._src?.icon || ''} ${r._src?.label || ''}${r._also ? ` + ${r._also.join(' + ')}` : ''}`)}</td>` : ''}<td>${famMark(r)}${srcA(d, r)}</td></tr>`).join('')}</tbody></table></div>${moreLine}`;
        } else if (c.view === 'cards') {
            body = `<div class="atd-cards">${rows.map(r => `<div class="atd-card${r._fam ? ' is-fam' : ''}"><button type="button" class="link-button" data-atd-row="${idx(r)}">${esc(rowTitle(d, r) || '—')}</button><small>${esc(rowSub(d, r))}</small>${famMark(r)}${srcA(d, r)}</div>`).join('')}</div>${moreLine}`;
        } else if (c.view === 'timeline') {
            const ts = rows.filter(r => Number.isFinite(yearOf(d, r))).sort((x, y) => yearOf(d, x) - yearOf(d, y));
            body = ts.length ? `<ol class="atd-time">${ts.map(r => `<li><span>${esc(yearOf(d, r))}</span><button type="button" class="link-button" data-atd-row="${idx(r)}">${esc(rowTitle(d, r))}</button>${famMark(r)}${srcA(d, r)}</li>`).join('')}</ol>${moreLine}` : emptyLine('📅', esc(T('Aucune de ces lignes n’a de date.')));
        } else if (c.view === 'day') {
            const dk = dayKey(), dateF = (d.fields || []).find(f => f.type === 'date');
            const today = dateF ? all.filter(r => String(r[dateF.key] || '').slice(5, 10) === dk) : [];
            const seed = Number(new Date().toISOString().slice(0, 10).replace(/-/g, '')), pick = today.length ? today : [all[seed % all.length]];
            body = `<p class="atd-daylab">${esc(today.length ? T('📅 Ce jour-là') : T('🎲 La ligne du jour'))}</p><ul class="atd-rows">${pick.slice(0, n).map(r => rowLi(d, r, idx(r) >= 0 ? idx(r) : 0)).join('')}</ul>`;
        } else if (c.view === 'ticker') {
            body = `<div class="atd-ticker" data-atd-ticker><button type="button" class="icon-button" data-atd-tick="-1" aria-label="${esc(T('Précédente'))}">‹</button><ul class="atd-rows">${rows.map((r, i) => rowLi(d, r, idx(r)).replace('<li class="', `<li ${i ? 'hidden ' : ''}class="`)).join('')}</ul><button type="button" class="icon-button" data-atd-tick="1" aria-label="${esc(T('Suivante'))}">›</button></div>${moreLine}`;
        } else if (c.group) {
            const groups = new Map(); rows.forEach(r => { const k = groupKey(d, r, c.group); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
            body = `${[...groups.entries()].map(([k, rs]) => `<p class="atd-gh">${esc(k)} <small>${nf(rs.length)}</small></p><ul class="atd-rows">${rs.map(r => rowLi(d, r, idx(r))).join('')}</ul>`).join('')}${moreLine}`;
        } else body = `<ul class="atd-rows">${rows.map(r => rowLi(d, r, idx(r))).join('')}</ul>${moreLine}`;
        return `${head}${body}${c.showSource === false ? `<p class="atd-lic atd-lic-min"><a href="${esc(okUrl(d.sourceUrl) || '#')}" target="_blank" rel="noopener noreferrer" title="${esc(d.source || '')}">↗ ${esc(T('source'))}</a></p>` : sourceLine(d)}`;
    }
    const wrapCls = c => `atd atd-show atd-d-${c.density || 'normal'} atd-s-${c.size || 'M'}`;
    /** les clics d'un corps montré (lignes, « Ouvrir la liste », aller dans Données, ‹ › du défilant) */
    function bindView(el, getRes, c) {
        el.addEventListener('click', e => {
            if (e.target.closest('[data-atd-gods]')) return goDonnees();
            const tk = e.target.closest('[data-atd-tick]'); if (tk) return tick(el, Number(tk.dataset.atdTick));
            if (e.target.closest('a')) return;
            const rowEl = e.target.closest('[data-atd-row]'), r = getRes();
            if (rowEl && r?.d && c.click === 'row') { const row = r.rows[Number(rowEl.dataset.atdRow)]; try { if (row && r.d.open) return r.d.open(row, {}); } catch (_) {} }
            if (rowEl && r?.d && c.click === 'basket') { const row = r.rows[Number(rowEl.dataset.atdRow)]; if (row && ext.connexions?.take) { ext.connexions.take([{kind: 'row', title: rowTitle(r.d, row), value: rowSub(r.d, row), origin: {label: `${T('Listes')} · ${T(r.d.label)}`, url: rowUrl(r.d, row)}}]); return A().toast?.(T('🧺 Gardé dans le panier.'), 'success'); } }
            if (e.target.closest('[data-atd-go]') || rowEl) { if (r?.d && r.st && !(c.src)) return E().open?.(r.d.id, r.st); return open(c); }
        });
    }
    function tick(el, dir) { const lis = [...el.querySelectorAll('[data-atd-ticker] li')]; if (lis.length < 2) return; const i = lis.findIndex(x => !x.hidden); lis.forEach(x => { x.hidden = true; }); lis[(i + dir + lis.length) % lis.length].hidden = false; }
    /** 👪 les lignes liées à ma famille : quelqu'un vivait près de là cette année-là */
    async function markFamily(res, c) {
        if (!c.famHi || !res?.d || !LF()) return; await LF().ready(); const km = Math.max(1, Number(c.km) || LF().km?.() || 15);
        (res.rows || []).forEach(r => { const g = E().geoOf?.(res.d, r), y = yearOf(res.d, r); if (!g || !Number.isFinite(y)) return; const pr = LF().presence(g[0], g[1], y, km); if (pr.who.length) r._fam = pr.who.slice(0, 3).map(w => w.n).join(', '); });
    }
    /** montre une config (lit seulement quand c'est visible) */
    function show(el, c0, {limit} = {}) {
        const c = cfgOf(c0); let res = null, timer = 0, tk = 0;
        el.className = wrapCls(c); if (ACCENTS[c.accent]) el.style.setProperty('--atd-accent', ACCENTS[c.accent]);
        el.innerHTML = spin('Chargement…');
        const big = ['count', 'chart', 'map', 'day'].includes(c.view) || c.group;
        const go = async () => { try { res = await run(c, limit || (big ? 500 : Math.max(Number(c.n) || 5, 1))); await markFamily(res, c); if (el.isConnected) el.innerHTML = view(res, c); } catch (e) { if (el.isConnected) el.innerHTML = emptyLine('⚠️', esc(e.message || String(e))); } };
        bindView(el, () => res, c);
        lazy(el, go);
        if (c.view === 'ticker') tk = setInterval(() => { if (!el.isConnected) return clearInterval(tk); if (!el.matches(':hover, :focus-within')) tick(el, 1); }, 5000);
        if (c.auto) timer = setInterval(() => { if (!el.isConnected) return clearInterval(timer); if (document.visibilityState === 'visible') { E().forget?.(c.src); go(); } }, 10 * 60000);
        return {get res() { return res; }};
    }
    function lazy(el, fn) {
        if (!('IntersectionObserver' in window)) return void fn();
        const io = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) { io.disconnect(); fn(); } });
        io.observe(el);
    }

    /* ⚙️ Personnaliser (replié) : des sections, une ouverte à la fois ; de bons réglages au départ */
    const opt = (v, cur, l) => `<option value="${esc(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(T(l))}</option>`;
    function persoHtml(c, o = {}) {
        const sec = (id, t, html) => `<details class="atd-sec" data-atd-sec="${id}" name="atd-sec-${Math.random().toString(36).slice(2, 6)}"><summary>${esc(T(t))}</summary><div class="atd-filters">${html}</div></details>`;
        const tpl = templates();
        return `<details class="atd-perso" data-atd-perso><summary>⚙️ ${esc(T('Personnaliser'))}</summary>
            ${sec('show', '📋 Colonnes, tri et regroupement', `<label>${esc(T('Graphique'))}<select data-atd-p="chart">${opt('bar', c.chart, 'Barres (par décennie)')}${opt('line', c.chart, 'Courbe')}</select></label>
                <label>${esc(T('Trier par'))}<select data-atd-p="sort"></select></label><label>${esc(T('Ordre'))}<select data-atd-p="dir">${opt('asc', c.dir, 'croissant')}${opt('desc', c.dir, 'décroissant')}</select></label>
                <label>${esc(T('Regrouper'))}<select data-atd-p="group"></select></label><fieldset class="atd-cols"><legend>${esc(T('Colonnes (tableau, cartes)'))}</legend><div data-atd-cols></div></fieldset>`)}
            ${sec('look', '🎨 Apparence', `<label>${esc(T('Titre'))}<input data-atd-p="title" value="${esc(c.title)}" placeholder="${esc(T('le nom de la liste'))}"></label><label>${esc(T('Sous-titre'))}<input data-atd-p="subtitle" value="${esc(c.subtitle)}"></label>
                <label>${esc(T('Icône'))}<input data-atd-p="icon" value="${esc(c.icon)}" maxlength="4" placeholder="📊"></label>
                <label>${esc(T('Couleur'))}<select data-atd-p="accent"><option value="">${esc(T('celle de l’app'))}</option>${ACCENT_L.map(([k, l]) => opt(k, c.accent, l)).join('')}</select></label>
                <label>${esc(T('Densité'))}<select data-atd-p="density">${opt('compact', c.density, 'compacte')}${opt('normal', c.density, 'normale')}${opt('airy', c.density, 'aérée')}</select></label>
                <label>${esc(T('Taille'))}<select data-atd-p="size">${opt('S', c.size, 'petite')}${opt('M', c.size, 'moyenne')}${opt('L', c.size, 'grande')}${opt('full', c.size, 'toute la largeur')}</select></label>
                <label class="checkbox-line"><input type="checkbox" data-atd-p="showSource" ${c.showSource !== false ? 'checked' : ''}> ${esc(T('Montrer la ligne de la source (↗ reste toujours là)'))}</label>`)}
            ${sec('act', '🖱 Comportement', `<label>${esc(T('Un clic sur une ligne'))}<select data-atd-p="click">${opt('list', c.click, 'ouvre la liste')}${opt('row', c.click, 'ouvre la ligne')}${opt('basket', c.click, 'la garde dans le panier 🧺')}</select></label>
                <label class="checkbox-line"><input type="checkbox" data-atd-p="famHi" ${c.famHi ? 'checked' : ''}> ${esc(T('👪 Montrer les lignes liées à ma famille'))}</label>
                <label class="checkbox-line"><input type="checkbox" data-atd-p="auto" ${c.auto ? 'checked' : ''}> ${esc(T('Se met à jour tout seul'))}</label>
                <label>${esc(T('Quand il n’y a rien'))}<input data-atd-p="emptyText" value="${esc(c.emptyText)}" placeholder="${esc(T('Rien pour ces filtres.'))}"></label>`)}
            ${sec('src', '🗂 Sources : listes réunies et onglets', `<p class="atd-hint">${esc(T('🔀 Réunir : plusieurs listes dans le même tableau (une colonne dit d’où vient chaque ligne ; une même chose n’apparaît qu’une fois).'))}</p>
                <div data-atd-also class="atd-also"></div><div class="atd-actions"><button type="button" class="button small secondary" data-atd-alsoadd>🔀 ${esc(T('Réunir avec une autre liste'))}</button></div><div data-atd-alsopk></div>
                ${o.tabs ? `<p class="atd-hint">${esc(T('🗂 Onglets : une autre liste, à côté, dans le même widget.'))}</p><div class="atd-actions"><button type="button" class="button small secondary" data-atd-tabadd>＋ ${esc(T('Ajouter un onglet'))}</button>${o.tabs.count > 1 ? `<button type="button" class="button small secondary" data-atd-tabdel>✕ ${esc(T('Retirer cet onglet'))}</button>` : ''}</div>` : ''}`)}
            ${sec('tpl', '⭐ Modèles et partage', `<label>${esc(T('Nom du modèle'))}<input data-atd-tplname placeholder="${esc(T('Mon modèle'))}"></label><div class="atd-actions"><button type="button" class="button small secondary" data-atd-tplsave>⭐ ${esc(T('Enregistrer comme modèle'))}</button></div>
                ${tpl.length ? `<label>${esc(T('Mes modèles'))}<select data-atd-tpl>${tpl.map(x => `<option>${esc(x.name)}</option>`).join('')}</select></label><div class="atd-actions"><button type="button" class="button small secondary" data-atd-tplapply>${esc(T('Appliquer'))}</button></div>` : ''}
                <div class="atd-actions"><button type="button" class="button small secondary" data-atd-dup>⧉ ${esc(T('Dupliquer'))}</button><button type="button" class="button small secondary" data-atd-export>⤓ ${esc(T('Exporter (.json)'))}</button><button type="button" class="button small secondary" data-atd-import>⤒ ${esc(T('Importer'))}</button><input type="file" accept="application/json,.json" data-atd-importfile hidden>
                <button type="button" class="button small secondary" data-atd-reset>↺ ${esc(T('Remettre comme au départ'))}</button></div>`)}
        </details>`;
    }
    function persoRead(root, c) {
        const g = k => root.querySelector(`[data-atd-p="${k}"]`), v = k => (g(k) ? g(k).value : c[k]);
        const cols = root.querySelector('[data-atd-cols] [data-atd-col]') ? [...root.querySelectorAll('[data-atd-col]:checked')].map(x => x.value) : (c.cols || []);
        return {chart: v('chart'), sort: g('sort')?.options.length ? v('sort') : c.sort, dir: v('dir'), group: g('group')?.options.length ? v('group') : c.group, cols, title: String(v('title') || '').trim(), subtitle: String(v('subtitle') || '').trim(), icon: String(v('icon') || '').trim(),
            accent: v('accent'), density: v('density'), size: v('size'), showSource: g('showSource') ? g('showSource').checked : c.showSource, click: v('click'), famHi: g('famHi') ? g('famHi').checked : c.famHi, auto: g('auto') ? g('auto').checked : c.auto, emptyText: String(v('emptyText') || '').trim()};
    }
    /* ═════════ le réglage : choisir la liste (ou une question), les filtres, l'affichage ═════════ */
    /** chooser(hôte, config, {display, pickRows, ds, buttons, onDone(cfg), onCancel()}) → {read(), collect()} */
    function chooser(host, c0, o = {}) {
        const c = cfgOf(c0); let also = Array.isArray(c.also) ? [...c.also] : [], chosen = c.src ? listById(c.src) : null, rowsRes = null, picked = new Set((o.ds?.rows || []).map(r => r.k)), mode = o.ds?.mode || 'all';
        host.innerHTML = `<div class="atd atd-cfg" data-atd-cfg>
            <div data-atd-chosen></div><div data-atd-picker></div>
            <details class="atd-ask" data-atd-askbox ${c.ask && !c.src ? 'open' : ''}><summary>💬 ${esc(T('ou pose une question'))}</summary><label class="atd-filters"><span>${esc(T('Ta question'))}</span><input type="search" data-atd-f="ask" value="${esc(c.ask)}" placeholder="${esc(T('les séismes près de Tulle entre 1800 et 1900'))}"></label></details>
            <div class="atd-filters" data-atd-filt>
                <label>${esc(T('De l’an'))}<input type="number" inputmode="numeric" data-atd-f="from" value="${esc(c.from)}" placeholder="1700"></label>
                <label>${esc(T('à l’an'))}<input type="number" inputmode="numeric" data-atd-f="to" value="${esc(c.to)}" placeholder="1900"></label>
                <label>${esc(T('Où ?'))}<select data-atd-f="where"><option value="">${esc(T('Partout'))}</option><option value="place" ${c.where === 'place' ? 'selected' : ''}>${esc(T('Autour d’un lieu'))}</option><option value="family" ${c.where === 'family' ? 'selected' : ''}>${esc(T('Près des lieux de la famille'))}</option></select></label>
                <label data-atd-placebox>${esc(T('Lieu'))}<input data-atd-f="place" value="${esc(c.place)}" placeholder="Tulle"></label>
                <label data-atd-kmbox>${esc(T('À combien de km ?'))}<input type="number" min="1" max="500" data-atd-f="km" value="${esc(c.km)}"></label>
                <label class="checkbox-line"><input type="checkbox" data-atd-f="famOnly" ${c.famOnly ? 'checked' : ''}> ${esc(T('Seulement quand quelqu’un de la famille vivait près de là'))}</label>
                <label>${esc(T('Contient le mot'))}<input type="search" data-atd-f="q" value="${esc(c.q)}" placeholder="${esc(T('facultatif'))}"></label>
                <details class="atd-presets" data-atd-presets><summary>💾 ${esc(T('Filtres enregistrés'))}</summary><div class="atd-filters" data-atd-presetbox></div></details>
                ${o.display ? `<label>${esc(T('Affichage'))}<select data-atd-f="view">${VIEWS.map(([k, l]) => `<option value="${k}" ${c.view === k ? 'selected' : ''}>${esc(T(l))}</option>`).join('')}</select></label>
                <label>${esc(T('Combien de lignes ?'))}<select data-atd-f="n">${NS.map(n => `<option value="${n}" ${Number(c.n) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>` : ''}
            </div>
            ${o.display ? persoHtml(c, o) : ''}
            ${o.pickRows ? `<fieldset class="atd-mode" data-atd-modebox><legend>${esc(T('Garder'))}</legend><label class="checkbox-line"><input type="radio" name="atd_mode" value="all" ${mode === 'all' ? 'checked' : ''}> ${esc(T('Toute la liste filtrée'))}</label><label class="checkbox-line"><input type="radio" name="atd_mode" value="rows" ${mode === 'rows' ? 'checked' : ''}> ${esc(T('Seulement les lignes cochées'))}</label></fieldset><div data-atd-rows></div>` : ''}
            ${o.buttons !== false ? `<div class="atd-actions"><button type="button" class="button small" data-atd-ok>${esc(T('Afficher'))}</button>${o.onCancel ? `<button type="button" class="button small secondary" data-atd-cancel>${esc(T('Annuler'))}</button>` : ''}</div>` : ''}
        </div>`;
        const root = host.querySelector('[data-atd-cfg]'), q = s => root.querySelector(s), f = k => q(`[data-atd-f="${k}"]`);
        const read = () => ({src: chosen?.id || '', also: chosen ? also.filter(x => x !== chosen.id) : [], ask: chosen ? '' : String(f('ask')?.value || '').trim(), from: f('from').value, to: f('to').value, where: f('where').value, place: String(f('place').value || '').trim(),
            lat: f('place').value === c.place ? c.lat : null, lon: f('place').value === c.place ? c.lon : null, km: Math.max(1, Math.min(500, Number(f('km').value) || 15)), famOnly: f('famOnly').checked,
            view: f('view')?.value || c.view, n: Number(f('n')?.value) || c.n, q: String(f('q')?.value || '').trim(), ...(o.display ? persoRead(root, c) : {})});
        const sync = () => {
            const ask = !chosen && !!String(f('ask')?.value || '').trim(), w = f('where').value;
            q('[data-atd-filt]').hidden = !chosen && !ask;
            q('[data-atd-placebox]').hidden = w !== 'place'; q('[data-atd-kmbox]').hidden = !w && !f('famOnly').checked;
            [f('from'), f('to'), f('where'), f('famOnly')].forEach(x => { x.closest('label').hidden = ask; });
            if (ask) { q('[data-atd-placebox]').hidden = true; q('[data-atd-kmbox]').hidden = true; }
            q('[data-atd-askbox]').hidden = !!chosen;
            const mb = q('[data-atd-modebox]'); if (mb) { mb.hidden = !chosen && !ask; }
        };
        const paintChosen = () => {
            const box = q('[data-atd-chosen]'), pk = q('[data-atd-picker]');
            if (chosen) { box.innerHTML = `<div class="atd-chosen"><b>${esc(chosen.icon || '📋')} ${esc(T(chosen.label))}</b><button type="button" class="link-button" data-atd-change>${esc(T('Changer'))}</button></div>${sourceLine(chosen)}`; pk.hidden = true; pk.innerHTML = ''; }
            else { box.innerHTML = ''; pk.hidden = false; if (!pk.firstChild) mountPicker(pk); }
            sync();
        };
        const mountPicker = pk => {
            if (!ext.dataListPicker) { pk.innerHTML = emptyLine('⏳', esc(T('Chargement…'))); return; }
            ext.dataListPicker(pk, {compact: true, onlyInstalled: true, filter: eligible, selected: c.src,
                onPick: d => { chosen = d; if (f('ask')) f('ask').value = ''; paintChosen(); refreshRows(); paintCols(); },
                onChecked: ok => { if (!ok.length && !chosen) { pk.innerHTML = noneHtml(); q('[data-atd-askbox]').hidden = true; const a = q('.atd-actions [data-atd-ok]'); if (a) a.hidden = true; } }});
            setTimeout(() => { try { pk.querySelector('[data-ld-ov-q]')?.focus({preventScroll: true}); } catch (_) {} }, 30);
        };
        /* ☑ les lignes, à cocher (élément de l'Atelier) */
        let rt = 0;
        const refreshRows = () => { const box = q('[data-atd-rows]'); if (!box) return; clearTimeout(rt); rt = setTimeout(async () => {
            const cur = read(); if (!cur.src && !cur.ask) { box.innerHTML = ''; return; }
            box.innerHTML = spin('On cherche…');
            try { rowsRes = await run(cur, 50); } catch (e) { box.innerHTML = emptyLine('⚠️', esc(e.message)); return; }
            if (!box.isConnected) return;
            const d = rowsRes.d;
            if (!d || !rowsRes.total) { box.innerHTML = view(rowsRes, cur); return; }
            box.innerHTML = `<small class="muted">${esc(T('{a} sur {n} lignes', {a: nf(rowsRes.rows.length), n: nf(rowsRes.total)}))}</small><ul class="atd-pickrows">${rowsRes.rows.map((r, i) => { const k = rowKey(d, r), u = rowUrl(d, r), sub = rowSub(d, r); return `<li><label><input type="checkbox" data-atd-pick="${i}" ${picked.has(k) ? 'checked' : ''}> <span>${esc(rowTitle(d, r) || '—')}${sub ? ` <small class="muted">${esc(sub)}</small>` : ''}</span></label>${u ? ` <a class="atd-src" href="${esc(u)}" target="_blank" rel="noopener noreferrer">↗ ${esc(T('source'))}</a>` : ''}</li>`; }).join('')}</ul>`;
        }, 250); };
        /* ⚙️ Personnaliser : colonnes, tri, regroupement (les champs de la liste choisie) ; modèles, export, import, remise à zéro */
        const paintCols = () => { const box = q('[data-atd-cols]'); if (!box) return; const fs = chosen ? fieldsOf(chosen) : [], on = new Set(c.cols || []);
            box.innerHTML = fs.length ? fs.map(fl => `<label class="checkbox-line"><input type="checkbox" data-atd-col value="${esc(fl.key)}" ${on.has(fl.key) ? 'checked' : ''}> ${esc(T(fl.label))}</label>`).join('') : `<small class="muted">${esc(T('Choisis d’abord une liste.'))}</small>`;
            const so = q('[data-atd-p="sort"]'); if (so) so.innerHTML = `<option value="">${esc(T('comme la liste'))}</option>${fs.map(fl => `<option value="${esc(fl.key)}" ${c.sort === fl.key ? 'selected' : ''}>${esc(T(fl.label))}</option>`).join('')}<option value="_km" ${c.sort === '_km' ? 'selected' : ''}>${esc(T('Distance (km)'))}</option>`;
            const gr = q('[data-atd-p="group"]'); if (gr) gr.innerHTML = `<option value="">${esc(T('aucun'))}</option>${chosen?.period ? `<option value="decade" ${c.group === 'decade' ? 'selected' : ''}>${esc(T('par décennie'))}</option><option value="century" ${c.group === 'century' ? 'selected' : ''}>${esc(T('par siècle'))}</option>` : ''}${fs.filter(fl => ['enum', 'place'].includes(fl.type)).map(fl => `<option value="${esc(fl.key)}" ${c.group === fl.key ? 'selected' : ''}>${esc(T('par {f}', {f: T(fl.label).toLowerCase()}))}</option>`).join('')}`; };
        const paintAlso = () => { const box = q('[data-atd-also]'); if (!box) return; box.innerHTML = also.length ? also.map(id => { const d = listById(id); return `<span class="atd-chip">${esc(d?.icon || '📋')} ${esc(T(d?.label || id))} <button type="button" class="icon-button" data-atd-alsox="${esc(id)}" aria-label="${esc(T('Retirer'))}" title="${esc(T('Retirer'))}">✕</button></span>`; }).join('') : ''; };
        const paintPresets = () => { const box = q('[data-atd-presetbox]'); if (!box) return; const ps = presets();
            box.innerHTML = `<label>${esc(T('Nom'))}<input data-atd-pname placeholder="${esc(T('Mes filtres'))}"></label><div class="atd-actions"><button type="button" class="button small secondary" data-atd-psave>💾 ${esc(T('Enregistrer ces filtres'))}</button></div>
                ${ps.length ? `<label>${esc(T('Mes filtres'))}<select data-atd-plist>${ps.map(x => `<option>${esc(x.name)}</option>`).join('')}</select></label><div class="atd-actions"><button type="button" class="button small secondary" data-atd-papply>${esc(T('Appliquer'))}</button><button type="button" class="button small secondary" data-atd-pdel aria-label="${esc(T('Supprimer'))}" title="${esc(T('Supprimer'))}">🗑</button></div>` : ''}`; };
        const redo = (nc, msg) => { const before = read(); const api2 = chooser(host, {...before, ...nc}, o); if (msg) A().undoToast ? A().undoToast(msg, {undo: () => chooser(host, before, o)}) : A().toast?.(msg); return api2; };
        root.addEventListener('click', e => {
            if (e.target.closest('[data-atd-tplsave]')) { const name = String(q('[data-atd-tplname]')?.value || '').trim() || T('Mon modèle'); const list = templates().filter(x => x.name !== name); list.unshift({name, fmt: fmtOf(read())}); writeJ(K_TPL, list.slice(0, 30)); A().toast?.(T('⭐ Modèle « {n} » enregistré (la forme seulement, sans les données).', {n: name}), 'success'); redo({}); return; }
            if (e.target.closest('[data-atd-tplapply]')) { const t = templates().find(x => x.name === q('[data-atd-tpl]')?.value); if (t) redo(t.fmt, T('Modèle « {n} » appliqué', {n: t.name})); return; }
            if (e.target.closest('[data-atd-reset]')) { const keep = read(); redo({...Object.fromEntries(FMT.map(k => [k, DEF[k]])), cols: [], src: keep.src, ask: keep.ask}, T('Réglages remis comme au départ')); return; }
            if (e.target.closest('[data-atd-export]')) { const json = JSON.stringify({type: 'lcnda-widget-donnees', version: 1, cfg: read()}, null, 1); if (ext.downloadText) ext.downloadText('widget-donnees.json', json, 'application/json'); else { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], {type: 'application/json'})); a.download = 'widget-donnees.json'; a.click(); } return; }
            if (e.target.closest('[data-atd-import]')) { q('[data-atd-importfile]')?.click(); return; }
            if (e.target.closest('[data-atd-dup]')) { o.duplicate?.(read()); return; }
            if (e.target.closest('[data-atd-tabadd]')) { o.tabs?.add(read()); return; }
            if (e.target.closest('[data-atd-tabdel]')) { o.tabs?.remove(); return; }
            if (e.target.closest('[data-atd-alsoadd]')) { const pk = q('[data-atd-alsopk]'); if (pk.firstChild) { pk.innerHTML = ''; return; }
                ext.dataListPicker?.(pk, {compact: true, onlyInstalled: true, filter: d => eligible(d) && d.id !== chosen?.id && !also.includes(d.id), onPick: d => { also.push(d.id); pk.innerHTML = ''; paintAlso(); refreshRows(); }}); return; }
            const ax = e.target.closest('[data-atd-alsox]'); if (ax) { also = also.filter(x => x !== ax.dataset.atdAlsox); paintAlso(); refreshRows(); return; }
            if (e.target.closest('[data-atd-psave]')) { const name = String(q('[data-atd-pname]')?.value || '').trim() || T('Mes filtres'); const r = read(), fv = Object.fromEntries(FILTERS.map(k => [k, r[k]]));
                writeJ(K_PRESETS, [{name, f: fv}, ...presets().filter(x => x.name !== name)].slice(0, 30)); A().toast?.(T('💾 Filtres « {n} » enregistrés', {n: name}), 'success'); paintPresets(); return; }
            if (e.target.closest('[data-atd-papply]')) { const x = presets().find(y => y.name === q('[data-atd-plist]')?.value); if (!x) return; FILTERS.forEach(k => { const el = f(k); if (!el) return; if (el.type === 'checkbox') el.checked = !!x.f[k]; else el.value = x.f[k] ?? ''; }); c.lat = x.f.lat; c.lon = x.f.lon; c.place = x.f.place || ''; sync(); refreshRows(); return; }
            if (e.target.closest('[data-atd-pdel]')) { const name = q('[data-atd-plist]')?.value, before = presets(); writeJ(K_PRESETS, before.filter(y => y.name !== name)); paintPresets();
                A().undoToast ? A().undoToast(T('Filtres « {n} » supprimés', {n: name}), {undo: () => { writeJ(K_PRESETS, before); paintPresets(); }}) : null; return; }
            if (e.target.closest('[data-atd-change]')) { chosen = null; q('[data-atd-picker]').innerHTML = ''; paintChosen(); return; }
            if (e.target.closest('[data-atd-gods]')) return goDonnees();
            if (e.target.closest('[data-atd-ok]')) { const cur = read(); if (!cur.src && !cur.ask) { UI().fail ? UI().fail(q('[data-ld-ov-q]') || root, T('Choisis une liste, ou pose une question.')) : A().toast?.(T('Choisis une liste, ou pose une question.'), 'error'); return; } o.onDone?.(cur); return; }
            if (e.target.closest('[data-atd-cancel]')) return o.onCancel?.();
        });
        root.addEventListener('change', e => {
            const t = e.target;
            if (t.matches('[data-atd-pick]') && rowsRes?.d) { const k = rowKey(rowsRes.d, rowsRes.rows[Number(t.dataset.atdPick)]); if (t.checked) picked.add(k); else picked.delete(k); if (t.checked) { mode = 'rows'; const r = root.querySelector('[name=atd_mode][value=rows]'); if (r) r.checked = true; } return; }
            if (t.name === 'atd_mode') { mode = t.value; return; }
            sync(); if (t.matches('[data-atd-f]') && !['view', 'n'].includes(t.dataset.atdF)) refreshRows();
        });
        root.addEventListener('input', e => { if (e.target.matches('[data-atd-f="ask"]')) { sync(); refreshRows(); } });
        q('[data-atd-importfile]')?.addEventListener('change', async e => { const fl = e.target.files?.[0]; if (!fl) return; try { const j = JSON.parse(await fl.text()); if (j?.type !== 'lcnda-widget-donnees' || !j.cfg) throw new Error(T('Ce fichier n’est pas un widget « Données téléchargées ».')); redo(cfgOf(j.cfg), T('Widget importé')); } catch (err) { A().toast?.(err.message, 'error'); } });
        root.querySelectorAll('details[data-atd-sec]').forEach(dt => dt.addEventListener('toggle', () => { if (dt.open) root.querySelectorAll('details[data-atd-sec]').forEach(x => { if (x !== dt) x.open = false; }); })); // une section ouverte à la fois
        paintChosen(); paintCols(); paintAlso(); paintPresets(); if (chosen) refreshRows();
        /** pour l'élément de l'Atelier : {key, label, extra, ds} (null : rien de choisi) */
        const collect = async () => {
            const cur = read(); if (!cur.src && !cur.ask) return null;
            const r = rowsRes && rowsRes.d ? rowsRes : await run(cur, 50); const d = r.d; if (!d) return null;
            const rows = (mode === 'rows' ? r.rows.filter(x => picked.has(rowKey(d, x))) : r.rows.slice(0, 20)).map(x => ({k: rowKey(d, x), t: rowTitle(d, x), s: rowSub(d, x), u: rowUrl(d, x)}));
            if (mode === 'rows' && !rows.length) throw new Error(T('Coche au moins une ligne, ou garde toute la liste filtrée.'));
            const label = mode === 'rows' && rows.length === 1 ? `${rows[0].t} — ${T(d.label)}` : [T(d.label), cur.ask && !cur.src ? `« ${cur.ask} »` : filtersText(cur)].filter(Boolean).join(' · ');
            const extra = mode === 'rows' ? T('Lignes gardées : {n}', {n: rows.length}) : T('Toute la liste filtrée · lignes : {n}', {n: nf(r.total)});
            return {key: d.id, label: label.slice(0, 290), extra, ds: {list: d.id, label: T(d.label), icon: d.icon || '📋', source: d.source || '', url: okUrl(d.sourceUrl), cfg: {...cur, src: cur.src || d.id, ask: cur.src ? '' : cur.ask}, mode, rows, total: r.total, at: new Date().toISOString().slice(0, 10)}};
        };
        const api = {read, collect, root}; host._atd = api; return api;
    }

    /* ═════════ 🧩 le widget d'un projet (heritage-atelier-widgets.js) ═════════ */
    /** body : la case du widget ; w : {id, type: 'donnees', cfg} ; save() l'enregistre ; edit : ouvrir le réglage */
    /* 🗂 plusieurs sources côte à côte : des onglets dans le widget (w.cfg = {tabs: [config…], cur}) ; un seul onglet = la config telle quelle */
    const tabsOf = cfg => (Array.isArray(cfg?.tabs) && cfg.tabs.length ? cfg.tabs : [cfg || {}]);
    const tabLabel = (t, k) => { const c = cfgOf(t); return c.title || (c.src ? T(listById(c.src)?.label || c.src) : c.ask ? `💬 ${c.ask}` : T('Onglet {n}', {n: k + 1})); };
    const tabBar = (tabs, i) => (tabs.length > 1 ? `<div class="atd-tabs" role="tablist">${tabs.map((t, k) => `<button type="button" role="tab" class="atd-tab${k === i ? ' is-on' : ''}" aria-selected="${k === i}" data-atd-tab="${k}">${esc(cfgOf(t).icon || listById(cfgOf(t).src)?.icon || '📋')} ${esc(String(tabLabel(t, k)).slice(0, 40))}</button>`).join('')}</div>` : '');
    function mountWidget(body, w, {save, edit = false, duplicate = null, tab = null} = {}) {
        const tabs = tabsOf(w.cfg), i = Math.max(0, Math.min(tabs.length - 1, tab ?? Number(w.cfg?.cur || 0))), c = cfgOf(tabs[i]);
        const again = (o2 = {}) => mountWidget(body, w, {save, duplicate, ...o2});
        const setTabs = (arr, cur) => { w.cfg = arr.length > 1 ? {tabs: arr, cur} : {...arr[0]}; save?.(); };
        const sec = body.closest('.h-atw'); if (sec) { sec.classList.toggle('is-wide', edit || (!c.src && !c.ask) || ['L', 'full'].includes(c.size)); sec.classList.toggle('atd-sz-full', c.size === 'full'); } // 📐 la taille du widget
        body.innerHTML = tabBar(tabs, i);
        const box = document.createElement('div'); box.className = 'atd'; body.appendChild(box);
        body.querySelectorAll('[data-atd-tab]').forEach(b => b.addEventListener('click', () => { if (tabs.length > 1) { w.cfg = {tabs, cur: Number(b.dataset.atdTab)}; save?.(); } again({tab: Number(b.dataset.atdTab)}); }));
        if (edit || (!c.src && !c.ask)) {
            return chooser(box, c, {display: true, duplicate: duplicate ? cur => duplicate(cur) : null,
                tabs: {count: tabs.length,
                    add: cur => { const arr = [...tabs]; arr[i] = cur; arr.push({}); setTabs(arr, arr.length - 1); again({tab: arr.length - 1, edit: true}); },
                    remove: () => { const before = w.cfg, arr = tabs.filter((_, k) => k !== i); setTabs(arr, 0); again({tab: 0}); A().undoToast?.(T('Onglet retiré'), {undo: () => { w.cfg = before; save?.(); again({tab: i}); }}); }},
                onDone: cur => { const before = w.cfg, arr = [...tabs]; arr[i] = cur; setTabs(arr, i); again({tab: i}); // ↶ un réglage changé se défait
                    if (before && (tabsOf(before)[i]?.src || tabsOf(before)[i]?.ask) && A().undoToast) A().undoToast(T('Widget réglé'), {undo: () => { w.cfg = before; save?.(); again({tab: i}); }}); },
                onCancel: c.src || c.ask ? () => again({tab: i}) : (tabs.length > 1 ? () => { const arr = tabs.filter((_, k) => k !== i); setTabs(arr, 0); again({tab: 0}); } : null)});
        }
        show(box, c);
    }

    /* ═════════ 🔗 l'élément « 📊 Une donnée téléchargée » de l'Atelier (heritage-research.js) ═════════ */
    const appForm = (host, ds) => chooser(host, ds?.cfg || {}, {pickRows: true, buttons: false, ds});
    /** l'aperçu vivant : les lignes d'aujourd'hui (toute la liste) ou les lignes gardées, toujours la source */
    async function preview(box, ds) {
        if (!ds || !ds.list) { box.innerHTML = emptyLine('📊', esc(T('Rien de choisi.'))); return; }
        const c = cfgOf(ds.cfg);
        if (ds.mode === 'rows') {
            let live = null; try { const d = listById(ds.list); if (d && eligible(d) && await E().isInstalled?.(d)) { const r = await run({...c, src: ds.list, ask: ''}, 2000); const by = new Map((r.all || r.rows).map(x => [rowKey(d, x), x])); live = {d, by, st: r.st}; } } catch (_) {}
            box.innerHTML = `<div class="atd"><div class="atd-head"><b>${esc(ds.icon || '📋')} ${esc(ds.label)}</b><button type="button" class="link-button" data-atd-go>${esc(T('Ouvrir la liste'))} ↗</button></div>
                <ul class="atd-rows">${(ds.rows || []).map(r => { const x = live?.by.get(r.k), t = x ? rowTitle(live.d, x) : r.t, s = x ? rowSub(live.d, x) : r.s, u = (x ? rowUrl(live.d, x) : '') || okUrl(r.u); return `<li><span>${esc(t)}</span>${s ? ` <small>${esc(s)}</small>` : ''}${u ? ` <a class="atd-src" href="${esc(u)}" target="_blank" rel="noopener noreferrer">↗ ${esc(T('source'))}</a>` : ''}${live && !x ? ` <small class="muted">${esc(T('(plus dans la liste)'))}</small>` : ''}</li>`; }).join('')}</ul>
                ${ds.source ? `<p class="atd-lic">${esc(T('Source :'))} ${okUrl(ds.url) ? `<a href="${esc(ds.url)}" target="_blank" rel="noopener noreferrer">${esc(ds.source)} ↗</a>` : esc(ds.source)}</p>` : ''}</div>`;
            box.querySelector('[data-atd-go]')?.addEventListener('click', () => open({...c, src: ds.list}));
            return;
        }
        const el = document.createElement('div'); el.className = 'atd'; box.innerHTML = ''; box.appendChild(el);
        show(el, {...c, src: ds.list, ask: '', view: 'list', n: 8});
        if (ds.source) { const p = document.createElement('div'); p.innerHTML = `<p class="atd-lic" data-atd-lic>${esc(T('Source :'))} ${okUrl(ds.url) ? `<a href="${esc(ds.url)}" target="_blank" rel="noopener noreferrer">${esc(ds.source)} ↗</a>` : esc(ds.source)}</p>`; const obs = new MutationObserver(() => { if (!el.querySelector('.atd-lic') && !box.querySelector('[data-atd-lic]') && !el.querySelector('.ui-spinner')) box.appendChild(p.firstChild); obs.disconnect(); }); obs.observe(el, {childList: true}); }
    }
    /** pour l'export du projet : du texte et la source (jamais le pack) */
    function exportText(ds) {
        if (!ds) return '';
        const rows = (ds.rows || []).map(r => `${r.t}${r.s ? ` (${r.s})` : ''}`).slice(0, 50).join(' ; ');
        const more = ds.mode !== 'rows' && Number(ds.total) > (ds.rows || []).length ? ` … (${T('lignes : {n}', {n: nf(ds.total)})})` : '';
        return `${rows}${more}${ds.source ? ` — ${T('Source :')} ${ds.source}${ds.url ? ` <${ds.url}>` : ''}` : ''}`;
    }

    /* ═════════ 📊 le widget du tableau de bord ═════════ */
    const DW = 'donnees_widget';
    ext.dashboard = ext.dashboard || {}; ext.dashboardConfig = ext.dashboardConfig || {};
    ext.dashboard[DW] = {load: () => Promise.resolve(null), render: (index, widget, span) => {
        const id = 'atd' + Math.random().toString(36).slice(2, 9), c = cfgOf(widget?.config);
        setTimeout(() => { const el = document.getElementById(id); if (!el) return; const tabs = tabsOf(widget?.config);
            const paint = k => { const t = cfgOf(tabs[k]); el.innerHTML = `${tabBar(tabs, k)}<div class="atd"></div>`; el.querySelectorAll('[data-atd-tab]').forEach(b => b.addEventListener('click', () => paint(Number(b.dataset.atdTab))));
                const box = el.lastElementChild; if (!t.src && !t.ask) box.innerHTML = emptyLine('📊', esc(T('Choisis la liste dans ⚙ Réglages du widget.'))); else show(box, t); };
            paint(0); }, 0);
        const html = `<div class="atd-dash" id="${id}"></div>`;
        return A().card ? A().card(index, `📊 ${T('Données téléchargées')}`, '', html, span) : html;
    }};
    ext.dashboardConfig[DW] = {
        html: w => { const id = 'atdc' + Math.random().toString(36).slice(2, 9); setTimeout(() => { const el = document.getElementById(id); if (el) el._atd = chooser(el, w?.config || {}, {display: true, buttons: false}); }, 0); return `<div class="atd-dcfg" id="${id}" data-atd-dcfg></div>`; },
        read: ed => { const el = ed.querySelector('[data-atd-dcfg]'); return el?._atd ? el._atd.read() : {}; },
    };
    function register() {
        const app = A(); if (!Array.isArray(app.defaultDashboardBlocks)) return false;
        if (!app.defaultDashboardBlocks.some(x => x[0] === DW)) { app.defaultDashboardBlocks.push([DW, '📊 Données téléchargées']); if (app.defaultDashboardBlockSpans) app.defaultDashboardBlockSpans[DW] = '6'; if (app.dashboardWidgetInfo) app.dashboardWidgetInfo[DW] = T('Une liste de données (séismes, guerres, Tour de France…) filtrée : par période, autour d’un lieu ou des lieux de la famille.'); }
        return true;
    }
    if (!register()) document.addEventListener('DOMContentLoaded', () => { if (!register()) setTimeout(register, 800); }, {once: true});

    ext.atelierData = {chooser, run, show, view, mountWidget, appForm, preview, open, exportText, eligible, rowTitle, rowSub, rowUrl, rowKey, DW};
})();
