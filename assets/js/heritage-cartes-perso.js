/* LCNDA — 🗺 Mes cartes (Carte → « 🗺 Mes cartes ») : des cartes sur mesure, construites sur la Carte (même moteur : tuiles,
 * déplacement, zoom de app-carte.js ; crochets ext.mapSetup / ext.mapDraw ; ⇆ Comparer, 🏛 Frontières, 🧭 Outils et ✏️ Mes couches
 * restent là). Une carte = un nom, une description, un fond, une période (C4), une vue gardée et des COUCHES : tout ce que la base
 * sait placer (naissances… images de lieux, animaux, couches dessinées), chacune avec ses filtres (dates, personnes et leurs
 * ascendants / descendants, Sosa, côté, branche, étiquettes, lieu + rayon, zone dessinée, certitude, sortes…) et son style (C2, forme,
 * taille C3, regroupement, chaleur, étiquettes, couleur par sorte). Curseur du temps ▶, légende, export E3 (PDF, PNG, JPG, SVG) et
 * GeoJSON / KML, impression L1, widget du tableau de bord, mise en page, site web, 💾 réglages enregistrés (la définition seule).
 * Calculs : app-cartes-perso-core.js (LCNDA_CARTES_PERSO) ; serveur : lib/cartes_perso.php. Mode d'emploi : docs/UI.md (« 🗺 Mes cartes »).
 * Préfixe CSS et data- : mcp-.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    for (const key of ['mapSetup', 'mapDraw']) ext[key] = ext[key] || [];
    ext.dashboard = ext.dashboard || {}; ext.dashboardConfig = ext.dashboardConfig || {};
    const A = () => window.LCNDA_APP, UI = () => window.LCNDA_UI || {}, P = () => window.LCNDA_PICKER || A(), C = () => window.LCNDA_CARTES_PERSO;
    const S = () => A()?.state || {}, DC = () => ext.diagramCartes, HP = () => ext.cartesOutils?.helpers;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const toast = (m, k, o) => A()?.toast?.(m, k, o);
    const pl = (n, w, m) => A()?.plural ? A().plural(n, w, m) : `${n} ${w}`;
    const isF = Number.isFinite, r1 = v => Math.round(v * 10) / 10;
    const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch (_) { return d; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* navigateur sans stockage */ } };
    const readOnly = () => document.body.classList.contains('is-kiosk') || document.documentElement.classList.contains('is-mode-simple') || !!S().kiosk;
    const res = r => r?.result ?? r;
    const get = (op, q = {}) => A().api('cartes_perso', {op, ...q}).then(res);
    const post = (op, body) => A().api('cartes_perso_write', {}, {method: 'POST', body: {op, ...body}}).then(res);
    const clone = v => JSON.parse(JSON.stringify(v));
    const download = (blob, name) => { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); };
    const fileBase = n => String(n || 'ma-carte').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'ma-carte';
    const CUR_KEY = 'lcnda-mes-cartes-cur', PANEL_KEY = 'lcnda-mes-cartes-panel', PRESETS_KEY = 'genealogie-mes-cartes-presets', LIST_KEY = 'carte:mes-cartes';
    const M = {cur: lsGet(CUR_KEY, null), map: null, saved: '', data: null, dataKey: '', t: null, timer: 0, panel: lsGet(PANEL_KEY, true), openL: {}, last: null, list: null, hits: [], seq: 0, saveT: 0, pending: null};
    const rerender = () => window.LCNDA_PARTS?.renderMap?.(++S().workspaceToken);
    const redraw = () => A()?.drawMap?.();

    /* ═════════ Les cartes (serveur) ═════════ */
    async function loadList(force = false) {
        if (M.list && !force) return M.list;
        try { const r = await get('list'); M.list = {maps: r.maps || [], ready: r.ready || []}; } catch (_) { M.list = M.list || {maps: [], ready: []}; }
        return M.list;
    }
    const findMap = id => [...(M.list?.maps || []), ...(M.list?.ready || [])].find(m => String(m.id) === String(id));
    const isReady = m => String(m?.id || '').startsWith('ready:');
    const dataKeyOf = (def, share) => JSON.stringify([C().forServer(def).layers.map(l => [l.id, l.kind, l.f]), def.time.from, def.time.to, !!share]);
    async function fetchData(def, share = false) {
        return get('data', {def: JSON.stringify(C().forServer(def)), share: share ? 1 : ''});
    }
    async function loadData(force = false) {
        const k = dataKeyOf(M.map.def, false);
        if (!force && k === M.dataKey && M.data) return M.data;
        const my = ++M.seq;
        try { const d = await fetchData(M.map.def); if (my === M.seq) { M.data = d; M.dataKey = k; } }
        catch (e) { if (my === M.seq) { M.data = {layers: [], years: null}; toast(e.message, 'error'); } }
        return M.data;
    }
    /** une carte enregistrée (une carte prête devient une des miennes au premier changement) */
    async function saveMap(m) {
        const r = await post('save', {id: isReady(m) ? 0 : Number(m.id) || 0, name: m.name, description: m.description || '', def: C().forServer(m.def)});
        const saved = r.map;
        await loadList(true);
        return saved;
    }

    /* ═════════ Ouvrir, la liste, la colonne ═════════ */
    function setCur(id) { M.cur = id ?? null; lsSet(CUR_KEY, M.cur); }
    async function open(id) {
        setCur(id); M.map = null; M.t = null; M.data = null; M.dataKey = ''; stopPlay();
        S().mapMode = 'mine'; A().persistUiState?.();
        if (S().module !== 'carte') A().setModule('carte'); else { A().renderSidebar?.(); rerender(); }
    }
    /** appelé par renderMap (app-carte.js) : false = la page de la liste est dessinée ; true = la Carte dessine la carte ouverte */
    async function before(token) {
        await loadList();
        const m = M.cur ? findMap(M.cur) : null;
        if (!m) { setCur(null); M.map = null; S().mapMineBg = ''; await renderList(token); return false; }
        if (!M.map || String(M.map.id) !== String(m.id)) { M.map = clone(m); M.map.def = C().cleanDef(M.map.def); M.saved = JSON.stringify(M.map); M.needFit = true; M.t = null; }
        S().mapMineBg = M.map.def.bg || '';
        await loadData();
        if (M.needFit) S().mapKeepCenter = true;
        return token === S().workspaceToken;
    }
    function thumbHtml(m) {
        const ls = (m.def?.layers || []).slice(0, 6);
        return `<span class="ui-card-ico mcp-thumb" aria-hidden="true">${ls.length ? ls.map((l, i) => `<i style="background:${esc(l.s.color)};left:${18 + (i * 37) % 64}%;top:${22 + (i * 23) % 56}%"></i>`).join('') : ''}<b>${esc(C().KIND[ls[0]?.kind]?.icon || '🗺')}</b></span>`;
    }
    const kindsLine = m => { const ls = m.def?.layers || []; return ls.length ? `${pl(ls.length, 'couche')} · ${[...new Set(ls.map(l => C().KIND[l.kind]?.icon || ''))].join(' ')}` : 'Aucune couche'; };
    async function renderList(token) {
        const ws = A().$('#workspace'), U = UI(), ro = readOnly();
        ws.innerHTML = `<section class="page mcp-page">${U.pageHeader ? U.pageHeader({title: 'Mes cartes', icon: '🗺', where: 'Carte',
            help: 'Des cartes sur mesure : tu choisis ce qu’on y voit (naissances, trajets, images de lieux, métiers…), pour qui et entre quelles dates. Chaque couche a ses filtres et son style.',
            primary: ro ? '' : '<button type="button" class="button" data-mcp-new>＋ Nouvelle carte</button>',
            actions: ro ? [] : ['<button type="button" class="button secondary" data-mcp-import>⤒ Importer une carte…</button>']}) : '<h1>🗺 Mes cartes</h1>'}
            <div class="mcp-list-host"></div></section>`;
        const host = ws.querySelector('.mcp-list-host');
        host.innerHTML = U.spinner ? U.spinner('Chargement de mes cartes…') : '';
        const L = await loadList(true);
        if (token !== undefined && token !== S().workspaceToken) return;
        const all = [...L.ready.map(m => ({...m, _ready: true})), ...L.maps];
        const draw = st => {
            const q = st?.q || '', kinds = st?.filters?.kind || [], sort = st?.sort || 'recent';
            let rows = all.filter(m => (!q || U.listMatch?.text?.(q, m.name, m.description, ...(m.def?.layers || []).map(l => l.name)) !== false) && (!kinds.length || (m.def?.layers || []).some(l => kinds.includes(l.kind))));
            rows = rows.sort((a, b) => sort === 'az' ? a.name.localeCompare(b.name, 'fr') : sort === 'za' ? b.name.localeCompare(a.name, 'fr') : sort === 'old' ? String(a.updated_at || '').localeCompare(String(b.updated_at || '')) : (b._ready ? 1 : 0) - (a._ready ? 1 : 0) || String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
            bar.setCount?.(rows.length, 'carte');
            const items = rows.map(m => ({thumb: thumbHtml(m), name: m.name, open: `data-mcp-open="${esc(m.id)}"`, lines: [m.description || '', kindsLine(m)],
                badges: m._ready ? [{text: 'Prête', kind: 'blue'}] : [], when: m.updated_at || '', whenLabel: 'Modifié',
                menu: ro ? [] : [`<button type="button" data-mcp-dup="${esc(m.id)}">⧉ Dupliquer</button>`, ...(m._ready ? [] : [`<button type="button" data-mcp-ren="${esc(m.id)}">✎ Renommer</button>`]),
                    `<button type="button" data-mcp-share="${esc(m.id)}">💾 Partager la définition</button>`, ...(m._ready ? [] : [`<button type="button" class="danger" data-mcp-del="${esc(m.id)}">🗑 Supprimer</button>`])]}));
            list.innerHTML = rows.length ? (U.itemsHtml ? U.itemsHtml(st?.view === 'list' ? 'list' : 'cards', items) : '') : A().empty(q || kinds.length ? '🔍 Aucune carte ne correspond' : 'Aucune carte pour l’instant', {icon: '🗺'});
        };
        const list = document.createElement('div'); list.className = 'mcp-list';
        const bar = U.listBar ? U.listBar({key: LIST_KEY, search: {placeholder: 'Chercher une carte… (ex. naissances, Corrèze)'},
            filters: [{id: 'kind', label: 'Ce qu’elle montre', type: 'check', options: C().KINDS.map(k => [k[0], `${k[1]} ${k[2]}`])}],
            view: {dflt: 'cards', what: 'cartes'}, sort: {options: [['recent', 'Les plus récentes'], ['old', 'Les plus anciennes'], ['az', 'A → Z'], ['za', 'Z → A']], value: 'recent'},
            count: {n: all.length, label: 'carte'}, onChange: st => draw(st)}) : document.createElement('div');
        host.innerHTML = ''; host.append(bar, list);
        draw(bar.state);
        ws.querySelector('[data-mcp-new]')?.addEventListener('click', () => newMap());
        ws.querySelector('[data-mcp-import]')?.addEventListener('click', () => importDef());
        list.addEventListener('click', async e => {
            const b = e.target.closest('button,[data-mcp-open]'); if (!b) return;
            if (b.dataset.mcpOpen) return open(b.dataset.mcpOpen);
            if (b.dataset.mcpDup) return duplicate(b.dataset.mcpDup);
            if (b.dataset.mcpRen) { const m = findMap(b.dataset.mcpRen); const nm = await A().askText({title: 'Renommer la carte', value: m.name, okLabel: 'Enregistrer'}); if (nm && nm !== m.name) { const before = clone(m); await saveMap({...m, name: nm.slice(0, 80)}); renderList(); A().undoToast?.(`Carte renommée « ${nm.slice(0, 80)} »`, {undo: async () => { await saveMap(before); renderList(); }}); } return; }
            if (b.dataset.mcpShare) return shareDef(findMap(b.dataset.mcpShare));
            if (b.dataset.mcpDel) return removeMap(findMap(b.dataset.mcpDel), () => renderList());
        });
    }
    async function sidebar(content) {
        const box = document.createElement('div'); box.className = 'mcp-sidebar';
        box.innerHTML = `<div class="section-label">🗺 Mes cartes</div><div class="side-menu" data-mcp-side>${UI().spinner ? UI().spinner('Chargement…') : ''}</div>${readOnly() ? '' : '<div class="page-actions compact"><button type="button" class="button small" data-mcp-side-new>＋ Nouvelle carte</button></div>'}`;
        content.appendChild(box);
        const L = await loadList();
        const all = [...L.ready, ...L.maps];
        box.querySelector('[data-mcp-side]').innerHTML = `<button type="button" class="side-menu-item ${!M.cur ? 'is-active' : ''}" data-mcp-side-open=""><span class="side-number">☰</span>Toutes mes cartes</button>` +
            all.map((m, i) => `<button type="button" class="side-menu-item ${String(M.cur) === String(m.id) ? 'is-active' : ''}" data-mcp-side-open="${esc(m.id)}"><span class="side-number">${String(i + 1).padStart(2, '0')}</span>${esc(m.name)}</button>`).join('');
        box.addEventListener('click', e => {
            const b = e.target.closest('[data-mcp-side-open]'); if (b) { open(b.dataset.mcpSideOpen || null); return; }
            if (e.target.closest('[data-mcp-side-new]')) newMap();
        });
    }

    /* ═════════ Créer, dupliquer, supprimer, partager ═════════ */
    async function newMap(pre = null) {
        const kinds = ['births', 'marriages', 'deaths'];
        const dlg = ext.openDialog({eyebrow: 'CARTE · MES CARTES', title: 'Nouvelle carte', submitLabel: 'Créer la carte',
            body: `<label>Nom<input name="name" maxlength="80" required placeholder="Les BORIE en Corrèze" value="${esc(pre?.name || '')}"></label>
                <label>Description <small class="muted">(facultatif)</small><textarea name="description" rows="2" maxlength="1000" placeholder="Ce que montre la carte, pour qui, à quelle époque">${esc(pre?.description || '')}</textarea></label>
                ${pre ? '' : `<fieldset class="mcp-new-kinds"><legend>Les premières couches <small class="muted">(tu pourras en ajouter, en retirer et les filtrer)</small></legend>${C().KINDS.map(k => `<label class="checkbox-line"><input type="checkbox" name="kind" value="${k[0]}"${kinds.includes(k[0]) ? ' checked' : ''}> ${k[1]} ${esc(k[2])}</label>`).join('')}</fieldset>`}`,
            onSubmit: async form => {
                const name = form.elements.name.value.trim(); if (!name) return UI().fail(form.elements.name, 'Donne un nom à la carte.');
                let def = pre?.def ? C().cleanDef(pre.def) : C().cleanDef({});
                if (!pre) [...form.querySelectorAll('[name=kind]:checked')].forEach(i => def.layers.push(C().newLayer(i.value, def)));
                const m = await saveMap({id: 0, name, description: form.elements.description.value.trim(), def});
                M.panel = true; lsSet(PANEL_KEY, true);
                await open(m.id);
                A().undoToast?.(`Carte « ${m.name} » créée`, {undo: async () => { await post('delete', {id: m.id}); await loadList(true); if (String(M.cur) === String(m.id)) open(null); }, redo: async () => { await post('restore', {id: m.id}); await loadList(true); open(m.id); }});
            }});
        void dlg;
    }
    async function duplicate(id) {
        const src = findMap(id); if (!src) return;
        let m;
        if (isReady(src)) m = await saveMap({...src, id: 0, name: UI().freeName ? UI().freeName(src.name, (M.list?.maps || []).map(x => x.name)) : `${src.name} (2)`});
        else m = (await post('duplicate', {id: src.id})).map;
        await loadList(true);
        A().undoToast?.(`Carte « ${m.name} » créée (copie)`, {undo: async () => { await post('delete', {id: m.id}); await loadList(true); if (String(M.cur) === String(m.id)) open(null); else rerender(); }});
        open(m.id);
    }
    async function removeMap(m, after) {
        if (!m || isReady(m)) return;
        try { await post('delete', {id: m.id}); } catch (e) { toast(e.message, 'error'); return; }
        await loadList(true);
        if (String(M.cur) === String(m.id)) setCur(null);
        after?.();
        A().undoToast?.(`Carte « ${m.name} » supprimée`, {undo: async () => { await post('restore', {id: m.id}); await loadList(true); after?.(); }, redo: async () => { await post('delete', {id: m.id}); await loadList(true); after?.(); }});
    }
    function shareDef(m) {
        if (!m) return;
        A().exportSettingFile?.('mes-cartes', m.name, {data: C().forServer(m.def), description: m.description || ''});
    }
    async function importDef() {
        const got = await A().importSettingFile?.('mes-cartes', {names: (M.list?.maps || []).map(x => x.name), check: d => d && typeof d.data === 'object'});
        if (!got) return;
        const m = await saveMap({id: 0, name: got.nom, description: String(got.donnees.description || ''), def: C().cleanDef(got.donnees.data)});
        A().undoToast?.(`Carte « ${m.name} » importée`, {undo: async () => { await post('delete', {id: m.id}); await loadList(true); open(null); }});
        open(m.id);
    }

    /* ═════════ Enregistrer chaque changement (K2) avec « ↶ Annuler » (H7) ═════════ */
    function commit(label, {data = 'auto', panel = false} = {}) {
        if (!M.map || readOnly()) return;
        M.map.def = C().cleanDef(M.map.def);
        const before = M.saved, after = JSON.stringify(M.map);
        if (before === after) return;
        M.saved = after;
        const needData = data === true || (data === 'auto' && dataKeyOf(M.map.def) !== M.dataKey);
        if (panel) panelFill();
        (needData ? loadData().then(() => { syncTime(); redraw(); updateCounts(); }) : Promise.resolve(redraw()));
        clearTimeout(M.saveT);
        M.pending = {before: M.pending?.before ?? before, label};
        M.saveT = setTimeout(async () => {
            const p = M.pending; M.pending = null; if (!p || !M.map) return;
            const wasReady = isReady(M.map);
            try {
                const saved = await saveMap(M.map);
                if (wasReady) { M.map.id = saved.id; setCur(saved.id); M.saved = JSON.stringify(M.map); A().renderSidebar?.(); toast(`« ${saved.name} » est gardée dans Mes cartes : tes changements y restent.`); }
                const sv = document.querySelector('.mcp-saved'); if (sv) { sv.hidden = false; clearTimeout(sv._t); sv._t = setTimeout(() => { sv.hidden = true; }, 2500); }
                if (!wasReady) A().undoToast?.(p.label, {undo: () => restoreState(p.before), redo: () => restoreState(after)});
            } catch (e) { toast(e.message, 'error', {retry: () => commit(label)}); }
        }, 450);
    }
    async function restoreState(json) {
        const m = JSON.parse(json); if (!M.map || String(m.id) !== String(M.map.id)) return;
        M.map = m; M.saved = json;
        await saveMap(M.map);
        S().mapMineBg = M.map.def.bg || '';
        await loadData(); panelFill(); syncTime(); redraw();
    }

    /* ═════════ Dessin : un seul dessin des couches, pour l'écran et pour l'export ═════════ */
    /**
     * layersSvg(proj, def, data, o) → {svg, hits}
     *  proj(lon, lat) → [x, y] ; o : {scale (1 = pixels de l'écran), t, w, h, uid, hit (cibles cliquables), margin}
     */
    function layersSvg(proj, def, data, o = {}) {
        const sc = o.scale || 1, uid = o.uid || 'mcp', W = o.w || 1e9, Hh = o.h || 1e9, mg = (o.margin ?? 60) * sc;
        let defs = '', body = ''; const hits = [];
        const inView = (x, y) => isF(x) && isF(y) && x > -mg && y > -mg && x < W + mg && y < Hh + mg;
        const path = pts => pts.map(([lo, la], i) => { const [x, y] = proj(lo, la); return `${i ? 'L' : 'M'}${r1(x)} ${r1(y)}`; }).join('');
        const layers = (def.layers || []).filter(l => l.visible !== false).slice().reverse(); // la première couche de la liste est dessinée par-dessus
        layers.forEach(l => {
            const d = (data?.layers || []).find(x => x.id === l.id); if (!d) return;
            const st = l.s, op = st.opacity / 100, cc = st.byCat ? C().catColors(d.features) : null;
            const col = f => f.col || (cc && cc.get(f.cat)) || st.color;
            const feats = d.features.map(f => C().atTime(f, o.t, def.time.mode, def.time.win)).filter(Boolean);
            const lid = `${uid}-${l.id}`;
            defs += `<marker id="${lid}-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="${r1(5)}" markerHeight="${r1(5)}" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="${st.color}"/></marker>`;
            let g = '';
            // zones (hypothèses de lieu, zones dessinées) : la certitude se lit dans la transparence
            feats.filter(f => f.g === 'z').forEach(f => { const k = f.k ?? 1, c = col(f); g += `<path class="mcp-zone${o.hit ? ' mcp-hit' : ''}" d="${path(f.c[0])}Z" fill="${c}" fill-opacity="${r1(.32 * k * op * 10) / 10}" stroke="${c}" stroke-opacity="${r1(Math.max(.3, k) * op * 10) / 10}" stroke-width="${r1(2 * sc)}"${k < .7 ? ` stroke-dasharray="${r1(6 * sc)} ${r1(4 * sc)}"` : ''}${o.hit ? ` data-mcp-hit="${hits.push({l, items: [f]}) - 1}"` : ''}><title>${esc(f.t)}${f.s ? ' — ' + esc(f.s) : ''}</title></path>`; });
            // traits : migrations, voyages, lieux de vie, trajets GPS, itinéraires
            if (st.lines) feats.filter(f => f.g === 'l').forEach(f => {
                const pts = f.c.map(([lo, la]) => proj(lo, la)); if (pts.length < 2) return;
                let dd = ''; if (pts.length === 2 && f.arrow) { const [[x1, y1], [x2, y2]] = pts, mx = (x1 + x2) / 2 - (y2 - y1) * .15, my = (y1 + y2) / 2 + (x2 - x1) * .15; dd = `M${r1(x1)} ${r1(y1)}Q${r1(mx)} ${r1(my)} ${r1(x2)} ${r1(y2)}`; } else dd = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${r1(x)} ${r1(y)}`).join('');
                g += `<path class="mcp-line${o.hit ? ' mcp-hit' : ''}" d="${dd}" fill="none" stroke="${col(f)}" stroke-opacity="${r1(op * 10) / 10}" stroke-width="${r1(Math.max(1.5, st.size / 4) * sc)}" stroke-linecap="round" stroke-linejoin="round"${f.arrow ? ` marker-end="url(#${lid}-arr)"` : ''}${o.hit ? ` data-mcp-hit="${hits.push({l, items: [f]}) - 1}"` : ''}><title>${esc(f.t)} — ${esc(f.s || '')}</title></path>`;
            });
            const pts = feats.filter(f => f.g === 'p').map(f => { const [x, y] = proj(f.c[0], f.c[1]); return {x, y, f}; }).filter(p => inView(p.x, p.y));
            // plusieurs hypothèses d'une même image : reliées par un trait fin en pointillés
            const grp = new Map(); pts.forEach(p => { if (p.f.grp) { const a = grp.get(p.f.grp) || []; a.push(p); grp.set(p.f.grp, a); } });
            grp.forEach(a => { if (a.length > 1) g += `<path d="${a.map((p, i) => `${i ? 'L' : 'M'}${r1(p.x)} ${r1(p.y)}`).join('')}" fill="none" stroke="${st.color}" stroke-opacity=".55" stroke-width="${r1(1.2 * sc)}" stroke-dasharray="${r1(3 * sc)} ${r1(3 * sc)}"/>`; });
            // cônes de prise de vue
            if (st.cones) pts.filter(p => p.f.cone).forEach(p => { const ring = C().cone(p.f.c[0], p.f.c[1], p.f.cone[0], p.f.cone[1], p.f.cone[2]); g += `<path class="mcp-cone" d="${path(ring)}Z" fill="${col(p.f)}" fill-opacity="${r1(.2 * (p.f.k ?? 1) * 10) / 10 || .1}" stroke="${col(p.f)}" stroke-opacity=".6" stroke-width="${r1(1 * sc)}"/>`; });
            const R = st.size / 2 * sc;
            if (st.heat) {
                defs += `<radialGradient id="${lid}-heat"><stop offset="0" stop-color="${st.color}" stop-opacity="${r1(.55 * op * 10) / 10}"/><stop offset="1" stop-color="${st.color}" stop-opacity="0"/></radialGradient>`;
                pts.forEach(p => { g += `<circle cx="${r1(p.x)}" cy="${r1(p.y)}" r="${r1(R * 4)}" fill="url(#${lid}-heat)"/>`; });
            } else {
                const groups = st.cluster ? C().cluster(pts, Math.max(18, st.size * 3) * sc) : pts.map(p => ({x: p.x, y: p.y, items: [p]}));
                groups.forEach(gp => {
                    const items = gp.items.map(p => p.f), one = items.length === 1, f0 = items[0], k = one ? (f0.k ?? 1) : 1, c = col(f0);
                    const hit = o.hit ? ` data-mcp-hit="${hits.push({l, items}) - 1}"` : '';
                    if (one) {
                        g += `<path class="mcp-pt${o.hit ? ' mcp-hit' : ''}" d="${C().shapePath(st.shape, gp.x, gp.y, R)}" fill="${c}" fill-opacity="${r1(Math.max(.25, k) * op * 100) / 100}" stroke="#fff" stroke-width="${r1(1.6 * sc)}"${k < .7 ? ` stroke-dasharray="${r1(2 * sc)} ${r1(1.5 * sc)}"` : ''}${hit}><title>${esc(f0.t)}${f0.s ? ' — ' + esc(f0.s) : ''}</title></path>`;
                        if (f0.n) g += `<text x="${r1(gp.x)}" y="${r1(gp.y + R * .4 - (st.shape === 'pin' ? R * 2 : 0))}" text-anchor="middle" font-size="${r1(Math.max(8, R * 1.1))}" font-weight="700" fill="#fff" pointer-events="none">${f0.n}</text>`;
                    } else {
                        const rr = R * (1.1 + Math.min(1.6, Math.log10(items.length) * .9));
                        g += `<circle class="mcp-cl${o.hit ? ' mcp-hit' : ''}" cx="${r1(gp.x)}" cy="${r1(gp.y)}" r="${r1(rr)}" fill="${c}" fill-opacity="${r1(op * 100) / 100}" stroke="#fff" stroke-width="${r1(2 * sc)}"${hit}><title>${esc(pl(items.length, 'élément'))}</title></circle><text x="${r1(gp.x)}" y="${r1(gp.y + rr * .36)}" text-anchor="middle" font-size="${r1(Math.max(9, rr * .9))}" font-weight="800" fill="#fff" pointer-events="none">${items.length}</text>`;
                    }
                    if (st.labels && f0.lab) g += `<text class="mcp-lab" x="${r1(gp.x + R + 3 * sc)}" y="${r1(gp.y + 4 * sc)}" font-size="${r1(11 * sc)}" paint-order="stroke" stroke="#fff" stroke-width="${r1(3 * sc)}" fill="#222" pointer-events="none">${esc(f0.lab)}</text>`;
                });
            }
            body += `<g data-mcp-layer="${esc(l.id)}">${g}</g>`;
        });
        return {svg: `<defs>${defs}</defs>${body}`, hits};
    }
    function draw({left, top, z, width, height}) {
        const svg = document.getElementById('mcp-svg'); if (!svg || !M.map || !M.data) return;
        M.last = {left, top, z, width, height};
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        const proj = (lo, la) => [A().lngToX(lo, z) - left, A().latToY(la, z) - top];
        const r = layersSvg(proj, M.map.def, M.data, {t: M.t, w: width, h: height, hit: true, uid: 'mcpv'});
        svg.innerHTML = r.svg; M.hits = r.hits;
        legendFill();
    }

    /* ═════════ La légende ═════════ */
    const miniSym = (l, c) => `<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="${C().shapePath(l.shape, 9, l.shape === 'pin' ? 15 : 9, 5)}" fill="${esc(c || l.color)}" stroke="#fff" stroke-width="1.2"/></svg>`;
    function legendFill() {
        const box = document.getElementById('mcp-legend'); if (!box || !M.map) return;
        box.hidden = !M.map.def.legend;
        if (!M.map.def.legend) return;
        const rows = C().legend(M.map.def, M.data, M.t);
        box.innerHTML = `<b class="mcp-leg-title">${esc(M.map.name)}${M.t !== null ? ` · <span>${M.map.def.time.mode === 'window' ? `${M.t - M.map.def.time.win}–${M.t}` : `jusqu’en ${M.t}`}</span>` : ''}</b>` +
            (rows.length ? rows.map(r => `<div class="mcp-leg-row" data-mcp-leg="${esc(r.id)}" title="${esc(r.note || '')}">${miniSym(r)}<span>${esc(r.name)}</span><small>${r.n.toLocaleString('fr-FR')}</small></div>${r.cats.map(c => `<div class="mcp-leg-cat">${miniSym(r, c.color)}<span>${esc(c.name)}</span></div>`).join('')}`).join('') : `<div class="mcp-leg-row"><span class="muted">Aucune couche montrée</span></div>`);
    }

    /* ═════════ Le curseur du temps ▶ ═════════ */
    const span = () => C().yearsSpan(M.map?.def, M.data);
    function stopPlay() { clearInterval(M.timer); M.timer = 0; const b = document.querySelector('[data-mcp-play]'); if (b) { b.textContent = '▶'; b.setAttribute('aria-label', 'Lire'); } }
    function setT(t) {
        const sp = span(); M.t = t === null || !sp ? null : Math.max(sp[0], Math.min(sp[1], Math.round(t)));
        const r = document.querySelector('[data-mcp-t]'), lab = document.querySelector('[data-mcp-tl]');
        if (r && M.t !== null) r.value = String(M.t);
        if (lab) lab.textContent = M.t === null ? 'Toutes les années' : String(M.t);
        redraw();
    }
    function play() {
        const sp = span(); if (!sp) return;
        if (M.timer) { stopPlay(); return; }
        if (M.t === null || M.t >= sp[1]) M.t = sp[0];
        const steps = Math.max(1, M.map.def.time.secs * 20), inc = Math.max(1, (sp[1] - sp[0]) / steps);
        let cur = M.t;
        const b = document.querySelector('[data-mcp-play]'); if (b) { b.textContent = '⏸'; b.setAttribute('aria-label', 'Pause'); }
        M.timer = setInterval(() => { cur += inc; if (cur >= sp[1] || !document.getElementById('mcp-svg')) { setT(sp[1]); stopPlay(); return; } setT(cur); }, 50);
    }
    function timeHtml() {
        const sp = span(); if (!sp) return '<span class="mcp-time muted">Pas de dates sur cette carte</span>';
        return `<span class="mcp-time" role="group" aria-label="Curseur du temps"><button type="button" class="icon-button small" data-mcp-play aria-label="Lire" title="Faire défiler le temps">▶</button><input type="range" data-mcp-t min="${sp[0]}" max="${sp[1]}" step="1" value="${M.t ?? sp[1]}" aria-label="Année"><b data-mcp-tl>${M.t === null ? 'Toutes les années' : M.t}</b><button type="button" class="button small secondary" data-mcp-tall title="Toutes les années d’un coup">Tout</button></span>`;
    }
    function syncTime() {
        const box = document.querySelector('.mcp-time'); if (!box) return;
        box.outerHTML = timeHtml(); bindTime();
        const sp = span(); if (M.t !== null && sp && (M.t < sp[0] || M.t > sp[1])) M.t = null;
    }
    function bindTime() {
        document.querySelector('[data-mcp-play]')?.addEventListener('click', play);
        document.querySelector('[data-mcp-t]')?.addEventListener('input', e => { stopPlay(); setT(Number(e.target.value)); });
        document.querySelector('[data-mcp-tall]')?.addEventListener('click', () => { stopPlay(); setT(null); });
    }

    /* ═════════ Cadrer ═════════ */
    function fit() {
        const st = document.getElementById('map-stage'), v = M.map.def.view;
        if (v) { S().mapCenter = {lat: v.lat, lon: v.lon}; S().mapZoom = v.zoom; return; }
        const b = C().bounds(M.map.def, M.data);
        if (!b) { S().mapCenter = {lat: 46.7, lon: 2.3}; S().mapZoom = 6; return; }
        S().mapCenter = {lat: (b[1] + b[3]) / 2, lon: (b[0] + b[2]) / 2};
        const w = st?.clientWidth || 900, h = st?.clientHeight || 520;
        let best = 4;
        for (let z = 14; z >= 3; z--) { if (Math.abs(A().lngToX(b[2], z) - A().lngToX(b[0], z)) <= w - 160 && Math.abs(A().latToY(b[1], z) - A().latToY(b[3], z)) <= h - 160) { best = z; break; } }
        S().mapZoom = best;
    }

    /* ═════════ Le panneau « ⚙️ Couches » : tout se règle ici, gardé tout de suite ═════════ */
    const seg = (key, val, list, attr = 'data-mcp-seg') => `<div class="segmented mcp-seg" role="radiogroup">${list.map(([v, lab]) => `<button type="button" role="radio" ${attr}="${key}" data-v="${esc(v)}" class="${String(val) === String(v) ? 'is-active' : ''}" aria-checked="${String(val) === String(v)}">${esc(lab)}</button>`).join('')}</div>`;
    const tg = (label, on, attrs) => UI().toggleHtml ? UI().toggleHtml(label, {checked: !!on, attrs}) : `<label class="ui-toggle"><input type="checkbox" ${attrs}${on ? ' checked' : ''}><i></i>${esc(label)}</label>`;
    const pk = (name, kind, value, multiple, ph) => P().pickerField({name, hiddenName: false, kind, multiple, value: multiple ? (value || []) : (value || null), placeholder: ph || ''});
    function layerBody(l) {
        const f = l.f, s = l.s, k = l.kind, has = x => C().has(k, x), lid = esc(l.id);
        const types = (S().bootstrap?.eventTypes || []).filter(t => Number(t.usage_count) > 0 || f.types.includes(Number(t.id)));
        const row = (lab, html, hint = '') => `<div class="mcp-row"><span class="mcp-lab">${esc(lab)}</span><div class="mcp-val">${html}${hint ? `<small class="ui-hint">${esc(hint)}</small>` : ''}</div></div>`;
        let h = row('Nom', `<input type="text" data-mcp-l="name" maxlength="80" value="${esc(l.name)}">`);
        h += `<div class="mcp-sec">Filtres</div>`;
        h += row('Du', `<input type="text" data-ui-date data-mcp-f="from" value="${esc(f.from)}" placeholder="1850, vers 1784…">`);
        h += row('Au', `<input type="text" data-ui-date data-mcp-f="to" value="${esc(f.to)}" placeholder="1914, avant 1900…">`);
        h += row('', tg('Garder ce qui n’a pas de date', f.undated, 'data-mcp-fb="undated"'));
        if (has('persons')) {
            h += row(k === 'life' ? 'Qui ?' : 'Personnes', pk(`mcp_p_${l.id}`, 'person', f.persons, true), k === 'life' ? 'Une ou plusieurs vies, dans l’ordre des années.' : 'Vide = tout le monde.');
            if (f.persons.length) h += row('Avec', `${seg('rel', f.rel, [['self', 'Elle seule'], ['asc', '+ ascendants'], ['desc', '+ descendants'], ['both', 'Les deux']])}${f.rel !== 'self' ? `<input type="number" min="1" max="40" data-unit="gén." data-mcp-f="gens" value="${f.gens}" aria-label="Générations">` : ''}`);
            h += row('Sosa', `${tg('Seulement les ancêtres (Sosa)', f.sosa, 'data-mcp-fb="sosa"')}${f.sosa ? `<input type="number" min="0" max="40" data-unit="gén." data-mcp-f="sosaGens" value="${f.sosaGens || ''}" placeholder="toutes" aria-label="Générations au plus">` : ''}`);
            h += row('Côté', `<select data-mcp-f="side"><option value="">Les deux côtés</option><option value="father"${f.side === 'father' ? ' selected' : ''}>Côté du père</option><option value="mother"${f.side === 'mother' ? ' selected' : ''}>Côté de la mère</option></select>`, 'Depuis la personne de départ (Sosa 1).');
            h += row('Branche', pk(`mcp_b_${l.id}`, 'branch', f.branch || null, false));
            h += row('Étiquettes', pk(`mcp_e_${l.id}`, 'label', f.labels, true));
            h += row('Sexe', `<select data-mcp-f="gender"><option value="">Tous</option><option value="male"${f.gender === 'male' ? ' selected' : ''}>Hommes</option><option value="female"${f.gender === 'female' ? ' selected' : ''}>Femmes</option><option value="unknown"${f.gender === 'unknown' ? ' selected' : ''}>Inconnu</option></select>`);
        }
        h += row('Autour de', `${pk(`mcp_pl_${l.id}`, 'place', f.place || null, false)}${f.place ? `<input type="number" min="0.1" max="2000" step="0.5" data-unit="km" data-mcp-f="radius" value="${f.radius}" aria-label="Rayon">` : ''}`);
        h += row('Dans la zone', pk(`mcp_z_${l.id}`, 'maplayer', f.zone || null, false), 'Une couche de « ✏️ Mes couches » : ses zones dessinées.');
        if (has('cert')) h += row('Certitude', `<div class="mcp-checks">${(k === 'placeimages' ? C().CERT_IMAGES : C().CERT_EVENTS).map(([v, lab]) => `<label class="checkbox-line"><input type="checkbox" data-mcp-cert value="${v}"${f.cert.includes(v) ? ' checked' : ''}> ${esc(lab)}</label>`).join('')}</div>`, 'Rien de coché = toutes.');
        if (has('retained')) h += row('', tg('Seulement l’hypothèse retenue', f.retained, 'data-mcp-fb="retained"'));
        if (has('types')) h += row('Sortes', `<div class="mcp-checks mcp-types">${types.map(t => `<label class="checkbox-line"><input type="checkbox" data-mcp-type value="${Number(t.id)}"${f.types.includes(Number(t.id)) ? ' checked' : ''}> ${esc(t.icon || '')} ${esc(t.label)}</label>`).join('') || '<span class="muted">Aucune sorte</span>'}</div>`, 'Rien de coché = tous les événements.');
        if (has('text')) h += row(k === 'surnames' ? 'Noms' : 'Métier', `<input type="text" data-mcp-f="text" maxlength="120" value="${esc(f.text)}" placeholder="${k === 'surnames' ? 'BORIE, BORYE' : 'tisserand, ou un secteur'}">`, k === 'surnames' ? 'Séparés par des virgules. Vide = le nom de la personne de départ.' : 'Vide = tous les métiers.');
        if (has('pets')) h += row('Animaux', pk(`mcp_a_${l.id}`, 'pet', f.pets, true), 'Vide = tous.');
        if (has('layers')) h += row('Couches', pk(`mcp_c_${l.id}`, 'maplayer', f.layers, true), 'Vide = toutes mes couches.');
        if (has('voyages')) h += row('', tg('Avec les voyages notés (départs, émigration)', f.voyages, 'data-mcp-fb="voyages"'));
        h += `<div class="mcp-sec">Style</div>`;
        h += row('Couleur', `<span data-mcp-color></span>`);
        h += row('Forme', `<select data-mcp-s="shape">${C().SHAPES.map(([v, lab]) => `<option value="${v}"${s.shape === v ? ' selected' : ''}>${esc(lab)}</option>`).join('')}</select>`);
        h += row('Taille', `<span class="mcp-c3"><input type="range" min="4" max="40" data-mcp-s="size" value="${s.size}" aria-label="Taille" data-dflt="10"><input type="number" min="4" max="40" data-unit="px" data-mcp-s="size" value="${s.size}" aria-label="Taille"></span>`);
        h += row('Opacité', `<span class="mcp-c3"><input type="range" min="10" max="100" data-mcp-s="opacity" value="${s.opacity}" aria-label="Opacité" data-dflt="90"><input type="number" min="10" max="100" data-unit="%" data-mcp-s="opacity" value="${s.opacity}" aria-label="Opacité"></span>`);
        h += `<div class="mcp-toggles">${tg('Regrouper les points proches', s.cluster, 'data-mcp-sb="cluster"')}${tg('Carte de chaleur', s.heat, 'data-mcp-sb="heat"')}${tg('Noms des lieux', s.labels, 'data-mcp-sb="labels"')}${tg('Une couleur par sorte', s.byCat, 'data-mcp-sb="byCat"')}${tg('Traits (trajets, lignes)', s.lines, 'data-mcp-sb="lines"')}${k === 'placeimages' || k === 'media' ? tg('Angle de prise de vue', s.cones, 'data-mcp-sb="cones"') : ''}</div>`;
        return `<div class="mcp-lbody" data-mcp-lbody="${lid}">${h}</div>`;
    }
    function layerCount(l) { const d = (M.data?.layers || []).find(x => x.id === l.id); return d ? d.n : null; }
    function panelFill() {
        const box = document.getElementById('mcp-panel'); if (!box || !M.map) return;
        box.hidden = !M.panel;
        if (!M.panel) return;
        const def = M.map.def, ro = readOnly(), bgSel = A().mapBackgroundSelectHtml ? A().mapBackgroundSelectHtml(def.bg || '') : '';
        const scroll = box.querySelector('.mcp-pbody')?.scrollTop || 0;
        box.innerHTML = `<div class="mcp-phead"><b>⚙️ La carte</b><span class="ui-ph-saved mcp-saved" hidden>✓ Enregistré</span><button type="button" class="icon-button small" data-mcp-pclose aria-label="Fermer">×</button></div>
            <div class="mcp-pbody">${isReady(M.map) ? (UI().notice ? UI().notice('info', 'Carte prête : au premier changement, elle est gardée dans Mes cartes.') : '') : ''}
            <label class="mcp-full">Nom<input type="text" data-mcp-m="name" maxlength="80" value="${esc(M.map.name)}" ${ro ? 'disabled' : ''}></label>
            <label class="mcp-full">Description<textarea data-mcp-m="description" rows="2" maxlength="1000" ${ro ? 'disabled' : ''}>${esc(M.map.description || '')}</textarea></label>
            <div class="mcp-row"><span class="mcp-lab">Fond</span><div class="mcp-val"><select data-mcp-d="bg"><option value="">Celui de la Carte</option>${bgSel.replace(/ selected/g, '').replace(`value="${def.bg}"`, `value="${def.bg}" selected`)}</select></div></div>
            <div class="mcp-row"><span class="mcp-lab">Période</span><div class="mcp-val mcp-period"><input type="text" data-ui-date data-mcp-t2="from" value="${esc(def.time.from)}" placeholder="Du… (1800)"><input type="text" data-ui-date data-mcp-t2="to" value="${esc(def.time.to)}" placeholder="Au… (1950)"></div></div>
            <div class="mcp-row"><span class="mcp-lab">Le temps ▶</span><div class="mcp-val">${seg('mode', def.time.mode, [['cumul', 'Tout jusqu’à l’année'], ['window', 'Une fenêtre']], 'data-mcp-tm')}${def.time.mode === 'window' ? `<input type="number" min="1" max="200" data-unit="ans" data-mcp-t2="win" value="${def.time.win}" aria-label="Largeur de la fenêtre">` : ''}<input type="number" min="3" max="120" data-unit="s" data-mcp-t2="secs" value="${def.time.secs}" aria-label="Durée de la lecture"></div></div>
            <div class="mcp-row"><span class="mcp-lab"></span><div class="mcp-val">${tg('Légende sur la carte', def.legend, 'data-mcp-db="legend"')}</div></div>
            <div class="mcp-row"><span class="mcp-lab">Vue</span><div class="mcp-val"><button type="button" class="button small secondary" data-mcp-view>📌 Garder cette vue</button>${def.view ? '<button type="button" class="button small secondary" data-mcp-noview>↺ Remettre comme au départ</button>' : ''}<small class="ui-hint">${def.view ? 'La carte s’ouvre toujours sur la vue gardée.' : 'Sans vue gardée, la carte se cadre sur ce qu’elle montre.'}</small></div></div>
            <div class="mcp-sec">Couches <small class="muted">(la première est dessinée par-dessus)</small></div>
            <ul class="mcp-layers">${def.layers.map((l, i) => { const n = layerCount(l), d = (M.data?.layers || []).find(x => x.id === l.id); return `<li class="mcp-layer${M.openL[l.id] ? ' is-open' : ''}" data-mcp-layer-row="${esc(l.id)}" data-i="${i}">
                <div class="mcp-lhead"><span class="mcp-grip" draggable="true" tabindex="0" role="button" aria-label="Ranger la couche (Alt + ↑ / ↓)" title="Glisser pour ranger · Alt + ↑ / ↓">⠿</span>
                <label class="ui-toggle" title="Montrer ou cacher"><input type="checkbox" data-mcp-vis="${esc(l.id)}"${l.visible ? ' checked' : ''} aria-label="Montrer « ${esc(l.name)} »"><i></i></label>
                <button type="button" class="mcp-lname" data-mcp-expand="${esc(l.id)}" aria-expanded="${!!M.openL[l.id]}"><span aria-hidden="true">${C().KIND[l.kind]?.icon || ''}</span> ${esc(l.name)}</button>
                <small class="mcp-lcount" data-mcp-count="${esc(l.id)}" title="${esc(d?.note || '')}">${n === null ? '…' : n.toLocaleString('fr-FR')}${d?.note ? ' ⚠️' : ''}</small>
                <span class="mcp-swatch" style="background:${esc(l.s.color)}" aria-hidden="true"></span>
                ${ro ? '' : `<button type="button" class="icon-button small" data-mcp-lmore="${esc(l.id)}" aria-label="Plus d’actions">⋯</button>`}</div>
                ${M.openL[l.id] && !ro ? layerBody(l) : ''}</li>`; }).join('') || `<li>${A().empty('Aucune couche : ajoute ce que la carte doit montrer.', {icon: '🗺', action: ro ? null : {label: '＋ Ajouter une couche', attrs: 'data-empty-click="[data-mcp-add]"'}})}</li>`}</ul>
            ${ro ? '' : '<div class="mcp-pfoot"><button type="button" class="button small" data-mcp-add aria-haspopup="menu">＋ Ajouter une couche ▾</button></div><div data-mcp-presets></div>'}</div>`;
        box.querySelector('.mcp-pbody').scrollTop = scroll;
        box.querySelectorAll('[data-mcp-lbody]').forEach(b => {
            const l = def.layers.find(x => x.id === b.dataset.mcpLbody), slot = b.querySelector('[data-mcp-color]');
            if (slot && UI().colorField) { const cf = UI().colorField({value: l.s.color}); slot.appendChild(cf); cf.input.addEventListener('change', () => { l.s.color = cf.value || l.s.color; commit(`Couleur de « ${l.name} » changée`, {panel: true}); }); }
        });
        mountPresets(box.querySelector('[data-mcp-presets]'));
    }
    function updateCounts() {
        (M.map?.def.layers || []).forEach(l => { const el = document.querySelector(`[data-mcp-count="${CSS.escape(l.id)}"]`); if (!el) return; const d = (M.data?.layers || []).find(x => x.id === l.id); el.textContent = d ? `${d.n.toLocaleString('fr-FR')}${d.note ? ' ⚠️' : ''}` : '…'; el.title = d?.note || ''; });
    }
    function layerOf(el) { const id = el.closest('[data-mcp-layer-row]')?.dataset.mcpLayerRow; return M.map.def.layers.find(l => l.id === id); }
    function moveLayer(id, by) {
        const ls = M.map.def.layers, i = ls.findIndex(l => l.id === id), j = i + by; if (i < 0 || j < 0 || j >= ls.length) return;
        const [x] = ls.splice(i, 1); ls.splice(j, 0, x); commit(`Couche « ${x.name} » rangée`, {panel: true});
        document.querySelector(`[data-mcp-layer-row="${CSS.escape(id)}"] .mcp-grip`)?.focus();
    }
    function addLayerMenu(btn) {
        UI().menuAt(btn, C().KINDS.map(k => ({icon: k[1], label: k[2], run: () => { const l = C().newLayer(k[0], M.map.def); M.map.def.layers.unshift(l); M.openL[l.id] = true; commit(`Couche « ${l.name} » ajoutée`, {panel: true, data: true}); }})), {title: 'Ajouter une couche'});
    }
    function layerMenu(btn, l) {
        const i = M.map.def.layers.indexOf(l);
        UI().menuAt(btn, [
            {icon: '✎', label: 'Régler', run: () => { M.openL[l.id] = true; panelFill(); }},
            {icon: '🎯', label: 'Cadrer sur la couche', run: () => { const d = {...M.map.def, layers: [l]}; const b = C().bounds(d, M.data); if (b) { const v = M.map.def.view; M.map.def.view = null; const keep = M.map.def.layers; M.map.def.layers = [l]; fit(); M.map.def.layers = keep; M.map.def.view = v; redraw(); } }},
            {icon: '⧉', label: 'Dupliquer', run: () => { const c = C().newLayer(l.kind, M.map.def); Object.assign(c, clone(l), {id: c.id, name: `${l.name} (copie)`.slice(0, 80)}); M.map.def.layers.splice(i + 1, 0, c); commit(`Couche « ${l.name} » dupliquée`, {panel: true, data: true}); }},
            ...(i > 0 ? [{icon: '↑', label: 'Monter', run: () => moveLayer(l.id, -1)}] : []),
            ...(i < M.map.def.layers.length - 1 ? [{icon: '↓', label: 'Descendre', run: () => moveLayer(l.id, 1)}] : []),
            '-', {icon: '🗑', label: 'Retirer la couche', danger: true, run: () => { M.map.def.layers.splice(i, 1); commit(`Couche « ${l.name} » retirée`, {panel: true, data: false}); redraw(); }},
        ], {title: l.name});
    }
    function bindPanel(box) {
        const num = (el, a, b) => Math.max(a, Math.min(b, Number(el.value) || a));
        box.addEventListener('pointerdown', e => e.stopPropagation()); box.addEventListener('wheel', e => e.stopPropagation());
        box.addEventListener('click', e => {
            const b = e.target.closest('button'); if (!b) return;
            if (b.matches('[data-mcp-pclose]')) return togglePanel(false);
            if (b.dataset.mcpExpand) { M.openL[b.dataset.mcpExpand] = !M.openL[b.dataset.mcpExpand]; panelFill(); return; }
            if (b.dataset.mcpLmore) { layerMenu(b, M.map.def.layers.find(l => l.id === b.dataset.mcpLmore)); return; }
            if (b.matches('[data-mcp-add]')) { addLayerMenu(b); return; }
            if (b.matches('[data-mcp-view]')) { M.map.def.view = {lat: S().mapCenter.lat, lon: S().mapCenter.lon, zoom: S().mapZoom}; commit('Vue gardée', {panel: true, data: false}); return; }
            if (b.matches('[data-mcp-noview]')) { M.map.def.view = null; commit('Vue automatique', {panel: true, data: false}); fit(); redraw(); return; }
            if (b.dataset.mcpSeg) { const l = layerOf(b); l.f[b.dataset.mcpSeg] = b.dataset.v; commit(`Filtre de « ${l.name} » changé`, {panel: true}); return; }
            if (b.dataset.mcpTm) { M.map.def.time.mode = b.dataset.v; commit('Curseur du temps changé', {panel: true, data: false}); return; }
        });
        const onField = (e, final) => {
            const t = e.target, l = t.closest('[data-mcp-layer-row]') ? layerOf(t) : null;
            if (t.dataset.mcpM && final) { M.map[t.dataset.mcpM] = t.value.slice(0, t.dataset.mcpM === 'name' ? 80 : 1000); if (t.dataset.mcpM === 'name' && !M.map.name.trim()) { UI().fail?.(t, 'Donne un nom à la carte.'); return; } commit(t.dataset.mcpM === 'name' ? `Carte renommée « ${M.map.name} »` : 'Description changée', {data: false}); A().renderSidebar?.(); document.querySelector('.mcp-title') && (document.querySelector('.mcp-title').textContent = M.map.name); return; }
            if (t.dataset.mcpD === 'bg' && final) { M.map.def.bg = t.value; S().mapMineBg = t.value; commit('Fond de la carte changé', {data: false}); const sel = document.getElementById('map-background'); if (sel && t.value) sel.value = t.value; return; }
            if (t.dataset.mcpT2 && final) { const k = t.dataset.mcpT2; M.map.def.time[k] = k === 'from' || k === 'to' ? t.value.trim() : num(t, k === 'secs' ? 3 : 1, k === 'secs' ? 120 : 200); commit('Période changée'); return; }
            if (t.dataset.mcpDb && final) { M.map.def[t.dataset.mcpDb] = t.checked; commit(t.checked ? 'Légende montrée' : 'Légende cachée', {data: false}); return; }
            if (t.dataset.mcpVis !== undefined && final) { const ll = M.map.def.layers.find(x => x.id === t.dataset.mcpVis); ll.visible = t.checked; commit(`Couche « ${ll.name} » ${t.checked ? 'montrée' : 'cachée'}`, {data: false}); return; }
            if (!l) return;
            if (t.dataset.mcpL === 'name' && final) { l.name = t.value.trim().slice(0, 80) || C().KIND[l.kind].name; commit(`Couche renommée « ${l.name} »`, {data: false}); const nb = box.querySelector(`[data-mcp-expand="${CSS.escape(l.id)}"]`); if (nb) nb.lastChild.textContent = ` ${l.name}`; return; }
            if (t.dataset.mcpF && final) { const k = t.dataset.mcpF; l.f[k] = ['gens', 'sosaGens'].includes(k) ? num(t, k === 'gens' ? 1 : 0, 40) : k === 'radius' ? Math.max(.1, Math.min(2000, Number(t.value) || 15)) : t.value; commit(`Filtre de « ${l.name} » changé`, {panel: ['side'].includes(k) ? false : false}); return; }
            if (t.dataset.mcpFb && final) { l.f[t.dataset.mcpFb] = t.checked; commit(`Filtre de « ${l.name} » changé`, {panel: t.dataset.mcpFb === 'sosa'}); return; }
            if (t.matches('[data-mcp-cert]') && final) { l.f.cert = [...box.querySelectorAll(`[data-mcp-layer-row="${CSS.escape(l.id)}"] [data-mcp-cert]:checked`)].map(x => x.value); commit(`Certitude de « ${l.name} » changée`); return; }
            if (t.matches('[data-mcp-type]') && final) { l.f.types = [...box.querySelectorAll(`[data-mcp-layer-row="${CSS.escape(l.id)}"] [data-mcp-type]:checked`)].map(x => Number(x.value)); commit(`Sortes de « ${l.name} » changées`); return; }
            if (t.dataset.mcpS) {
                const k = t.dataset.mcpS; l.s[k] = k === 'shape' ? t.value : num(t, k === 'size' ? 4 : 10, k === 'size' ? 40 : 100);
                if (k !== 'shape') box.querySelectorAll(`[data-mcp-layer-row="${CSS.escape(l.id)}"] [data-mcp-s="${k}"]`).forEach(x => { if (x !== t) x.value = l.s[k]; });
                if (final) commit(`Style de « ${l.name} » changé`, {data: false}); else redraw();
                return;
            }
            if (t.dataset.mcpSb && final) { l.s[t.dataset.mcpSb] = t.checked; commit(`Style de « ${l.name} » changé`, {data: false}); }
        };
        box.addEventListener('input', e => { if (e.target.dataset.mcpS) { onField(e, false); } });
        box.addEventListener('change', e => onField(e, true));
        box.addEventListener('dblclick', e => { const t = e.target.closest('input[type=range][data-dflt]'); if (!t) return; t.value = t.dataset.dflt; t.dispatchEvent(new Event('change', {bubbles: true})); }); // C3 : double-clic = valeur de départ
        box.addEventListener('picker-change', e => {
            const pkEl = e.target.closest('.pk'), l = pkEl ? layerOf(pkEl) : null; if (!l) return;
            const n = String(e.detail.name || ''), v = e.detail.value;
            const ids = Array.isArray(v) ? v.map(Number).filter(x => x > 0) : [];
            const one = Number(Array.isArray(v) ? v[0] : v) || 0;
            if (n.startsWith('mcp_p_')) { l.f.persons = ids; commit(`Personnes de « ${l.name} » changées`, {panel: true}); }
            else if (n.startsWith('mcp_b_')) { l.f.branch = one; commit(`Branche de « ${l.name} » changée`); }
            else if (n.startsWith('mcp_e_')) { l.f.labels = ids; commit(`Étiquettes de « ${l.name} » changées`); }
            else if (n.startsWith('mcp_pl_')) { l.f.place = one; commit(`Lieu de « ${l.name} » changé`, {panel: true}); }
            else if (n.startsWith('mcp_z_')) { l.f.zone = one; commit(`Zone de « ${l.name} » changée`); }
            else if (n.startsWith('mcp_a_')) { l.f.pets = ids; commit(`Animaux de « ${l.name} » changés`); }
            else if (n.startsWith('mcp_c_')) { l.f.layers = ids; commit(`Couches de « ${l.name} » changées`); }
        });
        // K20 : ⠿ à la souris (glisser) et au clavier (Alt + ↑ / ↓)
        let dragId = null;
        box.addEventListener('dragstart', e => { const g = e.target.closest('.mcp-grip'); if (!g) return; dragId = g.closest('[data-mcp-layer-row]').dataset.mcpLayerRow; try { e.dataTransfer.setData('text/plain', dragId); e.dataTransfer.effectAllowed = 'move'; } catch (_) {} });
        box.addEventListener('dragover', e => { if (dragId && e.target.closest('[data-mcp-layer-row]')) e.preventDefault(); });
        box.addEventListener('drop', e => { const to = e.target.closest('[data-mcp-layer-row]')?.dataset.mcpLayerRow; if (!dragId || !to || to === dragId) { dragId = null; return; } e.preventDefault(); const ls = M.map.def.layers, i = ls.findIndex(l => l.id === dragId), j = ls.findIndex(l => l.id === to); const [x] = ls.splice(i, 1); ls.splice(j, 0, x); dragId = null; commit(`Couche « ${x.name} » rangée`, {panel: true}); });
        box.addEventListener('keydown', e => { const g = e.target.closest('.mcp-grip'); if (!g || !e.altKey || !['ArrowUp', 'ArrowDown'].includes(e.key)) return; e.preventDefault(); moveLayer(g.closest('[data-mcp-layer-row]').dataset.mcpLayerRow, e.key === 'ArrowUp' ? -1 : 1); });
    }
    function togglePanel(on) {
        M.panel = on ?? !M.panel; lsSet(PANEL_KEY, M.panel);
        if (M.panel && ext.cartesOutils?.layers?.state?.open) ext.cartesOutils.layers.toggle(false); // un seul panneau à la fois sur la carte
        const b = document.querySelector('[data-mcp-panel-btn]'); if (b) { b.setAttribute('aria-pressed', String(M.panel)); b.classList.toggle('is-active', M.panel); }
        panelFill();
    }
    /** 💾 Réglages enregistrés : la définition seule (fond, période, couches, filtres, styles) — jamais les données */
    function mountPresets(slot) {
        const U = UI(); if (!slot || !U.presetsFrame || !M.map) return;
        const list = () => { const v = lsGet(PRESETS_KEY, []); return Array.isArray(v) ? v.filter(x => x && typeof x.name === 'string').slice(0, 60) : []; };
        const put = l => lsSet(PRESETS_KEY, l.slice(0, 60)), today = () => new Date().toISOString(), now = () => C().forServer(M.map.def);
        const frame = U.presetsFrame({id: 'mes-cartes', what: 'la définition de cette carte (fond, période, couches, filtres et styles — jamais les données)', list: () => list().map(x => ({name: x.name, date: x.date})), quietApply: true,
            apply: i => { const x = list()[i]; if (!x) return false; const keepView = M.map.def.view; M.map.def = C().cleanDef(x.data); if (!x.data.view) M.map.def.view = keepView; S().mapMineBg = M.map.def.bg || ''; commit(`Réglage « ${x.name} » appliqué`, {panel: true, data: true}); return false; },
            save: name => { const l = list(), it = {name, date: today(), data: now()}, i = l.findIndex(x => x.name === name); if (i >= 0) l[i] = it; else l.push(it); put(l); },
            replace: i => { const l = list(); if (!l[i]) return false; l[i] = {...l[i], date: today(), data: now()}; put(l); },
            rename: (i, name) => { const l = list(); if (!l[i]) return false; l[i].name = name; put(l); },
            duplicate: i => { const l = list(), x = l[i]; if (!x) return false; l.splice(i + 1, 0, {name: U.freeName ? U.freeName(x.name, l.map(y => y.name)) : `${x.name} (copie)`, date: today(), data: x.data}); put(l); },
            exportOne: i => { const x = list()[i]; if (x) A().exportSettingFile?.('mes-cartes', x.name, {data: x.data}); return false; },
            remove: i => { const l = list(), x = l[i]; if (!x) return false; if (A().undoLocalChange) A().undoLocalChange(`Réglage « ${x.name} » supprimé`, [PRESETS_KEY], () => { l.splice(i, 1); put(l); }, () => frame.isConnected && frame.refresh?.()); else { l.splice(i, 1); put(l); } },
            importOne: async () => { const got = await A().importSettingFile?.('mes-cartes', {names: list().map(x => x.name), check: d => d && typeof d.data === 'object'}); if (!got) return false; const l = list(); l.push({name: got.nom, date: today(), data: C().forServer(got.donnees.data)}); put(l); toast(`Réglage « ${got.nom} » importé : clique « Appliquer » pour t’en servir.`); },
        });
        slot.appendChild(frame);
    }

    /* ═════════ La fenêtre d'une forme (clic sur un point, une zone, un trait) ═════════ */
    function closePop() { document.getElementById('mcp-pop')?.remove(); }
    function showPop(hit, x, y) {
        closePop(); const st = document.getElementById('map-stage'); if (!st || !hit) return;
        const pop = document.createElement('div'); pop.id = 'mcp-pop'; pop.className = 'mcp-pop';
        const items = hit.items.slice(0, 40);
        pop.innerHTML = `<button type="button" class="icon-button small mcp-pop-x" aria-label="Fermer">×</button><small class="muted">${esc(C().KIND[hit.l.kind]?.icon || '')} ${esc(hit.l.name)} · ${esc(pl(hit.items.length, 'élément'))}</small>
            <div class="mcp-pop-list">${items.map(f => `<div class="mcp-pop-it">${f.img ? `<img src="${esc(f.img)}" alt="" loading="lazy">` : ''}<div><b>${esc(f.t || 'Sans nom')}</b>${f.s ? `<small>${esc(f.s)}</small>` : ''}${f.lab ? `<small class="muted">📍 ${esc(f.lab)}</small>` : ''}${f.k != null && f.k < 1 ? `<small>${UI().badge ? UI().badge(f.k >= .75 ? 'probable' : f.k >= .5 ? 'possible' : 'à vérifier', 'yellow') : ''}</small>` : ''}
                <span class="mcp-pop-act">${f.p ? `<button type="button" class="link-button" data-mcp-person="${Number(f.p)}">↗ Fiche</button>` : ''}${f.m && ext.placePhotos?.open ? `<button type="button" class="link-button" data-mcp-media="${Number(f.m)}">↗ Image</button>` : ''}${f.house && ext.openHouse ? `<button type="button" class="link-button" data-mcp-house="${Number(f.house)}">↗ Maison</button>` : ''}</span></div></div>`).join('')}${hit.items.length > 40 ? `<p class="muted">+ ${esc(pl(hit.items.length - 40, 'autre'))}</p>` : ''}</div>`;
        pop.style.left = `${Math.max(8, Math.min(st.clientWidth - 300, x + 12))}px`; pop.style.top = `${Math.max(8, Math.min(st.clientHeight - 240, y - 20))}px`;
        st.appendChild(pop);
        pop.addEventListener('pointerdown', e => e.stopPropagation()); pop.addEventListener('wheel', e => e.stopPropagation());
        pop.addEventListener('click', e => {
            if (e.target.closest('.mcp-pop-x')) return closePop();
            const p = e.target.closest('[data-mcp-person]'); if (p) { closePop(); A().openPersonById?.(Number(p.dataset.mcpPerson)); return; }
            const m = e.target.closest('[data-mcp-media]'); if (m) { closePop(); ext.placePhotos.open(Number(m.dataset.mcpMedia)); return; }
            const h = e.target.closest('[data-mcp-house]'); if (h) { closePop(); ext.openHouse({id: Number(h.dataset.mcpHouse)}); }
        });
    }

    /* ═════════ Branchement dans la Carte ═════════ */
    ext.mapSetup.push(() => {
        if (S().mapMode !== 'mine' || !M.map) return;
        const strip = document.querySelector('.map-layout .tool-strip'), stage = document.getElementById('map-stage'); if (!strip || !stage) return;
        document.querySelector('.map-layout')?.classList.add('is-mcp');
        [...strip.children].forEach(c => { if (c.tagName === 'SPAN' && /\d\s*évt/.test(c.textContent || '')) c.remove(); }); // « 0 évt » de la Carte : sans objet ici
        const slot = strip.querySelector('.mcp-strip-slot'), ro = readOnly();
        if (slot) {
            slot.className = 'mcp-strip';
            slot.innerHTML = `<button type="button" class="button small secondary" data-mcp-back>← Mes cartes</button><b class="mcp-title">${esc(M.map.name)}</b>${timeHtml()}
                <button type="button" class="button small secondary${M.panel ? ' is-active' : ''}" data-mcp-panel-btn aria-pressed="${M.panel}">⚙️ Couches</button>
                <button type="button" class="button small secondary" data-mcp-export aria-haspopup="menu">⤓ Exporter ▾</button><button type="button" class="icon-button small" data-mcp-print aria-label="Imprimer" title="Imprimer" data-shortcut="⌘P">🖨</button>
                <button type="button" class="icon-button small" data-mcp-more aria-label="Plus d’actions" aria-haspopup="menu">⋯</button>`;
            if (ro) slot.querySelector('[data-mcp-panel-btn]').hidden = true;
            slot.querySelector('[data-mcp-back]').addEventListener('click', () => open(null));
            slot.querySelector('[data-mcp-panel-btn]').addEventListener('click', () => togglePanel());
            slot.querySelector('[data-mcp-export]').addEventListener('click', e => UI().menuAt(e.currentTarget, [
                {icon: '🖼', label: 'Image ou PDF (PNG, JPG, SVG, PDF)…', run: () => exportImage()},
                {icon: '⤓', label: 'GeoJSON', run: () => exportGeo('geojson')}, {icon: '⤓', label: 'KML (Google Earth)', run: () => exportGeo('kml')},
                {icon: '💾', label: 'La définition (réglage à partager)', run: () => shareDef(M.map)}]));
            slot.querySelector('[data-mcp-print]').addEventListener('click', () => printMap());
            slot.querySelector('[data-mcp-more]').addEventListener('click', e => UI().menuAt(e.currentTarget, [
                ...(ro ? [] : [{icon: '⧉', label: 'Dupliquer', run: () => duplicate(M.map.id)}]),
                ...(ro ? [] : [{icon: '📌', label: 'Mettre dans le tableau de bord', run: () => toDashboard(M.map)}]),
                ...(ro ? [] : [{icon: '📐', label: 'Mettre dans la mise en page…', run: () => toLayout(M.map)}]),
                {icon: '🌐', label: 'Dans mon site web…', run: () => toSite()},
                {icon: '💾', label: 'Partager la définition', run: () => shareDef(M.map)},
                ...(ro || isReady(M.map) ? [] : ['-', {icon: '🗑', label: 'Supprimer la carte', danger: true, run: () => removeMap(M.map, () => open(null))}])], {title: M.map.name}));
            bindTime();
        }
        // le fond choisi ici est celui de la carte (pas celui de toute l'app) ; « Recentrer » cadre sur ses couches
        const bgSel = document.getElementById('map-background');
        if (bgSel) { if (M.map.def.bg) bgSel.value = M.map.def.bg; bgSel.addEventListener('change', e => { e.stopImmediatePropagation(); M.map.def.bg = bgSel.value; S().mapMineBg = bgSel.value; commit('Fond de la carte changé', {data: false, panel: true}); redraw(); }); }
        document.getElementById('map-france')?.addEventListener('click', e => { e.stopImmediatePropagation(); const v = M.map.def.view; M.map.def.view = null; fit(); M.map.def.view = v; redraw(); });
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.id = 'mcp-svg'; svg.setAttribute('class', 'mcp-svg'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', `Carte « ${M.map.name} »`);
        stage.insertBefore(svg, document.getElementById('map-overlay') || null);
        const leg = document.createElement('div'); leg.id = 'mcp-legend'; leg.className = 'mcp-legend'; stage.appendChild(leg);
        leg.addEventListener('pointerdown', e => e.stopPropagation());
        leg.addEventListener('click', e => { const r = e.target.closest('[data-mcp-leg]'); if (!r || readOnly()) return; const l = M.map.def.layers.find(x => x.id === r.dataset.mcpLeg); if (l) { l.visible = false; commit(`Couche « ${l.name} » cachée`, {data: false, panel: true}); } });
        const panel = document.createElement('div'); panel.id = 'mcp-panel'; panel.className = 'mcp-panel'; stage.appendChild(panel); bindPanel(panel);
        if (!ro) panelFill(); else panel.hidden = true;
        let down = null;
        stage.addEventListener('pointerdown', e => { down = e.target.closest?.('.mcp-panel,.mcp-pop,.mcp-legend,button,input') ? null : {x: e.clientX, y: e.clientY, hit: e.target.closest?.('[data-mcp-hit]')}; }, true);
        stage.addEventListener('pointerup', e => {
            if (!down) return; const moved = Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) > 4, h = down.hit; down = null; if (moved) return;
            const r = stage.getBoundingClientRect();
            if (h) showPop(M.hits[Number(h.dataset.mcpHit)], e.clientX - r.left, e.clientY - r.top); else closePop();
        });
        if (M.needFit) { fit(); M.needFit = false; }
    });
    ext.mapDraw.push(o => { if (S().mapMode === 'mine' && M.map) draw(o); });
    document.addEventListener('keydown', e => {
        if (S().module !== 'carte' || S().mapMode !== 'mine' || !M.map || document.querySelector('dialog[open]')) return;
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p') { e.preventDefault(); printMap(); }
        else if (e.key === 'Escape' && document.getElementById('mcp-pop')) closePop();
    });

    /* ═════════ Exporter, imprimer (toujours sans vivant ni fiche confidentielle) ═════════ */
    const PAPER = {paper: '#fbf8f1', sea: '#dce8ee', land: '#f2eee2', border: '#9a9384', dept: '#d3ccbb', ink: '#2b2420'};
    /** la carte dessinée en vecteurs (fond Natural Earth / IGN de l'app, pas de tuiles) : {svg, W, H, count} ; W et H en mm (ou px) */
    async function renderSvg(m, data, {W = 297, H = 210, title = true, legend = true, t = null} = {}) {
        const dc = DC(), hp = HP();
        if (!dc || !hp) throw new Error('Les fonds de carte ne sont pas encore chargés : réessaie dans un instant.');
        const f = Math.sqrt(W / 297), M0 = title ? Math.round(W * .035) : 0, top = title ? Math.round(H * .11) : 0;
        const fw = W - 2 * M0, fh = H - top - M0;
        const pts = [];
        (m.def.layers || []).filter(l => l.visible !== false).forEach(l => (data.layers.find(x => x.id === l.id)?.features || []).forEach(ft => { const add = c => pts.push({lon: c[0], lat: c[1]}); if (ft.g === 'p') add(ft.c); else if (ft.g === 'l') ft.c.forEach(add); else ft.c[0].forEach(add); }));
        let view;
        if (m.def.view && !pts.length) { const s = 360 / 2 ** m.def.view.zoom * 2; view = [m.def.view.lon - s, m.def.view.lat - s * .6, m.def.view.lon + s, m.def.view.lat + s * .6]; }
        view = hp.viewFor({frame: view ? '' : 'auto'}, view ? [{lon: view[0], lat: view[1]}, {lon: view[2], lat: view[3]}] : pts.length ? pts : [{lon: -5, lat: 41.3}, {lon: 9.6, lat: 51.2}], fw, fh);
        const pr = dc.fitProj(dc.autoProj(view), view, fw, fh, false), bl = await hp.baseLayers(view, pr, fw, fh);
        const r = layersSvg((lo, la) => pr.p(lo, la), m.def, data, {scale: .3 * f * (W > 600 ? 3.4 : 1), t, w: fw, h: fh, uid: 'mcpx', margin: 10});
        const fs = 4 * f * (W > 600 ? 3.4 : 1);
        let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}${W > 600 ? '' : 'mm'}" height="${H}${W > 600 ? '' : 'mm'}" font-family="Georgia, 'Times New Roman', serif"><rect width="${W}" height="${H}" fill="${PAPER.paper}"/>`;
        s += `<defs><clipPath id="mcpxclip"><rect width="${r1(fw)}" height="${r1(fh)}"/></clipPath></defs><g transform="translate(${M0} ${top})"><g clip-path="url(#mcpxclip)"><rect width="${r1(fw)}" height="${r1(fh)}" fill="${PAPER.sea}"/>`;
        if (bl.land) s += `<path d="${bl.land}" fill="${PAPER.land}" stroke="${PAPER.border}" stroke-width="${r1(.3 * f * 10) / 10}"/>`;
        if (bl.dept) s += `<path d="${bl.dept}" fill="none" stroke="${PAPER.dept}" stroke-width="${r1(.15 * f * 10) / 10}"/>`;
        s += r.svg + `</g><rect width="${r1(fw)}" height="${r1(fh)}" fill="none" stroke="${PAPER.ink}" stroke-width="${r1(.5 * f * 10) / 10}"/></g>`;
        if (title) s += `<text x="${M0}" y="${r1(top * .55)}" font-size="${r1(fs * 2.1)}" font-weight="700" fill="${PAPER.ink}">${esc(m.name)}</text>${m.description ? `<text x="${M0}" y="${r1(top * .85)}" font-size="${r1(fs)}" fill="${PAPER.ink}" font-style="italic">${esc(m.description.slice(0, 140))}</text>` : ''}`;
        if (legend && m.def.legend) {
            const rows = C().legend(m.def, data, t), lh = fs * 1.7, bw = Math.min(fw * .42, fs * 22), bh = lh * (rows.reduce((n, x) => n + 1 + x.cats.length, 0) + .6);
            const x0 = M0 + fs, y0 = top + fh - bh - fs;
            s += `<g><rect x="${r1(x0)}" y="${r1(y0)}" width="${r1(bw)}" height="${r1(bh)}" fill="${PAPER.paper}" fill-opacity=".92" stroke="${PAPER.ink}" stroke-width="${r1(.25 * f * 10) / 10}"/>`;
            let yy = y0 + lh * .9;
            rows.forEach(x => { s += `<path d="${C().shapePath(x.shape, x0 + fs * 1.2, yy - fs * .35, fs * .5)}" fill="${x.color}"/><text x="${r1(x0 + fs * 2.4)}" y="${r1(yy)}" font-size="${r1(fs)}" fill="${PAPER.ink}">${esc(x.name)} (${x.n})</text>`; yy += lh; x.cats.forEach(c => { s += `<path d="${C().shapePath(x.shape, x0 + fs * 2.4, yy - fs * .35, fs * .4)}" fill="${c.color}"/><text x="${r1(x0 + fs * 3.4)}" y="${r1(yy)}" font-size="${r1(fs * .85)}" fill="${PAPER.ink}">${esc(c.name)}</text>`; yy += lh; }); });
            s += '</g>';
        }
        if (title && hp.compassSvg) s += hp.compassSvg(W - M0 - fs * 3, top + fs * 3.4, fs * 2.6, PAPER);
        s += `<text x="${W - M0}" y="${H - M0 * .35}" font-size="${r1(fs * .7)}" text-anchor="end" fill="${PAPER.ink}" opacity=".7">${esc(bl.attr || 'Natural Earth')} · LCNDA</text></svg>`;
        return {svg: s, W, H, count: (data.layers || []).reduce((n, l) => n + (m.def.layers.find(x => x.id === l.id)?.visible !== false ? l.n : 0), 0), hidden: data.hidden || 0};
    }
    async function shareData(m) { return fetchData(m.def, true); }
    async function exportImage() {
        const m = M.map; if (!m) return;
        let cur;
        try { cur = await renderSvg(m, await shareData(m), {t: M.t}); } catch (e) { toast(e.message, 'error'); return; }
        const px = q => ({w: Math.round(cur.W / 25.4 * q), h: Math.round(cur.H / 25.4 * q)});
        const raster = async (q, type) => { const p = px(Math.min(q, 400)); return HP().rasterize(cur.svg, p.w, p.h, type, .92); };
        const copy = async (blob, fname, opt) => { if (opt.saveCopy && A().importMediaFile) { try { await A().importMediaFile(new File([blob], fname, {type: blob.type}), ['image']); toast('Une copie est rangée dans les médias.'); } catch (err) { toast(err.message, 'error'); } } };
        await UI().openExportDialog({title: m.name, defaultName: fileBase(m.name), quality: 200, saveCopy: !!A().importMediaFile, info: `A4 paysage · ${pl(cur.count, 'élément')}${cur.hidden ? ` · sans les personnes vivantes ni les fiches confidentielles` : ''}`,
            preview: () => { const d = document.createElement('div'); d.className = 'mcp-export-prev'; d.innerHTML = cur.svg; return d; },
            formats: [{id: 'pdf', run: async x => { const b = await raster(x.quality, 'image/jpeg'); download(await HP().jpegPdf(b, cur.W, cur.H, m.name), x.filename); }},
                {id: 'png', run: async x => { const b = await raster(x.quality, 'image/png'); download(b, x.filename); await copy(b, x.filename, x); }},
                {id: 'jpg', run: async x => { const b = await raster(x.quality, 'image/jpeg'); download(b, x.filename); await copy(b, x.filename, x); }},
                {id: 'svg', hint: 'net à toutes les tailles', run: async x => download(new Blob([cur.svg], {type: 'image/svg+xml'}), x.filename)},
                {id: 'print', quality: false, run: async () => { setTimeout(() => printMap(cur), 50); }},
                {id: 'file', ext: 'geojson', label: '🗺 GeoJSON', hint: 'les formes, pour un autre logiciel', quality: false, run: async () => exportGeo('geojson')}]});
    }
    async function exportGeo(fmt) {
        const m = M.map; if (!m) return;
        try {
            const data = await shareData(m);
            if (fmt === 'kml') { const CO = window.LCNDA_CARTES_OUTILS; if (!CO?.toKML) throw new Error('L’export KML n’est pas chargé.'); download(new Blob([CO.toKML(C().toLayers(m.def, data))], {type: 'application/vnd.google-earth.kml+xml'}), fileBase(m.name) + '.kml'); }
            else download(new Blob([JSON.stringify(C().toGeoJSON(m.def, data, {name: m.name}), null, 1)], {type: 'application/geo+json'}), fileBase(m.name) + '.geojson');
            toast(`Carte « ${m.name} » exportée en ${fmt === 'kml' ? 'KML' : 'GeoJSON'}${data.hidden ? ' (sans les personnes vivantes ni les fiches confidentielles)' : ''}.`);
        } catch (e) { toast(e.message, 'error'); }
    }
    async function printMap(pre = null) {
        const m = M.map; if (!m) return;
        let cur = pre;
        try { cur = cur || await renderSvg(m, await shareData(m), {t: M.t}); } catch (e) { toast(e.message, 'error'); return; }
        UI().openPrintDialog?.({title: m.name, key: 'mes-cartes', paper: 'A4', orientation: 'landscape',
            html: `<!doctype html><html><head><meta charset="utf-8"><title>${esc(m.name)}</title><style>html,body{margin:0;background:#fff}svg{display:block;width:100%;height:auto}</style></head><body data-k-page>${cur.svg.replace(/ width="[^"]*mm" height="[^"]*mm"/, '')}</body></html>`});
    }
    /** une image PNG de la carte (pour la mise en page, le site web), rangée dans les médias */
    async function renderPng(id, {dpi = 150} = {}) {
        await loadList(); const m = findMap(id); if (!m) throw new Error('Carte introuvable.');
        const mm = {...m, def: C().cleanDef(m.def)}, cur = await renderSvg(mm, await fetchData(mm.def, true));
        const blob = await HP().rasterize(cur.svg, Math.round(cur.W / 25.4 * dpi), Math.round(cur.H / 25.4 * dpi), 'image/png');
        return A().importMediaFile(new File([blob], `${fileBase(m.name)}.png`, {type: 'image/png'}), ['image']);
    }

    /* ═════════ Ailleurs dans l'app : tableau de bord, mise en page, site web ═════════ */
    function toDashboard(m) {
        const app = A(); if (!app.dashboardBlockSettings || !app.saveDashboardBlockSettings) { toast('Le tableau de bord n’est pas chargé.', 'error'); return; }
        const s = app.dashboardBlockSettings(), before = clone(s);
        const w = app.dashboardNewWidget ? app.dashboardNewWidget('custommap_widget', {}) : {id: `custommap_widget-${Date.now().toString(36)}`, type: 'custommap_widget', width: '12', limit: 0, config: {}};
        w.config = {...(w.config || {}), mapId: m.id, mapName: m.name, height: 360};
        s.widgets = [...(s.widgets || []), w]; app.saveDashboardBlockSettings(s);
        app.undoToast?.(`Carte « ${m.name} » ajoutée au tableau de bord`, {undo: async () => { app.saveDashboardBlockSettings(before); }});
    }
    async function toLayout(m) {
        const Kit = ext.layoutKit; if (!Kit) { toast('La mise en page n’est pas chargée.', 'error'); return; }
        ext.openDialog({eyebrow: 'MISE EN PAGE', title: '📐 Mettre la carte dans la mise en page', submitLabel: 'Envoyer',
            body: `<p class="muted">La carte devient une page d’un livre (Mise en page), avec son titre. Une image de la carte est aussi rangée dans les médias. Jamais de personne vivante ni de fiche confidentielle.</p>
                <div class="form-grid one-column"><label class="checkbox-line"><input type="radio" name="to" value="new" checked> Un nouveau livre</label><label class="checkbox-line"><input type="radio" name="to" value="end"> À la fin d’un livre existant</label><div data-mcp-ly hidden>${P().pickerField({name: 'ly', kind: 'layout'})}</div></div>`,
            onOpen: d => d.addEventListener('change', e => { if (e.target.name === 'to') d.querySelector('[data-mcp-ly]').hidden = e.target.value !== 'end'; }),
            onSubmit: async f => {
                const toEnd = f.elements.to.value === 'end'; let lyId = 0, doc, name = m.name, rev;
                if (toEnd) { lyId = Number(f.elements.ly?.value); if (!lyId) return UI().fail(f.querySelector('[data-mcp-ly] input') || f, 'Choisis le livre.'); const r = await A().api('layout_doc', {id: lyId}); doc = (r.result ?? r).doc; name = (r.result ?? r).name; rev = (r.result ?? r).rev; }
                else { const th = (Kit.THEMES || [])[0]; doc = Kit.themeDoc(th, '', {w: 297, h: 210}); doc.title = m.name; doc.pages = []; }
                const media = await renderPng(m.id, {dpi: 200});
                const pg = {id: Kit.nid('p'), master: 'A', items: []}; doc.pages.push(pg);
                const bx = Kit.box(doc, doc.pages.length - 1);
                pg.items.push(Kit.textItem({x: bx.x, y: bx.y, w: bx.w, h: 14, html: `<p data-ps="ps-chapter">${esc(m.name)}</p>`, name: 'Titre de la carte'}));
                pg.items.push(Kit.shapeItem('frame', {x: bx.x, y: bx.y + 16, w: bx.w, h: bx.h - 16, src: media.filename ? `media/${media.filename}` : '', mediaId: media.id, srcName: m.name}));
                Kit.openEditor({id: lyId, name, doc, rev});
                toast('La carte est dans la mise en page : vérifie, puis enregistre le livre.');
            }});
    }
    function toSite() {
        toast('Dans 🌐 Mon site web : ＋ Ajouter un bloc → « 🗺 Une de mes cartes ». La carte y est mise en image, sans personne vivante ni fiche confidentielle.', '', ext.openWebsite ? {action: {label: 'Ouvrir mon site', run: () => ext.openWebsite()}} : undefined);
    }
    /** pose une de mes cartes (dessin vectoriel, sans tuiles) dans un élément : widget, fiche… */
    async function embed(el, {mapId, height = 360} = {}) {
        el.style.height = `${Math.max(200, Math.min(800, Number(height) || 360))}px`;
        el.innerHTML = UI().spinner ? UI().spinner('Je dessine la carte…') : '';
        try {
            await loadList(); const m = findMap(mapId);
            if (!m) { el.innerHTML = A().empty('Cette carte n’existe plus.', {icon: '🗺'}); return; }
            const mm = {...m, def: C().cleanDef(m.def)};
            const w = Math.max(320, el.clientWidth || 600), h = Math.max(200, el.clientHeight || 360);
            const cur = await renderSvg(mm, await fetchData(mm.def), {W: w, H: h, title: false, legend: true});
            el.innerHTML = cur.svg.replace(/<svg /, '<svg class="mcp-embed-svg" preserveAspectRatio="xMidYMid meet" ');
            el.title = 'Ouvrir dans la Carte'; el.setAttribute('role', 'button'); el.tabIndex = 0;
            const go = () => open(m.id); el.onclick = go; el.onkeydown = e => { if (e.key === 'Enter') go(); };
        } catch (e) { el.innerHTML = A().empty(`La carte n’a pas pu se dessiner : ${e.message}`, {icon: '⚠️'}); }
    }
    // le widget « 🗺 Une de mes cartes » du tableau de bord
    const wcfg = w => ({mapId: w?.config?.mapId ?? null, mapName: String(w?.config?.mapName || ''), height: Number(w?.config?.height) || 360});
    ext.dashboardConfig.custommap_widget = {
        html: w => { const c = wcfg(w); return `<fieldset class="mcp-wcfg"><div data-mcp-wpk><span class="pk-lab">Carte</span>${P().pickerField({name: 'mcpw_map', hiddenName: false, kind: 'custommap', value: c.mapId ? {id: c.mapId, title: c.mapName || 'Carte'} : null})}<input type="hidden" data-mcpw="map" value="${esc(c.mapId ?? '')}"><input type="hidden" data-mcpw="name" value="${esc(c.mapName)}"></div>
            <label>Hauteur <select data-mcpw="height">${[[260, 'petite'], [360, 'moyenne'], [520, 'grande']].map(([v, l]) => `<option value="${v}"${c.height === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label></fieldset>`; },
        read: ed => { const v = ed.querySelector('[data-mcpw=map]')?.value || ''; return {mapId: /^\d+$/.test(v) ? Number(v) : v || null, mapName: ed.querySelector('[data-mcpw=name]')?.value || '', height: Number(ed.querySelector('[data-mcpw=height]')?.value) || 360}; },
    };
    document.addEventListener('picker-change', e => { const box = e.target.closest?.('[data-mcp-wpk]'); if (!box) return; box.querySelector('[data-mcpw=map]').value = e.detail.item?.id ?? ''; box.querySelector('[data-mcpw=name]').value = e.detail.item?.title || ''; });
    ext.dashboard.custommap_widget = {render: (index, widget, span) => {
        const c = wcfg(widget), id = 'mcpw-' + Math.random().toString(36).slice(2, 9);
        setTimeout(() => { const el = document.getElementById(id); if (el && !el.dataset.done) { el.dataset.done = '1'; if (c.mapId) embed(el, c); else el.innerHTML = A().empty('Choisis une carte dans les réglages du widget (✎).', {icon: '🗺'}); } }, 0);
        return A().card(index, `🗺 ${c.mapName || 'Une de mes cartes'}`, '', `<div class="mcp-widget" id="${id}"></div>`, span, c.mapId ? `<button type="button" class="icon-action" data-mcp-wopen="${esc(c.mapId)}" title="Ouvrir dans la Carte" aria-label="Ouvrir dans la Carte">⛶</button>` : '');
    }};
    document.addEventListener('click', e => { const b = e.target.closest?.('[data-mcp-wopen]'); if (b) { e.preventDefault(); open(b.dataset.mcpWopen); } });
    const reg = () => {
        const app = A(); if (!app) return false;
        if (app.defaultDashboardBlocks && !app.defaultDashboardBlocks.some(x => x[0] === 'custommap_widget')) app.defaultDashboardBlocks.push(['custommap_widget', '🗺 Une de mes cartes']);
        if (app.defaultDashboardBlockSpans) app.defaultDashboardBlockSpans.custommap_widget = '12';
        if (app.dashboardWidgetInfo) app.dashboardWidgetInfo.custommap_widget = 'Une de tes cartes sur mesure (Carte → 🗺 Mes cartes), avec ses couches, ses filtres et sa légende. Un clic l’ouvre en grand dans la Carte.';
        return true;
    };
    if (!reg()) document.addEventListener('DOMContentLoaded', reg);

    ext.mesCartes = {before, sidebar, open, list: loadList, embed, renderSvg, renderPng, layersSvg, state: M, exportGeo, newMap, data: fetchData};
    if (S().module === 'carte' && S().mapMode === 'mine' && S().bootstrap) { A().renderSidebar?.(); rerender(); } // la Carte attendait ce fichier
})();
