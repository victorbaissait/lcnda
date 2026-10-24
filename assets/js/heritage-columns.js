/**
 * ⚙️ Colonnes des listes (onglet Listes) : dans toutes les listes en tableau, un bouton « ⚙️ Colonnes » pour masquer,
 * montrer et ranger les colonnes ; dans les listes de base (Personnes, Événements, Lieux, Médias…), on peut aussi
 * AJOUTER une colonne tirée des données (cote, transcription, format du fichier…).
 *  - listes de base : app.js (tableHtml) demande les colonnes à LCNDA_EXT.listColumns.apply() ;
 *  - autres listes : les cellules déjà affichées sont rangées ou masquées (ex. Audios, Recueils, Villages…).
 * Réglages : localStorage « genealogie-list-columns » (copié dans la base comme les autres réglages).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const esc = v => A().escapeHtml(v ?? '');
    const S = () => A().state;
    const KEY = 'genealogie-list-columns';
    const all = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { return {}; } };
    const get = list => ({order: [], hidden: [], extra: [], ...(all()[list] || {})});
    const put = (list, cfg) => { try { const a = all(); if (!cfg) delete a[list]; else a[list] = cfg; localStorage.setItem(KEY, JSON.stringify(a)); } catch (_) {} };

    const LABELS = {id: 'N°', created_at: 'Créé', updated_at: 'Modifié', date_text: 'Date', year: 'Année', place: 'Lieu', title: 'Titre', description: 'Description', notes: 'Notes', note: 'Note',
        filename: 'Fichier', media_type: 'Sorte', document_reference: 'Cote', document_title: 'Document', document_url: 'Lien du document', document_pages: 'Pages', transcription: 'Transcription', first_name: 'Prénom',
        last_name: 'Nom', middle_name: 'Deuxième prénom', gender: 'Sexe', birth_year: 'Année de naissance', death_year: 'Année de décès', birth_date: 'Naissance', death_date: 'Décès', marr_date: 'Mariage', birth_place: 'Lieu de naissance',
        death_place: 'Lieu de décès', county: 'Département', country: 'Pays', state: 'Région', latitude: 'Latitude', longitude: 'Longitude', occupation: 'Métier', reference_number: 'Référence', familysearch_id: 'FamilySearch',
        duration_seconds: 'Durée (s)', format: 'Format', date_calendar: 'Calendrier', type: 'Type', person: 'Personne', people: 'Personnes', address: 'Adresse', postal_code: 'Code postal', city: 'Ville', email: 'Courriel', phone: 'Téléphone',
        sosa_number: 'N° SOSA', status: 'Statut', category: 'Catégorie', amount: 'Montant', vendor: 'Fournisseur', destinataire: 'Destinataire', organisme: 'Organisme', objet: 'Objet', statut: 'Statut', event_count: 'Événements', surname_group: 'Groupe'};
    const label = k => LABELS[k] || k.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
    /** Colonnes calculées, en plus des champs des lignes. */
    const VIRTUAL = {media: {format: row => String(row.filename || '').split('.').pop().toUpperCase()}, signatures: {format: row => String(row.filename || '').split('.').pop().toUpperCase()}};
    const scalarKeys = rows => { const keys = new Set(); rows.slice(0, 30).forEach(r => Object.entries(r || {}).forEach(([k, v]) => { if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) keys.add(k); })); return [...keys]; };

    /* ─── Listes de base : app.js demande ses colonnes ici ─── */
    ext.listColumns = {
        apply(type, columns, rows) {
            const cfg = get(type);
            const virt = VIRTUAL[type] || {};
            const stamp = k => /^(created|updated)_at$/.test(k); // K4 : « aujourd’hui à 10 h 22 », « 17 oct. 2026 »
            let cols = [...columns, ...cfg.extra.filter(k => !columns.some(c => c[1] === k)).map(k => [label(k), virt[k] || stamp(k) ? `__v_${k}` : k])];
            if (Object.keys(virt).length) rows.forEach(r => Object.entries(virt).forEach(([k, fn]) => { r[`__v_${k}`] = fn(r); }));
            cfg.extra.filter(stamp).forEach(k => rows.forEach(r => { r[`__v_${k}`] = window.LCNDA_UI?.whenText?.(r[k]) || r[k] || ''; }));
            const id = c => c[1].replace(/^__v_/, '');
            if (cfg.order.length) cols.sort((a, b) => { const ia = cfg.order.indexOf(id(a)), ib = cfg.order.indexOf(id(b)); return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib); });
            (ext._lastColumns ||= {})[type] = cols;
            const shown = cols.filter(c => !cfg.hidden.includes(id(c)));
            return shown.length ? shown : cols.slice(0, 1);
        },
        /** Champs qu'on peut ajouter (ceux des lignes, sauf ceux déjà en colonne). */
        extras(type, columns, rows) { const have = new Set(columns.map(c => c[1])); return [...new Set([...Object.keys(VIRTUAL[type] || {}), ...scalarKeys(rows)])].filter(k => !have.has(k) && !/^__/.test(k) && !/(_json|password|secret|csrf)$/.test(k)); },
    };

    /* ─── Le bouton et sa fenêtre ─── */
    function dialog(list, model) {
        // model : {base: [[label, id]], extras: [ids], canAdd} ; ids dans l'ordre actuel
        const cfg = get(list);
        let cols = model.base.map(([l, id]) => ({id, label: l, on: !cfg.hidden.includes(id), extra: cfg.extra.includes(id)}));
        if (cfg.order.length) cols.sort((a, b) => { const ia = cfg.order.indexOf(a.id), ib = cfg.order.indexOf(b.id); return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib); });
        const row = (c, i) => `<div class="h-cfg-row ${c.on ? '' : 'is-hidden'}" data-col="${i}"><span class="h-rb-tools"><button type="button" class="icon-button" data-col-move="-1" ${i ? '' : 'disabled'}>↑</button><button type="button" class="icon-button" data-col-move="1" ${i < cols.length - 1 ? '' : 'disabled'}>↓</button></span>
            <label class="checkbox-line"><input type="checkbox" data-col-on ${c.on ? 'checked' : ''}> ${esc(c.label || '(sans titre)')}</label>${c.extra ? '<small class="h-cfg-tag is-mine">ajoutée</small><button type="button" class="icon-button danger" data-col-del title="Retirer cette colonne">🗑</button>' : ''}</div>`;
        ext.openDialog({eyebrow: 'COLONNES DE LA LISTE', title: 'Colonnes', wide: true, submitLabel: 'Enregistrer',
            body: `<p class="muted">Coche ce qui doit apparaître, range avec ↑ ↓.${model.canAdd ? ' Tu peux aussi ajouter une colonne tirée des données.' : ''}</p><div class="h-cfg-list" data-cols></div>
                ${model.canAdd && model.extras.length ? `<div class="h-avx-row"><select data-col-add><option value="">＋ Ajouter une colonne…</option>${model.extras.map(k => `<option value="${esc(k)}">${esc(label(k))}</option>`).join('')}</select></div>` : ''}
                <button type="button" class="button small secondary" data-col-reset>↺ Remettre comme au départ</button>`,
            onOpen: d => {
                const box = d.querySelector('[data-cols]'), drawCols = () => { box.innerHTML = cols.map(row).join(''); };
                drawCols();
                box.addEventListener('click', e => { const r = e.target.closest('[data-col]'); if (!r) return; const i = Number(r.dataset.col);
                    const mv = e.target.closest('[data-col-move]'); if (mv) { const j = i + Number(mv.dataset.colMove); if (j >= 0 && j < cols.length) { [cols[i], cols[j]] = [cols[j], cols[i]]; drawCols(); } }
                    if (e.target.closest('[data-col-del]')) { cols.splice(i, 1); drawCols(); } });
                box.addEventListener('change', e => { const r = e.target.closest('[data-col]'); if (r && e.target.matches('[data-col-on]')) { cols[Number(r.dataset.col)].on = e.target.checked; r.classList.toggle('is-hidden', !e.target.checked); } });
                d.querySelector('[data-col-add]')?.addEventListener('change', e => { const k = e.target.value; if (!k || cols.some(c => c.id === k)) return; cols.push({id: k, label: label(k), on: true, extra: true}); e.target.querySelector(`option[value="${CSS.escape(k)}"]`)?.remove(); e.target.value = ''; drawCols(); });
                d.querySelector('[data-col-reset]').addEventListener('click', () => { put(list, null); d.close(); model.after(); });
            },
            onSubmit: () => {
                if (!cols.some(c => c.on)) { A().toast('Garde au moins une colonne.', 'error'); return false; }
                put(list, {order: cols.map(c => c.id), hidden: cols.filter(c => !c.on).map(c => c.id), extra: cols.filter(c => c.extra).map(c => c.id)});
                model.after();
            },
        });
    }

    /* ─── Autres listes : on range et on masque les cellules affichées ─── */
    const norm = t => String(t || '').replace(/[↑↓]/g, '').replace(/\s+/g, ' ').trim();
    function domTable(table, list) {
        const head = table.tHead?.rows[0]; if (!head) return;
        if (!head.dataset.colOrig) head.dataset.colOrig = JSON.stringify([...head.cells].map((c, i) => norm(c.textContent) || `#${i + 1}`));
        const ids = JSON.parse(head.dataset.colOrig), cfg = get(list);
        // place voulue de chaque colonne d'origine
        const order = [...ids.keys()].sort((a, b) => { const ia = cfg.order.indexOf(ids[a]), ib = cfg.order.indexOf(ids[b]); return (ia < 0 ? 900 + a : ia) - (ib < 0 ? 900 + b : ib); });
        const arrange = tr => {
            if (tr.cells.length !== ids.length) return; // ligne « rien ne correspond », etc.
            const orig = tr.dataset.colCells ? JSON.parse(tr.dataset.colCells) : null;
            const cells = orig ? orig.map(k => tr.querySelector(`[data-col-o="${k}"]`)) : [...tr.cells];
            if (!orig) { cells.forEach((c, k) => { c.dataset.colO = k; }); tr.dataset.colCells = JSON.stringify(cells.map((_, k) => k)); }
            order.forEach(k => { const c = cells[k]; if (!c) return; c.hidden = cfg.hidden.includes(ids[k]); tr.appendChild(c); });
        };
        arrange(head);
        [...head.cells].forEach((c, pos) => { const b = c.querySelector('[data-sort-column]'); if (b) b.dataset.sortColumn = String(pos); });
        table.tBodies[0] && [...table.tBodies[0].rows].forEach(arrange);
        table.dataset.colApplied = JSON.stringify(cfg);
    }
    function scan() {
        if (S().module !== 'listes') return;
        const ws = A().$('#workspace'); if (!ws) return;
        ws.querySelectorAll('table.data-table').forEach((table, n) => {
            if (table.closest('dialog') || !table.tHead) return;
            const appList = table.dataset.colList, list = appList || `x:${S().listType}${n ? ':' + n : ''}`;
            if (!appList) {
                const head = table.tHead.rows[0];
                const pending = [...(table.tBodies[0]?.rows || [])].some(tr => !tr.dataset.colCells && tr.cells.length === head.cells.length);
                if (pending || table.dataset.colApplied !== JSON.stringify(get(list))) domTable(table, list);
            }
            const wrap = table.closest('.data-table-wrap') || table;
            if (wrap.previousElementSibling?.classList.contains('h-cols-bar')) return;
            const bar = document.createElement('div'); bar.className = 'h-cols-bar';
            bar.innerHTML = '<button type="button" class="button small secondary" data-cols-cfg title="Masquer, montrer, ranger les colonnes">⚙️ Colonnes</button>' + (ext.openRowsInSheet ? '<button type="button" class="button small secondary" data-cols-export title="La liste telle qu’elle est affichée (mêmes colonnes, mêmes filtres) : dans le tableur ou en CSV">⤓ Exporter ▾</button>' : '');
            wrap.before(bar);
            bar.querySelector('[data-cols-export]')?.addEventListener('click', e => exportMenu(e.currentTarget, table));
            bar.querySelector('[data-cols-cfg]').addEventListener('click', () => {
                if (appList) {
                    const rows = S().currentListRows || [];
                    const base = [...table.tHead.rows[0].cells].map(c => [norm(c.textContent), c.dataset.colKey]).filter(c => c[1]);
                    // toutes les colonnes possibles (même masquées) : celles de app.js + les ajoutées
                    const full = (ext._lastColumns?.[appList] || base).map(([l, k]) => [l, k.replace(/^__v_/, '')]);
                    dialog(appList, {base: full, extras: ext.listColumns.extras(appList, full, rows), canAdd: true, after: () => A().renderList()});
                } else {
                    const ids = JSON.parse(table.tHead.rows[0].dataset.colOrig || '[]');
                    dialog(list, {base: ids.map(id => [/^#\d+$/.test(id) ? `Colonne ${id.slice(1)} (sans titre)` : id, id]), extras: [], canAdd: false, after: () => { table.dataset.colApplied = ''; scan(); }});
                }
            });
        });
    }
    /* ⤓ Exporter ▾ : la liste telle qu'elle est affichée (colonnes montrées, lignes filtrées) → 🧾 le tableur, ou un CSV */
    const cellText = c => (c.innerText || c.textContent || '').replace(/[↑↓]/g, '').replace(/\s+/g, ' ').trim();
    function shownRows(table) {
        const vis = c => !c.hidden && c.offsetParent !== null || (!c.hidden && !c.closest('[hidden]'));
        const head = [...table.tHead.rows[0].cells].map((c, i) => ({i, vis: vis(c), t: cellText(c)}));
        const keep = head.filter(h => h.vis && !(h.t === '' && !table.tBodies[0]?.rows[0]?.cells[h.i]?.textContent.trim()));
        const rows = [...(table.tBodies[0]?.rows || [])].filter(tr => !tr.hidden && tr.cells.length === head.length).map(tr => keep.map(h => cellText(tr.cells[h.i])));
        return [keep.map(h => h.t || `Colonne ${h.i + 1}`), ...rows];
    }
    function listName() { const ws = A().$('#workspace'); return (ws?.querySelector('.page-header h2, .ui-page-head h2, h2')?.textContent || 'Liste').replace(/\s+/g, ' ').trim().slice(0, 120); }
    function exportMenu(btn, table) {
        const UI = window.LCNDA_UI, rows = () => shownRows(table);
        UI.menuAt(btn, [
            {icon: '🧾', label: 'Ouvrir dans le tableur', help: 'mêmes colonnes, mêmes filtres', run: () => ext.openRowsInSheet({name: listName(), rows: rows()})},
            {icon: '🧾', label: 'En CSV (Excel, LibreOffice…)', run: () => { const SH = window.LCNDA_SHEET, m = rows(); if (!SH || m.length < 2) return A().toast('Rien à exporter : la liste est vide.'); const name = (A().safeExportFilename ? A().safeExportFilename(listName(), 'liste') : 'liste') + '.csv';
                const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([SH.toCSV(m, {sep: ';'})], {type: 'text/csv;charset=utf-8'})); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); }},
        ], {title: `${Math.max(0, rows().length - 1)} lignes affichées`});
    }
    ext.listShownRows = shownRows; // pour les essais
    let timer = 0;
    new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(scan, 30); }).observe(document.body, {childList: true, subtree: true});
})();
