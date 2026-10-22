/* LCNDA — 🎲 Jeux de la famille : la logique (sans écran), partagée par « Qui est-ce ? », « Memory », « La bonne date » et « Morpion ».
 * Pas de DOM ici : ces fonctions se testent aussi dans Node (tests/test-jeux-famille.js → require()).
 * Les données viennent de la lecture GET mode_simple_data (lib/mode_simple.php) : personnes (sans les vivants ni les fiches
 * confidentielles une fois filtrées ici), unions (enfants, mariage), photos. Rien n'est jamais écrit dans la base.
 */
(function (root) {
    'use strict';

    /* ═════ Hasard à graine (même graine = même partie) ═════ */
    function rng(seed) {
        let h = 1779033703 ^ String(seed ?? '').length;
        for (const ch of String(seed ?? '')) { h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
        let a = h >>> 0;
        return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    }
    const newSeed = () => Math.random().toString(36).slice(2, 8).toUpperCase();
    function shuffle(list, rand) { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

    /* ═════ Les personnes du jeu ═════ */
    /** génération d'un numéro Sosa : 1 → 0, 2-3 → 1, 4-7 → 2… */
    const sosaGen = n => (n >= 1 ? Math.floor(Math.log2(n)) : -1);
    /** côté d'un Sosa : 'pere' (2, 4-5, 8-11…), 'mere' (3, 6-7, 12-15…), '' pour 1 */
    function sosaSide(n) { if (!(n >= 2)) return ''; const g = sosaGen(n); return n < 3 * 2 ** (g - 1) ? 'pere' : 'mere'; }
    const yearOf = ev => (ev && ev.date && ev.date.y) || 0;
    const fullName = p => [p.first, (p.last || '').toLocaleUpperCase('fr-FR')].filter(Boolean).join(' ').trim() || 'Sans nom';
    /** la commune seule (« Auch (France) » → « Auch ») */
    const townOf = place => String(place || '').replace(/\s*\(.*\)\s*$/, '').split(',')[0].trim();

    /**
     * Les personnes jouables. data : la réponse de mode_simple_data ; o : {scope: 'all'|'sosa'|'gen'|'branch'|'people', gen, rootId, ids, sosa: {id: n}}
     * Jamais les vivants ni les fiches confidentielles.
     */
    function pool(data, o = {}) {
        const sosa = o.sosa || {}, persons = Array.isArray(data?.persons) ? data.persons : [];
        const parents = new Map();
        (data?.families || []).forEach(f => (f.c || []).forEach(c => { const l = parents.get(c) || []; [f.a, f.b].forEach(x => { if (x && !l.includes(x)) l.push(x); }); parents.set(c, l); }));
        let keep = null;
        if (o.scope === 'branch' && o.rootId) { keep = new Set(); const todo = [Number(o.rootId)]; while (todo.length) { const id = todo.shift(); if (keep.has(id)) continue; keep.add(id); (parents.get(id) || []).forEach(x => todo.push(x)); } }
        if (o.scope === 'people') keep = new Set((o.ids || []).map(Number));
        const out = [];
        persons.forEach(p => {
            if (!p || p.living || p.priv) return;
            const n = Number(sosa[p.id]) || 0;
            if (o.scope === 'sosa' && !n) return;
            if (o.scope === 'gen' && sosaGen(n) !== Number(o.gen)) return;
            if (keep && !keep.has(p.id)) return;
            const birth = p.birth || p.bapt || null;
            out.push({id: p.id, first: p.first || '', last: p.last || '', name: fullName(p), g: p.g || 'u', photo: p.photo || '', job: p.job || '',
                by: yearOf(birth), bdate: birth?.date || null, btown: townOf(birth?.place), dy: yearOf(p.death), ddate: p.death?.date || null, dtown: townOf(p.death?.place),
                sosa: n, gen: n ? sosaGen(n) : -1, side: sosaSide(n)});
        });
        return out;
    }
    /** une personne au format attendu par UI.avatar (K7) */
    const avatarOf = p => ({id: p.id, first_name: p.first, last_name: p.last, gender: p.g === 'm' ? 'male' : p.g === 'f' ? 'female' : '', photo: p.photo, name: p.name, sosa: p.sosa});
    const lifeOf = p => (p.by || p.dy ? `${p.by || '?'} – ${p.dy || '?'}` : '');

    /* ═════ 1. Qui est-ce ? ═════ */
    const jobKey = s => String(s || '').toLocaleLowerCase('fr-FR').replace(/\s+/g, ' ').trim();
    const firstLetter = p => String(p.last || p.first || '').normalize('NFD').replace(/[̀-ͯ]/g, '').charAt(0).toUpperCase();
    /**
     * Les questions possibles pour ces candidats : {id, text, test(p) → true / false / null (on ne sait pas)}.
     * Seulement celles qui partagent vraiment les candidats (au moins un oui et un non connus).
     */
    function quizQuestions(cands) {
        const qs = [], add = (id, text, test, cat) => { let yes = 0, no = 0; cands.forEach(p => { const r = test(p); if (r === true) yes++; else if (r === false) no++; }); if (yes && no) qs.push({id, text, test, cat, yes, no}); };
        add('g:f', 'Est-ce une femme ?', p => (p.g === 'f' ? true : p.g === 'm' ? false : null), 'Qui');
        add('photo', 'A-t-on son portrait (une photo) ?', p => !!p.photo, 'Qui');
        const years = [...new Set(cands.map(p => p.by).filter(Boolean))].sort((a, b) => a - b);
        [1650, 1700, 1750, 1800, 1825, 1850, 1875, 1900, 1925].forEach(y => { if (years.length && years[0] < y && years[years.length - 1] >= y) add(`by<${y}`, `Cette personne est-elle née avant ${y} ?`, p => (p.by ? p.by < y : null), 'Quand'); });
        [40, 60, 80].forEach(a => add(`age>${a}`, `A-t-elle vécu plus de ${a} ans ?`, p => (p.by && p.dy ? p.dy - p.by > a : null), 'Quand'));
        const towns = new Map(); cands.forEach(p => { if (p.btown) towns.set(p.btown, (towns.get(p.btown) || 0) + 1); });
        [...towns.keys()].sort((a, b) => a.localeCompare(b, 'fr')).forEach(t => add(`bt:${t}`, `Est-elle née à ${t} ?`, p => (p.btown ? p.btown === t : null), 'Où'));
        const dtowns = new Set(cands.map(p => p.dtown).filter(Boolean));
        [...dtowns].sort((a, b) => a.localeCompare(b, 'fr')).forEach(t => add(`dt:${t}`, `Est-elle morte à ${t} ?`, p => (p.dtown ? p.dtown === t : null), 'Où'));
        const jobs = new Map(); cands.forEach(p => { const k = jobKey(p.job); if (k) jobs.set(k, p.job.trim()); });
        [...jobs.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr')).forEach(([k, label]) => add(`job:${k}`, `Était-elle ${label.toLocaleLowerCase('fr-FR')} ?`, p => (p.job ? jobKey(p.job) === k : null), 'Métier'));
        add('side:pere', 'Est-ce du côté de ton père ?', p => (p.side ? p.side === 'pere' : null), 'Famille');
        const gens = [...new Set(cands.map(p => p.gen).filter(g => g > 0))].sort((a, b) => a - b);
        gens.forEach(g => add(`gen:${g}`, `Est-ce ${genLabel(g)} ?`, p => (p.gen > 0 ? p.gen === g : null), 'Famille'));
        const letters = [...new Set(cands.map(firstLetter).filter(Boolean))].sort();
        letters.forEach(l => add(`l:${l}`, `Son nom commence-t-il par ${l} ?`, p => (firstLetter(p) ? firstLetter(p) === l : null), 'Nom'));
        return qs;
    }
    function genLabel(g) { return g === 1 ? 'un parent' : g === 2 ? 'un grand-parent' : g === 3 ? 'un arrière-grand-parent' : `un ancêtre de la génération ${g}`; }
    /** la réponse pour la personne cachée : 'oui', 'non' ou 'inconnu' */
    function quizAnswer(q, secret) { const r = q.test(secret); return r === true ? 'oui' : r === false ? 'non' : 'inconnu'; }
    /** les candidats encore possibles après les réponses déjà données */
    function quizRemaining(cands, asked, byId) {
        return cands.filter(p => asked.every(a => { const q = byId(a.id); if (!q || a.answer === 'inconnu') return true; const r = q.test(p); return r === null || (r === true) === (a.answer === 'oui'); }));
    }

    /* ═════ 2. Memory ═════ */
    const MEMORY_KINDS = {
        nom: {label: 'Portrait ↔ nom', b: p => p.name, ok: p => !!p.name},
        village: {label: 'Personne ↔ village de naissance', b: p => p.btown, ok: p => !!p.btown},
        metier: {label: 'Personne ↔ métier', b: p => p.job, ok: p => !!p.job},
        annee: {label: 'Personne ↔ année de naissance', b: p => String(p.by), ok: p => !!p.by},
    };
    /** un paquet de 2×n cartes mélangées ; les valeurs en double sont écartées (deux paires ne doivent pas se ressembler) */
    function memoryDeck(people, kind, n, seed) {
        const K = MEMORY_KINDS[kind] || MEMORY_KINDS.nom, rand = rng(seed), seen = new Set(), chosen = [];
        for (const p of shuffle(people.filter(K.ok), rand)) { const v = jobKey(K.b(p)); if (seen.has(v)) continue; seen.add(v); chosen.push(p); if (chosen.length >= n) break; }
        const cards = [];
        chosen.forEach((p, i) => { cards.push({pair: i, side: 'a', pid: p.id}); cards.push({pair: i, side: 'b', pid: p.id, text: K.b(p)}); });
        return {pairs: chosen.length, cards: shuffle(cards, rand).map((c, i) => ({...c, i}))};
    }
    const memoryMatch = (a, b) => !!a && !!b && a.i !== b.i && a.pair === b.pair;

    /* ═════ 3. La bonne date ═════ */
    const HISTORY = [[1515, 'Bataille de Marignan'], [1539, 'Ordonnance de Villers-Cotterêts : les curés tiennent les registres en français'], [1572, 'Massacre de la Saint-Barthélemy'], [1598, 'Édit de Nantes'],
        [1610, 'Assassinat d’Henri IV'], [1643, 'Louis XIV devient roi'], [1667, 'Ordonnance de Saint-Germain-en-Laye : registres en double'], [1685, 'Révocation de l’édit de Nantes'],
        [1709, 'Le « Grand Hiver »'], [1715, 'Mort de Louis XIV'], [1756, 'Début de la guerre de Sept Ans'], [1789, 'Prise de la Bastille'], [1792, 'L’état civil est confié aux mairies'],
        [1793, 'Calendrier républicain'], [1804, 'Napoléon Ier, empereur'], [1815, 'Bataille de Waterloo'], [1830, 'Révolution de Juillet'], [1832, 'Grande épidémie de choléra'],
        [1848, 'Suffrage universel masculin, fin de l’esclavage'], [1852, 'Second Empire'], [1854, 'Nouvelle épidémie de choléra'], [1870, 'Guerre franco-prussienne'], [1871, 'La Commune de Paris'],
        [1882, 'École gratuite, laïque et obligatoire'], [1889, 'Tour Eiffel'], [1905, 'Séparation des Églises et de l’État'], [1914, 'Début de la Première Guerre mondiale'], [1918, 'Armistice du 11 novembre'],
        [1918, 'Grippe espagnole'], [1936, 'Premiers congés payés'], [1939, 'Début de la Seconde Guerre mondiale'], [1944, 'Droit de vote des femmes'], [1945, 'Fin de la Seconde Guerre mondiale'],
        [1958, 'Ve République'], [1968, 'Mai 68'], [1969, 'Premiers pas sur la Lune'], [1981, 'Abolition de la peine de mort'], [2002, 'L’euro en pièces et billets']];
    /** clé de comparaison : année, mois, jour (0 = inconnu) ; dates « vers » gardées (≈) */
    const dkey = d => ({y: Number(d?.y) || 0, m: Number(d?.m) || 0, d: Number(d?.d) || 0, about: !!d?.about});
    /** compare deux dates ; 0 quand on ne peut pas les départager (même année et mois ou jour inconnu) */
    function cmpDate(a, b) {
        if (a.y !== b.y) return a.y - b.y;
        if (!a.m || !b.m || a.about || b.about) return 0;
        if (a.m !== b.m) return a.m - b.m;
        if (!a.d || !b.d) return 0;
        return a.d - b.d;
    }
    /** tous les événements possibles : naissances, décès, mariages (+ histoire si demandé) */
    function timelineEvents(data, people, {history = false, kinds = ['naissance', 'deces', 'mariage']} = {}) {
        const ok = new Set(people.map(p => p.id)), byId = new Map(people.map(p => [p.id, p])), out = [];
        people.forEach(p => {
            if (kinds.includes('naissance') && p.bdate?.y) out.push({id: `b${p.id}`, kind: 'naissance', icon: '👶', text: `Naissance de ${p.name}`, where: p.btown, date: dkey(p.bdate), pid: p.id});
            if (kinds.includes('deces') && p.ddate?.y) out.push({id: `d${p.id}`, kind: 'deces', icon: '✝', text: `Décès de ${p.name}`, where: p.dtown, date: dkey(p.ddate), pid: p.id});
        });
        if (kinds.includes('mariage')) (data?.families || []).forEach(f => { if (!f.marr?.date?.y || !(ok.has(f.a) || ok.has(f.b))) return; const a = byId.get(f.a), b = byId.get(f.b); if ((f.a && !a) || (f.b && !b)) return; out.push({id: `m${f.id}`, kind: 'mariage', icon: '💍', text: `Mariage de ${[a, b].filter(Boolean).map(x => x.name).join(' et ')}`, where: townOf(f.marr.place), date: dkey(f.marr.date), pid: (a || b).id}); });
        if (history) HISTORY.forEach(([y, t], i) => out.push({id: `h${i}`, kind: 'histoire', icon: '📜', text: t, where: '', date: {y, m: 0, d: 0, about: false}}));
        return out;
    }
    /** n événements au hasard, au moins `gap` années entre deux d'entre eux */
    function timelineDeck(events, n, gap, seed) {
        const rand = rng(seed), picked = [];
        for (const e of shuffle(events, rand)) { if (picked.some(x => Math.abs(x.date.y - e.date.y) < Math.max(0, gap) || (gap <= 0 && x.date.y === e.date.y && x.text === e.text))) continue; picked.push(e); if (picked.length >= n) break; }
        return picked;
    }
    /** la carte va-t-elle à cette place (entre line[at-1] et line[at]) ? */
    function timelineFits(line, card, at) { const prev = line[at - 1], next = line[at]; return (!prev || cmpDate(prev.date, card.date) <= 0) && (!next || cmpDate(card.date, next.date) <= 0); }
    /** la vraie place (la première qui convient) */
    function timelinePlace(line, card) { for (let i = 0; i <= line.length; i++) if (timelineFits(line, card, i)) return i; return line.length; }
    const dateText = d => { const M = ['', 'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']; return `${d.about ? '≈ ' : ''}${d.d && d.m ? d.d + ' ' : ''}${d.m ? M[d.m] + ' ' : ''}${d.y}`; };

    /* ═════ 4. Morpion ═════ */
    const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
    /** la ligne gagnante qui passe par (r, c), ou null. board[r][c] = numéro du joueur, -1 = vide */
    function morpionLine(board, r, c, k, diag = true) {
        const who = board[r]?.[c]; if (who == null || who < 0) return null;
        for (const [dr, dc] of DIRS) {
            if (!diag && dr && dc) continue;
            const cells = [[r, c]];
            for (const s of [1, -1]) { let i = r + dr * s, j = c + dc * s; while (board[i]?.[j] === who) { cells.push([i, j]); i += dr * s; j += dc * s; } }
            if (cells.length >= k) return cells.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        }
        return null;
    }
    const emptyBoard = (rows, cols) => Array.from({length: rows}, () => Array(cols).fill(-1));
    /** les cases jouables (avec la gravité : la plus basse de chaque colonne) */
    function morpionMoves(board, gravity) {
        const rows = board.length, cols = board[0]?.length || 0, out = [];
        if (gravity) { for (let c = 0; c < cols; c++) for (let r = rows - 1; r >= 0; r--) if (board[r][c] < 0) { out.push([r, c]); break; } }
        else for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (board[r][c] < 0) out.push([r, c]);
        return out;
    }
    /** avec la gravité, le pion tombe : la case réellement jouée dans cette colonne */
    function morpionDrop(board, c) { for (let r = board.length - 1; r >= 0; r--) if (board[r][c] < 0) return [r, c]; return null; }
    /** la grille qui s'agrandit : une rangée ou une colonne de plus si on joue au bord (max). Renvoie {board, r, c} décalés */
    function morpionGrow(board, r, c, max = 25) {
        let b = board.map(x => x.slice()), R = r, C = c;
        const cols = () => b[0].length;
        if (R === 0 && b.length < max) { b.unshift(Array(cols()).fill(-1)); R++; }
        if (R === b.length - 1 && b.length < max) b.push(Array(cols()).fill(-1));
        if (C === 0 && cols() < max) { b = b.map(x => [-1, ...x]); C++; }
        if (C === cols() - 1 && cols() < max) b = b.map(x => [...x, -1]);
        return {board: b, r: R, c: C};
    }
    /** le plus long alignement qu'on obtiendrait en jouant (r, c) pour `who` */
    function runAt(board, r, c, who, diag) {
        let best = 0;
        for (const [dr, dc] of DIRS) { if (!diag && dr && dc) continue; let n = 1, open = 0; for (const s of [1, -1]) { let i = r + dr * s, j = c + dc * s; while (board[i]?.[j] === who) { n++; i += dr * s; j += dc * s; } if (board[i]?.[j] === -1) open++; } best = Math.max(best, n * 2 + open); }
        return best;
    }
    /** l'ordinateur : « simple » (gagne ou bloque, sinon au hasard près des pions), « moyen » (gagne, bloque, puis la meilleure case) */
    function morpionAI(board, who, o) {
        const {k, gravity, diag = true, level = 'simple', players = 2, rand = Math.random} = o, moves = morpionMoves(board, gravity);
        if (!moves.length) return null;
        const wins = (r, c, p) => { const b = board.map(x => x.slice()); b[r][c] = p; return !!morpionLine(b, r, c, k, diag); };
        for (const [r, c] of moves) if (wins(r, c, who)) return [r, c];
        for (let p = 0; p < players; p++) if (p !== who) for (const [r, c] of moves) if (wins(r, c, p)) return [r, c];
        const near = moves.filter(([r, c]) => [-1, 0, 1].some(a => [-1, 0, 1].some(b => (board[r + a]?.[c + b] ?? -1) >= 0)));
        if (level !== 'moyen') { const l = near.length ? near : moves; return l[Math.floor(rand() * l.length)]; }
        const rows = board.length, cols = board[0].length; let best = null, score = -Infinity;
        for (const [r, c] of moves) {
            let s = runAt(board, r, c, who, diag) * 3; for (let p = 0; p < players; p++) if (p !== who) s += runAt(board, r, c, p, diag) * 2;
            s -= (Math.abs(r - (rows - 1) / 2) + Math.abs(c - (cols - 1) / 2)) * 0.3; s += rand() * 0.5;
            if (s > score) { score = s; best = [r, c]; }
        }
        return best;
    }

    const API = {rng, newSeed, shuffle, sosaGen, sosaSide, pool, avatarOf, lifeOf, fullName, townOf,
        quizQuestions, quizAnswer, quizRemaining, genLabel, MEMORY_KINDS, memoryDeck, memoryMatch,
        HISTORY, cmpDate, timelineEvents, timelineDeck, timelineFits, timelinePlace, dateText,
        morpionLine, emptyBoard, morpionMoves, morpionDrop, morpionGrow, morpionAI};
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    root.LCNDA_JEUX_LOGIQUE = API;
})(typeof window !== 'undefined' ? window : globalThis);
