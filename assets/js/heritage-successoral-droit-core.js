/* LCNDA — ⚖️ Généalogiste successoral : le droit en plus, sans écran (window.LCNDA_SUCC_DROIT ; aussi require() dans Node).
 * Maquette : docs/design/idees-suite.html, partie 3. Tout est INDICATIF, à faire vérifier par le notaire (c'est écrit à l'écran).
 * Il part du calcul du moteur (heritage-successoral-core.js, droit d'aujourd'hui) et ajoute :
 *  - ⚖️ la loi de l'époque du décès : avant le 1er juillet 2002 (loi du 3 décembre 2001), le conjoint n'avait que l'usufruit
 *    (¼ avec des descendants, ½ sinon ; ancien art. 767) sauf s'il était seul ; enfants « naturels » (½ part avant le
 *    1er août 1972, loi du 3 janvier 1972) et « adultérins » (rien avant 1972, ½ part jusqu'en 2002) — la filiation se déduit des
 *    mariages, et se corrige à la main ; collatéraux jusqu'au 12e degré avant 1918 (loi du 31 décembre 1917 : 6e) ;
 *  - 📜 testament et donations : réserve et quotité disponible (art. 912-914-1), donation entre époux (art. 1094-1 : ¼ en propriété
 *    et ¾ en usufruit, tout en usufruit, ou la quotité disponible en propriété), legs, donations rapportables ou hors part,
 *    réduction des libéralités qui dépassent (art. 920 et suivants), en euros (l'actif retapé, jamais gardé) ;
 *  - 🔗 les successions en cascade : un héritier mort après le défunt sans avoir réglé : sa part va à ses propres héritiers ;
 *  - 💍 le régime matrimonial : communauté (la moitié des biens communs au conjoint d'abord), séparation, communauté universelle
 *    avec attribution intégrale (rien aux héritiers avant le second décès) ;
 *  - 🏠 droits du conjoint (logement 1 an, viager), droit de retour (art. 738-2, 757-3) : des rappels et des montants ;
 *  - 💶 une estimation des droits de succession (abattements et barèmes de l'article 777 du CGI, valeurs de 2024) et les délais ;
 *  - 🌍 un défunt qui vivait à l'étranger : le règlement européen 650/2012 (loi de la dernière résidence habituelle) — un avertissement.
 * Essai : tests/test-successoral-droit.js.
 */
(function (root, factory) {
    const m = factory();
    if (typeof module === 'object' && module.exports) module.exports = m;
    if (root) root.LCNDA_SUCC_DROIT = m;
})(typeof window !== 'undefined' ? window : null, () => {
    'use strict';
    const fill = (s, v) => String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m));
    const T0 = (s, v) => fill(s, v);

    /* ═════ fractions exactes ═════ */
    const gcd = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) { [a, b] = [b, a % b]; } return a || 1n; };
    const F = (n, d = 1n) => { n = BigInt(n); d = BigInt(d); if (d < 0n) { n = -n; d = -d; } const g = gcd(n, d); return {n: n / g, d: d / g}; };
    const ZERO = F(0), ONE = F(1);
    const add = (a, b) => F(a.n * b.d + b.n * a.d, a.d * b.d), sub = (a, b) => F(a.n * b.d - b.n * a.d, a.d * b.d), mul = (a, b) => F(a.n * b.n, a.d * b.d), dv = (a, b) => F(a.n * b.d, a.d * b.n);
    const parse = s => { const m = String(s ?? '0').match(/^(-?\d+)(?:\/(\d+))?$/); return m ? F(BigInt(m[1]), BigInt(m[2] || 1)) : ZERO; };
    const str = a => (a.d === 1n ? String(a.n) : `${a.n}/${a.d}`);
    const num = a => Number(a.n) / Number(a.d);
    const isZero = a => a.n === 0n;
    const sum = l => l.reduce((s, x) => add(s, x), ZERO);
    const dkey = d => { const m = String(d || '').match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/); return m ? `${m[1]}-${m[2] || '06'}-${m[3] || '15'}` : ''; };
    const before = (d, x) => { const k = dkey(d); return !!k && k < x; };

    /* ═════ ⚖️ la loi de l'époque ═════ */
    const REGIMES = {
        today: {label: 'Droit d’aujourd’hui (depuis le 1er janvier 2007)'},
        y2002: {label: 'Loi du 3 décembre 2001 (décès du 1er juillet 2002 au 31 décembre 2006)', notes: ['Avant le 1er janvier 2007, on ne représentait pas un héritier qui renonçait (ancien art. 744) : ses enfants ne viennent pas à sa place.']},
        y1972: {label: 'Loi du 3 janvier 1972 (décès du 1er août 1972 au 30 juin 2002)', notes: ['Le conjoint survivant n’avait que l’usufruit : ¼ avec des descendants, ½ avec des père, mère, frères ou sœurs (ancien art. 767) ; la propriété seulement sans parents au degré successible.', 'Un enfant adultérin en concours avec les enfants du mariage n’avait que la moitié de sa part (ancien art. 760).']},
        y1918: {label: 'Avant la loi du 3 janvier 1972 (décès avant le 1er août 1972)', notes: ['Le conjoint survivant n’avait que l’usufruit (lois de 1891 et 1930).', 'L’enfant naturel reconnu avait la moitié de la part d’un enfant légitime (loi du 25 mars 1896) ; l’enfant adultérin n’héritait pas (seulement des aliments).']},
        y1917: {label: 'Avant la loi du 31 décembre 1917', notes: ['Les collatéraux succédaient jusqu’au 12e degré (et non 6e) : des cousins plus éloignés peuvent hériter.', 'Le conjoint survivant n’avait que l’usufruit.', 'L’enfant naturel reconnu avait la moitié de la part d’un enfant légitime ; l’enfant adultérin n’héritait pas.']},
    };
    const regimeOf = death => (!dkey(death) ? 'today' : before(death, '1918-01-01') ? 'y1917' : before(death, '1972-08-01') ? 'y1918' : before(death, '2002-07-01') ? 'y1972' : before(death, '2007-01-01') ? 'y2002' : 'today');
    /** la filiation d'un enfant du défunt : 'legitime' | 'naturelle' | 'adulterine' (déduite des mariages, à corriger à la main) */
    function filiationOf(graph, deadId, childId, overrides = {}) {
        const o = overrides[childId]?.filiation; if (['legitime', 'naturelle', 'adulterine'].includes(o)) return o;
        const P = graph.persons || {}, c = P[childId] || {}, born = c.birth?.date || (c.birth?.year ? String(c.birth.year) : '');
        const parents = (graph.parents || []).filter(l => Number(l.child) === Number(childId) && !['foster', 'step'].includes(l.rel)).map(l => Number(l.parent));
        const other = parents.find(p => p !== Number(deadId));
        const marriedAt = (a, b) => (graph.unions || []).find(u => ((Number(u.a) === a && Number(u.b) === b) || (Number(u.a) === b && Number(u.b) === a)) && u.married !== false && !u.free);
        const u = other ? marriedAt(Number(deadId), other) : null;
        if (u && (!u.marriage?.date || !born || dkey(u.marriage.date) <= dkey(born))) return 'legitime';
        if (u && born && dkey(u.marriage.date) > dkey(born)) return 'legitime'; // légitimé par le mariage
        // le défunt (ou l'autre parent) marié à quelqu'un d'autre à la naissance : adultérin
        const marriedElse = id => (graph.unions || []).some(x => (Number(x.a) === id || Number(x.b) === id) && x.married !== false && !x.free && (!born || !x.marriage?.date || dkey(x.marriage.date) <= dkey(born)) && (!x.divorced || !born || !x.divorce?.date || dkey(x.divorce.date) > dkey(born)) && ![Number(x.a), Number(x.b)].includes(other || -1));
        if (marriedElse(Number(deadId)) || (other && marriedElse(other))) return 'adulterine';
        return 'naturelle';
    }
    const WEIGHT = {today: {legitime: 1, naturelle: 1, adulterine: 1}, y2002: {legitime: 1, naturelle: 1, adulterine: 1}, y1972: {legitime: 1, naturelle: 1, adulterine: F(1, 2)}, y1918: {legitime: 1, naturelle: F(1, 2), adulterine: 0}, y1917: {legitime: 1, naturelle: F(1, 2), adulterine: 0}};
    /**
     * historical(R, graph, {overrides, regime, recompute}) → {regime, label, notes, shares: [{id, share, role, usufruct}]}
     *  R : le calcul d'aujourd'hui (S().compute) ; recompute(opts) : refaire le calcul (pour enlever le conjoint en propriété).
     */
    function historical(R, graph, {overrides = {}, regime = null, recompute = null, t = T0} = {}) {
        const reg = regime || regimeOf(R.deathDate), out = {regime: reg, label: t(REGIMES[reg].label), notes: (REGIMES[reg].notes || []).map(x => t(x)), shares: [], warnings: []};
        let rows = R.rows.filter(r => !isZero(parse(r.share))).map(r => ({id: r.id, name: r.name, kin: r.kin, share: parse(r.share), role: r.role, depth: r.depth}));
        if (reg === 'today' || reg === 'y2002') { out.shares = rows; if (reg === 'y2002') out.warnings.push(t('Si un héritier a renoncé, ses enfants ne le représentent pas : vérifie les renonciations.')); return out; }
        // le conjoint : l'usufruit seulement, sauf s'il est seul
        const sp = rows.find(r => r.role === 'spouse');
        if (sp && recompute) {
            const R2 = recompute({spouse: {[sp.id]: 'not'}}), others = R2.rows.filter(r => !isZero(parse(r.share)) && r.id !== sp.id);
            if (others.length) { rows = others.map(r => ({id: r.id, name: r.name, kin: r.kin, share: parse(r.share), role: r.role, depth: r.depth})); rows.unshift({id: sp.id, name: sp.name, kin: sp.kin, share: ZERO, role: 'spouse', usufruct: R2.order === 1 ? F(1, 4) : F(1, 2)}); out.notes.push(t('Le conjoint reçoit l’usufruit de {u} (pas de propriété) : la propriété va aux parents par le sang.', {u: R2.order === 1 ? t('un quart') : t('la moitié')})); }
        }
        // les enfants du défunt : légitimes, naturels, adultérins
        const W = WEIGHT[reg], kids = rows.filter(r => r.role !== 'spouse' && R.order === 1);
        if (kids.length) {
            const P = graph.persons || {}, parentsOf = id => (graph.parents || []).filter(l => Number(l.child) === Number(id) && !['foster', 'step'].includes(l.rel)).map(l => Number(l.parent));
            const soucheOf = id => { let x = Number(id), guard = 0; while (guard++ < 30) { const ps = parentsOf(x); if (ps.includes(Number(R.deceased))) return x; const nx = ps.find(p => !!P[p]); if (!nx) return null; x = nx; } return null; };
            const souches = new Map(); kids.forEach(r => { const s = soucheOf(r.id); if (s === null) return; if (!souches.has(s)) souches.set(s, []); souches.get(s).push(r); });
            const fil = new Map([...souches.keys()].map(s => [s, filiationOf(graph, R.deceased, s, overrides)]));
            if ([...fil.values()].some(f => f !== 'legitime') && [...fil.values()].some(f => f === 'legitime' || reg !== 'y1972')) {
                const w = s => { const x = W[fil.get(s)]; return typeof x === 'number' ? F(x) : x; }, total = sum([...souches.keys()].map(w)), pot = sum(kids.map(r => r.share));
                if (!isZero(total)) souches.forEach((rs, s) => { const old = sum(rs.map(r => r.share)), part = mul(pot, dv(w(s), total)); rs.forEach(r => { r.share = isZero(old) ? ZERO : mul(part, dv(r.share, old)); }); });
                fil.forEach((f, s) => { if (f !== 'legitime') out.notes.push(t('{n} : enfant {f} — part {k} (à vérifier : la filiation se corrige dans ⚖️ Droit et parts).', {n: P[s] ? `${P[s].first || ''} ${String(P[s].last || '').toUpperCase()}`.trim() : s, f: t(f === 'naturelle' ? 'naturel' : 'adultérin'), k: str(w(s)) === '1' ? t('entière') : str(w(s)) === '0' ? t('nulle') : t('moitié')})); });
            }
        }
        if (reg === 'y1917' && R.escheat) out.warnings.push(t('Avant 1918 : cherche des collatéraux jusqu’au 12e degré avant de conclure à la déshérence.'));
        out.shares = rows.filter(r => !isZero(r.share) || r.usufruct);
        return out;
    }

    /* ═════ 📜 testament, donations, réserve, quotité disponible (en euros) ═════ */
    /** la réserve des descendants (art. 913) ou du conjoint seul (art. 914-1) */
    function reserveOf(childrenCount, hasSpouse) { // hasSpouse : le conjoint seul réservataire (sans descendant ni père ni mère, art. 914-1)
        if (childrenCount >= 3) return F(3, 4); if (childrenCount === 2) return F(2, 3); if (childrenCount === 1) return F(1, 2);
        return hasSpouse ? F(1, 4) : ZERO;
    }
    const cents = v => Math.round(Number(v || 0) * 100);
    const eur = c => c / 100;
    /**
     * liberalites({net, shares: [{id, share (fraction), role}], childrenCount, spouseId, donations: [{to, amount, hors: bool}], legs: [{to, kind: 'amount' | 'fraction' | 'qd', amount, fraction}], spouseDonation: '' | 'quart_pp_usu' | 'usu' | 'qd'})
     * → {masse, reserve, qd, rows: [{id, abIntestat, rapport, legs, recu, reduit}], reductions: [...], notes}
     */
    const usuPct = age => (age < 21 ? .9 : age < 31 ? .8 : age < 41 ? .7 : age < 51 ? .6 : age < 61 ? .5 : age < 71 ? .4 : age < 81 ? .3 : age < 91 ? .2 : .1); // art. 669 du CGI
    function liberalites({net = 0, shares = [], childrenCount = 0, spouseId = 0, donations = [], legs = [], spouseDonation = '', usufructAge = 70, t = T0} = {}) {
        const netC = cents(net), dons = donations.map(d => ({to: Number(d.to), c: Math.max(0, cents(d.amount)), hors: !!d.hors})), notes = [];
        const masse = netC + dons.reduce((x, d) => x + d.c, 0); // la masse de calcul (art. 922) : les biens + toutes les donations
        const hasParents = shares.some(x => x.role === 'parent'), resF = reserveOf(childrenCount, !!spouseId && !childrenCount && !hasParents), res = Math.round(masse * num(resF)), qd = masse - res;
        // 1. la donation entre époux (art. 1094-1) : la part en pleine propriété s'impute sur la quotité disponible ; l'usufruit grève les parts des héritiers
        let spousePP = 0, spouseUsu = 0; const up = usuPct(usufructAge);
        if (spouseId && spouseDonation === 'qd') { spousePP = qd; notes.push(t('Donation entre époux : la quotité disponible en pleine propriété.')); }
        if (spouseId && spouseDonation === 'quart_pp_usu') { spousePP = Math.round(masse / 4); spouseUsu = Math.round((masse - spousePP) * up); notes.push(t('Donation entre époux : ¼ en pleine propriété et ¾ en usufruit (usufruit estimé à {p} % selon l’âge, art. 669 du CGI).', {p: String(Math.round(up * 100))})); }
        if (spouseId && spouseDonation === 'usu') { spouseUsu = Math.round(masse * up); notes.push(t('Donation entre époux : l’usufruit de tout (estimé à {p} % selon l’âge, art. 669 du CGI).', {p: String(Math.round(up * 100))})); }
        // 2. les autres libéralités sur ce qui reste de la quotité disponible : dons hors part, puis legs ; réduction si ça dépasse (art. 920, 923, 926)
        const room = Math.max(0, qd - spousePP), hors = dons.filter(d => d.hors), horsTot = hors.reduce((x, d) => x + d.c, 0), reductions = [];
        const legsC = legs.map(l => ({to: Number(l.to), c: l.kind === 'fraction' ? Math.round(netC * num(parse(l.fraction))) : l.kind === 'qd' ? room : Math.max(0, cents(l.amount)), kind: l.kind || 'amount'}));
        const legsTot = legsC.reduce((x, l) => x + l.c, 0), legsRoom = Math.max(0, room - horsTot);
        if (legsTot > legsRoom) { legsC.forEach(l => { const keep = legsTot ? Math.floor(l.c * legsRoom / legsTot) : 0; reductions.push({to: l.to, kind: 'legs', from: eur(l.c), to_c: eur(keep)}); l.c = keep; }); notes.push(t('Les legs dépassent la quotité disponible : ils sont réduits au marc l’euro (art. 926).')); }
        if (horsTot > room) { hors.forEach(d => { const keep = Math.floor(d.c * room / horsTot); reductions.push({to: d.to, kind: 'don', from: eur(d.c), to_c: eur(keep)}); d.c = keep; }); notes.push(t('Les donations hors part dépassent la quotité disponible : elles sont réduites (en vrai, de la plus récente à la plus ancienne, art. 923).')); }
        // 3. le reste (en pleine propriété) se partage selon la loi ; les donations rapportables sont déjà reçues (art. 843)
        const outPP = spousePP + hors.reduce((x, d) => x + d.c, 0) + legsC.reduce((x, l) => x + l.c, 0), rest = Math.max(0, masse - outPP);
        const law = shares.filter(x => x.role !== 'spouse' || !spouseDonation), lawTot = sum(law.map(x => typeof x.share === 'string' ? parse(x.share) : x.share));
        const rows = new Map(), row = id => { if (!rows.has(id)) rows.set(id, {id, abIntestat: 0, rapport: 0, liberalites: 0, usufruit: 0}); return rows.get(id); };
        law.forEach(x => { const sh = typeof x.share === 'string' ? parse(x.share) : x.share; row(Number(x.id)).abIntestat = isZero(lawTot) ? 0 : Math.floor(rest * num(dv(sh, lawTot))); });
        dons.filter(d => !d.hors).forEach(d => { row(d.to).rapport += d.c; });
        hors.forEach(d => { row(d.to).liberalites += d.c; }); legsC.forEach(l => { row(l.to).liberalites += l.c; });
        if (spouseId && spouseDonation) { const r = row(Number(spouseId)); r.liberalites += spousePP; r.usufruit = spouseUsu; }
        if (spouseUsu) notes.push(t('Les héritiers reçoivent leur part en nue-propriété pour ce qui est en usufruit : la colonne « Usufruit » est la valeur gardée par le conjoint.'));
        const outRows = [...rows.values()].map(r => ({id: r.id, abIntestat: eur(r.abIntestat), rapport: eur(r.rapport), liberalites: eur(r.liberalites), usufruit: eur(r.usufruit), aRecevoir: eur(r.abIntestat + r.liberalites - r.rapport)}));
        return {masse: eur(masse), reserve: eur(res), reserveFraction: str(resF), qd: eur(qd), rows: outRows, reductions, notes};
    }

    /* ═════ 💍 le régime matrimonial : ce qui entre dans la succession ═════ */
    function regime({kind = 'communaute', propres = 0, communs = 0, attribution = false, t = T0} = {}) {
        const p = cents(propres), c = cents(communs);
        if (kind === 'separation') return {succession: eur(p), conjointAvant: 0, note: t('Séparation de biens : chacun garde ses biens ; la succession = les biens du défunt.')};
        if (kind === 'universelle' && attribution) return {succession: 0, conjointAvant: eur(p + c), note: t('Communauté universelle avec attribution intégrale : tout va au conjoint ; les héritiers recevront au second décès (sauf action en retranchement d’un enfant d’un autre lit).')};
        if (kind === 'universelle') return {succession: eur(Math.round((p + c) / 2)), conjointAvant: eur(Math.round((p + c) / 2)), note: t('Communauté universelle sans attribution : la moitié de tout au conjoint, l’autre moitié est la succession.')};
        return {succession: eur(p + Math.round(c / 2)), conjointAvant: eur(c - Math.round(c / 2)), note: t('Communauté (légale ou réduite aux acquêts) : la moitié des biens communs au conjoint d’abord ; la succession = les biens propres du défunt + l’autre moitié.')};
    }

    /* ═════ 💶 les droits de succession (estimation, art. 777 et 779 du CGI, valeurs de 2024) ═════ */
    const ABAT = {conjoint: Infinity, enfant: 100000, parent: 100000, petitenfant: 1594, frere: 15932, neveu: 7967, autre: 1594, handicap: 159325};
    const BAREME = {ligne: [[8072, .05], [12109, .10], [15932, .15], [552324, .20], [902838, .30], [1805677, .40], [Infinity, .45]], frere: [[24430, .35], [Infinity, .45]], parent4: [[Infinity, .55]], autre: [[Infinity, .60]]};
    /** le lien fiscal d'un héritier d'après sa ligne du tableau (rôle, a, b, degré) */
    const lienOf = r => (r.role === 'spouse' ? 'conjoint' : r.a === 0 && r.b === 1 ? 'enfant' : r.a === 0 && r.b >= 2 ? (r.via === 'repr' ? 'enfant' : 'petitenfant') : r.b === 0 && r.a >= 1 ? 'parent' : r.a === 1 && r.b === 1 ? 'frere' : r.a === 1 && r.b === 2 ? 'neveu' : (r.deg || 99) <= 4 ? 'parent4' : 'autre');
    function droits(montant, lien, {handicap = false, frereExonere = false} = {}) {
        if (lien === 'conjoint' || frereExonere) return {abattement: 0, taxable: 0, droits: 0, exonere: true};
        const ab = (ABAT[lien] ?? (lien === 'parent4' ? 1594 : ABAT.autre)) + (handicap ? ABAT.handicap : 0), taxable = Math.max(0, montant - ab);
        const sc = lien === 'enfant' || lien === 'parent' || lien === 'petitenfant' ? BAREME.ligne : lien === 'frere' ? BAREME.frere : lien === 'parent4' || lien === 'neveu' ? BAREME.parent4 : BAREME.autre; // neveu, nièce : 3e degré, 55 %
        let rest = taxable, low = 0, tax = 0;
        for (const [hi, rate] of sc) { const slice = Math.min(rest, hi - low); if (slice <= 0) break; tax += slice * rate; rest -= slice; low = hi; }
        return {abattement: ab, taxable, droits: Math.round(tax), exonere: false};
    }
    /** les délais : déclaration dans les 6 mois (12 hors de France métropolitaine) */
    function delais(deathIso, {abroad = false, today = new Date()} = {}) {
        const m = String(deathIso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return null;
        const d = new Date(Date.UTC(+m[1], +m[2] - 1 + (abroad ? 12 : 6), +m[3])), iso = d.toISOString().slice(0, 10), days = Math.round((d - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / 864e5);
        return {declaration: iso, days, late: days < 0};
    }

    /* ═════ 🔗 successions en cascade ═════ */
    /**
     * cascade(shares, graph, {deathDate, compute(graph, opts) (le moteur), depth}) : un héritier mort APRÈS le défunt passe sa part à ses héritiers.
     * → {shares: [{id, share, via: [ids]}], steps: [{from, date, to: [{id, share}]}]}
     */
    function cascade(shares, graph, {deathDate = '', compute, depth = 2, t = T0} = {}) {
        const P = graph.persons || {}, steps = [];
        const deadAfter = id => { const d = P[id]?.death; const dd = d?.date || (d?.year ? String(d.year) : ''); return dd && dkey(dd) > dkey(deathDate) ? dd : ''; };
        const go = (list, level, seen) => {
            const out = [];
            list.forEach(s => {
                const dd = level < depth && compute ? deadAfter(s.id) : '';
                if (!dd || seen.has(s.id)) { out.push(s); return; }
                const R2 = compute(graph, {deceasedId: s.id, deathDate: dkey(dd)});
                const sub = (R2?.rows || []).filter(r => !isZero(parse(r.share)) && r.id !== s.id);
                if (!sub.length) { out.push(s); return; }
                steps.push({from: s.id, date: dd, to: sub.map(r => ({id: r.id, share: str(mul(s.share, parse(r.share)))}))});
                out.push(...go(sub.map(r => ({id: r.id, share: mul(s.share, parse(r.share)), via: [...(s.via || []), s.id], role: r.role})), level + 1, new Set([...seen, s.id])));
            });
            return out;
        };
        const flat = go(shares.map(s => ({...s, share: typeof s.share === 'string' ? parse(s.share) : s.share})), 0, new Set());
        const merged = new Map(); flat.forEach(s => { if (merged.has(s.id)) merged.get(s.id).share = add(merged.get(s.id).share, s.share); else merged.set(s.id, {...s}); });
        return {shares: [...merged.values()], steps, total: str(sum([...merged.values()].map(s => s.share)))};
    }

    /* ═════ 🌍 l'étranger ═════ */
    function abroad({residence = '', biensEtranger = false, nationalite = '', t = T0} = {}) {
        const out = [];
        const r = String(residence || '').trim().toLowerCase();
        if (r && !/^(fr|france)$/.test(r)) out.push(t('Dernière résidence habituelle hors de France ({c}) : pour un décès depuis le 17 août 2015, la loi applicable est en principe celle de ce pays (règlement européen 650/2012, art. 21), sauf choix de la loi nationale par testament (art. 22). Le calcul ci-dessus suit la loi française : à vérifier.', {c: residence}));
        if (biensEtranger) out.push(t('Des biens à l’étranger : un immeuble peut suivre la loi du pays où il se trouve (décès avant le 17 août 2015) ; des droits peuvent être dus là-bas aussi (conventions fiscales).'));
        if (nationalite && !/^(fr|francaise|française|france)$/i.test(String(nationalite).trim())) out.push(t('Nationalité étrangère : le défunt a pu choisir sa loi nationale par testament (art. 22 du règlement 650/2012).'));
        return out;
    }

    return {F, parse, str, num, REGIMES, regimeOf, filiationOf, historical, reserveOf, liberalites, regime, ABAT, BAREME, lienOf, droits, delais, cascade, abroad};
});
