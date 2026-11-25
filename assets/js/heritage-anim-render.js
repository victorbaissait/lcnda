/* LCNDA — 🎞 Studio d'animation : le moteur de dessin (maquette docs/design/studio-animation.html).
 * Une image du film à l'instant t (secondes) : la scène du moment, sa caméra, ses légendes, ses images, la grande année, le titre,
 * et le passage d'une scène à l'autre (fondu, noir, coupe). Tout se dessine sur un <canvas> ; le même dessin sert à l'aperçu et à la vidéo
 * (heritage-anim-export.js), image par image : on peut aller à n'importe quel instant (rien ne dépend de l'image d'avant).
 * Sortes de scènes :
 *   title      — un carton de titre (titre, sous-titre, couleurs) ;
 *   image      — une photo de la base, qui avance doucement (zoom de départ et d'arrivée) ;
 *   diagram    — un diagramme de l'app (spec), lu dans le temps s'il a des dates (ext.diagramPerso.timeInfo), en fondu d'une année à l'autre ;
 *   migrations — la famille qui se déplace sur la carte (le « Film de la famille », en réglable) ;
 *   race       — la course des noms ou des prénoms (barres qui se doublent) ;
 *   pyramid    — la pyramide des âges de ceux qui vivaient chaque année ;
 *   line       — la courbe qui se dessine (naissances, décès, mariages, vivants, âge au décès) ;
 *   tree       — l'arbre (éventail) qui pousse, génération après génération.
 *   vectormap  — une carte du Dessin vectoriel (heritage-vector-map.js) : le curseur du temps joue d'une année à l'autre, les objets
 *                apparaissent à leur date (une image par état de la carte, gardée) ; docId (relue) ou doc (une copie) ;
 *   house      — une maison par époques (heritage-house.js, ext.houseEpochPlans) : le plan de chaque époque tour à tour, en fondu, l'année en légende.
 *   ext.animRender = {FORMATS, sizeOf, scenesAt, totalDur, yearAt, camAt, prepare, drawFrame, autoCaptions, raceData, pyramidData, lineData, fanData, easing}
 * Essais : tests/test-anim-studio.js (calculs, dans Node) et tests/test-anim-studio-ui.js (navigateur).
 */
(() => {
    'use strict';
    const root = typeof window !== 'undefined' ? window : globalThis;
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const T = (k, v) => (root.LCNDA_I18N?.t ? root.LCNDA_I18N.t(k, v) : String(k).replace(/\{(\w+)\}/g, (_, x) => v?.[x] ?? ''));
    const A = () => root.LCNDA_APP;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const lerp = (a, b, k) => a + (b - a) * k;
    const num = v => (v === null || v === undefined || v === '' ? NaN : Number(v));

    /* ═════ formats ═════ */
    const FORMATS = {'16:9': [16, 9], '1:1': [1, 1], '9:16': [9, 16], '4:3': [4, 3]};
    /** la taille en pixels (paire, comme les vidéos l'aiment) : qualité = le petit côté (720, 1080, 2160) */
    function sizeOf(format = '16:9', quality = 1080) {
        const [a, b] = FORMATS[format] || FORMATS['16:9'], q = clamp(Number(quality) || 1080, 240, 2160), k = q / Math.min(a, b);
        return [Math.round(a * k / 2) * 2, Math.round(b * k / 2) * 2];
    }
    const easing = {
        linear: x => x,
        inout: x => (x < .5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2),
        smooth: x => x * x * (3 - 2 * x),
        out: x => 1 - (1 - x) ** 3,
    };

    /* ═════ le temps du film ═════ */
    const durOf = s => clamp(Number(s?.dur) || 0, 0.2, 3600);
    const totalDur = proj => (proj?.scenes || []).reduce((t, s) => t + durOf(s), 0);
    /** la scène de l'instant t : {i, scene, t0, local (s), p (0..1)} ; null si le film est vide */
    function scenesAt(proj, t) {
        const list = proj?.scenes || []; if (!list.length) return null;
        let t0 = 0;
        for (let i = 0; i < list.length; i++) {
            const d = durOf(list[i]);
            if (t < t0 + d || i === list.length - 1) { const local = clamp(t - t0, 0, d); return {i, scene: list[i], t0, local, p: d ? local / d : 1}; }
            t0 += d;
        }
        return null;
    }
    /** l'année montrée à l'avancement p d'une scène : début → fin, ralenti là où il se passe beaucoup (warp = table cumulée) */
    function yearAt(scene, p, warp = null) {
        const from = num(scene.from), to = num(scene.to); if (!Number.isFinite(from) || !Number.isFinite(to)) return NaN;
        const e = (easing[scene.ease] || easing.linear)(clamp(p, 0, 1));
        if (warp && warp.length > 1) { const x = e * (warp.length - 1), i = Math.floor(x), k = x - i; return lerp(warp[i], warp[Math.min(i + 1, warp.length - 1)], k); }
        return lerp(from, to, e);
    }
    /** la table « ralentir là où il se passe beaucoup » : années d'événements → 101 années, plus serrées où c'est dense */
    function makeWarp(from, to, years, strength = .6) {
        if (!(to > from) || !years?.length) return null;
        const n = Math.max(1, Math.round(to - from)), bins = new Array(n).fill(0);
        years.forEach(y => { const i = Math.floor(y - from); if (i >= 0 && i < n) bins[i]++; });
        const max = Math.max(...bins) || 1, w = bins.map(b => (1 - strength) + strength * (b / max)), cum = [0];
        w.forEach(x => cum.push(cum[cum.length - 1] + x));
        const tot = cum[cum.length - 1], out = [];
        for (let j = 0; j <= 100; j++) { const target = tot * j / 100; let i = 0; while (i < n && cum[i + 1] < target) i++; const k = cum[i + 1] > cum[i] ? (target - cum[i]) / (cum[i + 1] - cum[i]) : 0; out.push(from + i + clamp(k, 0, 1)); }
        return out;
    }
    /** la caméra à l'avancement p : {x, y (centre, 0..1), z (zoom ≥ 1)} ; keys = [{t, x, y, z}] (t de 0 à 1) */
    function camAt(cam, p, auto = null) {
        const mode = cam?.mode || 'fit';
        if (mode === 'kenburns') { const k = easing.smooth(clamp(p, 0, 1)), z0 = Number(cam.z0) || 1, z1 = Number(cam.z1) || 1.25; return {x: lerp(cam.x0 ?? .5, cam.x1 ?? .5, k), y: lerp(cam.y0 ?? .5, cam.y1 ?? .5, k), z: lerp(z0, z1, k)}; }
        if (mode === 'follow' && auto && auto.length) { const x = clamp(p, 0, 1) * (auto.length - 1), i = Math.floor(x), k = x - i, a = auto[i], b = auto[Math.min(i + 1, auto.length - 1)]; return {x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), z: lerp(a.z, b.z, k)}; }
        const keys = (cam?.keys || []).filter(k => Number.isFinite(k.t)).slice().sort((a, b) => a.t - b.t);
        if (mode === 'keys' && keys.length) {
            if (p <= keys[0].t) return {x: keys[0].x, y: keys[0].y, z: keys[0].z};
            const last = keys[keys.length - 1]; if (p >= last.t) return {x: last.x, y: last.y, z: last.z};
            const j = keys.findIndex(k => k.t > p), a = keys[j - 1], b = keys[j], k = easing.smooth((p - a.t) / ((b.t - a.t) || 1));
            return {x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), z: lerp(a.z, b.z, k)};
        }
        return {x: .5, y: .5, z: 1};
    }
    /** le rectangle source d'une image W×H vue par la caméra (jamais en dehors de l'image) */
    function camRect(c, W, H) {
        const z = clamp(c.z || 1, 1, 12), w = W / z, h = H / z;
        return [clamp(c.x * W - w / 2, 0, W - w), clamp(c.y * H - h / 2, 0, H - h), w, h];
    }

    /* ═════ les données des modèles (anim_people) ═════ */
    let people = null, peopleLoading = null;
    async function loadPeople(force = false) {
        if (people && !force) return people;
        if (!peopleLoading) peopleLoading = A().api('anim_people').then(d => { people = indexPeople(d); return people; }).finally(() => { peopleLoading = null; });
        return peopleLoading;
    }
    function indexPeople(d) {
        const byId = new Map((d.people || []).map(p => [p.id, p]));
        return {...d, byId, places: d.places || {}};
    }
    const fullName = p => [p.f, p.l ? String(p.l).toUpperCase() : ''].filter(Boolean).join(' ').trim() || T('Sans nom');
    const firstOf = p => String(p.f || '').trim().split(/[\s-]+/)[0] || '';
    const ucfirst = s => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);

    /** 🏁 la course : clés (noms…) et leurs valeurs chaque année ; what = surname | first | firstm | firstf | place ; mode = decade | cumulative | alive */
    function raceData(D, {what = 'surname', mode = 'decade', top = 10, window: win = 20} = {}) {
        const keyOf = p => (what === 'surname' ? String(p.l || '').trim().toUpperCase() : what === 'place' ? (D.places[p.bp]?.[0] || '') : ['first', 'firstm', 'firstf'].includes(what) && (what === 'first' || (what === 'firstm' ? p.g === 'm' : p.g === 'f')) ? ucfirst(firstOf(p)) : '');
        const list = (D.people || []).filter(p => Number.isFinite(p.by)).map(p => ({k: keyOf(p), by: p.by, dy: Number.isFinite(p.dy) ? p.dy : p.by + 70})).filter(x => x.k);
        if (!list.length) return null;
        const from = Math.min(...list.map(x => x.by)), to = Math.max(...list.map(x => x.by)) + (mode === 'alive' ? 30 : 0);
        const keys = [...new Set(list.map(x => x.k))];
        const at = y => { const m = new Map(); list.forEach(x => { const ok = mode === 'cumulative' ? x.by <= y : mode === 'alive' ? x.by <= y && x.dy >= y : x.by <= y && x.by > y - win; if (ok) m.set(x.k, (m.get(x.k) || 0) + 1); }); return m; };
        const years = []; for (let y = Math.floor(from); y <= Math.ceil(to); y++) years.push(y);
        const table = new Map(years.map(y => [y, at(y)]));
        let max = 1; table.forEach(m => m.forEach(v => { if (v > max) max = v; }));
        return {from, to, keys, table, max, top: clamp(Number(top) || 10, 3, 30)};
    }
    /** 👥 la pyramide : chaque année, les vivants par tranche d'âge (hommes à gauche, femmes à droite) */
    function pyramidData(D, {step = 5, maxAge = 100} = {}) {
        const list = (D.people || []).filter(p => Number.isFinite(p.by) && (p.g === 'm' || p.g === 'f')).map(p => ({g: p.g, by: p.by, dy: Number.isFinite(p.dy) ? p.dy : Math.min(p.by + 80, new Date().getFullYear())}));
        if (!list.length) return null;
        const st = clamp(Number(step) || 5, 1, 20), bands = Math.ceil((Number(maxAge) || 100) / st);
        const from = Math.min(...list.map(x => x.by)), to = Math.min(new Date().getFullYear(), Math.max(...list.map(x => x.dy)));
        const at = y => { const m = new Array(bands).fill(0), f = new Array(bands).fill(0); list.forEach(x => { if (x.by <= y && x.dy >= y) { const b = Math.min(bands - 1, Math.floor((y - x.by) / st)); (x.g === 'm' ? m : f)[b]++; } }); return {m, f}; };
        const table = new Map(); let max = 1;
        for (let y = Math.floor(from); y <= Math.ceil(to); y++) { const r = at(y); table.set(y, r); max = Math.max(max, ...r.m, ...r.f); }
        return {from, to, step: st, bands, table, max};
    }
    /** 📈 la courbe : une valeur par année (ou décennie) ; what = births | deaths | marriages | alive | agedeath */
    function lineData(D, {what = 'births', per = 'year', cumulative = false} = {}) {
        const bucket = y => (per === 'decade' ? Math.floor(y / 10) * 10 : Math.floor(y));
        const m = new Map(), cnt = new Map();
        const add = (y, v = 1) => { if (!Number.isFinite(y)) return; const b = bucket(y); m.set(b, (m.get(b) || 0) + v); cnt.set(b, (cnt.get(b) || 0) + 1); };
        if (what === 'births') (D.people || []).forEach(p => add(p.by));
        else if (what === 'deaths') (D.people || []).forEach(p => add(p.dy));
        else if (what === 'marriages') { const seen = new Set(); (D.events || []).forEach(([pid, y, k]) => { if (/^(marr|mari|wedding)/.test(k) && !seen.has(`${pid}-${y}`)) { seen.add(`${pid}-${y}`); add(y, .5); } }); }
        else if (what === 'agedeath') (D.people || []).forEach(p => { if (Number.isFinite(p.by) && Number.isFinite(p.dy) && p.dy >= p.by) add(p.dy, p.dy - p.by); });
        else if (what === 'alive') { const ys = (D.people || []).filter(p => Number.isFinite(p.by)); if (ys.length) { const a = Math.min(...ys.map(p => p.by)), b = Math.min(new Date().getFullYear(), Math.max(...ys.map(p => (Number.isFinite(p.dy) ? p.dy : p.by + 70)))); for (let y = a; y <= b; y += per === 'decade' ? 10 : 1) { const n = ys.filter(p => p.by <= y && (Number.isFinite(p.dy) ? p.dy : p.by + 70) >= y).length; m.set(bucket(y), n); cnt.set(bucket(y), 1); } } }
        const xs = [...m.keys()].sort((a, b) => a - b); if (xs.length < 2) return null;
        const full = []; for (let x = xs[0]; x <= xs[xs.length - 1]; x += per === 'decade' ? 10 : 1) full.push(x);
        let acc = 0;
        const pts = full.map(x => { let v = m.get(x) || 0; if (what === 'agedeath') v = cnt.get(x) ? v / cnt.get(x) : NaN; if (cumulative && what !== 'agedeath' && what !== 'alive') { acc += v; v = acc; } return [x, v]; });
        const vals = pts.map(p => p[1]).filter(Number.isFinite);
        return {pts, from: full[0], to: full[full.length - 1], max: Math.max(1, ...vals), what, per};
    }
    /** 🌳 l'éventail : les ancêtres de root (numéros Sosa) jusqu'à gens générations */
    function fanData(D, rootId, gens = 7) {
        const G = clamp(Number(gens) || 7, 2, 10), out = [];
        const walk = (id, sosa, g) => { const p = D.byId.get(id); if (!p || g >= G) return; out.push({sosa, g, p}); if (p.fa) walk(p.fa, sosa * 2, g + 1); if (p.mo) walk(p.mo, sosa * 2 + 1, g + 1); };
        walk(Number(rootId) || D.root || (D.people[0] && D.people[0].id), 1, 0);
        return {items: out, gens: G};
    }
    /** 💬 les légendes faites seules pour les migrations : départs, mariages, naissances, décès — étalées dans le temps */
    function autoCaptions(D, {from, to, kinds = ['depart', 'mariage'], max = 12, who = null} = {}) {
        const ok = id => !who || who.has(id), P = D.places, cands = [];
        const byPerson = new Map(); (D.events || []).forEach(e => { if (!ok(e[0]) || e[1] < from || e[1] > to) return; if (!byPerson.has(e[0])) byPerson.set(e[0], []); byPerson.get(e[0]).push(e); });
        const dist = (a, b) => { const x = P[a], y = P[b]; if (!x || !y || !Number.isFinite(x[1]) || !Number.isFinite(y[1])) return 0; const r = Math.PI / 180, dLat = (y[1] - x[1]) * r, dLon = (y[2] - x[2]) * r, h = Math.sin(dLat / 2) ** 2 + Math.cos(x[1] * r) * Math.cos(y[1] * r) * Math.sin(dLon / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
        byPerson.forEach((evs, pid) => {
            const p = D.byId.get(pid); if (!p) return;
            const nm = fullName(p);
            evs.forEach((e, i) => {
                const [, y, k, pl] = e, place = P[pl]?.[0] || '';
                if (kinds.includes('naissance') && /^(birth|birt|naissance)$/.test(k)) cands.push({y, text: T('{y} · naissance de {n} à {p}', {y: String(y), n: nm, p: place}), w: 1});
                if (kinds.includes('deces') && /^(death|deat|deces|décès)$/.test(k)) cands.push({y, text: T('{y} · décès de {n} à {p}', {y: String(y), n: nm, p: place}), w: 1});
                if (kinds.includes('mariage') && /^(marr|mari)/.test(k)) cands.push({y, text: T('{y} · mariage de {n} à {p}', {y: String(y), n: nm, p: place}), w: 2});
                if (kinds.includes('depart') && i > 0 && evs[i - 1][3] !== pl) { const km = dist(evs[i - 1][3], pl); if (km >= 20) cands.push({y, text: T('{y} · {n} part de {a} pour {b}', {y: String(y), n: nm, a: P[evs[i - 1][3]]?.[0] || '?', b: place}), w: 2 + Math.min(3, km / 200)}); }
            });
        });
        // les plus marquantes, pas deux trop près l'une de l'autre
        const gap = Math.max(1, (to - from) / Math.max(1, max) * .7), out = [];
        cands.sort((a, b) => b.w - a.w || a.y - b.y).forEach(c => { if (out.length < max && !out.some(o => Math.abs(o.y - c.y) < gap)) out.push(c); });
        return out.sort((a, b) => a.y - b.y).map(c => ({year: c.y, text: c.text, dur: 3.5, auto: 1}));
    }

    /* ═════ couleurs ═════ */
    const PALETTE = ['#c0392b', '#2a6a9a', '#2f8a3a', '#b5651d', '#6929c4', '#008b8b', '#d4a800', '#8a3a6a', '#4a6a8a', '#e07a3a', '#3a7a5a', '#9a4a2a'];
    const colorFor = (scene, key, i) => (scene.colors && /^#[0-9a-f]{6}$/i.test(scene.colors[key] || '') ? scene.colors[key] : PALETTE[i % PALETTE.length]);

    /* ═════ préparer une scène (données, images, fond de carte) — gardé tant que ses réglages ne changent pas ═════ */
    const cache = new Map();
    const NOPREP = new Set(['captions', 'name', 'dur', 'trans', 'transDur', 'hiddenAuto', 'title', 'showTitle', 'overlays', 'ease', 'doc', 'fade', 'labels']); // doc : la copie d'une carte (docRev change avec elle)
    /** ce qui oblige à refaire la préparation (pas le nom, la durée, les légendes à soi… ni ce que la préparation a trouvé : _from, _to) */
    const sig = s => JSON.stringify(Object.fromEntries(Object.entries(s).filter(([k]) => !NOPREP.has(k) && !k.startsWith('_'))));
    /** une image ; au bout de ms sans réponse (pas de réseau, site lent) : null, le dessin continue sans elle */
    function loadImg(src, cors = false, ms = 0) {
        return new Promise(res => { const im = new Image(); let done = false; const end = v => { if (!done) { done = true; res(v); } }; if (cors) im.crossOrigin = 'anonymous'; im.onload = () => end(im); im.onerror = () => end(null); im.referrerPolicy = 'no-referrer'; im.src = src; if (ms) setTimeout(() => { if (!done) { im.src = ''; end(null); } }, ms); });
    }
    const mediaUrl = m => (m && m.filename ? `media/${encodeURIComponent(m.filename)}` : '');
    const mediaCache = new Map();
    /** une image de la base : m = {id, filename} (comme le choix des médias le donne) */
    async function mediaImg(m) {
        const fn = m && typeof m === 'object' ? m.filename : ''; if (!fn) return null;
        if (!mediaCache.has(fn)) mediaCache.set(fn, loadImg(mediaUrl({filename: fn})));
        return mediaCache.get(fn);
    }
    const mid = m => (m && typeof m === 'object' ? String(m.id || m.filename || '') : String(m || ''));
    async function prepare(scene, W, H, {onStep = null} = {}) {
        const key = `${scene.id}|${W}x${H}|${sig(scene)}`;
        if (cache.has(key)) return cache.get(key);
        const pr = (async () => {
            const st = {type: scene.type, W, H};
            if (scene.type === 'image') st.img = await mediaImg(scene.media);
            if (scene.type === 'diagram') await prepDiagram(scene, st);
            if (scene.type === 'vectormap') await prepVectorMap(scene, st, onStep);
            if (scene.type === 'house') await prepHouse(scene, st, onStep);
            if (['migrations', 'race', 'pyramid', 'line', 'tree'].includes(scene.type)) { onStep?.(T('Lecture de la base…')); st.D = await loadPeople(); }
            if (scene.type === 'migrations') await prepMigrations(scene, st, W, H, onStep);
            if (scene.type === 'race') { st.R = raceData(st.D, scene); fillRange(scene, st.R); }
            if (scene.type === 'pyramid') { st.P = pyramidData(st.D, scene); fillRange(scene, st.P); }
            if (scene.type === 'line') { st.L = lineData(st.D, scene); fillRange(scene, st.L); }
            if (scene.type === 'tree') st.F = fanData(st.D, scene.root, scene.gens);
            if (scene.type === 'borders') { onStep?.(T('Lecture des frontières…')); try { st.geo = await ext.frontieres?.ready(); } catch (_) { st.geo = null; } scene._from = 1760; scene._to = 1925; }
            st.pics = new Map(); for (const pc of scene.pics || []) st.pics.set(mid(pc.media), await mediaImg(pc.media));
            return st;
        })();
        cache.set(key, pr); if (cache.size > 40) cache.delete(cache.keys().next().value);
        return pr;
    }
    /** les années d'une scène : réglées, sinon celles des données */
    function fillRange(scene, d) { if (!d) return; scene._from = Number.isFinite(num(scene.from)) ? num(scene.from) : Math.floor(d.from); scene._to = Number.isFinite(num(scene.to)) ? num(scene.to) : Math.ceil(d.to); }
    const range = s => ({...s, from: Number.isFinite(num(s.from)) ? s.from : s._from, to: Number.isFinite(num(s.to)) ? s.to : s._to});

    /* ── diagramme ── */
    async function prepDiagram(scene, st) {
        const P = ext.diagramPerso, R = ext.diagramRender; st.ok = !!(R && scene.spec);
        if (!st.ok) return;
        const TI = P?.timeInfo?.(scene.spec);
        st.time = TI && TI.years?.length > 1 ? TI : null;
        if (st.time) { scene._from = st.time.from; scene._to = st.time.to; }
        st.rasters = new Map();
    }
    function svgSize(svg) { const m = String(svg).match(/viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/); return m ? [Number(m[3]), Number(m[4])] : [900, 600]; }
    async function diagramRaster(scene, st, year) {
        const R = ext.diagramRender, key = st.time ? st.time.years.reduce((b, y) => (y <= year + 1e-9 ? y : b), st.time.years[0]) : 'all';
        if (st.rasters.has(key)) return st.rasters.get(key);
        const pr = (async () => {
            let svg = R.svg(st.time ? st.time.at(key) : scene.spec);
            if (!/xmlns=/.test(svg)) svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
            const [w, h] = svgSize(svg), k = Math.max(1, Math.min(4, (st.W * 2) / w));
            svg = svg.replace(/<svg([^>]*?)\swidth="[^"]*"/, '<svg$1').replace(/<svg([^>]*?)\sheight="[^"]*"/, '<svg$1').replace('<svg', `<svg width="${Math.round(w * k)}" height="${Math.round(h * k)}"`);
            const img = await loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
            return img ? {img, w: Math.round(w * k), h: Math.round(h * k)} : null;
        })();
        st.rasters.set(key, pr); if (st.rasters.size > 80) st.rasters.delete(st.rasters.keys().next().value);
        return pr;
    }

    /* ── 🗺️ carte vectorielle (heritage-vector-map.js) : le curseur du temps joue de A à B ; une image par « état » de la carte (gardée) ── */
    const inlineCache = new Map();
    /** les images « media/… » d'un SVG, mises dedans (un SVG chargé comme image ne va rien chercher dehors) */
    async function inlineSvg(svg) {
        const refs = [...new Set([...String(svg).matchAll(/href="(media\/[^"]+)"/g)].map(m => m[1]))];
        for (const r of refs) {
            if (!inlineCache.has(r)) inlineCache.set(r, (async () => { try { const b = await (await fetch(r.replace(/&amp;/g, '&'))).blob(); return await new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.onerror = () => ok(''); fr.readAsDataURL(b); }); } catch (_) { return ''; } })());
            const d = await inlineCache.get(r); if (/^data:image\//.test(d)) svg = svg.split(`href="${r}"`).join(`href="${d}"`);
        }
        return svg;
    }
    /** un SVG (texte) → {img, w, h} à la bonne taille : environ 2 fois la largeur du film, pour que la caméra reste nette */
    async function svgRaster(svg, W, bg = '') {
        if (!/xmlns=/.test(svg)) svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
        const [w, h] = svgSize(svg), k = Math.max(.05, Math.min(6, (W * 2) / w, 4096 / Math.max(w, h)));
        svg = svg.replace(/<svg([^>]*?)\swidth="[^"]*"/, '<svg$1').replace(/<svg([^>]*?)\sheight="[^"]*"/, '<svg$1').replace('<svg', `<svg width="${Math.round(w * k)}" height="${Math.round(h * k)}"`);
        const img = await loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(await inlineSvg(svg))); if (!img) return null;
        let out = img; if (bg) { out = makeCanvas(Math.round(w * k), Math.round(h * k)); const g2 = out.getContext('2d'); g2.fillStyle = bg; g2.fillRect(0, 0, out.width, out.height); g2.drawImage(img, 0, 0, out.width, out.height); }
        return {img: out, w: Math.round(w * k), h: Math.round(h * k)};
    }
    /** les années d'une carte : celles où quelque chose apparaît (yf) ou disparaît (yt + 1) */
    function mapYears(doc) {
        const ys = new Set(), walk = arr => (arr || []).forEach(o => { if (!o) return; const f = Number(o.map?.yf ?? o.yf), t = Number(o.map?.yt ?? o.yt); if (f) ys.add(Math.round(f)); if (t) ys.add(Math.round(t) + 1); if (o.children) walk(o.children); });
        walk(doc?.objs); return [...ys].sort((a, b) => a - b);
    }
    async function prepVectorMap(scene, st, onStep) {
        st.ok = false; const V = ext.vectorInternals;
        if (!V?.docSvg) { st.err = T('Le dessin vectoriel n’est pas chargé.'); return; }
        let doc = scene.doc || null;
        if (scene.docId) { onStep?.(T('Lecture de la carte…')); try { doc = (await A().api('vector_doc', {id: scene.docId})).doc; } catch (_) { doc = scene.doc || null; } }
        if (!doc || !Array.isArray(doc.objs)) { st.err = T('Carte introuvable'); return; }
        st.doc = doc; st.changes = mapYears(doc); st.ok = true; st.rasters = new Map();
        if (st.changes.length) { scene._from = st.changes[0]; scene._to = Math.max(st.changes[0] + 1, st.changes[st.changes.length - 1]); }
    }
    /** l'état de la carte à l'année y : la dernière année de changement atteinte (null : avant tout, tout ce qui n'a pas de date de début) */
    const mapKey = (st, y) => { if (!Number.isFinite(y)) return 'all'; let k = null; for (const c of st.changes) if (c <= y + 1e-9) k = c; return k === null ? (st.changes[0] || 1) - 1 : k; };
    async function mapRaster(scene, st, key) {
        if (st.rasters.has(key)) return st.rasters.get(key);
        const pr = (async () => {
            const d = st.doc, year = key === 'all' ? null : (Number(key) || -1); // l'année 0 n'existe pas (et « 0 » voudrait dire « toutes »)
            return svgRaster(ext.vectorInternals.docSvg({...d, map: {...(d.map || {}), year}}), st.W, d.bg && d.bg !== 'transparent' ? '' : '#ffffff');
        })();
        st.rasters.set(key, pr); if (st.rasters.size > 80) st.rasters.delete(st.rasters.keys().next().value);
        return pr;
    }
    async function drawVectorMap(g, s, st, p, year, W, H, proj) {
        g.fillStyle = s.bg || '#ffffff'; g.fillRect(0, 0, W, H);
        if (!st.ok) { text(g, st.err || T('Carte introuvable'), W / 2, H / 2, {size: H * .04, align: 'center', color: '#333', font: fontOf(proj)}); return; }
        const pad = Math.round(Math.min(W, H) * .03), top = s.title && s.showTitle !== false ? H * .11 : pad;
        const put = async (key, alpha) => {
            const r = await mapRaster(s, st, key); if (!r) return;
            const k = Math.min((W - pad * 2) / r.w, (H - top - pad) / r.h), w = r.w * k, h = r.h * k, x = (W - w) / 2, yy = top + (H - top - pad - h) / 2;
            const c = camAt(s.cam, p), [sx, sy, sw, sh] = camRect(c, r.w, r.h);
            g.globalAlpha = alpha; g.drawImage(r.img, sx, sy, sw, sh, x, yy, w, h); g.globalAlpha = 1;
        };
        const key = mapKey(st, year); await put(key, 1);
        // en douceur : ce qui arrive (ou s'en va) à la prochaine année de changement se montre peu à peu, pendant environ 0,7 s du film
        if (s.smooth !== false && Number.isFinite(year)) {
            const next = st.changes.find(c => c > year + 1e-9), R = range(s), perSec = Math.abs((num(R.to) - num(R.from)) || 1) / durOf(s), win = Math.max(.05, perSec * .7);
            if (next !== undefined && next - year < win) await put(next, easing.smooth(clamp(1 - (next - year) / win, 0, 1)));
        }
    }

    /* ── 🏠 maison par époques (heritage-house.js : ext.houseEpochPlans) : le plan de chaque époque tour à tour, en fondu, l'année en légende ── */
    const epochYear = e => { const m = String(e?.date || '').match(/-?\d{3,4}/); return m ? Number(m[0]) : NaN; };
    async function prepHouse(scene, st, onStep) {
        st.ok = false;
        if (!ext.houseEpochPlans) { st.err = T('La maison n’est pas chargée.'); return; }
        if (!scene.houseId) { st.err = T('Choisis une maison.'); return; }
        onStep?.(T('Lecture de la maison…'));
        let plans = []; try { plans = await ext.houseEpochPlans(scene.houseId, {level: Number(scene.level) || 0}); } catch (e) { st.err = e.message || T('Maison introuvable'); return; }
        plans = (plans || []).filter(x => x && x.svg);
        if (!plans.length) { st.err = T('Le plan de cette maison est vide.'); return; }
        // un même cadre pour toutes les époques : la maison ne saute pas d'une époque à l'autre
        const boxes = plans.map(x => { const m = String(x.svg).match(/viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/); return m ? m.slice(1).map(Number) : null; }).filter(Boolean);
        if (boxes.length) {
            const x0 = Math.min(...boxes.map(b => b[0])), y0 = Math.min(...boxes.map(b => b[1])), x1 = Math.max(...boxes.map(b => b[0] + b[2])), y1 = Math.max(...boxes.map(b => b[1] + b[3]));
            plans = plans.map(x => ({...x, svg: String(x.svg).replace(/viewBox="[^"]*"/, `viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}"`).replace(/<svg([^>]*?)\swidth="[^"]*"\s+height="[^"]*"/, `<svg$1 width="${Math.round(x1 - x0)}" height="${Math.round(y1 - y0)}"`)}));
        }
        st.plans = plans.map(x => ({...x, year: epochYear(x)})); st.ok = true; st.rasters = new Map();
    }
    async function houseRaster(st, i) {
        if (!st.rasters.has(i)) st.rasters.set(i, svgRaster(st.plans[i].svg, st.W, '#ffffff'));
        return st.rasters.get(i);
    }
    const epochLabel = e => [e.date, e.label].filter(Boolean).join(' · ');
    /** l'époque montrée à l'avancement p : {i, k (0..1 : le fondu vers la suivante)} */
    function houseAt(s, st, p) {
        const n = st.plans?.length || 0; if (!n) return {i: 0, k: 0};
        const x = clamp(p, 0, .99999) * n, i = Math.floor(x), local = x - i, fade = clamp(Number(s.fade ?? .3), 0, .9);
        return {i, k: i < n - 1 && fade > 0 && local > 1 - fade ? easing.smooth((local - (1 - fade)) / fade) : 0};
    }
    async function drawHouse(g, s, st, p, W, H, proj) {
        g.fillStyle = s.bg || '#ffffff'; g.fillRect(0, 0, W, H);
        if (!st.ok) { text(g, st.err || T('Maison introuvable'), W / 2, H / 2, {size: H * .04, align: 'center', color: '#333', font: fontOf(proj)}); return {}; }
        const pad = Math.round(Math.min(W, H) * .04), top = s.title && s.showTitle !== false ? H * .11 : pad, bottom = s.labels !== false ? H * .1 : pad;
        const put = async (i, alpha) => {
            const r = await houseRaster(st, i); if (!r) return;
            const k = Math.min((W - pad * 2) / r.w, (H - top - bottom) / r.h), w = r.w * k, h = r.h * k;
            g.globalAlpha = alpha; g.drawImage(r.img, (W - w) / 2, top + (H - top - bottom - h) / 2, w, h); g.globalAlpha = 1;
        };
        const {i, k} = houseAt(s, st, p); await put(i, 1); if (k > .001) await put(i + 1, k);
        const e = st.plans[k > .5 ? i + 1 : i];
        return {year: e.year, cap: s.labels !== false ? epochLabel(e) : ''};
    }

    /* ── migrations : le fond de carte une fois, en grand (la caméra y découpe) ── */
    const merc = (lon, lat, z) => { const n = 256 * 2 ** z, s = Math.sin(clamp(lat, -85, 85) * Math.PI / 180); return [(lon + 180) / 360 * n, (.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n]; };
    async function prepMigrations(scene, st, W, H, onStep) {
        const D = st.D, P = D.places, sur = String(scene.surname || '').trim().toUpperCase();
        let who = null;
        if (scene.who === 'desc' || scene.who === 'asc') {
            const r = Number(scene.root) || D.root; who = new Set([r]);
            if (scene.who === 'asc') { const up = id => { const p = D.byId.get(id); if (!p) return; [p.fa, p.mo].forEach(x => { if (x && !who.has(x)) { who.add(x); up(x); } }); }; up(r); }
            else { const kids = new Map(); D.people.forEach(p => [p.fa, p.mo].forEach(x => { if (x) { if (!kids.has(x)) kids.set(x, []); kids.get(x).push(p.id); } })); const down = id => (kids.get(id) || []).forEach(c => { if (!who.has(c)) { who.add(c); down(c); } }); down(r); }
        }
        const evs = (D.events || []).filter(e => { const pl = P[e[3]]; if (!pl || !Number.isFinite(pl[1]) || !Number.isFinite(pl[2])) return false; if (who && !who.has(e[0])) return false; if (sur) { const p = D.byId.get(e[0]); if (!p || String(p.l || '').toUpperCase() !== sur) return false; } return true; });
        st.who = who;
        if (evs.length < 2) { st.empty = true; return; }
        const ys = evs.map(e => e[1]);
        scene._from = Math.min(...ys); scene._to = Math.max(...ys);
        const from = Number.isFinite(num(scene.from)) ? num(scene.from) : scene._from, to = Number.isFinite(num(scene.to)) ? num(scene.to) : scene._to;
        const keep = evs.filter(e => e[1] >= from && e[1] <= to);
        st.evs = keep.length >= 2 ? keep : evs;
        st.warp = scene.slow === false ? null : makeWarp(from, to, st.evs.map(e => e[1]), .55);
        // couleurs : par nom (les plus fréquents), par sorte d'événement, ou une seule
        const counts = new Map(); st.evs.forEach(e => { const p = D.byId.get(e[0]); const k = keyFor(scene, p, e); counts.set(k, (counts.get(k) || 0) + 1); });
        const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, clamp(Number(scene.maxKeys) || 8, 1, 16)).map(x => x[0]);
        st.keys = top; st.colOf = k => { const i = top.indexOf(k); return i < 0 ? (scene.otherColor || '#8a8f99') : colorFor(scene, k, i); };
        // cadrage : 98 % des points du milieu ; un fond 2× plus grand que l'image pour que le zoom reste net
        const lats = st.evs.map(e => P[e[3]][1]).sort((a, b) => a - b), lons = st.evs.map(e => P[e[3]][2]).sort((a, b) => a - b);
        const q = (a, f) => a[clamp(Math.floor(f * (a.length - 1)), 0, a.length - 1)];
        const box = [q(lats, .01), q(lats, .99), q(lons, .01), q(lons, .99)], BW = W * 2, BH = H * 2;
        let z = 3; for (let zz = 14; zz >= 2; zz--) { const a = merc(box[2], box[1], zz), b = merc(box[3], box[0], zz); if (b[0] - a[0] <= BW * .82 && b[1] - a[1] <= BH * .76) { z = zz; break; } }
        const c0 = merc(box[2], box[1], z), c1 = merc(box[3], box[0], z), left = (c0[0] + c1[0]) / 2 - BW / 2, top0 = (c0[1] + c1[1]) / 2 - BH / 2 + BH * .02;
        st.xy = pl => { const m = merc(P[pl][2], P[pl][1], z); return [(m[0] - left) / BW, (m[1] - top0) / BH]; }; // 0..1 dans le fond
        st.BW = BW; st.BH = BH;
        st.bg = await basemap({bg: scene.basemap || 'osmfr', z, left, top0, BW, BH, sea: scene.sea || '#dfe6ea', dim: clamp(Number(scene.dim ?? .18), 0, .9), tone: scene.tone || ''}, onStep);
        // les chemins : les événements de chaque personne, dans l'ordre
        const per = new Map(); st.evs.forEach(e => { if (!per.has(e[0])) per.set(e[0], []); per.get(e[0]).push(e); });
        st.paths = per;
        // la caméra qui suit : centre et zoom des événements récents, lissés
        const auto = [];
        for (let j = 0; j <= 120; j++) {
            const y = yearAt({...scene, from, to}, j / 120, st.warp), win = Math.max(8, (to - from) / 8);
            const near = st.evs.filter(e => e[1] <= y && e[1] > y - win).map(e => st.xy(e[3]));
            if (!near.length) { auto.push(auto[auto.length - 1] || {x: .5, y: .5, z: 1}); continue; }
            const xs = near.map(v => v[0]).sort((a, b) => a - b), yy = near.map(v => v[1]).sort((a, b) => a - b);
            const x0 = q(xs, .1), x1 = q(xs, .9), y0 = q(yy, .1), y1 = q(yy, .9), span = Math.max((x1 - x0) * 1.6, (y1 - y0) * 1.6, .12);
            auto.push({x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: clamp(1 / span, 1, Number(scene.cam?.maxZoom) || 3)});
        }
        for (let pass = 0; pass < 6; pass++) for (let j = 1; j < auto.length - 1; j++) auto[j] = {x: (auto[j - 1].x + auto[j].x * 2 + auto[j + 1].x) / 4, y: (auto[j - 1].y + auto[j].y * 2 + auto[j + 1].y) / 4, z: (auto[j - 1].z + auto[j].z * 2 + auto[j + 1].z) / 4};
        st.auto = auto;
        st.caps = scene.autoCap?.on === false ? [] : autoCaptions(D, {from, to, kinds: scene.autoCap?.kinds || ['depart', 'mariage'], max: Number(scene.autoCap?.max) || 10, who});
    }
    function keyFor(scene, p, e) {
        const by = scene.colorBy || 'surname';
        if (by === 'one') return '·';
        if (by === 'event') return /birt|naiss|bapt|chr/.test(e[2]) ? T('Naissances') : /deat|deces|décès|buri|inhum/.test(e[2]) ? T('Décès') : /marr|mariage/.test(e[2]) ? T('Mariages') : T('Autres événements');
        if (by === 'gender') return p?.g === 'm' ? T('Hommes') : p?.g === 'f' ? T('Femmes') : T('Inconnu');
        return String(p?.l || '').trim().toUpperCase() || T('Sans nom');
    }
    /* le fond de carte, gardé (une seule fois par cadrage et par réglages de fond) ; les tuiles aussi, même celles qui n'arrivent pas */
    const bgCache = new Map(), tileCache = new Map();
    const tile = (url, cors, ms) => { if (!tileCache.has(url)) { tileCache.set(url, loadImg(url, cors, ms)); if (tileCache.size > 3000) tileCache.delete(tileCache.keys().next().value); } return tileCache.get(url); };
    function basemap(o, onStep) {
        const key = JSON.stringify(o);
        if (!bgCache.has(key)) {
            bgCache.set(key, (async () => {
                const {bg, z, left, top0, BW, BH, sea, dim, tone} = o, cv = makeCanvas(BW, BH), g = cv.getContext('2d');
                g.fillStyle = sea; g.fillRect(0, 0, BW, BH);
                if (bg !== 'none') {
                    onStep?.(T('Chargement du fond de carte…'));
                    const world = 2 ** z, tiles = [];
                    for (let tx = Math.floor(left / 256); tx <= Math.floor((left + BW) / 256); tx++) for (let ty = Math.floor(top0 / 256); ty <= Math.floor((top0 + BH) / 256); ty++) if (ty >= 0 && ty < world) tiles.push([tx, ty]);
                    const wrap = tx => ((tx % world) + world) % world, offUrl = (tx, ty) => `api.php?action=offline_tile&z=${z}&x=${wrap(tx)}&y=${ty}`;
                    const online = bg !== 'offline' && !(root.navigator && root.navigator.onLine === false) && A()?.mapTileUrl;
                    const imgs = online ? await Promise.all(tiles.map(([tx, ty]) => tile(A().mapTileUrl(bg, z, wrap(tx), ty), true, 6000))) : [];
                    let ok = false; imgs.forEach((im, i) => { if (im) { g.drawImage(im, tiles[i][0] * 256 - left, tiles[i][1] * 256 - top0, 256, 256); ok = true; } });
                    try { g.getImageData(0, 0, 1, 1); } catch (_) { ok = false; }
                    if (!ok) { const off = await Promise.all(tiles.map(([tx, ty]) => tile(offUrl(tx, ty), false, 15000))); g.fillStyle = sea; g.fillRect(0, 0, BW, BH); off.forEach((im, i) => { if (im) g.drawImage(im, tiles[i][0] * 256 - left, tiles[i][1] * 256 - top0, 256, 256); }); }
                }
                if (dim) { g.fillStyle = `rgba(255,255,255,${dim})`; g.fillRect(0, 0, BW, BH); }
                if (tone === 'sepia' || tone === 'grey') { try { const im = g.getImageData(0, 0, BW, BH), d = im.data; for (let i = 0; i < d.length; i += 4) { const l = d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11; if (tone === 'grey') { d[i] = d[i + 1] = d[i + 2] = l; } else { d[i] = Math.min(255, l * 1.07 + 20); d[i + 1] = Math.min(255, l * .95 + 8); d[i + 2] = l * .78; } } g.putImageData(im, 0, 0); } catch (_) {} }
                return cv;
            })());
            if (bgCache.size > 12) bgCache.delete(bgCache.keys().next().value);
        }
        return bgCache.get(key);
    }
    const makeCanvas = (w, h) => { if (typeof OffscreenCanvas !== 'undefined' && !root.document) return new OffscreenCanvas(w, h); const c = root.document.createElement('canvas'); c.width = w; c.height = h; return c; };

    /* ═════ dessiner ═════ */
    const FONT = {system: 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif', serif: 'Georgia, "Times New Roman", serif', rounded: '"Trebuchet MS", "Nunito", system-ui, sans-serif', mono: 'ui-monospace, Menlo, Consolas, monospace'};
    const fontOf = proj => FONT[proj.font] || FONT.system;
    function text(g, s, x, y, {size = 24, weight = 600, color = '#fff', align = 'left', base = 'alphabetic', font, max = 0, shadow = false} = {}) {
        g.font = `${weight} ${size}px ${font}`; g.textAlign = align; g.textBaseline = base; g.fillStyle = color;
        if (shadow) { g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = size / 5; }
        g.fillText(String(s), x, y, max || undefined); g.shadowBlur = 0; g.shadowColor = 'transparent';
    }
    function wrap(g, s, maxW) { const words = String(s).split(/\s+/), lines = []; let cur = ''; words.forEach(w => { const t = cur ? cur + ' ' + w : w; if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }); if (cur) lines.push(cur); return lines.slice(0, 4); }
    /** une image du film : g = contexte 2D d'un canevas W×H ; renvoie {scene, year} pour l'interface */
    async function drawFrame(g, proj, t, W, H, {preview = false} = {}) {
        const at = scenesAt(proj, t); g.save(); g.fillStyle = proj.bg || '#111'; g.fillRect(0, 0, W, H);
        if (!at) { g.restore(); return {scene: null}; }
        const s = at.scene, trans = s.trans || 'fade', td = clamp(Number(s.transDur ?? .8), 0, durOf(s) / 2);
        let info = await drawScene(g, proj, s, at.p, W, H, at.local);
        if (at.i > 0 && trans !== 'cut' && at.local < td) {
            const prev = proj.scenes[at.i - 1], k = at.local / (td || 1);
            if (trans === 'fade') { // l'image d'avant, de moins en moins visible
                const off = makeCanvas(W, H), g2 = off.getContext('2d'); g2.fillStyle = proj.bg || '#111'; g2.fillRect(0, 0, W, H);
                await drawScene(g2, proj, prev, 1, W, H, durOf(prev)); g.globalAlpha = 1 - easing.smooth(k); g.drawImage(off, 0, 0); g.globalAlpha = 1;
            } else if (trans === 'black') { g.fillStyle = `rgba(0,0,0,${1 - k})`; g.fillRect(0, 0, W, H); }
        }
        if (trans === 'black' && at.i < proj.scenes.length - 1 && durOf(s) - at.local < td) { const k = (durOf(s) - at.local) / (td || 1); g.fillStyle = `rgba(0,0,0,${1 - k})`; g.fillRect(0, 0, W, H); }
        if (proj.watermark) text(g, proj.watermark, W - W * .015, H - H * .02, {size: Math.round(H * .022), weight: 500, color: 'rgba(255,255,255,.75)', align: 'right', font: fontOf(proj), shadow: true});
        g.restore();
        return {...info, scene: s, i: at.i};
    }
    async function drawScene(g, proj, s, p, W, H, local) {
        const st = await prepare(s, W, H), R = range(s), font = fontOf(proj), ov = {...(proj.overlays || {}), ...(s.overlays || {})};
        let year = ['diagram', 'migrations', 'race', 'pyramid', 'line', 'borders', 'vectormap'].includes(s.type) ? yearAt(R, p, st.warp) : NaN;
        let legend = [], epochCap = '';
        if (s.type === 'title') drawTitle(g, s, p, W, H, font);
        else if (s.type === 'image') drawImage(g, s, st, p, W, H);
        else if (s.type === 'diagram') await drawDiagram(g, s, st, p, year, W, H, proj);
        else if (s.type === 'vectormap') await drawVectorMap(g, s, st, p, year, W, H, proj);
        else if (s.type === 'house') { const r = await drawHouse(g, s, st, p, W, H, proj); year = Number.isFinite(r.year) ? r.year : NaN; epochCap = r.cap || ''; }
        else if (s.type === 'migrations') legend = drawMigrations(g, s, st, p, year, W, H, font);
        else if (s.type === 'race') legend = drawRace(g, s, st, year, W, H, font, proj);
        else if (s.type === 'pyramid') drawPyramid(g, s, st, year, W, H, font, proj);
        else if (s.type === 'line') drawLine(g, s, st, year, W, H, font, proj);
        else if (s.type === 'tree') drawTree(g, s, st, p, W, H, font, proj);
        else if (s.type === 'borders') { if (st.geo && ext.frontieres) ext.frontieres.draw(g, Number.isFinite(year) ? year : num(R.from), W, H, {geo: st.geo, view: s.view, color: s.color, sea: s.sea, land: s.land, year: false, labels: s.events !== false}); }
        // les images posées sur la ligne de temps
        for (const pc of s.pics || []) {
            const t0 = Number(pc.t) || 0, d = Math.max(.5, Number(pc.dur) || 3) / durOf(s); if (p < t0 || p > t0 + d) continue;
            const im = st.pics.get(mid(pc.media)); if (!im) continue;
            const k = Math.min(1, (p - t0) / (d * .15), (t0 + d - p) / (d * .15)), sz = clamp(Number(pc.size) || .28, .1, .9), w = Math.min(W, H) * sz * 1.3, h = w * im.height / im.width, m = Math.min(W, H) * .04;
            const pos = pc.pos || 'tr', x = pos.includes('l') ? m : pos === 'center' ? (W - w) / 2 : W - w - m, y = pos.includes('b') ? H - h - m - H * .1 : pos === 'center' ? (H - h) / 2 : m + H * .08;
            g.globalAlpha = clamp(k, 0, 1); g.fillStyle = '#fff'; g.fillRect(x - 6, y - 6, w + 12, h + 12); g.drawImage(im, x, y, w, h); g.globalAlpha = 1;
        }
        // titre, grande année, légende des couleurs, légendes de texte
        const light = isLight(s); // un fond clair (graphiques, carte) : textes sombres ; un fond sombre : textes clairs
        if (s.showTitle !== false && s.title && s.type !== 'title') { // le titre dans un cartouche, lisible sur tous les fonds
            const sz = Math.round(H * (Number(ov.titleSize) || .042)); g.font = `700 ${sz}px ${font}`; const tw = Math.min(W * .62, g.measureText(s.title).width);
            if (ov.titleBox !== false) { g.fillStyle = light ? 'rgba(255,255,255,.82)' : 'rgba(0,0,0,.5)'; g.fillRect(W * .03 - sz * .4, H * .075 - sz * 1.05, tw + sz * .8, sz * 1.45); }
            text(g, s.title, W * .03, H * .075, {size: sz, weight: 700, color: ov.titleColor || (light ? '#141414' : '#ffffff'), font, max: W * .62});
        }
        if (Number.isFinite(year) && ov.year !== 'off') {
            const pos = ov.year || 'tr', sz = Math.round(H * .11 * (Number(ov.yearSize) || 1));
            text(g, String(Math.floor(year + 1e-6)), pos.includes('l') ? W * .03 : W * .97, pos.includes('b') ? H * .95 : H * .03 + sz * .85, {size: sz, weight: 800, color: ov.yearColor || (light ? 'rgba(20,20,20,.32)' : 'rgba(255,255,255,.9)'), align: pos.includes('l') ? 'left' : 'right', font, shadow: !light});
        }
        if (legend.length && ov.legend !== 'off') drawLegend(g, legend, W, H, font, ov.legend || 'br');
        const caps = [...(s.captions || []).map(c => ({...c})), ...((st.caps || []).filter(c => !(s.hiddenAuto || []).includes(c.text)))];
        const cur = caps.map(c => { const start = Number.isFinite(c.year) && Number.isFinite(year) ? null : Number(c.t) || 0; return {c, start}; })
            .find(({c, start}) => { if (start === null) { const yd = (Number(c.dur) || 3.5) / durOf(s) * ((R.to - R.from) || 1); return year >= c.year && year < c.year + yd; } const d = (Number(c.dur) || 3.5) / durOf(s); return p >= start && p < start + d; });
        if (cur && ov.caption !== 'off') drawCaption(g, cur.c.text, W, H, font, ov);
        else if (epochCap && ov.caption !== 'off') drawCaption(g, epochCap, W, H, font, ov); // 🏠 l'époque montrée (sa date, son nom)
        return {year};
    }
    const lum = hex => { const m = /^#([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return 1; const n = parseInt(m[1], 16); return ((n >> 16) * .299 + ((n >> 8) & 255) * .587 + (n & 255) * .114) / 255; };
    const isLight = s => (s.type === 'migrations' ? !['sepia'].includes(s.tone) && (Number(s.dim ?? .18) > .05 || s.basemap !== 'dark') : s.type === 'image' ? false : lum(s.bg || '#ffffff') > .55);
    function drawTitle(g, s, p, W, H, font) {
        g.fillStyle = s.bg || '#141414'; g.fillRect(0, 0, W, H);
        const k = easing.out(clamp(p * 4, 0, 1)), col = s.color || '#ffffff', al = s.align || 'center', x = al === 'left' ? W * .08 : W / 2;
        g.globalAlpha = k;
        const size = Math.round(H * .085 * (Number(s.size) || 1));
        g.font = `800 ${size}px ${font}`; const lines = wrap(g, s.title || T('Titre'), W * .84);
        lines.forEach((l, i) => text(g, l, x, H * .46 + (i - (lines.length - 1) / 2) * size * 1.15 - size * .1 * (1 - k) * 10, {size, weight: 800, color: col, align: al === 'left' ? 'left' : 'center', font}));
        if (s.subtitle) text(g, s.subtitle, x, H * .46 + lines.length * size * .6 + size * .6, {size: Math.round(size * .42), weight: 500, color: col, align: al === 'left' ? 'left' : 'center', font, max: W * .84});
        g.globalAlpha = 1;
    }
    function drawImage(g, s, st, p, W, H) {
        const im = st.img; if (!im) { text(g, T('Image introuvable'), W / 2, H / 2, {size: H * .04, align: 'center', font: FONT.system}); return; }
        const c = camAt({mode: 'kenburns', z0: Number(s.z0) || 1, z1: Number(s.z1) || 1.15, x0: s.x0, x1: s.x1, y0: s.y0, y1: s.y1}, p);
        const fit = s.fit === 'contain' ? Math.min(W / im.width, H / im.height) : Math.max(W / im.width, H / im.height), w = im.width * fit, h = im.height * fit;
        g.save(); g.translate(W / 2, H / 2); g.scale(c.z, c.z); g.translate(-W / 2 + (.5 - c.x) * W * .4, -H / 2 + (.5 - c.y) * H * .4); g.drawImage(im, (W - w) / 2, (H - h) / 2, w, h); g.restore();
        if (s.text) drawCaption(g, s.text, W, H, FONT.system, {});
    }
    async function drawDiagram(g, s, st, p, year, W, H, proj) {
        g.fillStyle = s.bg || '#ffffff'; g.fillRect(0, 0, W, H);
        if (!st.ok) { text(g, T('Diagramme introuvable'), W / 2, H / 2, {size: H * .04, align: 'center', color: '#333', font: fontOf(proj)}); return; }
        const pad = Math.round(Math.min(W, H) * .05), top = s.title && s.showTitle !== false ? H * .11 : pad;
        const draw = async (y, alpha) => {
            const r = await diagramRaster(s, st, y); if (!r) return;
            const k = Math.min((W - pad * 2) / r.w, (H - top - pad) / r.h), w = r.w * k, h = r.h * k, x = (W - w) / 2, yy = top + (H - top - pad - h) / 2;
            const c = camAt(s.cam, p), [sx, sy, sw, sh] = camRect(c, r.w, r.h);
            g.globalAlpha = alpha; g.drawImage(r.img, sx, sy, sw, sh, x, yy, w, h); g.globalAlpha = 1;
        };
        if (!st.time) return draw(0, 1);
        const ys = st.time.years, i = ys.reduce((b, y, j) => (y <= year + 1e-9 ? j : b), 0);
        await draw(ys[i], 1);
        if (s.smooth !== false && i < ys.length - 1) { const k = (year - ys[i]) / ((ys[i + 1] - ys[i]) || 1); if (k > .02) await draw(ys[i + 1], easing.smooth(clamp(k, 0, 1))); }
    }
    function drawMigrations(g, s, st, p, year, W, H, font) {
        if (st.empty) { g.fillStyle = '#dfe6ea'; g.fillRect(0, 0, W, H); text(g, T('Pas assez d’événements datés et placés sur la carte.'), W / 2, H / 2, {size: H * .035, align: 'center', color: '#333', font}); return []; }
        const cam = camAt(s.cam || {mode: 'follow'}, p, (s.cam?.mode || 'follow') === 'follow' ? st.auto : null), [sx, sy, sw, sh] = camRect(cam, st.BW, st.BH);
        g.drawImage(st.bg, sx, sy, sw, sh, 0, 0, W, H);
        const toScr = pl => { const v = st.xy(pl); return [(v[0] * st.BW - sx) / sw * W, (v[1] * st.BH - sy) / sh * H]; };
        const life = Math.max(1, Number(s.life) || 25), dot = Math.max(1, Number(s.dot) || 6) * H / 720 * Math.sqrt(cam.z), D = st.D;
        // les chemins (une personne qui change de lieu)
        if (s.trails !== false) {
            g.lineCap = 'round';
            st.paths.forEach((evs, pid) => {
                const p0 = D.byId.get(pid);
                for (let i = 1; i < evs.length; i++) {
                    const a = evs[i - 1], b = evs[i]; if (a[3] === b[3] || b[1] > year + 1) continue;
                    const age = year - b[1], keepTrail = s.trailStay ? 1 : clamp(1 - age / (life * 1.5), 0, 1); if (keepTrail <= 0) continue;
                    const [x0, y0] = toScr(a[3]), [x1, y1] = toScr(b[3]), grow = b[1] > year ? clamp(1 - (b[1] - year), 0, 1) : 1;
                    g.strokeStyle = st.colOf(keyFor(s, p0, b)); g.globalAlpha = .55 * keepTrail; g.lineWidth = Math.max(1, dot * .35);
                    const mx = (x0 + x1) / 2 - (y1 - y0) * .15, my = (y0 + y1) / 2 + (x1 - x0) * .15;
                    g.beginPath(); g.moveTo(x0, y0);
                    if (grow >= 1) g.quadraticCurveTo(mx, my, x1, y1); else { const tx = lerp(lerp(x0, mx, grow), lerp(mx, x1, grow), grow), ty = lerp(lerp(y0, my, grow), lerp(my, y1, grow), grow); g.quadraticCurveTo(lerp(x0, mx, grow), lerp(y0, my, grow), tx, ty); }
                    g.stroke();
                }
            });
            g.globalAlpha = 1;
        }
        // les points : un événement apparaît à son année, puis s'efface doucement
        const shown = new Map();
        st.evs.forEach(e => {
            const age = year - e[1]; if (age < 0 || (s.fadeDead !== false && age > life)) return;
            const a = s.fadeDead === false ? 1 : clamp(1 - age / life, 0, 1) ** .7, born = clamp(1 - age, 0, 1);
            const [x, y] = toScr(e[3]); if (x < -20 || y < -20 || x > W + 20 || y > H + 20) return;
            const p0 = D.byId.get(e[0]), col = st.colOf(keyFor(s, p0, e));
            g.globalAlpha = .25 + .75 * a; g.fillStyle = col;
            const r = dot * (1 + born * 1.4);
            g.beginPath(); if (s.shape === 'square') g.rect(x - r, y - r, r * 2, r * 2); else g.arc(x, y, r, 0, Math.PI * 2); g.fill();
            if (born > 0) { g.globalAlpha = born * .6; g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.arc(x, y, r * 2.4, 0, Math.PI * 2); g.stroke(); }
            if (s.labels !== 'off' && age < 2) shown.set(e[3], [x, y]);
        });
        g.globalAlpha = 1;
        if (s.labels !== 'off') shown.forEach(([x, y], pl) => text(g, st.D.places[pl]?.[0] || '', x + dot * 2, y - dot * 1.5, {size: Math.round(H * .024), weight: 600, color: '#1b1b1b', font}));
        return st.keys.map(k => [st.colOf(k), k]).concat(st.keys.length >= (Number(s.maxKeys) || 8) && (s.colorBy || 'surname') === 'surname' ? [[s.otherColor || '#8a8f99', T('les autres')]] : []);
    }
    function drawLegend(g, items, W, H, font, pos) {
        const size = Math.round(H * .022), lh = size * 1.55, pad = size * .7;
        g.font = `600 ${size}px ${font}`;
        const w = Math.max(...items.map(([, l]) => g.measureText(l).width)) + size * 1.6 + pad * 2, h = items.length * lh + pad * 1.2;
        const x = pos.includes('l') ? W * .02 : W * .98 - w, y = pos.includes('t') ? H * .14 : H * .97 - h;
        g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(x, y, w, h);
        items.forEach(([c, l], i) => { g.fillStyle = c; g.beginPath(); g.arc(x + pad + size * .45, y + pad + i * lh + size * .55, size * .42, 0, Math.PI * 2); g.fill(); text(g, l, x + pad + size * 1.2, y + pad + i * lh + size * .9, {size, weight: 600, color: '#111', font}); });
    }
    function drawCaption(g, s, W, H, font, ov) {
        const size = Math.round(H * .032 * (Number(ov.captionSize) || 1)); g.font = `600 ${size}px ${font}`;
        const lines = wrap(g, s, W * .7), w = Math.max(...lines.map(l => g.measureText(l).width)) + size * 1.4, h = lines.length * size * 1.3 + size * .7;
        const style = ov.captionStyle || 'dark', top = ov.caption === 'top', x = W * .03, y = top ? H * .12 : H * .96 - h;
        if (style === 'band') { g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, y, W, h); } else { g.fillStyle = style === 'light' ? 'rgba(255,255,255,.92)' : 'rgba(0,0,0,.66)'; g.fillRect(x, y, w, h); }
        lines.forEach((l, i) => text(g, l, x + size * .7, y + size * .35 + (i + 1) * size * 1.3 - size * .3, {size, weight: 600, color: style === 'light' ? '#111' : '#fff', font}));
    }
    function chartBox(W, H, s) { const top = s.title && s.showTitle !== false ? H * .14 : H * .08; return {x: W * .06, y: top, w: W * .88, h: H * .92 - top}; }
    function drawRace(g, s, st, year, W, H, font, proj) {
        g.fillStyle = s.bg || '#ffffff'; g.fillRect(0, 0, W, H);
        const R = st.R; if (!R) { text(g, T('Pas assez de personnes avec une année de naissance.'), W / 2, H / 2, {size: H * .035, align: 'center', color: '#333', font}); return []; }
        const y0 = Math.floor(year), k = year - y0, a = R.table.get(clamp(y0, Math.floor(R.from), Math.ceil(R.to))) || new Map(), b = R.table.get(clamp(y0 + 1, Math.floor(R.from), Math.ceil(R.to))) || a;
        const vals = R.keys.map(key => ({key, v: lerp(a.get(key) || 0, b.get(key) || 0, k), ra: 0, rb: 0}));
        const rank = (m, key) => { const arr = R.keys.map(x => [x, m.get(x) || 0]).sort((p, q) => q[1] - p[1] || p[0].localeCompare(q[0])); return arr.findIndex(x => x[0] === key); };
        vals.forEach(o => { o.r = lerp(rank(a, o.key), rank(b, o.key), easing.smooth(k)); });
        const shown = vals.filter(o => o.r < R.top + .5 && o.v > 0), box = chartBox(W, H, s), bh = box.h / R.top;
        const max = s.fixedScale ? R.max : Math.max(1, ...shown.map(o => o.v)) * 1.08;
        shown.forEach(o => {
            const i = R.keys.indexOf(o.key), col = colorFor(s, o.key, i), y = box.y + o.r * bh, w = Math.max(2, (box.w * .78) * o.v / max);
            g.globalAlpha = clamp(R.top + .5 - o.r, 0, 1); g.fillStyle = col; g.fillRect(box.x + box.w * .2, y + bh * .12, w, bh * .76);
            text(g, o.key, box.x + box.w * .19, y + bh * .62, {size: Math.round(Math.min(bh * .42, H * .035)), weight: 700, color: '#1b1b1b', align: 'right', font, max: box.w * .19});
            text(g, String(Math.round(o.v)), box.x + box.w * .2 + w + 8, y + bh * .62, {size: Math.round(Math.min(bh * .36, H * .03)), weight: 600, color: '#555', font});
            g.globalAlpha = 1;
        });
        return [];
    }
    function drawPyramid(g, s, st, year, W, H, font) {
        g.fillStyle = s.bg || '#ffffff'; g.fillRect(0, 0, W, H);
        const P = st.P; if (!P) { text(g, T('Pas assez de personnes avec une année de naissance.'), W / 2, H / 2, {size: H * .035, align: 'center', color: '#333', font}); return; }
        const y0 = clamp(Math.floor(year), Math.floor(P.from), Math.ceil(P.to)), k = year - Math.floor(year), a = P.table.get(y0), b = P.table.get(Math.min(y0 + 1, Math.ceil(P.to))) || a;
        const box = chartBox(W, H, s), mid = box.x + box.w / 2, bh = box.h / P.bands, half = box.w * .42, max = s.fixedScale === false ? Math.max(1, ...a.m, ...a.f) : P.max;
        const cm = s.colors?.m || '#2a6a9a', cf = s.colors?.f || '#c0392b';
        for (let i = 0; i < P.bands; i++) {
            const y = box.y + box.h - (i + 1) * bh, m = lerp(a.m[i], b.m[i], k), f = lerp(a.f[i], b.f[i], k);
            g.fillStyle = cm; g.fillRect(mid - half * m / max - 2, y + bh * .1, half * m / max, bh * .8);
            g.fillStyle = cf; g.fillRect(mid + 2, y + bh * .1, half * f / max, bh * .8);
            if (i % Math.max(1, Math.round(10 / P.step)) === 0) text(g, String(i * P.step), box.x, y + bh * .75, {size: Math.round(Math.min(bh * .8, H * .022)), weight: 500, color: '#666', font});
        }
        text(g, T('Hommes'), mid - half / 2, box.y - H * .01, {size: Math.round(H * .028), weight: 700, color: cm, align: 'center', font});
        text(g, T('Femmes'), mid + half / 2, box.y - H * .01, {size: Math.round(H * .028), weight: 700, color: cf, align: 'center', font});
    }
    function drawLine(g, s, st, year, W, H, font) {
        g.fillStyle = s.bg || '#ffffff'; g.fillRect(0, 0, W, H);
        const L = st.L; if (!L) { text(g, T('Pas assez de données pour cette courbe.'), W / 2, H / 2, {size: H * .035, align: 'center', color: '#333', font}); return; }
        const box = chartBox(W, H, s), X = x => box.x + (x - L.from) / ((L.to - L.from) || 1) * box.w, Y = v => box.y + box.h - v / (L.max * 1.08) * box.h;
        g.strokeStyle = '#e4e6ea'; g.lineWidth = 1; for (let i = 0; i <= 4; i++) { const v = L.max * 1.08 * i / 4; g.beginPath(); g.moveTo(box.x, Y(v)); g.lineTo(box.x + box.w, Y(v)); g.stroke(); text(g, String(Math.round(v)), box.x - 6, Y(v) + 4, {size: Math.round(H * .02), weight: 500, color: '#888', align: 'right', font}); }
        const step = L.per === 'decade' ? 10 : 1, col = s.color || '#2a6a9a';
        const pts = L.pts.filter(([x, v]) => x <= year && Number.isFinite(v)); if (!pts.length) return;
        const nx = L.pts.find(([x]) => x > year), last = pts[pts.length - 1];
        if (nx && Number.isFinite(nx[1])) { const k = (year - last[0]) / step; pts.push([year, lerp(last[1], nx[1], clamp(k, 0, 1))]); }
        g.beginPath(); pts.forEach(([x, v], i) => (i ? g.lineTo(X(x), Y(v)) : g.moveTo(X(x), Y(v))));
        if (s.fill !== false) { g.save(); g.lineTo(X(pts[pts.length - 1][0]), Y(0)); g.lineTo(X(pts[0][0]), Y(0)); g.closePath(); g.fillStyle = col; g.globalAlpha = .15; g.fill(); g.restore(); g.beginPath(); pts.forEach(([x, v], i) => (i ? g.lineTo(X(x), Y(v)) : g.moveTo(X(x), Y(v)))); }
        g.strokeStyle = col; g.lineWidth = Math.max(2, H / 260); g.lineJoin = 'round'; g.stroke();
        const [lx, lv] = pts[pts.length - 1]; g.fillStyle = col; g.beginPath(); g.arc(X(lx), Y(lv), H / 140, 0, Math.PI * 2); g.fill();
        text(g, (L.what === 'agedeath' ? lv.toFixed(1) : String(Math.round(lv))), X(lx) + 10, Y(lv) - 10, {size: Math.round(H * .03), weight: 700, color: col, font});
        for (let x = Math.ceil(L.from / 50) * 50; x <= L.to; x += 50) text(g, String(x), X(x), box.y + box.h + H * .035, {size: Math.round(H * .02), weight: 500, color: '#888', align: 'center', font});
    }
    function drawTree(g, s, st, p, W, H, font) {
        g.fillStyle = s.bg || '#ffffff'; g.fillRect(0, 0, W, H);
        const F = st.F; if (!F || !F.items.length) { text(g, T('Choisis la personne de départ de l’arbre.'), W / 2, H / 2, {size: H * .035, align: 'center', color: '#333', font}); return; }
        const cx = W / 2, cy = H * .9, R0 = Math.min(W * .47, H * .82), ring = R0 / (F.gens + .3), grown = p * (F.gens + .5);
        F.items.forEach(({sosa, g: gen, p: per}) => {
            const k = clamp(grown - gen, 0, 1); if (k <= 0) return;
            const n = 2 ** gen, idx = sosa - n, a0 = Math.PI + Math.PI * idx / n, a1 = Math.PI + Math.PI * (idx + 1) / n, r0 = gen ? ring * (gen + .3) : 0, r1 = ring * (gen + 1.3);
            const by = s.colorBy || 'branch', col = by === 'one' ? (s.color || '#c9b48a') : by === 'gen' ? `hsl(${(gen * 47) % 360} 45% ${78 - gen * 3}%)` : gen === 0 ? '#e8e2cc' : (sosa >> (gen - 1)) === 2 ? `hsl(210 45% ${80 - gen * 4}%)` : `hsl(355 45% ${82 - gen * 4}%)`;
            g.globalAlpha = k; g.fillStyle = col; g.strokeStyle = '#fff'; g.lineWidth = 2;
            g.beginPath(); if (gen === 0) g.arc(cx, cy, r1, Math.PI, 2 * Math.PI); else { g.arc(cx, cy, r1, a0, a1); g.arc(cx, cy, r0, a1, a0, true); } g.closePath(); g.fill(); g.stroke();
            if (s.names !== false && gen <= 6) {
                const am = (a0 + a1) / 2, rm = gen === 0 ? r1 * .45 : (r0 + r1) / 2, size = Math.max(9, Math.min(ring * .26, H * .028) * (gen > 4 ? .8 : 1));
                g.save(); g.translate(cx + Math.cos(am) * rm, cy + Math.sin(am) * rm); if (gen > 0) g.rotate(gen > 3 ? am : am + Math.PI / 2);
                text(g, gen > 3 ? firstOf(per) : (gen ? fullName(per) : fullName(per)), 0, size * .35, {size, weight: 600, color: '#1b1b1b', align: 'center', font, max: gen > 3 ? ring * .95 : (r1 - r0) * 3});
                g.restore();
            }
            g.globalAlpha = 1;
        });
    }

    ext.animRender = {mapYears, houseAt, epochLabel, epochYear, FORMATS, sizeOf, scenesAt, totalDur, durOf, yearAt, makeWarp, camAt, camRect, prepare, drawFrame, autoCaptions, raceData, pyramidData, lineData, fanData, easing, loadPeople, indexPeople, PALETTE, FONT, range, clearCache: (all = true) => { cache.clear(); if (all) { people = null; bgCache.clear(); tileCache.clear(); } }};
    if (typeof module === 'object' && module.exports) module.exports = ext.animRender;
})();
