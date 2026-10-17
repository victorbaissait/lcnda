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
        appstat: ['📈', 'Statistique de l’app', 'Une statistique de Graphiques → Statistiques (noms, prénoms, lieux, années…) redessinée à ta façon : barres, camembert, courbe, mosaïque, avec tes filtres.'],
        screen: ['📺', 'Écran de l’app', 'Une liste, un diagramme, une statistique, la fiche d’une personne ou d’un village, la carte, une de tes listes… directement dans le widget.'],
        diagram: ['🏛️', 'Diagramme', 'Un de « Mes diagrammes » : hémicycle, fer à cheval, frise des membres d’un groupe, camembert, flux, organigramme…'],
        text: ['📝', 'Texte', 'Un pense-bête, une citation, une consigne, avec des émojis.'],
        links: ['🔗', 'Raccourcis', 'Des boutons vers les écrans, les listes ou des sites que tu utilises souvent.'],
        journey: ['🧭', 'Parcours jour par jour', 'Des étapes datées (écrites à la main, ou les événements d’une personne) en frise et sur la carte : un voyage, une guerre, une vie.'],
        app: ['🎨', 'Widget de l’app habillé', 'Un widget de l’app tel quel, avec ton titre, ton icône, ta couleur et ton texte.']};
    const WIDTHS = [['3', '¼'], ['4', '⅓'], ['6', '½'], ['8', '⅔'], ['12', 'toute la largeur']];
    const COLORS = ['#0066cc', '#2f8f5b', '#cc4700', '#7a47db', '#c0392b', '#a07a00', '#00838f', '#555555'];
    const color = c => /^#[0-9a-f]{6}$/i.test(String(c || '')) ? c : '';
    const newId = () => 'cw_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    // Statistiques de l'app qui donnent des chiffres par valeur (api graph_stats, sortes « bar » et « histogram ») : on peut les redessiner
    const APP_STATS = [['surnames', 'Noms'], ['firstnames', 'Prénoms'], ['birth_places', 'Lieux de naissance'], ['marriage_places', 'Lieux de mariage'], ['death_places', 'Lieux de décès'],
        ['birth_countries', 'Pays de naissance'], ['death_countries', 'Pays de décès'], ['sex_distribution', 'Sexes'], ['birth_years', 'Années de naissance (par décennie)'], ['death_years', 'Années de décès (par décennie)'],
        ['age_at_death', 'Âge au décès'], ['death_causes', 'Causes de décès'], ['children_per_family', 'Enfants par famille']];
    const appStatLabel = k => APP_STATS.find(x => x[0] === k)?.[1] || k;
    /** Statistiques de l'app refaites en « Graphique » sur les personnes (ou les événements) : on peut alors y ajouter tous les critères */
    const APP_STAT_AS_CHART = {
        surnames: {group: 'last_name', groupBy: 'value', limit: 15}, firstnames: {group: 'first_name', groupBy: 'value', limit: 15},
        birth_places: {group: 'birthplace', groupBy: 'value', limit: 12}, death_places: {group: 'deathplace', groupBy: 'value', limit: 12},
        birth_countries: {group: 'birth_country', groupBy: 'value', limit: 12}, death_countries: null, sex_distribution: {group: 'gender', groupBy: 'value', style: 'pie'},
        birth_years: {group: 'birth', groupBy: 'decade', style: 'columns'}, death_years: {group: 'death', groupBy: 'decade', style: 'columns'},
        age_at_death: {group: 'age', groupBy: 'step', groupStep: 10, style: 'columns'},
        genealogy_age_pyramid: {group: 'age', groupBy: 'step', groupStep: 10, style: 'columns'}, death_age_by_generation: {group: 'age', groupBy: 'step', groupStep: 10, style: 'columns'},
        marriage_places: {events: ['MARR', 'MRCI', 'MRRE'], group: 'place', groupBy: 'value', limit: 12},
    };
    function appStatToChart(d) {
        const m = APP_STAT_AS_CHART[d.statType]; if (!m) return null;
        const rules = [];
        if (d.statGender) rules.push({field: 'gender', value: d.statGender, values: []});
        if (d.statLineage) rules.push({field: 'sosa', values: []});
        const fromIso = isoDate(d.statFrom), toIso = isoDate(d.statTo);
        if (fromIso || toIso) rules.push({field: 'date_range', date_from: fromIso || (yearOf(d.statFrom) ? `${yearOf(d.statFrom)}-01-01` : ''), date_to: toIso || (yearOf(d.statTo) ? `${yearOf(d.statTo)}-12-31` : ''), values: []});
        else if (yearOf(d.statFrom) || yearOf(d.statTo)) rules.push({field: 'year', from: yearOf(d.statFrom), to: yearOf(d.statTo), values: []});
        const src = m.events ? {source: 'events', definition: {match: 'all', rules: [{field: 'event_type', values: tagIds(meta || {}, ...[].concat(m.events))}, ...rules]}} : {source: 'persons', definition: {match: 'all', rules}};
        return {...d, kind: 'chart', src, group: m.group, groupBy: m.groupBy, groupStep: m.groupStep || 25, style: d.style && d.style !== 'bars' ? d.style : (m.style || 'bars'), limit: m.limit || d.limit || 10, valueColors: {}};
    }
    // Éditeur ouvert depuis Maintenance → Éditeur de widgets (mode « widgets ») ou → Éditeur de statistiques (mode « stats »)
    let mode = 'widgets';
    const backToList = () => ext.maintenance[mode === 'stats' ? 'stats_editor' : 'widget_editor'](++S().workspaceToken);

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
    /** ctx.personId : la personne de la fiche où le widget est posé (critère « par rapport à la personne de la fiche ») */
    async function loadData(d, ctx = {}) {
        const [main, ...parts] = await Promise.all([loadOne(d, ctx), ...(d.kind === 'app' ? [] : (d.parts || []).map(p => loadOne(p, ctx)))]);
        main.parts = parts;
        return main;
    }
    async function loadOne(d, ctx = {}) {
        const pid = Number(ctx.personId) || undefined;
        if (d.kind === 'journey') { // les événements d'une personne, si le parcours vient d'une fiche
            if (d.jSource !== 'person' || !Number(d.jPerson)) return [];
            try { return [{detail: await api('person', {id: Number(d.jPerson)})}]; } catch (error) { return [{error: error.message}]; }
        }
        if (d.kind === 'appstat') {
            const q = {type: APP_STATS.some(([k]) => k === d.statType) ? d.statType : 'surnames', gender: d.statGender || undefined};
            // date précise (« 12 mars 1750 », « 12/03/1750 ») ou année seule
            const fromIso = isoDate(d.statFrom), toIso = isoDate(d.statTo);
            if (fromIso || toIso) { q.date_from = fromIso || (yearOf(d.statFrom) ? `${yearOf(d.statFrom)}-01-01` : undefined); q.date_to = toIso || (yearOf(d.statTo) ? `${yearOf(d.statTo)}-12-31` : undefined); }
            else { q.year_from = yearOf(d.statFrom) || undefined; q.year_to = yearOf(d.statTo) || undefined; }
            if (d.statLineage) { const root = pid || Number(localStorage.getItem('genealogie-sosa-root')) || 0; if (root) q.sosa_root_id = root; }
            try { return [{appstat: await api('graph_stats', q)}]; } catch (error) { return [{error: error.message}]; }
        }
        const sources = d.kind === 'numbers' ? (d.counters || []).map(c => c.src || {}) : ['list', 'chart'].includes(d.kind) ? [d.src || {}] : [];
        return Promise.all(sources.map(async src => {
            try {
                if (d.kind === 'numbers' && !src.list_id) { const r = await api('widget_rows', {q: JSON.stringify({...srcQuery(src), count: 1, person_id: pid})}); return {count: Number(r.count) || 0, rows: [], shown: []}; }
                const data = await api('widget_rows', {q: JSON.stringify({...srcQuery(src), person_id: pid})}); return {...data, shown: applyListFilters(data)};
            }
            catch (error) { return {error: error.message, rows: [], shown: []}; }
        }));
    }

    /* ─── Affichage ─── */
    const PALETTE = ['#0066cc', '#cc4700', '#2f8f5b', '#7a47db', '#c0392b', '#a07a00', '#00838f', '#d4588f', '#5d6d7e', '#8bc34a', '#ff9800', '#3f51b5'];
    const TIME_GROUPS = ['decade', 'century', 'year', 'step', 'month'];
    const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const monthOf = v => { const p = A().parsedGenealogyDate?.(String(v || '')); if (p?.exact && p.date) return p.date.getUTCMonth() + 1; const m = String(v).toLowerCase().match(/(?:^|\s|\/|-)(\d{1,2})[\/.-](\d{1,2})[\/.-]\d{4}/); if (m) return Number(m[2]); const i = MONTHS.findIndex(x => String(v).toLowerCase().includes(x)); return i >= 0 ? i + 1 : null; };
    /** Clé triable d'une date (« 12 mars 1750 », « 1750-03-12 », « 1750 ») ; une année seule va du 1er janvier (début) au 31 décembre (fin) */
    function dateKey(v, end = false) {
        const s = String(v || '').trim();
        let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]);
        m = s.match(/(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/); if (m) return Number(m[3]) * 10000 + Number(m[2]) * 100 + Number(m[1]);
        const y = yearOf(s); if (y === null) return null;
        const mo = MONTHS.findIndex(x => s.toLowerCase().includes(x)) + 1, day = Number((s.match(/^(?:le\s+)?(\d{1,2})(?:er)?\s/i) || [])[1]) || 0;
        if (mo) return y * 10000 + mo * 100 + (day || (end ? 31 : 1));
        return y * 10000 + (end ? 1231 : 101);
    }
    /** « 12 mars 1750 », « 12/03/1750 », « 1750-03-12 » → 1750-03-12 ; une année seule → '' */
    function isoDate(v) {
        const s = String(v || '').trim(); if (!/\d{4}/.test(s) || /^\d{4}$/.test(s)) return '';
        const k = dateKey(s); if (k === null || k % 100 === 0) return '';
        const y = Math.floor(k / 10000), m = Math.floor(k / 100) % 100, d = k % 100;
        if (!/\d{1,2}[\/.-]\d{1,2}|\d{4}-\d{1,2}-\d{1,2}/.test(s) && !/^(?:le\s+)?\d{1,2}(?:er)?\s/i.test(s)) return ''; // « mars 1750 » : pas assez précis
        return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(Math.min(d, 31)).padStart(2, '0')}`;
    }
    function groupRows(data, d) {
        if (data.appstat) { // chiffres déjà comptés par l'app
            const timeline = data.appstat.kind === 'histogram';
            let entries = (data.appstat.rows || []).map(r => [String(r.label ?? ''), Number(r.value) || 0]).filter(([v, n]) => n > 0 && (v !== '' || d.skipEmpty === false));
            if (!timeline) entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'));
            const top = Math.max(1, Math.min(60, Number(d.limit) || 10));
            if (!timeline && entries.length > top) { const rest = entries.slice(top).reduce((n, e) => n + e[1], 0); entries = entries.slice(0, top); if (rest) entries.push(['autres', rest]); }
            entries.counted = Number(data.appstat.total) || entries.reduce((n, e) => n + e[1], 0);
            return entries;
        }
        if (!data.shown) return Object.assign([], {counted: 0});
        const col = d.group || dataColumns(data)[0]?.[0] || 'name';
        const counts = new Map(), members = new Map(); // members : les personnes derrière chaque valeur (clic sur une barre)
        let counted = 0;
        for (const r of data.shown) {
            let any = false;
            let vals = [cellText(data, r, col).trim()];
            if (col === 'labels' || col === 'names') vals = vals[0].split(/\s*,\s*/);
            for (let v of vals) {
                // période choisie (dates précises ou années) : les valeurs hors période ne comptent pas
                if (d.rangeFrom || d.rangeTo) { const k = dateKey(v); if (k === null || (d.rangeFrom && k < dateKey(d.rangeFrom, false)) || (d.rangeTo && k > dateKey(d.rangeTo, true))) continue; }
                if (TIME_GROUPS.includes(d.groupBy)) {
                    const step = Math.max(1, Math.min(500, Number(d.groupStep) || 25));
                    const y = yearOf(v) ?? (d.groupBy === 'step' && /\d/.test(String(v)) ? Number(String(v).match(/\d+/)[0]) : null); // « 45 ans » → 45
                    if (d.groupBy === 'month') { const m = monthOf(v); v = m ? MONTHS[m - 1] : ''; }
                    else if (y === null) { v = ''; } else if (d.groupBy === 'decade') { v = `${Math.floor(y / 10) * 10}–${Math.floor(y / 10) * 10 + 9}`; } else if (d.groupBy === 'century') { const c = Math.floor((y - 1) / 100) + 1; v = `${c}${c === 1 ? 'er' : 'e'} siècle`; }
                    else if (d.groupBy === 'step') { const a = Math.floor(y / step) * step; v = step === 1 ? String(a) : `${a}–${a + step - 1}`; } else { v = String(y); }
                }
                if (v === '' && d.skipEmpty !== false) continue;
                counts.set(v || '(vide)', (counts.get(v || '(vide)') || 0) + 1);
                const who = members.get(v || '(vide)') || new Map(); for (const p of r.people || []) if (p?.id) who.set(Number(p.id), p); members.set(v || '(vide)', who);
                any = true;
            }
            if (any) counted++;
        }
        let entries = [...counts.entries()];
        const timeline = TIME_GROUPS.includes(d.groupBy);
        const when = v => { if (d.groupBy === 'month') { const i = MONTHS.indexOf(v); return i >= 0 ? i : Infinity; } const k = yearOf(v) ?? Number.parseInt(v, 10); return Number.isFinite(k) ? k : Infinity; }; // « (vide) » en dernier
        entries.sort((a, b) => timeline ? when(a[0]) - when(b[0]) : b[1] - a[1] || a[0].localeCompare(b[0], 'fr'));
        const top = d.noTop ? Infinity : Math.max(1, Math.min(60, Number(d.limit) || 10)); // noTop : toutes les valeurs (qui est derrière une barre)
        let restOf = [];
        if (!timeline && entries.length > top) { restOf = entries.slice(top); const rest = restOf.reduce((n, e) => n + e[1], 0); entries = entries.slice(0, top); if (rest) entries.push(['autres', rest]); }
        entries.counted = counted; // lignes comptées (une personne à deux étiquettes compte une fois)
        entries.members = entries.map(([v], i) => {
            if (v !== 'autres' || i < entries.length - 1 || !restOf.length) return [...(members.get(v)?.values() || [])];
            const all = new Map(); restOf.forEach(([k]) => members.get(k)?.forEach((p, id) => all.set(id, p))); return [...all.values()];
        });
        entries.restValues = restOf;
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
        let entries = groupRows(data, d);
        if (!entries.length) return '<p class="muted">Rien à compter.</p>';
        const total = entries.reduce((n, e) => n + e[1], 0);
        // « autres » (le reste mis ensemble) ne donne pas l'échelle : sinon il écrase les vraies valeurs, qui n'ont plus de couleur visible
        const isRest = (v, i) => v === 'autres' && i === entries.length - 1 && entries.length > 1;
        const scaled = entries.filter(([v], i) => !isRest(v, i)).map(e => e[1]);
        const max = Math.max(1, ...(scaled.length ? scaled : entries.map(e => e[1])));
        const w = (v, n, i) => Math.max(n > 0 ? 3 : 0, Math.min(100, Math.round(n / max * 100)));
        const over = (v, n, i) => isRest(v, i) && n > max;
        const col = (v, i) => chartColor(d, v, i), pct = n => total ? Math.round(n / total * 100) : 0;
        // chaque valeur se clique : la liste des personnes comptées
        const key = 'd' + (++fullSeq); keepView(key, {detail: {d, entries, data}});
        const hit = i => ` data-cw-detail="${key}" data-cw-i="${i}" tabindex="0" role="button"`;
        const legend = `<ul class="h-cw-legend">${entries.map(([v, n], i) => `<li${hit(i)}><i style="background:${col(v, i)}"></i>${esc(v)} <strong>${fmt(n)}</strong> <small class="muted">${pct(n)} %</small></li>`).join('')}</ul>`;
        if (String(d.style || '').startsWith('dg:') && ext.diagramStatHtml) { const h = ext.diagramStatHtml(d, data, entries, (r, c) => cellText(data, r, c)); if (h) return `<div class="h-cw-dg">${h}</div>`; } // le diagramme a sa propre légende
        if (d.style === 'pie' || d.style === 'donut') {
            let at = 0;
            const stops = entries.map(([v, n], i) => { const from = at; at += n / total * 360; return `${col(v, i)} ${from.toFixed(1)}deg ${at.toFixed(1)}deg`; }).join(',');
            return `<div class="h-cw-pie"><div class="h-cw-pie-disc ${d.style === 'donut' ? 'is-donut' : ''}" style="background:conic-gradient(${stops})" role="img" aria-label="${d.style === 'donut' ? 'Anneau' : 'Camembert'}">${d.style === 'donut' ? `<span>${fmt(total)}</span>` : ''}</div>${legend}</div>`;
        }
        if (d.style === 'columns') {
            // étiquettes courtes (« 1780 » pour « 1780–1789 ») et inclinées quand il y en a beaucoup
            const short = v => /^\d{3,4}–\d{3,4}$/.test(String(v)) ? String(v).split('–')[0] : String(v);
            const dense = entries.length > 8 || entries.some(([v]) => short(v).length > 6);
            return `<div class="h-cw-columns${dense ? ' is-dense' : ''}">${entries.map(([v, n], i) => `<div class="h-cw-col${over(v, n, i) ? ' is-over' : ''}" title="${esc(v)} : ${fmt(n)} — cliquer pour voir qui"${hit(i)}><div class="h-cw-bar-wrap"><small>${fmt(n)}</small><i style="height:${w(v, n, i)}%;background:${col(v, i)}"></i></div><span>${esc(short(v))}</span></div>`).join('')}</div>`;
        }
        if (d.style === 'line' || d.style === 'area') {
            entries = entries.filter(([v], i) => !isRest(v, i)); // une courbe : le reste mis ensemble n'a pas de sens
            const W = 600, H = 220, pad = 28, step = entries.length > 1 ? (W - pad * 2) / (entries.length - 1) : 0;
            const pts = entries.map(([, n], i) => [pad + i * step, H - pad - (max ? n / max : 0) * (H - pad * 2)]);
            const line = pts.map(p => p.map(x => x.toFixed(1)).join(',')).join(' ');
            const stroke = color(d.valueColors?.__line) || chartColor(d, '', 0);
            const every = Math.max(1, Math.ceil(entries.length / 12));
            return `<svg class="h-cw-line" viewBox="0 0 ${W} ${H}" role="img" aria-label="Courbe">
                <line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" class="h-cw-axis"/>
                ${d.style === 'area' ? `<polygon points="${pad},${H - pad} ${line} ${pad + (entries.length - 1) * step},${H - pad}" fill="${stroke}" fill-opacity=".25"/>` : ''}
                <polyline points="${line}" fill="none" stroke="${stroke}" stroke-width="3" stroke-linejoin="round"/>
                ${pts.map(([x, y], i) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="${stroke}"${hit(i)}><title>${esc(entries[i][0])} : ${fmt(entries[i][1])}</title></circle>${i % every === 0 ? `<text x="${x.toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(String(entries[i][0]).slice(0, 14))}</text>` : ''}`).join('')}
                <text x="${pad}" y="16">${fmt(max)}</text></svg>`;
        }
        if (d.style === 'tiles') {
            return `<div class="h-cw-tiles">${entries.map(([v, n], i) => `<div style="flex:${Math.max(1, Math.round(Math.min(n, max * 1.5) / max * 100))} 1 ${Math.max(56, Math.round(Math.sqrt(Math.min(n, max * 1.5) / max) * 420))}px;min-height:${Math.max(56, Math.round(Math.sqrt(Math.min(n, max * 1.5) / max) * 140))}px;background:${col(v, i)}" title="${esc(v)} : ${fmt(n)}"${hit(i)}><strong>${fmt(n)}</strong><span>${esc(v)}</span></div>`).join('')}</div>`;
        }
        if (d.style === 'table') {
            return `<table class="data-table h-cw-table"><thead><tr><th>Valeur</th><th>Nombre</th><th>Part</th></tr></thead><tbody>${entries.map(([v, n], i) => `<tr${hit(i)}><td><i class="h-cw-dot" style="background:${col(v, i)}"></i>${esc(v)}</td><td>${fmt(n)}</td><td>${pct(n)} %</td></tr>`).join('')}</tbody></table>`;
        }
        return `<ul class="h-bars h-cw-bars">${entries.map(([v, n], i) => `<li${hit(i)} title="${esc(v)} : ${fmt(n)} — cliquer pour voir qui"${over(v, n, i) ? ' class="is-over"' : ''}><span class="h-bar-label">${esc(v)}</span><span class="h-bar"><i style="width:${w(v, n, i)}%;background:${col(v, i)}"></i></span><span>${fmt(n)}</span></li>`).join('')}</ul>`;
    }
    // « Tout voir » : les données d'une liste affichée, gardées le temps de la page
    const fullViews = new Map(); let fullSeq = 0;
    const keepView = (key, v) => { fullViews.set(key, v); if (fullViews.size > 400) fullViews.delete(fullViews.keys().next().value); }; // les plus anciennes s'effacent (aperçus successifs)
    function mediaCell(r, text) {
        const m = r.media; if (!m) return text;
        const key = 'm' + (++fullSeq); keepView(key, {media: m});
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
            const key = 'l' + (++fullSeq); keepView(key, {title: d.title || d.name || 'Liste', caption: d.caption || '', html: () => listTableHtml(data, d, rows, cols, all), count: rows.length});
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
        dlg.className = 'modal h-modal h-cw-all-dialog'; dlg.id = 'h-cw-all-dialog'; // h-modal : se ferme quand on ouvre une fiche depuis la liste
        dlg.innerHTML = `<div class="modal-head"><div><span class="eyebrow">WIDGET</span><h2>${esc(v.title)} <small class="muted">(${fmt(v.count)})</small></h2>${v.caption ? `<p class="muted">${nl(v.caption)}</p>` : ''}</div><button type="button" class="icon-button" data-close aria-label="Fermer">×</button></div><div class="h-cw-all-body">${v.html()}</div>`;
        document.body.appendChild(dlg);
        dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close());
        dlg.addEventListener('close', () => dlg.remove());
        A().bindTableLinks?.();
        dlg.showModal();
    });
    /* ─── Qui est derrière une valeur ? (clic sur une barre, une colonne, une part, une ligne de légende) ─── */
    async function membersOf(v, i) {
        const {d, entries, data} = v;
        if (!data.appstat) return {people: entries.members?.[i] || [], truncated: !!data.truncated};
        // statistique de l'app : on la refait en graphique sur les personnes pour savoir qui est compté
        const c = appStatToChart(d); if (!c) return null;
        const rows = await api('widget_rows', {q: JSON.stringify(srcQuery(c.src))});
        const mine = groupRows({...rows, shown: applyListFilters(rows)}, {...c, limit: 60});
        const norm = x => String(x).toLowerCase().replace(/[–—-]/g, '-').replace(/\s+/g, ' ').trim();
        const label = entries[i][0];
        if (label === 'autres' && i === entries.length - 1) { const shown = new Set(entries.slice(0, -1).map(e => norm(e[0]))); const all = new Map(); mine.forEach(([k], j) => { if (!shown.has(norm(k))) (mine.members[j] || []).forEach(p => all.set(Number(p.id), p)); }); return {people: [...all.values()], truncated: !!rows.truncated}; }
        const j = mine.findIndex(([k]) => norm(k) === norm(label));
        return j >= 0 ? {people: mine.members[j] || [], truncated: !!rows.truncated} : null;
    }
    const lifeOf = p => { const b = p.birth_year || yearOf(p.birth_date || p.bapt_date || ''), dd = p.death_year || yearOf(p.death_date || p.buri_date || ''); return b && dd ? `${b} – ${dd}` : b ? `° ${b}` : dd ? `† ${dd}` : ''; };
    function peopleGridHtml(people, sort, q) {
        const qq = String(q || '').toLowerCase().trim();
        let list = people.filter(p => !qq || pname(p).toLowerCase().includes(qq) || String(p.occupation || '').toLowerCase().includes(qq));
        const by = p => Number(p.birth_year || yearOf(p.birth_date || p.bapt_date || '') || 99999);
        list.sort(sort === 'birth' ? (a, b) => by(a) - by(b) : sort === 'birth_desc' ? (a, b) => (by(b) % 99999) - (by(a) % 99999) : (a, b) => String(a.last_name || '').localeCompare(String(b.last_name || ''), 'fr') || String(a.first_name || '').localeCompare(String(b.first_name || ''), 'fr'));
        if (!list.length) return '<p class="muted">Personne ne correspond.</p>';
        return `<ul class="h-cw-who">${list.map(p => { const g = p.gender === 'female' ? 'is-f' : p.gender === 'male' ? 'is-m' : ''; const ini = (String(p.first_name || '').trim()[0] || '') + (String(p.last_name || '').trim()[0] || ''); return `<li><button type="button" class="h-cw-who-card" data-h-person="${Number(p.id)}"><span class="h-cw-who-ini ${g}" aria-hidden="true">${esc(ini.toUpperCase() || '?')}</span><span><strong>${esc(pname(p))}</strong><small>${esc([lifeOf(p), p.occupation].filter(Boolean).join(' · '))}</small></span></button></li>`; }).join('')}</ul>`;
    }
    async function openDetail(el) {
        const v = fullViews.get(el.dataset.cwDetail)?.detail; if (!v) return;
        const i = Number(el.dataset.cwI), [label, n] = v.entries[i] || [];
        if (label === undefined) return;
        let res; try { res = await membersOf(v, i); } catch (error) { toast(error.message, 'error'); return; }
        const total = v.entries.reduce((k, e) => k + e[1], 0);
        const sub = label === 'autres' && v.entries.restValues?.length ? `<p class="h-cw-who-rest">${v.entries.restValues.slice(0, 80).map(([k, c]) => `<span>${esc(k)} <b>${fmt(c)}</b></span>`).join('')}${v.entries.restValues.length > 80 ? `<span>… et ${fmt(v.entries.restValues.length - 80)} autres valeurs</span>` : ''}</p>` : '';
        whoDialog({eyebrow: v.d.name || 'STATISTIQUE', label, n, total, color: chartColor(v.d, label, i), res, sub, csvName: `${v.d.name || 'statistique'} - ${label}`});
    }
    /** La fenêtre « qui est compté » : les personnes derrière une valeur (statistiques à soi, distributions de Graphiques) */
    function whoDialog({eyebrow, label, n, total, color, res, sub = '', csvName, unavailable}) {
        document.getElementById('h-cw-who-dialog')?.remove();
        const dlg = document.createElement('dialog');
        dlg.className = 'modal h-modal h-cw-all-dialog h-cw-who-dialog'; dlg.id = 'h-cw-who-dialog';
        const people = res?.people || [];
        const note = !res ? `<p class="muted">${unavailable || 'Le détail de cette valeur n’est pas disponible pour cette statistique : transforme-la en graphique (« ➕ Ajouter d’autres conditions ») pour voir qui est compté.'}</p>`
            : people.length < n ? `<p class="muted">${fmt(people.length)} personne${people.length > 1 ? 's' : ''} différente${people.length > 1 ? 's' : ''} pour ${fmt(n)} compté${n > 1 ? 's' : ''}${res.truncated ? ' (les 3 000 premières lignes seulement)' : ' : une même personne peut compter plusieurs fois (deux événements, deux étiquettes…)'}.</p>` : '';
        dlg.innerHTML = `<div class="modal-head"><div><span class="eyebrow">${esc(eyebrow)}</span><h2><i class="h-cw-dot" style="background:${esc(color || '#0066cc')}"></i>${esc(label)} <small class="muted">${fmt(n)} · ${total ? Math.round(n / total * 100) : 0} %</small></h2></div><button type="button" class="icon-button" data-close aria-label="Fermer">×</button></div>
            <div class="h-cw-all-body">${sub}${note}${people.length ? `<div class="h-cw-who-tools"><input type="search" placeholder="Chercher un nom, un métier…" data-who-q aria-label="Chercher"><select data-who-sort aria-label="Trier"><option value="name">par nom</option><option value="birth">par naissance (anciens d’abord)</option><option value="birth_desc">par naissance (récents d’abord)</option></select><button type="button" class="button small secondary" data-who-csv>⬇︎ CSV</button></div><div data-who-list>${peopleGridHtml(people, 'name', '')}</div>` : ''}</div>`;
        document.body.appendChild(dlg);
        const redraw = () => { dlg.querySelector('[data-who-list]').innerHTML = peopleGridHtml(people, dlg.querySelector('[data-who-sort]').value, dlg.querySelector('[data-who-q]').value); };
        dlg.querySelector('[data-who-q]')?.addEventListener('input', redraw);
        dlg.querySelector('[data-who-sort]')?.addEventListener('change', redraw);
        dlg.querySelector('[data-who-csv]')?.addEventListener('click', () => {
            const q = x => `"${String(x ?? '').replace(/"/g, '""')}"`;
            const csv = '\ufeff' + [['Nom', 'Prénoms', 'Naissance', 'Décès', 'Métier'].map(q).join(';'), ...people.map(p => [p.last_name, p.first_name, p.birth_date || p.birth_year || '', p.death_date || p.death_year || '', p.occupation].map(q).join(';'))].join('\r\n');
            const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8'})); a.download = (A().safeExportFilename?.(csvName) || 'personnes') + '.csv'; document.body.appendChild(a); a.click(); a.remove();
        });
        dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close());
        dlg.addEventListener('close', () => dlg.remove());
        A().bindTableLinks?.();
        dlg.showModal();
    }
    /**
     * Distributions de Graphiques → Statistiques : qui est derrière une barre. La statistique est refaite sur les
     * personnes (avec ses filtres et ses critères) ; null si elle ne se refait pas ainsi.
     */
    ext.statWhoSupported = type => !!APP_STAT_AS_CHART[type];
    ext.statWho = async ({statType, statFrom, statTo, statGender, statLineage, rules = [], kind = 'human', generation = ''}, label, n, total, color, title) => {
        let res = null;
        try {
            if (!meta) meta = await api('my_lists'); // les types d'événements (mariage…) avant de refaire la statistique
            const c = appStatToChart({statType, statFrom, statTo, statGender, statLineage});
            if (c) {
                c.src.definition.rules.push(...rules);
                // pyramide par génération : seulement les personnes nées dans cette génération (« 1700–1724 »)
                const gen = statType === 'death_age_by_generation' && String(generation).match(/^(\d+)\s*[–—-]\s*(\d+)$/);
                if (gen) c.src.definition.rules.push({field: 'year', from: Number(gen[1]), to: Number(gen[2]), values: []});
                const rows = await api('widget_rows', {q: JSON.stringify(srcQuery(c.src))});
                // tranches de la statistique (« 65–69 ») : les mêmes pour le regroupement
                const span = String(label).match(/^(\d+)\s*[–—-]\s*(\d+)$/); if (span && c.groupBy === 'step') c.groupStep = Number(span[2]) - Number(span[1]) + 1;
                const mine = groupRows({...rows, shown: applyListFilters(rows)}, {...c, noTop: true, skipEmpty: false});
                const norm = x => String(x).toLowerCase().replace(/[–—-]/g, '-').replace(/\s+/g, ' ').trim();
                // « Pernay » (statistique) = « Pernay (Indre-et-Loire) » (fiche) ; « Lieu non renseigné », « Naissance sans lieu »… = vide
                const missing = /^(lieu non renseign|naissance sans|décès sans|aucun|aucune|pays non|sans |non renseign)/i.test(String(label).trim());
                const SAME = {masculin: ['homme', 'male', 'masculin'], 'féminin': ['femme', 'female', 'féminin'], 'non renseigné': ['(vide)', '', 'inconnu', 'unknown', 'non renseigné']};
                const L = norm(label), alias = statType === 'sex_distribution' ? SAME[L] : null;
                const hit = k => { const K = norm(k); return alias ? alias.includes(K) : missing ? (K === '(vide)' || K === '') : (K === L || K.startsWith(L + ' (') || K.startsWith(L + ',')); };
                // la valeur exacte d'abord (« Martin » et « MARTIN » sont deux barres), sinon les variantes (« Pernay (Indre-et-Loire) »)
                const exact = mine.some(([k]) => String(k).trim() === String(label).trim()), take = k => exact ? String(k).trim() === String(label).trim() : hit(k);
                const who = new Map(); mine.forEach(([k], j) => { if (take(k)) (mine.members[j] || []).forEach(p => who.set(Number(p.id), p)); });
                // comme la statistique : les personnes, ou les animaux en mode Élevage
                let people = [...who.values()].filter(p => (p.kind === 'animal') === (kind === 'animal'));
                // « Aucune naissance renseignée » / « Naissance sans lieu » (et pour le décès) : séparés d'après la date
                const born = p => !!(p.birth_date || p.birth_year || p.bapt_date || p.bapt_year), died = p => !!(p.death_date || p.death_year || p.buri_date || p.buri_year);
                if (/^aucune naissance/i.test(label)) people = people.filter(p => !born(p)); else if (/^(naissance sans lieu|pays non renseign)/i.test(label)) people = people.filter(born);
                if (/^aucun décès/i.test(label)) people = people.filter(p => !died(p)); else if (/^décès sans lieu/i.test(label)) people = people.filter(died);
                res = {people, truncated: !!rows.truncated};
            }
        } catch (error) { toast(error.message, 'error'); return; }
        whoDialog({eyebrow: title || 'DISTRIBUTION', label, n, total, color, res, csvName: `${title || 'statistique'} - ${label}`, unavailable: 'Le détail de cette valeur n’est pas disponible pour cette statistique. Les noms, prénoms, lieux, pays, sexes, années et âges au décès l’ont ; pour les autres, fais-en une statistique à toi (Maintenance → Éditeur de statistiques).'});
    };
    document.addEventListener('click', event => { const el = event.target.closest?.('[data-cw-detail]'); if (el) { event.preventDefault(); openDetail(el); } });
    document.addEventListener('keydown', event => { if ((event.key === 'Enter' || event.key === ' ') && event.target.matches?.('[data-cw-detail]')) { event.preventDefault(); openDetail(event.target); } });
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
    /* ── 🧭 Parcours jour par jour ── */
    const J_TAG_EMOJI = {BIRT: '👶', CHR: '💧', BAPM: '💧', MARR: '💍', DIV: '💔', DEAT: '🕯️', BURI: '⚰️', RESI: '🏠', OCCU: '⚒️', CENS: '📋', EMIG: '🚢', IMMI: '⚓', NATU: '🛂', MILI: '🎖️', EDUC: '🎓', GRAD: '🎓', RETI: '🌿'};
    const J_LAYOUTS = [['vertical', 'Frise verticale'], ['horizontal', 'Frise horizontale (défile)'], ['cards', 'Cartes en grille'], ['compact', 'Liste compacte']];
    function journeySteps(d, datas) {
        let steps;
        if (d.jSource === 'person') {
            const det = datas?.[0]?.detail; if (!det) return [];
            steps = (det.events || []).filter(e => e.date_text || e.year).filter(e => !d.jWithPlace || e.place_name).map(e => ({date: e.date_text || String(e.year || ''), title: [e.type_label, e.title].filter(Boolean).join(' — '), place: e.place_name || '',
                lat: Number(e.precise_lat ?? e.latitude), lon: Number(e.precise_lon ?? e.longitude), emoji: J_TAG_EMOJI[e.gedcom_tag] || '•', text: e.description || '', color: ''}));
        } else steps = (d.steps || []).map(x => ({...x, lat: x.lat === '' || x.lat == null ? NaN : Number(x.lat), lon: x.lon === '' || x.lon == null ? NaN : Number(x.lon)}));
        // même échelle pour « 3 juillet 1832 » et « 1790 » (une année seule compte pour le 1er janvier) ; sans date : à la fin
        const key = x => { const p = A().parsedGenealogyDate?.(x.date || ''); if (p?.date) return p.date.getTime(); const y = yearOf(x.date); return y !== null ? Date.UTC(y, 0, 1) : 8.64e15; };
        if (d.jOrder !== 'manual') steps = steps.map((x, i) => ({x, i, k: key(x)})).sort((a, b) => a.k - b.k || a.i - b.i).map(o => o.x);
        return steps;
    }
    function journeyRowHtml(x = {}, i = 0) {
        return `<div class="h-jr-row" data-j-row>
                <input data-j="emoji" value="${esc(x.emoji || '')}" maxlength="16" placeholder="📍" class="h-be-icon" title="Émoji">
                <input data-j="date" value="${esc(x.date || '')}" placeholder="12 mars 1943">
                <input data-j="date_end" value="${esc(x.date_end || '')}" placeholder="jusqu’au… (facultatif)">
                <input data-j="title" value="${esc(x.title || '')}" placeholder="Titre de l’étape">
                <span class="h-jr-placefield">${ext.placeField ? ext.placeField('jplace' + i + '_' + Math.random().toString(36).slice(2, 6), x.place || '', x.lat ?? '', x.lon ?? '', 'Lieu') : `<input data-j="place" value="${esc(x.place || '')}" placeholder="Lieu">`}</span>
                <input type="color" data-j="color" value="${esc(color(x.color) || '#0066cc')}" title="Couleur de l’étape">
                <textarea data-j="text" rows="2" placeholder="Ce qui s’est passé ce jour-là">${esc(x.text || '')}</textarea>
                <span class="h-jr-rowtools"><button type="button" class="icon-button" data-j-up title="Monter">↑</button><button type="button" class="icon-button" data-j-down title="Descendre">↓</button><button type="button" class="icon-button danger" data-j-del title="Retirer">🗑</button></span></div>`;
    }
    /** Étapes écrites dans un éditeur (widget ou bloc). */
    function readJourneyRows(box) {
        return [...box.querySelectorAll('[data-j-row]')].map(r => {
            const v = k => r.querySelector(`[data-j="${k}"]`)?.value ?? '';
            const placeInput = r.querySelector('[data-h-place]'), pname = placeInput?.name || '';
            return {emoji: v('emoji'), date: v('date'), date_end: v('date_end'), title: v('title'), text: v('text'), color: v('color'),
                place: placeInput ? placeInput.value : v('place'), lat: pname ? r.querySelector(`[name="${pname}_lat"]`)?.value ?? '' : '', lon: pname ? r.querySelector(`[name="${pname}_lon"]`)?.value ?? '' : ''};
        });
    }
    // Pour l'éditeur de blocs (heritage-more.js) : le même parcours dans un bloc de fiche
    ext.journeyHtml = (d, datas) => journeyHtml(d, datas);
    ext.journeyRowHtml = (x, i) => journeyRowHtml(x, i);
    ext.readJourneyRows = box => readJourneyRows(box);
    ext.J_LAYOUTS = J_LAYOUTS;
    function journeyHtml(d, datas) {
        if (datas?.[0]?.error) return `<p class="h-offsite-sentence is-warn">${esc(datas[0].error)}</p>`;
        const steps = journeySteps(d, datas);
        if (!steps.length) return `<p class="muted">${d.jSource === 'person' ? (Number(d.jPerson) ? 'Aucun événement daté pour cette personne.' : 'Choisis une personne.') : 'Aucune étape : ajoute-en dans l’éditeur.'}</p>`;
        const accent = color(d.color) || '#0066cc';
        const exact = x => { const p = A().parsedGenealogyDate?.(x || ''); return p?.exact && p.date ? p.date : null; };
        const first = steps.map(x => exact(x.date)).find(Boolean);
        const dayN = x => { const e = exact(x.date); return first && e ? Math.round((e - first) / 864e5) + 1 : null; };
        const dur = x => { const a = exact(x.date), b = exact(x.date_end); return a && b && b > a ? Math.round((b - a) / 864e5) + 1 : 0; };
        const meta = x => [d.jDays !== false && dayN(x) ? `Jour ${fmt(dayN(x))}` : '', x.date ? esc(x.date) + (x.date_end ? ' → ' + esc(x.date_end) : '') : '', dur(x) > 1 ? `${fmt(dur(x))} jours` : ''].filter(Boolean).join(' · ');
        const item = (x, i) => `<li style="--j:${color(x.color) || accent}"><span class="h-jr-dot">${esc(x.emoji || String(i + 1))}</span><div class="h-jr-body"><small>${meta(x)}</small><strong>${esc(x.title || 'Étape')}</strong>${x.place ? `<span class="h-jr-place">📍 ${esc(x.place)}</span>` : ''}${x.text && d.jText !== false ? `<p>${nl(x.text)}</p>` : ''}</div></li>`;
        const layout = J_LAYOUTS.some(([k]) => k === d.jLayout) ? d.jLayout : 'vertical';
        let html = `<ol class="h-jr h-jr-${layout}">${steps.map(item).join('')}</ol>`;
        if (d.jMap !== false && ext.miniMap) {
            const pts = steps.map((x, i) => ({x, i})).filter(o => Number.isFinite(o.x.lat) && Number.isFinite(o.x.lon));
            if (pts.length) html += ext.miniMap(pts.map(o => ({lat: o.x.lat, lon: o.x.lon, label: `${o.i + 1}. ${o.x.title || ''}${o.x.place ? ' — ' + o.x.place : ''}`, color: color(o.x.color) || accent, n: o.i + 1})), pts.length > 1 ? [{coords: pts.map(o => [o.x.lat, o.x.lon]), color: accent, width: 2}] : [], {height: Number(d.jMapHeight) || 280});
        }
        return html;
    }
    function bodyHtml(d, datas) {
        if (d.kind === 'journey') return journeyHtml(d, datas);
        if (d.kind === 'diagram') return Number(d.diagramId) && ext.diagramEmbedHtml ? ext.diagramEmbedHtml(d.diagramId) : '<p class="muted">Choisis le diagramme dans l’Éditeur de widgets.</p>';
        if (d.kind === 'text') return d.text ? `<div class="h-cw-text">${nl(d.text)}</div>` : '<p class="muted">Texte vide.</p>';
        if (d.kind === 'links') return linksHtml(d);
        const err = datas.find(x => x?.error);
        if (err) return `<p class="h-offsite-sentence is-warn">${esc(err.error)}</p>`;
        if (d.kind === 'numbers') return `<div class="h-cw-numbers">${(d.counters || []).map((c, i) => { const x = datas[i] || {shown: []}; return `<div class="h-cw-number"><strong>${fmt(x.count ?? x.shown.length)}${x.count === undefined && x.truncated ? '+' : ''}</strong><span>${esc(c.label || 'Nombre')}</span></div>`; }).join('')}</div>`;
        if (d.kind === 'list') return listHtml(datas[0] || {rows: [], shown: []}, d);
        if (d.kind === 'chart') return chartHtml(datas[0] || {rows: [], shown: []}, d);
        if (d.kind === 'appstat') return datas[0]?.appstat ? chartHtml(datas[0], d) : '<p class="muted">Calcul…</p>';
        if (d.kind === 'screen') { const sc = ext.appScreen; const c = {target: d.target || 'module:carte', sidebar: !!d.sidebar, layout: d.layout}; if (sc?.nested && sc.valid(c.target)) return sc.nestedLink(c.target, sc.label(c.target)); return sc && sc.valid(c.target) ? `<iframe class="h-ct-frame" src="${esc(sc.url(c))}" title="${esc(sc.label(c.target))}" loading="lazy" style="height:${Math.max(240, Math.min(2000, Number(d.height) || 560))}px"></iframe><p class="h-cw-more"><button type="button" class="link-button" data-ct-open-screen="${esc(c.target)}">↗ Ouvrir en grand</button></p>` : '<p class="muted">Choisis l’écran dans l’Éditeur de widgets.</p>'; }
        return '';
    }
    const PART_KINDS = ['numbers', 'list', 'chart', 'appstat', 'screen', 'diagram', 'text', 'links', 'journey'];
    const captionHtml = d => d.caption ? `<p class="h-cw-caption">${nl(d.caption)}</p>` : '';
    function partsHtml(d, datas) {
        if (d.kind === 'app') return '';
        return (d.parts || []).map((p, i) => `<section class="h-cw-part">${p.title ? `<h4>${esc(p.title)}</h4>` : ''}${bodyHtml(p, datas?.parts?.[i] || [])}${captionHtml(p)}</section>`).join('');
    }
    const countOf = (d, datas) => d.kind === 'list' ? (datas[0]?.shown?.length ?? '') : (d.kind === 'chart' && datas[0]?.shown) || (d.kind === 'appstat' && datas[0]?.appstat) ? fmt(Math.round(groupRows(datas[0], d).counted)) : '';
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
        return {id: newId(), name: '', icon: '🧱', color: '', width: '6', note: '', kind: 'numbers', counters: [{label: 'Personnes', src: P()}], src: P(), columns: [], sort: null, limit: 8, group: '', groupBy: 'value', style: 'bars', text: '', links: [], base: '', parts: [], steps: [], jSource: 'manual', jPerson: 0, jPersonName: '', jLayout: 'vertical', jMap: true, jDays: true, jText: true, jOrder: 'date', jWithPlace: false, ...JSON.parse(JSON.stringify(over)), id: newId()};
    }

    /* ─── Écran de l'éditeur ─── */
    let editing = null, meta = null, previewSeq = 0, partIndex = -1; // partIndex : -1 = partie principale, sinon une partie en plus
    const newPart = kind => ({kind, title: '', counters: kind === 'numbers' ? [{label: 'Personnes', src: P()}] : [], src: P(), columns: [], sort: null, limit: 8, group: '', groupBy: 'value', style: 'bars', text: '', links: kind === 'links' ? [{label: 'Carte', target: 'module:carte'}] : [], steps: [], jSource: 'manual', jLayout: 'vertical', jMap: true, jDays: true, jText: true, jOrder: 'date'});
    async function loadMeta() { meta = await api('my_lists'); return meta; }
    ext.maintenance.widget_editor = token => { mode = 'widgets'; return defsPage(token); };
    /** Maintenance → Éditeur de statistiques : les mêmes widgets, montrés en grand dans Graphiques → Statistiques */
    ext.maintenance.stats_editor = token => { mode = 'stats'; return defsPage(token); };
    async function defsPage(token) {
        try { await loadMeta(); } catch (error) { toast(error.message, 'error'); return; }
        if (!isCurrent(token)) return;
        editing = null; // revenir sur l'onglet : la liste (un brouillon abandonné ne revient pas)
        const all = defs(), list = mode === 'stats' ? all.filter(d => d.inStats) : all, onBoard = new Set(A().dashboardBlockSettings().widgets.map(w => w.type));
        A().$('#workspace').innerHTML = `<section class="page collection-page">${mode === 'stats'
            ? header('MAINTENANCE', 'Éditeur de statistiques', 'Crée tes propres graphiques et statistiques, sans rien programmer : de zéro (personnes, événements, une de tes listes…), à partir d’une statistique de l’app redessinée à ta façon, d’un de tes widgets ou d’un exemple. Ils apparaissent dans Graphiques → Statistiques, rubrique « Mes statistiques », et peuvent aussi aller sur le tableau de bord.', '<button type="button" class="button" data-cw-new>+ Nouvelle statistique</button>')
            : header('MAINTENANCE', 'Éditeur de widgets', 'Crée tes propres widgets pour le tableau de bord, sans rien programmer : de zéro, à partir d’un widget de l’app, d’un des tiens ou d’un exemple. Ils apparaissent ensuite dans la colonne de gauche du tableau de bord. Pour un graphique ou une statistique en grand dans l’onglet Graphiques : Éditeur de statistiques.', '<button type="button" class="button" data-cw-new>+ Nouveau widget</button>')}
            <section class="maintenance-panel"><h3>Importer un widget reçu</h3><p class="muted">Un fichier « .lcnda-widget.json » envoyé par un proche : seul le modèle du widget est partagé, jamais les données.</p><input type="file" accept=".json,application/json" data-cw-import></section>
            ${list.length ? `<div class="h-records">${list.map(d => `<article class="h-record h-cw-record${color(d.color) ? ' has-accent' : ''}"${color(d.color) ? ` style="--cw-accent:${color(d.color)}"` : ''}><header><div><strong>${esc(d.icon || '🧱')} ${esc(d.name || 'Mon widget')}</strong> <small>${esc(KINDS[d.kind]?.[1] || '')}${d.kind === 'app' ? ' : ' + esc(appCatalog().find(x => x[0] === d.base)?.[1] || d.base) : ''}</small>${onBoard.has(d.id) ? ' <span class="collection-kind">sur le tableau de bord</span>' : ''}${d.inStats ? ' <span class="collection-kind">dans Graphiques</span>' : ''}</div>
                    <span class="h-saved-tools"><button type="button" class="link-button" data-cw-edit="${esc(d.id)}">modifier</button><button type="button" class="link-button" data-cw-dup="${esc(d.id)}">dupliquer</button><button type="button" class="link-button" data-cw-del="${esc(d.id)}">supprimer</button></span></header>
                    ${d.note ? `<p>${nl(d.note)}</p>` : ''}<div class="page-actions">${d.inStats ? `<button type="button" class="button small" data-cw-opengraph="${esc(d.id)}">📊 Ouvrir dans Graphiques</button>` : ''}<button type="button" class="button small ${d.inStats ? 'secondary' : ''}" data-cw-add="${esc(d.id)}">+ Ajouter au tableau de bord</button><button type="button" class="button small secondary" data-cw-share="${esc(d.id)}">📤 Partager (fichier)</button></div></article>`).join('')}</div>` : A().emptyState({icon: '🧩', text: mode === 'stats' ? 'Aucune statistique à toi pour l’instant' : 'Aucun widget à toi pour l’instant', action: {label: mode === 'stats' ? '＋ Nouvelle statistique' : '＋ Nouveau widget', attrs: 'data-cw-new'}})}</section>`;
        const ws = A().$('#workspace');
        const find = id => list.find(d => d.id === id);
        ws.querySelectorAll('[data-cw-new]').forEach(b => b.addEventListener('click', () => chooseStart(token)));
        ws.querySelectorAll('[data-cw-edit]').forEach(b => b.addEventListener('click', () => { const cur = find(b.dataset.cwEdit); editing = {...baseDef(cur), id: cur.id, _existing: true}; partIndex = -1; renderEditor(++S().workspaceToken); }));
        ws.querySelectorAll('[data-cw-dup]').forEach(b => b.addEventListener('click', () => { const d = find(b.dataset.cwDup); editing = baseDef({...d, name: (d.name || 'Mon widget') + ' (copie)'}); partIndex = -1; renderEditor(++S().workspaceToken); }));
        ws.querySelectorAll('[data-cw-add]').forEach(b => b.addEventListener('click', () => { addToDashboard(b.dataset.cwAdd); backToList(); }));
        ws.querySelectorAll('[data-cw-opengraph]').forEach(b => b.addEventListener('click', () => ext.openCustomStat(b.dataset.cwOpengraph)));
        ws.querySelectorAll('[data-cw-share]').forEach(b => b.addEventListener('click', () => shareDef(find(b.dataset.cwShare))));
        ws.querySelectorAll('[data-cw-del]').forEach(b => b.addEventListener('click', async () => {
            const d = find(b.dataset.cwDel);
            if (!await A().confirmBox(`Supprimer le widget « ${d.name || 'Mon widget'} » ? Il disparaît aussi du tableau de bord.`, {title: 'Supprimer le widget', okLabel: 'Supprimer le widget'})) return;
            saveDefs(all.filter(x => x.id !== d.id));
            const settings = A().dashboardBlockSettings(); A().saveDashboardBlockSettings(settings); // les exemplaires posés partent (type inconnu)
            toast('Widget supprimé.'); backToList();
        }));
        ws.querySelector('[data-cw-import]').addEventListener('change', async e => {
            const file = e.target.files[0]; if (!file) return;
            try { const d = importDef(JSON.parse(await file.text())); if (mode === 'stats') d.inStats = true; saveDefs([...defs(), d]); toast(mode === 'stats' ? `« ${d.name} » importé : il est dans Graphiques → Statistiques.` : `Widget « ${d.name} » importé : ajoute-le au tableau de bord.`); backToList(); }
            catch (error) { toast('Fichier de widget illisible : ' + error.message, 'error'); }
        });
    }
    /** Le widget est-il posé sur le tableau de bord principal (pas dans un onglet à soi) ? */
    function onDashboard(id) { const st = S(), board = st.dashboardBoard; st.dashboardBoard = ''; try { return A().dashboardBlockSettings().widgets.some(w => w.type === id); } finally { st.dashboardBoard = board; } }
    function setOnDashboard(id, on) {
        const st = S(), board = st.dashboardBoard; st.dashboardBoard = '';
        try {
            const settings = A().dashboardBlockSettings(), has = settings.widgets.some(w => w.type === id);
            if (on && !has) { A().syncCustomDashboardWidgets(); settings.widgets.push(A().dashboardNewWidget(id, {width: defs().find(x => x.id === id)?.width || '6'})); A().saveDashboardBlockSettings(settings); }
            if (!on && has) { settings.widgets = settings.widgets.filter(w => w.type !== id); A().saveDashboardBlockSettings(settings); }
        } finally { st.dashboardBoard = board; }
    }
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
        if (mode === 'stats') return chooseStatStart(tile);
        const mine = defs(), ex = EXAMPLES(meta || {});
        ext.openDialog({
            eyebrow: 'NOUVEAU WIDGET', title: 'Par quoi commencer ?', wide: true, submitLabel: '',
            body: `<h4>Partir de rien</h4><div class="h-templates">${Object.entries(KINDS).map(([k, [i, n, sub]]) => tile(i, n, sub, `data-cw-kind="${k}"`)).join('')}</div>
                ${ext.appScreen ? `<h4>Partir d’un élément de l’app</h4><p class="muted">N’importe quel écran devient un widget : une liste (fiche d’un village, recensements, rappels…), un diagramme, une statistique, une de tes listes, la fiche d’une personne, la carte, un outil de Maintenance.</p>
                <div class="h-cw-fromscreen">${ext.appScreen.select('list:villages', 'data-cw-fromscreen-sel')}<button type="button" class="button small" data-cw-fromscreen>Créer ce widget</button></div>` : ''}
                <h4>Partir d’un widget de l’app</h4><p class="muted">« Copie modifiable » : un widget à toi qui fait la même chose, avec tes critères. « Habiller » : le widget de l’app tel quel, avec ton titre, ton icône, ta couleur et ton texte.</p>
                <div class="h-cw-applist">${appCatalog().map(([k, l]) => `<div class="h-cw-approw"><span>${esc(l)}</span><span>${FROM_APP[k] ? `<button type="button" class="button small secondary" data-cw-copy="${esc(k)}">Copie modifiable</button>` : ''}<button type="button" class="button small secondary" data-cw-dress="${esc(k)}">Habiller</button></span></div>`).join('')}</div>
                ${mine.length ? `<h4>Partir d’un de mes widgets</h4><div class="h-templates">${mine.map(d => tile(d.icon || '🧱', d.name || 'Mon widget', KINDS[d.kind]?.[1] || '', `data-cw-mine="${esc(d.id)}"`)).join('')}</div>` : ''}
                <h4>Exemples</h4><div class="h-templates">${ex.map((d, i) => tile(d.icon, d.name, KINDS[d.kind][1], `data-cw-ex="${i}"`)).join('')}</div>`,
            onOpen: dlg => {
                const go = d => { editing = d; partIndex = -1; dlg.close(); renderEditor(++S().workspaceToken); };
                const label = k => appCatalog().find(x => x[0] === k)?.[1] || k;
                dlg.querySelectorAll('[data-cw-kind]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.cwKind; go(baseDef({kind: k, icon: KINDS[k][0], name: k === 'app' ? '' : KINDS[k][1], base: k === 'app' ? appCatalog()[0]?.[0] || 'stats' : '', links: k === 'links' ? [{label: 'Carte', target: 'module:carte'}] : []})); }));
                dlg.querySelector('[data-cw-fromscreen]')?.addEventListener('click', () => {
                    const t = dlg.querySelector('[data-cw-fromscreen-sel]').value || 'module:carte';
                    go(baseDef({kind: 'screen', icon: '📺', name: t === 'person:' ? 'Fiche d’une personne' : ext.appScreen.label(t), target: t === 'person:' ? 'person:' : t, height: 560, sidebar: false, width: '12'}));
                });
                dlg.querySelectorAll('[data-cw-copy]').forEach(b => b.addEventListener('click', () => go(baseDef({name: label(b.dataset.cwCopy), ...FROM_APP[b.dataset.cwCopy](meta || {})}))));
                dlg.querySelectorAll('[data-cw-dress]').forEach(b => b.addEventListener('click', () => go(baseDef({kind: 'app', base: b.dataset.cwDress, icon: '', name: label(b.dataset.cwDress), width: '6'}))));
                dlg.querySelectorAll('[data-cw-mine]').forEach(b => b.addEventListener('click', () => { const d = mine.find(x => x.id === b.dataset.cwMine); go(baseDef({...d, name: (d.name || 'Mon widget') + ' (copie)'})); }));
                dlg.querySelectorAll('[data-cw-ex]').forEach(b => b.addEventListener('click', () => go(baseDef(ex[Number(b.dataset.cwEx)]))));
            },
        });
    }

    /** Nouvelle statistique : de zéro, d'une statistique de l'app, d'un de mes widgets, d'un exemple */
    function chooseStatStart(tile) {
        const mine = defs().filter(d => ['chart', 'appstat', 'numbers', 'list'].includes(d.kind)), ex = EXAMPLES(meta || {}).filter(d => ['chart', 'numbers', 'list'].includes(d.kind));
        ext.openDialog({
            eyebrow: 'NOUVELLE STATISTIQUE', title: 'Par quoi commencer ?', wide: true, submitLabel: '',
            body: `<h4>Partir de rien</h4><div class="h-templates">${['chart', 'numbers', 'list'].map(k => tile(KINDS[k][0], KINDS[k][1], KINDS[k][2], `data-cs-kind="${k}"`)).join('')}</div>
                <h4>Partir d’une statistique de l’app</h4><p class="muted">Les mêmes chiffres que dans Graphiques → Statistiques, avec ton dessin (barres, camembert, courbe, mosaïque…), tes couleurs, et autant de critères que tu veux : métier, lieu et rayon en km, dates précises, mariage, nombre d’enfants, durée de vie, divorce, voyage…</p>
                <div class="h-templates">${APP_STATS.map(([k, l]) => tile('📈', l, 'Statistique de l’app', `data-cs-app="${k}"`)).join('')}</div>
                ${mine.length ? `<h4>Partir d’un de mes widgets ou de mes statistiques</h4><div class="h-templates">${mine.map(d => tile(d.icon || '🧱', d.name || 'Mon widget', KINDS[d.kind]?.[1] || '', `data-cs-mine="${esc(d.id)}"`)).join('')}</div>` : ''}
                <h4>Exemples</h4><div class="h-templates">${ex.map((d, i) => tile(d.icon, d.name, KINDS[d.kind][1], `data-cs-ex="${i}"`)).join('')}</div>`,
            onOpen: dlg => {
                const go = d => { editing = {...d, inStats: true, width: '12'}; partIndex = -1; dlg.close(); renderEditor(++S().workspaceToken); };
                dlg.querySelectorAll('[data-cs-kind]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.csKind; go(baseDef({kind: k, icon: KINDS[k][0], name: '', style: 'bars'})); }));
                dlg.querySelectorAll('[data-cs-app]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.csApp; const st = baseDef({kind: 'appstat', icon: '📈', name: appStatLabel(k), statType: k, style: ['birth_years', 'death_years', 'age_at_death'].includes(k) ? 'columns' : 'bars', limit: 15}); go(appStatToChart(st) || st); }));
                dlg.querySelectorAll('[data-cs-mine]').forEach(b => b.addEventListener('click', () => { const d = mine.find(x => x.id === b.dataset.csMine); go(baseDef({...d, id: newId(), name: (d.name || 'Ma statistique') + ' (copie)'})); }));
                dlg.querySelectorAll('[data-cs-ex]').forEach(b => b.addEventListener('click', () => go(baseDef(ex[Number(b.dataset.csEx)]))));
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
                <label>+ Critère <select data-cw-addrule><option value="">choisir…</option>${ext.ruleOptionsHtml ? ext.ruleOptionsHtml(k) : ''}</select></label>`
            : src.list_id ? '<p class="muted">La liste est reprise telle qu’elle est enregistrée (critères, lignes ajoutées à la main, filtres de colonnes).</p>' : '<p class="muted">Toutes les lignes de cette liste de l’app.</p>'}</div>`;
    }
    const target = () => partIndex >= 0 && editing.parts?.[partIndex] ? editing.parts[partIndex] : editing;
    const srcAt = path => { const [kind, i] = path.split('.'), t = target(); return kind === 'c' ? t.counters[Number(i)].src : t.src; };
    // Légende : une phrase sous la partie pour dire ce qu'elle montre
    const captionField = d => d.kind === 'app' ? '' : `<label class="h-cw-caption-field">Légende <small>(ce que montre cette partie, affichée dessous)</small><input data-cw-caption value="${esc(d.caption || '')}" maxlength="400" placeholder="${esc(['chart', 'list', 'numbers'].includes(d.kind) ? proposeCaption(d) : 'Ex. : Les baptêmes de la paroisse, du plus ancien au plus récent')}"></label>${['chart', 'list', 'numbers', 'appstat'].includes(d.kind) ? '<button type="button" class="link-button" data-cw-propose>✨ Proposer une légende d’après les critères</button>' : ''}`;
    /** Une phrase qui dit ce que montre la partie : « Personnes — métier contient « bûcheron », à moins de 4 km de Pernay… ; comptées par nom de famille. » */
    function proposeCaption(d) {
        const rules = ext.listRules ? ext.listRules() : {};
        const types = ids => (meta?.event_types || []).filter(t => (ids || []).map(Number).includes(Number(t.id))).map(t => t.label.toLowerCase()).join(' ou ');
        const range = (a, b, unit = '') => a != null && b != null ? (a === b ? `exactement ${a}${unit}` : `de ${a} à ${b}${unit}`) : a != null ? `au moins ${a}${unit}` : b != null ? `au plus ${b}${unit}` : '';
        const fr = iso => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : ''; };
        const one = r => {
            const label = (rules[r.field]?.[d.src?.source === 'events' ? 'ev' : 'pe'] || r.field).replace(/\s*\(lieu contient\)/, '').replace(' … km de', '').replace(' entre … ans', '');
            const not = r.not ? 'pas : ' : '';
            switch (r.field) {
                case 'event_type': return `${not}${d.src?.source === 'events' ? 'événements' : 'a eu'} : ${types(r.values) || '?'}${r.from || r.to ? ' (' + range(r.from, r.to) + ')' : ''}`;
                case 'gender': return not + ({female: 'femmes', male: 'hommes', unknown: 'sexe inconnu'}[r.value] || '');
                case 'sosa': return not + 'mes ancêtres';
                case 'no_parents': case 'no_source': return not + label.toLowerCase();
                case 'near_place': return `${not}à moins de ${r.km || '?'} km de ${r.value || '?'}`;
                case 'date_range': return `${not}${label.toLowerCase()} ${[fr(r.date_from) && 'le ' + fr(r.date_from), fr(r.date_to) && 'le ' + fr(r.date_to)].filter(Boolean).join(' et ')}`;
                case 'age_at': return `${not}âge ${range(r.from, r.to, ' ans')}${r.values?.length ? ' à : ' + types(r.values) : ''}`;
                case 'lifespan': return `${not}a vécu ${range(r.from, r.to, ' ans')}`;
                case 'children_count': return `${not}${range(r.from, r.to)} enfant${(r.to ?? r.from) > 1 ? 's' : ''}`;
                case 'unions_count': return `${not}${range(r.from, r.to)} union${(r.to ?? r.from) > 1 ? 's' : ''}`;
                case 'event_count': return `${not}${range(r.from, r.to)} × ${types(r.values) || 'événement'}`;
                case 'of_person': return not + ({ancestors: 'ses ancêtres', descendants: 'ses descendants', branch: 'ses ancêtres et ses descendants', family: 'sa famille proche', surname: 'les personnes de même nom'}[r.value || 'ancestors'] || '');
                case 'living': return not + ({living: 'vivants', deceased: 'décédés', unknown: 'statut à vérifier'}[r.value] || '');
                case 'bookmarked': case 'has_media': return not + label.toLowerCase();
                case 'sosa_generation': return `${not}génération Sosa ${range(r.from, r.to)}`;
                case 'birth_month': return `${not}né(e) en ${(r.values || []).map(m => MONTHS[Number(m) - 1]).filter(Boolean).join(' ou ')}`;
                case 'source_count': return `${not}${range(r.from, r.to)} source${(r.to ?? r.from) > 1 ? 's' : ''}`;
                case 'label': return `${not}étiquette : ${(meta?.labels || []).filter(t => (r.values || []).map(Number).includes(Number(t.id))).map(t => t.name).join(' ou ')}`;
                case 'year': case 'death_year': return `${not}${label.toLowerCase()} ${range(r.from, r.to)}`.replace(' entre de ', ' de ');
                default: return r.value ? `${not}${label.toLowerCase()} « ${r.value} »` : '';
            }
        };
        if (d.kind === 'appstat') return `${appStatLabel(d.statType)}${d.statGender ? ', ' + ({female: 'femmes', male: 'hommes', unknown: 'sexe inconnu'}[d.statGender]) : ''}${d.statFrom || d.statTo ? `, nés ${d.statFrom ? 'à partir du ' + d.statFrom : ''}${d.statFrom && d.statTo ? ' ' : ''}${d.statTo ? 'jusqu’au ' + d.statTo : ''}` : ''}${d.statLineage ? ', mes ancêtres' : ''}.`;
        const src = d.kind === 'numbers' ? null : d.src || {};
        if (d.kind === 'numbers') return (d.counters || []).map(c => c.label).filter(Boolean).join(' · ');
        if (src.list_id) { const l = (meta?.lists || []).find(x => Number(x.id) === Number(src.list_id)); return `D’après ma liste « ${l?.name || '?'} »${d.kind === 'chart' && d.group ? ', comptée par ' + (columnsOf(src).find(c => c[0] === d.group)?.[1] || d.group).toLowerCase() : ''}.`; }
        const what = {persons: 'Personnes', events: 'Événements'}[src.source || 'persons'] || (meta?.sources?.[src.source] || 'Lignes');
        const crit = (src.definition?.rules || []).map(one).filter(Boolean);
        const join = src.definition?.match === 'any' ? ' ou ' : ', ';
        const by = d.kind === 'chart' && d.group ? ` ; comptées par ${(columnsOf(src).find(c => c[0] === d.group)?.[1] || d.group).toLowerCase()}${d.groupBy === 'decade' ? ' (par décennie)' : d.groupBy === 'century' ? ' (par siècle)' : d.groupBy === 'year' ? ' (par année)' : d.groupBy === 'month' ? ' (par mois)' : d.groupBy === 'step' ? ` (par tranche de ${d.groupStep || 25})` : ''}` : '';
        const period = d.kind === 'chart' && (d.rangeFrom || d.rangeTo) ? `, du ${d.rangeFrom || '…'} au ${d.rangeTo || '…'}` : '';
        return `${what}${crit.length ? ' — ' + crit.join(join) : ' — toute la base'}${period}${by}.`;
    }
    function kindHtml() { return kindHtmlInner() + captionField(target()); }
    /** Dessin, couleurs et nombre de valeurs : communs au graphique et à la statistique de l'app */
    function drawHtml(d) {
        // les dessins simples, puis tous les types de « Mes diagrammes » (même catalogue, même ordre, mêmes groupes : Maintenance → Types de diagrammes)
        const dgGroups = ext.diagramStatStyles ? ext.diagramStatStyles() : [];
        const hiddenDg = String(d.style || '').startsWith('dg:') && !dgGroups.some(([, items]) => items.some(([k]) => k === d.style)); // masqué dans les types : on le garde choisi, sinon le prochain enregistrement écrirait « Barres »
        return `<label>Dessin <select data-cw-style>${hiddenDg ? `<option value="${esc(d.style)}" selected>${esc(d.style.slice(3))} (type masqué)</option>` : ''}<optgroup label="Dessins simples">${CHART_STYLES.map(([k, l]) => `<option value="${k}" ${(d.style || 'bars') === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</optgroup>${dgGroups.map(([g, items]) => `<optgroup label="📊 ${esc(g)}">${items.map(([k, l]) => `<option value="${esc(k)}" ${d.style === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</optgroup>`).join('')}</select></label>
                <label>Couleurs <select data-cw-palette>${[['vive', 'Vives'], ['pastel', 'Pastel'], ['terre', 'Terre'], ['mer', 'Mer'], ['sepia', 'Sépia (photos anciennes)'], ['accent', 'Une couleur en dégradé']].map(([k, l]) => `<option value="${k}" ${(d.palette || 'vive') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                ${d.palette === 'accent' ? `<label>Couleur du dégradé<input type="color" data-cw-accent value="${esc(color(d.accentColor) || '#0066cc')}"></label>` : ''}
                <div class="span-2"><span class="section-label">Couleur de chaque valeur</span><div class="h-cw-valcolors" data-cw-valcolors><small class="muted">Les valeurs apparaissent ici après le calcul de l’aperçu.</small></div></div>
                <label>Valeurs les plus fréquentes<input type="number" min="2" max="60" data-cw-limit value="${esc(d.limit || 10)}"></label>`;
    }
    function kindHtmlInner() {
        const d = target();
        if (d.kind === 'screen') {
            const sc = ext.appScreen; if (!sc) return '<p class="muted">Écrans indisponibles.</p>';
            const isPerson = String(d.target || '').startsWith('person:');
            return `<div class="form-grid"><label class="span-2">Écran ${sc.select(isPerson ? 'person:' : (d.target || 'module:carte'), 'data-cw-screen')}</label>${sc.place?.kind(d.target) ? sc.place.html(d) : ''}
                ${isPerson ? `<label>Personne${A().collectionPersonField('cw_screenperson', Number(String(d.target).slice(7)) ? {id: Number(String(d.target).slice(7)), first_name: d.personName || '', last_name: ''} : null, 'Nom de la personne')}</label>` : ''}
                <label>Hauteur <select data-cw-screenh>${sc.heights.map(([v, l]) => `<option value="${v}" ${String(d.height || 560) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                <label class="checkbox-line"><input type="checkbox" data-cw-screensb ${d.sidebar ? 'checked' : ''}> <span>avec sa colonne de gauche (ses menus)</span></label></div>`;
        }
        if (d.kind === 'appstat') {
            const y = v => Number(v) || '';
            return `<div class="form-grid"><label class="span-2">Statistique <select data-cw-stat>${APP_STATS.map(([k, l]) => `<option value="${k}" ${(d.statType || 'surnames') === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                <label>Nés à partir du <small>(date précise ou année, facultatif)</small><input data-cw-statnum="statFrom" value="${esc(d.statFrom || '')}" placeholder="12 mars 1750 ou 1700"></label>
                <label>jusqu’au<input data-cw-statnum="statTo" value="${esc(d.statTo || '')}" placeholder="31/12/1850 ou 1900"></label>
                ${APP_STAT_AS_CHART[d.statType] ? `<p class="span-2"><button type="button" class="button small" data-cw-tochart>➕ Ajouter d’autres conditions (métier, lieu et km, mariage, nombre d’enfants, durée de vie, divorce, voyage…)</button></p>` : '<p class="span-2 muted">Cette statistique garde ses seuls filtres (années, sexe, lignée).</p>'}
                <label>Sexe <select data-cw-statgender>${[['', 'tous'], ['female', 'femmes'], ['male', 'hommes'], ['unknown', 'non renseigné']].map(([k, l]) => `<option value="${k}" ${(d.statGender || '') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                <label class="checkbox-line"><input type="checkbox" data-cw-statlineage ${d.statLineage ? 'checked' : ''}> seulement mes ancêtres (lignée Sosa)</label>
                ${drawHtml(d)}
                <label class="checkbox-line span-2"><input type="checkbox" data-cw-skipempty ${d.skipEmpty !== false ? 'checked' : ''}> ne pas montrer les valeurs vides</label></div>`;
        }
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
                <label>Regrouper <select data-cw-groupby>${[['value', 'par valeur'], ['year', 'par année'], ['decade', 'par décennie'], ['step', 'par tranche (de … ans, ou de … pour un nombre)'], ['century', 'par siècle'], ['month', 'par mois de l’année']].map(([v, l]) => `<option value="${v}" ${d.groupBy === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                ${d.groupBy === 'step' ? `<label>Tranche de<input type="number" min="1" max="500" data-cw-groupstep value="${esc(d.groupStep || 25)}"> ans</label>` : ''}
                <label>Seulement du <small>(date précise ou année, facultatif)</small><input data-cw-range="rangeFrom" value="${esc(d.rangeFrom || '')}" placeholder="12 mars 1750 ou 1750"></label>
                <label>au<input data-cw-range="rangeTo" value="${esc(d.rangeTo || '')}" placeholder="31/12/1800 ou 1800"></label>
                ${drawHtml(d)}
                <label class="checkbox-line span-2"><input type="checkbox" data-cw-skipempty ${d.skipEmpty !== false ? 'checked' : ''}> ne pas compter les cases vides</label></div>`;
        }
        if (d.kind === 'journey') {
            const row = journeyRowHtml;
            return `<div class="form-grid"><label>Les étapes viennent<select data-cw-jsource><option value="manual" ${d.jSource !== 'person' ? 'selected' : ''}>de ce que j’écris ici</option><option value="person" ${d.jSource === 'person' ? 'selected' : ''}>des événements d’une personne</option></select></label>
                <label>Présentation<select data-cw-jlayout>${J_LAYOUTS.map(([k, l]) => `<option value="${k}" ${(d.jLayout || 'vertical') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                <label>Ordre<select data-cw-jorder><option value="date" ${d.jOrder !== 'manual' ? 'selected' : ''}>par date</option><option value="manual" ${d.jOrder === 'manual' ? 'selected' : ''}>dans l’ordre écrit</option></select></label>
                <label>Hauteur de la carte<input type="number" min="160" max="600" step="20" data-cw-jmaph value="${esc(d.jMapHeight || 280)}"></label>
                <div class="span-2 h-checks"><label class="checkbox-line"><input type="checkbox" data-cw-jflag="jMap" ${d.jMap !== false ? 'checked' : ''}> Carte du parcours</label><label class="checkbox-line"><input type="checkbox" data-cw-jflag="jDays" ${d.jDays !== false ? 'checked' : ''}> « Jour 1, Jour 2… »</label><label class="checkbox-line"><input type="checkbox" data-cw-jflag="jText" ${d.jText !== false ? 'checked' : ''}> Textes des étapes</label>${d.jSource === 'person' ? `<label class="checkbox-line"><input type="checkbox" data-cw-jflag="jWithPlace" ${d.jWithPlace ? 'checked' : ''}> Seulement les événements avec un lieu</label>` : ''}</div></div>
                ${d.jSource === 'person' ? `<label>Personne${A().collectionPersonField('cw_jperson', Number(d.jPerson) ? {id: Number(d.jPerson), first_name: d.jPersonName || '#' + d.jPerson, last_name: ''} : null, 'Nom de la personne')}</label>`
                : `<div data-j-rows>${(d.steps || []).map(row).join('')}</div><button type="button" class="button small secondary" data-j-add>+ Étape</button><p class="muted">Dates libres (« 12 mars 1943 », « vers 1850 »…) ; avec des dates complètes, l’app compte les jours et les durées. Le lieu choisi dans la liste se place sur la carte.</p>`}`;
        }
        if (d.kind === 'diagram') { const items = ext.diagramItems?.() || [];
            return `<div class="form-grid"><label class="span-2">Diagramme<select data-cw-diagram><option value="">— choisir —</option>${items.map(([id, l]) => `<option value="${id}" ${Number(d.diagramId) === Number(id) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label><p class="span-2"><button type="button" class="button small secondary" data-cw-dgnew>+ Nouveau diagramme</button> ${Number(d.diagramId) ? '<button type="button" class="button small secondary" data-cw-dgedit>✎ Modifier ce diagramme</button>' : ''}</p><p class="span-2 muted">Le widget montre toujours la dernière version du diagramme (Graphiques → Mes diagrammes).</p></div>`; }
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
        A().$('#workspace').innerHTML = `<section class="page collection-page h-be h-cw-editor">${header(mode === 'stats' ? 'ÉDITEUR DE STATISTIQUES' : 'ÉDITEUR DE WIDGETS', root._existing ? `Modifier « ${root.name || 'Mon widget'} »` : mode === 'stats' ? 'Nouvelle statistique' : 'Nouveau widget', 'Règle ton widget à gauche ; l’aperçu se met à jour à droite.', '<button type="button" class="button secondary" data-cw-cancel>← Retour</button>')}
            <div class="h-cw-layout"><div>
            <section class="maintenance-panel"><h3>1. Le widget</h3><div class="form-grid">
                <label>Titre<input data-cw="name" value="${esc(root.name || '')}" placeholder="Mes ancêtres bretons"></label><label>Icône<input data-cw="icon" value="${esc(root.icon || '')}" maxlength="16" class="h-be-icon" placeholder="🧱"></label>
                <label>Sorte <select data-cw-kindsel>${Object.entries(KINDS).map(([k, [i, l]]) => `<option value="${k}" ${root.kind === k ? 'selected' : ''}>${i} ${esc(l)}</option>`).join('')}</select></label>
                <label>Largeur <select data-cw="width">${WIDTHS.map(([v, l]) => `<option value="${v}" ${String(root.width) === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                <div class="span-2"><span class="section-label">Couleur</span><div class="h-cw-colors"><button type="button" class="h-cw-swatch ${!color(root.color) ? 'is-on' : ''}" data-cw-color="" title="Aucune">∅</button>${COLORS.map(c => `<button type="button" class="h-cw-swatch ${root.color === c ? 'is-on' : ''}" data-cw-color="${c}" style="background:${c}" title="${c}"></button>`).join('')}<input type="color" data-cw-colorpick value="${esc(color(root.color) || '#0066cc')}" title="Autre couleur"></div></div>
                <label class="span-2">Texte en haut du widget <small>(facultatif)</small><textarea rows="2" data-cw="note" placeholder="Une phrase pour expliquer ce widget">${esc(root.note || '')}</textarea></label>
                <fieldset class="span-2 h-be-display"><legend>Où l’afficher</legend>
                    ${root.kind === 'app' ? '' : `<label class="checkbox-line"><input type="checkbox" data-cw-instats ${root.inStats ? 'checked' : ''}> <span>📊 en grand dans Graphiques → « Mes statistiques » (graphique, chiffres ou liste)</span></label>`}
                    <label class="checkbox-line"><input type="checkbox" data-cw-ondash ${root._onDash ?? onDashboard(root.id) ? 'checked' : ''}> <span>🧱 en widget sur le tableau de bord</span></label>
                    <small class="muted">Et dans un de tes onglets : Maintenance → Éditeur d’onglets, ou la colonne de gauche de l’onglet.</small></fieldset></div></section>
            <section class="maintenance-panel"><h3>2. ${partIndex >= 0 ? `Partie ${partIndex + 2} : ` : ''}${esc(KINDS[d.kind]?.[1] || '')}</h3>${partTabs}${partHead}<p class="muted">${esc(KINDS[d.kind]?.[2] || '')}${root.kind !== 'app' && partIndex < 0 && !(root.parts || []).length ? ' Pour mettre plusieurs choses dans le même widget (plusieurs textes, des chiffres et des raccourcis…), « + Ajouter une partie ».' : ''}</p><div data-cw-kind-box>${kindHtml()}</div></section>
            <div class="page-actions"><button type="button" class="button" data-cw-save>Enregistrer</button>${root.inStats ? '<button type="button" class="button secondary" data-cw-savegraph>Enregistrer et ouvrir dans Graphiques</button>' : ''}${root._existing ? '' : '<button type="button" class="button secondary" data-cw-saveadd>Enregistrer et ajouter au tableau de bord</button>'}<button type="button" class="button secondary" data-cw-cancel>Annuler</button></div>
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
            const holder = ws.querySelector('[data-cw-valcolors]'); if (!holder || !['chart', 'appstat'].includes(d.kind)) return;
            const data = tdatas?.[0]; if (!data?.shown && !data?.appstat) return;
            const entries = groupRows(data, d);
            const line = ['line', 'area'].includes(d.style);
            holder.innerHTML = line ? `<label class="h-cw-valcolor"><input type="color" data-cw-valcolor="__line" value="${esc(color(d.valueColors?.__line) || PALETTE[0])}"> la courbe</label>`
                : entries.map(([v], i) => { const c = chartColor(d, v, i); return `<label class="h-cw-valcolor"><input type="color" data-cw-valcolor="${esc(v)}" value="${esc(color(c) || PALETTE[i % PALETTE.length])}"> ${esc(v)}</label>`; }).join('') || '<small class="muted">Aucune valeur.</small>';
            if (d.valueColors && Object.keys(d.valueColors).length) holder.insertAdjacentHTML('beforeend', '<button type="button" class="link-button" data-cw-valreset>remettre les couleurs de la palette</button>');
        }
        preview();
        ws.querySelectorAll('[data-cw-cancel]').forEach(b => b.addEventListener('click', () => { editing = null; if (ext.blockStatReturn) { ext.blockStatReturn = null; S().maintenanceTab = 'block_editor'; A().setModule('maintenance'); return; } backToList(); }));
        ws.querySelector('[data-cw-instats]')?.addEventListener('change', e => { root.inStats = e.target.checked; again(); });
        ws.querySelector('[data-cw-ondash]')?.addEventListener('change', e => { root._onDash = e.target.checked; });
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
            if (e.target.matches('[data-cw-diagram]')) { d.diagramId = Number(e.target.value) || 0; if (d === root && !root.name) root.name = e.target.selectedOptions[0]?.textContent.replace(/^\S+\s/, '') || ''; return again(); }
            const srcBox = e.target.closest('[data-cw-src]');
            if (srcBox) {
                const src = srcAt(srcBox.dataset.cwSrc);
                if (e.target.matches('[data-cw-srcsel]')) {
                    const v = e.target.value; Object.keys(src).forEach(k => delete src[k]);
                    if (v.startsWith('list:')) src.list_id = Number(v.slice(5)); else { src.source = v; src.definition = {match: 'all', rules: []}; }
                    if (srcBox.dataset.cwSrc === 's') { d.columns = []; d.sort = null; d.group = ''; }
                    return again();
                }
                if (e.target.matches('[data-cw-addrule]') && e.target.value) { src.definition.rules.push({field: e.target.value, value: {gender: 'female', living: 'deceased', of_person: 'ancestors'}[e.target.value] || '', values: []}); return again(); }
                if (e.target.matches('[data-cw-match]')) { src.definition.match = e.target.value; return preview(); }
                readRule(e, src);
                return;
            }
            if (e.target.matches('[data-cw-col]')) { d.columns = [...box.querySelectorAll('[data-cw-col]:checked')].map(x => x.dataset.cwCol); }
            if (e.target.matches('[data-cw-sortcol]')) d.sort = e.target.value ? {col: e.target.value, dir: box.querySelector('[data-cw-sortdir]').value} : null;
            if (e.target.matches('[data-cw-sortdir]') && d.sort) d.sort.dir = e.target.value;
            if (e.target.matches('[data-cw-group]')) d.group = e.target.value;
            if (e.target.matches('[data-cw-groupby]')) { d.groupBy = e.target.value; d.valueColors = {}; return again(); }
            if (e.target.matches('[data-cw-style]')) { d.style = e.target.value; preview(); return; }
            if (e.target.matches('[data-cw-palette]')) { d.palette = e.target.value; d.valueColors = {}; return again(); }
            if (e.target.matches('[data-cw-accent]')) { d.accentColor = e.target.value; d.valueColors = {}; }
            if (e.target.matches('[data-cw-valcolor]')) { d.valueColors = {...(d.valueColors || {}), [e.target.dataset.cwValcolor]: e.target.value}; }
            if (e.target.matches('[data-cw-skipempty]')) d.skipEmpty = e.target.checked;
            if (e.target.matches('[data-cw-base]')) d.base = e.target.value;
            if (e.target.matches('[data-cw-screen]')) { d.target = e.target.value === 'person:' ? 'person:' + (Number(d.personId) || '') : e.target.value; return again(); }
            if (e.target.matches('[data-cw-screenh]')) d.height = Number(e.target.value) || 560;
            if (e.target.matches('[data-cw-screensb]')) d.sidebar = e.target.checked;
            if (e.target.matches('[data-cw-stat]')) { d.statType = e.target.value; d.valueColors = {}; if (!String(root.name || '').trim() || APP_STATS.some(([, l]) => l === root.name)) { root.name = appStatLabel(d.statType); const n = ws.querySelector('[data-cw="name"]'); if (n && partIndex < 0) n.value = root.name; } }
            if (e.target.matches('[data-cw-statnum]')) d[e.target.dataset.cwStatnum] = e.target.value.trim();
            if (e.target.matches('[data-cw-statgender]')) d.statGender = e.target.value;
            if (e.target.matches('[data-cw-statlineage]')) d.statLineage = e.target.checked;
            if (e.target.matches('[data-cw-linktarget]')) { const i = Number(e.target.closest('[data-cw-link]').dataset.cwLink); d.links[i].target = e.target.value; return again(); }
            preview();
        });
        box.addEventListener('input', e => {
            const srcBox = e.target.closest('[data-cw-src]');
            if (srcBox && e.target.closest('[data-lr-i]')) { readRule(e, srcAt(srcBox.dataset.cwSrc)); return; }
            if (e.target.matches('[data-cw-counter]')) d.counters[Number(e.target.dataset.cwCounter)].label = e.target.value;
            if (e.target.matches('[data-cw-limit]')) d.limit = Number(e.target.value) || 8;
            if (e.target.matches('[data-cw-groupstep]')) d.groupStep = Number(e.target.value) || 25;
            if (e.target.matches('[data-cw-range]')) d[e.target.dataset.cwRange] = e.target.value.trim();
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
            if (e.target.closest('[data-cw-tochart]')) { const c = appStatToChart(d); if (c) { Object.keys(d).forEach(k => delete d[k]); Object.assign(d, c); toast('C’est maintenant un graphique : ajoute tes conditions avec « + Critère ».'); return again(); } }
            if (e.target.closest('[data-cw-dgnew]')) { ext.openDiagramEditor?.(null, {onSave: id => { d.diagramId = id; again(); }}); return; }
            if (e.target.closest('[data-cw-dgedit]')) { ext.openDiagramEditor?.(Number(d.diagramId), {onSave: () => again()}); return; }
            if (e.target.closest('[data-cw-propose]')) { d.caption = proposeCaption(d); return again(); }
            if (e.target.closest('[data-cw-linkadd]')) { d.links.push({label: '', target: 'module:personnes'}); return again(); }
            const ld = e.target.closest('[data-cw-linkdel]'); if (ld) { d.links.splice(Number(ld.closest('[data-cw-link]').dataset.cwLink), 1); return again(); }
        });
        // ── Écran de l'app : la personne choisie pour « Fiche d'une personne » ──
        if (d.kind === 'screen') {
            A().bindCollectionPersonFields?.(box);
            if (ext.appScreen?.place?.kind(d.target)) {
                ext.appScreen.place.bind(box, d, () => {
                    // nom du widget : celui de la commune, tant qu'il n'a pas été changé à la main
                    const auto = d === root && ( !root.name || /^(Fiche d’un village|Monographie de commune|Monographie — |🏘️ )/.test(root.name) || root.name === root._autoName);
                    if (auto && d.placeName) { root.name = root._autoName = (ext.appScreen.place.kind(d.target) === 'village' ? '🏘️ ' : 'Monographie — ') + d.placeName; const n = ws.querySelector('[data-cw="name"]'); if (n) n.value = root.name; }
                    preview();
                });
                if (!ext.appScreen._villagesLoaded) { ext.appScreen._villagesLoaded = true; ext.appScreen.loadLists().then(() => again()); } // la liste des communes
            }
            box.addEventListener('click', () => setTimeout(() => {
                const h = box.querySelector('[name=cw_screenperson]'); const id = Number(h?.value) || 0;
                if (id && d.target !== 'person:' + id) { d.target = 'person:' + id; d.personId = id; d.personName = box.querySelector('[data-cp-input="cw_screenperson"]')?.value || ''; preview(); }
            }, 0));
        }
        // ── Parcours jour par jour : étapes, personne, réglages ──
        if (d.kind === 'journey') {
            A().bindCollectionPersonFields?.(box);
            const readSteps = () => readJourneyRows(box);
            const syncSteps = () => { if (d.jSource !== 'person') d.steps = readSteps(); };
            const readPerson = () => { const h = box.querySelector('[name=cw_jperson]'); if (!h) return; const id = Number(h.value) || 0; if (id !== Number(d.jPerson)) { d.jPerson = id; d.jPersonName = h.closest('label')?.querySelector('input:not([type=hidden])')?.value || ''; preview(); } };
            box.addEventListener('input', e => { if (e.target.closest('[data-j-row]')) { syncSteps(); preview(); } });
            box.addEventListener('change', e => {
                if (e.target.closest('[data-j-row]')) { syncSteps(); preview(); return; }
                if (e.target.matches('[data-cw-jsource]')) { syncSteps(); d.jSource = e.target.value; again(); return; }
                if (e.target.matches('[data-cw-jlayout]')) { d.jLayout = e.target.value; preview(); }
                if (e.target.matches('[data-cw-jorder]')) { d.jOrder = e.target.value; preview(); }
                if (e.target.matches('[data-cw-jmaph]')) { d.jMapHeight = Number(e.target.value) || 280; preview(); }
                if (e.target.matches('[data-cw-jflag]')) { d[e.target.dataset.cwJflag] = e.target.checked; if (e.target.dataset.cwJflag === 'jWithPlace') return again(); preview(); }
                readPerson();
            });
            box.addEventListener('click', e => {
                if (e.target.closest('[data-h-place-pick]')) { setTimeout(() => { syncSteps(); preview(); }, 0); return; } // lieu choisi : ses coordonnées vont sur la carte
                setTimeout(readPerson, 0); // une personne choisie dans la liste
                const row = e.target.closest('[data-j-row]'), rows = [...box.querySelectorAll('[data-j-row]')], i = rows.indexOf(row);
                if (e.target.closest('[data-j-add]')) { syncSteps(); d.steps.push({emoji: '', date: '', title: '', place: '', color: color(root.color) || '#0066cc'}); again(); setTimeout(() => { const r = [...A().$('#workspace').querySelectorAll('[data-j-row]')].pop(); r?.querySelector('[data-j="date"]')?.focus(); }, 0); return; }
                if (row && e.target.closest('[data-j-del]')) { syncSteps(); d.steps.splice(i, 1); return again(); }
                if (row && e.target.closest('[data-j-up]') && i > 0) { syncSteps(); [d.steps[i - 1], d.steps[i]] = [d.steps[i], d.steps[i - 1]]; return again(); }
                if (row && e.target.closest('[data-j-down]') && i < rows.length - 1) { syncSteps(); [d.steps[i + 1], d.steps[i]] = [d.steps[i], d.steps[i + 1]]; return again(); }
            });
        }
        function readRule(e, src) {
            const row = e.target.closest('[data-lr-i]'); if (!row) return;
            const r = src.definition.rules[Number(row.dataset.lrI)];
            row.querySelectorAll('[data-lr]').forEach(el => { const f = el.dataset.lr; r[f] = f === 'not' ? el.checked : f === 'values' ? [...el.selectedOptions].map(o => Number(o.value)) : (f === 'from' || f === 'to') ? (el.value === '' ? null : Number(el.value)) : el.value; });
            preview();
        }
        const save = (andAdd, andGraph = false) => {
            if (!String(root.name || '').trim()) { toast('Donne un titre au widget.', 'error'); ws.querySelector('[data-cw="name"]').focus(); return; }
            // Légende vide d'un graphique ou d'une liste avec des critères : on garde la légende proposée
            [root, ...(root.parts || [])].forEach(p => { if (!String(p.caption || '').trim() && ['chart', 'list'].includes(p.kind) && (p.src?.definition?.rules || []).length) p.caption = proposeCaption(p); });
            const clean = cleanDef(root), list = defs(), i = list.findIndex(x => x.id === clean.id), before = i >= 0 ? list[i] : null;
            if (i >= 0) list[i] = clean; else list.push(clean);
            saveDefs(list);
            // Déjà sur le tableau de bord : on le met à jour (largeur comprise) au lieu d'en proposer un deuxième
            const settings = A().dashboardBlockSettings(), placed = settings.widgets.filter(w => w.type === clean.id);
            if (placed.length) {
                if (before && String(before.width) !== String(clean.width)) { placed.forEach(w => { w.width = clean.width; }); A().saveDashboardBlockSettings(settings); }
                toast('Widget enregistré : le tableau de bord est à jour.');
            } else if (andAdd) addToDashboard(clean.id);
            else toast(clean.inStats ? 'Enregistré : il est dans Graphiques → Statistiques, rubrique « Mes statistiques ».' : 'Widget enregistré : ajoute-le depuis la colonne de gauche du tableau de bord.');
            editing = null;
            if (root._onDash !== undefined) setOnDashboard(clean.id, !!root._onDash);
            if (ext.blockStatReturn && ext.attachStatToBlock?.(clean.id)) return; // venue d'un bloc de fiche : on y retourne
            if (andGraph) ext.openCustomStat(clean.id); else if (andAdd) A().setModule('dashboard'); else backToList();
        };
        ws.querySelector('[data-cw-save]').addEventListener('click', () => save(false));
        ws.querySelector('[data-cw-savegraph]')?.addEventListener('click', () => save(false, true));
        ws.querySelector('[data-cw-saveadd]')?.addEventListener('click', () => save(true));
    }

    /* ─── Nettoyage, partage, import ─── */
    const str = (v, n) => String(v ?? '').slice(0, n);
    function cleanSrc(src) {
        src = src && typeof src === 'object' ? src : {};
        if (Number(src.list_id) > 0) return {list_id: Number(src.list_id)};
        const source = ['persons', 'events', ...Object.keys(meta?.sources || {places: 1, media: 1, occupations: 1, census: 1, reminders: 1, sources: 1, family_objects: 1, courriers: 1, graves: 1, budget: 1, living: 1})].includes(src.source) ? src.source : 'persons';
        const rules = (Array.isArray(src.definition?.rules) ? src.definition.rules : []).slice(0, 30).map(r => ({field: str(r.field, 30), value: str(r.value, 200), from: r.from === '' || r.from == null || !Number.isFinite(Number(r.from)) ? null : Number(r.from), to: r.to === '' || r.to == null || !Number.isFinite(Number(r.to)) ? null : Number(r.to), values: (Array.isArray(r.values) ? r.values : []).map(Number).filter(Boolean).slice(0, 200), not: !!r.not,
            date_from: /^\d{4}-\d{2}-\d{2}$/.test(String(r.date_from || '')) ? r.date_from : '', date_to: /^\d{4}-\d{2}-\d{2}$/.test(String(r.date_to || '')) ? r.date_to : '', km: Math.max(0, Math.min(1000, Number(r.km) || 0))}));
        return {source, definition: {match: src.definition?.match === 'any' ? 'any' : 'all', rules}};
    }
    function cleanDef(d) {
        const kind = KINDS[d.kind] ? d.kind : 'text';
        const out = {id: /^cw_[a-z0-9]{4,24}$/.test(String(d.id)) ? d.id : newId(), name: str(d.name, 80).trim(), icon: str(d.icon, 16), color: color(d.color), width: WIDTHS.some(w => w[0] === String(d.width)) ? String(d.width) : '6', note: str(d.note, 1000), kind, inStats: !!d.inStats && kind !== 'app'};
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
        if (kind === 'chart') Object.assign(out, {group: str(d.group, 40), groupBy: ['value', ...TIME_GROUPS].includes(d.groupBy) ? d.groupBy : 'value', groupStep: Math.max(1, Math.min(500, Number(d.groupStep) || 25)), rangeFrom: str(d.rangeFrom, 40), rangeTo: str(d.rangeTo, 40), style: (CHART_STYLES.some(([k]) => k === d.style) || /^dg:[a-z0-9_]{2,30}(:[a-z0-9_]{1,30})?$/.test(String(d.style || ''))) ? d.style : 'bars', skipEmpty: d.skipEmpty !== false,
            palette: [...Object.keys(PALETTES), 'accent'].includes(d.palette) ? d.palette : 'vive', accentColor: color(d.accentColor) || '#0066cc',
            valueColors: Object.fromEntries(Object.entries(d.valueColors && typeof d.valueColors === 'object' ? d.valueColors : {}).filter(([k, v]) => color(v)).slice(0, 80).map(([k, v]) => [str(k, 80), v]))});
        if (kind === 'screen') { const ok = ext.appScreen?.valid(d.target); Object.assign(out, ok ? (ext.appScreen.place?.clean(d) || {}) : {}, {target: ok ? String(d.target) : 'module:carte', personName: str(d.personName, 120), personId: Number(d.personId) || 0, height: Math.max(240, Math.min(2000, Number(d.height) || 560)), sidebar: !!d.sidebar}); }
        if (kind === 'appstat') Object.assign(out, {statType: APP_STATS.some(([k]) => k === d.statType) ? d.statType : 'surnames', statFrom: str(d.statFrom, 40).trim(), statTo: str(d.statTo, 40).trim(),
            statGender: ['male', 'female', 'unknown'].includes(d.statGender) ? d.statGender : '', statLineage: !!d.statLineage, limit: Math.max(1, Math.min(60, Number(d.limit) || 10)), style: (CHART_STYLES.some(([k]) => k === d.style) || /^dg:[a-z0-9_]{2,30}(:[a-z0-9_]{1,30})?$/.test(String(d.style || ''))) ? d.style : 'bars', skipEmpty: d.skipEmpty !== false,
            palette: [...Object.keys(PALETTES), 'accent'].includes(d.palette) ? d.palette : 'vive', accentColor: color(d.accentColor) || '#0066cc',
            valueColors: Object.fromEntries(Object.entries(d.valueColors && typeof d.valueColors === 'object' ? d.valueColors : {}).filter(([k, v]) => color(v)).slice(0, 80).map(([k, v]) => [str(k, 80), v]))});
        if (kind !== 'app') out.caption = str(d.caption, 400);
        if (kind === 'journey') {
            const num = v => { const n = Number(v); return v === '' || v == null || !Number.isFinite(n) ? '' : n; };
            Object.assign(out, {jSource: d.jSource === 'person' ? 'person' : 'manual', jPerson: Number(d.jPerson) || 0, jPersonName: str(d.jPersonName, 120), jLayout: J_LAYOUTS.some(([k]) => k === d.jLayout) ? d.jLayout : 'vertical',
                jMap: d.jMap !== false, jDays: d.jDays !== false, jText: d.jText !== false, jOrder: d.jOrder === 'manual' ? 'manual' : 'date', jWithPlace: !!d.jWithPlace, jMapHeight: Math.max(160, Math.min(600, Number(d.jMapHeight) || 280)),
                steps: (Array.isArray(d.steps) ? d.steps : []).slice(0, 300).map(x => ({date: str(x.date, 60), date_end: str(x.date_end, 60), title: str(x.title, 160), place: str(x.place, 200), lat: num(x.lat), lon: num(x.lon), emoji: str(x.emoji, 16), color: color(x.color), text: str(x.text, 2000)}))});
        }
        if (kind === 'text') out.text = str(d.text, 5000);
        if (kind === 'diagram') out.diagramId = Math.max(0, Number(d.diagramId) || 0);
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
    /** une statistique reçue (fichier .lcnda-widget.json) : rangée dans « Mes statistiques » ; rend sa clé de source pour un diagramme */
    ext.importCustomStat = json => { const d = importDef(json); d.inStats = true; saveDefs([...defs(), d]); return {key: `my:${d.id}`, name: d.name}; };
    // Ouverts depuis l'Éditeur de blocs (champ « Statistique ») : nouvelle statistique, ou réglage d'une existante
    ext.newStatFor = async () => { mode = 'stats'; S().maintenanceTab = 'stats_editor'; await A().setModule('maintenance'); chooseStart(S().workspaceToken); };
    ext.editStatFor = async id => { mode = 'stats'; S().maintenanceTab = 'stats_editor'; await A().setModule('maintenance'); try { await loadMeta(); } catch (_) {} const cur = defs().find(x => x.id === id); if (!cur) return; editing = {...baseDef(cur), id: cur.id, _existing: true}; partIndex = -1; renderEditor(++S().workspaceToken); };
    /** Un de mes widgets dessiné dans une boîte (champ « Widget » d'un bloc de fiche) */
    ext.renderCustomWidgetInto = async (el, id, ctx = {}) => {
        const d = defs().find(x => x.id === id);
        if (!d) { el.innerHTML = '<p class="muted">Ce widget n’existe plus.</p>'; return; }
        el.innerHTML = '<p class="muted">Calcul…</p>';
        try { const datas = await loadData(d, ctx); el.innerHTML = widgetCard(d, '01', 'span-12', datas); A().bindTableLinks?.(); }
        catch (error) { el.innerHTML = `<p class="muted">${esc(error.message)}</p>`; }
    };

    /* ─── 📊 Mes statistiques dans Graphiques → Statistiques ─── */
    ext.customStatItems = () => defs().filter(d => d.inStats && d.kind !== 'app').map(d => [d.id, `${d.icon ? d.icon + ' ' : ''}${d.name || 'Ma statistique'}`]);
    ext.addDiagramWidget = dg => {
        const d = {...baseDef({kind: 'diagram', icon: '📊', name: dg.name, width: '12'}), diagramId: dg.id};
        saveDefs([...defs(), d]); addToDashboard(d.id);
    };
    /* 📊 Mes diagrammes : leurs chiffres peuvent venir de l'app (exemples, statistiques de l'app, mes statistiques) */
    async function diagramSourceDef(key) {
        const t = String(key).slice(0, String(key).indexOf(':')), k = String(key).slice(String(key).indexOf(':') + 1);
        if (t === 'app') return APP_STATS.some(x => x[0] === k) ? {kind: 'appstat', statType: k, limit: 30} : null;
        if (t === 'ex') { if (!meta) await loadMeta(); return EXAMPLES(meta || {}).filter(d => d.kind === 'chart')[Number(k)] || null; }
        if (t === 'my') return defs().find(d => d.id === k && ['chart', 'appstat'].includes(d.kind)) || null;
        return null;
    }
    ext.diagramStatSources = async () => {
        if (!meta) { try { await loadMeta(); } catch (_) {} }
        return [...EXAMPLES(meta || {}).filter(d => d.kind === 'chart').map((d, i) => [`ex:${i}`, d.name, 'Exemples']),
            ...APP_STATS.map(([k, l]) => [`app:${k}`, l, 'Statistiques de l’app']),
            ...defs().filter(d => ['chart', 'appstat'].includes(d.kind)).map(d => [`my:${d.id}`, d.name || 'Ma statistique', 'Mes statistiques'])];
    };
    ext.diagramStatRows = async key => {
        const d = await diagramSourceDef(key); if (!d) throw new Error('Source introuvable (statistique supprimée ?).');
        const datas = await loadData(d); if (datas[0]?.error) throw new Error(datas[0].error);
        return groupRows(datas[0] || {}, {...d, limit: Math.max(Number(d.limit) || 10, 30)}).map(([v, n]) => [v, n]);
    };
    ext.openCustomStat = id => { const st = S(); st.graphMode = 'stats'; st.graphStatsType = id; A().setModule('graphiques'); };
    ext.renderCustomStat = async (token, id) => {
        const d = defs().find(x => x.id === id);
        const ws = A().$('#workspace');
        if (!d) { ws.innerHTML = `<section class="page">${header('MES STATISTIQUES', 'Statistique introuvable', 'Elle a peut-être été supprimée.')}</section>`; return; }
        ws.innerHTML = `<section class="page">${header('MES STATISTIQUES', `${d.icon ? d.icon + ' ' : ''}${d.name || 'Ma statistique'}`, d.note ? nl(d.note) : '', '<span class="h-cs-export"><button type="button" class="button small secondary" data-cs-export="png" title="Une image à poster sur un forum">🖼️ Image PNG</button><button type="button" class="button small secondary" data-cs-export="jpg" title="Une image plus légère, pour un courriel ou un réseau social">🖼️ Image JPG</button><button type="button" class="button small secondary" data-cs-export="csv" title="Les chiffres, pour un tableur">📄 CSV</button><button type="button" class="button small secondary" data-cs-export="print" title="Imprimer, ou « Enregistrer en PDF »">🖨️ Imprimer / PDF</button></span><button type="button" class="button secondary" data-cs-edit>✎ Modifier</button><button type="button" class="button secondary" data-cs-dash>+ Tableau de bord</button>')}<div class="card-grid"><p class="muted">Calcul…</p></div></section>`;
        const datas = await loadData(d);
        if (token !== S().workspaceToken || S().module !== 'graphiques') return;
        // le titre et le texte sont déjà en haut de la page : la carte ne les répète pas
        ws.querySelector('.card-grid').innerHTML = widgetCard({...d, name: '', note: ''}, '01', 'span-12', datas).replace(/<h3>\s*Mon widget/, '<h3>Résultat');
        A().bindTableLinks?.();
        ws.querySelector('[data-cs-edit]').addEventListener('click', async () => {
            mode = 'stats'; S().maintenanceTab = 'stats_editor'; await A().setModule('maintenance');
            try { await loadMeta(); } catch (_) {}
            const cur = defs().find(x => x.id === id); if (!cur) return;
            editing = {...baseDef(cur), id: cur.id, _existing: true}; partIndex = -1; renderEditor(++S().workspaceToken);
        });
        ws.querySelector('[data-cs-dash]').addEventListener('click', () => addToDashboard(id));
        ws.querySelectorAll('[data-cs-export]').forEach(b => b.addEventListener('click', () => exportStat(b.dataset.csExport, d, datas, ws.querySelector('.card-grid .card'))));
    };
    /* ── Export d'une de « Mes statistiques » : image PNG, tableau CSV, impression (et PDF) ── */
    const statFileName = d => (A().safeExportFilename ? A().safeExportFilename(d.name || 'statistique', 'statistique') : 'statistique');
    function statCsv(d, datas) {
        const q = v => { const t = String(v ?? ''); return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
        const lines = [];
        const one = (part, data, title) => {
            if (title) lines.push(q(title));
            if (!data) return;
            if (part.kind === 'chart' || part.kind === 'appstat') {
                const entries = groupRows(data[0] || {rows: [], shown: []}, part), total = entries.reduce((n, e) => n + e[1], 0);
                lines.push('Valeur;Nombre;Part (%)');
                entries.forEach(([v, n]) => lines.push([q(v), n, total ? String(Math.round(n / total * 1000) / 10).replace('.', ',') : ''].join(';')));
            } else if (part.kind === 'numbers') {
                lines.push('Chiffre;Nombre');
                (part.counters || []).forEach((c, i) => { const x = data[i] || {shown: []}; lines.push([q(c.label || 'Nombre'), x.count ?? x.shown?.length ?? 0].join(';')); });
            } else if (part.kind === 'list') {
                const x = data[0] || {shown: []}, all = dataColumns(x), cols = (part.columns?.length ? part.columns : all.slice(0, 3).map(c => c[0])).filter(c => all.some(a => a[0] === c));
                lines.push(cols.map(c => q(all.find(a => a[0] === c)?.[1] || c)).join(';'));
                (x.shown || []).forEach(r => lines.push(cols.map(c => q(cellText(x, r, c))).join(';')));
            } else if (part.kind === 'text') lines.push(q(part.text || ''));
            lines.push('');
        };
        one(d, datas, d.name || '');
        (d.parts || []).forEach((p, i) => one(p, datas.parts?.[i], p.title || `Partie ${i + 2}`));
        return '\ufeff' + lines.join('\r\n'); // BOM : Excel lit les accents
    }
    async function exportStat(kind, d, datas, cardEl) {
        if (kind === 'csv') { if (ext.downloadText) ext.downloadText(statFileName(d) + '.csv', statCsv(d, datas), 'text/csv;charset=utf-8'); return; }
        if (!cardEl) return;
        const css = A().graphExportCss ? A().graphExportCss() : '';
        const title = `${d.icon ? d.icon + ' ' : ''}${d.name || 'Ma statistique'}`;
        const html = `<div class="h-cs-sheet" style="background:#fff;padding:24px;font-family:inherit"><h2 style="margin:0 0 6px">${esc(title)}</h2>${d.note ? `<p style="margin:0 0 12px">${nl(d.note)}</p>` : ''}${cardEl.outerHTML}<p style="margin:10px 0 0;font-size:12px;color:#666">LCNDA · ${esc(new Date().toLocaleDateString('fr-FR'))}</p></div>`;
        if (kind === 'print') {
            const w = window.open('', '_blank', 'width=1000,height=800');
            if (!w) { toast('Fenêtre d’impression bloquée.', 'error'); return; }
            w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${css}@page{margin:12mm}body{background:#fff}</style></head><body>${html}<script>window.onload=()=>setTimeout(()=>window.print(),200);<\/script></body></html>`);
            w.document.close();
            toast('Dans la fenêtre d’impression, choisis « Enregistrer en PDF » pour un fichier PDF.');
            return;
        }
        // Image : dessinée directement sur un canevas (une page HTML copiée dans une image est refusée par le navigateur)
        try {
            const canvas = drawStatImage(d, datas, title);
            const jpg = kind === 'jpg';
            const a = document.createElement('a'); a.download = statFileName(d) + (jpg ? '.jpg' : '.png'); a.href = jpg ? canvas.toDataURL('image/jpeg', 0.92) : canvas.toDataURL('image/png'); document.body.appendChild(a); a.click(); a.remove();
        } catch (_) { toast('Image impossible à fabriquer : utilise « Imprimer / PDF ».', 'error'); }
    }
    /** Le graphique (barres, colonnes, camembert, anneau ; les autres dessins en barres), des chiffres ou les premières lignes d'une liste */
    function drawStatImage(d, datas, title) {
        const W = 1200, pad = 40, font = '"Inter", "Helvetica Neue", Arial, sans-serif';
        const blocks = [];
        const add = (part, data, sub) => {
            if (part.kind === 'chart' || part.kind === 'appstat') blocks.push({sub, part, entries: groupRows(data?.[0] || {rows: [], shown: []}, part)});
            else if (part.kind === 'numbers') blocks.push({sub, numbers: (part.counters || []).map((c, i) => [c.label || 'Nombre', data?.[i]?.count ?? data?.[i]?.shown?.length ?? 0])});
            else if (part.kind === 'list') { const x = data?.[0] || {shown: []}, all = dataColumns(x), cols = (part.columns?.length ? part.columns : all.slice(0, 3).map(c => c[0])).filter(c => all.some(q => q[0] === c)); blocks.push({sub, table: [cols.map(c => all.find(q => q[0] === c)?.[1] || c), ...(x.shown || []).slice(0, Math.min(25, Number(part.limit) || 8)).map(r => cols.map(c => cellText(x, r, c)))]}); }
            else if (part.kind === 'text' && part.text) blocks.push({sub, text: part.text});
        };
        add(d, datas, ''); (d.parts || []).forEach((p, i) => add(p, datas.parts?.[i], p.title || ''));
        const heightOf = b => (b.sub ? 34 : 0) + (b.entries ? (['pie', 'donut'].includes(b.part.style) ? Math.max(360, b.entries.length * 30 + 20) : b.entries.length * 34 + 10) : b.numbers ? 110 : b.table ? b.table.length * 28 + 10 : 80) + 24;
        const captionLines = [d.caption, ...(d.parts || []).map(p => p.caption)].filter(Boolean);
        const H = pad * 2 + 60 + (d.note ? 30 : 0) + blocks.reduce((n, b) => n + heightOf(b), 0) + captionLines.length * 24 + 30;
        const canvas = document.createElement('canvas'); canvas.width = W * 2; canvas.height = H * 2;
        const ctx = canvas.getContext('2d'); ctx.scale(2, 2);
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#111'; ctx.font = `700 30px ${font}`; ctx.textBaseline = 'top'; ctx.fillText(title, pad, pad);
        let y = pad + 50;
        if (d.note) { ctx.font = `16px ${font}`; ctx.fillStyle = '#444'; ctx.fillText(String(d.note).split('\n')[0].slice(0, 140), pad, y); y += 30; }
        const fit = (t, w) => { t = String(t); while (t.length > 1 && ctx.measureText(t).width > w) t = t.slice(0, -2) + '…'; return t; };
        for (const b of blocks) {
            if (b.sub) { ctx.font = `700 20px ${font}`; ctx.fillStyle = '#111'; ctx.fillText(b.sub, pad, y); y += 34; }
            if (b.entries) {
                const total = b.entries.reduce((n, e) => n + e[1], 0) || 1, last = b.entries.length - 1;
                const max = Math.max(1, ...b.entries.filter(([v], i) => !(v === 'autres' && i === last && last > 0)).map(e => e[1])); // « autres » ne donne pas l'échelle
                if (['pie', 'donut'].includes(b.part.style)) {
                    const r = 160, cx = pad + r, cy = y + r + 10; let at = -Math.PI / 2;
                    b.entries.forEach(([v, n], i) => { const da = n / total * Math.PI * 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, at, at + da); ctx.closePath(); ctx.fillStyle = canvasColor(chartColor(b.part, v, i)); ctx.fill(); at += da; });
                    if (b.part.style === 'donut') { ctx.beginPath(); ctx.arc(cx, cy, r * .55, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); }
                    ctx.font = `16px ${font}`;
                    b.entries.forEach(([v, n], i) => { const ly = y + 10 + i * 30; ctx.fillStyle = canvasColor(chartColor(b.part, v, i)); ctx.fillRect(cx + r + 40, ly + 2, 18, 18); ctx.fillStyle = '#111'; ctx.fillText(fit(`${v} : ${fmt(n)} (${Math.round(n / total * 100)} %)`, W - (cx + r + 70) - pad), cx + r + 68, ly + 2); });
                } else {
                    const lw = 300, bw = W - pad * 2 - lw - 90; ctx.font = `16px ${font}`;
                    b.entries.forEach(([v, n], i) => { const ly = y + i * 34; ctx.fillStyle = '#111'; ctx.fillText(fit(v, lw - 10), pad, ly + 6); ctx.fillStyle = '#eee'; ctx.fillRect(pad + lw, ly + 4, bw, 22); ctx.fillStyle = canvasColor(chartColor(b.part, v, i)); ctx.fillRect(pad + lw, ly + 4, Math.max(2, bw * Math.min(1, n / max)), 22); ctx.fillStyle = '#111'; ctx.fillText(fmt(n), pad + lw + bw + 12, ly + 6); });
                }
            } else if (b.numbers) {
                const w = (W - pad * 2) / Math.max(1, b.numbers.length);
                b.numbers.forEach(([l, n], i) => { ctx.fillStyle = '#0066cc'; ctx.font = `700 44px ${font}`; ctx.fillText(fmt(n), pad + i * w, y); ctx.fillStyle = '#333'; ctx.font = `16px ${font}`; ctx.fillText(fit(l, w - 16), pad + i * w, y + 58); });
            } else if (b.table) {
                const cw = (W - pad * 2) / Math.max(1, b.table[0].length);
                b.table.forEach((row, ri) => { ctx.font = `${ri ? '' : '700 '}15px ${font}`; ctx.fillStyle = '#111'; row.forEach((c, ci) => ctx.fillText(fit(c, cw - 12), pad + ci * cw, y + ri * 28)); ctx.fillStyle = '#ddd'; ctx.fillRect(pad, y + ri * 28 + 23, W - pad * 2, 1); });
            } else if (b.text) { ctx.font = `16px ${font}`; ctx.fillStyle = '#111'; String(b.text).split('\n').slice(0, 3).forEach((t, i) => ctx.fillText(fit(t, W - pad * 2), pad, y + i * 24)); }
            y += heightOf(b) - (b.sub ? 34 : 0);
        }
        ctx.font = `italic 15px ${font}`; ctx.fillStyle = '#444';
        captionLines.forEach(t => { ctx.fillText(fit(t, W - pad * 2), pad, y); y += 24; });
        ctx.font = `13px ${font}`; ctx.fillStyle = '#888'; ctx.fillText(`LCNDA · ${new Date().toLocaleDateString('fr-FR')}`, pad, H - pad + 6);
        return canvas;
    }
    /** Couleur utilisable sur un canevas (le dégradé « color-mix » de l'écran n'y est pas compris) */
    function canvasColor(c) {
        const m = String(c).match(/color-mix\(in srgb, (#[0-9a-f]{6}) (\d+)%, white\)/i);
        if (!m) return c;
        const k = Number(m[2]) / 100, n = parseInt(m[1].slice(1), 16), ch = sh => Math.round(((n >> sh) & 255) * k + 255 * (1 - k));
        return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
    }
    ext.customStatCsv = statCsv; // pour les tests
})();
