/* LCNDA — 🂠 Patiences : les règles, sans écran (testées dans Node : tests/test-patiences.js).
 *
 * Un seul moteur pour des dizaines de jeux de cartes qui se jouent seul. Chaque jeu est décrit par des réglages
 * (GAMES) : combien de jeux de cartes, comment on distribue, comment on construit sur le tableau, ce qu'on peut
 * déplacer, ce qui va dans une colonne vide, comment monte une fondation, ce que fait la pioche…
 * Quelques jeux à paires ou à suite (Golf, Pyramide, Trois sommets, Horloge, Monte-Carlo, Onze, Quatorze, Accordéon,
 * As en haut, Trou noir, Calcul) ont leur petite mécanique à eux (MODES).
 *
 * Une carte : {r: 1..13 (As..Roi), s: 0..3 (0, 1 rouges ; 2, 3 noires), up: visible, i: numéro unique}.
 * Une partie : {k, seed, piles: [{id, type, x, y, fan, cards}], moves, redeals, base, won, lost, hand?}.
 *   type : stock (pioche), waste (défausse), found (fondation), tab (tableau), cell (case libre), reserve, slot (une place d'un dessin).
 *   x, y : la place, en largeurs de carte ; fan : 'down' (en colonne), 'right' (en éventail), 'stack' (en tas), 'right3' (les 3 dernières).
 * API (window.LCNDA_PATIENCES) : GAMES, FAMILIES, get(k), deal(k, seed), canPick, canDrop, move, tap, stock, trySet, autoAll, hint, counts.
 */
(() => {
    'use strict';
    const root = typeof window !== 'undefined' ? window : globalThis;

    /* ═════ Le hasard qui se rejoue ═════ */
    function rng(seed) {
        let h = 1779033703 ^ String(seed).length;
        for (const ch of String(seed)) { h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
        let a = h >>> 0;
        return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    }
    const shuffle = (list, R) => { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const red = c => c.s === 0 || c.s === 1;
    const top = p => p.cards[p.cards.length - 1];
    const U = 1.16; // une place de carte (la carte et son espace)

    /* ═════ Les jeux ═════ */
    const ALL = Infinity;
    // modèles de distribution
    const kl = n => Array.from({length: n}, (_, i) => i + 1);
    const klDown = n => Array.from({length: n}, (_, i) => i);
    const even = (n, k) => Array(n).fill(k);
    const FAMILIES = [
        ['klondike', '🂡 La famille Klondike', 'Des colonnes en escalier, des cartes cachées à découvrir, une pioche.'],
        ['freecell', '🗃 Avec des cases libres', 'Tout est visible dès le départ : la réflexion compte plus que la chance.'],
        ['spider', '🕸 Les araignées', 'On fait des suites complètes du Roi à l’As dans une même couleur, elles s’en vont toutes seules.'],
        ['yukon', '🏔 La famille Yukon', 'On peut déplacer n’importe quel groupe de cartes visibles.'],
        ['forty', '🧺 Les quarante voleurs et leurs cousins', 'Deux jeux de cartes, beaucoup de colonnes, une seule pioche.'],
        ['builder', '🏰 Châteaux et jardins', 'Pas de pioche : tout est sur la table, il faut trouver le bon ordre.'],
        ['pairs', '🎯 Jeux de paires et de suites', 'Des règles à part : on enlève des paires, on suit au plus ou au moins un…'],
    ];
    /* Les réglages d'un jeu (valeurs par défaut dans norm) :
     *  decks 1 | 2 · suits 4 | 2 | 1 (araignées) · tab {n, deal, down, build, move, empty, wrap, grid, by, max, first, toFound}
     *  found {base: 1 | 'first' | rang, wrap, out (rangs posés d'avance), outN, n, down, by, cards, baseAll, spider}
     *  stock {to: waste | tab | tab3 | shuffle | reserves | none, draw, redeals, needFull, per, keep, skipEmpty}
     *  cells, cellsFill, cellsLate · reserve {n, kind: 'canfield' | 'fan', open} · reserves {n, deal} · kingsBottom
     *  build : alt (couleur alternée) · suit (même couleur… de carte) · any · color (même teinte rouge/noire) · notown (autre couleur de carte)
     *          · suitud (même couleur, + ou − 1) · anyud (n'importe quelle couleur, + ou − 1) · none (on ne construit pas sur le tableau)
     *  move : seq (une suite bien construite) · one (une carte, ou une suite si les cases libres le permettent) · any (tout groupe visible)
     *         · suitseq (une suite dans la même couleur) · colorseq (une suite dans la même teinte rouge/noire, la tarentule)
     *  empty : any · king · none · reserve (rempli tout seul par la réserve)
     *  Les réglages ajoutés avec les patiences de la fin de la liste (absents = comme avant) :
     *   tab.down 'alt' : une carte cachée sur deux (la première cachée) · tab.by : on descend de 2 en 2 (mont Olympe)
     *   tab.max : jamais plus de max cartes dans une pile (Shamrocks) · tab.first [rangs] : ces cartes sont distribuées en premier,
     *     donc tout au fond des colonnes (FreeCell défi) · tab.toFound : pendant la distribution, une carte qui peut monter y va (la citadelle)
     *   found.outN : seulement n cartes posées d'avance par rang, de couleurs de carte différentes (Bonne mesure, Pair et impair)
     *   found.n : le nombre de fondations qui montent (sinon 4 par jeu de cartes) · found.down : autant de fondations en plus qui
     *     descendent du Roi à l'As (Bisley) · found.by : les fondations montent de 2 en 2 · found.cards [[rang, couleur]…] : ces cartes
     *     précises commencent les fondations (le cadran du grand-père) · found.baseAll : avec base 'first', les autres cartes de même
     *     valeur montent aussi tout de suite (le pingouin)
     *   stock.to 'reserves' : la pioche pose une carte sur chaque tas de réserve (reserves {n, deal} : n tas de deal cartes, seule celle du
     *     dessus se joue) · stock.per : par combien on redistribue ('shuffle', 3 par défaut) · stock.keep : on ramasse sans mélanger
     *     (la cruelle) · stock.skipEmpty : 'tab' ne pose rien sur les colonnes vides (Motif de divorce)
     *   cellsLate : les cases libres ne s'ouvrent que quand la pioche est vide (Miss Milligan)
     *  Les jeux à part (MODES) ont aussi leurs petits réglages : golf {cols, rows, decks} · tripeaks {nowrap} · acesup {cols}
     *   · sum {stack : la pioche pose une carte sur chaque tas, la baronne} · calc {calc: {start: 'calc' | 'empty' | 'aces', match: 'any' |
     *   'suit' | 'color', piles, hold, redeals}} · pyramid {giza, draw} · montana {grid: [4, 14], aceDeal: 'blue' | 'red'}
     *   · montecarlo {sum} · nestor {grid: [cartes par colonne, colonnes], down, all, sum} */
    const GAMES = [
        // ── Klondike
        {k: 'klondike1', fam: 'klondike', name: 'Klondike (1 carte)', diff: 2, desc: 'Le classique : 7 colonnes en escalier, on construit en descendant et en alternant rouge et noir. La pioche se retourne une carte à la fois, sans limite.', tab: {n: 7}, stock: {draw: 1}},
        {k: 'klondike3', fam: 'klondike', name: 'Klondike (3 cartes)', diff: 3, desc: 'Comme Klondike, mais la pioche se retourne trois cartes à la fois : seule la dernière se joue.', tab: {n: 7}, stock: {draw: 3}},
        {k: 'klondike3p', fam: 'klondike', name: 'Klondike en 3 passes', diff: 4, desc: 'Trois cartes à la fois, et on ne peut repasser la pioche que deux fois.', tab: {n: 7}, stock: {draw: 3, redeals: 2}},
        {k: 'thoughtful', fam: 'klondike', name: 'Klondike à découvert', diff: 1, desc: 'Klondike, mais toutes les cartes du tableau sont visibles dès le départ.', tab: {n: 7, down: 'none'}, stock: {draw: 1}},
        {k: 'saratoga', fam: 'klondike', name: 'Saratoga', diff: 2, desc: 'Klondike à découvert avec une pioche de trois cartes.', tab: {n: 7, down: 'none'}, stock: {draw: 3}},
        {k: 'whitehead', fam: 'klondike', name: 'Whitehead', diff: 3, desc: 'Tout est visible ; on descend dans la même teinte (rouge sur rouge, noir sur noir), on déplace les suites d’une même couleur de carte, une colonne vide prend n’importe quelle carte.', tab: {n: 7, down: 'none', build: 'color', move: 'suitseq', empty: 'any'}, stock: {draw: 1, redeals: 0}},
        {k: 'easthaven', fam: 'klondike', name: 'Easthaven', diff: 3, desc: '7 colonnes de 3 cartes ; la pioche distribue une carte sur chaque colonne. Une colonne vide prend n’importe quelle carte.', tab: {n: 7, deal: even(7, 3), down: even(7, 2), empty: 'any'}, stock: {to: 'tab'}},
        {k: 'westcliff', fam: 'klondike', name: 'Westcliff', diff: 2, desc: 'Les As sont posés d’avance ; 10 colonnes de 3 cartes (deux cachées), une pioche d’une carte, sans nouvelle passe.', found: {out: [1]}, tab: {n: 10, deal: even(10, 3), down: even(10, 2), empty: 'any'}, stock: {draw: 1, redeals: 0}},
        {k: 'klondike2', fam: 'klondike', name: 'Klondike double', diff: 3, desc: 'Avec deux jeux de cartes : 9 colonnes, 8 fondations.', decks: 2, tab: {n: 9}, stock: {draw: 1}},
        {k: 'gargantua', fam: 'klondike', name: 'Gargantua', diff: 3, desc: 'Deux jeux, 9 colonnes ; une colonne vide prend n’importe quelle carte, et la pioche ne repasse qu’une fois.', decks: 2, tab: {n: 9, empty: 'any'}, stock: {draw: 1, redeals: 1}},
        {k: 'canfield', fam: 'klondike', name: 'Canfield', diff: 4, desc: 'Une réserve de 13 cartes, 4 colonnes. La première fondation donne la carte de départ des autres ; on peut passer du Roi à l’As. Une colonne vide se remplit avec la réserve.', reserve: {n: 13, kind: 'canfield'}, tab: {n: 4, deal: even(4, 1), down: 'none', wrap: true, empty: 'reserve'}, found: {base: 'first', wrap: true}, stock: {draw: 3}},
        {k: 'rainbow', fam: 'klondike', name: 'Arc-en-ciel', diff: 3, desc: 'Canfield avec une pioche d’une carte, qui ne repasse que deux fois.', reserve: {n: 13, kind: 'canfield'}, tab: {n: 4, deal: even(4, 1), down: 'none', wrap: true, empty: 'reserve'}, found: {base: 'first', wrap: true}, stock: {draw: 1, redeals: 2}},
        {k: 'canfieldopen', fam: 'klondike', name: 'Canfield à découvert', diff: 3, desc: 'Canfield, mais on voit toute la réserve (seule la carte du dessus se joue), et une colonne vide prend n’importe quelle carte.', reserve: {n: 13, kind: 'canfield', open: true}, tab: {n: 4, deal: even(4, 1), down: 'none', wrap: true, empty: 'any'}, found: {base: 'first', wrap: true}, stock: {draw: 3}},
        {k: 'storehouse', fam: 'klondike', name: 'L’entrepôt', diff: 2, desc: 'Les quatre 2 sont posés d’avance sur les fondations, qui montent dans la même couleur de carte jusqu’à l’As. Réserve de 13 cartes, on construit dans la même couleur.', reserve: {n: 13, kind: 'canfield'}, tab: {n: 4, deal: even(4, 1), down: 'none', build: 'suit', wrap: true, empty: 'reserve'}, found: {base: 2, out: [2], wrap: true}, stock: {draw: 1, redeals: 2}},
        // ── cases libres
        {k: 'freecell', fam: 'freecell', name: 'FreeCell', diff: 2, desc: 'Toutes les cartes visibles en 8 colonnes, 4 cases libres pour poser une carte. On descend en alternant les couleurs.', cells: 4, tab: {n: 8, deal: 'rest', down: 'none', move: 'one', empty: 'any'}, stock: {to: 'none'}},
        {k: 'freecell2', fam: 'freecell', name: 'FreeCell à 2 cases', diff: 4, desc: 'FreeCell avec seulement deux cases libres : pour les experts.', cells: 2, tab: {n: 8, deal: 'rest', down: 'none', move: 'one', empty: 'any'}, stock: {to: 'none'}},
        {k: 'freecell6', fam: 'freecell', name: 'FreeCell à 6 cases', diff: 1, desc: 'FreeCell avec six cases libres : pour se détendre.', cells: 6, tab: {n: 8, deal: 'rest', down: 'none', move: 'one', empty: 'any'}, stock: {to: 'none'}},
        {k: 'bakersgame', fam: 'freecell', name: 'Baker’s Game', diff: 3, desc: 'Le FreeCell d’origine : on descend dans la même couleur de carte.', cells: 4, tab: {n: 8, deal: 'rest', down: 'none', build: 'suit', move: 'one', empty: 'any'}, stock: {to: 'none'}},
        {k: 'eightoff', fam: 'freecell', name: 'Eight Off', diff: 2, desc: '8 colonnes de 6, 8 cases libres dont 4 déjà occupées ; même couleur de carte, une colonne vide ne prend qu’un Roi.', cells: 8, cellsFill: 4, tab: {n: 8, deal: even(8, 6), down: 'none', build: 'suit', move: 'one', empty: 'king'}, stock: {to: 'none'}},
        {k: 'seahaven', fam: 'freecell', name: 'Seahaven', diff: 3, desc: '10 colonnes de 5, 4 cases libres dont 2 déjà occupées ; même couleur de carte, Roi seulement dans une colonne vide.', cells: 4, cellsFill: 2, tab: {n: 10, deal: even(10, 5), down: 'none', build: 'suit', move: 'one', empty: 'king'}, stock: {to: 'none'}},
        {k: 'freecell2d', fam: 'freecell', name: 'FreeCell double', diff: 3, desc: 'Deux jeux de cartes, 10 colonnes, 6 cases libres, 8 fondations.', decks: 2, cells: 6, tab: {n: 10, deal: 'rest', down: 'none', move: 'one', empty: 'any'}, stock: {to: 'none'}},
        {k: 'penguinlike', fam: 'freecell', name: 'Le manchot', diff: 3, desc: '7 colonnes, 7 cases libres ; on descend dans la même couleur de carte et une colonne vide ne prend qu’un Roi.', cells: 7, tab: {n: 7, deal: 'rest', down: 'none', build: 'suit', move: 'one', empty: 'king'}, stock: {to: 'none'}},
        // ── araignées
        {k: 'spider1', fam: 'spider', name: 'Araignée (1 couleur)', diff: 2, desc: 'Deux jeux, 10 colonnes. On descend sans s’occuper des couleurs ; une suite complète du Roi à l’As s’en va. La pioche pose une carte sur chaque colonne.', decks: 2, suits: 1, tab: {n: 10, deal: [6, 6, 6, 6, 5, 5, 5, 5, 5, 5], build: 'any', move: 'suitseq', empty: 'any'}, found: {spider: true}, stock: {to: 'tab', needFull: true}},
        {k: 'spider2', fam: 'spider', name: 'Araignée (2 couleurs)', diff: 3, desc: 'L’araignée avec deux couleurs de cartes : seules les suites d’une même couleur se déplacent ensemble.', decks: 2, suits: 2, tab: {n: 10, deal: [6, 6, 6, 6, 5, 5, 5, 5, 5, 5], build: 'any', move: 'suitseq', empty: 'any'}, found: {spider: true}, stock: {to: 'tab', needFull: true}},
        {k: 'spider4', fam: 'spider', name: 'Araignée (4 couleurs)', diff: 5, desc: 'La vraie araignée, avec les quatre couleurs : très difficile.', decks: 2, tab: {n: 10, deal: [6, 6, 6, 6, 5, 5, 5, 5, 5, 5], build: 'any', move: 'suitseq', empty: 'any'}, found: {spider: true}, stock: {to: 'tab', needFull: true}},
        {k: 'spiderette', fam: 'spider', name: 'Petite araignée', diff: 3, desc: 'L’araignée avec un seul jeu, en escalier comme Klondike.', tab: {n: 7, build: 'any', move: 'suitseq', empty: 'any'}, found: {spider: true}, stock: {to: 'tab', needFull: true}},
        {k: 'wisp', fam: 'spider', name: 'Feu follet', diff: 3, desc: 'Un seul jeu, 7 colonnes de 3 cartes (deux cachées), règles de l’araignée.', tab: {n: 7, deal: even(7, 3), down: even(7, 2), build: 'any', move: 'suitseq', empty: 'any'}, found: {spider: true}, stock: {to: 'tab', needFull: true}},
        {k: 'scorpion', fam: 'spider', name: 'Scorpion', diff: 4, desc: '7 colonnes de 7 (les quatre premières cachent 3 cartes) ; on descend dans la même couleur de carte et on déplace n’importe quel groupe. Les 3 dernières cartes vont sur les trois premières colonnes.', tab: {n: 7, deal: even(7, 7), down: [3, 3, 3, 3, 0, 0, 0], build: 'suit', move: 'any', empty: 'king'}, found: {spider: true}, stock: {to: 'tab3'}},
        {k: 'wasp', fam: 'spider', name: 'La guêpe', diff: 3, desc: 'Scorpion plus gentil : une colonne vide prend n’importe quelle carte.', tab: {n: 7, deal: even(7, 7), down: [3, 3, 3, 0, 0, 0, 0], build: 'suit', move: 'any', empty: 'any'}, found: {spider: true}, stock: {to: 'tab3'}},
        {k: 'simplesimon', fam: 'spider', name: 'Simple Simon', diff: 2, desc: 'Un seul jeu, tout est visible en 10 colonnes (8, 8, 8, 7… 1), pas de pioche : règles de l’araignée.', tab: {n: 10, deal: [8, 8, 8, 7, 6, 5, 4, 3, 2, 1], down: 'none', build: 'any', move: 'suitseq', empty: 'any'}, found: {spider: true}, stock: {to: 'none'}},
        // ── Yukon
        {k: 'yukon', fam: 'yukon', name: 'Yukon', diff: 3, desc: 'Pas de pioche : tout est sur la table. On peut déplacer n’importe quel groupe de cartes visibles, pourvu que la première aille bien.', tab: {n: 7, deal: [1, 6, 7, 8, 9, 10, 11], down: klDown(7), move: 'any'}, stock: {to: 'none'}},
        {k: 'russian', fam: 'yukon', name: 'Solitaire russe', diff: 4, desc: 'Yukon, mais on descend dans la même couleur de carte.', tab: {n: 7, deal: [1, 6, 7, 8, 9, 10, 11], down: klDown(7), build: 'suit', move: 'any'}, stock: {to: 'none'}},
        {k: 'alaska', fam: 'yukon', name: 'Alaska', diff: 3, desc: 'Yukon où l’on construit dans la même couleur de carte, en montant ou en descendant.', tab: {n: 7, deal: [1, 6, 7, 8, 9, 10, 11], down: klDown(7), build: 'suitud', move: 'any'}, stock: {to: 'none'}},
        {k: 'moosehide', fam: 'yukon', name: 'L’élan', diff: 3, desc: 'Yukon où l’on descend sur n’importe quelle couleur de carte, sauf la sienne.', tab: {n: 7, deal: [1, 6, 7, 8, 9, 10, 11], down: klDown(7), build: 'notown', move: 'any'}, stock: {to: 'none'}},
        {k: 'yukonopen', fam: 'yukon', name: 'Yukon à découvert', diff: 2, desc: 'Yukon avec toutes les cartes visibles.', tab: {n: 7, deal: [1, 6, 7, 8, 9, 10, 11], down: 'none', move: 'any'}, stock: {to: 'none'}},
        {k: 'yukon2', fam: 'yukon', name: 'Yukon double', diff: 3, desc: 'Deux jeux, 10 colonnes, 8 fondations.', decks: 2, tab: {n: 10, deal: [1, 10, 11, 12, 13, 14, 15, 9, 9, 10], down: [0, 1, 2, 3, 4, 5, 6, 3, 3, 4], move: 'any'}, stock: {to: 'none'}},
        // ── quarante voleurs
        {k: 'forty', fam: 'forty', name: 'Les quarante voleurs', diff: 4, desc: 'Deux jeux, 10 colonnes de 4 cartes visibles ; on descend dans la même couleur de carte, une seule carte à la fois. La pioche ne passe qu’une fois.', decks: 2, tab: {n: 10, deal: even(10, 4), down: 'none', build: 'suit', move: 'one', empty: 'any'}, stock: {draw: 1, redeals: 0}},
        {k: 'lucas', fam: 'forty', name: 'Lucas', diff: 3, desc: 'Les huit As sont posés d’avance ; 13 colonnes de 3 cartes.', decks: 2, found: {out: [1]}, tab: {n: 13, deal: even(13, 3), down: 'none', build: 'suit', move: 'one', empty: 'any'}, stock: {draw: 1, redeals: 0}},
        {k: 'numberten', fam: 'forty', name: 'Numéro dix', diff: 3, desc: '10 colonnes de 4 (deux cachées), on alterne les couleurs et on déplace des suites entières.', decks: 2, tab: {n: 10, deal: even(10, 4), down: even(10, 2), build: 'alt', move: 'seq', empty: 'any'}, stock: {draw: 1, redeals: 0}},
        {k: 'streets', fam: 'forty', name: 'Les rues', diff: 4, desc: 'Les quarante voleurs, mais en alternant rouge et noir.', decks: 2, tab: {n: 10, deal: even(10, 4), down: 'none', build: 'alt', move: 'one', empty: 'any'}, stock: {draw: 1, redeals: 0}},
        {k: 'indian', fam: 'forty', name: 'L’indienne', diff: 3, desc: '10 colonnes de 3 (une cachée) ; on descend sur n’importe quelle couleur de carte sauf la sienne.', decks: 2, tab: {n: 10, deal: even(10, 3), down: even(10, 1), build: 'notown', move: 'one', empty: 'any'}, stock: {draw: 1, redeals: 0}},
        {k: 'limited', fam: 'forty', name: 'Limité', diff: 3, desc: '12 colonnes de 3 cartes visibles, même couleur de carte, une à la fois.', decks: 2, tab: {n: 12, deal: even(12, 3), down: 'none', build: 'suit', move: 'one', empty: 'any'}, stock: {draw: 1, redeals: 0}},
        {k: 'maria', fam: 'forty', name: 'Maria', diff: 3, desc: '9 colonnes de 4 cartes, on alterne les couleurs, une carte à la fois.', decks: 2, tab: {n: 9, deal: even(9, 4), down: 'none', build: 'alt', move: 'one', empty: 'any'}, stock: {draw: 1, redeals: 0}},
        {k: 'josephine', fam: 'forty', name: 'Joséphine', diff: 3, desc: 'Les quarante voleurs, mais on déplace des suites entières.', decks: 2, tab: {n: 10, deal: even(10, 4), down: 'none', build: 'suit', move: 'seq', empty: 'any'}, stock: {draw: 1, redeals: 0}},
        {k: 'redblack', fam: 'forty', name: 'Rouge et noir', diff: 2, desc: 'Les As sont posés d’avance, 8 colonnes de 4, on alterne les couleurs, la pioche repasse une fois.', decks: 2, found: {out: [1]}, tab: {n: 8, deal: even(8, 4), down: 'none', build: 'alt', move: 'seq', empty: 'any'}, stock: {draw: 1, redeals: 1}},
        // ── châteaux et jardins
        {k: 'beleaguered', fam: 'builder', name: 'Le château assiégé', diff: 3, desc: 'Les As sont posés d’avance, 8 colonnes de 6 cartes ; on descend sans s’occuper des couleurs, une carte à la fois.', found: {out: [1]}, tab: {n: 8, deal: even(8, 6), down: 'none', build: 'any', move: 'one', empty: 'any'}, stock: {to: 'none'}},
        {k: 'streetsalleys', fam: 'builder', name: 'Rues et ruelles', diff: 4, desc: 'Le château assiégé, mais les As restent mélangés aux autres cartes.', tab: {n: 8, deal: [7, 7, 7, 7, 6, 6, 6, 6], down: 'none', build: 'any', move: 'one', empty: 'any'}, stock: {to: 'none'}},
        {k: 'fortress', fam: 'builder', name: 'La forteresse', diff: 4, desc: '10 colonnes ; on construit dans la même couleur de carte, en montant ou en descendant, une carte à la fois.', tab: {n: 10, deal: [6, 6, 5, 5, 5, 5, 5, 5, 5, 5], down: 'none', build: 'suitud', move: 'one', empty: 'any'}, stock: {to: 'none'}},
        {k: 'bakersdozen', fam: 'builder', name: 'La douzaine du boulanger', diff: 2, desc: '13 colonnes de 4, les Rois glissés au fond ; on descend sans s’occuper des couleurs ; une colonne vide reste vide.', kingsBottom: true, tab: {n: 13, deal: even(13, 4), down: 'none', build: 'any', move: 'one', empty: 'none'}, stock: {to: 'none'}},
        {k: 'spanish', fam: 'builder', name: 'La patience espagnole', diff: 2, desc: 'La douzaine du boulanger, mais une colonne vide prend n’importe quelle carte.', tab: {n: 13, deal: even(13, 4), down: 'none', build: 'any', move: 'one', empty: 'any'}, stock: {to: 'none'}},
        {k: 'labellelucie', fam: 'builder', name: 'La Belle Lucie', diff: 3, desc: '17 éventails de 3 cartes ; on descend dans la même couleur de carte. Deux fois, on peut ramasser et redistribuer ce qui reste.', tab: {n: 18, deal: [...even(17, 3), 1], down: 'none', build: 'suit', move: 'one', empty: 'none', grid: 6}, stock: {to: 'shuffle', redeals: 2}},
        {k: 'flowergarden', fam: 'builder', name: 'Le jardin fleuri', diff: 3, desc: '6 colonnes de 6 et un bouquet de 16 cartes où l’on peut prendre n’importe laquelle.', reserve: {n: 16, kind: 'fan'}, tab: {n: 6, deal: even(6, 6), down: 'none', build: 'any', move: 'one', empty: 'any'}, stock: {to: 'none'}},
        {k: 'kingalbert', fam: 'builder', name: 'Le roi Albert', diff: 4, desc: '9 colonnes en escalier toutes visibles, 7 cartes en réserve où l’on peut piocher librement ; on alterne les couleurs.', reserve: {n: 7, kind: 'fan'}, tab: {n: 9, deal: kl(9), down: 'none', build: 'alt', move: 'one', empty: 'any'}, stock: {to: 'none'}},
        {k: 'raglan', fam: 'builder', name: 'Raglan', diff: 3, desc: 'Le roi Albert avec les As posés d’avance et 6 cartes en réserve.', found: {out: [1]}, reserve: {n: 6, kind: 'fan'}, tab: {n: 9, deal: [9, 8, 7, 6, 5, 4, 3, 2, 1], down: 'none', build: 'alt', move: 'one', empty: 'any'}, stock: {to: 'none'}},
        {k: 'castle', fam: 'builder', name: 'Le château fort', diff: 2, desc: '8 colonnes de 6, tout visible, 4 cases libres, on descend sans s’occuper des couleurs.', cells: 4, tab: {n: 8, deal: 'rest', down: 'none', build: 'any', move: 'one', empty: 'any'}, stock: {to: 'none'}},
        // ── paires et suites (MODES)
        {k: 'golf', fam: 'pairs', name: 'Golf', diff: 3, mode: 'golf', desc: '7 colonnes de 5 cartes : envoie sur la défausse une carte d’une valeur juste au-dessus ou au-dessous. Rien ne va sur un Roi.'},
        {k: 'golfwrap', fam: 'pairs', name: 'Golf (le Roi et l’As se suivent)', diff: 2, mode: 'golf', wrap: true, desc: 'Golf, mais l’As suit le Roi et le Roi suit l’As : la partie se prolonge.'},
        {k: 'tripeaks', fam: 'pairs', name: 'Les trois sommets', diff: 2, mode: 'tripeaks', desc: 'Trois montagnes de cartes : envoie sur la défausse une carte découverte juste au-dessus ou au-dessous ; le Roi et l’As se suivent.'},
        {k: 'blackhole', fam: 'pairs', name: 'Le trou noir', diff: 3, mode: 'blackhole', nostock: true, desc: '17 éventails de 3 autour du trou : envoie dans le trou une carte juste au-dessus ou au-dessous de la dernière avalée.'},
        {k: 'pyramid', fam: 'pairs', name: 'La pyramide', diff: 4, mode: 'pyramid', desc: 'Enlève les paires qui font 13 (Valet 11, Dame 12 ; un Roi s’en va seul). Une carte se prend quand plus rien ne la couvre. La pioche ne passe qu’une fois.'},
        {k: 'pyramid3', fam: 'pairs', name: 'La pyramide en 3 passes', diff: 3, mode: 'pyramid', redeals: 2, desc: 'La pyramide, et la pioche repasse deux fois.'},
        {k: 'acesup', fam: 'pairs', name: 'As en haut', diff: 3, mode: 'acesup', desc: '4 colonnes : enlève une carte quand une autre colonne montre une carte plus forte de la même couleur de carte (l’As est le plus fort). Gagné s’il ne reste que les 4 As.'},
        {k: 'clock', fam: 'pairs', name: 'L’horloge', diff: 1, mode: 'clock', desc: '13 tas comme les heures d’une horloge (le Roi au centre) : chaque carte retournée va à son heure. Gagné si tout est retourné avant le 4ᵉ Roi. Un jeu de pure chance, pour se détendre.'},
        {k: 'montecarlo', fam: 'pairs', name: 'Monte-Carlo', diff: 2, mode: 'montecarlo', desc: 'Une grille de 5 × 5 : enlève deux cartes de même valeur qui se touchent (même en diagonale), puis tasse la grille.'},
        {k: 'elevens', fam: 'pairs', name: 'Onze', diff: 2, mode: 'sum', sum: 11, grid: [3, 3], faces: true, desc: 'Une grille de 9 cartes : enlève deux cartes qui font 11, ou un Valet, une Dame et un Roi ensemble.'},
        {k: 'quatorze', fam: 'pairs', name: 'Quatorze', diff: 2, mode: 'sum', sum: 14, grid: [5, 5], desc: 'Une grille de 25 cartes : enlève deux cartes qui font 14 (Valet 11, Dame 12, Roi 13).'},
        {k: 'dix', fam: 'pairs', name: 'Dix', diff: 2, mode: 'sum', sum: 10, grid: [3, 4], faces: 'four', desc: 'Une grille de 12 cartes : enlève deux cartes qui font 10, ou quatre figures de même valeur (4 Valets, 4 Dames, 4 Rois ou quatre 10).'},
        {k: 'accordion', fam: 'pairs', name: 'L’accordéon', diff: 5, mode: 'accordion', nostock: true, desc: 'Toutes les cartes en ligne : pose un tas sur son voisin de gauche, ou sur le 3ᵉ à gauche, s’ils ont la même valeur ou la même couleur de carte. Gagné s’il ne reste qu’un tas.'},
        {k: 'calculation', fam: 'pairs', name: 'Le calcul', diff: 4, mode: 'calc', desc: 'Quatre fondations montent de 1 en 1, de 2 en 2, de 3 en 3 et de 4 en 4. Chaque carte piochée va sur une fondation ou sur l’un des 4 tas d’attente.'},
        // ── ajoutées en 0.9.0 (mêmes règles de base, d'autres réglages)
        {k: 'klondike2c', fam: 'klondike', name: 'Klondike (2 cartes)', diff: 2, desc: 'Klondike, la pioche se retourne deux cartes à la fois : seule la dernière se joue.', tab: {n: 7}, stock: {draw: 2}},
        {k: 'klondikefree', fam: 'klondike', name: 'Klondike libre', diff: 1, desc: 'Klondike, mais une colonne vide accepte n’importe quelle carte (pas seulement un Roi).', tab: {n: 7, empty: 'any'}, stock: {draw: 1}},
        {k: 'trigon', fam: 'klondike', name: 'Trigon', diff: 3, desc: 'Klondike où l’on descend dans la même couleur de carte (♥ sur ♥, ♠ sur ♠) ; on déplace les suites d’une même couleur.', tab: {n: 7, build: 'suit', move: 'suitseq'}, stock: {draw: 1}},
        {k: 'freecell3', fam: 'freecell', name: 'FreeCell à 3 cases', diff: 3, desc: 'FreeCell avec trois cases libres au lieu de quatre.', cells: 3, tab: {n: 8, deal: 'rest', down: 'none', move: 'one', empty: 'any'}, stock: {to: 'none'}},
        {k: 'freecell1', fam: 'freecell', name: 'FreeCell à 1 case', diff: 5, desc: 'FreeCell avec une seule case libre : pour les experts.', cells: 1, tab: {n: 8, deal: 'rest', down: 'none', move: 'one', empty: 'any'}, stock: {to: 'none'}},
        {k: 'freecellrelax', fam: 'freecell', name: 'FreeCell détendu', diff: 1, desc: 'FreeCell, mais une suite bien rangée se déplace d’un coup, quelle que soit sa longueur.', cells: 4, tab: {n: 8, deal: 'rest', down: 'none', move: 'seq', empty: 'any'}, stock: {to: 'none'}},
        {k: 'scorpionopen', fam: 'spider', name: 'Scorpion à découvert', diff: 3, desc: 'Scorpion, mais toutes les cartes sont visibles dès le départ.', tab: {n: 7, deal: even(7, 7), down: 'none', build: 'suit', move: 'any', empty: 'king'}, found: {spider: true}, stock: {to: 'tab3'}},
        {k: 'yukoncells', fam: 'yukon', name: 'Yukon aux cases libres', diff: 2, desc: 'Yukon avec quatre cases libres pour garer une carte.', cells: 4, tab: {n: 7, deal: [1, 6, 7, 8, 9, 10, 11], down: klDown(7), move: 'any'}, stock: {to: 'none'}},
        {k: 'fortyeight', fam: 'forty', name: 'Quarante-huit', diff: 3, desc: 'Deux jeux, 8 colonnes de 5 cartes ; on descend dans la même couleur de carte et la pioche repasse une fois.', decks: 2, tab: {n: 8, deal: even(8, 5), down: 'none', build: 'suit', move: 'one', empty: 'any'}, stock: {draw: 1, redeals: 1}},
        {k: 'diplomat', fam: 'forty', name: 'Le diplomate', diff: 2, desc: 'Deux jeux, 8 colonnes de 4 cartes ; on descend sans regarder la couleur, une carte à la fois. La pioche ne passe qu’une fois.', decks: 2, tab: {n: 8, deal: even(8, 4), down: 'none', build: 'any', move: 'one', empty: 'any'}, stock: {draw: 1, redeals: 0}},
        {k: 'thieves1', fam: 'forty', name: 'Les petits voleurs', diff: 3, desc: 'Les quarante voleurs avec un seul jeu : 7 colonnes de 3 cartes, la pioche ne passe qu’une fois.', tab: {n: 7, deal: even(7, 3), down: 'none', build: 'suit', move: 'one', empty: 'any'}, stock: {draw: 1, redeals: 0}},
        {k: 'trefoil', fam: 'builder', name: 'Le trèfle', diff: 2, desc: 'La Belle Lucie, mais les As sont déjà posés : 16 éventails de 3 cartes, deux redistributions.', found: {out: [1]}, tab: {n: 16, deal: even(16, 3), down: 'none', build: 'suit', move: 'one', empty: 'none', grid: 6}, stock: {to: 'shuffle', redeals: 2}},
        {k: 'somerset', fam: 'builder', name: 'Somerset', diff: 3, desc: 'Tout est sur la table en 10 colonnes (de 1 à 8 cartes, puis 8 et 8) ; on descend en alternant rouge et noir, une carte à la fois.', tab: {n: 10, deal: [1, 2, 3, 4, 5, 6, 7, 8, 8, 8], down: 'none', build: 'alt', move: 'one', empty: 'any'}, stock: {to: 'none'}},
        {k: 'bakersrelax', fam: 'builder', name: 'La douzaine du boulanger libre', diff: 1, desc: 'La douzaine du boulanger, mais une colonne vide accepte n’importe quelle carte.', kingsBottom: true, tab: {n: 13, deal: even(13, 4), down: 'none', build: 'any', move: 'one', empty: 'any'}, stock: {to: 'none'}},
        {k: 'pyramidrelax', fam: 'pairs', name: 'La pyramide sans fin', diff: 2, mode: 'pyramid', redeals: 99, desc: 'La pyramide, et la pioche repasse autant qu’on veut.'},
        {k: 'quinze', fam: 'pairs', name: 'Quinze', diff: 2, mode: 'sum', sum: 15, grid: [4, 4], desc: 'Une grille de 16 cartes : enlève deux cartes qui font 15 (Valet 11, Dame 12, Roi 13).'},
        {k: 'treize', fam: 'pairs', name: 'Treize', diff: 2, mode: 'sum', sum: 13, single: 13, grid: [3, 4], desc: 'Une grille de 12 cartes : enlève deux cartes qui font 13 (Valet 11, Dame 12) ; un Roi s’en va seul.'},
        {k: 'klondike1pass', fam: 'klondike', name: 'Klondike en une passe', diff: 4, desc: 'Klondike, une carte à la fois, mais la pioche ne passe qu’une seule fois.', tab: {n: 7}, stock: {draw: 1, redeals: 0}},
        {k: 'klondike2d3', fam: 'klondike', name: 'Klondike double (3 cartes)', diff: 4, desc: 'Deux jeux, 9 colonnes, et la pioche se retourne trois cartes à la fois.', decks: 2, tab: {n: 9}, stock: {draw: 3}},
        {k: 'freecell5', fam: 'freecell', name: 'FreeCell à 5 cases', diff: 1, desc: 'FreeCell avec une case libre de plus : plus facile.', cells: 5, tab: {n: 8, deal: 'rest', down: 'none', move: 'one', empty: 'any'}, stock: {to: 'none'}},
        {k: 'scorpion2', fam: 'spider', name: 'Scorpion II', diff: 3, desc: 'Scorpion avec seulement 3 colonnes à moitié cachées au départ.', tab: {n: 7, deal: even(7, 7), down: [3, 3, 3, 0, 0, 0, 0], build: 'suit', move: 'any', empty: 'king'}, found: {spider: true}, stock: {to: 'tab3'}},
        {k: 'yukonfree', fam: 'yukon', name: 'Yukon libre', diff: 2, desc: 'Yukon, mais une colonne vide accepte n’importe quelle carte.', tab: {n: 7, deal: [1, 6, 7, 8, 9, 10, 11], down: klDown(7), move: 'any', empty: 'any'}, stock: {to: 'none'}},
        {k: 'napoleon', fam: 'forty', name: 'Napoléon à Sainte-Hélène', diff: 3, desc: 'Le nom français des quarante voleurs, avec une deuxième passe de la pioche.', decks: 2, tab: {n: 10, deal: even(10, 4), down: 'none', build: 'suit', move: 'one', empty: 'any'}, stock: {draw: 1, redeals: 1}},
        {k: 'bellelucie3', fam: 'builder', name: 'La Belle Lucie généreuse', diff: 2, desc: 'La Belle Lucie avec trois redistributions au lieu de deux.', tab: {n: 18, deal: [...even(17, 3), 1], down: 'none', build: 'suit', move: 'one', empty: 'none', grid: 6}, stock: {to: 'shuffle', redeals: 3}},
        {k: 'klondike6', fam: 'klondike', name: 'Klondike à 6 colonnes', diff: 3, desc: 'Klondike avec une colonne de moins : moins de cartes cachées, mais moins de place.', tab: {n: 6}, stock: {draw: 1}},
        {k: 'klondike8', fam: 'klondike', name: 'Klondike à 8 colonnes', diff: 2, desc: 'Klondike avec une colonne de plus : plus de place pour ranger.', tab: {n: 8}, stock: {draw: 1}},
        {k: 'saratoga3p', fam: 'klondike', name: 'Saratoga en 3 passes', diff: 3, desc: 'Tout est visible, la pioche se retourne trois cartes à la fois et ne repasse que deux fois.', tab: {n: 7, down: 'none'}, stock: {draw: 3, redeals: 2}},
        {k: 'trigonopen', fam: 'klondike', name: 'Trigon à découvert', diff: 2, desc: 'Trigon (descendre dans la même couleur de carte), avec toutes les cartes visibles dès le départ.', tab: {n: 7, down: 'none', build: 'suit', move: 'suitseq'}, stock: {draw: 1}},
        {k: 'freecell10', fam: 'freecell', name: 'FreeCell à 10 colonnes', diff: 1, desc: 'FreeCell avec 10 colonnes au lieu de 8 : les colonnes sont plus courtes.', cells: 4, tab: {n: 10, deal: 'rest', down: 'none', move: 'one', empty: 'any'}, stock: {to: 'none'}},
        {k: 'bakers6', fam: 'freecell', name: 'Baker’s Game à 6 cases', diff: 2, desc: 'Baker’s Game (descendre dans la même couleur de carte) avec six cases libres.', cells: 6, tab: {n: 8, deal: 'rest', down: 'none', build: 'suit', move: 'one', empty: 'any'}, stock: {to: 'none'}},
        {k: 'eightoff6', fam: 'freecell', name: 'Eight Off à 6 cases', diff: 3, desc: 'Eight Off avec seulement six cases, dont quatre déjà occupées au départ.', cells: 6, cellsFill: 4, tab: {n: 8, deal: even(8, 6), down: 'none', build: 'suit', move: 'one', empty: 'king'}, stock: {to: 'none'}},
        {k: 'spiderfree', fam: 'spider', name: 'Araignée sans contrainte', diff: 1, desc: 'Araignée à une couleur, et on peut distribuer même s’il reste des colonnes vides.', decks: 2, suits: 1, tab: {n: 10, deal: [6, 6, 6, 6, 5, 5, 5, 5, 5, 5], build: 'any', move: 'suitseq', empty: 'any'}, found: {spider: true}, stock: {to: 'tab'}},
        {k: 'spider8', fam: 'spider', name: 'Araignée à 8 colonnes', diff: 3, desc: 'Araignée à deux couleurs sur 8 colonnes : moins de place pour manœuvrer.', decks: 2, suits: 2, tab: {n: 8, deal: [7, 7, 7, 7, 6, 6, 6, 6], build: 'any', move: 'suitseq', empty: 'any'}, found: {spider: true}, stock: {to: 'tab', needFull: true}},
        {k: 'yukon8', fam: 'yukon', name: 'Yukon à 8 colonnes', diff: 2, desc: 'Yukon avec une colonne de plus, des colonnes moins hautes.', tab: {n: 8, deal: [1, 5, 6, 7, 8, 8, 8, 9], down: klDown(8), move: 'any'}, stock: {to: 'none'}},
        {k: 'forty3', fam: 'forty', name: 'Les quarante voleurs (3 cartes)', diff: 3, desc: 'Les quarante voleurs, mais la pioche se retourne trois cartes à la fois et repasse deux fois.', decks: 2, tab: {n: 10, deal: even(10, 4), down: 'none', build: 'suit', move: 'one', empty: 'any'}, stock: {draw: 3, redeals: 2}},
        {k: 'emperor', fam: 'forty', name: 'L’empereur', diff: 4, desc: 'Deux jeux, 10 colonnes de 4 cartes dont 3 cachées ; on descend en alternant rouge et noir. La pioche ne passe qu’une fois.', decks: 2, tab: {n: 10, deal: even(10, 4), down: even(10, 3), build: 'alt', move: 'one', empty: 'any'}, stock: {draw: 1, redeals: 0}},
        {k: 'castlesspain', fam: 'builder', name: 'Les châteaux en Espagne', diff: 3, desc: '13 colonnes de 4 cartes dont 3 cachées, pas de pioche ; on descend en alternant rouge et noir.', tab: {n: 13, deal: even(13, 4), down: even(13, 3), build: 'alt', move: 'one', empty: 'any'}, stock: {to: 'none'}},
        {k: 'fan', fam: 'builder', name: 'L’éventail', diff: 3, desc: 'Comme La Belle Lucie, sans redistribution, et seul un Roi va dans une place vide.', tab: {n: 18, deal: [...even(17, 3), 1], down: 'none', build: 'suit', move: 'one', empty: 'king', grid: 6}, stock: {to: 'none'}},
        {k: 'pyramid2', fam: 'pairs', name: 'La pyramide en 2 passes', diff: 3, mode: 'pyramid', redeals: 1, desc: 'La pyramide, et la pioche repasse une fois.'},
        // ── ajoutées en 0.9.2 : 23 patiences de plus (règles différentes de celles d'avant)
        {k: 'agnessorel', fam: 'klondike', name: 'Agnès Sorel', diff: 4, desc: '7 colonnes en escalier. La première carte posée sur une fondation donne la valeur de départ des quatre ; on descend dans la même teinte (rouge sur rouge, noir sur noir), le Roi passe sur l’As. La pioche pose une carte sur chaque colonne ; une colonne vide prend la carte juste sous la valeur de départ.', tab: {n: 7, build: 'color', wrap: true, move: 'seq', empty: 'king'}, found: {base: 'first', wrap: true}, stock: {to: 'tab'}},
        {k: 'whitehorse', fam: 'klondike', name: 'Le cheval blanc', diff: 2, desc: 'Une seule carte sur chacune des 7 colonnes au départ ; on descend en alternant rouge et noir, une colonne vide prend n’importe quelle carte. La pioche se retourne une carte à la fois, sans limite.', tab: {n: 7, deal: even(7, 1), down: 'none', empty: 'any'}, stock: {draw: 1}},
        {k: 'fourseasons', fam: 'klondike', name: 'Les quatre saisons', diff: 3, desc: '5 cartes en croix et une fondation de départ qui donne la valeur des quatre. On descend sans s’occuper des couleurs (le Roi passe sur l’As), une carte à la fois. La pioche ne passe qu’une fois.', tab: {n: 5, deal: even(5, 1), down: 'none', build: 'any', wrap: true, move: 'one', empty: 'any'}, found: {base: 'first', wrap: true}, stock: {draw: 1, redeals: 0}},
        {k: 'chameleon', fam: 'klondike', name: 'Le caméléon', diff: 3, desc: 'Canfield à 3 colonnes et 12 cartes en réserve : on descend sans s’occuper des couleurs, le Roi passe sur l’As. La pioche ne passe qu’une fois.', reserve: {n: 12, kind: 'canfield'}, tab: {n: 3, deal: even(3, 1), down: 'none', build: 'any', wrap: true, empty: 'reserve'}, found: {base: 'first', wrap: true}, stock: {draw: 1, redeals: 0}},
        {k: 'canfield2', fam: 'klondike', name: 'Canfield double', diff: 3, desc: 'Canfield avec deux jeux : une réserve de 13 cartes, 5 colonnes, 8 fondations qui partent de la première carte posée.', decks: 2, reserve: {n: 13, kind: 'canfield'}, tab: {n: 5, deal: even(5, 1), down: 'none', wrap: true, empty: 'reserve'}, found: {base: 'first', wrap: true}, stock: {draw: 1}},
        {k: 'forecell', fam: 'freecell', name: 'ForeCell', diff: 3, desc: '8 colonnes de 6 cartes ; les 4 cases libres sont déjà remplies au départ. On descend en alternant les couleurs ; une colonne vide ne prend qu’un Roi.', cells: 4, cellsFill: 4, tab: {n: 8, deal: even(8, 6), down: 'none', move: 'one', empty: 'king'}, stock: {to: 'none'}},
        {k: 'freefan', fam: 'freecell', name: 'L’éventail aux cases', diff: 2, desc: '17 éventails de 3 cartes et 2 cases libres ; on descend dans la même couleur de carte, une carte à la fois ; seul un Roi va dans une place vide.', cells: 2, tab: {n: 18, deal: [...even(17, 3), 1], down: 'none', build: 'suit', move: 'one', empty: 'king', grid: 6}, stock: {to: 'none'}},
        {k: 'mrsmop', fam: 'spider', name: 'Madame Mop', diff: 3, desc: 'Deux jeux, 13 colonnes de 8 cartes toutes visibles, pas de pioche. On descend sans s’occuper des couleurs ; seules les suites d’une même couleur de carte se déplacent ensemble ; une suite complète du Roi à l’As s’en va.', decks: 2, tab: {n: 13, deal: even(13, 8), down: 'none', build: 'any', move: 'suitseq', empty: 'any'}, found: {spider: true}, stock: {to: 'none'}},
        {k: 'blackwidow', fam: 'spider', name: 'La veuve noire', diff: 3, desc: 'L’araignée à quatre couleurs, mais toute suite qui descend se déplace d’un coup, même mélangée. Une suite complète du Roi à l’As dans une même couleur de carte s’en va.', decks: 2, tab: {n: 10, deal: [6, 6, 6, 6, 5, 5, 5, 5, 5, 5], build: 'any', move: 'seq', empty: 'any'}, found: {spider: true}, stock: {to: 'tab', needFull: true}},
        {k: 'threeblindmice', fam: 'spider', name: 'Les trois souris', diff: 3, desc: '10 colonnes de 5 (les trois premières cachent 3 cartes) et 2 cartes en réserve dans des cases libres. On descend dans la même couleur de carte et on déplace n’importe quel groupe visible ; une colonne vide ne prend qu’un Roi.', cells: 2, cellsFill: 2, tab: {n: 10, deal: even(10, 5), down: [3, 3, 3, 0, 0, 0, 0, 0, 0, 0], build: 'suit', move: 'any', empty: 'king'}, found: {spider: true}, stock: {to: 'none'}},
        {k: 'gypsy', fam: 'spider', name: 'La gitane', diff: 3, desc: 'Deux jeux, 8 colonnes de 3 cartes (deux cachées). On descend en alternant rouge et noir, on déplace des suites entières ; la pioche pose une carte sur chaque colonne. Les fondations montent de l’As au Roi.', decks: 2, tab: {n: 8, deal: even(8, 3), down: even(8, 2), build: 'alt', move: 'seq', empty: 'any'}, stock: {to: 'tab'}},
        {k: 'irmgard', fam: 'spider', name: 'Irmgard', diff: 3, desc: 'Deux jeux, 9 colonnes en pyramide (1, 2, 3, 4, 5, 4, 3, 2, 1 cartes). On descend en alternant rouge et noir ; une colonne vide ne prend qu’un Roi ; la pioche pose une carte sur chaque colonne.', decks: 2, tab: {n: 9, deal: [1, 2, 3, 4, 5, 4, 3, 2, 1], build: 'alt', move: 'seq', empty: 'king'}, stock: {to: 'tab'}},
        {k: 'queenie', fam: 'yukon', name: 'Queenie', diff: 3, desc: '7 colonnes en escalier comme Klondike, mais on déplace n’importe quel groupe de cartes visibles (comme au Yukon) ; la pioche pose une carte sur chaque colonne.', tab: {n: 7, move: 'any'}, stock: {to: 'tab'}},
        {k: 'brisbane', fam: 'yukon', name: 'Brisbane', diff: 2, desc: 'Yukon où l’on descend sans s’occuper des couleurs : n’importe quel groupe de cartes visibles se déplace, pourvu que la première aille bien.', tab: {n: 7, deal: [1, 6, 7, 8, 9, 10, 11], down: klDown(7), build: 'any', move: 'any'}, stock: {to: 'none'}},
        {k: 'blockade', fam: 'forty', name: 'Le blocus', diff: 3, desc: 'Deux jeux, 12 colonnes d’une carte. On descend dans la même couleur de carte et on déplace des suites entières ; la pioche pose une carte sur chaque colonne.', decks: 2, tab: {n: 12, deal: even(12, 1), down: 'none', build: 'suit', move: 'seq', empty: 'any'}, stock: {to: 'tab'}},
        {k: 'fortunesfavor', fam: 'forty', name: 'La bonne fortune', diff: 1, desc: 'Les As sont posés d’avance ; 12 colonnes d’une carte. On descend dans la même couleur de carte, une carte à la fois ; la pioche ne passe qu’une fois.', found: {out: [1]}, tab: {n: 12, deal: even(12, 1), down: 'none', build: 'suit', move: 'one', empty: 'any'}, stock: {draw: 1, redeals: 0}},
        {k: 'midshipman', fam: 'forty', name: 'L’aspirant', diff: 3, desc: 'Un seul jeu, 9 colonnes de 4 cartes (deux cachées). On descend sans s’occuper des couleurs et on déplace des suites entières ; la pioche ne passe qu’une fois.', tab: {n: 9, deal: even(9, 4), down: even(9, 2), build: 'any', move: 'seq', empty: 'any'}, stock: {draw: 1, redeals: 0}},
        {k: 'martha', fam: 'builder', name: 'Martha', diff: 3, desc: 'Les As sont posés d’avance ; 12 colonnes de 4 cartes (deux cachées), pas de pioche. On descend en alternant rouge et noir et on déplace des suites entières.', found: {out: [1]}, tab: {n: 12, deal: even(12, 4), down: even(12, 2), build: 'alt', move: 'seq', empty: 'any'}, stock: {to: 'none'}},
        {k: 'morehead', fam: 'builder', name: 'Morehead', diff: 4, desc: 'Comme Somerset (10 colonnes de 1 à 8 cartes, puis 8 et 8), mais on descend sur n’importe quelle couleur de carte sauf la sienne, une carte à la fois.', tab: {n: 10, deal: [1, 2, 3, 4, 5, 6, 7, 8, 8, 8], down: 'none', build: 'notown', move: 'one', empty: 'any'}, stock: {to: 'none'}},
        {k: 'montana', fam: 'pairs', name: 'Montana (les trous)', diff: 3, mode: 'montana', stockLabel: '🔀 Redistribuer', desc: '4 rangées de 13 cartes ; on enlève les As, ce qui fait 4 trous. Un trou prend la carte de même couleur juste au-dessus de sa voisine de gauche ; un trou au début d’une rangée prend un 2. Il faut ranger chaque rangée du 2 au Roi dans une même couleur. Deux fois, on peut ramasser ce qui n’est pas rangé et redistribuer.'},
        {k: 'nestor', fam: 'pairs', name: 'Nestor', diff: 3, mode: 'nestor', nostock: true, desc: '8 colonnes de 6 cartes et 4 cartes en réserve : enlève deux cartes de même valeur prises en bas des colonnes ou dans la réserve.'},
        {k: 'simplepairs', fam: 'pairs', name: 'Les paires', diff: 1, mode: 'sum', same: true, grid: [3, 3], desc: 'Une grille de 9 cartes : enlève deux cartes de même valeur ; la pioche remplit les trous. Un jeu de pure chance, pour se détendre.'},
        {k: 'allinarow', fam: 'pairs', name: 'Tout en ligne', diff: 3, mode: 'allinarow', nostock: true, desc: '13 colonnes de 4 cartes : la première carte va où tu veux sur la défausse, puis chaque carte du bas d’une colonne qui est juste au-dessus ou au-dessous ; le Roi et l’As se suivent.'},
        // ── ajoutées ensuite : plus de cent patiences classiques (PySol, Politaire, Moyle et Morehead), avec quelques réglages en plus
        // Klondike, Canfield et leurs cousins
        {k: 'agnesbernauer', fam: 'klondike', name: 'Agnès Bernauer', diff: 4, desc: '7 colonnes en escalier et une réserve de 7 tas. La première carte posée sur une fondation donne la valeur de départ des quatre ; on descend en alternant rouge et noir, le Roi passe sur l’As. La pioche pose une carte sur chaque tas de la réserve ; une colonne vide prend la carte juste sous la valeur de départ.', reserves: {n: 7, deal: 1}, tab: {n: 7, wrap: true, empty: 'king'}, found: {base: 'first', wrap: true}, stock: {to: 'reserves'}},
        {k: 'thumbandpouch', fam: 'klondike', name: 'Thumb and Pouch', diff: 2, desc: 'Klondike où l’on descend sur n’importe quelle couleur de carte sauf la sienne ; une colonne vide prend n’importe quelle carte. La pioche ne passe qu’une fois.', tab: {n: 7, build: 'notown', empty: 'any'}, stock: {draw: 1, redeals: 0}},
        {k: 'passeul', fam: 'klondike', name: 'Pas seul', diff: 3, desc: '6 colonnes d’une seule carte ; on descend en alternant rouge et noir, une colonne vide prend n’importe quelle carte. La pioche se retourne une carte à la fois et ne passe qu’une fois.', tab: {n: 6, deal: even(6, 1), down: 'none', empty: 'any'}, stock: {draw: 1, redeals: 0}},
        {k: 'blindalleys', fam: 'klondike', name: 'Les impasses', diff: 2, desc: 'Les As sont posés d’avance ; 6 colonnes de 3 cartes (deux cachées). On descend en alternant rouge et noir, une colonne vide prend n’importe quelle carte ; la pioche repasse une fois.', found: {out: [1]}, tab: {n: 6, deal: even(6, 3), down: even(6, 2), empty: 'any'}, stock: {draw: 1, redeals: 1}},
        {k: 'eighttimeseight', fam: 'klondike', name: 'Huit fois huit', diff: 2, desc: 'Deux jeux, 8 colonnes de 8 cartes visibles ; on descend en alternant rouge et noir, une colonne vide prend n’importe quelle carte. La pioche repasse deux fois.', decks: 2, tab: {n: 8, deal: even(8, 8), down: 'none', empty: 'any'}, stock: {draw: 1, redeals: 2}},
        {k: 'spike', fam: 'klondike', name: 'Spike', diff: 3, desc: '7 colonnes en escalier comme Klondike ; on descend en alternant rouge et noir et on déplace des suites entières. La pioche pose une carte sur chaque colonne.', tab: {n: 7}, stock: {to: 'tab'}},
        {k: 'alternation', fam: 'klondike', name: 'Alternance', diff: 3, desc: 'Deux jeux, 7 colonnes de 7 cartes, une cachée sur deux. On descend en alternant rouge et noir et on déplace des suites entières ; une colonne vide prend n’importe quelle carte. La pioche ne passe qu’une fois.', decks: 2, tab: {n: 7, deal: even(7, 7), down: 'alt', empty: 'any'}, stock: {draw: 1, redeals: 0}},
        {k: 'harp', fam: 'klondike', name: 'La harpe', diff: 3, desc: 'Deux jeux, 9 colonnes en escalier ; on descend en alternant rouge et noir. La pioche se retourne une carte à la fois et repasse trois fois.', decks: 2, tab: {n: 9}, stock: {draw: 1, redeals: 3}},
        {k: 'bigharp', fam: 'klondike', name: 'La grande harpe', diff: 4, desc: 'Deux jeux, 10 colonnes en escalier ; on descend en alternant rouge et noir. La pioche se retourne une carte à la fois et ne passe qu’une fois.', decks: 2, tab: {n: 10}, stock: {draw: 1, redeals: 0}},
        {k: 'acme', fam: 'klondike', name: 'Acme', diff: 3, desc: 'Une réserve de 13 cartes et 4 colonnes ; les fondations partent de l’As. On descend dans la même couleur de carte, une carte à la fois ; une colonne vide se remplit avec la réserve. La pioche repasse une fois.', reserve: {n: 13, kind: 'canfield'}, tab: {n: 4, deal: even(4, 1), down: 'none', build: 'suit', move: 'one', empty: 'reserve'}, stock: {draw: 1, redeals: 1}},
        {k: 'americantoad', fam: 'klondike', name: 'Le crapaud américain', diff: 3, desc: 'Deux jeux, une réserve de 20 cartes et 8 colonnes. La première carte posée sur une fondation donne la valeur de départ des huit ; on descend dans la même couleur de carte, le Roi passe sur l’As. Une colonne vide se remplit avec la réserve ; la pioche repasse une fois.', decks: 2, reserve: {n: 20, kind: 'canfield'}, tab: {n: 8, deal: even(8, 1), down: 'none', build: 'suit', wrap: true, empty: 'reserve'}, found: {base: 'first', wrap: true}, stock: {draw: 1, redeals: 1}},
        {k: 'variegated', fam: 'klondike', name: 'Canfield bigarré', diff: 3, desc: 'Deux jeux : les As sont posés d’avance, une réserve de 14 cartes et 5 colonnes. On descend en alternant rouge et noir ; une colonne vide se remplit avec la réserve. La pioche se retourne trois cartes à la fois et repasse deux fois.', decks: 2, found: {out: [1]}, reserve: {n: 14, kind: 'canfield'}, tab: {n: 5, deal: even(5, 1), down: 'none', empty: 'reserve'}, stock: {draw: 3, redeals: 2}},
        {k: 'duchess', fam: 'klondike', name: 'La duchesse', diff: 3, desc: 'Quatre tas de réserve de 3 cartes et 4 colonnes d’une carte. La première carte posée sur une fondation donne la valeur de départ des quatre ; on descend en alternant rouge et noir, le Roi passe sur l’As. Une colonne vide prend n’importe quelle carte ; la pioche repasse une fois.', reserves: {n: 4, deal: 3}, tab: {n: 4, deal: even(4, 1), down: 'none', wrap: true, empty: 'any'}, found: {base: 'first', wrap: true}, stock: {draw: 1, redeals: 1}},
        {k: 'gate', fam: 'klondike', name: 'La porte', diff: 2, desc: 'Deux tas de réserve de 5 cartes (les battants de la porte) et 8 colonnes d’une carte. On descend en alternant rouge et noir et on déplace des suites entières ; une colonne vide prend n’importe quelle carte. La pioche ne passe qu’une fois.', reserves: {n: 2, deal: 5}, tab: {n: 8, deal: even(8, 1), down: 'none', empty: 'any'}, stock: {draw: 1, redeals: 0}},
        // cases libres
        {k: 'penguin', fam: 'freecell', name: 'Le pingouin', diff: 3, desc: 'La première carte donne la valeur de départ des fondations, et les trois autres de même valeur y montent tout de suite. 7 colonnes de 7, 7 cases libres ; on descend dans la même couleur de carte, le Roi passe sur l’As. Une colonne vide prend la carte juste sous la valeur de départ.', cells: 7, tab: {n: 7, deal: 'rest', down: 'none', build: 'suit', wrap: true, move: 'one', empty: 'king'}, found: {base: 'first', wrap: true, baseAll: true}, stock: {to: 'none'}},
        {k: 'kingbakers', fam: 'freecell', name: 'Baker’s Game (Roi seul)', diff: 4, desc: 'Baker’s Game (descendre dans la même couleur de carte, 4 cases libres), mais une colonne vide ne prend qu’un Roi.', cells: 4, tab: {n: 8, deal: 'rest', down: 'none', build: 'suit', move: 'one', empty: 'king'}, stock: {to: 'none'}},
        {k: 'seahavenrelax', fam: 'freecell', name: 'Seahaven détendu', diff: 2, desc: 'Seahaven, mais une suite bien rangée dans la même couleur de carte se déplace d’un coup, quelle que soit sa longueur.', cells: 4, cellsFill: 2, tab: {n: 10, deal: even(10, 5), down: 'none', build: 'suit', move: 'seq', empty: 'king'}, stock: {to: 'none'}},
        {k: 'repair', fam: 'freecell', name: 'Repair', diff: 2, desc: 'Deux jeux, 10 colonnes de 10 cartes visibles et 4 cases libres déjà occupées ; on descend en alternant rouge et noir, une carte à la fois (ou une suite si les cases libres le permettent).', decks: 2, cells: 4, cellsFill: 4, tab: {n: 10, deal: even(10, 10), down: 'none', move: 'one', empty: 'any'}, stock: {to: 'none'}},
        {k: 'oceantowers', fam: 'freecell', name: 'Ocean Towers', diff: 3, desc: 'Deux jeux, 14 colonnes de 7 cartes et 8 cases libres dont 6 déjà occupées ; on descend dans la même couleur de carte, une colonne vide ne prend qu’un Roi.', decks: 2, cells: 8, cellsFill: 6, tab: {n: 14, deal: even(14, 7), down: 'none', build: 'suit', move: 'one', empty: 'king'}, stock: {to: 'none'}},
        {k: 'sevenbyfour', fam: 'freecell', name: 'Sept par quatre', diff: 3, desc: 'FreeCell à 7 colonnes et 4 cases libres : les colonnes sont plus hautes.', cells: 4, tab: {n: 7, deal: 'rest', down: 'none', move: 'one', empty: 'any'}, stock: {to: 'none'}},
        {k: 'sevenbyfive', fam: 'freecell', name: 'Sept par cinq', diff: 2, desc: 'FreeCell à 7 colonnes et 5 cases libres.', cells: 5, tab: {n: 7, deal: 'rest', down: 'none', move: 'one', empty: 'any'}, stock: {to: 'none'}},
        {k: 'challengefc', fam: 'freecell', name: 'FreeCell défi', diff: 4, desc: 'FreeCell, mais les As et les 2 sont tout au fond des colonnes, sous toutes les autres cartes.', cells: 4, tab: {n: 8, deal: 'rest', down: 'none', move: 'one', empty: 'any', first: [1, 2]}, stock: {to: 'none'}},
        {k: 'superchallengefc', fam: 'freecell', name: 'FreeCell super défi', diff: 5, desc: 'FreeCell défi (les As et les 2 au fond des colonnes), et une colonne vide ne prend qu’un Roi.', cells: 4, tab: {n: 8, deal: 'rest', down: 'none', move: 'one', empty: 'king', first: [1, 2]}, stock: {to: 'none'}},
        // araignées, scorpions, gitanes
        {k: 'beetle', fam: 'spider', name: 'Le scarabée', diff: 3, desc: 'Scorpion sans pioche : les 52 cartes sont visibles en 7 colonnes. On descend dans la même couleur de carte et on déplace n’importe quel groupe ; une colonne vide ne prend qu’un Roi. Une suite complète du Roi à l’As s’en va.', tab: {n: 7, deal: [8, 8, 8, 7, 7, 7, 7], down: 'none', build: 'suit', move: 'any', empty: 'king'}, found: {spider: true}, stock: {to: 'none'}},
        {k: 'scorpiontail', fam: 'spider', name: 'Queue de scorpion', diff: 3, desc: 'Comme Scorpion (7 colonnes de 7, n’importe quel groupe se déplace), mais on descend en alternant rouge et noir et les cartes montent sur les fondations de l’As au Roi.', tab: {n: 7, deal: even(7, 7), down: [3, 3, 3, 3, 0, 0, 0], move: 'any', empty: 'king'}, stock: {to: 'tab3'}},
        {k: 'doublescorpion', fam: 'spider', name: 'Scorpion double', diff: 4, desc: 'Deux jeux, 10 colonnes, tout est distribué (les cinq premières colonnes cachent 4 cartes). On descend dans la même couleur de carte et on déplace n’importe quel groupe ; une suite complète du Roi à l’As s’en va.', decks: 2, tab: {n: 10, deal: [11, 11, 11, 11, 10, 10, 10, 10, 10, 10], down: [4, 4, 4, 4, 4, 0, 0, 0, 0, 0], build: 'suit', move: 'any', empty: 'king'}, found: {spider: true}, stock: {to: 'none'}},
        {k: 'groundsdivorce', fam: 'spider', name: 'Motif de divorce', diff: 3, desc: 'Deux jeux, 10 colonnes de 5 cartes visibles. On descend sans s’occuper des couleurs ; seules les suites d’une même couleur de carte se déplacent ensemble ; une suite complète du Roi à l’As s’en va. La pioche pose une carte sur chaque colonne qui n’est pas vide.', decks: 2, tab: {n: 10, deal: even(10, 5), down: 'none', build: 'any', move: 'suitseq', empty: 'any'}, found: {spider: true}, stock: {to: 'tab', skipEmpty: true}},
        {k: 'tarantula', fam: 'spider', name: 'La tarentule', diff: 4, desc: 'L’araignée à quatre couleurs, mais une suite qui descend dans la même teinte (rouge ou noire) se déplace d’un coup. Une suite complète du Roi à l’As dans une même couleur de carte s’en va.', decks: 2, tab: {n: 10, deal: [6, 6, 6, 6, 5, 5, 5, 5, 5, 5], build: 'any', move: 'colorseq', empty: 'any'}, found: {spider: true}, stock: {to: 'tab', needFull: true}},
        {k: 'openspider', fam: 'spider', name: 'Araignée à découvert', diff: 4, desc: 'L’araignée à quatre couleurs, mais toutes les cartes sont visibles dès le départ.', decks: 2, tab: {n: 10, deal: [6, 6, 6, 6, 5, 5, 5, 5, 5, 5], down: 'none', build: 'any', move: 'suitseq', empty: 'any'}, found: {spider: true}, stock: {to: 'tab', needFull: true}},
        {k: 'milliganharp', fam: 'spider', name: 'La harpe de Milligan', diff: 3, desc: 'Deux jeux, 8 colonnes en escalier ; on descend en alternant rouge et noir et on déplace des suites entières. Une colonne vide ne prend qu’un Roi ; la pioche pose une carte sur chaque colonne. Les fondations montent de l’As au Roi.', decks: 2, tab: {n: 8}, stock: {to: 'tab'}},
        {k: 'lexingtonharp', fam: 'spider', name: 'La harpe de Lexington', diff: 3, desc: 'La harpe de Milligan (deux jeux, 8 colonnes en escalier, la pioche pose une carte sur chaque colonne), mais on déplace n’importe quel groupe de cartes visibles.', decks: 2, tab: {n: 8, move: 'any'}, stock: {to: 'tab'}},
        {k: 'brunswick', fam: 'spider', name: 'Brunswick', diff: 2, desc: 'La harpe de Lexington avec toutes les cartes visibles : n’importe quel groupe se déplace, la pioche pose une carte sur chaque colonne.', decks: 2, tab: {n: 8, down: 'none', move: 'any'}, stock: {to: 'tab'}},
        {k: 'carlton', fam: 'spider', name: 'Carlton', diff: 2, desc: 'La harpe de Milligan avec toutes les cartes visibles, et une colonne vide prend n’importe quelle carte.', decks: 2, tab: {n: 8, down: 'none', empty: 'any'}, stock: {to: 'tab'}},
        {k: 'missmilligan', fam: 'spider', name: 'Miss Milligan', diff: 4, desc: 'Deux jeux, 8 colonnes d’une carte ; la pioche pose une carte sur chaque colonne. On descend en alternant rouge et noir et on déplace des suites entières ; une colonne vide ne prend qu’un Roi. Quand la pioche est vide, une case libre s’ouvre pour mettre une carte de côté.', decks: 2, cells: 1, cellsLate: true, tab: {n: 8, deal: even(8, 1), down: 'none'}, stock: {to: 'tab'}},
        {k: 'millie', fam: 'spider', name: 'Millie', diff: 3, desc: 'Deux jeux, 8 colonnes d’une carte ; la pioche pose une carte sur chaque colonne. On descend en alternant rouge et noir et une colonne vide prend n’importe quelle carte.', decks: 2, tab: {n: 8, deal: even(8, 1), down: 'none', empty: 'any'}, stock: {to: 'tab'}},
        {k: 'elba', fam: 'spider', name: 'L’île d’Elbe', diff: 4, desc: 'Deux jeux, 10 colonnes de 5 cartes (quatre cachées) ; on descend en alternant rouge et noir et on déplace des suites entières. Une colonne vide ne prend qu’un Roi ; la pioche pose une carte sur chaque colonne.', decks: 2, tab: {n: 10, deal: even(10, 5), down: even(10, 4)}, stock: {to: 'tab'}},
        {k: 'mountolympus', fam: 'spider', name: 'Le mont Olympe', diff: 3, desc: 'Deux jeux : les As et les 2 sont posés d’avance, et les fondations montent de deux en deux dans la même couleur de carte (As, 3, 5… ou 2, 4, 6…). 9 colonnes ; on descend de deux en deux dans la même couleur de carte. La pioche pose une carte sur chaque colonne.', decks: 2, found: {out: [1, 2], n: 16, by: 2}, tab: {n: 9, deal: even(9, 1), down: 'none', build: 'suit', by: 2, empty: 'any'}, stock: {to: 'tab'}},
        // Yukon
        {k: 'australian', fam: 'yukon', name: 'La patience australienne', diff: 3, desc: '7 colonnes de 4 cartes visibles ; on descend dans la même couleur de carte et on déplace n’importe quel groupe de cartes visibles. Une colonne vide ne prend qu’un Roi ; la pioche ne passe qu’une fois.', tab: {n: 7, deal: even(7, 4), down: 'none', build: 'suit', move: 'any'}, stock: {draw: 1, redeals: 0}},
        {k: 'canberra', fam: 'yukon', name: 'Canberra', diff: 2, desc: 'La patience australienne, mais la pioche repasse une fois.', tab: {n: 7, deal: even(7, 4), down: 'none', build: 'suit', move: 'any'}, stock: {draw: 1, redeals: 1}},
        {k: 'rawprawn', fam: 'yukon', name: 'Raw Prawn', diff: 2, desc: 'La patience australienne, mais une colonne vide prend n’importe quelle carte.', tab: {n: 7, deal: even(7, 4), down: 'none', build: 'suit', move: 'any', empty: 'any'}, stock: {draw: 1, redeals: 0}},
        {k: 'rushdike', fam: 'yukon', name: 'Rushdike', diff: 4, desc: '7 colonnes en escalier ; on descend dans la même couleur de carte et on déplace n’importe quel groupe de cartes visibles. La pioche pose une carte sur chaque colonne.', tab: {n: 7, build: 'suit', move: 'any'}, stock: {to: 'tab'}},
        {k: 'chinesediscipline', fam: 'yukon', name: 'La discipline chinoise', diff: 4, desc: '7 colonnes de 7 cartes (trois cachées, sauf dans la première) ; on descend en alternant rouge et noir et on déplace n’importe quel groupe de cartes visibles. Les 3 dernières cartes vont sur les trois premières colonnes.', tab: {n: 7, deal: even(7, 7), down: [0, 3, 3, 3, 3, 3, 3], move: 'any'}, stock: {to: 'tab3'}},
        {k: 'doublerussian', fam: 'yukon', name: 'Solitaire russe double', diff: 4, desc: 'Deux jeux, 10 colonnes, 8 fondations ; on descend dans la même couleur de carte et on déplace n’importe quel groupe de cartes visibles.', decks: 2, tab: {n: 10, deal: [1, 10, 11, 12, 13, 14, 15, 9, 9, 10], down: [0, 1, 2, 3, 4, 5, 6, 3, 3, 4], build: 'suit', move: 'any'}, stock: {to: 'none'}},
        // les quarante voleurs et leurs cousins
        {k: 'alibaba', fam: 'forty', name: 'Ali Baba', diff: 2, desc: 'Un seul jeu : les As sont posés d’avance, 10 colonnes de 4 cartes visibles. On descend dans la même couleur de carte et on déplace des suites entières ; la pioche ne passe qu’une fois.', found: {out: [1]}, tab: {n: 10, deal: even(10, 4), down: 'none', build: 'suit', move: 'seq', empty: 'any'}, stock: {draw: 1, redeals: 0}},
        {k: 'cassim', fam: 'forty', name: 'Cassim', diff: 2, desc: 'Un seul jeu : les As sont posés d’avance, 7 colonnes de 3 cartes visibles. On descend dans la même couleur de carte et on déplace des suites entières ; la pioche repasse autant que tu veux.', found: {out: [1]}, tab: {n: 7, deal: even(7, 3), down: 'none', build: 'suit', move: 'seq', empty: 'any'}, stock: {draw: 1}},
        {k: 'rankandfile', fam: 'forty', name: 'Rang et file', diff: 3, desc: 'L’empereur (deux jeux, 10 colonnes de 4 cartes dont 3 cachées, en alternant rouge et noir), mais on déplace des suites entières.', decks: 2, tab: {n: 10, deal: even(10, 4), down: even(10, 3), build: 'alt', move: 'seq', empty: 'any'}, stock: {draw: 1, redeals: 0}},
        {k: 'busyaces', fam: 'forty', name: 'Les As affairés', diff: 2, desc: 'Deux jeux, 12 colonnes d’une carte ; on descend dans la même couleur de carte, une carte à la fois. La pioche ne passe qu’une fois.', decks: 2, tab: {n: 12, deal: even(12, 1), down: 'none', build: 'suit', move: 'one', empty: 'any'}, stock: {draw: 1, redeals: 0}},
        {k: 'courtyard', fam: 'forty', name: 'La cour', diff: 2, desc: 'Deux jeux, 12 colonnes d’une carte ; on descend dans la même couleur de carte et on déplace des suites entières. La pioche ne passe qu’une fois.', decks: 2, tab: {n: 12, deal: even(12, 1), down: 'none', build: 'suit', move: 'seq', empty: 'any'}, stock: {draw: 1, redeals: 0}},
        {k: 'napoleonsquare', fam: 'forty', name: 'Le carré de Napoléon', diff: 3, desc: 'Deux jeux, 12 colonnes de 4 cartes visibles ; on descend dans la même couleur de carte et on déplace des suites entières. La pioche ne passe qu’une fois.', decks: 2, tab: {n: 12, deal: even(12, 4), down: 'none', build: 'suit', move: 'seq', empty: 'any'}, stock: {draw: 1, redeals: 0}},
        {k: 'napoleonexile', fam: 'forty', name: 'L’exil de Napoléon', diff: 3, desc: 'Les quarante voleurs où l’on descend sans s’occuper des couleurs, une carte à la fois. La pioche ne passe qu’une fois.', decks: 2, tab: {n: 10, deal: even(10, 4), down: 'none', build: 'any', move: 'one', empty: 'any'}, stock: {draw: 1, redeals: 0}},
        {k: 'deuces', fam: 'forty', name: 'Deuces', diff: 2, desc: 'Deux jeux : les huit 2 sont posés d’avance, et les fondations montent dans la même couleur de carte jusqu’à l’As. 10 colonnes d’une carte ; on descend dans la même couleur de carte (l’As va sur le 2, le Roi sur l’As), une carte à la fois. La pioche ne passe qu’une fois.', decks: 2, found: {base: 2, out: [2], wrap: true}, tab: {n: 10, deal: even(10, 1), down: 'none', build: 'suit', wrap: true, move: 'one', empty: 'any'}, stock: {draw: 1, redeals: 0}},
        {k: 'waningmoon', fam: 'forty', name: 'La lune décroissante', diff: 3, desc: 'Deux jeux, 13 colonnes de 4 cartes visibles ; on descend dans la même couleur de carte et on déplace des suites entières. La pioche ne passe qu’une fois.', decks: 2, tab: {n: 13, deal: even(13, 4), down: 'none', build: 'suit', move: 'seq', empty: 'any'}, stock: {draw: 1, redeals: 0}},
        {k: 'famousfifty', fam: 'forty', name: 'Les cinquante fameux', diff: 3, desc: 'Les quarante voleurs avec 5 cartes par colonne : deux jeux, 10 colonnes de 5, même couleur de carte, une carte à la fois. La pioche ne passe qu’une fois.', decks: 2, tab: {n: 10, deal: even(10, 5), down: 'none', build: 'suit', move: 'one', empty: 'any'}, stock: {draw: 1, redeals: 0}},
        {k: 'fortynine', fam: 'forty', name: 'Quarante-neuf', diff: 3, desc: 'Deux jeux, 7 colonnes de 7 cartes visibles ; on descend en alternant rouge et noir, une carte à la fois. La pioche ne passe qu’une fois.', decks: 2, tab: {n: 7, deal: even(7, 7), down: 'none', build: 'alt', move: 'one', empty: 'any'}, stock: {draw: 1, redeals: 0}},
        {k: 'unlimited', fam: 'forty', name: 'Sans limite', diff: 2, desc: 'Les quarante voleurs, mais la pioche repasse autant que tu veux.', decks: 2, tab: {n: 10, deal: even(10, 4), down: 'none', build: 'suit', move: 'one', empty: 'any'}, stock: {draw: 1}},
        {k: 'littleforty', fam: 'forty', name: 'Les petits quarante', diff: 2, desc: 'Les quarante voleurs où l’on descend sans s’occuper des couleurs et on déplace des suites entières ; la pioche se retourne trois cartes à la fois et repasse trois fois.', decks: 2, tab: {n: 10, deal: even(10, 4), down: 'none', build: 'any', move: 'seq', empty: 'any'}, stock: {draw: 3, redeals: 3}},
        {k: 'zebra', fam: 'forty', name: 'Le zèbre', diff: 2, desc: 'Deux jeux, les As posés d’avance, 8 colonnes d’une carte ; on descend en alternant rouge et noir, une carte à la fois. La pioche repasse une fois.', decks: 2, found: {out: [1]}, tab: {n: 8, deal: even(8, 1), down: 'none', build: 'alt', move: 'one', empty: 'any'}, stock: {draw: 1, redeals: 1}},
        {k: 'congress', fam: 'forty', name: 'Le congrès', diff: 2, desc: 'Deux jeux, 8 colonnes d’une carte ; on descend sans s’occuper des couleurs, une carte à la fois. La pioche ne passe qu’une fois.', decks: 2, tab: {n: 8, deal: even(8, 1), down: 'none', build: 'any', move: 'one', empty: 'any'}, stock: {draw: 1, redeals: 0}},
        {k: 'parliament', fam: 'forty', name: 'Le parlement', diff: 1, desc: 'Le congrès (deux jeux, 8 colonnes d’une carte, on descend sans s’occuper des couleurs), avec les As posés d’avance.', decks: 2, found: {out: [1]}, tab: {n: 8, deal: even(8, 1), down: 'none', build: 'any', move: 'one', empty: 'any'}, stock: {draw: 1, redeals: 0}},
        {k: 'oddandeven', fam: 'forty', name: 'Pair et impair', diff: 3, desc: 'Deux jeux : un As et un 2 de chaque couleur de carte sont posés d’avance, et les fondations montent de deux en deux dans leur couleur (As, 3, 5… Roi, 2, 4… ou 2, 4… Dame, As, 3…). 9 places d’une carte, sur lesquelles on ne construit pas ; une place vide prend n’importe quelle carte. La pioche repasse une fois.', decks: 2, found: {out: [1, 2], outN: 4, by: 2, wrap: true}, tab: {n: 9, deal: even(9, 1), down: 'none', build: 'none', move: 'one', empty: 'any'}, stock: {draw: 1, redeals: 1}},
        {k: 'royalcotillion', fam: 'forty', name: 'Le cotillon royal', diff: 3, desc: 'Deux jeux : un As et un 2 de chaque couleur de carte sont posés d’avance, et les fondations montent de deux en deux dans leur couleur. Quatre tas de réserve de 3 cartes (seule celle du dessus se joue) et 16 places d’une carte, sur lesquelles on ne construit pas ; une place vide prend n’importe quelle carte. La pioche ne passe qu’une fois.', decks: 2, found: {out: [1, 2], outN: 4, by: 2, wrap: true}, reserves: {n: 4, deal: 3}, tab: {n: 16, deal: even(16, 1), down: 'none', build: 'none', move: 'one', empty: 'any', grid: 8}, stock: {draw: 1, redeals: 0}},
        // châteaux, éventails et jardins
        {k: 'luckythirteen', fam: 'builder', name: 'Le treize porte-bonheur', diff: 3, desc: '13 colonnes de 4 cartes visibles ; on descend sans s’occuper des couleurs, une carte à la fois ; une colonne vide reste vide.', tab: {n: 13, deal: even(13, 4), down: 'none', build: 'any', move: 'one', empty: 'none'}, stock: {to: 'none'}},
        {k: 'portuguese', fam: 'builder', name: 'La patience portugaise', diff: 2, desc: '13 colonnes de 4 cartes visibles ; on descend sans s’occuper des couleurs, une carte à la fois ; seul un Roi va dans une colonne vide.', tab: {n: 13, deal: even(13, 4), down: 'none', build: 'any', move: 'one', empty: 'king'}, stock: {to: 'none'}},
        {k: 'goodmeasure', fam: 'builder', name: 'Bonne mesure', diff: 3, desc: 'Deux As sont posés d’avance ; 10 colonnes de 5 cartes visibles. On descend sans s’occuper des couleurs, une carte à la fois ; une colonne vide prend n’importe quelle carte.', found: {out: [1], outN: 2}, tab: {n: 10, deal: even(10, 5), down: 'none', build: 'any', move: 'one', empty: 'any'}, stock: {to: 'none'}},
        {k: 'cruel', fam: 'builder', name: 'La cruelle', diff: 3, desc: 'Les As sont posés d’avance ; 12 tas de 4 cartes. On descend dans la même couleur de carte, une carte à la fois ; une place vide reste vide. Autant de fois que tu veux, on ramasse les tas dans l’ordre, sans mélanger, et on redistribue par 4.', found: {out: [1]}, tab: {n: 12, deal: even(12, 4), down: 'none', build: 'suit', move: 'one', empty: 'none', grid: 6}, stock: {to: 'shuffle', per: 4, keep: true}},
        {k: 'perseverance', fam: 'builder', name: 'La persévérance', diff: 3, desc: 'Comme la cruelle (les As posés d’avance, 12 tas de 4, même couleur de carte), mais on déplace des suites entières et on ne ramasse que deux fois.', found: {out: [1]}, tab: {n: 12, deal: even(12, 4), down: 'none', build: 'suit', move: 'seq', empty: 'none', grid: 6}, stock: {to: 'shuffle', per: 4, keep: true, redeals: 2}},
        {k: 'ripplefan', fam: 'builder', name: 'L’éventail en vagues', diff: 3, desc: '13 tas de 4 cartes, les As restent mélangés aux autres ; on descend dans la même couleur de carte, une carte à la fois ; une place vide reste vide. Autant de fois que tu veux, on ramasse les tas dans l’ordre, sans mélanger, et on redistribue par 4.', tab: {n: 13, deal: even(13, 4), down: 'none', build: 'suit', move: 'one', empty: 'none', grid: 6}, stock: {to: 'shuffle', per: 4, keep: true}},
        {k: 'boxfan', fam: 'builder', name: 'L’éventail en boîte', diff: 2, desc: 'Les As sont posés d’avance ; 16 éventails de 3 cartes. On descend en alternant rouge et noir, une carte à la fois ; seul un Roi va dans une place vide.', found: {out: [1]}, tab: {n: 16, deal: even(16, 3), down: 'none', build: 'alt', move: 'one', empty: 'king', grid: 6}, stock: {to: 'none'}},
        {k: 'fascinationfan', fam: 'builder', name: 'L’éventail fascinant', diff: 2, desc: 'La Belle Lucie (17 éventails de 3 cartes) où l’on descend en alternant rouge et noir, avec six redistributions.', tab: {n: 18, deal: [...even(17, 3), 1], down: 'none', build: 'alt', move: 'one', empty: 'none', grid: 6}, stock: {to: 'shuffle', redeals: 6}},
        {k: 'midnightoil', fam: 'builder', name: 'La lampe de minuit', diff: 3, desc: 'La Belle Lucie (17 éventails de 3 cartes) où l’on descend en alternant rouge et noir, avec deux redistributions.', tab: {n: 18, deal: [...even(17, 3), 1], down: 'none', build: 'alt', move: 'one', empty: 'none', grid: 6}, stock: {to: 'shuffle', redeals: 2}},
        {k: 'shamrocks', fam: 'builder', name: 'Shamrocks', diff: 3, desc: '17 éventails de 3 cartes ; on monte ou on descend d’un rang sans s’occuper des couleurs, une carte à la fois, et un éventail ne garde jamais plus de 3 cartes. Pas de redistribution.', tab: {n: 18, deal: [...even(17, 3), 1], down: 'none', build: 'anyud', move: 'one', empty: 'none', max: 3, grid: 6}, stock: {to: 'none'}},
        {k: 'houseinthewood', fam: 'builder', name: 'La maison dans les bois', diff: 2, desc: 'Deux jeux, 35 éventails de 3 cartes ; on monte ou on descend d’un rang dans la même couleur de carte, une carte à la fois. Une place vide reste vide.', decks: 2, tab: {n: 35, deal: [...even(34, 3), 2], down: 'none', build: 'suitud', move: 'one', empty: 'none', grid: 7}, stock: {to: 'none'}},
        {k: 'houseonthehill', fam: 'builder', name: 'La maison sur la colline', diff: 3, desc: 'La maison dans les bois (deux jeux, 35 éventails), mais quatre fondations montent de l’As au Roi et quatre autres descendent du Roi à l’As.', decks: 2, found: {n: 4, down: 4}, tab: {n: 35, deal: [...even(34, 3), 2], down: 'none', build: 'suitud', move: 'one', empty: 'none', grid: 7}, stock: {to: 'none'}},
        {k: 'bisley', fam: 'builder', name: 'Bisley', diff: 3, desc: 'Les As sont posés d’avance ; 13 colonnes (4 de 3 cartes, 9 de 4). Les fondations des As montent, celles des Rois descendent, dans la même couleur de carte. Sur le tableau, on monte ou on descend dans la même couleur de carte, une carte à la fois ; une colonne vide reste vide.', found: {out: [1], down: 4}, tab: {n: 13, deal: [3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4], down: 'none', build: 'suitud', move: 'one', empty: 'none'}, stock: {to: 'none'}},
        {k: 'grandfathersclock', fam: 'builder', name: 'Le cadran du grand-père', diff: 2, desc: '12 fondations comme les heures d’une horloge, qui commencent par 2♥, 3♠, 4♦, 5♣… jusqu’au Roi ♣ et montent dans la même couleur de carte (le Roi passe à l’As). 8 colonnes de 5 cartes ; on descend sans s’occuper des couleurs, une carte à la fois ; une colonne vide prend n’importe quelle carte.', found: {cards: [[2, 0], [3, 2], [4, 1], [5, 3], [6, 0], [7, 2], [8, 1], [9, 3], [10, 0], [11, 2], [12, 1], [13, 3]], wrap: true}, tab: {n: 8, deal: even(8, 5), down: 'none', build: 'any', move: 'one', empty: 'any'}, stock: {to: 'none'}},
        {k: 'stonewall', fam: 'builder', name: 'Le mur de pierre', diff: 4, desc: '6 colonnes de 6 cartes, une cachée sur deux, et un bouquet de 16 cartes où l’on peut prendre n’importe laquelle. On descend en alternant rouge et noir et on déplace des suites entières ; une colonne vide prend n’importe quelle carte.', reserve: {n: 16, kind: 'fan'}, tab: {n: 6, deal: even(6, 6), down: 'alt', build: 'alt', move: 'seq', empty: 'any'}, stock: {to: 'none'}},
        {k: 'wildflower', fam: 'builder', name: 'La fleur sauvage', diff: 2, desc: 'Le jardin fleuri (6 colonnes de 6 et un bouquet de 16 cartes), mais on déplace des suites entières.', reserve: {n: 16, kind: 'fan'}, tab: {n: 6, deal: even(6, 6), down: 'none', build: 'any', move: 'seq', empty: 'any'}, stock: {to: 'none'}},
        {k: 'chessboard', fam: 'builder', name: 'L’échiquier', diff: 4, desc: '10 colonnes toutes visibles. La première carte posée sur une fondation donne la valeur de départ des quatre (le Roi passe à l’As). On monte ou on descend dans la même couleur de carte, une carte à la fois, et le Roi touche l’As.', found: {base: 'first', wrap: true}, tab: {n: 10, deal: [6, 6, 5, 5, 5, 5, 5, 5, 5, 5], down: 'none', build: 'suitud', wrap: true, move: 'one', empty: 'any'}, stock: {to: 'none'}},
        {k: 'stronghold', fam: 'builder', name: 'La place forte', diff: 3, desc: 'Rues et ruelles (8 colonnes, on descend sans s’occuper des couleurs), avec une case libre.', cells: 1, tab: {n: 8, deal: [7, 7, 7, 7, 6, 6, 6, 6], down: 'none', build: 'any', move: 'one', empty: 'any'}, stock: {to: 'none'}},
        {k: 'fastness', fam: 'builder', name: 'Le fort', diff: 2, desc: 'Rues et ruelles (8 colonnes, on descend sans s’occuper des couleurs), avec deux cases libres.', cells: 2, tab: {n: 8, deal: [7, 7, 7, 7, 6, 6, 6, 6], down: 'none', build: 'any', move: 'one', empty: 'any'}, stock: {to: 'none'}},
        {k: 'siegecraft', fam: 'builder', name: 'L’art du siège', diff: 2, desc: 'Le château assiégé (les As posés d’avance, 8 colonnes de 6), avec une case libre.', cells: 1, found: {out: [1]}, tab: {n: 8, deal: even(8, 6), down: 'none', build: 'any', move: 'one', empty: 'any'}, stock: {to: 'none'}},
        {k: 'penelopesweb', fam: 'builder', name: 'La toile de Pénélope', diff: 4, desc: 'Le château assiégé (les As posés d’avance, 8 colonnes de 6), mais seul un Roi va dans une colonne vide.', found: {out: [1]}, tab: {n: 8, deal: even(8, 6), down: 'none', build: 'any', move: 'one', empty: 'king'}, stock: {to: 'none'}},
        {k: 'citadel', fam: 'builder', name: 'La citadelle', diff: 2, desc: 'Le château assiégé, mais pendant la distribution, toute carte qui peut monter sur une fondation y va tout de suite.', found: {out: [1]}, tab: {n: 8, deal: even(8, 6), down: 'none', build: 'any', move: 'one', empty: 'any', toFound: true}, stock: {to: 'none'}},
        {k: 'exiledkings', fam: 'builder', name: 'Les rois exilés', diff: 3, desc: 'La citadelle (les cartes qui peuvent monter y vont pendant la distribution), mais seul un Roi va dans une colonne vide.', found: {out: [1]}, tab: {n: 8, deal: even(8, 6), down: 'none', build: 'any', move: 'one', empty: 'king', toFound: true}, stock: {to: 'none'}},
        {k: 'bastion', fam: 'builder', name: 'Le bastion', diff: 2, desc: '10 colonnes de 5 cartes et 2 cases libres déjà occupées ; on monte ou on descend dans la même couleur de carte, une carte à la fois ; une colonne vide prend n’importe quelle carte.', cells: 2, cellsFill: 2, tab: {n: 10, deal: even(10, 5), down: 'none', build: 'suitud', move: 'one', empty: 'any'}, stock: {to: 'none'}},
        {k: 'canister', fam: 'builder', name: 'La boîte à thé', diff: 2, desc: '8 colonnes de 6 ou 7 cartes, tout est visible ; on descend sans s’occuper des couleurs et on déplace des suites entières ; une colonne vide prend n’importe quelle carte.', tab: {n: 8, deal: [6, 6, 7, 7, 7, 7, 6, 6], down: 'none', build: 'any', move: 'seq', empty: 'any'}, stock: {to: 'none'}},
        {k: 'americancanister', fam: 'builder', name: 'La boîte à thé américaine', diff: 3, desc: '8 colonnes de 6 ou 7 cartes, tout est visible ; on descend en alternant rouge et noir et on déplace des suites entières ; une colonne vide prend n’importe quelle carte.', tab: {n: 8, deal: [6, 6, 7, 7, 7, 7, 6, 6], down: 'none', build: 'alt', move: 'seq', empty: 'any'}, stock: {to: 'none'}},
        {k: 'britishcanister', fam: 'builder', name: 'La boîte à thé anglaise', diff: 4, desc: '8 colonnes de 6 ou 7 cartes, tout est visible ; on descend en alternant rouge et noir, une carte à la fois ; seul un Roi va dans une colonne vide.', tab: {n: 8, deal: [6, 6, 7, 7, 7, 7, 6, 6], down: 'none', build: 'alt', move: 'one', empty: 'king'}, stock: {to: 'none'}},
        // paires, suites, calculs (MODES)
        {k: 'tripeaksstrict', fam: 'pairs', name: 'Les trois sommets stricts', diff: 3, mode: 'tripeaks', nowrap: true, desc: 'Les trois sommets, mais le Roi et l’As ne se suivent pas : la partie est plus difficile.'},
        {k: 'doublegolf', fam: 'pairs', name: 'Golf double', diff: 3, mode: 'golf', decks: 2, cols: 9, rows: 7, desc: 'Golf avec deux jeux : 9 colonnes de 7 cartes. Envoie sur la défausse une carte juste au-dessus ou au-dessous ; rien ne va sur un Roi.'},
        {k: 'acesup5', fam: 'pairs', name: 'As en haut (5 colonnes)', diff: 2, mode: 'acesup', cols: 5, desc: 'As en haut avec 5 colonnes : enlève une carte quand une autre colonne montre une carte plus forte de la même couleur de carte (l’As est le plus fort). Gagné s’il ne reste que les 4 As.'},
        {k: 'baroness', fam: 'pairs', name: 'La baronne', diff: 2, mode: 'sum', sum: 13, single: 13, grid: [1, 5], stack: true, desc: '5 tas : enlève un Roi seul, ou deux cartes du dessus qui font 13 (Valet 11, Dame 12). La pioche pose une carte sur chaque tas.'},
        {k: 'sirtommy', fam: 'pairs', name: 'Sir Tommy', diff: 2, mode: 'calc', calc: {start: 'empty'}, desc: 'Chaque carte piochée va sur une fondation ou sur l’un des 4 tas d’attente. Les fondations commencent par un As et montent de 1 en 1, sans s’occuper des couleurs.'},
        {k: 'pussinthecorner', fam: 'pairs', name: 'Le chat dans le coin', diff: 2, mode: 'calc', calc: {start: 'aces', match: 'color', redeals: 1}, desc: 'Les As sont posés d’avance et montent de 1 en 1 dans leur teinte (rouge sur rouge, noir sur noir). Chaque carte piochée va sur une fondation ou sur l’un des 4 tas d’attente ; une fois, on ramasse les tas pour repiocher.'},
        {k: 'strategy', fam: 'pairs', name: 'La stratégie', diff: 3, mode: 'calc', calc: {start: 'empty', match: 'suit', piles: 8, hold: true}, desc: 'Chaque carte piochée va sur l’un des 8 tas d’attente ; seuls les As montent tout de suite. Quand la pioche est vide, on monte les cartes du dessus des tas, de 1 en 1 dans la même couleur de carte.'},
        {k: 'giza', fam: 'pairs', name: 'Gizeh', diff: 3, mode: 'pyramid', giza: true, nostock: true, desc: 'La pyramide sans pioche : les 24 autres cartes sont visibles en 3 rangées et se prennent toutes. Enlève les paires qui font 13 (Valet 11, Dame 12 ; un Roi s’en va seul).'},
        {k: 'kingtut', fam: 'pairs', name: 'Toutânkhamon', diff: 2, mode: 'pyramid', draw: 3, redeals: 99, desc: 'La pyramide, mais la pioche se retourne trois cartes à la fois (seule la dernière se joue) et repasse autant que tu veux.'},
        {k: 'bluemoon', fam: 'pairs', name: 'La lune bleue', diff: 3, mode: 'montana', grid: [4, 14], aceDeal: 'blue', stockLabel: '🔀 Redistribuer', desc: 'Montana, mais les As vont au début des rangées : il faut ranger chaque rangée de l’As au Roi dans une même couleur. Un trou prend la carte de même couleur juste au-dessus de sa voisine de gauche. Deux fois, on peut ramasser ce qui n’est pas rangé et redistribuer.'},
        {k: 'redmoon', fam: 'pairs', name: 'La lune rouge', diff: 2, mode: 'montana', grid: [4, 14], aceDeal: 'red', stockLabel: '🔀 Redistribuer', desc: 'La lune bleue, mais les As sont posés d’avance au début des rangées et les trous sont au bout des rangées dès le départ.'},
        {k: 'neighbour', fam: 'pairs', name: 'Le voisin', diff: 2, mode: 'montecarlo', sum: 13, desc: 'Une grille de 5 × 5 : enlève deux cartes qui se touchent (même en diagonale) et font 13 (Valet 11, Dame 12) ; un Roi s’en va seul. Puis tasse la grille.'},
        {k: 'isabel', fam: 'pairs', name: 'Isabelle', diff: 1, mode: 'nestor', grid: [4, 13], down: true, nostock: true, desc: '13 colonnes de 4 cartes (seule la dernière est visible) : enlève deux cartes de même valeur prises en bas des colonnes. Un jeu de pure chance, pour se détendre.'},
        {k: 'fourteenout', fam: 'pairs', name: 'Quatorze en colonnes', diff: 2, mode: 'nestor', grid: [5, 12], all: true, sum: 14, nostock: true, desc: '12 colonnes avec toutes les cartes visibles : enlève deux cartes prises en bas des colonnes qui font 14 (Valet 11, Dame 12, Roi 13).'},
    ];
    const BY = new Map(GAMES.map(g => [g.k, g]));
    /** les réglages complets d'un jeu (valeurs par défaut) */
    function norm(def) {
        const n = def.tab?.n || 7;
        return {...def, decks: def.decks || 1, suits: def.suits || 4, cells: def.cells || 0, cellsFill: def.cellsFill || 0, cellsLate: !!def.cellsLate, reserve: def.reserve || null, reserves: def.reserves || null, kingsBottom: !!def.kingsBottom,
            tab: {n, deal: kl(n), down: 'klondike', build: 'alt', move: 'seq', empty: 'king', wrap: false, grid: 0, by: 1, max: 0, first: null, toFound: false, ...(def.tab || {})},
            found: {base: 1, wrap: false, out: [], outN: 0, n: 0, down: 0, by: 1, cards: null, baseAll: false, spider: false, ...(def.found || {})},
            stock: {to: 'waste', draw: 1, redeals: ALL, needFull: false, per: 3, keep: false, skipEmpty: false, ...(def.stock || {})}};
    }
    const get = k => BY.get(k) || null;

    /* ═════ Distribuer ═════ */
    function makeDeck(D, R) {
        const cards = []; let i = 0;
        // l'araignée à 1 ou 2 couleurs : toujours 104 cartes, mais seulement 1 ou 2 couleurs de carte
        const suitOf = (d, s) => (D.suits === 1 ? 2 : D.suits === 2 ? (s % 2 === 0 ? 0 : 2) : s);
        for (let d = 0; d < D.decks; d++) for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) cards.push({r, s: suitOf(d, s), up: false, i: i++});
        return shuffle(cards, R);
    }
    const mkState = (k, seed) => ({k, seed: String(seed), piles: [], moves: 0, redeals: 0, base: 1, won: false, lost: false, round: 0});
    const addPile = (st, id, type, x, y, fan = 'stack', extra = {}) => { const p = {id, type, x, y, fan, cards: [], ...extra}; st.piles.push(p); return p; };
    function deal(k, seed) {
        const def = get(k); if (!def) throw new Error('Jeu inconnu : ' + k);
        if (def.mode) return MODES[def.mode].deal(def, String(seed));
        const D = norm(def), R = rng(seed), st = mkState(k, seed);
        let deck = makeDeck(D, R);
        st.redeals = D.stock.redeals;
        // les fondations : celles qui montent (f0…), puis celles qui descendent du Roi (k0…) ; sur deux rangées s'il y en a beaucoup
        const nUp = D.found.cards ? D.found.cards.length : (D.found.n || 4 * D.decks), nf = nUp + (D.found.down || 0);
        const fRows = nf > 10 ? 2 : 1, perRow = Math.ceil(nf / fRows);
        // la rangée du haut : pioche, défausse, cases libres … fondations à droite
        const left = [];
        if (D.stock.to !== 'none') left.push('stock');
        if (D.stock.to === 'waste') left.push('waste');
        for (let c = 0; c < D.cells; c++) left.push('cell');
        const tabX0 = D.reserve?.kind === 'canfield' ? U * 1.2 : 0;
        const tabCols = D.tab.grid || D.tab.n, tabW = tabX0 + tabCols * U * (D.tab.grid ? 1.75 : 1);
        const width = Math.max(tabW, (left.length + perRow) * U + (left.length ? U * 0.4 : 0));
        st.width = width;
        let lx = 0;
        left.forEach((t, j) => {
            if (t === 'stock') addPile(st, 'stock', 'stock', lx, 0);
            if (t === 'waste') addPile(st, 'waste', 'waste', lx, 0, D.stock.draw > 1 ? 'right3' : 'stack');
            if (t === 'cell') addPile(st, 'c' + j, 'cell', lx, 0);
            lx += t === 'waste' && D.stock.draw > 1 ? U * 1.6 : U;
        });
        for (let f = 0; f < nf; f++) { const col = f % perRow, row = Math.floor(f / perRow); addPile(st, f < nUp ? 'f' + f : 'k' + (f - nUp), 'found', width - (perRow - col) * U + (U - 1), row * 1.15, 'stack', f < nUp ? {} : {down: true}); }
        // posés d'avance (As, ou 2 pour l'entrepôt) ; outN : seulement n cartes par rang, de couleurs de carte différentes
        let fi = 0;
        (D.found.out || []).forEach(r => {
            let out = deck.filter(c => c.r === r);
            if (D.found.outN) { const seen = new Set(); out = out.filter(c => seen.size < D.found.outN && !seen.has(c.s) && seen.add(c.s)); }
            deck = deck.filter(c => !out.includes(c)); out.forEach(c => { c.up = true; const id = 'f' + (fi++); st.piles.find(p => p.id === id)?.cards.push(c); }); }); // (le numéro avancé une fois par carte, pas à chaque pile essayée)
        // des cartes précises commencent les fondations (le cadran du grand-père)
        (D.found.cards || []).forEach(([r, s], j) => { const k = deck.findIndex(c => c.r === r && c.s === s); if (k < 0) return; const [c] = deck.splice(k, 1); c.up = true; pileOf(st, 'f' + j).cards.push(c); });
        if (D.found.out?.length) st.base = D.found.out[0];
        else if (typeof D.found.base === 'number') st.base = D.found.base;
        // la réserve
        const tabY = 1.3 + (fRows - 1) * 1.15;
        let rowY = tabY; // le haut du tableau (plus bas s'il y a une rangée de tas de réserve)
        if (D.reserve) {
            const n = D.reserve.n, cards = deck.splice(0, n);
            if (D.reserve.kind === 'canfield') { const p = addPile(st, 'r', 'reserve', 0, tabY, D.reserve.open ? 'down' : 'stack'); cards.forEach((c, j) => { c.up = !!D.reserve.open || j === n - 1; p.cards.push(c); }); }
            else { const p = addPile(st, 'r', 'reserve', lx + (D.stock.to === 'none' && !D.cells ? 0 : U * 0.3), 0, 'right', {any: true}); cards.forEach(c => { c.up = true; p.cards.push(c); }); }
        }
        // une rangée de tas de réserve (Agnès Bernauer, la duchesse, la porte…) : seule la carte du dessus se joue
        if (D.reserves) {
            const {n, deal: k = 1} = D.reserves, rs = Array.from({length: n}, (_, j) => addPile(st, 'r' + j, 'reserve', tabX0 + j * U, tabY, 'stack', {row: true}));
            for (let j = 0; j < k; j++) rs.forEach(p => { if (deck.length) { const c = deck.shift(); c.up = true; p.cards.push(c); } });
            rowY = tabY + 1.25;
        }
        // Canfield : la première fondation donne la carte de départ
        if (D.found.base === 'first') {
            const c = deck.shift(); c.up = true; st.piles.find(p => p.id === 'f0').cards.push(c); st.base = c.r;
            // le pingouin : les autres cartes de même valeur montent aussi
            if (D.found.baseAll) { const same = deck.filter(x => x.r === c.r); deck = deck.filter(x => x.r !== c.r); same.forEach((x, j) => { x.up = true; pileOf(st, 'f' + (j + 1))?.cards.push(x); }); }
        }
        // FreeCell défi : ces cartes sont distribuées en premier, tout au fond des colonnes
        if (D.tab.first) { const front = D.tab.first.flatMap(r => deck.filter(c => c.r === r)); deck = [...front, ...deck.filter(c => !front.includes(c))]; }
        // le tableau
        const tabs = [];
        for (let t = 0; t < D.tab.n; t++) {
            const g = D.tab.grid, x = g ? tabX0 + (t % g) * U * 1.75 : tabX0 + t * U, y = g ? rowY + Math.floor(t / g) * 1.6 : rowY;
            tabs.push(addPile(st, 't' + t, 'tab', x, y, g ? 'right' : 'down'));
        }
        if (D.tab.deal === 'rest') {
            const cellCards = deck.splice(0, D.cellsFill);
            cellCards.forEach((c, j) => { c.up = true; st.piles.find(p => p.id === 'c' + j).cards.push(c); });
            let t = 0; while (deck.length) { const c = deck.shift(); c.up = true; tabs[t % D.tab.n].cards.push(c); t++; }
        } else {
            const counts = D.tab.deal, alt = D.tab.down === 'alt', down = D.tab.down === 'klondike' ? counts.map(n => n - 1) : D.tab.down === 'none' || alt ? counts.map(() => 0) : D.tab.down;
            // en ligne, comme on distribue à la main (toFound : une carte qui peut monter y va, et la suivante prend sa place)
            const maxN = Math.max(...counts);
            for (let row = 0; row < maxN; row++) tabs.forEach((p, t) => {
                if (row >= counts[t]) return;
                while (deck.length) {
                    const c = deck.shift(); c.up = alt ? row % 2 === 1 : row >= (down[t] || 0);
                    if (D.tab.toFound) { const f = st.piles.find(q => q.type === 'found' && canDrop(st, [c], q.id, null)); if (f) { c.up = true; f.cards.push(c); continue; } }
                    p.cards.push(c); break;
                }
            });
            const cellCards = deck.splice(0, D.cellsFill);
            cellCards.forEach((c, j) => { c.up = true; st.piles.find(p => p.id === 'c' + j).cards.push(c); });
        }
        if (D.kingsBottom) tabs.forEach(p => { const k = p.cards.filter(c => c.r === 13), o = p.cards.filter(c => c.r !== 13); p.cards = [...k, ...o]; });
        const stock = st.piles.find(p => p.id === 'stock');
        if (stock) deck.forEach(c => { c.up = false; stock.cards.push(c); });
        else if (deck.length) { let t = 0; while (deck.length) { const c = deck.shift(); c.up = true; tabs[t % tabs.length].cards.push(c); t++; } }
        afterMove(st, D);
        return st;
    }

    /* ═════ Les règles générales ═════ */
    const pileOf = (st, id) => st.piles.find(p => p.id === id) || null;
    function fits(D, t, c) {
        const b = D.tab.build, by = D.tab.by || 1, d1 = c.r === t.r - by || (D.tab.wrap && c.r === t.r - by + 13);
        if (b === 'alt') return d1 && red(t) !== red(c);
        if (b === 'suit') return d1 && t.s === c.s;
        if (b === 'any') return d1;
        if (b === 'color') return d1 && red(t) === red(c);
        if (b === 'notown') return d1 && t.s !== c.s;
        if (b === 'suitud') return t.s === c.s && (Math.abs(c.r - t.r) === by || (D.tab.wrap && Math.abs(c.r - t.r) === 13 - by));
        if (b === 'anyud') return Math.abs(c.r - t.r) === by || (D.tab.wrap && Math.abs(c.r - t.r) === 13 - by);
        return false; // none : on ne construit pas sur le tableau
    }
    const runOk = (D, run, rule) => run.every(c => c.up) && run.every((c, i) => !i || (rule === 'suit' ? (c.s === run[i - 1].s && c.r === run[i - 1].r - 1) : rule === 'color' ? (red(c) === red(run[i - 1]) && c.r === run[i - 1].r - 1) : fits(D, run[i - 1], c)));
    const freeCells = st => st.piles.filter(p => p.type === 'cell' && !p.cards.length).length;
    const emptyTabs = st => st.piles.filter(p => p.type === 'tab' && !p.cards.length).length;
    /** combien de cartes on peut déplacer d'un coup quand on ne déplace qu'une carte à la fois (en s'aidant des cases et colonnes vides) */
    const maxRun = (st, D, toEmpty) => (D.cells || D.tab.move === 'one') ? (freeCells(st) + 1) * 2 ** Math.max(0, emptyTabs(st) - (toEmpty ? 1 : 0)) : 1;
    function canPick(st, pid, idx) {
        const def = get(st.k); if (def.mode) return MODES[def.mode].canPick(st, def, pid, idx);
        const D = norm(def), p = pileOf(st, pid); if (!p || idx < 0 || idx >= p.cards.length || !p.cards[idx].up) return false;
        const last = idx === p.cards.length - 1;
        if (p.type === 'waste' || p.type === 'cell') return last;
        if (p.type === 'found') return last && !D.found.spider && !D.found.out?.includes(p.cards[idx].r) && p.cards.length > 1 || (last && !D.found.spider && !D.found.out?.length && D.found.base !== 'first');
        if (p.type === 'reserve') return p.any ? true : last;
        if (p.type !== 'tab') return false;
        const run = p.cards.slice(idx); if (run.length === 1) return true;
        const m = D.tab.move;
        if (m === 'any') return run.every(c => c.up);
        if (m === 'seq') return runOk(D, run);
        if (m === 'suitseq') return runOk(D, run, 'suit');
        if (m === 'colorseq') return runOk(D, run, 'color');
        if (m === 'one') return runOk(D, run) && run.length <= maxRun(st, D, false);
        return false;
    }
    const step = (r, wrap, by = 1) => (r + by > 13 ? (wrap ? r + by - 13 : 99) : r + by);
    function canDrop(st, cards, toId, fromId) {
        const def = get(st.k); if (def.mode) return MODES[def.mode].canDrop(st, def, cards, toId, fromId);
        const D = norm(def), to = pileOf(st, toId); if (!to || !cards.length || toId === fromId) return false;
        const c = cards[0], t = top(to);
        if (to.type === 'found') {
            if (cards.length !== 1 || D.found.spider) return false;
            if (to.down) return !t ? c.r === 13 : c.s === t.s && c.r === t.r - 1; // Bisley : du Roi à l'As
            if (!t) return c.r === st.base;
            return c.s === t.s && c.r === step(t.r, D.found.wrap, D.found.by) && to.cards.length < 13;
        }
        if (to.type === 'cell') return cards.length === 1 && !t && !(D.cellsLate && pileOf(st, 'stock')?.cards.length);
        if (to.type !== 'tab') return false;
        if (D.tab.move === 'one' && cards.length > 1 && cards.length > maxRun(st, D, !t)) return false;
        if (D.tab.max && to.cards.length + cards.length > D.tab.max) return false;
        if (!t) { const e = D.tab.empty; if (e === 'none') return false; if (e === 'king') return c.r === (D.found.base === 'first' ? (st.base === 1 ? 13 : st.base - 1) : 13); if (e === 'reserve') return !pileOf(st, 'r')?.cards.length || fromId === 'r'; return true; }
        return t.up && fits(D, t, c);
    }
    /** après chaque coup : retourner les cartes du dessus, enlever les suites complètes (araignées), remplir depuis la réserve, gagné ? */
    function afterMove(st, D) {
        st.piles.forEach(p => { if (p.type === 'tab' && p.cards.length && !top(p).up) top(p).up = true; });
        if (D.found.spider) {
            st.piles.filter(p => p.type === 'tab').forEach(p => {
                const n = p.cards.length; if (n < 13) return;
                const run = p.cards.slice(n - 13);
                if (run[0].r === 13 && runOk(D, run, 'suit')) { const f = st.piles.find(x => x.type === 'found' && !x.cards.length); if (f) { p.cards.splice(n - 13, 13); f.cards.push(...run); if (p.cards.length) top(p).up = true; } }
            });
        }
        if (D.tab.empty === 'reserve') { const r = pileOf(st, 'r'); st.piles.filter(p => p.type === 'tab' && !p.cards.length).forEach(p => { if (r?.cards.length) { const c = r.cards.pop(); c.up = true; p.cards.push(c); if (r.cards.length) top(r).up = true; } }); }
        st.piles.forEach(r => { if (r.type === 'reserve' && r.cards.length && !r.any && !top(r).up) top(r).up = true; });
        const total = 52 * D.decks, inF = st.piles.filter(p => p.type === 'found').reduce((a, p) => a + p.cards.length, 0);
        st.won = inF === total;
    }
    /** déplacer la carte idx (et celles au-dessus) de la pile from vers la pile to → vrai si c'est permis */
    function move(st, fromId, idx, toId) {
        const def = get(st.k); if (def.mode) return MODES[def.mode].move(st, def, fromId, idx, toId);
        const from = pileOf(st, fromId); if (!from || !canPick(st, fromId, idx)) return false;
        const cards = from.p ? [] : from.cards.slice(idx);
        if (from.any) { if (!canDrop(st, [from.cards[idx]], toId, fromId)) return false; const [c] = from.cards.splice(idx, 1); pileOf(st, toId).cards.push(c); }
        else { if (!canDrop(st, cards, toId, fromId)) return false; from.cards.splice(idx); pileOf(st, toId).cards.push(...cards); }
        st.moves++; afterMove(st, norm(def)); return true;
    }
    /** la pioche : retourner, distribuer, ou redistribuer → {ok, msg} */
    function stock(st) {
        const def = get(st.k); if (def.mode) return MODES[def.mode].stock(st, def);
        const D = norm(def), s = pileOf(st, 'stock'), w = pileOf(st, 'waste'), tabs = st.piles.filter(p => p.type === 'tab');
        if (D.stock.to === 'none') return {ok: false, msg: 'Pas de pioche dans ce jeu.'};
        if (D.stock.to === 'shuffle') {
            if (st.redeals <= 0) return {ok: false, msg: 'Plus de redistribution possible.'};
            const all = tabs.flatMap(p => p.cards.splice(0)), per = D.stock.per || 3;
            const mixed = D.stock.keep ? all : shuffle(all, rng(st.seed + ':' + st.redeals)); let t = 0; // keep (la cruelle) : dans l'ordre, sans mélanger
            while (mixed.length) { const c = mixed.shift(); c.up = true; tabs[Math.floor(t / per)]?.cards.push(c) ?? tabs[tabs.length - 1].cards.push(c); t++; }
            st.redeals--; st.moves++; return {ok: true, msg: D.stock.keep ? 'Ramassé et redistribué, sans mélanger.' : 'Ramassé, mélangé et redistribué.'};
        }
        if (!s.cards.length) {
            if (D.stock.to !== 'waste') return {ok: false, msg: 'La pioche est vide.'};
            if (st.redeals <= 0) return {ok: false, msg: 'La pioche ne repasse plus.'};
            if (!w.cards.length) return {ok: false, msg: 'Plus rien à piocher.'};
            while (w.cards.length) { const c = w.cards.pop(); c.up = false; s.cards.push(c); }
            st.redeals--; st.moves++; return {ok: true};
        }
        if (D.stock.to === 'waste') { for (let i = 0; i < D.stock.draw && s.cards.length; i++) { const c = s.cards.pop(); c.up = true; w.cards.push(c); } st.moves++; afterMove(st, D); return {ok: true}; }
        if (D.stock.to === 'tab' || D.stock.to === 'tab3') {
            if (D.stock.needFull && tabs.some(p => !p.cards.length)) return {ok: false, msg: 'Toutes les colonnes doivent avoir au moins une carte avant de distribuer.'};
            const full = tabs.filter(p => p.cards.length), list = D.stock.to === 'tab3' ? tabs.slice(0, 3) : D.stock.skipEmpty && full.length ? full : tabs;
            list.forEach(p => { if (s.cards.length) { const c = s.cards.pop(); c.up = true; p.cards.push(c); } });
            st.moves++; afterMove(st, D); return {ok: true};
        }
        if (D.stock.to === 'reserves') {
            st.piles.filter(p => p.row).forEach(p => { if (s.cards.length) { const c = s.cards.pop(); c.up = true; p.cards.push(c); } });
            st.moves++; afterMove(st, D); return {ok: true};
        }
        return {ok: false};
    }
    /** un double-clic : envoyer la carte sur une fondation si c'est possible (ou jouer la carte, dans les jeux à part) */
    function tap(st, pid, idx) {
        const def = get(st.k); if (def.mode) return MODES[def.mode].tap(st, def, pid, idx);
        const p = pileOf(st, pid); if (!p || idx !== p.cards.length - 1 && !p.any) return false;
        const f = st.piles.find(x => x.type === 'found' && canPick(st, pid, idx) && canDrop(st, [p.cards[idx]], x.id, pid));
        return f ? move(st, pid, idx, f.id) : false;
    }
    /** tout ce qui peut monter sur les fondations y monte */
    function autoAll(st) {
        const def = get(st.k); if (def.mode) return 0;
        let n = 0, again = true;
        while (again && n < 600) { again = false; for (const p of st.piles) { if (!['tab', 'waste', 'cell', 'reserve'].includes(p.type) || !p.cards.length) continue; if (tap(st, p.id, p.cards.length - 1)) { n++; again = true; } } }
        return n;
    }
    /** les coups possibles (pour l'aide et les tests) : [{from, idx, to, score}] */
    function legalMoves(st) {
        const def = get(st.k); if (def.mode) return MODES[def.mode].moves(st, def);
        const out = [], D = norm(def);
        for (const p of st.piles) {
            if (!['tab', 'waste', 'cell', 'reserve', 'found'].includes(p.type)) continue;
            const idxs = p.type === 'tab' ? p.cards.map((c, i) => i).filter(i => p.cards[i].up) : p.any ? p.cards.map((c, i) => i) : p.cards.length ? [p.cards.length - 1] : [];
            for (const i of idxs) {
                if (!canPick(st, p.id, i)) continue;
                const run = p.any ? [p.cards[i]] : p.cards.slice(i);
                for (const q of st.piles) {
                    if (q === p || !canDrop(st, run, q.id, p.id)) continue;
                    let score = q.type === 'found' ? 50 : 0;
                    if (p.type === 'found') score -= 40;
                    if (q.type === 'tab' && !q.cards.length && i === 0 && p.type === 'tab') continue; // déplacer toute une colonne dans une colonne vide : inutile
                    if (p.type === 'tab' && i > 0 && !p.cards[i - 1].up) score += 30; // découvre une carte
                    if (p.type === 'tab' && i === 0) score += 15;
                    if (p.type === 'tab' && q.type === 'tab' && i > 0 && p.cards[i - 1].up && fits(D, p.cards[i - 1], p.cards[i]) && !(D.tab.move === 'suitseq' && p.cards[i - 1].s !== p.cards[i].s)) score -= 25; // défait une suite déjà faite
                    if (q.type === 'cell') score -= 10;
                    if (['waste', 'reserve', 'cell'].includes(p.type) && q.type === 'tab') score += 8;
                    out.push({from: p.id, idx: i, to: q.id, score});
                }
            }
        }
        return out.sort((a, b) => b.score - a.score);
    }
    function hint(st) {
        const m = legalMoves(st).filter(x => x.score > -20);
        if (m.length) return m[0];
        const def = get(st.k), s = pileOf(st, 'stock');
        if (def.mode) return MODES[def.mode].canStock?.(st, def) ? {stock: true} : null; // les jeux à part ont leur propre règle de pioche
        if (def.stock?.needFull && st.piles.some(p => p.type === 'tab' && !p.cards.length)) return null; // Araignée : pas de distribution avec une colonne vide
        if (s && (s.cards.length || (st.redeals > 0 && pileOf(st, 'waste')?.cards.length))) return {stock: true};
        if (def.stock?.to === 'shuffle' && st.redeals > 0) return {stock: true};
        return null;
    }
    const counts = st => st.piles.reduce((a, p) => a + p.cards.length, 0) + (st.hand ? 1 : 0) + (st.gone || 0);

    /* ═════ Les jeux à part ═════ */
    const avail = (st, p) => !(p.cover || []).some(id => pileOf(st, id).cards.length);
    const near = (a, b, wrap) => Math.abs(a.r - b.r) === 1 || (wrap && Math.abs(a.r - b.r) === 12);
    const flipUncovered = st => st.piles.forEach(p => { if (p.type === 'slot' && p.cards.length && avail(st, p)) p.cards[0].up = true; });
    const none = () => false;
    const MODES = {};
    const fullDeck = seed => makeDeck({decks: 1, suits: 4}, rng(seed));
    // ⛳ Golf : défausse ± 1
    MODES.golf = {
        deal(def, seed) {
            const cols = def.cols || 7, rows = def.rows || 5, st = mkState(def.k, seed), d = makeDeck({decks: def.decks || 1, suits: 4}, rng(seed)); st.width = cols * U;
            for (let t = 0; t < cols; t++) { const p = addPile(st, 't' + t, 'tab', t * U, 0, 'down'); for (let j = 0; j < rows; j++) { const c = d.shift(); c.up = true; p.cards.push(c); } }
            const sy = Math.max(3.2, (rows - 1) * 0.27 + 2.1), s = addPile(st, 'stock', 'stock', 0, sy), w = addPile(st, 'waste', 'found', U * 1.3, sy);
            const c0 = d.shift(); c0.up = true; w.cards.push(c0); d.forEach(c => s.cards.push(c)); return st;
        },
        canPick: (st, def, pid, idx) => { const p = pileOf(st, pid); return p?.type === 'tab' && idx === p.cards.length - 1; },
        ok(st, def, c) { const w = top(pileOf(st, 'waste')); return w && (def.wrap ? near(c, w, true) : (w.r !== 13 && near(c, w, false))); },
        canDrop(st, def, cards, toId, fromId) { return toId === 'waste' && cards.length === 1 && pileOf(st, fromId)?.type === 'tab' && this.ok(st, def, cards[0]); },
        move(st, def, fromId, idx, toId) { if (!this.canPick(st, def, fromId, idx) || !this.canDrop(st, def, [pileOf(st, fromId).cards[idx]], toId, fromId)) return false; pileOf(st, 'waste').cards.push(pileOf(st, fromId).cards.pop()); st.moves++; this.end(st); return true; },
        tap(st, def, pid, idx) { return this.move(st, def, pid, idx, 'waste'); },
        stock(st) { const s = pileOf(st, 'stock'); if (!s.cards.length) return {ok: false, msg: 'La pioche est vide.'}; const c = s.cards.pop(); c.up = true; pileOf(st, 'waste').cards.push(c); st.moves++; this.end(st); return {ok: true}; },
        end(st) { st.won = st.piles.filter(p => p.type === 'tab').every(p => !p.cards.length); },
        moves(st, def) { return st.piles.filter(p => p.type === 'tab' && p.cards.length && this.ok(st, def, top(p))).map(p => ({from: p.id, idx: p.cards.length - 1, to: 'waste', score: 10})); },
        canStock: st => !!pileOf(st, 'stock').cards.length,
    };
    // ⛰ les trois sommets
    MODES.tripeaks = {
        ...MODES.golf,
        deal(def, seed) {
            const st = mkState(def.k, seed), d = fullDeck(seed), H = 0.55; st.width = 10 * U * 0.9;
            const X = x => x * U * 0.9;
            const rows = [[1.5, 4.5, 7.5], [1, 2, 4, 5, 7, 8], [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]], ids = rows.map((r, ri) => r.map((_, j) => `p${ri}_${j}`));
            rows.forEach((r, ri) => r.forEach((x, j) => {
                const cover = ri < 3 ? rows[ri + 1].map((x2, j2) => [x2, j2]).filter(([x2]) => Math.abs(x2 - x) === 0.5).map(([, j2]) => ids[ri + 1][j2]) : [];
                const p = addPile(st, ids[ri][j], 'slot', X(x), ri * H, 'stack', {cover}); const c = d.shift(); c.up = ri === 3; p.cards.push(c);
            }));
            const s = addPile(st, 'stock', 'stock', 0, 3 * H + 1.6), w = addPile(st, 'waste', 'found', U * 1.3, 3 * H + 1.6);
            const c0 = d.shift(); c0.up = true; w.cards.push(c0); d.forEach(c => s.cards.push(c)); return st;
        },
        canPick: (st, def, pid) => { const p = pileOf(st, pid); return p?.type === 'slot' && p.cards.length && avail(st, p); },
        ok(st, def, c) { return near(c, top(pileOf(st, 'waste')), !def.nowrap); },
        canDrop(st, def, cards, toId, fromId) { return toId === 'waste' && this.canPick(st, def, fromId) && this.ok(st, def, cards[0]); },
        move(st, def, fromId, idx, toId) { const p = pileOf(st, fromId); if (!p || !this.canDrop(st, def, p.cards, toId, fromId)) return false; pileOf(st, 'waste').cards.push(p.cards.pop()); st.moves++; flipUncovered(st); this.end(st); return true; },
        tap(st, def, pid) { return this.move(st, def, pid, 0, 'waste'); },
        end(st) { st.won = st.piles.filter(p => p.type === 'slot').every(p => !p.cards.length); },
        moves(st, def) { return st.piles.filter(p => p.type === 'slot' && p.cards.length && avail(st, p) && this.ok(st, def, p.cards[0])).map(p => ({from: p.id, idx: 0, to: 'waste', score: 10})); },
    };
    // 🕳 le trou noir
    MODES.blackhole = {
        ...MODES.golf,
        deal(def, seed) {
            const st = mkState(def.k, seed); let d = fullDeck(seed); st.width = 6 * U * 1.6;
            const hole = addPile(st, 'waste', 'found', 2.5 * U * 1.6, 1.6 * 1.5 + 0.1); const a = d.find(c => c.r === 1 && c.s === 2); d = d.filter(c => c !== a); a.up = true; hole.cards.push(a);
            for (let t = 0; t < 17; t++) { let row = Math.floor(t / 6), col = t % 6; if (row === 1 && col >= 2) col += 1; if (t >= 6 + 5) { row = 2; col = t - 11; } const p = addPile(st, 't' + t, 'tab', col * U * 1.6 * (row === 1 ? 0.86 : 1), row * 1.5, 'right'); for (let j = 0; j < 3; j++) { const c = d.shift(); c.up = true; p.cards.push(c); } }
            return st;
        },
        ok(st, def, c) { return near(c, top(pileOf(st, 'waste')), true); },
        stock: () => ({ok: false, msg: 'Pas de pioche dans ce jeu.'}),
        canStock: () => false,
    };
    // 🔺 la pyramide (paires qui font 13)
    const val = c => c.r;
    MODES.pyramid = {
        multi: true,
        deal(def, seed) {
            const st = mkState(def.k, seed), d = fullDeck(seed), H = 0.5; st.width = (def.giza ? 8 : 7) * U; st.redeals = def.redeals || 0; st.gone = 0;
            for (let r = 0; r < 7; r++) for (let j = 0; j <= r; j++) { const p = addPile(st, `p${r}_${j}`, 'slot', (3 - r / 2 + j) * U, r * H, 'stack', {cover: r < 6 ? [`p${r + 1}_${j}`, `p${r + 1}_${j + 1}`] : []}); const c = d.shift(); c.up = true; p.cards.push(c); }
            // Gizeh : pas de pioche, les 24 autres cartes en 3 rangées, toutes libres
            if (def.giza) { d.forEach((c, i) => { c.up = true; addPile(st, 'g' + i, 'slot', (i % 8) * U, 6 * H + 1.4 + Math.floor(i / 8) * 1.1, 'stack', {cover: []}).cards.push(c); }); addPile(st, 'out', 'found', 7 * U, 0); return st; }
            const s = addPile(st, 'stock', 'stock', 0, 6 * H + 1.5), w = addPile(st, 'waste', 'waste', U * 1.3, 6 * H + 1.5, (def.draw || 1) > 1 ? 'right3' : 'stack');
            d.forEach(c => s.cards.push(c)); addPile(st, 'out', 'found', 6 * U, 6 * H + 1.5); return st;
        },
        free(st, pid) { const p = pileOf(st, pid); if (!p || !p.cards.length) return false; return p.type === 'slot' ? avail(st, p) : p.type === 'waste' || p.type === 'stock' && p.cards.length && false; },
        canPick(st, def, pid) { return this.free(st, pid); },
        canDrop: none, move: none,
        /** une carte ou deux enlevées → vrai */
        trySet(st, def, refs) {
            const ps = refs.map(id => pileOf(st, id)); if (!ps.every(p => p && this.free(st, p.id))) return false;
            const cs = ps.map(p => top(p)), sum = cs.reduce((a, c) => a + val(c), 0);
            if (!((cs.length === 1 && cs[0].r === 13) || (cs.length === 2 && new Set(ps).size === 2 && sum === 13))) return false;
            ps.forEach(p => { pileOf(st, 'out').cards.push(p.cards.pop()); }); st.moves++; this.end(st); return true;
        },
        tap(st, def, pid) { return this.trySet(st, def, [pid]); },
        stock(st, def) {
            const s = pileOf(st, 'stock'), w = pileOf(st, 'waste');
            if (!s) return {ok: false, msg: 'Pas de pioche dans ce jeu.'};
            if (s.cards.length) { for (let i = 0; i < (def.draw || 1) && s.cards.length; i++) { const c = s.cards.pop(); c.up = true; w.cards.push(c); } st.moves++; return {ok: true}; }
            if (st.redeals > 0 && w.cards.length) { while (w.cards.length) { const c = w.cards.pop(); c.up = false; s.cards.push(c); } st.redeals--; return {ok: true}; }
            return {ok: false, msg: 'La pioche ne repasse plus.'};
        },
        end(st) { st.won = st.piles.filter(p => p.type === 'slot').every(p => !p.cards.length); },
        moves(st, def) {
            const fr = st.piles.filter(p => this.free(st, p.id)), out = [];
            fr.forEach((a, i) => { if (top(a).r === 13) out.push({set: [a.id], score: 10}); fr.slice(i + 1).forEach(b => { if (val(top(a)) + val(top(b)) === 13) out.push({set: [a.id, b.id], score: 10}); }); });
            return out;
        },
        canStock: st => !!pileOf(st, 'stock') && (!!pileOf(st, 'stock').cards.length || (st.redeals > 0 && !!pileOf(st, 'waste').cards.length)),
    };
    // ＋ Onze, Quatorze, Dix : une grille, des paires qui font un total (ou des figures), la pioche remplit les trous
    MODES.sum = {
        multi: true,
        deal(def, seed) {
            const st = mkState(def.k, seed), d = fullDeck(seed), [rows, cols] = def.grid; st.width = (cols + 1.4) * U; st.gone = 0;
            for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const p = addPile(st, `g${r}_${c}`, 'slot', c * U, r * 1.5, def.stack ? 'down' : 'stack'); const x = d.shift(); x.up = true; p.cards.push(x); }
            const s = addPile(st, 'stock', 'stock', (cols + 0.4) * U, 0); d.forEach(c => s.cards.push(c)); addPile(st, 'out', 'found', (cols + 0.4) * U, 1.5); return st;
        },
        canPick: (st, def, pid) => { const p = pileOf(st, pid); return p?.type === 'slot' && !!p.cards.length; },
        canDrop: none, move: none,
        ok(def, cs) {
            const face = c => c.r >= 11;
            if (def.faces === true && cs.length === 3) return new Set(cs.map(c => c.r)).size === 3 && cs.every(face);
            if (def.faces === 'four' && cs.length === 4) return cs.every(c => c.r >= 10) && cs.every(c => c.r === cs[0].r);
            if (def.single && cs.length === 1) return cs[0].r === def.single; // Treize : le Roi s'en va seul
            if (cs.length !== 2) return false;
            if (def.same) return cs[0].r === cs[1].r; // Les paires : deux cartes de même valeur
            if (def.faces && cs.some(face)) return false;
            return cs[0].r + cs[1].r === def.sum;
        },
        trySet(st, def, refs) {
            const ps = [...new Set(refs)].map(id => pileOf(st, id)); if (ps.length !== refs.length || !ps.every(p => p?.type === 'slot' && p.cards.length)) return false;
            if (!this.ok(def, ps.map(top))) return false;
            const s = pileOf(st, 'stock'), out = pileOf(st, 'out');
            ps.forEach(p => { out.cards.push(p.cards.pop()); if (s.cards.length && !def.stack) { const c = s.cards.pop(); c.up = true; p.cards.push(c); } }); // stack (la baronne) : pas de remplissage
            st.moves++; st.won = !s.cards.length && st.piles.filter(p => p.type === 'slot').every(p => !p.cards.length); return true;
        },
        tap: () => false,
        stock(st, def) {
            if (!def.stack) return {ok: false, msg: 'La pioche remplit la grille toute seule.'};
            const s = pileOf(st, 'stock'); if (!s.cards.length) return {ok: false, msg: 'La pioche est vide.'};
            st.piles.filter(p => p.type === 'slot').forEach(p => { if (s.cards.length) { const c = s.cards.pop(); c.up = true; p.cards.push(c); } }); st.moves++; return {ok: true};
        },
        moves(st, def) {
            const fr = st.piles.filter(p => p.type === 'slot' && p.cards.length), out = [];
            fr.forEach((a, i) => fr.slice(i + 1).forEach(b => { if (this.ok(def, [top(a), top(b)])) out.push({set: [a.id, b.id], score: 10}); }));
            if (def.single) fr.forEach(a => { if (top(a).r === def.single) out.push({set: [a.id], score: 10}); });
            if (def.faces === true) { for (const a of fr) for (const b of fr) for (const c of fr) { if (a.id < b.id && b.id < c.id && this.ok(def, [top(a), top(b), top(c)])) out.push({set: [a.id, b.id, c.id], score: 10}); } }
            if (def.faces === 'four') { const by = {}; fr.forEach(p => { if (top(p).r >= 10) (by[top(p).r] = by[top(p).r] || []).push(p.id); }); Object.values(by).forEach(l => { if (l.length >= 4) out.push({set: l.slice(0, 4), score: 10}); }); }
            return out;
        },
        canStock: (st, def) => !!def.stack && !!pileOf(st, 'stock').cards.length,
    };
    // 🎰 Monte-Carlo : paires de même valeur qui se touchent, puis on tasse
    MODES.montecarlo = {
        multi: true,
        deal(def, seed) {
            const st = mkState(def.k, seed), d = fullDeck(seed); st.width = 6.4 * U; st.gone = 0;
            for (let i = 0; i < 25; i++) { const p = addPile(st, 'g' + i, 'slot', (i % 5) * U, Math.floor(i / 5) * 1.5); const c = d.shift(); c.up = true; p.cards.push(c); }
            const s = addPile(st, 'stock', 'stock', 5.4 * U, 0); d.forEach(c => s.cards.push(c)); addPile(st, 'out', 'found', 5.4 * U, 1.5); return st;
        },
        canPick: (st, def, pid) => { const p = pileOf(st, pid); return p?.type === 'slot' && !!p.cards.length; },
        canDrop: none, move: none, tap: () => false,
        touch: (a, b) => { const i = Number(a.slice(1)), j = Number(b.slice(1)); return i !== j && Math.abs(i % 5 - j % 5) <= 1 && Math.abs(Math.floor(i / 5) - Math.floor(j / 5)) <= 1; },
        pair: (def, x, y) => (def.sum ? x.r + y.r === def.sum : x.r === y.r), // le voisin (sum : 13) : deux cartes qui font 13
        trySet(st, def, refs) {
            if (def.sum && refs.length === 1) { const a = pileOf(st, refs[0]); if (a?.type !== 'slot' || !a.cards.length || top(a).r !== 13) return false; pileOf(st, 'out').cards.push(a.cards.pop()); st.moves++; this.end(st); return true; }
            if (refs.length !== 2) return false; const [a, b] = refs.map(id => pileOf(st, id));
            if (!a?.cards.length || !b?.cards.length || !this.touch(a.id, b.id) || !this.pair(def, top(a), top(b))) return false;
            const out = pileOf(st, 'out'); out.cards.push(a.cards.pop(), b.cards.pop()); st.moves++; this.end(st); return true;
        },
        /** tasser : les cartes remontent dans l'ordre, la pioche remplit la fin */
        stock(st) {
            const slots = st.piles.filter(p => p.type === 'slot'), cards = slots.flatMap(p => p.cards.splice(0)), s = pileOf(st, 'stock');
            if (cards.length === 25 - 0 && slots.every((p, i) => i < cards.length)) { /* rien à tasser : on remet en place */ }
            slots.forEach(p => { const c = cards.shift() || (s.cards.length ? s.cards.pop() : null); if (c) { c.up = true; p.cards.push(c); } });
            st.moves++; this.end(st); return {ok: true, msg: 'Grille tassée.'};
        },
        end(st) { st.won = !pileOf(st, 'stock').cards.length && st.piles.filter(p => p.type === 'slot').every(p => !p.cards.length); },
        moves(st, def) { const fr = st.piles.filter(p => p.type === 'slot' && p.cards.length), out = []; fr.forEach((a, i) => { if (def.sum && top(a).r === 13) out.push({set: [a.id], score: 10}); fr.slice(i + 1).forEach(b => { if (this.touch(a.id, b.id) && this.pair(def, top(a), top(b))) out.push({set: [a.id, b.id], score: 10}); }); }); return out; },
        canStock(st) { const sl = st.piles.filter(p => p.type === 'slot'); const n = sl.filter(p => p.cards.length).length; return n < 25 && (pileOf(st, 'stock').cards.length > 0 || sl.some((p, i) => !p.cards.length && i < n)); },
    };
    // 🅰 As en haut
    const hi = c => (c.r === 1 ? 14 : c.r);
    MODES.acesup = {
        deal(def, seed) {
            const n = def.cols || 4, st = mkState(def.k, seed), d = fullDeck(seed); st.width = (n + 2) * U;
            const s = addPile(st, 'stock', 'stock', 0, 0); for (let t = 0; t < n; t++) addPile(st, 't' + t, 'tab', (1.3 + t) * U, 0, 'down'); addPile(st, 'out', 'found', (n + 1.3) * U, 0);
            d.forEach(c => s.cards.push(c)); this.stock(st); st.moves = 0; return st;
        },
        canPick: (st, def, pid, idx) => { const p = pileOf(st, pid); return p?.type === 'tab' && idx === p.cards.length - 1; },
        canGo(st, p) { const c = top(p); return !!c && st.piles.some(q => q.type === 'tab' && q !== p && q.cards.length && top(q).s === c.s && hi(top(q)) > hi(c)); },
        canDrop(st, def, cards, toId, fromId) { const to = pileOf(st, toId), from = pileOf(st, fromId); if (!to || !from || cards.length !== 1) return false; if (to.id === 'out') return this.canGo(st, from); return to.type === 'tab' && !to.cards.length; },
        move(st, def, fromId, idx, toId) { const from = pileOf(st, fromId); if (!this.canPick(st, def, fromId, idx) || !this.canDrop(st, def, [top(from)], toId, fromId)) return false; pileOf(st, toId).cards.push(from.cards.pop()); st.moves++; this.end(st); return true; },
        tap(st, def, pid, idx) { const p = pileOf(st, pid); if (!p) return false; if (this.canGo(st, p)) return this.move(st, def, pid, idx, 'out'); const e = st.piles.find(q => q.type === 'tab' && !q.cards.length); return e && p.cards.length > 1 ? this.move(st, def, pid, idx, e.id) : false; },
        stock(st) { const s = pileOf(st, 'stock'); if (!s.cards.length) return {ok: false, msg: 'La pioche est vide.'}; st.piles.filter(p => p.type === 'tab').forEach(p => { if (s.cards.length) { const c = s.cards.pop(); c.up = true; p.cards.push(c); } }); st.moves++; this.end(st); return {ok: true}; },
        end(st) { const t = st.piles.filter(p => p.type === 'tab'), left = t.flatMap(p => p.cards); st.won = !pileOf(st, 'stock').cards.length && (t.length === 4 ? t.every(p => p.cards.length === 1 && p.cards[0].r === 1) : left.length === 4 && left.every(c => c.r === 1)); },
        moves(st) { return st.piles.filter(p => p.type === 'tab' && this.canGo(st, p)).map(p => ({from: p.id, idx: p.cards.length - 1, to: 'out', score: 10})); },
        canStock: st => !!pileOf(st, 'stock').cards.length,
    };
    // 🕰 l'horloge
    MODES.clock = {
        deal(def, seed) {
            const st = mkState(def.k, seed), d = fullDeck(seed), R = 2.3; st.width = 2 * R + 1 + U;
            for (let h = 1; h <= 13; h++) {
                const a = (h % 12) / 12 * 2 * Math.PI - Math.PI / 2, x = h === 13 ? R : R + Math.cos(a) * R, y = h === 13 ? R * 0.75 : (R + Math.sin(a) * R) * 0.75;
                const p = addPile(st, 'h' + h, 'slot', x, y, 'stack', {hour: h}); for (let j = 0; j < 4; j++) { const c = d.shift(); c.up = false; p.cards.push(c); }
            }
            st.kings = 0; st.hand = null; return st;
        },
        canPick: none, canDrop: none, move: none,
        /** une étape : la carte en main va à son heure (dessous, visible), on prend la carte cachée du dessus de ce tas */
        stock(st) {
            if (st.won || st.lost) return {ok: false};
            if (!st.hand) { const k = pileOf(st, 'h13'); const c = k.cards.find(x => !x.up); if (!c) return {ok: false}; k.cards.splice(k.cards.lastIndexOf(c), 1); st.hand = c; c.up = true; st.moves++; return {ok: true}; }
            const c = st.hand, p = pileOf(st, 'h' + c.r); p.cards.unshift(c); st.hand = null; st.moves++;
            if (c.r === 13) st.kings++;
            const next = [...p.cards].reverse().find(x => !x.up);
            const allUp = st.piles.every(q => q.cards.every(x => x.up));
            if (allUp) { st.won = true; return {ok: true}; }
            if (!next) { st.lost = true; return {ok: true, msg: 'Plus de carte cachée à cette heure : la partie est finie.'}; }
            p.cards.splice(p.cards.lastIndexOf(next), 1); next.up = true; st.hand = next; return {ok: true};
        },
        tap(st) { return this.stock(st).ok; },
        moves: () => [], canStock: st => !st.won && !st.lost,
    };
    // 🪗 l'accordéon
    MODES.accordion = {
        deal(def, seed) { const st = mkState(def.k, seed), d = fullDeck(seed); st.width = 13 * U; st.line = 0; d.forEach((c, i) => { c.up = true; addPile(st, 'a' + i, 'slot', 0, 0).cards.push(c); }); this.layout(st); return st; },
        layout(st) { const sl = st.piles.filter(p => p.type === 'slot'); sl.forEach((p, i) => { p.x = (i % 13) * U; p.y = Math.floor(i / 13) * 1.55; }); },
        canPick: (st, def, pid) => { const p = pileOf(st, pid); return p?.type === 'slot' && !!p.cards.length; },
        canDrop(st, def, cards, toId, fromId) {
            const sl = st.piles.filter(p => p.type === 'slot'), i = sl.findIndex(p => p.id === fromId), j = sl.findIndex(p => p.id === toId);
            if (i < 0 || j < 0 || !(i - j === 1 || i - j === 3)) return false; const a = top(sl[i]), b = top(sl[j]); return a.r === b.r || a.s === b.s;
        },
        move(st, def, fromId, idx, toId) {
            const from = pileOf(st, fromId); if (!from || !this.canDrop(st, def, [top(from)], toId, fromId)) return false;
            pileOf(st, toId).cards.push(...from.cards.splice(0)); st.piles = st.piles.filter(p => p !== from); this.layout(st); st.moves++;
            st.won = st.piles.filter(p => p.type === 'slot').length === 1; return true;
        },
        tap(st, def, pid) { const sl = st.piles.filter(p => p.type === 'slot'), i = sl.findIndex(p => p.id === pid); for (const k of [1, 3]) { if (i - k >= 0 && this.move(st, def, pid, 0, sl[i - k].id)) return true; } return false; },
        stock: () => ({ok: false, msg: 'Pas de pioche dans ce jeu.'}),
        moves(st, def) { const sl = st.piles.filter(p => p.type === 'slot'), out = []; sl.forEach((p, i) => [1, 3].forEach(k => { if (i - k >= 0 && this.canDrop(st, def, [top(p)], sl[i - k].id, p.id)) out.push({from: p.id, idx: 0, to: sl[i - k].id, score: 10}); })); return out; },
        canStock: () => false,
    };
    // 🧮 le calcul
    MODES.calc = {
        // calc : {start: 'calc' (A, 2, 3, 4 montent de 1, 2, 3, 4) | 'empty' (un As sur une fondation vide, Sir Tommy) | 'aces' (les As posés
        //   d'avance), match : 'any' | 'suit' | 'color' (de 1 en 1), piles : tas d'attente (4), hold : seuls les As montent tant que la pioche
        //   n'est pas vide (la stratégie), redeals : on ramasse les tas d'attente dans la pioche}
        deal(def, seed) {
            const cf = def.calc || {}, start = cf.start || 'calc', n = cf.piles || 4;
            const st = mkState(def.k, seed); let d = fullDeck(seed); st.width = (n > 4 ? n : 6) * U; st.redeals = cf.redeals || 0;
            const s = addPile(st, 'stock', 'stock', 0, 0), w = addPile(st, 'waste', 'waste', U, 0);
            for (let f = 0; f < 4; f++) {
                const p = addPile(st, 'f' + f, 'found', (2.2 + f) * U, 0, 'stack', start === 'calc' ? {by: f + 1} : {});
                const c = start === 'calc' ? d.find(x => x.r === f + 1) : start === 'aces' ? d.find(x => x.r === 1 && x.s === f) : null;
                if (c) { d = d.filter(x => x !== c); c.up = true; p.cards.push(c); }
            }
            for (let t = 0; t < n; t++) addPile(st, 't' + t, 'tab', (n > 4 ? t : 2.2 + t) * U, 1.3, 'down');
            d.forEach(c => s.cards.push(c)); w.cards.push(Object.assign(s.cards.pop(), {up: true})); return st;
        },
        nextOf: (f) => { const t = top(f); return ((t.r - 1 + f.by) % 13) + 1; },
        /** la carte c peut-elle monter sur la fondation f ? */
        upOk(st, def, f, c) {
            if (f.cards.length >= 13) return false;
            if (f.by) return c.r === this.nextOf(f);
            const cf = def.calc || {}, t = top(f);
            if (cf.hold && c.r !== 1 && pileOf(st, 'stock').cards.length) return false;
            if (!t) return c.r === 1;
            return c.r === t.r + 1 && (cf.match === 'suit' ? c.s === t.s : cf.match === 'color' ? red(c) === red(t) : true);
        },
        canPick(st, def, pid, idx) { const p = pileOf(st, pid); return !!p && (p.type === 'waste' || p.type === 'tab') && idx === p.cards.length - 1; },
        canDrop(st, def, cards, toId, fromId) {
            const to = pileOf(st, toId), c = cards[0]; if (!to || cards.length !== 1) return false;
            if (to.type === 'found') return this.upOk(st, def, to, c);
            if (to.type === 'tab') return fromId === 'waste';
            return false;
        },
        move(st, def, fromId, idx, toId) { const from = pileOf(st, fromId); if (!this.canPick(st, def, fromId, idx) || !this.canDrop(st, def, [top(from)], toId, fromId)) return false; pileOf(st, toId).cards.push(from.cards.pop()); st.moves++; this.end(st); return true; },
        tap(st, def, pid, idx) { const p = pileOf(st, pid); const f = p && st.piles.find(q => q.type === 'found' && this.canDrop(st, def, [top(p)], q.id, pid)); return f ? this.move(st, def, pid, idx, f.id) : false; },
        stock(st) {
            const s = pileOf(st, 'stock'), w = pileOf(st, 'waste'), tabs = st.piles.filter(p => p.type === 'tab');
            if (w.cards.length) return {ok: false, msg: 'Place d’abord la carte piochée (sur une fondation ou un tas d’attente).'};
            if (!s.cards.length) {
                // le chat dans le coin : on ramasse les tas d'attente pour repiocher
                if (st.redeals > 0 && tabs.some(p => p.cards.length)) { tabs.flatMap(p => p.cards.splice(0)).reverse().forEach(c => { c.up = false; s.cards.push(c); }); st.redeals--; st.moves++; return {ok: true, msg: 'Les tas d’attente sont ramassés dans la pioche.'}; }
                return {ok: false, msg: 'La pioche est vide.'};
            }
            const c = s.cards.pop(); c.up = true; w.cards.push(c); st.moves++; return {ok: true};
        },
        end(st) { st.won = st.piles.filter(p => p.type === 'found').every(p => p.cards.length === 13); },
        moves(st, def) {
            const out = []; st.piles.filter(p => (p.type === 'waste' || p.type === 'tab') && p.cards.length).forEach(p => st.piles.filter(q => q.type === 'found').forEach(q => { if (this.canDrop(st, def, [top(p)], q.id, p.id)) out.push({from: p.id, idx: p.cards.length - 1, to: q.id, score: 10}); }));
            // la carte piochée peut toujours aller sur un tas d'attente (sinon la partie aurait l'air bloquée) : le plus bas d'abord
            const w = pileOf(st, 'waste'); if (w.cards.length) st.piles.filter(p => p.type === 'tab').sort((a, b) => a.cards.length - b.cards.length).forEach((p, i) => out.push({from: 'waste', idx: w.cards.length - 1, to: p.id, score: -i}));
            return out;
        },
        canStock: st => !pileOf(st, 'waste').cards.length && (!!pileOf(st, 'stock').cards.length || (st.redeals > 0 && st.piles.some(p => p.type === 'tab' && p.cards.length))),
    };

    // 🕳 tout en ligne : le trou noir sans carte de départ, 13 colonnes de 4
    MODES.allinarow = {
        ...MODES.blackhole,
        deal(def, seed) {
            const st = mkState(def.k, seed), d = fullDeck(seed); st.width = 13 * U * 0.82;
            for (let t = 0; t < 13; t++) { const p = addPile(st, 't' + t, 'tab', t * U * 0.82, 0, 'down'); for (let j = 0; j < 4; j++) { const c = d.shift(); c.up = true; p.cards.push(c); } }
            addPile(st, 'waste', 'found', 6 * U * 0.82, 2.4); return st;
        },
        ok(st, def, c) { const w = top(pileOf(st, 'waste')); return !w || near(c, w, true); },
    };
    // 🕳 Montana : 4 rangées de 13, les As enlevés font des trous
    const mtId = (r, c) => `m${r}_${c}`;
    MODES.montana = {
        // aceDeal (la lune bleue, la lune rouge) : 4 rangées de 14 places, les As au début des rangées, on range de l'As au Roi
        deal(def, seed) {
            const st = mkState(def.k, seed), d = fullDeck(seed); st.redeals = 2;
            if (def.aceDeal) {
                st.width = 14 * U * 0.82; const at = (r, c) => pileOf(st, mtId(r, c));
                for (let r = 0; r < 4; r++) for (let c = 0; c < 14; c++) addPile(st, mtId(r, c), 'slot', c * U * 0.82, r * 1.42);
                d.forEach(x => { x.up = true; });
                if (def.aceDeal === 'red') { const aces = d.filter(x => x.r === 1), rest = d.filter(x => x.r !== 1); aces.forEach((x, r) => at(r, 0).cards.push(x)); rest.forEach((x, i) => at(Math.floor(i / 12), 1 + (i % 12)).cards.push(x)); }
                else { d.forEach((x, i) => at(Math.floor(i / 13), 1 + (i % 13)).cards.push(x)); let a = 0; for (let r = 0; r < 4; r++) for (let c = 1; c < 14; c++) { const p = at(r, c); if (p.cards[0]?.r === 1) at(a++, 0).cards.push(p.cards.pop()); } }
                return st;
            }
            st.width = 13 * U * 0.86;
            const out = addPile(st, 'out', 'found', 0, 4 * 1.42);
            for (let r = 0; r < 4; r++) for (let c = 0; c < 13; c++) { const p = addPile(st, mtId(r, c), 'slot', c * U * 0.86, r * 1.42); const x = d.shift(); x.up = true; if (x.r === 1) out.cards.push(x); else p.cards.push(x); }
            return st;
        },
        cols: st => (pileOf(st, mtId(0, 13)) ? 14 : 13),
        aceRow: st => !!pileOf(st, mtId(0, 13)),
        /** la carte qui va dans ce trou (null si aucune) : la voisine de gauche + 1, même couleur ; un 2 au début d'une rangée */
        wants(st, id) {
            const [r, c] = id.slice(1).split('_').map(Number); if (pileOf(st, id).cards.length) return null;
            if (c === 0) return this.aceRow(st) ? null : {r: 2, any: true};
            const left = top(pileOf(st, mtId(r, c - 1))); if (!left || left.r === 13) return null;
            return {r: left.r + 1, s: left.s};
        },
        fits(st, id, card) { const w = this.wants(st, id); return !!w && card.r === w.r && (w.any || card.s === w.s); },
        canPick: (st, def, pid) => { const p = pileOf(st, pid); return p?.type === 'slot' && !!p.cards.length; },
        canDrop(st, def, cards, toId, fromId) { const to = pileOf(st, toId); return !!to && to.type === 'slot' && cards.length === 1 && toId !== fromId && this.fits(st, toId, cards[0]); },
        move(st, def, fromId, idx, toId) { const from = pileOf(st, fromId); if (!from?.cards.length || !this.canDrop(st, def, [top(from)], toId, fromId)) return false; pileOf(st, toId).cards.push(from.cards.pop()); st.moves++; this.end(st); return true; },
        tap(st, def, pid) { const p = pileOf(st, pid); if (!p?.cards.length) return false; const gap = st.piles.find(q => q.type === 'slot' && this.fits(st, q.id, top(p))); return gap ? this.move(st, def, pid, 0, gap.id) : false; },
        /** les cartes déjà rangées au début d'une rangée (2, 3, 4… dans une même couleur) */
        sorted(st, r) { const lo = this.aceRow(st) ? 1 : 2; let n = 0; const first = top(pileOf(st, mtId(r, 0))); if (!first || first.r !== lo) return 0; for (let c = 0; c < 14 - lo; c++) { const x = top(pileOf(st, mtId(r, c))); if (x && x.r === c + lo && x.s === first.s) n++; else break; } return n; },
        stock(st) {
            if (st.redeals <= 0) return {ok: false, msg: 'Plus de redistribution possible.'};
            const keep = [0, 1, 2, 3].map(r => this.sorted(st, r)), loose = [];
            const n = this.cols(st);
            for (let r = 0; r < 4; r++) for (let c = keep[r]; c < n; c++) loose.push(...pileOf(st, mtId(r, c)).cards.splice(0));
            const mixed = shuffle(loose, rng(st.seed + ':m' + st.redeals));
            for (let r = 0; r < 4; r++) for (let c = keep[r] + 1; c < n; c++) { const x = mixed.shift(); if (x) { x.up = true; pileOf(st, mtId(r, c)).cards.push(x); } }
            st.redeals--; st.moves++; this.end(st); return {ok: true, msg: 'Ramassé, mélangé et redistribué.'};
        },
        end(st) { const want = this.aceRow(st) ? 13 : 12; st.won = [0, 1, 2, 3].every(r => this.sorted(st, r) === want); },
        moves(st) { const out = []; st.piles.filter(q => q.type === 'slot' && !q.cards.length).forEach(gap => st.piles.forEach(p => { if (p.type === 'slot' && p.cards.length && p !== gap && this.fits(st, gap.id, top(p))) out.push({from: p.id, idx: 0, to: gap.id, score: 10}); })); return out; },
        canStock: st => st.redeals > 0,
    };
    // 🏛 Nestor : des paires de même valeur, en bas des colonnes ou dans la réserve
    MODES.nestor = {
        multi: true,
        // grid [cartes par colonne, colonnes] (Isabelle, Quatorze en tas) : down = seule la dernière carte est visible ; all = tout le jeu
        //   en colonnes ; sum = deux cartes qui font ce total (au lieu de deux cartes de même valeur)
        deal(def, seed) {
            if (def.grid) {
                const [per, n] = def.grid, st = mkState(def.k, seed), d = fullDeck(seed); st.width = n * U; st.gone = 0;
                const cols = Array.from({length: n}, (_, t) => addPile(st, 't' + t, 'tab', t * U, 0, 'down'));
                if (def.all) d.forEach((c, i) => { c.up = true; cols[i % n].cards.push(c); });
                else for (let j = 0; j < per; j++) cols.forEach(p => { const c = d.shift(); if (c) { c.up = !def.down; p.cards.push(c); } });
                cols.forEach(p => { if (p.cards.length) top(p).up = true; });
                addPile(st, 'out', 'found', (n - 1) * U, 3.4); return st;
            }
            const st = mkState(def.k, seed); let d = fullDeck(seed); st.width = 8 * U; st.gone = 0;
            const cols = Array.from({length: 8}, (_, t) => addPile(st, 't' + t, 'tab', t * U, 0, 'down'));
            // comme à la main : pas deux cartes de même valeur dans une colonne (si on peut)
            cols.forEach(p => { for (let j = 0; j < 6; j++) { let k = d.findIndex(c => !p.cards.some(x => x.r === c.r)); if (k < 0) k = 0; const [c] = d.splice(k, 1); c.up = true; p.cards.push(c); } });
            d.forEach((c, j) => { c.up = true; addPile(st, 'r' + j, 'slot', (2 + j) * U, 3.4).cards.push(c); });
            addPile(st, 'out', 'found', 7 * U, 3.4); return st;
        },
        canPick: (st, def, pid) => { const p = pileOf(st, pid); return !!p && (p.type === 'tab' || p.type === 'slot') && !!p.cards.length && top(p).up; },
        canDrop: none, move: none, tap: () => false,
        pair: (def, x, y) => (def.sum ? x.r + y.r === def.sum : x.r === y.r),
        trySet(st, def, refs) {
            if (refs.length !== 2 || refs[0] === refs[1]) return false; const [a, b] = refs.map(id => pileOf(st, id));
            if (!a || !b || !this.canPick(st, def, a.id) || !this.canPick(st, def, b.id) || !this.pair(def, top(a), top(b))) return false;
            pileOf(st, 'out').cards.push(a.cards.pop(), b.cards.pop()); [a, b].forEach(p => { if (p.cards.length && !top(p).up) top(p).up = true; }); st.moves++; this.end(st); return true;
        },
        stock: () => ({ok: false, msg: 'Pas de pioche dans ce jeu.'}),
        end(st) { st.won = st.piles.every(p => p.type === 'found' || !p.cards.length); },
        moves(st, def) { const fr = st.piles.filter(p => this.canPick(st, def, p.id)), out = []; fr.forEach((a, i) => fr.slice(i + 1).forEach(b => { if (this.pair(def, top(a), top(b))) out.push({set: [a.id, b.id], score: 10}); })); return out; },
        canStock: () => false,
    };

    /** un ensemble de cartes (jeux à paires) → vrai si enlevé */
    function trySet(st, refs) { const def = get(st.k); return def.mode && MODES[def.mode].trySet ? MODES[def.mode].trySet(st, def, refs) : false; }
    const isMulti = k => !!(get(k)?.mode && MODES[get(k).mode].multi);
    /** plus aucun coup possible (ni pioche) : la partie est bloquée */
    function stuck(st) { if (st.won) return false; if (st.lost) return true; return !hint(st); }

    root.LCNDA_PATIENCES = {GAMES, FAMILIES, get, norm, deal, canPick, canDrop, move, tap, stock, trySet, isMulti, autoAll, hint, legalMoves, stuck, counts, rng, red, top, U};
})();
