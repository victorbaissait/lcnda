/* LCNDA — 📊 Diagrammes, lot A (ajoutés au catalogue de heritage-diagrams-render.js) :
 *  - 🛡 Tableau de quartiers : les 8, 16 ou 32 ancêtres d'une génération et leurs armoiries (blason de la fiche Armoiries,
 *    ou un écu aux couleurs du blasonnement, ou un écu vide) ; nom, n° Sosa, blasonnement en note ; fond sobre ou parchemin ;
 *  - 🌿 Arbre des variantes d'un nom : chaque forme sur l'axe des années, reliée à celle d'où elle vient (à la main, ou devinée
 *    par la date et la ressemblance), l'épaisseur selon le nombre d'actes.
 * Et ce qui s'ajoute aux types déjà là, sans en faire de nouveaux :
 *  - 🔗 Chemin de parenté → « 🔁 Boucles d'implexe » : tous les chemins entre les deux parents d'une personne et le coefficient
 *    de consanguinité (Wright, calcul de app-diagram-plus-core.js : inbreeding) ;
 *  - 🎸 Frise des membres et 📅 Frise chronologique → « Montrer l'incertitude des dates » (« vers », « avant », « entre … et … ») ;
 *  - criteria : le bloc « groupe de personnes, période, ＋ Critère » commun (heritage-diagram-options.js) pour les panneaux
 *    « Depuis l'app » du lot (réseau « toute la famille », Venn, pyramide d'un recensement, variantes d'un nom).
 * Chaque sorte : {icon, label, group, render(spec, W, fs) → {h, svg, legend, desc}, grids, options, sample, fromApp}.
 * Données de l'arbre : api.php?action=diagram_lot_a (lib/diagram_lot_a.php). Tout texte passe par esc() ; couleurs par R.color ;
 * nombres et tailles bornés. Les données prises « Depuis l'app » restent dans le tableau : on les corrige à la main.
 */
(() => {
    'use strict';
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? String(v[k]) : m)));
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const R = ext.diagramRender; if (!R?.KINDS) return;
    const K = R.KINDS, A = () => window.LCNDA_APP;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const num = v => { const n = typeof v === 'number' ? v : R.num ? R.num(v) : Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
    const color = (c, d) => R.color(c, d);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, Number.isFinite(v) ? v : a));
    const r2 = v => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;
    const NF = [0, 1, 2, 3].map(d => new Intl.NumberFormat('fr-FR', {maximumFractionDigits: d})), fmt = (n, d = 1) => NF[clamp(d, 0, 3)].format(Number(n) || 0);
    const pal = spec => R.PALETTES?.[spec.o?.palette] || R.PALETTES?.vive || ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac'];
    const pick = (spec, i, c) => { const p = pal(spec); return color(c, p[((i % p.length) + p.length) % p.length]); };
    const textW = (s, fs) => [...String(s ?? '')].reduce((w, ch) => w + (/[ilI.,:;'!|]/.test(ch) ? .28 : /[mwMW@]/.test(ch) ? .85 : /[A-Z]/.test(ch) ? .66 : /\s/.test(ch) ? .3 : .55), 0) * fs;
    const cut = (s, max, fs) => { s = String(s ?? ''); if (textW(s, fs) <= max) return s; while (s.length > 1 && textW(s + '…', fs) > max) s = s.slice(0, -1); return s.length > 1 ? s + '…' : ''; };
    const T = (x, y, s, {size = 12, anchor = 'start', weight = 400, fill = 'currentColor', baseline = 'middle', op = 0, style = ''} = {}) =>
        `<text x="${r2(x)}" y="${r2(y)}" font-size="${r2(size)}" text-anchor="${anchor}" dominant-baseline="${baseline}" font-weight="${weight}" fill="${esc(fill)}"${op ? ` fill-opacity="${op}"` : ''}${style ? ` font-style="${style}"` : ''}>${esc(s)}</text>`;
    const tip = s => `<title>${esc(s)}</title>`;
    const rgb = c => { const m = String(c).match(/^#([0-9a-f]{6})$/i); return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) : null; };
    const mix = (c1, c2, t) => { const a = rgb(c1), b = rgb(c2); if (!a || !b) return c1; return '#' + a.map((v, i) => clamp(Math.round(v + (b[i] - v) * t), 0, 255).toString(16).padStart(2, '0')).join(''); };
    const contrast = c => { const a = rgb(c); if (!a) return '#1d1d1f'; return (a[0] * 299 + a[1] * 587 + a[2] * 114) / 1000 > 150 ? '#1d1d1f' : '#ffffff'; };
    const rowsOf = (spec, key = 'rows', max = 2000) => (Array.isArray(spec[key]) ? spec[key] : []).filter(r => r && typeof r === 'object' && !Array.isArray(r)).slice(0, max);
    const str = (v, n = 120) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
    const C = (k, label, type = 'text', extra = {}) => ({k, label, type, ...extra});
    const empty = (W, fs, msg) => { msg = i18n(msg); return {h: 60, svg: T(W / 2, 30, msg, {anchor: 'middle', size: fs, fill: '#888888'}), legend: [], desc: msg}; };
    const fold = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
    const yearOf = v => { if (typeof v === 'number') return Number.isFinite(v) && v > -3000 && v < 3000 ? v : null; const m = str(v, 40).match(/-?\d{3,4}/); return m ? +m[0] : null; };
    let seq = 0; const uid = p => `${p}${(++seq).toString(36)}`;
    const H_OPT = C('height', 'Hauteur au plus', 'number', {unit: 'px', min: 120, max: 3000});
    const PALETTE = C('palette', 'Couleurs', 'select', {choices: Object.keys(R.PALETTES || {vive: 1}).map(k => [k, k.charAt(0).toUpperCase() + k.slice(1)])});

    /* ═════════ Le bloc commun « groupe de personnes, période, ＋ Critère » (heritage-diagram-options.js) ═════════ */
    const DGO = () => ext.diagramAppOpts;
    const FIELDS = period => ['rules', 'pop', ...(period ? ['period'] : [])];
    const critBox = (pane, kind) => pane?.querySelector(`[data-dla-crit="${kind}"] [data-dgo-box]`) || pane?.querySelector('[data-dla-crit] [data-dgo-box]');
    const criteria = {
        html: (kind, {period = true} = {}) => (DGO()?.html ? `<div class="dla-crit" data-dla-crit="${esc(kind)}" data-dla-period="${period ? 1 : 0}">${DGO().html({...DGO().DEF, limit: 0}, {fields: FIELDS(period), kind, period: 'event'})}</div>` : ''),
        bind: (pane, kind) => { const box = critBox(pane, kind); if (box && DGO()?.bind) DGO().bind(box, {cfg: {fields: FIELDS(box.closest('[data-dla-crit]')?.dataset.dlaPeriod !== '0'), kind, period: 'event'}}); },
        check: (pane, kind) => { const box = critBox(pane, kind); return !box || !DGO()?.check || DGO().check(box); },
        /** les paramètres d'API : dg_* (groupe, période) et rules / match (les critères combinés) */
        params: (pane, kind) => { const box = critBox(pane, kind); if (!box || !DGO()?.read) return {}; const q = DGO().read(box);
            return {...DGO().dgParams(q, {period: true}), ...(q.rules?.length ? {rules: JSON.stringify(q.rules), match: q.match} : {})}; },
    };
    const api = q => A().api('diagram_lot_a', q);
    const PKF = (name, o = {}) => (window.LCNDA_PICKER?.pickerField ? window.LCNDA_PICKER.pickerField({name, kind: 'person', ...o}) : '');
    const startId = () => Number(A()?.state?.currentPersonId) || Number(A()?.state?.bootstrap?.startPersonId) || null;
    const v = (pane, k) => pane.querySelector(`[data-dla="${k}"]`);
    const sel = (k, opts, def = '') => `<select data-dla="${k}">${opts.map(([x, l]) => `<option value="${esc(x)}" ${String(x) === String(def) ? 'selected' : ''}>${esc(i18n(l))}</option>`).join('')}</select>`;
    const panel = (title, intro, inner, go = 'Prendre dans ma base') => `<div class="h-dg-app dla-app"><h4>${esc(i18n(title))}</h4><p class="muted">${esc(i18n(intro))}</p>${inner}<button type="button" class="button small" data-dla-go>${esc(i18n(go))}</button><p class="muted" data-dla-msg aria-live="polite"></p></div>`;
    function bindGo(scope, run) {
        const btn = scope.querySelector('[data-dla-go]'), msg = scope.querySelector('[data-dla-msg]'); if (!btn) return;
        btn.addEventListener('click', async () => { btn.disabled = true; if (msg) msg.innerHTML = window.LCNDA_UI?.spinner ? window.LCNDA_UI.spinner(i18n('Lecture de ta généalogie…'), {inline: true}) : '…';
            try { const t = await run(); A().toast?.(t || i18n('Données prises dans ta base.')); if (msg?.isConnected) msg.textContent = ''; } catch (e) { if (msg) msg.textContent = '⚠️ ' + (e.message || e); } finally { btn.disabled = false; } });
    }
    const titleIf = (s, k, t) => { s.o = s.o || {}; const smp = (() => { try { return K[k]?.sample?.().o?.title; } catch (_) { return ''; } })(); if (!s.o.title || s.o.title === smp) s.o.title = t; };

    /* ═════════ 🛡 Tableau de quartiers ═════════ */
    // les émaux du blasonnement → une couleur (le premier pour le champ, le second pour le chef)
    const TINCT = [['azur', '#2c5fa8'], ['gueules', '#c0262d'], ['sinople', '#2e7d32'], ['sable', '#26262a'], ['pourpre', '#7b3f8c'], ['orangé', '#e8862a'], ['tenné', '#9a5b2a'], ['or', '#e0b43c'], ['argent', '#f1f1ee'], ['hermine', '#f6f6f2'], ['vair', '#9fb4d6'],
        ['azure', '#2c5fa8'], ['gules', '#c0262d'], ['vert', '#2e7d32'], ['purpure', '#7b3f8c']];
    function tinctures(blazon) {
        const t = String(blazon || '').toLowerCase(), found = [];
        TINCT.forEach(([w, c]) => { const re = new RegExp(`(^|[^a-zà-ÿ])${w}([^a-zà-ÿ]|$)`), m = t.match(re); if (m) found.push([m.index, c]); });
        return found.sort((a, b) => a[0] - b[0]).map(x => x[1]).filter((c, i, a) => a.indexOf(c) === i).slice(0, 2);
    }
    const shieldD = (x, y, w, h) => `M${r2(x)} ${r2(y)}H${r2(x + w)}V${r2(y + h * .5)}Q${r2(x + w)} ${r2(y + h * .86)} ${r2(x + w / 2)} ${r2(y + h)}Q${r2(x)} ${r2(y + h * .86)} ${r2(x)} ${r2(y + h * .5)}Z`;
    const safeImg = s => { s = String(s ?? '').trim(); return /^media\/[\w\-. /]{1,240}$/u.test(s) && !s.includes('..') ? s : /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]{20,}$/.test(s) && s.length < 3e6 ? s : ''; };
    function quarters(spec, W, fs) {
        const o = spec.o || {}, list = rowsOf(spec, 'rows', 64).map((r, i) => ({i, s: Math.floor(num(r.sosa)), name: str(r.name, 100), dates: str(r.dates, 40), coat: str(r.coat, 100), blazon: str(r.blazon, 400), img: safeImg(r.img), col: color(r.color, ''), pid: Math.floor(num(r.pid)) || 0}));
        const people = list.filter(r => r.name || r.coat || r.blazon || r.img);
        if (!people.length) return empty(W, fs, 'Ajoute les ancêtres (n° Sosa, nom) et leurs armoiries.');
        const maxS = Math.max(0, ...people.map(r => r.s)), n = [8, 16, 32].includes(num(o.count)) ? num(o.count) : maxS >= 32 ? 32 : maxS >= 16 ? 16 : maxS >= 8 ? 8 : people.length > 8 ? 16 : 8;
        // les places : le n° Sosa s'il est dans la génération, sinon la première place libre (dans l'ordre du tableau)
        const slots = Array(n).fill(null), extra = [];
        people.forEach(r => { const k = r.s - n; if (r.s >= n && r.s < 2 * n && !slots[k]) slots[k] = r; else if (r.s !== 1) extra.push(r); });
        extra.forEach(r => { const k = slots.indexOf(null); if (k >= 0) slots[k] = r; });
        const me = people.find(r => r.s === 1);
        const parch = o.paper === 'parchment', ink = parch ? '#3b2a1a' : 'currentColor', hide = o.missing === 'hide';
        const room = Math.max(2, Math.floor(W / (fs * 4.6))); let cols = n; while (cols > room && cols > 2) cols /= 2;
        const cw = W / cols, sw = Math.min(cw * .64, fs * 7), sh = sw * 1.18, lines = (o.names !== false ? 1 : 0) + (o.dates !== false ? 1 : 0) + (o.sosa !== false ? 1 : 0), rowH = sh + fs * (1.2 + lines * 1.05) + fs * .6;
        const pad = parch ? fs * 1.2 : 0, head = fs * (n > cols ? 1.6 : .4);
        let svg = '', defs = '', notes = [], y = pad + head;
        const shield = (r, cx, top, w, h, s) => {
            const x = cx - w / 2, id = uid('dlaq'), cs = r ? tinctures(r.blazon) : [];
            if (!r || !(r.coat || r.blazon || r.img)) { // pas d'armoiries connues : un écu vide (ou rien)
                if (hide && !r) return '';
                return `<path d="${shieldD(x, top, w, h)}" fill="${parch ? '#efe3c4' : '#ffffff'}" fill-opacity="${parch ? 1 : .55}" stroke="${parch ? '#8a6d3b' : '#9aa3ad'}" stroke-width="1.2" stroke-dasharray="4 3">${tip(r ? i18n('{name} : armoiries pas encore trouvées', {name: r.name}) : i18n('Sosa {n} : ancêtre à trouver', {n: s}))}</path>`;
            }
            let body;
            if (r.img) { defs += `<clipPath id="${id}"><path d="${shieldD(x, top, w, h)}"/></clipPath>`; body = `<image href="${esc(r.img)}" x="${r2(x)}" y="${r2(top)}" width="${r2(w)}" height="${r2(h)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`; }
            else { const f = r.col || cs[0] || pick(spec, s), c2 = cs[1]; defs += `<clipPath id="${id}"><path d="${shieldD(x, top, w, h)}"/></clipPath>`;
                body = `<path d="${shieldD(x, top, w, h)}" fill="${f}"/>` + (c2 ? `<rect x="${r2(x)}" y="${r2(top)}" width="${r2(w)}" height="${r2(h * .28)}" fill="${c2}" clip-path="url(#${id})"/>` : '') + (r.coat && w > fs * 2.4 ? T(cx, top + h * (c2 ? .6 : .5), cut(r.coat, w * .86, fs * .62), {size: fs * .62, anchor: 'middle', weight: 700, fill: contrast(f)}) : ''); }
            const note = o.notes !== false && r.blazon ? (notes.push([s, r]), notes.length) : 0;
            return `<g${r.pid ? ` data-dmo-pid="${r.pid}" style="cursor:pointer"` : ''}>${tip(`${r.name}${r.coat ? ' — ' + r.coat : ''}${r.blazon ? ' : ' + r.blazon : ''}`)}${body}<path d="${shieldD(x, top, w, h)}" fill="none" stroke="${parch ? '#5a3d1e' : '#3b4352'}" stroke-width="1.4"/>${note ? T(x + w + 2, top + fs * .4, String(note), {size: fs * .62, weight: 700, fill: ink}) : ''}</g>`;
        };
        const rowsN = n / cols;
        for (let rr = 0; rr < rowsN; rr++) {
            if (n > cols && (rr === 0 || rr === rowsN / 2)) svg += T(pad + 2, y - fs * .7, i18n(rr === 0 ? 'Côté paternel' : 'Côté maternel'), {size: fs * .78, weight: 700, fill: ink, op: .75});
            for (let c = 0; c < cols; c++) {
                const k = rr * cols + c, r = slots[k], s = n + k, cx = pad + (c + .5) * (W - 2 * pad) / cols;
                if (!r && hide) continue;
                svg += shield(r, cx, y, sw, sh, s);
                let ty = y + sh + fs * .9;
                if (o.names !== false) { svg += T(cx, ty, r ? cut(r.name || '—', cw - 4, fs * .78) : i18n('à trouver'), {size: fs * .78, anchor: 'middle', weight: 600, fill: ink, op: r ? 0 : .55}); ty += fs * 1.05; }
                if (o.dates !== false && r?.dates) { svg += T(cx, ty, cut(r.dates, cw - 4, fs * .68), {size: fs * .68, anchor: 'middle', fill: ink, op: .8}); }
                if (o.dates !== false) ty += fs * 1.05;
                if (o.sosa !== false) svg += T(cx, ty, i18n('n° {n}', {n: s}), {size: fs * .64, anchor: 'middle', fill: ink, op: .6});
            }
            y += rowH + (n > cols && rr === rowsN / 2 - 1 ? fs * 1.4 : 0);
        }
        if (me) { const w = Math.min(sw * 1.35, fs * 9), h = w * 1.18, cx = W / 2; y += fs * .4; svg += shield(me, cx, y, w, h, 1) + T(cx, y + h + fs, cut(me.name, W * .6, fs), {size: fs, anchor: 'middle', weight: 800, fill: ink}); y += h + fs * 1.8; }
        if (notes.length) { y += fs * .4; notes.slice(0, 32).forEach(([s, r], i) => { svg += T(pad + 4, y, cut(`${i + 1}. ${r.name || i18n('Sosa {n}', {n: s})}${r.coat ? ' (' + r.coat + ')' : ''} : ${r.blazon}`, W - 2 * pad - 8, fs * .7), {size: fs * .7, fill: ink, op: .85}); y += fs * 1.05; }); }
        y += pad;
        const bg = parch ? `<rect x=".5" y=".5" width="${r2(W - 1)}" height="${r2(y - 1)}" rx="${r2(fs * .6)}" fill="#f3e7c9" stroke="#b99a5b" stroke-width="1.5"/><rect x="${r2(fs * .35)}" y="${r2(fs * .35)}" width="${r2(W - fs * .7)}" height="${r2(y - fs * .7)}" rx="${r2(fs * .4)}" fill="none" stroke="#b99a5b" stroke-opacity=".6"/>` : '';
        const found = slots.filter(r => r && (r.coat || r.blazon || r.img)).length;
        return {h: Math.max(num(o.height) || 0, y), svg: (defs ? `<defs>${defs}</defs>` : '') + bg + svg, legend: [], desc: i18n('Tableau de quartiers ({n}), armoiries connues : {k}.', {n, k: found})};
    }
    const sampleQuarters = () => {
        const L = [['Pierre MAZAUD', '1702–1771', 'Mazaud', 'D’azur au chevron d’or'], ['Anne LACOMBE', '1708–1760', 'Lacombe', 'De gueules à trois besants d’argent'], ['Jean VERGNOLLE', '1699–1752', '', ''], ['Marie ESTRADE', '1705–1780', 'Estrade', 'De sinople à la fasce d’or'],
            ['Léonard BOUYSSE', '1700–1768', 'Bouysse', 'D’or au lion de sable'], ['Catherine FAURIE', '1710–1774', '', ''], ['Antoine DELPEUCH', '1697–1749', 'Delpeuch', 'D’argent à la croix de gueules'], ['Jeanne MONTEIL', '1703–1781', 'Monteil', 'De pourpre au chef d’or'],
            ['Guillaume CHASTAING', '1701–1770', 'Chastaing', 'D’azur à trois étoiles d’argent'], ['Françoise LAVAL', '1706–1762', '', ''], ['Bernard ROUFFIGNAC', '1698–1757', 'Rouffignac', 'De gueules au chevron d’argent'], ['Marguerite BESSE', '1709–1777', 'Besse', 'D’or à la bande d’azur'],
            ['Étienne PEYRAT', '1704–1769', '', ''], ['Hélène DUMAS', '1711–1785', 'Dumas', 'De sable au lion d’or'], ['Martial LAGORCE', '1700–1766', 'Lagorce', 'D’argent au pin de sinople'], ['Louise CHAMBON', '1707–1779', '', '']];
        return {o: {title: i18n('Les seize quartiers de {name}', {name: 'Jean MAZAUD'}), count: 16, paper: 'parchment'}, rows: [...L.map(([name, dates, coat, blazon], i) => ({sosa: 16 + i, name, dates, coat, blazon})), {sosa: 1, name: 'Jean MAZAUD', dates: '1801–1866', coat: 'Mazaud', blazon: 'D’azur au chevron d’or'}]};
    };
    const quartersApp = {
        html: () => panel('🛡 Les quartiers d’une personne de ma base', 'Ses ancêtres de la génération choisie (ordre Sosa) et les armoiries reliées à chacun (Listes → Armoiries).',
            `<span class="pk-lab">${esc(i18n('La personne'))}</span>${PKF('dla_root', {value: startId()})}<label>${esc(i18n('Quartiers'))}${sel('gens', [[3, '8 quartiers (arrière-grands-parents)'], [4, '16 quartiers'], [5, '32 quartiers']], 4)}</label>`),
        bind: (pane, io) => bindGo(pane, async () => {
            const root = Number(pane.querySelector('[name="dla_root"]')?.value) || startId() || 0, g = Number(v(pane, 'gens')?.value) || 4;
            const r = await api({what: 'quarters', root, gens: g}); if (!r.found) throw new Error(i18n('Aucun ancêtre connu à cette génération.'));
            const s = io.spec(); s.rows = r.rows.map(x => ({sosa: x.sosa, name: x.name, dates: x.dates, coat: x.coat, blazon: x.blazon, img: x.img, pid: x.pid ? String(x.pid) : ''}));
            s.o = {...(s.o || {}), count: 2 ** g}; titleIf(s, 'quarters', i18n('Les quartiers de {name}', {name: r.root_name}));
            io.apply(s); return i18n('Ancêtres pris dans ta base : {n} (armoiries : {k}).', {n: r.found, k: r.with_coat});
        }),
    };

    /* ═════════ 🌿 Arbre des variantes d'un nom ═════════ */
    const dist = (a, b) => { a = fold(a); b = fold(b); if (a === b) return 0; const m = a.length, n = b.length; if (!m || !n) return Math.max(m, n); let prev = Array.from({length: n + 1}, (_, j) => j);
        for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; } return prev[n]; };
    /** les formes, leur parent (écrit, sinon deviné : la forme plus ancienne qui ressemble le plus) et leur rang de haut en bas */
    function variantTree(spec) {
        const o = spec.o || {}, seen = new Set();
        const list = rowsOf(spec, 'rows', 300).map((r, i) => ({i, form: str(r.form, 80), a: yearOf(r.from), b: yearOf(r.to), n: Math.max(0, num(r.count)), parent: str(r.parent, 80), src: str(r.source, 120), col: color(r.color, '')}))
            .filter(f => f.form && !seen.has(fold(f.form)) && seen.add(fold(f.form)));
        list.forEach(f => { if (f.a === null) f.a = f.b; if (f.b === null) f.b = f.a; if (f.a !== null && f.b < f.a) [f.a, f.b] = [f.b, f.a]; });
        const byKey = new Map(list.map(f => [fold(f.form), f]));
        list.forEach(f => {
            let p = f.parent ? byKey.get(fold(f.parent)) : null;
            if (!p && !f.parent && o.guess !== false) { // deviné par la date : une forme plus ancienne, la plus proche à l'écrit
                const older = list.filter(q => q !== f && q.a !== null && f.a !== null && (q.a < f.a || (q.a === f.a && q.i < f.i)));
                p = older.sort((x, y) => dist(x.form, f.form) - dist(y.form, f.form) || y.a - x.a)[0] || null;
            }
            f.up = p && p !== f ? p : null; f.guessed = !!(f.up && !f.parent);
        });
        list.forEach(f => { let x = f.up, k = 0; while (x && k++ < 400) { if (x === f) { f.up = null; break; } x = x.up; } });
        list.forEach(f => { f.kids = list.filter(q => q.up === f).sort((x, y) => (x.a ?? 1e9) - (y.a ?? 1e9) || x.i - y.i); });
        const order = [], walk = (f, d) => { f.d = d; order.push(f); f.kids.forEach(k => walk(k, d + 1)); };
        list.filter(f => !f.up).sort((x, y) => (x.a ?? 1e9) - (y.a ?? 1e9) || x.i - y.i).forEach(f => walk(f, 0));
        let root = 0; order.forEach(f => { if (!f.up) root++; f.branch = f.up ? f.up.branch : root - 1; });
        return order;
    }
    function namevariants(spec, W, fs) {
        const o = spec.o || {}, list = variantTree(spec);
        if (!list.length) return empty(W, fs, 'Ajoute les formes du nom : la forme, ses années, le nombre d’actes.');
        const dated = list.filter(f => f.a !== null), noYears = !dated.length;
        if (noYears) list.forEach(f => { f.a = f.d * 10; f.b = f.a + 6; });
        else { const lo0 = Math.min(...dated.map(f => f.a)); list.forEach(f => { if (f.a === null) { f.a = f.up?.a ?? lo0; f.b = f.a; f.undated = true; } }); }
        let lo = Math.min(...list.map(f => f.a)), hi = Math.max(...list.map(f => f.b));
        if (hi - lo < 10) { lo -= 5; hi += 5; } const padY = (hi - lo) * .04; lo -= padY; hi += padY;
        const maxN = Math.max(1, ...list.map(f => f.n)), thick = f => o.thick === false ? clamp(num(o.lineWidth) || 5, 1, 20) : clamp(2 + 14 * Math.sqrt(f.n / maxN), 2, 18);
        const labW = Math.min(W * .32, Math.max(...list.map(f => textW(f.form, fs * .9))) + 12), x0 = 6, x1 = W - labW - 6, X = y => x0 + (y - lo) / (hi - lo) * (x1 - x0);
        const lh = clamp(num(o.rowHeight) || fs * 2.3, fs * 1.4, 80), top = fs * .6, axis = o.axis !== false && !noYears;
        let svg = '', links = '';
        const colOf = f => f.col || (o.colorBy === 'one' ? color(o.lineColor, '#8a5a2b') : pick(spec, o.colorBy === 'form' ? list.indexOf(f) : f.branch));
        list.forEach((f, k) => { f.y = top + k * lh + lh / 2; });
        if (axis) { const tk = R.ticks(lo, hi, clamp(Math.round((x1 - x0) / 80), 2, 20)); tk.ticks.filter(t => t >= lo && t <= hi).forEach(t => { const x = X(t); svg += `<line x1="${r2(x)}" x2="${r2(x)}" y1="${r2(top)}" y2="${r2(top + list.length * lh)}" stroke="currentColor" stroke-opacity=".1"/>` + T(x, top + list.length * lh + fs * .9, String(Math.round(t)), {size: fs * .75, anchor: 'middle', op: .7}); }); }
        list.forEach(f => {
            const c = colOf(f), th = thick(f), xa = X(f.a), xb = Math.max(X(f.b), xa + 2);
            if (f.up) { const p = f.up, px = clamp(xa, X(p.a), Math.max(X(p.b), X(p.a) + 2)), d = Math.abs(f.y - p.y) * .55;
                links += `<path d="M${r2(px)} ${r2(p.y)}C${r2(px)} ${r2(p.y + Math.sign(f.y - p.y) * d)} ${r2(xa)} ${r2(f.y - Math.sign(f.y - p.y) * d)} ${r2(xa)} ${r2(f.y)}" fill="none" stroke="${colOf(p)}" stroke-opacity=".55" stroke-width="${r2(Math.max(1.2, Math.min(thick(p), th) * .5))}"${f.guessed ? ' stroke-dasharray="4 3"' : ''}/>`; }
            const t = `${f.form}${f.undated ? '' : ` (${Math.round(f.a)}${f.b !== f.a ? '–' + Math.round(f.b) : ''})`} · ${i18n('actes : {n}', {n: fmt(f.n, 0)})}${f.up ? ' · ' + i18n('vient de {name}', {name: f.up.form}) + (f.guessed ? ' ' + i18n('(deviné)') : '') : ''}${f.src ? ' · ' + f.src : ''}`;
            svg += `<g>${tip(t)}<line x1="${r2(xa)}" x2="${r2(xb)}" y1="${r2(f.y)}" y2="${r2(f.y)}" stroke="${c}" stroke-width="${r2(th)}" stroke-linecap="round"${f.undated ? ' stroke-dasharray="2 3"' : ''}/>`
                + `<circle cx="${r2(xa)}" cy="${r2(f.y)}" r="${r2(Math.max(2.5, th * .45))}" fill="${c}" stroke="#ffffff" stroke-width="1"/></g>`;
            const lx = Math.min(xb + th / 2 + 6, x1 + 6), room = W - lx - 4;
            svg += T(lx, f.y - (o.counts !== false ? fs * .28 : 0), cut(f.form, room, fs * .9), {size: fs * .9, weight: f.up ? 600 : 800});
            if (o.counts !== false) svg += T(lx, f.y + fs * .62, cut(`${f.n ? i18n('actes : {n}', {n: fmt(f.n, 0)}) : ''}${o.sources && f.src ? (f.n ? ' · ' : '') + f.src : ''}`, room, fs * .66), {size: fs * .66, op: .7});
        });
        const roots = list.filter(f => !f.up);
        const legend = o.colorBy === 'one' || o.colorBy === 'form' ? [] : roots.slice(0, 10).map(f => ({label: i18n('Branche « {name} »', {name: f.form}), color: colOf(f)}));
        return {h: Math.max(num(o.height) || 0, top + list.length * lh + (axis ? fs * 1.8 : fs * .6)), svg: links + svg, legend, desc: i18n('Arbre des variantes (formes du nom : {n}).', {n: list.length})};
    }
    const sampleVariants = () => ({o: {title: i18n('Les formes du nom {name}', {name: 'LACOMBE'})}, rows: [
        ['La Combe', 1598, 1690, 9, '', 'Registres de Bort'], ['Lacombe', 1665, 1905, 64, 'La Combe', ''], ['Lacoumbe', 1702, 1758, 6, '', 'Notaire Chastang'], ['Lacombes', 1731, 1802, 11, '', ''],
        ['Lacome', 1789, 1851, 7, '', 'Recensement 1836'], ['Delacombe', 1688, 1744, 4, 'La Combe', ''], ['Lacombe-Dufour', 1852, 1931, 5, 'Lacombe', ''], ['Lacoume', 1760, 1795, 3, '', '']]
        .map(([form, from, to, count, parent, source]) => ({form, from: String(from), to: String(to), count, parent, source}))});
    const variantsApp = {
        html: () => panel('🌿 Les formes d’un nom de ma base', 'Les noms du groupe (ou écrits pareil) et leurs variantes notées, avec leurs années et le nombre d’actes.',
            `<label>${esc(i18n('Groupe de noms'))}<select data-dla="group"><option value="">${esc(i18n('Chargement…'))}</option></select></label><label>${esc(i18n('Ou un nom'))}<input data-dla="name" maxlength="80" placeholder="Lacombe"></label>
            <label>${esc(i18n('Actes comptés'))}${sel('events', [['all', 'Tous les événements'], ['BIRT', 'Naissances et baptêmes'], ['MARR', 'Mariages'], ['DEAT', 'Décès et sépultures']], 'all')}</label>${criteria.html('namevariants')}`),
        bind: (pane, io) => {
            criteria.bind(pane, 'namevariants');
            const gs = v(pane, 'group');
            api({what: 'name_groups'}).then(r => { if (!gs?.isConnected) return; gs.innerHTML = `<option value="">${esc(i18n('— Aucun (le nom écrit à côté) —'))}</option>` + (r.groups || []).map(g => `<option value="g${g.id}">${esc(g.name)} (${g.n})</option>`).join('')
                + ((r.names || []).length ? `<optgroup label="${esc(i18n('Noms les plus portés'))}">${r.names.map(x => `<option value="n${esc(x.name)}">${esc(x.name)} (${x.n})</option>`).join('')}</optgroup>` : ''); }).catch(() => { if (gs) gs.innerHTML = `<option value="">—</option>`; });
            bindGo(pane, async () => {
                if (!criteria.check(pane, 'namevariants')) throw new Error(i18n('Vérifie le groupe de personnes.'));
                const g = gs?.value || '', typed = str(v(pane, 'name')?.value, 80), q = {what: 'variants', events: v(pane, 'events')?.value || 'all', ...criteria.params(pane, 'namevariants')};
                if (typed) q.name = typed; else if (g.startsWith('g')) q.group = g.slice(1); else if (g.startsWith('n')) q.name = g.slice(1); else throw new Error(i18n('Choisis un groupe de noms ou écris un nom.'));
                const r = await api(q); if (!r.rows?.length) throw new Error(i18n('Aucune forme trouvée pour ce nom.'));
                const s = io.spec(); s.rows = r.rows.map(x => ({form: x.form, from: x.from, to: x.to, count: x.count, parent: '', source: x.source})); titleIf(s, 'namevariants', i18n('Les formes du nom {name}', {name: r.group}));
                io.apply(s); return i18n('Formes prises dans ta base : {n}.', {n: r.rows.length});
            });
        },
    };

    const NEW = {
        quarters: {icon: '🛡️', label: 'Tableau de quartiers (armoiries des ancêtres)', group: 'Généalogie', render: quarters, noLegend: true, fromApp: quartersApp,
            help: 'Les 8, 16 ou 32 ancêtres d’une génération, chacun avec son blason ; un écu vide : armoiries à trouver.',
            grids: [{key: 'rows', label: 'Les quartiers (n° Sosa ; 1 = la personne, en bas)', cols: [C('sosa', 'N° Sosa', 'number'), C('name', 'Nom'), C('dates', 'Dates'), C('coat', 'Armoiries (nom)'), C('blazon', 'Blasonnement'), C('img', 'Image (media/…)'), C('color', 'Couleur de l’écu (sans image)', 'color')]}],
            options: [C('count', 'Quartiers', 'select', {choices: [['', 'Selon le tableau'], ['8', '8'], ['16', '16'], ['32', '32']]}), C('missing', 'Blason absent', 'select', {choices: [['', 'Écu vide'], ['hide', 'Masqué']]}),
                C('names', 'Nom sous l’écu', 'check', {def: true}), C('dates', 'Dates', 'check', {def: true}), C('sosa', 'N° Sosa', 'check', {def: true}), C('notes', 'Blasonnement en note (en bas)', 'check', {def: true}),
                C('paper', 'Fond', 'select', {choices: [['', 'Sobre'], ['parchment', 'Parchemin']]}), PALETTE, H_OPT],
            sample: sampleQuarters},
        namevariants: {icon: '🌿', label: 'Arbre des variantes d’un nom', group: 'Généalogie', render: namevariants, legend: 'bottom', fromApp: variantsApp,
            help: 'Chaque forme du nom sur l’axe des années, reliée à celle d’où elle vient ; trait épais = beaucoup d’actes.',
            grids: [{key: 'rows', label: 'Les formes du nom', cols: [C('form', 'Forme'), C('from', 'De (année)'), C('to', 'À (année)'), C('count', 'Actes', 'number'), C('parent', 'Vient de (vide = deviné)'), C('source', 'Source, note'), C('color', 'Couleur', 'color')]}],
            options: [C('guess', 'Deviner d’où vient chaque forme (date et ressemblance)', 'check', {def: true}), C('thick', 'Épaisseur selon le nombre d’actes', 'check', {def: true}), C('lineWidth', 'Épaisseur des traits', 'range', {unit: 'px', min: 1, max: 20, def: 5, when: s => s.o?.thick === false}),
                C('axis', 'Axe des années', 'check', {def: true}), C('counts', 'Nombre d’actes sous la forme', 'check', {def: true}), C('sources', 'Sources sous la forme', 'check'),
                C('colorBy', 'Couleur', 'select', {choices: [['', 'Une par branche'], ['form', 'Une par forme'], ['one', 'Une seule']]}), C('lineColor', 'Couleur (une seule)', 'color', {def: '#8a5a2b', when: s => s.o?.colorBy === 'one'}), PALETTE,
                C('rowHeight', 'Hauteur d’une ligne', 'range', {unit: 'px', min: 16, max: 80, def: 30}), H_OPT],
            sample: sampleVariants},
    };
    for (const [k, kind] of Object.entries(NEW)) if (!K[k]) K[k] = kind;

    /* ═════════ 🔗 Chemin de parenté → 🔁 Boucles d'implexe et coefficient de consanguinité ═════════ */
    const P = () => window.LCNDA_DIAGPLUS;
    const chain = v0 => String(v0 ?? '').split(/\s*(?:>|→|›|;)\s*/).map(x => str(x, 100)).filter(Boolean).slice(0, 30);
    const pct = f => `${fmt(f * 100, f < .001 ? 3 : 2)} %`;
    const sup = n => String(n).replace(/\d/g, d => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]);
    function loops(spec, W, fs) {
        const o = spec.o || {}, all = rowsOf(spec, 'loops', 60).map(r => ({anc: str(r.anc, 100), up: chain(r.fside), down: chain(r.mside), fa: clamp(num(r.fa), 0, 100) / 100})).filter(l => l.anc);
        if (!all.length) return empty(W, fs, 'Choisis une personne (« Depuis l’app ») ou écris les boucles à la main.');
        all.forEach(l => { l.k = l.up.length + l.down.length + 1; l.c = Math.pow(.5, l.k) * (1 + l.fa); });
        const F = all.reduce((a, l) => a + l.c, 0), minK = Math.min(...all.map(l => l.k)), list = o.closest ? all.filter(l => l.k === minK) : all;
        const person = str(o.person, 100) || i18n('La personne'), fa = str(o.father, 100) || i18n('Le père'), mo = str(o.mother, 100) || i18n('La mère');
        const pw = Math.max(250, Math.min(W, 420)), cols = Math.max(1, Math.min(list.length, Math.floor(W / pw))), cw = W / cols, bh = fs * 1.9, rh = fs * 2.7;
        const cF = color(o.fatherColor, '#4e79a7'), cM = color(o.motherColor, '#e15759'), cA = color(o.ancColor, '#c9a227');
        const box = (x, y, w, name, c, bold) => `<g>${tip(name)}<rect x="${r2(x - w / 2)}" y="${r2(y - bh / 2)}" width="${r2(w)}" height="${r2(bh)}" rx="${r2(bh / 3)}" fill="${mix(c, '#ffffff', .8)}" stroke="${c}" stroke-width="${bold ? 2.2 : 1.3}"/>${T(x, y, cut(name, w - 8, fs * .8), {size: fs * .8, anchor: 'middle', weight: bold ? 800 : 600, fill: '#1d1d1f'})}</g>`;
        let svg = '', y0 = 0, rowMax = 0;
        list.forEach((l, i) => {
            const c = i % cols, cx = c * cw + cw / 2; if (c === 0 && i) { y0 += rowMax + fs; rowMax = 0; }
            const depth = Math.max(l.up.length, l.down.length), bw = Math.min(cw * .44, fs * 11), xl = cx - cw * .24, xr = cx + cw * .24, yA = y0 + fs * 1.4, yP = yA + (depth + 1) * rh;
            const L = [...l.up].reverse(), Rr = [...l.down].reverse(); // de l'ancêtre vers le père / la mère
            const yAt = (k, n) => yA + (k + 1) * (yP - yA - rh * .0) / (n + 1);
            let lines = '';
            const sideBoxes = (list2, x, col) => list2.map((name, k) => { const y = yAt(k, list2.length); return {x, y, name, col}; });
            const lb = sideBoxes(L, xl, cF), rb = sideBoxes(Rr, xr, cM);
            const path = (pts, col) => { let d = ''; pts.forEach(([x, y], k) => { d += `${k ? 'L' : 'M'}${r2(x)} ${r2(y)}`; }); return `<path d="${d}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round" stroke-opacity=".75"/>`; };
            lines += path([[cx, yA], ...lb.map(b => [b.x, b.y]), [cx, yP]], cF) + path([[cx, yA], ...rb.map(b => [b.x, b.y]), [cx, yP]], cM);
            svg += lines + box(cx, yA, Math.min(cw - 8, bw * 1.5), l.anc, cA, true) + lb.map(b => box(b.x, b.y, bw, b.name, b.col)).join('') + rb.map(b => box(b.x, b.y, bw, b.name, b.col)).join('') + box(cx, yP, bw, person, '#59a14f', true);
            const line = o.calc !== false ? `(½)${sup(l.k)}${l.fa ? ` × (1 + ${pct(l.fa)})` : ''} = ${pct(l.c)}` : pct(l.c);
            svg += T(cx, yP + bh / 2 + fs * .9, line, {size: fs * .8, anchor: 'middle', weight: 600});
            svg += T(cx, yA - bh / 2 - fs * .55, i18n('Générations : {n} côté père, {m} côté mère', {n: l.up.length, m: l.down.length}), {size: fs * .68, anchor: 'middle', op: .7});
            rowMax = Math.max(rowMax, yP + bh / 2 + fs * 1.4 - y0);
        });
        let y = y0 + rowMax + fs * .8;
        const exact = all.every(l => !l.fa), fr = exact ? P()?.fraction?.(all.map(l => l.k)) : null;
        svg += T(W / 2, y, i18n('Coefficient de consanguinité de {name} : F = {f}', {name: person, f: `${o.fraction !== false && fr ? fr.text + ' = ' : ''}${pct(F)}`}), {size: fs * 1.05, anchor: 'middle', weight: 800}); y += fs * 1.5;
        if (o.calc !== false) { const parts = all.slice(0, 14).map(l => `(½)${sup(l.k)}${l.fa ? `×(1+${pct(l.fa)})` : ''}`).join(' + ') + (all.length > 14 ? ' + …' : '');
            const lines2 = []; let cur = ''; for (const w of `F = ${parts}`.split(' ')) { if (textW(cur + ' ' + w, fs * .78) > W - 10 && cur) { lines2.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w; } if (cur) lines2.push(cur);
            lines2.slice(0, 4).forEach(t => { svg += T(W / 2, y, t, {size: fs * .78, anchor: 'middle', op: .85}); y += fs * 1.2; }); }
        if (o.closest && list.length < all.length) { svg += T(W / 2, y, i18n('Boucles plus lointaines pas dessinées : {n} (comptées dans F).', {n: all.length - list.length}), {size: fs * .72, anchor: 'middle', op: .7}); y += fs * 1.2; }
        return {h: y + fs * .4, svg, legend: [{label: fa, color: cF}, {label: mo, color: cM}, {label: i18n('Ancêtre commun'), color: cA}], desc: i18n('Boucles d’implexe (chemins : {n}), F = {f}.', {n: all.length, f: pct(F)})};
    }
    const sampleLoops = () => ({o: {title: i18n('Les boucles d’implexe de {name}', {name: 'Marie LACOMBE'}), view: 'loops', person: 'Marie LACOMBE', father: 'Jean LACOMBE', mother: 'Anne MAZAUD'},
        rows: K.dplkin?.sample?.().rows || [], loops: [{anc: 'Pierre LACOMBE × Jeanne ESTRADE', fside: 'Jean LACOMBE > Léonard LACOMBE', mside: 'Anne MAZAUD > Catherine LACOMBE', fa: ''}, {anc: 'Antoine MAZAUD × Louise BESSE', fside: 'Jean LACOMBE > Marie MAZAUD > Guillaume MAZAUD', mside: 'Anne MAZAUD > Martial MAZAUD > Bernard MAZAUD', fa: ''}]});
    function implexeFill(pane, io) {
        return async () => {
            const root = Number(pane.querySelector('[name="dla_imp"]')?.value) || startId() || 0; if (!root) throw new Error(i18n('Choisis une personne.'));
            const r = await api({what: 'implexe', root}), G = P()?.normGraph?.(r.nodes || {}); if (!G) throw new Error(i18n('Le calcul n’est pas prêt.'));
            const res = P().inbreeding(G, root), N = id => r.nodes?.[id]?.n || i18n('Sans nom');
            if (!res.father || !res.mother) throw new Error(i18n('Les deux parents de cette personne ne sont pas connus.'));
            if (!res.loops.length) throw new Error(i18n('Pas d’ancêtre commun aux deux parents : pas de consanguinité connue (F = 0).'));
            const s = io.spec(); s.loops = res.loops.slice(0, 60).map(l => ({anc: N(l.anc), fside: l.up.map(N).join(' > '), mside: l.down.map(N).join(' > '), fa: l.fa ? String(Math.round(l.fa * 1e6) / 1e4) : ''}));
            s.o = {...(s.o || {}), view: 'loops', person: N(root), father: N(res.father), mother: N(res.mother), closest: v(pane, 'closest')?.value === '1'};
            titleIf(s, 'dplkin', i18n('Les boucles d’implexe de {name}', {name: N(root)})); io.apply(s);
            return i18n('Chemins trouvés : {n} (F = {f}).', {n: res.loops.length, f: pct(res.F)});
        };
    }
    function patchKin() {
        const k = K.dplkin; if (!k || k.__dla) return; k.__dla = true;
        const draw = k.render; k.render = (spec, W, fs) => (spec?.o?.view === 'loops' ? loops(spec, W, fs) : draw(spec, W, fs));
        const notLoops = s => s.o?.view !== 'loops', isLoops = s => s.o?.view === 'loops';
        (k.options || []).forEach(op => { const w = op.when; op.when = s => notLoops(s) && (!w || w(s)); });
        k.options = [C('view', 'Ce qu’on dessine', 'select', {choices: [['', 'Le chemin entre deux personnes'], ['loops', 'Les boucles d’implexe (entre les deux parents)']]}), ...(k.options || []),
            C('person', 'La personne étudiée', 'text', {when: isLoops}), C('father', 'Son père', 'text', {when: isLoops}), C('mother', 'Sa mère', 'text', {when: isLoops}),
            C('closest', 'Seulement l’ancêtre commun le plus proche', 'check', {when: isLoops}), C('calc', 'Montrer le calcul (½ puissance n)', 'check', {def: true, when: isLoops}), C('fraction', 'Coefficient aussi en fraction', 'check', {def: true, when: isLoops}),
            C('fatherColor', 'Côté du père', 'color', {def: '#4e79a7', when: isLoops}), C('motherColor', 'Côté de la mère', 'color', {def: '#e15759', when: isLoops}), C('ancColor', 'Ancêtre commun', 'color', {def: '#c9a227', when: isLoops})];
        k.grids = [...(k.grids || []), {key: 'loops', label: 'Les boucles d’implexe (une ligne par chemin ; les noms séparés par « > »)', cols: [C('anc', 'Ancêtre commun'), C('fside', 'Du père vers l’ancêtre'), C('mside', 'De la mère vers l’ancêtre'), C('fa', 'Consanguinité de l’ancêtre (%)', 'number')]}];
        const fa = k.fromApp || {html: () => '', bind: () => {}};
        k.fromApp = {
            html: spec => fa.html(spec) + panel('🔁 Entre les deux parents de…', 'Tous les chemins du père et de la mère vers un même ancêtre (filiations biologiques) et le coefficient de consanguinité (méthode de Wright).',
                `<span class="pk-lab">${esc(i18n('La personne étudiée'))}</span>${PKF('dla_imp', {value: startId()})}<label>${esc(i18n('Montrer'))}${sel('closest', [['', 'Tous les ancêtres répétés'], ['1', 'Le plus proche seulement']], '')}</label>`, 'Chercher les boucles'),
            bind: (pane, io) => { fa.bind(pane, io); const mine = [...pane.querySelectorAll('.dla-app')].pop(); if (mine) bindGo(mine, implexeFill(mine, io)); },
        };
    }

    /* ═════════ ⏳ Frises : montrer l'incertitude des dates (« vers 1745 », « avant 1760 », « entre … et … ») ═════════ */
    const range = (t, about) => ext.diagramGenea?.dateRange?.(t, about) || null;
    const iso = y => { const yy = Math.floor(y), m = clamp(Math.floor((y - yy) * 12) + 1, 1, 12); return `${yy}-${String(m).padStart(2, '0')}`; };
    const UNC_OPTS = [C('uncertain', 'Montrer l’incertitude des dates', 'check'), C('uncAbout', '« vers » : plus ou moins (ans)', 'range', {min: 1, max: 25, def: 5, when: s => !!s.o?.uncertain}),
        C('uncStyle', 'Dessin de la fourchette', 'select', {choices: [['', 'Dégradé'], ['dash', 'Pointillés']], when: s => !!s.o?.uncertain}), C('uncDiamond', 'Losange pour les dates exactes', 'check', {def: true, when: s => !!s.o?.uncertain})];
    const fuzz = (o, x1, x2, y, h, c, dir, gid) => o.uncStyle === 'dash'
        ? `<rect x="${r2(Math.min(x1, x2))}" y="${r2(y)}" width="${r2(Math.abs(x2 - x1))}" height="${r2(h)}" fill="${c}" fill-opacity=".14" stroke="${c}" stroke-width="1.2" stroke-dasharray="3 2"/>`
        : `<rect x="${r2(Math.min(x1, x2))}" y="${r2(y)}" width="${r2(Math.abs(x2 - x1))}" height="${r2(h)}" fill="url(#${gid}${dir})"/>`;
    const gradDefs = (gid, c) => `<linearGradient id="${gid}u"><stop offset="0" stop-color="${c}" stop-opacity="0"/><stop offset="1" stop-color="${c}" stop-opacity=".95"/></linearGradient><linearGradient id="${gid}d"><stop offset="0" stop-color="${c}" stop-opacity=".95"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient>`;
    const diamond = (x, y, s, c) => `<path d="M${r2(x)} ${r2(y - s)}L${r2(x + s)} ${r2(y)}L${r2(x)} ${r2(y + s)}L${r2(x - s)} ${r2(y)}Z" fill="${c}" stroke="#ffffff" stroke-width="1"/>`;
    function patchTimeline() {
        const k = K.timeline; if (!k || k.__dla) return; k.__dla = true;
        const draw = k.render;
        k.options = [...(k.options || []), ...UNC_OPTS];
        k.render = (spec, W, fs) => {
            const o = spec?.o || {}; if (!o.uncertain) return draw(spec, W, fs);
            const about = clamp(num(o.uncAbout) || 5, 1, 25), info = [];
            const rows2 = rowsOf(spec, 'rows', 5000).map(r => { const a = range(r.start, about), b = String(r.end ?? '').trim() ? range(r.end, about) : null, out = {...r}, inf = {name: str(r.name, 200), a, b};
                if (a && !a.exact && a.hi - a.lo > 1.01) out.start = iso(a.hi); if (b && !b.exact && b.hi - b.lo > 1.01) out.end = iso(b.lo); info.push([out, inf]); return out; });
            const res = draw({...spec, rows: rows2}, W, fs); if (!res?.time) return res;
            const {x0, y0, w, from, to} = res.time, X = t => x0 + (clamp(t, from, to) - from) / (to - from) * w;
            const bh = clamp(num(o.barHeight) || 18, 6, 60), rowH = bh + clamp(num(o.rowGap ?? 6), 0, 40);
            // les lignes dans le même ordre que le dessin (une ligne par nom), et la couleur du premier rôle
            const names = []; info.forEach(([r, inf]) => { if (inf.name && R.when(r.start, false) !== null && !names.includes(inf.name)) names.push(inf.name); });
            if (o.order === 'start') { const first = n => Math.min(...info.filter(([, i]) => i.name === n).map(([r]) => R.when(r.start, false) ?? 1e9)); names.sort((p, q) => first(p) - first(q)); }
            const roles = rowsOf(spec, 'roles').map((r, i) => ({name: str(r.role, 80), color: pick(spec, i, r.color)})).filter(r => r.name);
            const roleCol = r => { const nm = (String(r.roles || '').split(/[,;/+]/).map(x => x.trim()).filter(Boolean)[0]) || str(o.defaultRole, 80) || 'Membre'; let ro = roles.find(x => x.name.toLowerCase() === nm.toLowerCase()); if (!ro) { ro = {name: nm, color: pick(spec, roles.length)}; roles.push(ro); } return ro.color; };
            let defs = '', add = '';
            info.forEach(([r, inf]) => { const li = names.indexOf(inf.name); const c = roleCol(r); if (li < 0) return; const y = y0 + li * rowH + (rowH - bh) / 2, gid = uid('dlat');
                defs += gradDefs(gid, c);
                if (inf.a && !inf.a.exact && inf.a.hi - inf.a.lo > 1.01) add += fuzz(o, X(inf.a.lo), X(inf.a.hi), y, bh, c, 'u', gid) + tip(`${inf.name} : ${str(r.start, 60)}`);
                else if (inf.a?.exact && o.uncDiamond !== false) add += diamond(X(inf.a.lo), y + bh / 2, bh * .45, c);
                if (inf.b && !inf.b.exact && inf.b.hi - inf.b.lo > 1.01) add += fuzz(o, X(inf.b.lo), X(inf.b.hi), y, bh, c, 'd', gid) + tip(`${inf.name} : ${str(r.end, 60)}`);
                else if (inf.b?.exact && o.uncDiamond !== false) add += diamond(X(inf.b.lo), y + bh / 2, bh * .45, c); });
            return {...res, svg: `<defs>${defs}</defs>` + res.svg + add, legend: [...(res.legend || []), {label: i18n('Date incertaine (fourchette)'), color: '#9aa3ad', type: o.uncStyle === 'dash' ? 'dash' : undefined}]};
        };
    }
    function patchChrono() {
        const k = K.chrono; if (!k || k.__dla) return; k.__dla = true;
        const draw = k.render;
        k.options = [...(k.options || []), ...UNC_OPTS];
        k.render = (spec, W, fs) => {
            const res = draw(spec, W, fs), o = spec?.o || {}; if (!o.uncertain || !res?.time) return res;
            const m = String(res.svg).match(/^<g transform="translate\(0 (-?[\d.]+)\)">/); if (!m) return res;
            const about = clamp(num(o.uncAbout) || 5, 1, 25), {x0, w, from, to} = res.time, X = t => x0 + (clamp(t, from, to) - from) / (to - from) * w;
            const mid = clamp(Math.round(num(o.lanes) || 3), 1, 8) * fs * 3.2 + 10, hh = fs * .9;
            let defs = '', add = '';
            rowsOf(spec, 'rows', 3000).forEach((e, i) => { const d = range(e.date, about); if (!d || R.when(e.date, false) === null) return; const c = pick(spec, i, e.color), gid = uid('dlac');
                if (!d.exact && d.hi - d.lo > 1.01) { const xa = X(d.lo), xb = X(d.hi), xm = X(d.mid);
                    defs += gradDefs(gid, c); add += `<g>${tip(`${str(e.label, 80)} : ${str(e.date, 60)}`)}${fuzz(o, xa, xm, mid - hh / 2, hh, c, 'u', gid)}${fuzz(o, xm, xb, mid - hh / 2, hh, c, 'd', gid)}</g>`; }
                else if (d.exact && o.uncDiamond !== false) add += diamond(X(d.lo), mid, 6.5, c); });
            if (!add) return res;
            return {...res, svg: `<defs>${defs}</defs>` + res.svg.replace(/<\/g>$/, add + '</g>')};
        };
    }

    const patchAll = () => { patchKin(); patchTimeline(); patchChrono(); };
    patchAll();
    if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('DOMContentLoaded', patchAll); // heritage-diagram-plus.js chargé après ce fichier : on recommence

    ext.diagramLotA = {KINDS: Object.keys(NEW), criteria, tinctures, variantTree, loops, sampleLoops, patchAll};
})();
