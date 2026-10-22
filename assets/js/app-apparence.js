/* LCNDA — 🎨 Apparence : formes des avatars à soi, et en-tête de la fiche d'une personne ou d'un animal.
 *
 * 1. Formes des avatars (Réglages → Apparence, menu « Forme des avatars » et cadre « 🔷 Formes des avatars »)
 *    Les six formes de l'app restent ; on en ajoute (prise dans la bibliothèque des tableaux, polygone dessiné point
 *    par point, SVG importé et nettoyé : seulement des chemins) ; on range la liste, on cache des formes, ↺ Remettre comme au départ.
 *    localStorage['genealogie-avatar-shapes'] = {custom: {shp_x: {name, kind: 'poly', pts: [[x, y]…]} |
 *                                                          {name, kind: 'path', paths: [{d, eo, m}], vb: [x, y, w, h], src}},
 *                                                 order: [clés], hidden: [clés]}
 *    Une forme à soi = une règle :root[data-avatar-shape="shp_x"] (clip-path pour un polygone, masque SVG pour des chemins).
 * 2. En-tête de la fiche (Maintenance → Fiches personnes et animaux → « En-tête de la fiche »)
 *    Cadre du haut montré ou masqué (fiche épurée), les boutons carrés rangés, montrés ou cachés, sur 1 ou 2 colonnes,
 *    le lien « 🧩 Cette personne était… » en bouton carré ou en bas des badges.
 *    localStorage['genealogie-person-header'] = {frame: 'show'|'hide', order: [...], hidden: [...], cols: 1|2, pf: 'button'|'badges'}
 * Les deux clés suivent la base et les « 💾 Réglages enregistrés » (comme tous les réglages « genealogie-* »).
 * La bibliothèque de formes des tableaux est seulement lue (window.LCNDA_EXT.boardKit / boardShapesExtra).
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const toast = (m, k) => A().toast ? A().toast(m, k) : console.info(m);
    const plural = (n, one, many) => A().plural ? A().plural(n, one, many) : `${n} ${n < 2 ? one : (many || one + 's')}`;
    const fold = t => String(t || '').toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae').normalize('NFD').replace(/[̀-ͯ]/g, '');
    const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch (_) { return d; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { toast('Enregistrement impossible : la place du navigateur est pleine ?', 'error'); return false; } };
    const num = v => { const n = Number(v); return Number.isFinite(n) ? n : NaN; };
    const r2 = n => String(Math.round(n * 100) / 100);
    const uiSections = () => lsGet('genealogie-ui-sections', {}) || {};

    /* ═════════════════════════ 1. Formes des avatars ═════════════════════════ */
    const SHAPES_KEY = 'genealogie-avatar-shapes';
    const sq = (a = 0, s = 1) => { const t = a * Math.PI / 180, c = Math.cos(t), si = Math.sin(t); return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => [50 + (x * c - y * si) * 50 * s, 50 + (x * si + y * c) * 50 * s]); };
    const ngon = (n, rot = -90) => Array.from({length: n}, (_, i) => { const t = (rot + i * 360 / n) * Math.PI / 180; return [50 + Math.cos(t) * 50, 50 + Math.sin(t) * 50]; });
    const starPts = (n, r2_ = .45) => Array.from({length: n * 2}, (_, i) => { const r = i % 2 ? 50 * r2_ : 50, t = (-90 + i * 180 / n) * Math.PI / 180; return [50 + Math.cos(t) * r, 50 + Math.sin(t) * r]; });
    /** les formes de l'app : [clé, nom, points pour l'aperçu et pour « Dupliquer »] */
    const BUILTIN = [
        ['tilted', 'Carré penché (défaut)', sq(-3, .95)], ['square', 'Carré droit', sq()], ['circle', 'Cercle', ngon(40)],
        ['pentagon', 'Pentagone', [[50, 0], [100, 38], [82, 100], [18, 100], [0, 38]]], ['hexagon', 'Hexagone', [[25, 0], [75, 0], [100, 50], [75, 100], [25, 100], [0, 50]]],
        ['diamond', 'Losange', [[50, 0], [100, 50], [50, 100], [0, 50]]],
    ];
    const BUILTIN_KEYS = BUILTIN.map(b => b[0]);
    const D_OK = /^\s*[Mm][MmZzLlHhVvCcSsQqTtAa0-9eE.,+\-\s]*$/;
    const ID_OK = /^shp_[a-z0-9]{1,24}$/;
    const LIMITS = {pts: 120, paths: 400, d: 40000, total: 150000};

    function cleanPts(list) {
        if (!Array.isArray(list)) return null;
        const pts = list.slice(0, LIMITS.pts).map(p => Array.isArray(p) ? [num(p[0]), num(p[1])] : [NaN, NaN]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
            .map(([x, y]) => [Math.round(Math.max(0, Math.min(100, x)) * 10) / 10, Math.round(Math.max(0, Math.min(100, y)) * 10) / 10]);
        return pts.length >= 3 ? pts : null;
    }
    /** une forme reçue (stockage, fichier, collage) : seulement des nombres et des chemins vérifiés */
    function cleanShape(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const name = String(typeof raw.name === 'string' ? raw.name : '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Ma forme';
        const src = typeof raw.src === 'string' ? raw.src.slice(0, 80) : '';
        if (raw.kind === 'poly') { const pts = cleanPts(raw.pts); return pts ? {name, kind: 'poly', pts, ...(src ? {src} : {})} : null; }
        if (raw.kind !== 'path' || !Array.isArray(raw.paths)) return null;
        let total = 0;
        const paths = [];
        for (const p of raw.paths.slice(0, LIMITS.paths)) {
            const d = typeof p?.d === 'string' ? p.d.replace(/\s+/g, ' ').trim() : '';
            if (!d || d.length > LIMITS.d || !D_OK.test(d)) continue;
            total += d.length; if (total > LIMITS.total) break;
            const m = Array.isArray(p.m) && p.m.length === 6 && p.m.every(v => Number.isFinite(num(v))) ? p.m.map(v => Math.round(num(v) * 10000) / 10000) : null;
            paths.push({d, ...(p.eo ? {eo: 1} : {}), ...(m && !(m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0) ? {m} : {})});
        }
        const vb = Array.isArray(raw.vb) && raw.vb.length === 4 ? raw.vb.map(num) : null;
        if (!paths.length || !vb || !vb.every(Number.isFinite) || vb[2] <= 0 || vb[3] <= 0) return null;
        return {name, kind: 'path', paths, vb: vb.map(v => Math.round(v * 1000) / 1000), ...(src ? {src} : {})};
    }
    function shapeStore() {
        const v = lsGet(SHAPES_KEY, {}) || {};
        const custom = {};
        if (v.custom && typeof v.custom === 'object' && !Array.isArray(v.custom)) Object.entries(v.custom).forEach(([id, s]) => { if (ID_OK.test(id)) { const c = cleanShape(s); if (c) custom[id] = c; } });
        const ids = [...BUILTIN_KEYS, ...Object.keys(custom)];
        const order = Array.isArray(v.order) ? v.order.filter((id, i, l) => ids.includes(id) && l.indexOf(id) === i) : [];
        const hidden = Array.isArray(v.hidden) ? v.hidden.filter(id => ids.includes(id)) : [];
        return {custom, order, hidden};
    }
    const saveShapeStore = st => lsSet(SHAPES_KEY, {custom: st.custom, order: st.order, hidden: st.hidden});
    /** la liste dans l'ordre choisi : [{id, name, own, hidden, shape}] */
    function orderedShapes(st = shapeStore()) {
        const ids = [...BUILTIN_KEYS, ...Object.keys(st.custom)];
        return [...st.order, ...ids.filter(id => !st.order.includes(id))].map(id => {
            const b = BUILTIN.find(x => x[0] === id);
            return b ? {id, name: b[1], own: false, hidden: st.hidden.includes(id), shape: {kind: 'poly', pts: b[2]}, tilted: id === 'tilted'}
                : {id, name: st.custom[id].name, own: true, hidden: st.hidden.includes(id), shape: st.custom[id]};
        });
    }
    /** la boîte carrée qui contient toute la forme (centrée) */
    function squareVb(vb) { const [x, y, w, h] = vb, s = Math.max(w, h); return [x - (s - w) / 2, y - (s - h) / 2, s, s].map(v => Math.round(v * 1000) / 1000); }
    function shapeInner(s) {
        if (s.kind === 'poly') return {vb: '0 0 100 100', body: `<polygon points="${s.pts.map(p => p.map(r2).join(',')).join(' ')}"/>`};
        return {vb: squareVb(s.vb).join(' '), body: s.paths.map(p => `<path d="${esc(p.d)}"${p.eo ? ' fill-rule="evenodd"' : ''}${p.m ? ` transform="matrix(${p.m.join(' ')})"` : ''}/>`).join('')};
    }
    /** petit dessin de la forme (aperçu dans les listes et les fenêtres) */
    function shapeSvg(s, size = 26, fill = 'currentColor') {
        const {vb, body} = shapeInner(s);
        return `<svg class="lc-shp-svg" viewBox="${vb}" width="${size}" height="${size}" aria-hidden="true" fill="${fill}">${body}</svg>`;
    }
    /** la règle CSS d'une forme à soi */
    function shapeCss(id, s) {
        const sel = `:root[data-avatar-shape="${id}"] .card-index,:root[data-avatar-shape="${id}"] .person-card-initial,.lc-shp-demo[data-shp="${id}"] .lc-shp-av`;
        if (s.kind === 'poly') return `${sel}{transform:none;border-radius:0;clip-path:polygon(${s.pts.map(([x, y]) => `${r2(x)}% ${r2(y)}%`).join(',')});-webkit-mask:none;mask:none}`;
        const {vb, body} = shapeInner(s);
        const url = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" preserveAspectRatio="xMidYMid meet">${body}</svg>`)}")`;
        return `${sel}{transform:none;border-radius:0;clip-path:none;-webkit-mask:${url} center/100% 100% no-repeat;mask:${url} center/100% 100% no-repeat}`;
    }
    function injectShapeCss() {
        const st = shapeStore();
        let el = document.getElementById('lc-avatar-shapes-css');
        if (!el) { el = document.createElement('style'); el.id = 'lc-avatar-shapes-css'; document.head.appendChild(el); }
        el.textContent = Object.entries(st.custom).map(([id, s]) => shapeCss(id, s)).join('\n');
    }
    const newShapeId = () => `shp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    function addShape(shape, {id = ''} = {}) {
        const c = cleanShape(shape); if (!c) { toast('Cette forme n’est pas lisible.', 'error'); return ''; }
        const st = shapeStore(), sid = id && st.custom[id] ? id : newShapeId();
        st.custom[sid] = c;
        if (!st.order.includes(sid)) st.order = [...orderedShapes(st).map(x => x.id).filter(x => x !== sid), sid];
        st.hidden = st.hidden.filter(x => x !== sid);
        if (JSON.stringify(st).length > 400000) { toast('Trop de formes enregistrées : supprime-en avant d’en ajouter.', 'error'); return ''; }
        if (!saveShapeStore(st)) return '';
        injectShapeCss();
        return sid;
    }

    /* ── Le menu « Forme des avatars » du formulaire de l'Apparence ── */
    function avatarSelectHtml(current) {
        const list = orderedShapes(), cur = list.some(s => s.id === current) ? current : 'tilted';
        const opt = s => `<option value="${esc(s.id)}" ${s.id === cur ? 'selected' : ''}>${esc(s.name)}</option>`;
        const shown = list.filter(s => !s.hidden || s.id === cur), mine = shown.filter(s => s.own);
        return shown.filter(s => !s.own).map(opt).join('') + (mine.length ? `<optgroup label="✎ Mes formes">${mine.map(opt).join('')}</optgroup>` : '')
            + '<option value="__new">＋ Créer une forme…</option>';
    }
    function refreshAvatarSelect() {
        const sel = document.querySelector('#design-form select[name="avatarShape"]'); if (!sel) return;
        // la forme enregistrée d'abord : le menu d'app.js ne connaît que les formes de l'app, donc sel.value y retombe sur « Carré penché » pour une forme à soi
        let saved = ''; try { saved = String(JSON.parse(localStorage.getItem('genealogie-design') || '{}')?.avatarShape || ''); } catch (_) {}
        const cur = sel.dataset.lcCur || saved || sel.value || 'tilted';
        sel.innerHTML = avatarSelectHtml(cur); sel.dataset.lcCur = sel.value;
    }

    /* ── Le cadre « 🔷 Formes des avatars » (ranger, cacher, ajouter, ↺ Remettre comme au départ) ── */
    function shapesPanelHtml() {
        const list = orderedShapes(), open = uiSections()['avatar-shapes-manage'] ? ' open' : '';
        return `<section class="maintenance-panel my-presets lc-shapes" id="lc-avatar-shapes"><div class="item-title-row"><h3 data-help="La forme des petits carrés numérotés des blocs et des initiales des fiches. Ajoute tes formes (bibliothèque des tableaux, polygone dessiné, SVG importé), range la liste du menu « Forme des avatars », cache celles qui ne te servent pas." data-help-faq="forme des avatars">🔷 Formes des avatars</h3><div class="page-actions"><button type="button" class="button small" data-shp-new>＋ Nouvelle forme…</button>${A().settingImportButton ? A().settingImportButton('data-shp-import') : ''}</div></div>
            <details class="my-presets-manage" data-ui-section="avatar-shapes-manage"${open}><summary>⚙️ Gérer les formes (${list.length})</summary>
            <p class="muted">Les formes proposées dans « Forme des avatars » : coche celles à montrer, range-les en glissant ⠿ (ou ↑ ↓). Celles de l’app ne se suppriment pas : décoche-les pour les cacher. Les tiennes (✎) se modifient, se dupliquent, s’exportent.</p>
            <div class="order-list my-preset-list lc-shp-list" data-shp-list>${list.map((s, i) => `<div class="order-row has-visibility" data-order-key="${esc(s.id)}"><span class="order-grip" draggable="true" aria-hidden="true">⠿</span><span class="order-number">${String(i + 1).padStart(2, '0')}</span><label class="order-visible" title="${s.id === 'tilted' ? 'Toujours proposée (la forme de départ)' : 'Proposer dans le menu'}"><input type="checkbox" data-shp-show aria-label="Montrer « ${esc(s.name)} »" ${s.hidden ? '' : 'checked'} ${s.id === 'tilted' ? 'disabled' : ''}></label><span class="lc-shp-thumb">${shapeSvg(s.shape, 24)}</span><b>${esc(s.name)}${s.own ? ' <small class="muted">✎</small>' : ''}${s.shape.src ? ` <small class="muted">· ${esc(s.shape.src)}</small>` : ''}</b>
                <span class="page-actions"><button type="button" class="icon-button small" data-shp-move="-1" title="Monter" aria-label="Monter">↑</button><button type="button" class="icon-button small" data-shp-move="1" title="Descendre" aria-label="Descendre">↓</button>${s.own ? '<button type="button" class="button small secondary" data-shp-edit>Modifier</button>' : ''}<button type="button" class="button small secondary" data-shp-dup title="Créer une forme à partir de celle-ci">Dupliquer</button>${s.own && A().settingExportButton ? A().settingExportButton('data-shp-export') : ''}${s.own ? '<button type="button" class="button small secondary danger" data-shp-del>Supprimer</button>' : ''}</span></div>`).join('')}</div>
            <div class="page-actions"><button type="button" class="button small" data-shp-saveorder>Enregistrer l’ordre et les formes montrées</button><button type="button" class="button small secondary" data-shp-reset title="La liste de départ : l’ordre de l’app et toutes les formes montrées (tes formes restent, à la fin)">↺ Remettre comme au départ</button></div></details></section>`;
    }
    function renumber(list) { [...list.querySelectorAll('.order-row')].forEach((row, i) => { const n = row.querySelector('.order-number'); if (n) n.textContent = String(i + 1).padStart(2, '0'); }); }
    function redrawDesignBits() {
        const box = document.getElementById('lc-avatar-shapes');
        if (box) { const open = box.querySelector('details')?.open; box.outerHTML = shapesPanelHtml(); const nb = document.getElementById('lc-avatar-shapes'); if (open) nb.querySelector('details').open = true; bindShapesPanel(nb); UI().scan?.(nb); }
        refreshAvatarSelect();
    }
    function bindShapesPanel(box) {
        if (!box) return;
        const list = box.querySelector('[data-shp-list]');
        if (list && A().setupDragOrder) A().setupDragOrder(list);
        box.querySelector('details')?.addEventListener('toggle', e => { const s = uiSections(); s['avatar-shapes-manage'] = e.target.open; lsSet('genealogie-ui-sections', s); });
        box.addEventListener('click', async e => {
            const b = e.target.closest('button'); if (!b || !box.contains(b)) return;
            if (b.matches('[data-shp-new]')) return openShapeEditor({});
            if (b.matches('[data-shp-import]')) return importShapeFile();
            if (b.matches('[data-shp-move]')) { const row = b.closest('.order-row'); if (b.dataset.shpMove === '-1' && row.previousElementSibling) row.after(row.previousElementSibling); else if (b.dataset.shpMove === '1' && row.nextElementSibling) row.before(row.nextElementSibling); renumber(list); b.focus(); return; }
            if (b.matches('[data-shp-saveorder]')) {
                const st = shapeStore(); st.order = [...list.querySelectorAll('.order-row')].map(r => r.dataset.orderKey);
                st.hidden = [...list.querySelectorAll('.order-row')].filter(r => !r.querySelector('[data-shp-show]').checked && r.dataset.orderKey !== 'tilted').map(r => r.dataset.orderKey);
                if (saveShapeStore(st)) { toast('Liste des formes enregistrée.', 'success'); redrawDesignBits(); }
                return;
            }
            if (b.matches('[data-shp-reset]')) {
                return A().undoLocalChange?.('Liste des formes remise comme au départ', [SHAPES_KEY], () => { const st = shapeStore(); st.order = []; st.hidden = []; saveShapeStore(st); redrawDesignBits(); }, () => { injectShapeCss(); redrawDesignBits(); });
            }
            const id = b.closest('[data-order-key]')?.dataset.orderKey; if (!id) return;
            const item = orderedShapes().find(s => s.id === id); if (!item) return;
            if (b.matches('[data-shp-edit]')) return openShapeEditor({id});
            if (b.matches('[data-shp-dup]')) return openShapeEditor({from: item});
            if (b.matches('[data-shp-export]')) return A().exportSettingFile?.('avatar-shapes', item.name, {shape: item.shape});
            if (b.matches('[data-shp-del]')) {
                return A().undoLocalChange?.(`Forme « ${item.name} » supprimée`, [SHAPES_KEY], () => {
                    const st = shapeStore(); delete st.custom[id]; st.order = st.order.filter(x => x !== id); st.hidden = st.hidden.filter(x => x !== id); saveShapeStore(st);
                    injectShapeCss(); redrawDesignBits();
                }, () => { injectShapeCss(); redrawDesignBits(); });
            }
        });
    }
    async function importShapeFile() {
        const got = await A().importSettingFile?.('avatar-shapes', {names: orderedShapes().map(s => s.name), check: d => !!cleanShape(d?.shape)});
        if (!got) return;
        const id = addShape({...got.donnees.shape, name: got.nom});
        if (id) { toast(`Forme « ${got.nom} » importée : elle est dans le menu « Forme des avatars ».`, 'success'); redrawDesignBits(); }
    }

    /* ── La fenêtre « Nouvelle forme » : bibliothèque, polygone dessiné, SVG importé ── */
    function libraryShapes() {
        const kit = ext.boardKit;
        const cats = (kit?.CATS || []).filter(c => c[0] !== 'mine');
        let shapes = Array.isArray(kit?.SHAPES) ? kit.SHAPES : [];
        if (!shapes.length) for (const [c, rows] of Object.entries(ext.boardShapesExtra || {})) for (const [k, n, d, tags] of rows || []) shapes.push({k, n, c, d, eo: false, tags: tags || '', s: 24});
        shapes = shapes.filter(s => s && typeof s.d === 'string' && D_OK.test(s.d) && s.d.length <= LIMITS.d);
        const catName = Object.fromEntries(cats.map(c => [c[0], `${c[2] || ''} ${c[1]}`.trim()]));
        const used = [...new Set(shapes.map(s => s.c))];
        return {shapes, cats: used.map(c => [c, catName[c] || c])};
    }
    const POLY_MODELS = [['Triangle', () => ngon(3)], ['Carré', () => sq()], ['Pentagone', () => ngon(5)], ['Hexagone', () => ngon(6, 0)], ['Octogone', () => ngon(8, -67.5)],
        ['Étoile', () => starPts(5)], ['Écusson', () => [[0, 0], [100, 0], [100, 55], [50, 100], [0, 55]]], ['Maison', () => [[50, 0], [100, 40], [100, 100], [0, 100], [0, 40]]], ['Goutte', () => ngon(24).map(([x, y]) => y < 40 ? [50 + (x - 50) * (y / 40) ** .7, y] : [x, y])]];

    /** SVG collé ou importé → chemins seuls (aucun script, aucun lien, aucune image, aucun style) */
    function svgToShape(text) {
        const out = {ok: false, msg: '', shape: null, kept: 0, dropped: 0};
        if (typeof text !== 'string' || !text.trim()) { out.msg = 'Rien à lire.'; return out; }
        if (text.length > 2000000) { out.msg = 'Ce fichier est trop gros (2 Mo au plus).'; return out; }
        let doc;
        try { doc = new DOMParser().parseFromString(text, 'image/svg+xml'); } catch (_) { doc = null; }
        const root = doc?.documentElement;
        if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) { out.msg = 'Ce n’est pas un dessin SVG lisible.'; return out; }
        const NS = 'http://www.w3.org/2000/svg';
        const host = document.createElementNS(NS, 'svg');
        host.setAttribute('style', 'position:absolute;left:-99999px;top:0;width:10px;height:10px;overflow:hidden;visibility:hidden');
        const T_OK = /^\s*((matrix|translate|scale|rotate|skewX|skewY)\s*\(\s*[-+0-9.eE,\s]*\)\s*,?\s*)*$/;
        const SKIP = new Set(['defs', 'clippath', 'mask', 'symbol', 'pattern', 'marker', 'lineargradient', 'radialgradient', 'filter', 'style', 'script', 'title', 'desc', 'metadata', 'foreignobject', 'text', 'image', 'use', 'a', 'switch']);
        const n = (el, a) => { const v = parseFloat(el.getAttribute(a) || '0'); return Number.isFinite(v) ? v : 0; };
        const evenOdd = el => /evenodd/i.test(el.getAttribute('fill-rule') || '') || /fill-rule\s*:\s*evenodd/i.test(el.getAttribute('style') || '');
        const toD = el => {
            const t = el.nodeName.toLowerCase();
            if (t === 'path') return el.getAttribute('d') || '';
            if (t === 'polygon' || t === 'polyline') { const p = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number); if (p.length < 6 || p.some(v => !Number.isFinite(v))) return ''; let d = ''; for (let i = 0; i + 1 < p.length; i += 2) d += `${i ? 'L' : 'M'}${p[i]} ${p[i + 1]}`; return d + 'Z'; }
            if (t === 'rect') { const x = n(el, 'x'), y = n(el, 'y'), w = n(el, 'width'), h = n(el, 'height'); return w > 0 && h > 0 ? `M${x} ${y}H${x + w}V${y + h}H${x}Z` : ''; }
            if (t === 'circle' || t === 'ellipse') { const cx = n(el, 'cx'), cy = n(el, 'cy'), rx = t === 'circle' ? n(el, 'r') : n(el, 'rx'), ry = t === 'circle' ? rx : n(el, 'ry'); return rx > 0 && ry > 0 ? `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z` : ''; }
            return null;
        };
        let made = 0;
        const walk = (src, dst) => {
            for (const el of [...src.children]) {
                const t = el.nodeName.toLowerCase();
                if (SKIP.has(t) || (el.getAttribute('display') || '') === 'none') { out.dropped++; continue; }
                const tr = el.getAttribute('transform') || '';
                const okTr = tr && T_OK.test(tr) ? tr : '';
                if (tr && !okTr) out.dropped++;
                if (t === 'g' || t === 'svg') { const g = document.createElementNS(NS, 'g'); if (okTr) g.setAttribute('transform', okTr); if (t === 'svg' && (el.getAttribute('x') || el.getAttribute('y'))) g.setAttribute('transform', `translate(${n(el, 'x')} ${n(el, 'y')}) ${okTr}`); dst.appendChild(g); walk(el, g); continue; }
                if (made >= LIMITS.paths) { out.dropped++; continue; } // au-delà de 400 chemins, rien n'est gardé : inutile de les poser (fluidité)
                const d = toD(el);
                if (d === null) { out.dropped++; continue; }
                if (d.length > LIMITS.d * 2) { out.dropped++; continue; } // un chemin énorme : jeté avant les expressions régulières
                const dd = String(d).replace(/\s+/g, ' ').trim();
                if (!dd || !D_OK.test(dd) || dd.length > LIMITS.d) { out.dropped++; continue; }
                const p = document.createElementNS(NS, 'path'); p.setAttribute('d', dd); if (okTr) p.setAttribute('transform', okTr); if (evenOdd(el) || evenOdd(src)) p.dataset.eo = '1';
                dst.appendChild(p); made++;
            }
        };
        const top = document.createElementNS(NS, 'g'); host.appendChild(top);
        walk(root, top);
        document.body.appendChild(host);
        try {
            const paths = []; let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, total = 0;
            for (const p of host.querySelectorAll('path')) {
                if (paths.length >= LIMITS.paths) { out.dropped++; continue; }
                let bb; try { bb = p.getBBox(); } catch (_) { bb = null; }
                if (!bb || !(bb.width > 0 || bb.height > 0)) { out.dropped++; continue; }
                const m = p.getCTM(); const hm = host.getCTM();
                const mm = m && hm ? hm.inverse().multiply(m) : m;
                const mat = mm ? [mm.a, mm.b, mm.c, mm.d, mm.e, mm.f] : [1, 0, 0, 1, 0, 0];
                for (const [x, y] of [[bb.x, bb.y], [bb.x + bb.width, bb.y], [bb.x, bb.y + bb.height], [bb.x + bb.width, bb.y + bb.height]]) {
                    const X = mat[0] * x + mat[2] * y + mat[4], Y = mat[1] * x + mat[3] * y + mat[5];
                    minX = Math.min(minX, X); minY = Math.min(minY, Y); maxX = Math.max(maxX, X); maxY = Math.max(maxY, Y);
                }
                const d = p.getAttribute('d'); total += d.length; if (total > LIMITS.total) { out.dropped++; break; }
                paths.push({d, eo: p.dataset.eo === '1', m: mat});
            }
            if (!paths.length) { out.msg = 'Aucun chemin à garder dans ce dessin (il faut des formes pleines : path, polygon, rect, circle…).'; return out; }
            const w = maxX - minX, h = maxY - minY;
            if (!(w > 0) || !(h > 0)) { out.msg = 'Ce dessin est plat : il n’a pas de surface.'; return out; }
            out.shape = cleanShape({name: '', kind: 'path', paths, vb: [minX, minY, w, h]});
            out.kept = out.shape ? out.shape.paths.length : 0;
            out.ok = !!out.shape; if (!out.ok) out.msg = 'Ce dessin n’a pas pu être nettoyé.';
            return out;
        } finally { host.remove(); }
    }

    function openShapeEditor({id = '', from = null, onSaved = null} = {}) {
        const st = shapeStore(), own = id && st.custom[id] ? st.custom[id] : null;
        const start = own || from?.shape || null;
        let shape = start ? JSON.parse(JSON.stringify(start)) : null;
        let pts = shape?.kind === 'poly' ? shape.pts.map(p => [...p]) : [];
        let tab = shape?.kind === 'poly' ? 'draw' : shape ? 'lib' : 'lib';
        if (shape?.kind === 'path' && !shape.src) tab = 'svg';
        let lib = null, libCat = '', libQ = '', libMax = 120, libPick = '';
        const dlg = document.createElement('dialog'); dlg.className = 'modal lc-shp-editor';
        const title = own ? `Modifier « ${esc(own.name)} »` : 'Nouvelle forme d’avatar';
        dlg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">APPARENCE · FORME DES AVATARS</span><h2>${title}</h2></div><button type="button" class="icon-button" data-x aria-label="Fermer">×</button></div>
            <div class="lc-shp-grid"><div class="lc-shp-main">
                <div class="form-grid one-column"><label class="lc-shp-name">Nom<input data-f="name" maxlength="60" required value="${esc(own?.name || (from ? `${from.name} (ma version)` : ''))}" placeholder="Ex. Blason, Médaillon, Feuille…"></label></div>
                <div class="ui-tabs lc-shp-tabs" role="tablist"><button type="button" role="tab" data-tab="lib">📚 Bibliothèque</button><button type="button" role="tab" data-tab="draw">✏️ Dessiner un polygone</button><button type="button" role="tab" data-tab="svg">⤒ Importer un SVG</button></div>
                <div data-pane="lib" hidden><div class="lc-shp-libbar"><input type="search" data-lib-q placeholder="Chercher… (cœur, arbre, blason, étoile)" aria-label="Chercher une forme"></div><div class="ui-filters lc-shp-cats" data-lib-cats></div><div class="lc-shp-lib" data-lib role="listbox" aria-label="Formes de la bibliothèque"></div><div data-lib-more></div></div>
                <div data-pane="draw" hidden><p class="muted lc-shp-help">Clique dans le cadre pour poser les points, dans l’ordre du tour. Glisse un point pour le déplacer ; double-clic sur un point pour l’enlever.</p>
                    <div class="lc-shp-drawrow"><svg class="lc-shp-canvas" data-canvas viewBox="-4 -4 108 108" role="img" aria-label="Cadre de dessin du polygone"></svg>
                    <div class="lc-shp-drawside"><span class="section-label">Modèles</span><div class="lc-shp-models">${POLY_MODELS.map(([n], i) => `<button type="button" class="button small secondary" data-model="${i}">${esc(n)}</button>`).join('')}</div>
                        <label class="ui-toggle"><input type="checkbox" data-snap checked><i></i><span>Aimanter à la grille (5 %)</span></label>
                        <div class="page-actions"><button type="button" class="button small secondary" data-undo-pt>↶ Enlever le dernier point</button><button type="button" class="button small secondary" data-clear-pts>🗑 Tout effacer</button></div>
                        <label>Points (x y, de 0 à 100, un par ligne)<textarea data-pts rows="5" spellcheck="false"></textarea></label></div></div></div>
                <div data-pane="svg" hidden><p class="muted lc-shp-help">Un dessin SVG (logo, pictogramme…) : seuls ses chemins pleins sont gardés. Les scripts, liens, images, textes et styles sont retirés.</p>
                    <div data-svg-drop></div>
                    <div class="form-grid one-column"><label>ou colle le code SVG ici<textarea data-svg-text rows="5" spellcheck="false" placeholder="&lt;svg …&gt;…&lt;/svg&gt;"></textarea></label></div>
                    <div class="page-actions"><button type="button" class="button small secondary" data-svg-read>Lire ce SVG</button></div><div data-svg-msg></div></div>
            </div>
            <aside class="lc-shp-aside"><span class="section-label">Aperçu</span><div class="lc-shp-preview" data-preview></div><div data-msg></div></aside></div>
            <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-x>Annuler</button><button type="submit" class="button">${own ? 'Enregistrer' : 'Créer la forme'}</button></div></form>`;
        document.body.appendChild(dlg);
        const q = s => dlg.querySelector(s);
        const nameInput = q('[data-f="name"]');
        if (own || from) nameInput.dataset.typed = '1';
        nameInput.addEventListener('input', () => { nameInput.dataset.typed = '1'; });
        const suggested = {lib: '', draw: '', svg: ''};
        const setName = (n, t = tab) => { suggested[t] = String(n || '').slice(0, 60); if (!nameInput.dataset.typed && n && t === tab) nameInput.value = suggested[t]; };
        const current = () => tab === 'draw' ? (pts.length >= 3 ? {kind: 'poly', pts} : null) : shape && shape.kind === 'path' ? shape : null;
        const previewCss = document.createElement('style'); dlg.appendChild(previewCss);
        const paintPreview = () => {
            const s = cleanShape({...(current() || {}), name: 'x'});
            previewCss.textContent = s ? shapeCss('__preview', s) : '';
            q('[data-preview]').innerHTML = s ? `<div class="lc-shp-demo lc-shp-demo-big" data-shp="__preview"><span class="lc-shp-av card-index">01</span><span class="lc-shp-av person-card-initial">LB</span><span class="lc-shp-av person-card-initial lc-shp-xl">LB</span></div><p class="muted">Comme dans les blocs (01) et sur les fiches (initiales).</p>`
                : `<p class="muted">${tab === 'draw' ? 'Pose au moins 3 points.' : tab === 'svg' ? 'Choisis ou colle un dessin SVG.' : 'Choisis une forme dans la bibliothèque.'}</p>`;
        };
        /* onglets (C5) */
        const showTab = t => { tab = t; if (!nameInput.dataset.typed && suggested[t]) nameInput.value = suggested[t]; dlg.querySelectorAll('[data-tab]').forEach(b => { b.classList.toggle('is-active', b.dataset.tab === t); b.setAttribute('aria-selected', String(b.dataset.tab === t)); }); dlg.querySelectorAll('[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== t; });
            if (t === 'lib') paintLib(); if (t === 'draw') paintCanvas(); paintPreview(); };
        dlg.querySelector('.lc-shp-tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); });
        /* bibliothèque */
        function paintLib() {
            lib = lib || libraryShapes();
            const words = fold(libQ).split(/\s+/).filter(Boolean);
            const match = s => words.every(w => fold(`${s.n} ${s.tags || ''}`).includes(w));
            const found = lib.shapes.filter(match);
            const counts = {}; found.forEach(s => { counts[s.c] = (counts[s.c] || 0) + 1; });
            q('[data-lib-cats]').innerHTML = `<button type="button" data-cat="" class="${libCat ? '' : 'is-active'}">Tout (${found.length})</button>` + lib.cats.filter(([c]) => counts[c]).map(([c, n]) => `<button type="button" data-cat="${esc(c)}" class="${libCat === c ? 'is-active' : ''}">${esc(n)} (${counts[c]})</button>`).join('');
            const rows = found.filter(s => !libCat || s.c === libCat);
            q('[data-lib]').innerHTML = rows.length ? rows.slice(0, libMax).map(s => `<button type="button" class="lc-shp-tile${libPick === s.k ? ' is-active' : ''}" role="option" aria-selected="${libPick === s.k}" data-lib-k="${esc(s.k)}" title="${esc(s.n)}"><svg viewBox="0 0 ${s.s || 100} ${s.s || 100}" aria-hidden="true"><path d="${esc(s.d)}"${s.eo ? ' fill-rule="evenodd"' : ''}/></svg><span>${esc(s.n)}</span></button>`).join('')
                : `<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">🧱</span><span class="empty-line-text">Aucune forme pour « ${esc(libQ)} ». Essaie un autre mot (cœur, arbre, étoile, croix…).</span></p>`;
            const rest = rows.length - Math.min(rows.length, libMax);
            q('[data-lib-more]').innerHTML = rest > 0 ? `<button type="button" class="button small secondary" data-lib-next>Voir les ${Math.min(rest, 120)} suivantes ↓</button> <small class="muted">${plural(rows.length, 'forme')}</small>` : '';
        }
        q('[data-lib-q]').addEventListener('input', e => { libQ = e.target.value; libMax = 120; paintLib(); });
        q('[data-pane="lib"]').addEventListener('click', e => {
            const c = e.target.closest('[data-cat]'); if (c) { libCat = c.dataset.cat; libMax = 120; paintLib(); return; }
            if (e.target.closest('[data-lib-next]')) { libMax += 120; paintLib(); return; }
            const t = e.target.closest('[data-lib-k]'); if (!t) return;
            const s = lib.shapes.find(x => x.k === t.dataset.libK); if (!s) return;
            libPick = s.k; const box = s.s || 100;
            shape = {kind: 'path', paths: [{d: s.d, eo: s.eo ? 1 : 0}], vb: [0, 0, box, box], src: `Tableaux · ${s.n}`};
            setName(s.n);
            dlg.querySelectorAll('[data-lib-k]').forEach(b => { const on = b === t; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', String(on)); });
            paintPreview();
        });
        q('[data-lib]').addEventListener('keydown', e => {
            const tiles = [...dlg.querySelectorAll('[data-lib-k]')], i = tiles.indexOf(document.activeElement); if (i < 0) return;
            const cols = Math.max(1, Math.round(q('[data-lib]').clientWidth / (tiles[0].offsetWidth || 80)));
            const go = {ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols}[e.key];
            if (go) { e.preventDefault(); tiles[Math.max(0, Math.min(tiles.length - 1, i + go))].focus(); }
        });
        /* dessin du polygone */
        const canvas = q('[data-canvas]');
        const ptsText = () => pts.map(p => `${r2(p[0])} ${r2(p[1])}`).join('\n');
        let drag = -1;
        function paintCanvas() {
            const grid = Array.from({length: 21}, (_, i) => i * 5).map(v => `<line x1="${v}" y1="0" x2="${v}" y2="100" class="${v % 25 ? 'g1' : 'g2'}"/><line x1="0" y1="${v}" x2="100" y2="${v}" class="${v % 25 ? 'g1' : 'g2'}"/>`).join('');
            canvas.innerHTML = `<rect x="0" y="0" width="100" height="100" class="bg"/>${grid}${pts.length >= 3 ? `<polygon class="fill" points="${pts.map(p => p.join(',')).join(' ')}"/>` : pts.length === 2 ? `<polyline class="line" points="${pts.map(p => p.join(',')).join(' ')}"/>` : ''}${pts.map((p, i) => `<circle class="pt${i === pts.length - 1 ? ' last' : ''}" data-pt="${i}" cx="${p[0]}" cy="${p[1]}" r="2.6"><title>Point ${i + 1} : ${r2(p[0])}, ${r2(p[1])}</title></circle>`).join('')}`;
            const ta = q('[data-pts]'); if (document.activeElement !== ta) ta.value = ptsText();
        }
        const at = e => { const r = canvas.getBoundingClientRect(); let x = (e.clientX - r.left) / r.width * 108 - 4, y = (e.clientY - r.top) / r.height * 108 - 4; if (q('[data-snap]').checked) { x = Math.round(x / 5) * 5; y = Math.round(y / 5) * 5; } return [Math.max(0, Math.min(100, Math.round(x * 10) / 10)), Math.max(0, Math.min(100, Math.round(y * 10) / 10))]; };
        canvas.addEventListener('pointerdown', e => {
            const c = e.target.closest('[data-pt]');
            if (c) { drag = Number(c.dataset.pt); canvas.setPointerCapture?.(e.pointerId); e.preventDefault(); return; }
            if (pts.length >= LIMITS.pts) { toast(`${LIMITS.pts} points au plus.`, 'error'); return; }
            pts.push(at(e)); paintCanvas(); paintPreview();
        });
        canvas.addEventListener('pointermove', e => { if (drag < 0) return; pts[drag] = at(e); paintCanvas(); paintPreview(); });
        const end = () => { drag = -1; };
        canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
        canvas.addEventListener('dblclick', e => { const c = e.target.closest('[data-pt]'); if (!c) return; pts.splice(Number(c.dataset.pt), 1); paintCanvas(); paintPreview(); });
        q('[data-pane="draw"]').addEventListener('click', e => {
            const m = e.target.closest('[data-model]'); if (m) { pts = POLY_MODELS[Number(m.dataset.model)][1]().map(p => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]); setName(POLY_MODELS[Number(m.dataset.model)][0]); paintCanvas(); paintPreview(); return; }
            if (e.target.closest('[data-undo-pt]')) { pts.pop(); paintCanvas(); paintPreview(); return; }
            if (e.target.closest('[data-clear-pts]')) { const old = pts; pts = []; paintCanvas(); paintPreview(); if (old.length) A().undoToast?.('Points effacés', {undo: () => { pts = old; paintCanvas(); paintPreview(); }, redo: () => { pts = []; paintCanvas(); paintPreview(); }}); }
        });
        q('[data-pts]').addEventListener('input', e => {
            pts = e.target.value.split('\n').map(l => l.trim().split(/[\s,;]+/).map(Number)).filter(p => p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])).slice(0, LIMITS.pts)
                .map(([x, y]) => [Math.round(Math.max(0, Math.min(100, x)) * 10) / 10, Math.round(Math.max(0, Math.min(100, y)) * 10) / 10]);
            paintCanvas(); paintPreview(); });
        /* SVG */
        const svgRead = text => {
            const r = svgToShape(text); const box = q('[data-svg-msg]');
            const note = (k, m) => UI().notice ? UI().notice(k, m) : `<p>${esc(m)}</p>`;
            if (!r.ok) { box.innerHTML = note('error', r.msg); return; }
            shape = {...r.shape, src: 'SVG importé'}; box.innerHTML = note('ok', `${plural(r.kept, 'chemin gardé', 'chemins gardés')}${r.dropped ? ` · ${plural(r.dropped, 'élément retiré', 'éléments retirés')} (scripts, textes, images, styles…)` : ''}.`);
            paintPreview();
        };
        q('[data-svg-read]').addEventListener('click', () => svgRead(q('[data-svg-text]').value));
        const svgFile = async f => {
            if (!f) return;
            if (!/\.svg$/i.test(f.name || '') && f.type !== 'image/svg+xml') { q('[data-svg-msg]').innerHTML = UI().notice ? UI().notice('error', 'Il faut un fichier SVG (.svg).') : ''; return; }
            if (f.size > 2000000) { q('[data-svg-msg]').innerHTML = UI().notice ? UI().notice('error', 'Ce fichier est trop gros (2 Mo au plus).') : ''; return; }
            const text = await f.text(); setName(String(f.name || '').replace(/\.svg$/i, ''), 'svg'); svgRead(text);
        };
        if (UI().dropZone) q('[data-svg-drop]').appendChild(UI().dropZone({accept: '.svg,image/svg+xml', multiple: false, text: '📁 Glisse un fichier SVG ici, colle-le (⌘V) ou choisis-le', hint: 'Seuls ses chemins pleins sont gardés : pas de script, d’image ni de texte.', onFiles: files => svgFile([...(files || [])][0])}));
        else q('[data-svg-drop]').innerHTML = '<input type="file" accept=".svg,image/svg+xml" data-svg-file>';
        q('[data-svg-file]')?.addEventListener('change', e => svgFile(e.target.files?.[0]));
        /* fermer, enregistrer */
        dlg.addEventListener('click', e => { if (e.target.closest('[data-x]')) dlg.close(); });
        q('form').addEventListener('submit', e => {
            e.preventDefault();
            const cur = current();
            if (!cur) { toast(tab === 'draw' ? 'Pose au moins 3 points.' : tab === 'svg' ? 'Choisis d’abord un dessin SVG.' : 'Choisis d’abord une forme.', 'error'); return; }
            const name = nameInput.value.trim().slice(0, 60); if (!name) { nameInput.focus(); return; }
            const sid = addShape({...cur, name}, {id: own ? id : ''});
            if (!sid) return;
            dlg.close();
            toast(own ? `Forme « ${name} » enregistrée.` : `Forme « ${name} » créée : elle est dans le menu « Forme des avatars » (✎ Mes formes).`, 'success');
            redrawDesignBits(); onSaved?.(sid);
        });
        dlg.addEventListener('close', () => dlg.remove());
        dlg.showModal();
        showTab(tab);
        UI().scan?.(dlg);
    }

    /* ═════════════════════════ 2. En-tête de la fiche ═════════════════════════ */
    const HEADER_KEY = 'genealogie-person-header';
    const HEAD_BUTTONS = [
        ['story', '✨', 'Récit d’une vie (diaporama tout fait)', '[data-ss-story-person]'],
        ['bookmark', '🔖', 'Signet (favori)', '[data-toggle-bookmark]'],
        ['delete', '🗑', 'Supprimer la fiche', '[data-delete-person]'],
        ['lock', '🔓', 'Verrouiller / déverrouiller', '[data-toggle-person-lock]'],
        ['history', '🕘', 'Historique de la fiche', '[data-person-history]'],
        ['write', '📝', 'Écrire sur cette personne (traitement de texte)', '[data-wp-write]'],
        ['profils', '🧩', 'Cette personne était… (ses profils)', '[data-lc-pf]'],
    ];
    const HEAD_KEYS = HEAD_BUTTONS.map(b => b[0]);
    function headerCfg() {
        const v = lsGet(HEADER_KEY, {}) || {};
        const order = Array.isArray(v.order) ? v.order.filter((k, i, l) => HEAD_KEYS.includes(k) && l.indexOf(k) === i) : [];
        HEAD_KEYS.forEach((k, i) => { if (!order.includes(k)) order.splice(Math.min(i, order.length), 0, k); });
        return {frame: v.frame === 'hide' ? 'hide' : 'show', order, hidden: Array.isArray(v.hidden) ? v.hidden.filter(k => HEAD_KEYS.includes(k)) : ['profils'], // 🧩 en option : caché tant qu'on ne l'a pas coché
            cols: Number(v.cols) === 2 ? 2 : 1, pf: v.pf === 'badges' ? 'badges' : 'button'};
    }
    const profilsOn = () => !!window.LCNDA_ART?.PF;
    /** le lien « 🧩 Cette personne était… » d'une fiche : sa page de profils, ou le choix des profils s'il n'y en a pas */
    function pfAttrs(detail) {
        const p = detail?.person || {}, list = Array.isArray(detail?.heritage?.profiles) ? detail.heritage.profiles : [];
        const has = list.length || Number(p.is_artist);
        const editable = !Number(p.is_locked) && !p.kiosk && !document.documentElement.classList.contains('base-readonly');
        return has || !editable ? `data-pf-page-pid="${Number(p.id)}" data-pf-view="all"` : `data-pf-choose-pid="${Number(p.id)}"`;
    }
    function applyHeader(detail) {
        const page = document.querySelector('#workspace .person-page'); if (!page) return;
        const hero = page.querySelector('.person-hero'); if (!hero) return;
        const cfg = headerCfg(), p = detail?.person || {};
        page.classList.toggle('lc-hero-off', cfg.frame === 'hide');
        const actions = hero.querySelector('.person-hero-actions'), status = hero.querySelector('.person-hero-status');
        hero.querySelectorAll('[data-lc-pf]').forEach(el => el.remove());
        const pfShown = profilsOn() && p.kind !== 'animal' && p.id && !cfg.hidden.includes('profils');
        if (pfShown && cfg.pf === 'badges' && status) status.insertAdjacentHTML('beforeend', `<button type="button" class="lc-pf-link" data-lc-pf ${pfAttrs(detail)} title="Ouvrir la page « Cette personne était… » (ses profils)">🧩 Cette personne était…</button>`);
        if (!actions) return;
        if (pfShown && cfg.pf === 'button') actions.insertAdjacentHTML('beforeend', `<button type="button" class="icon-action lc-pf-btn" data-lc-pf ${pfAttrs(detail)} title="🧩 Cette personne était… : ouvrir sa page de profils" aria-label="Cette personne était… : ses profils">🧩</button>`);
        const known = new Set();
        cfg.order.forEach(k => {
            const def = HEAD_BUTTONS.find(b => b[0] === k); const el = def && actions.querySelector(`:scope > ${def[3]}`); if (!el) return;
            known.add(el); el.classList.toggle('lc-hide', cfg.hidden.includes(k)); actions.appendChild(el);
        });
        [...actions.children].forEach(el => { if (!known.has(el)) actions.appendChild(el); }); // les boutons d'autres outils restent, à la fin
        actions.classList.toggle('lc-cols-2', cfg.cols === 2);
    }
    ext.afterPerson = ext.afterPerson || [];
    // après les autres outils qui ajoutent leur bouton (✨ du diaporama…) : au tour suivant
    ext.afterPerson.push(detail => { applyHeader(detail); setTimeout(() => applyHeader(detail), 0); });

    function headerPreviewHtml(cfg) {
        const shown = cfg.order.filter(k => !cfg.hidden.includes(k) && (k !== 'profils' || cfg.pf === 'button'));
        const pfBadge = !cfg.hidden.includes('profils') && cfg.pf === 'badges';
        if (cfg.frame === 'hide') return `<div class="lc-hh-prev is-off"><span>Cadre du haut masqué : la fiche commence par les parents, conjoints et enfants, puis les blocs.</span></div>`;
        return `<div class="lc-hh-prev" aria-hidden="true"><div class="lc-hh-id"><span class="lc-hh-av">LB</span><span><small>FICHE INDIVIDUELLE · #3851</small><b>Louise Borie</b></span></div>
            <div class="lc-hh-badges"><span class="lc-hh-b sosa">★ SOSA : 64</span><span class="lc-hh-b">À VÉRIFIER</span><span class="lc-hh-b out">HORS GÉNÉALOGIE</span><span class="lc-hh-b art">🎨 ARTISTE</span>${pfBadge ? '<span class="lc-hh-b pf">🧩 Cette personne était…</span>' : ''}</div>
            <div class="lc-hh-btns${cfg.cols === 2 ? ' lc-cols-2' : ''}">${shown.map(k => `<span class="lc-hh-btn">${HEAD_BUTTONS.find(b => b[0] === k)[1]}</span>`).join('')}</div></div>`;
    }
    function headerPanelHtml() {
        const cfg = headerCfg();
        const row = (k, i) => { const b = HEAD_BUTTONS.find(x => x[0] === k); return `<div class="order-row has-visibility" data-order-key="${k}"><span class="order-grip" draggable="true" aria-hidden="true">⠿</span><span class="order-number">${String(i + 1).padStart(2, '0')}</span><label class="order-visible" title="Afficher ce bouton"><input type="checkbox" data-hh-show aria-label="Afficher « ${esc(b[2])} »" ${cfg.hidden.includes(k) ? '' : 'checked'}></label><span class="lc-hh-ico" aria-hidden="true">${b[1]}</span><b>${esc(b[2])}${k === 'profils' && !profilsOn() ? ' <small class="muted">(outil des profils pas chargé)</small>' : ''}</b><span class="page-actions"><button type="button" class="icon-button small" data-hh-move="-1" title="Monter" aria-label="Monter">↑</button><button type="button" class="icon-button small" data-hh-move="1" title="Descendre" aria-label="Descendre">↓</button></span></div>`; };
        const radio = (name, value, cur, label, help = '') => `<label class="lc-hh-radio"><input type="radio" name="${name}" value="${value}" ${String(cur) === String(value) ? 'checked' : ''}><span>${label}${help ? `<small>${help}</small>` : ''}</span></label>`;
        return `<section class="person-block-config" id="lc-person-header"><header><span class="eyebrow">FICHES PERSONNES ET ANIMAUX</span><h3 data-help="Le grand cadre en haut de chaque fiche : le nom, les badges (Sosa, À vérifier, Hors généalogie, Artiste) et la colonne de boutons carrés. Tu peux le masquer pour une fiche épurée (diaporama), ranger les boutons, les cacher, les mettre sur 2 colonnes." data-help-faq="en-tête de la fiche">En-tête de la fiche</h3><p>Le cadre du haut (nom, badges, boutons carrés) de toutes les fiches de personnes et d’animaux. Glisse les boutons pour changer leur ordre ; décoche un bouton pour le masquer.</p></header>
            <div class="design-order-grid block-grid">
            <section class="maintenance-panel order-editor block-order-editor lc-hh-panel"><div class="item-title-row"><h3>Le cadre du haut</h3></div>
                <fieldset class="lc-hh-set"><legend>Cadre</legend>${radio('lc-hh-frame', 'show', cfg.frame, 'Afficher le cadre (défaut)')}${radio('lc-hh-frame', 'hide', cfg.frame, 'Masquer tout le cadre', 'Fiche épurée, pour un diaporama : ni nom, ni badges, ni boutons en haut.')}</fieldset>
                <fieldset class="lc-hh-set"><legend>Boutons carrés</legend>${radio('lc-hh-cols', 1, cfg.cols, 'Sur 1 colonne (défaut)')}${radio('lc-hh-cols', 2, cfg.cols, 'Sur 2 colonnes')}</fieldset>
                <fieldset class="lc-hh-set"><legend>Lien « 🧩 Cette personne était… »</legend>${radio('lc-hh-pf', 'button', cfg.pf, 'Un bouton carré 🧩, dans la colonne des boutons')}${radio('lc-hh-pf', 'badges', cfg.pf, 'En bas de la colonne des badges', 'Sous À vérifier, Hors généalogie, Artiste.')}<small class="muted">Il est caché au départ : coche « 🧩 » dans la liste des boutons pour le montrer (décoche-le pour le cacher à nouveau). Pas sur les fiches d’animaux.</small></fieldset>
                <span class="section-label">Aperçu</span><div data-hh-preview>${headerPreviewHtml(cfg)}</div>
                <div class="page-actions action-zone"><button class="button small" type="button" data-hh-save>Enregistrer l’en-tête</button><button class="button small secondary" type="button" data-hh-reset>↺ Remettre comme au départ</button></div>
            </section>
            <section class="maintenance-panel order-editor block-order-editor"><div class="item-title-row"><h3>Ordre et visibilité des boutons</h3></div>
                <div class="order-list block-order-list" id="lc-hh-order">${cfg.order.map(row).join('')}</div>
                <div class="page-actions action-zone"><button class="button small" type="button" data-hh-save>Enregistrer l’en-tête</button><button class="button small secondary" type="button" data-hh-reset>↺ Remettre comme au départ</button></div>
            </section></div></section>`;
    }
    function readHeaderPanel(box) {
        const val = n => box.querySelector(`input[name="${n}"]:checked`)?.value;
        const rows = [...box.querySelectorAll('#lc-hh-order .order-row')];
        return {frame: val('lc-hh-frame') === 'hide' ? 'hide' : 'show', cols: val('lc-hh-cols') === '2' ? 2 : 1, pf: val('lc-hh-pf') === 'badges' ? 'badges' : 'button',
            order: rows.map(r => r.dataset.orderKey), hidden: rows.filter(r => !r.querySelector('[data-hh-show]').checked).map(r => r.dataset.orderKey)};
    }
    function bindHeaderPanel(box) {
        if (!box) return;
        const list = box.querySelector('#lc-hh-order');
        if (list && A().setupDragOrder) A().setupDragOrder(list);
        const preview = () => { box.querySelector('[data-hh-preview]').innerHTML = headerPreviewHtml(readHeaderPanel(box)); };
        box.addEventListener('change', preview);
        list?.addEventListener('dragend', preview);
        const redraw = () => { const nb = document.getElementById('lc-person-header'); if (!nb) return; nb.outerHTML = headerPanelHtml(); const fresh = document.getElementById('lc-person-header'); bindHeaderPanel(fresh); UI().scan?.(fresh); };
        const refreshPerson = () => { const det = A().state?.currentPerson; if (det && document.querySelector('#workspace .person-page')) applyHeader(det); };
        box.addEventListener('click', e => {
            const b = e.target.closest('button'); if (!b) return;
            if (b.matches('[data-hh-move]')) { const row = b.closest('.order-row'); if (b.dataset.hhMove === '-1' && row.previousElementSibling) row.after(row.previousElementSibling); else if (b.dataset.hhMove === '1' && row.nextElementSibling) row.before(row.nextElementSibling); renumber(list); preview(); b.focus(); return; }
            if (b.matches('[data-hh-save]')) { if (lsSet(HEADER_KEY, readHeaderPanel(box))) { toast('En-tête des fiches enregistré.', 'success'); refreshPerson(); } return; }
            if (b.matches('[data-hh-reset]')) { A().undoLocalChange?.('En-tête des fiches remis comme au départ', [HEADER_KEY], () => { try { localStorage.removeItem(HEADER_KEY); } catch (_) {} redraw(); refreshPerson(); }, () => { redraw(); refreshPerson(); }); }
        });
    }

    /* ═════════════════════════ Branchements ═════════════════════════ */
    ext.designPanels = ext.designPanels || [];
    ext.designPanels.push(() => headerPanelHtml());
    ext.afterDesign = ext.afterDesign || [];
    ext.afterDesign.push(() => {
        injectShapeCss();
        // formes : le menu et le cadre, juste après « ✎ Mes thèmes »
        const presets = document.getElementById('my-presets');
        if (presets && !document.getElementById('lc-avatar-shapes')) presets.insertAdjacentHTML('afterend', shapesPanelHtml());
        bindShapesPanel(document.getElementById('lc-avatar-shapes'));
        const sel = document.querySelector('#design-form select[name="avatarShape"]');
        if (sel && !sel.dataset.lcDone) {
            sel.dataset.lcDone = '1'; refreshAvatarSelect();
            sel.addEventListener('change', () => {
                if (sel.value !== '__new') { sel.dataset.lcCur = sel.value; return; }
                sel.value = sel.dataset.lcCur || 'tilted';
                openShapeEditor({onSaved: sid => { sel.dataset.lcCur = sid; refreshAvatarSelect(); sel.value = sid; toast('Clique sur « Appliquer » pour utiliser cette forme.'); }});
            });
        }
        // le thème choisi apporte sa couleur principale
        const pre = document.querySelector('#design-form select[name="preset"]');
        if (pre && !pre.dataset.lcDone) {
            pre.dataset.lcDone = '1';
            pre.addEventListener('change', () => { const p = window.LCNDA_ALL_DESIGN_PRESETS?.()[pre.value]; const blue = document.querySelector('#design-form [name="blue"]'); if (p && blue && /^#[0-9a-f]{6}$/i.test(p.blue || '')) { blue.value = p.blue; blue.dispatchEvent(new Event('input', {bubbles: true})); } });
        }
        bindHeaderPanel(document.getElementById('lc-person-header'));
    });
    injectShapeCss();
    window.LCNDA_APPARENCE = {cleanShape, svgToShape, shapeStore, orderedShapes, addShape, headerCfg, applyHeader, openShapeEditor};
})();
