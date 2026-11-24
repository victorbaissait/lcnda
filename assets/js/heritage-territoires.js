/**
 * 🧩 Mes territoires : créer un territoire à partir de communes (leurs limites communes effacées), le nommer, le colorer,
 * le hachurer, l'étiqueter, le modifier plus tard (ajouter, retirer des communes), le garder pour s'en servir partout :
 *  - dans les cartes des diagrammes et dans le dessin vectoriel (couches posées par heritage-carto-donnees.js) ;
 *  - sur la Carte (case « 🧩 Mes territoires » dans la barre de la carte, crochets ext.mapSetup / ext.mapDraw) ;
 *  - dans les Listes (registre LCNDA_EXT.dataLists : la liste des territoires ; LCNDA_EXT.dataListFilters : « dans le territoire »).
 * Choisir les communes : en cherchant un nom ou un code, en cliquant sur la carte, « toutes les communes de » un département,
 * un arrondissement ou un canton, ou depuis les lieux de ta base.
 * Tracés des communes : assets/data/geo/fr-communes.json.gz (IGN Admin Express, INSEE COG 2025, Licence Ouverte), déjà livré ;
 * arrondissements et cantons : assets/data/communes-decoupage.json.gz (INSEE COG 2025, Licence Ouverte ;
 * scripts/carto-territoires/build-decoupage.js). Serveur : lib/territoires.php (table « territories », créée à la première demande).
 *   window.LCNDA_EXT.territories = {list(), get(id), cached(), contains(lat, lon[, id]), at(lat, lon), open(id|null), manage(), pick(),
 *     communes(), dissolve(codes), feature(t)}
 *   contains(lat, lon, id) → vrai si le point est dans ce territoire ; contains(lat, lon) → les territoires (gardés) qui contiennent le point.
 * Purs (Node, essais tests/test-carto-territoires.js) : module.exports = {model, dissolve, inRings, ringsBbox, fold, ringsArea}.
 */
(function (root) {
    'use strict';
    const T = (s, v) => (root.LCNDA_I18N ? root.LCNDA_I18N.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? String(v[k]) : m)));
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’'`]/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim()
        .replace(/\bste\b/g, 'sainte').replace(/\bst\b/g, 'saint');

    /* ═════════════ le calcul (sans écran : aussi pour Node) ═════════════ */
    /** les communes d'un fichier TopoJSON (assets/data/geo/fr-communes.json.gz) : arcs gardés en entiers pour recoller les contours */
    function model(raw, succ = null) {
        const tops = [raw?.topo, ...(Array.isArray(raw?.more) ? raw.more : [])].filter(t => t && Array.isArray(t.arcs) && Array.isArray(t.objects?.z?.geometries));
        const M = {topos: [], communes: [], byCode: new Map(), deps: new Map()}, olds = new Map(); // olds : tracés gardés sous un ancien code
        tops.forEach((t, ti) => {
            const [sx, sy] = t.transform?.scale || [1, 1], [tx, ty] = t.transform?.translate || [0, 0];
            const q = t.arcs.map(a => { let x = 0, y = 0; const o = new Int32Array(a.length * 2); for (let i = 0; i < a.length; i++) { x += a[i][0]; y += a[i][1]; o[i * 2] = x; o[i * 2 + 1] = y; } return o; });
            const box = q.map(a => { let b0 = Infinity, b1 = Infinity, b2 = -Infinity, b3 = -Infinity; for (let i = 0; i < a.length; i += 2) { if (a[i] < b0) b0 = a[i]; if (a[i] > b2) b2 = a[i]; if (a[i + 1] < b1) b1 = a[i + 1]; if (a[i + 1] > b3) b3 = a[i + 1]; } return [b0 * sx + tx, b1 * sy + ty, b2 * sx + tx, b3 * sy + ty]; });
            M.topos.push({q, sx, sy, tx, ty, box});
            t.objects.z.geometries.forEach(g => {
                const p = g.properties || {};
                const polys = g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : []; if (!polys.length) return;
                if (p.x) { olds.set(String(p.i ?? ''), {ti, polys, box}); return; } // une commune fusionnée depuis le tracé : rattachée plus bas à celle d'aujourd'hui
                const code = String(p.i ?? ''); if (!code || M.byCode.has(code)) return;
                const b = [Infinity, Infinity, -Infinity, -Infinity];
                polys.forEach(pp => (pp[0] || []).forEach(i => { const a = box[i < 0 ? ~i : i]; if (!a) return; b[0] = Math.min(b[0], a[0]); b[1] = Math.min(b[1], a[1]); b[2] = Math.max(b[2], a[2]); b[3] = Math.max(b[3], a[3]); }));
                const dep = /^97/.test(code) ? code.slice(0, 3) : code.slice(0, 2);
                const z = {code, name: String(p.n ?? code), alt: Array.isArray(p.a) ? p.a.filter(a => !/^\d/.test(a)).map(String) : [], olds: Array.isArray(p.a) ? p.a.filter(a => /^\d[\dAB]\d{3}$/.test(a)) : [], dep, ti, polys, bbox: b,
                    label: Array.isArray(p.l) ? [Number(p.l[0]), Number(p.l[1])] : [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], k: fold(p.n)};
                M.communes.push(z); M.byCode.set(code, z);
                (M.deps.get(dep) || M.deps.set(dep, []).get(dep)).push(z);
            });
        });
        // les anciens codes (communes fusionnées) mènent à la commune d'aujourd'hui, et leur tracé s'ajoute au sien
        const attach = (z, c) => {
            if (!M.byCode.has(c)) M.byCode.set(c, z);
            const o = olds.get(c); if (!o || o.ti !== z.ti) return; olds.delete(c);
            z.polys = [...z.polys, ...o.polys];
            o.polys.forEach(pp => (pp[0] || []).forEach(i => { const a = o.box[i < 0 ? ~i : i]; if (!a) return; z.bbox[0] = Math.min(z.bbox[0], a[0]); z.bbox[1] = Math.min(z.bbox[1], a[1]); z.bbox[2] = Math.max(z.bbox[2], a[2]); z.bbox[3] = Math.max(z.bbox[3], a[3]); }));
        };
        M.communes.forEach(z => z.olds.forEach(c => attach(z, c)));
        // succ (assets/data/communes-decoupage.json.gz, INSEE) : ancien code → commune d'aujourd'hui (fusions faites depuis le tracé)
        if (succ) Object.entries(succ).forEach(([c, n]) => { const z = M.byCode.get(String(n)); if (z && z.code === String(n)) attach(z, c); });
        return M;
    }
    /** les points [lon, lat] d'un anneau (liste d'arcs) */
    function ringOf(M, ti, idx) {
        const t = M.topos[ti], out = [];
        idx.forEach((i, n) => { const a = t.q[i < 0 ? ~i : i]; if (!a) return; const k = a.length / 2;
            for (let j = 0; j < k; j++) { if (j === 0 && n) continue; const q = i < 0 ? k - 1 - j : j; out.push([a[q * 2] * t.sx + t.tx, a[q * 2 + 1] * t.sy + t.ty]); } });
        return out;
    }
    const r5 = v => Math.round(v * 1e5) / 1e5;
    /** les contours d'une commune : [[lon, lat]…] par anneau (règle pair-impair) */
    function communeRings(M, z) { if (!z._r) z._r = z.polys.flatMap(pp => pp.map(r => ringOf(M, z.ti, r))); return z._r; }
    /**
     * 🧩 réunit des communes : les arcs pris par deux communes choisies (leur limite commune) disparaissent, les autres sont recollés
     * bout à bout en anneaux. Rend [[ [lon, lat], … ], …] (pair-impair : les trous restent des trous).
     */
    function dissolve(M, codes) {
        const use = new Map();
        const seen = new Set();
        for (const c of codes || []) {
            const z = M.byCode.get(String(c)); if (!z || seen.has(z)) continue; seen.add(z);
            for (const pp of z.polys) for (const ring of pp) for (const i of ring) {
                const k = i < 0 ? ~i : i, key = z.ti * 1e7 + k, e = use.get(key);
                if (e) e.c++; else use.set(key, {c: 1, ti: z.ti, i});
            }
        }
        const segs = [];
        for (const e of use.values()) {
            if (e.c % 2 !== 1) continue;
            const a = M.topos[e.ti].q[e.i < 0 ? ~e.i : e.i], k = a.length / 2, pts = new Int32Array(a.length);
            for (let j = 0; j < k; j++) { const q = e.i < 0 ? k - 1 - j : j; pts[j * 2] = a[q * 2]; pts[j * 2 + 1] = a[q * 2 + 1]; }
            segs.push({ti: e.ti, pts});
        }
        const key = (ti, x, y) => ti + ':' + x + ',' + y, byStart = new Map();
        segs.forEach((s, j) => { const kk = key(s.ti, s.pts[0], s.pts[1]); (byStart.get(kk) || byStart.set(kk, []).get(kk)).push(j); });
        const used = new Uint8Array(segs.length), rings = [];
        for (let j = 0; j < segs.length; j++) {
            if (used[j]) continue; used[j] = 1;
            const s = segs[j], t = M.topos[s.ti], ring = [];
            const push = (p, from) => { for (let i = from; i < p.length; i += 2) ring.push([r5(p[i] * t.sx + t.tx), r5(p[i + 1] * t.sy + t.ty)]); };
            push(s.pts, 0);
            const start = key(s.ti, s.pts[0], s.pts[1]); let last = s.pts, guard = 0;
            let end = key(s.ti, last[last.length - 2], last[last.length - 1]);
            while (end !== start && guard++ < 100000) {
                const next = (byStart.get(end) || []).find(n => !used[n]); if (next === undefined) break;
                used[next] = 1; last = segs[next].pts; push(last, 2); end = key(s.ti, last[last.length - 2], last[last.length - 1]);
            }
            if (ring.length >= 4) rings.push(ring);
        }
        // les fentes laissées par la simplification des tracés (trous minuscules entre deux communes) : enlevées
        const area = r => { let a = 0; const kx = 111.32 * Math.cos(r[0][1] * Math.PI / 180), ky = 110.57; for (let p = 0, q = r.length - 1; p < r.length; q = p++) a += (r[q][0] * kx) * (r[p][1] * ky) - (r[p][0] * kx) * (r[q][1] * ky); return Math.abs(a / 2); };
        return rings.filter((r, i) => { const a = area(r); if (a < 0.05) return false; return a >= 1 || !rings.some((o, j) => j !== i && area(o) > a && inRings([o], r[0][1], r[0][0])); });
    }
    /** le point est-il dedans ? (anneaux [lon, lat], pair-impair) */
    function inRings(rings, lat, lon) {
        let inside = false;
        for (const r of rings || []) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
            const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
            if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / ((yj - yi) || 1e-12) + xi) inside = !inside;
        }
        return inside;
    }
    function ringsBbox(rings) {
        const b = [Infinity, Infinity, -Infinity, -Infinity];
        (rings || []).forEach(r => r.forEach(([x, y]) => { if (x < b[0]) b[0] = x; if (x > b[2]) b[2] = x; if (y < b[1]) b[1] = y; if (y > b[3]) b[3] = y; }));
        return b[0] === Infinity ? null : b;
    }
    /** surface approchée en km² (pair-impair : les trous comptent en moins) */
    function ringsArea(rings) {
        let tot = 0;
        (rings || []).forEach((r, i) => {
            if (r.length < 3) return;
            let a = 0; const kx = 111.32 * Math.cos(r[0][1] * Math.PI / 180), ky = 110.57;
            for (let p = 0, q = r.length - 1; p < r.length; q = p++) a += (r[q][0] * kx) * (r[p][1] * ky) - (r[p][0] * kx) * (r[q][1] * ky);
            const hole = rings.some((o, j) => j !== i && inRings([o], r[0][1], r[0][0])); // un anneau dans un autre : un trou (ou une île dans un trou, rare)
            tot += (hole ? -1 : 1) * Math.abs(a / 2);
        });
        return Math.max(0, tot);
    }
    const core = {model, dissolve, inRings, ringsBbox, ringsArea, fold, communeRings, ringOf};
    if (typeof module === 'object' && module.exports) { module.exports = core; return; }

    /* ═════════════ l'écran ═════════════ */
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const A = () => root.LCNDA_APP;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const api = (a, q = {}) => A().api(a, q);
    const post = (a, body) => A().api(a, {}, {method: 'POST', body}).then(r => r?.result || r);
    const toast = (m, k) => A()?.toast?.(m, k);
    const plural = (n, one, many) => (A()?.plural ? A().plural(n, one, many) : `${n} ${n > 1 ? many || one + 's' : one}`);
    const PALETTE = ['#c0392b', '#2471a3', '#1e8449', '#b9770e', '#7d3c98', '#117a65', '#a04000', '#2e4053'];
    const HATCHES = [['', 'Aucune (couleur pleine)'], ['diag', 'Traits en biais ╱'], ['diag2', 'Traits en biais ╲'], ['cross', 'Quadrillage'], ['horiz', 'Traits couchés'], ['vert', 'Traits debout'], ['dots', 'Points']];
    const DATA_V = 1;

    /* ── les fichiers (chargés seulement quand on en a besoin) ── */
    async function readGz(url) {
        const r = await fetch(url, {credentials: 'same-origin'}); if (!r.ok) throw new Error(T('Fichier introuvable : {f}', {f: url.split('?')[0]}));
        const buf = new Uint8Array(await r.arrayBuffer());
        if (buf[0] !== 0x1f || buf[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(buf));
        if (typeof DecompressionStream === 'undefined') throw new Error(T('Ce navigateur ne sait pas ouvrir ce fichier.'));
        return JSON.parse(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
    }
    let Mp = null, Dp = null;
    const decoupage = () => (Dp = Dp || readGz(`assets/data/communes-decoupage.json.gz?v=${DATA_V}`).catch(e => { Dp = null; throw e; }));
    const communes = () => (Mp = Mp || Promise.all([readGz('assets/data/geo/fr-communes.json.gz?v=2'), decoupage().catch(() => null)]).then(([raw, d]) => model(raw, d?.succ)).catch(e => { Mp = null; throw e; }));
    const ATTR = T('Communes : IGN Admin Express, INSEE COG 2025 (Licence Ouverte)');

    /* ── les territoires gardés ── */
    let cache = null, loading = null;
    async function list(force = false) {
        if (cache && !force) return cache;
        if (!loading || force) loading = api('terr_list', {full: 1}).then(r => { cache = (r.territories || []).map(prep); return cache; }).finally(() => { loading = null; });
        return loading;
    }
    const prep = t => ({...t, bbox: t.bbox || ringsBbox(t.rings)});
    async function get(id) { const l = await list(); return l.find(t => t.id === Number(id)) || null; }
    function contains(lat, lon, id) {
        lat = Number(lat); lon = Number(lon); if (!Number.isFinite(lat) || !Number.isFinite(lon)) return id != null ? false : [];
        const hit = t => t.bbox && lon >= t.bbox[0] && lon <= t.bbox[2] && lat >= t.bbox[1] && lat <= t.bbox[3] && inRings(t.rings, lat, lon);
        if (id != null) { const t = (cache || []).find(x => x.id === Number(id)); return !!t && hit(t); }
        return (cache || []).filter(hit).map(t => t.id);
    }
    const at = (lat, lon) => (cache || []).filter(t => contains(lat, lon, t.id));
    /** un territoire comme couche de carte : {type:'area', rings, label, style} */
    const feature = t => ({type: 'area', rings: t.rings || [], label: t.name, style: t.style || {}, id: t.id});
    const changed = () => { (ext.territoriesChanged || []).forEach(f => { try { f(cache); } catch (_) {} }); try { if (A()?.state?.module === 'carte' || document.getElementById('ct-map-layer')) A()?.drawMap?.(); } catch (_) {} };

    async function save(t, {quiet = false} = {}) {
        const r = await post('terr_save', {territory: t}); if (r.error) throw new Error(r.error);
        await list(true); changed();
        if (!quiet) A()?.undoToast?.(r.before ? T('Territoire « {n} » modifié.', {n: r.territory.name}) : T('Territoire « {n} » créé.', {n: r.territory.name}), {icon: '🧩',
            undo: async () => { if (r.before) await post('terr_restore', {territory: r.before}); else await post('terr_delete', {id: r.territory.id}); await list(true); changed(); },
            redo: async () => { await post('terr_restore', {territory: r.territory}); await list(true); changed(); }});
        return r.territory;
    }
    async function remove(t) {
        const r = await post('terr_delete', {id: t.id}); if (r.error) throw new Error(r.error);
        await list(true); changed();
        A()?.undoToast?.(T('Territoire « {n} » supprimé.', {n: t.name}), {undo: async () => { await post('terr_restore', {territory: r.before}); await list(true); changed(); },
            redo: async () => { await post('terr_delete', {id: t.id}); await list(true); changed(); }});
    }

    /* ── petits dessins ── */
    const PK = Math.cos(46.5 * Math.PI / 180);
    const px = lon => (lon - 2.5) * PK, py = lat => -lat;
    const dOf = rings => rings.map(r => r.map((p, i) => `${i ? 'L' : 'M'}${px(p[0]).toFixed(4)} ${py(p[1]).toFixed(4)}`).join('') + 'Z').join('');
    /** le motif de hachure (SVG <pattern>) d'un style, dans un repère en pixels */
    function hatchDef(id, st, size = 8) {
        const h = st?.hatch || ''; if (!h) return '';
        const c = st.color || '#c0392b', w = Math.max(.6, size / 8);
        const body = h === 'dots' ? `<circle cx="${size / 2}" cy="${size / 2}" r="${w}" fill="${c}"/>` : h === 'cross' ? `<path d="M0 ${size / 2}H${size}M${size / 2} 0V${size}" stroke="${c}" stroke-width="${w}"/>`
            : h === 'horiz' ? `<path d="M0 ${size / 2}H${size}" stroke="${c}" stroke-width="${w}"/>` : `<path d="M${size / 2} 0V${size}" stroke="${c}" stroke-width="${w}"/>`;
        const rot = h === 'diag' ? 45 : h === 'diag2' ? -45 : 0;
        return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${size}" height="${size}"${rot ? ` patternTransform="rotate(${rot})"` : ''}>${body}</pattern>`;
    }
    /** une vignette (aperçu dans les listes) */
    function thumb(t, w = 120, h = 80) {
        const b = t.bbox || ringsBbox(t.rings); if (!b) return '';
        const x0 = px(b[0]), x1 = px(b[2]), y0 = py(b[3]), y1 = py(b[1]), pad = Math.max(x1 - x0, y1 - y0) * .06;
        const st = t.style || {}, id = 'ctt' + Math.random().toString(36).slice(2, 8);
        return `<svg class="ct-thumb" viewBox="${x0 - pad} ${y0 - pad} ${x1 - x0 + pad * 2} ${y1 - y0 + pad * 2}" width="${w}" height="${h}" aria-hidden="true"><defs>${hatchDef(id, st, (x1 - x0 + pad * 2) / 30)}</defs>
            <path d="${dOf(t.rings || [])}" fill="${st.hatch ? `url(#${id})` : esc(st.fill || st.color || '#c0392b')}" fill-opacity="${st.hatch ? 1 : Math.max(.25, st.opacity ?? .25)}" fill-rule="evenodd" stroke="${esc(st.color || '#c0392b')}" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>`;
    }

    /* ═════════════ 🧩 l'éditeur : créer ou modifier un territoire ═════════════ */
    async function open(idOrT = null, {name = '', codes = []} = {}) {
        const t0 = idOrT && typeof idOrT === 'object' ? idOrT : idOrT ? await get(idOrT) : null;
        return new Promise(resolve => {
            const dlg = document.createElement('dialog'); dlg.className = 'ct-dialog ct-editor'; document.body.appendChild(dlg);
            const st = {...{color: PALETTE[(cache?.length || 0) % PALETTE.length], hatch: '', opacity: .25, label: true, dash: false, width: 2}, ...(t0?.style || {})};
            let sel = new Set((t0?.communes || codes || []).map(String)), M = null, D = null, view = null, rings = t0?.rings || [], hist = [], hi = -1;
            dlg.innerHTML = `<form method="dialog" class="ct-shell">
                <header class="ct-head"><h2>🧩 ${esc(t0 ? T('Modifier le territoire') : T('Créer un territoire à partir de communes'))}</h2><button type="button" class="icon-button" data-ct-x aria-label="${esc(T('Fermer'))}">×</button></header>
                <div class="ct-body">
                  <aside class="ct-side">
                    <label class="ct-f">${esc(T('Nom du territoire'))}<input data-ct-name maxlength="120" value="${esc(t0?.name || name)}" placeholder="${esc(T('ex. Le pays de mes Lacombe'))}"></label>
                    <div class="ct-f ct-ac"><label>${esc(T('Ajouter une commune'))}<input data-ct-q autocomplete="off" placeholder="${esc(T('Nom ou code INSEE…'))}"></label><div class="ct-sugg" data-ct-sugg hidden></div></div>
                    <div class="ct-f ct-ac"><label>${esc(T('＋ Toutes les communes de…'))}<input data-ct-g autocomplete="off" placeholder="${esc(T('un département, un arrondissement, un canton'))}"></label><div class="ct-sugg" data-ct-gsugg hidden></div></div>
                    <div class="ct-row"><button type="button" class="button small secondary" data-ct-places>📍 ${esc(T('Depuis mes lieux…'))}</button><button type="button" class="button small secondary" data-ct-undo title="${esc(T('Annuler'))}">↶</button><button type="button" class="button small secondary" data-ct-redo title="${esc(T('Rétablir'))}">↷</button></div>
                    <div class="ct-places" data-ct-plist hidden></div>
                    <p class="ct-count" data-ct-count></p>
                    <div class="ct-chips" data-ct-chips></div>
                    <details class="ct-style"><summary>🎨 ${esc(T('Couleur, hachure, étiquette'))}</summary>
                      <div class="ct-row"><label class="ct-f">${esc(T('Couleur'))}<input type="color" data-ct-st="color" value="${esc(st.color)}"></label>
                        <label class="ct-f">${esc(T('Hachure'))}<select data-ct-st="hatch">${HATCHES.map(([k, l]) => `<option value="${k}" ${st.hatch === k ? 'selected' : ''}>${esc(T(l))}</option>`).join('')}</select></label></div>
                      <label class="ct-f">${esc(T('Remplissage'))} <input type="range" min="0" max="1" step="0.05" data-ct-st="opacity" value="${esc(st.opacity)}"></label>
                      <label class="checkbox-line"><input type="checkbox" data-ct-st="label" ${st.label !== false ? 'checked' : ''}> ${esc(T('Écrire le nom sur la carte'))}</label>
                      <label class="checkbox-line"><input type="checkbox" data-ct-st="dash" ${st.dash ? 'checked' : ''}> ${esc(T('Bord en pointillés'))}</label>
                    </details>
                  </aside>
                  <section class="ct-mapbox"><div class="ct-mapbar"><button type="button" class="icon-button small" data-ct-z="in" aria-label="${esc(T('Zoomer'))}">＋</button><button type="button" class="icon-button small" data-ct-z="out" aria-label="${esc(T('Dézoomer'))}">−</button><button type="button" class="button small secondary" data-ct-z="fit">⤢ ${esc(T('Voir le territoire'))}</button><button type="button" class="button small secondary" data-ct-z="fr">${esc(T('France entière'))}</button><small class="muted">${esc(T('Clique une commune pour l’ajouter ou la retirer · molette : zoomer · glisser : déplacer'))}</small></div>
                    <svg class="ct-map" data-ct-map role="img" aria-label="${esc(T('Carte des communes'))}"><defs data-ct-defs></defs><g data-ct-base></g><g data-ct-shape></g><g data-ct-lab></g></svg>
                    <p class="ct-attr muted">${esc(ATTR)}</p><p class="ct-wait" data-ct-wait>${esc(T('Chargement des communes de France…'))}</p></section>
                </div>
                <footer class="ct-foot"><span class="muted" data-ct-area></span><span class="ct-sp"></span><button type="button" class="button secondary" data-ct-x>${esc(T('Annuler'))}</button><button type="submit" class="button" data-ct-save>💾 ${esc(T('Enregistrer le territoire'))}</button></footer>
            </form>`;
            const $ = s => dlg.querySelector(s), svg = $('[data-ct-map]');
            let done = false;
            const finish = v => { if (done) return; done = true; try { dlg.close(); } catch (_) {} dlg.remove(); resolve(v); };
            dlg.addEventListener('cancel', e => { e.preventDefault(); finish(null); });
            dlg.querySelectorAll('[data-ct-x]').forEach(b => b.addEventListener('click', () => finish(null)));
            const snap = () => { hist = hist.slice(0, hi + 1); hist.push([...sel]); if (hist.length > 100) hist.shift(); hi = hist.length - 1; };
            const recompute = () => { if (M) rings = dissolve(M, [...sel]); };
            const paintSide = () => {
                const n = sel.size; $('[data-ct-count]').textContent = n ? T('{n} dans ce territoire', {n: plural(n, T('commune'))}) : T('Aucune commune pour l’instant.');
                const zs = M ? [...sel].map(c => M.byCode.get(c)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, 'fr')) : [...sel].map(c => ({code: c, name: c, dep: ''}));
                $('[data-ct-chips]').innerHTML = zs.slice(0, 300).map(z => `<span class="ct-chip">${esc(z.name)} <small>${esc(z.dep)}</small><button type="button" data-ct-rm="${esc(z.code)}" aria-label="${esc(T('Retirer {n}', {n: z.name}))}">✕</button></span>`).join('') + (zs.length > 300 ? `<span class="muted">${esc(T('… et {n} autres', {n: String(zs.length - 300)}))}</span>` : '');
                $('[data-ct-area]').textContent = rings.length ? T('≈ {a} km²', {a: Math.round(ringsArea(rings)).toLocaleString('fr-FR')}) : '';
                $('[data-ct-undo]').disabled = hi <= 0; $('[data-ct-redo]').disabled = hi >= hist.length - 1;
            };
            const setSel = (codes, label = '') => { sel = new Set(codes); snap(); recompute(); paintSide(); draw(); if (label) $('[data-ct-count]').textContent += ' — ' + label; };
            const toggle = c => { const s = new Set(sel); if (s.has(c)) s.delete(c); else s.add(c); setSel([...s]); };
            const addMany = (codes, label) => { const s = new Set(sel); let n = 0; codes.forEach(c => { if (!s.has(c)) { s.add(c); n++; } }); setSel([...s], label ? T('{n} ajoutées ({l})', {n: String(n), l: label}) : ''); };

            /* la carte : communes quand on est assez près, départements sinon */
            const FR = [-5.2, 41.3, 9.6, 51.15];
            const toView = b => { const x0 = px(b[0]), x1 = px(b[2]), y0 = py(b[3]), y1 = py(b[1]), m = Math.max(x1 - x0, y1 - y0) * .08 + .01; return [x0 - m, y0 - m, x1 - x0 + m * 2, y1 - y0 + m * 2]; };
            const fitView = () => { const b = ringsBbox(rings); view = toView(b || FR); draw(); };
            const pathMem = new Map();
            const communeD = z => { let d = pathMem.get(z.code); if (!d) { d = dOf(communeRings(M, z)); pathMem.set(z.code, d); } return d; };
            let depD = null;
            const draw = () => {
                if (!M || !view) return;
                const r = svg.getBoundingClientRect(), ar = (r.height || 400) / (r.width || 600);
                // l'aire visible suit la forme de la carte
                const cx = view[0] + view[2] / 2, cy = view[1] + view[3] / 2; let w = view[2], h = view[3];
                if (h / w > ar) w = h / ar; else h = w * ar; view = [cx - w / 2, cy - h / 2, w, h];
                svg.setAttribute('viewBox', view.join(' '));
                const lon0 = view[0] / PK + 2.5, lon1 = (view[0] + view[2]) / PK + 2.5, lat1 = -view[1], lat0 = -(view[1] + view[3]);
                const vis = M.communes.filter(z => z.bbox[2] >= lon0 && z.bbox[0] <= lon1 && z.bbox[3] >= lat0 && z.bbox[1] <= lat1);
                const fill = st.color;
                if (vis.length <= 2600) {
                    $('[data-ct-base]').innerHTML = vis.map(z => `<path d="${communeD(z)}" data-ct-c="${z.code}" class="ct-com${sel.has(z.code) ? ' is-on' : ''}" style="${sel.has(z.code) ? `fill:${esc(fill)}` : ''}"><title>${esc(z.name)} (${esc(z.dep)})</title></path>`).join('');
                    const cell = view[2] / 9, taken = new Set(); // un nom par case de la grille : lisible
                    $('[data-ct-lab]').innerHTML = view[2] < 1.2 ? vis.filter(z => z.label[0] >= lon0 && z.label[0] <= lon1 && z.label[1] >= lat0 && z.label[1] <= lat1).sort((p, q) => (sel.has(q.code) - sel.has(p.code)) || (q.bbox[2] - q.bbox[0]) - (p.bbox[2] - p.bbox[0])).filter(z => { const k = Math.floor(px(z.label[0]) / cell) + ':' + Math.floor(py(z.label[1]) / (cell / 3)); if (taken.has(k)) return false; taken.add(k); return true; }).slice(0, 300).map(z => `<text x="${px(z.label[0]).toFixed(4)}" y="${py(z.label[1]).toFixed(4)}" font-size="${(view[2] / 90).toFixed(5)}">${esc(z.name)}</text>`).join('') : '';
                } else {
                    if (!depD) depD = [...M.deps.entries()].map(([dep, zs]) => ({dep, d: dOf(dissolve(M, zs.map(z => z.code))), b: zs.reduce((b, z) => [Math.min(b[0], z.bbox[0]), Math.min(b[1], z.bbox[1]), Math.max(b[2], z.bbox[2]), Math.max(b[3], z.bbox[3])], [Infinity, Infinity, -Infinity, -Infinity])}));
                    $('[data-ct-base]').innerHTML = depD.map(x => `<path d="${x.d}" data-ct-dep="${x.dep}" class="ct-dep"><title>${esc((D?.dep || {})[x.dep] || x.dep)} — ${esc(T('cliquer pour voir ses communes'))}</title></path>`).join('');
                    $('[data-ct-lab]').innerHTML = '';
                }
                const pid = 'ctp' + (hatchSeq++);
                $('[data-ct-defs]').innerHTML = hatchDef(pid, st, view[2] / 60);
                $('[data-ct-shape]').innerHTML = rings.length ? `<path d="${dOf(rings)}" class="ct-shape" fill="${st.hatch ? `url(#${pid})` : 'none'}" fill-rule="evenodd" stroke="${esc(st.color)}"${st.dash ? ' stroke-dasharray="6 4"' : ''}/>` : '';
            };
            let hatchSeq = 0;
            // molette, glisser, clic
            const ptOf = e => { const r = svg.getBoundingClientRect(); return [view[0] + (e.clientX - r.left) / r.width * view[2], view[1] + (e.clientY - r.top) / r.height * view[3]]; };
            const zoom = (k, at = null) => { const [cx, cy] = at || [view[0] + view[2] / 2, view[1] + view[3] / 2]; view = [cx - (cx - view[0]) * k, cy - (cy - view[1]) * k, view[2] * k, view[3] * k]; draw(); };
            svg.addEventListener('wheel', e => { if (!view) return; e.preventDefault(); zoom(e.deltaY > 0 ? 1.25 : 0.8, ptOf(e)); }, {passive: false});
            let drag = null;
            svg.addEventListener('pointerdown', e => { if (!view || e.button !== 0) return; drag = {x: e.clientX, y: e.clientY, v: view.slice(), moved: false}; try { svg.setPointerCapture(e.pointerId); } catch (_) {} });
            svg.addEventListener('pointermove', e => { if (!drag) return; const r = svg.getBoundingClientRect(), dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
                if (drag.moved) { view = [drag.v[0] - dx / r.width * drag.v[2], drag.v[1] - dy / r.height * drag.v[3], drag.v[2], drag.v[3]]; svg.setAttribute('viewBox', view.join(' ')); } });
            svg.addEventListener('pointerup', e => {
                const d = drag; drag = null; if (!d) return;
                if (d.moved) { draw(); return; }
                const el = document.elementFromPoint(e.clientX, e.clientY);
                const c = el?.closest?.('[data-ct-c]'); if (c) { toggle(c.dataset.ctC); return; }
                const dp = el?.closest?.('[data-ct-dep]'); if (dp) { const x = depD.find(q => q.dep === dp.dataset.ctDep); if (x) { view = toView(x.b); draw(); } }
            });
            dlg.addEventListener('click', e => {
                const z = e.target.closest('[data-ct-z]'); if (z) { const k = z.dataset.ctZ; if (k === 'in') zoom(.66); else if (k === 'out') zoom(1.5); else if (k === 'fit') fitView(); else { view = toView(FR); draw(); } return; }
                const rm = e.target.closest('[data-ct-rm]'); if (rm) { toggle(rm.dataset.ctRm); return; }
                const sg = e.target.closest('[data-ct-pick]'); if (sg) { const z = M?.byCode.get(sg.dataset.ctPick); if (z) { if (!sel.has(z.code)) toggle(z.code); view = toView(z.bbox.map((v, i) => v + (i < 2 ? -.15 : .15))); draw(); } $('[data-ct-q]').value = ''; $('[data-ct-sugg]').hidden = true; return; }
                const gp = e.target.closest('[data-ct-grp]'); if (gp) { const [k, code, label] = JSON.parse(gp.dataset.ctGrp); addMany(groupCodes(k, code), label); $('[data-ct-g]').value = ''; $('[data-ct-gsugg]').hidden = true; fitView(); return; }
                if (e.target.closest('[data-ct-undo]')) { if (hi > 0) { hi--; sel = new Set(hist[hi]); recompute(); paintSide(); draw(); } return; }
                if (e.target.closest('[data-ct-redo]')) { if (hi < hist.length - 1) { hi++; sel = new Set(hist[hi]); recompute(); paintSide(); draw(); } return; }
                if (e.target.closest('[data-ct-places]')) { placesPanel(); return; }
                if (e.target.closest('[data-ct-padd]')) { const codes = [...dlg.querySelectorAll('[data-ct-pc]:checked')].map(i => i.value); addMany(codes, T('mes lieux')); $('[data-ct-plist]').hidden = true; fitView(); }
            });
            const groupCodes = (k, code) => !M ? [] : k === 'dep' ? (M.deps.get(code) || []).map(z => z.code) : M.communes.filter(z => { const c = D?.c?.[z.code]; return c && (k === 'arr' ? c[0] === code : c[1] === code); }).map(z => z.code);
            // les propositions au fil de la frappe
            $('[data-ct-q]').addEventListener('input', e => {
                const q = fold(e.target.value), box = $('[data-ct-sugg]'); if (!M || q.length < 2) { box.hidden = true; return; }
                const hits = /^\d[\dab]\d{0,3}$/.test(q) ? M.communes.filter(z => z.code.toLowerCase().startsWith(q)) : M.communes.filter(z => z.k.startsWith(q) || z.k.includes(' ' + q) || z.alt.some(a => fold(a).startsWith(q)));
                hits.sort((a, b) => (a.k.startsWith(q) ? 0 : 1) - (b.k.startsWith(q) ? 0 : 1) || a.name.length - b.name.length);
                box.innerHTML = hits.slice(0, 12).map(z => `<button type="button" data-ct-pick="${z.code}">${sel.has(z.code) ? '✓ ' : ''}${esc(z.name)} <small>${esc((D?.dep || {})[z.dep] || z.dep)} · ${esc(z.code)}</small></button>`).join('') || `<p class="muted">${esc(T('Aucune commune de ce nom.'))}</p>`;
                box.hidden = false;
            });
            $('[data-ct-g]').addEventListener('input', e => {
                const q = fold(e.target.value), box = $('[data-ct-gsugg]'); if (!D || q.length < 2) { box.hidden = true; return; }
                const out = [];
                const look = (k, obj, word) => Object.entries(obj || {}).forEach(([code, n]) => { const f = fold(n); if (f.startsWith(q) || f.includes(' ' + q) || code.toLowerCase() === q) out.push([k, code, n, word]); });
                look('dep', D.dep, T('Département')); look('arr', D.arr, T('Arrondissement')); look('can', D.can, T('Canton'));
                box.innerHTML = out.slice(0, 15).map(([k, code, n, word]) => { const dep = k === 'dep' ? code : k === 'arr' ? code.slice(0, code.length - 1) : code.slice(0, code.length - 2); const label = `${word} : ${n}${k === 'dep' ? ` (${code})` : ` (${(D.dep || {})[dep] || dep})`}`;
                    return `<button type="button" data-ct-grp="${esc(JSON.stringify([k, code, label]))}">${esc(label)}</button>`; }).join('') || `<p class="muted">${esc(T('Rien de ce nom.'))}</p>`;
                box.hidden = false;
            });
            async function placesPanel() {
                const box = $('[data-ct-plist]'); box.hidden = false; box.innerHTML = `<p class="muted">${esc(T('Chargement de tes lieux…'))}</p>`;
                try {
                    const ps = (await api('terr_places')).places || [];
                    const rows = []; const seenC = new Set();
                    for (const p of ps) {
                        let z = p.insee && M.byCode.get(p.insee);
                        if (!z) z = M.communes.find(c => p.lon >= c.bbox[0] && p.lon <= c.bbox[2] && p.lat >= c.bbox[1] && p.lat <= c.bbox[3] && inRings(communeRings(M, c), p.lat, p.lon));
                        if (z && !seenC.has(z.code)) { seenC.add(z.code); rows.push({p, z}); }
                    }
                    box.innerHTML = rows.length ? `<div class="ct-plist">${rows.map(({p, z}) => `<label class="checkbox-line"><input type="checkbox" data-ct-pc value="${z.code}" ${sel.has(z.code) ? 'checked disabled' : ''}> ${esc(z.name)} <small class="muted">${esc(p.name !== z.name ? p.name + ' · ' : '')}${esc(plural(p.n, T('événement')))}</small></label>`).join('')}</div><button type="button" class="button small" data-ct-padd>${esc(T('Ajouter les communes cochées'))}</button>`
                        : `<p class="muted">${esc(T('Aucun lieu de ta base n’est placé en France sur la carte.'))}</p>`;
                } catch (err) { box.innerHTML = `<p class="muted">${esc(err.message)}</p>`; }
            }
            dlg.addEventListener('input', e => {
                const k = e.target.dataset?.ctSt; if (!k) return;
                st[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'range' ? Number(e.target.value) : e.target.value; draw();
            });
            dlg.querySelector('form').addEventListener('submit', async e => {
                e.preventDefault();
                const nm = $('[data-ct-name]').value.trim(); if (!nm) { toast(T('Donne un nom au territoire.'), 'error'); $('[data-ct-name]').focus(); return; }
                if (!sel.size || !rings.length) { toast(T('Choisis au moins une commune.'), 'error'); return; }
                const b = $('[data-ct-save]'); b.disabled = true;
                try { const t = await save({...(t0?.id ? {id: t0.id, note: t0.note || ''} : {}), name: nm, kind: 'communes', style: {...st, fill: st.color}, communes: [...sel], rings}); finish(t); }
                catch (err) { toast(err.message, 'error'); b.disabled = false; }
            });
            dlg.showModal();
            Promise.all([communes(), decoupage().catch(() => null)]).then(([m, d]) => {
                if (done) return; M = m; D = d; $('[data-ct-wait]').hidden = true;
                // des codes anciens (communes fusionnées) → la commune d'aujourd'hui
                sel = new Set([...sel].map(c => M.byCode.get(c)?.code || c)); snap();
                if (sel.size) recompute(); paintSide(); fitView();
            }).catch(err => { $('[data-ct-wait]').textContent = err.message; });
            paintSide();
        });
    }

    /* ═════════════ 🧩 Mes territoires : la liste ═════════════ */
    async function manage({pick: picking = false} = {}) {
        let l = []; try { l = await list(); } catch (err) { toast(err.message, 'error'); }
        return new Promise(resolve => {
            const dlg = document.createElement('dialog'); dlg.className = 'ct-dialog ct-manage'; document.body.appendChild(dlg);
            let done = false; const finish = v => { if (done) return; done = true; try { dlg.close(); } catch (_) {} dlg.remove(); resolve(v); };
            const paint = () => {
                dlg.innerHTML = `<div class="ct-shell"><header class="ct-head"><h2>🧩 ${esc(picking ? T('Choisir un territoire') : T('Mes territoires'))}</h2><button type="button" class="icon-button" data-ct-x aria-label="${esc(T('Fermer'))}">×</button></header>
                    <p class="muted">${esc(T('Des communes réunies en un seul territoire, à poser sur les cartes, les diagrammes et les dessins.'))}</p>
                    <div class="ct-list">${l.map(t => `<article class="ct-item">${thumb(t)}<div><b>${esc(t.name)}</b><br><small class="muted">${esc(plural(t.communes?.length || 0, T('commune')))}</small></div>
                        <div class="ct-row">${picking ? `<button type="button" class="button small" data-ct-use="${t.id}">${esc(T('Choisir'))}</button>` : ''}<button type="button" class="button small secondary" data-ct-edit="${t.id}">✏️ ${esc(T('Modifier'))}</button><button type="button" class="button small secondary" data-ct-dup="${t.id}">⧉ ${esc(T('Copier'))}</button><button type="button" class="button small danger" data-ct-del="${t.id}">🗑</button></div></article>`).join('')
                        || `<p class="muted">${esc(T('Pas encore de territoire.'))}</p>`}</div>
                    <footer class="ct-foot"><button type="button" class="button" data-ct-new>＋ ${esc(T('Nouveau territoire à partir de communes'))}</button><span class="ct-sp"></span><button type="button" class="button secondary" data-ct-x>${esc(T('Fermer'))}</button></footer></div>`;
            };
            paint();
            dlg.addEventListener('cancel', e => { e.preventDefault(); finish(null); });
            dlg.addEventListener('click', async e => {
                if (e.target.closest('[data-ct-x]')) return finish(null);
                const u = e.target.closest('[data-ct-use]'); if (u) return finish(l.find(t => t.id === Number(u.dataset.ctUse)) || null);
                const ed = e.target.closest('[data-ct-edit]'), dp = e.target.closest('[data-ct-dup]'), del = e.target.closest('[data-ct-del]');
                if (e.target.closest('[data-ct-new]')) { const t = await open(null); l = await list(); if (picking && t) return finish(t); paint(); return; }
                if (ed) { await open(Number(ed.dataset.ctEdit)); l = await list(); paint(); return; }
                if (dp) { const t = l.find(x => x.id === Number(dp.dataset.ctDup)); if (t) { try { await save({...t, id: 0, name: T('{n} (copie)', {n: t.name})}); } catch (err) { toast(err.message, 'error'); } l = await list(); paint(); } return; }
                if (del) { const t = l.find(x => x.id === Number(del.dataset.ctDel)); if (t) { try { await remove(t); } catch (err) { toast(err.message, 'error'); } l = await list(); paint(); } }
            });
            dlg.showModal();
        });
    }
    const pick = () => manage({pick: true});

    /* ═════════════ 🗺 la Carte : « 🧩 Mes territoires » ═════════════ */
    const PREF = 'genealogie-carte-territoires';
    const pref = () => { try { return JSON.parse(localStorage.getItem(PREF) || '{}') || {}; } catch (_) { return {}; } };
    const setPref = p => { try { localStorage.setItem(PREF, JSON.stringify({...pref(), ...p})); } catch (_) {} };
    for (const k of ['mapSetup', 'mapDraw']) ext[k] = ext[k] || [];
    ext.mapSetup.push(() => {
        const strip = document.querySelector('.map-layout .tool-strip'), stage = document.getElementById('map-stage');
        if (!strip || !stage || document.getElementById('ct-map-layer')) return;
        const layer = document.createElement('div'); layer.id = 'ct-map-layer'; layer.className = 'ct-map-layer'; layer.innerHTML = '<svg aria-hidden="true"></svg>';
        stage.insertBefore(layer, document.getElementById('map-overlay') || null);
        const ctl = document.createElement('span'); ctl.className = 'ct-map-ctl';
        ctl.innerHTML = `<label class="ui-toggle" title="${esc(T('Tes territoires (communes réunies) par-dessus la carte'))}"><input type="checkbox" data-ct-layer ${pref().on ? 'checked' : ''}><i></i>🧩 ${esc(T('Mes territoires'))}</label><button type="button" class="link-button" data-ct-manage title="${esc(T('Créer ou modifier tes territoires'))}">${esc(T('gérer'))}</button>`;
        strip.insertBefore(ctl, strip.querySelector('.spacer'));
        ctl.querySelector('[data-ct-layer]').addEventListener('change', e => { setPref({on: e.target.checked}); if (e.target.checked) list().then(() => A().drawMap?.()).catch(err => toast(err.message, 'error')); else A().drawMap?.(); });
        ctl.querySelector('[data-ct-manage]').addEventListener('click', () => manage().then(() => A().drawMap?.()));
        if (pref().on) list().then(() => A().drawMap?.()).catch(() => {});
    });
    ext.mapDraw.push(({left, top, z, width, height}) => {
        const layer = document.getElementById('ct-map-layer'); if (!layer) return;
        const svg = layer.querySelector('svg');
        if (!pref().on || !cache?.length) { svg.innerHTML = ''; return; }
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        const X = lon => A().lngToX(lon, z) - left, Y = lat => A().latToY(lat, z) - top;
        let defs = '', body = '', labs = '';
        cache.forEach((t, i) => {
            const b = t.bbox; if (!b) return;
            if (X(b[2]) < 0 || X(b[0]) > width || Y(b[1]) < 0 || Y(b[3]) > height) return;
            const st = t.style || {}, id = `ctm${i}`; defs += hatchDef(id, st, 10);
            const d = (t.rings || []).map(r => r.map((p, k) => `${k ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join('') + 'Z').join('');
            body += `<path d="${d}" fill="${st.hatch ? `url(#${id})` : esc(st.color || '#c0392b')}" fill-opacity="${st.hatch ? 1 : (st.opacity ?? .25)}" fill-rule="evenodd" stroke="${esc(st.color || '#c0392b')}" stroke-width="${st.width || 2}"${st.dash ? ' stroke-dasharray="6 4"' : ''}><title>${esc(t.name)}</title></path>`;
            if (st.label !== false && X(b[2]) - X(b[0]) > 50) labs += `<text x="${((X(b[0]) + X(b[2])) / 2).toFixed(0)}" y="${((Y(b[1]) + Y(b[3])) / 2).toFixed(0)}" style="fill:${esc(st.color || '#c0392b')}">${esc(t.name)}</text>`;
        });
        svg.innerHTML = `<defs>${defs}</defs>${body}${labs}<text class="ct-map-attr" x="${width - 10}" y="${height - 26}">${esc(ATTR)}</text>`;
    });

    /* ═════════════ 📋 Listes : la liste des territoires, et le filtre « dans le territoire » ═════════════ */
    (ext.dataLists = ext.dataLists || []).push({id: 'mes_territoires', icon: '🧩', label: T('Mes territoires (communes réunies)'), group: 'Le lieu', source: ATTR,
        load: async () => (await list(true)).map(t => { const b = t.bbox || [0, 0, 0, 0]; return {id: t.id, name: t.name, communes: t.communes?.length || 0, km2: Math.round(ringsArea(t.rings)), lat: (b[1] + b[3]) / 2, lon: (b[0] + b[2]) / 2}; }),
        fields: [{key: 'name', label: T('Nom'), type: 'text'}, {key: 'communes', label: T('Communes'), type: 'number'}, {key: 'km2', label: T('Surface (km²)'), type: 'number'}],
        geo: r => [r.lat, r.lon], open: r => open(r.id)});
    (ext.dataListFilters = ext.dataListFilters || []).push({id: 'territoire', icon: '🧩', label: T('Dans le territoire'), needs: 'geo',
        options: async () => (await list()).map(t => ({value: String(t.id), label: t.name})),
        prepare: async () => { await list(); }, test: (latlon, value) => Array.isArray(latlon) && contains(latlon[0], latlon[1], Number(value))});

    (ext.dataSources = ext.dataSources || []).push({id: 'mes_territoires', icon: '🧩', label: T('Dans quels territoires est ce lieu ?'), group: 'Le lieu', needs: ['place'], installed: () => true,
        run: async (ctx, host) => {
            const pl = ctx?.place || {}, lat = Number(pl.latitude ?? pl.lat), lon = Number(pl.longitude ?? pl.lon); await list().catch(() => {});
            const hits = Number.isFinite(lat) && Number.isFinite(lon) ? at(lat, lon) : [];
            host.innerHTML = `<p>${hits.length ? esc(T('{p} est dans : {t}.', {p: pl.name || T('Ce lieu'), t: hits.map(t => t.name).join(', ')})) : esc(T('Ce lieu n’est dans aucun de tes territoires.'))} <button type="button" class="link-button" data-ct-mng>🧩 ${esc(T('Mes territoires'))}</button></p>`;
            host.querySelector('[data-ct-mng]').addEventListener('click', () => manage());
        }});

    ext.territories = {...core, list, get, cached: () => cache || [], contains, at, open, manage, pick, save, remove, communes, decoupage, feature, hatchDef, thumb, ATTR};
    // une liste prête tôt : les filtres et les couches peuvent s'en servir sans attendre
    const boot = () => { if (A()?.api && A()?.state?.csrf !== undefined) list().catch(() => {}); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 1500), {once: true}); else setTimeout(boot, 1500);
})(typeof window !== 'undefined' ? window : globalThis);
