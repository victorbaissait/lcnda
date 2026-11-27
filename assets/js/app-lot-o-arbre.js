/* LCNDA — 🌳 Ce que dit l'arbre (lot O : maquette validée docs/design/lot-o.html, idées docs/donnees-idees-lot-o.md, lots O1 et O2).
 *  - Listes → 👥 Personnes et familles → « 🌳 Ce que dit l'arbre » : dix lectures de l'arbre en cartes (💒 temps clos, 🔗 dispense,
 *    🤰 premiers enfants nés tôt, 🎯 centre de la famille, 💍 rayon des mariages, 💔 remariage, 🎀 prénom du parrain, 🕯 orphelins
 *    et posthumes, 🌾 quitter la terre, ✍️ chaîne des signatures) + « ⛪ Ce jour-là était-il chômé ? ». Chaque carte : une phrase
 *    d'abord, un petit dessin, le détail sous « ▸ plus », les options dans « ⚙️ Personnaliser » (au plus 3 parties, une seule ouverte,
 *    chaque réglage avec « ↶ Comme avant »), les sources ↗, 🧺 au panier, 📎 l'image dans les médias, et le diagramme complet quand
 *    il existe déjà (on ne le refait pas : 📅 famois, 🔗 dplkin, 🤰 vieavant, 🎯 dplgrav, 💍 famariages, 💔 vieveuvage, 🎀 godnames,
 *    🔀 fametiers, ✍️ viesigner).
 *  - La fiche d'une personne : UNE phrase dans les blocs qui existent (jamais un nouveau bloc) — 👪 sous « Fiche familiale »
 *    (orphelin, posthume), ⚖️ « Les règles de sa vie » (dispense, jour chômé, conseil de famille chez le juge de paix ; la coutume :
 *    « ce que ça change pour l'héritage »), ⚖️ « Ce que la loi disait » (le prix d'un remplaçant en journées), 🌍 « Le monde autour »
 *    (le premier de sa lignée à quitter la terre).
 *  - Tact (décisions du 27/11/2026) : des chiffres d'abord ; les noms seulement sous « ▸ plus » ou dans ⚙️ ; jamais une fiche vivante
 *    ou confidentielle (le serveur ne les compte ni ne les nomme : lib/lot_o.php). Tout est calculé sur l'ordinateur ; seuls les
 *    liens ↗ ouvrent une page, sur un clic.
 *  Serveur : lib/lot_o.php (lot_o_arbre, lot_o_dispense, lot_o_person) ; calculs purs : app-lot-o-core.js ; style : lot-o-arbre.css.
 *  Réglages : localStorage « genealogie-arbre-dit » ({carte: {réglage: valeur}}), gardé aussi dans la base (SITE_DEFAULT_KEYS).
 *  Essai : tests/test-lot-o-arbre.js */
(() => {
    'use strict';
    const T = (s, v0) => { const v = v0 && Object.fromEntries(Object.entries(v0).map(([k, x]) => [k, typeof x === 'number' ? String(x) : x])); return window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? String(v[k]) : m)); }; // les nombres déjà écrits (nf) ; une année reste « 1876 »
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const C = () => ext.lotOCore;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const nf = (n, d = 0) => Number(n || 0).toLocaleString('fr-FR', {maximumFractionDigits: d});
    const toast = (m, k) => A().toast?.(m, k);
    const kiosk = () => document.body.classList.contains('is-kiosk') || document.documentElement.classList.contains('base-readonly');
    const LIST = 'arbre_dit', KEY = 'genealogie-arbre-dit', ORIGIN = {kind: 'screen', label: '🌳 Ce que dit l’arbre'};
    const link = (url, label, title = '') => (UI().extLink ? UI().extLink(url, label, {title}) : `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">↗ ${esc(label)}</a>`);
    const WP = p => `https://fr.wikipedia.org/wiki/${p}`;
    const SRC = {
        clos: ['https://fr.wikisource.org/wiki/Dictionnaire_de_th%C3%A9ologie_catholique/B%C3%89N%C3%89DICTION_NUPTIALE', 'Wikisource'],
        parente: [WP('Parent%C3%A9#Degr%C3%A9_de_parent%C3%A9_en_droit'), 'Wikipédia « Parenté »'], latran: [WP('Quatri%C3%A8me_concile_du_Latran'), 'Wikipédia « Latran IV »'],
        posthume: [WP('Enfant_posthume'), 'Wikipédia « Enfant posthume »'], conseil: [WP('Conseil_de_famille'), 'Wikipédia « Conseil de famille »'], paix: [WP('Justice_de_paix'), 'Wikipédia « Justice de paix »'],
        parrain: [WP('Parrain_(religion)'), 'Wikipédia « Parrain »'], veuvage: [WP('Veuvage'), 'Wikipédia « Veuvage »'], exode: [WP('Exode_rural'), 'Wikipédia « Exode rural »'], signature: [WP('Signature'), 'Wikipédia « Signature »'],
        feries: [WP('Jours_f%C3%A9ri%C3%A9s_en_France'), 'Wikipédia « Jours fériés en France »'], solennite: [WP('Solennit%C3%A9'), 'Wikipédia « Solennité »'], concordat: [WP('Concordat_de_1801'), 'Wikipédia « Concordat de 1801 »'],
        republicain: [WP('Calendrier_r%C3%A9publicain'), 'Wikipédia « Calendrier républicain »'], service: [WP('Service_militaire_en_France'), 'Wikipédia « Service militaire en France »'],
        coutume: [WP('Droit_coutumier_en_France'), 'Wikipédia « Droit coutumier en France »'], ecrit: [WP('Droit_%C3%A9crit'), 'Wikipédia « Droit écrit »'], ban: [WP('Ban_de_mariage'), 'Wikipédia « Ban de mariage »'],
        archives: ['https://francearchives.gouv.fr/fr/', 'FranceArchives']};
    const src = k => link(SRC[k][0], SRC[k][1]);
    const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const dateFr = iso => { const [y, m, d] = String(iso || '').split('-').map(Number); return y && m && d ? `${d === 1 ? '1er' : d} ${T(MONTHS[m - 1])} ${y}` : String(iso || ''); };
    const ord = n => (window.LCNDA_I18N?.lang && window.LCNDA_I18N.lang !== 'fr' ? String(n) : `${n}ᵉ`); // « 3ᵉ degré » ; ailleurs « degree 3 »

    /* ═════ les réglages ═════ */
    const readAll = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (_) { return {}; } };
    const writeAll = v => { try { if (Object.keys(v).length) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); } catch (_) {} };
    const get = (card, k) => { const c = CARDS.find(x => x.id === card), v = readAll()[card]?.[k]; return v === undefined ? c?.def?.[k] : v; };
    function set(card, k, v) {
        const all = readAll(), c = CARDS.find(x => x.id === card), cur = {...(all[card] || {})};
        if (v === undefined || v === c?.def?.[k]) delete cur[k]; else cur[k] = v;
        if (Object.keys(cur).length) all[card] = cur; else delete all[card];
        writeAll(all);
    }
    /** « ↶ Comme avant » : remet le réglage au départ, avec ↶ Annuler */
    function resetOne(card, k, after) {
        const c = CARDS.find(x => x.id === card), lbl = (c?.parts || []).flatMap(p => p.settings || []).find(s => s.k === k)?.label || k;
        const run = () => set(card, k, undefined);
        if (A().undoLocalChange) A().undoLocalChange(T('« {r} » remis comme avant', {r: T(lbl)}), [KEY], run, after); else run();
        after();
    }

    /* ═════ le serveur ═════ */
    const scopeQ = card => { const q = {}, pop = get(card, 'pop'), from = get(card, 'from'), to = get(card, 'to'); if (pop) q.dg_pop = pop; if (/^-?\d{1,4}$/.test(String(from || ''))) q.dg_from = from; if (/^-?\d{1,4}$/.test(String(to || ''))) q.dg_to = to; return q; };
    const ask = (action, q) => A().api(action, q);
    const tc = (y, m, d) => (ext.reglesActes?.tempsClos ? ext.reglesActes.tempsClos(y, m, d)?.kind || null : C().tempsClos(y, m, d));
    function openDiagram(kind) {
        if (!kind) return;
        if (ext.openDiagramEditor) return ext.openDiagramEditor(null, {kind});
        toast(T('Les diagrammes ne sont pas chargés.'), 'error');
    }
    const openPerson = id => { if (Number(id)) A().openPersonById?.(Number(id)); };
    const who = (name, id) => (id ? `<button type="button" class="link-button lo-who" data-lo-person="${Number(id)}">${esc(name)}</button>` : esc(name));

    /* ═════ les petits dessins (SVG, couleurs du thème clair ou sombre par les classes) ═════ */
    const svg = (w, h, body, label) => `<svg class="lo-viz" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
    const txt = (x, y, s, o = {}) => `<text x="${x}" y="${y}"${o.anchor ? ` text-anchor="${o.anchor}"` : ''} font-size="${o.size || 11}"${o.cls ? ` class="${o.cls}"` : ''}${o.bold ? ' font-weight="700"' : ''}>${esc(s)}</text>`;
    function monthsSvg(M, draw) {
        const max = Math.max(1, ...M.n), L = 'JFMAMJJASOND';
        if (draw === 'rose') {
            const cx = 120, cy = 110, R = 90; let out = '';
            M.n.forEach((v, i) => { const a0 = (i / 12) * 2 * Math.PI - Math.PI / 2, a1 = ((i + 1) / 12) * 2 * Math.PI - Math.PI / 2, r = 12 + (R - 12) * v / max, rc = 12 + (R - 12) * (M.clos[i] || 0) / max;
                const arc = (rr, cls) => `<path class="${cls}" d="M${cx} ${cy} L${(cx + Math.cos(a0) * rr).toFixed(1)} ${(cy + Math.sin(a0) * rr).toFixed(1)} A${rr.toFixed(1)} ${rr.toFixed(1)} 0 0 1 ${(cx + Math.cos(a1) * rr).toFixed(1)} ${(cy + Math.sin(a1) * rr).toFixed(1)} Z"/>`;
                out += arc(r, 'lo-bar') + (M.clos[i] ? arc(rc, 'lo-bar is-clos') : '') + txt((cx + Math.cos((a0 + a1) / 2) * (R + 12)).toFixed(1), (cy + Math.sin((a0 + a1) / 2) * (R + 12) + 4).toFixed(1), L[i], {anchor: 'middle', cls: 'lo-mut'}); });
            return svg(240, 225, out, T('Les mariages mois par mois, en rose des mois'));
        }
        let out = `<rect class="lo-zone" x="${38 + 1 * 33}" y="8" width="${33 * 3}" height="132"/><rect class="lo-zone" x="${38 + 11 * 33}" y="8" width="33" height="132"/><line class="lo-axis" x1="36" y1="140" x2="432" y2="140"/>`;
        M.n.forEach((v, i) => { const h = 120 * v / max, x = 40 + i * 33; out += `<rect class="lo-bar" x="${x}" y="${(140 - h).toFixed(1)}" width="24" height="${h.toFixed(1)}"><title>${esc(T(MONTHS[i]))} : ${v}</title></rect>`;
            if (M.clos[i]) { const hc = 120 * M.clos[i] / max; out += `<rect class="lo-bar is-clos" x="${x}" y="${(140 - hc).toFixed(1)}" width="24" height="${hc.toFixed(1)}"/>`; }
            out += txt(x + 12, 156, L[i], {anchor: 'middle', size: 12, cls: 'lo-mut'}) + (v ? txt(x + 12, (136 - h).toFixed(1), String(v), {anchor: 'middle', size: 10}) : ''); });
        out += txt(38 + 2.5 * 33, 172, T('Carême'), {anchor: 'middle', cls: 'lo-orange'}) + txt(38 + 11.5 * 33, 172, T('Avent'), {anchor: 'middle', cls: 'lo-orange'});
        return svg(440, 178, out, T('Les mariages mois par mois ; en orange, ceux des temps clos'));
    }
    function barsH(rows, unit = '%', label = '') { // [[libellé, valeur, sous-titre]]
        const max = Math.max(1, ...rows.map(r => r[1])); let out = '';
        rows.forEach(([l, v, sub], i) => { const y = 6 + i * 22, w = 300 * v / max; out += txt(0, y + 12, l, {cls: 'lo-mut'}) + `<rect class="lo-bar" x="92" y="${y}" width="${Math.max(1, w).toFixed(1)}" height="14"/>` + txt(98 + w, y + 12, `${nf(v)}${unit}${sub ? ` · ${sub}` : ''}`); });
        return svg(440, rows.length * 22 + 8, out, label);
    }
    function columnsSvg(rows, label, note = '') { // [[libellé, valeur, texte]]
        const max = Math.max(1, ...rows.map(r => r[1])); let out = '<line class="lo-axis" x1="20" y1="140" x2="430" y2="140"/>' + (note ? txt(436, 12, note, {anchor: 'end', cls: 'lo-mut'}) : '');
        const w = Math.min(70, 380 / Math.max(1, rows.length));
        rows.forEach(([l, v, t], i) => { const h = 115 * v / max, x = 30 + i * (w + 12); out += `<rect class="lo-bar" x="${x}" y="${(140 - h).toFixed(1)}" width="${w}" height="${h.toFixed(1)}"/>` + txt(x + w / 2, 156, l, {anchor: 'middle', size: 12, cls: 'lo-mut'}) + txt(x + w / 2, (134 - h).toFixed(1), t, {anchor: 'middle', size: 12, bold: true}); });
        return svg(440, 162, out, label);
    }
    function stackSvg(gens) {
        const K = [['terre', 'lo-c1'], ['artisans', 'lo-c2'], ['ouvriers', 'lo-c3'], ['autres', 'lo-c4']]; let out = '';
        gens.forEach((g, i) => { const n = K.reduce((s, [k]) => s + (g[k] || 0), 0) || 1, y = 4 + i * 22; let x = 92;
            out += txt(0, y + 12, `${g.roman}${g.year ? ` · ${g.year}` : ''}`, {cls: 'lo-mut'});
            K.forEach(([k, cls]) => { const w = 330 * (g[k] || 0) / n; if (w > 0) out += `<rect class="${cls}" x="${x.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="15"><title>${esc(T(LANDK[k]))} : ${g[k]}</title></rect>`; x += w; }); });
        return svg(440, gens.length * 22 + 6, out, T('Les métiers des ancêtres, génération par génération'));
    }
    const LANDK = {terre: 'la terre', artisans: 'artisans, commerce', ouvriers: 'ouvriers, transports', autres: 'autres'};
    function kinSvg(k) {
        const pa = k.pa || [], pb = k.pb || [], rows = Math.max(pa.length, pb.length) - 1; if (rows < 1) return '';
        const H = 50 + rows * 34;
        const box = (x, y, p, hl) => `<rect class="${hl ? 'lo-box is-hl' : 'lo-box'}" x="${x - 74}" y="${y - 14}" width="148" height="28"/>` + txt(x, y + 4, p.name.length > 24 ? p.name.slice(0, 23) + '…' : p.name, {anchor: 'middle', size: 11, bold: hl});
        const side = (list, x) => list.slice(1).map((p, i) => { const y = 64 + i * 34; return `<line class="lo-link" x1="${i ? x : 220}" y1="${i ? y - 20 : 34}" x2="${x}" y2="${y - 14}"/>` + box(x, y, p, i === list.length - 2); }).join('');
        return svg(440, H, box(220, 20, k.anc?.[0] || pa[0], true) + side(pa, 100) + side(pb, 340), T('Le chemin de parenté jusqu’à l’ancêtre commun'));
    }
    function gravitySvg(gens) {
        const g = gens.filter(x => Number.isFinite(x.lat)); if (g.length < 2) return '';
        const la = g.map(x => x.lat), lo = g.map(x => x.lon), pad = .3, la0 = Math.min(...la) - pad, la1 = Math.max(...la) + pad, lo0 = Math.min(...lo) - pad, lo1 = Math.max(...lo) + pad;
        const s = Math.min(400 / (lo1 - lo0), 200 / (la1 - la0)), X = v => 20 + (v - lo0) * s, Y = v => 10 + (la1 - v) * s;
        const pts = [...g].sort((a, b) => b.g - a.g);
        let out = `<polyline class="lo-path" points="${pts.map(p => `${X(p.lon).toFixed(1)},${Y(p.lat).toFixed(1)}`).join(' ')}"/>`;
        pts.forEach(p => { out += `<circle class="lo-dot" cx="${X(p.lon).toFixed(1)}" cy="${Y(p.lat).toFixed(1)}" r="6"><title>${esc(`${C().ROMAN[p.g] || p.g} · ${p.near}`)}</title></circle>` + txt((X(p.lon) + 9).toFixed(1), (Y(p.lat) + 4).toFixed(1), C().ROMAN[p.g] || String(p.g), {size: 11, bold: true}); });
        return svg(440, Math.max(60, Math.round(20 + (la1 - la0) * s)), out, T('Le chemin du centre de la famille, de la plus ancienne génération à la tienne'));
    }

    /* ═════ les cartes ═════ */
    const SCOPE = {k: 'pop', label: '👥 Qui est compté', kind: 'select', choices: [['', 'Toute la base'], ['anc', 'Mes ancêtres'], ['pat', 'Branche paternelle'], ['mat', 'Branche maternelle']]};
    const PERIOD = [{k: 'from', label: 'de', kind: 'year'}, {k: 'to', label: 'à', kind: 'year'}];
    const CARDS = [
        {id: 'tempsclos', icon: '💒', title: 'Les mariages et les temps clos', sub: 'toute la famille', status: 'half', diag: 'famois', words: 'careme avent temps clos mariage mois noces calendrier',
            def: {pop: '', from: '', to: '', draw: 'bars'},
            parts: [{icon: '👥', label: 'Qui est compté', settings: [SCOPE]}, {icon: '📅', label: 'Période', settings: PERIOD}, {icon: '🎨', label: 'Dessin', settings: [{k: 'draw', label: 'Dessin', kind: 'seg', choices: [['bars', 'Barres'], ['rose', 'Rose des mois']]}]}]},
        {id: 'dispense', icon: '🔗', title: 'Fallait-il une dispense ?', sub: 'deux personnes', status: 'half', diag: 'dplkin', words: 'dispense consanguinite cousin cousins parente degre eglise eveque mariage apparente affinite',
            def: {count: 'both', a: 0, b: 0},
            parts: [{icon: '📏', label: 'Façon de compter', settings: [{k: 'count', label: 'Façon de compter', kind: 'seg', choices: [['eglise', 'L’Église'], ['civil', 'La loi civile'], ['both', 'Les deux']]}]}, {icon: '🔍', label: 'Chercher dans tout l’arbre', action: 'all'}]},
        {id: 'prenup', icon: '🤰', title: 'Les premiers enfants nés tôt', sub: 'avec tact', status: 'done', diag: 'vieavant', words: 'conception premariage avant mariage enfant tot naissance premier enfant',
            def: {names: false, limit: 8},
            parts: [{icon: '👁', label: 'Montrer', settings: [{k: 'names', label: 'Montrer les couples (nés il y a plus de 100 ans)', kind: 'toggle'}]}, {icon: '⏱', label: 'Seuil', settings: [{k: 'limit', label: 'Seuil (mois)', kind: 'num', min: 5, max: 9, unit: 'mois'}]}]},
        {id: 'gravity', icon: '🎯', title: 'Le centre de la famille, génération après génération', status: 'done', diag: 'dplgrav', words: 'centre gravite migration famille lieux generation deplacement', def: {}, parts: []},
        {id: 'radius', icon: '💍', title: 'Jusqu’où allait-on chercher son conjoint ?', status: 'half', diag: 'famariages', words: 'rayon distance mariage conjoint village epoux loin km',
            def: {pop: '', km: 12}, parts: [{icon: '👥', label: 'Qui est compté', settings: [SCOPE]}, {icon: '📏', label: 'Distance', settings: [{k: 'km', label: 'À moins de (km)', kind: 'num', min: 1, max: 200, unit: 'km'}]}]},
        {id: 'widow', icon: '💔', title: 'Le temps avant de se remarier', status: 'done', diag: 'vieveuvage', words: 'remariage veuf veuve veuvage delai', def: {pop: ''}, parts: [{icon: '👥', label: 'Qui est compté', settings: [SCOPE]}]},
        {id: 'godname', icon: '🎀', title: 'Le prénom venait du parrain', status: 'done', diag: 'godnames', words: 'parrain marraine prenom filleul bapteme', def: {}, parts: []},
        {id: 'orphans', icon: '🕯', title: 'Nés après leur père, orphelins jeunes', status: 'half', diag: '', words: 'orphelin posthume tutelle tuteur pere mort enfant',
            def: {pop: '', age: 10}, parts: [{icon: '👥', label: 'Qui est compté', settings: [SCOPE]}, {icon: '🎂', label: 'Âge', settings: [{k: 'age', label: 'Orphelin avant (ans)', kind: 'num', min: 1, max: 21, unit: 'ans'}]}]},
        {id: 'land', icon: '🌾', title: 'Quand la famille a quitté la terre', status: 'half', diag: 'fametiers', words: 'terre paysan exode rural metier quitter cultivateur laboureur ouvrier',
            def: {by: 'all'}, parts: [{icon: '🌳', label: 'Par', settings: [{k: 'by', label: 'Les barres', kind: 'seg', choices: [['all', 'Tous les ancêtres'], ['pat', 'Branche paternelle'], ['mat', 'Branche maternelle']]}]}]},
        {id: 'signatures', icon: '✍️', title: 'La chaîne des signatures', status: 'half', diag: 'viesigner', words: 'signature signer savoir ecrire chaine lignee',
            def: {line: 'm', layout: 'row'}, parts: [{icon: '🌳', label: 'La lignée', settings: [{k: 'line', label: 'La lignée', kind: 'seg', choices: [['m', 'De père en fils'], ['f', 'De mère en fille']]}]}, {icon: '🖼', label: 'Image', settings: [{k: 'layout', label: 'Image', kind: 'seg', choices: [['row', 'En ligne'], ['col', 'En colonne']]}]}]},
        {id: 'chome', icon: '⛪', title: 'Ce jour-là était-il chômé ?', status: 'new', diag: '', words: 'jour chome ferie fete obligation dimanche decadi repos', def: {date: ''}, parts: [], o2: true},
    ];
    const STATUS = {half: ['à moitié', 'is-orange'], done: ['déjà là', 'is-green'], new: ['nouveau', 'is-blue']};

    /* le HTML d'un réglage, avec son « ↶ Comme avant » */
    function settingHtml(card, s) {
        const v = get(card.id, s.k), d = card.def[s.k], changed = v !== d && !(v === '' && d === '');
        let ctl = '';
        if (s.kind === 'select') ctl = `<select class="ui-select" data-lo-set="${s.k}" aria-label="${esc(T(s.label))}">${s.choices.map(([x, l]) => `<option value="${esc(x)}"${String(v) === x ? ' selected' : ''}>${esc(T(l))}</option>`).join('')}</select>`;
        else if (s.kind === 'seg') ctl = UI().segmented ? UI().segmented({label: T(s.label), cls: 'sm', items: s.choices.map(([x, l]) => ({on: String(v) === x, html: esc(T(l)), attrs: `data-lo-seg="${s.k}" data-v="${esc(x)}"`}))})
            : s.choices.map(([x, l]) => `<button type="button" data-lo-seg="${s.k}" data-v="${esc(x)}" aria-pressed="${String(v) === x}">${esc(T(l))}</button>`).join('');
        else if (s.kind === 'toggle') ctl = `<label class="ui-toggle"><input type="checkbox" data-lo-set="${s.k}"${v ? ' checked' : ''}><i></i>${esc(T(s.label))}</label>`;
        else if (s.kind === 'num') ctl = `<label class="lo-num"><span>${esc(T(s.label))}</span><input type="number" inputmode="numeric" min="${s.min}" max="${s.max}" value="${esc(v)}" data-lo-set="${s.k}"></label>`;
        else if (s.kind === 'year') ctl = `<label class="lo-num"><span>${esc(T(s.label))}</span><input type="text" inputmode="numeric" maxlength="5" placeholder="${esc(T('année'))}" value="${esc(v || '')}" data-lo-set="${s.k}"></label>`;
        return `<span class="lo-set">${ctl}${changed ? `<button type="button" class="link-button lo-undo" data-lo-reset="${s.k}" title="${esc(T('Remettre comme au départ'))}">${esc(T('↶ Comme avant'))}</button>` : ''}</span>`;
    }
    function persoHtml(card) {
        if (!card.parts.length) return '';
        const open = OPEN.get(card.id);
        return `<details class="lo-perso" data-ui-noremember${open != null ? ' open' : ''}><summary>${esc(T('⚙️ Personnaliser'))}</summary>${card.parts.slice(0, 3).map((p, i) => `<details class="lo-pgrp" data-lo-part="${i}"${open === i ? ' open' : ''}><summary>${esc(p.icon)} ${esc(T(p.label))}</summary><div class="lo-row">${p.action === 'all'
            ? `<button type="button" class="button small secondary" data-lo-all>${esc(T('Lister tous les couples apparentés'))}</button>` : p.settings.map(s => settingHtml(card, s)).join('')}</div></details>`).join('')}</details>`;
    }
    const OPEN = new Map(); // la partie ouverte de ⚙️ de chaque carte (le temps de la page)
    const shell = card => `<article class="card lo-card" data-lo-card="${card.id}" data-lo-status="${card.status}">
        <header class="card-head"><h3><span aria-hidden="true">${esc(card.icon)}</span> ${esc(T(card.title))}${card.sub ? ` <small>· ${esc(T(card.sub))}</small>` : ''}</h3>${UI().badge ? UI().badge(T(STATUS[card.status][0]), STATUS[card.status][1].replace('is-', '')) : `<span class="ui-badge ${STATUS[card.status][1]}">${esc(T(STATUS[card.status][0]))}</span>`}</header>
        <div class="card-body lo-body" data-lo-body>${UI().spinner ? UI().spinner(T('On lit l’arbre…')) : esc(T('On lit l’arbre…'))}</div></article>`;
    const acts = (card, {source = '', basket = true, media = true, diag = true} = {}) => `<div class="lo-acts"><span class="lo-src">${source}</span><span class="lo-btns">${diag && card.diag ? `<button type="button" class="button small secondary" data-lo-diag="${card.diag}" title="${esc(T('Ouvrir le diagramme complet, déjà dans l’app'))}">📊 ${esc(T('Le diagramme'))}</button>` : ''}${basket && !kiosk() && ext.connexions?.take ? `<button type="button" class="ib lo-ib" data-lo-bk title="${esc(T('Mettre cette phrase au panier'))}" aria-label="${esc(T('Mettre cette phrase au panier'))}">🧺</button>` : ''}${media && !kiosk() && A().importMediaFile ? `<button type="button" class="ib lo-ib" data-lo-keep title="${esc(T('Garder l’image dans les médias'))}" aria-label="${esc(T('Garder l’image dans les médias'))}">📎</button>` : ''}</span></div>`;
    const more = (label, inner) => `<details class="lo-more"><summary>${esc(label)}</summary>${inner}</details>`;
    const empty = (msg, icon = '🌳') => (A().empty ? A().empty(msg, {icon}) : `<p class="lo-lead lo-empty">${esc(msg)}</p>`);
    const tactNote = () => `<p class="lo-tact">🤍 ${esc(T('Par défaut, aucun nom : seulement des chiffres. Les personnes se montrent sous « ▸ plus » ou dans ⚙️ Personnaliser, et jamais pour une famille encore vivante.'))}</p>`;

    /* chaque carte : ses données → son HTML (phrase, dessin, ▸ plus) */
    const R = {};
    R.tempsclos = async card => {
        const d = await ask('lot_o_arbre', {card: 'tempsclos', ...scopeQ('tempsclos')});
        const M = C().monthsOf(d.dated, d.months, tc), n = M.n.reduce((a, b) => a + b, 0), k = M.list.length;
        if (!n) return {html: empty(T('Pas encore de mariage avec son mois dans ce groupe.')) + acts(card, {basket: false, media: false})};
        const order = M.n.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
        const shape = n >= 20 ? ` ${T('{lo} sont presque vides, {hi} pleins.', {lo: [order[0][1], order[1][1]].sort((a, b) => a - b).map(i => T(MONTHS[i])).reduce((a, b) => T('{a} et {b}', {a, b})), hi: [order[11][1], order[10][1]].sort((a, b) => a - b).map(i => T(MONTHS[i])).reduce((a, b) => T('{a} et {b}', {a, b}))})}` : '';
        const lead = T('{n} mariages datés au jour : {k} tombent pendant l’Avent ou le Carême.', {n: nf(d.dated.length), k: nf(k)}) + shape;
        const legend = `<p class="lo-legend"><span><i class="lo-bar"></i>${esc(T('mariages du mois'))}</span><span><i class="lo-bar is-clos"></i>${esc(T('dont en temps clos'))}</span><span><i class="lo-zone"></i>${esc(T('mois souvent en temps clos'))}</span></p>`;
        const rows = M.list.slice(0, 200).map(x => `<tr><td>${who(x.a, x.ida)} × ${who(x.b, x.idb)}</td><td>${esc(dateFr(x.d))}</td><td>${esc(T(x.kind === 'careme' ? 'Carême' : 'Avent'))}</td></tr>`).join('');
        return {lead, html: `<p class="lo-lead">${esc(lead)}</p>${monthsSvg(M, get('tempsclos', 'draw'))}${legend}
            ${k ? more(T('▸ plus ({n} mariages à vérifier)', {n: k}), `<div class="tw"><table class="data-table lo-table" data-cols-off><thead><tr><th>${esc(T('Mariage'))}</th><th>${esc(T('Date'))}</th><th>${esc(T('Temps'))}</th></tr></thead><tbody>${rows}</tbody></table></div>
                <p class="muted small">${esc(T('Ce n’est pas forcément une erreur : l’évêque pouvait donner une dispense, souvent écrite dans l’acte. Vérifie aussi que c’est bien la date du mariage, et non celle des fiançailles ou des bans.'))} ${src('ban')}</p>`) : ''}
            ${acts(card, {source: `${esc(T('Règle :'))} ${src('clos')} · ${esc(T('Pâques calculée année par année (julien avant 1583)'))}`})}`};
    };
    const RULE_TXT = {avant1215: 'avant 1215 : jusqu’au 7ᵉ degré', latran: 'depuis le concile de Latran IV (1215) : jusqu’au 4ᵉ degré', code1917: 'Code de droit canonique de 1917 : jusqu’au 3ᵉ degré', code1983: 'Code de 1983 : jusqu’au 4ᵉ degré, compté comme la loi civile'};
    async function dispensePair(card, a, b) {
        const d = await ask('lot_o_dispense', {a, b});
        if (d.hidden) return {html: empty(T('Rien pour une famille encore vivante, ni pour une fiche confidentielle.'))};
        const y = d.year || d.year_guess || null, mode = get('dispense', 'count');
        const head = `<div class="lo-chips"><span class="lo-pchip">👤 ${who(d.a.name, d.a.id)} <small>${esc([d.a.by, d.a.dy].filter(Boolean).join('–'))}</small></span><span aria-hidden="true">×</span><span class="lo-pchip">👤 ${who(d.b.name, d.b.id)} <small>${esc([d.b.by, d.b.dy].filter(Boolean).join('–'))}</small></span><button type="button" class="link-button" data-lo-pick>${esc(T('changer'))}</button></div>`;
        const k = d.kin, af = d.affinity;
        if (!k && !af) {
            const lead = T('Aucun ancêtre commun trouvé dans ta base entre ces deux personnes : pas de dispense de parenté à chercher.');
            return {lead, html: `${head}<p class="lo-lead">${esc(lead)}</p>${acts(card, {source: `${src('parente')} · ${src('latran')}`, media: false})}`};
        }
        const kind = k ? 'consang' : 'affin', canon = k ? k.canon : af.canon, civil = k ? k.civil : af.civil, rule = C().dispense(kind, canon, civil, y, k ? k.direct : af.direct);
        const deg = mode === 'civil' ? T('{n} degré pour la loi civile', {n: ord(civil)}) : mode === 'eglise' ? T('{n} degré pour l’Église', {n: ord(canon)}) : T('{a} degré pour l’Église, {b} pour la loi civile', {a: ord(canon), b: ord(civil)});
        const yTxt = y ? (d.year ? String(y) : T('vers {y}', {y})) : '';
        let lead = k ? (k.direct ? T('L’un descend de l’autre ({d}) : un tel mariage était interdit.', {d: deg})
            : T('Ils étaient {w} : {d}{y}.', {w: T(C().kinWords(k.da, k.db)), d: deg, y: yTxt ? ` ${T('en {y}', {y: yTxt})}` : ''}))
            : T('Parenté par alliance : {b} était parent(e) de {v}, le conjoint d’avant ({d}).', {b: af.who.id === d.a.id ? d.b.name : d.a.name, v: af.via.name, d: deg});
        lead += ' ' + (rule.needed ? T('Il fallait une dispense de l’évêque ({r}).', {r: T(RULE_TXT[rule.rule])}) : T('Pas besoin de dispense à cette date ({r}).', {r: T(RULE_TXT[rule.rule])}));
        const verdict = rule.needed && !(k && k.direct) ? `<p class="lo-verdict">⚠️ ${esc(T('Dispense nécessaire{y}. Cherche-la : dans l’acte de mariage (« après dispense du {n} degré »), et dans les registres de dispenses de l’évêché (série G des Archives départementales).', {y: yTxt ? ' ' + T('en {y}', {y: yTxt}) : '', n: ord(canon)}))} ${src('archives')}</p>` : '';
        const F = k && k.f ? `<p>${esc(T('Coefficient de consanguinité de leurs enfants : F ≈ {f} (1/{n}).', {f: nf(k.f, 4), n: nf(Math.round(1 / k.f))}))}</p>` : '';
        const plus = more(T('▸ plus (comment on compte)'), `<p>${esc(T('Pour l’Église (avant 1983), on compte les générations jusqu’à l’ancêtre commun, du côté le plus long : {c}. Pour la loi civile, on additionne les deux côtés : {v}ᵉ degré.', {c: canon, v: civil}))}</p>${F}
            <p>${esc(T('Avant 1918 : dispense jusqu’au 4ᵉ degré ; de 1918 à 1983 : jusqu’au 3ᵉ degré. Les alliances (beau-frère, belle-sœur) comptent aussi.'))}</p>${k && k.anc?.length ? `<p class="muted small">${esc(T('Ancêtre commun : {n}.', {n: k.anc.map(x => x.name).reduce((a, b) => T('{a} et {b}', {a, b}))}))}</p>` : ''}`);
        return {lead, html: `${head}<p class="lo-lead">${esc(lead)}</p>${verdict}${k && !k.direct ? kinSvg(k) : ''}${plus}${acts(card, {source: `${src('parente')} · ${src('latran')}`})}`};
    }
    R.dispense = async card => {
        let a = Number(get('dispense', 'a')) || 0, b = Number(get('dispense', 'b')) || 0;
        const all = await ask('lot_o_arbre', {card: 'dispense'});
        CACHE.dispenseAll = all;
        if (!a || !b) { const f = all.rows?.[0]; if (f) { a = f.ida; b = f.idb; } }
        const intro = T('{k} couples apparentés de près (jusqu’au 4ᵉ degré) sur {n} couples de ta base.', {k: nf(all.rows?.length || 0), n: nf(all.couples || 0)});
        if (!a || !b) return {lead: intro, html: `<p class="lo-lead">${esc(intro)}</p><p><button type="button" class="button small secondary" data-lo-pick>${esc(T('👤 Choisir deux personnes'))}</button></p>${acts(card, {source: `${src('parente')} · ${src('latran')}`, media: false})}`};
        const r = await dispensePair(card, a, b);
        return {lead: r.lead, html: r.html + (OPEN_ALL.has('dispense') ? allCouplesHtml(all) : '')};
    };
    const OPEN_ALL = new Set();
    const allCouplesHtml = all => `<div class="lo-all"><h4>${esc(T('Tous les couples apparentés'))}</h4>${all.rows?.length ? `<div class="tw"><table class="data-table lo-table" data-cols-off><thead><tr><th>${esc(T('Couple'))}</th><th>${esc(T('Année'))}</th><th>${esc(T('Degré'))}</th></tr></thead><tbody>${all.rows.map(r => `<tr><td><button type="button" class="link-button" data-lo-pair="${r.ida},${r.idb}">${esc(r.a)} × ${esc(r.b)}</button></td><td>${esc(r.year || '')}</td><td>${esc(r.direct ? T('ligne directe') : r.aff ? T('alliance, {n} degré', {n: ord(r.canon)}) : T('{n} degré', {n: ord(r.canon)}))}</td></tr>`).join('')}</tbody></table></div>` : empty(T('Aucun couple apparenté de près dans ta base.'), '🔗')}</div>`;
    R.prenup = async card => {
        const names = !!get('prenup', 'names'), limit = Number(get('prenup', 'limit')) || 8;
        const d = await ask('lot_o_arbre', {card: 'prenup', limit, names: names ? 1 : 0});
        const n = d.eras.reduce((s, e) => s + e.n, 0), k = d.eras.reduce((s, e) => s + e.k, 0);
        if (!n) return {html: empty(T('Pas encore de couple avec la date du mariage et celle du premier enfant.')) + tactNote() + acts(card, {basket: false, media: false})};
        const before = d.eras.filter(e => /avant|17/.test(e.label) || /^18[0-4]/.test(e.label)), nb = before.reduce((s, e) => s + e.n, 0), kb = before.reduce((s, e) => s + e.k, 0);
        const one = C().oneIn(nb ? kb : k, nb || n);
        const lead = (nb && one ? T('Avant 1850, 1 couple sur {o} a eu son premier enfant moins de {m} mois après le mariage.', {o: one, m: limit}) : T('{p} % des couples ont eu leur premier enfant moins de {m} mois après le mariage.', {p: C().share(k, n), m: limit}))
            + ' ' + T('C’était courant dans les campagnes : on se mariait souvent quand l’enfant s’annonçait.');
        const list = names && d.couples?.length ? more(T('▸ plus ({n} couples)', {n: d.couples.length}), `<ul class="lo-list">${d.couples.map(c => `<li>${who(c.a, c.ida)} × ${who(c.b, c.idb)}, ${esc(c.year)} <small class="muted">${esc(T('{m} mois', {m: nf(c.months, 1)}))}</small></li>`).join('')}</ul>`) : '';
        return {lead, html: `<p class="lo-lead">${esc(lead)}</p>${barsH(d.eras.map(e => [T(e.label), C().share(e.k, e.n), T('{k} sur {n}', {k: e.k, n: e.n})]), ' %', T('Part des premiers enfants nés tôt, par époque'))}${tactNote()}${list}${acts(card, {source: esc(T('Calculé sur ta base'))})}`};
    };
    R.gravity = async card => {
        const d = await ask('lot_o_arbre', {card: 'gravity'}), P = C().gravityPath(d.gens);
        if (!P) return {html: empty(T('Il faut les lieux de naissance (avec leur position) d’au moins deux générations d’ancêtres.')) + acts(card, {basket: false, media: false})};
        const lead = T('En {g} générations, le centre de ta famille a fait {km} km, de {a} vers {b}.', {g: P.gens, km: nf(P.km), a: P.from.near, b: P.to.near}) + (P.jump && P.jump.km > 20 ? ' ' + T('Le grand saut : la génération {r}{y}.', {r: C().ROMAN[P.jump.g] || P.jump.g, y: P.jump.year ? ` (${T('vers {y}', {y: P.jump.year})})` : ''}) : '');
        return {lead, html: `<p class="lo-lead">${esc(lead)}</p>${gravitySvg(d.gens)}<p class="muted small">${esc(T('I = la tienne ; chaque point : la moyenne des lieux de naissance d’une génération.'))}</p>${acts(card, {source: esc(T('Calculé sur ta base · lieux de naissance des ancêtres'))})}`};
    };
    R.radius = async card => {
        const km = Number(get('radius', 'km')) || 12, d = await ask('lot_o_arbre', {card: 'radius', ...scopeQ('radius')}), by = C().radiusBy(d.rows, km);
        if (!by.length) return {html: empty(T('Il faut les lieux de naissance (avec leur position) des deux époux.')) + acts(card, {basket: false, media: false})};
        const first = by[0], last = by[by.length - 1];
        const lead = T('Au {c} siècle, {p} % des mariages unissaient deux villages à moins de {km} km.', {c: first.label, p: first.near, km}) + (by.length > 1 ? ' ' + T('Au {c}, la moitié dépasse {m} km.', {c: last.label, m: nf(last.median)}) : '')
            + ' ' + T('Distance entre les lieux de naissance des deux époux.');
        const far = [...d.rows].sort((a, b) => b.km - a.km)[0];
        return {lead, html: `<p class="lo-lead">${esc(lead)}</p>${columnsSvg(by.map(x => [x.label, x.median, `${nf(x.median)} km`]), T('La distance médiane, siècle par siècle'), T('médiane'))}
            ${far ? more(T('▸ plus (le plus loin)'), `<p>${esc(T('Le mariage le plus lointain :'))} ${who(far.a, far.ida)} (${esc(far.pa)}) × ${who(far.b, far.idb)} (${esc(far.pb)}), ${esc(far.year)} — ${esc(nf(far.km))} km.</p>`) : ''}
            ${acts(card, {source: esc(T('Calculé sur ta base · distances à vol d’oiseau'))})}`};
    };
    const dur = m => (m < 12 ? T('{n} mois', {n: Math.round(m)}) : m < 24 ? T('1 an {n} mois', {n: Math.round(m - 12)}) : T('{n} ans', {n: nf(m / 12, 1)}));
    R.widow = async card => {
        const d = await ask('lot_o_arbre', {card: 'widow', ...scopeQ('widow')}), mh = C().median(d.h), mf = C().median(d.f);
        if (mh == null && mf == null) return {html: empty(T('Pas encore de remariage daté après la mort d’un conjoint.')) + acts(card, {basket: false, media: false})};
        const lead = [mh != null ? T('Les veufs se remariaient en {d} (médiane, {n} cas)', {d: dur(mh), n: d.h.length}) : '', mf != null ? T('les veuves en {d} ({n} cas)', {d: dur(mf), n: d.f.length}) : ''].filter(Boolean).join(', ').replace(/^./, c => c.toUpperCase()) + '.';
        const dots = (v, y, cls) => v.slice(0, 200).map((m, i) => `<circle class="${cls}" cx="${(70 + Math.min(5, m / 12) * 70).toFixed(1)}" cy="${y + (i % 3) * 4}" r="4"/>`).join('');
        const body = `<line class="lo-axis" x1="70" y1="75" x2="430" y2="75"/>${[0, 1, 2, 3, 4, 5].map(y => txt(70 + y * 70, 90, `${y} ${T(y > 1 ? 'ans' : 'an')}`, {anchor: 'middle', size: 10, cls: 'lo-mut'})).join('')}${txt(0, 27, T('hommes'), {cls: 'lo-mut'})}${txt(0, 57, T('femmes'), {cls: 'lo-mut'})}${dots(d.h, 19, 'lo-dot')}${dots(d.f, 49, 'lo-dot is-f')}`;
        return {lead, html: `<p class="lo-lead">${esc(lead)}</p>${svg(440, 96, body, T('Le temps avant de se remarier, hommes et femmes'))}${acts(card, {source: src('veuvage')})}`};
    };
    R.godname = async card => {
        const d = await ask('lot_o_arbre', {card: 'godname'});
        if (!d.n) return {html: empty(T('Note les parrains et marraines comme témoins (rôle « parrain », « marraine ») des naissances et baptêmes.')) + acts(card, {basket: false, media: false})};
        const top = Object.entries(d.rels || {}).filter(([r]) => r !== 'autre').map(([r]) => T(r));
        const lead = T('{p} % des baptisés dont le parrain ou la marraine est connu portent son prénom.', {p: C().share(d.same, d.n)}) + (top.length ? ' ' + T('Le plus souvent : {r}.', {r: top.slice(0, 2).reduce((a, b) => T('{a}, puis {b}', {a, b}))}) : '');
        const rows = d.examples.map(x => `<tr><td>${who(x.child, x.idc)}${x.year ? `, ${esc(x.year)}` : ''}</td><td>${esc(x.gp)}${x.role === 'marraine' ? ` <small>(${esc(T('marraine'))})</small>` : ''}</td><td>${esc(T(x.rel || '—'))}</td></tr>`).join('');
        return {lead, html: `<p class="lo-lead">${esc(lead)}</p>${rows ? `<div class="tw"><table class="data-table lo-table" data-cols-off><thead><tr><th>${esc(T('Enfant'))}</th><th>${esc(T('Parrain'))}</th><th>${esc(T('Lien'))}</th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}${acts(card, {source: src('parrain'), media: false})}`};
    };
    R.orphans = async card => {
        const age = Number(get('orphans', 'age')) || 10, d = await ask('lot_o_arbre', {card: 'orphans', age, ...scopeQ('orphans')});
        const k = d.eras.reduce((s, e) => s + e.k, 0);
        if (!d.total) return {html: empty(T('Il faut les dates de naissance des enfants et de décès des parents.')) + tactNote() + acts(card, {basket: false, media: false})};
        const lead = (d.nposthumous === 1 ? T('1 enfant est né après la mort de son père', {}) : T('{p} enfants sont nés après la mort de leur père', {p: nf(d.nposthumous)})) + ', '
            + (k === 1 ? T('et 1 a perdu un parent avant {a} ans.', {a: age}) : T('et {k} ont perdu un parent avant {a} ans.', {k: nf(k), a: age}))
            + (d.remar_of ? ' ' + T('Le parent qui restait s’est remarié dans {r} cas sur {n}.', {r: d.remarried, n: d.remar_of}) : '');
        const rows = d.eras.map(e => `<tr><td>${esc(T(e.label))}</td><td>${esc(T('{k} sur {n}', {k: e.k, n: e.n}))} · ${C().share(e.k, e.n)} %${e.war ? ` <small>${esc(T('dont {w} de la guerre de 14', {w: e.war}))}</small>` : ''}</td></tr>`).join('');
        const post = d.posthumous.length ? more(d.nposthumous === 1 ? T('▸ plus (l’enfant posthume)') : T('▸ plus (les {n} enfants posthumes)', {n: d.nposthumous}), `<ul class="lo-list">${d.posthumous.map(x => `<li>${who(x.name, x.id)}, ${esc(x.year)} — ${esc(T('{m} mois après la mort de son père', {m: nf(x.months, 0)}))}</li>`).join('')}</ul>
            <p class="small">${esc(T('Cherche leur tutelle : un conseil de famille se réunissait chez le juge de paix du canton (de 1790 à 1958 ; archives en série U des Archives départementales).'))} ${src('conseil')} · ${src('paix')}</p>`) : '';
        return {lead, html: `<p class="lo-lead">${esc(lead)}</p><div class="tw"><table class="data-table lo-table" data-cols-off><thead><tr><th>${esc(T('Époque'))}</th><th>${esc(T('Orphelins avant {a} ans', {a: age}))}</th></tr></thead><tbody>${rows}</tbody></table></div>${post}
            <p class="lo-tact">🤍 ${esc(T('Les noms ne viennent que dans « ▸ plus », jamais pour une personne vivante.'))}</p>${acts(card, {source: `${esc(T('Calculé sur ta base · rejoint le contrôle « Enfant posthume »'))} · ${src('posthume')}`, media: false})}`};
    };
    R.land = async card => {
        const d = await ask('lot_o_arbre', {card: 'land', by: get('land', 'by')});
        if (!d.gens.length && !d.lines.length) return {html: empty(T('Il faut les métiers des ancêtres (fiche ou événement « Profession »).')) + acts(card, {basket: false, media: false})};
        const sent = d.lines.map(l => l.left ? T('Ta lignée {s} a quitté la terre à la génération {g}{y}, avec {n}, devenu {j}.', {s: l.surname || '', g: l.left.roman, y: l.left.year ? `, ${T('vers {y}', {y: l.left.year})}` : '', n: l.left.name, j: String(l.left.job || '').toLowerCase()})
            : l.still ? T('La branche {s} est restée à la terre{y}.', {s: l.surname || '', y: l.lastLand?.year ? ` ${T('jusqu’à la génération née vers {y}', {y: l.lastLand.year})}` : ''}) : '').filter(Boolean);
        const lead = sent.join(' ') || T('Aucune lignée de la terre trouvée dans les métiers notés.');
        const legend = `<p class="lo-legend">${Object.entries(LANDK).map(([k, l], i) => `<span><i class="lo-c${i + 1}"></i>${esc(T(l))}</span>`).join('')}</p>`;
        return {lead, html: `<p class="lo-lead">${esc(lead)}</p>${d.gens.length ? stackSvg(d.gens) + legend : ''}${acts(card, {source: `${esc(T('Familles de métiers :'))} ${link('assets/data/metiers-anciens.json', T('métiers anciens'))} · ${src('exode')}`})}`};
    };
    R.signatures = async card => {
        const line = get('signatures', 'line'), d = await ask('lot_o_arbre', {card: 'signatures', line});
        const ch = d.chain.filter(x => x.year || x.sig || x.signed != null);
        if (!ch.length) return {html: empty(T('Coche « a signé » sur les actes de mariage, ou encadre une signature dans la visionneuse (« Identifier une signature »).')) + acts(card, {basket: false, media: false})};
        const first = ch.find(x => x.signed === 1);
        const lead = first ? T('{l}, la première signature arrive en {y}.', {l: T(line === 'f' ? 'De mère en fille' : 'De père en fils'), y: first.year || '?'}) + (ch.some(x => x.signed === 0 && (x.year || 0) < (first.year || 0)) ? ' ' + T('Avant, « a déclaré ne savoir signer ».') : '')
            : T('Personne dans cette lignée n’a encore une signature notée.');
        const cells = ch.map(x => `<figure class="lo-sig${x.signed === 0 ? ' is-no' : ''}">${x.sig ? `<span class="lo-sig-img" data-lo-sig="${esc(JSON.stringify(x.sig))}" role="img" aria-label="${esc(T('Signature de {n}', {n: x.name}))}"></span>` : `<span class="lo-sig-none">${esc(x.signed === 0 ? T('ne savait pas signer') : x.signed === 1 ? T('a signé') : '—')}</span>`}
            <figcaption>${who(x.name, x.id)}<small>${esc(x.year ? T('mariage {y}', {y: x.year}) : '')}</small>${x.sig ? ` <button type="button" class="ib lo-ib" data-lo-media="${esc(JSON.stringify({id: x.sig.media_id, filename: x.sig.filename, media_type: 'image', title: x.name}))}" title="${esc(T('Ouvrir le document'))}" aria-label="${esc(T('Ouvrir le document'))}">📎</button>` : ''}</figcaption></figure>`).join('');
        return {lead, html: `<p class="lo-lead">${esc(lead)}</p><div class="lo-sigs${get('signatures', 'layout') === 'col' ? ' is-col' : ''}" data-lo-sigs>${cells}</div>${acts(card, {source: `${esc(T('Les signatures repérées dans tes documents (visionneuse → « Identifier une signature »)'))} · ${src('signature')}`, media: false})}`, after: fillSignatures};
    };
    async function fillSignatures(body) {
        for (const el of body.querySelectorAll('[data-lo-sig]')) {
            let s; try { s = JSON.parse(el.dataset.loSig); } catch (_) { continue; }
            const img = await new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = `media/${encodeURIComponent(s.filename)}`; });
            if (!img || !el.isConnected) continue;
            const sx = s.x / 100 * img.naturalWidth, sy = s.y / 100 * img.naturalHeight, sw = Math.max(1, s.w / 100 * img.naturalWidth), sh = Math.max(1, s.h / 100 * img.naturalHeight), c = document.createElement('canvas');
            c.height = 60; c.width = Math.round(Math.min(4, sw / sh) * 60); c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height); el.appendChild(c);
        }
    }
    R.chome = async card => {
        const v = get('chome', 'date') || '';
        const res = v ? chomeSentence(v) : '';
        return {lead: res, html: `<p class="lo-lead">${esc(T('Une date (naissance, mariage, décès) : était-ce un dimanche, une fête chômée, un décadi ?'))}</p>
            <label class="lo-num lo-date"><span>${esc(T('Date'))}</span><input type="date" value="${esc(v)}" min="1500-01-01" max="2100-12-31" data-lo-date></label>
            <p class="lo-answer" data-lo-answer aria-live="polite">${esc(res)}</p>
            ${more(T('▸ plus (les règles)'), `<ul class="lo-list"><li>${esc(T('Avant 1802 : les dimanches et des dizaines de fêtes d’obligation, la liste changeait d’un diocèse à l’autre.'))}</li><li>${esc(T('De 1793 à 1802 : le calendrier républicain, le décadi (un jour sur dix) remplace le dimanche.'))}</li><li>${esc(T('Depuis le Concordat (1802) : les dimanches, Noël, l’Ascension, l’Assomption et la Toussaint ; puis les jours fériés de la loi (1ᵉʳ janvier 1810, 14 juillet 1880, lundis de Pâques et de Pentecôte 1886, 11 novembre 1922, 1ᵉʳ mai 1947, 8 mai).'))}</li></ul>`)}
            ${acts(card, {source: `${src('solennite')} · ${src('concordat')} · ${src('feries')} · ${src('republicain')}`, media: false})}`};
    };
    const WD = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
    function chomeSentence(iso) {
        const [y, m, d] = String(iso).split('-').map(Number); const c = C().chome(y, m, d); if (!c) return '';
        const day = `${T(WD[c.weekday])} ${dateFr(iso)}`;
        if (!c.off) return T('Le {d} était un jour ouvrable.', {d: day}) + (c.rule === 'concordat' ? ' ' + T('(Depuis 1802, seules Noël, l’Ascension, l’Assomption et la Toussaint restent chômées en semaine.)') : '');
        if (c.kind === 'dimanche') return T('Le {d} était un dimanche, jour chômé.', {d: day});
        if (c.kind === 'decadi') return T('Le {d} était un décadi, le jour de repos du calendrier républicain.', {d: day});
        if (c.rule === 'ancien') return T('Le {d} était {f}, une fête chômée (fête d’obligation ; la liste changeait selon le diocèse).', {d: day, f: T(c.name)});
        return T('Le {d} était {f}, jour chômé.', {d: day, f: T(c.name)});
    }

    /* ═════ la page ═════ */
    const CACHE = {};
    const S = () => A().state || {};
    const isHere = token => token === S().workspaceToken && S().module === 'listes' && S().listType === LIST;
    let filter = 'all';
    async function render(token) {
        const ws = document.getElementById('workspace'); if (!ws || !isHere(token)) return;
        const seg = (UI().segmented || (() => ''))({label: T('Montrer'), items: [['all', 'Tout'], ['new', 'Nouveaux'], ['done', 'Déjà là']].map(([v, l]) => ({on: filter === v, html: esc(T(l)), attrs: `data-lo-filter="${v}"`}))});
        ws.innerHTML = `<section class="page lo-page" data-lo-page>${UI().pageHeader ? UI().pageHeader({where: T('Listes · 🌳 Famille'), icon: '🌳', title: T('Ce que dit l’arbre'),
            help: esc(T('Dix façons de lire ta famille, calculées sur cet ordinateur. Pour : toute la base (sans les vivants ni les fiches confidentielles). Change le groupe ou la période dans ⚙️ Personnaliser de chaque carte.'))})
            : `<header class="page-header"><h2>🌳 ${esc(T('Ce que dit l’arbre'))}</h2></header>`}
            <div class="lo-bar">${seg}</div>
            <div class="lo-grid" data-lo-grid>${CARDS.filter(c => !c.o2).map(shell).join('')}</div>
            <h3 class="lo-sec">⚖️ ${esc(T('Les règles et les dates'))}</h3>
            <div class="lo-grid">${CARDS.filter(c => c.o2).map(shell).join('')}</div></section>`;
        applyFilter(ws);
        CARDS.forEach(c => paint(c.id));
    }
    function applyFilter(root = document) { root.querySelectorAll('[data-lo-grid] [data-lo-card]').forEach(el => { const st = el.dataset.loStatus; el.hidden = filter === 'new' ? st === 'done' : filter === 'done' ? st !== 'done' : false; }); }
    const LEADS = new Map();
    async function paint(id) {
        const card = CARDS.find(c => c.id === id), el = document.querySelector(`[data-lo-card="${id}"]`); if (!card || !el) return;
        const body = el.querySelector('[data-lo-body]');
        try {
            const r = await R[id](card); if (!el.isConnected) return;
            body.innerHTML = r.html + persoHtml(card);
            LEADS.set(id, r.lead || body.querySelector('.lo-lead')?.textContent || '');
            r.after?.(body);
        } catch (e) { if (el.isConnected) body.innerHTML = `${UI().notice ? UI().notice('error', esc(e.message || String(e))) : `<p class="error">${esc(e.message || e)}</p>`}${persoHtml(card)}`; }
    }

    /* 📎 l'image de la carte dans les médias (↶ Annuler la retire) */
    async function keepImage(id, btn) {
        const el = document.querySelector(`[data-lo-card="${id}"] svg.lo-viz`); if (!el) return toast(T('Pas d’image dans cette carte.'));
        btn.disabled = true;
        try {
            const clone = el.cloneNode(true), all = [el, ...el.querySelectorAll('*')], copies = [clone, ...clone.querySelectorAll('*')];
            all.forEach((n, i) => { const cs = getComputedStyle(n); ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'font-family', 'font-size', 'font-weight'].forEach(p => { const v = cs.getPropertyValue(p); if (v) copies[i].setAttribute(p, v); }); });
            const vb = el.viewBox.baseVal, W = Math.round(vb.width * 2), H = Math.round(vb.height * 2);
            clone.setAttribute('width', W); clone.setAttribute('height', H);
            const bg = getComputedStyle(el.closest('.card') || document.body).backgroundColor || '#fff';
            const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone));
            const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = url; });
            const c = document.createElement('canvas'); c.width = W + 40; c.height = H + 40; const g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 20, 20, W, H);
            const blob = await new Promise(r => c.toBlob(r, 'image/png'));
            const card = CARDS.find(x => x.id === id), name = `${(A().safeExportFilename ? A().safeExportFilename(T(card.title), 'arbre') : 'arbre')}.png`;
            const put = async () => A().importMediaFile(new File([blob], name, {type: 'image/png'}), ['image']);
            let it = await put();
            const del = async () => { if (it?.id) await A().api('delete_media', {}, {method: 'POST', body: {media_id: Number(it.id)}}); };
            A().undoToast ? A().undoToast(T('Image gardée dans les médias : « {t} ».', {t: T(card.title)}), {icon: '📎', undo: del, redo: async () => { it = await put(); }}) : toast(T('Image gardée dans les médias.'));
        } catch (e) { toast(T('Image non gardée : {err}', {err: e.message || e}), 'error'); }
        finally { btn.disabled = false; }
    }
    function toBasket(id) {
        const card = CARDS.find(x => x.id === id), lead = LEADS.get(id) || '';
        if (!lead) return toast(T('Rien à mettre au panier pour l’instant.'));
        ext.connexions?.take?.([{kind: 'datum', ref_id: 0, title: `${card.icon} ${T(card.title)}`.slice(0, 200), value: lead.slice(0, 2000), origin: ORIGIN}]);
    }
    async function pickPair() {
        const P = window.LCNDA_PICKER || A(); if (!P.openPicker) return;
        const a = await P.openPicker({kind: 'person', title: T('La première personne')}); if (!a?.id) return;
        const b = await P.openPicker({kind: 'person', title: T('La deuxième personne')}); if (!b?.id) return;
        set('dispense', 'a', Number(a.id)); set('dispense', 'b', Number(b.id)); paint('dispense');
    }

    /* les clics et les changements de la page */
    document.addEventListener('click', e => {
        const page = e.target.closest?.('[data-lo-page]'); if (!page) return;
        const el = e.target.closest('[data-lo-card]'), id = el?.dataset.loCard;
        let b;
        if ((b = e.target.closest('[data-lo-filter]'))) { filter = b.dataset.loFilter; UI().segPick?.(b); applyFilter(page); return; }
        if ((b = e.target.closest('[data-lo-person]'))) { openPerson(b.dataset.loPerson); return; }
        if ((b = e.target.closest('[data-lo-media]'))) { try { A().openLightbox?.([JSON.parse(b.dataset.loMedia)], 0); } catch (_) {} return; }
        if (!id) return;
        if ((b = e.target.closest('[data-lo-diag]'))) { openDiagram(b.dataset.loDiag); return; }
        if (e.target.closest('[data-lo-bk]')) { toBasket(id); return; }
        if ((b = e.target.closest('[data-lo-keep]'))) { keepImage(id, b); return; }
        if (e.target.closest('[data-lo-pick]')) { pickPair(); return; }
        if (e.target.closest('[data-lo-all]')) { if (OPEN_ALL.has(id)) OPEN_ALL.delete(id); else OPEN_ALL.add(id); paint(id); return; }
        if ((b = e.target.closest('[data-lo-pair]'))) { const [x, y] = b.dataset.loPair.split(',').map(Number); set('dispense', 'a', x); set('dispense', 'b', y); paint('dispense'); return; }
        if ((b = e.target.closest('[data-lo-seg]'))) { set(id, b.dataset.loSeg, b.dataset.v); paint(id); return; }
        if ((b = e.target.closest('[data-lo-reset]'))) { resetOne(id, b.dataset.loReset, () => paint(id)); return; }
    });
    document.addEventListener('change', e => {
        const inp = e.target.closest?.('[data-lo-page] [data-lo-set]'); if (inp) {
            const id = inp.closest('[data-lo-card]').dataset.loCard, k = inp.dataset.loSet;
            const s = CARDS.find(c => c.id === id).parts.flatMap(p => p.settings || []).find(x => x.k === k);
            let v = inp.type === 'checkbox' ? inp.checked : inp.value.trim();
            if (s.kind === 'num') { v = Math.max(s.min, Math.min(s.max, Math.round(Number(v) || CARDS.find(c => c.id === id).def[k]))); }
            if (s.kind === 'year' && v !== '' && !/^-?\d{1,4}$/.test(v)) { toast(T('Écris une année, par exemple 1850.'), 'error'); return; }
            set(id, k, v); paint(id); return;
        }
        const dt = e.target.closest?.('[data-lo-page] [data-lo-date]'); if (dt) { set('chome', 'date', dt.value); const a = dt.closest('[data-lo-card]').querySelector('[data-lo-answer]'); const s = dt.value ? chomeSentence(dt.value) : ''; if (a) a.textContent = s; LEADS.set('chome', s); }
    });
    /* ⚙️ Personnaliser : une seule partie ouverte à la fois (retenue le temps de la page) */
    document.addEventListener('toggle', e => {
        const d = e.target; if (!d?.matches?.('[data-lo-page] details.lo-pgrp, [data-lo-page] details.lo-perso')) return;
        const id = d.closest('[data-lo-card]')?.dataset.loCard; if (!id) return;
        if (d.matches('.lo-perso')) { if (!d.open) OPEN.delete(id); else if (!OPEN.has(id)) OPEN.set(id, null); return; }
        if (!d.open) { if (OPEN.get(id) === Number(d.dataset.loPart)) OPEN.set(id, null); return; }
        OPEN.set(id, Number(d.dataset.loPart));
        d.parentElement.querySelectorAll(':scope > details.lo-pgrp').forEach(o => { if (o !== d) o.open = false; });
    }, true);

    /* ═════ les branchements : Listes, ⌘K, 🧭 Je veux… ═════ */
    ext.lists = ext.lists || {};
    ext.lists[LIST] = token => render(token);
    function addList() {
        const app = A();
        if (app?.defaultListTypes && !app.defaultListTypes.some(x => x[0] === LIST)) app.defaultListTypes.push([LIST, '02z', '🌳 Ce que dit l’arbre']);
        const G = (ext.listGroupDefaults || []).find(g => g[0] === 'g_people'); if (G && !G[3].includes(LIST)) G[3].splice(Math.max(0, G[3].indexOf('daboville') + 1), 0, LIST);
    }
    addList(); document.addEventListener('DOMContentLoaded', addList, {once: true});
    function open(card = '') {
        document.querySelectorAll('dialog[open]').forEach(d => { if (!d.classList.contains('is-full')) d.close(); });
        const st = S(); st.listType = LIST;
        const go = () => { if (!card) return; const el = document.querySelector(`[data-lo-card="${card}"]`); if (el) { el.scrollIntoView({block: 'start', behavior: 'smooth'}); el.classList.add('is-flash'); setTimeout(() => el.classList.remove('is-flash'), 1600); } };
        if (st.module === 'listes') { A().renderSidebar?.(); render(++st.workspaceToken).then(() => setTimeout(go, 50)); } else Promise.resolve(A().setModule?.('listes')).then(() => setTimeout(go, 120));
    }
    const fold = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    function provider(q) {
        const w = fold(q).split(/[^a-z0-9]+/).filter(x => x.length >= 3); if (!w.length) return [];
        return CARDS.filter(c => w.every(x => fold(`${c.title} ${c.words}`).includes(x))).slice(0, 3).map(c => ({label: `${c.icon} ${T(c.title)}`, hint: T('Listes · 🌳 Ce que dit l’arbre'), go: () => open(c.id)}));
    }
    ext.quickSearchProviders = ext.quickSearchProviders || [];
    if (!ext.quickSearchProviders.includes(provider)) ext.quickSearchProviders.push(provider);
    function intents(H) {
        const path = ['Listes', '👥 Personnes et familles', '🌳 Ce que dit l’arbre'];
        return [
            H('arbre_dit', 'montrer', '🌳', 'Voir ce que dit l’arbre', 'Dix lectures de la famille : mariages en Carême, cousins mariés, orphelins, quitter la terre, signatures…', path,
                {act: ['voir', 'trouver'], obj: ['arbre', 'famille', 'mariage'], words: 'ce que dit l arbre statistiques famille lecture careme avent dispense orphelin posthume terre signature remariage parrain', phrases: ['ce que dit l arbre', 'lire ma famille'], go: () => open(), target: `list:${LIST}`, module: 'listes'}),
            H('mariages_careme', 'montrer', '💒', 'Voir quand ma famille se mariait', 'Les mariages mois par mois, ceux de l’Avent et du Carême à vérifier.', path,
                {act: ['voir', 'trouver'], obj: ['mariage', 'famille'], words: 'careme avent temps clos mois mariages calendrier', phrases: ['mariages careme', 'quand ma famille se mariait'], go: () => open('tempsclos'), target: `list:${LIST}`, module: 'listes'}),
            H('dispense_mariage', 'verifier', '🔗', 'Savoir s’il fallait une dispense', 'Deux personnes : leur degré de parenté pour l’Église et la loi, et s’il fallait une dispense à cette date.', path,
                {act: ['trouver', 'verifier'], obj: ['mariage', 'famille'], words: 'dispense consanguinite cousins maries degre parente eveque', phrases: ['dispense de consanguinite', 'cousins maries'], go: () => open('dispense'), target: `list:${LIST}`, module: 'listes'}),
            H('jour_chome', 'verifier', '⛪', 'Savoir si un jour était chômé', 'Dimanche, fête d’obligation, décadi, jour férié : selon l’époque.', path,
                {act: ['trouver', 'verifier'], obj: [], words: 'jour chome ferie fete obligation dimanche decadi', phrases: ['jour chome', 'fete chomee'], go: () => open('chome'), target: `list:${LIST}`, module: 'listes'})];
    }
    (ext.intentsHand = ext.intentsHand || []).push(intents);

    /* ═════ 👤 la fiche : une phrase dans les blocs qui existent ═════ */
    const PCACHE = new Map();
    const pdata = id => { if (!PCACHE.has(id)) PCACHE.set(id, ask('lot_o_person', {id}).catch(() => ({ok: false}))); return PCACHE.get(id); };
    setInterval(() => { if (PCACHE.size > 30) PCACHE.clear(); }, 60000);
    function famLine(d) {
        const p = d.parents?.[0]; if (!p) return '';
        if (p.posthumous) return `🕯 ${esc(T(d.sex === 'f' ? 'Elle est née {m} mois après la mort de son père.' : 'Il est né {m} mois après la mort de son père.', {m: nf(p.months, 0)}))} ${src('posthume')}`;
        const key = p.who === 'father' ? (d.sex === 'f' ? 'Elle avait {a} ans quand son père est mort.' : 'Il avait {a} ans quand son père est mort.') : (d.sex === 'f' ? 'Elle avait {a} ans quand sa mère est morte.' : 'Il avait {a} ans quand sa mère est morte.');
        return `🕯 ${esc(T(key, {a: p.age}))}`;
    }
    function rulesLines(d) {
        const out = [];
        const m = d.marriages?.find(x => x.canon <= 7);
        if (m) {
            const y = m.year || null, r = C().dispense(m.aff ? 'affin' : 'consang', m.canon, m.civil, y, m.direct);
            const what = m.aff ? T('parents par alliance ({n} degré)', {n: ord(m.canon)}) : m.direct ? T('en ligne directe') : T('parents au {n} degré pour l’Église', {n: ord(m.canon)});
            if (r.needed) out.push(['dispense', `🔗 ${esc(T('{w} et {s} étaient {k} : dispense nécessaire{y}.', {s: T(d.sex === 'f' ? 'elle' : 'lui'), w: m.spouse.name, k: what, y: y ? ' ' + T('en {y}', {y}) : ''}))} <button type="button" class="link-button" data-lo-open="dispense" data-lo-a="${d.id}" data-lo-b="${m.spouse.id}">${esc(T('Comment on compte'))}</button>`]);
        }
        for (const x of d.dates || []) {
            const [yy, mm, dd] = x.d.split('-').map(Number), c = C().chome(yy, mm, dd);
            if (c?.off && c.kind !== 'dimanche') {
                const ev = T(x.kind === 'birth' ? (d.sex === 'f' ? 'Elle est née' : 'Il est né') : x.kind === 'death' ? (d.sex === 'f' ? 'Elle est morte' : 'Il est mort') : (d.sex === 'f' ? 'Elle s’est mariée' : 'Il s’est marié'));
                out.push(['chome', `⛪ ${esc(T('{e} le {d}, {f} : un jour chômé.', {e: ev, d: dateFr(x.d), f: T(c.name)}))} ${src(c.rule === 'republicain' ? 'republicain' : c.rule === 'loi' ? 'feries' : 'solennite')}`]);
                break;
            }
        }
        const minor = d.parents?.find(p => (p.age ?? 0) < 21);
        if (minor && d.by && d.by + 21 > 1790 && d.by < 1958) {
            const place = d.canton ? T('sa commune ({p}) est aujourd’hui dans le canton de {c}, découpage de 2015 : à vérifier pour son époque', {p: d.canton.place, c: d.canton.canton}) : '';
            out.push(['paix', `⚖️ ${esc(T('Mineur à la mort de {p}, {s} a eu un tuteur nommé par un conseil de famille, chez le juge de paix du canton{c}. Archives : série U des Archives départementales.', {p: T(minor.who === 'father' ? 'son père' : 'sa mère'), s: T(d.sex === 'f' ? 'elle' : 'il'), c: place ? ` (${place})` : ''}))} ${src('conseil')}`]);
        }
        return out;
    }
    function remplacantLine(d) {
        const y = d.by ? d.by + 20 : 0; if (d.sex !== 'h' || y < 1804 || y > 1872) return '';
        const w = A().journalierWageSols ? A().journalierWageSols(y) / 20 : null; if (!w) return '';
        return `💰 ${esc(T('À ses 20 ans ({y}), payer un remplaçant coûtait de 1 000 à 2 000 francs : de {a} à {b} journées de travail d’un journalier.', {y, a: nf(1000 / w, 0), b: nf(2000 / w, 0)}))} ${src('service')}`;
    }
    const LINE = (k, html, cls = 'tr-line l10r-line') => `<div class="${cls} lo-line" data-lo-line="${k}"><p class="cplus-lead">${html}</p></div>`;
    const HERITAGE = [['Testament', 'Le père choisit, souvent un héritier (l’aîné) ; les autres ont leur « légitime ».', 'Peu de liberté : la coutume dit qui hérite.'],
        ['Les filles', 'Une dot au mariage, puis souvent plus rien.', 'Selon la coutume : égalité (Paris, Orléans) ou exclusion (Normandie).'],
        ['Les biens', 'Tout se mélange.', '« Paterna paternis » : les biens du père retournent à sa famille.'],
        ['Où chercher', 'Les testaments chez le notaire (insinuations, contrôle des actes).', 'Les partages et les inventaires chez le notaire.']];
    function heritageTable(line) {
        const t = fold(line.textContent || ''), reg = /mixte|partagee/.test(t) ? '' : /droit ecrit|written law/.test(t) ? 'ecrit' : /coutume|custom/.test(t) ? 'coutume' : '';
        return `<details class="lo-heritage" data-lo-line="heritage"><summary>🏠 ${esc(T('Ce que ça change pour l’héritage'))}</summary><div class="tw"><table class="data-table lo-table" data-cols-off><thead><tr><th></th><th${reg === 'ecrit' ? ' class="is-hl"' : ''}>${esc(T('Droit écrit (sud)'))}</th><th${reg === 'coutume' ? ' class="is-hl"' : ''}>${esc(T('Coutume (nord)'))}</th></tr></thead>
            <tbody>${HERITAGE.map(([h, a, b]) => `<tr><th>${esc(T(h))}</th><td${reg === 'ecrit' ? ' class="is-hl"' : ''}>${esc(T(a))}</td><td${reg === 'coutume' ? ' class="is-hl"' : ''}>${esc(T(b))}</td></tr>`).join('')}</tbody></table></div><p class="muted small">${src('ecrit')} · ${src('coutume')}</p></details>`;
    }
    async function decoratePerson() {
        const page = document.querySelector('#workspace .person-page'); if (!page) return;
        const hosts = {fam: page.querySelector('.pa-family-bar'), rules: page.querySelector('[data-l10r-person]'), laws: page.querySelector('[data-dp-lois]'), world: page.querySelector('[data-world-host]')};
        const pid = Number(hosts.rules?.dataset.l10rPerson || hosts.laws?.dataset.dpLois || hosts.world?.dataset.worldHost || page.querySelector('[data-pa-family-sheet]')?.dataset.paFamilySheet || 0);
        if (!pid) return;
        const d = await pdata(pid); if (!page.isConnected) { schedule(); return; } if (!d?.ok) return;
        // 👪 sous « Fiche familiale »
        if (hosts.fam && !hosts.fam.querySelector('[data-lo-line]')) { const l = famLine(d); if (l) hosts.fam.insertAdjacentHTML('beforeend', `<p class="lo-famline" data-lo-line="fam">${l}</p>`); }
        // ⚖️ Les règles de sa vie (sinon ⚖️ Ce que la loi disait) : une fois le bloc rempli
        const rl = rulesLines(d), rh = hosts.rules && hosts.rules.dataset.l10rFilled ? hosts.rules : null;
        if (rh && rl.length && !rh.querySelector('[data-lo-line]')) {
            rh.insertAdjacentHTML('beforeend', rl.map(([k, h]) => LINE(k, h)).join(''));
            const card = rh.closest('section.card'); if (card) card.hidden = false;
        }
        const cl = rh?.querySelector('[data-l10r-line="coutume"]'); if (cl && !cl.querySelector('[data-lo-line="heritage"]')) cl.insertAdjacentHTML('beforeend', heritageTable(cl));
        const lh = hosts.laws && hosts.laws.dataset.dpDone && !hosts.laws.querySelector('.ui-spinner, .loading-block') ? hosts.laws : null;
        if (lh && !lh.querySelector('[data-lo-line]')) {
            const extra = [remplacantLine(d), ...(!hosts.rules ? rl.map(x => x[1]) : [])].filter(Boolean);
            if (extra.length && lh.innerHTML.trim()) { lh.insertAdjacentHTML('afterbegin', extra.map((h, i) => `<p class="lo-line cplus-lead" data-lo-line="lois${i}">${h}</p>`).join('')); const c = lh.closest('.card'); if (c) c.hidden = false; }
        }
        // 🌍 Le monde autour : le premier de sa lignée à quitter la terre
        const wl = hosts.world?.querySelector('.h-world-lead');
        if (wl && d.land && !hosts.world.querySelector('[data-lo-line]')) wl.insertAdjacentHTML('afterend', `<p class="h-world-phrase lo-line" data-lo-line="land">🌾 ${esc(T(d.sex === 'f' ? 'Elle est la première de sa lignée à quitter la terre : son père, {f}, était {fj} ; elle, {j}.' : 'Il est le premier de sa lignée à quitter la terre : son père, {f}, était {fj} ; lui, {j}.', {f: d.land.father, fj: String(d.land.father_job).toLowerCase(), j: String(d.land.job).toLowerCase()}))} <button type="button" class="link-button" data-lo-open="land">${esc(T('Toute la famille'))}</button></p>`);
    }
    document.addEventListener('click', e => {
        const b = e.target.closest?.('#workspace .person-page [data-lo-open]'); if (!b) return;
        if (b.dataset.loA) { set('dispense', 'a', Number(b.dataset.loA)); set('dispense', 'b', Number(b.dataset.loB)); }
        open(b.dataset.loOpen);
    });
    let pending = 0;
    function schedule() { if (pending || !document.querySelector('#workspace .person-page')) return; pending = setTimeout(() => { pending = 0; decoratePerson().catch(() => {}); }, 120); }
    new MutationObserver(schedule).observe(document.documentElement, {childList: true, subtree: true});
    (ext.afterPerson = ext.afterPerson || []).push(() => { PCACHE.clear(); });

    ext.lotO = {open, render, CARDS, chomeSentence, famLine, rulesLines, remplacantLine, settings: readAll, KEY};
})();
