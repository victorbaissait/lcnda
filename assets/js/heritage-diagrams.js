/* LCNDA — 📊 Mes diagrammes : l'éditeur, la page dans Graphiques, et les diagrammes posés partout
 * (widget, fiche, fiche d'une personne, enquête, Atelier, mise en page). Dessin : heritage-diagrams-render.js.
 * Serveur : lib/diagrams.php.
 *  - ext.diagramEmbedHtml(id) : une case qui se remplit seule avec le diagramme (et se met à jour après modification) ;
 *  - ext.pickDiagram() : choisir un diagramme (ou en créer un) → son numéro ;
 *  - ext.openDiagramEditor(id | null, {link}) : l'éditeur ;
 *  - ext.diagramSvg(id) : le dessin (SVG), pour la mise en page.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const R = () => ext.diagramRender;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const api = (...a) => A().api(...a);
    const toast = (...a) => A().toast(...a);
    const S = () => A().state;
    const post = (action, body) => api(action, {}, {method: 'POST', body});
    const clone = v => JSON.parse(JSON.stringify(v ?? null));
    const LINK_IC = {person: '👤', investigation: '🔎', investigation_item: '🧩', atelier_project: '📚'};
    // les autres types qui prennent aussi « 📊 Des chiffres de l’app » (une ou plusieurs séries par catégorie)
    const STAT_KINDS = ['parliament', 'wordcloud', 'pictogram', 'gauge', 'bump', 'stream', 'smallmult', 'marimekko', 'dumbbell', 'slope'];
    const TABLE_KINDS = ['columns', 'bars', 'stacked', 'stacked100', 'line', 'area', 'pie', 'donut', 'halfdonut', 'waffle', 'treemap', 'funnel', 'radar', 'pyramid', 'heatmap'];

    /* ─── Les diagrammes enregistrés ─── */
    let cache = null, loading = null;
    async function list(force = false) {
        if (cache && !force) return cache;
        if (!loading || force) loading = api('diagrams').then(r => { cache = r.diagrams || []; return cache; }).finally(() => { loading = null; });
        return loading;
    }
    const byId = id => (cache || []).find(d => d.id === Number(id));
    async function get(id) { await list(); return byId(id) || (await list(true), byId(id)); }
    const specOf = d => ({...clone(d.spec || {}), kind: d.kind});

    /** chiffres « tenus à jour » : relus dans l'app à chaque affichage (une minute de mémoire) */
    const liveMem = new Map();
    async function resolveLive(spec) {
        if (spec?.live?.sheet && ext.sheetLink) { try { return await ext.sheetLink.resolve(spec); } catch (_) { return spec; } } // 🔗 une plage d'un classeur du Tableur (heritage-tableur-cibles.js)
        const kr = R().KINDS[spec?.kind]?.resolve; if (kr) { try { return await kr(spec); } catch (_) { return spec; } } // kind.resolve(spec) → Promise<spec> : une sorte qui prépare son dessin (fond de carte à charger, chiffres relus…) — heritage-diagram-cartes.js
        if (spec.live?.follow) return resolveFollow(spec);
        const DGO = ext.diagramAppOpts;
        // 🧮 « Compter dans ma base » (heritage-diagram-options.js) : recompté à chaque affichage, avec ses options
        if (spec.live?.q && DGO) { try { return DGO.toSpec(spec, await DGO.count(spec.live.q), spec.live.label); } catch (_) { return spec; } }
        // 🌳 « Des données de mon arbre » d'un type (kind.app), avec le groupe et la période choisis
        const kApp = R().KINDS[spec.kind]?.app;
        if (spec.live?.tree && kApp?.fill) {
            const key = 'tree:' + spec.kind + ':' + spec.live.tree + ':' + JSON.stringify(spec.live.dg || {});
            let hit = liveMem.get(key);
            if (!hit || Date.now() - hit.t > 60000) { hit = {t: Date.now(), rows: kApp.fill({...clone(spec), __dg: spec.live.dg || {}}, spec.live.tree)}; liveMem.set(key, hit); }
            try { const s = clone(await hit.rows); delete s.__dg; s.live = spec.live; s.o = {...(s.o || {}), ...(spec.o || {})}; return s; } catch (_) { liveMem.delete(key); return spec; }
        }
        if (!spec.live?.key || !ext.diagramStatRows) return spec;
        let hit = liveMem.get(spec.live.key);
        if (!hit || Date.now() - hit.t > 60000) { hit = {t: Date.now(), rows: ext.diagramStatRows(spec.live.key)}; liveMem.set(spec.live.key, hit); }
        try { const pairs = await hit.rows; return fillFrom(spec, spec.live.post && DGO ? DGO.post(pairs, spec.live.post) : pairs, spec.live.label); } catch (e) { liveMem.delete(spec.live.key); return spec; } // post : tri, N premiers, « Autres », « Inconnu », % (options de « Depuis l'app »)
    }
    /** des paires [valeur, nombre] → les lignes du diagramme, selon son type */
    function fillFrom(spec, pairs, label = '') {
        const s = clone(spec), keep = (s.rows || []).reduce((m, r) => { const k = r.label ?? r.name ?? r.word; if (k !== undefined && r.color) m[k] = r.color; return m; }, {});
        if (s.kind === 'parliament') s.rows = pairs.map(([v, n]) => ({name: v, seats: n, color: keep[v] || ''}));
        else if (s.kind === 'wordcloud') s.rows = pairs.map(([v, n]) => ({word: v, weight: n, color: keep[v] || ''}));
        else if (['pictogram', 'gauge'].includes(s.kind)) s.rows = pairs.map(([v, n]) => ({label: v, value: n, color: keep[v] || '', icon: (s.rows || []).find(r => r.label === v)?.icon || ''}));
        else { s.rows = pairs.map(([v, n]) => ({label: v, s0: n, color: keep[v] || ''})); s.series = [{...(s.series?.[0] || {}), name: s.series?.[0]?.name || label || 'Nombre'}]; }
        return s;
    }
    ext.diagramFillFrom = (spec, pairs, label) => fillFrom(spec, pairs, label);
    /** 📈 un de mes graphiques (Éditeur de graphiques) posé comme un diagramme : son dessin, ses couleurs et ses chiffres suivent le graphique */
    const followId = spec => (spec?.live?.follow && /^my:cw_[a-z0-9]{4,24}$/.test(String(spec.live.key || '')) ? String(spec.live.key).slice(3) : '');
    async function resolveFollow(spec) {
        const id = followId(spec), key = 'follow:' + spec.live.key; // à part des chiffres « tenus à jour » d'une statistique (même clé my:…)
        let hit = liveMem.get(key), r = null;
        if (!hit || Date.now() - hit.t > 60000) { hit = {t: Date.now(), rows: id && ext.statDiagramSpec ? ext.statDiagramSpec(id) : Promise.resolve(null)}; liveMem.set(key, hit); }
        try { r = await hit.rows; } catch (_) { liveMem.delete(key); }
        if (r?.spec && R().KINDS[r.spec.kind]) return {...r.spec, live: spec.live};
        return {kind: '_missing', live: spec.live, o: {title: r?.name || spec.o?.title || 'Mon graphique'}, msg: r ? (String(r.html || '').replace(/<[^>]*>/g, '').trim() || 'Rien à dessiner pour l’instant.') : 'Graphique introuvable : supprimé, ou fait dans un autre navigateur.'};
    }
    /** le dessin d'un diagramme, ou un petit cadre quand le graphique suivi n'est plus là */
    const drawSpec = s => s.kind === '_missing' ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 150" width="640" height="150" role="img" aria-label="${esc(s.o?.title || '')}"><rect x="1" y="1" width="638" height="148" rx="12" fill="#f4f5f7" stroke="#cfd4db"/><text x="320" y="66" text-anchor="middle" font-family="system-ui, sans-serif" font-size="21" font-weight="700" fill="#333">📈 ${esc(String(s.o?.title || '').slice(0, 60))}</text><text x="320" y="102" text-anchor="middle" font-family="system-ui, sans-serif" font-size="15" fill="#666">${esc(String(s.msg || '').slice(0, 90))}</text></svg>` : R().svg(s);
    const svgOf = async d => drawSpec(await resolveLive(specOf(d)));
    ext.diagramFollowId = d => followId(d?.spec || d);

    /* ─── Les cases qui se remplissent seules : <div data-dg-embed="12"> ─── */
    ext.diagramEmbedHtml = (id, {tools = true} = {}) => `<div class="h-dg-embed" data-dg-embed="${Number(id) || 0}"${tools ? '' : ' data-dg-notools'}><p class="muted">Diagramme…</p></div>`;
    async function fillEmbed(box) {
        box.dataset.dgDone = '1';
        const d = await get(box.dataset.dgEmbed).catch(() => null);
        if (!d) { box.innerHTML = '<p class="muted">Diagramme introuvable (supprimé ?).</p>'; return; }
        box.innerHTML = `<div class="h-dg-svg">${await svgOf(d)}</div>${box.hasAttribute('data-dg-notools') ? '' : `<div class="h-dg-embedtools"><button type="button" class="link-button" data-dg-open="${d.id}" title="L’ouvrir en grand dans Graphiques">↗ Ouvrir</button><button type="button" class="link-button" data-dg-edit="${d.id}">✎ Modifier</button></div>`}`;
    }
    const fillAll = () => document.querySelectorAll('[data-dg-embed]:not([data-dg-done])').forEach(b => fillEmbed(b).catch(() => {}));
    function refreshEmbeds(id) { document.querySelectorAll(`[data-dg-embed="${Number(id)}"]`).forEach(b => { delete b.dataset.dgDone; }); fillAll(); }
    let fillT = 0;
    new MutationObserver(() => { if (!document.querySelector('[data-dg-embed]:not([data-dg-done]), [data-dg-host]:not([data-dg-filled]), [data-rc-host][data-rc-type="investigation"], [data-rc-host][data-rc-type="atelier_project"]')) return; clearTimeout(fillT); fillT = setTimeout(() => { fillAll(); fillHosts(); }, 60); }).observe(document.documentElement, {childList: true, subtree: true});
    document.addEventListener('click', e => {
        const op = e.target.closest?.('[data-dg-open]'); if (op) { e.preventDefault(); openInGraphs(Number(op.dataset.dgOpen)); return; }
        const ed = e.target.closest?.('[data-dg-edit]'); if (ed) { e.preventDefault(); openEditor(Number(ed.dataset.dgEdit)); }
    });
    function openInGraphs(id) { document.querySelectorAll('dialog[open]').forEach(d => { if (!d.closest('.h-dg-dlg')) try { d.close(); } catch (_) {} }); const st = S(); st.graphMode = 'diagram'; st.graphDiagramId = id; st.graphTab = 'types'; A().setModule('graphiques'); }
    ext.diagramSvg = async id => { const d = await get(id); return d ? svgOf(d) : ''; };
    ext.openDiagram = openInGraphs;

    /* ─── Images : PNG, JPG, SVG ─── */
    function svgToCanvas(svg, scale = 2, bg = '') {
        return new Promise((ok, ko) => {
            const m = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/), w = Number(m?.[1]) || 900, h = Number(m?.[2]) || 600;
            const img = new Image(), url = URL.createObjectURL(new Blob([svg], {type: 'image/svg+xml'}));
            img.onload = () => { const c = document.createElement('canvas'); c.width = Math.round(w * scale); c.height = Math.round(h * scale); const g = c.getContext('2d'); if (bg) { g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); } g.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); ok(c); };
            img.onerror = () => { URL.revokeObjectURL(url); ko(new Error('Image impossible.')); };
            img.src = url;
        });
    }
    const fileName = name => (A().safeExportFilename ? A().safeExportFilename(name || 'diagramme', 'diagramme') : 'diagramme');
    function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
    const csvCell = v => { let t = String(v ?? ''); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    function specCsv(spec) {
        const kind = R().KINDS[spec.kind]; if (!kind) return '';
        return kind.grids.map(g => { const cols = gridCols(g, spec); return [g.label, cols.map(c => c.label).join(';'), ...(spec[g.key] || []).map(r => cols.map(c => csvCell(r[c.k])).join(';'))].join('\n'); }).join('\n\n');
    }
    async function exportAs(fmt, name, spec, o = {}) {
        const svg = drawSpec(await resolveLive(spec));
        if (fmt === 'svg') return download(new Blob([svg], {type: 'image/svg+xml'}), o.filename || fileName(name) + '.svg');
        if (fmt === 'csv') return download(new Blob(['﻿' + specCsv(spec.live?.follow ? await resolveLive(spec) : spec)], {type: 'text/csv;charset=utf-8'}), o.filename || fileName(name) + '.csv');
        if (fmt === 'json') return download(new Blob([JSON.stringify({lcnda_diagram: 1, name, kind: spec.kind, spec}, null, 1)], {type: 'application/json'}), o.filename || fileName(name) + '.diagramme.json');
        if (fmt === 'print') { const w = window.open('', '_blank'); if (!w) throw new Error('fenêtre bloquée par le navigateur'); w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(name)}</title><style>body{margin:0}svg{width:100%;height:auto}</style>${svg}<script>onload=()=>setTimeout(()=>print(),200)<\/script>`); w.document.close(); return; }
        const c = await svgToCanvas(svg, Math.max(0.5, Math.min(6, (Number(o.quality) || 192) / 96)), fmt === 'jpg' ? '#ffffff' : '');
        if (fmt === 'copy') { try { const b = await new Promise(r => c.toBlob(r, 'image/png')); await navigator.clipboard.write([new ClipboardItem({'image/png': b})]); toast('Image copiée : colle-la où tu veux (⌘V).'); } catch (_) { toast('Copie impossible ici : utilise « Image PNG ».', 'error'); } return; }
        const blob = await new Promise(r => c.toBlob(r, fmt === 'jpg' ? 'image/jpeg' : 'image/png', .92)); if (!blob) throw new Error('image trop grande : baisse la qualité');
        const fname = o.filename || fileName(name) + (fmt === 'jpg' ? '.jpg' : '.png'); download(blob, fname);
        if (o.saveCopy && A().importMediaFile) { try { await A().importMediaFile(new File([blob], fname, {type: blob.type}), ['image']); toast('Une copie est rangée dans les médias.'); } catch (e) { toast('Copie dans les médias impossible : ' + e.message, 'error'); } }
    }
    // E3 : la fenêtre d'export commune (PNG, JPG, SVG, Imprimer / PDF, CSV, fichier du diagramme, copier l'image)
    function exportDialog(name, getSpec) {
        const UI = window.LCNDA_UI; if (!UI?.openExportDialog) return exportAs('png', name, getSpec()).catch(e => toast(e.message, 'error'));
        const run = fmt => o => exportAs(fmt, name, getSpec(), o);
        UI.openExportDialog({title: name || 'Diagramme', defaultName: fileName(name), quality: 192, saveCopy: !!A().importMediaFile,
            preview: async () => { const box = document.createElement('div'); box.className = 'h-dg-svg'; box.innerHTML = drawSpec(await resolveLive(getSpec())); return box; },
            formats: [{id: 'png', run: run('png')}, {id: 'jpg', run: run('jpg')}, {id: 'svg', hint: 'net à toutes les tailles', run: run('svg')},
                {id: 'pdf', hint: 'par l’impression : « Enregistrer en PDF »', ext: '', quality: false, run: run('print')}, {id: 'print', quality: false, run: run('print')},
                {id: 'csv', label: '📄 CSV', hint: 'les chiffres, pour un tableur', ext: 'csv', quality: false, run: run('csv')},
                ...(ext.openSheetEditor ? [{id: 'sheet', label: '🧮 Tableur', hint: 'ouvrir les chiffres dans le tableur', ext: '', quality: false, copy: false, goLabel: '🧮 Ouvrir dans le tableur', run: async () => { const sp = await resolveLive(getSpec()); setTimeout(() => ext.openRowsInSheet ? (() => { const t = ext.sheetTargets?.diagram?.fromData(sp); const sh = t?.sheets?.[0]; if (sh) ext.openRowsInSheet({name: name || 'Diagramme', rows: [sh.header, ...sh.rows]}); })() : null, 30); }}] : []),
                {id: 'file', label: '💾 Fichier', hint: 'du diagramme, à réimporter', ext: 'diagramme.json', run: run('json')},
                {id: 'copy', label: '📋 Copier l’image', hint: 'à coller ailleurs (⌘V)', ext: '', run: run('copy')}]});
    }

    /* ─── Tableaux de données ─── */
    function gridCols(g, spec) {
        let cols = g.cols.filter(c => !c.when || c.when(spec));
        if (g.series) {
            const n = g.series === true ? Math.max(1, (spec.series || []).length) : g.series;
            const ser = Array.from({length: n}, (_, j) => ({k: 's' + j, label: spec.series?.[j]?.name || `Série ${j + 1}`, type: 'number', series: j}));
            cols = [cols[0], ...ser, ...cols.slice(1)];
        }
        return cols;
    }
    const GRID_SHOWN = 400; // C6 : 400 lignes d'abord, puis « Voir les N suivants ↓ » / « Tout voir » (ajoutées par morceaux : la fenêtre ne gèle pas)
    function ensureFixed(g, spec) { if (!g.fixed) return; const have = spec[g.key] || []; spec[g.key] = (typeof g.fixed === 'function' ? g.fixed(spec) : g.fixed).map(f => ({...(have.find(r => r.region === f) || {}), region: f})); }
    /** les lignes [from, to[ d'un tableau (HTML), pour la grille et pour « Voir les suivants » */
    function gridRowsHtml(g, gi, spec, from, to) {
        const cols = gridCols(g, spec), rows = spec[g.key] || [], pal = R().PALETTES[spec.o?.palette] || R().PALETTES.vive;
        const cell = (c, r, ri) => {
            const v = r[c.k] ?? '', at = `data-g="${gi}" data-r="${ri}" data-k="${esc(c.k)}"`;
            if (c.type === 'readonly') return `<td class="h-dg-ro">${esc(v)}</td>`;
            if (c.type === 'color') return `<td class="h-dg-colcell"><input type="color" ${at} value="${esc(R().color(v, pal[ri % pal.length]).startsWith('#') && /^#[0-9a-f]{6}$/i.test(R().color(v, '')) ? v : pal[ri % pal.length])}" title="${v ? 'Couleur choisie' : 'Couleur automatique'}" class="${v ? '' : 'is-auto'}">${v ? `<button type="button" class="h-dg-x" data-dg-autocolor ${at} title="Revenir à la couleur automatique">↺</button>` : ''}</td>`;
            if (c.type === 'select') return `<td><select ${at}>${c.choices.map(([k, l]) => `<option value="${esc(k)}" ${String(v) === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></td>`;
            return `<td><input ${at} value="${esc(v)}" ${c.type === 'number' ? 'inputmode="decimal" class="is-num"' : ''} placeholder="${esc(c.ph || '')}"></td>`;
        };
        return rows.slice(from, to).map((r, k) => { const ri = from + k; return `<tr>${cols.map(c => cell(c, r, ri)).join('')}<td class="h-dg-rowtools">${g.fixed ? '' : `<button type="button" data-dg-row="up" data-g="${gi}" data-r="${ri}" title="Monter">↑</button><button type="button" data-dg-row="down" data-g="${gi}" data-r="${ri}" title="Descendre">↓</button><button type="button" data-dg-row="dup" data-g="${gi}" data-r="${ri}" title="Dupliquer">⧉</button><button type="button" data-dg-row="del" data-g="${gi}" data-r="${ri}" title="Supprimer">✕</button>`}</td></tr>`; }).join('');
    }
    const moreHtml = (gi, shown, total) => (total > shown ? `<div class="h-dg-more" data-dg-morebar="${gi}"><span class="muted">${shown.toLocaleString('fr-FR')} lignes sur ${total.toLocaleString('fr-FR')} (toutes comptent dans le dessin)</span><button type="button" class="button small secondary" data-dg-more="${gi}">Voir les ${Math.min(GRID_SHOWN, total - shown).toLocaleString('fr-FR')} suivantes ↓</button><button type="button" class="link-button" data-dg-moreall="${gi}">Tout voir</button>${ext.openSheetEditor ? '<button type="button" class="link-button" data-dg-sheet>🧮 Tout voir dans le tableur</button>' : ''}</div>` : '');
    function gridHtml(g, gi, spec, shown = GRID_SHOWN) {
        ensureFixed(g, spec);
        const cols = gridCols(g, spec), rows = spec[g.key] = Array.isArray(spec[g.key]) ? spec[g.key] : [];
        const pal = R().PALETTES[spec.o?.palette] || R().PALETTES.vive;
        shown = Math.max(GRID_SHOWN, Math.min(rows.length, shown));
        const head = cols.map(c => c.series !== undefined && g.series === true ? `<th><span class="h-dg-sername"><input data-dg-sername="${c.series}" value="${esc(spec.series?.[c.series]?.name || '')}" placeholder="${esc(c.label)}"><input type="color" data-dg-sercolor="${c.series}" value="${esc(/^#[0-9a-f]{6}$/i.test(spec.series?.[c.series]?.color || '') ? spec.series[c.series].color : pal[c.series % pal.length])}" title="Couleur de la série">${(spec.series || []).length > 1 ? `<button type="button" class="h-dg-x" data-dg-delser="${c.series}" title="Supprimer cette série">✕</button>` : ''}</span></th>`
            : c.series !== undefined ? `<th><span class="h-dg-sername"><input data-dg-sername="${c.series}" value="${esc(spec.series?.[c.series]?.name || '')}" placeholder="${esc(c.label)}"><input type="color" data-dg-sercolor="${c.series}" value="${esc(/^#[0-9a-f]{6}$/i.test(spec.series?.[c.series]?.color || '') ? spec.series[c.series].color : pal[c.series % pal.length])}" title="Couleur"></span></th>` : `<th>${esc(c.label)}</th>`).join('');
        const canAdd = !g.fixed && !(g.max && rows.length >= g.max);
        return `<section class="h-dg-grid" data-grid="${gi}"><h4>${esc(g.label)}</h4>${rows.length > 1 && !g.fixed ? `<div data-dg-sortbar="${gi}" data-count="${rows.length}"></div>` : `<small class="muted">(${rows.length})</small>`}
            <div class="h-dg-tablewrap"><table><thead><tr>${head}<th></th></tr></thead><tbody data-dg-body="${gi}">${gridRowsHtml(g, gi, spec, 0, shown)}</tbody></table></div>${moreHtml(gi, shown, rows.length)}
            <div class="h-dg-gridtools">${canAdd ? `<button type="button" class="button small" data-dg-add="${gi}">＋ Ligne</button>` : ''}${g.series === true ? `<button type="button" class="button small secondary" data-dg-addser="${gi}">＋ Série (colonne de chiffres)</button>` : ''}${g.fixed ? '' : `<button type="button" class="button small secondary" data-dg-paste="${gi}" title="Copier des cellules dans Excel, LibreOffice, Numbers… et les coller ici">📋 Coller un tableau</button><label class="button small secondary h-dg-file">⤒ Importer un CSV<input type="file" accept=".csv,.tsv,.txt,text/csv" data-dg-csv="${gi}" hidden></label>${ext.chooseSheetRange ? `<button type="button" class="button small secondary" data-dg-book="${gi}" title="Un classeur déjà fait dans le Tableur : une feuille, une plage, copiée une fois ou liée">🧮 Prendre un classeur du Tableur</button>` : ''}`}${rows.length && !g.fixed ? `<button type="button" class="link-button" data-dg-clear="${gi}">Vider</button>` : ''}</div></section>`;
    }
    /** texte d'un tableur (tabulations) ou CSV (; ou ,) → lignes de cellules */
    function parseTable(text) {
        const SH = window.LCNDA_SHEET; // le lecteur commun (app-tableur-engine.js) : guillemets, retours dans une case, séparateur deviné
        if (SH?.parseCSV) { const t0 = String(text || '').replace(/^\ufeff/, '').replace(/\n+$/, ''); try { return SH.parseCSV(t0, {sep: t0.includes('\t') ? '\t' : SH.sniffSep(t0.slice(0, 20000)), maxRows: 5000}).map(r => r.map(c => String(c).trim())); } catch (_) { /* trop de cellules : l'ancienne lecture, bornée */ } }
        const t = String(text || '').replace(/\r\n?/g, '\n').replace(/\n+$/, '');
        const sep = t.includes('\t') ? '\t' : (t.split('\n')[0].split(';').length >= t.split('\n')[0].split(',').length ? ';' : ',');
        const out = []; let row = [], cur = '', q = false;
        for (let i = 0; i < t.length && out.length < 5000; i++) {
            const ch = t[i];
            if (q) { if (ch === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; continue; }
            if (ch === '"' && cur === '') { q = true; continue; }
            if (ch === sep) { row.push(cur); cur = ''; continue; }
            if (ch === '\n') { row.push(cur); out.push(row); row = []; cur = ''; continue; }
            cur += ch;
        }
        row.push(cur); out.push(row);
        return out.map(r => r.map(c => c.trim()));
    }
    /** colle des cellules dans un tableau, à partir de la ligne r et de la colonne c (sinon : tout le tableau, première ligne = titres si ce sont des mots) */
    function pasteInto(g, spec, cells, r0 = null, c0 = 0) {
        let cols = gridCols(g, spec).filter(c => c.type !== 'readonly');
        if (r0 === null) {
            const first = cells[0] || [], isNum = v => /^-?[\d\s\u00a0.,]+%?$/.test(String(v).trim());
            const body = cells.slice(1).filter(r => r.some(Boolean));
            // titres : la première ligne a des mots là où les lignes suivantes ont des chiffres
            const isHead = body.length > 0 && first.some((v, j) => j > 0 && v !== '' && !isNum(v) && body.some(r => r[j] !== undefined && r[j] !== '' && isNum(r[j])));
            if (g.series === true) { // autant de séries que de colonnes de chiffres qui suivent la première
                const data = isHead ? body : cells; let n = 0;
                for (let j = 1; j < Math.max(...data.map(r => r.length), 1); j++) { const vals = data.map(r => r[j]).filter(v => v !== undefined && v !== ''); if (vals.length && vals.every(isNum)) n++; else break; }
                n = Math.max(1, n);
                spec.series = Array.from({length: n}, (_, j) => ({...(spec.series?.[j] || {}), name: isHead ? first[1 + j] || `Série ${j + 1}` : spec.series?.[j]?.name || `Série ${j + 1}`}));
                cols = gridCols(g, spec).filter(c => c.type !== 'readonly');
            }
            if (isHead) cells = cells.slice(1);
            spec[g.key] = []; r0 = 0;
        }
        const rows = spec[g.key];
        cells.forEach((line, i) => { if (g.max && r0 + i >= g.max) return; const row = rows[r0 + i] || (rows[r0 + i] = {}); line.forEach((v, j) => { const c = cols[c0 + j]; if (c) row[c.k] = c.type === 'select' ? (c.choices.find(([k, l]) => k === v || l.toLowerCase() === v.toLowerCase())?.[0] ?? '') : v; }); });
    }

    /* ─── Réglages ─── */
    function optHtml(o, spec) {
        if (o.when && !o.when(spec)) return '';
        const v = spec.o?.[o.k], at = `data-opt="${esc(o.k)}"`;
        if (o.type === 'check') return `<label class="ui-toggle"><input type="checkbox" ${at} ${(v ?? o.def) ? 'checked' : ''}><i></i>${esc(o.label)}</label>`;
        if (o.type === 'select') return `<label>${esc(o.label)}<select ${at}>${o.choices.map(([k, l]) => `<option value="${esc(k)}" ${String(v ?? o.def ?? '') === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
        const un = o.unit != null ? ` data-unit="${esc(o.unit)}"` : ''; // K17 : l'unité dans la case, pas dans le libellé
        if (o.type === 'range') return `<label>${esc(o.label)} <output>${esc(v ?? o.def ?? '')}</output><input type="range" ${at} min="${o.min}" max="${o.max}" step="${o.step || 1}" value="${esc(v ?? o.def ?? o.min)}"${un}></label>`;
        if (o.type === 'color') return `<label class="h-dg-colopt">${esc(o.label)}<input type="color" ${at} value="${esc(/^#[0-9a-f]{6}$/i.test(v || '') ? v : o.def || '#000000')}"></label>`;
        return `<label>${esc(o.label)}<input ${at} value="${esc(v ?? '')}" ${o.type === 'number' ? 'inputmode="decimal"' : ''}${un} placeholder="${esc(o.def ?? '')}"></label>`;
    }

    /* ─── Choisir un type (galerie avec aperçus) ─── */
    let tplCache = null;
    const TEMPLATES = () => { if (tplCache) return tplCache; tplCache = buildTemplates(); return tplCache; };
    const buildTemplates = () => {
        const K = R().KINDS, out = [];
        for (const [k, kind] of Object.entries(K)) {
            out.push({kind: k, icon: kind.icon, label: kind.label, group: kind.group});
            if (k === 'parliament') [['arc', '🌈', 'Arc élargi (Assemblée en éventail)'], ['horseshoe', '🧲', 'Fer à cheval'], ['westminster', '🇬🇧', 'Westminster (bancs face à face)'], ['circle', '⭕', 'Cercle complet (conseil)'], ['classroom', '🏫', 'Salle face à la tribune (conseil municipal…)']]
                .forEach(([layout, icon, label]) => out.push({kind: k, icon, label, group: kind.group, o: {layout}}));
            if (k === 'timeline') { out.push({kind: k, icon: '🌳', label: 'Frise de vies (des personnes de la base)', group: kind.group, preset: 'lives'}); out.push({kind: k, icon: '🗓️', label: 'Planning (tâches d’une enquête, Gantt)', group: kind.group, preset: 'gantt'}); }
        }
        return out;
    };
    function presetSpec(t) {
        const kind = R().KINDS[t.kind], s = {kind: t.kind, ...clone(kind.sample())}; s.o = {...(s.o || {}), ...(t.o || {})};
        if (t.o?.layout === 'westminster') { s.o.title = 'Chambre'; s.rows = [{name: 'Président', seats: 1, color: '#444444', side: 'speaker'}, {name: 'Majorité', seats: 180, color: '#e15759', side: 'gov'}, {name: 'Opposition', seats: 140, color: '#4e79a7', side: 'opp'}, {name: 'Petits partis', seats: 30, color: '#f2c94c', side: 'opp'}, {name: 'Indépendants', seats: 12, color: '#bab0ac', side: 'cross'}]; }
        if (t.o?.layout === 'classroom' || t.o?.layout === 'circle') { s.o.title = 'Conseil municipal'; s.rows = [{name: 'Liste du maire', seats: 19, color: '#4e79a7'}, {name: 'Opposition', seats: 6, color: '#e15759'}, {name: 'Sans étiquette', seats: 2, color: '#bab0ac'}]; }
        if (t.preset === 'lives') Object.assign(s, {o: {title: 'Vies de la famille', order: 'start'}, rows: [{name: 'Jean Martin', roles: 'Homme', start: '1792', end: '1868'}, {name: 'Marie Durand', roles: 'Femme', start: '1798', end: '1871'}, {name: 'Pierre Martin', roles: 'Homme', start: '1820', end: '1890'}, {name: 'Rose Martin', roles: 'Femme', start: '1823', end: '1901'}],
            roles: [{role: 'Homme', color: '#4e79a7'}, {role: 'Femme', color: '#e15759'}], events: [{date: '1815', label: 'Mariage', kind: 'autre'}, {date: '1870', label: 'Guerre', kind: 'tour'}]});
        if (t.preset === 'gantt') Object.assign(s, {o: {title: 'Planning de recherche', defaultRole: 'Tâche'}, rows: [{name: 'Relevés paroissiaux', roles: 'Archives', start: '2026-01', end: '2026-04'}, {name: 'Recensements', roles: 'En ligne', start: '2026-03', end: '2026-06'}, {name: 'Visite aux AD', roles: 'Déplacement', start: '2026-06-10', end: '2026-06-20'}, {name: 'Rédaction', roles: 'Écriture', start: '2026-07', end: '2026-12'}],
            roles: [{role: 'Archives', color: '#9c755f'}, {role: 'En ligne', color: '#4e79a7'}, {role: 'Déplacement', color: '#f28e2b'}, {role: 'Écriture', color: '#59a14f'}], events: [{date: '2026-06-15', label: 'Rendez-vous', kind: 'autre'}]});
        return s;
    }
    function chooseType({current = '', title = 'Nouveau diagramme'} = {}) {
        return new Promise(resolve => {
            const dlg = document.createElement('dialog'); dlg.className = 'modal h-dg-gallery';
            const paint = () => {
                // l'ordre, les types cachés et les groupes à soi : Réglages → Types de diagrammes (heritage-diagram-kinds.js)
                const all = TEMPLATES(), groups = {};
                if (ext.diagramCatalog) ext.diagramCatalog(all).forEach(([g, items]) => { groups[g] = items.map(t => [t, all.indexOf(t)]); });
                else all.forEach((t, i) => { (groups[t.group] = groups[t.group] || []).push([t, i]); });
                dlg.innerHTML = `<div class="h-dg-galhead"><div><span class="eyebrow">📊 DIAGRAMMES</span><h2>${esc(title)}</h2><p class="muted">Choisis un dessin : il arrive avec un exemple que tu remplaces par tes chiffres (à la main, collés d’un tableur, d’un CSV, ou pris dans l’app).</p></div><span>${ext.openDiagramKindsEditor ? '<button type="button" class="button small secondary" data-kinds-cfg title="Ordre, types montrés ou cachés, groupes à toi">⚙️ Ranger les types</button>' : ''}<button type="button" class="icon-button" data-close>×</button></span></div>
                ${Object.entries(groups).map(([g, items]) => `<h4>${esc(g)}</h4><div class="h-dg-tiles">${items.map(([t, i]) => `<button type="button" class="h-dg-tile ${current === t.kind && !t.o && !t.preset ? 'is-current' : ''}" data-tpl="${i}"${R().KINDS[t.kind]?.help && !t.o && !t.preset ? ` title="${esc(R().KINDS[t.kind].help)}"` : ''}><span class="h-dg-mini">${R().svg({...presetSpec(t), o: {...presetSpec(t).o, title: '', subtitle: '', source: '', legend: 'none', scale: 1.6}}, 480)}</span><span>${esc(t.icon)} ${esc(t.label)}</span></button>`).join('')}</div>`).join('')}`;
                dlg.insertAdjacentHTML('beforeend', '<div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-close>Fermer</button></div>'); // K6 : le bas de fenêtre (K3 : « Fermer » seul, rien à valider)
            };
            paint();
            document.body.appendChild(dlg);
            const done = v => { dlg.close(); dlg.remove(); resolve(v); };
            dlg.addEventListener('click', e => { if (e.target.closest('[data-close]')) return done(null); if (e.target.closest('[data-kinds-cfg]')) return ext.openDiagramKindsEditor({onSave: paint}); const b = e.target.closest('[data-tpl]'); if (b) done(TEMPLATES()[Number(b.dataset.tpl)]); });
            dlg.addEventListener('cancel', e => { e.preventDefault(); done(null); });
            dlg.showModal();
        });
    }

    /* ─── L'éditeur ─── */
    async function openEditor(id = null, {link = null, kind = null, onSave = null, onClose = null, spec: given = null, name: givenName = ''} = {}) {
        let rec;
        if (!id && given && R().KINDS[given.kind]) rec = {id: 0, name: givenName || given.o?.title || R().KINDS[given.kind].label, spec: clone(given), links: link ? [link] : []}; // données déjà prêtes (statistique, import)
        else if (id) { const d = await get(id); if (!d) return toast('Diagramme introuvable.', 'error');
            // 📈 un de mes graphiques posé ici : on le modifie dans l'Éditeur de graphiques (il se met à jour partout)
            if (followId(d.spec)) { document.querySelectorAll('dialog[open]').forEach(x => { try { x.close(); } catch (_) {} }); if (ext.editMyGraph) ext.editMyGraph(followId(d.spec)); return null; }
            rec = {id: d.id, name: d.name, spec: specOf(d), links: clone(d.links || [])}; }
        else {
            const t = kind ? {kind} : await chooseType(); if (!t) return null;
            const spec = presetSpec(t);
            rec = {id: 0, name: spec.o.title || R().KINDS[t.kind].label, spec, links: link ? [link] : []};
        }
        let spec = rec.spec, tab = 'data', dirty = !rec.id, timer = 0;
        const shownRows = {}; // C6 : combien de lignes chaque tableau montre (« Voir les suivantes », « Tout voir »)
        const dlg = document.createElement('dialog'); dlg.className = 'modal h-dg-dlg'; dlg.dataset.ownClose = '1';
        const kindOf = () => R().KINDS[spec.kind] || R().KINDS.columns;
        dlg.innerHTML = `<div class="h-dg-shell">
            <header class="h-dg-top"><span class="ui-topbar-icon" aria-hidden="true">📊</span><input class="h-dg-name" data-dg-name value="${esc(rec.name)}" maxlength="200" aria-label="Nom du diagramme"><button type="button" class="button small secondary" data-dg-type title="Changer de type de diagramme"></button>
                <span class="h-dg-spacer"></span><span class="ui-status" data-ui-status></span><button type="button" class="button small secondary" data-dg-expdlg title="PNG, JPG, SVG, PDF, impression, CSV, fichier du diagramme">⤓ Exporter ▾</button><button type="button" class="button small" data-dg-save data-shortcut="⌘S" title="Enregistrer">💾 Enregistrer</button><button type="button" class="icon-button" data-dg-close title="Fermer" aria-label="Fermer">×</button></header>
            <div class="h-dg-body"><aside class="h-dg-side"><nav class="segmented h-dg-tabs"><button type="button" data-dg-tab="data">Données</button><button type="button" data-dg-tab="opts">Réglages</button><button type="button" data-dg-tab="app">Depuis l’app</button><button type="button" data-dg-tab="links">Relier</button></nav><div class="h-dg-pane"></div></aside>
                <main class="h-dg-preview"><p class="h-dg-sum" data-dg-sum aria-live="polite" hidden></p><div class="h-dg-svg" data-dg-preview></div></main></div></div>`;
        document.body.appendChild(dlg);
        const pane = dlg.querySelector('.h-dg-pane'), prev = dlg.querySelector('[data-dg-preview]');
        // « ✓ Enregistré » / « • modifié » au même endroit, sans toast (E1)
        const showStatus = () => window.LCNDA_UI?.savedStatus?.(dlg.querySelector('[data-ui-status]'), dirty ? 'dirty' : 'saved');
        const draw = async () => { showStatus(); const s = await resolveLive(spec); prev.innerHTML = R().svg(s); kindOf().afterDraw?.(prev, kindApi); };
        // kind.afterDraw(aperçu, api) : une sorte qui se règle aussi dans l'aperçu (cadrage d'une carte à la souris) ; api.set({réglages}) change spec.o
        // kind.dataPane(onglet, api) : une sorte qui enrichit son tableau (champ « Zone » des cartes) ; api.changed() : spec modifié à la main, redessiner
        const kindApi = {spec: () => spec, set: patch => { spec.o = {...(spec.o || {}), ...patch}; later(); if (tab === 'opts') { const y = pane.scrollTop; paint(); pane.scrollTop = y; } }, changed: () => later()};
        const later = () => { dirty = true; clearTimeout(timer); timer = setTimeout(draw, 90); };
        const paint = () => {
            dlg.querySelector('[data-dg-type]').textContent = `${kindOf().icon} ${kindOf().label} ▾`;
            dlg.querySelectorAll('[data-dg-tab]').forEach(b => b.classList.toggle('is-active', b.dataset.dgTab === tab));
            if (tab === 'data') pane.innerHTML = (spec.live?.sheet && ext.sheetLink ? ext.sheetLink.bannerHtml(spec) : spec.live ? `<p class="h-dg-live">🔄 Chiffres tenus à jour depuis « ${esc(spec.live.label || 'l’app')} » : ils sont relus à chaque affichage. <button type="button" class="link-button" data-dg-unlive>Les figer (les modifier à la main)</button></p>` : ext.openSheetEditor && !kindOf().noSheet ? '<div class="h-dg-sheetbar"><button type="button" class="button small secondary" data-dg-sheet title="Le tableur en grand, préparé avec les colonnes de ce diagramme : formules, tri, coller depuis Excel… puis « ✓ Enregistrer et revenir »">🧮 Modifier les données</button><small class="muted">dans le tableur (formules, tri, Excel…)</small></div>' : '') + kindOf().grids.map((g, gi) => gridHtml(g, gi, spec, shownRows[gi] || GRID_SHOWN)).join('');
            else if (tab === 'opts') pane.innerHTML = `<div class="h-dg-opts"><h4>${esc(kindOf().label)}</h4>${kindOf().options.map(o => optHtml(o, spec)).join('') || '<p class="muted">Pas de réglage particulier.</p>'}<h4>Présentation</h4>${R().COMMON.map(o => optHtml(o, spec)).join('')}</div>`;
            else if (tab === 'app') pane.innerHTML = appPaneHtml();
            else pane.innerHTML = linksHtml();
            showSum(tab === 'app' ? lastSum : spec.live?.sum || appSum); // la phrase du réglage au-dessus de l'aperçu (options de « Depuis l'app ») : celle des chiffres pris, tant qu'on ne les retouche pas
            if (tab === 'app') bindAppPane(); if (tab === 'links') bindLinks();
            if (tab === 'data') { sortBars(); kindOf().dataPane?.(pane, kindApi); }
        };
        // C6 : « N lignes · Trier : [menu] » au-dessus de chaque tableau : range les lignes (le dessin suit)
        const sortBars = () => pane.querySelectorAll('[data-dg-sortbar]').forEach(ph => {
            const UI = window.LCNDA_UI; if (!UI?.sortBar) return ph.remove();
            const g = grid(ph.dataset.dgSortbar), cols = gridCols(g, spec), numC = cols.find(x => x.type === 'number'), txtC = cols.find(x => x.type !== 'number' && x.type !== 'color');
            const opts = [['', 'Dans l’ordre du tableau'], ...(numC ? [['big', `${numC.label} : du plus grand au plus petit`], ['small', `${numC.label} : du plus petit au plus grand`]] : []), ...(txtC ? [['az', `${txtC.label} : A → Z`], ['za', `${txtC.label} : Z → A`]] : [])];
            if (opts.length < 2) return ph.remove();
            ph.replaceWith(UI.sortBar({count: Number(ph.dataset.count) || 0, label: 'ligne', feminine: true, value: '', options: opts, onChange: v => {
                const rows = spec[g.key] || [], t = r => String(r[txtC?.k] ?? '');
                if (v === 'big' || v === 'small') rows.sort((x, y) => (R().num(y[numC.k]) - R().num(x[numC.k])) * (v === 'big' ? 1 : -1));
                else if (v === 'az' || v === 'za') rows.sort((x, y) => t(x).localeCompare(t(y), 'fr', {numeric: true}) * (v === 'az' ? 1 : -1));
                else return;
                const y = pane.scrollTop; paint(); pane.scrollTop = y; later(); }}));
        });
        /* données prises dans l'app */
        // la phrase du réglage (« Personnes nées entre 1800 et 1900, mes ancêtres, par département, 10 premiers ») au-dessus de l'aperçu
        let lastSum = '', appSum = '';
        let appDraft = null; // le réglage de « Graphique » en cours (critères compris), gardé quand on passe d'un onglet à l'autre
        const showSum = t => { const el = dlg.querySelector('[data-dg-sum]'); if (!el) return; el.textContent = t ? '⚙️ ' + t : ''; el.hidden = !t; };
        const setSum = t => { lastSum = t; showSum(t); };
        const DGO = () => ext.diagramAppOpts;
        const appPaneHtml = () => {
            if (kindOf().fromApp?.html) return kindOf().fromApp.html(spec); // une sorte avec son propre panneau : kind.fromApp = {html(spec), bind(pane, {spec, apply})} (heritage-diagram-genea.js)
            const k = spec.kind, people = k === 'timeline' || k === 'chrono', stats = TABLE_KINDS.includes(k) || STAT_KINDS.includes(k) || !!kindOf().pairs, kApp = kindOf().app;
            const tf = DGO()?.treeFields(k) || [], tq = DGO() ? DGO().norm({...(spec.live?.tq || {}), live: !!spec.live?.tree}) : null;
            // une sorte peut apporter ses propres données de l'arbre : kind.app = {sources: [[clé, nom]], fill: async (spec, clé) => spec}
            return `<div class="h-dg-app">${kApp?.sources?.length ? `<h4>🌳 Des données de mon arbre</h4><p class="muted">Remplace le tableau par des chiffres calculés dans ta base (tu peux ensuite les retoucher à la main).</p><label>${stats ? 'Données' : 'Graphique'}<select data-dg-kapp>${kApp.sources.map(([key, label]) => `<option value="${esc(key)}" ${spec.live?.tree === key ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></label>${tf.length ? `<div data-dgo-tree>${DGO().html(tq, {fields: tf, kind: k, period: 'birth'})}</div>` : ''}<button type="button" class="button small" data-dg-kappgo>Prendre ces données</button>` : ''}${stats ? `<h4>📊 Des chiffres de l’app</h4><p class="muted">Remplace le tableau par des chiffres calculés dans ta base : « 🧮 Compter dans ma base » (ce qu’on compte, le groupe de personnes, la période, le regroupement… tout se règle ci-dessous), un exemple, une statistique de l’app ou un de « Mes graphiques » (faits dans Réglages → Éditeur de graphiques).</p>
                <label>Graphique<select data-dg-src><option value="">Chargement…</option></select></label><div data-dgo-stats></div><button type="button" class="button small" data-dg-srcgo>Prendre ces chiffres</button>` : ''}
                ${people ? `<h4>👥 Des personnes de la base</h4><p class="muted">${k === 'timeline' ? 'Chaque personne devient une ligne, de sa naissance à son décès (rôle : Homme ou Femme, à changer à volonté).' : 'Leurs naissances, mariages et décès deviennent des dates de la frise.'}</p>
                <div class="h-pr-addlink" data-dg-pq>${window.LCNDA_PICKER.pickerField({name: 'dg_addp', kind: 'person'})}</div>` : ''}
                ${!stats && !people && !kApp?.sources?.length ? '<p class="muted">Ce type de diagramme se remplit à la main, en collant un tableau ou avec un CSV (onglet Données).</p>' : ''}</div>`;
        };
        function bindAppPane() {
            const O = DGO(), k = spec.kind;
            if (kindOf().fromApp?.bind) {
                kindOf().fromApp.bind(pane, {spec: () => clone(spec), apply: s => { spec = s; delete spec.live; appSum = lastSum; tab = 'data'; paint(); later(); }, set: s => { spec = s; appSum = lastSum; later(); } /* set : sans changer d'onglet, spec.live gardé */});
                // le groupe de personnes et la période communs, ajoutés au panneau propre du type (heritage-diagram-options.js)
                const c = O?.CUSTOM[k], title = pane.querySelector('h4')?.textContent.replace(/^\W+\s*/u, '') || kindOf().label;
                if (!c) { ext.diagramGraphique?.mount(pane, k); return; } // « Graphique » : des points de départ tout prêts (heritage-diagram-graphique.js)
                let box = null;
                // la phrase : le premier choix du type (« Naissances (ou baptêmes) »…), puis le groupe et la période
                function upd() { if (!box) return; const first = [...pane.querySelectorAll('select')].find(x => !x.closest('[data-dgo-box]') && !x.closest('.h-dgo-legacy') && x.offsetParent !== null);
                    setSum(O.summary(O.read(box), {fields: O.customFields(k), period: c.period, source: first?.selectedOptions[0]?.textContent.trim() || title})); }
                box = O.adopt(pane, k, {onChange: () => upd()}); upd();
                ext.diagramGraphique?.mount(pane, k, {onApply: () => upd()});
                pane.addEventListener('change', e => { if (!e.target.closest('[data-dgo-box]')) upd(); });
                return;
            }
            // 🌳 des données de mon arbre (kind.app) : + le groupe de personnes, la période, « Tenir à jour »
            const tbox = pane.querySelector('[data-dgo-tree] [data-dgo-box]'), kSel = pane.querySelector('[data-dg-kapp]'), tcfg = {fields: O?.treeFields(k) || [], kind: k, period: 'birth'};
            const tsum = q => O.summary(q, {...tcfg, source: kSel?.selectedOptions[0]?.textContent || ''});
            if (tbox) O.bind(tbox, {cfg: tcfg, onChange: q => setSum(tsum(q))});
            pane.querySelector('[data-dg-kappgo]')?.addEventListener('click', async e => { const key = kSel.value, b = e.currentTarget;
                if (tbox && !O.check(tbox)) return;
                if (tbox) O.setCurrent(tbox);
                b.disabled = true;
                try { const tq = tbox ? O.read(tbox) : null; spec = await kindOf().app.fill(clone(spec), key); delete spec.live;
                    if (tq?.live) spec.live = {tree: key, label: kSel.selectedOptions[0]?.textContent || '', dg: O.dgParams(tq), tq: {...tq, live: true}, sum: tsum(tq)};
                    appSum = tq ? tsum(tq) : '';
                    tab = 'data'; paint(); later(); toast('Données prises dans ton arbre.'); } catch (err) { toast(err.message, 'error'); } finally { b.disabled = false; } });
            // 📊 des chiffres de l'app (« Graphique ») : la source, puis les options communes (ce qu'on compte, groupe, période, regroupement, tri, N premiers, Autres, Inconnu, unité, Tenir à jour)
            const sel = pane.querySelector('[data-dg-src]'), shost = pane.querySelector('[data-dgo-stats]');
            if (!sel) return;
            const fieldsFor = () => O.ORDER.filter(f => f !== 'series' || O.multiSeries(k));
            const presetOf = key => O.PRESETS.find(([id]) => 'q:' + id === key);
            let srcKey = spec.live?.q ? 'q:' + (spec.live.preset || 'custom') : spec.live?.key && !spec.live.follow ? spec.live.key : 'q:custom';
            const two = R().KINDS[k]?.grids?.[0]?.series === 2; // pyramide, haltères, pente : deux séries face à face (hommes et femmes)
            let draft = O.norm(spec.live?.q ? {...spec.live.q, live: true} : {...(k === 'pyramid' ? {series: 'sex', by: 'age10', what: 'deaths'} : two ? {series: 'sex'} : {}), limit: srcKey.startsWith('q:') ? 15 : 0, ...(spec.live?.post || {}), live: !!spec.live?.key});
            if (appDraft?.kind === k) { srcKey = appDraft.key; draft = appDraft.q; }
            const labelOf = key => sel.querySelector(`option[value="${CSS.escape(key)}"]`)?.textContent || presetOf(key)?.[1] || '';
            const cfgFor = key => { const locked = !key.startsWith('q:'), redo = O.FROM_APPSTAT[key];
                return {fields: fieldsFor(), kind: k, period: 'event', locked, source: labelOf(key), liveAttr: 'data-dg-srclive',
                    note: locked ? `Ces chiffres sont déjà comptés : tu peux les trier, garder les premiers, montrer « Inconnu » ou les passer en %. Pour choisir ce qu’on compte, le groupe de personnes ou la période, prends « 🧮 Compter dans ma base »${redo ? ` : <button type="button" class="link-button" data-dgo-redo="${esc(redo)}">🧮 Refaire avec « Compter dans ma base »</button>` : '.'}` : ''}; };
            const paintHost = () => {
                if (!shost || !O) return;
                const cfg = cfgFor(srcKey); shost.innerHTML = O.html(draft, cfg);
                const box = shost.querySelector('[data-dgo-box]');
                O.bind(box, {cfg, onChange: q => { draft = q; appDraft = {kind: k, key: srcKey, q}; setSum(O.summary(q, cfg)); found(q, cfg); }});
                setSum(O.summary(draft, cfg)); found(draft, cfg);
            };
            // la phrase dit aussi combien de personnes sont comptées (« — 3 personnes trouvées »), relue un peu après chaque changement
            let foundT = 0;
            const found = (q, cfg) => { clearTimeout(foundT); if (cfg.locked) return;
                foundT = setTimeout(() => O.count(q).then(res => { if (draft !== q && JSON.stringify(O.params(draft)) !== JSON.stringify(O.params(q))) return; if (Number.isFinite(res?.people)) setSum(O.summary(q, {...cfg, found: res.people})); }).catch(() => {}), 450); };
            // « 🧮 Compter dans ma base » rangé par rubrique ; ce qui n'a pas de sens pour ce diagramme est grisé (« pas pour ce diagramme »)
            const fillSel = src => { const g = {};
                (O ? O.PRESETS : []).forEach(([id, l, , rub, shape]) => { const fit = O.fits(k, shape) || srcKey === 'q:' + id; (g['🧮 Compter dans ma base' + (rub ? ' · ' + rub : '')] ||= []).push(['q:' + id, fit ? l : l + ' — pas pour ce diagramme', !fit]); });
                src.forEach(([key, label, grp]) => { (g[grp] = g[grp] || []).push([key, label]); });
                sel.innerHTML = Object.entries(g).filter(([, items]) => items.length).map(([grp, items]) => `<optgroup label="${esc(grp)}">${items.map(([key, label, off]) => `<option value="${esc(key)}" ${srcKey === key ? 'selected' : ''} ${off ? 'disabled' : ''}>${esc(label)}</option>`).join('')}</optgroup>`).join('');
                if (sel.value !== srcKey) srcKey = sel.value; paintHost(); };
            if (ext.diagramStatSources) ext.diagramStatSources().then(fillSel).catch(() => fillSel([]));
            else fillSel([]);
            sel.addEventListener('change', () => {
                const key = sel.value, p = presetOf(key);
                if (p) { const who = ['pop', 'root', 'gens', 'label', 'list', 'search', 'ids', 'from', 'to', 'live', 'rootName', 'labelName', 'listName', 'idsCount'].reduce((m, x) => { if (draft[x] !== undefined) m[x] = draft[x]; return m; }, {});
                    draft = O.norm({...O.DEF, ...(two ? {series: 'sex'} : {}), ...who, ...p[2]}); }
                else if (srcKey.startsWith('q:')) draft = O.norm({...draft, limit: 0, others: true}); // déjà compté : tout garder, sauf si on le demande
                srcKey = key; appDraft = {kind: k, key, q: draft}; paintHost();
            });
            shost?.addEventListener('click', e => { const b = e.target.closest('[data-dgo-redo]'); if (!b) return; sel.value = 'q:' + b.dataset.dgoRedo; sel.dispatchEvent(new Event('change', {bubbles: true})); });
            pane.querySelector('[data-dg-srcgo]')?.addEventListener('click', async e => {
                const key = sel.value; if (!key) return; const b = e.currentTarget, box = shost?.querySelector('[data-dgo-box]'), cfg = cfgFor(key);
                const q = box && O ? O.read(box) : O?.norm({}) || {}, preset = presetOf(key);
                if (box && !O.check(box)) return;
                const label = preset ? (preset[0] === 'custom' ? O.summary(q, {...cfg, fields: ['what', 'rules', 'pop', 'by']}).replace(/\.$/, '').slice(0, 120) : preset[1]) : labelOf(key);
                b.disabled = true;
                try {
                    if (preset) {
                        const res = await O.count(q); if (!res.rows?.length) return toast('Aucun chiffre pour ces réglages : essaie un autre groupe, une autre période ou montre « Inconnu ».', 'error');
                        spec = O.toSpec(spec, res, label);
                        if (q.live) spec.live = {key, label, q, preset: preset[0], sum: O.summary(q, cfg)}; else delete spec.live;
                        appSum = O.summary(q, {...cfg, found: res.people});
                        if (!spec.o.title || spec.o.title === kindOf().sample().o?.title) spec.o.title = label;
                        tab = 'data'; paint(); later(); toast(`${res.rows.length} valeur${res.rows.length > 1 ? 's' : ''} prise${res.rows.length > 1 ? 's' : ''} dans ta base${res.counted ? ` (${res.counted} compté${res.counted > 1 ? 's' : ''})` : ''}.`);
                        return;
                    }
                    let pairs = await ext.diagramStatRows(key); if (!pairs.length) return toast('Aucun chiffre pour ce graphique.', 'error');
                    pairs = O ? O.post(pairs, q) : pairs;
                    spec = fillFrom(spec, pairs, label);
                    if (q.live) { spec.live = {key, label}; const po = O?.postOf(q); if (po) { spec.live.post = po; spec.live.sum = O.summary(q, cfg); } } else delete spec.live;
                    appSum = O ? O.summary(q, cfg) : '';
                    if (!spec.o.title || spec.o.title === kindOf().sample().o?.title) spec.o.title = label;
                    tab = 'data'; paint(); later(); toast(`${pairs.length} valeur${pairs.length > 1 ? 's' : ''} prise${pairs.length > 1 ? 's' : ''} dans l’app.`);
                } catch (err) { toast(err.message, 'error'); } finally { b.disabled = false; }
            });
            const box = pane.querySelector('[data-dg-pq]'); if (!box) return;
            // une personne choisie avec le menu de choix unique : ses dates entrent dans le diagramme
            box.addEventListener('picker-change', async e => { const pid = Number(e.detail.value) || 0; if (!pid) return;
                window.LCNDA_PICKER.pickerSet(box.querySelector('.pk'), null); // le champ se vide pour la suivante
                const r = await api('diagram_people', {ids: String(pid)}).catch(err => { toast(err.message, 'error'); return null; }); const p = r?.people?.[0]; if (!p) return;
                const y = v => String(v || '').replace(/-00/g, '').replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1').replace(/^(\d{4})-(\d{2})$/, '$2/$1');
                if (spec.kind === 'timeline') {
                    if (!p.birth) return toast(`${p.name} : pas de date de naissance dans sa fiche.`, 'error');
                    const by = Number(String(p.birth).slice(0, 4)), alive = !p.death && new Date().getFullYear() - by < 105;
                    const role = p.gender === 'male' ? 'Homme' : p.gender === 'female' ? 'Femme' : 'Vie';
                    spec.rows = [...(spec.rows || []).filter(r => r.name), {name: p.name, roles: role, start: y(p.birth), end: p.death ? y(p.death) : alive ? '' : y(p.birth), note: !p.death && !alive ? 'décès inconnu' : ''}];
                    spec.roles = spec.roles || []; [['Homme', '#4e79a7'], ['Femme', '#e15759']].forEach(([role2, c]) => { if (!spec.roles.some(x => x.role === role2)) spec.roles.push({role: role2, color: c}); });
                } else {
                    spec.rows = [...(spec.rows || []), ...(p.birth ? [{date: y(p.birth), label: `Naissance de ${p.name}`}] : []), ...(p.death ? [{date: y(p.death), label: `Décès de ${p.name}`}] : [])];
                }
                later(); toast(`${p.name} ajouté${p.gender === 'female' ? 'e' : ''}.`); });
        }
        /* rattacher à des personnes, enquêtes, parties d'enquête, projets de l'Atelier */
        const lchip = l => `<span class="h-pr-lchip" data-type="${esc(l.type)}" data-id="${Number(l.id)}">${LINK_IC[l.type] || '🔗'} ${esc(l.name)} <button type="button" data-dg-unlink aria-label="Retirer">×</button></span>`;
        const linksHtml = () => `<div class="h-pr-links"><p class="muted">Le diagramme apparaît alors sur la fiche de la personne, dans l’enquête ou dans le projet de l’Atelier. Pour le poser ailleurs : un widget (Réglages → Éditeur de widgets), un bloc de fiche, la mise en page.</p><span class="h-pr-linkchips">${rec.links.map(lchip).join('') || '<small class="muted">Rattaché à rien pour l’instant.</small>'}</span>
            <div class="h-pr-addlink" data-dg-lpk style="flex:1 1 320px;min-width:min(100%,320px)">${window.LCNDA_PICKER.pickerField({name: 'dg_link', kind: 'person,investigation', placeholder: 'Une personne, une enquête…'})}</div>
            <span class="h-pr-addlink"><input type="search" data-dg-lq placeholder="ou une partie d’enquête, un projet de l’Atelier…" autocomplete="off"><span class="h-pr-lsugg" hidden></span></span></div>`;
        let invCache = null, projCache = null;
        function bindLinks() {
            const input = pane.querySelector('[data-dg-lq]'), sugg = input.nextElementSibling; let t = 0;
            pane.querySelector('.h-pr-linkchips').addEventListener('click', e => { const c = e.target.closest('[data-dg-unlink]')?.closest('.h-pr-lchip'); if (!c) return; rec.links = rec.links.filter(l => !(l.type === c.dataset.type && Number(l.id) === Number(c.dataset.id))); dirty = true; paint(); });
            // personnes et enquêtes : le menu de choix unique (recherche mélangée)
            pane.querySelector('[data-dg-lpk]')?.addEventListener('picker-change', e => { const it = e.detail.item; if (!it?.id) return; const type = it.kind === 'investigation' ? 'investigation' : 'person';
                if (!rec.links.some(l => l.type === type && Number(l.id) === Number(it.id))) rec.links.push({type, id: Number(it.id), name: it.title}); dirty = true; paint(); });
            // parties d'enquête et projets de l'Atelier : pas encore dans le menu de choix unique, l'ancienne recherche reste pour eux
            input.addEventListener('input', () => { clearTimeout(t); const q = input.value.trim(), ql = q.toLowerCase(); if (q.length < 2) { sugg.hidden = true; return; } t = setTimeout(async () => {
                let parts = [], projs = [];
                await Promise.all([
                    api('periodical_link_search', {q}).then(r => { parts = r.items || []; }).catch(() => {}),
                    (projCache ? Promise.resolve() : api('atelier_projects').then(r => { projCache = r.projects || []; })).then(() => { projs = (projCache || []).filter(p => String(p.title || '').toLowerCase().includes(ql)).slice(0, 6); }).catch(() => {}),
                ]);
                const b = (type, id, name) => `<button type="button" data-add-type="${type}" data-add-id="${Number(id)}" data-add-name="${esc(name)}">${LINK_IC[type]} ${esc(name)}</button>`;
                sugg.innerHTML = [...parts.map(x => b('investigation_item', x.id, x.name)), ...projs.map(p => b('atelier_project', p.id, p.title))].join('') || '<small class="empty-line"><span class="empty-line-ico" aria-hidden="true">🔍</span><span class="empty-line-text">Rien trouvé.</span></small>';
                sugg.hidden = false; }, 220); });
            input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); sugg.querySelector('[data-add-type]')?.click(); } });
            sugg.addEventListener('click', e => { const s = e.target.closest('[data-add-type]'); if (!s) return; if (!rec.links.some(l => l.type === s.dataset.addType && Number(l.id) === Number(s.dataset.addId))) rec.links.push({type: s.dataset.addType, id: Number(s.dataset.addId), name: s.dataset.addName}); dirty = true; paint(); pane.querySelector('[data-dg-lq]')?.focus(); });
        }
        const grid = gi => kindOf().grids[Number(gi)];
        pane.addEventListener('input', e => {
            const el = e.target;
            if (el.dataset.k !== undefined && el.dataset.g !== undefined) { const g = grid(el.dataset.g), row = spec[g.key][Number(el.dataset.r)]; if (!row) return; row[el.dataset.k] = el.value; if (el.type === 'color') { el.classList.remove('is-auto'); } if (g.key === 'rows' && el.type !== 'color') { if (spec.live || appSum) { delete spec.live; appSum = ''; showSum(''); } } return later(); }
            if (el.dataset.dgSername !== undefined) { spec.series = spec.series || []; const j = Number(el.dataset.dgSername); spec.series[j] = {...(spec.series[j] || {}), name: el.value}; return later(); }
            if (el.dataset.dgSercolor !== undefined) { spec.series = spec.series || []; const j = Number(el.dataset.dgSercolor); spec.series[j] = {...(spec.series[j] || {}), color: el.value}; return later(); }
            if (el.dataset.opt) { const o = [...kindOf().options, ...R().COMMON].find(x => x.k === el.dataset.opt); spec.o = spec.o || {};
                spec.o[o.k] = o.type === 'check' ? el.checked : ['number', 'range'].includes(o.type) ? (el.value === '' ? '' : Number(el.value)) : el.value;
                if (o.type === 'range') el.previousElementSibling.textContent = el.value;
                if (o.type === 'select' || o.type === 'check') { const y = pane.scrollTop; paint(); pane.scrollTop = y; }
                return later(); }
        });
        // coller plusieurs cellules d'un tableur dans une case : elles remplissent le tableau à partir de là
        pane.addEventListener('paste', e => {
            const el = e.target; if (el.dataset?.k === undefined || el.dataset.g === undefined) return;
            const txt = e.clipboardData?.getData('text/plain') || ''; if (!/[\t\n]/.test(txt.trim())) return;
            e.preventDefault(); const g = grid(el.dataset.g), cols = gridCols(g, spec).filter(c => c.type !== 'readonly');
            pasteInto(g, spec, parseTable(txt), Number(el.dataset.r), Math.max(0, cols.findIndex(c => c.k === el.dataset.k)));
            const y = pane.scrollTop; paint(); pane.scrollTop = y; later();
        });
        pane.addEventListener('change', async e => {
            const f = e.target.closest('[data-dg-csv]'); if (!f?.files?.[0]) return;
            if (f.files[0].size > 5e6) return toast('Fichier trop gros (5 Mo au plus).', 'error');
            const SH = window.LCNDA_SHEET, txt = SH?.decodeBytes ? SH.decodeBytes(await f.files[0].arrayBuffer()).text : await f.files[0].text(); // accents des vieux fichiers Excel (Windows-1252)
            pasteInto(grid(f.dataset.dgCsv), spec, parseTable(txt)); delete spec.live; paint(); later(); toast('Tableau importé.');
        });
        pane.addEventListener('click', async e => {
            const b = e.target.closest('button'); if (!b) return;
            const keep = () => { const y = pane.scrollTop; paint(); pane.scrollTop = y; later(); };
            if (b.dataset.dgAdd !== undefined) { const g = grid(b.dataset.dgAdd); spec[g.key].push({}); keep(); pane.querySelector(`[data-grid="${b.dataset.dgAdd}"] tbody tr:last-child input`)?.focus(); return; }
            if (b.dataset.dgRow) { const g = grid(b.dataset.g), rows = spec[g.key], i = Number(b.dataset.r);
                if (b.dataset.dgRow === 'del') rows.splice(i, 1); else if (b.dataset.dgRow === 'dup') rows.splice(i + 1, 0, clone(rows[i]));
                else { const j = b.dataset.dgRow === 'up' ? i - 1 : i + 1; if (j >= 0 && j < rows.length) [rows[i], rows[j]] = [rows[j], rows[i]]; }
                return keep(); }
            if (b.dataset.dgAddser !== undefined) { spec.series = [...(spec.series?.length ? spec.series : [{name: 'Série 1'}]), {name: `Série ${(spec.series?.length || 1) + 1}`}]; return keep(); }
            if (b.dataset.dgDelser !== undefined) { const j = Number(b.dataset.dgDelser); if (!await A().confirmBox(`Supprimer la série « ${spec.series[j]?.name || j + 1} » et ses chiffres ?`, {title: 'Supprimer la série', okLabel: 'Supprimer la série'})) return;
                spec.series.splice(j, 1); (spec.rows || []).forEach(r => { for (let k = j; k < spec.series.length + 1; k++) r['s' + k] = r['s' + (k + 1)]; delete r['s' + spec.series.length]; }); return keep(); }
            if (b.hasAttribute('data-dg-autocolor')) { const g = grid(b.dataset.g); delete spec[g.key][Number(b.dataset.r)][b.dataset.k]; return keep(); }
            if (b.dataset.dgSort !== undefined) { const g = grid(b.dataset.dgSort), c = gridCols(g, spec).find(x => x.type === 'number'); spec[g.key].sort((x, y) => R().num(y[c.k]) - R().num(x[c.k])); return keep(); }
            if (b.dataset.dgClear !== undefined) { if (!await A().confirmBox('Vider ce tableau ?', {title: 'Vider le tableau', okLabel: 'Vider le tableau'})) return; spec[grid(b.dataset.dgClear).key] = []; delete spec.live; return keep(); }
            if (b.hasAttribute('data-dg-unlive')) { delete spec.live; return keep(); }
            if (b.hasAttribute('data-dg-sheet')) return openSheet();
            if (b.dataset.dgMore !== undefined || b.dataset.dgMoreall !== undefined) return showMore(Number(b.dataset.dgMore ?? b.dataset.dgMoreall), b.dataset.dgMoreall !== undefined);
            if (b.dataset.dgBook !== undefined) return takeBook(Number(b.dataset.dgBook));
            if (b.dataset.dgPaste !== undefined) {
                const gi = b.dataset.dgPaste;
                ext.openDialog({eyebrow: 'DIAGRAMME', title: 'Coller un tableau', onOpen: d => d.querySelector('[data-dg-pastebook]')?.addEventListener('click', () => { d.close(); takeBook(Number(gi)); }), body: (ext.chooseSheetRange ? '<p class="h-dg-pastebook"><button type="button" class="button small secondary" data-dg-pastebook>🧮 Prendre un classeur du Tableur</button> <small class="muted">une feuille, une plage : copiée une fois ou liée (tenue à jour)</small></p>' : '') + '<p class="muted">Sélectionne des cellules dans Excel, LibreOffice, Numbers ou Google Sheets, copie-les (⌘C) et colle-les ici. Si la première ligne contient des titres, ils deviennent les noms des séries. Le tableau actuel est remplacé.</p><textarea name="t" rows="12" class="h-dg-pastearea" placeholder="Rennes&#9;42&#10;Nantes&#9;25"></textarea>', submitLabel: 'Remplacer le tableau',
                    onSubmit: form => { const t = form.querySelector('[name=t]').value; if (!t.trim()) return false; pasteInto(grid(gi), spec, parseTable(t)); delete spec.live; keep(); }});
            }
        });
        /* C6 : les lignes suivantes, ajoutées par morceaux de 400 (la grille reste rapide) ; modifiables comme les autres, couleur comprise */
        function showMore(gi, all) {
            const g = grid(gi), total = (spec[g.key] || []).length, body = pane.querySelector(`[data-dg-body="${gi}"]`); if (!body) return;
            const target = all ? total : Math.min(total, (shownRows[gi] || GRID_SHOWN) + GRID_SHOWN);
            const step = () => { if (!body.isConnected) return; const from = shownRows[gi] || GRID_SHOWN, to = Math.min(target, from + GRID_SHOWN); body.insertAdjacentHTML('beforeend', gridRowsHtml(g, gi, spec, from, to)); shownRows[gi] = to;
                const bar = pane.querySelector(`[data-dg-morebar="${gi}"]`), html = moreHtml(gi, to, total); if (bar) { if (html) bar.outerHTML = html; else bar.remove(); }
                if (to < target) requestAnimationFrame(step); };
            step();
        }
        /* 🧮 Prendre un classeur du Tableur : une plage copiée une fois, ou liée (tenue à jour) */
        async function takeBook(gi) {
            const r = await ext.chooseSheetRange?.({title: 'Prendre un classeur du Tableur', link: gi === 0}); if (!r) return;
            const g = grid(gi);
            if (r.mode === 'link' && gi === 0) { spec.live = {sheet: r.link, label: `« ${r.link.name} » ! ${r.link.range}`}; const s = await resolveLive(spec); spec[g.key] = s[g.key]; if (s.series) spec.series = s.series; spec.live = s.live; }
            else { pasteInto(g, spec, r.cells); if (gi === 0) delete spec.live; }
            appSum = ''; showSum(''); dirty = true; tab = 'data'; paint(); later(); toast(r.mode === 'link' ? 'Données liées au classeur : elles suivent le Tableur.' : `${r.cells.length.toLocaleString('fr-FR')} lignes copiées du classeur.`);
        }
        /* 🧮 Modifier les données : le tableur préparé (une feuille par tableau), ou le classeur de la plage liée */
        async function openSheet() {
            if (spec.live?.sheet && ext.sheetLink) return ext.sheetLink.open(spec, async () => { const s = await resolveLive(spec); kindOf().grids.forEach(g => { spec[g.key] = s[g.key]; }); if (s.series) spec.series = s.series; spec.live = s.live; dirty = true; if (tab === 'data') paint(); later(); });
            ext.openSheetEditor({target: 'diagram', data: clone(spec), name: rec.name || spec.o?.title || 'Diagramme', onSave: s => { spec = s; delete spec.live; appSum = ''; showSum(''); dirty = true; tab = 'data'; paint(); later(); toast('Données reprises du tableur.'); }});
        }
        const onBook = () => { if (spec.live?.sheet && dlg.isConnected) { resolveLive(spec).then(s => { if (!dlg.isConnected) return; kindOf().grids.forEach(g => { spec[g.key] = s[g.key]; }); if (s.series) spec.series = s.series; if (tab === 'data') paint(); later(); }).catch(() => {}); } };
        document.addEventListener('lcnda:workbook-saved', onBook);
        dlg.addEventListener('close', () => document.removeEventListener('lcnda:workbook-saved', onBook));
        const close = async () => { if (dirty && !await A().confirmBox('Fermer sans enregistrer les changements ?', {title: 'Changements non enregistrés', okLabel: 'Fermer sans enregistrer', danger: true})) return; dlg.close(); dlg.remove(); onClose?.(); };
        dlg.addEventListener('cancel', e => { e.preventDefault(); close(); });
        dlg.querySelector('[data-dg-close]').addEventListener('click', close);
        dlg.querySelector('[data-dg-name]').addEventListener('input', e => { rec.name = e.target.value; dirty = true; showStatus(); });
        dlg.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); e.stopPropagation(); dlg.querySelector('[data-dg-save]').click(); } });
        dlg.querySelectorAll('[data-dg-tab]').forEach(b => b.addEventListener('click', () => { tab = b.dataset.dgTab; paint(); }));
        dlg.querySelector('[data-dg-type]').addEventListener('click', async () => {
            const t = await chooseType({current: spec.kind, title: 'Changer de type'}); if (!t) return;
            const isTable = k => TABLE_KINDS.includes(k) || !!R().KINDS[k]?.table, tableToTable = isTable(t.kind) && isTable(spec.kind); // kind.table : mêmes catégories × séries
            const same = t.kind === spec.kind;
            if (same || tableToTable) { spec.kind = t.kind; spec.o = {...spec.o, ...(t.o || {})}; }
            else { const hasData = (spec.rows || []).length; const keepO = {title: spec.o.title, subtitle: spec.o.subtitle, source: spec.o.source, palette: spec.o.palette, width: spec.o.width, bg: spec.o.bg};
                if (hasData && !await A().confirmBox('Ce type ne lit pas le même tableau : l’exemple remplace tes données. Continuer ?', {title: 'Changer de type', okLabel: 'Remplacer mes données'})) return;
                spec = presetSpec(t); Object.entries(keepO).forEach(([k, v]) => { if (v !== undefined && v !== '') spec.o[k] = v; }); }
            dirty = true; paint(); draw();
        });
        dlg.querySelector('[data-dg-expdlg]').addEventListener('click', () => exportDialog(rec.name || spec.o?.title || 'Diagramme', () => spec));
        dlg.querySelector('[data-dg-save]').addEventListener('click', async () => {
            const btn = dlg.querySelector('[data-dg-save]'); btn.disabled = true;
            try {
                const {kind: k, ...rest} = spec;
                const r = await post('save_diagram', {id: rec.id || 0, name: rec.name.trim() || spec.o.title || 'Mon diagramme', kind: k, spec: rest, links: rec.links.map(l => ({type: l.type, id: l.id}))});
                rec.id = Number(r.result?.id || r.id || rec.id); dirty = false;
                await list(true); refreshEmbeds(rec.id); liveMem.clear();
                window.LCNDA_UI?.savedStatus?.(dlg.querySelector('[data-ui-status]'), 'saved');
                dlg.close(); dlg.remove();
                onSave?.(rec.id); afterSave(rec.id);
            } catch (e) { toast(e.message, 'error'); } finally { btn.disabled = false; }
        });
        paint(); draw(); dlg.showModal();
        return rec;
    }
    ext.openDiagramEditor = (id, opts) => openEditor(id, opts);
    function afterSave(id) {
        const st = S();
        if (st.module === 'graphiques') { if (st.graphMode !== 'diagram' || !st.graphDiagramId) { st.graphMode = 'diagram'; st.graphDiagramId = id; } A().setModule('graphiques'); }
        document.querySelectorAll('[data-dg-host][data-dg-filled]').forEach(h => { delete h.dataset.dgFilled; }); fillHosts();
    }

    /** choisir un diagramme existant, ou en créer un → son numéro (ou null) */
    ext.pickDiagram = ({title = 'Choisir un diagramme', link = null} = {}) => new Promise(async resolve => {
        const all = await list(true).catch(() => []);
        const dlg = document.createElement('dialog'); dlg.className = 'modal h-dg-gallery';
        dlg.innerHTML = `<div class="h-dg-galhead"><div><span class="eyebrow">📊 MES DIAGRAMMES</span><h2>${esc(title)}</h2></div><button type="button" class="icon-button" data-close>×</button></div>
            <div class="h-dg-tiles"><button type="button" class="h-dg-tile is-new" data-new><span class="h-dg-mini h-dg-plus">＋</span><span>Nouveau diagramme</span></button>${ext.diagramFromStat ? '<button type="button" class="h-dg-tile is-new" data-fromstat><span class="h-dg-mini h-dg-plus">📊</span><span>D’un graphique (à moi ou de l’app, tenu à jour)</span></button><button type="button" class="h-dg-tile is-new" data-import><span class="h-dg-mini h-dg-plus">⤒</span><span>Importer (fichier, tableau, Wikipédia, image)</span></button>' : ''}${ext.pickMyGraph ? '<button type="button" class="h-dg-tile is-new" data-mygraph><span class="h-dg-mini h-dg-plus">📈</span><span>Un de mes graphiques (Éditeur de graphiques, tenu à jour)</span></button>' : ''}${all.map(d => `<button type="button" class="h-dg-tile" data-pick="${d.id}"><span class="h-dg-mini"${followId(d.spec) ? ` data-dg-mini="${d.id}"` : ''}>${followId(d.spec) ? '<span class="h-dg-plus">📈</span>' : R().svg({...specOf(d), o: {...(d.spec?.o || {}), legend: 'none', source: '', subtitle: ''}}, 480)}</span><span>${esc(R().KINDS[d.kind]?.icon || '📊')} ${esc(d.name)}</span></button>`).join('')}</div>`;
        dlg.insertAdjacentHTML('beforeend', '<div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-close>Fermer</button></div>'); // K6 : le bas de fenêtre (K3 : « Fermer » seul, rien à valider)
        document.body.appendChild(dlg);
        const done = v => { dlg.close(); dlg.remove(); resolve(v); };
        dlg.addEventListener('cancel', e => { e.preventDefault(); done(null); });
        dlg.addEventListener('click', async e => {
            if (e.target.closest('[data-close]')) return done(null);
            const p = e.target.closest('[data-pick]'); if (p) return done(Number(p.dataset.pick));
            if (e.target.closest('[data-new]')) { dlg.close(); dlg.remove(); const r = await openEditor(null, {link, onSave: id => resolve(id), onClose: () => resolve(null)}); if (!r) resolve(null); }
            if (e.target.closest('[data-fromstat]')) { dlg.close(); dlg.remove(); resolve(await ext.diagramFromStat({link})); }
            if (e.target.closest('[data-import]')) { dlg.close(); dlg.remove(); resolve(await ext.diagramImport({link})); }
            if (e.target.closest('[data-mygraph]')) { dlg.close(); dlg.remove(); const gid = await ext.pickMyGraph(); resolve(gid ? await ext.myGraphDiagram(gid).catch(err => { toast(err.message, 'error'); return null; }) : null); }
        });
        dlg.showModal();
        // les vignettes des graphiques suivis : dessinées après coup (leurs chiffres sont relus dans l'arbre)
        dlg.querySelectorAll('[data-dg-mini]').forEach(async m => { const d = byId(m.dataset.dgMini); if (!d) return; try { const s = await resolveLive(specOf(d)); if (s.kind !== '_missing' && m.isConnected) m.innerHTML = R().svg({...s, o: {...(s.o || {}), legend: 'none', source: '', subtitle: '', title: ''}}, 480); } catch (_) {} });
    });

    /* ─── 📈 Un de mes graphiques posé partout : un diagramme « qui suit » le graphique (un seul par graphique) ─── */
    const followKind = id => { const g = (ext.myGraphs?.() || []).find(x => x.id === id); const st = String(g?.style || 'bars'); const k = st.startsWith('dg:') ? st.slice(3).split(':')[0] : ({tiles: 'treemap', table: 'bars'}[st] || st); return R().KINDS[k] ? k : 'columns'; };
    /** le numéro du diagramme qui montre mon graphique (créé la première fois) */
    ext.myGraphDiagram = async statId => {
        const g = (ext.myGraphs?.() || []).find(x => x.id === statId); if (!g) throw new Error('Graphique introuvable.');
        const key = `my:${statId}`, all = await list(true), have = all.find(d => d.spec?.live?.follow && d.spec.live.key === key);
        if (have) return have.id;
        const r = await post('save_diagram', {name: String(g.name || 'Mon graphique').slice(0, 200), kind: followKind(statId), spec: {live: {key, label: g.name || '', follow: true}, o: {title: g.name || ''}}});
        await list(true); return Number(r.result?.id || r.id) || null;
    };
    /** où mon graphique est posé (les fiches, enquêtes, projets où son diagramme est rattaché) */
    ext.myGraphPlaces = statId => { const d = (cache || []).find(x => x.spec?.live?.follow && x.spec.live.key === `my:${statId}`); return d ? {diagramId: d.id, links: d.links || []} : null; };
    /** un graphique supprimé : son diagramme part aussi (les cases où il était posé le disent) */
    ext.forgetMyGraph = async statId => { await list().catch(() => {}); const p = ext.myGraphPlaces(statId); if (!p) return; try { await post('delete_diagram', {id: p.diagramId}); } catch (_) {} await list(true).catch(() => {}); };
    // un graphique enregistré : ses diagrammes se redessinent partout, et prennent son nom
    let syncT = 0;
    document.addEventListener('lcnda:graphs-changed', () => {
        [...liveMem.keys()].filter(k => /^(follow:)?my:/.test(String(k))).forEach(k => liveMem.delete(k));
        clearTimeout(syncT); syncT = setTimeout(async () => {
            const mine = new Map((ext.myGraphs?.() || []).map(g => [g.id, g]));
            for (const d of (cache || []).filter(x => followId(x.spec))) {
                const g = mine.get(followId(d.spec)); if (!g) continue;
                const name = String(g.name || 'Mon graphique').slice(0, 200), kind = followKind(g.id);
                if (name !== d.name || kind !== d.kind) { try { await post('save_diagram', {id: d.id, name, kind, spec: {...(d.spec || {}), live: {...d.spec.live, label: name}, o: {...(d.spec.o || {}), title: name}}}); } catch (_) {} }
            }
            await list(true).catch(() => {});
            document.querySelectorAll('[data-dg-embed]').forEach(b => { if (followId(byId(b.dataset.dgEmbed)?.spec)) delete b.dataset.dgDone; }); fillAll();
        }, 120);
    });

    // un classeur enregistré : les diagrammes liés à une de ses plages se redessinent partout (🔗 heritage-tableur-cibles.js)
    document.addEventListener('lcnda:workbook-saved', e => {
        const id = Number(e.detail?.id) || 0;
        document.querySelectorAll('[data-dg-embed]').forEach(b => { const L = byId(b.dataset.dgEmbed)?.spec?.live?.sheet; if (L && (!id || Number(L.wb) === id)) delete b.dataset.dgDone; }); fillAll();
        const st = S(); if (st.module === 'graphiques' && st.graphMode === 'diagram' && byId(st.graphDiagramId)?.spec?.live?.sheet && !document.querySelector('dialog[open]')) A().setModule('graphiques');
    });

    /* ─── Graphiques → « Mes diagrammes » ─── */
    ext.diagramItems = () => (cache || []).map(d => [d.id, `${followId(d.spec) ? '📈' : R()?.KINDS[d.kind]?.icon || '📊'} ${d.name}`]);
    ext.diagramList = (force = false) => list(force);
    ext.renderDiagramPage = async (token, id) => {
        const ws = A().$('#workspace');
        if (!id) { await list(); id = cache?.[0]?.id; }
        const d = id ? await get(id) : null;
        if (token !== S().workspaceToken || S().module !== 'graphiques') return;
        if (!d) { ws.innerHTML = `<section class="page"><header class="page-header"><div><span class="eyebrow">MES DIAGRAMMES</span><h2>Créer un diagramme</h2><p>Hémicycle d’une assemblée, fer à cheval, frise des membres d’un groupe de musique façon Wikipédia, frise de vies, camembert, flux de migrations, organigramme, nuage de noms… avec tes propres chiffres ou ceux de l’app. Ils se posent ensuite partout : tableau de bord, fiches, fiche d’une personne, enquêtes, Atelier, mise en page.</p></div><div class="page-actions"><button type="button" class="button" data-dg-new>＋ Nouveau diagramme</button><label class="button secondary h-dg-file">⤒ Importer un fichier<input type="file" accept=".json,application/json" data-dg-import hidden></label></div></header></section>`; bindPage(ws, null); return; }
        ws.innerHTML = `<section class="page h-dg-page"><header class="page-header"><div><span class="eyebrow">MES DIAGRAMMES · ${esc(R().KINDS[d.kind]?.label || '')}</span><h2>${esc(d.name)}</h2>${followId(d.spec) ? `<p>📈 Ce diagramme montre ton graphique « ${esc(d.name)} » (Éditeur de graphiques) : son dessin et ses chiffres le suivent, partout où il est posé.</p>` : d.spec?.live?.sheet ? `<p>🔗 Données : ${esc(d.spec.live.label || 'un classeur du Tableur')} · tenu à jour.</p>` : d.spec?.live ? `<p>🔄 Chiffres tenus à jour depuis « ${esc(d.spec.live.label || 'l’app')} ».</p>` : ''}</div>
            <div class="page-actions"><button type="button" class="button" data-dg-edit="${d.id}">${followId(d.spec) ? '✎ Modifier le graphique' : '✎ Modifier'}</button><button type="button" class="button secondary" data-dg-dup title="${followId(d.spec) ? 'Une copie figée, à retoucher comme un diagramme' : 'Une copie à modifier'}">⧉ Dupliquer</button>${window.LCNDA_SIDE_FOLDERS && !document.body.classList.contains('is-kiosk') ? window.LCNDA_SIDE_FOLDERS.rangeButtonHtml('diagram', d.id, d.name) : ''}<button type="button" class="button secondary" data-dg-dash title="Le poser sur le tableau de bord, comme un widget">＋ Tableau de bord</button><button type="button" class="button danger" data-dg-del>Supprimer</button></div></header>
            <div class="h-dg-pagetools"><button type="button" class="button small secondary" data-dg-pexpdlg title="PNG, JPG, SVG, PDF, impression, CSV, fichier du diagramme">⤓ Exporter</button></div>
            <div class="card h-dg-big"><div class="h-dg-svg">${await svgOf(d)}</div></div>
            ${d.links?.length ? `<div class="h-dg-linked"><span class="section-label">Rattaché à</span>${d.links.map(l => `<button type="button" class="h-pr-lchip" data-dg-golink="${esc(l.type)}:${l.id}:${l.inv || 0}">${LINK_IC[l.type] || '🔗'} ${esc(l.name)}</button>`).join('')}</div>` : ''}
            <p class="muted h-dg-where">Pour le poser ailleurs : <b>Réglages → Éditeur de widgets</b> (partie « Diagramme ») pour le tableau de bord ou un onglet, un bloc « 📊 Diagramme » dans une <b>Fiche</b>, « Relier » (onglet de l’éditeur) pour la fiche d’une personne, une enquête ou un projet de l’Atelier, et « Insérer → Diagramme » dans la <b>mise en page</b>. Tous tes graphiques et diagrammes : <b>Listes → Graphiques et diagrammes</b>.</p></section>`;
        bindPage(ws, d);
    };
    function bindPage(ws, d) {
        ws.querySelector('[data-dg-new]')?.addEventListener('click', () => openEditor(null));
        ws.querySelector('[data-dg-import]')?.addEventListener('change', e => importFile(e.target.files?.[0]));
        if (!d) return;
        ws.querySelector('[data-dg-pexpdlg]').addEventListener('click', () => exportDialog(d.name, () => specOf(d)));
        ws.querySelector('[data-dg-dup]').addEventListener('click', async () => { try { const frozen = followId(d.spec) ? await resolveLive(specOf(d)) : null; if (frozen?.kind === '_missing') throw new Error('Rien à copier : le graphique est introuvable.'); const {kind: fk, live: _l, ...fspec} = frozen || {};
            const r = await post('save_diagram', frozen ? {name: d.name + ' (copie)', kind: fk, spec: fspec} : {name: d.name + ' (copie)', kind: d.kind, spec: d.spec}); await list(true); S().graphDiagramId = Number(r.result?.id); A().setModule('graphiques'); toast('Copie créée.'); } catch (e) { toast(e.message, 'error'); } });
        ws.querySelector('[data-dg-del]').addEventListener('click', async () => { if (!await A().confirmBox(`Supprimer le diagramme « ${d.name} » ? Il disparaît aussi des widgets, fiches et enquêtes où il est posé.`, {title: 'Supprimer le diagramme', okLabel: 'Supprimer le diagramme'})) return; try { await post('delete_diagram', {id: d.id}); window.LCNDA_SIDE_FOLDERS?.forget('diagram', d.id); await list(true); S().graphDiagramId = cache[0]?.id || 0; if (!cache.length) S().graphMode = 'diagram'; A().setModule('graphiques'); toast('Diagramme supprimé.'); } catch (e) { toast(e.message, 'error'); } });
        ws.querySelector('[data-dg-dash]').addEventListener('click', () => addToDashboard(d));
        ws.querySelectorAll('[data-dg-golink]').forEach(b => b.addEventListener('click', () => { const [type, id, inv] = b.dataset.dgGolink.split(':'); goLink(type, Number(id), Number(inv)); }));
    }
    function goLink(type, id, inv) {
        const st = S();
        if (type === 'person') { st.currentPersonId = id; A().setModule('personnes'); }
        else if (type === 'investigation' || type === 'investigation_item') { Object.assign(st, {enquetesTab: 'investigations', currentInvestigationId: type === 'investigation' ? id : inv, currentBattueId: 0}); A().setModule('enquetes'); }
        else if (type === 'atelier_project') { st.atelier = {...(st.atelier || {}), project: id, sel: []}; Object.assign(st, {enquetesTab: 'atelier', currentInvestigationId: 0, currentBattueId: 0}); A().setModule('enquetes'); }
    }
    /** un widget « diagramme » tout fait, posé sur le tableau de bord */
    function addToDashboard(d) {
        if (!ext.addDiagramWidget) return toast('Passe par les Réglages → Éditeur de widgets.', 'error');
        ext.addDiagramWidget(d);
    }
    async function importFile(file) {
        if (!file) return; if (file.size > 3e6) return toast('Fichier trop gros.', 'error');
        try { const j = JSON.parse(await file.text()); if (!j || !j.lcnda_diagram || !R().KINDS[j.kind]) throw new Error('Ce fichier n’est pas un diagramme.');
            const r = await post('save_diagram', {name: String(j.name || 'Diagramme importé').slice(0, 200), kind: j.kind, spec: j.spec && typeof j.spec === 'object' ? j.spec : {}});
            await list(true); S().graphMode = 'diagram'; S().graphDiagramId = Number(r.result?.id); A().setModule('graphiques'); toast('Diagramme importé.'); }
        catch (e) { toast(e.message, 'error'); }
    }
    ext.importDiagramFile = importFile;

    /* ─── Sur la fiche d'une personne, dans une enquête, dans un projet de l'Atelier ─── */
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks.diagrams = (index, detail) => A().card(index, '📊 Diagrammes', '', `<div data-dg-host data-dg-owner="person" data-dg-key="${Number(detail.person?.id || detail.id) || 0}" data-dg-hidecard></div>`, 'span-12');
    async function fillHost(box) {
        box.dataset.dgFilled = '1';
        const owner = box.dataset.dgOwner, key = Number(box.dataset.dgKey); if (!key) return;
        let rows = [];
        try { rows = (await api('diagrams', {entity_type: owner, entity_id: key})).diagrams || []; } catch (_) { return; }
        rows.forEach(d => { if (cache && !byId(d.id)) cache.push(d); });
        const card = box.hasAttribute('data-dg-hidecard') ? box.closest('.card') : null;
        if (card) card.hidden = !rows.length;
        const add = `<button type="button" class="button small secondary" data-dg-hostadd>＋ Diagramme</button>`;
        box.innerHTML = owner === 'person' ? `<div class="h-dg-hostgrid">${rows.map(d => ext.diagramEmbedHtml(d.id)).join('')}</div>`
            : `<section class="h-dg-host"><div class="section-title"><div><span class="eyebrow">DIAGRAMMES</span><h3>📊 Diagrammes${rows.length ? ` <small>(${rows.length})</small>` : ''}</h3></div><div class="page-actions">${add}</div></div>${rows.length ? `<div class="h-dg-hostgrid">${rows.map(d => `<div><strong class="h-dg-hostname">${esc(d.name)}${(d.links || []).filter(l => l.type === 'investigation_item' && l.inv === key).map(l => ` <small>🧩 ${esc(l.name.split(' — ')[0])}</small>`).join('')}</strong>${ext.diagramEmbedHtml(d.id)}</div>`).join('')}</div>` : ''}</section>`;
        box.querySelector('[data-dg-hostadd]')?.addEventListener('click', async () => {
            const id = await ext.pickDiagram({title: 'Ajouter un diagramme', link: {type: owner, id: key, name: ''}}); if (!id) return;
            try { await post('link_diagram', {id, type: owner, entity_id: key}); await list(true); delete box.dataset.dgFilled; fillHost(box); } catch (e) { toast(e.message, 'error'); }
        });
    }
    function fillHosts() {
        const ws = document.getElementById('workspace');
        ws?.querySelectorAll('[data-rc-host][data-rc-type="investigation"], [data-rc-host][data-rc-type="atelier_project"]').forEach(rc => {
            const type = rc.dataset.rcType, key = rc.dataset.rcKey;
            if (!rc.parentElement.querySelector(`:scope > [data-dg-host][data-dg-key="${CSS.escape(key)}"]`)) rc.insertAdjacentHTML('beforebegin', `<div data-dg-host data-dg-owner="${type}" data-dg-key="${esc(key)}"></div>`);
        });
        document.querySelectorAll('[data-dg-host]:not([data-dg-filled])').forEach(b => fillHost(b).catch(() => {}));
    }

    // la liste est chargée tôt : la colonne de Graphiques la montre sans attendre
    setTimeout(() => { if (window.LCNDA_APP?.api) list().then(() => { if (S().module === 'graphiques') A().renderSidebar?.(); }).catch(() => {}); }, 400);
    ext.diagramsInternals = {parseTable, pasteInto, fillFrom, gridCols, list, specCsv, TEMPLATES, presetSpec, openEditor, chooseType};
})();
