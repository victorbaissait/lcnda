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
        if (!spec.live?.key || !ext.diagramStatRows) return spec;
        let hit = liveMem.get(spec.live.key);
        if (!hit || Date.now() - hit.t > 60000) { hit = {t: Date.now(), rows: ext.diagramStatRows(spec.live.key)}; liveMem.set(spec.live.key, hit); }
        try { return fillFrom(spec, await hit.rows, spec.live.label); } catch (e) { liveMem.delete(spec.live.key); return spec; }
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
    const svgOf = async d => R().svg(await resolveLive(specOf(d)));

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
    async function exportAs(fmt, name, spec) {
        const svg = R().svg(await resolveLive(spec));
        if (fmt === 'svg') return download(new Blob([svg], {type: 'image/svg+xml'}), fileName(name) + '.svg');
        if (fmt === 'csv') return download(new Blob(['﻿' + specCsv(spec)], {type: 'text/csv;charset=utf-8'}), fileName(name) + '.csv');
        if (fmt === 'json') return download(new Blob([JSON.stringify({lcnda_diagram: 1, name, kind: spec.kind, spec}, null, 1)], {type: 'application/json'}), fileName(name) + '.diagramme.json');
        const c = await svgToCanvas(svg, 2, fmt === 'jpg' ? '#ffffff' : '');
        if (fmt === 'copy') { try { const b = await new Promise(r => c.toBlob(r, 'image/png')); await navigator.clipboard.write([new ClipboardItem({'image/png': b})]); toast('Image copiée : colle-la où tu veux (⌘V).'); } catch (_) { toast('Copie impossible ici : utilise « Image PNG ».', 'error'); } return; }
        c.toBlob(b => download(b, fileName(name) + (fmt === 'jpg' ? '.jpg' : '.png')), fmt === 'jpg' ? 'image/jpeg' : 'image/png', .92);
    }
    const exportMenu = attr => `<span class="h-dg-exp"><button type="button" class="button small secondary" ${attr}="png">🖼️ PNG</button><button type="button" class="button small secondary" ${attr}="jpg">JPG</button><button type="button" class="button small secondary" ${attr}="svg" title="Image vectorielle, nette à toutes les tailles (impression, mise en page)">SVG</button><button type="button" class="button small secondary" ${attr}="csv">📄 CSV</button><button type="button" class="button small secondary" ${attr}="copy" title="Copier l’image pour la coller ailleurs">📋 Copier</button><button type="button" class="button small secondary" ${attr}="json" title="Le diagramme et ses données, pour le recharger dans une autre généalogie">⤓ Fichier</button></span>`;

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
    function ensureFixed(g, spec) { if (!g.fixed) return; const have = spec[g.key] || []; spec[g.key] = g.fixed.map(f => ({...(have.find(r => r.region === f) || {}), region: f})); }
    function gridHtml(g, gi, spec) {
        ensureFixed(g, spec);
        const cols = gridCols(g, spec), rows = spec[g.key] = Array.isArray(spec[g.key]) ? spec[g.key] : [];
        const pal = R().PALETTES[spec.o?.palette] || R().PALETTES.vive;
        const cell = (c, r, ri) => {
            const v = r[c.k] ?? '', at = `data-g="${gi}" data-r="${ri}" data-k="${esc(c.k)}"`;
            if (c.type === 'readonly') return `<td class="h-dg-ro">${esc(v)}</td>`;
            if (c.type === 'color') return `<td class="h-dg-colcell"><input type="color" ${at} value="${esc(R().color(v, pal[ri % pal.length]).startsWith('#') && /^#[0-9a-f]{6}$/i.test(R().color(v, '')) ? v : pal[ri % pal.length])}" title="${v ? 'Couleur choisie' : 'Couleur automatique'}" class="${v ? '' : 'is-auto'}">${v ? `<button type="button" class="h-dg-x" data-dg-autocolor ${at} title="Revenir à la couleur automatique">↺</button>` : ''}</td>`;
            if (c.type === 'select') return `<td><select ${at}>${c.choices.map(([k, l]) => `<option value="${esc(k)}" ${String(v) === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></td>`;
            return `<td><input ${at} value="${esc(v)}" ${c.type === 'number' ? 'inputmode="decimal" class="is-num"' : ''} placeholder="${esc(c.ph || '')}"></td>`;
        };
        const head = cols.map(c => c.series !== undefined && g.series === true ? `<th><span class="h-dg-sername"><input data-dg-sername="${c.series}" value="${esc(spec.series?.[c.series]?.name || '')}" placeholder="${esc(c.label)}"><input type="color" data-dg-sercolor="${c.series}" value="${esc(/^#[0-9a-f]{6}$/i.test(spec.series?.[c.series]?.color || '') ? spec.series[c.series].color : pal[c.series % pal.length])}" title="Couleur de la série">${(spec.series || []).length > 1 ? `<button type="button" class="h-dg-x" data-dg-delser="${c.series}" title="Supprimer cette série">✕</button>` : ''}</span></th>`
            : c.series !== undefined ? `<th><span class="h-dg-sername"><input data-dg-sername="${c.series}" value="${esc(spec.series?.[c.series]?.name || '')}" placeholder="${esc(c.label)}"><input type="color" data-dg-sercolor="${c.series}" value="${esc(/^#[0-9a-f]{6}$/i.test(spec.series?.[c.series]?.color || '') ? spec.series[c.series].color : pal[c.series % pal.length])}" title="Couleur"></span></th>` : `<th>${esc(c.label)}</th>`).join('');
        const canAdd = !g.fixed && !(g.max && rows.length >= g.max);
        return `<section class="h-dg-grid" data-grid="${gi}"><h4>${esc(g.label)} <small>(${rows.length})</small></h4>
            <div class="h-dg-tablewrap"><table><thead><tr>${head}<th></th></tr></thead><tbody>${rows.map((r, ri) => `<tr>${cols.map(c => cell(c, r, ri)).join('')}<td class="h-dg-rowtools">${g.fixed ? '' : `<button type="button" data-dg-row="up" data-g="${gi}" data-r="${ri}" title="Monter">↑</button><button type="button" data-dg-row="down" data-g="${gi}" data-r="${ri}" title="Descendre">↓</button><button type="button" data-dg-row="dup" data-g="${gi}" data-r="${ri}" title="Dupliquer">⧉</button><button type="button" data-dg-row="del" data-g="${gi}" data-r="${ri}" title="Supprimer">✕</button>`}</td></tr>`).join('')}</tbody></table></div>
            <div class="h-dg-gridtools">${canAdd ? `<button type="button" class="button small" data-dg-add="${gi}">+ Ligne</button>` : ''}${g.series === true ? `<button type="button" class="button small secondary" data-dg-addser="${gi}">+ Série (colonne de chiffres)</button>` : ''}${g.fixed ? '' : `<button type="button" class="button small secondary" data-dg-paste="${gi}" title="Copier des cellules dans Excel, LibreOffice, Numbers… et les coller ici">📋 Coller un tableau</button><label class="button small secondary h-dg-file">📥 CSV<input type="file" accept=".csv,.tsv,.txt,text/csv" data-dg-csv="${gi}" hidden></label>`}${rows.length > 1 && cols.some(c => c.type === 'number') && !g.fixed ? `<button type="button" class="button small secondary" data-dg-sort="${gi}" title="Ranger du plus grand au plus petit">⇅ Trier</button>` : ''}${rows.length && !g.fixed ? `<button type="button" class="link-button" data-dg-clear="${gi}">Vider</button>` : ''}</div></section>`;
    }
    /** texte d'un tableur (tabulations) ou CSV (; ou ,) → lignes de cellules */
    function parseTable(text) {
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
        if (o.type === 'check') return `<label class="checkbox-line"><input type="checkbox" ${at} ${(v ?? o.def) ? 'checked' : ''}> ${esc(o.label)}</label>`;
        if (o.type === 'select') return `<label>${esc(o.label)}<select ${at}>${o.choices.map(([k, l]) => `<option value="${esc(k)}" ${String(v ?? o.def ?? '') === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
        if (o.type === 'range') return `<label>${esc(o.label)} <output>${esc(v ?? o.def ?? '')}</output><input type="range" ${at} min="${o.min}" max="${o.max}" step="${o.step || 1}" value="${esc(v ?? o.def ?? o.min)}"></label>`;
        if (o.type === 'color') return `<label class="h-dg-colopt">${esc(o.label)}<input type="color" ${at} value="${esc(/^#[0-9a-f]{6}$/i.test(v || '') ? v : o.def || '#000000')}"></label>`;
        return `<label>${esc(o.label)}<input ${at} value="${esc(v ?? '')}" ${o.type === 'number' ? 'inputmode="decimal"' : ''} placeholder="${esc(o.def ?? '')}"></label>`;
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
                // l'ordre, les types cachés et les groupes à soi : Maintenance → Types de diagrammes (heritage-diagram-kinds.js)
                const all = TEMPLATES(), groups = {};
                if (ext.diagramCatalog) ext.diagramCatalog(all).forEach(([g, items]) => { groups[g] = items.map(t => [t, all.indexOf(t)]); });
                else all.forEach((t, i) => { (groups[t.group] = groups[t.group] || []).push([t, i]); });
                dlg.innerHTML = `<div class="h-dg-galhead"><div><span class="eyebrow">📊 DIAGRAMMES</span><h2>${esc(title)}</h2><p class="muted">Choisis un dessin : il arrive avec un exemple que tu remplaces par tes chiffres (à la main, collés d’un tableur, d’un CSV, ou pris dans l’app).</p></div><span>${ext.openDiagramKindsEditor ? '<button type="button" class="button small secondary" data-kinds-cfg title="Ordre, types montrés ou cachés, groupes à toi">⚙️ Ranger les types</button>' : ''}<button type="button" class="icon-button" data-close>×</button></span></div>
                ${Object.entries(groups).map(([g, items]) => `<h4>${esc(g)}</h4><div class="h-dg-tiles">${items.map(([t, i]) => `<button type="button" class="h-dg-tile ${current === t.kind && !t.o && !t.preset ? 'is-current' : ''}" data-tpl="${i}"><span class="h-dg-mini">${R().svg({...presetSpec(t), o: {...presetSpec(t).o, title: '', subtitle: '', source: '', legend: 'none', scale: 1.6}}, 480)}</span><span>${esc(t.icon)} ${esc(t.label)}</span></button>`).join('')}</div>`).join('')}`;
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
        else if (id) { const d = await get(id); if (!d) return toast('Diagramme introuvable.', 'error'); rec = {id: d.id, name: d.name, spec: specOf(d), links: clone(d.links || [])}; }
        else {
            const t = kind ? {kind} : await chooseType(); if (!t) return null;
            const spec = presetSpec(t);
            rec = {id: 0, name: spec.o.title || R().KINDS[t.kind].label, spec, links: link ? [link] : []};
        }
        let spec = rec.spec, tab = 'data', dirty = !rec.id, timer = 0;
        const dlg = document.createElement('dialog'); dlg.className = 'modal h-dg-dlg'; dlg.dataset.ownClose = '1';
        const kindOf = () => R().KINDS[spec.kind] || R().KINDS.columns;
        dlg.innerHTML = `<div class="h-dg-shell">
            <header class="h-dg-top"><input class="h-dg-name" data-dg-name value="${esc(rec.name)}" maxlength="200" aria-label="Nom du diagramme"><button type="button" class="button small secondary" data-dg-type></button>
                <span class="h-dg-spacer"></span><details class="h-dg-expmenu"><summary class="button small secondary">⤓ Exporter</summary>${exportMenu('data-dg-exp')}</details><button type="button" class="button small" data-dg-save>Enregistrer</button><button type="button" class="icon-button" data-dg-close title="Fermer">×</button></header>
            <div class="h-dg-body"><aside class="h-dg-side"><nav class="segmented h-dg-tabs"><button type="button" data-dg-tab="data">Données</button><button type="button" data-dg-tab="opts">Réglages</button><button type="button" data-dg-tab="app">Depuis l’app</button><button type="button" data-dg-tab="links">Rattacher</button></nav><div class="h-dg-pane"></div></aside>
                <main class="h-dg-preview"><div class="h-dg-svg" data-dg-preview></div></main></div></div>`;
        document.body.appendChild(dlg);
        const pane = dlg.querySelector('.h-dg-pane'), prev = dlg.querySelector('[data-dg-preview]');
        const draw = async () => { const s = await resolveLive(spec); prev.innerHTML = R().svg(s); };
        const later = () => { dirty = true; clearTimeout(timer); timer = setTimeout(draw, 90); };
        const paint = () => {
            dlg.querySelector('[data-dg-type]').textContent = `${kindOf().icon} ${kindOf().label} ▾`;
            dlg.querySelectorAll('[data-dg-tab]').forEach(b => b.classList.toggle('is-active', b.dataset.dgTab === tab));
            if (tab === 'data') pane.innerHTML = (spec.live ? `<p class="h-dg-live">🔄 Chiffres tenus à jour depuis « ${esc(spec.live.label || 'l’app')} » : ils sont relus à chaque affichage. <button type="button" class="link-button" data-dg-unlive>Les figer (les modifier à la main)</button></p>` : '') + kindOf().grids.map((g, gi) => gridHtml(g, gi, spec)).join('');
            else if (tab === 'opts') pane.innerHTML = `<div class="h-dg-opts"><h4>${esc(kindOf().label)}</h4>${kindOf().options.map(o => optHtml(o, spec)).join('') || '<p class="muted">Pas de réglage particulier.</p>'}<h4>Présentation</h4>${R().COMMON.map(o => optHtml(o, spec)).join('')}</div>`;
            else if (tab === 'app') pane.innerHTML = appPaneHtml();
            else pane.innerHTML = linksHtml();
            if (tab === 'app') bindAppPane(); if (tab === 'links') bindLinks();
        };
        /* données prises dans l'app */
        const appPaneHtml = () => {
            const k = spec.kind, people = k === 'timeline' || k === 'chrono', stats = TABLE_KINDS.includes(k) || ['parliament', 'wordcloud', 'pictogram'].includes(k);
            return `<div class="h-dg-app">${stats ? `<h4>📊 Des chiffres de l’app</h4><p class="muted">Remplace le tableau par une statistique : un exemple, une statistique de l’app (noms, lieux, âges…) ou une de « Mes statistiques » (faites dans Maintenance → Éditeur de statistiques, avec tous leurs critères).</p>
                <label>Statistique<select data-dg-src><option value="">Chargement…</option></select></label><label class="checkbox-line"><input type="checkbox" data-dg-srclive> 🔄 Tenir à jour (relire les chiffres à chaque affichage)</label><button type="button" class="button small" data-dg-srcgo>Prendre ces chiffres</button>` : ''}
                ${people ? `<h4>👥 Des personnes de la base</h4><p class="muted">${k === 'timeline' ? 'Chaque personne devient une ligne, de sa naissance à son décès (rôle : Homme ou Femme, à changer à volonté).' : 'Leurs naissances, mariages et décès deviennent des dates de la frise.'}</p>
                <div class="h-pr-addlink"><input type="search" data-dg-pq placeholder="Tape un nom…" autocomplete="off"><span class="h-pr-lsugg" hidden></span></div>` : ''}
                ${!stats && !people ? '<p class="muted">Ce type de diagramme se remplit à la main, en collant un tableau ou avec un CSV (onglet Données).</p>' : ''}</div>`;
        };
        function bindAppPane() {
            const sel = pane.querySelector('[data-dg-src]');
            if (sel && ext.diagramStatSources) ext.diagramStatSources().then(src => { const g = {}; src.forEach(([key, label, grp]) => { (g[grp] = g[grp] || []).push([key, label]); }); sel.innerHTML = Object.entries(g).map(([grp, items]) => `<optgroup label="${esc(grp)}">${items.map(([key, label]) => `<option value="${esc(key)}" ${spec.live?.key === key ? 'selected' : ''}>${esc(label)}</option>`).join('')}</optgroup>`).join(''); }).catch(() => { sel.innerHTML = '<option value="">Indisponible</option>'; });
            else if (sel) sel.innerHTML = '<option value="">Indisponible</option>';
            pane.querySelector('[data-dg-srcgo]')?.addEventListener('click', async () => {
                const key = sel.value; if (!key) return; const label = sel.selectedOptions[0]?.textContent || '';
                try { const pairs = await ext.diagramStatRows(key); if (!pairs.length) return toast('Aucun chiffre pour cette statistique.', 'error');
                    spec = fillFrom(spec, pairs, label); if (pane.querySelector('[data-dg-srclive]').checked) spec.live = {key, label}; else delete spec.live;
                    if (!spec.o.title || spec.o.title === kindOf().sample().o?.title) spec.o.title = label;
                    tab = 'data'; paint(); later(); toast(`${pairs.length} valeur${pairs.length > 1 ? 's' : ''} prise${pairs.length > 1 ? 's' : ''} dans l’app.`); } catch (e) { toast(e.message, 'error'); }
            });
            const input = pane.querySelector('[data-dg-pq]'); if (!input) return;
            const sugg = input.nextElementSibling; let t = 0;
            input.addEventListener('input', () => { clearTimeout(t); const q = input.value.trim(); if (q.length < 2) { sugg.hidden = true; return; } t = setTimeout(async () => {
                const people = (await api('search', {type: 'persons', q, limit: 10}).catch(() => ({}))).data || [];
                sugg.innerHTML = people.map(p => `<button type="button" data-dg-addp="${p.id}">👤 ${esc(A().personName(p))}</button>`).join('') || '<small class="muted">Personne.</small>'; sugg.hidden = false; }, 220); });
            sugg.addEventListener('click', async e => { const b = e.target.closest('[data-dg-addp]'); if (!b) return;
                const r = await api('diagram_people', {ids: b.dataset.dgAddp}).catch(err => { toast(err.message, 'error'); return null; }); const p = r?.people?.[0]; if (!p) return;
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
                input.value = ''; sugg.hidden = true; later(); toast(`${p.name} ajouté${p.gender === 'female' ? 'e' : ''}.`); });
        }
        /* rattacher à des personnes, enquêtes, parties d'enquête, projets de l'Atelier */
        const lchip = l => `<span class="h-pr-lchip" data-type="${esc(l.type)}" data-id="${Number(l.id)}">${LINK_IC[l.type] || '🔗'} ${esc(l.name)} <button type="button" data-dg-unlink aria-label="Retirer">×</button></span>`;
        const linksHtml = () => `<div class="h-pr-links"><p class="muted">Le diagramme apparaît alors sur la fiche de la personne, dans l’enquête ou dans le projet de l’Atelier. Pour le poser ailleurs : un widget (Maintenance → Éditeur de widgets), un bloc de fiche, la mise en page.</p><span class="h-pr-linkchips">${rec.links.map(lchip).join('') || '<small class="muted">Rattaché à rien pour l’instant.</small>'}</span>
            <span class="h-pr-addlink"><input type="search" data-dg-lq placeholder="Une personne, une enquête, une partie d’enquête, un projet…" autocomplete="off"><span class="h-pr-lsugg" hidden></span></span></div>`;
        let invCache = null, projCache = null;
        function bindLinks() {
            const input = pane.querySelector('[data-dg-lq]'), sugg = input.nextElementSibling; let t = 0;
            pane.querySelector('.h-pr-linkchips').addEventListener('click', e => { const c = e.target.closest('[data-dg-unlink]')?.closest('.h-pr-lchip'); if (!c) return; rec.links = rec.links.filter(l => !(l.type === c.dataset.type && Number(l.id) === Number(c.dataset.id))); dirty = true; paint(); });
            input.addEventListener('input', () => { clearTimeout(t); const q = input.value.trim(), ql = q.toLowerCase(); if (q.length < 2) { sugg.hidden = true; return; } t = setTimeout(async () => {
                let people = [], invs = [], parts = [], projs = [];
                await Promise.all([
                    api('search', {type: 'persons', q, limit: 8}).then(r => { people = r.data || []; }).catch(() => {}),
                    (invCache ? Promise.resolve() : api('investigations', {status: 'all'}).then(r => { invCache = r.investigations || []; })).then(() => { invs = (invCache || []).filter(i => String(i.title || '').toLowerCase().includes(ql)).slice(0, 6); }).catch(() => {}),
                    api('periodical_link_search', {q}).then(r => { parts = r.items || []; }).catch(() => {}),
                    (projCache ? Promise.resolve() : api('atelier_projects').then(r => { projCache = r.projects || []; })).then(() => { projs = (projCache || []).filter(p => String(p.title || '').toLowerCase().includes(ql)).slice(0, 6); }).catch(() => {}),
                ]);
                const b = (type, id, name) => `<button type="button" data-add-type="${type}" data-add-id="${Number(id)}" data-add-name="${esc(name)}">${LINK_IC[type]} ${esc(name)}</button>`;
                sugg.innerHTML = [...people.map(p => b('person', p.id, A().personName(p))), ...invs.map(i => b('investigation', i.id, i.title)), ...parts.map(x => b('investigation_item', x.id, x.name)), ...projs.map(p => b('atelier_project', p.id, p.title))].join('') || '<small class="muted">Rien trouvé.</small>';
                sugg.hidden = false; }, 220); });
            input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); sugg.querySelector('[data-add-type]')?.click(); } });
            sugg.addEventListener('click', e => { const s = e.target.closest('[data-add-type]'); if (!s) return; if (!rec.links.some(l => l.type === s.dataset.addType && Number(l.id) === Number(s.dataset.addId))) rec.links.push({type: s.dataset.addType, id: Number(s.dataset.addId), name: s.dataset.addName}); dirty = true; paint(); pane.querySelector('[data-dg-lq]')?.focus(); });
        }
        const grid = gi => kindOf().grids[Number(gi)];
        pane.addEventListener('input', e => {
            const el = e.target;
            if (el.dataset.k !== undefined && el.dataset.g !== undefined) { const g = grid(el.dataset.g), row = spec[g.key][Number(el.dataset.r)]; if (!row) return; row[el.dataset.k] = el.value; if (el.type === 'color') { el.classList.remove('is-auto'); } if (spec.live && g.key === 'rows' && el.type !== 'color') { delete spec.live; } return later(); }
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
            pasteInto(grid(f.dataset.dgCsv), spec, parseTable(await f.files[0].text())); delete spec.live; paint(); later(); toast('Tableau importé.');
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
            if (b.dataset.dgPaste !== undefined) {
                const gi = b.dataset.dgPaste;
                ext.openDialog({eyebrow: 'DIAGRAMME', title: 'Coller un tableau', body: '<p class="muted">Sélectionne des cellules dans Excel, LibreOffice, Numbers ou Google Sheets, copie-les (⌘C / Ctrl+C) et colle-les ici. Si la première ligne contient des titres, ils deviennent les noms des séries. Le tableau actuel est remplacé.</p><textarea name="t" rows="12" class="h-dg-pastearea" placeholder="Rennes&#9;42&#10;Nantes&#9;25"></textarea>', submitLabel: 'Remplacer le tableau',
                    onSubmit: form => { const t = form.querySelector('[name=t]').value; if (!t.trim()) return false; pasteInto(grid(gi), spec, parseTable(t)); delete spec.live; keep(); }});
            }
        });
        const close = async () => { if (dirty && !await A().confirmBox('Fermer sans enregistrer les changements ?', {title: 'Changements non enregistrés', okLabel: 'Fermer sans enregistrer', danger: true})) return; dlg.close(); dlg.remove(); onClose?.(); };
        dlg.addEventListener('cancel', e => { e.preventDefault(); close(); });
        dlg.querySelector('[data-dg-close]').addEventListener('click', close);
        dlg.querySelector('[data-dg-name]').addEventListener('input', e => { rec.name = e.target.value; dirty = true; });
        dlg.querySelectorAll('[data-dg-tab]').forEach(b => b.addEventListener('click', () => { tab = b.dataset.dgTab; paint(); }));
        dlg.querySelector('[data-dg-type]').addEventListener('click', async () => {
            const t = await chooseType({current: spec.kind, title: 'Changer de type'}); if (!t) return;
            const tableToTable = TABLE_KINDS.includes(t.kind) && TABLE_KINDS.includes(spec.kind);
            const same = t.kind === spec.kind;
            if (same || tableToTable) { spec.kind = t.kind; spec.o = {...spec.o, ...(t.o || {})}; }
            else { const hasData = (spec.rows || []).length; const keepO = {title: spec.o.title, subtitle: spec.o.subtitle, source: spec.o.source, palette: spec.o.palette, width: spec.o.width, bg: spec.o.bg};
                if (hasData && !await A().confirmBox('Ce type ne lit pas le même tableau : l’exemple remplace tes données. Continuer ?', {title: 'Changer de type', okLabel: 'Remplacer mes données'})) return;
                spec = presetSpec(t); Object.entries(keepO).forEach(([k, v]) => { if (v !== undefined && v !== '') spec.o[k] = v; }); }
            dirty = true; paint(); draw();
        });
        dlg.querySelectorAll('[data-dg-exp]').forEach(b => b.addEventListener('click', () => { exportAs(b.dataset.dgExp, rec.name, spec).catch(e => toast(e.message, 'error')); b.closest('details').open = false; }));
        dlg.querySelector('[data-dg-save]').addEventListener('click', async () => {
            const btn = dlg.querySelector('[data-dg-save]'); btn.disabled = true;
            try {
                const {kind: k, ...rest} = spec;
                const r = await post('save_diagram', {id: rec.id || 0, name: rec.name.trim() || spec.o.title || 'Mon diagramme', kind: k, spec: rest, links: rec.links.map(l => ({type: l.type, id: l.id}))});
                rec.id = Number(r.result?.id || r.id || rec.id); dirty = false;
                await list(true); refreshEmbeds(rec.id); liveMem.clear();
                toast('Diagramme enregistré.');
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
            <div class="h-dg-tiles"><button type="button" class="h-dg-tile is-new" data-new><span class="h-dg-mini h-dg-plus">＋</span><span>Nouveau diagramme</span></button>${ext.diagramFromStat ? '<button type="button" class="h-dg-tile is-new" data-fromstat><span class="h-dg-mini h-dg-plus">📊</span><span>D’une statistique (de l’app ou à moi, tenue à jour)</span></button><button type="button" class="h-dg-tile is-new" data-import><span class="h-dg-mini h-dg-plus">📥</span><span>Importer (fichier, tableau, Wikipédia, image)</span></button>' : ''}${all.map(d => `<button type="button" class="h-dg-tile" data-pick="${d.id}"><span class="h-dg-mini">${R().svg({...specOf(d), o: {...(d.spec?.o || {}), legend: 'none', source: '', subtitle: ''}}, 480)}</span><span>${esc(R().KINDS[d.kind]?.icon || '📊')} ${esc(d.name)}</span></button>`).join('')}</div>`;
        document.body.appendChild(dlg);
        const done = v => { dlg.close(); dlg.remove(); resolve(v); };
        dlg.addEventListener('cancel', e => { e.preventDefault(); done(null); });
        dlg.addEventListener('click', async e => {
            if (e.target.closest('[data-close]')) return done(null);
            const p = e.target.closest('[data-pick]'); if (p) return done(Number(p.dataset.pick));
            if (e.target.closest('[data-new]')) { dlg.close(); dlg.remove(); const r = await openEditor(null, {link, onSave: id => resolve(id), onClose: () => resolve(null)}); if (!r) resolve(null); }
            if (e.target.closest('[data-fromstat]')) { dlg.close(); dlg.remove(); resolve(await ext.diagramFromStat({link})); }
            if (e.target.closest('[data-import]')) { dlg.close(); dlg.remove(); resolve(await ext.diagramImport({link})); }
        });
        dlg.showModal();
    });

    /* ─── Graphiques → « Mes diagrammes » ─── */
    ext.diagramItems = () => (cache || []).map(d => [d.id, `${R()?.KINDS[d.kind]?.icon || '📊'} ${d.name}`]);
    ext.renderDiagramPage = async (token, id) => {
        const ws = A().$('#workspace');
        if (!id) { await list(); id = cache?.[0]?.id; }
        const d = id ? await get(id) : null;
        if (token !== S().workspaceToken || S().module !== 'graphiques') return;
        if (!d) { ws.innerHTML = `<section class="page"><header class="page-header"><div><span class="eyebrow">MES DIAGRAMMES</span><h2>Créer un diagramme</h2><p>Hémicycle d’une assemblée, fer à cheval, frise des membres d’un groupe de musique façon Wikipédia, frise de vies, camembert, flux de migrations, organigramme, nuage de noms… avec tes propres chiffres ou ceux de l’app. Ils se posent ensuite partout : tableau de bord, fiches, fiche d’une personne, enquêtes, Atelier, mise en page.</p></div><div class="page-actions"><button type="button" class="button" data-dg-new>+ Nouveau diagramme</button><label class="button secondary h-dg-file">⤒ Importer un fichier<input type="file" accept=".json,application/json" data-dg-import hidden></label></div></header></section>`; bindPage(ws, null); return; }
        ws.innerHTML = `<section class="page h-dg-page"><header class="page-header"><div><span class="eyebrow">MES DIAGRAMMES · ${esc(R().KINDS[d.kind]?.label || '')}</span><h2>${esc(d.name)}</h2>${d.spec?.live ? `<p>🔄 Chiffres tenus à jour depuis « ${esc(d.spec.live.label || 'l’app')} ».</p>` : ''}</div>
            <div class="page-actions"><button type="button" class="button" data-dg-edit="${d.id}">✎ Modifier</button><button type="button" class="button secondary" data-dg-dup>⧉ Dupliquer</button><button type="button" class="button secondary" data-dg-dash title="Le poser sur le tableau de bord, comme un widget">➕ Tableau de bord</button><button type="button" class="button danger" data-dg-del>Supprimer</button></div></header>
            <div class="h-dg-pagetools">${exportMenu('data-dg-pexp')}<button type="button" class="button small secondary" data-dg-print>🖨️ Imprimer / PDF</button></div>
            <div class="card h-dg-big"><div class="h-dg-svg">${await svgOf(d)}</div></div>
            ${d.links?.length ? `<div class="h-dg-linked"><span class="section-label">Rattaché à</span>${d.links.map(l => `<button type="button" class="h-pr-lchip" data-dg-golink="${esc(l.type)}:${l.id}:${l.inv || 0}">${LINK_IC[l.type] || '🔗'} ${esc(l.name)}</button>`).join('')}</div>` : ''}
            <p class="muted h-dg-where">Pour le poser ailleurs : <b>Maintenance → Éditeur de widgets</b> (partie « Diagramme ») pour le tableau de bord ou un onglet, un bloc « 📊 Diagramme » dans une <b>Fiche</b>, « Rattacher » (onglet de l’éditeur) pour la fiche d’une personne, une enquête ou un projet de l’Atelier, et « Insérer → Diagramme » dans la <b>mise en page</b>.</p></section>`;
        bindPage(ws, d);
    };
    function bindPage(ws, d) {
        ws.querySelector('[data-dg-new]')?.addEventListener('click', () => openEditor(null));
        ws.querySelector('[data-dg-import]')?.addEventListener('change', e => importFile(e.target.files?.[0]));
        if (!d) return;
        ws.querySelectorAll('[data-dg-pexp]').forEach(b => b.addEventListener('click', () => exportAs(b.dataset.dgPexp, d.name, specOf(d)).catch(e => toast(e.message, 'error'))));
        ws.querySelector('[data-dg-print]').addEventListener('click', async () => { const w = window.open('', '_blank'); if (!w) return toast('Fenêtre bloquée par le navigateur.', 'error'); w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(d.name)}</title><style>body{margin:0}svg{width:100%;height:auto}</style>${await svgOf(d)}<script>onload=()=>setTimeout(()=>print(),200)<\/script>`); w.document.close(); });
        ws.querySelector('[data-dg-dup]').addEventListener('click', async () => { try { const r = await post('save_diagram', {name: d.name + ' (copie)', kind: d.kind, spec: d.spec}); await list(true); S().graphDiagramId = Number(r.result?.id); A().setModule('graphiques'); toast('Copie créée.'); } catch (e) { toast(e.message, 'error'); } });
        ws.querySelector('[data-dg-del]').addEventListener('click', async () => { if (!await A().confirmBox(`Supprimer le diagramme « ${d.name} » ? Il disparaît aussi des widgets, fiches et enquêtes où il est posé.`, {title: 'Supprimer le diagramme', okLabel: 'Supprimer le diagramme'})) return; try { await post('delete_diagram', {id: d.id}); await list(true); S().graphDiagramId = cache[0]?.id || 0; if (!cache.length) S().graphMode = 'diagram'; A().setModule('graphiques'); toast('Diagramme supprimé.'); } catch (e) { toast(e.message, 'error'); } });
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
        if (!ext.addDiagramWidget) return toast('Passe par Maintenance → Éditeur de widgets.', 'error');
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
        const add = `<button type="button" class="button small secondary" data-dg-hostadd>+ Diagramme</button>`;
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
