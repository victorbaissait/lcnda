/* LCNDA — ⚖️ Généalogiste successoral : le moteur de la dévolution, sans écran (window.LCNDA_SUCC_CORE ; aussi require() dans Node).
 *
 * Calcul INDICATIF, à faire vérifier par le notaire : Code civil en vigueur (succession ab intestat, art. 731 et suivants),
 * sans testament, sans donation, sans droit de retour (art. 738-2, 757-3), sans régime matrimonial ni biens à l'étranger.
 *  - conjoint successible = marié, non divorcé, vivant au décès (art. 732) ; ses droits passent avant les ordres
 *    (art. 757 : ¼ en propriété, ou au choix l'usufruit de tout si tous les enfants sont communs ; 757-1 : ½ avec les deux
 *    parents, ¾ avec un seul ; 757-2 : tout, sans descendant ni père ni mère) ;
 *  - 4 ordres (art. 734), le premier qui a quelqu'un exclut les suivants : 1. descendants (représentation à l'infini,
 *    art. 752) ; 2. père et mère + frères et sœurs et leurs descendants (art. 736 à 738-1, représentation art. 752-2) ;
 *    3. autres ascendants (fente art. 747-748, le plus proche dans chaque branche) ; 4. collatéraux ordinaires jusqu'au
 *    6e degré (art. 745, fente art. 749-750, pas de représentation) ;
 *  - frères et sœurs germains, consanguins et utérins : parts égales depuis la loi du 3 décembre 2001 (en vigueur le
 *    1er juillet 2002) — l'ancien partage par lignes (ancien art. 752) n'existe plus ;
 *  - partage par souche puis par tête (art. 753) ; on représente le prédécédé, le renonçant (depuis le 1er janvier 2007,
 *    art. 754) et l'indigne (art. 755) ; degrés civils (art. 741-743) ;
 *  - adoption plénière : l'adopté n'est plus de sa famille d'origine (art. 356), sauf l'enfant du conjoint ; adoption
 *    simple : il garde les deux familles (art. 364) ;
 *  - un héritier dont on ignore s'il vivait au décès : le calcul principal le compte « s'il vit », et des hypothèses
 *    sont faites avec lui mort avant (ses descendants le représentent quand c'est permis) ;
 *  - parts en fractions exactes (BigInt) qui totalisent 1.
 * Décès avant le 1er juillet 2002 : on calcule quand même selon le droit d'aujourd'hui, avec un avertissement clair.
 * Écrans : assets/js/heritage-successoral.js ; serveur : lib/successoral.php ; essais : tests/test-successoral-core.js.
 */
(function (root, factory) {
    const m = factory();
    if (typeof module === 'object' && module.exports) module.exports = m;
    if (root) root.LCNDA_SUCC_CORE = m;
})(typeof window !== 'undefined' ? window : null, () => {
    'use strict';
    const fill = (s, v) => String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m));
    const T0 = (s, v) => fill(s, v);

    /* ═════ Fractions exactes ═════ */
    const gcd = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) { [a, b] = [b, a % b]; } return a || 1n; };
    const F = (n, d = 1n) => { n = BigInt(n); d = BigInt(d); if (d < 0n) { n = -n; d = -d; } const g = gcd(n, d); return {n: n / g, d: d / g}; };
    const ZERO = F(0), ONE = F(1);
    const add = (a, b) => F(a.n * b.d + b.n * a.d, a.d * b.d);
    const sub = (a, b) => F(a.n * b.d - b.n * a.d, a.d * b.d);
    const mul = (a, b) => F(a.n * b.n, a.d * b.d);
    const div = (a, k) => F(a.n, a.d * BigInt(k));
    const isZero = a => a.n === 0n;
    const str = a => (a.d === 1n ? String(a.n) : `${a.n}/${a.d}`);
    const parse = s => { const m = String(s || '0').match(/^(-?\d+)(?:\/(\d+))?$/); return m ? F(BigInt(m[1]), BigInt(m[2] || 1)) : ZERO; };
    const pct = a => Math.round(Number(a.n * 1000000n / a.d) / 100) / 100; // 41,67 (deux décimales)
    const sumAll = list => list.reduce((s, x) => add(s, x), ZERO);

    /* ═════ Dates : « 2026-03-03 », « 1944 », « 1938-05 » ═════ */
    const dkey = d => { const m = String(d || '').match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/); return m ? [Number(m[1]), m[2] ? Number(m[2]) : null, m[3] ? Number(m[3]) : null] : null; };
    /** -1 : a avant b ; 1 : a après ; 0 : même jour ; null : on ne peut pas dire (même année, jour inconnu) */
    function cmpDate(a, b) {
        const x = dkey(a), y = dkey(b); if (!x || !y) return null;
        for (let i = 0; i < 3; i++) { if (x[i] == null || y[i] == null) return null; if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1; }
        return 0;
    }
    const dayNum = d => { const k = dkey(d); return k && k[1] && k[2] ? Date.UTC(k[0], k[1] - 1, k[2]) / 864e5 : null; };
    const yearOf = d => { const k = dkey(d); return k ? k[0] : null; };

    /* ═════ Les mots de la parenté (jusqu'au 6e degré pour les collatéraux) ═════ */
    const KIN = {
        d: {1: ['fils', 'fille'], 2: ['petit-fils', 'petite-fille'], 3: ['arrière-petit-fils', 'arrière-petite-fille'], 4: ['arrière-arrière-petit-fils', 'arrière-arrière-petite-fille']},
        a: {1: ['père', 'mère'], 2: ['grand-père', 'grand-mère'], 3: ['arrière-grand-père', 'arrière-grand-mère'], 4: ['arrière-arrière-grand-père', 'arrière-arrière-grand-mère']},
        c: {'1:2': ['neveu', 'nièce'], '1:3': ['petit-neveu', 'petite-nièce'], '1:4': ['arrière-petit-neveu', 'arrière-petite-nièce'], '1:5': ['arrière-arrière-petit-neveu', 'arrière-arrière-petite-nièce'],
            '2:1': ['oncle', 'tante'], '2:2': ['cousin germain', 'cousine germaine'], '2:3': ['fils de cousin germain', 'fille de cousin germain'], '2:4': ['petit-fils de cousin germain', 'petite-fille de cousin germain'],
            '3:1': ['grand-oncle', 'grand-tante'], '3:2': ['cousin germain d’un parent', 'cousine germaine d’un parent'], '3:3': ['cousin issu de germains', 'cousine issue de germains'],
            '4:1': ['arrière-grand-oncle', 'arrière-grand-tante'], '4:2': ['cousin germain d’un grand-parent', 'cousine germaine d’un grand-parent'], '5:1': ['arrière-arrière-grand-oncle', 'arrière-arrière-grand-tante']},
        s: {full: ['frère germain', 'sœur germaine'], father: ['demi-frère (même père)', 'demi-sœur (même père)'], mother: ['demi-frère (même mère)', 'demi-sœur (même mère)'], '': ['frère', 'sœur']},
    };
    /** a : générations du défunt jusqu'à l'ancêtre commun ; b : de l'ancêtre jusqu'à la personne. sib : 'full' | 'father' | 'mother' | '' */
    function kinLabel(a, b, gender, sib = '', t = T0) {
        const f = gender === 'female' ? 1 : 0;
        if (a === 0 && b === 0) return t('le défunt');
        if (a === 0) return KIN.d[b] ? t(KIN.d[b][f]) : t(f ? 'descendante à la {n}e génération' : 'descendant à la {n}e génération', {n: b});
        if (b === 0) return KIN.a[a] ? t(KIN.a[a][f]) : t(f ? 'ascendante à la {n}e génération' : 'ascendant à la {n}e génération', {n: a});
        if (a === 1 && b === 1) return t((KIN.s[sib] || KIN.s[''])[f]);
        const k = KIN.c[`${a}:${b}`];
        return k ? t(k[f]) : t(f ? 'parente au {n}e degré' : 'parent au {n}e degré', {n: a + b});
    }
    const DEGREES = [[1, 'Père, mère, enfant'], [2, 'Frère, sœur, grand-parent, petit-enfant'], [3, 'Neveu, nièce, oncle, tante'], [4, 'Cousin germain, petit-neveu, grand-oncle'], [5, 'Enfant de cousin germain'], [6, 'Cousin issu de germains (limite)']];

    /* ═════ Le graphe ═════ */
    /**
     * graph = {persons: {id: {id, first, last, gender, status ('living'|'deceased'|'unknown'), birth: {date, year}, death: {date, year} | null,
     *          dead_event, children_status, private}}, parents: [{child, parent, rel}], unions: [{id, a, b, married (true|false|null),
     *          marriage: {date}, divorced, divorce: {date}, free}]}
     */
    function index(graph) {
        const P = {};
        for (const [k, p] of Object.entries(graph.persons || {})) P[Number(k)] = {...p, id: Number(k)};
        const links = {}; // child → [{parent, rel}]
        for (const l of graph.parents || []) {
            const c = Number(l.child), p = Number(l.parent); if (!c || !p || c === p) continue;
            (links[c] = links[c] || []).push({parent: p, rel: String(l.rel || 'biological')});
        }
        const unions = {}; // personne → [union]
        for (const u of graph.unions || []) { for (const x of [u.a, u.b]) if (x) (unions[Number(x)] = unions[Number(x)] || []).push(u); }
        return {P, links, unions};
    }

    function context(graph, opts = {}) {
        const G = index(graph), t = opts.t || T0;
        const dead = Number(opts.deceasedId);
        const D = G.P[dead];
        const ov = opts.overrides || {};
        const deathDate = String(opts.deathDate || D?.death?.date || (D?.death?.year ? String(D.death.year) : '') || '');
        const flags = new Set();
        const adoption = id => { const v = ov[id]?.adoption; return v === 'pleniere' || v === 'simple' ? v : ''; };
        const partnersOf = id => (G.unions[id] || []).map(u => (Number(u.a) === id ? Number(u.b) : Number(u.a))).filter(Boolean);
        /** les parents qui comptent pour la loi (filiation) : ni accueil ni beau-parent ; adoption plénière = plus la famille d'origine */
        const legalCache = {};
        function legalParents(c) {
            if (legalCache[c]) return legalCache[c];
            const ls = (G.links[c] || []).filter(l => !['foster', 'step'].includes(l.rel));
            const adopted = ls.filter(l => l.rel === 'adopted');
            let out = ls;
            if (adopted.length) {
                const kind = adoption(c);
                if (!kind) flags.add('adoption:' + c);
                if (kind === 'pleniere') {
                    const adopters = new Set(adopted.map(l => l.parent));
                    out = ls.filter(l => l.rel === 'adopted' || partnersOf(l.parent).some(x => adopters.has(x)));
                }
            }
            return legalCache[c] = [...new Set(out.map(l => l.parent))];
        }
        const kidsCache = {};
        function legalKids(p) {
            if (kidsCache[p]) return kidsCache[p];
            const out = [];
            for (const c of Object.keys(G.links)) { const ci = Number(c); if (legalParents(ci).includes(p)) out.push(ci); }
            out.sort((x, y) => (G.P[x]?.birth?.year || 9999) - (G.P[y]?.birth?.year || 9999) || x - y);
            return kidsCache[p] = out;
        }
        /** au moment du décès : 'surv' (vivant), 'pre' (mort avant), 'post' (mort après : sa part passe à ses propres héritiers),
         *  'unknown', 'notborn' (pas encore conçu), 'ren' (renonce), 'ind' (indigne), 'abs' (présumé absent : sa part est réservée) */
        function baseTiming(id) {
            const p = G.P[id]; if (!p) return 'unknown';
            const o = ov[id]?.status;
            if (o === 'alive') return 'surv'; if (o === 'dead_before' || o === 'absent_declare') return 'pre'; if (o === 'dead_after') return 'post';
            if (o === 'renonce') return 'ren'; if (o === 'indigne') return 'ind'; if (o === 'absent') return 'abs'; if (o === 'unknown') return 'unknown';
            const by = p.birth?.date || (p.birth?.year ? String(p.birth.year) : '');
            if (by && deathDate) {
                const b = dayNum(by), d = dayNum(deathDate);
                if (b != null && d != null && b > d + 300) return 'notborn';
                if (b == null && yearOf(by) > yearOf(deathDate) + 1) return 'notborn';
            }
            const dd = p.death?.date || (p.death?.year ? String(p.death.year) : '');
            if (dd) { const c = cmpDate(dd, deathDate); return c === -1 ? 'pre' : c === 1 ? 'post' : 'unknown'; }
            const dy = yearOf(deathDate) || new Date().getFullYear();
            if (p.status === 'deceased' || p.dead_event) { const b = p.birth?.year; return b && b < dy - 110 ? 'pre' : 'unknown'; }
            if (p.status === 'living') return 'surv';
            const b = p.birth?.year;
            if (b && b < dy - 105) return 'pre';
            return 'unknown';
        }
        return {G, t, dead, D, ov, deathDate, flags, legalParents, legalKids, baseTiming, partnersOf};
    }

    const HEIR = new Set(['surv', 'post', 'abs']);
    const REPR = new Set(['pre', 'ren', 'ind']);

    /**
     * Une souche (art. 752-753) : x vient de son chef s'il est héritier, sinon ses enfants le représentent (s'il est prédécédé,
     * renonçant ou indigne). → {comes, node} ; node = {id, kind: 'heir'|'souche'|'out', kids: [node]}. maxDeg : limite des collatéraux.
     */
    function souche(C, T, x, deg, maxDeg, seen) {
        if (seen.has(x) || deg > maxDeg) return {comes: false, node: {id: x, kind: 'out', deg, kids: [], reason: deg > maxDeg ? 'degree' : 'loop'}};
        seen.add(x);
        const tm = T(x);
        if (HEIR.has(tm)) return {comes: true, node: {id: x, kind: 'heir', deg, tm, kids: []}};
        if (REPR.has(tm)) {
            const kids = C.legalKids(x).filter(k => k !== C.dead).map(k => souche(C, T, k, deg + 1, maxDeg, seen));
            const come = kids.filter(k => k.comes);
            return {comes: come.length > 0, node: {id: x, kind: come.length ? 'souche' : 'out', deg, tm, kids: kids.map(k => k.node), reason: come.length ? '' : 'nodesc'}};
        }
        return {comes: false, node: {id: x, kind: 'out', deg, tm, kids: [], reason: tm}};
    }
    /** répartit share dans un arbre de souches : chaque souche qui vient a la même part (par souche, puis par tête) */
    function spread(node, share, out, meta) {
        node.share = share;
        if (node.kind === 'heir') { out.push({id: node.id, share, ...meta(node)}); return; }
        const come = node.kids.filter(k => k.kind !== 'out');
        node.kids.forEach(k => { if (k.kind === 'out') k.share = ZERO; });
        come.forEach(k => spread(k, div(share, come.length), out, meta));
    }

    /** Le calcul pour une façon de voir les statuts (T : id → timing) */
    function devolve(C, T, spouseMarried) {
        const {G, t, dead} = C;
        const notes = [], rows = [], shares = []; // shares : [{id, share, role}]
        const res = {order: 0, notes, rows, spouse: null, spouseOption: null, branches: null, escheat: false};
        // ── le conjoint successible (art. 732)
        let spouse = null;
        for (const u of G.unions[dead] || []) {
            const x = Number(u.a) === dead ? Number(u.b) : Number(u.a); if (!x || !G.P[x]) continue;
            const married = spouseMarried(u);
            if (married === false) continue;
            if (u.divorced && (!u.divorce?.date || cmpDate(u.divorce.date, C.deathDate) !== 1)) continue;
            const tm = T(x);
            if (!HEIR.has(tm)) continue;
            if (!spouse || (cmpDate(u.marriage?.date, spouse.u.marriage?.date) === 1)) spouse = {id: x, u, tm};
        }
        // ── 1er ordre : les descendants
        const kids = C.legalKids(dead);
        const kidTrees = kids.map(k => souche(C, T, k, 1, 99, new Set([dead])));
        const kidsCome = kidTrees.filter(k => k.comes);
        const meta = branch => node => ({role: 'heir', via: node.deg > branch ? 'repr' : 'chef'});
        const kidNodes = kidTrees.map(k => k.node);
        if (kidsCome.length) {
            res.order = 1;
            let rest = ONE;
            if (spouse) {
                const allCommon = kidsCome.every(k => C.legalParents(k.node.id).includes(spouse.id));
                res.spouse = {id: spouse.id, share: F(1, 4), art: '757'};
                res.spouseOption = allCommon ? 'usufruit' : null;
                notes.push(allCommon ? t('Tous les enfants sont communs : le conjoint choisit l’usufruit de tout, ou le quart en pleine propriété (art. 757). Le calcul montre le quart.') : t('Un enfant au moins n’est pas commun aux deux époux : le conjoint reçoit le quart en pleine propriété (art. 757).'));
                rest = F(3, 4);
            }
            const out = [];
            kidsCome.forEach(k => spread(k.node, div(rest, kidsCome.length), out, meta(1)));
            shares.push(...out);
            res.tree = {kind: 'desc', nodes: kidNodes};
            notes.push(t('1er ordre : les enfants et, par représentation, les descendants d’un enfant prédécédé ou renonçant ; partage par souche (art. 735, 752, 753).'));
            return finish(C, res, shares, spouse);
        }
        // ── 2e ordre : père et mère, frères et sœurs et leurs descendants
        const parents = C.legalParents(dead);
        const pAlive = parents.filter(p => HEIR.has(T(p)));
        const sibs = [];
        for (const p of parents) for (const s of C.legalKids(p)) if (s !== dead && !sibs.includes(s)) sibs.push(s);
        sibs.sort((x, y) => (G.P[x]?.birth?.year || 9999) - (G.P[y]?.birth?.year || 9999) || x - y);
        const sibTrees = sibs.map(s => souche(C, T, s, 2, 6, new Set([dead, ...parents])));
        const sibsCome = sibTrees.filter(s => s.comes);
        const parentRow = (p, share, art) => shares.push({id: p, share, role: 'parent', via: 'chef', art});
        if (spouse) { // le conjoint passe toujours avant les frères et sœurs ; avec ou sans père et mère, voir ci-dessous
            // sans descendant : le conjoint passe avant les frères et sœurs (art. 757-1, 757-2)
            if (pAlive.length === 2) { res.order = 2; res.spouse = {id: spouse.id, share: F(1, 2), art: '757-1'}; pAlive.forEach(p => parentRow(p, F(1, 4), '757-1')); notes.push(t('Sans descendant, avec le père et la mère : la moitié au conjoint, un quart à chaque parent (art. 757-1).')); }
            else if (pAlive.length === 1) { res.order = 2; res.spouse = {id: spouse.id, share: F(3, 4), art: '757-1'}; parentRow(pAlive[0], F(1, 4), '757-1'); notes.push(t('Sans descendant, avec un seul parent : trois quarts au conjoint, un quart au parent (art. 757-1).')); }
            else { res.order = 0; res.spouse = {id: spouse.id, share: ONE, art: '757-2'}; notes.push(t('Sans descendant ni père ni mère : le conjoint recueille toute la succession (art. 757-2). Les frères et sœurs peuvent avoir un droit de retour sur les biens de famille (art. 757-3) : à voir avec le notaire.')); }
            res.tree = {kind: 'sib', nodes: sibTrees.map(s => s.node), parents};
            return finish(C, res, shares, spouse);
        }
        if (pAlive.length || sibsCome.length) {
            res.order = 2;
            if (sibsCome.length) {
                pAlive.forEach(p => parentRow(p, F(1, 4), '738'));
                const rest = sub(ONE, F(pAlive.length, 4));
                const out = [];
                sibsCome.forEach(s => spread(s.node, div(rest, sibsCome.length), out, meta(2)));
                shares.push(...out);
                notes.push(pAlive.length === 2 ? t('Le père et la mère ont chacun un quart, les frères et sœurs (ou leurs descendants) la moitié (art. 738).') : pAlive.length === 1 ? t('Le parent survivant a un quart, les frères et sœurs (ou leurs descendants) trois quarts (art. 738).') : t('Père et mère décédés : les frères et sœurs ou leurs descendants prennent tout (art. 737).'));
                notes.push(t('Frères et sœurs germains, consanguins ou utérins : parts égales, par souche (art. 744, 752-2, 753 ; loi du 3 décembre 2001).'));
            } else if (pAlive.length === 2) {
                pAlive.forEach(p => parentRow(p, F(1, 2), '736')); notes.push(t('Sans descendant ni frère ni sœur : le père et la mère ont chacun la moitié (art. 736).'));
            } else {
                // un seul parent : la moitié aux ascendants de l'autre branche s'il y en a (art. 738-1), sinon tout
                const other = parents.filter(p => p !== pAlive[0]);
                const asc = other.map(o => nearestAscendants(C, T, o)).find(a => a.ids.length);
                if (asc) {
                    parentRow(pAlive[0], F(1, 2), '738-1');
                    asc.ids.forEach(a => shares.push({id: a, share: div(F(1, 2), asc.ids.length), role: 'heir', via: 'chef', art: '738-1'}));
                    notes.push(t('Un seul parent, sans frère ni sœur, mais des ascendants dans l’autre branche : moitié au parent, moitié à ces ascendants (art. 738-1).'));
                } else { parentRow(pAlive[0], ONE, '736'); notes.push(t('Le parent survivant, seul de son ordre, recueille la succession.')); }
            }
            res.tree = {kind: 'sib', nodes: sibTrees.map(s => s.node), parents};
            return finish(C, res, shares, spouse);
        }
        // ── 3e et 4e ordres : fente entre la branche paternelle et la branche maternelle
        const br = branchesOf(C, parents);
        const asc = br.map(b => ({...b, a: nearestAscendants(C, T, b.root)}));
        const withAsc = asc.filter(b => b.a.ids.length);
        if (withAsc.length) {
            res.order = 3;
            const part = div(ONE, withAsc.length);
            withAsc.forEach(b => b.a.ids.forEach(id => shares.push({id, share: div(part, b.a.ids.length), role: 'heir', via: 'chef', line: b.line, art: '748'})));
            notes.push(withAsc.length === 2 ? t('3e ordre : moitié pour chaque branche ; dans chacune, l’ascendant le plus proche prend tout (art. 747-748).') : t('3e ordre : une seule branche a encore un ascendant ; il recueille toute la succession, même les cousins de l’autre branche sont écartés (art. 748).'));
            res.branches = asc.map(b => ({line: b.line, root: b.root, kind: 'asc', ids: b.a.ids, deg: b.a.deg}));
            return finish(C, res, shares, spouse);
        }
        const coll = br.map(b => ({...b, c: nearestCollaterals(C, T, b.root, new Set([dead, ...parents]))}));
        const withColl = coll.filter(b => b.c.ids.length);
        res.branches = coll.map(b => ({line: b.line, root: b.root, kind: 'coll', ids: b.c.ids, deg: b.c.deg, others: b.c.others}));
        if (withColl.length) {
            res.order = 4;
            const part = div(ONE, withColl.length);
            withColl.forEach(b => b.c.ids.forEach(id => shares.push({id, share: div(part, b.c.ids.length), role: 'heir', via: 'chef', line: b.line, art: '750'})));
            notes.push(withColl.length === 2 ? t('4e ordre : moitié pour chaque branche ; dans chacune, le collatéral le plus proche en degré prend tout, sans représentation (art. 749-750).') : t('4e ordre : personne dans une branche, l’autre branche recueille tout (art. 750).'));
            notes.push(t('Les collatéraux ne succèdent pas au-delà du 6e degré (art. 745).'));
            return finish(C, res, shares, spouse);
        }
        res.escheat = true;
        notes.push(t('Aucun héritier trouvé jusqu’au 6e degré : sans testament, la succession reviendrait à l’État (art. 539 et 768). Il reste sans doute des branches à chercher.'));
        return finish(C, res, shares, spouse);
    }
    /** les branches : paternelle (père), maternelle (mère) */
    function branchesOf(C, parents) {
        const out = parents.map(p => ({root: p, line: C.G.P[p]?.gender === 'female' ? 'm' : 'p'}));
        if (out.length === 2 && out[0].line === out[1].line) out[1].line = out[0].line === 'p' ? 'm' : 'p';
        return out.sort((a, b) => (a.line === 'p' ? 0 : 1) - (b.line === 'p' ? 0 : 1));
    }
    /** les ascendants vivants les plus proches au-dessus de root (root exclu) : {ids, deg} (deg = degré avec le défunt) */
    function nearestAscendants(C, T, root) {
        let level = [root], g = 1;
        const seen = new Set([root]);
        while (level.length && g < 30) {
            const next = [];
            for (const x of level) for (const p of C.legalParents(x)) if (!seen.has(p)) { seen.add(p); next.push(p); }
            g++;
            const alive = next.filter(p => HEIR.has(T(p)));
            if (alive.length) return {ids: alive, deg: g};
            level = next;
        }
        return {ids: [], deg: 0};
    }
    /** ascendants de root (root compris) : id → génération au-dessus du défunt */
    function ascendantsOf(C, root, max = 12) { // les ascendants héritent à tout degré (art. 746) : on regarde jusqu'à 12 générations
        const out = new Map([[root, 1]]); let level = [root];
        for (let g = 2; g <= max && level.length; g++) {
            const next = [];
            for (const x of level) for (const p of C.legalParents(x)) if (!out.has(p)) { out.set(p, g); next.push(p); }
            level = next;
        }
        return out;
    }
    /** collatéraux ordinaires d'une branche : descendants des ascendants (grands-parents et au-dessus), hors lignée du défunt */
    function nearestCollaterals(C, T, root, excl) {
        const asc = ascendantsOf(C, root, 5);
        const allAsc = new Set([C.dead, ...asc.keys()]);
        for (const p of C.legalParents(C.dead)) allAsc.add(p);
        // les descendants des parents du défunt (frères, sœurs, neveux…) sont des collatéraux privilégiés : pas ici
        const priv = new Set();
        const markDesc = (x, d = 0) => { for (const k of C.legalKids(x)) if (!priv.has(k) && d < 12) { priv.add(k); markDesc(k, d + 1); } };
        C.legalParents(C.dead).forEach(p => markDesc(p));
        const deg = new Map();
        for (const [a, g] of asc) {
            if (g < 2) continue;
            let level = [a];
            for (let d = 1; g + d <= 6 && level.length; d++) {
                const next = [];
                for (const x of level) for (const k of C.legalKids(x)) {
                    if (allAsc.has(k) || priv.has(k) || excl.has(k)) continue;
                    const v = g + d; if (!deg.has(k) || deg.get(k) > v) deg.set(k, v);
                    next.push(k);
                }
                level = next;
            }
        }
        let best = 99; const others = [];
        for (const [k, v] of deg) if (HEIR.has(T(k))) best = Math.min(best, v);
        const ids = [...deg].filter(([k, v]) => v === best && HEIR.has(T(k))).map(([k]) => k);
        for (const [k, v] of deg) if (!ids.includes(k)) others.push({id: k, deg: v, tm: T(k)});
        return {ids, deg: best === 99 ? 0 : best, others, all: deg};
    }
    function finish(C, res, shares, spouse) {
        if (res.spouse) shares.unshift({id: res.spouse.id, share: res.spouse.share, role: 'spouse', via: 'chef', art: res.spouse.art});
        const merged = new Map();
        for (const s of shares) { const k = s.id; if (merged.has(k)) merged.get(k).share = add(merged.get(k).share, s.share); else merged.set(k, {...s}); }
        res.shares = [...merged.values()];
        res.total = sumAll(res.shares.map(s => s.share));
        return res;
    }

    /* ═════ La parenté avec le défunt : a, b, degré, côté ═════ */
    function relation(C, id) {
        if (id === C.dead) return {a: 0, b: 0, deg: 0};
        // ascendants du défunt (avec génération) et de la personne
        const up = (x, max = 8) => { const m = new Map([[x, 0]]); let l = [x]; for (let g = 1; g <= max && l.length; g++) { const n = []; for (const y of l) for (const p of C.legalParents(y)) if (!m.has(p)) { m.set(p, g); n.push(p); } l = n; } return m; };
        const ad = up(C.dead), ax = up(id, 14);
        let best = null;
        for (const [anc, a] of ad) if (ax.has(anc)) { const b = ax.get(anc); if (!best || a + b < best.a + best.b) best = {a, b, anc}; }
        if (!best) {
            if (C.partnersOf(C.dead).includes(id)) return {a: 0, b: 0, deg: 0, spouse: true};
            return null;
        }
        let sib = '';
        if (best.a === 1 && best.b === 1) {
            const pd = C.legalParents(C.dead), px = C.legalParents(id), common = pd.filter(p => px.includes(p));
            if (common.length >= 2 || (common.length === pd.length && pd.length === px.length && pd.length > 1)) sib = 'full';
            else if (common.length === 1 && pd.length === 2 && px.length === 2) sib = C.G.P[common[0]]?.gender === 'female' ? 'mother' : 'father';
        }
        const deg = best.a === 0 ? best.b : best.b === 0 ? best.a : best.a + best.b;
        return {a: best.a, b: best.b, deg, sib, anc: best.anc};
    }

    /* ═════ Le calcul complet : principal, hypothèses, branches à chercher, avertissements ═════ */
    /**
     * Les fiches confidentielles (is_private) qu'on ne compte pas (réglage « Les fiches confidentielles comptent-elles comme
     * héritiers ? » = Non) : retirées du graphe comme si elles n'existaient pas (fiche, liens de filiation, unions). Le défunt
     * n'est jamais retiré. → {graph, excluded: [id]}
     */
    function withoutPrivate(graph, keepId) {
        const keep = Number(keepId), out = new Set();
        for (const [k, p] of Object.entries(graph?.persons || {})) if (p && p.private && Number(k) !== keep) out.add(Number(k));
        if (!out.size) return {graph, excluded: []};
        const persons = {};
        for (const [k, p] of Object.entries(graph.persons)) if (!out.has(Number(k))) persons[k] = p;
        return {graph: {...graph, persons, parents: (graph.parents || []).filter(l => !out.has(Number(l.child)) && !out.has(Number(l.parent))),
            unions: (graph.unions || []).filter(u => !out.has(Number(u.a)) && !out.has(Number(u.b)))}, excluded: [...out].sort((a, b) => a - b)};
    }
    function compute(graph, opts = {}) {
        let privateExcluded = [];
        if (opts.excludePrivate) ({graph, excluded: privateExcluded} = withoutPrivate(graph, opts.deceasedId));
        const C = context(graph, opts);
        const {G, t, dead, D} = C;
        if (!D) return {error: t('Le défunt n’est pas dans la base.')};
        const timings = {};
        const base = id => (timings[id] ??= C.baseTiming(id));
        const marriedOf = u => {
            const o = opts.spouse?.[Number(u.a) === dead ? u.b : u.a];
            if (o === 'married') return true; if (o === 'not' || o === 'divorced') return false;
            if (u.free) return false;
            if (u.married === true) return true; if (u.married === false) return false;
            return null;
        };
        const scen = (flips, spouseNot) => {
            const T = id => { const b = base(id); return b === 'unknown' ? (flips.has(id) ? 'pre' : 'surv') : b; };
            const res = devolve(C, T, u => { const m = marriedOf(u); if (m === null) return !spouseNot.has(Number(u.a) === dead ? Number(u.b) : Number(u.a)); return m; });
            res.T = T; return res;
        };
        const main = scen(new Set(), new Set());
        // ce qui est inconnu ET compte : un héritier du calcul principal dont on ne sait pas s'il vivait ; un conjoint sans mariage noté
        const unknownHeirs = main.shares.filter(s => base(s.id) === 'unknown').map(s => s.id);
        const unknownSpouse = (G.unions[dead] || []).filter(u => marriedOf(u) === null).map(u => (Number(u.a) === dead ? Number(u.b) : Number(u.a))).filter(x => main.shares.some(s => s.id === x && s.role === 'spouse'));
        const vars = [...unknownSpouse.map(id => ({id, kind: 'spouse'})), ...unknownHeirs.filter(id => !unknownSpouse.includes(id)).map(id => ({id, kind: 'dead'}))];
        const hyps = [];
        const sig = r => r.shares.map(s => `${s.id}:${str(s.share)}`).sort().join(',');
        const seen = new Set([sig(main)]);
        const nm = id => name(G.P[id]);
        const tryScen = (sel, round = 0) => {
            const flips = new Set(sel.filter(v => v.kind === 'dead').map(v => v.id)), sp = new Set(sel.filter(v => v.kind === 'spouse').map(v => v.id));
            const r = scen(flips, sp); const s = sig(r); if (seen.has(s)) return; seen.add(s);
            const parts = sel.map(v => v.kind === 'spouse' ? t('si {name} n’était pas marié avec le défunt (PACS ou union libre)', {name: nm(v.id)}) : (C.legalKids(v.id).length ? t('si {name} est mort avant, représenté par ses descendants', {name: nm(v.id)}) : t('si {name} est mort avant sans descendant', {name: nm(v.id)})));
            hyps.push({label: parts.join(' ; '), flips: [...flips], spouseNot: [...sp], res: r});
            // un héritier nouveau et lui-même inconnu (un descendant de celui qu'on a dit mort) : une hypothèse de plus
            if (round < 2 && hyps.length < 12) { const more = r.shares.filter(x => base(x.id) === 'unknown' && !flips.has(x.id) && !vars.some(v => v.id === x.id)).map(x => ({id: x.id, kind: 'dead'})); more.slice(0, 2).forEach(m => tryScen([...sel, m], round + 1)); }
        };
        const k = Math.min(vars.length, 4);
        for (let mask = 1; mask < (1 << k) && hyps.length < 16; mask++) tryScen(vars.slice(0, k).filter((_, i) => mask & (1 << i)));
        for (const v of vars.slice(4)) if (hyps.length < 16) tryScen([v]);
        // les lignes du tableau
        const rows = rowsOf(C, main, base);
        return {deceased: dead, deathDate: C.deathDate, order: main.order, notes: main.notes, spouse: main.spouse ? {...main.spouse, share: str(main.spouse.share)} : null, spouseOption: main.spouseOption,
            rows, total: str(main.total), totalOk: str(main.total) === '1' || main.escheat, escheat: main.escheat, branches: main.branches,
            hypotheses: hyps.map(h => ({label: h.label, flips: h.flips, spouseNot: h.spouseNot, shares: h.res.shares.map(s => ({id: s.id, name: nm(s.id), share: str(s.share), pct: pct(s.share)})), total: str(h.res.total), order: h.res.order})),
            search: toSearch(C, main, base, opts), warnings: warningsOf(C, opts), orders: ordersOf(C, main, base), flags: [...C.flags], timings: Object.fromEntries(rows.map(r => [r.id, base(r.id)])),
            privateExcluded, _main: main, _ctx: C};
    }
    const name = p => (p ? `${String(p.first || '').trim()} ${String(p.last || '').trim().toLocaleUpperCase('fr')}`.trim() || '?' : '?');
    function rowsOf(C, res, base) {
        const {G, t} = C;
        const byId = new Map(res.shares.map(s => [s.id, s]));
        const rows = [];
        const push = (id, ex) => {
            const {share: exShare, ...extra} = ex;
            const p = G.P[id] || {}; const rel = relation(C, id);
            const s = byId.get(id);
            rows.push({id, name: name(p), gender: p.gender || '', years: [p.birth?.year, p.death?.year].filter(Boolean).join('-'), deg: rel?.deg ?? null, a: rel?.a, b: rel?.b,
                kin: extra.role === 'spouse' ? t(p.gender === 'female' ? 'épouse' : p.gender === 'male' ? 'époux' : 'conjoint') : rel ? kinLabel(rel.a, rel.b, p.gender, rel.sib, t) : '',
                sib: rel?.sib || '', timing: res.T ? res.T(id) : '', baseTiming: base(id), unknown: base(id) === 'unknown', share: s ? str(s.share) : (exShare != null ? str(exShare) : '0'), pct: s ? pct(s.share) : 0, ...extra});
        };
        if (res.spouse) push(res.spouse.id, {role: 'spouse', via: 'chef', depth: 0, art: res.spouse.art});
        res.shares.filter(s => s.role === 'parent').forEach(s => push(s.id, {role: 'parent', via: 'chef', depth: 0, art: s.art}));
        const walk = (node, depth, parent) => {
            const role = node.kind === 'heir' ? 'heir' : node.kind === 'souche' ? 'souche' : 'out';
            push(node.id, {role, via: depth > 0 ? 'repr' : 'chef', depth, parent, share: node.share || ZERO, reason: node.reason || ''});
            if (node.kind === 'souche') node.kids.forEach(k => walk(k, depth + 1, node.id));
        };
        (res.tree?.nodes || []).forEach(n => walk(n, 0, null));
        // 738-1, 3e et 4e ordres : les héritiers de chaque branche
        res.shares.filter(s => s.role === 'heir' && !rows.some(r => r.id === s.id)).forEach(s => push(s.id, {role: 'heir', via: 'chef', depth: 0, line: s.line, art: s.art}));
        if (res.branches && res.order === 4) res.branches.forEach(b => (b.others || []).filter(o => o.deg === b.deg || o.deg === b.deg + 1).slice(0, 8).forEach(o => { if (!rows.some(r => r.id === o.id)) push(o.id, {role: 'out', via: 'chef', depth: 0, line: b.line, reason: HEIR.has(o.tm) ? 'farther' : 'norepr'}); }));
        return rows;
    }
    function ordersOf(C, res, base) {
        const t = C.t;
        const st = n => res.order === n ? 'kept' : res.order && n < res.order ? 'none' : res.order === 0 && res.spouse ? 'spouse' : 'out';
        return [[1, t('Enfants et descendants, avec représentation')], [2, t('Père et mère, frères et sœurs et leurs descendants (« parents privilégiés »)')], [3, t('Autres ascendants (grands-parents…), fente paternelle / maternelle')], [4, t('Oncles, tantes, cousins… jusqu’au 6e degré (art. 745)')]].map(([n, l]) => ({n, label: l, state: st(n)}));
    }
    function toSearch(C, res, base, opts) {
        const {G, t, dead} = C, out = [];
        const D = G.P[dead];
        const seen = new Set();
        const add = (kind, id, text, extra = {}) => { const k = kind + ':' + id; if (seen.has(k)) return; seen.add(k); out.push({kind, id, name: id ? name(G.P[id]) : '', text, ...extra}); };
        for (const s of res.shares) if (base(s.id) === 'unknown') add('unknown', s.id, t('Vivant au décès ? Mort avant ? Des enfants ? Sa réponse change la part des autres.'), {share: str(s.share)});
        const walk = node => { if (node.kind === 'out' && node.reason === 'nodesc' && G.P[node.id]?.children_status !== 'none') add('nodesc', node.id, t('Mort avant le défunt, sans descendance connue : un enfant, même reconnu tard, changerait le partage.')); (node.kids || []).forEach(walk); };
        (res.tree?.nodes || []).forEach(walk);
        if (!C.legalKids(dead).length && D?.children_status !== 'none') add('kids', dead, t('Aucun enfant du défunt dans la base : à vérifier (mentions en marge de l’acte de naissance, livret de famille).'));
        if (!C.legalParents(dead).length) add('parents', dead, t('Les parents du défunt ne sont pas dans la base : sans eux, l’app ne trouve ni frères, ni sœurs, ni cousins.'));
        else if (C.legalParents(dead).length === 1) add('parents', dead, t('Un seul parent du défunt est dans la base : l’autre branche reste à chercher.'));
        for (const f of C.flags) { const id = Number(f.split(':')[1]); add('adoption', id, t('Adoption : plénière ou simple ? Une adoption plénière coupe les liens avec la famille d’origine.')); }
        for (const u of G.unions[dead] || []) { const x = Number(u.a) === dead ? Number(u.b) : Number(u.a); if (x && u.married == null && !u.free && opts.spouse?.[x] == null && HEIR.has(res.T(x))) add('marriage', x, t('Couple sans mariage noté : seul un conjoint marié hérite sans testament (pas le partenaire de PACS ni le concubin).')); }
        // la lignée d'un frère ou d'une sœur qui n'a qu'un parent noté
        const pd = C.legalParents(dead);
        if (pd.length === 2) for (const p of pd) for (const s of C.legalKids(p)) if (s !== dead && C.legalParents(s).length === 1) add('lit', s, t('Un seul parent noté : relie sa fiche à son autre parent (frère germain ou demi-frère).'));
        if (res.order === 4 || res.escheat) (res.branches || []).filter(b => !b.ids.length).forEach(b => add('branch', b.root, b.line === 'p' ? t('Personne dans la branche paternelle jusqu’au 6e degré : oncles, tantes et cousins du père à chercher.') : t('Personne dans la branche maternelle jusqu’au 6e degré : oncles, tantes et cousins de la mère à chercher.'), {line: b.line}));
        const addr = opts.addresses || {};
        for (const s of res.shares) if (HEIR.has(res.T(s.id)) && base(s.id) !== 'unknown' && !addr[s.id] && G.P[s.id]) add('address', s.id, t('Vivant, mais pas d’adresse dans le Répertoire des vivants.'));
        for (const s of res.shares) if (res.T(s.id) === 'post') add('post', s.id, t('Mort après le défunt : sa part passe à ses propres héritiers (sa succession à lui).'));
        for (const s of res.shares) if (res.T(s.id) === 'abs') add('absent', s.id, t('Présumé absent : sa part est réservée (art. 112 à 132).'));
        return out;
    }
    function warningsOf(C, opts) {
        const t = C.t, out = [], d = C.deathDate;
        if (!d) { out.push({kind: 'nodate', text: t('Date du décès inconnue : l’app ne peut pas dire qui était mort avant ni quel droit s’applique.')}); return out; }
        const c2002 = cmpDate(d, '2002-07-01'), y = yearOf(d);
        if (c2002 === -1 || (c2002 === null && y < 2002)) out.push({kind: 'old', text: t('Décès du {date} : le droit de l’époque n’est pas celui d’aujourd’hui. Avant le 1er juillet 2002 (loi du 3 décembre 2001), le conjoint survivant avait surtout de l’usufruit, les enfants nés hors mariage n’avaient pas tous les mêmes droits et les frères et sœurs de lits différents se partageaient par lignes. Avant le 1er août 1972, les enfants naturels avaient des droits réduits. L’app calcule ici selon le droit actuel : le notaire applique le droit de la date.', {date: opts.deathText || d})});
        else if (cmpDate(d, '2007-01-01') === -1 || (cmpDate(d, '2007-01-01') === null && y < 2007)) out.push({kind: 'mid', text: t('Décès avant le 1er janvier 2007 (loi du 23 juin 2006) : on ne pouvait pas représenter un héritier qui avait renoncé.')});
        else if (c2002 === null && y === 2002) out.push({kind: 'old', text: t('Décès en 2002 sans date précise : avant ou après le 1er juillet 2002, le droit change. Précise la date.')});
        return out;
    }

    /* ═════ Les pièces justificatives : les actes qui prouvent chaque lien, du défunt à chaque héritier ═════ */
    /** chemin d'ascendants : du défunt à l'ancêtre commun (défunt exclu), et de l'ancêtre à la personne */
    function pathTo(C, id) {
        const rel = relation(C, id); if (!rel) return null;
        const upChain = [];
        // remonter du défunt jusqu'à l'ancêtre commun
        const climb = (from, to, depth) => { if (from === to) return [from]; if (depth <= 0) return null; for (const p of C.legalParents(from)) { const r = climb(p, to, depth - 1); if (r) return [from, ...r]; } return null; };
        const a = rel.anc != null ? climb(C.dead, rel.anc, rel.a) : [C.dead];
        const b = rel.anc != null ? climb(id, rel.anc, rel.b) : [id];
        if (!a || !b) return null;
        upChain.push(...a);
        return {up: a, down: b.reverse(), rel};
    }
    /**
     * pieces(result, graph, {acts, states}) : {groups: [{key, title, path, items: [{key, what, act, state, event_id, person_id, kind}]}], counts}
     * acts : {N:<id> | D:<id> | M:<union> : {event_id, label, place, year, media}} (fournis par le serveur) ; states : {clé: 'have'|'asked'|'missing'|'na'}
     */
    function pieces(R, graph, {acts = {}, states = {}, asked = {}} = {}) {
        const C = R._ctx, {G, t, dead} = C;
        const res = R._main;
        const groups = [], all = new Map();
        const nm = id => name(G.P[id]);
        const piece = (key, what, extra = {}) => {
            const a = acts[key] || null;
            const st = states[key] || (a?.media ? 'have' : asked[key] ? 'asked' : 'missing');
            const it = {key, what, act: a ? [a.label, a.place, a.year].filter(Boolean).join(', ') : actGuess(key), state: st, event_id: a?.event_id || 0, person_id: Number(key.split(':')[1]) || 0, kind: key.split(':')[0], asked: asked[key] || null, ...extra};
            if (key.startsWith('M:')) it.person_id = extra.person_id || 0;
            if (!all.has(key)) all.set(key, it);
            return all.get(key);
        };
        const actGuess = key => { const [k, id] = key.split(':'); const p = G.P[Number(id)]; const l = {N: t('Naissance'), D: t('Décès'), M: t('Mariage'), V: t('Divorce')}[k] || ''; const y = k === 'N' ? p?.birth?.year : k === 'D' ? p?.death?.year : ''; return [l, y].filter(Boolean).join(', '); };
        const gendered = (id, m, f) => (G.P[id]?.gender === 'female' ? f : m);
        const parentsTxt = id => { const ps = C.legalParents(id).map(nm); return ps.length >= 2 ? t('{a} et de {b}', {a: ps[0], b: ps[1]}) : ps[0] || ''; };
        const filiation = id => piece('N:' + id, C.legalParents(id).length ? t(gendered(id, '{name}, fils de {parents}', '{name}, fille de {parents}'), {name: nm(id), parents: parentsTxt(id)}) : t('La naissance de {name}', {name: nm(id)}));
        // commun à tous
        const common = [piece('D:' + dead, t('Le décès de {name}', {name: nm(dead)}))];
        if (res.order >= 2 || (res.order === 0 && !res.spouse)) common.push(filiation(dead));
        const sp = res.spouse ? res.spouse.id : 0;
        for (const u of G.unions[dead] || []) {
            const x = Number(u.a) === dead ? Number(u.b) : Number(u.a); if (!x) continue;
            if (x === sp) { common.push(piece('M:' + u.id, t('Le mariage avec {name}, non dissous', {name: nm(x)}), {person_id: x})); continue; }
            if (u.free || u.married === false) continue;
            if (u.divorced) common.push(piece('V:' + u.id, t('Le divorce d’avec {name}', {name: nm(x)}), {person_id: x}));
            else if (!HEIR.has(res.T(x))) common.push(piece('D:' + x, t('Pas de conjoint survivant : décès de {name}', {name: nm(x)})));
        }
        if (res.order >= 2 || res.order === 0) for (const p of C.legalParents(dead)) if (REPR.has(res.T(p)) || res.T(p) === 'unknown') common.push(piece('D:' + p, t('{name} est mort avant', {name: nm(p)})));
        groups.push({key: 'common', title: t('Commun à tous'), path: '', items: common});
        // par héritier (ou par souche)
        const heirs = res.shares.filter(s => s.role !== 'spouse');
        const done = new Set();
        const byTop = new Map(), perHeir = {};
        for (const h of heirs) {
            const p = pathTo(C, h.id); if (!p) continue;
            const items = [];
            // la remontée (au-delà du défunt) : chaque ascendant, fils ou fille de ses parents ; leurs décès (prédécédés)
            for (let i = 1; i < p.up.length - 1; i++) items.push(filiation(p.up[i]));
            for (let i = 1; i < p.up.length; i++) if (res.order >= 3 && p.up[i] !== p.rel.anc && REPR.has(res.T(p.up[i]))) items.push(piece('D:' + p.up[i], t('{name} est mort avant', {name: nm(p.up[i])})));
            // la descente : chaque personne, fille ou fils de la précédente ; les représentés, morts avant
            for (let i = 1; i < p.down.length; i++) {
                const x = p.down[i];
                items.push(filiation(x));
                if (i < p.down.length - 1 && REPR.has(res.T(x))) items.push(res.T(x) === 'ren' ? piece('R:' + x, t('{name} a renoncé à la succession', {name: nm(x)})) : piece('D:' + x, t('{name} est mort avant (représenté)', {name: nm(x)})));
            }
            if (!p.down.length || p.down.length === 1) { if (p.rel.b === 0 && p.rel.a > 0) items.push(filiation(p.up[p.up.length - 2] ?? dead)); }
            // le nom d'épouse
            for (const u of G.unions[h.id] || []) if ((u.married || u.marriage?.date) && G.P[h.id]?.gender === 'female') { items.push(piece('M:' + u.id, t('Son nom d’épouse'), {person_id: h.id})); break; }
            perHeir[h.id] = [...new Set(items.map(i => i.key))];
            const top = p.down[1] ?? h.id;
            const g = byTop.get(top) || {key: 'h' + top, title: '', heirs: [], path: [], items: []};
            g.heirs.push(h.id);
            items.forEach(it => { if (!g.items.includes(it)) g.items.push(it); });
            g.path = g.heirs.length > 1 ? p.up.map(nm).join(' → ') + ' → ' + nm(top) + ' → …' : p.up.map(nm).join(' → ') + (p.down.length > 1 ? ' → ' + p.down.slice(1).map(nm).join(' → ') : '');
            byTop.set(top, g);
            done.add(h.id);
        }
        for (const [top, g] of byTop) {
            g.title = g.heirs.map(nm).join(', ');
            g.items = g.items.filter(it => !common.includes(it));
            groups.push(g);
        }
        // pour écarter : morts avant sans descendance (frères, enfants…)
        const outs = [];
        const walk = n => { if (n.kind === 'out' && n.reason === 'nodesc') outs.push(n.id); (n.kids || []).forEach(walk); };
        (res.tree?.nodes || []).forEach(walk);
        for (const id of outs) groups.push({key: 'x' + id, title: t('{name} (pour l’écarter)', {name: nm(id)}), path: '', items: [piece('D:' + id, t('Mort avant le défunt, sans enfant'))], exclude: true});
        const counts = {have: 0, asked: 0, missing: 0, na: 0, total: 0};
        for (const it of all.values()) { counts[it.state] = (counts[it.state] || 0) + 1; if (it.state !== 'na') counts.total++; }
        return {groups, counts, list: [...all.values()], perHeir};
    }

    /* ═════ Liste de contrôle avant « Remis au notaire » ═════ */
    function checklist(R, P, dossier = {}, t0) {
        const t = t0 || R._ctx?.t || T0;
        const res = R._main, items = [];
        const missing = P.list.filter(i => i.state === 'missing' || i.state === 'asked');
        const heirMiss = P.groups.filter(g => !g.exclude && g.key !== 'common' && g.items.some(i => i.state !== 'have' && i.state !== 'na'));
        items.push({key: 'acts', ok: !heirMiss.length, text: heirMiss.length ? t('Chaque héritier a ses actes : il en manque pour {who}.', {who: heirMiss.map(g => g.title).join(', ')}) : t('Chaque héritier a ses actes.')});
        const deadMiss = P.list.filter(i => i.kind === 'D' && i.state !== 'have' && i.state !== 'na');
        items.push({key: 'deaths', ok: !deadMiss.length, text: deadMiss.length ? t('Chaque prédécédé a son acte de décès : {n} manquent.', {n: deadMiss.length}) : t('Chaque prédécédé a son acte de décès.')});
        const unk = (R.search || []).filter(s => s.kind === 'unknown');
        const note = String(dossier.hypothesis_note || '').trim();
        items.push({key: 'unknown', ok: !unk.length || !!note, text: unk.length ? (note ? t('Les branches inconnues ont une explication.') : t('{n} héritiers ou branches restent « inconnus » sans explication.', {n: unk.length})) : t('Aucune branche « inconnue ».')});
        items.push({key: 'hypo', ok: !R.hypotheses?.length || !!note, text: R.hypotheses?.length ? (note ? t('L’hypothèse retenue est écrite.') : t('Plusieurs hypothèses : écris celle qui est retenue.')) : t('Une seule hypothèse.')});
        items.push({key: 'total', ok: !!R.totalOk, text: R.totalOk ? t('Les parts totalisent 1.') : t('Les parts ne totalisent pas 1 : à revoir.')});
        if (R.warnings?.some(w => w.kind === 'old' || w.kind === 'nodate')) items.push({key: 'date', ok: false, text: t('La date du décès demande l’avis du notaire (droit de l’époque ou date inconnue).'), soft: true});
        return {items, ok: items.every(i => i.ok || i.soft), missing: missing.length};
    }

    /* ═════ Journal : ce qui a changé entre deux calculs ═════ */
    const snapshot = R => ({order: R.order, shares: Object.fromEntries((R._main?.shares || []).map(s => [String(s.id), str(s.share)])), unknown: (R.search || []).filter(s => s.kind === 'unknown').map(s => s.id)});
    function diffLines(prev, next, names = {}, t = T0) {
        if (!prev || !prev.shares) return [];
        const out = [], nm = id => names[id] || '#' + id;
        for (const [id, s] of Object.entries(next.shares)) {
            if (!(id in prev.shares)) out.push(next.unknown?.includes(Number(id)) ? t('{name} ajouté (statut inconnu)', {name: nm(id)}) : t('{name} ajouté ({share})', {name: nm(id), share: s}));
            else if (prev.shares[id] !== s) out.push(t('{name} : {from} → {to}', {name: nm(id), from: prev.shares[id], to: s}));
        }
        for (const id of Object.keys(prev.shares)) if (!(id in next.shares)) out.push(t('{name} retiré', {name: nm(id)}));
        if (prev.order !== next.order) out.push(t('Ordre retenu : {from} → {to}', {from: prev.order, to: next.order}));
        return out;
    }
    /** une cellule CSV sûre (pas de formule) */
    const csvCell = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const journalCsv = (rows, head = ['Date', 'Action']) => [head.map(csvCell).join(';'), ...rows.map(r => [r.at, r.text].map(csvCell).join(';'))].join('\r\n');

    /* ═════ 💶 Temps et frais ═════ */
    function fees(entries = []) {
        let minutes = 0, cents = 0; const pcts = [];
        for (const e of entries) { if (e.kind === 'time') minutes += Number(e.minutes) || 0; else if (e.kind === 'cost') cents += Number(e.amount_cents) || 0; else if (e.kind === 'percent') pcts.push(e); }
        return {minutes, hours: Math.floor(minutes / 60), mins: minutes % 60, cents, pcts};
    }


    /* ═════ ⚖️ Les textes de loi cités : un lien vers Légifrance pour chacun ═════
     * Identifiants LEGIARTI vérifiés (recherche web, novembre 2026) : 734, 735, 736, 737, 738, 738-1, 739, 744, 745, 752, 752-1,
     * 752-2, 757, 757-1, 757-2, 757-3. Les autres articles des successions ouvrent le chapitre « Des divers ordres de succession »
     * (art. 731 à 767) ; ceux d'ailleurs dans le Code (absence, adoption…) ouvrent le Code civil : liens sûrs, à remplacer par
     * l'article exact quand son identifiant sera vérifié. */
    const LF = 'https://www.legifrance.gouv.fr';
    const LF_ART = id => `${LF}/codes/article_lc/LEGIARTI${id}`;
    const LF_SUCC = `${LF}/codes/section_lc/LEGITEXT000006070721/LEGISCTA000006136268/`;
    const LF_CODE = `${LF}/codes/texte_lc/LEGITEXT000006070721/`;
    const LEGI_IDS = {'734': '000006430952', '735': '000006430957', '736': '000006430967', '737': '000006430980', '738': '000006430985', '738-1': '000006431160', '739': '000006431000',
        '744': '000006431034', '745': '000030254031', '752': '000006431072', '752-1': '000006431185', '752-2': '000006431193', '757': '000006431087', '757-1': '000006431219', '757-2': '000006431229', '757-3': '000006431238'};
    const LAW_ARTICLES = ['725', '731', '732', '733', '734', '735', '736', '737', '738', '738-1', '738-2', '739', '740', '741', '742', '743', '744', '745', '746', '747', '748', '749', '750', '751', '752', '752-1', '752-2', '753', '754', '755', '756', '757', '757-1', '757-2', '757-3', '758', '768', '539', '88', '112', '122', '132', '356', '364', '368'];
    const LAW = Object.fromEntries(LAW_ARTICLES.map(a => [a, LEGI_IDS[a] ? LF_ART(LEGI_IDS[a]) : (Number(a) >= 720 && Number(a) <= 767 ? LF_SUCC : LF_CODE)]));
    const lawVerified = a => !!LEGI_IDS[a];
    const lawUrl = a => LAW[String(a)] || LF_CODE;
    /** les articles cités dans un texte : « art. 738 », « art. 747-748 », « art. 751 à 753 », « art. 112 à 132 », « (art. 757, 757-1) » */
    const ART_RE = /\b(art(?:icles?|\.)\s*)(\d{2,3}(?:-\d(?!\d))?(?:\s*(?:,|et|à|-|–)\s*\d{2,3}(?:-\d(?!\d))?)*)/gi;
    function lawCited(text) { const out = new Set(); String(text || '').replace(ART_RE, (m, pre, list) => { (list.match(/\d{2,3}(?:-\d(?!\d))?/g) || []).forEach(x => out.add(x)); return m; }); return [...out].filter(Boolean); }
    /** le texte (déjà échappé) avec chaque numéro d'article en lien vers Légifrance (s'ouvre dans le navigateur) */
    function lawLinks(html) {
        const a = n => `<a class="succ-law" href="${lawUrl(n)}" target="_blank" rel="noopener noreferrer" title="Légifrance">↗ ${n}</a>`;
        return String(html || '').replace(ART_RE, (m, pre, list) => pre + list.replace(/\d{2,3}(?:-\d(?!\d))?/g, n => (LAW[n] ? a(n) : n)));
    }

    /* ═════ ⚖️ Un doute sur la loi ? : la question de l'utilisateur, telle quelle, au moteur de recherche d'un site officiel ═════
     * L'app ne choisit AUCUN article et n'écrit aucun texte de loi : elle n'ajoute rien (ni nom, ni dossier) à ce qui est tapé.
     * Adresses vérifiées (novembre 2026) : Service-public « recherche générale » ; Légifrance, recherche dans les codes. */
    const LAW_SEARCH = {
        sp: q => `https://www.service-public.gouv.fr/particuliers/recherche-generale?keyword=${encodeURIComponent(q)}`,
        lf: q => `https://www.legifrance.gouv.fr/search/code?tab_selection=code&searchField=ALL&query=${encodeURIComponent(q)}&page=1&init=true`,
    };
    /** l'adresse de recherche ('sp' Service-public, 'lf' Légifrance) ; '' si rien n'est tapé */
    const lawSearchUrl = (site, q) => { const s = String(q ?? '').trim(); return s && LAW_SEARCH[site] ? LAW_SEARCH[site](s) : ''; };
    /** un lien noté au journal : seulement https:// et un de ces hôtes, exactement (même règle que succ_law_link() côté serveur) */
    const LAW_HOSTS = ['www.legifrance.gouv.fr', 'www.service-public.gouv.fr', 'www.service-public.fr', 'eur-lex.europa.eu'];
    const LAW_LINK_RE = /^https:\/\/([a-z0-9.-]+)(?:[/?#][\w\-.~%!$&*+,;=:@/?#()[\]]*)?$/;
    const officialLink = u => { const s = String(u ?? '').trim(); const m = s.length <= 500 ? s.match(LAW_LINK_RE) : null; return m && LAW_HOSTS.includes(m[1]) ? s : ''; };
    /** une ligne « ⚖️ Doute sur la loi : « … » — https://… » du journal (kind 'law') : tout échappé, le lien cliquable seulement s'il est officiel */
    const escH = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    function lawJournalHtml(text) {
        const s = String(text ?? ''), m = s.match(/^([\s\S]*») — (\S+)$/), u = m ? officialLink(m[2]) : '';
        return u ? `${escH(m[1])} — <a class="succ-law" href="${escH(u)}" target="_blank" rel="noopener noreferrer" title="${escH(u)}">↗ ${({'www.legifrance.gouv.fr': 'Légifrance', 'eur-lex.europa.eu': 'EUR-Lex'})[u.match(LAW_LINK_RE)[1]] || 'Service-public.fr'}</a>` : escH(s);
    }

    /* ═════ ❔ Absents et disparus : le bon chemin ═════ */
    const ABSENCE = [
        {key: 'presume', art: '112', text: 'Présomption d’absence : le juge des tutelles la constate quand une personne a cessé de paraître sans donner de nouvelles. Elle est réputée vivante ; sa part est réservée et gérée.'},
        {key: 'declare', art: '122', text: 'Déclaration d’absence : 10 ans après le jugement de présomption (ou 20 ans sans nouvelles), le tribunal judiciaire la déclare ; le jugement a les effets d’un décès.'},
        {key: 'deces', art: '88', text: 'Jugement déclaratif de décès : pour une disparition dans des circonstances qui mettent la vie en danger (naufrage, catastrophe), sans attendre.'},
    ];
    /* ═════ 🌍 Héritiers à l'étranger : où écrire ═════ */
    const ABROAD = [
        {key: 'scec', text: 'Service central d’état civil (Nantes) : les actes des Français nés, mariés ou morts à l’étranger.'},
        {key: 'consulat', text: 'Le consulat de France du pays : registres d’immatriculation, actes transcrits récents.'},
        {key: 'pays', text: 'L’état civil du pays (mairie, registro civil, Standesamt…) : lettre dans la langue du pays.'},
        {key: 'archives', text: 'Archives nationales d’outre-mer (Aix-en-Provence) : colonies et Algérie avant 1962.'},
    ];
    /** une lettre courte dans la langue du pays (le corps ne passe pas par la traduction de l'app : c'est la langue du destinataire) */
    const ABROAD_LETTERS = {
        fr: 'Madame, Monsieur,\n\nDans le cadre du règlement d’une succession confiée à {notary}, je recherche l’acte de {act} de {person}, {when}.\nPourriez-vous m’en adresser une copie intégrale, ou m’indiquer le service compétent ?\n\nJe vous prie d’agréer mes salutations distinguées.\n\n{sender}',
        en: 'Dear Sir or Madam,\n\nIn connection with the settlement of an estate handled by {notary}, I am looking for the {act} record of {person}, {when}.\nCould you send me a full copy of this record, or tell me which office holds it?\n\nYours faithfully,\n\n{sender}',
        es: 'Señora, señor:\n\nCon motivo de la liquidación de una herencia a cargo de {notary}, busco el acta de {act} de {person}, {when}.\n¿Podrían enviarme una copia literal o indicarme el registro competente?\n\nAtentamente,\n\n{sender}',
        it: 'Gentile Signora, gentile Signore,\n\nnell’ambito della successione affidata a {notary}, cerco l’atto di {act} di {person}, {when}.\nPotreste inviarmene una copia integrale o indicarmi l’ufficio competente?\n\nDistinti saluti,\n\n{sender}',
        de: 'Sehr geehrte Damen und Herren,\n\nim Rahmen einer Nachlassangelegenheit, die {notary} betreut, suche ich die {act}surkunde von {person}, {when}.\nKönnten Sie mir eine vollständige Abschrift zusenden oder mir die zuständige Stelle nennen?\n\nMit freundlichen Grüßen\n\n{sender}',
        pt: 'Exma. Senhora, Exmo. Senhor,\n\nNo âmbito da partilha de uma herança a cargo de {notary}, procuro o registo de {act} de {person}, {when}.\nPoderiam enviar-me uma certidão de cópia integral ou indicar-me o serviço competente?\n\nCom os melhores cumprimentos,\n\n{sender}',
    };
    const ABROAD_ACTS = {fr: {N: 'naissance', M: 'mariage', D: 'décès'}, en: {N: 'birth', M: 'marriage', D: 'death'}, es: {N: 'nacimiento', M: 'matrimonio', D: 'defunción'}, it: {N: 'nascita', M: 'matrimonio', D: 'morte'}, de: {N: 'Geburt', M: 'Heirat', D: 'Sterbe'}, pt: {N: 'nascimento', M: 'casamento', D: 'óbito'}};
    const abroadLetter = (lang, v) => fill(ABROAD_LETTERS[lang] || ABROAD_LETTERS.fr, {...v, act: (ABROAD_ACTS[lang] || ABROAD_ACTS.fr)[v.actKind || 'N']});


    /* ═════ ⚖️ Dossiers : avancement, fiches rattachées, ordre des dossiers (docs/design/successoral-dossiers.html, 3a, 6b, 7) ═════ */
    const STEP_KEYS = ['deceased', 'tree', 'heirs', 'addresses', 'contracts', 'pieces', 'notary'];
    const STEP_LABELS = ['Défunt et acte de décès', 'Arbre de dévolution', 'Héritiers trouvés', 'Adresses', 'Contrats signés', 'Pièces', 'Remis au notaire'];
    const WEIGHTS = [10, 15, 20, 10, 15, 20, 10];
    const TO_FIND = new Set(['unknown', 'branch', 'parents', 'kids', 'lit', 'nodesc', 'adoption', 'marriage']);
    /** le % d'une liste de fractions (0 à 1) pondérées ; arrondi à l'entier */
    function progressPct(fracs, weights = WEIGHTS) {
        const w = (Array.isArray(weights) && weights.length === 7 ? weights : WEIGHTS).map(x => Math.max(0, Number(x) || 0));
        const tot = w.reduce((a, b) => a + b, 0) || 1;
        return Math.round(fracs.reduce((s, f, i) => s + w[i] * Math.max(0, Math.min(1, Number(f) || 0)), 0) / tot * 100);
    }
    /**
     * L'avancement d'un dossier : 7 étapes pondérées, chacune faite en partie (0 à 1). Un dossier clos vaut 100 %.
     * D : le dossier (state, deceased_id, hypothesis_note, addresses, courriers) ; R : compute() ; P : pieces().
     * opts.weights : les 7 poids (10, 15, 20, 10, 15, 20, 10) ; opts.refuseDone : un héritier qui refuse de signer compte comme fait.
     * D.contact : {id: {state, at}} ; un héritier « 🔎 introuvable » ou « 🔇 ne répond pas » ne compte pas comme contacté : ni
     * fait à l'étape 5 (même s'il a refusé ou signé un courrier), ni « adresse trouvée » à l'étape 4 s'il est introuvable.
     */
    function progress(D, R, P, opts = {}) {
        const weights = Array.isArray(opts.weights) && opts.weights.length === 7 ? opts.weights : WEIGHTS;
        const refuseDone = opts.refuseDone !== false;
        const closed = ['clos', 'archive'].includes(D?.state);
        const rows = R && !R.error ? R.rows : [];
        const heirs = rows.filter(r => ['heir', 'parent', 'spouse'].includes(r.role) && r.share !== '0');
        const known = heirs.filter(r => !r.unknown);
        const living = known.filter(r => ['surv', 'abs'].includes(r.timing));
        const addr = D?.addresses || {};
        const cst = id => contactOf(D, id).state;
        const withAddr = living.filter(r => (addr[r.id] || addr[String(r.id)]) && cst(r.id) !== 'introuvable');
        const cs = D?.courriers || [];
        const signed = living.filter(r => cs.some(c => Number(c.person_id) === r.id && c.kind !== 'acte' && (c.signe_le || (refuseDone && c.reponse === 'no'))));
        const deathHave = P ? (P.list || []).some(i => i.key === 'D:' + D.deceased_id && i.state === 'have') : false;
        const search = (R?.search || []).filter(s => TO_FIND.has(s.kind));
        const groups = P ? (P.groups || []).filter(g => g.key !== 'common' && !g.exclude).length : 0;
        const branches = Math.max(groups + (R?.search || []).filter(s => s.kind === 'branch').length, search.length, 1);
        const note = String(D?.hypothesis_note || '').trim();
        const treeFrac = !R || R.error ? 0 : note ? 1 : (R.totalOk && !search.length ? 1 : Math.max(0, 1 - search.length / branches));
        const pc = P?.counts || {have: 0, total: 0};
        const steps = [
            {frac: (D?.deceased_id ? 0.5 : 0) + (deathHave ? 0.5 : 0), done: (D?.deceased_id ? 1 : 0) + (deathHave ? 1 : 0), total: 2},
            {frac: treeFrac, done: Math.max(0, branches - search.length), total: branches},
            {frac: heirs.length ? known.length / heirs.length : 0, done: known.length, total: heirs.length},
            {frac: living.length ? withAddr.length / living.length : 0, done: withAddr.length, total: living.length},
            {frac: living.length ? signed.length / living.length : 0, done: signed.length, total: living.length},
            {frac: pc.total ? pc.have / pc.total : 0, done: pc.have || 0, total: pc.total || 0},
            {frac: ['remis', 'clos', 'archive'].includes(D?.state) ? 1 : 0, done: ['remis', 'clos', 'archive'].includes(D?.state) ? 1 : 0, total: 1},
        ].map((s, i) => ({key: STEP_KEYS[i], w: Number(weights[i]) || 0, ...s, frac: closed ? 1 : Math.round(Math.max(0, Math.min(1, s.frac)) * 1000) / 1000}));
        return {pct: closed ? 100 : progressPct(steps.map(s => s.frac), weights), steps, pieces: {have: pc.have || 0, total: pc.total || 0}, heirs: {found: known.length, unknown: heirs.length - known.length}};
    }
    /* ═════ 🔎 Héritier introuvable, 🔇 ne répond pas : l'« absent » au sens pratique (pas la présomption d'absence, art. 112) ═════ */
    const CONTACT_STATES = ['', 'introuvable', 'silence'];
    const CONTACT_LOST = new Set(['introuvable', 'silence']);
    /** l'état de contact d'un héritier dans un dossier : {state, at} (D.contact, lu dans succ_case_persons) */
    const contactOf = (D, id) => { const c = D?.contact?.[id] || D?.contact?.[String(id)] || null; return {state: CONTACT_STATES.includes(c?.state) ? c.state : '', at: String(c?.at || '')}; };
    /** introuvable depuis plus d'un an (365 jours) : suggérer la présomption d'absence (❔ Absent ou disparu) */
    function contactStale(c, today = new Date().toISOString().slice(0, 10)) {
        if (c?.state !== 'introuvable') return false;
        const a = dayNum(String(c.at || '').slice(0, 10)), b = dayNum(String(today).slice(0, 10));
        return a != null && b != null && b - a > 365;
    }
    /** ce que le calcul parcourt : les héritiers (avec une part) et les intermédiaires (souches, écartés, ancêtres jusqu'à l'ancêtre commun) */
    function members(R) {
        if (!R || R.error || !R._ctx) return {heirs: [], inter: []};
        const C = R._ctx, dead = C.dead;
        const heirs = new Set(R.rows.filter(r => ['heir', 'parent', 'spouse'].includes(r.role) && r.share !== '0').map(r => r.id));
        const inter = new Set(R.rows.filter(r => !heirs.has(r.id)).map(r => r.id));
        const climb = (from, to, depth) => { if (from === to) return [from]; if (depth <= 0) return null; for (const p of C.legalParents(from)) { const r = climb(p, to, depth - 1); if (r) return [from, ...r]; } return null; };
        for (const id of [...heirs, ...inter]) {
            const rel = relation(C, id); if (!rel || rel.anc == null) continue;
            (climb(dead, rel.anc, rel.a) || []).forEach(x => inter.add(x));
            (climb(id, rel.anc, rel.b) || []).forEach(x => inter.add(x));
        }
        heirs.forEach(x => inter.delete(x)); inter.delete(dead);
        const real = x => !!C.G.P[x];
        return {heirs: [...heirs].filter(real), inter: [...inter].filter(real)};
    }
    /** l'ordre des dossiers de la vue « ⚖️ Par dossier » : A → Z (n°, puis nom du défunt) ou à la main (les nouveaux à la fin) */
    function orderCases(cases, view = {}) {
        const az = [...cases].sort((a, b) => String(a.number || '').localeCompare(String(b.number || ''), 'fr', {numeric: true}) || String(a.deceased || '').localeCompare(String(b.deceased || ''), 'fr') || a.id - b.id);
        if (view.order !== 'hand') return az;
        const hand = (Array.isArray(view.hand) ? view.hand : []).map(Number);
        const pos = id => { const i = hand.indexOf(Number(id)); return i < 0 ? Infinity : i; };
        return az.map((c, i) => ({c, i})).sort((x, y) => (pos(x.c.id) - pos(y.c.id)) || (x.i - y.i)).map(x => x.c);
    }
    /** déplacer un dossier dans l'ordre à la main (Alt + ↑ / ↓, ⠿) : la nouvelle liste des n° de dossiers */
    function moveCase(orderIds, id, delta) {
        const list = orderIds.map(Number), i = list.indexOf(Number(id)); if (i < 0) return list;
        const j = Math.max(0, Math.min(list.length - 1, i + delta)); if (i === j) return list;
        list.splice(j, 0, list.splice(i, 1)[0]); return list;
    }

    return {LAW_HOSTS, lawSearchUrl, officialLink, lawJournalHtml, CONTACT_STATES, contactOf, contactStale, withoutPrivate, STEP_KEYS, STEP_LABELS, WEIGHTS, progress, progressPct, members, orderCases, moveCase, LAW, LAW_ARTICLES, lawUrl, lawVerified, lawCited, lawLinks, F, add, sub, mul, div, str, parse, pct, sumAll, cmpDate, kinLabel, DEGREES, compute, relation, pieces, checklist, snapshot, diffLines, csvCell, journalCsv, fees, ABSENCE, ABROAD, abroadLetter, ABROAD_LETTERS, name, KIN};
});
