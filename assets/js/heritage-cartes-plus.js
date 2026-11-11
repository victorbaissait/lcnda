/* LCNDA — 🗺️ Cartes en plus, dans la Carte (vague 1) :
 *  ⇆ Comparer deux époques : un deuxième fond sur la même zone, avec un trait vertical à glisser (ou côte à côte, ou en
 *    transparence). Composant commun ext.mapCompare : la Carte s'en sert (crochets ext.mapSetup / ext.mapDraw) et toute carte
 *    à tuiles de l'app peut l'appeler (ext.mapCompare.mount / draw).
 *  🏛 Frontières anciennes : couches à cocher — provinces d'Ancien Régime (≈ 1789) et départements de 1790, dessinés d'après
 *    les départements livrés (assets/data/geo/fr-departements.json ; approximation affichée comme telle : aucune source libre
 *    et officielle de leurs contours n'existe à notre connaissance) ; communes disparues ou fusionnées (historique officiel de
 *    l'INSEE, téléchargé une fois : lib/cartes_plus.php), un clic → leur date et leur commune d'aujourd'hui.
 *  Réglages → « 🏛 Frontières anciennes » (ext.maintenance.frontieres) : télécharger (taille annoncée), empreinte,
 *    retirer avec « ↶ Annuler ».
 * Mode d'emploi : docs/UI.md (« 🗺️ Cartes en plus »). Test : tests/test-cartes-plus-1.js.
 * (Nom de fichier propre à cet outil ; les autres outils de carte sont dans heritage-cartes-outils.js.)
 */
(() => {
    'use strict';
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? v[k] : m)));
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    for (const key of ['mapSetup', 'mapDraw']) ext[key] = ext[key] || [];
    const A = () => window.LCNDA_APP, UI = () => window.LCNDA_UI, S = () => A()?.state || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch (_) { return d; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
    const clamp = (v, a, b) => Math.max(a, Math.min(b, Number.isFinite(v) ? v : a));
    const nfmt = (n, d = 0) => (window.LCNDA_I18N && window.LCNDA_I18N.lang !== 'fr' ? window.LCNDA_I18N.fmtNumber(n, {maximumFractionDigits: d}) : n.toLocaleString('fr-FR', {maximumFractionDigits: d}));
    const chk = c => { const m = String(c || '').match(/^(\w+) publiée par (.+)$/); return m ? i18n('{type} publiée par {from}', {type: m[1], from: i18n(m[2])}) : String(c || ''); }; // 🌐 « sha256 publiée par … » (écrit par le serveur)
    const mo = n => n == null ? '' : n >= 1e6 ? i18n('{n} Mo', {n: nfmt(n / 1048576, 1)}) : i18n('{n} Ko', {n: nfmt(Math.max(1, Math.round(n / 1024)))});

    /* ═════════ ⇆ Comparer deux époques ═════════ */
    const CMP_KEY = 'lcnda-map-compare';
    const cmpPrefs = (key = CMP_KEY) => ({on: false, bg: 'cassini', mode: 'swipe', pos: .5, opacity: 60, ...lsGet(key, {})});
    const bgName = bg => { const sel = document.createElement('select'); sel.innerHTML = A()?.mapBackgroundSelectHtml?.(bg) || ''; return sel.selectedOptions[0]?.textContent || bg; };
    function tilesHtml(bg, left, top, z, w, h) {
        if (bg === 'grid') return '';
        const world = 2 ** z; let out = '';
        for (let x = Math.floor(left / 256); x <= Math.floor((left + w) / 256); x++) for (let y = Math.floor(top / 256); y <= Math.floor((top + h) / 256); y++) {
            if (y < 0 || y >= world) continue;
            out += `<img class="map-tile" draggable="false" referrerpolicy="no-referrer" alt="" src="${esc(A().mapTileUrl(bg, z, ((x % world) + world) % world, y))}" style="left:${Math.round(x * 256 - left)}px;top:${Math.round(y * 256 - top)}px">`;
        }
        return out;
    }
    /**
     * mount(stage, {baseBg: () => fond de gauche, redraw: () => void, bar: élément où poser le bouton, after: élément}) → {draw({left, top, z, width, height})}
     * Le calque se pose dans stage (au-dessus des tuiles) ; le bouton « ⇆ Comparer » dans bar.
     */
    function mount(stage, o = {}) {
        if (!stage) return null;
        const KEY = o.key || CMP_KEY; // chaque sorte de carte garde son choix (la Carte, le suivi des animaux…)
        stage.querySelector(':scope > .cp-cmp')?.remove();
        const layer = document.createElement('div'); layer.className = 'cp-cmp'; layer.setAttribute('data-ctx-off', '');
        const anchor = o.after && stage.contains(o.after) ? o.after.nextSibling : stage.firstChild?.nextSibling;
        stage.insertBefore(layer, anchor || null);
        const btn = document.createElement('span'); btn.className = 'cp-cmp-ctl';
        let last = null;
        const paintBtn = () => { const p = cmpPrefs(KEY); btn.innerHTML = `<button type="button" class="button small secondary${p.on ? ' is-active' : ''}" data-cp-cmp aria-pressed="${p.on}" title="Deux fonds sur la même zone : un trait à glisser, côte à côte ou en transparence">⇆ Comparer</button>`; };
        paintBtn();
        if (o.bar) o.bar.insertBefore(btn, o.bar.querySelector('.spacer') || null);
        btn.addEventListener('click', e => { if (!e.target.closest('[data-cp-cmp]')) return; const p = cmpPrefs(KEY); lsSet(KEY, {...p, on: !p.on}); paintBtn(); draw(last); o.redraw?.(); });
        const setPos = (pos, w) => { const p = cmpPrefs(KEY); p.pos = clamp(pos, .04, .96); lsSet(KEY, p); applyPos(p, w); };
        function applyPos(p, w) {
            const right = layer.querySelector('.cp-cmp-b'), handle = layer.querySelector('.cp-cmp-handle'); if (!right || !handle) return;
            const x = Math.round(p.pos * w);
            right.style.clipPath = `inset(0 0 0 ${x}px)`; handle.style.left = `${x}px`; handle.setAttribute('aria-valuenow', String(Math.round(p.pos * 100)));
        }
        function draw(v) {
            if (v) last = v;
            const p = cmpPrefs(KEY); stage.classList.toggle('is-cmp-on', !!p.on); stage.classList.toggle('is-cmp-side', !!p.on && p.mode === 'side');
            if (!p.on || !last) { layer.innerHTML = ''; layer.hidden = true; return; }
            layer.hidden = false;
            const {left, top, z, width: w, height: h} = last, a = o.baseBg ? o.baseBg() : 'light';
            const bar = `<div class="cp-cmp-bar" role="group" aria-label="${esc(i18n('Comparer deux époques'))}"><label>${i18n('À droite')} <select data-cp-cmp-bg aria-label="${esc(i18n('Fond à comparer'))}">${A().mapBackgroundSelectHtml(p.bg)}</select></label>
                <div class="segmented" role="tablist" aria-label="${esc(i18n('Façon de comparer'))}">${[['swipe', '▏ Trait'], ['side', '◫ Côte à côte'], ['fade', '◐ Transparence']].map(([k, l]) => `<button type="button" role="tab" class="${p.mode === k ? 'is-active' : ''}" aria-selected="${p.mode === k}" data-cp-cmp-mode="${k}">${esc(i18n(l))}</button>`).join('')}</div>
                ${p.mode === 'fade' ? `<label class="cp-cmp-op">${i18n('Transparence')} <input type="range" min="0" max="100" value="${p.opacity}" data-cp-cmp-op aria-label="${esc(i18n('Transparence du fond à comparer'))}"><input type="number" min="0" max="100" value="${p.opacity}" data-unit="%" data-cp-cmp-opn aria-label="${esc(i18n('Transparence en %'))}"></label>` : ''}
                <button type="button" class="icon-button small" data-cp-cmp-off aria-label="Fermer la comparaison" title="Fermer la comparaison">×</button></div>`;
            if (p.mode === 'side') {
                const hw = Math.round(w / 2), l2 = left + w / 4;
                layer.innerHTML = `<div class="cp-cmp-half is-a" style="width:${hw}px">${tilesHtml(a, l2, top, z, hw, h)}</div><div class="cp-cmp-half is-b" style="left:${hw}px;width:${w - hw}px">${tilesHtml(p.bg, l2, top, z, w - hw, h)}</div><div class="cp-cmp-mid" style="left:${hw}px"></div>
                    <span class="cp-cmp-tag is-a">${esc(bgName(a))}</span><span class="cp-cmp-tag is-b">${esc(bgName(p.bg))}</span>${bar}`;
            } else if (p.mode === 'fade') {
                layer.innerHTML = `<div class="cp-cmp-b" style="opacity:${p.opacity / 100}">${tilesHtml(p.bg, left, top, z, w, h)}</div><span class="cp-cmp-tag is-b">${esc(bgName(p.bg))} · ${p.opacity} %</span>${bar}`;
            } else {
                layer.innerHTML = `<div class="cp-cmp-b">${tilesHtml(p.bg, left, top, z, w, h)}</div><button type="button" class="cp-cmp-handle" role="slider" aria-label="${esc(i18n('Trait de comparaison : glisse-le, ou flèches gauche et droite'))}" aria-valuemin="0" aria-valuemax="100" title="${esc(i18n('Glisse le trait (← →)'))}"><i></i></button>
                    <span class="cp-cmp-tag is-a">◀ ${esc(bgName(a))}</span><span class="cp-cmp-tag is-b">${esc(bgName(p.bg))} ▶</span>${bar}`;
                applyPos(p, w);
            }
        }
        layer.addEventListener('pointerdown', e => {
            if (e.target.closest('.cp-cmp-bar')) { e.stopPropagation(); return; }
            const hd = e.target.closest('.cp-cmp-handle'); if (!hd) return;
            e.preventDefault(); e.stopPropagation();
            const r = stage.getBoundingClientRect();
            const move = ev => setPos((ev.clientX - r.left) / r.width, r.width);
            const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
            window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
        });
        layer.addEventListener('wheel', e => { if (e.target.closest('.cp-cmp-bar')) e.stopPropagation(); }, {passive: true});
        layer.addEventListener('keydown', e => {
            if (!e.target.closest('.cp-cmp-handle') || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
            e.preventDefault(); e.stopPropagation(); const p = cmpPrefs(KEY);
            setPos(e.key === 'Home' ? .04 : e.key === 'End' ? .96 : p.pos + (e.key === 'ArrowLeft' ? -.02 : .02), stage.clientWidth);
        });
        layer.addEventListener('click', e => {
            const m = e.target.closest('[data-cp-cmp-mode]'); if (m) { lsSet(KEY, {...cmpPrefs(KEY), mode: m.dataset.cpCmpMode}); draw(); return; }
            if (e.target.closest('[data-cp-cmp-off]')) { lsSet(KEY, {...cmpPrefs(KEY), on: false}); paintBtn(); draw(); }
        });
        layer.addEventListener('change', e => { if (e.target.matches('[data-cp-cmp-bg]')) { lsSet(KEY, {...cmpPrefs(KEY), bg: A().mapBackgroundValue ? A().mapBackgroundValue(e.target.value) : e.target.value}); draw(); } });
        layer.addEventListener('input', e => {
            if (!e.target.matches('[data-cp-cmp-op],[data-cp-cmp-opn]')) return;
            const v = clamp(Math.round(Number(e.target.value)), 0, 100); lsSet(KEY, {...cmpPrefs(KEY), opacity: v});
            const b = layer.querySelector('.cp-cmp-b'); if (b) b.style.opacity = String(v / 100);
            layer.querySelectorAll('[data-cp-cmp-op],[data-cp-cmp-opn]').forEach(x => { if (x !== e.target) x.value = String(v); });
            const tag = layer.querySelector('.cp-cmp-tag.is-b'); if (tag) tag.textContent = `${bgName(cmpPrefs(KEY).bg)} · ${v} %`;
        });
        return {draw, layer};
    }
    ext.mapCompare = {mount, prefs: cmpPrefs, tilesHtml};

    /* ═════════ 🏛 Frontières anciennes ═════════ */
    // départements d'aujourd'hui → province d'Ancien Régime (≈ 1789 : celle qui couvre la plus grande partie du département)
    const PROV = {'01': 'Bourgogne', '02': 'Île-de-France', '03': 'Bourbonnais', '04': 'Provence', '05': 'Dauphiné', '06': 'Comté de Nice', '07': 'Languedoc', '08': 'Champagne', '09': 'Comté de Foix', 10: 'Champagne', 11: 'Languedoc', 12: 'Guyenne',
        13: 'Provence', 14: 'Normandie', 15: 'Auvergne', 16: 'Angoumois', 17: 'Saintonge et Aunis', 18: 'Berry', 19: 'Limousin', '2A': 'Corse', '2B': 'Corse', 21: 'Bourgogne', 22: 'Bretagne', 23: 'Marche', 24: 'Guyenne', 25: 'Franche-Comté',
        26: 'Dauphiné', 27: 'Normandie', 28: 'Orléanais', 29: 'Bretagne', 30: 'Languedoc', 31: 'Languedoc', 32: 'Gascogne', 33: 'Guyenne', 34: 'Languedoc', 35: 'Bretagne', 36: 'Berry', 37: 'Touraine', 38: 'Dauphiné', 39: 'Franche-Comté',
        40: 'Gascogne', 41: 'Orléanais', 42: 'Lyonnais', 43: 'Languedoc', 44: 'Bretagne', 45: 'Orléanais', 46: 'Guyenne', 47: 'Guyenne', 48: 'Languedoc', 49: 'Anjou', 50: 'Normandie', 51: 'Champagne', 52: 'Champagne', 53: 'Maine',
        54: 'Lorraine', 55: 'Lorraine', 56: 'Bretagne', 57: 'Lorraine', 58: 'Nivernais', 59: 'Flandre et Hainaut', 60: 'Île-de-France', 61: 'Normandie', 62: 'Artois', 63: 'Auvergne', 64: 'Béarn et Navarre', 65: 'Gascogne', 66: 'Roussillon',
        67: 'Alsace', 68: 'Alsace', 69: 'Lyonnais', 70: 'Franche-Comté', 71: 'Bourgogne', 72: 'Maine', 73: 'Savoie', 74: 'Savoie', 75: 'Île-de-France', 76: 'Normandie', 77: 'Île-de-France', 78: 'Île-de-France', 79: 'Poitou', 80: 'Picardie',
        81: 'Languedoc', 82: 'Guyenne', 83: 'Provence', 84: 'Comtat Venaissin', 85: 'Poitou', 86: 'Poitou', 87: 'Limousin', 88: 'Lorraine', 89: 'Bourgogne', 90: 'Alsace', 91: 'Île-de-France', 92: 'Île-de-France', 93: 'Île-de-France',
        94: 'Île-de-France', 95: 'Île-de-France'};
    const PROV_NOTE = {'Comté de Nice': 'Pas français en 1789 : royaume de Sardaigne (français en 1860). L’ouest (Grasse) était en Provence.', Savoie: 'Pas française en 1789 : royaume de Sardaigne (française en 1860).',
        'Comtat Venaissin': 'Pas français en 1789 : Avignon et le Comtat appartenaient au pape (réunis en 1791).', Alsace: 'Mulhouse était une république alliée des Suisses (réunie en 1798).', 'Franche-Comté': 'Montbéliard appartenait au Wurtemberg (réuni en 1793).'};
    const PROV_OUT = new Set(['Comté de Nice', 'Savoie', 'Comtat Venaissin']);
    // départements d'aujourd'hui → département de 1790 (nom d'alors)
    const D1790 = {'01': 'Ain', '02': 'Aisne', '03': 'Allier', '04': 'Basses-Alpes', '05': 'Hautes-Alpes', '06': '', '07': 'Ardèche', '08': 'Ardennes', '09': 'Ariège', 10: 'Aube', 11: 'Aude', 12: 'Aveyron', 13: 'Bouches-du-Rhône', 14: 'Calvados',
        15: 'Cantal', 16: 'Charente', 17: 'Charente-Inférieure', 18: 'Cher', 19: 'Corrèze', '2A': 'Corse', '2B': 'Corse', 21: 'Côte-d’Or', 22: 'Côtes-du-Nord', 23: 'Creuse', 24: 'Dordogne', 25: 'Doubs', 26: 'Drôme', 27: 'Eure', 28: 'Eure-et-Loir',
        29: 'Finistère', 30: 'Gard', 31: 'Haute-Garonne', 32: 'Gers', 33: 'Gironde', 34: 'Hérault', 35: 'Ille-et-Vilaine', 36: 'Indre', 37: 'Indre-et-Loire', 38: 'Isère', 39: 'Jura', 40: 'Landes', 41: 'Loir-et-Cher', 42: 'Rhône-et-Loire',
        43: 'Haute-Loire', 44: 'Loire-Inférieure', 45: 'Loiret', 46: 'Lot', 47: 'Lot-et-Garonne', 48: 'Lozère', 49: 'Mayenne-et-Loire', 50: 'Manche', 51: 'Marne', 52: 'Haute-Marne', 53: 'Mayenne', 54: 'Meurthe', 55: 'Meuse', 56: 'Morbihan',
        57: 'Moselle', 58: 'Nièvre', 59: 'Nord', 60: 'Oise', 61: 'Orne', 62: 'Pas-de-Calais', 63: 'Puy-de-Dôme', 64: 'Basses-Pyrénées', 65: 'Hautes-Pyrénées', 66: 'Pyrénées-Orientales', 67: 'Bas-Rhin', 68: 'Haut-Rhin', 69: 'Rhône-et-Loire',
        70: 'Haute-Saône', 71: 'Saône-et-Loire', 72: 'Sarthe', 73: '', 74: '', 75: 'Paris', 76: 'Seine-Inférieure', 77: 'Seine-et-Marne', 78: 'Seine-et-Oise', 79: 'Deux-Sèvres', 80: 'Somme', 81: 'Tarn', 82: 'Lot', 83: 'Var', 84: '',
        85: 'Vendée', 86: 'Vienne', 87: 'Haute-Vienne', 88: 'Vosges', 89: 'Yonne', 90: 'Haut-Rhin', 91: 'Seine-et-Oise', 92: 'Paris', 93: 'Paris', 94: 'Paris', 95: 'Seine-et-Oise'};
    const D1790_NOTE = {'Rhône-et-Loire': 'Coupé en Rhône et Loire en 1793.', Paris: 'Le département de Paris (puis de la Seine, 1795).', 'Seine-et-Oise': 'Partagé en 1968 (Yvelines, Essonne, Val-d’Oise…).',
        Lot: 'Le Tarn-et-Garonne n’existe qu’en 1808 (pris au Lot surtout, et à 5 départements voisins) : ici rangé avec le Lot.', Corse: 'Un seul département en 1790 (coupé en deux de 1793 à 1811, puis en 1976).', 'Mayenne-et-Loire': 'Devenu Maine-et-Loire en 1791.',
        Meurthe: 'Limites changées en 1871 (Meurthe-et-Moselle).', Moselle: 'Limites changées en 1871.', 'Haut-Rhin': 'Belfort en faisait partie jusqu’en 1871.', 'Basses-Alpes': 'Devenu Alpes-de-Haute-Provence en 1970.'};
    const D1790_OUT = {'06': 'Comté de Nice (royaume de Sardaigne) : pas français en 1790', 73: 'Savoie (royaume de Sardaigne) : pas française en 1790', 74: 'Savoie (royaume de Sardaigne) : pas française en 1790', 84: 'Avignon et Comtat Venaissin (au pape) : réunis en 1791'};
    const LAYER_COLORS = ['#c0392b', '#2471a3', '#1e8449', '#b9770e', '#7d3c98', '#117a65', '#a04000', '#2e4053'];
    const FR_KEY = 'lcnda-map-frontieres';
    const frPrefs = () => ({prov: false, d1790: false, gone: false, renames: false, ...lsGet(FR_KEY, {})});
    const look = (map, code) => map[code] ?? map[String(Number(code))];
    let topo = null, topoP = null;
    /** le fond des départements, en lon/lat, avec ses arcs (pour tracer les limites des regroupements) */
    function loadTopo() {
        if (topo) return Promise.resolve(topo);
        topoP ||= fetch('assets/data/geo/fr-departements.json?v=2', {credentials: 'same-origin'}).then(r => { if (!r.ok) throw new Error('Fond des départements introuvable.'); return r.json(); }).then(raw => {
            const t = raw.topo, [sx, sy] = t.transform?.scale || [1, 1], [tx, ty] = t.transform?.translate || [0, 0];
            const arcs = t.arcs.map(a => { let x = 0, y = 0; return a.map(([dx, dy]) => { x += dx; y += dy; return [x * sx + tx, y * sy + ty]; }); });
            const ring = idx => { const out = []; idx.forEach(i => { const a = arcs[i < 0 ? ~i : i]; if (!a) return; const pts = i < 0 ? [...a].reverse() : a; pts.forEach((p, j) => { if (j || !out.length) out.push(p); }); }); return out; };
            const deps = t.objects.z.geometries.filter(g => !g.properties?.o).map(g => {
                const polys = g.type === 'Polygon' ? [g.arcs] : g.arcs; const p = g.properties || {};
                return {code: String(p.i), name: String(p.n || p.i), label: p.l, polys, rings: polys.map(pp => pp.map(ring))};
            });
            return (topo = {arcs, deps});
        });
        return topoP;
    }
    /** les regroupements d'une couche : {name → {deps, color, label, note}} et les arcs qui les séparent */
    const groupsMemo = {};
    function groupsOf(layer) {
        if (groupsMemo[layer]) return groupsMemo[layer];
        const G = new Map(), arcUse = new Map();
        topo.deps.forEach(d => {
            let k = layer === 'prov' ? look(PROV, d.code) || '' : look(D1790, d.code) || '', out = false;
            if (!k) { k = layer === 'd1790' ? (look(D1790_OUT, d.code) ? i18n(look(D1790_OUT, d.code)) : d.name) : d.name; out = true; }
            if (layer === 'prov' && PROV_OUT.has(k)) out = true;
            const g = G.get(k) || {name: k, deps: [], out, area: 0, lx: 0, ly: 0}; g.deps.push(d);
            const w = d.rings.reduce((s, poly) => { const r = poly[0] || []; let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return s + Math.abs(a / 2); }, 0);
            const lab = Array.isArray(d.label) ? d.label : [0, 0]; g.lx += lab[0] * w; g.ly += lab[1] * w; g.area += w; G.set(k, g);
            d.polys.flat(2).forEach(i => { const a = i < 0 ? ~i : i, s = arcUse.get(a) || new Set(); s.add(k); arcUse.set(a, s); });
        });
        // couleurs : deux voisins jamais de la même couleur (coloriage glouton)
        const nb = new Map(); const link = (a, b) => { if (!nb.has(a)) nb.set(a, new Set()); nb.get(a).add(b); };
        arcUse.forEach(s => { const l = [...s]; if (l.length === 2) { link(l[0], l[1]); link(l[1], l[0]); } });
        [...G.values()].sort((a, b) => (nb.get(b.name)?.size || 0) - (nb.get(a.name)?.size || 0)).forEach(g => {
            const used = new Set([...(nb.get(g.name) || [])].map(n => G.get(n)?.ci).filter(x => x !== undefined)); let ci = 0; while (used.has(ci)) ci++; g.ci = ci % LAYER_COLORS.length;
            g.color = g.out ? '#8a8f98' : LAYER_COLORS[g.ci]; g.label = g.area ? [g.lx / g.area, g.ly / g.area] : [0, 0];
            g.note = i18n(layer === 'prov' ? PROV_NOTE[g.name] || '' : D1790_NOTE[g.name] || (g.out ? 'Pas en France en 1790.' : ''));
        });
        const inner = [], outer = [];
        arcUse.forEach((s, a) => { (s.size > 1 ? inner : outer).push(a); });
        return (groupsMemo[layer] = {G, inner, outer});
    }
    function pathOf(rings, P) { return rings.map(r => r.map((p, i) => { const [x, y] = P(p[0], p[1]); return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`; }).join('') + 'Z').join(''); }
    function arcPath(idx, P) { return idx.map(a => topo.arcs[a].map((p, i) => { const [x, y] = P(p[0], p[1]); return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`; }).join('')).join(''); }
    function layerSvg(layer, P, z) {
        const {G, inner, outer} = groupsOf(layer), dash = layer === 'd1790' ? ' stroke-dasharray="7 4"' : '', ink = layer === 'prov' ? '#6b2c1f' : '#1f3d6b';
        let svg = `<g class="cp-fr-layer is-${layer}">`;
        G.forEach(g => { svg += `<path class="cp-fr-zone" data-cp-zone="${esc(layer + '|' + g.name)}" d="${g.deps.map(d => pathOf(d.rings.flat(), P)).join('')}" fill="${g.color}" fill-opacity="${g.out ? .22 : .13}"><title>${esc(g.name)}${g.note ? ' — ' + esc(g.note) : ''} ${esc(i18n('(approximatif)'))}</title></path>`; });
        svg += `<path d="${arcPath(inner, P)}" fill="none" stroke="${ink}" stroke-width="${z >= 8 ? 2.6 : 1.8}" stroke-opacity=".85"${dash} stroke-linejoin="round" pointer-events="none"/>`;
        svg += `<path d="${arcPath(outer, P)}" fill="none" stroke="${ink}" stroke-width="1" stroke-opacity=".45" pointer-events="none"/>`;
        const fs = clamp(9 + (z - 5) * 2.2, 9, 20);
        G.forEach(g => { if (g.out && layer === 'd1790') return; const [x, y] = P(g.label[0], g.label[1]); svg += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="${fs.toFixed(1)}" font-weight="700" fill="${layer === 'prov' ? '#5a1f14' : '#16305a'}" class="cp-fr-label" pointer-events="none">${esc(g.name)}</text>`; });
        return svg + '</g>';
    }
    // 🏚 communes disparues : chargées par cadre (zoom ≥ 8), retenues tant que le cadre ne bouge pas beaucoup
    let gone = {key: '', items: [], total: 0, busy: false, installed: null};
    async function loadGone(view, renames) {
        const pad = .3, key = [view.w, view.s, view.e, view.n].map(v => (Math.round(v * 4) / 4).toFixed(2)).join(',') + (renames ? 'r' : '');
        if (gone.key === key || gone.busy) return false;
        gone.busy = true;
        try {
            const r = await A().api('frontieres_communes', {w: (view.w - pad).toFixed(3), s: (view.s - pad).toFixed(3), e: (view.e + pad).toFixed(3), n: (view.n + pad).toFixed(3), renames: renames ? 1 : ''});
            gone = {key, items: r.items || [], total: r.total || 0, busy: false, installed: !!r.installed};
            return true;
        } catch (_) { gone.busy = false; return false; }
    }
    const fmtDate = d => { const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return String(d || ''); if (window.LCNDA_I18N && window.LCNDA_I18N.lang !== 'fr') return window.LCNDA_I18N.fmtDate(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])), {day: 'numeric', month: 'long', year: 'numeric'}); const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'][Number(m[2]) - 1]; return `${Number(m[3]) === 1 ? '1er' : Number(m[3])} ${mois} ${m[1]}`; };
    const MODS = {30: 'supprimée (partagée entre ses voisines)', 31: 'fusionnée', 32: 'réunie en commune nouvelle', 33: 'fusionnée (fusion-association)', 34: 'fusionnée', 10: 'renommée'};
    /** la bulle d'une commune ancienne : « Puy-d'Essai — fusionnée le 1er janvier 1973 ; aujourd'hui : Naves (19146) » */
    function goneHtml(r) {
        const what = r.k === 'rename' ? i18n('renommée « {name} » le {date}', {name: esc(r.tn), date: fmtDate(r.d)}) : `${i18n('{what} le {date}', {what: i18n(MODS[r.m] || 'disparue'), date: fmtDate(r.d)})}${r.tn && r.tn !== r.nn ? ` ${i18n('dans {name}', {name: esc(r.tn)})}` : ''}${r.as ? ` ${i18n('(devenue commune {name})', {name: esc(r.as)})}` : ''}`;
        return `<b>🏚 ${esc(r.n)}</b> <small class="muted">(${esc(r.c)})</small><p>${what}.</p><p>${i18n('Aujourd’hui : <b>{name}</b>', {name: esc(r.nn || r.tn)})} <small class="muted">(${esc(r.nc || r.tc)})</small>${r.back ? `<br>${i18n('Rétablie le {date}.', {date: fmtDate(r.back)})}` : ''}</p>${r.approx ? `<p class="ui-hint">${i18n('Position approximative : le centre de la commune d’aujourd’hui.')}</p>` : ''}<p class="ui-hint">${i18n('Source : INSEE, Code officiel géographique (depuis 1943).')}</p>`;
    }
    let pop = null;
    const closePop = () => { pop?.remove(); pop = null; };
    function popAt(stage, x, y, html) {
        closePop(); pop = document.createElement('div'); pop.className = 'cp-pop'; pop.setAttribute('role', 'dialog');
        pop.innerHTML = `<button type="button" class="icon-button small cp-pop-x" aria-label="Fermer">×</button>${html}`;
        pop.style.left = `${Math.max(8, Math.min(stage.clientWidth - 290, x + 12))}px`; pop.style.top = `${Math.max(8, Math.min(stage.clientHeight - 180, y - 20))}px`;
        stage.appendChild(pop); pop.addEventListener('pointerdown', e => e.stopPropagation()); pop.querySelector('.cp-pop-x').addEventListener('click', closePop);
    }
    // la Carte : bouton « ⇆ Comparer », bouton « 🏛 Frontières ▾ », calque SVG, bulles
    let cmp = null;
    ext.mapSetup.push(() => {
        const strip = document.querySelector('.map-layout .tool-strip'), stage = document.getElementById('map-stage');
        if (!strip || !stage) return;
        closePop();
        cmp = mount(stage, {bar: strip, after: document.getElementById('map-tiles-overlay'), baseBg: () => A().mapBackgroundValue(A().readDesignSettings().mapBackground), redraw: () => A().drawMap?.()});
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'cp-fr-svg'); svg.id = 'cp-fr-svg';
        stage.insertBefore(svg, document.getElementById('map-route-layer') || document.getElementById('map-overlay') || null);
        const ctl = document.createElement('span'); ctl.className = 'cp-fr-ctl';
        const p = frPrefs(), on = p.prov || p.d1790 || p.gone;
        ctl.innerHTML = `<button type="button" class="button small secondary${on ? ' is-active' : ''}" data-cp-fr aria-haspopup="true" aria-expanded="false" title="${esc(i18n('Provinces, départements de 1790, communes disparues'))}">🏛 ${i18n('Frontières')} ▾</button>`;
        strip.insertBefore(ctl, strip.querySelector('.spacer') || null);
        ctl.querySelector('[data-cp-fr]').addEventListener('click', e => { e.stopPropagation(); openFrMenu(e.currentTarget); });
        stage.addEventListener('click', e => {
            const z = e.target.closest?.('[data-cp-zone]'), g = e.target.closest?.('[data-cp-gone]'), r = stage.getBoundingClientRect();
            if (g) { const it = gone.items.find(x => `${x.c}|${x.d}` === g.dataset.cpGone); if (it) popAt(stage, e.clientX - r.left, e.clientY - r.top, goneHtml(it)); return; }
            if (z && !e.target.closest('.map-marker')) { const [layer, name] = z.dataset.cpZone.split('|'); const gr = groupsOf(layer).G.get(name);
                popAt(stage, e.clientX - r.left, e.clientY - r.top, `<b>${i18n(layer === 'prov' ? '🏛 Province : {name}' : '🏛 Département de 1790 : {name}', {name: esc(name)})}</b>${gr?.note ? `<p>${esc(gr.note)}</p>` : ''}<p class="ui-hint">${gr ? i18n('Tracé approximatif, d’après les départements d’aujourd’hui ({list}).', {list: gr.deps.map(d => esc(d.code)).join(', ')}) : i18n('Tracé approximatif, d’après les départements d’aujourd’hui.')}</p>`); }
        });
        stage.addEventListener('keydown', e => { if (e.key === 'Escape' && pop) { e.stopPropagation(); closePop(); } });
        if (p.prov || p.d1790) loadTopo().then(() => A().drawMap?.()).catch(() => {});
    });
    function openFrMenu(btn) {
        const p = frPrefs(); const old = document.querySelector('body > .cp-fr-menu'); if (old) { old.remove(); btn.setAttribute('aria-expanded', 'false'); if (old._btn === btn) return; }
        const menu = document.createElement('div'); menu.className = 'cp-fr-menu'; menu.setAttribute('role', 'group'); menu.setAttribute('aria-label', i18n('Frontières anciennes'));
        const C = (k, label, sub) => `<label class="checkbox-line"><input type="checkbox" data-cp-fr-k="${k}" ${p[k] ? 'checked' : ''}> <span>${esc(i18n(label))}${sub ? `<small class="ui-hint">${esc(i18n(sub))}</small>` : ''}</span></label>`;
        menu.innerHTML = `<b>🏛 Frontières anciennes</b>${C('prov', 'Provinces d’Ancien Régime (≈ 1789)', 'Approximatif : d’après les départements d’aujourd’hui.')}${C('d1790', 'Départements de 1790', 'Les 83 départements, noms d’alors ; approximatif.')}
            ${C('gone', 'Communes disparues ou fusionnées', 'Depuis 1943 (INSEE). Zoome sur une région.')}${C('renames', 'Avec les communes renommées', '')}
            <p class="ui-hint" data-cp-fr-dl hidden>Les communes disparues se téléchargent une fois : <button type="button" class="link-button" data-cp-fr-go>Réglages → Frontières anciennes ↗</button></p>`;
        document.body.appendChild(menu); btn.setAttribute('aria-expanded', 'true'); menu._btn = btn;
        // la barre de la Carte défile de côté (et couperait le menu) : le menu est posé sur la page, sous le bouton
        const r = btn.getBoundingClientRect(), mw = Math.min(300, window.innerWidth - 16);
        menu.style.left = `${Math.max(8, Math.min(window.innerWidth - mw - 8, r.left))}px`; menu.style.top = `${r.bottom + 6}px`;
        if (gone.installed === false) menu.querySelector('[data-cp-fr-dl]').hidden = false;
        A().api('frontieres_status').then(st => { if (!st.installed && menu.isConnected) menu.querySelector('[data-cp-fr-dl]').hidden = false; }).catch(() => {});
        menu.addEventListener('change', e => { const k = e.target.dataset.cpFrK; if (!k) return; const q = {...frPrefs(), [k]: e.target.checked}; lsSet(FR_KEY, q); gone.key = '';
            btn.classList.toggle('is-active', q.prov || q.d1790 || q.gone); if (q.prov || q.d1790) loadTopo().then(() => A().drawMap?.()).catch(() => {}); else A().drawMap?.(); });
        menu.querySelector('[data-cp-fr-go]')?.addEventListener('click', () => { const st = S(); st.maintenanceTab = 'frontieres'; A().persistUiState?.(); A().setModule?.('maintenance'); });
        const close = () => { menu.remove(); btn.setAttribute('aria-expanded', 'false'); document.removeEventListener('pointerdown', off, true); document.removeEventListener('keydown', esck, true); };
        const off = e => { if (!menu.contains(e.target) && !btn.contains(e.target)) close(); };
        const esck = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); btn.focus(); } };
        setTimeout(() => { document.addEventListener('pointerdown', off, true); document.addEventListener('keydown', esck, true); }, 0);
        menu.querySelector('input')?.focus();
    }
    ext.mapDraw.push(({stage, left, top, z, width, height}) => {
        cmp?.draw({left, top, z, width, height});
        const svg = document.getElementById('cp-fr-svg'); if (!svg) return;
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`); svg.setAttribute('width', width); svg.setAttribute('height', height);
        const p = frPrefs(), P = (lon, lat) => [A().lngToX(lon, z) - left, A().latToY(lat, z) - top];
        let out = '';
        if ((p.prov || p.d1790) && topo) { if (p.d1790) out += layerSvg('d1790', P, z); if (p.prov) out += layerSvg('prov', P, z); }
        if (p.gone && z >= 8) {
            const view = {w: A().xToLng(left, z), e: A().xToLng(left + width, z), n: A().yToLat(top, z), s: A().yToLat(top + height, z)};
            loadGone(view, p.renames).then(ch => { if (ch) A().drawMap?.(); });
            gone.items.forEach(r => {
                const [x, y] = P(r.lon, r.lat); if (x < -20 || y < -20 || x > width + 20 || y > height + 20) return;
                out += `<g class="cp-gone${r.k === 'rename' ? ' is-rename' : ''}${r.approx ? ' is-approx' : ''}" data-cp-gone="${esc(r.c + '|' + r.d)}" tabindex="0" role="button" aria-label="${esc(i18n(r.k === 'rename' ? '{name}, commune renommée' : '{name}, commune disparue', {name: r.n}))}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${z >= 11 ? 7 : 5}"/><title>${esc(i18n(r.k === 'rename' ? '{name} — renommée en {year}' : '{name} — disparue en {year}', {name: r.n, year: String(r.d).slice(0, 4)}))}</title>${z >= 10 ? `<text x="${(x + 9).toFixed(1)}" y="${(y + 4).toFixed(1)}">${esc(r.n)}</text>` : ''}</g>`;
            });
        }
        svg.innerHTML = out;
        const need = p.gone && (z < 8 || gone.installed === false);
        let h = stage.querySelector('.cp-fr-hint');
        if (need && !h) { h = document.createElement('div'); h.className = 'cp-fr-hint'; stage.appendChild(h); }
        if (h) { h.hidden = !need; h.textContent = i18n(gone.installed === false ? '🏚 Communes disparues : à télécharger une fois (Réglages → 🏛 Frontières anciennes).' : '🏚 Zoome sur une région pour voir les communes disparues.'); }
    });
    // clavier sur une commune disparue : Entrée ouvre la bulle
    document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest?.('[data-cp-gone]')) { e.preventDefault(); const st = document.getElementById('map-stage'), b = e.target.getBoundingClientRect(), r = st.getBoundingClientRect(); const it = gone.items.find(x => `${x.c}|${x.d}` === e.target.closest('[data-cp-gone]').dataset.cpGone); if (it) popAt(st, b.left - r.left, b.top - r.top, goneHtml(it)); } });

    /* ═════════ Réglages → 🏛 Frontières anciennes ═════════ */
    ext.maintenance = ext.maintenance || {};
    ext.maintenance.frontieres = async token => {
        const ws = document.getElementById('workspace'); if (!ws) return;
        ws.innerHTML = `<section class="page">${UI().spinner('Chargement…')}</section>`;
        let st = {}; try { st = await A().api('frontieres_status'); } catch (e) { st = {error: e.message}; }
        if (token !== undefined && token !== S().workspaceToken) return;
        const files = st.files || [];
        const rows = files.map(f => `<div class="cp-set-row"><span><b>${esc(i18n(f.label))}</b><small>${f.installed ? i18n('{size} ({bytes} octets) · empreinte sha256 {hash}… · vérifié : {when}', {size: mo(f.size), bytes: nfmt(Number(f.size)), hash: esc(f.sha256.slice(0, 12)), when: esc(chk(f.checked))}) : i18n('Pas encore téléchargé')}</small>${f.installed && f.date && UI().when ? `<small>${UI().when(f.date, {label: i18n('Téléchargé')})}</small>` : ''}</span>${UI().badge(i18n(f.installed ? 'Installé' : 'Pas installé'), f.installed ? 'green' : 'grey')}</div>`).join('');
        ws.innerHTML = `<section class="page cp-settings">${UI().pageHeader({where: 'Réglages · Cartes', title: 'Frontières anciennes', help: 'Provinces, départements de 1790 et communes disparues, sur la Carte (bouton « 🏛 Frontières »).',
                actions: ['<button type="button" class="button" data-cp-open-map>↗ Voir sur la Carte</button>']})}
            ${st.error ? UI().notice('error', st.error) : ''}
            <section class="maintenance-panel"><h3>🏚 Communes disparues ou fusionnées</h3>
                <p>L’historique officiel des communes de l’INSEE (depuis 1943) : chaque commune disparue avec sa date et sa commune d’aujourd’hui. Livré avec l’app (5,5 Mo, Licence Ouverte 2.0 de l’INSEE) : installé tout seul, sans Internet. Les anciens noms aident aussi le menu de choix des lieux (« anc. « … » »).</p>
                <div class="cp-set-files">${rows}</div>
                ${st.installed ? `<p>${A().plural(st.gone || 0, 'commune disparue', 'communes disparues')} · ${A().plural(st.renamed || 0, 'commune renommée', 'communes renommées')} · ${A().plural(st.located || 0, 'placée sur la carte', 'placées sur la carte')}.</p>` : ''}
                <div class="page-actions">${st.installed ? '<button type="button" class="button secondary" data-cp-dl>⤓ Télécharger de nouveau (mise à jour)</button><button type="button" class="button secondary" data-cp-rm>🗑 Retirer</button>'
                    : '<button type="button" class="button" data-cp-dl>⤓ Installer les frontières anciennes <span data-cp-size>(taille…)</span></button>'}</div>
                <p class="ui-hint" data-cp-remote></p>
                <p class="ui-hint">${esc(st.licence || '')}. ${i18n('Rangé dans le {name}, commun à toutes tes généalogies.', {name: esc(i18n(st.dir_label || 'dossier des données'))})}</p></section>
            <section class="maintenance-panel"><h3>🏛 Provinces (≈ 1789) et départements de 1790</h3>
                <p>${i18n('Livrés avec l’app : rien à télécharger. Ce sont des tracés <b>approximatifs</b>, faits d’après les départements d’aujourd’hui (chaque département rangé dans la province qui en couvre la plus grande partie). Aucune source libre et officielle de leurs vrais contours n’a été trouvée.')}</p></section>
        </section>`;
        ws.querySelector('[data-cp-open-map]').addEventListener('click', () => { lsSet(FR_KEY, {...frPrefs(), prov: true}); A().setModule?.('carte'); });
        const sz = ws.querySelector('[data-cp-size]'), info = ws.querySelector('[data-cp-remote]');
        A().api('frontieres_remote').then(r => {
            if (sz) sz.textContent = r.total != null ? `(${mo(r.total)})` : `(${i18n('taille inconnue')})`;
            if (info) info.textContent = (r.files || []).map(f => `${i18n(f.label)} : ${f.size != null ? mo(f.size) : i18n('taille inconnue')} (${i18n(f.from)})`).join(' · ');
        }).catch(e => { if (sz) sz.textContent = ''; if (info) info.textContent = i18n('Adresse de téléchargement injoignable pour l’instant ({err}).', {err: e.message || i18n('pas d’Internet')}); });
        ws.querySelector('[data-cp-dl]')?.addEventListener('click', async e => {
            const b = e.currentTarget; b.disabled = true; const t = b.innerHTML; b.innerHTML = UI().spinner(i18n('Téléchargement et vérification…'), {inline: true});
            try {
                const r = await A().api('frontieres_download', {}, {method: 'POST', body: {}});
                A().toast(i18n('✓ Frontières anciennes installées : {n}.', {n: A().plural(r.gone || 0, 'commune disparue', 'communes disparues')}), 'success');
                gone = {key: '', items: [], total: 0, busy: false, installed: null};
                ext.maintenance.frontieres(++S().workspaceToken);
            } catch (err) { b.disabled = false; b.innerHTML = t; A().toast(err.message || i18n('Téléchargement impossible.'), 'error'); }
        });
        ws.querySelector('[data-cp-rm]')?.addEventListener('click', async () => {
            try {
                await A().api('frontieres_remove', {}, {method: 'POST', body: {}});
                gone = {key: '', items: [], total: 0, busy: false, installed: null};
                const again = () => { if (S().module === 'maintenance' && S().maintenanceTab === 'frontieres') ext.maintenance.frontieres(++S().workspaceToken); };
                A().undoToast(i18n('Frontières anciennes retirées'), {undo: async () => { await A().api('frontieres_restore', {}, {method: 'POST', body: {}}); again(); }, redo: async () => { await A().api('frontieres_remove', {}, {method: 'POST', body: {}}); again(); }});
                again();
            } catch (err) { A().toast(err.message, 'error'); }
        });
        // une autre généalogie : les anciens noms pas encore ajoutés à ses lieux
        if (st.apply_needed && !document.body.classList.contains('is-kiosk')) A().api('frontieres_apply', {}, {method: 'POST', body: {}}).catch(() => {});
    };
    ext.cartesPlus = {PROV, D1790, groupsOf, loadTopo, goneHtml, fmtDate, frPrefs};
})();
