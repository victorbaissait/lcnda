/* LCNDA — 📊 Diagrammes : « ⚙️ Personnaliser », pour TOUS les diagrammes (onglet de l'éditeur, heritage-diagrams.js).
 *  ✏️ Annotations : flèche, texte, zone (rectangle), bande verticale / horizontale, repère de date (« Guerre de 14 ») ;
 *     posées sur le dessin, glissées à la souris, modifiées, supprimées (↶ Annuler) ; gardées dans spec.o.notes (donc dans le
 *     diagramme, l'export SVG / PNG / PDF et l'impression).
 *  🎨 Styles enregistrés : palette (C2), police (E5), fond, épaisseur des traits, coins, taille du texte, quadrillage ;
 *     styles prêts (Sobre, Archive, Couleurs vives, Noir et blanc imprimable, Daltonien) et les miens (💾 Réglages enregistrés,
 *     exporter / importer) ; « à ce diagramme », « à tous », style par défaut (genealogie-diagram-style-default).
 *  ▦ Petits multiples : un petit dessin par série (par sexe, siècle, branche, département, génération avec « Compter dans
 *     ma base »), côte à côte, même échelle.
 *  ▶ Lecture dans le temps : curseur des années, vitesse, boucle, « Réduire les animations » respecté, vidéo (WebM / MP4
 *     comme la vidéo de la visite de la maison : canevas + MediaRecorder) quand le navigateur sait l'enregistrer.
 *  📏 Lignes de repère : moyenne, médiane, objectif, valeur libre ; deuxième axe et échelle logarithmique.
 *
 * Branché sur le dessin commun (heritage-diagrams-render.js) par trois points d'entrée, sans rien changer aux sortes :
 *   R.prepare(spec, sorte, largeur) → {spec, kind} : style par défaut, petits multiples ;
 *   R.overlay(spec, ctx)            → SVG posé par-dessus (repères, annotations, année lue) ; ctx = {W, H, fs, pad, top, axis, time} ;
 *   R.styleCss(o)                   → <style> du dessin (coins, quadrillage).
 * Une sorte (même d'un autre fichier) en profite en rendant, dans le résultat de son render(spec, W, fs) :
 *   axis : {dir: 'y'|'x', x0, y0, w, h, lo, hi, log?, unit?, series: [{name, color, values}], totals?}  → lignes de repère ;
 *   time : {x0, y0, w, h, from, to} ou {…, points: [[année, x], …]}                                 → annotations à une date ;
 * et, dans sa définition : facet: true (accepte une seule série + o.__lo / o.__hi), time: {range(spec) → [de, à], at(spec, année) → spec},
 * ownPlayer: true (elle a déjà sa lecture), axes: {log: true, y2: true} (elle sait dessiner ces options).
 * API : ext.diagramPerso = {pane, afterDraw, mount, timeInfo, frameSpec, refValue, applyStyle, styles, setDefault, …}.
 * Test : tests/test-diagrammes-perso.js.
 */
(() => {
    'use strict';
    const root = typeof window !== 'undefined' ? window : globalThis;
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const R = () => ext.diagramRender;
    const A = () => root.LCNDA_APP;
    const UI = () => root.LCNDA_UI;
    const hasDom = typeof document !== 'undefined' && !!document.createElement && typeof document.querySelectorAll === 'function';
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const clone = v => JSON.parse(JSON.stringify(v ?? null));
    const num = v => { if (typeof v === 'number') return Number.isFinite(v) ? v : NaN; const t = String(v ?? '').replace(/[\s  ]/g, '').replace(',', '.'); return t === '' ? NaN : Number(t); };
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const r2 = v => Math.round(v * 100) / 100;
    const fmt = (n, d = 2) => Number(n || 0).toLocaleString('fr-FR', {maximumFractionDigits: d});
    const col = (c, fb) => R()?.color ? R().color(c, fb) : fb;
    const ls = {get(k, d) { try { const v = JSON.parse(root.localStorage?.getItem(k) || 'null'); return v ?? d; } catch (_) { return d; } }, set(k, v) { try { root.localStorage?.setItem(k, JSON.stringify(v)); } catch (_) {} }};

    /* ═════════ 🎨 Styles ═════════ */
    const STYLE_KEYS = ['colors', 'font', 'bg', 'bgColor', 'fg', 'lineW', 'radius', 'scale', 'grid'];
    const SEPIA = ['#6f4e37', '#a0522d', '#8b6f47', '#556b2f', '#704214', '#987654', '#c19a6b', '#4b3621'];
    const READY = [
        {id: 'sobre', name: 'Sobre', help: 'Gris-bleu calme, traits fins, quadrillage léger.', v: {colors: ['#4e79a7', '#9aa5b1', '#59a14f', '#e0a458', '#7d6b91', '#c9cdd2', '#2f4b7c', '#a3a380'], font: '', bg: '', bgColor: '', fg: '#2b2f36', lineW: 1.6, radius: 2, scale: 1, grid: 'light'}},
        {id: 'archive', name: 'Archive', help: 'Papier ancien, encre brune, police à empattements.', v: {colors: SEPIA, font: 'Georgia', bg: 'custom', bgColor: '#f5ecd8', fg: '#3b2f22', lineW: 2, radius: 0, scale: 1.05, grid: 'light'}},
        {id: 'vives', name: 'Couleurs vives', help: 'Couleurs franches, traits épais, coins arrondis.', v: {colors: ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#42d4f4', '#f032e6', '#bfef45'], font: '', bg: '', bgColor: '', fg: '#111111', lineW: 3, radius: 6, scale: 1.05, grid: ''}},
        {id: 'nb', name: 'Noir et blanc imprimable', help: 'Gris du noir au clair, quadrillage marqué : lisible imprimé sans couleur.', v: {colors: ['#000000', '#5a5a5a', '#9a9a9a', '#cfcfcf', '#2e2e2e', '#7a7a7a', '#b5b5b5', '#1a1a1a'], font: '', bg: '', bgColor: '', fg: '#000000', lineW: 2, radius: 0, scale: 1, grid: 'strong'}},
        {id: 'dalto', name: 'Daltonien', help: 'Couleurs qu’on distingue même en voyant mal certaines couleurs (Okabe-Ito).', v: {colors: ['#0072B2', '#E69F00', '#009E73', '#CC79A7', '#56B4E9', '#D55E00', '#F0E442', '#000000'], font: '', bg: '', bgColor: '', fg: '#1d1d1f', lineW: 2.5, radius: 3, scale: 1, grid: ''}},
    ];
    const MINE_KEY = 'genealogie-diagram-styles', DEF_KEY = 'genealogie-diagram-style-default', OPEN_KEY = 'genealogie-diagram-perso-open';
    /** un style propre : seulement les clés connues, des valeurs bornées (rien qui puisse sortir d'un attribut) */
    function cleanStyle(v) {
        const s = v && typeof v === 'object' ? v : {}, out = {};
        if (Array.isArray(s.colors)) { const c = s.colors.map(x => col(x, '')).filter(x => /^#[0-9a-f]{3,8}$/i.test(x)).slice(0, 16); if (c.length) out.colors = c; }
        if (typeof s.font === 'string') out.font = s.font.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 60);
        if (['', 'transparent', 'custom'].includes(s.bg)) out.bg = s.bg;
        if (/^#[0-9a-f]{6}$/i.test(s.bgColor || '')) out.bgColor = s.bgColor;
        if (/^#[0-9a-f]{6}$/i.test(s.fg || '')) out.fg = s.fg;
        if (Number.isFinite(num(s.lineW))) out.lineW = clamp(num(s.lineW), .5, 12);
        if (Number.isFinite(num(s.radius))) out.radius = clamp(num(s.radius), 0, 24);
        if (Number.isFinite(num(s.scale))) out.scale = clamp(num(s.scale), .5, 3);
        if (['', 'light', 'strong', 'none'].includes(s.grid)) out.grid = s.grid;
        return out;
    }
    const mine = () => { const l = ls.get(MINE_KEY, []); return Array.isArray(l) ? l.filter(x => x && typeof x.name === 'string').slice(0, 60).map(x => ({name: x.name.slice(0, 60), date: x.date || '', v: cleanStyle(x.v)})) : []; };
    const putMine = l => ls.set(MINE_KEY, l.slice(0, 60));
    /** tous les styles : prêts puis les miens → [{id, name, v, ready}] */
    const styles = () => [...READY.map(x => ({...x, ready: true})), ...mine().map(x => ({id: 'mine:' + x.name, name: x.name, v: x.v, date: x.date}))];
    const styleById = id => styles().find(x => x.id === id) || null;
    let defStyle = null; // le style par défaut (appliqué aux diagrammes sans style à eux)
    const loadDefault = () => { const d = ls.get(DEF_KEY, null); defStyle = d && typeof d === 'object' && d.v ? {id: String(d.id || ''), name: String(d.name || 'Mon style').slice(0, 60), v: cleanStyle(d.v)} : null; };
    function setDefault(st) { defStyle = st ? {id: st.id || '', name: st.name || 'Mon style', v: cleanStyle(st.v)} : null; if (hasDom) ls.set(DEF_KEY, defStyle); }
    /** les valeurs d'un style posées sur un diagramme (o.style = son nom ; « Comme avant » = 'none') */
    function applyStyle(spec, st) {
        spec.o = spec.o || {};
        STYLE_KEYS.forEach(k => { delete spec.o[k]; });
        if (!st) { spec.o.style = 'none'; return spec; }
        Object.assign(spec.o, clone(cleanStyle(st.v))); spec.o.style = st.id || st.name || 'mine'; delete spec.o.palette;
        return spec;
    }
    const ownStyle = o => STYLE_KEYS.reduce((m, k) => { if (o?.[k] !== undefined && o[k] !== '') m[k] = o[k]; return m; }, {});
    /** <style> du dessin : coins, quadrillage (les traits des courbes : o.lineW, lu par le dessin) */
    function styleCss(o, scope = 'dgs') {
        let css = ''; const S = '.' + String(scope).replace(/[^a-z0-9_-]/gi, '') + ' '; // toujours limité au dessin (un SVG posé dans la page ne touche pas le reste)
        const rad = num(o?.radius);
        if (o?.radius !== undefined && o.radius !== '' && Number.isFinite(rad)) css += `${S}rect:not(.dg-bg):not(.dgp-keep){rx:${r2(clamp(rad, 0, 24))}px;ry:${r2(clamp(rad, 0, 24))}px}`;
        const G = ['.dg-grid', 'line[stroke-opacity=".12"]', 'line[stroke-opacity=".15"]', 'line[stroke-opacity=".1"]'].map(x => S + x).join(',');
        if (o?.grid === 'none') css += `${G}{display:none}`;
        else if (o?.grid === 'strong') css += `${G}{stroke-opacity:.38}`;
        else if (o?.grid === 'light') css += `${G}{stroke-opacity:.07}`;
        return css;
    }

    /* ═════════ ▦ Petits multiples ═════════ */
    const FACET_KINDS = new Set(['columns', 'bars', 'line', 'area', 'stacked', 'radar']);
    const tableish = k => { const g = R()?.KINDS?.[k]?.grids?.[0]; return !!g && g.key === 'rows' && g.series === true; };
    const canFacet = k => (FACET_KINDS.has(k) || R()?.KINDS?.[k]?.facet === true) && tableish(k);
    const seriesOf = spec => (Array.isArray(spec.series) ? spec.series : []).slice(0, 24);
    const rowsOf = spec => (Array.isArray(spec.rows) ? spec.rows : []).filter(r => r && typeof r === 'object');
    /** un dessin posé dans un autre : un groupe déplacé (pas un <svg> imbriqué, que les feuilles de style de la page étireraient) */
    function nest(inner, x, y) {
        const m = inner.match(/^<svg\b([^>]*)>([\s\S]*)<\/svg>$/); if (!m) return '';
        const cls = m[1].match(/\sclass="([^"]*)"/)?.[1] || '', ff = m[1].match(/\sfont-family="([^"]*)"/)?.[1] || '', fg = m[1].match(/\scolor="([^"]*)"/)?.[1] || '';
        return `<g transform="translate(${r2(x)} ${r2(y)})"${cls ? ` class="${cls}"` : ''}${ff ? ` font-family="${ff}"` : ''}${fg ? ` color="${fg}"` : ''}>${m[2].replace(/<desc>[\s\S]*?<\/desc>/, '')}</g>`;
    }
    function facetKind(base, spec) {
        return {...base, noLegend: true, legend: 'none', render: (sp, W, fs) => {
            const o = sp.o || {}, ser = seriesOf(sp), n = ser.length, rows = rowsOf(sp), pal = R().PALETTES[o.palette] || R().PALETTES.vive;
            const own = Array.isArray(o.colors) && o.colors.length ? o.colors : pal;
            const vals = rows.filter(r => r.__off !== true).flatMap(r => ser.map((_, j) => num(r['s' + j]))).filter(Number.isFinite);
            const fixed = Number.isFinite(o.__lo) && Number.isFinite(o.__hi) && o.__hi > o.__lo; // ▶ lecture : l'échelle de tout le diagramme
            const lo = fixed ? o.__lo : Math.min(0, ...vals), hi = fixed ? o.__hi : Math.max(0, ...vals, lo + 1);
            const want = clamp(Math.round(num(o.facetCols)) || 0, 0, 6);
            const cols = want || (W < 520 ? 1 : clamp(Math.min(n, Math.ceil(Math.sqrt(n)), Math.floor(W / 260)), 1, 6));
            const gap = fs * 1.2, pw = (W - gap * (cols - 1)) / cols;
            let svg = '', y = 0, rowH = 0;
            ser.forEach((s, j) => {
                const c = j % cols; if (c === 0 && j) { y += rowH + gap; rowH = 0; }
                const sc = col(s?.color, own[j % own.length]);
                const sub = {kind: sp.kind, series: [{name: String(s?.name || `Série ${j + 1}`), color: sc}], rows: rows.map(r => ({label: r.label, s0: r['s' + j], color: sc, ...(r.__off === true ? {__off: true} : {})})),
                    o: {...o, title: '', subtitle: '', source: '', legend: 'none', bg: 'transparent', facet: '', notes: [], __year: undefined, __lo: lo, __hi: hi, width: pw, height: num(o.height) > 0 ? num(o.height) * .6 : Math.max(110, pw * .5), values: n > 4 ? false : o.values, ...(sp.kind === 'radar' ? {max: hi} : {})}};
                const inner = R().svg(sub, pw), m = inner.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/), h = Number(m?.[2]) || 120, x = c * (pw + gap);
                svg += `<g class="dgp-facet" data-facet="${j}"><text x="${r2(x + pw / 2)}" y="${r2(y + fs)}" font-size="${r2(fs * 1.05)}" font-weight="700" text-anchor="middle" fill="${sc}">${esc(String(s?.name || `Série ${j + 1}`).slice(0, 80))}</text>`
                    + nest(inner, x, y + fs * 1.6) + '</g>';
                rowH = Math.max(rowH, h + fs * 1.6);
            });
            return {h: y + rowH, svg, legend: [], desc: `${n} petits diagrammes, même échelle (de ${fmt(lo)} à ${fmt(hi)})`};
        }};
    }
    /** le dessin commun appelle prepare avant d'assembler : style par défaut, petits multiples */
    function prepare(s, kind) {
        if (!s.o.style && defStyle) { const v = defStyle.v; STYLE_KEYS.forEach(k => { if ((s.o[k] === undefined || s.o[k] === '') && v[k] !== undefined) s.o[k] = v[k]; }); if (v.colors && !s.o.colors) delete s.o.palette; }
        if (s.o.facet && canFacet(s.kind) && seriesOf(s).length >= 2) return {spec: s, kind: facetKind(kind, s)};
        return null;
    }

    /* ═════════ 📏 Lignes de repère ═════════ */
    const REF_KINDS = [['mean', 'Moyenne', '#e15759', '6 4'], ['median', 'Médiane', '#f28e2b', '2 3'], ['goal', 'Objectif', '#2e8b57', ''], ['value', 'Valeur', '#555555', '4 4']];
    let lastAx = null; // le dernier axe dessiné (pour proposer une valeur d'objectif plausible)
    const AXIS_KINDS = new Set(['columns', 'bars', 'stacked', 'line', 'area']);
    const hasAxis = k => AXIS_KINDS.has(k) || !!R()?.KINDS?.[k]?.axes;
    const canAxes = (k, what) => ['columns', 'line', 'area'].includes(k) || (what === 'log' && k === 'bars') || !!R()?.KINDS?.[k]?.axes?.[what];
    const median = a => { const b = a.filter(Number.isFinite).sort((x, y) => x - y), n = b.length; return n ? (n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2) : NaN; };
    const mean = a => { const b = a.filter(Number.isFinite); return b.length ? b.reduce((x, y) => x + y, 0) / b.length : NaN; };
    /** la valeur d'une ligne de repère, lue sur l'axe du dessin (les catégories pas encore « lues » ne comptent pas) */
    function refValue(ref, axis) {
        if (ref.t === 'goal' || ref.t === 'value') return num(ref.v);
        const ser = axis?.series || [], j = ref.series === '' || ref.series === undefined || ref.series === null ? -1 : Number(ref.series);
        const vals = axis?.totals && j < 0 ? axis.totals : j >= 0 && ser[j] ? ser[j].values : ser.filter(s => !s.right).flatMap(s => s.values); // « toutes » : sans la série du deuxième axe
        return ref.t === 'median' ? median(vals) : mean(vals);
    }
    const posOn = (axis, v) => axis.log ? (Math.log10(Math.max(v, axis.lo)) - Math.log10(axis.lo)) / (Math.log10(axis.hi) - Math.log10(axis.lo) || 1) : (v - axis.lo) / (axis.hi - axis.lo || 1);
    function refsSvg(spec, ctx) {
        const a = ctx.axis, refs = Array.isArray(spec.o?.refs) ? spec.o.refs.slice(0, 20) : []; if (a) lastAx = a; if (!a || !refs.length) return '';
        let out = '';
        refs.forEach((r, i) => {
            if (!r || typeof r !== 'object') return;
            const K = REF_KINDS.find(k => k[0] === r.t) || REF_KINDS[3], v = refValue(r, a); if (!Number.isFinite(v) || v < a.lo || v > a.hi) return;
            const c = col(r.color, K[2]), p = posOn(a, v), unit = a.unit ? ' ' + a.unit : '', fs = ctx.fs, sw = clamp(num(spec.o?.lineW) || 2, 1, 6) * .8;
            const lab = `${String(r.label || '').trim() || K[1]} : ${fmt(v)}${unit}`;
            const halo = ` stroke="${esc(spec.o?.bg === 'custom' ? col(spec.o.bgColor, '#ffffff') : '#ffffff')}" stroke-width="3" paint-order="stroke"`;
            if (a.dir === 'x') { const x = a.x0 + p * a.w;
                out += `<g class="dg-ref" data-dgr="${i}"><line x1="${r2(x)}" y1="${r2(a.y0)}" x2="${r2(x)}" y2="${r2(a.y0 + a.h)}" stroke="${c}" stroke-width="${r2(sw)}"${K[3] ? ` stroke-dasharray="${K[3]}"` : ''}/><text x="${r2(x + 4)}" y="${r2(a.y0 + fs * .9)}" font-size="${r2(fs * .85)}" font-weight="700" fill="${c}"${halo}>${esc(lab.slice(0, 80))}</text></g>`; }
            else { const y = a.y0 + a.h - p * a.h;
                out += `<g class="dg-ref" data-dgr="${i}"><line x1="${r2(a.x0)}" y1="${r2(y)}" x2="${r2(a.x0 + a.w)}" y2="${r2(y)}" stroke="${c}" stroke-width="${r2(sw)}"${K[3] ? ` stroke-dasharray="${K[3]}"` : ''}/><text x="${r2(a.x0 + a.w - 4)}" y="${r2(y - fs * .5)}" font-size="${r2(fs * .85)}" font-weight="700" text-anchor="end" fill="${c}"${halo}>${esc(lab.slice(0, 80))}</text></g>`; }
        });
        return out;
    }

    /* ═════════ ✏️ Annotations ═════════ */
    const NOTE_KINDS = [['arrow', '➚', 'Flèche'], ['text', 'T', 'Texte'], ['rect', '▭', 'Zone'], ['vband', '▥', 'Bande verticale'], ['hband', '▤', 'Bande horizontale'], ['date', '📅', 'Repère de date']];
    const NOTE_COLOR = {arrow: '#d62728', text: '#1d1d1f', rect: '#f2c94c', vband: '#4e79a7', hband: '#59a14f', date: '#b03a2e'};
    const f01 = (v, d) => { const n = num(v); return Number.isFinite(n) ? clamp(n, -.2, 1.2) : d; };
    /** l'abscisse d'une année sur l'axe des dates du dessin (null si pas d'axe des dates) */
    function xOfYear(time, y) {
        if (!time || !Number.isFinite(y)) return null;
        if (Array.isArray(time.points) && time.points.length >= 2) {
            const P = time.points; if (y <= P[0][0]) { const [a, b] = P; return a[1] + (y - a[0]) * (b[1] - a[1]) / ((b[0] - a[0]) || 1); }
            for (let i = 1; i < P.length; i++) if (y <= P[i][0]) { const a = P[i - 1], b = P[i]; return a[1] + (y - a[0]) * (b[1] - a[1]) / ((b[0] - a[0]) || 1); }
            const a = P[P.length - 2], b = P[P.length - 1]; return b[1] + (y - b[0]) * (b[1] - a[1]) / ((b[0] - a[0]) || 1);
        }
        if (Number.isFinite(time.from) && Number.isFinite(time.to) && time.to > time.from) return time.x0 + (y - time.from) / (time.to - time.from) * time.w;
        return null;
    }
    const yearOf = v => { const w = R()?.when ? R().when(v, false) : num(v); return Number.isFinite(w) ? w : null; };
    function notesSvg(spec, ctx) {
        const notes = Array.isArray(spec.o?.notes) ? spec.o.notes.slice(0, 60) : []; if (!notes.length) return '';
        const {W, H, fs} = ctx, box = ctx.axis || ctx.time || {x0: ctx.pad, y0: ctx.top, w: W - 2 * ctx.pad, h: H - ctx.top - ctx.pad};
        const bgc = spec.o?.bg === 'custom' ? col(spec.o.bgColor, '#ffffff') : '#ffffff';
        const label = (x, y, t, c, anchor = 'start', size = 1) => t ? `<text x="${r2(x)}" y="${r2(y)}" font-size="${r2(fs * size)}" font-weight="700" text-anchor="${anchor}" fill="${c}" stroke="${esc(bgc)}" stroke-width="3" paint-order="stroke">${esc(String(t).slice(0, 120))}</text>` : '';
        // les poignées : invisibles à l'export, montrées dans l'éditeur (diagrams.css)
        const hd = (x, y, k) => `<circle class="dgn-h" data-dgn-h="${k}" cx="${r2(x)}" cy="${r2(y)}" r="6" fill="transparent"/>`;
        let out = '';
        notes.forEach((n, i) => {
            if (!n || typeof n !== 'object') return;
            const t = NOTE_KINDS.some(k => k[0] === n.t) ? n.t : 'text', c = col(n.color, NOTE_COLOR[t]), op = clamp(Number.isFinite(num(n.opacity)) ? num(n.opacity) : 20, 5, 90) / 100;
            let g = '';
            if (t === 'text') { const x = f01(n.x, .5) * W, y = f01(n.y, .2) * H, sz = clamp(num(n.size) || 1.1, .6, 3); g = label(x, y, n.text || 'Texte', c, n.anchor === 'middle' ? 'middle' : 'start', sz) + hd(x, y, 'a'); }
            else if (t === 'arrow') {
                const x1 = f01(n.x1, .3) * W, y1 = f01(n.y1, .25) * H, x2 = f01(n.x2, .5) * W, y2 = f01(n.y2, .45) * H, L = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / L, uy = (y2 - y1) / L, hs = fs * .9, sw = clamp(num(spec.o?.lineW) || 2, 1, 6);
                g = `<line x1="${r2(x1)}" y1="${r2(y1)}" x2="${r2(x2 - ux * hs * .8)}" y2="${r2(y2 - uy * hs * .8)}" stroke="${c}" stroke-width="${r2(sw)}" stroke-linecap="round"/><path d="M${r2(x2)} ${r2(y2)}L${r2(x2 - ux * hs - uy * hs * .55)} ${r2(y2 - uy * hs + ux * hs * .55)}L${r2(x2 - ux * hs + uy * hs * .55)} ${r2(y2 - uy * hs - ux * hs * .55)}Z" fill="${c}"/>`
                    + label(x1 - ux * 4, y1 - uy * 4 - (uy > 0 ? fs * .3 : -fs * .9), n.text, c, ux > .3 ? 'end' : ux < -.3 ? 'start' : 'middle') + hd(x1, y1, 'a') + hd(x2, y2, 'b');
            } else if (t === 'rect') {
                const xa = f01(n.x1, .3) * W, ya = f01(n.y1, .3) * H, xb = f01(n.x2, .55) * W, yb = f01(n.y2, .6) * H, x = Math.min(xa, xb), y = Math.min(ya, yb), w = Math.abs(xb - xa), h = Math.abs(yb - ya);
                g = `<rect class="dgp-keep" x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" rx="4" fill="${c}" fill-opacity="${op}" stroke="${c}" stroke-width="1.5"/>` + label(x + 6, y + fs * 1.1, n.text, c) + hd(xa, ya, 'a') + hd(xb, yb, 'b');
            } else if (t === 'vband' || (t === 'date' && n.to)) {
                let xa, xb;
                if (t === 'date') { xa = xOfYear(ctx.time, yearOf(n.date)); xb = xOfYear(ctx.time, yearOf(n.to)); }
                if (xa === null || xb === null || xa === undefined) { xa = f01(n.x1, .4) * W; xb = f01(n.x2, .5) * W; }
                const x = Math.min(xa, xb), w = Math.max(1, Math.abs(xb - xa));
                g = `<rect class="dgp-keep" x="${r2(x)}" y="${r2(box.y0)}" width="${r2(w)}" height="${r2(box.h)}" fill="${c}" fill-opacity="${op}"/>` + label(x + w / 2, box.y0 + fs * 1.1, n.text, c, 'middle') + (t === 'vband' ? hd(xa, box.y0 + box.h / 2, 'a') + hd(xb, box.y0 + box.h / 2, 'b') : '');
            } else if (t === 'hband') {
                const ya = f01(n.y1, .3) * H, yb = f01(n.y2, .45) * H, y = Math.min(ya, yb), h = Math.max(1, Math.abs(yb - ya));
                g = `<rect class="dgp-keep" x="${r2(box.x0)}" y="${r2(y)}" width="${r2(box.w)}" height="${r2(h)}" fill="${c}" fill-opacity="${op}"/>` + label(box.x0 + 6, y + fs * 1.1, n.text, c) + hd(box.x0 + box.w / 2, ya, 'a') + hd(box.x0 + box.w / 2, yb, 'b');
            } else if (t === 'date') {
                let x = xOfYear(ctx.time, yearOf(n.date)); const free = x === null; if (free) x = f01(n.x, .5) * W;
                g = `<line x1="${r2(x)}" y1="${r2(box.y0)}" x2="${r2(x)}" y2="${r2(box.y0 + box.h)}" stroke="${c}" stroke-width="2" stroke-dasharray="5 3"/>` + label(x + 4, box.y0 + fs * 1.1, n.text || String(n.date || ''), c) + (free ? hd(x, box.y0 + box.h / 2, 'a') : '');
            }
            if (g) out += `<g class="dg-note" data-dgn="${i}" data-dgn-t="${t}">${g}</g>`;
        });
        return out;
    }
    /** ce qui se pose sur le dessin : lignes de repère, annotations, l'année en cours de lecture */
    function overlay(spec, ctx) {
        let out = refsSvg(spec, ctx) + notesSvg(spec, ctx);
        const y = spec.o?.__year;
        if (Number.isFinite(y)) out += `<text class="dgp-year" x="${r2(ctx.W - ctx.pad)}" y="${r2(ctx.top + ctx.fs * 2.6)}" font-size="${r2(ctx.fs * 2.6)}" font-weight="800" text-anchor="end" fill="currentColor" fill-opacity=".35">${esc(String(Math.round(y)))}</text>`;
        return out;
    }

    /* ═════════ ▶ Lecture dans le temps ═════════ */
    const OWN_PLAYER = new Set(['alivepyr', 'storymap']);
    const START = ['date', 'start', 'from', 'year', 'birth', 'debut', 'begin', 'when', 'at'], END = ['end', 'to', 'death', 'fin', 'until'];
    const yearLike = s => /^\s*-?\d{3,4}(?!\d)/.test(String(s ?? ''));
    const CART = new Set(['columns', 'bars', 'stacked', 'stacked100', 'line', 'area']);
    /** la lecture possible pour ce diagramme : {years, from, to, at(année) → spec} ; null si ses données n'ont pas de dates */
    function timeInfo(spec) {
        const K = R()?.KINDS?.[spec?.kind]; if (!K || OWN_PLAYER.has(spec.kind) || K.ownPlayer) return null;
        if (typeof K.time?.range === 'function' && typeof K.time?.at === 'function') {
            try { const [a, b] = K.time.range(spec) || []; if (Number.isFinite(a) && Number.isFinite(b) && b > a) return {from: a, to: b, years: steps(a, b, spec), at: y => K.time.at(clone(spec), y)}; } catch (_) {}
            return null;
        }
        const rows = rowsOf(spec);
        // des catégories qui sont des années (« 1700 », « 1710 »…) : elles apparaissent une à une, l'échelle ne bouge pas
        if (tableish(spec.kind) && rows.length >= 3 && rows.every(r => yearLike(r.label))) {
            const ys = rows.map(r => yearOf(r.label)); if (ys.some(v => v === null)) return null;
            const ser = seriesOf(spec).length || 1, stacked = ['stacked'].includes(spec.kind);
            const vals = rows.flatMap(r => stacked ? [Array.from({length: ser}, (_, j) => Math.max(0, num(r['s' + j]) || 0)).reduce((a, b) => a + b, 0)] : Array.from({length: ser}, (_, j) => num(r['s' + j]))).filter(Number.isFinite);
            const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
            const years = [...new Set(ys)].sort((a, b) => a - b);
            return {from: years[0], to: years[years.length - 1], years, at: y => { const s = clone(spec); s.o = {...(s.o || {})};
                if (CART.has(s.kind) || R().KINDS[s.kind]?.facet) { s.rows = rowsOf(s).map(r => (yearOf(r.label) > y + 1e-9 ? {...r, __off: true} : r)); if (hi > lo && !s.o.log) { s.o.__lo = lo; s.o.__hi = hi; } if (s.kind === 'radar') s.o.max = s.o.max || hi; }
                else s.rows = rowsOf(s).filter(r => yearOf(r.label) <= y + 1e-9);
                s.o.__year = y; return s; }};
        }
        // des lignes avec des dates (frise, membres d'un groupe, planning…) : on garde ce qui a commencé, la fin s'arrête à l'année lue
        const grids = (K.grids || []).map(g => ({g, sk: (g.cols || []).map(c => c.k).find(k => START.includes(k)), ek: (g.cols || []).map(c => c.k).find(k => END.includes(k))})).filter(x => x.sk);
        if (!grids.length) return null;
        const all = [];
        grids.forEach(({g, sk, ek}) => rowsOf({rows: spec[g.key]}).forEach(r => { const a = yearOf(r[sk]); if (a !== null) all.push(a); if (ek && String(r[ek] ?? '').trim()) { const b = yearOf(r[ek]); if (b !== null) all.push(b); } }));
        if (all.length < 2) return null;
        let from = Math.floor(Math.min(...all)), to = Math.ceil(Math.max(...all)); if (to <= from) return null;
        const hasEnd = grids.some(x => x.ek), nowY = new Date().getFullYear();
        if (hasEnd && grids.some(({g, ek}) => ek && rowsOf({rows: spec[g.key]}).some(r => !String(r[ek] ?? '').trim()))) to = Math.max(to, Math.min(nowY, to + 50));
        const kindOpts = (K.options || []).map(o => o.k);
        return {from, to, years: steps(from, to, spec), at: y => { const s = clone(spec); s.o = {...(s.o || {})};
            grids.forEach(({g, sk, ek}) => { s[g.key] = rowsOf({rows: s[g.key]}).filter(r => { const a = yearOf(r[sk]); return a === null ? g.key !== 'rows' : a <= y + 1e-9; }).map(r => {
                if (!ek) return r; const raw = String(r[ek] ?? '').trim(), b = raw ? yearOf(raw) : null; return b === null || b > y ? {...r, [ek]: String(Math.floor(y))} : r; }); });
            if (kindOpts.includes('from') && kindOpts.includes('to') && !String(s.o.from || '').trim() && !String(s.o.to || '').trim()) { s.o.from = String(from); s.o.to = String(to); }
            s.o.__t0 = from; s.o.__t1 = to; s.o.__year = y; return s; }};
    }
    function steps(a, b, spec) {
        const want = num(spec?.o?.time?.step), span = b - a;
        const st = want > 0 ? want : [1, 2, 5, 10, 20, 25, 50, 100].find(x => span / x <= 80) || 100;
        const out = []; for (let y = Math.ceil(a / st) * st; y <= b + 1e-9 && out.length < 600; y += st) out.push(+y.toFixed(6));
        if (!out.length || out[0] > a) out.unshift(a); if (out[out.length - 1] < b) out.push(b);
        return out;
    }
    const frameSpec = (spec, y) => { const t = timeInfo(spec); return t ? t.at(y) : spec; };
    const calm = () => hasDom && (document.documentElement.classList.contains('a11y-calm') || document.documentElement.classList.contains('a11y-reduce-motion') || !!root.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    const SPEEDS = [['slow', '🐢 Lente', 1100], ['', 'Normale', 450], ['fast', '🐇 Rapide', 160]];
    /** le curseur ▶ des années, sous un dessin (box = l'élément qui contient le <svg>) */
    function player(box, spec, {onStop = null} = {}) {
        const T = timeInfo(spec); if (!T || T.years.length < 2) return null;
        const host = box.parentElement; host.querySelector(':scope > .h-dgp-play')?.remove();
        const o = spec.o || {}, tm = o.time || {};
        let i = T.years.length - 1, timer = 0, speed = SPEEDS.find(s => s[0] === (tm.speed || ''))?.[2] || 450, loop = !!tm.loop;
        const bar = document.createElement('div'); bar.className = 'h-dgp-play'; bar.dataset.dgpPlay = '1';
        const canVideo = typeof MediaRecorder !== 'undefined' && !!document.createElement('canvas').captureStream;
        bar.innerHTML = `<button type="button" class="icon-button small" data-dgp-p title="Lire les années" aria-label="Lire les années">▶</button>
            <input type="range" min="0" max="${T.years.length - 1}" step="1" value="${i}" aria-label="Année" data-ui-done="1"><output>${esc(fmt(T.years[i], 0))}</output>
            <select data-dgp-speed aria-label="Vitesse">${SPEEDS.map(([k, l]) => `<option value="${k}" ${k === (tm.speed || '') ? 'selected' : ''}>${l}</option>`).join('')}</select>
            <label class="ui-toggle h-dgp-loop"><input type="checkbox" data-dgp-loop ${loop ? 'checked' : ''}><i></i>Boucle</label>
            <button type="button" class="link-button" data-dgp-all title="Revenir au dessin complet">⤢ Tout</button>${canVideo ? '<button type="button" class="link-button" data-dgp-video title="Enregistrer la lecture en vidéo">🎬 Vidéo</button>' : ''}${calm() ? '<small class="muted" title="Réglages → Accessibilité → Mouvement">Mouvements réduits : une étape à la fois, sans glisser</small>' : ''}`;
        box.after(bar);
        const range = bar.querySelector('input[type=range]'), out = bar.querySelector('output'), pb = bar.querySelector('[data-dgp-p]');
        const show = k => { i = clamp(k, 0, T.years.length - 1); range.value = String(i); out.textContent = fmt(T.years[i], 0); box.innerHTML = R().svg(T.at(T.years[i])); };
        const stop = () => { if (timer) clearInterval(timer); timer = 0; pb.textContent = '▶'; pb.setAttribute('aria-label', 'Lire les années'); };
        const tick = () => { if (!box.isConnected || !bar.isConnected) return stop(); if (i >= T.years.length - 1) { if (loop) return show(0); stop(); onStop?.(); return; } show(i + 1); };
        const start = () => { if (i >= T.years.length - 1) show(0); pb.textContent = '⏸'; pb.setAttribute('aria-label', 'Mettre en pause'); timer = setInterval(tick, calm() ? Math.max(speed, 1200) : speed); };
        pb.addEventListener('click', () => (timer ? stop() : start()));
        range.addEventListener('input', () => { stop(); show(Number(range.value)); });
        bar.querySelector('[data-dgp-speed]').addEventListener('change', e => { speed = SPEEDS.find(s => s[0] === e.target.value)?.[2] || 450; if (timer) { stop(); start(); } });
        bar.querySelector('[data-dgp-loop]').addEventListener('change', e => { loop = e.target.checked; });
        bar.querySelector('[data-dgp-all]').addEventListener('click', () => { stop(); i = T.years.length - 1; range.value = String(i); out.textContent = fmt(T.years[i], 0); box.innerHTML = R().svg(spec); onStop?.(); });
        bar.querySelector('[data-dgp-video]')?.addEventListener('click', e => recordVideo(spec, T, speed, e.currentTarget));
        bar._stop = stop; bar._show = show;
        return bar;
    }
    /** 🎬 le moteur vidéo des dessins : chaque image (un <svg> en texte) peinte sur un canevas, enregistrée par le navigateur
     *  (canevas + MediaRecorder, comme la vidéo de la visite de la maison). frames : [svg] ou [{svg, ms}] ; per : durée d'une image (ms).
     *  → {blob, ext ('mp4' | 'webm'), mime}. Sert aussi à 🗺 la Carte de la vie (heritage-carte-vie.js). */
    async function recordSvgs(frames, {per = 450, hold = 900, maxW = 1600, onProgress = null, bg = '#ffffff'} = {}) {
        if (typeof MediaRecorder === 'undefined') throw new Error('ce navigateur ne sait pas enregistrer de vidéo');
        const list = (frames || []).map(f => (typeof f === 'string' ? {svg: f} : f)).filter(f => f && f.svg); if (!list.length) throw new Error('rien à filmer');
        const m = list[0].svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/), w0 = Number(m?.[1]) || 900, h0 = Number(m?.[2]) || 600, k = Math.min(2, maxW / w0);
        const cv = document.createElement('canvas'); cv.width = Math.round(w0 * k / 2) * 2; cv.height = Math.round(h0 * k / 2) * 2; const g = cv.getContext('2d');
        const mime = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(x => MediaRecorder.isTypeSupported?.(x)) || '';
        const rec = new MediaRecorder(cv.captureStream(30), mime ? {mimeType: mime, videoBitsPerSecond: 5e6} : {}), chunks = [];
        rec.ondataavailable = e => { if (e.data?.size) chunks.push(e.data); };
        const done = new Promise(res => { rec.onstop = res; });
        const paint = svg => new Promise(res => { const img = new Image(); img.onload = () => { g.fillStyle = bg; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height); res(); }; img.onerror = () => res(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
        await paint(list[0].svg); rec.start();
        for (let j = 0; j < list.length; j++) { onProgress?.(j / list.length); await paint(list[j].svg); await new Promise(r => setTimeout(r, Math.max(60, list[j].ms || per))); }
        await new Promise(r => setTimeout(r, hold)); rec.stop(); await done; onProgress?.(1);
        const blob = new Blob(chunks, {type: (mime || 'video/webm').split(';')[0]});
        return {blob, ext: /mp4/.test(blob.type) ? 'mp4' : 'webm', mime: blob.type};
    }
    /** 🎬 la lecture en vidéo : chaque année dessinée sur un canevas, enregistrée par le navigateur (comme la vidéo de la visite de la maison) */
    async function recordVideo(spec, T, speed, btn) {
        const toast = (m, k) => A()?.toast?.(m, k);
        if (typeof MediaRecorder === 'undefined') return toast('Ce navigateur ne sait pas enregistrer de vidéo.', 'error');
        btn.disabled = true; const old = btn.textContent;
        try {
            const {blob, ext: ext2} = await recordSvgs(T.years.map(y => R().svg(T.at(y))), {per: Math.max(120, speed), onProgress: k => { btn.textContent = `🔴 ${Math.round(k * 100)} %`; }});
            const name = (A()?.safeExportFilename ? A().safeExportFilename(spec.o?.title || 'diagramme', 'diagramme') : 'diagramme') + '-annees.' + ext2;
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
            toast(`✓ Vidéo exportée (${ext2.toUpperCase()}).`);
        } catch (e) { toast('Vidéo impossible : ' + (e.message || e), 'error'); }
        finally { btn.disabled = false; btn.textContent = old; }
    }
    /** un diagramme posé (page Graphiques, fiche, tableau de bord) : le curseur des années s'il est demandé */
    function mount(box, spec) { if (!hasDom || !box || !spec?.o?.time?.show) return; player(box, spec); }

    /* ═════════ ⚙️ Le panneau « Personnaliser » de l'éditeur ═════════ */
    const openSecs = () => { const v = ls.get(OPEN_KEY, null); return v && typeof v === 'object' ? v : {style: 1}; };
    const sec = (id, title, body, help = '') => `<details class="h-dgp-sec" data-dgp-sec="${id}"${openSecs()[id] ? ' open' : ''}><summary>${title}</summary><div class="h-dgp-body">${help ? `<p class="ui-hint">${help}</p>` : ''}${body}</div></details>`;
    const sel = (attr, choices, v) => `<select ${attr}>${choices.map(([k, l]) => `<option value="${esc(k)}" ${String(v ?? '') === String(k) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    const swatches = c => `<span class="h-dgp-sw">${(c || []).slice(0, 8).map(x => `<i style="background:${esc(col(x, '#888'))}"></i>`).join('')}</span>`;
    function styleSec(spec) {
        const o = spec.o || {}, cur = o.style || (defStyle ? 'default' : ''), pal = Array.isArray(o.colors) && o.colors.length ? o.colors : (defStyle?.v?.colors && !o.style ? defStyle.v.colors : (R().PALETTES[o.palette] || R().PALETTES.vive).slice(0, 8));
        const all = styles();
        const cards = all.map(s => `<button type="button" class="h-dgp-card${cur === s.id ? ' is-active' : ''}" data-dgp-style="${esc(s.id)}" title="${esc(s.help || 'Mon style')}">${swatches(s.v.colors)}<b${s.v.font ? ` style="font-family:'${esc(s.v.font)}'"` : ''}>${esc(s.name)}</b>${defStyle && defStyle.id === s.id ? '<small>⭐ par défaut</small>' : ''}</button>`).join('');
        const v = k => o[k] ?? (!o.style && defStyle ? defStyle.v[k] : undefined);
        return `<div class="h-dgp-cards">${cards}<button type="button" class="h-dgp-card${cur === 'none' ? ' is-active' : ''}" data-dgp-style="none" title="Les couleurs et réglages du type, comme avant"><span class="h-dgp-sw"></span><b>Comme avant</b></button></div>
            <div class="h-dgp-grid">
                <div class="h-dgp-row"><span>Palette</span><span class="h-dgp-pal">${pal.map((c, j) => `<span class="h-dgp-pc"><input type="color" value="${esc(/^#[0-9a-f]{6}$/i.test(c) ? c : '#888888')}" data-dgp-pc="${j}" aria-label="Couleur ${j + 1}"><button type="button" class="h-dg-x" data-dgp-pcdel="${j}" aria-label="Retirer cette couleur" title="Retirer">×</button></span>`).join('')}<button type="button" class="link-button" data-dgp-pcadd>＋ Couleur</button></span></div>
                <div class="h-dgp-row"><span>Police</span><button type="button" class="button small secondary" data-dgp-font style="font-family:${v('font') ? `'${esc(v('font'))}', ` : ''}inherit">Aa ${esc(v('font') || 'Police de l’app')}</button>${o.font ? '<button type="button" class="link-button" data-dgp-fontreset>↺ Police de l’app</button>' : ''}</div>
                <label class="h-dgp-row"><span>Fond</span>${sel('data-dgp-k="bg"', [['', 'Blanc'], ['transparent', 'Transparent'], ['custom', 'Couleur…']], v('bg'))}${v('bg') === 'custom' ? `<input type="color" data-dgp-k="bgColor" value="${esc(/^#[0-9a-f]{6}$/i.test(v('bgColor') || '') ? v('bgColor') : '#fdf8ee')}" aria-label="Couleur du fond">` : ''}</label>
                <label class="h-dgp-row"><span>Couleur des textes</span><input type="color" data-dgp-k="fg" value="${esc(/^#[0-9a-f]{6}$/i.test(v('fg') || '') ? v('fg') : '#1d1d1f')}"></label>
                <label class="h-dgp-row"><span>Épaisseur des traits</span><input type="range" min="0.5" max="8" step="0.5" value="${esc(v('lineW') ?? 2.5)}" data-dgp-k="lineW" data-unit="px"></label>
                <label class="h-dgp-row"><span>Coins arrondis</span><input type="range" min="0" max="16" step="1" value="${esc(v('radius') ?? 2)}" data-dgp-k="radius" data-unit="px"></label>
                <label class="h-dgp-row"><span>Taille du texte</span><input type="range" min="0.6" max="2.5" step="0.1" value="${esc(v('scale') ?? 1)}" data-dgp-k="scale" data-unit="×"></label>
                <label class="h-dgp-row"><span>Quadrillage</span>${sel('data-dgp-k="grid"', [['', 'Selon le type'], ['light', 'Léger'], ['strong', 'Marqué'], ['none', 'Aucun']], v('grid'))}</label>
            </div>
            <div class="h-dgp-acts"><button type="button" class="button small secondary" data-dgp-all title="Tous mes diagrammes prennent ce style (même ceux qui avaient le leur)">Appliquer à tous les diagrammes</button><button type="button" class="button small secondary" data-dgp-def title="Les nouveaux diagrammes, et ceux sans style à eux, le prennent">⭐ Style par défaut</button>${defStyle ? '<button type="button" class="link-button" data-dgp-nodef>Plus de style par défaut</button>' : ''}</div>
            <div data-dgp-presets></div>`;
    }
    function notesSec(spec) {
        const notes = Array.isArray(spec.o?.notes) ? spec.o.notes : [];
        const row = (n, i) => { const K = NOTE_KINDS.find(k => k[0] === n.t) || NOTE_KINDS[1];
            return `<li class="h-dgp-note" data-i="${i}"><span class="h-dgp-ic" aria-hidden="true">${K[1]}</span><input data-dgp-n="text" value="${esc(n.text || '')}" placeholder="${esc(K[2])}" maxlength="120" aria-label="Texte de l’annotation">
                ${n.t === 'date' ? `<input data-dgp-n="date" value="${esc(n.date || '')}" placeholder="1914" maxlength="20" aria-label="Date" class="h-dgp-date"><input data-dgp-n="to" value="${esc(n.to || '')}" placeholder="à (facultatif)" maxlength="20" aria-label="Jusqu’à" class="h-dgp-date">` : ''}
                <input type="color" data-dgp-n="color" value="${esc(/^#[0-9a-f]{6}$/i.test(n.color || '') ? n.color : NOTE_COLOR[n.t] || '#1d1d1f')}" aria-label="Couleur">
                <button type="button" class="icon-button small" data-dgp-ndel="${i}" aria-label="Retirer l’annotation" title="Retirer">×</button></li>`; };
        return `<div class="h-dgp-adds">${NOTE_KINDS.map(([t, ic, l]) => `<button type="button" class="button small secondary" data-dgp-add="${t}">＋ ${ic} ${esc(l)}</button>`).join('')}</div>
            ${notes.length ? `<ul class="h-dgp-notes">${notes.map(row).join('')}</ul>` : `<div class="empty-line"><span class="empty-line-ico">✏️</span><span class="empty-line-text">Aucune annotation : ajoute une flèche, un texte, une zone ou un repère de date.</span></div>`}`;
    }
    function refsSec(spec) {
        const o = spec.o || {}, refs = Array.isArray(o.refs) ? o.refs : [], ser = seriesOf(spec), k = spec.kind;
        const row = (r, i) => { const K = REF_KINDS.find(x => x[0] === r.t) || REF_KINDS[0], calc = r.t === 'mean' || r.t === 'median';
            return `<li class="h-dgp-note" data-i="${i}">${sel('data-dgp-r="t"', REF_KINDS.map(x => [x[0], x[1]]), r.t)}
                ${calc ? (ser.length > 1 ? sel('data-dgp-r="series"', [['', 'Toutes les séries'], ...ser.map((s, j) => [String(j), s?.name || `Série ${j + 1}`])], r.series ?? '') : '') : `<input data-dgp-r="v" value="${esc(r.v ?? '')}" inputmode="decimal" placeholder="Valeur" aria-label="Valeur" class="h-dgp-date">`}
                <input data-dgp-r="label" value="${esc(r.label || '')}" placeholder="${esc(K[1])}" maxlength="60" aria-label="Nom de la ligne">
                <input type="color" data-dgp-r="color" value="${esc(/^#[0-9a-f]{6}$/i.test(r.color || '') ? r.color : K[2])}" aria-label="Couleur">
                <button type="button" class="icon-button small" data-dgp-rdel="${i}" aria-label="Retirer la ligne" title="Retirer">×</button></li>`; };
        return `<div class="h-dgp-adds">${REF_KINDS.map(([t, l]) => `<button type="button" class="button small secondary" data-dgp-radd="${t}">＋ ${esc(l)}</button>`).join('')}</div>
            ${refs.length ? `<ul class="h-dgp-notes">${refs.map(row).join('')}</ul>` : ''}
            <div class="h-dgp-grid">${canAxes(k, 'log') ? `<label class="ui-toggle"><input type="checkbox" data-dgp-o="log" ${o.log ? 'checked' : ''}><i></i>Échelle logarithmique (très grands écarts)</label>` : ''}
            ${canAxes(k, 'y2') && ser.length > 1 ? `<label class="h-dgp-row"><span>Deuxième axe (à droite)</span>${sel('data-dgp-o="y2"', [['', 'Aucun'], ...ser.map((s, j) => [String(j), `${s?.name || `Série ${j + 1}`} (en courbe)`])], o.y2 ?? '')}</label>` : ''}</div>`;
    }
    const FACETS = [['series', 'Les séries du tableau'], ['sex', 'Le sexe'], ['century', 'Le siècle'], ['branch', 'La branche (côté père / côté mère)'], ['county', 'Le lieu (département)'], ['country', 'Le lieu (pays)'], ['generation', 'La génération']];
    function facetSec(spec) {
        const o = spec.o || {}, q = spec.live?.q, n = seriesOf(spec).length, by = q?.series && o.facet ? q.series : o.facet ? 'series' : '';
        const choices = [['', 'Un seul diagramme'], ...(n >= 2 ? [FACETS[0]] : []), ...(q ? FACETS.slice(1) : [])];
        return `<label class="h-dgp-row"><span>Répéter le diagramme par</span>${sel('data-dgp-facet', choices, by)}</label>
            ${o.facet ? `<label class="h-dgp-row"><span>Par ligne</span>${sel('data-dgp-o="facetCols"', [['', 'Automatique'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4']], o.facetCols ?? '')}</label>` : ''}
            ${!q ? `<p class="ui-hint">Pour répéter par sexe, siècle, branche, lieu ou génération : prends tes chiffres avec « 🧮 Compter dans ma base » (onglet « Depuis l’app ») et coche « Tenir à jour ».</p>` : ''}`;
    }
    function timeSec(spec) {
        const T = timeInfo(spec), tm = spec.o?.time || {};
        return `<p class="ui-hint">Les données vont de ${esc(fmt(T.from, 0))} à ${esc(fmt(T.to, 0))} : le curseur ▶ sous l’aperçu les fait apparaître année après année.</p>
            <label class="ui-toggle"><input type="checkbox" data-dgp-t="show" ${tm.show ? 'checked' : ''}><i></i>Montrer aussi le curseur ▶ là où le diagramme est posé (Graphiques, fiches, tableau de bord)</label>
            <label class="h-dgp-row"><span>Vitesse</span>${sel('data-dgp-t="speed"', SPEEDS.map(([k, l]) => [k, l]), tm.speed || '')}</label>
            <label class="ui-toggle"><input type="checkbox" data-dgp-t="loop" ${tm.loop ? 'checked' : ''}><i></i>Recommencer au début (boucle)</label>
            <label class="h-dgp-row"><span>Un pas de</span><input type="number" min="0" max="500" step="1" value="${esc(tm.step ?? '')}" placeholder="auto" data-dgp-t="step" data-unit="ans"></label>
            ${calm() ? '<p class="ui-hint">« Réduire les animations » est demandé : la lecture avance d’une étape par seconde, sans glisser.</p>' : ''}`;
    }
    /** le panneau dans l'onglet « ⚙️ Personnaliser » ; api = {spec(), set(patch), changed()} (heritage-diagrams.js) */
    function pane(el, api) {
        const spec = () => api.spec();
        el._dgpAbort?.abort(); const ac = new AbortController(), sig = {signal: ac.signal}; el._dgpAbort = ac; // un seul jeu d'écouteurs, même si l'onglet est rouvert
        const paint = () => {
            const s = spec(), k = s.kind, T = timeInfo(s), y = el.scrollTop;
            el.innerHTML = `<div class="h-dgp" data-dgp>${sec('style', '🎨 Style', styleSec(s), 'Palette, police, fond, traits, coins, taille du texte, quadrillage : choisis un style prêt, retouche-le, garde-le sous un nom.')}
                ${sec('notes', '✏️ Annotations', notesSec(s), 'Pose-les ici, puis glisse-les sur l’aperçu (et leurs poignées pour les agrandir). Elles partent avec le diagramme à l’export et à l’impression.')}
                ${hasAxis(k) ? sec('refs', '📏 Lignes de repère et axes', refsSec(s), 'Moyenne et médiane se calculent seules ; l’objectif et la valeur sont à toi.') : ''}
                ${canFacet(k) ? sec('facet', '▦ Petits multiples', facetSec(s), 'Un petit diagramme par groupe, côte à côte, avec la même échelle pour comparer d’un coup d’œil.') : ''}
                ${T ? sec('time', '▶ Lecture dans le temps', timeSec(s)) : ''}</div>`;
            el.scrollTop = y;
            const slot = el.querySelector('[data-dgp-presets]'); if (slot && UI()?.presetsFrame) slot.appendChild(presetsFrame(() => spec(), changed));
        };
        const changed = (repaint = true) => { api.changed(); if (repaint) paint(); };
        api.repaintPerso = () => { if (el.isConnected && el.querySelector('[data-dgp]')) paint(); };
        const o = () => { const s = spec(); s.o = s.o || {}; return s.o; };
        const ownColors = () => { const oo = o(); if (!Array.isArray(oo.colors) || !oo.colors.length) oo.colors = (defStyle?.v?.colors && !oo.style ? defStyle.v.colors : (R().PALETTES[oo.palette] || R().PALETTES.vive).slice(0, 8)).slice(); return oo.colors; };
        const mineStyle = () => { const oo = o(); if (!oo.style || oo.style === 'none' || oo.style === 'default') { const base = !oo.style && defStyle ? defStyle.v : {}; STYLE_KEYS.forEach(k => { if (oo[k] === undefined && base[k] !== undefined) oo[k] = clone(base[k]); }); oo.style = 'custom'; } else if (!String(oo.style).endsWith('*') && oo.style !== 'custom') oo.style = String(oo.style) + '*'; };
        el.addEventListener('toggle', e => { const d = e.target.closest?.('[data-dgp-sec]'); if (!d) return; const v = openSecs(); if (d.open) v[d.dataset.dgpSec] = 1; else delete v[d.dataset.dgpSec]; ls.set(OPEN_KEY, v); }, {capture: true, signal: ac.signal});
        el.addEventListener('input', e => {
            const t = e.target;
            if (t.dataset.dgpK) { mineStyle(); const k = t.dataset.dgpK; o()[k] = t.type === 'range' ? Number(t.value) : t.value; return changed(t.tagName === 'SELECT'); }
            if (t.dataset.dgpPc !== undefined) { mineStyle(); const c = ownColors(); c[Number(t.dataset.dgpPc)] = t.value; delete o().palette; return changed(false); }
            const li = t.closest('[data-i]'), i = Number(li?.dataset.i);
            if (t.dataset.dgpN) { const n = o().notes?.[i]; if (!n) return; n[t.dataset.dgpN] = t.value.slice(0, t.dataset.dgpN === 'text' ? 120 : 20); return changed(false); }
            if (t.dataset.dgpR) { const r = o().refs?.[i]; if (!r) return; r[t.dataset.dgpR] = t.value; return changed(t.tagName === 'SELECT' && t.dataset.dgpR === 't'); }
            if (t.dataset.dgpO) { const k = t.dataset.dgpO; if (t.type === 'checkbox') o()[k] = t.checked; else if (t.value === '') delete o()[k]; else o()[k] = t.value; return changed(t.type === 'checkbox' || t.tagName === 'SELECT'); }
            if (t.dataset.dgpT) { const tm = o().time = {...(o().time || {})}, k = t.dataset.dgpT; if (t.type === 'checkbox') tm[k] = t.checked; else if (t.value === '') delete tm[k]; else tm[k] = k === 'step' ? clamp(Number(t.value) || 0, 0, 500) : t.value; return changed(false); }
        }, sig);
        el.addEventListener('change', async e => {
            const t = e.target; if (t.dataset.dgpFacet === undefined) return;
            const v = t.value, s = spec();
            if (!v) { delete o().facet; return changed(); }
            if (v === 'series') { o().facet = 'series'; return changed(); }
            const DGO = ext.diagramAppOpts, q = s.live?.q; if (!DGO || !q) return;
            t.disabled = true;
            try { const nq = {...q, series: v}, res = await DGO.count(nq); if (!res?.rows?.length) throw new Error('Aucun chiffre pour ce découpage.');
                const ns = DGO.toSpec(s, res, s.live.label); ['rows', 'series'].forEach(k => { s[k] = ns[k]; }); s.live = {...s.live, q: nq}; o().facet = 'series';
                A()?.toast?.(`${seriesOf(s).length} petits diagrammes, même échelle.`); changed(); }
            catch (err) { A()?.toast?.(err.message || String(err), 'error'); t.disabled = false; }
        }, sig);
        el.addEventListener('click', async e => {
            const b = e.target.closest('button'); if (!b || !el.contains(b) || b.closest('[data-dgp-presets]')) return;
            const toast = (m, k) => A()?.toast?.(m, k);
            if (b.dataset.dgpStyle !== undefined) { const id = b.dataset.dgpStyle; applyStyle(spec(), id === 'none' ? null : styleById(id)); return changed(); }
            if (b.hasAttribute('data-dgp-pcadd')) { mineStyle(); const c = ownColors(); if (c.length < 16) c.push(['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948'][c.length % 6]); delete o().palette; return changed(); }
            if (b.dataset.dgpPcdel !== undefined) { mineStyle(); const c = ownColors(); if (c.length > 1) c.splice(Number(b.dataset.dgpPcdel), 1); return changed(); }
            if (b.hasAttribute('data-dgp-font')) { const f = await UI()?.openFontPicker?.({value: o().font || '', sample: o().title || 'Baptêmes et sépultures', title: 'Police du diagramme'}); if (f) { mineStyle(); o().font = String(f).replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 60); changed(); } return; }
            if (b.hasAttribute('data-dgp-fontreset')) { delete o().font; return changed(); }
            if (b.hasAttribute('data-dgp-def')) { const st = currentStyle(spec()); setDefault(st); toast(`⭐ « ${st.name} » : style par défaut des nouveaux diagrammes et de ceux sans style à eux.`); return changed(); }
            if (b.hasAttribute('data-dgp-nodef')) { const before = defStyle; setDefault(null); A()?.undoToast ? A().undoToast('Plus de style par défaut', {undo: () => { setDefault(before); changed(); }, redo: () => { setDefault(null); changed(); }}) : null; return changed(); }
            if (b.hasAttribute('data-dgp-all')) return applyToAll(currentStyle(spec()), changed);
            if (b.dataset.dgpAdd) { const oo = o(); oo.notes = Array.isArray(oo.notes) ? oo.notes : []; if (oo.notes.length >= 60) return toast('60 annotations au plus.', 'error');
                const t = b.dataset.dgpAdd, k = oo.notes.length % 5 * .05, T = timeInfo(spec());
                const n = {t, color: NOTE_COLOR[t], text: t === 'date' ? (T && T.from <= 1914 && T.to >= 1914 ? 'Guerre de 14' : 'Mon repère') : t === 'text' ? 'Mon texte' : '',
                    ...(t === 'text' ? {x: .45 + k, y: .2 + k} : t === 'arrow' ? {x1: .3 + k, y1: .2 + k, x2: .5 + k, y2: .45 + k} : t === 'rect' ? {x1: .3 + k, y1: .3, x2: .55 + k, y2: .6} : t === 'vband' ? {x1: .4 + k, x2: .5 + k} : t === 'hband' ? {y1: .35 + k, y2: .45 + k} : {date: T && T.from <= 1914 && T.to >= 1914 ? '1914' : String(Math.round(T ? (T.from + T.to) / 2 : 1914)), to: T && T.from <= 1918 && T.to >= 1918 ? '1918' : '', x: .5})};
                oo.notes.push(n); const s = el.querySelector('[data-dgp-sec="notes"]'); if (s) s.open = true; changed(); el.querySelector(`.h-dgp-note[data-i="${oo.notes.length - 1}"] input`)?.focus(); return; }
            if (b.dataset.dgpNdel !== undefined) return removeNote(api, Number(b.dataset.dgpNdel), changed);
            if (b.dataset.dgpRadd) { const oo = o(); oo.refs = Array.isArray(oo.refs) ? oo.refs : []; if (oo.refs.length >= 20) return; const t = b.dataset.dgpRadd;
                const ax = lastAx, guess = ax ? +((ax.lo + ax.hi) * .6).toPrecision(2) : 0;
                oo.refs.push({t, ...(t === 'goal' || t === 'value' ? {v: guess} : {})}); return changed(); }
            if (b.dataset.dgpRdel !== undefined) { const oo = o(), i = Number(b.dataset.dgpRdel), was = oo.refs[i]; oo.refs.splice(i, 1); changed();
                A()?.undoToast?.('Ligne de repère retirée', {undo: () => { oo.refs.splice(i, 0, was); changed(); }, redo: () => { oo.refs.splice(i, 1); changed(); }}); }
        }, sig);
        paint();
        return {paint};
    }
    function removeNote(api, i, changed) {
        const oo = api.spec().o || {}, was = oo.notes?.[i]; if (!was) return;
        oo.notes.splice(i, 1); changed();
        A()?.undoToast?.('Annotation retirée', {undo: () => { oo.notes.splice(Math.min(i, oo.notes.length), 0, was); changed(); }, redo: () => { const j = oo.notes.indexOf(was); if (j >= 0) oo.notes.splice(j, 1); changed(); }});
    }
    /** le style tel qu'il est sur ce diagramme (prêt, à moi, ou retouché) */
    function currentStyle(s) {
        const o = s.o || {}, id = String(o.style || '').replace(/\*$/, ''), base = styleById(id);
        const v = cleanStyle({...(!o.style && defStyle ? defStyle.v : {}), ...ownStyle(o)});
        return {id: base && !String(o.style).endsWith('*') ? base.id : 'custom', name: base ? base.name + (String(o.style).endsWith('*') ? ' (retouché)' : '') : 'Mon style', v};
    }
    /** « Appliquer à tous » : chaque diagramme enregistré prend ce style (↶ Annuler remet le style d'avant de chacun) */
    async function applyToAll(st, changed) {
        const api = (...a) => A().api(...a), post = (action, body) => api(action, {}, {method: 'POST', body});
        let list = []; try { list = await ext.diagramList(true); } catch (e) { return A()?.toast?.(e.message, 'error'); }
        const mineList = list.filter(d => !d.spec?.live?.follow), before = mineList.map(d => ({id: d.id, name: d.name, kind: d.kind, spec: clone(d.spec || {})}));
        const write = async rows => { for (const d of rows) await post('save_diagram', {id: d.id, name: d.name, kind: d.kind, spec: d.spec}); await ext.diagramList(true); document.querySelectorAll('[data-dg-embed]').forEach(x => { delete x.dataset.dgDone; }); };
        const after = before.map(d => ({...d, spec: applyStyle(clone(d.spec), st)}));
        try { await write(after); setDefault(st); changed(); }
        catch (e) { return A()?.toast?.(e.message, 'error'); }
        A()?.undoToast?.(`Style « ${st.name} » appliqué à ${mineList.length} diagramme${mineList.length > 1 ? 's' : ''}`, {undo: async () => { await write(before); changed(); }, redo: async () => { await write(after); changed(); }});
    }
    /** 💾 Réglages enregistrés : mes styles (enregistrer, appliquer à ce diagramme, renommer, dupliquer, exporter, importer, supprimer) */
    function presetsFrame(spec, changed) {
        const U = UI(), today = () => new Date().toISOString();
        const frame = U.presetsFrame({id: 'diagram-styles', title: 'Mes styles enregistrés', what: 'ce style (palette, police, fond, traits, coins, taille du texte, quadrillage)', defaultName: () => currentStyle(spec()).name.replace(/ \(retouché\)$/, '') + ' 2',
            list: () => mine().map(x => ({name: x.name, date: x.date})), quietApply: true,
            apply: i => { const x = mine()[i]; if (!x) return false; applyStyle(spec(), {id: 'mine:' + x.name, name: x.name, v: x.v}); changed(); A()?.toast?.(`Style « ${x.name} » appliqué à ce diagramme.`); return false; },
            save: name => { const l = mine(), it = {name, date: today(), v: currentStyle(spec()).v}, i = l.findIndex(x => x.name === name); if (i >= 0) l[i] = it; else l.push(it); putMine(l); spec().o.style = 'mine:' + name; changed(); },
            replace: i => { const l = mine(); if (!l[i]) return false; l[i] = {...l[i], date: today(), v: currentStyle(spec()).v}; putMine(l); },
            rename: (i, name) => { const l = mine(); if (!l[i]) return false; l[i].name = name; putMine(l); changed(); },
            duplicate: i => { const l = mine(), x = l[i]; if (!x) return false; l.splice(i + 1, 0, {name: U.freeName ? U.freeName(x.name, l.map(y => y.name)) : x.name + ' (copie)', date: today(), v: x.v}); putMine(l); changed(); },
            exportOne: i => { const x = mine()[i]; if (x) A()?.exportSettingFile?.('diagram-style', x.name, {v: x.v}); return false; },
            remove: i => { const l = mine(), x = l[i]; if (!x) return false; if (A()?.undoLocalChange) A().undoLocalChange(`Style « ${x.name} » supprimé`, [MINE_KEY], () => { l.splice(i, 1); putMine(l); }, () => changed()); else { l.splice(i, 1); putMine(l); } changed(); },
            importOne: async () => { const got = await A()?.importSettingFile?.('diagram-style', {names: mine().map(x => x.name), check: d => d && typeof d.v === 'object'}); if (!got) return false; const l = mine(); l.push({name: String(got.nom).slice(0, 60), date: today(), v: cleanStyle(got.donnees.v)}); putMine(l); changed(); A()?.toast?.(`Style « ${got.nom} » importé.`); }});
        return frame;
    }

    /* ─── Sur l'aperçu de l'éditeur : glisser les annotations, double-clic pour le texte, Suppr pour retirer ─── */
    function afterDraw(prev, shown, api) {
        if (!hasDom || !prev) return;
        const svg = prev.querySelector('svg'); if (!svg) return;
        const vb = svg.viewBox?.baseVal, W = vb?.width || 900, H = vb?.height || 600;
        const toUser = ev => { const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY; const m = svg.getScreenCTM(); if (!m) return {x: 0, y: 0}; const q = p.matrixTransform(m.inverse()); return {x: q.x, y: q.y}; };
        svg.querySelectorAll('.dg-note').forEach(g => { g.setAttribute('tabindex', '0'); g.setAttribute('role', 'button'); g.setAttribute('aria-label', 'Annotation : glisser pour la déplacer, Suppr pour la retirer'); });
        svg.addEventListener('pointerdown', ev => {
            const g = ev.target.closest?.('.dg-note'); if (!g) return;
            const i = Number(g.dataset.dgn), n = api.spec().o?.notes?.[i]; if (!n) return;
            ev.preventDefault(); g.focus?.({preventScroll: true}); svg.setPointerCapture?.(ev.pointerId);
            const h = ev.target.closest('[data-dgn-h]')?.dataset.dgnH || '', p0 = toUser(ev), start = clone(n);
            svg.querySelectorAll('.dg-note.is-sel').forEach(x => x.classList.remove('is-sel')); g.classList.add('is-sel');
            const move = e2 => { const p = toUser(e2), dx = (p.x - p0.x) / W, dy = (p.y - p0.y) / H, q = v => r2(clamp(v, -.1, 1.1) * 1000) / 1000;
                const mv = (kx, ky) => { if (kx in start) n[kx] = q(num(start[kx]) + dx); if (ky in start) n[ky] = q(num(start[ky]) + dy); };
                if (h === 'a') mv(start.x1 !== undefined || start.t === 'vband' ? 'x1' : 'x', start.y1 !== undefined || start.t === 'hband' ? 'y1' : 'y');
                else if (h === 'b') mv('x2', 'y2');
                else { mv('x', 'y'); mv('x1', 'y1'); mv('x2', 'y2'); }
                if (h) { const c = ev.target.closest('[data-dgn-h]'); c?.setAttribute('cx', r2(p.x)); c?.setAttribute('cy', r2(p.y)); c?.classList.add('is-drag'); }
                else g.setAttribute('transform', `translate(${r2(p.x - p0.x)} ${r2(p.y - p0.y)})`); };
            const up = () => { svg.removeEventListener('pointermove', move); svg.removeEventListener('pointerup', up); svg.removeEventListener('pointercancel', up); api.changed(); };
            svg.addEventListener('pointermove', move); svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
        });
        svg.addEventListener('dblclick', async ev => {
            const g = ev.target.closest?.('.dg-note'); if (!g) return; const n = api.spec().o?.notes?.[Number(g.dataset.dgn)]; if (!n) return;
            let t = null; try { t = await A()?.askText?.({title: 'Modifier l’annotation', message: 'Texte de l’annotation', value: n.text || '', okLabel: 'Enregistrer'}); } catch (_) {} if (t == null || t === false) return;
            n.text = String(t).slice(0, 120); api.changed(); api.repaintPerso?.();
        });
        svg.addEventListener('keydown', ev => {
            const g = ev.target.closest?.('.dg-note'); if (!g || !['Delete', 'Backspace'].includes(ev.key)) return; ev.preventDefault();
            removeNote(api, Number(g.dataset.dgn), () => { api.changed(); api.repaintPerso?.(); });
        });
        // le curseur ▶ des années, sous l'aperçu (les annotations se voient aussi pendant la lecture)
        const shownSpec = shown || api.spec();
        if (timeInfo(shownSpec)) player(prev, shownSpec, {onStop: () => api.redraw?.()});
        else prev.parentElement?.querySelector(':scope > .h-dgp-play')?.remove();
    }

    /* ─── branchement ─── */
    function hook() { const r = R(); if (!r || r.__perso) return !!r; r.__perso = true; r.prepare = prepare; r.overlay = overlay; r.styleCss = styleCss; return true; }
    if (hasDom) loadDefault();
    if (!hook() && hasDom) document.addEventListener('DOMContentLoaded', hook);
    ext.diagramPerso = {pane, afterDraw, mount, player, recordSvgs, timeInfo, frameSpec, refValue, median, mean, applyStyle, currentStyle, styles, READY, STYLE_KEYS, cleanStyle, setDefault, getDefault: () => defStyle,
        canFacet, hasAxis, xOfYear, NOTE_KINDS, REF_KINDS, styleCss, overlay, prepare, hook};
})();
