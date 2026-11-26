/* LCNDA — ▶ Dans le temps : les batailles et les sièges sur la carte, à leur date, année après année, autour de nos lieux.
 * Maquette validée : docs/design/carte-guerres-temps.html (décisions du 2026-11-26).
 *
 *  - Un bouton « ▶ Dans le temps » dans la barre d'une liste qui le demande (d.timeMap : ⚔️ Batailles et sièges,
 *    heritage-histoire-autour.js) et sur la fiche d'une guerre (« ▶ Dans le temps » : la liste s'ouvre sur cette guerre).
 *  - Une barre calme sous celle de la liste, comme le mode Animation de l'onglet Carte : ▶ Lecture / ❚❚ Pause, ‹ ›, l'année
 *    (on peut la taper), Lent · Normal · Vite, la guerre (les autres pâlissent), 🏠 Nos lieux, Traînée ; puis « seulement les
 *    ancêtres directs », « placées par leur lieu » (en pointillé, qu'on cache d'un clic), « frontières d'aujourd'hui » (trait léger).
 *    Un histogramme par 5 ans, le curseur des années, les bandes de vie de la famille (âge à l'année montrée).
 *  - Une bataille apparaît à sa date et pâlit en 5 ans ; « Traînée » garde tout le passé, pâle. Nos lieux : un losange vert et un
 *    cercle de 50 km ; un anneau orange autour d'une bataille à moins de 50 km d'un lieu de la famille, du vivant de quelqu'un qui y
 *    a vécu ; sa fiche dit « À 7 km de Gorze : Pierre MAZAUD avait 8 ans ».
 *  - Fond de carte : les contours livrés avec l'app (Natural Earth, domaine public : assets/data/geo/monde-50m.json) — pas de tuiles,
 *    marche sans Internet, en borne et pour les invités du réseau local. Liens ↗ cachés en borne et pour les invités.
 *  - Rapide pour 16 000 batailles : un <canvas> (contours dessinés une fois par cadrage), points rangés par année, un seul
 *    requestAnimationFrame. prefers-reduced-motion : jamais de lecture toute seule, pas d'éclat ; ▶ avance d'une année à chaque clic.
 *  - La famille : LCNDA_EXT.listesFamille (GET ld_famille, lib/listes_famille.php) — calculé ici ; jamais une fiche confidentielle,
 *    et pas les vivants en mode consultation. Rien ne part sur Internet.
 *  Réglages (de l'écran) : localStorage « genealogie-guerres-temps » {speed, homes, trail, approx, borders, anc}.
 *  API : LCNDA_EXT.guerresTemps = {listBar(page, api), paint(res, api), openWar(q), state()}
 *  Essai : tests/test-guerres-temps.js
 */
(() => {
    'use strict';
    const T = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP || {};
    const E = () => ext.dataListsEngine || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const nf = n => Number(n || 0).toLocaleString('fr-FR');
    const KEY = 'genealogie-guerres-temps';
    const FADE = 5, HB = 5, NEAR = 50, SPEEDS = [['lent', 'Lent', 700], ['normal', 'Normal', 320], ['vite', 'Vite', 110]];
    const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } };
    const offline = () => !!(document.body?.classList.contains('is-kiosk') || window.LCNDA_GUEST);
    const readSet = () => { let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) {} return {speed: SPEEDS.some(x => x[0] === s.speed) ? s.speed : 'normal', homes: s.homes !== false, trail: !!s.trail, approx: s.approx !== false, borders: s.borders !== false, anc: !!s.anc}; };
    const saveSet = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} };
    const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const yTxt = y => (y < 0 ? T('{n} av. J.-C.', {n: String(-y)}) : String(y));
    const dateTxt = (d, y) => { const [a, m, j] = String(d || '').split('-').map(Number); return a && m && j ? `${j === 1 ? '1er' : j} ${T(MONTHS[m - 1])} ${yTxt(a)}` : a && m ? `${T(MONTHS[m - 1])} ${yTxt(a)}` : yTxt(y); };
    const kmTxt = k => (k < 10 ? T('{n} km', {n: String(Math.round(k * 10) / 10).replace('.', ',')}) : T('{n} km', {n: String(Math.round(k))}));
    const ageTxt = n => (n <= 0 ? T('moins d’un an') : n === 1 ? T('1 an') : T('{n} ans', {n: String(n)}));
    const wdUrl = q => `https://www.wikidata.org/wiki/${encodeURIComponent(q)}`;
    const wpUrl = t => (t ? `https://fr.wikipedia.org/wiki/${encodeURIComponent(String(t).replace(/ /g, '_'))}` : '');

    /* ═════════════ la projection (Web Mercator, coordonnées 0..1) ═════════════ */
    const MAXLAT = 85.05;
    const nX = lon => (Number(lon) + 180) / 360;
    const nY = lat => { const s = Math.sin(Math.max(-MAXLAT, Math.min(MAXLAT, Number(lat))) * Math.PI / 180); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); };
    const FRAMES = [['fr', '⤢', 'France', [-5.6, 41.2, 10.2, 51.4]], ['eu', '⤡', 'Europe', [-11, 34, 36, 60]], ['monde', '🌍', 'Monde', [-170, -56, 190, 76]]];
    const frameBox = id => { const f = (FRAMES.find(x => x[0] === id) || FRAMES[0])[3]; return [nX(f[0]), nY(f[3]), nX(f[2]), nY(f[1])]; }; // x0, y0 (nord), x1, y1 (sud)

    /* ═════════════ le fond : les contours de l'app (Natural Earth, livré) ═════════════ */
    let baseP = null;
    function base() {
        if (!baseP) baseP = fetch('assets/data/geo/monde-50m.json', {credentials: 'same-origin'}).then(r => (r.ok ? r.json() : null)).then(j => (j?.topo ? decode(j.topo) : null)).catch(() => null);
        return baseP;
    }
    /** TopoJSON → trois chemins en coordonnées 0..1 : la terre (remplie), les côtes (arcs d'un seul pays), les frontières (arcs partagés) */
    function decode(t) {
        const tr = t.transform, sx = tr ? tr.scale[0] : 1, sy = tr ? tr.scale[1] : 1, tx = tr ? tr.translate[0] : 0, ty = tr ? tr.translate[1] : 0;
        const arcs = t.arcs.map(a => { let x = 0, y = 0; const c = new Float64Array(a.length * 2); a.forEach((p, i) => { let lon, lat; if (tr) { x += p[0]; y += p[1]; lon = x * sx + tx; lat = y * sy + ty; } else { lon = p[0]; lat = p[1]; } c[2 * i] = nX(lon); c[2 * i + 1] = nY(lat); }); return c; });
        const used = new Uint16Array(arcs.length), land = new Path2D(), coast = new Path2D(), borders = new Path2D();
        const walk = (v, f) => { if (typeof v === 'number') f(v); else if (Array.isArray(v)) v.forEach(x => walk(x, f)); };
        const geoms = Object.values(t.objects || {}).flatMap(o => o.geometries || []);
        geoms.forEach(g => walk(g.arcs, i => { used[i < 0 ? ~i : i]++; }));
        const ring = r => { let first = true; r.forEach(ai => { const c = arcs[ai < 0 ? ~ai : ai], n = c.length / 2; for (let k = 0; k < n; k++) { const j = ai < 0 ? n - 1 - k : k; if (k === 0 && !first) continue; const x = c[2 * j], y = c[2 * j + 1]; if (first) { land.moveTo(x, y); first = false; } else land.lineTo(x, y); } }); land.closePath(); };
        geoms.forEach(g => { if (g.type === 'Polygon') g.arcs.forEach(ring); else if (g.type === 'MultiPolygon') g.arcs.forEach(p => p.forEach(ring)); });
        arcs.forEach((c, i) => { const P = used[i] > 1 ? borders : coast; for (let k = 0; k < c.length / 2; k++) { if (k === 0) P.moveTo(c[0], c[1]); else P.lineTo(c[2 * k], c[2 * k + 1]); } });
        return {land, coast, borders};
    }

    /* ═════════════ les données d'une page ═════════════ */
    let S = null; // l'état de l'écran ouvert
    const wantWar = new Map(); // liste → guerre demandée (fiche d'une guerre)
    const yearNow = () => new Date().getFullYear();
    async function prepare(api) {
        const d = api.d, st = api.state();
        const page = await E().fetchPage(d, {...st, sort: '', view: 'table'}, 0, 100000);
        const rows = page.all || page.rows || [];
        let wars = [];
        try { wars = (await ext.histoireAutour?.load?.('guerres'))?.rows || []; } catch (_) {}
        const wIdx = new Map(wars.map((w, i) => [w.q, i])), wName = new Map(wars.map((w, i) => [String(w.n || '').toLowerCase(), i]));
        const B = [];
        for (const r of rows) {
            const g = E().geoOf ? E().geoOf(d, r) : d.geo?.(r); const p = E().periodOf ? E().periodOf(d, r) : d.period?.(r);
            const y = Array.isArray(p) ? Number(p[0]) : Number(r.y ?? r.year);
            if (!g || !Number.isFinite(y) || !Number.isFinite(Number(g[0])) || !Number.isFinite(Number(g[1]))) continue;
            const wq = Array.isArray(r.wq) ? r.wq : String(r.wq || '').split('|').filter(Boolean);
            const w = wq.map(q => wIdx.get(q)).find(i => i != null) ?? wName.get(String(r.war || '').toLowerCase()) ?? -1;
            B.push({i: B.length, q: r.q || r.qid || '', n: r.n || r.name || '', y, d: r.d || r.date || '', lat: Number(g[0]), lon: Number(g[1]), x: nX(g[1]), yy: nY(g[0]), approx: !!r.approx, w,
                war: r.war || '', bel: Array.isArray(r.bel) ? r.bel : String(r.bel || r.belligerents || r.sides || '').split(/\s*[|/]\s*/).filter(Boolean), loc: r.loc || r.place || '', frwiki: r.frwiki || '', row: r, near: null});
        }
        const nb = new Map(); B.forEach(b => { if (b.w >= 0) nb.set(b.w, (nb.get(b.w) || 0) + 1); });
        const byYear = new Map(); B.forEach(b => { if (!byYear.has(b.y)) byYear.set(b.y, []); byYear.get(b.y).push(b); });
        const years = [...byYear.keys()].sort((a, b) => a - b);
        try { await ext.listesFamille?.ready?.(); } catch (_) {}
        return {d, B, wars, nb, byYear, years, total: page.total ?? rows.length};
    }
    /** les années montrées : autour de la vie de la famille (ou la période choisie dans la liste) */
    function rangeOf(D, st, war) {
        const F = ext.listesFamille?.data?.(), ys = D.years;
        let y0 = ys.length ? ys[0] : 1500, y1 = ys.length ? ys[ys.length - 1] : yearNow();
        if (st.period) { y0 = Number(st.period.from); y1 = Number(st.period.mode === 'in' ? st.period.from : st.period.to); }
        else if (F?.people?.length) {
            const bs = F.people.map(p => p.b).filter(Number.isFinite), ds = F.people.map(p => p.d ?? (p.b != null ? p.b + 80 : null)).filter(Number.isFinite);
            if (bs.length) { y0 = Math.floor((Math.min(...bs) - 30) / 5) * 5; y1 = Math.min(Math.max(...ds, Math.min(...bs) + 80) + 20, yearNow()); } // les années de la famille (les batailles d'avant : 📅 Période ou une guerre)
        } else y0 = Math.max(y0, 1500);
        if (war) { if (Number.isFinite(war.y)) y0 = Math.min(y0, war.y); if (Number.isFinite(war.y2 ?? war.y)) y1 = Math.max(y1, (war.y2 ?? war.y) + 1); }
        if (!(y1 > y0)) y1 = y0 + 1;
        return [y0, Math.min(Math.max(y1, y0 + 1), Math.max(yearNow(), y0 + 1))];
    }
    /** à moins de 50 km d'un lieu de la famille, du vivant de quelqu'un qui y a vécu (le plus proche) */
    function computeNear() {
        const LF = ext.listesFamille; if (!S || !LF?.presence) return;
        for (const b of S.D.B) { const pr = LF.presence(b.lat, b.lon, b.y, NEAR, {anc: S.set.anc}); const w = pr.who[0]; b.near = w ? {km: w.km, place: w.place, who: w.n, age: w.age} : null; }
        const F = LF.data?.(); const placed = new Set();
        if (F) F.people.forEach(p => { if (!S.set.anc || p.a) p.pl.forEach(([pi]) => placed.add(pi)); });
        S.homes = F ? [...placed].map(i => ({...F.places[i], n: F.people.filter(p => (!S.set.anc || p.a) && p.pl.some(x => x[0] === i)).length})).sort((a, b) => b.n - a.n) : [];
        const cnt = new Map(); S.D.B.forEach(b => { if (b.near) cnt.set(b.near.who, (cnt.get(b.near.who) || 0) + 1); });
        S.lives = F ? F.people.filter(p => cnt.has(p.n) && p.b != null && (!S.set.anc || p.a)).map(p => ({n: p.n, b: p.b, d: p.d, k: cnt.get(p.n)})).sort((a, b) => b.k - a.k).slice(0, 6).sort((a, b) => a.b - b.b) : [];
        S.livesMore = F ? Math.max(0, new Set([...cnt.keys()]).size - S.lives.length) : 0;
    }

    /* ═════════════ le bouton dans la barre de la liste ═════════════ */
    /** les listes qui le demandent : d.timeMap (⚔️ Batailles et sièges), et la liste réunie des batailles (🔀 Batailles réunies) */
    const wants = api => { const d = api?.base || api?.d; return !!(d && (d.timeMap || api?.d?.timeMap || d.mergeId === 'batailles' || d.id === 'reunie_batailles')); };
    function listBar(page, api) {
        const d = api?.d; if (!page || !wants(api) || page.querySelector('[data-gt-on]')) return;
        const st = api.state(), view = page.querySelector('.ld-view'); if (!view) return;
        if (wantWar.has(d.id)) { st.view = 'map'; st.time = true; }
        const b = document.createElement('button'); b.type = 'button'; b.className = 'ui-listbar-btn gt-on'; b.dataset.gtOn = '';
        b.title = T('Les points apparaissent à leur date, année après année'); b.textContent = `▶ ${T('Dans le temps')}`;
        b.setAttribute('aria-pressed', String(!!(st.time && st.view === 'map')));
        view.after(b);
        b.addEventListener('click', () => { const s = api.state(); const on = !(s.time && s.view === 'map'); s.time = on; if (on) s.view = 'map'; api.rerun(); });
    }

    /* ═════════════ l'écran ═════════════ */
    /** appelé par le moteur à chaque dessin des résultats : vrai si la carte dans le temps a été dessinée */
    function paint(res, api) {
        const st = api.state(), d = api.d, btn = res.closest('.ld-page')?.querySelector('[data-gt-on]');
        const on = !!(wants(api) && st.view === 'map' && st.time); void d;
        if (btn) btn.setAttribute('aria-pressed', String(on));
        if (!on) { stop(); return false; }
        build(res, api);
        return true;
    }
    function stop() { if (S) { S.playing = false; cancelAnimationFrame(S.raf); S.raf = 0; S.ro?.disconnect(); } }
    async function build(res, api) {
        stop();
        const set = readSet(), my = {};
        S = {api, res, set, my, year: 0, war: -1, playing: false, sel: null, frame: 'fr', pulses: [], raf: 0, last: 0, vis: [], homes: [], lives: [], livesMore: 0};
        res.innerHTML = `<div class="gt" data-gt><p class="muted gt-wait">${esc(T('On prépare la carte…'))}</p></div>`;
        const D = await prepare(api); if (S?.my !== my || !res.isConnected) return;
        S.D = D;
        const want = wantWar.get(D.d.id); wantWar.delete(D.d.id);
        if (want) { const i = D.wars.findIndex(w => w.q === want); if (i >= 0) S.war = i; }
        const st = api.state();
        S.range = rangeOf(D, st, S.war >= 0 ? D.wars[S.war] : null);
        S.year = S.war >= 0 && Number.isFinite(D.wars[S.war].y) ? Math.max(S.range[0], D.wars[S.war].y) : S.range[0];
        computeNear();
        S.frame = autoFrame();
        html(res);
        bind(res);
        await base(); if (S?.my !== my) return;
        layout(); drawAll();
    }
    /** le cadrage : le plus petit (France, Europe, Monde) qui contient au moins 80 % des points de la guerre choisie (sinon de la famille) */
    function autoFrame() {
        const pts = S.war >= 0 ? S.D.B.filter(b => b.w === S.war) : S.homes.length ? S.homes.map(h => ({x: nX(h.lon), yy: nY(h.lat)})) : S.D.B;
        if (!pts.length) return 'fr';
        for (const [id] of FRAMES) { const [x0, y0, x1, y1] = frameBox(id), n = pts.filter(p => p.x >= x0 && p.x <= x1 && p.yy >= y0 && p.yy <= y1).length; if (n >= pts.length * 0.8) return id; }
        return 'monde';
    }
    const warsShown = () => S.D.wars.map((w, i) => ({w, i, n: S.D.nb.get(i) || 0})).filter(x => x.n >= 2 || x.i === S.war).sort((a, b) => (a.w.y ?? 0) - (b.w.y ?? 0));
    function html(res) {
        const s = S.set, ro = reduced();
        const tg = (k, label, title = '') => `<label class="ui-toggle gt-tg"${title ? ` title="${esc(title)}"` : ''}><input type="checkbox" data-gt-set="${k}" ${s[k] ? 'checked' : ''}><i></i><span>${esc(label)}</span></label>`;
        res.innerHTML = `<div class="gt" data-gt>
          <div class="gt-bar" role="group" aria-label="${esc(T('Dans le temps'))}">
            <div class="gt-row">
              <button type="button" class="button small gt-play" data-gt-play title="${esc(ro ? T('Mouvements réduits : une année à chaque clic') : T('Espace : lecture'))}">${esc(ro ? `▶ ${T('Année suivante')}` : `▶ ${T('Lecture')}`)}</button>
              <button type="button" class="button small secondary gt-step" data-gt-step="-1" aria-label="${esc(T('Année précédente'))}" title="${esc(T('Année précédente'))} (←)">‹</button>
              <button type="button" class="button small secondary gt-step" data-gt-step="1" aria-label="${esc(T('Année suivante'))}" title="${esc(T('Année suivante'))} (→)">›</button>
              <label class="gt-lbl" for="gt-yearnum">${esc(T('Année'))}</label>
              <input type="text" inputmode="numeric" id="gt-yearnum" class="gt-yearnum" data-gt-yearnum value="${S.year}" aria-label="${esc(T('Année (tape une année)'))}">
              <span class="segmented gt-speed" role="group" aria-label="${esc(T('Vitesse'))}">${SPEEDS.map(([k, l]) => `<button type="button" data-gt-speed="${k}" aria-pressed="${s.speed === k}" class="${s.speed === k ? 'is-active' : ''}">${esc(T(l))}</button>`).join('')}</span>
              <span class="gt-sep" aria-hidden="true"></span>
              <select class="gt-war" data-gt-war-sel aria-label="${esc(T('Guerre'))}"><option value="-1">${esc(T('Toutes les guerres'))}</option>${warsShown().map(({w, i, n}) => `<option value="${i}" ${i === S.war ? 'selected' : ''}>${esc(w.n)} · ${esc(yTxt(w.y))}–${esc(w.y2 != null ? yTxt(w.y2) : '?')} (${nf(n)})</option>`).join('')}</select>
              ${tg('homes', `🏠 ${T('Nos lieux')}`)}${tg('trail', T('Traînée'), T('Garder tout le passé, en pâle'))}
            </div>
            <div class="gt-row gt-row2">
              ${tg('anc', `👪 ${T('Seulement les ancêtres directs')}`, T('Nos lieux et les âges : la racine Sosa et ses ancêtres'))}${tg('approx', T('Placées par leur lieu'), T('Batailles sans coordonnées : le point est celui du lieu nommé (en pointillé)'))}${tg('borders', T('Frontières d’aujourd’hui'))}
            </div>
            <div class="gt-track"><svg class="gt-hist" data-gt-hist preserveAspectRatio="none" aria-hidden="true"></svg>
              <input type="range" class="gt-range" data-gt-range min="${S.range[0]}" max="${S.range[1]}" value="${S.year}" aria-label="${esc(T('Année'))}">
              <div class="gt-ticks" data-gt-ticks aria-hidden="true"></div></div>
            <div class="gt-lives" data-gt-lives aria-label="${esc(T('Nos ancêtres'))}"></div>
          </div>
          <div class="gt-layout">
            <div class="gt-mapcol">
              <div class="gt-stage" data-gt-stage tabindex="0" role="img" aria-label="${esc(T('Carte des batailles, année après année. Espace : lecture ; ← → : une année.'))}">
                <div class="gt-box gt-yearbox" aria-live="polite"><div class="gt-yr" data-gt-yr>${S.year}</div><div class="gt-sub" data-gt-sub></div></div>
                <canvas class="gt-cv" data-gt-cv aria-hidden="true"></canvas><canvas class="gt-cv gt-fx" data-gt-fx aria-hidden="true"></canvas>
                <div class="mm-ctl gt-ctl" role="toolbar" aria-label="${esc(T('Cadrage de la carte'))}">${FRAMES.map(([k, ic, l]) => `<button type="button" data-gt-frame="${k}" aria-pressed="${k === S.frame}" title="${esc(T('Cadrer : {p}', {p: T(l)}))}"><span aria-hidden="true">${ic}</span><span class="gt-lab">${esc(T(l))}</span></button>`).join('')}</div>
                <div class="gt-box gt-legend" data-gt-legend></div>
                <div class="gt-attr"><a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener noreferrer"${offline() ? ' tabindex="-1" data-gt-off' : ''}>${esc(T('Made with Natural Earth (domaine public)'))}</a></div>
                <div class="gt-tip" data-gt-tip role="status"></div>
              </div>
              <div class="ld-map-note gt-note"><span><b data-gt-shown></b> · ${esc(T('les batailles restent 5 ans, en pâlissant.'))}</span><small class="muted">${esc(T('Espace : lecture · ← → : une année.'))}</small></div>
            </div>
            <aside class="card gt-side" aria-label="${esc(T('Détail'))}">
              <div class="card-head gt-side-head"><h3 data-gt-listh></h3></div>
              <ul class="gt-list" data-gt-list></ul>
              <div class="gt-detail" data-gt-detail hidden></div>
            </aside>
          </div></div>`;
        paintLegend(); paintWarChip();
    }
    function paintLegend() {
        const el = S.res.querySelector('[data-gt-legend]'); if (!el) return;
        el.innerHTML = `<b>${esc(T(S.D.d.label))}</b><span><i class="gt-sw"></i>${esc(T('bataille, siège'))}</span>${S.set.approx ? `<span><i class="gt-sw is-a"></i>${esc(T('placé par son lieu'))}</span>` : ''}${S.war >= 0 ? `<span><i class="gt-sw is-f"></i>${esc(T('autre guerre'))}</span>` : ''}${S.set.homes ? `<span><i class="gt-sw is-o"></i>${esc(T('à moins de 50 km de nos lieux'))}</span><span><i class="gt-sw is-h"></i>${esc(T('nos lieux'))}</span>` : ''}`;
    }
    function paintWarChip() {
        const box = S.res.closest('.ld-page')?.querySelector('[data-ld-chips]'); if (!box) return;
        box.querySelector('[data-gt-warchip]')?.remove();
        if (S.war < 0) return;
        const b = document.createElement('button'); b.type = 'button'; b.className = 'ui-listbar-chip'; b.dataset.gtWarchip = ''; b.title = T('Toutes les guerres');
        b.innerHTML = `${esc(T('Guerre : {w}', {w: S.D.wars[S.war].n}))} <span aria-hidden="true">×</span>`;
        b.addEventListener('click', () => setWar(-1));
        box.appendChild(b);
    }

    /* ─── le dessin ─── */
    let colors = null;
    function readColors() {
        const cs = getComputedStyle(S.res.querySelector('[data-gt-stage]'));
        const v = (k, d) => (cs.getPropertyValue(k) || '').trim() || d;
        colors = {sea: v('--gt-sea', '#f4f7fb'), land: v('--gt-land', '#fff'), coast: v('--gt-coast', '#a9a9a9'), border: v('--gt-border', '#c9ccd3'), dot: v('--gt-dot', '#0066cc'), fog: v('--gt-fog', '#9aa0a8'),
            near: v('--gt-near', '#d9480f'), home: v('--gt-home', '#2b8a3e'), ink: v('--gt-ink', '#111'), halo: v('--gt-halo', '#fff'), pulse: v('--gt-pulse', '#055dff')};
    }
    function layout() {
        const stg = S.res.querySelector('[data-gt-stage]'); if (!stg) return;
        const W = Math.max(200, stg.clientWidth), [x0, y0, x1, y1] = frameBox(S.frame);
        const H = Math.round(Math.max(300, Math.min(620, W * (y1 - y0) / (x1 - x0), innerHeight * 0.72)));
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        S.res.querySelectorAll('[data-gt-cv],[data-gt-fx]').forEach(c => { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); c.style.width = `${W}px`; c.style.height = `${H}px`; });
        stg.style.height = `${H}px`;
        const s = Math.min(W / (x1 - x0), H / (y1 - y0));
        S.view = {W, H, dpr, s, ox: W / 2 - s * (x0 + x1) / 2, oy: H / 2 - s * (y0 + y1) / 2};
        S.r = W < 500 ? 4 : 5.2;
    }
    const px = (x, y) => [S.view.ox + S.view.s * x, S.view.oy + S.view.s * y];
    const visible = b => (S.set.trail ? b.y <= S.year && b.y >= S.range[0] : b.y <= S.year && b.y > S.year - FADE) && (S.set.approx || !b.approx);
    function drawAll() { if (!S?.view) return; readColors(); drawMap(); drawSide(); }
    function drawMap() {
        const cv = S.res.querySelector('[data-gt-cv]'); if (!cv) return;
        const ctx = cv.getContext('2d'), {W, H, dpr, s, ox, oy} = S.view, c = colors;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = c.sea; ctx.fillRect(0, 0, W, H);
        const G = S.base;
        if (G) {
            ctx.save(); ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
            ctx.fillStyle = c.land; ctx.fill(G.land, 'evenodd');
            ctx.lineJoin = 'round'; ctx.strokeStyle = c.coast; ctx.lineWidth = 0.9 / s; ctx.stroke(G.coast);
            if (S.set.borders) { ctx.strokeStyle = c.border; ctx.lineWidth = 0.7 / s; ctx.setLineDash([3 / s, 2.5 / s]); ctx.stroke(G.borders); ctx.setLineDash([]); }
            ctx.restore();
        }
        // nos lieux : cercle de 50 km, losange vert, nom (les plus habités)
        if (S.set.homes) {
            S.homes.forEach(h => {
                const [x, y] = px(nX(h.lon), nY(h.lat)), r50 = (nY(h.lat - NEAR / 111) - nY(h.lat)) * s;
                if (x < -r50 || y < -r50 || x > W + r50 || y > H + r50) return;
                ctx.beginPath(); ctx.arc(x, y, r50, 0, Math.PI * 2); ctx.fillStyle = hexA(c.home, 0.06); ctx.fill(); ctx.setLineDash([5, 4]); ctx.strokeStyle = hexA(c.home, 0.75); ctx.lineWidth = 1.3; ctx.stroke(); ctx.setLineDash([]);
            });
        }
        // les batailles : rangées par style et par pâleur (un seul tracé par groupe)
        const groups = new Map(), rings = new Path2D(), r = S.r; let nRing = 0; S.vis = [];
        const add = (k, x, y) => { let g = groups.get(k); if (!g) groups.set(k, g = new Path2D()); g.moveTo(x + r, y); g.arc(x, y, r, 0, Math.PI * 2); };
        const lo = S.set.trail ? S.range[0] : S.year - FADE + 1;
        for (let yr = lo; yr <= S.year; yr++) {
            const list = S.D.byYear.get(yr); if (!list) continue;
            const age = S.year - yr, a0 = S.set.trail && age >= FADE ? 0.22 : 1 - age / (FADE + 1);
            for (const b of list) {
                if (!S.set.approx && b.approx) continue;
                const [x, y] = px(b.x, b.yy); if (x < -10 || y < -10 || x > W + 10 || y > H + 10) continue;
                const other = S.war >= 0 && b.w !== S.war, a = Math.round((other ? Math.min(a0, 0.45) : a0) * 20) / 20;
                add(`${other ? 'f' : 'b'}${b.approx ? 'a' : ''}|${a}`, x, y);
                if (b.near && S.set.homes && !other) { rings.moveTo(x + r * 1.9, y); rings.arc(x, y, r * 1.9, 0, Math.PI * 2); nRing++; }
                S.vis.push([b, x, y]);
            }
        }
        if (nRing) { ctx.strokeStyle = c.near; ctx.lineWidth = 2.4; ctx.stroke(rings); }
        for (const [k, P] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
            const [kind, a] = k.split('|'), fog = kind[0] === 'f', approx = kind.includes('a');
            ctx.globalAlpha = Number(a);
            if (approx) { ctx.fillStyle = c.halo; ctx.fill(P); ctx.setLineDash([2.5, 2]); ctx.lineWidth = 2; ctx.strokeStyle = fog ? c.fog : c.dot; ctx.stroke(P); ctx.setLineDash([]); }
            else { ctx.fillStyle = fog ? c.fog : c.dot; ctx.fill(P); ctx.lineWidth = 1.5; ctx.strokeStyle = c.halo; ctx.stroke(P); }
        }
        ctx.globalAlpha = 1;
        const sel = S.sel != null ? S.vis.find(v => v[0].i === S.sel) : null;
        if (sel) { ctx.beginPath(); ctx.arc(sel[1], sel[2], r + 2.5, 0, Math.PI * 2); ctx.lineWidth = 3; ctx.strokeStyle = c.ink; ctx.stroke(); }
        if (S.set.homes) {
            const fs = W < 500 ? 11 : 12.5; ctx.font = `700 ${fs}px system-ui, sans-serif`; ctx.textBaseline = 'middle';
            S.homes.forEach((h, i) => {
                const [x, y] = px(nX(h.lon), nY(h.lat)); if (x < -8 || y < -8 || x > W + 8 || y > H + 8) return;
                ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.fillStyle = c.home; ctx.strokeStyle = c.ink; ctx.lineWidth = 1.5; ctx.fillRect(-4.5, -4.5, 9, 9); ctx.strokeRect(-4.5, -4.5, 9, 9); ctx.restore();
                if (i < 12) { ctx.lineWidth = 3.5; ctx.strokeStyle = c.halo; ctx.lineJoin = 'round'; ctx.strokeText(h.name, x + 10, y); ctx.fillStyle = c.ink; ctx.fillText(h.name, x + 10, y); }
            });
        }
        // l'année, ce qui s'y passe
        const now = (S.D.byYear.get(S.year) || []).filter(b => (S.war < 0 || b.w === S.war) && (S.set.approx || !b.approx));
        const ws = [...new Set(now.map(b => b.w).filter(w => w >= 0))].map(w => S.D.wars[w].n);
        const q = sel => S.res.querySelector(sel);
        q('[data-gt-yr]').textContent = yTxt(S.year);
        q('[data-gt-sub]').textContent = now.length ? `${now.length > 1 ? T('{n} batailles ou sièges', {n: nf(now.length)}) : T('1 bataille ou siège')}${ws.length ? ` · ${ws.slice(0, 2).join(', ')}${ws.length > 2 ? '…' : ''}` : ''}` : T('aucune bataille cette année');
        q('[data-gt-shown]').textContent = S.vis.length === 1 ? T('1 point sur la carte') : T('{n} points sur la carte', {n: nf(S.vis.length)});
        q('[data-gt-range]').value = String(S.year); const yn = q('[data-gt-yearnum]'); if (document.activeElement !== yn) yn.value = String(S.year);
        drawHist(); drawLives();
    }
    function hexA(col, a) { const m = /^#([0-9a-f]{6})$/i.exec(col); if (!m) return col; const n = parseInt(m[1], 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
    function drawHist() {
        const svg = S.res.querySelector('[data-gt-hist]'); if (!svg) return;
        const [y0, y1] = S.range, n = Math.max(1, Math.ceil((y1 - y0 + 1) / HB)), cnt = new Array(n).fill(0);
        if (!S.hist || S.hist.key !== `${S.war}|${S.set.approx}|${y0}|${y1}`) {
            for (const b of S.D.B) { if (b.y < y0 || b.y > y1 || (S.war >= 0 && b.w !== S.war) || (!S.set.approx && b.approx)) continue; cnt[Math.floor((b.y - y0) / HB)]++; }
            S.hist = {key: `${S.war}|${S.set.approx}|${y0}|${y1}`, cnt};
        }
        const c = S.hist.cnt, mx = Math.max(1, ...c), w = 100 / c.length;
        svg.setAttribute('viewBox', '0 0 100 46');
        svg.innerHTML = c.map((v, i) => { const h = v ? Math.max(2, v / mx * 44) : 0; return `<rect class="${y0 + i * HB <= S.year ? 'is-on' : ''}" x="${(i * w + 0.12).toFixed(2)}" width="${Math.max(0.1, w - 0.24).toFixed(2)}" y="${(46 - h).toFixed(2)}" height="${h.toFixed(2)}"/>`; }).join('');
        const tk = S.res.querySelector('[data-gt-ticks]');
        if (tk && tk.dataset.k !== `${y0}|${y1}`) { tk.dataset.k = `${y0}|${y1}`; const ys = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(y0 + f * (y1 - y0))); tk.innerHTML = [...new Set(ys)].map(y => `<span style="left:${((y - y0) / Math.max(1, y1 - y0) * 100).toFixed(2)}%">${esc(yTxt(y))}</span>`).join(''); }
    }
    function drawLives() {
        const box = S.res.querySelector('[data-gt-lives]'); if (!box) return;
        const [y0, y1] = S.range, p = y => ((Math.min(y1, Math.max(y0, y)) - y0) / Math.max(1, y1 - y0) * 100).toFixed(2);
        if (!S.set.homes || !S.lives.length) { box.innerHTML = S.set.homes && !(ext.listesFamille?.placesCount?.() > 0) ? `<p class="muted gt-nofam">${esc(T('Aucun lieu de la famille n’est placé sur la carte : place des lieux (Carte) pour voir les guerres passées près de chez eux.'))}</p>` : ''; return; }
        box.innerHTML = S.lives.map(f => { const to = f.d ?? f.b + 80, alive = S.year >= f.b && S.year <= to;
            return `<div class="gt-life"><span><b>${esc(f.n)}</b> ${esc(yTxt(f.b))}–${f.d != null ? esc(yTxt(f.d)) : '?'}${alive ? ` · ${esc(ageTxt(S.year - f.b))}` : ''}</span><span class="gt-ax" title="${esc(T('{n} batailles à moins de 50 km de ses lieux', {n: nf(f.k)}))}"><i style="left:${p(f.b)}%;width:${(p(to) - p(f.b)).toFixed(2)}%"></i>${alive ? `<u style="left:${p(S.year)}%"></u>` : ''}</span></div>`; }).join('')
            + (S.livesMore ? `<p class="muted gt-more">${esc(T('et {n} autres personnes de la famille touchées', {n: nf(S.livesMore)}))}</p>` : '');
    }
    function drawSide() {
        const q = sel => S.res.querySelector(sel); if (!q('[data-gt-list]')) return;
        const lst = S.vis.map(v => v[0]).filter(b => S.war < 0 || b.w === S.war).sort((a, c) => c.y - a.y || String(c.d).localeCompare(String(a.d)) || (c.near ? 1 : 0) - (a.near ? 1 : 0));
        q('[data-gt-listh]').innerHTML = `${esc(T('Ces années-là'))} <small>${esc(S.set.trail ? T('jusqu’en {y}', {y: yTxt(S.year)}) : `${yTxt(Math.max(S.range[0], S.year - FADE + 1))}–${yTxt(S.year)}`)} · ${nf(lst.length)}</small>`;
        q('[data-gt-list]').innerHTML = lst.length ? lst.slice(0, 60).map(b => `<li><button type="button" data-gt-b="${b.i}" aria-current="${S.sel === b.i}"><i class="gt-m${b.near && S.set.homes ? ' is-n' : ''}${b.approx ? ' is-a' : ''}" aria-hidden="true"></i><span><span class="gt-nm">${esc(b.n)}</span><small>${esc(dateTxt(b.d, b.y))}${b.near && S.set.homes ? ` · ${esc(T('à {k} de {p}', {k: kmTxt(b.near.km), p: b.near.place}))}` : ''}</small></span></button></li>`).join('')
            + (lst.length > 60 ? `<li class="gt-empty">${esc(T('… et {n} autres', {n: nf(lst.length - 60)}))}</li>` : '') : `<li class="gt-empty">${esc(T('Rien sur la carte pour ces années.'))}</li>`;
    }
    function detail(i) {
        const b = S.D.B[i]; if (!b) return; S.sel = i;
        const w = b.w >= 0 ? S.D.wars[b.w] : null, box = S.res.querySelector('[data-gt-detail]'), off = offline();
        const links = off ? '' : `<div class="gt-src">${b.frwiki ? `<a href="${esc(wpUrl(b.frwiki))}" target="_blank" rel="noopener noreferrer">↗ Wikipédia</a>` : ''}${b.q ? `<a href="${esc(wdUrl(b.q))}" target="_blank" rel="noopener noreferrer">↗ ${esc(T('source (Wikidata)'))}</a>` : ''}${w?.q ? `<a href="${esc(wdUrl(w.q))}" target="_blank" rel="noopener noreferrer">↗ ${esc(T('la guerre'))}</a>` : ''}</div>`;
        box.hidden = false;
        box.innerHTML = `<div class="gt-dh"><span class="eyebrow">🧭 ${esc(T('Histoire autour'))}</span><h4>${esc(b.n)}</h4></div><div class="gt-db"><p class="gt-when">${esc(dateTxt(b.d, b.y))}</p>
            <dl class="gt-facts">${w || b.war ? `<dt>${esc(T('Guerre'))}</dt><dd>${esc(w ? w.n : b.war)}${w ? ` <small class="muted">${esc(yTxt(w.y))}–${w.y2 != null ? esc(yTxt(w.y2)) : '?'}</small>` : ''}</dd>` : ''}${b.bel.length ? `<dt>${esc(T('Camps'))}</dt><dd>${esc(b.bel.slice(0, 4).join(' / '))}</dd>` : ''}
            <dt>${esc(T('Lieu'))}</dt><dd>${esc(b.loc || '—')}${b.approx ? `<span class="gt-tag">${esc(T('placé par son lieu'))}</span>` : ''}</dd></dl>
            ${b.near ? `<div class="gt-near">${T('À <b>{k}</b> de {p} : {w} avait {a}.', {k: esc(kmTxt(b.near.km)), p: esc(b.near.place), w: esc(b.near.who), a: esc(b.near.age != null ? ageTxt(b.near.age) : '?')})}</div>` : ''}
            ${links}<p class="gt-cite">${esc(T('Source : Wikidata (CC0).'))}${b.approx ? ` ${esc(T('Wikidata ne donne pas ses coordonnées : le point est celui du lieu nommé.'))}` : ''}</p></div>`;
        drawMap(); drawSide();
    }

    /* ─── les gestes ─── */
    function setYear(y, {pulse = false} = {}) {
        const ny = Math.max(S.range[0], Math.min(S.range[1], Math.round(y))); if (!Number.isFinite(ny)) return;
        const prev = S.year; S.year = ny;
        if (pulse && ny === prev + 1 && !reduced()) { const t = performance.now(); for (const b of S.D.byYear.get(ny) || []) if ((S.war < 0 || b.w === S.war) && (S.set.approx || !b.approx)) S.pulses.push([b, t]); if (S.pulses.length > 400) S.pulses.splice(0, S.pulses.length - 400); loop(); }
        drawMap(); drawSide();
    }
    function setWar(i) {
        S.war = Number(i); const sel = S.res.querySelector('[data-gt-war-sel]'); if (sel) sel.value = String(S.war);
        const w = S.war >= 0 ? S.D.wars[S.war] : null;
        S.range = rangeOf(S.D, S.api.state(), w); S.hist = null;
        const rg = S.res.querySelector('[data-gt-range]'); rg.min = String(S.range[0]); rg.max = String(S.range[1]);
        if (w && Number.isFinite(w.y)) S.year = Math.max(S.range[0], w.y);
        S.frame = autoFrame(); S.res.querySelectorAll('[data-gt-frame]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.gtFrame === S.frame)));
        paintLegend(); paintWarChip(); layout(); drawAll();
    }
    const speedMs = () => (SPEEDS.find(x => x[0] === S.set.speed) || SPEEDS[1])[2];
    function endYear() { const w = S.war >= 0 ? S.D.wars[S.war] : null; return w && Number.isFinite(w.y2 ?? w.y) ? Math.min(S.range[1], (w.y2 ?? w.y) + 1) : S.range[1]; }
    function setPlay(on) {
        if (reduced()) { on = false; setYear(S.year >= S.range[1] ? S.range[0] : S.year + 1); }
        S.playing = on; S.last = performance.now();
        const b = S.res.querySelector('[data-gt-play]');
        if (b && !reduced()) { b.textContent = on ? `❚❚ ${T('Pause')}` : `▶ ${T('Lecture')}`; b.setAttribute('aria-pressed', String(on)); }
        if (on) loop();
    }
    /** un seul requestAnimationFrame : l'année qui avance, les éclats des nouvelles batailles */
    function loop() { if (S && !S.raf) S.raf = requestAnimationFrame(tick); }
    function tick(now) {
        if (!S) return; S.raf = 0;
        if (!S.res.isConnected) { stop(); return; }
        if (S.playing && now - S.last >= speedMs()) {
            S.last = now;
            if (S.year >= endYear()) setPlay(false); else setYear(S.year + 1, {pulse: true});
        }
        const fx = S.res.querySelector('[data-gt-fx]');
        if (fx && S.view) {
            const ctx = fx.getContext('2d'), {W, H, dpr} = S.view; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
            S.pulses = S.pulses.filter(([, t]) => now - t < 1200);
            ctx.strokeStyle = colors?.pulse || '#055dff'; ctx.lineWidth = 2;
            for (const [b, t] of S.pulses) { const k = (now - t) / 1200, [x, y] = px(b.x, b.yy); ctx.globalAlpha = 0.9 * (1 - k); ctx.beginPath(); ctx.arc(x, y, S.r + k * 20, 0, Math.PI * 2); ctx.stroke(); }
            ctx.globalAlpha = 1;
        }
        if (S.playing || S.pulses.length) loop();
    }
    function hit(e) {
        const stg = S.res.querySelector('[data-gt-stage]'), r = stg.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
        let best = null, bd = (S.r + 6) ** 2;
        for (const v of S.vis) { const d = (v[1] - x) ** 2 + (v[2] - y) ** 2; if (d <= bd) { bd = d; best = v[0]; } }
        return {b: best, x, y, w: r.width};
    }
    function bind(res) {
        const root = res.querySelector('[data-gt]'), set = S.set, mine = S.my;
        const save = () => saveSet(set);
        root.addEventListener('click', e => {
            const t = e.target; let b;
            if (t.closest('[data-gt-play]')) { if (!S.playing && S.year >= endYear() && !reduced()) { S.year = S.war >= 0 && Number.isFinite(S.D.wars[S.war].y) ? Math.max(S.range[0], S.D.wars[S.war].y) : S.range[0]; } setPlay(!S.playing); return; }
            if ((b = t.closest('[data-gt-step]'))) { setPlay(false); setYear(S.year + Number(b.dataset.gtStep), {pulse: Number(b.dataset.gtStep) > 0}); return; }
            if ((b = t.closest('[data-gt-speed]'))) { set.speed = b.dataset.gtSpeed; save(); root.querySelectorAll('[data-gt-speed]').forEach(x => { const on = x === b; x.setAttribute('aria-pressed', String(on)); x.classList.toggle('is-active', on); }); return; }
            if ((b = t.closest('[data-gt-frame]'))) { S.frame = b.dataset.gtFrame; root.querySelectorAll('[data-gt-frame]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); layout(); drawAll(); return; }
            if ((b = t.closest('[data-gt-b]'))) { detail(Number(b.dataset.gtB)); S.res.querySelector('[data-gt-detail]')?.scrollIntoView?.({block: 'nearest'}); return; }
            if (t.closest('[data-gt-off]')) { e.preventDefault(); return; }
        });
        root.addEventListener('change', e => {
            const t = e.target;
            if (t.matches('[data-gt-set]')) {
                const k = t.dataset.gtSet; set[k] = t.checked; save();
                if (k === 'anc') computeNear();
                if (k === 'approx') S.hist = null;
                paintLegend(); drawAll(); return;
            }
            if (t.matches('[data-gt-war-sel]')) { setWar(Number(t.value)); return; }
            if (t.matches('[data-gt-yearnum]')) { const y = parseInt(String(t.value).trim(), 10); if (Number.isFinite(y) && y !== S.year) { setPlay(false); setYear(y); } t.value = String(S.year); } // (le « change » du départ de la case après Entrée : rien ne bouge)
        });
        root.querySelector('[data-gt-yearnum]').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.target.dispatchEvent(new Event('change', {bubbles: true})); } });
        root.querySelector('[data-gt-range]').addEventListener('input', e => { setPlay(false); setYear(Number(e.target.value)); });
        const stg = root.querySelector('[data-gt-stage]'), tip = root.querySelector('[data-gt-tip]');
        stg.addEventListener('pointermove', e => { const h = hit(e); if (!h.b) { tip.classList.remove('is-on'); stg.style.cursor = ''; return; } stg.style.cursor = 'pointer';
            tip.innerHTML = `<b>${esc(h.b.n)}</b><br>${esc(dateTxt(h.b.d, h.b.y))}${h.b.near && S.set.homes ? `<br>${esc(T('à {k} de {p}', {k: kmTxt(h.b.near.km), p: h.b.near.place}))}` : ''}`;
            tip.style.left = `${Math.min(h.w - 110, Math.max(110, h.x))}px`; tip.style.top = `${h.y}px`; tip.classList.add('is-on'); });
        stg.addEventListener('pointerleave', () => tip.classList.remove('is-on'));
        stg.addEventListener('click', e => { const h = hit(e); if (h.b) detail(h.b.i); });
        // clavier : Espace = lecture, ← → = une année (sur la carte et dans la barre, pas dans une case à remplir)
        root.addEventListener('keydown', e => {
            if (e.target.matches('input:not([type=checkbox]):not([type=range]),select,textarea') || e.altKey || e.ctrlKey || e.metaKey) return;
            if (e.key === ' ' && (e.target === stg || e.target.matches('[data-gt-range]'))) { e.preventDefault(); root.querySelector('[data-gt-play]').click(); }
            else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && e.target === stg) { e.preventDefault(); setPlay(false); setYear(S.year + (e.key === 'ArrowRight' ? 1 : -1), {pulse: e.key === 'ArrowRight'}); }
        });
        // la taille de la boîte, le thème
        let rt = 0;
        S.ro = new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => { if (S?.my !== mine || !root.isConnected) return; const w = stg.clientWidth; if (Math.abs(w - (S.view?.W || 0)) > 2) { layout(); drawAll(); } }, 80); });
        S.ro.observe(stg);
        base().then(G => { if (S?.my === mine) { S.base = G; if (S.view) drawMap(); } });
    }
    // le thème clair / sombre change : on redessine
    try { new MutationObserver(() => { if (S?.view && S.res.isConnected) drawAll(); }).observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme', 'class']}); } catch (_) {}
    try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (S?.view && S.res.isConnected) drawAll(); }); } catch (_) {}

    /** la fiche d'une guerre : « ▶ Dans le temps » ouvre la liste des batailles sur la carte, cette guerre choisie */
    function openWar(q) {
        const L = E().list?.() || [], d = L.find(x => x.timeMap) || L.find(x => x.id === 'reunie_batailles'); if (!d) return;
        wantWar.set(d.id, q);
        document.querySelectorAll('dialog.ha-dialog[open]').forEach(x => x.close());
        const st = E().stateOf ? E().stateOf(d.id) : {};
        E().open?.(d.id, {...st, view: 'map', time: true});
    }
    document.addEventListener('click', e => { const b = e.target.closest?.('[data-gt-war]'); if (!b) return; e.preventDefault(); openWar(b.dataset.gtWar); });

    ext.guerresTemps = {listBar, paint, openWar, state: () => S, FADE, NEAR};
})();
