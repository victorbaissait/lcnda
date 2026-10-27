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
     *  decks 1 | 2 · suits 4 | 2 | 1 (araignées) · tab {n, deal, down, build, move, empty, wrap, grid}
     *  found {base: 1 | 'first' | rang, wrap, out (rangs posés d'avance), spider} · stock {to: waste | tab | tab3 | shuffle | none, draw, redeals, needFull}
     *  cells, cellsFill · reserve {n, kind: 'canfield' | 'fan', open} · kingsBottom
     *  build : alt (couleur alternée) · suit (même couleur… de carte) · any · color (même teinte rouge/noire) · notown (autre couleur de carte) · suitud (même couleur, + ou − 1)
     *  move : seq (une suite bien construite) · one (une carte, ou une suite si les cases libres le permettent) · any (tout groupe visible) · suitseq (une suite dans la même couleur)
     *  empty : any · king · none · reserve (rempli tout seul par la réserve) */
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
        {k: 'blackhole', fam: 'pairs', name: 'Le trou noir', diff: 3, mode: 'blackhole', desc: '17 éventails de 3 autour du trou : envoie dans le trou une carte juste au-dessus ou au-dessous de la dernière avalée.'},
        {k: 'pyramid', fam: 'pairs', name: 'La pyramide', diff: 4, mode: 'pyramid', desc: 'Enlève les paires qui font 13 (Valet 11, Dame 12 ; un Roi s’en va seul). Une carte se prend quand plus rien ne la couvre. La pioche ne passe qu’une fois.'},
        {k: 'pyramid3', fam: 'pairs', name: 'La pyramide en 3 passes', diff: 3, mode: 'pyramid', redeals: 2, desc: 'La pyramide, et la pioche repasse deux fois.'},
        {k: 'acesup', fam: 'pairs', name: 'As en haut', diff: 3, mode: 'acesup', desc: '4 colonnes : enlève une carte quand une autre colonne montre une carte plus forte de la même couleur de carte (l’As est le plus fort). Gagné s’il ne reste que les 4 As.'},
        {k: 'clock', fam: 'pairs', name: 'L’horloge', diff: 1, mode: 'clock', desc: '13 tas comme les heures d’une horloge (le Roi au centre) : chaque carte retournée va à son heure. Gagné si tout est retourné avant le 4ᵉ Roi. Un jeu de pure chance, pour se détendre.'},
        {k: 'montecarlo', fam: 'pairs', name: 'Monte-Carlo', diff: 2, mode: 'montecarlo', desc: 'Une grille de 5 × 5 : enlève deux cartes de même valeur qui se touchent (même en diagonale), puis tasse la grille.'},
        {k: 'elevens', fam: 'pairs', name: 'Onze', diff: 2, mode: 'sum', sum: 11, grid: [3, 3], faces: true, desc: 'Une grille de 9 cartes : enlève deux cartes qui font 11, ou un Valet, une Dame et un Roi ensemble.'},
        {k: 'quatorze', fam: 'pairs', name: 'Quatorze', diff: 2, mode: 'sum', sum: 14, grid: [5, 5], desc: 'Une grille de 25 cartes : enlève deux cartes qui font 14 (Valet 11, Dame 12, Roi 13).'},
        {k: 'dix', fam: 'pairs', name: 'Dix', diff: 2, mode: 'sum', sum: 10, grid: [3, 4], faces: 'four', desc: 'Une grille de 12 cartes : enlève deux cartes qui font 10, ou quatre figures de même valeur (4 Valets, 4 Dames, 4 Rois ou quatre 10).'},
        {k: 'accordion', fam: 'pairs', name: 'L’accordéon', diff: 5, mode: 'accordion', desc: 'Toutes les cartes en ligne : pose un tas sur son voisin de gauche, ou sur le 3ᵉ à gauche, s’ils ont la même valeur ou la même couleur de carte. Gagné s’il ne reste qu’un tas.'},
        {k: 'calculation', fam: 'pairs', name: 'Le calcul', diff: 4, mode: 'calc', desc: 'Quatre fondations montent de 1 en 1, de 2 en 2, de 3 en 3 et de 4 en 4. Chaque carte piochée va sur une fondation ou sur l’un des 4 tas d’attente.'},
    ];
    const BY = new Map(GAMES.map(g => [g.k, g]));
    /** les réglages complets d'un jeu (valeurs par défaut) */
    function norm(def) {
        const n = def.tab?.n || 7;
        return {...def, decks: def.decks || 1, suits: def.suits || 4, cells: def.cells || 0, cellsFill: def.cellsFill || 0, reserve: def.reserve || null, kingsBottom: !!def.kingsBottom,
            tab: {n, deal: kl(n), down: 'klondike', build: 'alt', move: 'seq', empty: 'king', wrap: false, grid: 0, ...(def.tab || {})},
            found: {base: 1, wrap: false, out: [], spider: false, ...(def.found || {})},
            stock: {to: 'waste', draw: 1, redeals: ALL, needFull: false, ...(def.stock || {})}};
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
        const nf = 4 * D.decks;
        // la rangée du haut : pioche, défausse, cases libres … fondations à droite
        const left = [];
        if (D.stock.to !== 'none') left.push('stock');
        if (D.stock.to === 'waste') left.push('waste');
        for (let c = 0; c < D.cells; c++) left.push('cell');
        const tabX0 = D.reserve?.kind === 'canfield' ? U * 1.2 : 0;
        const tabCols = D.tab.grid || D.tab.n, tabW = tabX0 + tabCols * U * (D.tab.grid ? 1.75 : 1);
        const width = Math.max(tabW, (left.length + nf) * U + (left.length ? U * 0.4 : 0));
        st.width = width;
        let lx = 0;
        left.forEach((t, j) => {
            if (t === 'stock') addPile(st, 'stock', 'stock', lx, 0);
            if (t === 'waste') addPile(st, 'waste', 'waste', lx, 0, D.stock.draw > 1 ? 'right3' : 'stack');
            if (t === 'cell') addPile(st, 'c' + j, 'cell', lx, 0);
            lx += t === 'waste' && D.stock.draw > 1 ? U * 1.6 : U;
        });
        for (let f = 0; f < nf; f++) addPile(st, 'f' + f, 'found', width - (nf - f) * U + (U - 1), 0);
        // posés d'avance (As, ou 2 pour l'entrepôt)
        let fi = 0;
        (D.found.out || []).forEach(r => { const out = deck.filter(c => c.r === r); deck = deck.filter(c => c.r !== r); out.forEach(c => { c.up = true; const id = 'f' + (fi++); st.piles.find(p => p.id === id)?.cards.push(c); }); }); // (le numéro avancé une fois par carte, pas à chaque pile essayée)
        if (D.found.out?.length) st.base = D.found.out[0];
        else if (typeof D.found.base === 'number') st.base = D.found.base;
        // la réserve
        const tabY = 1.3;
        if (D.reserve) {
            const n = D.reserve.n, cards = deck.splice(0, n);
            if (D.reserve.kind === 'canfield') { const p = addPile(st, 'r', 'reserve', 0, tabY, D.reserve.open ? 'down' : 'stack'); cards.forEach((c, j) => { c.up = !!D.reserve.open || j === n - 1; p.cards.push(c); }); }
            else { const p = addPile(st, 'r', 'reserve', lx + (D.stock.to === 'none' && !D.cells ? 0 : U * 0.3), 0, 'right', {any: true}); cards.forEach(c => { c.up = true; p.cards.push(c); }); }
        }
        // Canfield : la première fondation donne la carte de départ
        if (D.found.base === 'first') { const c = deck.shift(); c.up = true; st.piles.find(p => p.id === 'f0').cards.push(c); st.base = c.r; }
        // le tableau
        const tabs = [];
        for (let t = 0; t < D.tab.n; t++) {
            const g = D.tab.grid, x = g ? tabX0 + (t % g) * U * 1.75 : tabX0 + t * U, y = g ? tabY + Math.floor(t / g) * 1.6 : tabY;
            tabs.push(addPile(st, 't' + t, 'tab', x, y, g ? 'right' : 'down'));
        }
        if (D.tab.deal === 'rest') {
            const cellCards = deck.splice(0, D.cellsFill);
            cellCards.forEach((c, j) => { c.up = true; st.piles.find(p => p.id === 'c' + j).cards.push(c); });
            let t = 0; while (deck.length) { const c = deck.shift(); c.up = true; tabs[t % D.tab.n].cards.push(c); t++; }
        } else {
            const counts = D.tab.deal, down = D.tab.down === 'klondike' ? counts.map(n => n - 1) : D.tab.down === 'none' ? counts.map(() => 0) : D.tab.down;
            // en ligne, comme on distribue à la main
            const maxN = Math.max(...counts);
            for (let row = 0; row < maxN; row++) tabs.forEach((p, t) => { if (row < counts[t] && deck.length) { const c = deck.shift(); c.up = row >= (down[t] || 0); p.cards.push(c); } });
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
        const b = D.tab.build, d1 = c.r === t.r - 1 || (D.tab.wrap && t.r === 1 && c.r === 13);
        if (b === 'alt') return d1 && red(t) !== red(c);
        if (b === 'suit') return d1 && t.s === c.s;
        if (b === 'any') return d1;
        if (b === 'color') return d1 && red(t) === red(c);
        if (b === 'notown') return d1 && t.s !== c.s;
        if (b === 'suitud') return t.s === c.s && (Math.abs(c.r - t.r) === 1 || (D.tab.wrap && Math.abs(c.r - t.r) === 12));
        return false;
    }
    const runOk = (D, run, rule) => run.every(c => c.up) && run.every((c, i) => !i || (rule === 'suit' ? (c.s === run[i - 1].s && c.r === run[i - 1].r - 1) : fits(D, run[i - 1], c)));
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
        if (m === 'one') return runOk(D, run) && run.length <= maxRun(st, D, false);
        return false;
    }
    const step = (r, wrap) => (r === 13 ? (wrap ? 1 : 14) : r + 1);
    function canDrop(st, cards, toId, fromId) {
        const def = get(st.k); if (def.mode) return MODES[def.mode].canDrop(st, def, cards, toId, fromId);
        const D = norm(def), to = pileOf(st, toId); if (!to || !cards.length || toId === fromId) return false;
        const c = cards[0], t = top(to);
        if (to.type === 'found') {
            if (cards.length !== 1 || D.found.spider) return false;
            if (!t) return c.r === st.base;
            return c.s === t.s && c.r === step(t.r, D.found.wrap) && to.cards.length < 13;
        }
        if (to.type === 'cell') return cards.length === 1 && !t;
        if (to.type !== 'tab') return false;
        if (D.tab.move === 'one' && cards.length > 1 && cards.length > maxRun(st, D, !t)) return false;
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
        const r = pileOf(st, 'r'); if (r && r.cards.length && !r.any && !top(r).up) top(r).up = true;
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
            const all = tabs.flatMap(p => p.cards.splice(0)); const R = rng(st.seed + ':' + st.redeals);
            const mixed = shuffle(all, R); let t = 0;
            while (mixed.length) { const c = mixed.shift(); c.up = true; tabs[Math.floor(t / 3)]?.cards.push(c) ?? tabs[tabs.length - 1].cards.push(c); t++; }
            st.redeals--; st.moves++; return {ok: true, msg: 'Ramassé, mélangé et redistribué.'};
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
            const list = D.stock.to === 'tab3' ? tabs.slice(0, 3) : tabs;
            list.forEach(p => { if (s.cards.length) { const c = s.cards.pop(); c.up = true; p.cards.push(c); } });
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
        if (s && (s.cards.length || (st.redeals > 0 && pileOf(st, 'waste')?.cards.length))) return {stock: true};
        if (def.stock?.to === 'shuffle' && st.redeals > 0) return {stock: true};
        if (def.mode && MODES[def.mode].canStock?.(st, def)) return {stock: true};
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
            const st = mkState(def.k, seed), d = fullDeck(seed); st.width = 7 * U;
            for (let t = 0; t < 7; t++) { const p = addPile(st, 't' + t, 'tab', t * U, 0, 'down'); for (let j = 0; j < 5; j++) { const c = d.shift(); c.up = true; p.cards.push(c); } }
            const s = addPile(st, 'stock', 'stock', 0, 3.2), w = addPile(st, 'waste', 'found', U * 1.3, 3.2);
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
        ok(st, def, c) { return near(c, top(pileOf(st, 'waste')), true); },
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
            const st = mkState(def.k, seed), d = fullDeck(seed), H = 0.5; st.width = 7 * U; st.redeals = def.redeals || 0; st.gone = 0;
            for (let r = 0; r < 7; r++) for (let j = 0; j <= r; j++) { const p = addPile(st, `p${r}_${j}`, 'slot', (3 - r / 2 + j) * U, r * H, 'stack', {cover: r < 6 ? [`p${r + 1}_${j}`, `p${r + 1}_${j + 1}`] : []}); const c = d.shift(); c.up = true; p.cards.push(c); }
            const s = addPile(st, 'stock', 'stock', 0, 6 * H + 1.5), w = addPile(st, 'waste', 'waste', U * 1.3, 6 * H + 1.5);
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
        stock(st) {
            const s = pileOf(st, 'stock'), w = pileOf(st, 'waste');
            if (s.cards.length) { const c = s.cards.pop(); c.up = true; w.cards.push(c); st.moves++; return {ok: true}; }
            if (st.redeals > 0 && w.cards.length) { while (w.cards.length) { const c = w.cards.pop(); c.up = false; s.cards.push(c); } st.redeals--; return {ok: true}; }
            return {ok: false, msg: 'La pioche ne repasse plus.'};
        },
        end(st) { st.won = st.piles.filter(p => p.type === 'slot').every(p => !p.cards.length); },
        moves(st, def) {
            const fr = st.piles.filter(p => this.free(st, p.id)), out = [];
            fr.forEach((a, i) => { if (top(a).r === 13) out.push({set: [a.id], score: 10}); fr.slice(i + 1).forEach(b => { if (val(top(a)) + val(top(b)) === 13) out.push({set: [a.id, b.id], score: 10}); }); });
            return out;
        },
        canStock: st => !!pileOf(st, 'stock').cards.length || (st.redeals > 0 && !!pileOf(st, 'waste').cards.length),
    };
    // ➕ Onze, Quatorze, Dix : une grille, des paires qui font un total (ou des figures), la pioche remplit les trous
    MODES.sum = {
        multi: true,
        deal(def, seed) {
            const st = mkState(def.k, seed), d = fullDeck(seed), [rows, cols] = def.grid; st.width = (cols + 1.4) * U; st.gone = 0;
            for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const p = addPile(st, `g${r}_${c}`, 'slot', c * U, r * 1.5); const x = d.shift(); x.up = true; p.cards.push(x); }
            const s = addPile(st, 'stock', 'stock', (cols + 0.4) * U, 0); d.forEach(c => s.cards.push(c)); addPile(st, 'out', 'found', (cols + 0.4) * U, 1.5); return st;
        },
        canPick: (st, def, pid) => { const p = pileOf(st, pid); return p?.type === 'slot' && !!p.cards.length; },
        canDrop: none, move: none,
        ok(def, cs) {
            const face = c => c.r >= 11;
            if (def.faces === true && cs.length === 3) return new Set(cs.map(c => c.r)).size === 3 && cs.every(face);
            if (def.faces === 'four' && cs.length === 4) return cs.every(c => c.r >= 10) && cs.every(c => c.r === cs[0].r);
            if (cs.length !== 2) return false;
            if (def.faces && cs.some(face)) return false;
            return cs[0].r + cs[1].r === def.sum;
        },
        trySet(st, def, refs) {
            const ps = [...new Set(refs)].map(id => pileOf(st, id)); if (ps.length !== refs.length || !ps.every(p => p?.type === 'slot' && p.cards.length)) return false;
            if (!this.ok(def, ps.map(top))) return false;
            const s = pileOf(st, 'stock'), out = pileOf(st, 'out');
            ps.forEach(p => { out.cards.push(p.cards.pop()); if (s.cards.length) { const c = s.cards.pop(); c.up = true; p.cards.push(c); } });
            st.moves++; st.won = !s.cards.length && st.piles.filter(p => p.type === 'slot').every(p => !p.cards.length); return true;
        },
        tap: () => false,
        stock: () => ({ok: false, msg: 'La pioche remplit la grille toute seule.'}),
        moves(st, def) {
            const fr = st.piles.filter(p => p.type === 'slot' && p.cards.length), out = [];
            fr.forEach((a, i) => fr.slice(i + 1).forEach(b => { if (this.ok(def, [top(a), top(b)])) out.push({set: [a.id, b.id], score: 10}); }));
            if (def.faces === true) { for (const a of fr) for (const b of fr) for (const c of fr) { if (a.id < b.id && b.id < c.id && this.ok(def, [top(a), top(b), top(c)])) out.push({set: [a.id, b.id, c.id], score: 10}); } }
            if (def.faces === 'four') { const by = {}; fr.forEach(p => { if (top(p).r >= 10) (by[top(p).r] = by[top(p).r] || []).push(p.id); }); Object.values(by).forEach(l => { if (l.length >= 4) out.push({set: l.slice(0, 4), score: 10}); }); }
            return out;
        },
        canStock: () => false,
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
        trySet(st, def, refs) {
            if (refs.length !== 2) return false; const [a, b] = refs.map(id => pileOf(st, id));
            if (!a?.cards.length || !b?.cards.length || !this.touch(a.id, b.id) || top(a).r !== top(b).r) return false;
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
        moves(st) { const fr = st.piles.filter(p => p.type === 'slot' && p.cards.length), out = []; fr.forEach((a, i) => fr.slice(i + 1).forEach(b => { if (this.touch(a.id, b.id) && top(a).r === top(b).r) out.push({set: [a.id, b.id], score: 10}); })); return out; },
        canStock(st) { const sl = st.piles.filter(p => p.type === 'slot'); const n = sl.filter(p => p.cards.length).length; return n < 25 && (pileOf(st, 'stock').cards.length > 0 || sl.some((p, i) => !p.cards.length && i < n)); },
    };
    // 🅰 As en haut
    const hi = c => (c.r === 1 ? 14 : c.r);
    MODES.acesup = {
        deal(def, seed) {
            const st = mkState(def.k, seed), d = fullDeck(seed); st.width = 6 * U;
            const s = addPile(st, 'stock', 'stock', 0, 0); for (let t = 0; t < 4; t++) addPile(st, 't' + t, 'tab', (1.3 + t) * U, 0, 'down'); addPile(st, 'out', 'found', 5.3 * U, 0);
            d.forEach(c => s.cards.push(c)); this.stock(st); st.moves = 0; return st;
        },
        canPick: (st, def, pid, idx) => { const p = pileOf(st, pid); return p?.type === 'tab' && idx === p.cards.length - 1; },
        canGo(st, p) { const c = top(p); return !!c && st.piles.some(q => q.type === 'tab' && q !== p && q.cards.length && top(q).s === c.s && hi(top(q)) > hi(c)); },
        canDrop(st, def, cards, toId, fromId) { const to = pileOf(st, toId), from = pileOf(st, fromId); if (!to || !from || cards.length !== 1) return false; if (to.id === 'out') return this.canGo(st, from); return to.type === 'tab' && !to.cards.length; },
        move(st, def, fromId, idx, toId) { const from = pileOf(st, fromId); if (!this.canPick(st, def, fromId, idx) || !this.canDrop(st, def, [top(from)], toId, fromId)) return false; pileOf(st, toId).cards.push(from.cards.pop()); st.moves++; this.end(st); return true; },
        tap(st, def, pid, idx) { const p = pileOf(st, pid); if (!p) return false; if (this.canGo(st, p)) return this.move(st, def, pid, idx, 'out'); const e = st.piles.find(q => q.type === 'tab' && !q.cards.length); return e && p.cards.length > 1 ? this.move(st, def, pid, idx, e.id) : false; },
        stock(st) { const s = pileOf(st, 'stock'); if (!s.cards.length) return {ok: false, msg: 'La pioche est vide.'}; st.piles.filter(p => p.type === 'tab').forEach(p => { if (s.cards.length) { const c = s.cards.pop(); c.up = true; p.cards.push(c); } }); st.moves++; this.end(st); return {ok: true}; },
        end(st) { const t = st.piles.filter(p => p.type === 'tab'); st.won = !pileOf(st, 'stock').cards.length && t.every(p => p.cards.length === 1 && p.cards[0].r === 1); },
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
        deal(def, seed) {
            const st = mkState(def.k, seed); let d = fullDeck(seed); st.width = 6 * U;
            const s = addPile(st, 'stock', 'stock', 0, 0), w = addPile(st, 'waste', 'waste', U, 0);
            for (let f = 0; f < 4; f++) { const c = d.find(x => x.r === f + 1); d = d.filter(x => x !== c); c.up = true; addPile(st, 'f' + f, 'found', (2.2 + f) * U, 0, 'stack', {by: f + 1}).cards.push(c); }
            for (let t = 0; t < 4; t++) addPile(st, 't' + t, 'tab', (2.2 + t) * U, 1.3, 'down');
            d.forEach(c => s.cards.push(c)); w.cards.push(Object.assign(s.cards.pop(), {up: true})); return st;
        },
        nextOf: (f) => { const t = top(f); return ((t.r - 1 + f.by) % 13) + 1; },
        canPick(st, def, pid, idx) { const p = pileOf(st, pid); return !!p && (p.type === 'waste' || p.type === 'tab') && idx === p.cards.length - 1; },
        canDrop(st, def, cards, toId, fromId) {
            const to = pileOf(st, toId), c = cards[0]; if (!to || cards.length !== 1) return false;
            if (to.type === 'found') return to.cards.length < 13 && c.r === this.nextOf(to);
            if (to.type === 'tab') return fromId === 'waste';
            return false;
        },
        move(st, def, fromId, idx, toId) { const from = pileOf(st, fromId); if (!this.canPick(st, def, fromId, idx) || !this.canDrop(st, def, [top(from)], toId, fromId)) return false; pileOf(st, toId).cards.push(from.cards.pop()); st.moves++; this.end(st); return true; },
        tap(st, def, pid, idx) { const p = pileOf(st, pid); const f = p && st.piles.find(q => q.type === 'found' && this.canDrop(st, def, [top(p)], q.id, pid)); return f ? this.move(st, def, pid, idx, f.id) : false; },
        stock(st) { const s = pileOf(st, 'stock'), w = pileOf(st, 'waste'); if (w.cards.length) return {ok: false, msg: 'Place d’abord la carte piochée (sur une fondation ou un tas d’attente).'}; if (!s.cards.length) return {ok: false, msg: 'La pioche est vide.'}; const c = s.cards.pop(); c.up = true; w.cards.push(c); st.moves++; return {ok: true}; },
        end(st) { st.won = st.piles.filter(p => p.type === 'found').every(p => p.cards.length === 13); },
        moves(st, def) { const out = []; st.piles.filter(p => (p.type === 'waste' || p.type === 'tab') && p.cards.length).forEach(p => st.piles.filter(q => q.type === 'found').forEach(q => { if (this.canDrop(st, def, [top(p)], q.id, p.id)) out.push({from: p.id, idx: p.cards.length - 1, to: q.id, score: 10}); })); return out; },
        canStock: st => !pileOf(st, 'waste').cards.length && !!pileOf(st, 'stock').cards.length,
    };

    /** un ensemble de cartes (jeux à paires) → vrai si enlevé */
    function trySet(st, refs) { const def = get(st.k); return def.mode && MODES[def.mode].trySet ? MODES[def.mode].trySet(st, def, refs) : false; }
    const isMulti = k => !!(get(k)?.mode && MODES[get(k).mode].multi);
    /** plus aucun coup possible (ni pioche) : la partie est bloquée */
    function stuck(st) { if (st.won) return false; if (st.lost) return true; return !hint(st); }

    root.LCNDA_PATIENCES = {GAMES, FAMILIES, get, norm, deal, canPick, canDrop, move, tap, stock, trySet, isMulti, autoAll, hint, legalMoves, stuck, counts, rng, red, top, U};
})();
