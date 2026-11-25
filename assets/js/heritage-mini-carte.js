/**
 * LCNDA — 🗺 La petite carte qui bouge : zoom, déplacement, regroupement des points, ◐ noir et blanc.
 *
 * ext.miniMap (heritage.js) écrit d'abord une carte fixe (HTML) ; ce fichier la « réveille » dès qu'elle est dans la page :
 *  · zoom : molette / pincement du pavé tactile, double-clic, boutons + −, clavier (+ − et les flèches), deux doigts sur téléphone ;
 *    déplacement : glisser (souris, doigt) ou flèches ; « ⤢ Tout voir » recadre sur tous les points ; zoom limité (0 → 18) ;
 *  · tuiles : le fond de carte choisi dans Réglages (A().mapTileUrl, comme l'onglet Carte : même choix, même repli hors ligne),
 *    « © OpenStreetMap » écrit sur la carte ; rien d'autre n'est demandé à Internet que les tuiles affichées ;
 *  · beaucoup de points : regroupés en pastilles « 42 » qui se séparent quand on zoome (clic sur la pastille = zoom dessus) ;
 *  · ◐ Noir et blanc (« genealogie-minicarte-nb ») : contours seuls, traits noirs sur blanc (blancs sur noir en thème sombre),
 *    sans aucune tuile : pays et côtes (Natural Earth, domaine public), puis en zoomant régions d'Europe (NUTS 2, © EuroGeographics),
 *    régions et départements français (IGN Admin Express, Licence Ouverte), enfin communes et leurs noms (IGN / INSEE, Licence Ouverte) —
 *    les fonds déjà livrés avec l'app (assets/data/geo/, voir LICENCES.txt), lus seulement quand on en a besoin ; s'imprime tel quel.
 *  · cercles : {lat, lon, km} (ex. « 📍 Autour de… » des listes de données).
 *
 * Pourquoi les points semblaient « à côté » des côtes : la carte fixe plaçait les tuiles en % de la boîte (étirées à sa taille réelle)
 * mais les points dans un <svg viewBox> qui, lui, garde ses proportions (« meet ») : dès que la boîte n'avait pas exactement les
 * proportions du viewBox (bordure comprise dans aspect-ratio, cadre épais du thème, arrondis…), les points glissaient vers le centre,
 * d'autant plus qu'on va vers les bords (Amérique du Sud, Australie). Ici tout est dessiné en vrais pixels de la boîte, mesurée,
 * dans la même projection (Web Mercator) que les tuiles ; la bande grise du haut (le monde moins haut que la carte) disparaît aussi.
 *
 * Pour les écrans qui en ont besoin :
 *   ext.miniMapOf(el) → le contrôleur de la carte qui contient el (ou qui est dans el) : {view(), bounds(), fit(), setView(lat, lon, z),
 *     zoomBy(d), points, el} ; la carte envoie l'évènement « minimap-view » (detail : {zoom, bounds, fitZoom}) après chaque mouvement.
 * Essai : tests/test-mini-carte-zoom.js
 */
(function () {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP || {};
    const T = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const nf = n => Number(n).toLocaleString('fr-FR');
    const NB_KEY = 'genealogie-minicarte-nb';
    const MAXLAT = 85.05112878, MIN_Z = 0, MAX_Z = 18, CLUSTER_MIN = 30, CLUSTER_CELL = 52, CLUSTER_OFF_Z = 15;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const nX = lon => (Number(lon) + 180) / 360;
    const nY = lat => { const s = Math.sin(clamp(Number(lat), -MAXLAT, MAXLAT) * Math.PI / 180); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); };
    const lonOf = x => x * 360 - 180;
    const latOf = y => 180 / Math.PI * Math.atan(Math.sinh(Math.PI * (1 - 2 * y)));
    const nbOn = () => { try { return localStorage.getItem(NB_KEY) === '1'; } catch (_) { return false; } };
    const setNb = on => { try { localStorage.setItem(NB_KEY, on ? '1' : '0'); } catch (_) {} };
    const near = (x, c) => x + Math.round(c - x); // la copie du monde la plus proche du centre (le Pacifique d'un seul tenant)

    /* ───── les cartes écrites par heritage.js, réveillées quand elles arrivent dans la page ───── */
    const pending = new Map(); let seq = 0, mo = null, queued = false;
    function register(cfg) {
        const id = 'mm' + (++seq).toString(36) + Math.random().toString(36).slice(2, 6);
        pending.set(id, {...cfg, t: Date.now()});
        if (pending.size > 60) pending.delete(pending.keys().next().value);
        watch(); return id;
    }
    function watch() {
        later();
        if (!mo && document.body) { mo = new MutationObserver(later); mo.observe(document.body, {childList: true, subtree: true}); }
    }
    function later() { if (queued) return; queued = true; Promise.resolve().then(() => { queued = false; scan(document); }); }
    function scan(root) {
        if (!pending.size) { if (mo) { mo.disconnect(); mo = null; } return; }
        // une seule recherche dans la page, quel que soit le nombre de cartes en attente
        const els = [...(root.querySelectorAll?.('[data-mm]:not([data-mm-ready])') || [])];
        if (root.matches?.('[data-mm]:not([data-mm-ready])')) els.push(root);
        for (const el of els) {
            const cfg = pending.get(el.dataset.mm);
            if (!cfg || !el.isConnected) continue;
            pending.delete(el.dataset.mm);
            try { el.__mm = new MiniMap(el, cfg); } catch (e) { console.error(e); }
        }
        const now = Date.now();
        for (const [id, cfg] of pending) if (now - cfg.t > 20000) pending.delete(id); // jamais mise dans la page : oubliée
        if (!pending.size && mo) { mo.disconnect(); mo = null; }
    }
    function miniMapOf(el) {
        if (!el) return null;
        const host = el.closest?.('[data-mm]') || el.querySelector?.('[data-mm]');
        if (!host) return null;
        if (!host.__mm) scan(host);
        return host.__mm || null;
    }

    /* ───── ◐ les contours (TopoJSON des fonds de l'app) ───── */
    const geoCache = new Map();
    async function readJson(url) {
        const r = await fetch(url); if (!r.ok) throw new Error(String(r.status));
        if (!/\.gz$/.test(url)) return r.json();
        const buf = new Uint8Array(await r.arrayBuffer());
        if (buf[0] !== 0x1f || buf[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(buf)); // déjà décompressé par le serveur
        if (typeof DecompressionStream !== 'function') throw new Error('gzip');
        return JSON.parse(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
    }
    /** une topologie → arcs en coordonnées normalisées [0..1] avec leur cadre, combien de zones les utilisent, et les noms */
    function decodeTopo(t, {skip} = {}) {
        const tr = t.transform, sx = tr ? tr.scale[0] : 1, sy = tr ? tr.scale[1] : 1, tx = tr ? tr.translate[0] : 0, ty = tr ? tr.translate[1] : 0;
        const arcs = t.arcs.map(a => {
            let x = 0, y = 0, x0 = 1 / 0, y0 = 1 / 0, x1 = -1 / 0, y1 = -1 / 0; const c = new Float64Array(a.length * 2);
            a.forEach((p, i) => { let lon, lat; if (tr) { x += p[0]; y += p[1]; lon = x * sx + tx; lat = y * sy + ty; } else { lon = p[0]; lat = p[1]; }
                const X = nX(lon), Y = nY(lat); c[2 * i] = X; c[2 * i + 1] = Y; if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y; });
            return {c, b: [x0, y0, x1, y1], n: 0};
        });
        const labels = [];
        Object.values(t.objects || {}).forEach(o => (o.geometries || []).forEach(g => {
            if (skip && skip(g.properties || {})) { g.__skip = true; }
            const walk = v => { if (typeof v === 'number') { const a = arcs[v < 0 ? ~v : v]; if (a && !g.__skip) a.n++; else if (a) a.skipN = (a.skipN || 0) + 1; } else if (Array.isArray(v)) v.forEach(walk); };
            walk(g.arcs);
            const p = g.properties || {};
            if (p.n && !g.__skip) {
                // la taille de la zone (les plus grandes communes nommées d'abord) ; sans point d'étiquette : le milieu de son cadre
                let x0 = 1 / 0, y0 = 1 / 0, x1 = -1 / 0, y1 = -1 / 0;
                const box = v => { if (typeof v === 'number') { const a = arcs[v < 0 ? ~v : v]; if (a) { x0 = Math.min(x0, a.b[0]); y0 = Math.min(y0, a.b[1]); x1 = Math.max(x1, a.b[2]); y1 = Math.max(y1, a.b[3]); } } else if (Array.isArray(v)) v.forEach(box); };
                box(g.arcs);
                const l = Array.isArray(p.l) ? [nX(p.l[0]), nY(p.l[1])] : (Number.isFinite(x0) ? [(x0 + x1) / 2, (y0 + y1) / 2] : null);
                if (l) labels.push({n: p.n, x: l[0], y: l[1], s: Number.isFinite(x0) ? (x1 - x0) * (y1 - y0) : 0});
            }
        }));
        labels.sort((a, b) => b.s - a.s);
        return {arcs, labels};
    }
    const LAYERS = {
        world110: {url: 'assets/data/geo/monde-110m.json', src: 'ne'},
        world50: {url: 'assets/data/geo/monde-50m.json', src: 'ne'},
        nuts2: {url: 'assets/data/geo/eu-nuts2.json', src: 'nuts', skip: p => p.p === 'FR' || /^FR/.test(String(p.i || ''))},
        frReg: {url: 'assets/data/geo/fr-regions.json', src: 'ign'},
        frDep: {url: 'assets/data/geo/fr-departements.json', src: 'ign'},
        frCom: {url: 'assets/data/geo/fr-communes.json.gz', src: 'ignc'},
    };
    const SOURCES_NB = {
        ne: ['Made with Natural Earth (domaine public)', 'https://www.naturalearthdata.com/'],
        nuts: ['© EuroGeographics (Eurostat GISCO)', 'https://ec.europa.eu/eurostat/web/gisco/geodata/administrative-units'],
        ign: ['IGN Admin Express (Licence Ouverte)', 'https://www.etalab.gouv.fr/licence-ouverte-open-licence/'],
        ignc: ['communes : IGN / INSEE (Licence Ouverte)', 'https://www.etalab.gouv.fr/licence-ouverte-open-licence/'],
    };
    function layer(key) {
        if (!geoCache.has(key)) {
            const L = LAYERS[key];
            geoCache.set(key, {ready: false, p: readJson(L.url).then(j => {
                const tops = [j.topo, ...(Array.isArray(j.more) ? j.more : [])].filter(Boolean);
                const out = {arcs: [], labels: []};
                tops.forEach(t => { const d = decodeTopo(t, {skip: L.skip}); out.arcs.push(...d.arcs); out.labels.push(...d.labels); });
                const e = geoCache.get(key); e.ready = true; e.data = out; return out;
            }).catch(() => { const e = geoCache.get(key); e.ready = true; e.data = null; return null; })});
        }
        return geoCache.get(key);
    }
    /** les couches à dessiner à ce zoom : [clé, quels arcs ('all' | 'inner' = frontières seulement), style] */
    function layersFor(z, cx, cy, spanX, spanY) {
        const inEurope = cx + spanX / 2 > nX(-25) && cx - spanX / 2 < nX(45) && cy - spanY / 2 < nY(34) && cy + spanY / 2 > nY(72);
        const inFrance = cx + spanX / 2 > nX(-6) && cx - spanX / 2 < nX(10) && cy - spanY / 2 < nY(41) && cy + spanY / 2 > nY(51.5);
        const out = [[z < 3 ? 'world110' : 'world50', 'all', 'mm-nb-world']];
        if (z >= 4.5 && inEurope) out.push(['nuts2', 'inner', 'mm-nb-reg']);
        if (z >= 4.5 && inFrance) out.push(['frReg', 'inner', 'mm-nb-reg']);
        if (z >= 6 && inFrance) out.push(['frDep', 'inner', 'mm-nb-dep']);
        if (z >= 9 && inFrance) out.push(['frCom', z >= 10 ? 'all' : 'none', 'mm-nb-com', true]);
        return out;
    }

    /* ───── les styles (une fois) ───── */
    function css() {
        if (document.getElementById('mm-css')) return;
        const st = document.createElement('style'); st.id = 'mm-css';
        st.textContent = `.person-map-stage.mm-on{touch-action:none;cursor:grab;container-type:inline-size;outline-offset:2px;-webkit-user-select:none;user-select:none}
.person-map-stage.mm-on.mm-drag{cursor:grabbing}
.person-map-stage.mm-on:focus-visible{outline:3px solid var(--blue-bright,#055dff)}
.mm-tiles{position:absolute;inset:0;z-index:0;overflow:hidden;pointer-events:none}
.mm-tiles .person-map-tile{max-width:none;max-height:none}
.mm-vec{position:absolute;inset:0;z-index:1;width:100%;height:100%;display:block;pointer-events:none;transform-origin:0 0;color:#111;background:#fff}
.mm-vec .mm-nb-world{fill:none;stroke:currentColor;stroke-width:.8;stroke-linejoin:round}
.mm-vec .mm-nb-world.mm-nb-coast{stroke-width:1.15}
.mm-vec .mm-nb-reg{fill:none;stroke:currentColor;stroke-width:.6;stroke-dasharray:5 3}
.mm-vec .mm-nb-dep{fill:none;stroke:currentColor;stroke-width:.45;opacity:.85}
.mm-vec .mm-nb-com{fill:none;stroke:currentColor;stroke-width:.3;opacity:.55}
.mm-vec .mm-nb-town circle{fill:currentColor}
.mm-vec .mm-nb-town text{fill:currentColor;font:11px/1 Helvetica,Arial,sans-serif;paint-order:stroke;stroke:#fff;stroke-width:3px}
.person-map-stage.mm-nb{background:#fff;background-image:none}
.person-map-stage.mm-nb .h-map-label{fill:#111;stroke:#fff}
.mm-ctl{position:absolute;z-index:4;top:8px;right:8px;display:flex;flex-direction:column;align-items:flex-end;gap:4px}
.mm-ctl button{min-width:34px;height:34px;padding:0 8px;border:1.5px solid var(--ink,#111);background:var(--card-bg,#fff);color:var(--ink,#111);font:inherit;font-size:17px;line-height:1;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:5px;border-radius:0}
.mm-ctl button:hover{background:var(--blue-soft,#eaf1ff)}
.mm-ctl button:focus-visible{outline:3px solid var(--blue-bright,#055dff);outline-offset:1px}
.mm-ctl button[aria-pressed="true"]{background:var(--ink,#111);color:var(--card-bg,#fff)}
.mm-ctl .mm-lab{font-size:12.5px;font-weight:600}
@container (max-width:520px){.mm-ctl .mm-lab{display:none}.mm-ctl{top:6px;right:6px}.mm-ctl button{min-width:32px;height:32px}}
.mm-credit{position:absolute;z-index:3;right:0;bottom:0;max-width:100%;padding:1px 5px;font-size:10.5px;line-height:1.35;background:rgba(255,255,255,.82);color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mm-credit a{color:inherit}
.mm-credit:empty{display:none}
.mm-tip{position:absolute;z-index:5;max-width:min(260px,80%);padding:4px 8px;background:#111;color:#fff;font-size:12.5px;line-height:1.3;pointer-events:none;transform:translate(-50%,calc(-100% - 12px));white-space:normal}
.mm-tip[hidden]{display:none}
.h-map-cluster{cursor:pointer}
.h-map-cluster circle{fill:var(--blue-bright,#055dff);fill-opacity:.88;stroke:#fff;stroke-width:2.5}
.h-map-cluster text{fill:#fff;font:700 12px/1 Helvetica,Arial,sans-serif;pointer-events:none}
.h-map-cluster:focus-visible circle,.mm-on .h-map-point:focus-visible circle{stroke:#111;stroke-width:3.5}
.mm-on .h-map-point{outline:none}
.mm-on .h-map-point:hover circle{stroke:#111}
.mm-circle{fill:rgba(212,56,13,.08);stroke:#d4380d;stroke-width:2;stroke-dasharray:7 5}
:root[data-theme="dark"] .mm-vec{color:#eee;background:#121212}
:root[data-theme="dark"] .mm-vec .mm-nb-town text{stroke:#121212}
:root[data-theme="dark"] .person-map-stage.mm-nb{background:#121212}
:root[data-theme="dark"] .person-map-stage.mm-nb .h-map-label{fill:#eee;stroke:#121212}
:root[data-theme="dark"] .mm-ctl button{background:#1d1d1d;color:#eee;border-color:#777}
:root[data-theme="dark"] .mm-ctl button[aria-pressed="true"]{background:#eee;color:#111}
:root[data-theme="dark"] .mm-credit{background:rgba(20,20,20,.82);color:#ccc}
:root[data-theme="dark"] .mm-tip{background:#eee;color:#111}
@media print{.mm-ctl,.mm-tip{display:none!important}.mm-vec{color:#000!important;background:#fff!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}.mm-vec .mm-nb-town text{stroke:#fff!important}.person-map-stage.mm-nb{background:#fff!important}}`;
        document.head.appendChild(st);
    }

    /* ───── la carte ───── */
    const SVGNS = 'http://www.w3.org/2000/svg';
    class MiniMap {
        constructor(el, cfg) {
            css();
            this.el = el; this.cfg = cfg; this.bg = cfg.bg || 'bw';
            const svg = this.svg = el.querySelector(':scope > svg');
            el.querySelectorAll(':scope > img.person-map-tile').forEach(i => i.remove());
            const marks = [...svg.querySelectorAll('.h-map-point')];
            this.points = (cfg.points || []).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon))
                .map((p, i) => ({...p, x: nX(p.lon), y: nY(p.lat), g: marks[i] || null, i}));
            this.paths = (cfg.paths || []).map(p => ({...p, n: p.coords.map(c => [nX(c[1]), nY(c[0])])}));
            this.paths.forEach(p => { for (let i = 1; i < p.n.length; i++) p.n[i][0] = near(p.n[i][0], p.n[i - 1][0]); }); // un trajet qui passe le 180e méridien reste d'un seul trait
            this.circles = (cfg.circles || []).filter(c => Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lon)) && Number(c.km) > 0).map(c => ({...c, n: circleRing(Number(c.lat), Number(c.lon), Number(c.km))}));
            this.clusterOn = cfg.cluster === true || (cfg.cluster !== false && this.points.length > CLUSTER_MIN);
            // les couches
            svg.querySelectorAll(':scope > polyline').forEach(l => l.remove());
            this.tiles = document.createElement('div'); this.tiles.className = 'mm-tiles'; el.insertBefore(this.tiles, el.firstChild);
            this.vec = document.createElementNS(SVGNS, 'svg'); this.vec.setAttribute('class', 'mm-vec'); this.vec.setAttribute('aria-hidden', 'true'); this.vec.style.display = 'none'; el.insertBefore(this.vec, svg);
            this.gCircles = document.createElementNS(SVGNS, 'g'); this.gLines = document.createElementNS(SVGNS, 'g'); this.gClusters = document.createElementNS(SVGNS, 'g');
            this.gCircles.setAttribute('class', 'mm-circles'); this.gLines.setAttribute('class', 'mm-lines'); this.gClusters.setAttribute('class', 'mm-clusters');
            svg.insertBefore(this.gLines, svg.firstChild); svg.insertBefore(this.gCircles, svg.firstChild); svg.appendChild(this.gClusters);
            svg.setAttribute('preserveAspectRatio', 'none');
            this.lineEls = this.paths.map(p => { const l = document.createElementNS(SVGNS, 'polyline'); l.setAttribute('fill', 'none'); l.setAttribute('stroke', p.color || '#0066cc'); l.setAttribute('stroke-width', p.width || 3); if (p.dashed) l.setAttribute('stroke-dasharray', '8 6'); l.setAttribute('stroke-linecap', 'round'); l.setAttribute('stroke-linejoin', 'round'); l.setAttribute('opacity', '.9'); this.gLines.appendChild(l); return l; });
            this.circleEls = this.circles.map(c => { const l = document.createElementNS(SVGNS, 'polygon'); l.setAttribute('class', 'mm-circle'); if (c.color) l.style.stroke = c.color; this.gCircles.appendChild(l); return l; });
            this.clusterEls = [];
            const live = cfg.interactive !== false; // interactive: false → carte posée dans un autre outil qui a ses propres gestes (ex. Tableaux)
            el.insertAdjacentHTML('beforeend', `${live ? `<div class="mm-ctl" role="toolbar" aria-label="${esc(T('Zoom de la carte'))}">
                <button type="button" data-mm-zoom="1" aria-label="${esc(T('Zoomer'))}" title="${esc(T('Zoomer (touche +)'))}">+</button>
                <button type="button" data-mm-zoom="-1" aria-label="${esc(T('Dézoomer'))}" title="${esc(T('Dézoomer (touche −)'))}">−</button>
                <button type="button" data-mm-fit aria-label="${esc(T('Tout voir'))}" title="${esc(T('Recadrer sur tous les points'))}"><span aria-hidden="true">⤢</span><span class="mm-lab" aria-hidden="true">${esc(T('Tout voir'))}</span></button>
                <button type="button" data-mm-nb aria-pressed="false" aria-label="${esc(T('Noir et blanc'))}" title="${esc(T('Fond sobre : contours noirs sur blanc, pour bien lire les points et pour imprimer'))}"><span aria-hidden="true">◐</span><span class="mm-lab" aria-hidden="true">${esc(T('Noir et blanc'))}</span></button>
            </div>` : ''}<div class="mm-credit" data-mm-credit></div><div class="mm-tip" role="status" hidden></div>`);
            this.ctl = el.querySelector(':scope > .mm-ctl'); this.credit = el.querySelector(':scope > .mm-credit'); this.tip = el.querySelector(':scope > .mm-tip');
            if (live) {
                el.classList.add('mm-on'); el.setAttribute('role', 'region'); el.tabIndex = 0;
                el.setAttribute('aria-label', T('Carte : molette, pincement ou + − pour zoomer ; glisser ou flèches pour se déplacer'));
            }
            el.dataset.mmReady = '1';
            this.nb = nbOn(); this.syncNb();
            this.tileMap = new Map();
            if (live) this.bind();
            this.view = null;
            const go = () => {
                if (!this.size()) return false;
                if (cfg.view && Number.isFinite(Number(cfg.view.lat))) this.setView(Number(cfg.view.lat), Number(cfg.view.lon), Number(cfg.view.zoom) || 10, true);
                else this.fit(true);
                return true;
            };
            if (!go()) this.waitSize = true;
            this.ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (!this.el.isConnected) { this.ro.disconnect(); return; } if (this.waitSize) { if (go()) this.waitSize = false; } else this.render(); }) : null;
            this.ro?.observe(el);
        }
        size() { const w = this.el.clientWidth, h = this.el.clientHeight; this.w = w; this.h = h; return w > 0 && h > 0; }
        minZ() { return clamp(Math.log2(Math.max(1, this.h) / 256), MIN_Z, 4); } // le monde au moins aussi haut que la carte : pas de bande grise
        /** {west, south, east, north} de ce qu'on voit (est > ouest, même au-delà de 180°) */
        bounds() {
            if (!this.view) return null;
            const S = 256 * 2 ** this.view.z, {cx, cy} = this.view;
            const x0 = cx - this.w / 2 / S, x1 = cx + this.w / 2 / S, y0 = clamp(cy - this.h / 2 / S, 0, 1), y1 = clamp(cy + this.h / 2 / S, 0, 1);
            let west = lonOf(x0), east = lonOf(x1); const k = Math.floor((west + 180) / 360); west -= k * 360; east -= k * 360;
            return {west, east, north: latOf(y0), south: latOf(y1)};
        }
        getView() { return this.view ? {lat: latOf(this.view.cy), lon: lonOf(((this.view.cx % 1) + 1) % 1), zoom: this.view.z} : null; }
        setView(lat, lon, z, now) { this.size(); this.view = {cx: nX(lon), cy: nY(lat), z: clamp(z, this.minZ(), MAX_Z)}; this.render(now); }
        /** recadre sur tous les points, trajets et cercles */
        fit(now) {
            this.size();
            const xs = [], ys = [];
            this.points.forEach(p => { xs.push(p.x); ys.push(p.y); });
            this.paths.forEach(p => p.n.forEach(c => { xs.push(c[0]); ys.push(c[1]); }));
            this.circles.forEach(c => c.n.forEach(q => { xs.push(q[0]); ys.push(q[1]); }));
            if (!xs.length) { this.view = {cx: 0.5, cy: 0.5, z: this.minZ()}; this.fitZoom = this.view.z; return this.render(now); }
            // le plus petit intervalle de longitudes (en passant éventuellement par le 180e méridien)
            const sx = xs.map(x => ((x % 1) + 1) % 1).sort((a, b) => a - b);
            let gap = sx[0] + 1 - sx[sx.length - 1], start = sx[0];
            for (let i = 1; i < sx.length; i++) if (sx[i] - sx[i - 1] > gap) { gap = sx[i] - sx[i - 1]; start = sx[i]; }
            const span = 1 - gap, cx = start + span / 2;
            const y0 = Math.min(...ys), y1 = Math.max(...ys), pad = Math.min(48, this.w / 8, this.h / 8);
            const zx = span > 1e-9 ? Math.log2((this.w - 2 * pad) / (span * 256)) : MAX_Z, zy = y1 - y0 > 1e-9 ? Math.log2((this.h - 2 * pad) / ((y1 - y0) * 256)) : MAX_Z;
            let z = Math.floor(Math.min(zx, zy) * 4) / 4;
            if (xs.length === 1 || (span < 1e-9 && y1 - y0 < 1e-9)) z = 10;
            z = clamp(Math.min(z, 13), this.minZ(), MAX_Z);
            this.view = {cx, cy: (y0 + y1) / 2, z}; this.fitZoom = z;
            this.render(now);
        }
        zoomBy(d, px, py) { if (!this.view) return; this.zoomAt(this.view.z + d, px ?? this.w / 2, py ?? this.h / 2); }
        zoomAt(z, px, py) {
            const v = this.view; z = clamp(z, this.minZ(), MAX_Z); if (Math.abs(z - v.z) < 1e-6) return;
            const S0 = 256 * 2 ** v.z, S1 = 256 * 2 ** z;
            const wx = v.cx + (px - this.w / 2) / S0, wy = v.cy + (py - this.h / 2) / S0;
            this.view = {cx: wx - (px - this.w / 2) / S1, cy: wy - (py - this.h / 2) / S1, z};
            this.render();
        }
        panBy(dx, dy) { const S = 256 * 2 ** this.view.z; this.view.cx -= dx / S; this.view.cy -= dy / S; this.render(); }
        clampView() {
            const v = this.view, S = 256 * 2 ** v.z, half = this.h / 2 / S;
            v.cy = S >= this.h ? clamp(v.cy, half, 1 - half) : 0.5;
            v.cx = ((v.cx % 1) + 1) % 1;
        }
        screen(x, y) { const v = this.view, S = 256 * 2 ** v.z; return [(near(x, v.cx) - v.cx) * S + this.w / 2, (y - v.cy) * S + this.h / 2]; }

        /* ── dessin ── */
        render(now) {
            if (!this.view || !this.size()) return;
            this.clampView();
            const {w, h} = this, v = this.view, S = 256 * 2 ** v.z;
            this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
            this.drawTiles();
            // points
            const vis = [];
            this.points.forEach(p => {
                const [x, y] = this.screen(p.x, p.y); p.sx = x; p.sy = y;
                if (p.g) { p.g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`); p.g.style.display = ''; }
                if (this.clusterOn && !p.n && !p.noCluster && x > -40 && x < w + 40 && y > -40 && y < h + 40) vis.push(p);
            });
            // regroupement : une grille de cases de 52 px
            const groups = [];
            if (this.clusterOn && v.z < CLUSTER_OFF_Z) {
                const cells = new Map();
                vis.forEach(p => { const k = Math.floor(p.sx / CLUSTER_CELL) + ':' + Math.floor(p.sy / CLUSTER_CELL); let c = cells.get(k); if (!c) cells.set(k, c = []); c.push(p); });
                cells.forEach(list => { if (list.length < 2) return; groups.push(list); list.forEach(p => { if (p.g) p.g.style.display = 'none'; }); });
            }
            this.drawClusters(groups);
            // trajets et cercles
            const poly = n => { if (!n.length) return ''; const k = Math.round(v.cx - n[0][0]); return n.map(c => `${((c[0] + k - v.cx) * S + w / 2).toFixed(1)},${((c[1] - v.cy) * S + h / 2).toFixed(1)}`).join(' '); };
            this.paths.forEach((p, i) => this.lineEls[i].setAttribute('points', poly(p.n)));
            this.circles.forEach((c, i) => this.circleEls[i].setAttribute('points', poly(c.n)));
            if (this.nb) this.vecSoon(now); else this.credit.innerHTML = this.tileCredit();
            this.tipHide();
            this.emitSoon();
        }
        drawClusters(groups) {
            while (this.clusterEls.length < groups.length) {
                const g = document.createElementNS(SVGNS, 'g'); g.setAttribute('class', 'h-map-cluster'); g.setAttribute('role', 'button'); g.setAttribute('tabindex', '0');
                g.innerHTML = '<circle r="16"/><text text-anchor="middle" dy="4.2"></text>';
                this.gClusters.appendChild(g); this.clusterEls.push(g);
            }
            this.clusterEls.forEach((g, i) => {
                const list = groups[i];
                if (!list) { g.style.display = 'none'; g.__pts = null; return; }
                const x = list.reduce((a, p) => a + p.sx, 0) / list.length, y = list.reduce((a, p) => a + p.sy, 0) / list.length;
                g.style.display = ''; g.__pts = list;
                g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
                g.setAttribute('data-count', String(list.length));
                g.firstChild.setAttribute('r', String(Math.round(13 + Math.min(14, Math.log2(list.length) * 2.6))));
                const color = list[0].color; g.firstChild.style.fill = list.every(p => p.color === color) && color ? color : '';
                g.lastChild.textContent = list.length > 999 ? Math.round(list.length / 100) / 10 + 'k' : String(list.length);
                g.setAttribute('aria-label', T('{n} points ici — zoomer pour les séparer', {n: nf(list.length)}));
            });
        }
        /** zoom sur une pastille : assez pour que ses points se séparent */
        openCluster(g) {
            const list = g.__pts; if (!list?.length) return;
            const xs = list.map(p => near(p.x, this.view.cx)), ys = list.map(p => p.y);
            const sx = Math.max(...xs) - Math.min(...xs), sy = Math.max(...ys) - Math.min(...ys), pad = 40;
            let z = Math.min(sx > 1e-12 ? Math.log2((this.w - 2 * pad) / (sx * 256)) : MAX_Z, sy > 1e-12 ? Math.log2((this.h - 2 * pad) / (sy * 256)) : MAX_Z);
            z = clamp(Math.max(z, this.view.z + 1), this.minZ(), MAX_Z);
            this.view = {cx: (Math.max(...xs) + Math.min(...xs)) / 2, cy: (Math.max(...ys) + Math.min(...ys)) / 2, z};
            this.render();
        }
        drawTiles() {
            const box = this.tiles;
            if (this.nb || this.bg === 'grid' || typeof A().mapTileUrl !== 'function') { box.style.display = 'none'; return; }
            box.style.display = '';
            const v = this.view, {w, h} = this, tz = clamp(Math.round(v.z), 0, 19), n = 2 ** tz, ts = 256 * 2 ** (v.z - tz);
            const fx = v.cx * n, fy = v.cy * n;
            const x0 = Math.floor(fx - w / 2 / ts), x1 = Math.floor(fx + w / 2 / ts), y0 = Math.max(0, Math.floor(fy - h / 2 / ts)), y1 = Math.min(n - 1, Math.floor(fy + h / 2 / ts));
            const want = new Set();
            if ((x1 - x0 + 1) * (y1 - y0 + 1) <= 400) {
                for (let tx = x0; tx <= x1; tx++) for (let ty = y0; ty <= y1; ty++) {
                    const key = `${tz}/${tx}/${ty}`; want.add(key);
                    let img = this.tileMap.get(key);
                    if (!img) {
                        img = document.createElement('img'); img.className = 'person-map-tile'; img.alt = ''; img.draggable = false; img.decoding = 'async';
                        img.setAttribute('referrerpolicy', 'no-referrer');
                        img.dataset.z = String(tz); img.dataset.tx = String(tx); img.dataset.ty = String(ty);
                        try { img.src = A().mapTileUrl(this.bg, tz, ((tx % n) + n) % n, ty); } catch (_) {}
                        this.tileMap.set(key, img); box.appendChild(img);
                    }
                }
            }
            // les tuiles de l'ancien zoom restent dessous tant que les nouvelles arrivent (pas d'éclair blanc)
            const fresh = [...want].map(k => this.tileMap.get(k)), loaded = fresh.every(i => i.complete);
            this.tileMap.forEach((img, key) => {
                const z = Number(img.dataset.z), keep = want.has(key) || (!loaded && Math.abs(z - tz) <= 2);
                if (!keep) { img.remove(); this.tileMap.delete(key); return; }
                const tsz = 256 * 2 ** (v.z - z), nn = 2 ** z, tx = Number(img.dataset.tx), ty = Number(img.dataset.ty);
                const left = (tx - v.cx * nn) * tsz + w / 2, top = (ty - v.cy * nn) * tsz + h / 2;
                if (!want.has(key) && (left > w || top > h || left + tsz < 0 || top + tsz < 0)) { img.remove(); this.tileMap.delete(key); return; }
                img.style.cssText = `left:${left.toFixed(2)}px;top:${top.toFixed(2)}px;width:${(tsz + 0.5).toFixed(2)}px;height:${(tsz + 0.5).toFixed(2)}px;z-index:${want.has(key) ? 1 : 0}`;
            });
            if (!loaded) fresh.forEach(i => { if (!i.complete && !i.__mmw) { i.__mmw = 1; const re = () => { if (fresh.every(x => x.complete)) this.drawTilesIdle(); }; i.addEventListener('load', re, {once: true}); i.addEventListener('error', re, {once: true}); } });
        }
        drawTilesIdle() { clearTimeout(this.tIdle); this.tIdle = setTimeout(() => { if (this.view && !this.nb) this.drawTiles(); }, 60); }
        tileCredit() {
            if (this.bg === 'grid') return '';
            let url = ''; try { url = A().mapTileUrl(this.bg, 1, 0, 0) || ''; } catch (_) {}
            const FL = ext.fondsLibres;
            const ids = FL?.sourcesOf ? FL.sourcesOf([url]) : (/openstreetmap\.(org|fr|de)|openhistoricalmap/.test(url) ? ['osm'] : []);
            const id = ids[0]; if (id !== 'osm' && id !== 'otm') return ''; // les autres fonds : leur attribution est écrite par heritage-fonds-libres.js
            const a = FL?.attributionOf?.(id) || ['© contributeurs OpenStreetMap', 'https://www.openstreetmap.org/copyright'];
            return `<a href="${esc(a[1])}" target="_blank" rel="noopener noreferrer">${esc(a[0])}</a>`;
        }

        /* ── ◐ noir et blanc ── */
        syncNb() {
            this.el.classList.toggle('mm-nb', this.nb);
            this.ctl?.querySelector('[data-mm-nb]')?.setAttribute('aria-pressed', String(this.nb));
            this.vec.style.display = this.nb ? '' : 'none';
            if (!this.nb) { this.vec.innerHTML = ''; this.vecAt = null; }
        }
        setNb(on) { this.nb = !!on; setNb(this.nb); this.syncNb(); this.render(true); }
        vecSoon(now) {
            if (now || !this.vecAt) { this.drawVec(); return; }
            // pendant le geste : on déplace le dessin déjà fait, on le refait quand on s'arrête
            const a = this.vecAt, v = this.view, k = 2 ** (v.z - a.z), S = 256 * 2 ** v.z;
            const dx = (near(a.cx, v.cx) - v.cx) * S, dy = (a.cy - v.cy) * S;
            const tx = this.w / 2 - k * a.w / 2 + dx, ty = this.h / 2 - k * a.h / 2 + dy;
            this.vec.style.transform = `translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px) scale(${k.toFixed(4)})`;
            clearTimeout(this.vecT); this.vecT = setTimeout(() => this.drawVec(), 140);
        }
        drawVec() {
            clearTimeout(this.vecT);
            const v = this.view, {w, h} = this; if (!v || !w) return;
            const S = 256 * 2 ** v.z, spanX = w / S, spanY = h / S;
            const ls = layersFor(v.z, v.cx, v.cy, spanX, spanY);
            const vx0 = v.cx - spanX / 2 - 4 / S, vx1 = v.cx + spanX / 2 + 4 / S, vy0 = v.cy - spanY / 2 - 4 / S, vy1 = v.cy + spanY / 2 + 4 / S;
            const tol = 0.7 / S;
            let out = '', missing = false; const used = new Set();
            for (const [key, which, cls, towns] of ls) {
                const e = layer(key);
                if (!e.ready) { missing = true; e.p.then(() => { if (this.nb && this.el.isConnected) this.drawVec(); }); continue; }
                if (!e.data) continue;
                used.add(LAYERS[key].src);
                let d = '', coast = '';
                if (which !== 'none') {
                    for (const a of e.data.arcs) {
                        if (which === 'inner' && a.n < 2) continue;
                        if (!a.n) continue;
                        const b = a.b; if (b[3] < vy0 || b[1] > vy1) continue;
                        for (let k = Math.ceil(vx0 - b[2]); k <= Math.floor(vx1 - b[0]); k++) { // copies du monde visibles
                            let s = '', lx = 1e9, ly = 1e9; const c = a.c, m = c.length;
                            for (let i = 0; i < m; i += 2) {
                                const X = c[i] + k, Y = c[i + 1];
                                if (i && i < m - 2 && Math.abs(X - lx) < tol && Math.abs(Y - ly) < tol) continue;
                                s += (s ? 'L' : 'M') + ((X - v.cx) * S + w / 2).toFixed(1) + ' ' + ((Y - v.cy) * S + h / 2).toFixed(1); lx = X; ly = Y;
                            }
                            if (which === 'all' && a.n < 2) coast += s; else d += s;
                        }
                    }
                }
                if (d) out += `<path class="${cls}" d="${d}"/>`;
                if (coast) out += `<path class="${cls} mm-nb-coast" d="${coast}"/>`;
                if (towns) out += this.townsSvg(e.data.labels, vx0, vx1, vy0, vy1, S);
            }
            this.vec.innerHTML = out; this.vec.style.transform = '';
            this.vecAt = missing ? null : {...v, w, h};
            if (missing && !out) this.vecAt = null;
            this.credit.innerHTML = [...used].map(s => SOURCES_NB[s]).filter(Boolean).map(([t, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer" title="${esc(T('source'))}">${esc(t)} ↗</a>`).join(' · ');
        }
        /** les communes : un point et le nom, sans chevauchement */
        townsSvg(labels, vx0, vx1, vy0, vy1, S) {
            const v = this.view, {w, h} = this, taken = new Set(); let out = '', n = 0;
            for (const t of labels) {
                const X = near(t.x, v.cx); if (X < vx0 || X > vx1 || t.y < vy0 || t.y > vy1) continue;
                const x = (X - v.cx) * S + w / 2, y = (t.y - v.cy) * S + h / 2, key = Math.floor(x / 110) + ':' + Math.floor(y / 26);
                if (taken.has(key)) continue; taken.add(key);
                out += `<g class="mm-nb-town"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2"/><text x="${(x + 4).toFixed(1)}" y="${(y - 3).toFixed(1)}">${esc(t.n)}</text></g>`;
                if (++n > 400) break;
            }
            return out;
        }

        /* ── l'info-bulle d'un point ── */
        tipShow(g) {
            const p = this.points.find(q => q.g === g); if (!p) return;
            const label = p.label || g.querySelector('title')?.textContent || ''; if (!label) return;
            this.tip.textContent = label; this.tip.hidden = false;
            this.tip.style.left = clamp(p.sx, 60, this.w - 60) + 'px'; this.tip.style.top = Math.max(30, p.sy) + 'px';
        }
        tipHide() { if (this.tip) this.tip.hidden = true; }

        /* ── l'évènement « minimap-view » (après le geste) ── */
        emitSoon() { clearTimeout(this.emT); this.emT = setTimeout(() => { if (!this.view) return; this.el.dataset.mmZoom = this.view.z.toFixed(2); this.el.dispatchEvent(new CustomEvent('minimap-view', {bubbles: true, detail: {zoom: this.view.z, fitZoom: this.fitZoom ?? this.view.z, bounds: this.bounds(), view: this.getView()}})); }, 180); }

        /* ── souris, doigts, clavier ── */
        bind() {
            // position dans la carte, en pixels de la carte (même si une page agrandie / réduite la met à l'échelle)
            const el = this.el, rel = e => { const r = el.getBoundingClientRect(), k = (r.width / (el.offsetWidth || r.width)) || 1; return [(e.clientX - r.left) / k - el.clientLeft, (e.clientY - r.top) / k - el.clientTop]; };
            el.addEventListener('wheel', e => {
                if (!this.view) return; e.preventDefault();
                let dy = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1);
                const dz = clamp(-dy * (e.ctrlKey ? 0.012 : 0.0025), -1, 1);
                const [x, y] = rel(e); this.zoomAt(this.view.z + dz, x, y);
            }, {passive: false});
            const ptrs = new Map(); let start = null, moved = false, pinch = null;
            el.addEventListener('pointerdown', e => {
                if (e.target.closest('.mm-ctl, .mm-credit a') || (e.pointerType === 'mouse' && e.button !== 0) || !this.view) return;
                ptrs.set(e.pointerId, rel(e));
                if (ptrs.size === 1) { start = {p: rel(e), cx: this.view.cx, cy: this.view.cy}; moved = false; pinch = null; }
                if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = {d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, z: this.view.z}; moved = true; try { el.setPointerCapture(e.pointerId); } catch (_) {} }
            });
            el.addEventListener('pointermove', e => {
                if (!ptrs.has(e.pointerId) || !this.view) return;
                const cur = rel(e); ptrs.set(e.pointerId, cur);
                if (pinch && ptrs.size >= 2) {
                    const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
                    this.zoomAt(pinch.z + Math.log2(d / pinch.d), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); return;
                }
                if (!start) return;
                const dx = cur[0] - start.p[0], dy = cur[1] - start.p[1];
                if (!moved && Math.hypot(dx, dy) < 5) return;
                if (!moved) { moved = true; el.classList.add('mm-drag'); try { el.setPointerCapture(e.pointerId); } catch (_) {} this.tipHide(); }
                const S = 256 * 2 ** this.view.z; this.view.cx = start.cx - dx / S; this.view.cy = start.cy - dy / S; this.render();
                if (Math.abs(this.view.cy - (start.cy - dy / S)) > 1e-12) { start = {p: cur, cx: this.view.cx, cy: this.view.cy}; } // bord du monde : on repart d'ici
            });
            const up = e => {
                if (!ptrs.has(e.pointerId)) return; ptrs.delete(e.pointerId);
                try { el.releasePointerCapture(e.pointerId); } catch (_) {}
                if (ptrs.size === 1) { const p = [...ptrs.values()][0]; start = {p, cx: this.view.cx, cy: this.view.cy}; pinch = null; return; }
                if (!ptrs.size) { el.classList.remove('mm-drag'); if (moved) { this.noClick = Date.now(); } start = null; pinch = null; }
            };
            el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
            // après un glissé, le « clic » de fin n'ouvre rien
            el.addEventListener('click', e => { if (this.noClick && Date.now() - this.noClick < 400) { this.noClick = 0; e.stopPropagation(); e.preventDefault(); } }, true);
            el.addEventListener('click', e => {
                const b = e.target.closest('.mm-ctl button');
                if (b) { e.stopPropagation(); if (b.dataset.mmZoom) this.zoomBy(Number(b.dataset.mmZoom)); else if (b.hasAttribute('data-mm-fit')) this.fit(); else if (b.hasAttribute('data-mm-nb')) this.setNb(!this.nb); return; }
                const c = e.target.closest('.h-map-cluster'); if (c) { e.stopPropagation(); this.openCluster(c); }
            });
            el.addEventListener('dblclick', e => {
                if (e.target.closest('.mm-ctl, .h-map-point, .h-map-cluster') || !this.view) return;
                e.preventDefault(); const [x, y] = rel(e); this.zoomAt(this.view.z + (e.shiftKey ? -1 : 1), x, y);
            });
            el.addEventListener('keydown', e => {
                if (!this.view || e.altKey || e.ctrlKey || e.metaKey || e.target.closest('.mm-ctl, input, select, textarea, a')) return;
                const c = e.target.closest('.h-map-cluster');
                if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); this.openCluster(c); return; }
                const step = 80, k = e.key;
                if (k === '+' || k === '=' || k === 'Add') this.zoomBy(1);
                else if (k === '-' || k === '_' || k === 'Subtract' || k === '−') this.zoomBy(-1);
                else if (k === 'ArrowLeft') this.panBy(step, 0); else if (k === 'ArrowRight') this.panBy(-step, 0);
                else if (k === 'ArrowUp') this.panBy(0, step); else if (k === 'ArrowDown') this.panBy(0, -step);
                else if (k === '0' || k === 'Home') this.fit();
                else return;
                e.preventDefault();
            });
            el.addEventListener('pointerover', e => { const g = e.target.closest?.('.h-map-point'); if (g && !el.classList.contains('mm-drag')) this.tipShow(g); });
            el.addEventListener('pointerout', e => { if (e.target.closest?.('.h-map-point') && !e.relatedTarget?.closest?.('.h-map-point')) this.tipHide(); });
            el.addEventListener('focusin', e => { const g = e.target.closest?.('.h-map-point'); if (g) this.tipShow(g); });
            el.addEventListener('focusout', () => this.tipHide());
        }
    }
    /** un cercle de km kilomètres autour d'un point : 72 sommets (sur la sphère) */
    function circleRing(lat, lon, km) {
        const R = 6371, d = km / R, p1 = lat * Math.PI / 180, l1 = lon * Math.PI / 180, out = [];
        for (let i = 0; i <= 72; i++) {
            const b = i / 72 * 2 * Math.PI, p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
            const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
            out.push([nX(l2 * 180 / Math.PI), nY(p2 * 180 / Math.PI)]);
        }
        for (let i = 1; i < out.length; i++) out[i][0] = near(out[i][0], out[i - 1][0]);
        return out;
    }

    ext.miniMapEngine = {register, scan: () => scan(document), project: (lat, lon) => [nX(lon), nY(lat)]};
    ext.miniMapOf = miniMapOf;
})();
