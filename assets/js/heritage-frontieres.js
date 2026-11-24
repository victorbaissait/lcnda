/* LCNDA — 🏛 Les frontières de la France, année par année (1700 → aujourd'hui), pour le Studio d'animation
 * (« Les frontières qui changent ») et la Carte.
 * Dessinées avec les contours livrés avec l'app (départements d'aujourd'hui, provinces belges, cantons suisses et
 * luxembourgeois, régions d'Europe NUTS 2) : c'est une APPROXIMATION, dite comme telle (un département d'aujourd'hui
 * entier, même quand une partie seulement changeait de pays ; les réunions de 1795-1814 par grandes régions d'aujourd'hui).
 * Aucune donnée téléchargée.
 *   window.LCNDA_EXT.frontieres = {PERIODS, EVENTS, frenchAt(y), eventsUpTo(y), ready(), draw(g, year, W, H, o)}
 * Essai : tests/test-frontieres.js */
(function (root) {
    'use strict';
    /* [fond, codes, périodes françaises [de, à (exclu)], nom] ; un fond absent de la liste = jamais français */
    const PERIODS = [
        ['fr-departements', ['2A', '2B'], [[1768, 9999]], 'Corse'],
        ['fr-departements', ['54', '55', '88'], [[1766, 9999]], 'Lorraine (duché)'],
        ['fr-departements', ['57'], [[1766, 1871], [1919, 9999]], 'Moselle'],
        ['fr-departements', ['67', '68'], [[1700, 1871], [1919, 9999]], 'Alsace'],
        ['fr-departements', ['84'], [[1791, 9999]], 'Avignon et Comtat Venaissin'],
        ['fr-departements', ['73', '74'], [[1792, 1815], [1860, 9999]], 'Savoie'],
        ['fr-departements', ['06'], [[1793, 1814], [1860, 9999]], 'Comté de Nice'],
        ['be-provinces', '*', [[1795, 1814]], 'Pays-Bas autrichiens et Liège'],
        ['lu-cantons', '*', [[1795, 1814]], 'Luxembourg'],
        ['ch-cantons', ['CH013'], [[1798, 1814]], 'Genève'],
        ['ch-cantons', ['CH012'], [[1810, 1814]], 'Valais'],
        ['eu-nuts2', ['DEB1', 'DEB2', 'DEB3', 'DEC0', 'DEA2', 'DEA1'], [[1797, 1814]], 'Rive gauche du Rhin'],
        ['eu-nuts2', ['ITC1'], [[1802, 1814]], 'Piémont'],
        ['eu-nuts2', ['ITC3'], [[1805, 1814]], 'Ligurie'],
        ['eu-nuts2', ['ITI1'], [[1808, 1814]], 'Toscane'],
        ['eu-nuts2', ['ITI4'], [[1809, 1814]], 'États pontificaux (Rome)'],
        ['eu-nuts2', ['NL11', 'NL12', 'NL13', 'NL21', 'NL22', 'NL23', 'NL31', 'NL32', 'NL33', 'NL34', 'NL35', 'NL36', 'NL41', 'NL42'], [[1810, 1814]], 'Hollande'],
        ['eu-nuts2', ['DE94', 'DE50', 'DE60', 'DE93'], [[1811, 1814]], 'Côtes de la mer du Nord'],
    ];
    /* les dates qui comptent, pour les légendes de l'animation */
    const EVENTS = [[1766, 'La Lorraine devient française'], [1768, 'La Corse devient française'], [1791, 'Avignon et le Comtat Venaissin réunis à la France'],
        [1792, 'La Savoie réunie à la France'], [1793, 'Le comté de Nice réuni à la France'], [1795, 'La Belgique et le Luxembourg réunis à la France'],
        [1797, 'La rive gauche du Rhin réunie à la France'], [1798, 'Genève réunie à la France'], [1802, 'Le Piémont réuni à la France'], [1805, 'La Ligurie (Gênes) réunie à la France'],
        [1808, 'La Toscane réunie à la France'], [1809, 'Rome réunie à la France'], [1810, 'La Hollande et le Valais réunis à la France'], [1811, 'Les côtes de la mer du Nord réunies à la France'],
        [1814, 'Chute de l’Empire : la France revient à peu près à ses frontières de 1792'], [1815, 'La Savoie redevient sarde'], [1860, 'La Savoie et Nice redeviennent françaises'],
        [1871, 'L’Alsace et la Moselle annexées par l’Allemagne'], [1919, 'L’Alsace et la Moselle redeviennent françaises']];
    const FILES = [...new Set(PERIODS.map(p => p[0]))];
    const inPeriod = (ps, y) => ps.some(([a, b]) => y >= a && y < b);
    /** ce qui est français l'année y : {fond: Set des codes | '*'} ; les départements sans règle le sont toujours */
    function frenchAt(year) {
        const y = Math.floor(Number(year)), out = {'fr-departements': {all: true, not: new Set()}};
        PERIODS.forEach(([f, codes, ps]) => {
            const on = inPeriod(ps, y);
            if (f === 'fr-departements') { if (!on) codes.forEach(c => out[f].not.add(c)); return; }
            if (!on) return; if (!out[f]) out[f] = {all: false, set: new Set()}; if (codes === '*') out[f].all = true; else codes.forEach(c => out[f].set.add(c));
        });
        return out;
    }
    const isFrench = (F, file, code) => { const r = F[file]; if (!r) return false; if (file === 'fr-departements') return !r.not.has(code); return r.all || r.set.has(code); };
    /** les dates passées (jusqu'à y), la plus récente en dernier */
    const eventsUpTo = y => EVENTS.filter(e => e[0] <= y);

    const api = {PERIODS, EVENTS, FILES, frenchAt, isFrench, eventsUpTo};
    if (typeof module === 'object' && module.exports) { module.exports = api; return; }
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const T = (s, v) => (root.LCNDA_I18N ? root.LCNDA_I18N.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    let geo = null;
    /** charge les contours (une fois) : les pays du monde en fond, et les fonds des périodes */
    function ready() {
        if (geo) return geo;
        const C = ext.diagramCartes; if (!C?.load) return Promise.reject(new Error(T('Les fonds de carte ne sont pas chargés.')));
        geo = Promise.all(['monde-50m', ...FILES].map(f => C.load(f).catch(() => null))).then(L => Object.fromEntries(['monde-50m', ...FILES].map((f, i) => [f, L[i]])));
        return geo;
    }
    const VIEWS = {france: [-5.6, 41.2, 10.2, 51.4], europe: [-9.5, 36.5, 19.5, 56.5], napoleon: [-5.6, 40.5, 14.5, 54.6]};
    /** dessine sur un canvas 2d : pays en gris, la France de l'année en couleur, la frontière soulignée ; o = {view, color, sea, land, line, labels} */
    function draw(g, year, W, H, o = {}) {
        const G = o.geo; if (!G) return;
        const [w0, s0, e0, n0] = VIEWS[o.view] || VIEWS.france, my = lat => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * 180 / Math.PI; // en degrés, comme les longitudes
        const sx = W / (e0 - w0), sy = H / (my(n0) - my(s0)), k = Math.min(sx, sy * 1), ox = (W - (e0 - w0) * k) / 2, oy = (H - (my(n0) - my(s0)) * k) / 2;
        const X = lon => ox + (lon - w0) * k, Y = lat => oy + (my(n0) - my(lat)) * k;
        const path = z => { g.beginPath(); z.polys.forEach(pp => pp.forEach(r => { for (let i = 0; i < r.length; i += 2) { const x = X(r[i]), y = Y(r[i + 1]); if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.closePath(); })); };
        const vis = z => !(z.bbox[2] < w0 - 2 || z.bbox[0] > e0 + 2 || z.bbox[3] < s0 - 2 || z.bbox[1] > n0 + 2);
        g.fillStyle = o.sea || '#dfe8ee'; g.fillRect(0, 0, W, H);
        g.lineJoin = 'round';
        (G['monde-50m']?.zones || []).filter(vis).forEach(z => { path(z); g.fillStyle = o.land || '#f1eee6'; g.fill('evenodd'); g.strokeStyle = o.line || '#b9b2a2'; g.lineWidth = 1; g.stroke(); });
        const F = frenchAt(year), col = o.color || '#2a5fa8';
        FILES.forEach(f => (G[f]?.zones || []).filter(z => !z.outre && vis(z) && isFrench(F, f, z.id)).forEach(z => { path(z); g.fillStyle = col; g.globalAlpha = .82; g.fill('evenodd'); g.globalAlpha = 1; g.strokeStyle = col; g.lineWidth = .6; g.stroke(); }));
        if (o.labels !== false) { const e = eventsUpTo(year).at(-1); g.font = `600 ${Math.round(H / 26)}px system-ui, sans-serif`; g.fillStyle = '#1b2733'; g.textBaseline = 'top';
            let yy = H * .03; if (o.year !== false) { g.fillText(String(Math.floor(year)), W * .03, yy); yy += H / 20; }
            if (e && year - e[0] < 6) { g.font = `${Math.round(H / 40)}px system-ui, sans-serif`; g.fillText(T(e[1]), W * .03, yy); }
            g.font = `${Math.round(H / 60)}px system-ui, sans-serif`; g.fillStyle = '#5a6470'; g.textBaseline = 'bottom'; g.fillText(T('Frontières approchées, d’après les limites d’aujourd’hui'), W * .03, H * .98); }
    }
    ext.frontieres = {...api, VIEWS, ready, draw};
})(typeof window !== 'undefined' ? window : null);
