/* LCNDA — 🔍 Erreurs de la lecture automatique (SocFace, ✨ Lire l'acte) : calculs purs, sans réseau ni page.
 * window.LCNDA_LECTURE (navigateur) ou require() (Node, tests/test-socface.js).
 *
 * Une écriture à la main lue par une machine se trompe toujours de la même façon : des lettres qui se ressemblent
 * (u/n, m/rn, a/o, e/c, i/l/t, ſ/f, v/r, cl/d, h/b, majuscules anciennes S/L, I/J, T/F), des chiffres qui se ressemblent
 * (1/7, 3/8, 5/6, 0/6/9, 4/9), des colonnes décalées (une profession dans la case du prénom), des abréviations non
 * développées (« cult. », « jlier », « Vve », « id. », « d° »). Ce fichier repère ces doutes et propose une correction ;
 * il ne change jamais rien lui-même : l'écran montre la proposition, la personne clique (et peut faire ↶ Annuler).
 *
 *  - readingCost(a, b)          coût de lecture de a en b (0 = pareil ; une confusion connue coûte 0,3 ; une autre lettre 1)
 *  - why(a, b)                  la phrase « « n » lu au lieu de « u » »
 *  - suggest(mot, dico, o)      les formes les plus proches d'un dictionnaire (prénoms, noms, communes…), plusieurs choix
 *  - digitVariants(n)           les lectures possibles d'un nombre mal lu (1↔7, 3↔8, 5↔6, 0↔6↔9, 4↔9)
 *  - expandAbbrev(texte)        « cult. » → cultivateur, « Vve » → veuve… ; isIdem(« id. », « d° »)
 *  - checkHousehold(lignes, ctx) les doutes d'un ménage : {row, field, level: 'yellow'|'orange', why, value, proposals}
 *  - checkHouseholds(ménages, ctx) la même chose pour plusieurs ménages, plus « ménage coupé au changement de page »
 *  - checkWords(texte, ctx)      la relecture d'un texte libre (✨ Lire l'acte) : abréviations et noms proches
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.LCNDA_LECTURE = api;
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';

    const i18n = (s, v) => { const I = (typeof window !== 'undefined' ? window : globalThis).LCNDA_I18N; if (v) v = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'number' ? String(x) : x])); return I ? I.t(s, v) : (v ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)) : s); }; // 🌐 textes traduits (docs/I18N.md) ; nombres gardés tels quels
    const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ſ/g, 's').replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
    /** même chose, en gardant le ſ (s long) pour reconnaître la confusion ſ/f */
    const low = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();

    /* ── Lettres qui se ressemblent dans une écriture à la main (dans les deux sens) ── */
    const CONFUSIONS = [
        ['u', 'n', i18n('« u » et « n » ont les mêmes jambages')], ['m', 'rn', i18n('« m » et « rn » se ressemblent')], ['m', 'nn', i18n('« m » et « nn » ont le même nombre de jambages')],
        ['m', 'in', i18n('« m » et « in » ont le même nombre de jambages')], ['n', 'ri', i18n('« n » et « ri » se ressemblent')], ['u', 'ii', i18n('« u » et « ii » se ressemblent')],
        ['a', 'o', i18n('« a » et « o » se confondent quand la boucle est fermée')], ['e', 'c', i18n('« e » et « c » se confondent quand la boucle est petite')],
        ['i', 'l', i18n('« i » sans point ressemble à « l »')], ['i', 't', i18n('« i » et « t » sans barre se confondent')], ['l', 't', i18n('« l » et « t » sans barre se confondent')],
        ['ſ', 'f', i18n('le s long « ſ » ressemble à « f »')], ['s', 'f', i18n('le s long « ſ » ressemble à « f »')], ['v', 'r', i18n('« v » et « r » se confondent')],
        ['cl', 'd', i18n('« cl » collé ressemble à « d »')], ['h', 'b', i18n('« h » et « b » se confondent')], ['h', 'k', i18n('« h » et « k » se confondent')],
        ['s', 'l', i18n('les majuscules anciennes « S » et « L » se ressemblent')], ['i', 'j', i18n('les majuscules anciennes « I » et « J » sont la même lettre')],
        ['t', 'f', i18n('les majuscules anciennes « T » et « F » se ressemblent')], ['g', 'q', i18n('« g » et « q » se confondent')], ['y', 'g', i18n('« y » et « g » se confondent')],
        ['e', 'o', i18n('« e » et « o » se confondent')], ['o', 'u', i18n('« o » ouvert ressemble à « u »')], ['c', 'o', i18n('« c » et « o » se confondent')],
    ];
    const CONF = new Map();
    CONFUSIONS.forEach(([a, b, w]) => { CONF.set(a + '>' + b, w); CONF.set(b + '>' + a, w); });
    const CONF_COST = 0.3;

    /** Coût de lecture de a en b : une distance d'édition où une confusion connue coûte 0,3 (et peut prendre 1 ou 2 lettres). */
    function readingCost(a, b) {
        a = low(a); b = low(b);
        if (a === b) return 0;
        if (Math.abs(a.length - b.length) > 4) return 99;
        const n = a.length, m = b.length, d = Array.from({length: n + 1}, () => new Array(m + 1).fill(0));
        for (let i = 0; i <= n; i++) d[i][0] = i;
        for (let j = 0; j <= m; j++) d[0][j] = j;
        for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
            let v = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : CONF.has(a[i - 1] + '>' + b[j - 1]) ? CONF_COST : 1));
            for (let la = 1; la <= 2; la++) for (let lb = 1; lb <= 2; lb++) {
                if ((la === 1 && lb === 1) || i < la || j < lb) continue;
                if (CONF.has(a.slice(i - la, i) + '>' + b.slice(j - lb, j))) v = Math.min(v, d[i - la][j - lb] + CONF_COST);
            }
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2][j - 2] + 0.8); // deux lettres inversées
            d[i][j] = v;
        }
        return Math.round(d[n][m] * 100) / 100;
    }

    /** Pourquoi a a pu être lu b : la première confusion connue trouvée (ou « une lettre différente »). */
    function why(read, right) {
        const a = low(read), b = low(right);
        if (a === b) return '';
        let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
        let ea = a.length, eb = b.length; while (ea > i && eb > i && a[ea - 1] === b[eb - 1]) { ea--; eb--; }
        const x = a.slice(i, ea), y = b.slice(i, eb);
        if (CONF.has(x + '>' + y)) return i18n('« {x} » lu au lieu de « {y} » : {x2}', {x, y, x2: CONF.get(x + '>' + y)});
        for (let k = 0; k < Math.min(x.length, y.length); k++) for (const la of [1, 2]) for (const lb of [1, 2]) {
            const p = x.slice(k, k + la), q = y.slice(k, k + lb);
            if (p && q && p !== q && CONF.has(p + '>' + q)) return i18n('« {p} » lu au lieu de « {q} » : {x}', {p, q, x: CONF.get(p + '>' + q)});
        }
        if (!x && y) return i18n('« {y} » oublié à la lecture', {y});
        if (x && !y) return i18n('« {x} » en trop', {x});
        return i18n('« {x} » lu au lieu de « {y} »', {x, y});
    }

    /** Les mots les plus proches d'un dictionnaire (tableau de textes ou de {value, weight}). Plusieurs choix, jamais un seul imposé. */
    function suggest(word, dict, {max = 3, maxCost = null, minLen = 3} = {}) {
        const w = String(word || '').trim(); if (w.length < minLen) return [];
        const nw = norm(w), lim = maxCost ?? (nw.length <= 4 ? 0.6 : nw.length <= 7 ? 1.3 : 1.8);
        const seen = new Set(), out = [];
        for (const it of dict || []) {
            const value = typeof it === 'string' ? it : it?.value; if (!value) continue;
            const nv = norm(value); if (seen.has(nv)) continue; seen.add(nv);
            if (nv === nw) return []; // le mot est connu : rien à proposer
            if (Math.abs(nv.length - nw.length) > 3 || nv[0] !== nw[0] && !CONF.has(nv[0] + '>' + nw[0]) && !CONF.has(nw[0] + '>' + nv[0])) continue;
            const cost = readingCost(w, value);
            if (cost <= lim) out.push({value, cost, weight: typeof it === 'string' ? 1 : (Number(it.weight) || 1), why: why(w, value)});
        }
        return out.sort((a, b) => a.cost - b.cost || b.weight - a.weight || a.value.localeCompare(b.value, 'fr')).slice(0, max);
    }

    /* ── Chiffres qui se ressemblent ── */
    const DIGITS = {1: ['7'], 7: ['1'], 3: ['8'], 8: ['3'], 5: ['6'], 6: ['5', '0', '9'], 0: ['6', '9'], 9: ['4', '0', '6'], 4: ['9']};
    /** Les lectures possibles d'un nombre (un seul chiffre changé) : [{value, why}] */
    function digitVariants(n) {
        const s = String(n ?? '').replace(/\D/g, ''); if (!s) return [];
        const out = [];
        for (let i = 0; i < s.length; i++) for (const r of DIGITS[s[i]] || []) {
            const v = s.slice(0, i) + r + s.slice(i + 1);
            if (v[0] === '0' && v.length > 1) continue;
            out.push({value: Number(v), why: i18n('« {x} » lu au lieu de « {r} »', {x: s[i], r})});
        }
        return out;
    }

    /* ── Abréviations et mots d'époque ── */
    const ABBREV = {
        'cult': 'cultivateur', 'cultr': 'cultivateur', 'cultre': 'cultivateur', 'cultiv': 'cultivateur', 'cultivr': 'cultivateur', 'cultrice': 'cultivatrice',
        'jlier': 'journalier', 'journ': 'journalier', 'journr': 'journalier', 'journal': 'journalier', 'jnlier': 'journalier', 'jliere': 'journalière',
        'dom': 'domestique', 'domest': 'domestique', 'domq': 'domestique', 'serv': 'servante', 'servte': 'servante',
        'vve': 'veuve', 'vf': 'veuf', 'vv': 'veuve', 'prop': 'propriétaire', 'propre': 'propriétaire', 'propr': 'propriétaire', 'propriet': 'propriétaire',
        'menag': 'ménagère', 'menagre': 'ménagère', 'men': 'ménagère', 'agr': 'agriculteur', 'agric': 'agriculteur', 'agricr': 'agriculteur',
        'sp': 'sans profession', 's p': 'sans profession', 'ss prof': 'sans profession', 'sans prof': 'sans profession',
        'fermr': 'fermier', 'ferm': 'fermier', 'cordr': 'cordonnier', 'cordon': 'cordonnier', 'md': 'marchand', 'mde': 'marchande', 'march': 'marchand', 'mard': 'marchand',
        'instit': 'instituteur', 'institr': 'instituteur', 'tiss': 'tisserand', 'tisserd': 'tisserand', 'charp': 'charpentier', 'charpr': 'charpentier', 'menuis': 'menuisier', 'menuisr': 'menuisier',
        'ouvr': 'ouvrier', 'ouvre': 'ouvrière', 'manoeuv': 'manœuvre', 'bouch': 'boucher', 'boulr': 'boulanger', 'boul': 'boulanger', 'forger': 'forgeron', 'forgr': 'forgeron',
        'mar ferr': 'maréchal-ferrant', 'mal ferrant': 'maréchal-ferrant', 'negt': 'négociant', 'neg': 'négociant', 'emp': 'employé', 'employ': 'employé', 'cantr': 'cantonnier',
        'chef de men': 'chef de ménage', 'chef men': 'chef de ménage', 'ch': 'chef', 'ep': 'épouse', 'epse': 'épouse', 'epx': 'époux', 'fs': 'fils', 'fe': 'fille', 'flle': 'fille',
        'pens': 'pensionnaire', 'pensre': 'pensionnaire', 'b fils': 'beau-fils', 'b fille': 'belle-fille', 'b pere': 'beau-père', 'b mere': 'belle-mère', 'pt fils': 'petit-fils', 'pte fille': 'petite-fille',
        'fles': 'fils', 'f es': 'fils', 'fls': 'fils', 've': 'veuve', 'v': 'veuve',
        'nev': 'neveu', 'nce': 'nièce', 'fr': 'frère', 'sr': 'sœur', 'celib': 'célibataire', 'mar': 'marié', 'mariee': 'mariée', 'fr ses': 'française', 'fse': 'française', 'fs nat': 'française',
    };
    /** Mots déformés vus dans de vraies lectures SocFace (page de recensement de Hérisson, Allier) : la forme juste à proposer */
    const MISREADS = {
        'agricalten': 'agriculteur', 'agricultem': 'agriculteur', 'platrice': 'plâtrier', 'platre': 'plâtrier', 'platrier': 'plâtrier', 'camier': 'commis', 'camis': 'commis',
        'gremoble': 'Grenoble', 'fles': 'fils', 'f es': 'fils', 'cultivatem': 'cultivateur', 'journalien': 'journalier', 'menagere': 'ménagère',
    };
    /** « Néant », « Neant », « Niant », « néant » : la même chose (pas d'alerte, juste la bonne écriture) */
    const NEANT_RX = /^\s*(n[eéi]ant?|n[eé]an|neaut|nant)\s*\.?\s*$/i;
    const normNeant = v => NEANT_RX.test(String(v ?? '')) ? 'Néant' : v;
    const IDEM = new Set(['id', 'idem', 'd°', 'do', 'dito', 'ditto', '"', '〃', 'id°', 'dto', '—', '-', 'dt']);
    const abbrKey = s => norm(s).replace(/[.·]/g, ' ').replace(/[^a-z0-9 °"〃—-]/g, '').replace(/\s+/g, ' ').trim();
    function isIdem(s) { const k = abbrKey(s).replace(/\s/g, ''); return k !== '' && (IDEM.has(k) || IDEM.has(String(s).trim())); }
    /** « cult. » → {value: 'cultivateur', why} ; rien si le mot n'est pas une abréviation connue */
    function expandAbbrev(s, extra = null) {
        const raw = String(s ?? '').trim(); if (!raw) return null;
        const k = abbrKey(raw);
        const hit = (extra && extra[k]) || ABBREV[k] || ABBREV[k.replace(/\s/g, '')];
        if (!hit || norm(hit) === norm(raw)) return null;
        return {value: hit, why: `« ${raw} » est une abréviation de « ${hit} »`};
    }

    /* ── Mots qui ressemblent à une profession, à un lien de parenté ── */
    const TRADE_RX = /(ier|iere|eur|euse|rice|iste|ant|ante|on|onne|ard)$/;
    const COMMON_TRADES = ['cultivateur', 'cultivatrice', 'journalier', 'journalière', 'domestique', 'servante', 'propriétaire', 'ménagère', 'agriculteur', 'fermier', 'fermière', 'cordonnier', 'marchand', 'marchande', 'instituteur', 'institutrice', 'tisserand', 'charpentier', 'menuisier', 'maçon', 'ouvrier', 'ouvrière', 'boulanger', 'boucher', 'forgeron', 'tailleur', 'couturière', 'lingère', 'meunier', 'charron', 'tonnelier', 'vigneron', 'berger', 'bergère', 'laboureur', 'scieur', 'sabotier', 'cantonnier', 'employé', 'négociant', 'rentier', 'rentière', 'manœuvre', 'facteur', 'gendarme', 'curé', 'notaire', 'médecin', 'aubergiste', 'cabaretier', 'épicier', 'épicière', 'repasseuse', 'blanchisseuse', 'tricoteuse', 'fileuse', 'mineur', 'chauffeur', 'mécanicien', 'cocher', 'charretier', 'jardinier', 'colon', 'métayer', 'sans profession', 'écolier', 'écolière', 'élève', 'commis', 'plâtrier', 'peintre', 'apprenti', 'patron', 'patronne', 'retraité', 'retraitée', 'employée', 'manœuvre', 'terrassier', 'maréchal', 'serrurier', 'cordonnière', 'modiste', 'tisseuse', 'voiturier', 'roulier', 'garde', 'vacher', 'porcher', 'bouvier', 'charbonnier', 'bûcheron', 'carrier', 'tailleur de pierre', 'Néant'];
    /** petits mots qui vont avec un métier (« apprenti plâtrier », « marchand de vin ») */
    const LINK_WORDS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'a', 'au', 'aux', 'en', 'et', 'chez', 'sans', 'pour', 'sur', 'd', 'l', 'vin', 'bois', 'fer', 'bestiaux', 'grains', 'drap', 'toile', 'commerce', 'maison', 'ferme', 'usine', 'mine', 'chemin', 'route', 'eglise', 'mairie', 'ecole', 'poste', 'gare', 'ville', 'aide', 'garcon', 'fille', 'femme', 'chef', 'maitre', 'ouvriere']);
    const ROLES = {
        chef: {g: ''}, 'chef de ménage': {g: ''}, 'chef de menage': {g: ''},
        'épouse': {g: 'f', spouse: true}, 'femme': {g: 'f', spouse: true}, 'époux': {g: 'h', spouse: true}, 'mari': {g: 'h', spouse: true},
        fils: {g: 'h', child: true}, fille: {g: 'f', child: true}, enfant: {g: '', child: true}, 'petit-fils': {g: 'h', child: true}, 'petite-fille': {g: 'f', child: true},
        'beau-fils': {g: 'h', child: true}, 'belle-fille': {g: 'f'}, 'gendre': {g: 'h'}, 'bru': {g: 'f'},
        'père': {g: 'h', parent: true}, 'mère': {g: 'f', parent: true}, 'beau-père': {g: 'h', parent: true}, 'belle-mère': {g: 'f', parent: true},
        'frère': {g: 'h'}, 'sœur': {g: 'f'}, 'soeur': {g: 'f'}, neveu: {g: 'h'}, 'nièce': {g: 'f'}, oncle: {g: 'h'}, tante: {g: 'f'}, cousin: {g: 'h'}, cousine: {g: 'f'},
        domestique: {g: '', other: true}, servante: {g: 'f', other: true}, serviteur: {g: 'h', other: true}, pensionnaire: {g: '', other: true}, 'ouvrier': {g: 'h', other: true}, 'ouvrière': {g: 'f', other: true},
        'grand-mère': {g: 'f', parent: true}, 'grand mère': {g: 'f', parent: true}, 'grand-père': {g: 'h', parent: true}, 'grand père': {g: 'h', parent: true},
        'nourrisson': {g: '', other: true}, 'pupille': {g: '', other: true}, 'apprenti': {g: 'h', other: true}, 'commis': {g: 'h', other: true}, 'locataire': {g: '', other: true}, 'hôte': {g: '', other: true},
    };
    const roleKey = r => { const n = norm(r).replace(/[.]/g, '').trim(); const e = expandAbbrev(n); const k = norm(e ? e.value : n); for (const key of Object.keys(ROLES)) if (norm(key) === k) return key; return k; };
    const roleOf = r => ROLES[roleKey(r)] || null;
    const isChef = r => /^chef/.test(roleKey(r));
    function looksLikeTrade(word, trades = []) {
        const w = norm(word); if (!w || w.length < 4) return false;
        if (expandAbbrev(w) && COMMON_TRADES.some(t => norm(t) === norm(expandAbbrev(w).value))) return true;
        if (COMMON_TRADES.some(t => norm(t) === w)) return true;
        return (trades || []).some(t => norm(typeof t === 'string' ? t : t?.name) === w);
    }

    /** Le genre probable d'un prénom (« Marie », « Maria » → f ; « Pierre », « André » → h) quand la case du genre est vide */
    const MALE_E = new Set('pierre baptiste philippe etienne auguste theophile hippolyte achille alexandre antoine jerome maxime georges jules eugene emile andre rene aime desire honore theodore isidore ambroise blaise lazare jean-baptiste jean-pierre joseph-marie felicite-xx ignace jose marie-joseph cyrille basile anselme celestine-xx'.split(' '));
    function firstNameGender(first) {
        const f = norm(String(first || '').split(/[\s,]+/)[0] || ''); if (f.length < 3) return '';
        if (MALE_E.has(f)) return 'h';
        if (/(ette|elle|ine|ie|ia|ise|ence|ance|iere|ee|ude|a)$/.test(f) && !/^(luca|nicola|andrea|elia)$/.test(f)) return 'f';
        if (/e$/.test(f)) return 'f';
        return 'h';
    }
    /** « Montrigny Corrèze », « Nouluner P Loire », « Laloure de G », « Venisa P » : la commune, puis le département abrégé */
    const DEPTS = 'ain aisne allier ardeche ardennes ariege aube aude aveyron calvados cantal charente cher correze creuse dordogne doubs drome eure finistere gard gers gironde herault indre isere jura landes loire loiret lot lozere manche marne mayenne meuse morbihan moselle nievre nord oise orne rhone saone sarthe savoie seine somme tarn var vaucluse vendee vienne vosges yonne paris corse'.split(' ');
    function splitBirthPlace(v) {
        const s = String(v ?? '').trim(); if (!s) return {commune: '', dept: ''};
        const t = s.split(/\s+/);
        let k = t.length;
        for (let i = 1; i < t.length; i++) {
            const w = norm(t[i]).replace(/[.]/g, '');
            if (/^[A-ZÉ]\.?$/.test(t[i]) || DEPTS.includes(w) || ((w === 'de' || w === 'du') && i + 1 < t.length && /^[A-ZÉ]\.?$/.test(t[i + 1]))) { k = i; break; }
        }
        return {commune: t.slice(0, k).join(' '), dept: t.slice(k).join(' ')};
    }
    const lev = (a, b) => { a = norm(a); b = norm(b); const d = Array.from({length: a.length + 1}, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; };
    /** deux formes d'un même lieu mal lu (« Hérisson », « Herisses », « Heinon », « Henison ») : même début, distance bornée */
    const sameish = (a, b) => { const x = norm(a), y = norm(b); if (!x || !y || x === y) return x === y; if (x.slice(0, 2) !== y.slice(0, 2)) return false; return lev(x, y) <= Math.max(2, Math.ceil(Math.max(x.length, y.length) * 0.45)); };

    /* ── Valeurs d'un ménage ── */
    const num = v => { const m = String(v ?? '').match(/\d{1,4}/); return m ? Number(m[0]) : null; };
    const yearOf = v => { const m = String(v ?? '').match(/\b(1[6-9]\d\d|20\d\d)\b/); return m ? Number(m[1]) : null; };
    const ageOf = r => { const a = num(r.age); return a !== null && a < 130 ? a : null; };
    const bornOf = (r, year) => r.birth_year ? Number(r.birth_year) : (yearOf(r.birth_text) ?? (ageOf(r) !== null && year ? year - ageOf(r) : null));
    const genderOf = r => { const g = norm(r.gender); return /^(f|femme|female|feminin)/.test(g) ? 'f' : /^(h|homme|m|male|masculin)/.test(g) ? 'h' : ''; };
    const SAME_NAME_EXCEPT = r => { const ro = roleOf(r.role); return !ro || ro.spouse || ro.other || ro.parent || /belle|beau|gendre|bru|neveu|niece|nièce|oncle|tante|cousin|soeur|sœur|frere|frère/.test(roleKey(r.role)); };

    /**
     * Les doutes d'un ménage. rows : [{last, first, age, birth_year, birth_text, birth_place, role, gender, occupation, nationality, page, line}]
     * ctx : {year, surnames, firstNames, places, trades, others: {index: [{year, age, birth_year}]}}
     * → [{row, field, level, why, value, proposals: [{value, why}]}]
     */
    function checkHousehold(rows, ctx = {}) {
        const out = [], year = Number(ctx.year) || null;
        const push = (row, field, level, whyText, value, proposals = []) => out.push({row, field, level, why: whyText, value: value ?? '', proposals: proposals.filter((p, i, a) => p && p.value !== '' && p.value != null && a.findIndex(q => String(q.value) === String(p.value)) === i).slice(0, 4)});
        const chefIdx = rows.findIndex(r => isChef(r.role));
        const chef = chefIdx >= 0 ? rows[chefIdx] : null;
        const chefAge = chef ? ageOf(chef) : null;
        const surnames = ctx.surnames || [], firstNames = ctx.firstNames || [], places = ctx.places || [], trades = ctx.trades || [];

        rows.forEach((r, i) => {
            // id. / d° : la même valeur que la ligne au-dessus
            for (const f of ['last', 'first', 'occupation', 'birth_place', 'nationality', 'role']) {
                if (r[f] && isIdem(r[f])) push(i, f, 'yellow', i18n('« {x} » veut dire « idem » : la même chose qu’à la ligne au-dessus.', {x: r[f]}), r[f], (() => { for (let k = i - 1; k >= 0; k--) if (rows[k][f] && !isIdem(rows[k][f])) return [{value: (expandAbbrev(rows[k][f], ctx.abbrev) || {value: rows[k][f]}).value, why: i18n('la valeur de la ligne {x}', {x: k + 1})}]; return []; })());
            }
            // colonnes décalées d'un cran : la nationalité (« F », « P ») dans le lien, le lien (« chef », « épouse ») dans la profession,
            // la profession dans l'employeur → chaque valeur remise dans sa colonne (proposé, jamais fait tout seul)
            const natLike = v => /^(f|p|fr|fse|francaise?|e|etr|etranger|etrangere|b|belge|i|it|italien(ne)?|e?spagnol(e)?)\.?$/i.test(norm(v));
            const occRole = r.occupation && (roleOf(r.occupation) && !roleOf(r.occupation).other || isChef(r.occupation));
            if (r.role && natLike(r.role) && (occRole || !r.nationality)) {
                const props = [{field: 'nationality', value: r.role, why: i18n('« {role} » est la nationalité', {role: r.role})}];
                if (occRole) props.unshift({field: 'role', value: r.occupation, why: i18n('« {occupation} » est le lien avec le chef', {occupation: r.occupation})});
                if (occRole && r.employer && !/^(patron|patronne)$/i.test(norm(r.employer))) props.push({field: 'occupation', value: MISREADS[norm(r.employer)] || r.employer, why: `${i18n('« {employer} » est sans doute la profession', {employer: r.employer})}${MISREADS[norm(r.employer)] ? ' (mal lue)' : ''}`});
                push(i, 'role', 'orange', i18n('Colonnes décalées : « {role} » dans la case du lien ressemble à la nationalité{x}. Remets chaque valeur dans sa colonne.', {role: r.role, x: occRole ? i18n(', et « {occupation} » dans la case de la profession est un lien de parenté', {occupation: r.occupation}) : ''}), r.role, props);
            } else if (occRole && !r.role) push(i, 'occupation', 'orange', i18n('« {occupation} » dans la case de la profession est un lien de parenté : la colonne a glissé.', {occupation: r.occupation}), r.occupation, [{field: 'role', value: r.occupation, why: i18n('c’est le lien avec le chef')}, ...(r.employer ? [{field: 'occupation', value: r.employer, why: i18n('la case suivante est sans doute la profession')}] : [])]);
            // l'état civil qui contient un lien (« Neveu ») : rangé dans la mauvaise case
            if (r.civil_status && roleOf(r.civil_status) && !/^(veuve?|veuf)$/.test(norm(r.civil_status))) push(i, 'civil_status', 'yellow', i18n('« {civil_status} » dans la case de l’état civil est un lien de parenté : mal rangé.', {civil_status: r.civil_status}), r.civil_status, [{field: 'role', value: r.civil_status, why: i18n('c’est le lien avec le chef')}]);
            if (r.civil_status && /^v\.?$/i.test(String(r.civil_status).trim())) push(i, 'civil_status', 'yellow', i18n('« {civil_status} » veut dire « veuve » (ou « veuf ») : abréviation non développée.', {civil_status: r.civil_status}), r.civil_status, [{value: genderOf(r) === 'h' ? 'veuf' : 'veuve', why: 'V = veuve / veuf'}]);
            // le nom précédé de « V », « Ve », « Vve » : la veuve d'un tel → le nom sans le préfixe, et l'état civil « veuve »
            { const m = String(r.last || '').match(/^(v|ve|vve|vv)\.?\s+(\S.*)$/i);
              if (m) push(i, 'last', 'yellow', i18n('« {x} » devant le nom veut dire « veuve » : le nom est « {x2} ».', {x: m[1], x2: m[2]}), r.last, [{field: 'last', value: m[2], why: i18n('le nom sans « veuve »')}, ...(r.civil_status && /veuv|^v$/i.test(r.civil_status) ? [] : [{field: 'civil_status', value: genderOf(r) === 'h' ? 'veuf' : 'veuve', why: i18n('« {x} » = veuve', {x: m[1]})}])]); }
            // mots déformés connus et métiers illisibles
            for (const f of ['occupation', 'role', 'birth_place', 'employer']) {
                const v = String(r[f] || '').trim(); if (!v || NEANT_RX.test(v) || isIdem(v) || out.some(d => d.row === i && d.field === f)) continue;
                const words = v.split(/\s+/);
                const fixed = words.map(w => { const k = norm(w).replace(/[.]/g, ''); return MISREADS[k] ? MISREADS[k] : w; });
                const joined = MISREADS[norm(v)] || fixed.join(' ');
                if (norm(joined) !== norm(v)) { push(i, f, 'yellow', i18n('« {v} » est sans doute « {joined} » mal lu (lettres qui se ressemblent).', {v, joined}), v, [{value: joined, why: i18n('forme connue la plus proche')}]); continue; }
                if (f !== 'occupation' || expandAbbrev(v, ctx.abbrev)) continue;
                const known = [...COMMON_TRADES, ...trades.map(t => typeof t === 'string' ? t : t?.name || '')].map(norm);
                const unknown = words.filter(w => { const n = norm(w).replace(/[.]/g, ''); return n.length >= 3 && !LINK_WORDS.has(n) && !known.includes(n) && !known.some(k => k.split(' ').includes(n)) && !expandAbbrev(w); });
                if (!unknown.length) continue;
                const sug = unknown.map(w => [w, suggest(w, [...COMMON_TRADES, ...trades], {max: 2, maxCost: 1.3})]);
                if (sug.every(([, x]) => x.length)) { const val = words.map(w => { const h = sug.find(([u]) => u === w); return h ? h[1][0].value : w; }).join(' '); push(i, f, 'yellow', `« ${v} » : ${sug.map(([u, x]) => i18n('« {u} » ressemble à « {x} »', {u, x: x[0].value})).join(', ')}.`, v, [{value: val, why: sug[0][1][0].why}]); }
                else if (unknown.length * 2 >= words.filter(w => norm(w).length >= 3).length) push(i, f, 'yellow', i18n('« {v} » ne ressemble à aucun métier connu : lecture sans doute illisible, regarde l’image.', {v}), v);
            }
            if (r.employer && !NEANT_RX.test(r.employer) && !out.some(d => d.row === i && d.field === 'employer') && !occRole && String(r.employer).split(/\s+/).some(w => norm(w).length >= 8 && !COMMON_TRADES.map(norm).includes(norm(w)) && !trades.some(t => norm(typeof t === 'string' ? t : t?.name) === norm(w)))) push(i, 'employer', 'yellow', i18n('Employeur « {employer} » : lecture douteuse, regarde l’image.', {employer: r.employer}), r.employer);
            // abréviations non développées
            for (const f of ['occupation', 'role', 'nationality']) {
                const e = r[f] && !isIdem(r[f]) && !out.some(d => d.row === i && d.field === f) ? expandAbbrev(r[f], ctx.abbrev) : null;
                if (e) push(i, f, 'yellow', e.why + ` ${i18n('(non développée par la lecture automatique).')}`, r[f], [e]);
            }
            // colonnes décalées : une profession dans la case du prénom, un lieu dans la case du nom
            if (r.first && looksLikeTrade(r.first, trades)) push(i, 'first', 'orange', i18n('« {first} » ressemble à une profession : la colonne a pu être décalée.', {first: r.first}), r.first);
            if (r.last && places.some(p => norm(typeof p === 'string' ? p : p.value) === norm(r.last)) && !surnames.some(s => norm(typeof s === 'string' ? s : s.value) === norm(r.last))) push(i, 'last', 'yellow', i18n('« {last} » est aussi le nom d’une commune : la colonne du lieu a pu glisser dans celle du nom.', {last: r.last}), r.last);
            // le nom de famille : pareil que le chef pour la famille (sauf l'épouse, les domestiques, la belle-famille…)
            if (chef && i !== chefIdx && r.last && chef.last && roleOf(r.role)?.spouse && norm(r.last) !== norm(chef.last) && (readingCost(r.last, chef.last) <= 1.3 || lev(r.last, chef.last) <= 2)) push(i, 'last', 'yellow', i18n('Le mari s’appelle « {last} », l’épouse « {last2} » : au recensement, l’épouse est en général inscrite sous le nom du mari (lettres mal lues ?).', {last: chef.last, last2: r.last}), r.last, [{value: chef.last, why: i18n('le nom du chef du ménage')}]);
            if (chef && i !== chefIdx && r.last && chef.last && !SAME_NAME_EXCEPT(r) && norm(r.last) !== norm(chef.last)) {
                const c = readingCost(r.last, chef.last);
                if (c <= 1.3) push(i, 'last', 'orange', i18n('Le chef du ménage s’appelle « {last} » : {x}.', {last: chef.last, x: why(r.last, chef.last)}), r.last, [{value: chef.last, why: i18n('le nom du chef du ménage')}]);
                else if (norm(r.last).length >= 4 && Math.abs(norm(r.last).length - norm(chef.last).length) <= 2 && lev(r.last, chef.last) <= 2) push(i, 'last', 'yellow', i18n('Le chef du ménage s’appelle « {last} », ici « {last2} » : les membres d’un ménage portent en général le même nom (lettres mal lues ?).', {last: chef.last, last2: r.last}), r.last, [{value: chef.last, why: i18n('le nom du chef du ménage')}]);
            }
            // noms et prénoms proches de ceux de ta base ou de la liste des prénoms
            if (r.last && !isIdem(r.last) && surnames.length && !out.some(d => d.row === i && d.field === 'last')) {
                const s = suggest(r.last, surnames, {max: 3});
                if (s.length) push(i, 'last', 'yellow', `${i18n('« {last} » n’est pas dans ta base, mais {x} oui : {x2}.', {last: r.last, x: s.map(x => `« ${x.value} »`).join(', '), x2: s[0].why})}`, r.last, s);
            }
            if (r.first && !isIdem(r.first) && firstNames.length && !looksLikeTrade(r.first, trades)) {
                const words = String(r.first).split(/[\s,-]+/).filter(Boolean);
                words.forEach(w => {
                    const s = suggest(w, firstNames, {max: 3});
                    if (s.length) push(i, 'first', 'yellow', `${i18n('Prénom peu courant « {w} » : {x} ? ({x2})', {w, x: s.map(x => `« ${x.value} »`).join(' ou '), x2: s[0].why})}`, r.first, s.map(x => ({value: words.map(y => y === w ? x.value : y).join(' '), why: x.why})));
                });
            }
            // le lieu de naissance : plusieurs formes d'un même lieu sur la page (« Hérisson », « Heinon », « Herisses ») → la forme la plus lue
            const bp = splitBirthPlace(r.birth_place), pagePlaces = (ctx.pagePlaces || rows.map(x => x.birth_place)).map(x => splitBirthPlace(x).commune).filter(Boolean);
            if (bp.commune && !isIdem(bp.commune) && !out.some(d => d.row === i && d.field === 'birth_place')) {
                const group = pagePlaces.filter(x => sameish(x, bp.commune));
                const counts = {}, forms = {}; group.forEach(x => { const k = norm(x); counts[k] = (counts[k] || 0) + 1; if (!forms[k] || /[^\x00-\x7f]/.test(x)) forms[k] = x; });
                const inBase = x => places.some(p => norm(typeof p === 'string' ? p : p.value) === norm(x));
                const bestKey = Object.keys(counts).sort((a, b) => (inBase(forms[b]) - inBase(forms[a])) || counts[b] - counts[a])[0], best = bestKey ? forms[bestKey] : '';
                if (best && norm(best) !== norm(bp.commune) && (counts[bestKey] >= 2 || inBase(best))) {
                    const off = places.length ? suggest(best, places, {max: 1, maxCost: 1.6}) : [];
                    const props = [{value: best + (bp.dept ? ' ' + bp.dept : ''), why: i18n('la forme lue {x} fois sur la page', {x: counts[bestKey]})}, ...off.filter(o => norm(o.value) !== norm(best)).map(o => ({value: o.value + (bp.dept ? ' ' + bp.dept : ''), why: i18n('la commune connue la plus proche')}))];
                    push(i, 'birth_place', 'yellow', i18n('« {commune} » : sur la même page, ce lieu est lu « {best} » {x}{x2} — sans doute le même lieu mal lu.', {commune: bp.commune, best, x: counts[bestKey] > 1 ? i18n('{n} fois', {n: counts[bestKey]}) : i18n('aussi'), x2: inBase(best) ? ` (${i18n('commune connue')})` : ''}), r.birth_place, props);
                }
            }
            if (r.birth_place && !isIdem(r.birth_place) && places.length && !out.some(d => d.row === i && d.field === 'birth_place')) {
                const s = suggest((bp.commune || String(r.birth_place)).replace(/^st\b\.?/i, 'Saint').replace(/^ste\b\.?/i, 'Sainte'), places, {max: 3}).map(x => ({...x, value: x.value + (bp.dept ? ' ' + bp.dept : '')}));
                if (s.length) push(i, 'birth_place', 'yellow', `${i18n('Commune inconnue « {birth_place} » : peut-être {x} (à vérifier, plusieurs choix possibles).', {birth_place: r.birth_place, x: s.map(x => `« ${x.value} »`).join(', ')})}`, r.birth_place, s);
            }
            // âges et années
            const age = ageOf(r), by = r.birth_year ? Number(r.birth_year) : yearOf(r.birth_text);
            if (r.age !== undefined && r.age !== '' && r.age !== null && age === null) push(i, 'age', 'orange', i18n('Âge illisible « {age} ».', {age: r.age}), r.age);
            if (year && by && by > year) push(i, 'birth_year', 'orange', i18n(genderOf(r) === 'f' ? 'Née en {by}, après le recensement de {year} : un chiffre a été mal lu.' : 'Né en {by}, après le recensement de {year} : un chiffre a été mal lu.', {by, year}), by, digitVariants(by).filter(v => v.value <= year && v.value >= year - 110));
            if (year && by && age !== null && Math.abs(year - by - age) > 2) {
                const fix = [...digitVariants(age).filter(v => Math.abs(year - by - v.value) <= 1).map(v => ({value: v.value, why: v.why, field: 'age'})), ...digitVariants(by).filter(v => Math.abs(year - v.value - age) <= 1).map(v => ({value: v.value, why: v.why, field: 'birth_year'}))];
                push(i, 'age', 'orange', i18n('{age} ans en {year} veut dire né vers {x}, pas {by} : un des deux chiffres a été mal lu.', {age, year, x: year - age, by}), age, fix);
            }
            if (age !== null && age > 105) push(i, 'age', 'orange', i18n('{age} ans : âge très rare, un chiffre a pu être mal lu.', {age}), age, digitVariants(age).filter(v => v.value <= 100));
            const ro = roleOf(r.role), g = genderOf(r) || firstNameGender(r.first), gFromName = !genderOf(r) && !!g;
            // l'âge et le lien de parenté
            if (chef && i !== chefIdx && ro?.child && age !== null && chefAge !== null && age >= chefAge) push(i, 'age', 'orange', i18n(g === 'f' ? '{role} de {age} ans, plus âgée que le chef du ménage ({chefAge} ans) : un âge a pu être mal lu.' : '{role} de {age} ans, plus âgé que le chef du ménage ({chefAge} ans) : un âge a pu être mal lu.', {role: r.role, age, chefAge}), age, digitVariants(age).filter(v => v.value < chefAge - 12));
            if (ro?.parent && age !== null && chefAge !== null && age <= chefAge + 12) push(i, 'age', 'orange', i18n('{role} de {age} ans pour un chef de {chefAge} ans : impossible, un âge a pu être mal lu.', {role: r.role, age, chefAge}), age, digitVariants(age).filter(v => v.value > chefAge + 14));
            if ((ro?.spouse || /mere|mère/.test(roleKey(r.role))) && age !== null && age < 14) push(i, 'age', 'orange', i18n('{role} de {age} ans : impossible, un chiffre a été mal lu.', {role: r.role, age}), age, digitVariants(age).filter(v => v.value >= 14));
            if (ro?.spouse && age !== null && chefAge !== null && Math.abs(age - chefAge) > 40) push(i, 'age', 'yellow', i18n('{x} ans d’écart entre les époux : c’est rare, vérifie les âges.', {x: Math.abs(age - chefAge)}), age, digitVariants(age).filter(v => Math.abs(v.value - chefAge) <= 25));
            // les autres recensements de la même personne
            for (const o of (ctx.others?.[i] || [])) {
                const ob = o.birth_year ? Number(o.birth_year) : (o.age != null && o.year ? Number(o.year) - Number(o.age) : null), mine = bornOf(r, year);
                if (ob && mine && Math.abs(ob - mine) > 3) push(i, 'age', Math.abs(ob - mine) > 8 ? 'orange' : 'yellow', i18n(g === 'f' ? 'Au recensement de {year}, née vers {ob} ; ici vers {mine}.' : 'Au recensement de {year}, né vers {ob} ; ici vers {mine}.', {year: o.year, ob, mine}), r.age ?? r.birth_year, age !== null && year ? digitVariants(age).filter(v => Math.abs(year - v.value - ob) <= 2) : []);
            }
            // le lien de parenté
            if (!String(r.role || '').trim() && rows.length > 1) push(i, 'role', 'yellow', i18n('Lien avec le chef de ménage vide : la case a pu être sautée.'), '');
            if (ro && ro.g && g && ro.g !== g) {
                const other = {fils: 'fille', fille: 'fils', 'épouse': 'époux', 'époux': 'épouse', 'père': 'mère', 'mère': 'père', 'frère': 'sœur', 'sœur': 'frère', neveu: 'nièce', 'nièce': 'neveu', 'petit-fils': 'petite-fille', 'petite-fille': 'petit-fils', 'beau-fils': 'belle-fille', 'belle-fille': 'beau-fils', 'grand-mère': 'grand-père', 'grand mère': 'grand-père', 'grand-père': 'grand-mère', 'grand père': 'grand-mère'}[roleKey(r.role)];
                push(i, 'role', gFromName ? 'yellow' : 'orange', gFromName ? i18n('« {role} » pour « {x} », un prénom {x2} : le lien ou le prénom a été mal lu.', {role: r.role, x: String(r.first).split(/\s+/)[0], x2: g === 'f' ? i18n('de femme') : i18n('d’homme')}) : i18n('« {role} » pour {x} : le lien ou le genre a été mal lu.', {role: r.role, x: g === 'f' ? i18n('une femme') : i18n('un homme')}), r.role, other ? [{value: other, why: i18n('le lien qui va avec le genre')}] : []);
            }
            if (ro?.spouse && chef && i !== chefIdx && genderOf(chef) && ro.g && genderOf(chef) === ro.g) push(i, 'role', 'orange', i18n('« {role} » d’un chef de ménage {x} : le lien ou le genre a été mal lu.', {role: r.role, x: genderOf(chef) === 'f' ? 'femme' : 'homme'}), r.role);
        });
        // variantes d'un même nom entre les membres (« Chévenet » / « Théveuet ») : proposer l'autre forme
        const bare = n => String(n || '').replace(/^(v|ve|vve|vv)\.?\s+/i, '');
        rows.forEach((r, i) => {
            if (!r.last || out.some(d => d.row === i && d.field === 'last')) return;
            const me = bare(r.last); if (norm(me).length < 4) return;
            const near = rows.filter(o => o.last && (norm(bare(o.last)) === norm(me) || readingCost(me, bare(o.last)) <= 1.3 || lev(me, bare(o.last)) <= 2)).map(o => bare(o.last));
            const counts = {}, forms = {}; near.forEach(x => { const k = norm(x); counts[k] = (counts[k] || 0) + 1; forms[k] = forms[k] || x; });
            const top = Math.max(...Object.values(counts)), mine = counts[norm(me)] || 0;
            if (Object.keys(counts).length < 2 || mine > top || (mine === top && Object.values(counts).filter(n => n === top).length === 1)) return;
            const best = Object.keys(counts).filter(k => k !== norm(me) && counts[k] >= mine).sort((a, b) => counts[b] - counts[a] || (chef && norm(bare(chef.last)) === b) - (chef && norm(bare(chef.last)) === a));
            if (best.length) push(i, 'last', 'yellow', i18n('« {last} » et « {x} » dans le même ménage : sans doute le même nom mal lu.', {last: r.last, x: best.map(k => forms[k]).join(' », « ')}), r.last, best.map(k => ({value: forms[k], why: counts[k] > 1 ? i18n('lu {x} fois dans le ménage', {x: counts[k]}) : i18n('le nom d’un autre membre du ménage')})));
        });
        // deux chefs dans le même ménage
        const chefs = rows.map((r, i) => isChef(r.role) ? i : -1).filter(i => i >= 0);
        if (chefs.length > 1) chefs.slice(1).forEach(i => push(i, 'role', 'orange', i18n('Deux « chef » dans le même ménage : deux ménages ont pu être mis ensemble, ou le lien a été mal lu.'), rows[i].role));
        // la même personne deux fois
        rows.forEach((r, i) => rows.slice(0, i).forEach((o, j) => {
            if (r.first && r.last && norm(r.first) === norm(o.first) && norm(r.last) === norm(o.last) && (ageOf(r) === ageOf(o) || norm(r.role) === norm(o.role))) push(i, 'first', 'orange', i18n('Même nom, même prénom que la ligne {x} : la même personne lue deux fois ?', {x: j + 1}), r.first);
        }));
        return out;
    }

    /** Plusieurs ménages : chacun, plus le ménage coupé au changement de page et l'enfant rattaché au mauvais ménage. */
    function checkHouseholds(households, ctx = {}) {
        const pageOf = h => String((h.rows || h.members || [])[0]?.page ?? h.page ?? '');
        const res = households.map(h => checkHousehold(h.rows || h.members || [], {...ctx, year: h.year || ctx.year, others: h.others || ctx.others,
            pagePlaces: households.filter(o => pageOf(o) === pageOf(h)).flatMap(o => (o.rows || o.members || []).map(x => x.birth_place))}));
        households.forEach((h, k) => {
            const rows = h.rows || h.members || [], prev = k > 0 ? households[k - 1] : null;
            if (!rows.length) return;
            if (!rows.some(r => isChef(r.role) || isChef(r.occupation)) && rows.length) {
                const pRows = prev ? (prev.rows || prev.members || []) : [];
                const samePageEnd = prev && (num(rows[0].page) !== null && num(pRows[pRows.length - 1]?.page) !== null && num(rows[0].page) === num(pRows[pRows.length - 1].page) + 1);
                res[k].push({row: 0, field: 'role', level: samePageEnd ? 'orange' : 'yellow', why: samePageEnd ? i18n('Ce ménage commence en haut d’une page sans chef : c’est sans doute la suite du ménage de la page d’avant (ménage coupé au changement de page).') : i18n('Ce ménage n’a pas de chef : il a pu être coupé en deux (changement de page) ou mal découpé.'), value: rows[0].role || '', proposals: []});
            }
            const chef = rows.find(r => isChef(r.role));
            const pChef = prev ? (prev.rows || prev.members || []).find(r => isChef(r.role)) : null;
            rows.forEach((r, i) => {
                const ro = roleOf(r.role);
                if (ro?.child && chef && pChef && r.last && norm(r.last) !== norm(chef.last) && readingCost(r.last, chef.last) > 1.3 && norm(r.last) === norm(pChef.last)) res[k].push({row: i, field: 'last', level: 'yellow', why: i18n('{role} « {last} » dans le ménage de {last2}, mais le ménage d’avant s’appelle {last3} : rattaché au mauvais ménage ?', {role: r.role, last: r.last, last2: chef.last, last3: pChef.last}), value: r.last, proposals: []});
            });
        });
        return res;
    }

    /** Relecture d'un texte libre (✨ Lire l'acte) : abréviations non développées, noms proches de ceux de la base. */
    function checkWords(text, ctx = {}) {
        const out = [], seen = new Set();
        const words = String(text || '').match(/[A-Za-zÀ-ÿſ'’.°"-]+/g) || [];
        for (const raw of words) {
            const w = raw.replace(/^['’-]+|['’-]+$/g, ''); if (!w || seen.has(w)) continue; seen.add(w);
            const e = expandAbbrev(w, ctx.abbrev);
            if (e && /[.°]|^[a-z]{2,6}$/i.test(w)) { out.push({word: w, level: 'yellow', why: e.why, proposals: [e]}); continue; }
            if (/^[A-ZÀ-Ý]/.test(w) && w.length >= 4 && ctx.surnames?.length) {
                const s = suggest(w, [...(ctx.surnames || []), ...(ctx.firstNames || [])], {max: 3});
                if (s.length) out.push({word: w, level: 'yellow', why: `${i18n('« {w} » ressemble à {x} : {x2}', {w, x: s.map(x => `« ${x.value} »`).join(', '), x2: s[0].why})}`, proposals: s});
            }
        }
        return out;
    }

    /** Petite liste des prénoms courants du XIXe et du début du XXe siècle (complétée par les prénoms de la base). */
    const FIRST_NAMES = 'Jean Pierre Jacques Joseph Louis François Antoine Marie Anne Jeanne Marguerite Catherine Françoise Louise Madeleine Marthe Rose Julie Victorine Joséphine Eugénie Augustine Henriette Pauline Céline Léonie Émilie Clémence Adèle Élisabeth Élise Hélène Germaine Yvonne Suzanne Simone Lucienne Andrée Renée Raymonde Odette Paulette Denise Jacqueline Juliette Berthe Blanche Alice Lucie Thérèse Gabrielle Valentine Mathilde Philomène Rosalie Virginie Zoé Léontine Ernestine Eulalie Honorine Séraphine Victoire Agathe Agnès Albertine Amélie Angèle Antoinette Apolline Armandine Aurélie Claire Clotilde Delphine Désirée Estelle Eugène Henri Charles Auguste Guillaume Étienne Michel Nicolas Martin Simon André Paul Léon Jules Émile Albert Alfred Alphonse Adolphe Achille Aimé Alexandre Alexis Ambroise Amédée Anatole Armand Arsène Arthur Baptiste Barthélemy Benoît Bernard Camille Casimir Célestin Clément Constant Cyprien Daniel Denis Désiré Édouard Edmond Élie Ernest Eugène Félix Ferdinand Fernand Firmin Florent Francis Frédéric Gabriel Gaston Georges Gilbert Gustave Hippolyte Honoré Hubert Ignace Isidore Jules Julien Justin Laurent Léonard Léopold Lucien Marcel Marius Mathieu Maurice Maxime Narcisse Noël Octave Olivier Pascal Philippe Prosper Raoul Raymond René Robert Roger Sébastien Théodore Théophile Thomas Victor Vincent Xavier Yves Abel Adrien Augustin Basile Blaise Claude Cyrille Didier Dominique Fabien Félicien Fortuné Germain Grégoire Gérard Hector Hilaire Jérôme Lazare Léger Louis-Marie Marc Martial Médard Nestor Norbert Pierre-Marie Placide Rémi Roch Sylvain Théophile Valentin Valéry Zacharie Alix Anaïs Annette Augusta Bernadette Charlotte Colette Constance Cécile Elvire Emma Ernestine Eva Fanny Félicie Florentine Gilberte Hortense Irène Isabelle Joséphine Laure Léa Lina Lise Marcelle Margot Maria Marie-Louise Mélanie Noémie Olympe Rachel Reine Solange Sophie Thérèse Ursule Valérie Yvette'.split(' ');

    return {norm, readingCost, normNeant, splitBirthPlace, firstNameGender, MISREADS, why, suggest, digitVariants, expandAbbrev, isIdem, looksLikeTrade, roleKey, isChef, checkHousehold, checkHouseholds, checkWords, CONFUSIONS, ABBREV, FIRST_NAMES, COMMON_TRADES, yearOf, genderOf};
});
