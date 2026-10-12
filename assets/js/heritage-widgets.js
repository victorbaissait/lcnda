/**
 * 🧱 Éditeur de widgets (Maintenance → Éditeur de widgets) : ses propres widgets pour le tableau de bord, sans programmer.
 *  - partir de rien (chiffres, liste, graphique, texte, raccourcis), d'un widget de l'app (copie modifiable, ou le même
 *    widget « habillé » : titre, icône, couleur, texte à soi), d'un de ses widgets, ou d'un exemple ;
 *  - les données viennent des mêmes sources que « Mes listes » (personnes, événements, listes de l'app, Mes listes),
 *    avec les mêmes critères (serveur : widget_rows dans lib/my_lists.php) ;
 *  - rangés dans le réglage « genealogie-custom-widgets » (suit la base et la sauvegarde) ; partage par fichier.
 * Chargé après app.js et heritage-more.js (window.LCNDA_APP, window.LCNDA_EXT).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    for (const key of ['dashboard', 'maintenance']) ext[key] = ext[key] || {};
    const esc = value => A().escapeHtml(value ?? '');
    const nl = value => esc(value).replace(/\n/g, '<br>');
    const api = (...args) => A().api(...args);
    const toast = (...args) => A().toast(...args);
    const S = () => A().state;
    const fmt = n => Number(n || 0).toLocaleString('fr-FR');
    const plural = (n, one, many) => `${fmt(n)} ${n > 1 ? many : one}`;
    const isCurrent = token => token === S().workspaceToken && S().module === 'maintenance';
    const header = (eyebrow, title, intro, actions = '') => `<header class="page-header"><div><span class="eyebrow">${esc(eyebrow)}</span><h2>${esc(title)}</h2>${intro ? `<p>${intro}</p>` : ''}</div>${actions ? `<div class="page-actions">${actions}</div>` : ''}</header>`;
    const pname = p => p ? A().personName(p) : '';

    const KEY = 'genealogie-custom-widgets';
    const KINDS = {numbers: ['🔢', 'Chiffres', 'Un ou plusieurs nombres : combien de personnes, d’événements, de lieux… répondent à tes critères.'],
        list: ['📋', 'Liste', 'Les premières lignes d’une liste, avec les colonnes et l’ordre que tu veux.'],
        chart: ['📊', 'Graphique', 'Des barres ou un camembert : par métier, par lieu, par décennie, par siècle…'],
        text: ['📝', 'Texte', 'Un pense-bête, une citation, une consigne, avec des émojis.'],
        links: ['🔗', 'Raccourcis', 'Des boutons vers les écrans, les listes ou des sites que tu utilises souvent.'],
        app: ['🎨', 'Widget de l’app habillé', 'Un widget de l’app tel quel, avec ton titre, ton icône, ta couleur et ton texte.']};
    const WIDTHS = [['3', '¼'], ['4', '⅓'], ['6', '½'], ['8', '⅔'], ['12', 'toute la largeur']];
    const COLORS = ['#0066cc', '#2f8f5b', '#cc4700', '#7a47db', '#c0392b', '#a07a00', '#00838f', '#555555'];
    const color = c => /^#[0-9a-f]{6}$/i.test(String(c || '')) ? c : '';
    const newId = () => 'cw_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    /* ─── Rangement ─── */
    function defs() {
        try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.filter(d => d && /^cw_[a-z0-9]{4,24}$/.test(String(d.id))) : []; } catch (_) { return []; }
    }
    function saveDefs(list) {
        try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (_) { toast('Réglage impossible à enregistrer dans ce navigateur.', 'error'); }
        A().syncCustomDashboardWidgets();
        registerAll();
    }
    ext.customWidgetDefs = () => Object.fromEntries(defs().map(d => [d.id, d]));

    /* ─── Données ─── */
    const srcQuery = src => src.list_id ? {list_id: Number(src.list_id)} : {source: src.source || 'persons', definition: {match: src.definition?.match || 'all', rules: src.definition?.rules || []}};
    const isPeopleCol = (data, c) => { const src = data.list?.source || ''; return (['events', 'persons'].includes(src) && (c === 'who' || c === 'name')) || (!['events', 'persons', 'free'].includes(src) && c === 'person'); };
    /** Texte d'une case (comme dans « Mes listes ») */
    function cellText(data, r, c) {
        const own = (data.list?.definition?.custom || []).find(x => x.key === c);
        if (own) { const v = r.values?.[c] ?? ''; return own.type === 'checkbox' ? (v === '1' ? 'oui' : 'non') : own.type === 'person' ? (r.linked?.[c] ? pname(r.linked[c]) : '') : String(v); }
        return isPeopleCol(data, c) && r.people?.length ? r.people.map(pname).join(' et ') : String(r.cells?.[c] ?? '');
    }
    /** Colonnes proposées : celles d'une de « Mes listes » (dans son ordre, avec ses colonnes à remplir), sinon toutes */
    const dataColumns = data => {
        const all = Object.entries(data.columns || {});
        if (!data.list?.id) return all;
        const own = (data.list.definition?.columns || []).map(k => [k, data.columns?.[k] || k]);
        return (own.length ? own : all).concat((data.list.definition?.custom || []).map(c => [c.key, c.label]));
    };
    const yearOf = v => { const m = String(v).match(/(?<!\d)(\d{4})(?!\d)/); return m ? Number(m[1]) : null; };
    /** Les filtres de colonnes enregistrés dans une de « Mes listes » */
    function applyListFilters(data) {
        const filters = data.list?.definition?.filters || {};
        if (!Object.keys(filters).length) return data.rows || [];
        return (data.rows || []).filter(r => Object.entries(filters).every(([c, f]) => {
            const v = cellText(data, r, c).trim();
            if (f.values && !f.values.includes(v)) return false;
            if (f.contains && !v.toLowerCase().includes(String(f.contains).toLowerCase())) return false;
            if (f.from || f.to) { const y = yearOf(v); if (y === null || (f.from && y < f.from) || (f.to && y > f.to)) return false; }
            return true;
        }));
    }
    /** Données du widget, et celles de chaque partie en plus (datas.parts) */
    async function loadData(d) {
        const [main, ...parts] = await Promise.all([loadOne(d), ...(d.kind === 'app' ? [] : (d.parts || []).map(loadOne))]);
        main.parts = parts;
        return main;
    }
    async function loadOne(d) {
        const sources = d.kind === 'numbers' ? (d.counters || []).map(c => c.src || {}) : ['list', 'chart'].includes(d.kind) ? [d.src || {}] : [];
        return Promise.all(sources.map(async src => {
            try {
                if (d.kind === 'numbers' && !src.list_id) { const r = await api('widget_rows', {q: JSON.stringify({...srcQuery(src), count: 1})}); return {count: Number(r.count) || 0, rows: [], shown: []}; }
                const data = await api('widget_rows', {q: JSON.stringify(srcQuery(src))}); return {...data, shown: applyListFilters(data)};
            }
            catch (error) { return {error: error.message, rows: [], shown: []}; }
        }));
    }

    /* ─── Affichage ─── */
    const PALETTE = ['#0066cc', '#cc4700', '#2f8f5b', '#7a47db', '#c0392b', '#a07a00', '#00838f', '#d4588f', '#5d6d7e', '#8bc34a', '#ff9800', '#3f51b5'];
    function groupRows(data, d) {
        const col = d.group || dataColumns(data)[0]?.[0] || 'name';
        const counts = new Map();
        let counted = 0;
        for (const r of data.shown) {
            let any = false;
            let vals = [cellText(data, r, col).trim()];
            if (col === 'labels' || col === 'names') vals = vals[0].split(/\s*,\s*/);
            for (let v of vals) {
                if (d.groupBy === 'decade' || d.groupBy === 'century' || d.groupBy === 'year') {
                    const y = yearOf(v);
                    if (y === null) { v = ''; } else if (d.groupBy === 'decade') { v = `${Math.floor(y / 10) * 10}–${Math.floor(y / 10) * 10 + 9}`; } else if (d.groupBy === 'century') { const c = Math.floor((y - 1) / 100) + 1; v = `${c}${c === 1 ? 'er' : 'e'} siècle`; } else { v = String(y); }
                }
                if (v === '' && d.skipEmpty !== false) continue;
                counts.set(v || '(vide)', (counts.get(v || '(vide)') || 0) + 1);
                any = true;
            }
            if (any) counted++;
        }
        let entries = [...counts.entries()];
        const timeline = ['decade', 'century', 'year'].includes(d.groupBy);
        const when = v => { const k = yearOf(v) ?? Number.parseInt(v, 10); return Number.isFinite(k) ? k : Infinity; }; // « (vide) » en dernier
        entries.sort((a, b) => timeline ? when(a[0]) - when(b[0]) : b[1] - a[1] || a[0].localeCompare(b[0], 'fr'));
        const top = Math.max(1, Math.min(60, Number(d.limit) || 10));
        if (!timeline && entries.length > top) { const rest = entries.slice(top).reduce((n, e) => n + e[1], 0); entries = entries.slice(0, top); if (rest) entries.push(['autres', rest]); }
        entries.counted = counted; // lignes comptées (une personne à deux étiquettes compte une fois)
        return entries;
    }
    // Palettes proposées ; une couleur peut aussi être choisie pour chaque valeur (d.valueColors)
    const PALETTES = {vive: PALETTE, pastel: ['#8ab6e8', '#f2a97f', '#96d1a8', '#c0a8ec', '#ef9a9a', '#e6cf7a', '#86d0d8', '#f0a8c8', '#aab4be', '#c5e1a5', '#ffcc80', '#9fa8da'],
        terre: ['#8d5524', '#c68642', '#a0522d', '#6b8e23', '#556b2f', '#b8860b', '#7f4f24', '#936639', '#a68a64', '#656d4a', '#414833', '#c2a878'],
        mer: ['#03045e', '#023e8a', '#0077b6', '#0096c7', '#00b4d8', '#48cae4', '#90e0ef', '#2a9d8f', '#264653', '#457b9d', '#1d3557', '#a8dadc'],
        sepia: ['#4b3621', '#6f4e37', '#8b6f47', '#a0826d', '#b5967a', '#c8ad8d', '#d9c3a5', '#704214', '#5c4033', '#987654', '#c19a6b', '#e0cda9']};
    const CHART_STYLES = [['bars', 'Barres (horizontales)'], ['columns', 'Colonnes (verticales)'], ['pie', 'Camembert'], ['donut', 'Anneau'], ['line', 'Courbe'], ['area', 'Aire (courbe remplie)'], ['tiles', 'Mosaïque (carrés proportionnels)'], ['table', 'Tableau des chiffres']];
    function chartColor(d, value, i) {
        const own = d.valueColors?.[value];
        if (color(own)) return own;
        const pal = PALETTES[d.palette] || (d.palette === 'accent' && color(d.accentColor) ? null : PALETTE);
        if (!pal) { const base = d.accentColor; return `color-mix(in srgb, ${base} ${Math.max(25, 100 - i * 9)}%, white)`; }
        return pal[i % pal.length];
    }
    function chartHtml(data, d) {
        const entries = groupRows(data, d);
        if (!entries.length) return '<p class="muted">Rien à compter.</p>';
        const total = entries.reduce((n, e) => n + e[1], 0), max = Math.max(...entries.map(e => e[1]));
        const col = (v, i) => chartColor(d, v, i), pct = n => total ? Math.round(n / total * 100) : 0;
        const legend = `<ul class="h-cw-legend">${entries.map(([v, n], i) => `<li><i style="background:${col(v, i)}"></i>${esc(v)} <strong>${fmt(n)}</strong> <small class="muted">${pct(n)} %</small></li>`).join('')}</ul>`;
        if (d.style === 'pie' || d.style === 'donut') {
            let at = 0;
            const stops = entries.map(([v, n], i) => { const from = at; at += n / total * 360; return `${col(v, i)} ${from.toFixed(1)}deg ${at.toFixed(1)}deg`; }).join(',');
            return `<div class="h-cw-pie"><div class="h-cw-pie-disc ${d.style === 'donut' ? 'is-donut' : ''}" style="background:conic-gradient(${stops})" role="img" aria-label="${d.style === 'donut' ? 'Anneau' : 'Camembert'}">${d.style === 'donut' ? `<span>${fmt(total)}</span>` : ''}</div>${legend}</div>`;
        }
        if (d.style === 'columns') {
            return `<div class="h-cw-columns">${entries.map(([v, n], i) => `<div class="h-cw-col" title="${esc(v)} : ${fmt(n)}"><small>${fmt(n)}</small><i style="height:${Math.max(2, Math.round(n / max * 100))}%;background:${col(v, i)}"></i><span>${esc(v)}</span></div>`).join('')}</div>`;
        }
        if (d.style === 'line' || d.style === 'area') {
            const W = 600, H = 220, pad = 28, step = entries.length > 1 ? (W - pad * 2) / (entries.length - 1) : 0;
            const pts = entries.map(([, n], i) => [pad + i * step, H - pad - (max ? n / max : 0) * (H - pad * 2)]);
            const line = pts.map(p => p.map(x => x.toFixed(1)).join(',')).join(' ');
            const stroke = color(d.valueColors?.__line) || chartColor(d, '', 0);
            const every = Math.max(1, Math.ceil(entries.length / 12));
            return `<svg class="h-cw-line" viewBox="0 0 ${W} ${H}" role="img" aria-label="Courbe">
                <line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" class="h-cw-axis"/>
                ${d.style === 'area' ? `<polygon points="${pad},${H - pad} ${line} ${pad + (entries.length - 1) * step},${H - pad}" fill="${stroke}" fill-opacity=".25"/>` : ''}
                <polyline points="${line}" fill="none" stroke="${stroke}" stroke-width="3" stroke-linejoin="round"/>
                ${pts.map(([x, y], i) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${stroke}"><title>${esc(entries[i][0])} : ${fmt(entries[i][1])}</title></circle>${i % every === 0 ? `<text x="${x.toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(String(entries[i][0]).slice(0, 14))}</text>` : ''}`).join('')}
                <text x="${pad}" y="16">${fmt(max)}</text></svg>`;
        }
        if (d.style === 'tiles') {
            return `<div class="h-cw-tiles">${entries.map(([v, n], i) => `<div style="flex:${Math.max(1, Math.round(n / max * 100))} 1 ${Math.max(56, Math.round(Math.sqrt(n / max) * 420))}px;min-height:${Math.max(56, Math.round(Math.sqrt(n / max) * 140))}px;background:${col(v, i)}" title="${esc(v)} : ${fmt(n)}"><strong>${fmt(n)}</strong><span>${esc(v)}</span></div>`).join('')}</div>`;
        }
        if (d.style === 'table') {
            return `<table class="data-table h-cw-table"><thead><tr><th>Valeur</th><th>Nombre</th><th>Part</th></tr></thead><tbody>${entries.map(([v, n], i) => `<tr><td><i class="h-cw-dot" style="background:${col(v, i)}"></i>${esc(v)}</td><td>${fmt(n)}</td><td>${pct(n)} %</td></tr>`).join('')}</tbody></table>`;
        }
        return `<ul class="h-bars h-cw-bars">${entries.map(([v, n], i) => `<li><span class="h-bar-label" title="${esc(v)}">${esc(v)}</span><span class="h-bar"><i style="width:${Math.round(n / max * 100)}%;background:${col(v, i)}"></i></span><span>${fmt(n)}</span></li>`).join('')}</ul>`;
    }
    // « Tout voir » : les données d'une liste affichée, gardées le temps de la page
    const fullViews = new Map(); let fullSeq = 0;
    function mediaCell(r, text) {
        const m = r.media; if (!m) return text;
        const key = 'm' + (++fullSeq); fullViews.set(key, {media: m});
        const thumb = m.media_type === 'image' && (m.thumbnail || m.filename) ? `<img class="h-cw-thumb" src="media/${encodeURIComponent(m.thumbnail || m.filename)}" alt="" loading="lazy">` : '';
        return `<button type="button" class="table-link h-cw-media" data-cw-media="${key}">${thumb}${text || 'Voir le média'}</button>`;
    }
    function listTableHtml(data, d, rows, cols, all) {
        const cell = (r, c, i) => { const html = isPeopleCol(data, c) && r.people?.length ? r.people.map(p => `<button type="button" class="table-link" data-h-person="${Number(p.id)}">${esc(pname(p))}</button>`).join(' et ') : esc(cellText(data, r, c)); return i === 0 && r.media ? mediaCell(r, html) : html; };
        return `<div class="data-table-wrap"><table class="data-table h-cw-table"><thead><tr>${cols.map(c => `<th>${esc(all.find(x => x[0] === c)?.[1] || c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${cols.map((c, i) => `<td>${cell(r, c, i)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    }
    function listHtml(data, d) {
        const all = dataColumns(data);
        const cols = (d.columns?.length ? d.columns : all.slice(0, 3).map(c => c[0])).filter(c => all.some(x => x[0] === c));
        let rows = [...data.shown];
        if (d.sort?.col) {
            const num = v => { const y = yearOf(v); return y ?? (v !== '' && !isNaN(Number(v)) ? Number(v) : null); };
            rows.sort((a, b) => { const x = cellText(data, a, d.sort.col), y = cellText(data, b, d.sort.col), nx = num(x), ny = num(y); const r = nx !== null && ny !== null ? nx - ny : x.localeCompare(y, 'fr', {numeric: true, sensitivity: 'base'}); return d.sort.dir === 'desc' ? -r : r; });
        }
        const n = Math.max(1, Math.min(100, Number(d.limit) || 8));
        if (!rows.length) return '<p class="muted">Aucune ligne.</p>';
        let more = '';
        if (rows.length > n) {
            const key = 'l' + (++fullSeq); fullViews.set(key, {title: d.title || d.name || 'Liste', caption: d.caption || '', html: () => listTableHtml(data, d, rows, cols, all), count: rows.length});
            more = `<p class="h-cw-more"><small class="muted">${fmt(n)} sur ${fmt(rows.length)}${data.truncated ? '+' : ''}</small> <button type="button" class="link-button" data-cw-all="${key}">Tout voir (${fmt(rows.length)})</button></p>`;
        }
        return listTableHtml(data, d, rows.slice(0, n), cols, all) + more;
    }
    // Clic sur « Tout voir » ou sur un média d'une liste (tableau de bord et aperçu)
    document.addEventListener('click', event => {
        const media = event.target.closest?.('[data-cw-media]');
        if (media) { const v = fullViews.get(media.dataset.cwMedia); if (v?.media) A().openLightbox([v.media], 0, true); return; }
        const b = event.target.closest?.('[data-cw-all]');
        if (!b) return;
        const v = fullViews.get(b.dataset.cwAll); if (!v) return;
        document.getElementById('h-cw-all-dialog')?.remove();
        const dlg = document.createElement('dialog');
        dlg.className = 'modal h-cw-all-dialog'; dlg.id = 'h-cw-all-dialog';
        dlg.innerHTML = `<div class="modal-head"><div><span class="eyebrow">WIDGET</span><h2>${esc(v.title)} <small class="muted">(${fmt(v.count)})</small></h2>${v.caption ? `<p class="muted">${nl(v.caption)}</p>` : ''}</div><button type="button" class="icon-button" data-close aria-label="Fermer">×</button></div><div class="h-cw-all-body">${v.html()}</div>`;
        document.body.appendChild(dlg);
        dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close());
        dlg.addEventListener('close', () => dlg.remove());
        A().bindTableLinks?.();
        dlg.showModal();
    });
    const LINK_ICONS = {module: '➜', list: '📋', maint: '🛠️', url: '↗', person: '👤'};
    function linksHtml(d) {
        const links = (d.links || []).filter(l => l.label || l.target);
        if (!links.length) return '<p class="muted">Aucun raccourci.</p>';
        return `<div class="h-cw-links">${links.map(l => {
            const [type, ...rest] = String(l.target || '').split(':'), value = rest.join(':');
            const label = esc(l.label || value || 'Lien');
            if (type === 'url') return /^https?:\/\//i.test(value) ? `<a class="button small secondary" href="${esc(value)}" target="_blank" rel="noopener noreferrer">${label} ↗</a>` : '';
            return `<button type="button" class="button small secondary" data-cw-go="${esc(l.target)}">${LINK_ICONS[type] || ''} ${label}</button>`;
        }).join('')}</div>`;
    }
    function bodyHtml(d, datas) {
        if (d.kind === 'text') return d.text ? `<div class="h-cw-text">${nl(d.text)}</div>` : '<p class="muted">Texte vide.</p>';
        if (d.kind === 'links') return linksHtml(d);
        const err = datas.find(x => x?.error);
        if (err) return `<p class="h-offsite-sentence is-warn">${esc(err.error)}</p>`;
        if (d.kind === 'numbers') return `<div class="h-cw-numbers">${(d.counters || []).map((c, i) => { const x = datas[i] || {shown: []}; return `<div class="h-cw-number"><strong>${fmt(x.count ?? x.shown.length)}${x.count === undefined && x.truncated ? '+' : ''}</strong><span>${esc(c.label || 'Nombre')}</span></div>`; }).join('')}</div>`;
        if (d.kind === 'list') return listHtml(datas[0] || {rows: [], shown: []}, d);
        if (d.kind === 'chart') return chartHtml(datas[0] || {rows: [], shown: []}, d);
        return '';
    }
    const PART_KINDS = ['numbers', 'list', 'chart', 'text', 'links'];
    const captionHtml = d => d.caption ? `<p class="h-cw-caption">${nl(d.caption)}</p>` : '';
    function partsHtml(d, datas) {
        if (d.kind === 'app') return '';
        return (d.parts || []).map((p, i) => `<section class="h-cw-part">${p.title ? `<h4>${esc(p.title)}</h4>` : ''}${bodyHtml(p, datas?.parts?.[i] || [])}${captionHtml(p)}</section>`).join('');
    }
    const countOf = (d, datas) => d.kind === 'list' ? (datas[0]?.shown?.length ?? '') : d.kind === 'chart' && datas[0]?.shown ? groupRows(datas[0], d).counted : '';
    function widgetCard(d, index, span, datas) {
        const parts = partsHtml(d, datas);
        return ext.dressWidget(d, A().card(index, d.name || 'Mon widget', parts ? '' : countOf(d, datas), bodyHtml(d, datas) + captionHtml(d) + parts, span));
    }
    /** Titre, icône, couleur et texte à soi, posés sur la carte d'un widget (le sien ou un widget de l'app) */
    ext.dressWidget = (d, html) => {
        if (!d) return html;
        const box = document.createElement('div');
        box.innerHTML = String(html).trim();
        const c = box.querySelector('.card');
        if (!c) return html;
        c.classList.add('h-cw');
        if (color(d.color)) { c.classList.add('h-cw-accent'); c.style.setProperty('--cw-accent', color(d.color)); }
        const h = c.querySelector('.card-title h3');
        if (h && d.name) { const small = h.querySelector('small'); h.textContent = `${d.icon ? d.icon + ' ' : ''}${d.name}`; if (small) h.append(' ', small); }
        if (d.note) c.querySelector('.card-body')?.insertAdjacentHTML('afterbegin', `<p class="h-cw-note">${nl(d.note)}</p>`);
        return box.innerHTML;
    };
    function registerAll() {
        Object.keys(ext.dashboard).filter(k => k.startsWith('cw_')).forEach(k => delete ext.dashboard[k]);
        defs().filter(d => d.kind !== 'app').forEach(d => { ext.dashboard[d.id] = {load: () => loadData(d), render: (index, widget, span, datas) => widgetCard(d, index, span, datas || [])}; });
    }
    registerAll();
    // Raccourcis (sur le tableau de bord et dans l'aperçu)
    document.addEventListener('click', event => {
        const b = event.target.closest?.('[data-cw-go]');
        if (!b) return;
        const [type, ...rest] = b.dataset.cwGo.split(':'), value = rest.join(':');
        const st = S();
        if (type === 'module' && A().appModules[value]) A().setModule(value);
        if (type === 'list') { st.listType = value; A().setModule('listes'); }
        if (type === 'maint') { st.maintenanceTab = value; A().setModule('maintenance'); }
        if (type === 'person' && Number(value)) { st.currentPersonId = Number(value); A().setModule('personnes'); }
    });

    /* ─── Modèles : à partir des widgets de l'app, et quelques exemples ─── */
    const P = (rules = []) => ({source: 'persons', definition: {match: 'all', rules}});
    const E = (rules = []) => ({source: 'events', definition: {match: 'all', rules}});
    const T = source => ({source});
    const tagIds = (meta, ...tags) => (meta.event_types || []).filter(t => tags.includes(t.gedcom_tag)).map(t => Number(t.id));
    const FROM_APP = {
        stats: () => ({kind: 'numbers', icon: '🔢', counters: [{label: 'Personnes', src: P()}, {label: 'Événements', src: E()}, {label: 'Lieux', src: T('places')}, {label: 'Médias', src: T('media')}, {label: 'Sources', src: T('sources')}]}),
        quick_stat: () => ({kind: 'numbers', icon: '🔢', counters: [{label: 'Personnes', src: P()}]}),
        sosa_progress: () => ({kind: 'numbers', icon: '🌳', counters: [{label: 'Ancêtres trouvés (Sosa)', src: P([{field: 'sosa'}])}, {label: 'Ancêtres sans source', src: P([{field: 'sosa'}, {field: 'no_source'}])}]}),
        places: () => ({kind: 'list', icon: '📍', src: T('places'), columns: ['name', 'events', 'people'], sort: {col: 'events', dir: 'desc'}, limit: 8}),
        recent_media: () => ({kind: 'list', icon: '🖼️', src: T('media'), columns: ['title', 'date', 'person'], limit: 6}),
        persons_without_sources: () => ({kind: 'list', icon: '❓', src: P([{field: 'no_source'}]), columns: ['name', 'birth', 'death'], limit: 8}),
        events_without_sources: () => ({kind: 'list', icon: '❓', src: E([{field: 'no_source'}]), columns: ['date', 'type', 'who'], sort: {col: 'date', dir: 'desc'}, limit: 8}),
        children_missing_parents: () => ({kind: 'list', icon: '👶', src: P([{field: 'no_parents'}]), columns: ['name', 'birth', 'birthplace'], limit: 8}),
        reminders: () => ({kind: 'list', icon: '⏰', src: T('reminders'), columns: ['title', 'due', 'category'], sort: {col: 'due', dir: 'asc'}, limit: 6}),
        family_objects_widget: () => ({kind: 'list', icon: '🏺', src: T('family_objects'), columns: ['title', 'person', 'location'], limit: 8}),
        coverage: () => ({kind: 'chart', icon: '📊', src: P(), group: 'birth', groupBy: 'century', style: 'bars'}),
        labels: () => ({kind: 'chart', icon: '🏷️', src: P(), group: 'labels', groupBy: 'value', style: 'bars', limit: 12}),
    };
    const EXAMPLES = meta => [
        {name: 'Mes ancêtres par siècle', kind: 'chart', icon: '🌳', src: P([{field: 'sosa'}]), group: 'birth', groupBy: 'century', style: 'bars', note: 'Où en est chaque siècle de mon arbre ?'},
        {name: 'Métiers les plus fréquents', kind: 'chart', icon: '⚒️', src: P(), group: 'occupation', groupBy: 'value', style: 'bars', limit: 10},
        {name: 'Naissances par décennie', kind: 'chart', icon: '👶', src: E([{field: 'event_type', values: tagIds(meta, 'BIRT', 'CHR', 'BAPM')}]), group: 'date', groupBy: 'decade', style: 'bars'},
        {name: 'Femmes et hommes', kind: 'chart', icon: '⚧', src: P(), group: 'gender', groupBy: 'value', style: 'pie'},
        {name: 'Lieux de naissance', kind: 'chart', icon: '📍', src: P(), group: 'birthplace', groupBy: 'value', style: 'pie', limit: 8},
        {name: 'Ancêtres à sourcer', kind: 'list', icon: '🔎', src: P([{field: 'sosa'}, {field: 'no_source'}]), columns: ['name', 'sosa', 'birth'], sort: {col: 'sosa', dir: 'asc'}, limit: 10},
        {name: 'Morts avant 1900', kind: 'numbers', icon: '🕯️', counters: [{label: 'décès avant 1800', src: P([{field: 'death_year', to: 1799}])}, {label: 'de 1800 à 1899', src: P([{field: 'death_year', from: 1800, to: 1899}])}]},
        {name: 'Pense-bête', kind: 'text', icon: '📌', text: 'Demander aux AD les registres de 1793.\nAppeler tante Jeanne pour les photos 📸'},
        {name: 'Mes raccourcis', kind: 'links', icon: '🔗', links: [{label: 'Carte', target: 'module:carte'}, {label: 'Lieux', target: 'list:places'}, {label: 'Apparence', target: 'maint:design'}, {label: 'Geneanet', target: 'url:https://www.geneanet.org/'}]},
    ];
    const appCatalog = () => A().orderedDashboardWidgetTypes(true).filter(([k]) => !String(k).startsWith('cw_')).map(([k, , l]) => [k, l]);
    function baseDef(over = {}) {
        return {id: newId(), name: '', icon: '🧱', color: '', width: '6', note: '', kind: 'numbers', counters: [{label: 'Personnes', src: P()}], src: P(), columns: [], sort: null, limit: 8, group: '', groupBy: 'value', style: 'bars', text: '', links: [], base: '', parts: [], ...JSON.parse(JSON.stringify(over)), id: newId()};
    }

    /* ─── Écran de l'éditeur ─── */
    let editing = null, meta = null, previewSeq = 0, partIndex = -1; // partIndex : -1 = partie principale, sinon une partie en plus
    const newPart = kind => ({kind, title: '', counters: kind === 'numbers' ? [{label: 'Personnes', src: P()}] : [], src: P(), columns: [], sort: null, limit: 8, group: '', groupBy: 'value', style: 'bars', text: '', links: kind === 'links' ? [{label: 'Carte', target: 'module:carte'}] : []});
    async function loadMeta() { meta = await api('my_lists'); return meta; }
    ext.maintenance.widget_editor = async token => {
        try { await loadMeta(); } catch (error) { toast(error.message, 'error'); return; }
        if (!isCurrent(token)) return;
        editing = null; // revenir sur l'onglet : la liste (un brouillon abandonné ne revient pas)
        const list = defs(), onBoard = new Set(A().dashboardBlockSettings().widgets.map(w => w.type));
        A().$('#workspace').innerHTML = `<section class="page collection-page">${header('MAINTENANCE', 'Éditeur de widgets', 'Crée tes propres widgets pour le tableau de bord, sans rien programmer : de zéro, à partir d’un widget de l’app, d’un des tiens ou d’un exemple. Ils apparaissent ensuite dans la colonne de gauche du tableau de bord.', '<button type="button" class="button" data-cw-new>+ Nouveau widget</button>')}
            <section class="maintenance-panel"><h3>Importer un widget reçu</h3><p class="muted">Un fichier « .lcnda-widget.json » envoyé par un proche : seul le modèle du widget est partagé, jamais les données.</p><input type="file" accept=".json,application/json" data-cw-import></section>
            ${list.length ? `<div class="h-records">${list.map(d => `<article class="h-record h-cw-record" style="--cw-accent:${color(d.color) || 'transparent'}"><header><div><strong>${esc(d.icon || '🧱')} ${esc(d.name || 'Mon widget')}</strong> <small>${esc(KINDS[d.kind]?.[1] || '')}${d.kind === 'app' ? ' : ' + esc(appCatalog().find(x => x[0] === d.base)?.[1] || d.base) : ''}</small>${onBoard.has(d.id) ? ' <span class="collection-kind">sur le tableau de bord</span>' : ''}</div>
                    <span class="h-saved-tools"><button type="button" class="link-button" data-cw-edit="${esc(d.id)}">modifier</button><button type="button" class="link-button" data-cw-dup="${esc(d.id)}">dupliquer</button><button type="button" class="link-button" data-cw-del="${esc(d.id)}">supprimer</button></span></header>
                    ${d.note ? `<p>${nl(d.note)}</p>` : ''}<div class="page-actions"><button type="button" class="button small" data-cw-add="${esc(d.id)}">+ Ajouter au tableau de bord</button><button type="button" class="button small secondary" data-cw-share="${esc(d.id)}">📤 Partager (fichier)</button></div></article>`).join('')}</div>` : A().empty('Aucun widget à toi pour l’instant : clique sur « + Nouveau widget ».')}</section>`;
        const ws = A().$('#workspace');
        const find = id => list.find(d => d.id === id);
        ws.querySelector('[data-cw-new]').addEventListener('click', () => chooseStart(token));
        ws.querySelectorAll('[data-cw-edit]').forEach(b => b.addEventListener('click', () => { const cur = find(b.dataset.cwEdit); editing = {...baseDef(cur), id: cur.id, _existing: true}; partIndex = -1; renderEditor(++S().workspaceToken); }));
        ws.querySelectorAll('[data-cw-dup]').forEach(b => b.addEventListener('click', () => { const d = find(b.dataset.cwDup); editing = baseDef({...d, name: (d.name || 'Mon widget') + ' (copie)'}); partIndex = -1; renderEditor(++S().workspaceToken); }));
        ws.querySelectorAll('[data-cw-add]').forEach(b => b.addEventListener('click', () => { addToDashboard(b.dataset.cwAdd); ext.maintenance.widget_editor(++S().workspaceToken); }));
        ws.querySelectorAll('[data-cw-share]').forEach(b => b.addEventListener('click', () => shareDef(find(b.dataset.cwShare))));
        ws.querySelectorAll('[data-cw-del]').forEach(b => b.addEventListener('click', () => {
            const d = find(b.dataset.cwDel);
            if (!confirm(`Supprimer le widget « ${d.name || 'Mon widget'} » ? Il disparaît aussi du tableau de bord.`)) return;
            saveDefs(list.filter(x => x.id !== d.id));
            const settings = A().dashboardBlockSettings(); A().saveDashboardBlockSettings(settings); // les exemplaires posés partent (type inconnu)
            toast('Widget supprimé.'); ext.maintenance.widget_editor(++S().workspaceToken);
        }));
        ws.querySelector('[data-cw-import]').addEventListener('change', async e => {
            const file = e.target.files[0]; if (!file) return;
            try { const d = importDef(JSON.parse(await file.text())); saveDefs([...defs(), d]); toast(`Widget « ${d.name} » importé : ajoute-le au tableau de bord.`); ext.maintenance.widget_editor(++S().workspaceToken); }
            catch (error) { toast('Fichier de widget illisible : ' + error.message, 'error'); }
        });
    };
    function addToDashboard(id) {
        A().syncCustomDashboardWidgets();
        const d = defs().find(x => x.id === id);
        const settings = A().dashboardBlockSettings();
        settings.widgets.push(A().dashboardNewWidget(id, {width: d?.width || '6'}));
        A().saveDashboardBlockSettings(settings);
        toast('Widget ajouté au tableau de bord.');
    }
    function chooseStart(token) {
        const tile = (icon, name, sub, attr) => `<button type="button" class="h-template" ${attr}><span>${esc(icon)}</span><strong>${esc(name)}</strong><small>${esc(sub)}</small></button>`;
        const mine = defs(), ex = EXAMPLES(meta || {});
        ext.openDialog({
            eyebrow: 'NOUVEAU WIDGET', title: 'Par quoi commencer ?', wide: true, submitLabel: '',
            body: `<h4>Partir de rien</h4><div class="h-templates">${Object.entries(KINDS).map(([k, [i, n, sub]]) => tile(i, n, sub, `data-cw-kind="${k}"`)).join('')}</div>
                <h4>Partir d’un widget de l’app</h4><p class="muted">« Copie modifiable » : un widget à toi qui fait la même chose, avec tes critères. « Habiller » : le widget de l’app tel quel, avec ton titre, ton icône, ta couleur et ton texte.</p>
                <div class="h-cw-applist">${appCatalog().map(([k, l]) => `<div class="h-cw-approw"><span>${esc(l)}</span><span>${FROM_APP[k] ? `<button type="button" class="button small secondary" data-cw-copy="${esc(k)}">Copie modifiable</button>` : ''}<button type="button" class="button small secondary" data-cw-dress="${esc(k)}">Habiller</button></span></div>`).join('')}</div>
                ${mine.length ? `<h4>Partir d’un de mes widgets</h4><div class="h-templates">${mine.map(d => tile(d.icon || '🧱', d.name || 'Mon widget', KINDS[d.kind]?.[1] || '', `data-cw-mine="${esc(d.id)}"`)).join('')}</div>` : ''}
                <h4>Exemples</h4><div class="h-templates">${ex.map((d, i) => tile(d.icon, d.name, KINDS[d.kind][1], `data-cw-ex="${i}"`)).join('')}</div>`,
            onOpen: dlg => {
                const go = d => { editing = d; partIndex = -1; dlg.close(); renderEditor(++S().workspaceToken); };
                const label = k => appCatalog().find(x => x[0] === k)?.[1] || k;
                dlg.querySelectorAll('[data-cw-kind]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.cwKind; go(baseDef({kind: k, icon: KINDS[k][0], name: k === 'app' ? '' : KINDS[k][1], base: k === 'app' ? appCatalog()[0]?.[0] || 'stats' : '', links: k === 'links' ? [{label: 'Carte', target: 'module:carte'}] : []})); }));
                dlg.querySelectorAll('[data-cw-copy]').forEach(b => b.addEventListener('click', () => go(baseDef({name: label(b.dataset.cwCopy), ...FROM_APP[b.dataset.cwCopy](meta || {})}))));
                dlg.querySelectorAll('[data-cw-dress]').forEach(b => b.addEventListener('click', () => go(baseDef({kind: 'app', base: b.dataset.cwDress, icon: '', name: label(b.dataset.cwDress), width: '6'}))));
                dlg.querySelectorAll('[data-cw-mine]').forEach(b => b.addEventListener('click', () => { const d = mine.find(x => x.id === b.dataset.cwMine); go(baseDef({...d, name: (d.name || 'Mon widget') + ' (copie)'})); }));
                dlg.querySelectorAll('[data-cw-ex]').forEach(b => b.addEventListener('click', () => go(baseDef(ex[Number(b.dataset.cwEx)]))));
            },
        });
    }

    /* Choix des données : personnes, événements, une liste de l'app ou une de « Mes listes » (+ critères) */
    function columnsOf(src) {
        if (src.list_id) { const l = (meta.lists || []).find(x => Number(x.id) === Number(src.list_id)); return l ? (l.definition?.columns || []).map(k => [k, meta.columns[l.source]?.[k] || k]).concat((l.definition?.custom || []).map(c => [c.key, c.label])) : []; }
        return Object.entries(meta.columns[src.source || 'persons'] || {});
    }
    function sourceHtml(src, path) {
        const val = src.list_id ? 'list:' + src.list_id : (src.source || 'persons');
        const isRules = !src.list_id && ['persons', 'events'].includes(src.source || 'persons');
        const d = src.definition = src.definition || {match: 'all', rules: []};
        d.rules = d.rules || [];
        const k = (src.source || 'persons') === 'events' ? 'ev' : 'pe';
        const lists = (meta.lists || []).filter(l => l.source !== 'free');
        return `<div class="h-cw-src" data-cw-src="${esc(path)}"><label>Données <select data-cw-srcsel>
                <option value="persons" ${val === 'persons' ? 'selected' : ''}>Personnes</option><option value="events" ${val === 'events' ? 'selected' : ''}>Événements</option>
                <optgroup label="Listes de l’app">${Object.entries(meta.sources || {}).map(([s, l]) => `<option value="${esc(s)}" ${val === s ? 'selected' : ''}>${esc(l)}</option>`).join('')}</optgroup>
                ${lists.length ? `<optgroup label="Mes listes (avec leurs critères et leurs filtres)">${lists.map(l => `<option value="list:${l.id}" ${val === 'list:' + l.id ? 'selected' : ''}>${esc((l.icon || '📋') + ' ' + l.name)}</option>`).join('')}</optgroup>` : ''}</select></label>
            ${isRules ? `<div class="h-tabs"><label class="checkbox-line"><input type="radio" name="m-${esc(path)}" data-cw-match value="all" ${d.match !== 'any' ? 'checked' : ''}> toutes les conditions</label><label class="checkbox-line"><input type="radio" name="m-${esc(path)}" data-cw-match value="any" ${d.match === 'any' ? 'checked' : ''}> au moins une</label></div>
                <div data-cw-rules>${d.rules.map((r, i) => ext.listRuleRowHtml ? ext.listRuleRowHtml(r, i, src.source || 'persons', meta) : '').join('') || '<p class="muted">Aucun critère : toute la base.</p>'}</div>
                <label>+ Critère <select data-cw-addrule><option value="">choisir…</option>${Object.entries(ext.listRules ? ext.listRules() : {}).filter(([, m]) => m[k]).map(([f, m]) => `<option value="${f}">${esc(m[k])}</option>`).join('')}</select></label>`
            : src.list_id ? '<p class="muted">La liste est reprise telle qu’elle est enregistrée (critères, lignes ajoutées à la main, filtres de colonnes).</p>' : '<p class="muted">Toutes les lignes de cette liste de l’app.</p>'}</div>`;
    }
    const target = () => partIndex >= 0 && editing.parts?.[partIndex] ? editing.parts[partIndex] : editing;
    const srcAt = path => { const [kind, i] = path.split('.'), t = target(); return kind === 'c' ? t.counters[Number(i)].src : t.src; };
    // Légende : une phrase sous la partie pour dire ce qu'elle montre
    const captionField = d => d.kind === 'app' ? '' : `<label class="h-cw-caption-field">Légende <small>(ce que montre cette partie, affichée dessous)</small><input data-cw-caption value="${esc(d.caption || '')}" maxlength="400" placeholder="Ex. : Les baptêmes de la paroisse, du plus ancien au plus récent"></label>`;
    function kindHtml() { return kindHtmlInner() + captionField(target()); }
    function kindHtmlInner() {
        const d = target();
        if (d.kind === 'numbers') return `${(d.counters || []).map((c, i) => `<fieldset class="h-cw-counter"><legend>Chiffre ${i + 1}</legend><label>Libellé<input data-cw-counter="${i}" value="${esc(c.label || '')}" placeholder="Personnes nées en Bretagne"></label>${sourceHtml(c.src = c.src || P(), 'c.' + i)}${d.counters.length > 1 ? `<button type="button" class="link-button" data-cw-counter-del="${i}">retirer ce chiffre</button>` : ''}</fieldset>`).join('')}
            <button type="button" class="button small secondary" data-cw-counter-add>+ Chiffre</button>`;
        if (d.kind === 'list' || d.kind === 'chart') {
            const cols = columnsOf(d.src = d.src || P());
            const common = sourceHtml(d.src, 's');
            if (d.kind === 'list') return `${common}<h4>Colonnes</h4><div class="h-cw-cols">${cols.map(([k, l]) => `<label class="checkbox-line"><input type="checkbox" data-cw-col="${esc(k)}" ${(d.columns?.length ? d.columns : cols.slice(0, 3).map(c => c[0])).includes(k) ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div>
                <div class="form-grid"><label>Trier par <select data-cw-sortcol><option value="">ordre de la liste</option>${cols.map(([k, l]) => `<option value="${esc(k)}" ${d.sort?.col === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                <label>Sens <select data-cw-sortdir><option value="asc" ${d.sort?.dir !== 'desc' ? 'selected' : ''}>croissant (A → Z, 1 → 9)</option><option value="desc" ${d.sort?.dir === 'desc' ? 'selected' : ''}>décroissant</option></select></label>
                <label>Nombre de lignes<input type="number" min="1" max="100" data-cw-limit value="${esc(d.limit || 8)}"></label></div>`;
            return `${common}<div class="form-grid"><label>Compter par <select data-cw-group>${cols.map(([k, l]) => `<option value="${esc(k)}" ${(d.group || cols[0]?.[0]) === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                <label>Regrouper <select data-cw-groupby>${[['value', 'par valeur'], ['year', 'par année'], ['decade', 'par décennie'], ['century', 'par siècle']].map(([v, l]) => `<option value="${v}" ${d.groupBy === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                <label>Dessin <select data-cw-style>${CHART_STYLES.map(([k, l]) => `<option value="${k}" ${(d.style || 'bars') === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                <label>Couleurs <select data-cw-palette>${[['vive', 'Vives'], ['pastel', 'Pastel'], ['terre', 'Terre'], ['mer', 'Mer'], ['sepia', 'Sépia (photos anciennes)'], ['accent', 'Une couleur en dégradé']].map(([k, l]) => `<option value="${k}" ${(d.palette || 'vive') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                ${d.palette === 'accent' ? `<label>Couleur du dégradé<input type="color" data-cw-accent value="${esc(color(d.accentColor) || '#0066cc')}"></label>` : ''}
                <div class="span-2"><span class="section-label">Couleur de chaque valeur</span><div class="h-cw-valcolors" data-cw-valcolors><small class="muted">Les valeurs apparaissent ici après le calcul de l’aperçu.</small></div></div>
                <label>Valeurs les plus fréquentes<input type="number" min="2" max="60" data-cw-limit value="${esc(d.limit || 10)}"></label>
                <label class="checkbox-line span-2"><input type="checkbox" data-cw-skipempty ${d.skipEmpty !== false ? 'checked' : ''}> ne pas compter les cases vides</label></div>`;
        }
        if (d.kind === 'text') return `<label>Texte<textarea rows="6" data-cw-text placeholder="Un pense-bête, une citation… Les émojis marchent 🌳">${esc(d.text || '')}</textarea></label>`;
        if (d.kind === 'links') {
            const app = A(), opt = (v, l, cur) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(l)}</option>`;
            const targets = cur => `<optgroup label="Écrans">${Object.entries(app.appModules).filter(([k]) => k !== 'jeu').map(([k, v]) => opt('module:' + k, v[1], cur)).join('')}</optgroup><optgroup label="Listes">${app.defaultListTypes.map(([k, , l]) => opt('list:' + k, l, cur)).join('')}</optgroup><optgroup label="Maintenance">${app.defaultMaintenanceTabs.map(([k, , l]) => opt('maint:' + k, l, cur)).join('')}</optgroup>${opt('url:', 'Un site internet…', String(cur).startsWith('url:') ? 'url:' : '')}`;
            return `<div data-cw-links>${(d.links || []).map((l, i) => `<div class="h-cw-linkrow" data-cw-link="${i}"><input data-cw-linklabel value="${esc(l.label || '')}" placeholder="Texte du bouton"><select data-cw-linktarget>${targets(l.target || '')}</select>${String(l.target || '').startsWith('url:') ? `<input type="url" data-cw-linkurl value="${esc(String(l.target).slice(4))}" placeholder="https://…">` : ''}<button type="button" class="icon-button danger" data-cw-linkdel title="Retirer">×</button></div>`).join('')}</div>
                <button type="button" class="button small secondary" data-cw-linkadd>+ Raccourci</button>`;
        }
        if (d.kind === 'app') return `<label>Widget de l’app <select data-cw-base>${appCatalog().map(([k, l]) => `<option value="${esc(k)}" ${d.base === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label><p class="muted">Son contenu reste celui de l’app (et ses réglages par le crayon ✎ du tableau de bord) ; ton titre, ton icône, ta couleur et ton texte s’y ajoutent.</p>`;
        return '';
    }
    function renderEditor(token) {
        const root = editing;
        if (partIndex >= (root.parts || []).length || root.kind === 'app') partIndex = -1;
        const d = target();
        const partTabs = root.kind === 'app' ? '' : `<div class="h-cw-parts-tabs"><button type="button" class="button small ${partIndex < 0 ? '' : 'secondary'}" data-cw-part="-1">${esc(KINDS[root.kind]?.[0] || '')} Partie principale</button>${(root.parts || []).map((p, i) => `<button type="button" class="button small ${partIndex === i ? '' : 'secondary'}" data-cw-part="${i}">${esc(KINDS[p.kind]?.[0] || '')} ${esc(p.title || 'Partie ' + (i + 2))}</button>`).join('')}
            ${(root.parts || []).length < 8 ? `<label class="h-cw-part-add">+ Ajouter une partie <select data-cw-partadd><option value="">choisir…</option>${PART_KINDS.map(k => `<option value="${k}">${KINDS[k][0]} ${esc(KINDS[k][1])}</option>`).join('')}</select></label>` : ''}</div>`;
        const partHead = partIndex >= 0 ? `<div class="form-grid"><label>Sous-titre de cette partie<input data-cw-parttitle value="${esc(d.title || '')}" placeholder="Ex. : À faire, Mes chiffres, Liens utiles"></label>
            <label>Sorte <select data-cw-partkind>${PART_KINDS.map(k => `<option value="${k}" ${d.kind === k ? 'selected' : ''}>${KINDS[k][0]} ${esc(KINDS[k][1])}</option>`).join('')}</select></label>
            <p class="span-2"><button type="button" class="button small secondary" data-cw-partup ${partIndex ? '' : 'disabled'}>↑ Monter</button> <button type="button" class="button small secondary" data-cw-partdown ${partIndex < root.parts.length - 1 ? '' : 'disabled'}>↓ Descendre</button> <button type="button" class="button small secondary danger" data-cw-partdel>Retirer cette partie</button></p></div>` : '';
        A().$('#workspace').innerHTML = `<section class="page collection-page h-be h-cw-editor">${header('ÉDITEUR DE WIDGETS', root._existing ? `Modifier « ${root.name || 'Mon widget'} »` : 'Nouveau widget', 'Règle ton widget à gauche ; l’aperçu se met à jour à droite.', '<button type="button" class="button secondary" data-cw-cancel>← Retour</button>')}
            <div class="h-cw-layout"><div>
            <section class="maintenance-panel"><h3>1. Le widget</h3><div class="form-grid">
                <label>Titre<input data-cw="name" value="${esc(root.name || '')}" placeholder="Mes ancêtres bretons"></label><label>Icône<input data-cw="icon" value="${esc(root.icon || '')}" maxlength="16" class="h-be-icon" placeholder="🧱"></label>
                <label>Sorte <select data-cw-kindsel>${Object.entries(KINDS).map(([k, [i, l]]) => `<option value="${k}" ${root.kind === k ? 'selected' : ''}>${i} ${esc(l)}</option>`).join('')}</select></label>
                <label>Largeur <select data-cw="width">${WIDTHS.map(([v, l]) => `<option value="${v}" ${String(root.width) === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                <div class="span-2"><span class="section-label">Couleur</span><div class="h-cw-colors"><button type="button" class="h-cw-swatch ${!color(root.color) ? 'is-on' : ''}" data-cw-color="" title="Aucune">∅</button>${COLORS.map(c => `<button type="button" class="h-cw-swatch ${root.color === c ? 'is-on' : ''}" data-cw-color="${c}" style="background:${c}" title="${c}"></button>`).join('')}<input type="color" data-cw-colorpick value="${esc(color(root.color) || '#0066cc')}" title="Autre couleur"></div></div>
                <label class="span-2">Texte en haut du widget <small>(facultatif)</small><textarea rows="2" data-cw="note" placeholder="Une phrase pour expliquer ce widget">${esc(root.note || '')}</textarea></label></div></section>
            <section class="maintenance-panel"><h3>2. ${partIndex >= 0 ? `Partie ${partIndex + 2} : ` : ''}${esc(KINDS[d.kind]?.[1] || '')}</h3>${partTabs}${partHead}<p class="muted">${esc(KINDS[d.kind]?.[2] || '')}${root.kind !== 'app' && partIndex < 0 && !(root.parts || []).length ? ' Pour mettre plusieurs choses dans le même widget (plusieurs textes, des chiffres et des raccourcis…), « + Ajouter une partie ».' : ''}</p><div data-cw-kind-box>${kindHtml()}</div></section>
            <div class="page-actions"><button type="button" class="button" data-cw-save>Enregistrer</button>${root._existing ? '' : '<button type="button" class="button secondary" data-cw-saveadd>Enregistrer et ajouter au tableau de bord</button>'}<button type="button" class="button secondary" data-cw-cancel>Annuler</button></div>
            </div><aside class="h-cw-preview"><h3>Aperçu <button type="button" class="link-button" data-cw-refresh>actualiser</button></h3><div class="card-grid" data-cw-preview></div></aside></div></section>`;
        const ws = A().$('#workspace');
        const again = () => renderEditor(token);
        let previewTimer = 0;
        const preview = () => { clearTimeout(previewTimer); previewTimer = setTimeout(async () => {
            const box = ws.querySelector('[data-cw-preview]'); if (!box) return;
            if (root.kind === 'app') { box.innerHTML = ext.dressWidget(root, A().card('01', appCatalog().find(x => x[0] === root.base)?.[1] || root.base, '', '<p class="muted">Le contenu du widget de l’app s’affiche ici sur le tableau de bord.</p>', 'span-12')); return; }
            box.innerHTML = '<p class="muted">Calcul…</p>';
            const seq = ++previewSeq;
            const datas = await loadData(root);
            if (seq === previewSeq && document.body.contains(box)) { box.innerHTML = widgetCard(root, '01', 'span-12', datas); A().bindTableLinks?.(); fillValueColors(partIndex >= 0 ? datas.parts?.[partIndex] : datas); }
        }, 350); };
        // couleurs par valeur : une pastille par valeur du graphique en cours
        function fillValueColors(tdatas) {
            const holder = ws.querySelector('[data-cw-valcolors]'); if (!holder || d.kind !== 'chart') return;
            const data = tdatas?.[0]; if (!data?.shown) return;
            const entries = groupRows(data, d);
            const line = ['line', 'area'].includes(d.style);
            holder.innerHTML = line ? `<label class="h-cw-valcolor"><input type="color" data-cw-valcolor="__line" value="${esc(color(d.valueColors?.__line) || PALETTE[0])}"> la courbe</label>`
                : entries.map(([v], i) => { const c = chartColor(d, v, i); return `<label class="h-cw-valcolor"><input type="color" data-cw-valcolor="${esc(v)}" value="${esc(color(c) || PALETTE[i % PALETTE.length])}"> ${esc(v)}</label>`; }).join('') || '<small class="muted">Aucune valeur.</small>';
            if (d.valueColors && Object.keys(d.valueColors).length) holder.insertAdjacentHTML('beforeend', '<button type="button" class="link-button" data-cw-valreset>remettre les couleurs de la palette</button>');
        }
        preview();
        ws.querySelectorAll('[data-cw-cancel]').forEach(b => b.addEventListener('click', () => { editing = null; ext.maintenance.widget_editor(++S().workspaceToken); }));
        ws.querySelector('[data-cw-refresh]').addEventListener('click', preview);
        ws.querySelectorAll('[data-cw]').forEach(el => el.addEventListener('input', () => { root[el.dataset.cw] = el.value; preview(); }));
        ws.querySelector('[data-cw-kindsel]').addEventListener('change', e => { const k = e.target.value; root.kind = k; if (k === 'app' && !root.base) root.base = appCatalog()[0]?.[0]; if (k === 'numbers' && !root.counters?.length) root.counters = [{label: 'Personnes', src: P()}]; partIndex = -1; again(); });
        ws.querySelectorAll('[data-cw-color]').forEach(b => b.addEventListener('click', () => { root.color = b.dataset.cwColor; again(); }));
        ws.querySelector('[data-cw-colorpick]').addEventListener('change', e => { root.color = e.target.value; again(); });
        // les parties en plus : choisir, ajouter, renommer, changer de sorte, déplacer, retirer
        ws.querySelectorAll('[data-cw-part]').forEach(b => b.addEventListener('click', () => { partIndex = Number(b.dataset.cwPart); again(); }));
        ws.querySelector('[data-cw-partadd]')?.addEventListener('change', e => { if (!e.target.value) return; root.parts = root.parts || []; root.parts.push(newPart(e.target.value)); partIndex = root.parts.length - 1; again(); });
        ws.querySelector('[data-cw-parttitle]')?.addEventListener('input', e => { d.title = e.target.value; ws.querySelector(`[data-cw-part="${partIndex}"]`)?.replaceChildren(`${KINDS[d.kind]?.[0] || ''} ${d.title || 'Partie ' + (partIndex + 2)}`); preview(); });
        ws.querySelector('[data-cw-partkind]')?.addEventListener('change', e => { const k = e.target.value; d.kind = k; if (k === 'numbers' && !d.counters?.length) d.counters = [{label: 'Personnes', src: P()}]; if (k === 'links' && !d.links?.length) d.links = [{label: 'Carte', target: 'module:carte'}]; again(); });
        const movePart = to => { const [p] = root.parts.splice(partIndex, 1); root.parts.splice(to, 0, p); partIndex = to; again(); };
        ws.querySelector('[data-cw-partup]')?.addEventListener('click', () => movePart(partIndex - 1));
        ws.querySelector('[data-cw-partdown]')?.addEventListener('click', () => movePart(partIndex + 1));
        ws.querySelector('[data-cw-partdel]')?.addEventListener('click', () => { root.parts.splice(partIndex, 1); partIndex = -1; again(); });
        const box = ws.querySelector('[data-cw-kind-box]');
        // données et critères
        box.addEventListener('change', e => {
            const srcBox = e.target.closest('[data-cw-src]');
            if (srcBox) {
                const src = srcAt(srcBox.dataset.cwSrc);
                if (e.target.matches('[data-cw-srcsel]')) {
                    const v = e.target.value; Object.keys(src).forEach(k => delete src[k]);
                    if (v.startsWith('list:')) src.list_id = Number(v.slice(5)); else { src.source = v; src.definition = {match: 'all', rules: []}; }
                    if (srcBox.dataset.cwSrc === 's') { d.columns = []; d.sort = null; d.group = ''; }
                    return again();
                }
                if (e.target.matches('[data-cw-addrule]') && e.target.value) { src.definition.rules.push({field: e.target.value, value: e.target.value === 'gender' ? 'female' : '', values: []}); return again(); }
                if (e.target.matches('[data-cw-match]')) { src.definition.match = e.target.value; return preview(); }
                readRule(e, src);
                return;
            }
            if (e.target.matches('[data-cw-col]')) { d.columns = [...box.querySelectorAll('[data-cw-col]:checked')].map(x => x.dataset.cwCol); }
            if (e.target.matches('[data-cw-sortcol]')) d.sort = e.target.value ? {col: e.target.value, dir: box.querySelector('[data-cw-sortdir]').value} : null;
            if (e.target.matches('[data-cw-sortdir]') && d.sort) d.sort.dir = e.target.value;
            if (e.target.matches('[data-cw-group]')) d.group = e.target.value;
            if (e.target.matches('[data-cw-groupby]')) d.groupBy = e.target.value;
            if (e.target.matches('[data-cw-style]')) { d.style = e.target.value; preview(); return; }
            if (e.target.matches('[data-cw-palette]')) { d.palette = e.target.value; d.valueColors = {}; return again(); }
            if (e.target.matches('[data-cw-accent]')) { d.accentColor = e.target.value; d.valueColors = {}; }
            if (e.target.matches('[data-cw-valcolor]')) { d.valueColors = {...(d.valueColors || {}), [e.target.dataset.cwValcolor]: e.target.value}; }
            if (e.target.matches('[data-cw-skipempty]')) d.skipEmpty = e.target.checked;
            if (e.target.matches('[data-cw-base]')) d.base = e.target.value;
            if (e.target.matches('[data-cw-linktarget]')) { const i = Number(e.target.closest('[data-cw-link]').dataset.cwLink); d.links[i].target = e.target.value; return again(); }
            preview();
        });
        box.addEventListener('input', e => {
            const srcBox = e.target.closest('[data-cw-src]');
            if (srcBox && e.target.closest('[data-lr-i]')) { readRule(e, srcAt(srcBox.dataset.cwSrc)); return; }
            if (e.target.matches('[data-cw-counter]')) d.counters[Number(e.target.dataset.cwCounter)].label = e.target.value;
            if (e.target.matches('[data-cw-limit]')) d.limit = Number(e.target.value) || 8;
            if (e.target.matches('[data-cw-text]')) d.text = e.target.value;
            if (e.target.matches('[data-cw-caption]')) d.caption = e.target.value;
            const row = e.target.closest('[data-cw-link]');
            if (row) { const l = d.links[Number(row.dataset.cwLink)]; if (e.target.matches('[data-cw-linklabel]')) l.label = e.target.value; if (e.target.matches('[data-cw-linkurl]')) l.target = 'url:' + e.target.value.trim(); }
            preview();
        });
        box.addEventListener('click', e => {
            const srcBox = e.target.closest('[data-cw-src]'), rule = e.target.closest('[data-lr-i]');
            if (srcBox && rule && e.target.closest('[data-lr-del]')) { srcAt(srcBox.dataset.cwSrc).definition.rules.splice(Number(rule.dataset.lrI), 1); return again(); }
            if (e.target.closest('[data-cw-valreset]')) { d.valueColors = {}; return again(); }
            if (e.target.closest('[data-cw-counter-add]')) { d.counters.push({label: '', src: P()}); return again(); }
            const del = e.target.closest('[data-cw-counter-del]'); if (del) { d.counters.splice(Number(del.dataset.cwCounterDel), 1); return again(); }
            if (e.target.closest('[data-cw-linkadd]')) { d.links.push({label: '', target: 'module:personnes'}); return again(); }
            const ld = e.target.closest('[data-cw-linkdel]'); if (ld) { d.links.splice(Number(ld.closest('[data-cw-link]').dataset.cwLink), 1); return again(); }
        });
        function readRule(e, src) {
            const row = e.target.closest('[data-lr-i]'); if (!row) return;
            const r = src.definition.rules[Number(row.dataset.lrI)];
            row.querySelectorAll('[data-lr]').forEach(el => { const f = el.dataset.lr; r[f] = f === 'not' ? el.checked : f === 'values' ? [...el.selectedOptions].map(o => Number(o.value)) : (f === 'from' || f === 'to') ? (Number(el.value) || null) : el.value; });
            preview();
        }
        const save = andAdd => {
            if (!String(root.name || '').trim()) { toast('Donne un titre au widget.', 'error'); ws.querySelector('[data-cw="name"]').focus(); return; }
            const clean = cleanDef(root), list = defs(), i = list.findIndex(x => x.id === clean.id), before = i >= 0 ? list[i] : null;
            if (i >= 0) list[i] = clean; else list.push(clean);
            saveDefs(list);
            // Déjà sur le tableau de bord : on le met à jour (largeur comprise) au lieu d'en proposer un deuxième
            const settings = A().dashboardBlockSettings(), placed = settings.widgets.filter(w => w.type === clean.id);
            if (placed.length) {
                if (before && String(before.width) !== String(clean.width)) { placed.forEach(w => { w.width = clean.width; }); A().saveDashboardBlockSettings(settings); }
                toast('Widget enregistré : le tableau de bord est à jour.');
            } else if (andAdd) addToDashboard(clean.id);
            else toast('Widget enregistré : ajoute-le depuis la colonne de gauche du tableau de bord.');
            editing = null;
            if (andAdd) A().setModule('dashboard'); else ext.maintenance.widget_editor(++S().workspaceToken);
        };
        ws.querySelector('[data-cw-save]').addEventListener('click', () => save(false));
        ws.querySelector('[data-cw-saveadd]')?.addEventListener('click', () => save(true));
    }

    /* ─── Nettoyage, partage, import ─── */
    const str = (v, n) => String(v ?? '').slice(0, n);
    function cleanSrc(src) {
        src = src && typeof src === 'object' ? src : {};
        if (Number(src.list_id) > 0) return {list_id: Number(src.list_id)};
        const source = ['persons', 'events', ...Object.keys(meta?.sources || {places: 1, media: 1, occupations: 1, census: 1, reminders: 1, sources: 1, family_objects: 1, courriers: 1, graves: 1, budget: 1, living: 1})].includes(src.source) ? src.source : 'persons';
        const rules = (Array.isArray(src.definition?.rules) ? src.definition.rules : []).slice(0, 30).map(r => ({field: str(r.field, 30), value: str(r.value, 200), from: Number(r.from) || null, to: Number(r.to) || null, values: (Array.isArray(r.values) ? r.values : []).map(Number).filter(Boolean).slice(0, 200), not: !!r.not}));
        return {source, definition: {match: src.definition?.match === 'any' ? 'any' : 'all', rules}};
    }
    function cleanDef(d) {
        const kind = KINDS[d.kind] ? d.kind : 'text';
        const out = {id: /^cw_[a-z0-9]{4,24}$/.test(String(d.id)) ? d.id : newId(), name: str(d.name, 80).trim(), icon: str(d.icon, 16), color: color(d.color), width: WIDTHS.some(w => w[0] === String(d.width)) ? String(d.width) : '6', note: str(d.note, 1000), kind};
        Object.assign(out, kindFields(d, kind));
        out.parts = kind === 'app' ? [] : (Array.isArray(d.parts) ? d.parts : []).slice(0, 8).filter(p => p && PART_KINDS.includes(p.kind)).map(p => ({kind: p.kind, title: str(p.title, 80).trim(), ...kindFields(p, p.kind)}));
        if (kind === 'app') out.base = appCatalog().some(([k]) => k === d.base) ? d.base : 'stats'; // un widget de l'app qui n'existe pas ici
        return out;
    }
    function kindFields(d, kind) {
        const out = {};
        if (kind === 'numbers') out.counters = (Array.isArray(d.counters) ? d.counters : []).slice(0, 8).map(c => ({label: str(c.label, 80), src: cleanSrc(c.src)}));
        if (kind === 'list' || kind === 'chart') { out.src = cleanSrc(d.src); out.limit = Math.max(1, Math.min(100, Number(d.limit) || 8)); }
        if (kind === 'list') { out.columns = (Array.isArray(d.columns) ? d.columns : []).map(c => str(c, 40)).slice(0, 12); out.sort = d.sort?.col ? {col: str(d.sort.col, 40), dir: d.sort.dir === 'desc' ? 'desc' : 'asc'} : null; }
        if (kind === 'chart') Object.assign(out, {group: str(d.group, 40), groupBy: ['value', 'year', 'decade', 'century'].includes(d.groupBy) ? d.groupBy : 'value', style: CHART_STYLES.some(([k]) => k === d.style) ? d.style : 'bars', skipEmpty: d.skipEmpty !== false,
            palette: [...Object.keys(PALETTES), 'accent'].includes(d.palette) ? d.palette : 'vive', accentColor: color(d.accentColor) || '#0066cc',
            valueColors: Object.fromEntries(Object.entries(d.valueColors && typeof d.valueColors === 'object' ? d.valueColors : {}).filter(([k, v]) => color(v)).slice(0, 80).map(([k, v]) => [str(k, 80), v]))});
        if (kind !== 'app') out.caption = str(d.caption, 400);
        if (kind === 'text') out.text = str(d.text, 5000);
        if (kind === 'links') out.links = (Array.isArray(d.links) ? d.links : []).slice(0, 20).map(l => ({label: str(l.label, 60), target: /^(module|list|maint|person):[a-z0-9_]{1,40}$/i.test(String(l.target)) || /^url:https?:\/\/\S{1,500}$/i.test(String(l.target)) ? String(l.target) : ''})).filter(l => l.target);
        return out;
    }
    /** Dans le fichier : les types d'événements et les étiquettes par leur nom (leurs numéros changent d'une base à l'autre) */
    function portableSrc(src, out) {
        if (!src) return src;
        if (src.list_id) { const l = (meta.lists || []).find(x => Number(x.id) === Number(src.list_id)); return {list_name: l?.name || '', source: l?.source === 'events' ? 'events' : 'persons', definition: {match: 'all', rules: []}}; }
        const rules = (src.definition?.rules || []).map(r => r.field === 'event_type' ? {...r, values: [], tags: (meta.event_types || []).filter(t => r.values.includes(Number(t.id))).map(t => t.gedcom_tag || t.label)} : r.field === 'label' ? {...r, values: [], label_names: (meta.labels || []).filter(t => r.values.includes(Number(t.id))).map(t => t.name)} : r);
        return {...src, definition: {...src.definition, rules}};
    }
    function localSrc(src, missing) {
        if (!src || typeof src !== 'object') return src;
        if (src.list_name !== undefined) { const l = (meta.lists || []).find(x => x.name === src.list_name); if (l) return {list_id: Number(l.id)}; missing.push(src.list_name); }
        const rules = (src.definition?.rules || []).map(r => r.tags ? {...r, values: (meta.event_types || []).filter(t => r.tags.includes(t.gedcom_tag || t.label)).map(t => Number(t.id))} : r.label_names ? {...r, values: (meta.labels || []).filter(t => r.label_names.includes(t.name)).map(t => Number(t.id))} : r);
        return {source: src.source, definition: {...(src.definition || {}), rules}};
    }
    function shareDef(d) {
        const w = JSON.parse(JSON.stringify(d));
        [w, ...(w.parts || [])].forEach(p => { if (p.src) p.src = portableSrc(p.src); (p.counters || []).forEach(c => { c.src = portableSrc(c.src); }); });
        const file = JSON.stringify({format: 'lcnda-widget', version: 1, widget: w}, null, 2);
        const name = (d.name || 'widget').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.lcnda-widget.json';
        if (ext.downloadText) ext.downloadText(name, file, 'application/json');
        else { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([file], {type: 'application/json'})); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
    }
    function importDef(json) {
        if (json?.format !== 'lcnda-widget' || !json.widget) throw new Error('ce n’est pas un widget LCNDA.');
        const w = json.widget, missing = [];
        [w, ...(Array.isArray(w.parts) ? w.parts : [])].forEach(p => { if (p && p.src) p.src = localSrc(p.src, missing); (p?.counters || []).forEach(c => { c.src = localSrc(c.src, missing); }); });
        if (missing.length) toast(`Liste absente de ta base (${missing.join(', ')}) : remplacée par « Personnes ».`, 'error');
        return cleanDef({...w, id: newId(), name: w.name || 'Widget importé'});
    }
    ext.cleanWidgetDef = d => cleanDef(d); // pour les tests
})();
