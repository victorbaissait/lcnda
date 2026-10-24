/**
 * 📊 Tableur d'une page de recueil (listes à transposer) : ext.recueilTable(boîte, tableau, {onChange, onPerson, onOpenPerson}).
 *  - colonnes et lignes : ajouter, renommer, supprimer ; ordre verrouillé ou libre (glisser une colonne, une ligne) ;
 *  - choisir des cellules (clic, Maj + clic), les fusionner ou les défusionner ;
 *  - coller depuis un tableur (Excel, Numbers, LibreOffice) : les cellules se remplissent, lignes et colonnes ajoutées ;
 *  - une ligne peut être rattachée à une fiche : elle apparaît dans le bloc « Recueils » de la personne ;
 *  - export CSV.
 * Le tableau est enregistré dans la page (lib/recueils.php, recueil_clean_table).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const esc = value => A().escapeHtml(value ?? '');
    let seq = 0;
    const uid = p => p + Date.now().toString(36) + (seq++).toString(36);

    /** Tableau vide de départ : 4 colonnes, 5 lignes. */
    ext.recueilTableNew = () => ({v: 1, locked: true, cols: ['Nom', 'Prénom', 'Âge', 'Lieu'].map(name => ({id: uid('c'), name})), rows: Array.from({length: 5}, () => ({id: uid('r'), c: {}})), merges: []});
    /** Texte d'une ligne (pour la recherche, le rattachement). */
    ext.recueilTableRowText = (t, row) => t.cols.map(c => (row.c?.[c.id] || '').trim()).filter(Boolean).join(' · ');
    ext.recueilTableHasText = t => !!t?.rows?.some(r => Object.values(r.c || {}).some(v => String(v).trim()));

    ext.recueilTable = (box, table, {onChange, onPerson, onOpenPerson} = {}) => {
        const t = table;
        t.cols ||= []; t.rows ||= []; t.merges ||= [];
        t.rows.forEach(r => { if (!r.c || Array.isArray(r.c)) r.c = {}; });
        let sel = null; // {r0, c0, r1, c1} en indices
        const changed = () => onChange?.(t);
        const rIdx = id => t.rows.findIndex(r => r.id === id), cIdx = id => t.cols.findIndex(c => c.id === id);
        /** Fusions en indices (celles dont l'ancre a disparu sont ignorées). */
        const spans = () => t.merges.map(m => ({m, r: rIdx(m.r), c: cIdx(m.c)})).filter(x => x.r >= 0 && x.c >= 0)
            .map(x => ({...x, r1: Math.min(t.rows.length - 1, x.r + x.m.rs - 1), c1: Math.min(t.cols.length - 1, x.c + x.m.cs - 1)}));
        /**
         * Les fusions suivent les lignes et les colonnes : kind 'r' (lignes) ou 'c' (colonnes).
         * Avant de retirer [i0, i0+n[ : la fusion se resserre sur ce qui reste (et change d'ancre si besoin) ;
         * après une insertion en `at` : elle s'agrandit si `at` tombe dedans ; un déplacement défait celles qu'il traverse.
         */
        const mergesRemove = (kind, i0, n) => {
            const list = kind === 'r' ? t.rows : t.cols, gone = new Set(list.slice(i0, i0 + n).map(x => x.id));
            t.merges = spans().map(x => {
                const a = kind === 'r' ? x.r : x.c, b = kind === 'r' ? x.r1 : x.c1, keep = list.slice(a, b + 1).filter(y => !gone.has(y.id));
                if (!keep.length) return null;
                if (kind === 'r') { x.m.r = keep[0].id; x.m.rs = keep.length; } else { x.m.c = keep[0].id; x.m.cs = keep.length; }
                return x.m.rs > 1 || x.m.cs > 1 ? x.m : null;
            }).filter(Boolean);
        };
        const mergesInsert = (kind, at) => spans().forEach(x => { const a = kind === 'r' ? x.r : x.c, b = kind === 'r' ? x.r1 : x.c1; if (at > a && at <= b) { if (kind === 'r') x.m.rs++; else x.m.cs++; } });
        const mergesMove = (kind, from, to) => { const before = t.merges.length; t.merges = spans().filter(x => { const a = kind === 'r' ? x.r : x.c, b = kind === 'r' ? x.r1 : x.c1; return !((from >= a && from <= b) || (to >= a && to <= b)); }).map(x => x.m); if (t.merges.length < before) A().toast?.('Fusion défaite : la ligne ou la colonne déplacée la traversait.'); };
        const range = () => sel ? {r0: Math.min(sel.r0, sel.r1), r1: Math.max(sel.r0, sel.r1), c0: Math.min(sel.c0, sel.c1), c1: Math.max(sel.c0, sel.c1)} : null;

        function paint(focus) {
            const sp = spans(), covered = new Set(), anchor = new Map();
            sp.forEach(x => { anchor.set(x.r + ':' + x.c, x); for (let r = x.r; r <= x.r1; r++) for (let c = x.c; c <= x.c1; c++) if (r !== x.r || c !== x.c) covered.add(r + ':' + c); });
            const g = range(), inSel = (r, c) => g && r >= g.r0 && r <= g.r1 && c >= g.c0 && c <= g.c1;
            const free = !t.locked;
            box.innerHTML = `<div class="h-rt-bar">
                    <button type="button" class="button small ${t.locked ? 'secondary' : ''}" data-rt-lock title="${t.locked ? 'Ordre verrouillé : clique pour pouvoir glisser les colonnes et les lignes' : 'Ordre libre : glisse un titre de colonne ou un numéro de ligne'}">${t.locked ? '🔒 Ordre verrouillé' : '🔓 Ordre libre (glisser)'}</button>
                    <button type="button" class="button small secondary" data-rt-addrow>＋ Ligne</button>
                    <button type="button" class="button small secondary" data-rt-addcol>＋ Colonne</button>
                    <span class="h-rt-sep"></span>
                    <button type="button" class="button small secondary" data-rt-merge ${g && (g.r1 > g.r0 || g.c1 > g.c0) ? '' : 'disabled'} title="Choisis plusieurs cellules (clic puis Maj + clic)">⧉ Fusionner</button>
                    <button type="button" class="button small secondary" data-rt-unmerge ${g && sp.some(x => x.r >= g.r0 && x.r <= g.r1 && x.c >= g.c0 && x.c <= g.c1) ? '' : 'disabled'}>⊟ Défusionner</button>
                    <button type="button" class="button small secondary" data-rt-delrow ${g ? '' : 'disabled'}>🗑 ${g && g.r1 > g.r0 ? 'Lignes' : 'Ligne'}</button>
                    <button type="button" class="button small secondary" data-rt-delcol ${g ? '' : 'disabled'}>🗑 ${g && g.c1 > g.c0 ? 'Colonnes' : 'Colonne'}</button>
                    <span class="h-rt-sep"></span>
                    ${ext.openSheetEditor ? '<button type="button" class="button small secondary" data-rt-sheet title="Le tableur en grand : formules, tri, filtres, coller depuis Excel… puis « ✓ Enregistrer et revenir » (les lignes reliées à une fiche le restent)">🧾 Ouvrir dans le tableur</button>' : ''}
                    <button type="button" class="button small secondary" data-rt-csv title="Télécharger le tableau (s’ouvre dans Excel, Numbers, LibreOffice)">⤓ Exporter en CSV</button>
                    <span class="muted h-rt-hint">Coller depuis un tableur (ou glisser un fichier .csv) remplit les cellules · Entrée : cellule du dessous · Maj + Entrée : à la ligne</span></div>
                <div class="h-rt-wrap"><table class="h-rt ${free ? 'is-free' : ''}"><thead><tr><th class="h-rt-corner">#</th>${t.cols.map((c, ci) => `<th data-rt-col="${ci}">${free ? '<span class="h-rt-grip" draggable="true" title="Glisser pour déplacer la colonne">⠿</span>' : ''}<input data-rt-colname="${ci}" value="${esc(c.name)}" placeholder="Colonne ${ci + 1}"></th>`).join('')}</tr></thead>
                <tbody>${t.rows.map((r, ri) => `<tr data-rt-row="${ri}"><th class="h-rt-rowhead"><span class="h-rt-num" ${free ? 'draggable="true" title="Glisser pour déplacer la ligne"' : ''}>${free ? '⠿ ' : ''}${ri + 1}</span>
                        ${r.person ? `<span class="h-rt-person"><button type="button" class="link-button" data-rt-openp="${ri}" title="Ouvrir la fiche">👤 ${esc(r.person.name)}</button><button type="button" class="icon-button" data-rt-unp="${ri}" title="Ne plus rattacher cette ligne à la fiche">✕</button></span>` : `<button type="button" class="icon-button h-rt-addp" data-rt-person="${ri}" title="Cette ligne parle de quelqu’un : la rattacher à sa fiche (bloc « Recueils » de la personne)">👤</button>`}</th>
                    ${t.cols.map((c, ci) => { const k = ri + ':' + ci; if (covered.has(k)) return ''; const a = anchor.get(k);
                        return `<td ${a ? `rowspan="${a.r1 - a.r + 1}" colspan="${a.c1 - a.c + 1}" class="is-merged ${inSel(ri, ci) ? 'is-sel' : ''}"` : inSel(ri, ci) ? 'class="is-sel"' : ''} data-rt-cell="${ri}:${ci}"><div contenteditable="plaintext-only" spellcheck="false" data-rt-text>${esc(r.c[c.id] || '')}</div></td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`;
            bind();
            if (focus) box.querySelector(`[data-rt-cell="${focus}"] [data-rt-text]`)?.focus();
        }

        function bind() {
            const q = s => box.querySelector(s), qa = s => box.querySelectorAll(s);
            q('[data-rt-lock]').addEventListener('click', () => { t.locked = !t.locked; changed(); paint(); });
            q('[data-rt-addrow]').addEventListener('click', () => { const g = range(), at = g ? g.r1 + 1 : t.rows.length; mergesInsert('r', at); t.rows.splice(at, 0, {id: uid('r'), c: {}}); sel = null; changed(); paint(`${at}:0`); });
            q('[data-rt-addcol]').addEventListener('click', () => { const g = range(), at = g ? g.c1 + 1 : t.cols.length; mergesInsert('c', at); t.cols.splice(at, 0, {id: uid('c'), name: ''}); sel = null; changed(); paint(); box.querySelector(`[data-rt-colname="${at}"]`)?.focus(); });
            q('[data-rt-merge]').addEventListener('click', merge);
            q('[data-rt-unmerge]').addEventListener('click', () => { const g = range(); const drop = new Set(spans().filter(x => x.r >= g.r0 && x.r <= g.r1 && x.c >= g.c0 && x.c <= g.c1).map(x => x.m)); t.merges = t.merges.filter(m => !drop.has(m)); changed(); paint(); });
            q('[data-rt-delrow]').addEventListener('click', async () => {
                const g = range(); const gone = t.rows.slice(g.r0, g.r1 + 1);
                if (gone.some(r => Object.values(r.c).some(v => String(v).trim()) || r.person) && !await A().confirmBox(`Supprimer ${gone.length > 1 ? `ces ${gone.length} lignes` : 'cette ligne'} ?${gone.some(r => r.person) ? '\n\nLe rattachement à la fiche sera retiré.' : ''}`, {title: 'Supprimer des lignes', okLabel: 'Supprimer'})) return;
                for (const r of gone) if (r.person) await onPerson?.(r, null);
                mergesRemove('r', g.r0, gone.length); t.rows.splice(g.r0, gone.length); sel = null; changed(); paint();
            });
            q('[data-rt-delcol]').addEventListener('click', async () => {
                const g = range(); const gone = t.cols.slice(g.c0, g.c1 + 1);
                if (gone.some(c => t.rows.some(r => String(r.c[c.id] || '').trim())) && !await A().confirmBox(`Supprimer ${gone.length > 1 ? `ces ${gone.length} colonnes` : `la colonne « ${gone[0].name || g.c0 + 1} »`} et leur contenu ?`, {title: 'Supprimer des colonnes', okLabel: 'Supprimer'})) return;
                gone.forEach(c => t.rows.forEach(r => delete r.c[c.id])); mergesRemove('c', g.c0, gone.length); t.cols.splice(g.c0, gone.length); sel = null; changed(); paint();
            });
            q('[data-rt-csv]').addEventListener('click', csv);
            q('[data-rt-sheet]')?.addEventListener('click', () => ext.openSheetEditor({target: 'recueil', data: JSON.parse(JSON.stringify(t)), name: 'Tableau de la page', onSave: async v => {
                if (!v) return; for (const r of v._gone || []) await onPerson?.(r, null); // une ligne reliée à une fiche, supprimée dans le tableur : le lien part aussi
                t.cols = v.cols; t.rows = v.rows; t.merges = v.merges; sel = null; changed(); paint(); A().toast?.('Tableau repris du tableur.'); }}));
            qa('[data-rt-colname]').forEach(inp => inp.addEventListener('input', () => { t.cols[Number(inp.dataset.rtColname)].name = inp.value; changed(); }));
            qa('[data-rt-cell]').forEach(td => {
                const [ri, ci] = td.dataset.rtCell.split(':').map(Number), div = td.querySelector('[data-rt-text]');
                td.addEventListener('mousedown', e => {
                    if (e.shiftKey && sel) { e.preventDefault(); sel.r1 = ri; sel.c1 = ci; paint(); return; }
                    const same = sel && sel.r0 === ri && sel.c0 === ci && sel.r1 === ri && sel.c1 === ci;
                    sel = {r0: ri, c0: ci, r1: ri, c1: ci};
                    if (!same) { qa('.is-sel').forEach(x => x.classList.remove('is-sel')); td.classList.add('is-sel'); refreshBar(); }
                });
                div.addEventListener('input', () => { t.rows[ri].c[t.cols[ci].id] = div.innerText.replace(/\n$/, ''); changed(); });
                div.addEventListener('keydown', e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const nr = ri + 1; if (nr >= t.rows.length) { t.rows.push({id: uid('r'), c: {}}); changed(); } sel = {r0: nr, c0: ci, r1: nr, c1: ci}; paint(`${nr}:${ci}`); }
                });
                div.addEventListener('paste', e => {
                    const txt = (e.clipboardData || window.clipboardData)?.getData('text/plain') || '';
                    if (!/[\t\n]/.test(txt.replace(/\n$/, ''))) return; // une seule valeur : collage normal
                    e.preventDefault(); pasteGrid(ri, ci, txt);
                });
            });
            qa('[data-rt-person]').forEach(b => b.addEventListener('click', () => onPerson?.(t.rows[Number(b.dataset.rtPerson)], 'pick').then(ok => { if (ok) { changed(); paint(); } })));
            qa('[data-rt-unp]').forEach(b => b.addEventListener('click', async () => { const r = t.rows[Number(b.dataset.rtUnp)]; if (!await A().confirmBox(`Ne plus rattacher cette ligne à ${r.person.name} ?`, {title: 'Détacher de la fiche', okLabel: 'Ne plus rattacher', danger: true})) return; await onPerson?.(r, null); delete r.person; changed(); paint(); }));
            qa('[data-rt-openp]').forEach(b => b.addEventListener('click', () => onOpenPerson?.(t.rows[Number(b.dataset.rtOpenp)].person)));
            if (!t.locked) dragging();
        }
        /** Met à jour les boutons sans redessiner (la cellule garde le curseur). */
        function refreshBar() {
            const g = range(), sp = spans();
            const set = (s, on) => { const b = box.querySelector(s); if (b) b.disabled = !on; };
            set('[data-rt-merge]', g && (g.r1 > g.r0 || g.c1 > g.c0)); set('[data-rt-unmerge]', g && sp.some(x => x.r >= g.r0 && x.r <= g.r1 && x.c >= g.c0 && x.c <= g.c1));
            set('[data-rt-delrow]', !!g); set('[data-rt-delcol]', !!g);
        }
        function merge() {
            const g = range(); if (!g) return;
            // une fusion qui déborde de la sélection l'agrandit
            let grew = true;
            while (grew) { grew = false; for (const x of spans()) { const hit = !(x.r1 < g.r0 || x.r > g.r1 || x.c1 < g.c0 || x.c > g.c1); if (hit && (x.r < g.r0 || x.r1 > g.r1 || x.c < g.c0 || x.c1 > g.c1)) { g.r0 = Math.min(g.r0, x.r); g.r1 = Math.max(g.r1, x.r1); g.c0 = Math.min(g.c0, x.c); g.c1 = Math.max(g.c1, x.c1); grew = true; } } }
            const texts = [];
            for (let r = g.r0; r <= g.r1; r++) for (let c = g.c0; c <= g.c1; c++) { const v = String(t.rows[r].c[t.cols[c].id] || '').trim(); if (v) texts.push(v); if (r !== g.r0 || c !== g.c0) delete t.rows[r].c[t.cols[c].id]; }
            t.rows[g.r0].c[t.cols[g.c0].id] = texts.join(' ');
            const inside = new Set(spans().filter(x => x.r >= g.r0 && x.r1 <= g.r1 && x.c >= g.c0 && x.c1 <= g.c1).map(x => x.m));
            t.merges = t.merges.filter(m => !inside.has(m));
            t.merges.push({r: t.rows[g.r0].id, c: t.cols[g.c0].id, rs: g.r1 - g.r0 + 1, cs: g.c1 - g.c0 + 1});
            sel = {r0: g.r0, c0: g.c0, r1: g.r0, c1: g.c0}; changed(); paint();
        }
        function pasteGrid(r0, c0, txt) {
            const lines = txt.replace(/\r/g, '').replace(/\n$/, '').split('\n').map(l => l.split('\t'));
            while (t.rows.length < r0 + lines.length) t.rows.push({id: uid('r'), c: {}});
            const w = Math.max(...lines.map(l => l.length));
            while (t.cols.length < c0 + w) t.cols.push({id: uid('c'), name: ''});
            lines.forEach((l, i) => l.forEach((v, j) => { t.rows[r0 + i].c[t.cols[c0 + j].id] = v.trim(); }));
            sel = {r0, c0, r1: r0 + lines.length - 1, c1: c0 + w - 1}; changed(); paint();
            A().toast?.(`${A().plural(lines.length, 'ligne collée', 'lignes collées')}.`);
        }
        function csv() {
            const SH = window.LCNDA_SHEET;
            if (SH?.toCSV) { const blob = new Blob([SH.toCSV([t.cols.map(c => c.name || ''), ...t.rows.map(r => t.cols.map(c => String(r.c[c.id] || '')))], {sep: ';'})], {type: 'text/csv;charset=utf-8'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'tableau.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); return; } // le CSV commun (protégé contre les formules glissées)
            const cell = v0 => { const v = (A().csvSafe || (x => String(x ?? '')))(v0); return /[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }; // pas de formule glissée dans un tableur
            const out = [t.cols.map(c => cell(c.name || '')).join(';'), ...t.rows.map(r => t.cols.map(c => cell(String(r.c[c.id] || ''))).join(';'))].join('\r\n');
            const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + out], {type: 'text/csv;charset=utf-8'})); a.download = 'tableau.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        }
        /** Glisser une colonne (par son titre) ou une ligne (par son numéro) quand l'ordre est libre. */
        function dragging() {
            let drag = null;
            const move = (list, from, to) => { const [x] = list.splice(from, 1); list.splice(to, 0, x); };
            box.querySelectorAll('th[data-rt-col]').forEach(th => {
                const grip = th.querySelector('.h-rt-grip');
                grip?.addEventListener('dragstart', e => { drag = {kind: 'col', i: Number(th.dataset.rtCol)}; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'col'); th.classList.add('is-dragging'); });
                grip?.addEventListener('dragend', () => th.classList.remove('is-dragging'));
                th.addEventListener('dragover', e => { if (drag?.kind === 'col') { e.preventDefault(); th.classList.add('is-drop'); } });
                th.addEventListener('dragleave', () => th.classList.remove('is-drop'));
                th.addEventListener('drop', e => { e.preventDefault(); th.classList.remove('is-drop'); if (drag?.kind !== 'col') return; const to = Number(th.dataset.rtCol); if (to !== drag.i) { mergesMove("c", drag.i, to); move(t.cols, drag.i, to); sel = null; changed(); paint(); } drag = null; });
            });
            box.querySelectorAll('tr[data-rt-row]').forEach(tr => {
                const head = tr.querySelector('.h-rt-num');
                head.addEventListener('dragstart', e => { drag = {kind: 'row', i: Number(tr.dataset.rtRow)}; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'row'); tr.classList.add('is-dragging'); });
                head.addEventListener('dragend', () => tr.classList.remove('is-dragging'));
                tr.addEventListener('dragover', e => { if (drag?.kind === 'row') { e.preventDefault(); tr.classList.add('is-drop'); } });
                tr.addEventListener('dragleave', () => tr.classList.remove('is-drop'));
                tr.addEventListener('drop', e => { e.preventDefault(); tr.classList.remove('is-drop'); if (drag?.kind !== 'row') return; const to = Number(tr.dataset.rtRow); if (to !== drag.i) { mergesMove("r", drag.i, to); move(t.rows, drag.i, to); sel = null; changed(); paint(); } drag = null; });
            });
        }
        // E4 : un fichier de tableur (.csv, .tsv, .txt) glissé sur le tableau remplit les cellules, comme un collage
        const parseCsv = text => {
            const SH = window.LCNDA_SHEET; // le lecteur commun (app-tableur-engine.js)
            if (SH?.parseCSV) { const t0 = String(text || '').replace(/^\ufeff/, ''); return SH.parseCSV(t0, {sep: SH.sniffSep(t0.slice(0, 20000))}).filter(r => r.some(v => String(v).trim())).map(r => r.map(v => String(v).replace(/[\t\n\r]/g, ' ')).join('\t')).join('\n'); }
            text = text.replace(/^\ufeff/, '').replace(/\r\n?/g, '\n');
            const first = text.split('\n')[0], sep = ['\t', ';', ','].map(c => [c, first.split(c).length]).sort((a, b) => b[1] - a[1])[0][0];
            const rows = [[]]; let cur = '', q = false;
            for (let i = 0; i < text.length; i++) {
                const ch = text[i];
                if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
                else if (ch === '"' && !cur) q = true;
                else if (ch === sep) { rows[rows.length - 1].push(cur); cur = ''; }
                else if (ch === '\n') { rows[rows.length - 1].push(cur); cur = ''; rows.push([]); }
                else cur += ch;
            }
            rows[rows.length - 1].push(cur);
            return rows.filter(r => r.some(v => v.trim())).map(r => r.map(v => v.replace(/[\t\n]/g, ' ')).join('\t')).join('\n');
        };
        box._rtOnFiles = async files => {
            const f = files[0]; let txt = '';
            try { const SH = window.LCNDA_SHEET; txt = parseCsv(SH?.decodeBytes ? SH.decodeBytes(await f.arrayBuffer()).text : await f.text()); } catch (_) {} // accents des vieux fichiers Excel
            if (!txt) { A().toast?.('Ce fichier ne contient pas de tableau lisible.', 'error'); return; }
            // tableau encore vide : la première ligne du fichier donne les titres des colonnes
            if (!ext.recueilTableHasText(t) && txt.includes('\n')) {
                const [head, ...rest] = txt.split('\n'), names = head.split('\t');
                while (t.cols.length < names.length) t.cols.push({id: uid('c'), name: ''});
                names.forEach((n, j) => { if (n.trim()) t.cols[j].name = n.trim().slice(0, 80); });
                return pasteGrid(0, 0, rest.join('\n'));
            }
            const g = range(), lastFilled = t.rows.reduce((n, r, i) => Object.values(r.c || {}).some(v => String(v).trim()) ? i + 1 : n, 0);
            pasteGrid(g ? g.r0 : lastFilled, g ? g.c0 : 0, txt);
        };
        if (window.LCNDA_UI?.bindFileDrop && !box._uiDrop) window.LCNDA_UI.bindFileDrop(box, files => box._rtOnFiles?.(files), {accept: '.csv,.tsv,.txt,text/csv,text/plain,text/tab-separated-values'});
        paint();
        return {repaint: () => paint()};
    };

    /* ─── Choisir une fiche (dépouillements, tableau d'un recueil…) : le menu de choix unique (docs/PICKER.md) ─── */
    /** HTML du sélecteur ; createLabel : proposer « créer la fiche » (texte affiché sous le bouton). */
    ext.personPickerHtml = ({guess = '', createLabel = ''} = {}) => `<div class="h-pick" data-pick-guess="${esc(guess)}" style="min-height:340px">
        ${window.LCNDA_PICKER.pickerField({name: 'h_pick_person', kind: 'person', allowCreate: false})}
        ${createLabel ? `<button type="button" class="h-pick-create" data-pick-create aria-pressed="false"><span class="h-pick-plus">＋</span><span><b>Pas encore de fiche ?</b><small>${createLabel}</small></span></button>` : ''}</div>`;
    /** Branche le sélecteur dans la fenêtre : rend {selected() → {key, label}|null, create() → bool}. */
    ext.bindPersonPicker = dl => {
        const box = dl.querySelector('.h-pick'), cr = dl.querySelector('[data-pick-create]');
        let chosen = null, create = false;
        const setCreate = on => { create = on; if (cr) { cr.setAttribute('aria-pressed', String(on)); cr.classList.toggle('is-on', on); } };
        box.addEventListener('picker-change', e => { const it = e.detail.item; chosen = it?.id ? {key: String(it.id), label: it.title} : null; if (chosen) setCreate(false); });
        cr?.addEventListener('click', () => setCreate(!create));
        // le nom relevé est tapé d'avance : la liste des fiches proches s'ouvre tout de suite
        setTimeout(() => { const q = box.querySelector('.pk-input'); if (!q) return; q.focus(); const g = box.dataset.pickGuess || ''; if (g) { q.value = g; q.dispatchEvent(new Event('input', {bubbles: true})); q.select(); } }, 80);
        return {selected: () => create ? null : chosen, create: () => create};
    };
})();
