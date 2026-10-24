/* LCNDA — 🎨 Catalogues d'artistes : les LISTES (maquette F), pilotées par les définitions du moteur.
 * Même barre partout (H10, UI.listBar) : 🔍 Chercher · Filtrer ▾ (les filtres de la sorte, par rubriques) · Liste | Fiches ·
 * Trier ▾ ; ⚙️ choisit les colonnes (panneau « Champs affichés », onglet « La liste ») ; « Voir les N suivants ↓ ».
 * Aussi : l'export de la liste (E3 : tableur, PDF, impression, fichier réimportable) et l'export d'une fiche.
 */
(() => {
    'use strict';
    const ART = window.LCNDA_ART; if (!ART) return;
    const A = () => window.LCNDA_APP, UI = () => window.LCNDA_UI || {};
    const U = ART.util, esc = U.esc;
    const STEP = 30;
    const DEF_SORTS = [['year', 'Par année'], ['recent', 'Les plus récents'], ['az', 'A → Z'], ['za', 'Z → A'], ['perso', 'Mon ordre']];
    const num = v => Number(String(v ?? '').match(/(\d+(?:[.,]\d+)?)\s*$/)?.[1]?.replace(',', '.') || NaN);
    function sortItems(list, how) {
        const l = [...list], y = it => Number(it.year) || 9999, t = it => String(it.title || '');
        const cmp = {year: (a, b) => y(a) - y(b) || a.sort - b.sort, date: (a, b) => y(a) - y(b), recent: (a, b) => y(b) - y(a), az: (a, b) => t(a).localeCompare(t(b), 'fr'), za: (a, b) => t(b).localeCompare(t(a), 'fr'), perso: (a, b) => a.sort - b.sort,
            catref: (a, b) => (num(a.data.catref) || 1e9) - (num(b.data.catref) || 1e9) || t(a).localeCompare(t(b), 'fr'), value: (a, b) => (U.num(b.data.value) || 0) - (U.num(a.data.value) || 0),
            size: (a, b) => (U.num(b.data.h) * U.num(b.data.w) || 0) - (U.num(a.data.h) * U.num(a.data.w) || 0)}[how] || ART.sorters?.[how] || ((a, b) => y(a) - y(b));
        return l.sort(cmp);
    }
    ART.sortItems = sortItems;
    /** une cellule de tableau : vignette, pastille de personne, badge d'attribution… */
    function cell(ctx, it, f) {
        if (f.type === 'photos') return U.cover(it, 'ar-thumb');
        if (f.key === 'attribution') { const a = it.data.attribution || 'certaine'; return `<span class="ar-badge ${a === 'certaine' ? 'ok' : 'w'}">${esc((ART.ARTLISTS?.ATTRIB.find(x => x[0] === a) || [, a])[1].replace('Œuvre ', '').toLowerCase())}</span>`; }
        if (f.key === 'title') return `<b>${esc(it.title)}</b>`;
        if (f.key === 'catref') return `<b>${esc(it.data.catref || '')}</b>`;
        if (f.type === 'place') return esc(ART.text(ctx, it, f));
        if (f.type === 'person' || f.type === 'item') { const h = ART.read(ctx, it, f); return h || (f.key === 'owner' ? '<span class="ar-g">inconnu</span>' : ''); }
        if (f.type === 'dims') return esc(ART.text(ctx, it, f).replace(/ cm$/, ''));
        return esc(ART.text(ctx, it, f));
    }
    ART.listCell = cell;

    ART.paintList = (C, body) => {
        const {store, S} = C, kind = S.kind, def = ART.defs[kind]; if (!def) return;
        const key = `artistes:${kind}`, filters = (def.filters ? def.filters(store) : []).map(f => ({...f}));
        const sorts = def.sorts || DEF_SORTS;
        let shown = STEP;
        const wrap = document.createElement('div'); wrap.className = 'ar-listwrap';
        const head = document.createElement('div'); head.className = 'ar-listhead';
        const out = document.createElement('div'); out.className = 'ar-listout';
        body.append(head, out);
        const bar = UI().listBar({key, search: {placeholder: `Chercher… (${def.searchHint || (kind === 'work' ? 'ex. moulin, CR 47, Laguenne, 1921' : 'titre, nom, lieu, année')})`},
            filters, view: {dflt: kind === 'work' ? 'list' : ['release', 'master', 'film', 'book'].includes(kind) ? 'cards' : 'list', what: String(def.many).toLowerCase()},
            sort: {options: sorts, value: kind === 'work' ? 'catref' : 'year'}, onChange: () => { shown = STEP; draw(); }});
        head.appendChild(bar);
        const cfg = document.createElement('button'); cfg.type = 'button'; cfg.className = 'icon-button ar-colbtn'; cfg.title = 'Choisir les colonnes (« ⚙️ Champs affichés », onglet « La liste »)'; cfg.textContent = '⚙️';
        cfg.addEventListener('click', () => ART.openFieldsPanel?.(C, kind, 'liste'));
        bar.querySelector('.ui-listbar-row')?.appendChild(cfg);
        function filtered() {
            const st = bar.state, q = String(st.q || '').trim().toLowerCase();
            let list = store.of(kind);
            if (q) { const ctx = ART.ctx(store, {}); const all = ART.fieldsOf(def, store.customFields(kind)); list = list.filter(it => [it.title, it.year, ...all.map(f => { try { return ART.text(ART.ctx(store, it), it, f); } catch (_) { return ''; } })].join(' ').toLowerCase().includes(q)); }
            filters.forEach(f => { const v = st.filters[f.id]; if (f.test) list = list.filter(it => f.test(it, v, store)); });
            return sortItems(list, st.sort || sorts[0][0]);
        }
        C.listIds = () => filtered().map(i => i.id);
        function draw() {
            const list = filtered(), total = store.of(kind).length, st = bar.state;
            const sum = def.summary ? def.summary(list) : '';
            bar.setCount(`${U.plural(list.length, String(def.label).toLowerCase(), String(def.many).toLowerCase())}${list.length !== total ? ` sur ${total}` : ''}${sum ? ` · ${sum}` : ''}`);
            if (!total) { out.innerHTML = A().emptyState({icon: def.icon, text: `${def.fem ? 'Aucune' : 'Aucun'} ${String(def.label).toLowerCase()} pour l’instant`, hint: '« ＋ Nouveau », ou « ⤒ Importer » (Discogs, MusicBrainz, Open Library, Wikidata, TMDb, un tableau, un fichier).', action: {label: `＋ ${def.fem ? 'Nouvelle' : 'Nouveau'} ${String(def.label).toLowerCase()}`, attrs: 'data-ar-cmd="new"'}}); return; }
            if (!list.length) { out.innerHTML = A().emptyState({icon: '🔎', text: 'Rien ne correspond', hint: 'Change les mots cherchés ou retire un filtre.'}); return; }
            const page = list.slice(0, shown), perso = st.sort === 'perso';
            const move = it => perso ? `<span class="ar-move"><span class="ar-grip" title="Glisser pour ranger">⠿</span><button type="button" class="icon-button small" data-ar-up="${it.id}" title="Monter">↑</button><button type="button" class="icon-button small" data-ar-down="${it.id}" title="Descendre">↓</button></span>` : '';
            if (st.view === 'cards') {
                const L = ART.layout(store, kind, 'vignettes'), lines = L.fields.filter(f => f.on && f.type !== 'photos' && f.key !== 'title');
                // K9 : la vignette unique (UI.cardsHtml) ; les champs choisis dans « ⚙️ Champs affichés » : les 2 premiers en lignes grises, les suivants en pastilles
                out.innerHTML = UI().cardsHtml(page.map(it => { const ctx = ART.ctx(store, it), t = lines.map(f => ART.text(ctx, it, f)).filter(Boolean);
                    return {thumb: U.cover(it), name: it.title, open: `data-ar-row-open="${it.id}"`, lines: t.slice(0, 2), badges: t.slice(2, 6).map(x => ({text: x, kind: 'grey'})), quick: move(it)}; }));
            } else {
                const L = ART.layout(store, kind, 'liste'), cols = L.fields.filter(f => f.on);
                out.innerHTML = `<div class="ar-scroll"><table class="ar-t ar-list"><thead><tr>${cols.map(f => `<th>${esc(f.type === 'photos' ? '' : (f.short || f.label).replace(' (avec durées)', ''))}</th>`).join('')}${perso ? '<th></th>' : ''}</tr></thead><tbody>${page.map(it => { const ctx = ART.ctx(store, it); return `<tr data-ar-row-open="${it.id}" class="is-click">${cols.map(f => `<td class="c-${esc(f.type)}">${cell(ctx, it, f)}</td>`).join('')}${perso ? `<td>${move(it)}</td>` : ''}</tr>`; }).join('')}</tbody></table></div>`;
            }
            if (list.length > shown) { const m = UI().moreButton({remaining: list.length - shown, step: STEP, feminine: !!def.fem, onClick: () => { shown += STEP; draw(); }}); out.appendChild(m); }
        }
        out.addEventListener('click', async e => {
            const b = e.target.closest('[data-ar-up],[data-ar-down]'); if (!b) return; e.stopPropagation();
            const list = sortItems(store.of(kind), 'perso'), id = Number(b.dataset.arUp || b.dataset.arDown), i = list.findIndex(x => x.id === id), j = b.dataset.arUp ? i - 1 : i + 1;
            if (i < 0 || j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; list.forEach((x, k) => { x.sort = k + 1; }); draw();
            try { await ART.write('reorder', {person_id: store.pid, ids: list.map(x => x.id)}); C.S.changed = true; } catch (er) { A().toast(er.message, 'error'); await C.reload(); draw(); }
        }, true);
        out.addEventListener('keydown', e => { const r = e.target.closest('[data-ar-row-open]'); if (r && e.key === 'Enter') C.open(Number(r.dataset.arRowOpen)); });
        draw();
    };

    /* ═════════ Exporter (E3) : la liste ═════════ */
    const dl = (blob, fn) => { const a = Object.assign(document.createElement('a'), {href: URL.createObjectURL(blob), download: fn}); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
    const fname = (C, what) => `${A().safeExportFilename ? A().safeExportFilename(C.store.name, 'artiste') : 'artiste'}-${what}`;
    /** une notice imprimable (les champs de l'onglet « L'export ») */
    ART.noticeHtmlFor = (store, it, {abs = true} = {}) => {
        const L = ART.layout(store, it.kind, 'export'), ctx = ART.ctx(store, it), absu = s => (s && abs ? new URL(s, location.href).href : s);
        const ph = L.fields.find(f => f.on && f.type === 'photos') ? U.photoSrc(ART.normPhotos(it.data.photos)[0]) : '';
        const rows = L.fields.filter(f => f.on && f.type !== 'photos' && f.key !== 'title').map(f => { const t = ART.text(ctx, it, f); return t ? `<p><span class="k">${esc(f.short || f.label)}</span> ${esc(t)}</p>` : ''; }).join('');
        return `<article class="notice">${ph ? `<img src="${esc(absu(ph))}" alt="">` : ''}<div><h2>${esc(it.title)}${it.year ? ` <small>${esc(it.year)}</small>` : ''}</h2>${rows}</div></article>`;
    };
    const printDoc = (title, inner) => { const w = window.open('', '_blank'); if (!w) { A().toast('La fenêtre d’impression est bloquée par le navigateur.', 'error'); return; }
        w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:13px/1.45 Georgia,serif;margin:18px;color:#222}h1{font:700 22px system-ui}.notice{display:flex;gap:16px;border-bottom:1px solid #ccc;padding:10px 0;page-break-inside:avoid}.notice img{width:150px;max-height:190px;object-fit:contain}.notice h2{margin:0 0 4px;font-size:16px}.notice h2 small{color:#777;font-weight:400}.notice p{margin:2px 0}.k{font:700 9px system-ui;letter-spacing:.1em;text-transform:uppercase;color:#8a6a3a;margin-right:4px}@page{margin:14mm}</style><h1>${esc(title)}</h1>${inner}<script>onload=()=>setTimeout(()=>print(),300)<\/script>`); w.document.close(); };
    ART.exportList = (C, kind) => {
        const def = ART.defs[kind], store = C.store, ids = C.listIds ? C.listIds() : store.of(kind).map(i => i.id), list = ids.map(id => store.get(id)).filter(Boolean);
        const title = `${store.name} — ${def.many}`;
        const tableRows = () => { const L = ART.layout(store, kind, 'liste'), all = ART.fieldsOf(def, store.customFields(kind)).filter(f => f.type !== 'computed' && f.type !== 'photos'), cols = [...new Set([...L.fields.filter(f => f.on && f.type !== 'photos'), ...all].map(f => f.key))].map(k => all.find(f => f.key === k) || L.fields.find(f => f.key === k)).filter(Boolean);
            return [cols.map(f => f.label), ...list.map(it => cols.map(f => ART.text(ART.ctx(store, it), it, f)))]; };
        const csv = filename => { const rows = tableRows();
            const cellc = v => A().csvCell ? A().csvCell(v, {sep: ';', quote: 'always'}) : `"${String(v ?? '').replace(/"/g, '""')}"`;
            dl(new Blob(['﻿' + rows.map(r => r.map(cellc).join(';')).join('\r\n')], {type: 'text/csv;charset=utf-8'}), filename || `${fname(C, kind)}.csv`); };
        const file = filename => dl(new Blob([JSON.stringify({lcnda: 'artistes', version: 2, kind, exporte: new Date().toISOString(), items: list.map(it => ({kind: it.kind, data: it.data}))}, null, 1)], {type: 'application/json'}), filename || `${fname(C, kind)}.json`);
        const print = () => printDoc(title, list.map(it => ART.noticeHtmlFor(store, it)).join(''));
        if (!UI().openExportDialog) return print();
        return UI().openExportDialog({title, defaultName: title, quality: false, info: U.plural(list.length, String(def.label).toLowerCase(), String(def.many).toLowerCase()), formats: [
            {id: 'pdf', hint: 'les notices illustrées (« Enregistrer en PDF »)', ext: '', run: async () => print()},
            {id: 'print', hint: 'les notices illustrées', run: async () => print()},
            {id: 'csv', label: '📊 Tableur', hint: 'CSV (Excel, Numbers, LibreOffice)', ext: 'csv', run: async o => csv(o.filename)},
            ...(window.LCNDA_EXT?.sheetExportFormat ? [window.LCNDA_EXT.sheetExportFormat(tableRows, title)] : []), // 🧾 les mêmes colonnes, ouvertes dans le tableur
            {id: 'file', label: '💾 Fichier', hint: 'pour une autre base : « ⤒ Importer » → « Un fichier exporté d’ici »', ext: 'json', run: async o => file(o.filename)}]});
    };
    /* ═════════ Exporter (E3) : une fiche ═════════ */
    ART.exportItem = (C, it) => {
        const title = it.title, print = () => printDoc(title, ART.noticeHtmlFor(C.store, it));
        const file = filename => dl(new Blob([JSON.stringify({lcnda: 'artistes', version: 2, kind: it.kind, exporte: new Date().toISOString(), items: [{kind: it.kind, data: it.data}]}, null, 1)], {type: 'application/json'}), filename || `${fname(C, it.kind)}.json`);
        if (!UI().openExportDialog) return print();
        return UI().openExportDialog({title, defaultName: title, quality: false, info: 'les champs de l’onglet « L’export » (⚙️ Champs affichés)', formats: [
            {id: 'pdf', hint: 'la notice (« Enregistrer en PDF »)', ext: '', run: async () => print()}, {id: 'print', hint: 'la notice', run: async () => print()},
            {id: 'file', label: '💾 Fichier', hint: 'réimportable (« ⤒ Importer »)', ext: 'json', run: async o => file(o.filename)}]});
    };
})();
