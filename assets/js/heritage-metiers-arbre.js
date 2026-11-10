/* LCNDA — 🧬 Arbre des métiers : Graphiques → « 🧬 Arbre des métiers » (mode « occtree » de app-graphiques.js), aussi depuis
 * la fiche (⋯ → « 🧬 Arbre des métiers »), la recherche rapide et la FAQ.
 * Le même arbre que « Arbre des ascendants / des descendants » (api tree, cases .tree-card : designs A5 et portraits K7 compris),
 * le même cadre (générations, zoom, ⤓ Exporter E3 : PDF, PNG, JPG, SVG, 🖨 Imprimer L1) ; chaque case montre ses métiers,
 * colorés par grand secteur (classement du dictionnaire des métiers anciens, lib/metiers_carte.php).
 * Transmission : lien plein de la couleur du secteur = même métier que le parent ; « ⇄ » = changement ; pointillés = un des deux
 * sans métier connu. Filtres (secteur, métier), légende, statistiques (fils qui reprennent le métier du père, filles celui de la
 * mère, par siècle ; dans l'arbre et dans toute la base), clic sur une case = la fiche. Noyau : app-metiers-carte-core.js.
 * API : ext.occTree = {stage(token), bind(), open(personId)}.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP, UI = () => window.LCNDA_UI || {}, CORE = () => window.LCNDA_METIERS_CARTE;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const KEY = 'genealogie-occtree';
    const lsGet = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && typeof v === 'object' ? v : {}; } catch (_) { return {}; } };
    const lsSet = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (_) {} };
    const cfg = () => { const v = lsGet(); return {mode: v.mode === 'descendants' ? 'descendants' : 'ancestors', sector: typeof v.sector === 'string' ? v.sector.slice(0, 12) : '', q: typeof v.q === 'string' ? v.q.slice(0, 60) : '', priv: v.priv === true}; };
    const setCfg = patch => lsSet({...cfg(), ...patch});
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    let last = null; // {tree, nodes, links, data, sectors, root}
    let baseCache = null, baseAt = 0;

    const name = p => (A().personName ? A().personName(p) : [p.first_name, p.last_name].filter(Boolean).join(' ')) || 'Sans nom';
    const yearsOf = p => (A().years ? A().years(p) : '');
    const av = p => (UI().avatarOn?.() || window.LCNDA_DESIGNS?.treePhoto?.()) && UI().avatar ? UI().avatar({...p, name: name(p), photo: p.portrait ? `media/${encodeURIComponent(p.portrait)}` : ''}, 48) : '';
    const LINK_TXT = {same: ['＝', 'Même métier que le parent'], change: ['⇄', 'Autre métier que le parent'], unknown: ['', 'Métier inconnu pour l’un des deux']};

    function sectorMap(list) { const m = {}; (list || []).forEach(s => { m[s[0]] = {key: s[0], icon: s[1], label: s[2], color: s[3]}; }); return m; }
    function cardHtml(p, extraCls = '') {
        const L = last, hid = L.priv && L.hidden.has(Number(p.id));
        const jobs = hid ? [] : (L.data.jobs[p.id] || []), S = L.sectors, main = S[CORE().mainSector(jobs)];
        const keys = jobs.map(j => j.key).join(' '), secs = [...new Set(jobs.map(j => j.sector))].join(' ');
        const txt = jobs.map(j => fold(j.text + ' ' + j.name)).join(' | ');
        const chips = jobs.length ? jobs.slice(0, 3).map(j => { const s = S[j.sector] || S.autre || {icon: '❔', color: '#999', label: ''}; return `<span class="occ-job" style="--occ-c:${esc(s.color)}" title="${esc(s.label)}${j.year ? ` · noté en ${esc(j.year)}` : ''}">${s.icon} ${esc(j.text)}</span>`; }).join('') + (jobs.length > 3 ? `<span class="occ-job is-more">+${jobs.length - 3}</span>` : '')
            : `<span class="occ-job is-none">${hid ? '🔒 caché' : 'métier inconnu'}</span>`;
        return `<button type="button" class="tree-card occ-card gender-${esc(p.gender || 'unknown')}${extraCls}" data-occ-person="${Number(p.id)}" data-occ-secs="${esc(secs)}" data-occ-keys="${esc(keys)}" data-occ-text="${esc(txt)}"${main ? ` style="--occ-c:${esc(main.color)}"` : ''} title="Ouvrir la fiche">${hid ? '' : av(p)}<strong>${esc(hid ? 'Personne vivante ou confidentielle' : name(p))}</strong><small>${esc(hid ? '' : yearsOf(p))}</small><span class="occ-jobs">${chips}</span></button>`;
    }
    /** le lien entre une case et celle du dessus : 'same' | 'change' | 'unknown' */
    function linkOf(n, parent) {
        const L = last, par = L.mode === 'descendants' ? parent.person : n.person, ch = L.mode === 'descendants' ? n.person : parent.person;
        const r = L.priv && (L.hidden.has(Number(par.id)) || L.hidden.has(Number(ch.id))) ? 'unknown' : CORE().link(L.data.jobs[par.id], L.data.jobs[ch.id]);
        return {r, who: par.gender === 'female' ? 'sa mère' : par.gender === 'male' ? 'son père' : 'son parent', of: L.mode === 'descendants' ? 'enfant' : 'parent'};
    }
    function nodeHtml(n, parent) {
        const p = n.person;
        let mark = '';
        if (parent) {
            const {r, who} = linkOf(n, parent);
            if (r !== 'unknown') mark = `<span class="occ-mark is-${r}" title="${esc(r === 'same' ? `Même métier que ${who}` : `Pas le même métier que ${who}`)}">${LINK_TXT[r][0]} ${r === 'same' ? 'même métier' : 'autre métier'}</span>`;
        }
        const partners = (n.partners || []).map(pt => `<div class="tree-partner-link"><span aria-hidden="true">∞</span>${cardHtml(pt, ' tree-partner-card')}</div>`).join('');
        const kids = (n.children || []).length ? `<ul>${n.children.map(c => { const {r} = linkOf(c, n); return `<li class="occ-li is-${r}" style="${linkColor(c, n, r)}">${nodeHtml(c, n)}</li>`; }).join('')}</ul>` : '';
        return `<div class="tree-node-shell">${mark}<div class="tree-person-unit">${cardHtml(p)}${partners ? `<div class="tree-partners">${partners}</div>` : ''}</div>${n.has_more ? '<span class="tree-continuation" title="D’autres générations existent" aria-label="D’autres générations existent"></span>' : ''}</div>${kids}`;
    }
    /** la couleur du trait « même métier » : celle du secteur du métier commun */
    function linkColor(c, n, r) {
        if (r !== 'same') return '';
        const L = last, a = L.data.jobs[c.person.id] || [], b = new Set((L.data.jobs[n.person.id] || []).map(j => j.key)), j = a.find(x => b.has(x.key));
        const s = j && L.sectors[j.sector]; return s ? `--occ-c:${esc(s.color)}` : '';
    }
    const rate = (a, b) => (b ? `${a} sur ${b} (${CORE().pct(a, b)} %)` : '—');
    function statsHtml() {
        const L = last, t = CORE().stats(L.links, L.priv ? Object.fromEntries(Object.entries(L.data.jobs).filter(([id]) => !L.hidden.has(Number(id)))) : L.data.jobs), b = L.data.base;
        const rows = (g, title) => { const o = t[g], ob = b?.[g]; if (!o.pairs && !(ob && ob.pairs)) return '';
            const cents = [...new Set([...o.by.map(x => x.century), ...((ob?.by) || []).map(x => x.century)])].sort((x, y) => (x || 9999) - (y || 9999));
            return `<div class="occ-stat"><h4>${title}</h4><table class="data-table occ-stat-table"><thead><tr><th>Naissance de l’enfant</th><th>Dans cet arbre</th><th>Dans toute ta base</th></tr></thead><tbody>${cents.map(c => { const a = o.by.find(x => x.century === c), z = (ob?.by || []).find(x => x.century === c);
                return `<tr><td>${esc(CORE().centuryLabel(c))}</td><td>${a ? rate(a.same, a.pairs) : '—'}</td><td>${z ? rate(z.same, z.pairs) : '—'}</td></tr>`; }).join('')}<tr class="occ-total"><td>En tout</td><td>${rate(o.same, o.pairs)}</td><td>${ob ? rate(ob.same, ob.pairs) : '—'}</td></tr></tbody></table></div>`; };
        const html = rows('male', '👨‍👦 Fils qui reprennent le métier de leur père') + rows('female', '👩‍👧 Filles qui reprennent le métier de leur mère');
        return html || A().empty('Pas encore de quoi compter : il faut le métier d’un parent et celui de son enfant du même sexe.', {icon: '🧮'});
    }
    function legendHtml() {
        const L = last, count = {};
        Object.entries(L.data.jobs).forEach(([id, jobs]) => { if (L.priv && L.hidden.has(Number(id))) return; [...new Set(jobs.map(j => j.sector))].forEach(s => { count[s] = (count[s] || 0) + 1; }); });
        const used = Object.values(L.sectors).filter(s => count[s.key]);
        return `<div class="occ-legend" aria-label="Légende"><div class="occ-legend-sectors">${used.map(s => `<span class="occ-leg"><i style="background:${esc(s.color)}"></i>${s.icon} ${esc(s.label)} <small>${count[s.key]}</small></span>`).join('') || '<span class="muted">Aucun métier noté dans cet arbre.</span>'}</div>
            <div class="occ-legend-links"><span class="occ-leg"><i class="occ-line is-same"></i>Même métier que le parent</span><span class="occ-leg"><b class="occ-mark is-change">⇄</b>Changement de métier</span><span class="occ-leg"><i class="occ-line is-unknown"></i>Métier inconnu pour l’un des deux</span></div></div>`;
    }

    /** le contenu de la scène de Graphiques (dans .tree-scale-content : c'est ce qui s'exporte et s'imprime) */
    async function stage(token) {
        const st = A().state, c = cfg(), id = Number(st.currentPersonId) || Number(st.bootstrap?.startPersonId) || 0;
        if (!id) return A().emptyState({icon: '🧬', text: 'Choisis une personne', hint: 'L’arbre des métiers part d’une personne : choisis-la dans la case au-dessus.'});
        const depth = Math.max(2, Math.min(10, Number(st.graphDepth) || 4));
        const tr = await A().api('tree', {id, mode: c.mode, depth});
        if (token !== st.workspaceToken) return '';
        const {nodes, links} = CORE().walk(tr.tree, c.mode);
        const ids = new Set(nodes.map(n => n.id)); const addP = n => { (n.partners || []).forEach(p => ids.add(Number(p.id))); (n.children || []).forEach(addP); }; if (tr.tree) addP(tr.tree);
        const wantBase = !baseCache || Date.now() - baseAt > 60000;
        const data = await A().api('metiers_arbre', {ids: [...ids].slice(0, 1500).join(','), base: wantBase ? 1 : ''});
        if (wantBase && data.base) { baseCache = data.base; baseAt = Date.now(); }
        data.base = data.base || baseCache;
        data.jobs = data.jobs && typeof data.jobs === 'object' ? data.jobs : {};
        last = {tree: tr.tree, nodes, links, data, mode: c.mode, sectors: sectorMap(data.sectors), hidden: new Set((data.hidden || []).map(Number)), priv: c.priv, root: tr.tree?.person || null};
        if (!tr.tree) return A().emptyState({icon: '🔗', text: 'Aucune relation disponible.', hint: 'Ajoute des parents, conjoints ou enfants sur la fiche.'});
        const who = last.root && !(c.priv && last.hidden.has(Number(last.root.id))) ? name(last.root) : 'cette personne';
        const noted = nodes.filter(n => (data.jobs[n.id] || []).length).length;
        return `<div class="occ-view" data-occ-view>
            <div class="occ-title"><span class="eyebrow">ARBRE DES MÉTIERS</span><h2>🧬 ${c.mode === 'descendants' ? 'Les métiers des descendants de' : 'Les métiers des ancêtres de'} ${esc(who)}</h2><p class="muted">${esc(A().plural(nodes.length, 'personne'))} · ${esc(A().plural(noted, 'métier noté', 'métiers notés'))} · ${esc(A().plural(Number(tr.depth) || depth, 'génération'))}</p></div>
            <div class="tree occ-tree">${`<ul><li>${nodeHtml(tr.tree, null)}</li></ul>`}</div>
            ${legendHtml()}
            <section class="occ-stats"><h3>📊 La transmission du métier</h3><p class="muted">Un enfant « reprend » le métier quand au moins un de ses métiers est aussi celui du parent (mêmes mots du dictionnaire des métiers anciens : « laboureur » et « laboureur à bras » comptent pareil).</p>${statsHtml()}</section></div>`;
    }

    function applyFilters(root) {
        const c = cfg(), q = fold(c.q).trim();
        root.querySelectorAll('[data-occ-person]').forEach(b => {
            const okS = !c.sector || (b.dataset.occSecs || '').split(' ').includes(c.sector);
            const okQ = !q || (b.dataset.occText || '').includes(q);
            b.classList.toggle('is-dim', !(okS && okQ));
        });
        const n = root.querySelectorAll('[data-occ-person]:not(.is-dim)').length, out = document.querySelector('[data-occ-count]');
        if (out) out.textContent = c.sector || q ? `${A().plural(n, 'case montrée', 'cases montrées')}` : '';
    }

    /** la barre de réglages (au-dessus de la scène, pas dans l'export) */
    function bind() {
        const strip = document.querySelector('#workspace .graph-layout .tool-strip'); if (!strip || !last) { bindCards(); return; }
        document.querySelector('#workspace .occ-controls')?.remove();
        const c = cfg(), st = A().state, S = last.sectors, count = {};
        Object.entries(last.data.jobs).forEach(([id, jobs]) => { if (c.priv && last.hidden.has(Number(id))) return; [...new Set(jobs.map(j => j.sector))].forEach(s => { count[s] = (count[s] || 0) + 1; }); });
        const total = Object.keys(last.data.jobs).filter(id => !(c.priv && last.hidden.has(Number(id)))).length;
        const bar = document.createElement('div'); bar.className = 'occ-controls no-export';
        const pk = (A().pickerField || window.LCNDA_PICKER?.pickerField)?.({name: 'occ_person', kind: 'person', allowCreate: false, value: last.root ? {id: Number(last.root.id), title: name(last.root), kind: 'person'} : null}) || '';
        bar.innerHTML = `<div class="occ-ctl-row"><div class="pk-host occ-pk"><span>Personne</span><div data-occ-pk>${pk.replace(' name="occ_person"', '')}</div></div>
            <div class="segmented" role="tablist" aria-label="Sens de l’arbre"><button type="button" class="${c.mode === 'ancestors' ? 'is-active' : ''}" data-occ-mode="ancestors">⬆ Ascendants</button><button type="button" class="${c.mode === 'descendants' ? 'is-active' : ''}" data-occ-mode="descendants">⬇ Descendants</button></div>
            <span data-occ-q></span>
            <label class="ui-toggle" title="Pour montrer ou imprimer l’arbre : les vivants et les fiches confidentielles n’apparaissent plus"><input type="checkbox" data-occ-priv ${c.priv ? 'checked' : ''}><i></i>🔒 Sans les vivants ni les fiches confidentielles</label></div>
            <div class="ui-filters occ-filters" aria-label="Secteurs"><button type="button" class="${c.sector ? '' : 'is-active'}" data-occ-sector="">Tout (${total})</button>${Object.values(S).filter(s => count[s.key]).map(s => `<button type="button" class="${c.sector === s.key ? 'is-active' : ''}" data-occ-sector="${esc(s.key)}"><i class="occ-dot" style="background:${esc(s.color)}"></i>${s.icon} ${esc(s.label)} (${count[s.key]})</button>`).join('')}<small class="muted" data-occ-count></small></div>`;
        strip.after(bar);
        const sf = UI().searchField?.({placeholder: 'Chercher un métier… (tisserand, laboureur)', value: c.q, label: 'Chercher un métier', onInput: v => { setCfg({q: v}); applyFilters(document.querySelector('#workspace [data-occ-view]') || document); }});
        if (sf) bar.querySelector('[data-occ-q]').replaceWith(sf);
        bar.addEventListener('click', async e => {
            const m = e.target.closest('[data-occ-mode]'); if (m) { setCfg({mode: m.dataset.occMode}); await window.LCNDA_PARTS?.renderGraph?.(); return; }
            const s = e.target.closest('[data-occ-sector]'); if (s) { setCfg({sector: s.dataset.occSector}); bar.querySelectorAll('[data-occ-sector]').forEach(b => b.classList.toggle('is-active', b === s)); applyFilters(document.querySelector('#workspace [data-occ-view]') || document); }
        });
        bar.querySelector('[data-occ-priv]').addEventListener('change', async e => { setCfg({priv: e.target.checked}); await (window.LCNDA_PARTS?.renderGraph?.()); });
        bar.querySelector('[data-occ-pk]')?.addEventListener('picker-change', async e => { const it = e.detail?.item; if (!it || it.free || !Number(it.id)) return; st.currentPersonId = Number(it.id); A().persistUiState?.(); await (window.LCNDA_PARTS?.renderGraph?.()); });
        UI().scan?.(bar);
        bindCards();
    }
    function bindCards() {
        const root = document.querySelector('#workspace [data-occ-view]'); if (!root) return;
        applyFilters(root);
        root.addEventListener('click', e => { const b = e.target.closest('[data-occ-person]'); if (!b) return; e.preventDefault(); e.stopPropagation(); A().openPersonById?.(Number(b.dataset.occPerson)); });
    }
    /** depuis la fiche (⋯), la recherche ou la FAQ : Graphiques, en partant de cette personne */
    function open(personId) {
        const st = A().state; if (Number(personId)) st.currentPersonId = Number(personId);
        st.graphMode = 'occtree'; st.graphTab = 'types'; A().setModule('graphiques');
    }
    ext.occTree = {stage, bind, open, _last: () => last};

    // ⋯ de la fiche : « 🧬 Arbre des métiers »
    ext.personMoreItems = ext.personMoreItems || [];
    ext.personMoreItems.push(detail => { const p = detail?.person; if (!p?.id || p.kind === 'animal') return null; return {icon: '🧬', label: 'Arbre des métiers', run: () => open(Number(p.id))}; });
})();
