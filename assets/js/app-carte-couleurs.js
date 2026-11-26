/* LCNDA — 🎨 Couleurs de la carte : une seule règle pour les sortes d'événements sur toutes les cartes
 * (points et regroupements de la Carte, légende, carte d'une fiche, animation, superposition, export et impression).
 * Réglages → Cartes et fonds de carte → « Couleurs de la carte » ; clic sur une pastille de la légende = raccourci.
 * Enregistré dans localStorage « genealogie-carte-couleurs » : {colors: {births: '#…', …}, shapes: bool, shape: {births: 'triangle', …}, preset}.
 * Aussi require() dans Node (tests/test-carte-couleurs.js) pour les calculs (contraste, palettes).
 */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.LCNDA_CARTE_COULEURS = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
    'use strict';
    const KEY = 'genealogie-carte-couleurs';
    const EVT = 'lcnda-carte-couleurs';
    const T = (s, v) => (root.LCNDA_I18N ? root.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? v[k] : m)));
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    /** [clé, nom, étiquettes GEDCOM] — l'ordre de la légende */
    const KINDS = [
        ['births', 'Naissances', ['BIRT', 'CHR', 'BAPM']],
        ['marriages', 'Mariages', ['MARR', 'MARC', 'ENGA', 'MARB', 'MARL', 'MARS']],
        ['deaths', 'Décès', ['DEAT']],
        ['burials', 'Inhumations', ['BURI', 'CREM']],
        ['residences', 'Résidences', ['RESI']],
        ['census', 'Recensements', ['CENS']],
        ['events', 'Autres événements', []],
    ];
    const KEYS = KINDS.map(k => k[0]);
    /** les couleurs de départ : exactement celles d'avant le réglage */
    const DEFAULT = {births: '#2b8a3e', marriages: '#c2255c', deaths: '#495057', burials: '#7048e8', residences: '#1971c2', census: '#0b7285', events: '#e8590c'};
    /** les formes quand « Formes différentes par sorte » est coché (sans rond : le rond avec un nombre = un regroupement) */
    const DEFAULT_SHAPE = {births: 'triangle', marriages: 'diamond', deaths: 'cross', burials: 'square', residences: 'house', census: 'tridown', events: 'star'};
    const SHAPES = [['diamond', '◆ Losange'], ['square', '■ Carré'], ['triangle', '▲ Triangle'], ['tridown', '▼ Triangle à l’envers'], ['cross', '✚ Croix'], ['star', '★ Étoile'], ['house', '⌂ Maison'], ['hexagon', '⬢ Hexagone'], ['circle', '● Rond']];
    /** chemins SVG dans une boîte 24 × 24 (centre 12, 12) */
    const PATHS = {
        circle: 'M12 2.5a9.5 9.5 0 1 0 0.01 0Z',
        square: 'M3.5 3.5H20.5V20.5H3.5Z',
        diamond: 'M12 1L23 12L12 23L1 12Z',
        triangle: 'M12 1.5L23 21.5H1Z',
        tridown: 'M1 2.5H23L12 22.5Z',
        cross: 'M8.3 1.5h7.4v6.8h6.8v7.4h-6.8v6.8H8.3v-6.8H1.5V8.3h6.8Z',
        star: 'M12 1l3.2 7.1 7.8.8-5.9 5.2 1.7 7.7L12 17.8l-6.8 4 1.7-7.7L1 8.9l7.8-.8Z',
        house: 'M12 1.5L22.5 10V22.5H1.5V10Z',
        hexagon: 'M6.5 2.5h11L23 12l-5.5 9.5h-11L1 12Z',
    };
    /** les noms des couleurs des palettes (pour qu'elles restent nommables, pas seulement visibles) */
    const NAMES = {'#009e73': 'vert bleuté', '#cc79a7': 'rose violacé', '#000000': 'noir', '#0072b2': 'bleu', '#56b4e9': 'bleu ciel', '#f0e442': 'jaune', '#e69f00': 'orange', '#d55e00': 'vermillon', '#ffffff': 'blanc', '#595959': 'gris foncé', '#a6a6a6': 'gris clair', '#333333': 'gris très foncé'};
    /** [id, nom, couleurs, formes forcées, aide] */
    const PRESETS = [
        ['default', 'Par défaut', DEFAULT, false, 'Les couleurs de départ.'],
        // Okabe et Ito (2008) : se distinguent avec les daltonismes les plus courants (protan, deutan, tritan)
        ['daltonien', 'Pour daltoniens', {births: '#009e73', marriages: '#cc79a7', deaths: '#000000', burials: '#0072b2', residences: '#56b4e9', census: '#f0e442', events: '#e69f00'}, false, 'Palette Okabe-Ito : reste lisible pour les daltonismes les plus courants.'],
        ['pastel', 'Pastel', {births: '#8ce99a', marriages: '#faa2c1', deaths: '#ced4da', burials: '#b197fc', residences: '#74c0fc', census: '#66d9e8', events: '#ffc078'}, false, 'Des teintes douces, chiffres en noir.'],
        ['print', 'Contrasté (impression)', {births: '#006400', marriages: '#b00060', deaths: '#000000', burials: '#4b0082', residences: '#0033cc', census: '#006680', events: '#cc4400'}, false, 'Des couleurs foncées qui sortent bien sur papier.'],
        ['nb', 'Noir et blanc + formes', {births: '#000000', marriages: '#ffffff', deaths: '#595959', burials: '#000000', residences: '#ffffff', census: '#a6a6a6', events: '#595959'}, true, 'Sans couleur : chaque sorte a sa forme.'],
    ];
    const hex = v => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim().toLowerCase() : '');
    const ls = () => { try { return root.localStorage || null; } catch (_) { return null; } };

    /** luminance relative (WCAG) d'une couleur #rrggbb */
    function luminance(c) {
        const h = hex(c) || '#000000';
        const [r, g, b] = [1, 3, 5].map(i => { const v = parseInt(h.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    /** le texte lisible sur cette couleur : blanc ou presque noir, celui qui contraste le plus */
    const textOn = c => (contrast(c, '#ffffff') >= contrast(c, '#111111') ? '#ffffff' : '#111111');

    function clean(v) {
        v = v && typeof v === 'object' ? v : {};
        const colors = {}, shape = {};
        KEYS.forEach(k => { colors[k] = hex(v.colors?.[k]) || DEFAULT[k]; shape[k] = PATHS[v.shape?.[k]] ? v.shape[k] : DEFAULT_SHAPE[k]; });
        return {colors, shapes: !!v.shapes, shape, preset: PRESETS.some(p => p[0] === v.preset) ? v.preset : ''};
    }
    let cache = null;
    function read() {
        if (cache) return cache;
        let raw = null; try { raw = JSON.parse(ls()?.getItem(KEY) || 'null'); } catch (_) { raw = null; }
        return (cache = clean(raw));
    }
    function write(v, {silent = false, live = false} = {}) {
        const c = clean(v); cache = c;
        try { const s = ls(); if (s) { if (isDefault(c)) s.removeItem(KEY); else s.setItem(KEY, JSON.stringify(c)); } } catch (_) {}
        if (!silent) refresh({live});
        return c;
    }
    const isDefault = c => !c.shapes && KEYS.every(k => c.colors[k] === DEFAULT[k] && c.shape[k] === DEFAULT_SHAPE[k]);
    const color = k => read().colors[k] || DEFAULT.events;
    const shapesOn = () => read().shapes;
    /** la forme d'un point seul : celle de sa sorte (formes cochées), sinon le losange */
    const shapeOf = k => (read().shapes ? read().shape[k] || 'diamond' : 'diamond');
    /** la sorte d'un événement de carte ({gedcom_tag, is_cemetery}) */
    function kindOf(p) {
        if (p?.is_cemetery) return 'burials';
        const t = String(p?.gedcom_tag || '').toUpperCase();
        return (KINDS.find(k => k[2].includes(t)) || KINDS[6])[0];
    }
    /** la sorte la plus fréquente d'un groupe d'événements (à égalité : la première rencontrée) */
    function groupKind(events) {
        const n = new Map(); (events || []).forEach(e => { const k = kindOf(e); n.set(k, (n.get(k) || 0) + 1); });
        let best = 'events', m = -1; n.forEach((v, k) => { if (v > m) { m = v; best = k; } }); // à égalité : la première rencontrée (comme avant)
        return best;
    }
    const kindName = k => T((KINDS.find(x => x[0] === k) || KINDS[6])[1]);
    /** une forme en SVG (inline) : remplie de la couleur, bordée de var(--ink) */
    function shapeSvg(shape, fill, {size = 24, stroke = 'var(--ink, #111)', sw = 2, cls = 'kc-shape'} = {}) {
        return `<svg class="${cls}" viewBox="-1 -1 26 26" width="${size}" height="${size}" aria-hidden="true" focusable="false"><path d="${PATHS[shape] || PATHS.diamond}" fill="${esc(fill)}" stroke="${esc(stroke)}" stroke-width="${sw}" stroke-linejoin="round"/></svg>`;
    }
    /** la forme sur un canvas (export / impression), centrée en x, y, demi-largeur r */
    function drawShape(ctx, shape, x, y, r, fill, stroke = '#111', lw = 2) {
        const P = root.Path2D; if (!P) return;
        ctx.save(); ctx.translate(x - r, y - r); const k = (2 * r) / 24; ctx.scale(k, k);
        const p = new P(PATHS[shape] || PATHS.diamond); ctx.fillStyle = fill; ctx.fill(p); ctx.lineWidth = lw / k; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.stroke(p); ctx.restore();
    }

    /* ───── à l'écran ───── */
    function A() { return root.LCNDA_APP || {}; }
    function UI() { return root.LCNDA_UI || {}; }
    function refresh({live = false} = {}) {
        if (!root.document) return;
        // la carte d'une fiche : ses points se recolorent sur place
        document.querySelectorAll('.person-map-point[data-kc]').forEach(g => {
            const k = g.dataset.kc, c = color(k); g.style.setProperty('--event-color', c); g.style.setProperty('--kind-text', textOn(c));
            const sh = g.querySelector('.kc-pm-shape'), rect = g.querySelector('rect');
            if (shapesOn()) { if (rect) rect.remove(); if (sh) sh.setAttribute('d', PATHS[shapeOf(k)]); else g.insertAdjacentHTML('afterbegin', personMapShape(k)); }
            else if (sh) { sh.remove(); g.insertAdjacentHTML('afterbegin', '<rect x="-15" y="-15" width="30" height="30" transform="rotate(45)"/>'); }
        });
        try { root.dispatchEvent(new root.CustomEvent(EVT, {detail: read()})); } catch (_) {}
        // pendant un essai de couleur, le réglage ne se redessine pas (sa fenêtre de couleur reste ouverte) : seuls l'aperçu et le code changent
        if (live) document.querySelectorAll('[data-kc-panel] [data-kc-row]').forEach(r => { const k = r.dataset.kcRow, p = r.querySelector('.kc-prev path'), h = r.querySelector('.kc-hex'); if (p) p.setAttribute('fill', color(k)); if (h) h.textContent = color(k).toUpperCase(); });
        else document.querySelectorAll('[data-kc-panel]').forEach(drawPanel);
    }
    const personMapShape = k => `<path class="kc-pm-shape" d="${PATHS[shapeOf(k)]}" transform="translate(-16 -16) scale(1.333)"/>`;
    /** la carte d'une fiche (app.js) : les attributs d'un point, d'après les événements du lieu */
    function personMapPoint(events) {
        const k = groupKind(events), c = color(k);
        return {key: k, color: c, text: textOn(c), shape: shapesOn() ? personMapShape(k) : '<rect x="-15" y="-15" width="30" height="30" transform="rotate(45)"/>'};
    }
    /** un changement avec ↶ Annuler */
    function commit(next, message) {
        const before = JSON.parse(JSON.stringify(read())), after = write(next);
        const undo = () => write(before), redo = () => write(after);
        if (A().undoToast) A().undoToast(message, {icon: '🎨', undo, redo}); else A().toast?.(message);
        return after;
    }
    function setColor(k, c, {live = false} = {}) {
        const v = hex(c); if (!v || !KEYS.includes(k)) return;
        const cur = read(); if (cur.colors[k] === v) return;
        const next = {...cur, colors: {...cur.colors, [k]: v}, preset: ''};
        if (live) { write(next, {live: true}); return; }
        commit(next, T('Couleur des « {k} » changée.', {k: kindName(k)}));
    }
    function applyPreset(id) {
        const p = PRESETS.find(x => x[0] === id); if (!p) return;
        const cur = read();
        commit({...cur, colors: {...p[2]}, shapes: p[3] ? true : (cur.preset === 'nb' ? false : cur.shapes), preset: id}, T('Palette « {p} » appliquée à la carte.', {p: T(p[1])}));
    }
    function reset() { commit({}, T('Couleurs de la carte remises comme au départ.')); }
    function setShapes(on) { const cur = read(); commit({...cur, shapes: !!on}, on ? T('Une forme par sorte sur la carte.') : T('Tous les lieux en losange sur la carte.')); }
    function setShape(k, s) { const cur = read(); if (!PATHS[s] || !KEYS.includes(k)) return; commit({...cur, shape: {...cur.shape, [k]: s}}, T('Forme des « {k} » changée.', {k: kindName(k)})); }
    /** la fenêtre de couleur de l'app, ouverte sur un bouton (pastille de la légende) */
    function openPicker(k, anchor) {
        if (!KEYS.includes(k)) return;
        const start = color(k); let last = start;
        if (UI().openColorBox) {
            // les essais se voient tout de suite ; un seul ↶ Annuler quand on valide
            UI().openColorBox(anchor, {get: () => last, set: (v, final) => {
                const c = hex(String(v || '').slice(0, 7)); if (!c) return; last = c;
                if (final) { const cur = read(); write({...cur, colors: {...cur.colors, [k]: start}}, {silent: true}); setColor(k, c); }
                else setColor(k, c, {live: true});
            }});
            return;
        }
        const inp = document.createElement('input'); inp.type = 'color'; inp.value = start; inp.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
        document.body.appendChild(inp); inp.addEventListener('change', () => { setColor(k, inp.value); inp.remove(); }); inp.click();
    }
    function goSettings() {
        const st = A().state; if (!st) return;
        st.maintenanceTab = 'design_maps'; A().persistUiState?.(); A().setModule?.('maintenance');
        const find = (n = 0) => { const el = document.querySelector('[data-kc-panel]'); if (el && el.offsetParent) { el.scrollIntoView({block: 'start', behavior: 'smooth'}); el.classList.add('is-flash'); setTimeout(() => el.classList.remove('is-flash'), 1600); } else if (n < 40) setTimeout(() => find(n + 1), 150); };
        find();
    }

    /* ───── Réglages → Cartes et fonds de carte ───── */
    const HELP = 'Un losange = un lieu ; un rond avec un nombre = plusieurs lieux proches regroupés, de la couleur de la sorte la plus fréquente.';
    function panelHtml() {
        return `<section class="maintenance-panel kc-panel" data-kc-panel aria-labelledby="kc-title"></section>`;
    }
    function drawPanel(box) {
        const c = read(), focus = document.activeElement && box.contains(document.activeElement) ? document.activeElement.dataset : null;
        const presetBtn = ([id, name, cols, shapes, help]) => `<button type="button" class="kc-preset${c.preset === id || (!c.preset && id === 'default' && isDefault({...c, shapes: false})) ? ' is-on' : ''}" data-kc-preset="${id}" title="${esc(T(help))}" aria-pressed="${c.preset === id}">
            <span class="kc-preset-sw" aria-hidden="true">${KEYS.map(k => shapes ? shapeSvg(DEFAULT_SHAPE[k], cols[k], {size: 13, stroke: '#111', sw: 2.4}) : `<i style="background:${cols[k]}"></i>`).join('')}</span><span>${esc(T(name))}</span></button>`;
        const row = ([k, name]) => `<div class="kc-row" data-kc-row="${k}"><span class="kc-prev" aria-hidden="true">${shapeSvg(shapeOf(k), c.colors[k], {size: 20})}</span>
            <span class="kc-name">${esc(T(name))}</span><span class="kc-color" data-kc-color="${k}"></span><small class="muted kc-hex">${esc(c.colors[k].toUpperCase())}${NAMES[c.colors[k]] ? ' · ' + esc(T(NAMES[c.colors[k]])) : ''}</small>
            ${c.shapes ? `<select class="kc-shape-sel" data-kc-shape="${k}" aria-label="${esc(T('Forme des « {k} »', {k: T(name)}))}">${SHAPES.map(([s, l]) => `<option value="${s}"${c.shape[k] === s ? ' selected' : ''}>${esc(T(l))}</option>`).join('')}</select>` : ''}</div>`;
        box.innerHTML = `<h3 id="kc-title">🎨 ${esc(T('Couleurs de la carte'))}</h3>
            <p class="muted">${esc(T('Les couleurs des sortes d’événements sur la Carte : les lieux, les regroupements, la légende, la carte d’une fiche, l’animation, la superposition, l’export et l’impression.'))}</p>
            <p class="muted kc-help">${esc(T(HELP))}</p>
            <div class="kc-presets" role="group" aria-label="${esc(T('Palettes'))}">${PRESETS.map(presetBtn).join('')}</div>
            <div class="kc-rows">${KINDS.map(row).join('')}</div>
            <label class="checkbox-line kc-shapes"><input type="checkbox" data-kc-shapes ${c.shapes ? 'checked' : ''}><span><b>${esc(T('Formes différentes par sorte'))}</b><br><small class="muted">${esc(T('Triangle, carré, croix, étoile… : les sortes se distinguent aussi sans la couleur (impression en noir et blanc, daltonisme).'))}</small></span></label>
            <div class="kc-foot"><button type="button" class="button small secondary" data-kc-reset ${isDefault(c) ? 'disabled' : ''}>↺ ${esc(T('Remettre les couleurs de départ'))}</button></div>`;
        box.querySelectorAll('[data-kc-color]').forEach(slot => {
            const k = slot.dataset.kcColor;
            if (UI().colorField) {
                const cf = UI().colorField({value: c.colors[k], compact: true}); slot.appendChild(cf);
                const btn = cf.querySelector('button'); if (btn) btn.setAttribute('aria-label', T('Couleur des « {k} »', {k: kindName(k)}));
                let start = null;
                cf.input.addEventListener('input', () => { if (start === null) start = read().colors[k]; setColor(k, cf.value, {live: true}); });
                cf.input.addEventListener('change', () => { const v = hex(cf.value); const s = start ?? read().colors[k]; start = null; if (!v) return; const cur = read(); write({...cur, colors: {...cur.colors, [k]: s}}, {silent: true}); setColor(k, v); });
            } else {
                slot.innerHTML = `<input type="color" value="${c.colors[k]}" aria-label="${esc(T('Couleur des « {k} »', {k: kindName(k)}))}">`;
                slot.firstChild.addEventListener('change', e => setColor(k, e.target.value));
            }
        });
        if (focus) { const sel = Object.keys(focus).map(x => `[data-${x.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}="${CSS.escape(focus[x] || '')}"]`).join(''); try { box.querySelector(sel)?.focus(); } catch (_) {} }
    }
    function inject() {
        if (!root.document) return;
        const ed = document.querySelector('.tile-layer-editor'); if (!ed || !ed.parentElement || ed.parentElement.querySelector(':scope > [data-kc-panel]')) return;
        ed.parentElement.insertAdjacentHTML('beforeend', panelHtml());
        drawPanel(ed.parentElement.querySelector(':scope > [data-kc-panel]'));
    }
    if (root.document && root.addEventListener) {
        document.addEventListener('click', e => {
            const t = e.target.closest?.('[data-kc-preset], [data-kc-reset], [data-kc-pick], [data-kc-settings]'); if (!t) return;
            if (t.dataset.kcPreset) applyPreset(t.dataset.kcPreset);
            else if (t.hasAttribute('data-kc-reset')) reset();
            else if (t.dataset.kcPick) { e.preventDefault(); e.stopPropagation(); openPicker(t.dataset.kcPick, t); }
            else if (t.hasAttribute('data-kc-settings')) { e.preventDefault(); goSettings(); }
        });
        document.addEventListener('change', e => {
            if (e.target.matches?.('[data-kc-shapes]')) setShapes(e.target.checked);
            else if (e.target.matches?.('[data-kc-shape]')) setShape(e.target.dataset.kcShape, e.target.value);
        });
        root.addEventListener('storage', e => { if (e.key === KEY) { cache = null; refresh(); } });
        const mo = new MutationObserver(muts => { if (muts.some(m => [...m.addedNodes].some(n => n.nodeType === 1 && (n.matches?.('.tile-layer-editor, [data-lfc-panel]') || n.querySelector?.('.tile-layer-editor'))))) inject(); });
        const start = () => { mo.observe(document.body, {childList: true, subtree: true}); inject(); };
        if (document.body) start(); else document.addEventListener('DOMContentLoaded', start, {once: true});
    }
    return {KEY, EVT, KINDS, KEYS, DEFAULT, DEFAULT_SHAPE, SHAPES, PATHS, PRESETS, NAMES, HELP, luminance, contrast, textOn, clean, read, write, isDefault, color, shapesOn, shapeOf,
        kindOf, groupKind, kindName, shapeSvg, drawShape, personMapPoint, setColor, applyPreset, reset, setShapes, setShape, openPicker, goSettings, inject, refresh,
        _reload: () => { cache = null; return read(); }};
});
