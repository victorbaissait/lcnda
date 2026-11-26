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
    const DEF = {src: '', ask: '', from: '', to: '', where: '', place: '', lat: null, lon: null, km: 15, famOnly: false, view: 'list', n: 5};
    const cfgOf = c => ({...DEF, ...(c && typeof c === 'object' ? c : {})});
    const VIEWS = [['list', '📋 Liste'], ['count', '📈 Nombre et petit graphique'], ['map', '🗺 Petite carte']];
    const NS = [3, 5, 8, 12, 20];

    /** les listes qu'on peut proposer : montrées, lues ici (pas un lien, pas « en ligne ») */
    const eligible = d => !!d && !d.link && !d.online && !d.needsInternet && (typeof d.load === 'function' || typeof d.query === 'function') && E().shown?.(d) !== false;
    const listById = id => (E().list?.() || []).find(d => d.id === id) || null;

    /* ═════════ les lignes ═════════ */
    const fieldsOf = d => (d.fields || []).filter(f => f.type !== 'url' && !f.hidden && f.key !== 'sources');
    function rowTitle(d, r) {
        const fs = fieldsOf(d), f = fs.find(x => ['text', 'place', 'enum'].includes(x.type || 'text') && r[x.key] != null && r[x.key] !== '') || fs.find(x => r[x.key] != null && r[x.key] !== '');
        const v = f ? r[f.key] : r.title || r.name || r.label || '';
        return String(Array.isArray(v) ? v.join(', ') : v).slice(0, 200);
    }
    function rowSub(d, r) {
        const p = E().periodOf?.(d, r), out = [];
        if (p) out.push(p[0] === p[1] || p[1] >= 9999 ? String(p[0]) : `${p[0]}–${p[1]}`);
        const t = rowTitle(d, r), pl = (d.fields || []).find(f => f.type === 'place' && r[f.key] && String(r[f.key]) !== t);
        if (pl) out.push(String(r[pl.key]));
        if (r._km != null) out.push(T('à {km} km', {km: nf(r._km)}));
        return out.join(' · ');
    }
    const okUrl = u => (/^https?:\/\/[^\s"'<>]+$/i.test(String(u || '')) ? String(u) : '');
    function rowUrl(d, r) {
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
        return st;
    }
    /** {d, st, rows, total, all?, missing?, notInstalled?, note?} — limit : combien de lignes au plus */
    async function run(c0, limit = 5) {
        const c = cfgOf(c0);
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
        if (!(await E().isInstalled?.(d))) return {d, rows: [], total: 0, notInstalled: true};
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
    const filtersText = c => [c.from !== '' || c.to !== '' ? `📅 ${c.from || '…'} → ${c.to || '…'}` : '', c.where === 'place' && c.place ? T('📍 à {km} km de {p}', {km: c.km, p: c.place}) : '', c.where === 'family' ? T('👪 à {km} km des lieux de la famille', {km: c.km}) : '', c.famOnly ? T('👪 quand la famille y vivait') : ''].filter(Boolean).join(' · ');
    function open(c0) { const c = cfgOf(c0), d = listById(c.src); if (c.ask && !c.src) return ext.dataHome?.ask ? (A().setModule?.('listes'), ext.dataHome.ask(c.ask)) : null; if (!d) return A().toast?.(T('Cette liste n’existe plus.'), 'error'); stateFor(c).then(st => E().open?.(d.id, st)); }
    const sourceLine = d => (d?.source ? `<p class="atd-lic">${esc(T('Source :'))} ${okUrl(d.sourceUrl) ? `<a href="${esc(d.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(d.source)} ↗</a>` : esc(d.source)}</p>` : '');
    const rowLi = (d, r, i) => { const u = rowUrl(d, r), sub = rowSub(d, r); return `<li><button type="button" class="link-button" data-atd-row="${i}">${esc(rowTitle(d, r) || '—')}</button>${sub ? ` <small>${esc(sub)}</small>` : ''}${u ? ` <a class="atd-src" href="${esc(u)}" target="_blank" rel="noopener noreferrer">↗ ${esc(T('source'))}</a>` : ''}</li>`; };
    const goDonnees = () => { const st = A().state; if (!st) return; st.listType = 'donnees'; A().setModule?.('listes'); };
    const noneHtml = () => emptyLine('📦', `${esc(T('Aucune donnée téléchargée pour l’instant.'))} <button type="button" class="link-button" data-atd-gods>${esc(T('Voir les données à télécharger'))} →</button>`);

    /** le corps montré : liste, nombre + petit graphique, petite carte */
    function view(res, c0) {
        const c = cfgOf(c0), d = res.d;
        if (res.note) return emptyLine('💬', esc(res.note));
        if (res.missing) return emptyLine('📦', `${esc(T('Cette liste n’est pas disponible ici.'))} <button type="button" class="link-button" data-atd-gods>${esc(T('Voir les données'))} →</button>`);
        if (res.notInstalled) return emptyLine('⤓', `${esc(T('{l} : pas encore téléchargée sur cet ordinateur.', {l: T(d.label)}))} <button type="button" class="link-button" data-atd-gods>${esc(T('Voir les données à télécharger'))} →</button>`);
        const head = `<div class="atd-head"><b>${esc(d.icon || '📋')} ${esc(T(d.label))}</b><button type="button" class="link-button" data-atd-go>${esc(T('Ouvrir la liste'))} ↗</button></div>${filtersText(c) || c.ask ? `<small class="muted">${esc(c.ask && !c.src ? `💬 « ${c.ask} »` : filtersText(c))}</small>` : ''}`;
        let body;
        if (!res.total) body = emptyLine('🔎', esc(T('Rien pour ces filtres.')));
        else if (c.view === 'count') {
            const ys = (res.all || res.rows).map(r => E().periodOf?.(d, r)?.[0]).filter(Number.isFinite);
            let bars = '';
            if (ys.length > 1) { const lo = Math.min(...ys), hi = Math.max(...ys), step = Math.max(1, Math.ceil((hi - lo + 1) / 12)), n = Math.ceil((hi - lo + 1) / step), b = new Array(n).fill(0); ys.forEach(y => { b[Math.min(n - 1, Math.floor((y - lo) / step))]++; }); const mx = Math.max(...b);
                bars = `<div class="atd-bars" role="img" aria-label="${esc(T('Par période, de {a} à {b}', {a: lo, b: hi}))}">${b.map((v, i) => `<span style="height:${Math.max(4, Math.round(v / mx * 100))}%" title="${lo + i * step}–${lo + (i + 1) * step - 1} : ${v}"></span>`).join('')}</div><div class="atd-axis"><span>${lo}</span><span>${hi}</span></div>`; }
            body = `<div class="atd-big">${nf(res.total)}${res.more ? '+' : ''} <small>${esc(T('lignes'))}</small></div>${bars}`;
        } else if (c.view === 'map' && ext.miniMap && d.geo) {
            const pts = (res.all || res.rows).slice(0, 300).map(r => { const g = E().geoOf?.(d, r); return g ? {lat: g[0], lon: g[1], label: rowTitle(d, r)} : null; }).filter(Boolean);
            body = `${ext.miniMap(pts, [], {height: 220})}<small class="muted">${esc(T('Lignes : {n}', {n: nf(res.total)}))}</small>`;
        } else body = `<ul class="atd-rows">${res.rows.map((r, i) => rowLi(d, r, i)).join('')}</ul>${res.total > res.rows.length ? `<small class="muted">${esc(T('{a} sur {n} lignes', {a: nf(res.rows.length), n: nf(res.total)}))}</small>` : ''}`;
        return `${head}${body}${sourceLine(d)}`;
    }
    /** les clics d'un corps montré (lignes, « Ouvrir la liste », aller dans Données) */
    function bindView(el, getRes, c) {
        el.addEventListener('click', e => {
            if (e.target.closest('[data-atd-gods]')) return goDonnees();
            if (e.target.closest('[data-atd-go]') || e.target.closest('[data-atd-row]')) { const r = getRes(); if (r?.d && r.st && !(c.src)) return E().open?.(r.d.id, r.st); return open(c); }
        });
    }
    /** montre une config (lit seulement quand c'est visible) */
    function show(el, c0, {limit} = {}) {
        const c = cfgOf(c0); let res = null;
        el.innerHTML = spin('Chargement…');
        const go = async () => { try { res = await run(c, limit || (c.view === 'list' ? Number(c.n) || 5 : 500)); if (el.isConnected) el.innerHTML = view(res, c); } catch (e) { if (el.isConnected) el.innerHTML = emptyLine('⚠️', esc(e.message || String(e))); } };
        bindView(el, () => res, c);
        lazy(el, go);
        return {get res() { return res; }};
    }
    function lazy(el, fn) {
        if (!('IntersectionObserver' in window)) return void fn();
        const io = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) { io.disconnect(); fn(); } });
        io.observe(el);
    }

    /* ═════════ le réglage : choisir la liste (ou une question), les filtres, l'affichage ═════════ */
    /** chooser(hôte, config, {display, pickRows, ds, buttons, onDone(cfg), onCancel()}) → {read(), collect()} */
    function chooser(host, c0, o = {}) {
        const c = cfgOf(c0); let chosen = c.src ? listById(c.src) : null, rowsRes = null, picked = new Set((o.ds?.rows || []).map(r => r.k)), mode = o.ds?.mode || 'all';
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
                ${o.display ? `<label>${esc(T('Affichage'))}<select data-atd-f="view">${VIEWS.map(([k, l]) => `<option value="${k}" ${c.view === k ? 'selected' : ''}>${esc(T(l))}</option>`).join('')}</select></label>
                <label>${esc(T('Combien de lignes ?'))}<select data-atd-f="n">${NS.map(n => `<option value="${n}" ${Number(c.n) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>` : ''}
            </div>
            ${o.pickRows ? `<fieldset class="atd-mode" data-atd-modebox><legend>${esc(T('Garder'))}</legend><label class="checkbox-line"><input type="radio" name="atd_mode" value="all" ${mode === 'all' ? 'checked' : ''}> ${esc(T('Toute la liste filtrée'))}</label><label class="checkbox-line"><input type="radio" name="atd_mode" value="rows" ${mode === 'rows' ? 'checked' : ''}> ${esc(T('Seulement les lignes cochées'))}</label></fieldset><div data-atd-rows></div>` : ''}
            ${o.buttons !== false ? `<div class="atd-actions"><button type="button" class="button small" data-atd-ok>${esc(T('Afficher'))}</button>${o.onCancel ? `<button type="button" class="button small secondary" data-atd-cancel>${esc(T('Annuler'))}</button>` : ''}</div>` : ''}
        </div>`;
        const root = host.querySelector('[data-atd-cfg]'), q = s => root.querySelector(s), f = k => q(`[data-atd-f="${k}"]`);
        const read = () => ({src: chosen?.id || '', ask: chosen ? '' : String(f('ask')?.value || '').trim(), from: f('from').value, to: f('to').value, where: f('where').value, place: String(f('place').value || '').trim(),
            lat: f('place').value === c.place ? c.lat : null, lon: f('place').value === c.place ? c.lon : null, km: Math.max(1, Math.min(500, Number(f('km').value) || 15)), famOnly: f('famOnly').checked,
            view: f('view')?.value || c.view, n: Number(f('n')?.value) || c.n});
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
                onPick: d => { chosen = d; if (f('ask')) f('ask').value = ''; paintChosen(); refreshRows(); },
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
        root.addEventListener('click', e => {
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
        paintChosen(); if (chosen) refreshRows();
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
        return {read, collect, root};
    }

    /* ═════════ 🧩 le widget d'un projet (heritage-atelier-widgets.js) ═════════ */
    /** body : la case du widget ; w : {id, type: 'donnees', cfg} ; save() l'enregistre ; edit : ouvrir le réglage */
    function mountWidget(body, w, {save, edit = false} = {}) {
        const c = cfgOf(w.cfg);
        const box = document.createElement('div'); box.className = 'atd'; body.innerHTML = ''; body.appendChild(box);
        if (edit || (!c.src && !c.ask)) {
            return chooser(box, c, {display: true, onDone: cur => { w.cfg = cur; save?.(); mountWidget(body, w, {save}); }, onCancel: c.src || c.ask ? () => mountWidget(body, w, {save}) : null});
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
        setTimeout(() => { const el = document.getElementById(id); if (!el) return; if (!c.src && !c.ask) { el.innerHTML = emptyLine('📊', esc(T('Choisis la liste dans ⚙ Réglages du widget.'))); return; } show(el, c); }, 0);
        const html = `<div class="atd" id="${id}"></div>`;
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
