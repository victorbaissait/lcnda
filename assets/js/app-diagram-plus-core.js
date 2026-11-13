/* LCNDA — 📊 Douze diagrammes de plus : les calculs (sans écran). Aussi chargé par Node pour les tests :
 * require('…/app-diagram-plus-core.js'). Le dessin est dans heritage-diagram-plus.js.
 *
 *  - kinPath(graphe, a, b, {alliances}) : le plus court chemin de parenté (on monte vers un ancêtre, on redescend ;
 *    les alliances ⚭ coûtent plus cher, un « enfant en commun » aussi), étape par étape ;
 *  - kinWord(i, j, sexe, demi) : le nom du lien (« cousin issu de germains », « oncle à la mode de Bretagne »…), mêmes mots
 *    que la question « Quel lien ? » (lib/question_more.php) ;
 *  - kinSentence(étapes, sexes, noms) : « Jean est le cousin germain de l’épouse de Paul » ;
 *  - kinAll(graphe, a, b) : tous les liens de sang (implexe : doubles cousins…), un par ancêtre commun le plus proche ;
 *  - completeness(numéros Sosa, générations) : ancêtres connus par génération (2^n possibles) ;
 *  - gravity(points) : le centre de gravité de chaque génération (moyenne sur la sphère) et l'écart moyen en km ;
 *  - leeds(correspondances, {lo, hi, max}) : la méthode de Leeds (groupes de couleur des grands-parents) et l'ordre de la matrice ;
 *  - aliveByYear(personnes, de, à) : combien étaient en vie chaque année (décès inconnu d'une naissance ancienne : 60 ans après).
 */
(function (root) {
    'use strict';
    const clamp = (v, a, b) => Math.max(a, Math.min(b, Number.isFinite(v) ? v : a));
    const ID = v => { const n = Math.floor(Number(v)); return n > 0 && n < 1e12 ? n : 0; };

    /* ═════ Le graphe : {id: {p: [parents], sp: [conjoints], s: 'h'|'f'|''}} ═════ */
    function normGraph(g) {
        const nodes = new Map();
        const src = g && typeof g === 'object' ? (g.nodes && typeof g.nodes === 'object' ? g.nodes : g) : {};
        for (const [k, v] of Object.entries(src)) { const id = ID(k); if (!id || !v || typeof v !== 'object') continue; nodes.set(id, {id, p: (Array.isArray(v.p) ? v.p : []).map(ID).filter(x => x && x !== id).slice(0, 4), sp: (Array.isArray(v.sp) ? v.sp : []).map(ID).filter(x => x && x !== id).slice(0, 30), s: v.s === 'h' || v.s === 'f' ? v.s : ''}); }
        const kids = new Map(), spouses = new Map();
        for (const n of nodes.values()) {
            for (const p of n.p) { if (!nodes.has(p)) continue; if (!kids.has(p)) kids.set(p, []); kids.get(p).push(n.id); }
            for (const s of n.sp) { if (!nodes.has(s)) continue; if (!spouses.has(n.id)) spouses.set(n.id, new Set()); if (!spouses.has(s)) spouses.set(s, new Set()); spouses.get(n.id).add(s); spouses.get(s).add(n.id); }
        }
        return {nodes, kids, spouses};
    }

    /** une petite file à priorité (tas binaire) */
    function heap() {
        const a = [];
        const up = i => { while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } };
        const down = i => { for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } };
        return {push: x => { a.push(x); up(a.length - 1); }, pop: () => { const t = a[0], e = a.pop(); if (a.length) { a[0] = e; down(0); } return t; }, get size() { return a.length; }};
    }

    const COST = {u: 1, d: 1, s: 3, pivot: 4};
    /**
     * Le plus court chemin de a à b. Pas : 'u' (la personne suivante est un parent), 'd' (un enfant), 's' (un conjoint).
     * Redescendre puis remonter (« un enfant en commun ») coûte plus cher (interdit sans les alliances) ; deux alliances de suite sont interdites.
     * → {path: [ids], steps: ['u'|'d'|'s'], cost} ou null
     */
    function kinPath(graph, a, b, {alliances = true, maxNodes = 400000} = {}) {
        const G = graph && graph.nodes instanceof Map ? graph : normGraph(graph);
        a = ID(a); b = ID(b);
        if (!a || !b || !G.nodes.has(a) || !G.nodes.has(b)) return null;
        if (a === b) return {path: [a], steps: [], cost: 0};
        const key = (id, d) => id + ':' + d, dist = new Map(), prev = new Map(), H = heap();
        dist.set(key(a, ''), 0); H.push([0, a, '', 0]);
        let seen = 0, best = null;
        while (H.size && seen++ < maxNodes) {
            const [c, id, last, tie] = H.pop();
            if (c !== dist.get(key(id, last))) continue;
            if (id === b) { best = key(id, last); break; }
            const n = G.nodes.get(id), next = [];
            if (alliances || last !== 'd') for (const p of n.p) if (G.nodes.has(p)) next.push([p, 'u']); // sang seulement : jamais « redescendre puis remonter » (un enfant en commun)
            for (const k of G.kids.get(id) || []) next.push([k, 'd']);
            if (alliances && last !== 's') for (const s of G.spouses.get(id) || []) next.push([s, 's']);
            next.sort((x, y) => x[0] - y[0]);
            for (const [to, d] of next) {
                const nc = c + COST[d] + (last === 'd' && d === 'u' ? COST.pivot : 0), k = key(to, d);
                if (nc < (dist.get(k) ?? Infinity)) { dist.set(k, nc); prev.set(k, key(id, last)); H.push([nc, to, d, tie + 1]); }
            }
        }
        if (!best) return null;
        const path = [], steps = [];
        for (let k = best; k; k = prev.get(k)) { const [id, d] = k.split(':'); path.push(Number(id)); if (d) steps.push(d); }
        path.reverse(); steps.reverse();
        return {path, steps, cost: dist.get(best)};
    }

    /* ═════ Les mots (comme lib/question_more.php : qm_kin_label) ═════ */
    const great = (n, base) => 'arrière-'.repeat(Math.max(0, n)) + base;
    /** ce que X est pour Z quand X est à i générations de l'ancêtre commun et Z à j (sans article) */
    function kinWord1(i, j, f, half) {
        const e = f ? 'e' : '', demi = half ? 'demi-' : '';
        if (i === 0 && j === 0) return f ? 'elle-même' : 'lui-même';
        if (i === 0) return j === 1 ? (f ? 'mère' : 'père') : great(j - 2, f ? 'grand-mère' : 'grand-père');
        if (j === 0) return i === 1 ? (f ? 'fille' : 'fils') : great(i - 2, f ? 'petite-fille' : 'petit-fils');
        if (i === 1 && j === 1) return demi + (f ? 'sœur' : 'frère');
        if (i === 1) return demi + (j === 2 ? (f ? 'tante' : 'oncle') : great(j - 3, f ? 'grand-tante' : 'grand-oncle'));
        if (j === 1) return demi + (i === 2 ? (f ? 'nièce' : 'neveu') : great(i - 3, f ? 'petite-nièce' : 'petit-neveu'));
        const deg = Math.min(i, j) - 1, cous = f ? 'cousine' : 'cousin';
        const name = deg === 1 ? `${cous} germain${e}` : deg === 2 ? `${cous} issu${e} de germains` : deg === 3 ? `${cous} issu${e} d’issus de germains` : `${cous} au ${deg + 1}e degré`;
        if (i === j) return demi + name;
        if (deg === 1 && Math.abs(i - j) === 1) return i > j ? (f ? 'nièce à la mode de Bretagne' : 'neveu à la mode de Bretagne') : (f ? 'tante à la mode de Bretagne' : 'oncle à la mode de Bretagne');
        const d = Math.abs(i - j);
        return `${demi}${name} avec ${d} génération${d > 1 ? 's' : ''} d’écart`;
    }
    /** sexe inconnu : les deux mots (« oncle ou tante ») */
    function kinWord(i, j, sex, half = false) {
        i = clamp(Math.round(i), 0, 200); j = clamp(Math.round(j), 0, 200);
        if (sex === 'h' || sex === 'f') return kinWord1(i, j, sex === 'f', half);
        const m = kinWord1(i, j, false, half), w = kinWord1(i, j, true, half);
        return m === w ? m : `${m} ou ${w}`;
    }
    const VOWEL = /^[aeiouyéèêâîôûœh]/i;
    const art = (w, sex) => (VOWEL.test(w) ? 'l’' : sex === 'f' ? 'la ' : 'le ') + w;
    const de = (w, sex) => (VOWEL.test(w) ? 'de l’' : sex === 'f' ? 'de la ' : 'du ') + w;
    const SPOUSE = s => (s === 'f' ? 'épouse' : s === 'h' ? 'époux' : 'conjoint');
    const STEP_WORD = {u: s => (s === 'f' ? 'mère' : s === 'h' ? 'père' : 'parent'), d: s => (s === 'f' ? 'fille' : s === 'h' ? 'fils' : 'enfant'), s: SPOUSE};

    /** les morceaux d'un chemin : chaque morceau monte (i) puis descend (j) ; une alliance ou « redescendre puis remonter » coupe */
    function segments(steps) {
        const out = []; let cur = {from: 0, i: 0, j: 0};
        steps.forEach((d, k) => {
            if (d === 's') { cur.to = k; out.push(cur); out.push({spouse: true, from: k, to: k + 1}); cur = {from: k + 1, i: 0, j: 0}; return; }
            if (d === 'u' && cur.j > 0) { cur.to = k; out.push(cur); cur = {from: k, i: 0, j: 0}; }
            if (d === 'u') cur.i++; else cur.j++;
        });
        cur.to = steps.length; out.push(cur);
        return out;
    }
    /** les mots du chemin, de X vers Y : [{word, sex}] (sexe de la personne de gauche de chaque lien) */
    function kinWords(steps, sexes, {halfAt} = {}) {
        const words = [];
        for (const sg of segments(steps)) {
            const sx = sexes[sg.from] || '';
            if (sg.spouse) { words.push({w: SPOUSE(sx), s: sx, spouse: true, k: sg.to}); continue; }
            if (!sg.i && !sg.j) continue;
            words.push({w: kinWord(sg.i, sg.j, sx, !!(halfAt && halfAt(sg))), s: sx, i: sg.i, j: sg.j, k: sg.to});
        }
        // les alliances qui ont un nom (beau-père, gendre, belle-sœur…)
        const BEAU = {père: ['beau-père', 'h'], mère: ['belle-mère', 'f'], fils: ['beau-fils', 'h'], fille: ['belle-fille', 'f'], frère: ['beau-frère', 'h'], sœur: ['belle-sœur', 'f']};
        const out = [];
        for (let k = 0; k < words.length; k++) {
            const a = words[k], b = words[k + 1];
            if (b && b.spouse && !a.spouse && BEAU[a.w]) { out.push({w: BEAU[a.w][0], s: a.s}); k++; continue; } // X est le père du conjoint de Y → beau-père
            if (b && a.spouse && !b.spouse) {
                const map = {fils: a.s === 'f' ? 'belle-fille' : a.s === 'h' ? 'gendre' : 'conjoint de l’enfant', fille: a.s === 'f' ? 'belle-fille' : a.s === 'h' ? 'gendre' : 'conjoint de l’enfant', frère: a.s === 'f' ? 'belle-sœur' : 'beau-frère', sœur: a.s === 'f' ? 'belle-sœur' : 'beau-frère', père: a.s === 'f' ? 'belle-mère' : 'beau-père', mère: a.s === 'f' ? 'belle-mère' : 'beau-père'};
                if (map[b.w] && (a.s || !['fils', 'fille'].includes(b.w))) { out.push({w: map[b.w], s: a.s}); k++; continue; } // X est l'époux de la fille de Y → gendre
            }
            out.push(a);
        }
        return out;
    }
    /** « Jean est le cousin germain de l’épouse de Paul. » */
    function kinSentence(steps, sexes, names, opts = {}) {
        const nx = String(names?.[0] || 'La première personne'), ny = String(names?.[names.length - 1] || 'la seconde');
        if (!steps.length) return `${nx} et ${ny} : c’est la même personne.`;
        const w = kinWords(steps, sexes, opts);
        if (!w.length) return `${nx} et ${ny} : c’est la même personne.`;
        let s = `${nx} est ${art(w[0].w, w[0].s)}`;
        for (let k = 1; k < w.length; k++) s += ' ' + de(w[k].w, w[k].s);
        return s + ` de ${ny}.`;
    }
    /** ce que la personne k est pour la précédente (« son père », « sa fille », « son époux ») */
    const stepLabel = (d, sex) => { const w = (STEP_WORD[d] || STEP_WORD.u)(sex); return (VOWEL.test(w) ? 'son ' : sex === 'f' ? 'sa ' : 'son ') + w; };

    /** les ancêtres et leur distance (la plus courte) */
    function ancestorsOf(G, id, max = 60) {
        const out = new Map([[id, 0]]); let level = [id];
        for (let g = 1; g <= max && level.length; g++) { const next = []; for (const x of level) for (const p of G.nodes.get(x)?.p || []) { if (!out.has(p) && G.nodes.has(p)) { out.set(p, g); next.push(p); } } level = next; }
        return out;
    }
    /**
     * Tous les liens de sang (implexe) : un par ancêtre commun « le plus proche » de sa branche, regroupés par (i, j).
     * → [{i, j, word, half, via: [ids]}], le plus proche d'abord
     */
    function kinAll(graph, a, b, sexA = '') {
        const G = graph && graph.nodes instanceof Map ? graph : normGraph(graph);
        a = ID(a); b = ID(b); if (!G.nodes.has(a) || !G.nodes.has(b) || a === b) return [];
        const A = ancestorsOf(G, a), B = ancestorsOf(G, b), common = [...A.keys()].filter(x => B.has(x));
        // un lien « vrai » passe par deux enfants différents de l'ancêtre commun (un vers chacun) ; sinon ce n'est qu'un prolongement
        // d'un lien plus proche. L'implexe donne ainsi plusieurs liens (petite-fille par son père, petite-nièce par sa mère…).
        const groups = new Map();
        for (const x of common) {
            let i, j;
            if (x === a || x === b) { i = A.get(x); j = B.get(x); }
            else {
                let best = null;
                const kids = (G.kids.get(x) || []).filter(c => A.has(c) || B.has(c));
                for (const ca of kids) { if (!A.has(ca)) continue; for (const cb of kids) { if (cb === ca || !B.has(cb)) continue; const s = A.get(ca) + B.get(cb); if (!best || s < best[0]) best = [s, A.get(ca) + 1, B.get(cb) + 1]; } }
                if (!best) continue;
                [, i, j] = best;
            }
            const k = i + ':' + j; if (!groups.has(k)) groups.set(k, {i, j, via: []}); groups.get(k).via.push(x);
        }
        const list = [...groups.values()].sort((p, q) => (p.i + p.j) - (q.i + q.j) || p.i - q.i);
        list.forEach(g => {
            // « demi » : un seul ancêtre commun, dont un conjoint connu n'est pas ancêtre des deux
            g.half = g.via.length === 1 && g.i > 0 && g.j > 0 && [...(G.spouses.get(g.via[0]) || [])].some(s => !(A.has(s) && B.has(s)));
            g.word = kinWord(g.i, g.j, sexA, g.half);
        });
        return list;
    }

    /* ═════ Complétude ═════ */
    /** numéros Sosa connus → [{gen, theo, found, pct}] ; génération 1 = la personne (Sosa 1) */
    function completeness(sosas, gens = 10) {
        gens = clamp(Math.round(gens), 1, 40);
        const found = new Array(gens + 1).fill(0), seen = new Set();
        for (const v of Array.isArray(sosas) ? sosas : []) {
            const n = Math.floor(Number(v)); if (!(n >= 1) || !Number.isSafeInteger(n) || seen.has(n)) continue; seen.add(n);
            const g = Math.floor(Math.log2(n)) + 1; if (g <= gens) found[g]++;
        }
        const out = [];
        for (let g = 1; g <= gens; g++) { const theo = 2 ** (g - 1); out.push({gen: g, theo, found: Math.min(theo, found[g]), pct: Math.min(100, found[g] / theo * 100)}); }
        return out;
    }

    /* ═════ Centre de gravité ═════ */
    const RAD = Math.PI / 180, EARTH = 6371;
    function km(la1, lo1, la2, lo2) { const a = Math.sin((la2 - la1) * RAD / 2) ** 2 + Math.cos(la1 * RAD) * Math.cos(la2 * RAD) * Math.sin((lo2 - lo1) * RAD / 2) ** 2; return 2 * EARTH * Math.asin(Math.min(1, Math.sqrt(a))); }
    /** points [{gen, lat, lon, w?}] → [{gen, lat, lon, n, spread}] (moyenne sur la sphère, écart moyen au centre en km) */
    function gravity(points) {
        const by = new Map();
        for (const p of Array.isArray(points) ? points : []) {
            const lat = Number(p?.lat), lon = Number(p?.lon), g = Math.round(Number(p?.gen)), w = Number.isFinite(Number(p?.w)) && Number(p.w) > 0 ? Number(p.w) : 1;
            if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || !Number.isFinite(g) || Math.abs(g) > 100) continue;
            if (!by.has(g)) by.set(g, []); by.get(g).push([lat, lon, w]);
        }
        return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([gen, pts]) => {
            let x = 0, y = 0, z = 0, W = 0;
            for (const [la, lo, w] of pts) { x += w * Math.cos(la * RAD) * Math.cos(lo * RAD); y += w * Math.cos(la * RAD) * Math.sin(lo * RAD); z += w * Math.sin(la * RAD); W += w; }
            x /= W; y /= W; z /= W;
            const lon = Math.atan2(y, x) / RAD, lat = Math.atan2(z, Math.hypot(x, y)) / RAD;
            const spread = pts.reduce((s, [la, lo, w]) => s + w * km(lat, lon, la, lo), 0) / W;
            return {gen, lat: Math.round(lat * 1e4) / 1e4, lon: Math.round(lon * 1e4) / 1e4, n: pts.length, spread: Math.round(spread * 10) / 10};
        });
    }

    /* ═════ Méthode de Leeds ═════ */
    /**
     * matches [{name, cm, shared: [noms] ou « a; b »}] → {pool: [index], clusters: [[index]], groupOf: Map(index → groupe), order: [index]}
     * Les correspondances de lo à hi cM (cousins de 2e et 3e degré), de la plus forte à la plus faible : chacune qui n'a pas
     * encore de couleur en ouvre une, avec ses correspondances en commun ; au plus « max » couleurs (4 = les grands-parents).
     */
    function leeds(matches, {lo = 90, hi = 400, max = 4} = {}) {
        const list = (Array.isArray(matches) ? matches : []).map((m, i) => ({i, name: String(m?.name ?? '').trim().slice(0, 120), cm: Number(String(m?.cm ?? '').replace(',', '.')) || 0,
            shared: (Array.isArray(m?.shared) ? m.shared : String(m?.shared ?? '').split(/[;\n|]/)).map(x => String(x).trim().toLowerCase()).filter(Boolean)})).filter(m => m.name);
        const byName = new Map(list.map(m => [m.name.toLowerCase(), m]));
        // les liens vont dans les deux sens (A dit B, ou B dit A)
        const link = new Map(list.map(m => [m.i, new Set()]));
        for (const m of list) for (const n of m.shared) { const o = byName.get(n); if (o && o !== m) { link.get(m.i).add(o.i); link.get(o.i).add(m.i); } }
        const pool = list.filter(m => m.cm >= lo && m.cm <= hi).sort((a, b) => b.cm - a.cm || a.name.localeCompare(b.name));
        const inPool = new Set(pool.map(m => m.i)), clusters = [], groupOf = new Map();
        max = clamp(Math.round(max), 1, 12);
        for (const m of pool) {
            if (groupOf.has(m.i) || clusters.length >= max) continue;
            const mates = [...link.get(m.i)].filter(x => inPool.has(x) && !groupOf.has(x));
            if (!mates.length) continue;
            const c = [m.i, ...mates.sort((x, y) => (list.find(z => z.i === y).cm - list.find(z => z.i === x).cm))];
            c.forEach(x => groupOf.set(x, clusters.length)); clusters.push(c);
        }
        const order = [...clusters.flat(), ...pool.map(m => m.i).filter(x => !groupOf.has(x))];
        return {list, pool: pool.map(m => m.i), clusters, groupOf, order, link, shares: (a, b) => link.get(a)?.has(b) || false};
    }

    /* ═════ Combien en vie chaque année ═════ */
    /** personnes [{b, d, living}] (années) → [{year, n}] ; décès inconnu : en vie si née il y a moins de 100 ans (ou « en vie »), sinon 60 ans après */
    function aliveByYear(people, from, to, {now = new Date().getFullYear(), guess = 60} = {}) {
        const list = [];
        for (const p of Array.isArray(people) ? people : []) {
            const b = Math.floor(Number(p?.b)); if (!Number.isFinite(b) || b < -3000 || b > 3000 || p?.b === '' || p?.b == null) continue;
            let d = p?.d === '' || p?.d == null ? NaN : Math.floor(Number(p.d));
            if (!Number.isFinite(d)) d = p?.living || b > now - 100 ? now : b + guess;
            list.push([b, Math.max(b, d)]);
        }
        if (!list.length) return [];
        from = Number.isFinite(Number(from)) && from !== '' && from != null ? Math.floor(Number(from)) : Math.min(...list.map(x => x[0]));
        to = Number.isFinite(Number(to)) && to !== '' && to != null ? Math.floor(Number(to)) : Math.min(now, Math.max(...list.map(x => x[1])));
        if (to < from) [from, to] = [to, from];
        if (to - from > 5000) to = from + 5000;
        const diff = new Map();
        for (const [b, d] of list) { if (d < from || b > to) continue; const s = Math.max(b, from), e = Math.min(d, to) + 1; diff.set(s, (diff.get(s) || 0) + 1); diff.set(e, (diff.get(e) || 0) - 1); }
        const out = []; let n = 0;
        for (let y = from; y <= to; y++) { n += diff.get(y) || 0; out.push({year: y, n}); }
        return out;
    }

    /** le jour de l'année (0–365) d'un « MM-JJ » ou « JJ/MM » ; null si on ne sait pas */
    const CUM = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
    function dayOfYear(v) {
        const t = String(v ?? '').trim(); let m, d, x;
        if ((x = t.match(/^(\d{1,2})-(\d{1,2})$/))) { m = +x[1]; d = +x[2]; }
        else if ((x = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/\d{1,4})?$/))) { d = +x[1]; m = +x[2]; }
        else if ((x = t.match(/^\d{3,4}-(\d{1,2})-(\d{1,2})/))) { m = +x[1]; d = +x[2]; }
        else return null;
        if (!(m >= 1 && m <= 12 && d >= 1 && d <= [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1])) return null;
        return CUM[m - 1] + d - 1;
    }

    const api = {normGraph, kinPath, kinWord, kinWords, kinSentence, kinAll, stepLabel, segments, completeness, gravity, km, leeds, aliveByYear, dayOfYear, art, de};
    root.LCNDA_DIAGPLUS = api;
    if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
