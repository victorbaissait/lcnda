/* LCNDA — 📈 Mes graphiques et diagrammes, réunis :
 *  - Listes → « Graphiques et diagrammes » : tous mes graphiques (Éditeur de graphiques) et mes diagrammes (Graphiques →
 *    Mes diagrammes), avec la barre commune des listes (H10 : Chercher · Filtrer · Liste | Fiches · Trier), en vignettes ;
 *  - ext.pickMyGraph() : choisir un de mes graphiques (vignettes, recherche) → son identifiant ; partout où l'on pose un
 *    diagramme (« ＋ Diagramme » d'une Fiche, d'une enquête, de l'Atelier, de la page d'une personne, de la mise en page),
 *    « 📈 Un de mes graphiques » le pose comme un diagramme qui le suit (heritage-diagrams.js : ext.myGraphDiagram).
 * Les graphiques sont dans heritage-widgets.js (ext.myGraphs, ext.statDiagramSpec), les diagrammes dans heritage-diagrams.js.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI;
    const R = () => ext.diagramRender;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const toast = (...a) => A().toast(...a);
    const S = () => A().state;
    const STYLE_LABEL = {bars: 'Barres', columns: 'Colonnes', pie: 'Camembert', donut: 'Anneau', line: 'Courbe', area: 'Aire', tiles: 'Mosaïque', table: 'Tableau des chiffres'};
    const KIND_LABEL = {chart: 'Graphique', appstat: 'Graphique d’une statistique de l’app', numbers: 'Chiffres', list: 'Liste'};
    const kiosk = () => document.body.classList.contains('is-kiosk');
    const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const styleLabel = g => { const st = String(g.style || ''); if (st.startsWith('dg:')) { const k = st.slice(3).split(':')[0]; return R()?.KINDS[k]?.label || 'Diagramme'; } return STYLE_LABEL[st] || ''; };

    /* ─── les vignettes des graphiques : dessinées quand elles se montrent (leurs chiffres sont relus dans l'arbre) ─── */
    const thumbMem = new Map();
    document.addEventListener('lcnda:graphs-changed', () => thumbMem.clear());
    async function graphSvg(id) {
        if (!thumbMem.has(id)) thumbMem.set(id, (async () => { const r = await ext.statDiagramSpec?.(id); return r?.spec && R()?.KINDS[r.spec.kind] ? R().svg({...r.spec, o: {...(r.spec.o || {}), title: '', subtitle: '', source: '', legend: 'none'}}, 480) : ''; })().catch(() => ''));
        return thumbMem.get(id);
    }
    let io = null;
    const watched = new Set();
    function fillThumbs(root) {
        const boxes = [...root.querySelectorAll('[data-gr-thumb]:not([data-gr-done])')];
        const fill = async el => { el.dataset.grDone = '1'; const id = el.dataset.grThumb, svg = await graphSvg(id); if (svg && el.isConnected) el.innerHTML = svg; if (svg) sendThumb(id, svg); };
        if (!('IntersectionObserver' in window)) { boxes.slice(0, 40).forEach(fill); return; }
        io = io || new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); watched.delete(e.target); fill(e.target); } }), {rootMargin: '200px'});
        watched.forEach(el => { if (!el.isConnected) { io.unobserve(el); watched.delete(el); } }); // les vignettes d'une liste redessinée ne sont plus suivies (fuite)
        boxes.forEach(b => { io.observe(b); watched.add(b); });
    }

    /* ─── 🖼 la petite vignette du menu de choix : le dessin réduit en PNG, rangé dans la base (lib/graphs.php, op « thumb ») ─── */
    const sentThumb = new Set();
    async function svgToPng(svg, W = 192, H = 120) {
        const m = String(svg).match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/), vw = Number(m?.[1]) || 480, vh = Number(m?.[2]) || 300;
        const src = String(svg).replace(/^<svg(?![^>]*\swidth=)/, `<svg width="${vw}" height="${vh}"`);
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src); });
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
        const r = Math.min(W / vw, H / vh), w = vw * r, h = vh * r;
        g.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
        return c.toDataURL('image/png');
    }
    async function sendThumb(id, svg, force = false) {
        if (!svg || kiosk() || !window.LCNDA_GRAPHS || (sentThumb.has(id) && !force)) return;
        const info = ext.myGraphInfo?.(id); if (!info || (info.thumb_ok && !force)) return;
        sentThumb.add(id);
        try { const thumb = await svgToPng(svg); await A().api('graphs_write', {}, {method: 'POST', body: {op: 'thumb', uid: id, thumb}}); info.thumb_ok = true; } catch (_) { /* une vignette en moins : le menu montre l'icône */ }
    }
    /** après un enregistrement : la vignette est redessinée avec les nouveaux chiffres */
    ext.graphThumbNow = async id => { thumbMem.delete(id); sentThumb.delete(id); const svg = await graphSvg(id); await sendThumb(id, svg, true); };

    // au démarrage : les graphiques sans vignette (repris d'avant, ou dont les chiffres ont changé) en reçoivent une, sans se presser
    setTimeout(async () => {
        if (kiosk() || !window.LCNDA_GRAPHS) return;
        for (let i = 0; i < 100 && !S()?.csrf; i++) await new Promise(r => setTimeout(r, 300));
        const todo = (ext.myGraphs?.() || []).filter(g => { const inf = ext.myGraphInfo?.(g.id); return inf && !inf.thumb_ok; }).slice(0, 12);
        for (const g of todo) { if (kiosk()) return; try { await graphSvg(g.id).then(svg => sendThumb(g.id, svg)); } catch (_) {} await new Promise(r => setTimeout(r, 300)); }
    }, 6000);

    /** « ↗ Ouvrir » un de mes graphiques (menu de choix, recherche rapide) : en grand dans Graphiques, sinon l'éditeur */
    ext.openMyGraph = id => {
        const g = (ext.myStatDefs?.() || []).find(x => x.id === id) || (ext.myGraphs?.() || []).find(x => x.id === id);
        if (!g) return toast('Ce graphique n’existe plus.', 'error');
        if (g.inStats) return ext.openCustomStat?.(id);
        return ext.editStatFor?.(id);
    };

    /* ═════════ Choisir un de mes graphiques : le menu de choix commun (sorte « graph », lib/graphs.php) ═════════ */
    ext.pickMyGraph = async ({title = 'Un de mes graphiques'} = {}) => {
        const P = window.LCNDA_PICKER; if (!P?.openPicker) return null;
        const it = await P.openPicker({kind: 'graph', eyebrow: '📈 MES GRAPHIQUES', title, allowCreate: true, filter: {graph_kinds: 'chart,appstat'},
            label: 'Fait dans l’Éditeur de graphiques ; posé ici, il reste à jour partout'});
        return it?.uid || null;
    };

    /* ── le bloc « Diagramme » d'une Fiche (heritage-fiches.js) : à côté de « ＋ Nouveau diagramme », « 📈 Un de mes graphiques » ── */
    new MutationObserver(() => {
        if (!document.querySelector('[data-fi-dgnew]:not([data-gr-hook])')) return;
        document.querySelectorAll('[data-fi-dgnew]:not([data-gr-hook])').forEach(b => { b.dataset.grHook = '1'; if (ext.pickMyGraph && ext.myGraphDiagram) b.insertAdjacentHTML('afterend', ' <button type="button" class="button small secondary" data-gr-fimine title="Un graphique de l’Éditeur de graphiques, tenu à jour">📈 Un de mes graphiques</button>'); });
    }).observe(document.documentElement, {childList: true, subtree: true});
    document.addEventListener('click', async e => {
        const b = e.target.closest?.('[data-gr-fimine]'); if (!b) return;
        e.preventDefault();
        const root = b.closest('dialog') || document, sel = root.querySelector('select[name=diagram]');
        const gid = await ext.pickMyGraph(); if (!gid) return;
        try {
            const id = await ext.myGraphDiagram(gid); if (!id || !sel?.isConnected) return;
            if (![...sel.options].some(o => Number(o.value) === Number(id))) { const o = document.createElement('option'); o.value = String(id); o.textContent = (ext.diagramItems?.() || []).find(x => Number(x[0]) === Number(id))?.[1] || '📈 Mon graphique'; sel.appendChild(o); }
            sel.value = String(id); sel.dispatchEvent(new Event('change', {bubbles: true}));
        } catch (err) { toast(err.message, 'error'); }
    });

    /* ═════════ Listes → « Graphiques et diagrammes » ═════════ */
    const KEY = 'listes:graphs_list';
    const SORTS = [['recent', 'Les plus récents'], ['old', 'Les plus anciens'], ['az', 'A → Z'], ['za', 'Z → A']];
    function collect(diagrams) {
        const onBoard = new Set((() => { try { const st = S(), b = st.dashboardBoard; st.dashboardBoard = ''; try { return A().dashboardBlockSettings().widgets.map(w => w.type); } finally { st.dashboardBoard = b; } } catch (_) { return []; } })());
        const follow = new Map(diagrams.filter(d => ext.diagramFollowId?.(d)).map(d => [ext.diagramFollowId(d), d]));
        const linkName = l => `${{person: '👤', investigation: '🔎', investigation_item: '🧩', atelier_project: '📚'}[l.type] || '🔗'} ${l.name}`;
        const graphs = (ext.myStatDefs?.() || []).map(g => {
            const posed = follow.get(g.id), where = [g.inStats ? 'Graphiques → Mes graphiques' : '', onBoard.has(g.id) ? 'tableau de bord' : '', ...(posed?.links || []).map(linkName)].filter(Boolean);
            const manual = g.kind === 'chart' && g.src?.source === 'manual';
            return {type: 'graph', id: g.id, name: g.name || 'Mon graphique', icon: g.icon || '📈', what: `${KIND_LABEL[g.kind] || 'Graphique'}${styleLabel(g) && ['chart', 'appstat'].includes(g.kind) ? ' · ' + styleLabel(g) : ''}`,
                data: manual ? 'manual' : 'app', dataLabel: manual ? '✍️ Mes chiffres' : '🔄 Données de l’app', date: ext.myGraphCreated?.(g) || ext.myGraphInfo?.(g.id)?.created_at || '', where, posed: onBoard.has(g.id) || !!(posed?.links || []).length, note: g.note || g.caption || '', canPose: ['chart', 'appstat'].includes(g.kind)};
        });
        const dgs = diagrams.filter(d => !ext.diagramFollowId?.(d)).map(d => {
            const k = R()?.KINDS[d.kind];
            return {type: 'diagram', id: d.id, name: d.name || 'Mon diagramme', icon: k?.icon || '📊', what: `Diagramme · ${k?.label || d.kind}`, data: d.spec?.live ? 'app' : 'manual', dataLabel: d.spec?.live ? `🔄 ${d.spec.live.label || 'Données de l’app'}` : '✍️ Mes chiffres',
                date: d.updated_at || '', where: (d.links || []).map(linkName), posed: !!(d.links || []).length, note: d.spec?.o?.subtitle || '', d};
        });
        return [...graphs, ...dgs];
    }
    function itemOf(it) {
        const ref = `${it.type}:${it.id}`;
        const thumb = it.type === 'diagram' ? `<span class="gr-thumb">${(() => { try { return it.d.spec?.live ? `<span class="gr-ico">${esc(it.icon)}</span>` : R().svg({...it.d.spec, kind: it.d.kind, o: {...(it.d.spec?.o || {}), title: '', subtitle: '', source: '', legend: 'none'}}, 480); } catch (_) { return `<span class="gr-ico">${esc(it.icon)}</span>`; } })()}</span>`
            : `<span class="gr-thumb" ${['graph'].includes(it.type) ? `data-gr-thumb="${esc(it.id)}"` : ''}><span class="gr-ico">${esc(it.icon)}</span></span>`;
        return {cls: 'gr-item', attrs: `data-gr-item="${esc(ref)}"`, name: `${it.icon} ${it.name}`, open: `data-gr-open="${esc(ref)}"`, thumb,
            lines: [`${it.type === 'graph' ? '📈' : '📊'} ${it.what} · ${it.dataLabel}`, it.where.length ? `Posé : ${it.where.slice(0, 4).join(', ')}${it.where.length > 4 ? '…' : ''}` : 'Posé nulle part pour l’instant', it.note ? String(it.note).slice(0, 140) : ''],
            when: it.date, whenLabel: it.type === 'graph' ? 'Créé' : 'Modifié',
            actions: kiosk() ? '' : `<button type="button" class="button small secondary" data-gr-edit="${esc(ref)}">✎ Modifier</button>`};
    }
    ext.lists = ext.lists || {};
    ext.lists.graphs_list = async token => {
        const ws = A().$('#workspace'), cur = () => token === undefined || token === S().workspaceToken;
        ws.innerHTML = `<section class="page gr-page">${UI()?.spinner ? UI().spinner('Chargement…') : '<p class="muted">Chargement…</p>'}</section>`;
        let diagrams = [];
        try { diagrams = await (ext.diagramList ? ext.diagramList(true) : Promise.resolve([])); } catch (e) { if (cur()) ws.innerHTML = `<section class="page">${A().empty(e.message)}</section>`; return; }
        if (!cur() || S().module !== 'listes') return;
        let items = collect(diagrams), shown = [], limit = 40;
        ws.innerHTML = `<section class="page gr-page"><header class="page-header"><div><span class="eyebrow">LISTES · GRAPHIQUES</span><h2>📈 Graphiques et diagrammes</h2>
            <p>Tous tes graphiques (faits dans <b>Maintenance → Éditeur de graphiques</b>, avec tes propres chiffres ou ceux de l’app) et tes diagrammes (hémicycle, frise d’un groupe, camembert…). Chacun se pose partout : un widget du tableau de bord, une Fiche, une enquête, l’Atelier, la page d’une personne, la mise en page — bouton « ＋ Diagramme », puis « 📈 Un de mes graphiques ».</p></div>
            ${kiosk() ? '' : '<div class="page-actions"><button type="button" class="button" data-gr-newgraph>＋ Nouveau graphique</button><button type="button" class="button secondary" data-gr-newdg>＋ Nouveau diagramme</button></div>'}</header>
            <div data-gr-bar></div><div data-gr-body></div><div data-gr-more></div></section>`;
        const page = ws.querySelector('.gr-page'), body = page.querySelector('[data-gr-body]');
        let view = UI()?.viewOf ? UI().viewOf(KEY, 'cards') : 'cards', st = {q: '', filters: {}, sort: 'recent'};
        const filter = () => {
            const f = st.filters || {}, q = norm(st.q);
            let l = items.filter(it => (!f.sorte || it.type === f.sorte) && (!f.data || it.data === f.data) && (!f.posed || it.posed) && (!q || norm(`${it.name} ${it.what} ${it.dataLabel} ${it.where.join(' ')} ${it.note}`).includes(q)));
            l = UI()?.sortItems ? UI().sortItems(l, st.sort || 'recent', {name: x => x.name, date: x => x.date}) : l;
            return l;
        };
        const draw = () => {
            shown = filter();
            bar.setCount?.(shown.length === items.length ? shown.length : `${shown.length} sur ${items.length} ${items.length > 1 ? 'éléments' : 'élément'}`, 'élément');
            if (!items.length) { body.innerHTML = A().emptyState({icon: '📈', text: 'Aucun graphique ni diagramme pour l’instant', hint: 'Un graphique compte ce que tu veux (tes propres chiffres, des personnes, des événements, une statistique de l’app) ; un diagramme dessine une assemblée, une frise, un organigramme…', action: kiosk() ? null : {label: '＋ Nouveau graphique', attrs: 'data-gr-newgraph'}}); page.querySelector('[data-gr-more]').innerHTML = ''; return; }
            const part = shown.slice(0, limit).map(itemOf);
            body.innerHTML = shown.length ? (UI()?.itemsHtml ? UI().itemsHtml(view, part) : part.map(p => `<p>${esc(p.name)}</p>`).join('')) : '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">🔍</span><span class="empty-line-text">Rien ne correspond : retire un filtre ou change la recherche.</span></p>';
            const more = page.querySelector('[data-gr-more]'); more.innerHTML = '';
            if (shown.length > limit && UI()?.moreButton) more.appendChild(UI().moreButton({remaining: shown.length - limit, step: 40, onClick: () => { limit += 40; draw(); }}));
            fillThumbs(body);
        };
        const bar = UI().listBar({key: KEY, search: {placeholder: 'Chercher un graphique, un diagramme… (ex. naissances, Rennes)'},
            filters: [{id: 'sorte', label: 'Sorte', type: 'radio', options: [['', 'Tout'], ['graph', '📈 Graphiques', '📈 Graphiques'], ['diagram', '📊 Diagrammes', '📊 Diagrammes']], value: ''},
                {id: 'data', label: 'Données', type: 'radio', options: [['', 'Toutes'], ['manual', '✍️ Mes chiffres', '✍️ Mes chiffres'], ['app', '🔄 Données de l’app', '🔄 Données de l’app']], value: ''},
                {id: 'posed', label: 'Où', type: 'check', text: 'Seulement ceux posés quelque part', chipLabel: 'Posés quelque part'}],
            view: {what: 'graphiques', dflt: 'cards', onChange: v => { view = v; draw(); }},
            sort: {options: SORTS, value: 'recent'},
            onChange: (b, {what}) => { st = b; if (what !== 'view') { limit = 40; draw(); } }});
        st = bar.state; view = bar.state.view || view;
        page.querySelector('[data-gr-bar]').replaceWith(bar);
        draw();
        const refresh = async () => { try { diagrams = await ext.diagramList(true); } catch (_) {} items = collect(diagrams); if (page.isConnected) draw(); };
        page.addEventListener('click', async e => {
            if (e.target.closest('[data-gr-newgraph]')) return ext.newStatFor?.();
            if (e.target.closest('[data-gr-newdg]')) return ext.openDiagramEditor?.(null, {onSave: () => refresh()});
            const b = e.target.closest('[data-gr-open],[data-gr-edit]'); if (!b) return;
            const ref = b.dataset.grOpen || b.dataset.grEdit, i = ref.indexOf(':'), type = ref.slice(0, i), id = ref.slice(i + 1), it = items.find(x => x.type === type && String(x.id) === id); if (!it) return;
            const edit = b.hasAttribute('data-gr-edit');
            if (type === 'graph') {
                const g = (ext.myStatDefs?.() || []).find(x => x.id === id); if (!g) return toast('Graphique introuvable.', 'error');
                if (!edit && g.inStats) return ext.openCustomStat?.(id);
                return ext.editStatFor?.(id);
            }
            if (edit) return ext.openDiagramEditor?.(Number(id), {onSave: () => refresh()});
            ext.openDiagram?.(Number(id));
        });
        const onChg = () => { if (!page.isConnected) { document.removeEventListener('lcnda:graphs-changed', onChg); return; } refresh(); };
        document.addEventListener('lcnda:graphs-changed', onChg);
    };
})();
