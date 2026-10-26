/* LCNDA — ☢ Le bunker : le moteur (sans écran, testable avec node : tests/test-bunker.js).
 * Le temps passe par pas de 10 minutes de jeu (step). Chaque habitant a 5 besoins (100 = comblé, 0 = au bout du rouleau) et une barre de vie ;
 * il va seul boire, manger, dormir, se laver, aux toilettes, puis reprend son travail (creuser un étage, construire à l'atelier).
 * Dehors : une ville tirée au hasard (lieux, ressources qui reviennent chaque jour, outils et plans à trouver) ; la radio donne les nouvelles
 * de ceux qui y sont partis, s'il y a de l'électricité (l'essence du groupe électrogène). Il pleut parfois : les bidons du toit se remplissent.
 *
 * Et aussi (inspiré des jeux du genre, à notre façon, avec l'arbre) :
 *  - compétences tirées du métier et de l'époque de chaque ancêtre (skillsOf) ;
 *  - eau de pluie à filtrer (boire de l'eau sale peut donner la fièvre), maladies, blessures, remèdes de grand-mère (plantes du potager) ;
 *  - le moral (6ᵉ jauge) : jeux, musique, histoires du soir (la Mémoire familiale), disputes, liens de famille ; l'air du conduit d'aération ;
 *  - visiteurs à la trappe (marchand, voyageur = un ancêtre de l'arbre, pillards) ; porte renforcée, pièges, tour de garde ;
 *  - le coffre de famille (3 objets de famille de la base), la maison natale d'un ancêtre en ville, des lettres retrouvées ;
 *  - les saisons (hiver froid : poêle à bois ; été sec), l'électricité sans essence (dynamo à pédales, panneau solaire, éolienne) ;
 *  - une naissance au bunker (l'arbre du bunker, à part de la vraie base), et des chiffres pour la gazette de fin de partie.
 */
(() => {
    'use strict';
    const root = typeof window !== 'undefined' ? window : globalThis;

    /* ═════════ Les données ═════════ */
    const NEEDS = [['soif', '💧', 'Soif'], ['faim', '🍞', 'Faim'], ['sommeil', '💤', 'Sommeil'], ['hygiene', '🧼', 'Hygiène'], ['vessie', '🚽', 'Toilettes']];
    /** ce qu'un besoin perd par heure de jeu (éveillé, au bunker) */
    const DECAY = {soif: 4.2, faim: 2.6, sommeil: 3.2, hygiene: 1.6, vessie: 6};
    const RES = [['eau', '💧', 'Eau potable', 'L'], ['eausale', '🪣', 'Eau de pluie (à filtrer)', 'L'], ['plantes', '🌿', 'Plantes', ''], ['nourriture', '🥫', 'Nourriture', 'rations'], ['essence', '⛽', 'Essence', 'L'], ['bois', '🪵', 'Bois', ''], ['metal', '🔩', 'Métal', ''], ['pieces', '⚙️', 'Pièces', ''], ['tissu', '🧵', 'Tissu', ''], ['medic', '💊', 'Médicaments', ''],
        // les composants (le plus souvent tirés du bric-à-brac qu'on démonte)
        ['clous', '📌', 'Clous et vis', ''], ['corde', '🪢', 'Corde', ''], ['colle', '🧪', 'Colle', ''], ['verre', '🪟', 'Verre', ''], ['plastique', '🧴', 'Plastique', ''], ['caoutchouc', '🛞', 'Caoutchouc', ''],
        ['cuivre', '🧶', 'Fil de cuivre', ''], ['electro', '🔌', 'Composants électroniques', ''], ['piles', '🔋', 'Piles et batteries', ''], ['charbon', '⚫', 'Charbon', ''],
        // les chaînes de fabrication (option des réglages) : plantes → fil → tissu → vêtements ; blé → farine → pain
        ['fil', '🧵', 'Fil à tisser', ''], ['ble', '🌾', 'Blé', ''], ['farine', '🥣', 'Farine', ''], ['vetements', '🧥', 'Vêtements chauds', '']];
    const CHAIN_RES = ['fil', 'ble', 'farine', 'vetements'];
    /** le bric-à-brac : des objets qui ne servent à rien tels quels, mais qu'on démonte à l'établi pour en tirer des composants → [icône, nom, {ressource: n}, heures] */
    const JUNK = {
        grillepain: ['🍞', 'Grille-pain cassé', {cuivre: 2, metal: 2, electro: 1}, 1], radiocassee: ['📻', 'Vieille radio en panne', {electro: 2, cuivre: 1, plastique: 1, piles: 1}, 1.5],
        tele: ['📺', 'Télévision cassée', {verre: 2, electro: 3, cuivre: 2, plastique: 2}, 2.5], ordinateur: ['💻', 'Ordinateur hors d’usage', {electro: 4, cuivre: 2, plastique: 2, metal: 1}, 2.5],
        telephone: ['📱', 'Vieux téléphone', {electro: 2, piles: 1, plastique: 1}, 1], aspirateur: ['🧹', 'Aspirateur', {plastique: 3, cuivre: 2, electro: 1, caoutchouc: 1}, 1.5],
        lampe: ['💡', 'Lampe de bureau', {cuivre: 1, electro: 1, verre: 1, metal: 1}, 1], cables: ['➰', 'Rouleau de câbles abîmés', {cuivre: 3, plastique: 1}, 0.5],
        batterieauto: ['🔋', 'Batterie de voiture usée', {piles: 3, metal: 1, plastique: 1}, 1], velorouille: ['🚲', 'Vélo rouillé', {metal: 4, caoutchouc: 2, pieces: 2}, 2],
        pneu: ['🛞', 'Pneu crevé', {caoutchouc: 3}, 1], chaise: ['🪑', 'Chaise cassée', {bois: 3, clous: 2}, 1], palette: ['🟫', 'Palette en bois', {bois: 5, clous: 3}, 1],
        matelas: ['🛏️', 'Vieux matelas', {tissu: 4, metal: 1}, 1.5], rideaux: ['🪟', 'Rideaux déchirés', {tissu: 3, corde: 1}, 0.5], parapluie: ['☂️', 'Parapluie cassé', {tissu: 1, metal: 1}, 0.5],
        bouteilles: ['🍾', 'Caisse de bouteilles vides', {verre: 3}, 0.5], bocaux: ['🫙', 'Bocaux ébréchés', {verre: 2, metal: 1}, 0.5], jouets: ['🧸', 'Jouets en plastique', {plastique: 2, tissu: 1}, 0.5],
        casserole: ['🍳', 'Casserole trouée', {metal: 2}, 0.5], conserves: ['🥫', 'Boîtes de conserve vides', {metal: 1}, 0.25], seau: ['🪣', 'Seau percé', {plastique: 2}, 0.25],
        machinecoudre: ['🧵', 'Machine à coudre bloquée', {metal: 3, pieces: 2, corde: 1}, 2], montre: ['⌚', 'Montre arrêtée', {pieces: 1, verre: 1}, 0.5], reveil: ['⏰', 'Réveil cassé', {pieces: 1, piles: 1, plastique: 1}, 0.5],
        tuyau: ['🌀', 'Tuyau d’arrosage fendu', {caoutchouc: 2, plastique: 1}, 0.5], filet: ['🎣', 'Filet de pêche emmêlé', {corde: 3}, 0.5], tuiles: ['🧱', 'Tuiles et gravats', {metal: 1, clous: 1}, 0.5],
        sacsable: ['👜', 'Vieux cartable', {tissu: 2, plastique: 1}, 0.5], pots: ['🪴', 'Pots de colle à moitié secs', {colle: 2}, 0.25], vis: ['🔩', 'Boîte de vis mélangées', {clous: 5}, 0.25],
        barbecue: ['🔥', 'Barbecue rouillé', {metal: 3, charbon: 2}, 1], frigo: ['🧊', 'Réfrigérateur mort', {metal: 4, cuivre: 2, plastique: 2, electro: 1}, 3], sechecheveux: ['💨', 'Sèche-cheveux grillé', {cuivre: 2, plastique: 1, electro: 1}, 0.5],
        guitarecassee: ['🎸', 'Guitare sans manche', {bois: 2, corde: 1, metal: 1}, 0.5], panneau: ['🚧', 'Panneau de signalisation', {metal: 3}, 0.5], fenetre: ['🪟', 'Fenêtre arrachée', {verre: 3, bois: 2}, 1],
    };
    const JUNK_KEYS = Object.keys(JUNK), JUNK_CAP = 20;
    const RES_KEYS = RES.map(r => r[0]);
    const BASE_CAP = 40;
    /** les objets : cost (ressources), h (heures de travail), base (plan connu dès le départ), tool (outil obligatoire), cap (place en plus) */
    const ITEMS = {
        radio: {ico: '📻', name: 'Radio', fixed: true, desc: 'Parler avec ceux qui sont partis en ville (il faut de l’électricité).'},
        generateur: {ico: '⚡', name: 'Groupe électrogène', fixed: true, desc: 'Fait l’électricité avec l’essence (¼ L par heure).'},
        atelier: {ico: '🛠️', name: 'Atelier', fixed: true, desc: 'On y construit les objets dont on a le plan (il faut de l’électricité).'},
        toilettes: {ico: '🚽', name: 'Toilettes', cost: {bois: 4, metal: 2}, h: 3, base: true, desc: 'Sans toilettes, on se soulage dans un coin : l’hygiène en prend un coup.'},
        douche: {ico: '🚿', name: 'Douche', cost: {metal: 4, pieces: 1}, h: 4, base: true, desc: 'Une douche : 3 L d’eau et de l’électricité pour la pompe.'},
        gardemanger: {ico: '🥫', name: 'Garde-manger', cost: {bois: 6}, h: 3, base: true, cap: {nourriture: 30}, desc: '+30 rations de place.'},
        lit: {ico: '🛏️', name: 'Lit', cost: {bois: 5, tissu: 3}, h: 3, base: true, desc: 'On dort deux fois mieux dans un lit (un dormeur par lit).'},
        etageres: {ico: '🗄️', name: 'Étagères', cost: {bois: 4}, h: 2, base: true, cap: {all: 10}, desc: '+10 de place pour chaque réserve.'},
        stockage: {ico: '📦', name: 'Stockage', cost: {bois: 4, metal: 4}, h: 4, base: true, cap: {all: 25}, desc: '+25 de place pour chaque réserve.'},
        cuve: {ico: '💧', name: 'Cuve d’eau de pluie', cost: {bois: 2, metal: 3}, h: 3, base: true, cap: {eausale: 30}, rain: 2, desc: '+30 L de place pour l’eau de pluie ; quand il pleut, elle se remplit toute seule (+2 L par heure). À passer au filtre avant de la boire.'},
        citerne: {ico: '🛢️', name: 'Citerne', cost: {metal: 6, pieces: 1}, h: 4, tool: 'cle', cap: {eau: 60}, desc: '+60 L d’eau de place.'},
        filtre: {ico: '⚗️', name: 'Filtre à eau', cost: {bois: 2, tissu: 2}, h: 2, base: true, desc: 'Sable, charbon de bois et tissu : rend l’eau de pluie potable (3 L par heure). Il faut 1 tissu tous les 30 L pour le nettoyer.'},
        jeux: {ico: '🎲', name: 'Jeux de société', cost: {bois: 3, tissu: 1}, h: 2, base: true, fun: 1, desc: 'Quand on n’a rien à faire, on joue : le moral remonte.'},
        porte: {ico: '🚪', name: 'Porte renforcée', cost: {metal: 8, pieces: 2}, h: 5, base: true, defense: 3, desc: 'Les pillards ont bien plus de mal à entrer.'},
        pieges: {ico: '🪤', name: 'Pièges dans l’entrée', cost: {bois: 3, metal: 2}, h: 2, base: true, defense: 2, desc: 'Des surprises pour qui force la trappe.'},
        poele: {ico: '🔥', name: 'Poêle à bois', cost: {metal: 4, pieces: 1}, h: 3, base: true, desc: 'L’hiver, il chauffe le bunker (1 bois toutes les 4 heures). Sans lui, on a froid : on dort mal et le moral baisse.'},
        dynamo: {ico: '🚲', name: 'Dynamo à pédales', cost: {metal: 3, pieces: 2}, h: 3, base: true, desc: 'Quelqu’un pédale (travail « Pédaler ») : de l’électricité sans essence, mais on se fatigue.'},
        berceau: {ico: '👶', name: 'Berceau', cost: {bois: 4, tissu: 2}, h: 2, base: true, desc: 'Pour accueillir un bébé (sans berceau, pas de naissance au bunker).'},
        phono: {ico: '🎶', name: 'Tourne-disque', cost: {metal: 2, pieces: 2, cuivre: 1, electro: 1}, h: 3, fun: 2, power: true, desc: 'De la musique (il faut de l’électricité) : le moral remonte deux fois plus vite qu’avec les jeux.'},
        solaire: {ico: '☀️', name: 'Panneau solaire', cost: {metal: 4, pieces: 2, verre: 3, cuivre: 2, electro: 1}, h: 4, tool: 'cle', desc: 'De l’électricité le jour, quand il ne pleut pas.'},
        eolienne: {ico: '🌬️', name: 'Petite éolienne', cost: {metal: 6, pieces: 3, cuivre: 2}, h: 5, tool: 'cle', desc: 'De l’électricité quand il y a du vent.'},
        recuperateur: {ico: '🌧️', name: 'Récupérateur de pluie', cost: {metal: 4, pieces: 2}, h: 4, tool: 'cle', desc: 'La pluie remplit l’eau trois fois plus vite (bidons du toit et cuves).'},
        potager: {ico: '🌱', name: 'Potager sous lampe', cost: {bois: 4, pieces: 2}, h: 5, desc: 'Une ration toutes les 8 h (deux avec un bon jardinier), avec 1 L d’eau et de l’électricité ; et des plantes pour les remèdes.'},
        infirmerie: {ico: '🩺', name: 'Infirmerie', cost: {bois: 3, tissu: 4, medic: 2}, h: 4, desc: 'La santé remonte deux fois plus vite.'},
        econome: {ico: '🔋', name: 'Groupe économe', cost: {metal: 6, pieces: 4}, h: 6, tool: 'cle', desc: 'L’électricité coûte moitié moins d’essence.'},
        /* ── les plans en plus : chacun sert à quelque chose (les effets sont lus par le moteur : fun, prod, store, burnK, buildK, recyK, travelK, carry, healK, airK, aura, heat, junkCap, talkie, map) ── */
        etabli: {ico: '🪚', name: 'Établi', cost: {bois: 6, clous: 4}, h: 3, base: true, recyK: 2, desc: 'Pour démonter le bric-à-brac : deux fois plus vite, et sans abîmer les pièces (un composant de plus, parfois).'},
        debarras: {ico: '🧺', name: 'Débarras', cost: {bois: 4, clous: 2}, h: 2, base: true, junkCap: 20, desc: '+20 places pour le bric-à-brac à démonter.'},
        etagerecomp: {ico: '🧰', name: 'Boîtes à composants', cost: {bois: 3, plastique: 2}, h: 2, base: true, cap: {clous: 30, corde: 20, colle: 20, verre: 20, plastique: 30, caoutchouc: 20, cuivre: 30, electro: 30, piles: 20, charbon: 30}, desc: 'De la place en plus pour tous les composants.'},
        barricade: {ico: '🪵', name: 'Barricade', cost: {bois: 6, clous: 4}, h: 2, base: true, defense: 2, desc: 'Des planches clouées en travers de l’entrée.'},
        lavabo: {ico: '🚰', name: 'Lavabo', cost: {metal: 2, plastique: 2, caoutchouc: 1}, h: 2, base: true, aura: {hygiene: 0.6}, desc: 'Une toilette rapide de temps en temps : l’hygiène baisse moins vite (et un peu d’eau de pluie).'},
        bibliotheque: {ico: '📚', name: 'Coin lecture', cost: {bois: 5, clous: 2, tissu: 1}, h: 2, base: true, fun: 1.4, desc: 'Des livres et un fauteuil : le moral remonte, sans électricité.'},
        arbremur: {ico: '🌳', name: 'L’arbre de famille au mur', cost: {bois: 2, tissu: 1, colle: 1}, h: 2, base: true, aura: {mood: 0.25}, desc: 'L’arbre peint au mur, avec les noms de tous : le moral s’use moins vite.'},
        compost: {ico: '🪱', name: 'Bac à compost', cost: {bois: 3, plastique: 1}, h: 2, base: true, prod: {every: 12, in: {}, out: {plantes: 1}}, desc: 'Les épluchures deviennent du terreau : 1 plante toutes les 12 h.'},
        guitare: {ico: '🎸', name: 'Guitare', cost: {bois: 3, corde: 2, colle: 1}, h: 2, fun: 1.8, desc: 'Quelqu’un joue le soir : le moral remonte presque autant qu’avec la musique, sans électricité.'},
        pingpong: {ico: '🏓', name: 'Table de ping-pong', cost: {bois: 6, clous: 3, plastique: 1}, h: 3, fun: 1.6, desc: 'On se défoule : le moral remonte.'},
        television: {ico: '📺', name: 'Télévision et cassettes', cost: {electro: 3, verre: 2, cuivre: 2, plastique: 2}, h: 4, fun: 2.6, power: true, desc: 'Des films d’avant (il faut de l’électricité) : le moral remonte très vite.'},
        aquarium: {ico: '🐠', name: 'Aquarium', cost: {verre: 4, colle: 2, electro: 1}, h: 3, power: true, aura: {mood: 0.3}, desc: 'Regarder les poissons calme tout le monde (il faut de l’électricité pour la pompe).'},
        batteries: {ico: '🔋', name: 'Banc de batteries', cost: {piles: 6, cuivre: 3, metal: 2}, h: 4, tool: 'cle', store: 8, desc: 'Garde l’électricité en réserve (8 h) : quand il n’y a ni soleil, ni vent, ni essence, le bunker reste éclairé.'},
        ampoules: {ico: '💡', name: 'Ampoules économes', cost: {verre: 2, cuivre: 2, electro: 1}, h: 2, burnK: 0.75, desc: 'L’électricité coûte un quart d’essence en moins.'},
        chaudiere: {ico: '♨️', name: 'Chaudière à charbon', cost: {metal: 6, pieces: 2, cuivre: 2}, h: 4, heat: 'charbon', desc: 'L’hiver, elle chauffe avec du charbon (¼ toutes les heures) quand le poêle n’a plus de bois.'},
        ventilateur: {ico: '🌀', name: 'Ventilateur du conduit', cost: {metal: 2, cuivre: 2, electro: 1, plastique: 1}, h: 3, power: true, airK: 0.6, desc: 'L’air s’encrasse moins vite (il faut de l’électricité).'},
        purificateur: {ico: '🫧', name: 'Filtre à air au charbon', cost: {plastique: 2, tissu: 2, charbon: 3, electro: 1}, h: 3, power: true, airK: 0.4, desc: 'L’air reste bon bien plus longtemps (il faut de l’électricité).'},
        serre: {ico: '🪴', name: 'Serre sous verrière', cost: {verre: 6, bois: 4, colle: 1}, h: 5, prod: {every: 12, in: {eausale: 1}, out: {nourriture: 1, plantes: 1}, day: true, skill: 'cultiver'}, desc: 'Sous le puits de lumière : 1 ration et 1 plante toutes les 12 h, sans électricité (de l’eau de pluie pour arroser).'},
        champignons: {ico: '🍄', name: 'Champignonnière', cost: {bois: 4, plastique: 2}, h: 3, prod: {every: 12, in: {bois: 0.5}, out: {nourriture: 1}, skill: 'cultiver'}, desc: 'Dans le noir, sur du bois mouillé : 1 ration toutes les 12 h, sans électricité.'},
        clapier: {ico: '🐇', name: 'Clapier à lapins', cost: {bois: 5, clous: 3, metal: 1}, h: 3, prod: {every: 24, in: {plantes: 1}, out: {nourriture: 3}, skill: 'cultiver'}, desc: '3 rations par jour s’il y a 1 plante pour les nourrir.'},
        poulailler: {ico: '🐔', name: 'Poulailler', cost: {bois: 4, clous: 2, corde: 1}, h: 3, prod: {every: 12, in: {plantes: 0.5}, out: {nourriture: 1}, skill: 'cultiver'}, desc: 'Des œufs : 1 ration toutes les 12 h (un peu de plantes pour le grain).'},
        alambic: {ico: '⚗️', name: 'Bouilleur d’eau', cost: {metal: 4, cuivre: 3, verre: 1}, h: 3, prod: {every: 1, in: {eausale: 2, bois: 0.1}, out: {eau: 2}}, desc: 'Fait bouillir l’eau de pluie au feu de bois : 2 L d’eau potable par heure, sans tissu ni électricité.'},
        labo: {ico: '🧪', name: 'Petit laboratoire', cost: {verre: 4, colle: 1, electro: 2, metal: 2}, h: 4, power: true, prod: {every: 12, in: {plantes: 2}, out: {medic: 1}, skill: 'soigner'}, desc: 'Des plantes, on tire des médicaments : 1 toutes les 12 h (il faut de l’électricité).'},
        fourneau: {ico: '🍲', name: 'Fourneau de cuisine', cost: {metal: 4, pieces: 1, verre: 1}, h: 3, prod: {every: 24, in: {plantes: 1}, out: {nourriture: 2}, skill: 'cuisiner'}, desc: 'Une bonne cuisine fait durer les réserves : 2 rations de plus par jour avec 1 plante (deux fois plus avec un cuisinier).'},
        couture: {ico: '🪡', name: 'Coin couture', cost: {bois: 2, metal: 2, pieces: 1}, h: 3, prod: {every: 12, in: {plastique: 1}, out: {tissu: 1, corde: 1}}, desc: 'Des sacs plastique tressés : 1 tissu et 1 corde toutes les 12 h.'},
        forge: {ico: '⚒️', name: 'Petite forge', cost: {metal: 6, pieces: 2, charbon: 4}, h: 5, tool: 'cle', recyK: 1.5, prod: {every: 8, in: {charbon: 1}, out: {clous: 3}}, desc: 'Démonter va plus vite ; et avec du charbon, on forge des clous (3 toutes les 8 h).'},
        infirmerie2: {ico: '🛏️', name: 'Lit d’infirmerie', cost: {metal: 3, tissu: 3, caoutchouc: 1}, h: 3, healK: 1.5, desc: 'Les malades guérissent plus vite.'},
        periscope: {ico: '🔭', name: 'Périscope', cost: {verre: 3, metal: 4, colle: 1}, h: 4, defense: 2, desc: 'On voit qui frappe à la trappe avant d’ouvrir : bien plus dur de nous surprendre.'},
        alarme: {ico: '🚨', name: 'Alarme de la trappe', cost: {electro: 2, cuivre: 2, piles: 2}, h: 3, defense: 3, desc: 'Un fil tendu et une sonnerie : personne n’entre sans qu’on le sache.'},
        talkie: {ico: '📡', name: 'Talkies-walkies', cost: {electro: 3, piles: 3, plastique: 2}, h: 3, talkie: true, desc: 'On entend ceux qui sont dehors même sans électricité au bunker.'},
        carte: {ico: '🗺️', name: 'Grande carte de la ville', cost: {tissu: 2, colle: 1, bois: 1}, h: 3, map: true, desc: 'Une fois finie : tous les lieux de la ville sont marqués, même ceux où personne n’est allé.'},
        velo: {ico: '🚲', name: 'Vélo réparé', cost: {metal: 3, caoutchouc: 2, pieces: 2, corde: 1}, h: 4, travelK: 0.65, desc: 'On va et on revient en ville bien plus vite.'},
        charrette: {ico: '🛒', name: 'Charrette', cost: {bois: 6, caoutchouc: 2, clous: 4, corde: 2}, h: 4, carry: 10, desc: 'On rapporte 10 de plus à chaque sortie.'},
        sacados: {ico: '🎒', name: 'Sacs à dos cousus', cost: {tissu: 3, corde: 2}, h: 2, base: true, carry: 4, desc: 'Des sacs solides pour chacun : on rapporte 4 de plus à chaque sortie.'},
        hotte: {ico: '🧺', name: 'Hotte en osier', cost: {bois: 3, corde: 3}, h: 2, carry: 6, desc: 'Sur le dos, comme les vendangeurs : on rapporte 6 de plus.'},
        brouette: {ico: '🛞', name: 'Brouette', cost: {metal: 3, bois: 3, caoutchouc: 1, clous: 2}, h: 3, carry: 8, desc: 'On rapporte 8 de plus à chaque sortie.'},
        remorque: {ico: '🚛', name: 'Remorque de vélo', cost: {metal: 4, caoutchouc: 2, corde: 2, pieces: 1}, h: 4, carry: 15, with: 'velo', desc: 'Accrochée au vélo réparé : on rapporte 15 de plus (sans vélo, elle ne sert à rien).'},
        refrigerateur: {ico: '🧊', name: 'Garde-manger frais', cost: {metal: 4, plastique: 3, cuivre: 2, electro: 1}, h: 4, cap: {nourriture: 50, plantes: 15}, desc: '+50 rations et +15 plantes de place.'},
        bidons: {ico: '🛢️', name: 'Bidons d’essence', cost: {plastique: 4, metal: 1}, h: 2, cap: {essence: 40}, desc: '+40 L d’essence de place.'},
        /* ── les chaînes de fabrication (option des réglages « chaînes ») ── */
        rouet: {ico: '🧶', name: 'Rouet', cost: {bois: 4, corde: 1, clous: 2}, h: 2, base: true, chain: true, prod: {every: 8, in: {plantes: 1}, out: {fil: 2}}, desc: 'Des fibres de plantes, on file : 2 fils toutes les 8 h (1 plante).'},
        metier: {ico: '🪢', name: 'Métier à tisser', cost: {bois: 6, corde: 2, clous: 3}, h: 4, chain: true, prod: {every: 12, in: {fil: 3}, out: {tissu: 2}}, desc: 'Du fil, on tisse : 2 tissus toutes les 12 h (3 fils).'},
        tailleur: {ico: '🧥', name: 'Coin du tailleur', cost: {bois: 3, metal: 1, tissu: 2}, h: 3, chain: true, prod: {every: 24, in: {tissu: 2, fil: 1}, out: {vetements: 1}}, desc: 'Des vêtements chauds (2 tissus et 1 fil par jour) : l’hiver, le froid fait bien moins de mal.'},
        champ: {ico: '🌾', name: 'Champ sous verrière', cost: {bois: 4, plastique: 2, verre: 1}, h: 3, base: true, chain: true, prod: {every: 12, in: {eausale: 1}, out: {ble: 2}, day: true, skill: 'cultiver'}, desc: 'Du blé sous le puits de lumière : 2 toutes les 12 h, le jour (1 L d’eau de pluie).'},
        moulin: {ico: '⚙️', name: 'Moulin à bras', cost: {metal: 3, pieces: 2, bois: 2}, h: 3, chain: true, prod: {every: 6, in: {ble: 2}, out: {farine: 2}}, desc: 'Le blé devient farine : 2 toutes les 6 h.'},
        four: {ico: '🍞', name: 'Four à pain', cost: {metal: 3, verre: 1, bois: 4}, h: 4, chain: true, prod: {every: 12, in: {farine: 2, bois: 0.5}, out: {nourriture: 4}, skill: 'cuisiner'}, desc: 'Du pain : 4 rations toutes les 12 h (2 farines et un peu de bois).'},
        armoirepharma: {ico: '🗃️', name: 'Armoire à pharmacie', cost: {bois: 3, verre: 1, clous: 2}, h: 2, cap: {medic: 15, plantes: 15}, desc: '+15 médicaments et +15 plantes de place.'},
    };
    const BASE_PLANS = Object.keys(ITEMS).filter(k => ITEMS[k].base);
    const FOUND_PLANS = Object.keys(ITEMS).filter(k => !ITEMS[k].base && !ITEMS[k].fixed);
    const TOOLS = {pelle: ['⛏️', 'Pelle', 'creuser deux fois plus vite'], scie: ['🪚', 'Scie', 'construire plus vite'], cle: ['🔧', 'Clé à molette', 'obligatoire pour certains plans'], sac: ['🎒', 'Grand sac', 'rapporter deux fois plus'], lampe: ['🔦', 'Lampe torche', 'marcher de nuit aussi vite que de jour']};
    /** les sortes de lieux : [icône, nom, ressources {clé: [min, max]}, outils qu'on peut y trouver, plans souvent] */
    const PLACE_KINDS = {
        supermarche: ['🛒', 'Supermarché', {nourriture: [8, 20], eau: [6, 16], plastique: [1, 4], piles: [0, 3], farine: [0, 4], vetements: [0, 2]}, [], false, ['bouteilles', 'seau', 'jouets', 'conserves', 'reveil']],
        station: ['⛽', 'Station-service', {essence: [8, 24], nourriture: [1, 4], caoutchouc: [0, 3], charbon: [0, 4]}, [], false, ['pneu', 'batterieauto', 'tuyau', 'panneau', 'barbecue']],
        quincaillerie: ['🔩', 'Quincaillerie', {metal: [4, 12], pieces: [1, 5], clous: [4, 12], colle: [1, 4], corde: [1, 4]}, ['cle', 'scie', 'pelle'], false, ['vis', 'cables', 'pots', 'seau', 'tuyau']],
        menuiserie: ['🪵', 'Menuiserie', {bois: [8, 20], clous: [2, 6], colle: [1, 3]}, ['scie'], false, ['palette', 'chaise', 'fenetre']],
        pharmacie: ['💊', 'Pharmacie', {medic: [3, 8], tissu: [1, 4], plantes: [0, 3], verre: [0, 2]}, [], false, ['bocaux', 'bouteilles']],
        maison: ['🏚️', 'Maison abandonnée', {nourriture: [1, 6], tissu: [2, 6], bois: [1, 5], eau: [1, 5], vetements: [0, 2], fil: [0, 2]}, ['sac', 'lampe'], true, ['grillepain', 'tele', 'matelas', 'rideaux', 'lampe', 'parapluie', 'chaise', 'reveil', 'telephone', 'casserole', 'jouets', 'sechecheveux', 'frigo', 'aspirateur', 'montre']],
        garage: ['🚗', 'Garage', {essence: [4, 12], pieces: [2, 6], metal: [2, 6], caoutchouc: [1, 4], piles: [0, 3]}, ['cle', 'lampe'], false, ['batterieauto', 'pneu', 'velorouille', 'cables', 'tuyau']],
        bibliotheque: ['📚', 'Bibliothèque', {tissu: [0, 2], bois: [0, 3], colle: [0, 2]}, [], true, ['ordinateur', 'lampe', 'chaise', 'sacsable']],
        maisonfam: ['🏡', 'Maison de famille', {nourriture: [2, 6], tissu: [2, 6], bois: [2, 6], medic: [0, 2], plantes: [1, 3]}, ['lampe', 'sac'], true, ['machinecoudre', 'montre', 'radiocassee', 'matelas', 'casserole', 'bocaux', 'guitarecassee']],
        // les lieux en plus (surtout sur les grandes cartes)
        decharge: ['🗑️', 'Décharge', {metal: [2, 6], plastique: [2, 6], bois: [1, 4]}, ['pelle'], false, ['tele', 'frigo', 'ordinateur', 'velorouille', 'pneu', 'matelas', 'grillepain', 'aspirateur', 'palette', 'tuiles', 'fenetre', 'panneau']],
        electromenager: ['🔌', 'Magasin d’électroménager', {electro: [2, 6], cuivre: [2, 6], piles: [1, 4], plastique: [1, 3]}, [], true, ['tele', 'ordinateur', 'telephone', 'radiocassee', 'sechecheveux', 'aspirateur', 'cables']],
        droguerie: ['🧴', 'Droguerie', {colle: [2, 6], corde: [2, 6], clous: [2, 6], verre: [1, 3], plastique: [1, 3], fil: [1, 4]}, [], false, ['pots', 'vis', 'seau', 'bocaux']],
        usine: ['🏭', 'Usine abandonnée', {metal: [6, 14], caoutchouc: [2, 5], cuivre: [1, 4], charbon: [2, 8]}, ['cle'], true, ['cables', 'panneau', 'palette', 'tuyau', 'machinecoudre']],
        ferme: ['🐄', 'Ferme', {nourriture: [3, 8], plantes: [2, 5], bois: [2, 6], corde: [1, 4], eau: [2, 6], ble: [2, 8], farine: [0, 3]}, ['pelle', 'sac'], true, ['filet', 'seau', 'palette', 'velorouille', 'tuyau']],
        ecole: ['🏫', 'École', {tissu: [1, 3], colle: [1, 4], plastique: [1, 3], bois: [1, 3]}, [], true, ['sacsable', 'jouets', 'ordinateur', 'chaise', 'lampe']],
        gare: ['🚉', 'Gare', {metal: [3, 8], charbon: [3, 10], nourriture: [0, 3]}, ['lampe'], false, ['panneau', 'cables', 'reveil', 'parapluie']],
        port: ['⚓', 'Port de pêche', {corde: [3, 8], nourriture: [2, 6], caoutchouc: [1, 3], essence: [2, 8]}, [], false, ['filet', 'pneu', 'bouteilles', 'tuyau']],
        hopital: ['🏥', 'Hôpital', {medic: [4, 12], tissu: [2, 6], verre: [1, 3], electro: [0, 3]}, [], true, ['bocaux', 'lampe', 'telephone', 'matelas']],
        eglise: ['⛪', 'Église', {bois: [2, 5], tissu: [1, 3], verre: [1, 4], vetements: [0, 3]}, [], true, ['fenetre', 'chaise', 'rideaux']],
    };
    /* les compétences : [clé, icône, nom, métiers (une partie du mot)] ; 1 = comme tout le monde, 1,5 = le métier, +0,25 l'époque */
    const SKILLS = [
        ['construire', '🔨', 'Construire', /menuisi|charpent|maçon|macon|couvreur|ébénist|ebenist|tonneli|charron|bâtiment|batiment|tailleur de pierre|plâtri|platri|carreleur|terrassi/],
        ['reparer', '🔧', 'Réparer', /mécani|mecani|forgeron|serruri|électric|electric|ajusteur|horlog|chaudronn|tourneur|garagiste|ingénieur|ingenieur|maréchal|marechal|plombier|cheminot/],
        ['soigner', '🩺', 'Soigner', /médecin|medecin|infirmi|sage-femme|sage femme|pharmacien|chirurgien|religieuse|soignant|herboriste|docteur|vétérinaire|veterinaire/],
        ['cultiver', '🌱', 'Cultiver', /cultivat|agricult|laboureur|jardini|vigneron|fermi|maraîch|maraich|métayer|metayer|journalier|paysan|berger|propriétaire exploitant|horticult/],
        ['cuisiner', '🍲', 'Cuisiner', /boulang|cuisini|boucher|charcuti|pâtissi|patissi|meunier|aubergiste|restaurat|traiteur|épicier|epicier/],
        ['fouiller', '🎒', 'Fouiller', /marchand|négociant|negociant|colporteur|chiffonni|commerçant|commercant|voiturier|roulier|facteur|camionneur|chauffeur|brocanteur|représentant|representant/],
        ['defendre', '🛡️', 'Défendre', /soldat|militaire|gendarme|garde|policier|chasseur|sergent|caporal|capitaine|lieutenant|douanier|pompier/],
        ['raconter', '📖', 'Raconter', /institut|curé|cure\b|prêtre|pretre|abbé|musicien|chanteu|écrivain|ecrivain|comédien|comedien|notaire|professeur|journaliste|conteur|clerc/],
    ];
    const SKILL_KEYS = SKILLS.map(x => x[0]);
    /** les compétences d'un ancêtre d'après son métier (texte de la fiche) et son année de naissance */
    function skillsOf(occ, by) {
        const t = String(occ || '').toLowerCase(), y = Number(by) || 0, sk = {}, from = [];
        SKILLS.forEach(([k, , , re]) => { sk[k] = re.test(t) ? 1.5 : 1; });
        if (SKILLS.some(([k]) => sk[k] > 1) && t) from.push(String(occ).trim().slice(0, 40));
        const era = y && y < 1900 ? 'ancien' : y >= 1950 ? 'moderne' : '';
        if (era === 'ancien') { sk.cultiver += .25; sk.cuisiner += .25; sk.soigner += .25; from.push(`né·e en ${y}`); }
        if (era === 'moderne') { sk.reparer += .25; from.push(`né·e en ${y}`); }
        return {sk, era, from: from.join(', ')};
    }
    const SEASONS = [['printemps', '🌸', 'Printemps'], ['ete', '☀️', 'Été'], ['automne', '🍂', 'Automne'], ['hiver', '❄️', 'Hiver']];
    const SEASON_DAYS = 7;
    /** le coffre de famille : un objet de la base → un petit avantage, d'après son nom */
    const HEIRLOOMS = [['outil', /couteau|outil|marteau|scie|rabot|canif|pince|tenaille|hache|établi|etabli/, 'on construit 20 % plus vite'],
        ['livre', /livre|bible|missel|carnet|cahier|recette|lettre|journal|album|photo/, 'les histoires du soir font plus de bien'],
        ['bijou', /bague|bijou|alliance|médaille|medaille|collier|broche|montre|chapelet|bracelet|horloge|pendule/, 'le moral baisse moins vite'],
        ['textile', /couverture|nappe|drap|châle|chale|dentelle|broderie|linge|robe|manteau|tricot|édredon|edredon/, '+3 tissu, et on dort mieux'],
        ['vaisselle', /vaisselle|plat|soupière|soupiere|marmite|cocotte|cafetière|cafetiere|assiette|bol|moulin/, 'les repas nourrissent davantage'],
        ['souvenir', /./, 'le moral de départ est meilleur']];
    const TALES = ['l’histoire du loup qui avait peur du noir', 'la légende de la dame blanche du moulin', 'le jour où l’oncle a vendu la vache deux fois', 'la grande crue, quand l’eau est montée jusqu’à l’église', 'le bal du 14 juillet où tout le monde s’est rencontré', 'la recette perdue du gâteau de la grand-mère'];
    /** 🎭 les caractères : [icône, nom, ce que ça change] */
    const TRAITS = {
        courageux: ['🦁', 'Courageux·se', 'se défend mieux, se blesse moins dehors'], peureux: ['🐭', 'Peureux·se', 'se défend moins bien, le moral chute quand on frappe à la trappe'],
        gourmand: ['🍰', 'Gourmand·e', 'a faim plus vite, mais un repas lui remonte le moral'], bricoleur: ['🔧', 'Bricoleur·se', 'construit et répare plus vite'],
        optimiste: ['🌞', 'Optimiste', 'le moral baisse deux fois moins vite'], ronchon: ['😤', 'Ronchon·ne', 'le moral baisse plus vite, se fâche facilement'],
        dormeur: ['😴', 'Gros·se dormeur·se', 'a besoin de plus de sommeil'], sociable: ['🤝', 'Sociable', 'se fait vite des amis'],
        solitaire: ['🌲', 'Solitaire', 'la foule lui pèse ; dehors, se débrouille mieux'], propre: ['🧽', 'Maniaque', 'être sale lui mine le moral']};
    const TRAIT_KEYS = Object.keys(TRAITS);
    const TRAIT_OPP = {courageux: ['peureux'], peureux: ['courageux'], optimiste: ['ronchon'], ronchon: ['optimiste'], sociable: ['solitaire'], solitaire: ['sociable']};
    /** 🎚️ les niveaux de difficulté : usure des besoins, réserves de départ, force des pillards, pannes, ce qui revient en ville */
    const DIFFS = {facile: {l: '🙂 Facile', decay: 0.8, start: 1.5, raid: 0.7, wear: 0.5, regen: 1.3}, normal: {l: '😐 Normal', decay: 1, start: 1, raid: 1, wear: 1, regen: 1},
        difficile: {l: '😬 Difficile', decay: 1.15, start: 0.7, raid: 1.25, wear: 1.5, regen: 0.8}, extreme: {l: '💀 Extrême', decay: 1.3, start: 0.5, raid: 1.5, wear: 2, regen: 0.6}};
    /** 🎬 les scénarios de départ */
    const SCENARIOS = {classique: ['☢', 'Classique', 'L’abri, la ville, et tenir le plus longtemps possible.'],
        hiver: ['❄️', 'Hiver nucléaire', 'L’hiver ne finit jamais : du bois ou du charbon pour chauffer, et presque pas de soleil pour les panneaux.'],
        epidemie: ['🦠', 'Épidémie', 'La fièvre court la ville : on peut l’attraper dehors, et même au bunker. Des médicaments au départ.'],
        inondation: ['🌊', 'Inondation', 'Il pleut sans arrêt : beaucoup d’eau à filtrer, mais les étages du bas prennent l’eau.'],
        penurie: ['🥫', 'Pénurie', 'La ville a déjà été pillée : peu de choses dans les lieux, et elles reviennent lentement.'],
        invasion: ['⚔️', 'Pillards', 'Des bandes rôdent dès le premier jour : portes, pièges et tours de garde.']};
    /** 🌪️ les catastrophes (option des réglages « météo ») : [icône, nom, ce qui se passe] */
    const EVENTS = {canicule: ['🥵', 'Canicule', 'on a soif bien plus vite'], tempete: ['🌪️', 'Tempête de poussière', 'l’air s’encrasse, dehors on se blesse, les panneaux solaires ne donnent rien'],
        inondation: ['🌊', 'Inondation', 'l’eau entre par le bas : une installation de l’étage le plus profond est abîmée'], seisme: ['🫨', 'Tremblement de terre', 'des installations sont abîmées, on peut se blesser'],
        orage: ['⛈️', 'Orage électrique', 'la foudre grille un appareil électrique'], froid: ['🥶', 'Vague de froid', 'il fait froid même hors de l’hiver : chauffage et vêtements']};
    /** 📘 le tutoriel (option des réglages) : [ce qu'il faut faire, quand c'est fait] */
    const built = (g, k) => g.floors.some(f => f.slots.includes(k)) || g.builds.some(b => b.k === k);
    const TUTO = [
        ['🚽 Construis des toilettes : clique sur une place libre ＋ du bunker, puis « Toilettes ».', g => built(g, 'toilettes') || g.builds.some(b => b.k === 'toilettes')],
        ['🔨 Mets quelqu’un sur « Construire » (onglet 👥 Habitants) : la construction avance à l’atelier.', g => g.floors.some(f => f.slots.includes('toilettes')) || g.people.some(p => p.job === 'construire')],
        ['🛏️ Construis un lit : on dort deux fois mieux.', g => built(g, 'lit')],
        ['⛏️ Mets quelqu’un à « Creuser » : un nouvel étage, c’est six places de plus.', g => g.dig.on || g.floors.length > 1],
        ['🗺️ Envoie quelqu’un en ville : onglet 🗺️ Ville, clique sur un lieu, choisis ce qu’il rapporte, puis « Partir ».', g => g.people.some(p => p.where === 'dehors') || g.city.places.some(pl => pl.visits)],
        ['♻️ Démonte un objet du bric-à-brac (onglet ♻️ Bric-à-brac) : on en tire des composants.', g => (g.stats.recycled || 0) > 0 || g.recy.length > 0],
        ['⚗️ Construis un filtre à eau : l’eau de pluie devient potable.', g => built(g, 'filtre')],
        ['🛠️ Regarde l’onglet 🛠️ Atelier : chaque plan dit ce qu’il manque et où le trouver.', g => dayOf(g.t) >= 2 || has(g, 'jeux') || g.builds.length > 1],
        ['🌙 Tiens jusqu’au jour 3 : surveille les barres de chacun, et le moral.', g => dayOf(g.t) >= 3]];
    /** 📻 le commerce par radio : la valeur de chaque chose (le marché la fait varier chaque jour) */
    const VALUE = {eau: 1, nourriture: 1.5, essence: 2, medic: 4, metal: 1.5, pieces: 3, bois: 1, tissu: 1.5, plantes: 1, clous: 0.5, corde: 1, colle: 1, verre: 1.5, plastique: 0.8, caoutchouc: 1.2, cuivre: 2, electro: 3, piles: 2, charbon: 1};
    const TRADERS = ['le bunker des Combes', 'la ferme fortifiée du Moulin', 'les cheminots de la gare', 'le refuge de l’hôpital', 'les sœurs du couvent', 'la cave du notaire', 'les pêcheurs du port', 'le garage des frères Roux', 'l’abri de l’école', 'la tour de la radio'];
    /** les tailles de carte : [côté, nombre de lieux, nom] (les deux dernières : plus loin, plus de lieux, toutes les sortes) */
    const SIZES = {petite: [9, 6, 'Petite'], moyenne: [13, 10, 'Moyenne'], grande: [17, 16, 'Grande'], tresgrande: [23, 26, 'Très grande'], immense: [31, 40, 'Immense (une région)']};
    const SLOTS = 6, MAX_FLOORS = 6, DIG_HOURS = 30, STEP = 10;
    const STREETS = ['rue de l’Église', 'place du Marché', 'rue Haute', 'chemin du Moulin', 'avenue de la Gare', 'rue des Écoles', 'route nationale', 'quai du Canal', 'rue Neuve', 'impasse des Tilleuls', 'boulevard du Nord', 'rue du Four', 'rue de la Poste', 'chemin des Vignes', 'rue du Lavoir', 'place de la Mairie', 'rue des Forges', 'allée des Peupliers', 'rue Saint-Martin', 'chemin de Halage', 'rue du Château', 'faubourg Saint-Jean', 'rue des Remparts', 'route de la Côte', 'rue de la Fontaine', 'place du Champ de Foire', 'rue du Pont', 'rue des Tanneurs', 'chemin des Carrières', 'rue de la Mine', 'avenue du Port', 'rue des Jardins', 'rue Pasteur', 'rue Victor-Hugo', 'rue Jean-Jaurès', 'chemin de la Croix', 'route des Étangs', 'rue des Lilas', 'rue du Marché aux Grains', 'impasse du Puits'];

    /* ═════════ Les aides ═════════ */
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    /** le hasard qui se rejoue (mulberry32) : l'état est gardé dans la partie, la partie enregistrée reprend le même tirage */
    function rnd(g) { let a = (g.rng = (g.rng + 0x6D2B79F5) | 0); a = Math.imul(a ^ (a >>> 15), 1 | a); a ^= a + Math.imul(a ^ (a >>> 7), 61 | a); return ((a ^ (a >>> 14)) >>> 0) / 4294967296; }
    const rint = (g, a, b) => a + Math.floor(rnd(g) * (b - a + 1));
    const pickOne = (g, list) => list[Math.floor(rnd(g) * list.length)];
    const hourOf = t => Math.floor(t / 60) % 24;
    const dayOf = t => Math.floor(t / 1440) + 1;
    const isNight = t => { const h = hourOf(t); return h >= 21 || h < 6; };
    const clock = t => `${String(hourOf(t)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    /** les installations qui marchent (une installation en panne ne compte plus), avec leur niveau (1 à 3) */
    const items = g => g.floors.flatMap((f, fi) => f.slots.map((k, si) => ({k, fi, si, lvl: g.lvl?.[`${fi},${si}`] || 1})).filter(x => x.k && !g.broken?.[`${x.fi},${x.si}`]));
    /** ce qu'apporte le niveau : ×1, ×1,5, ×2 */
    const lvK = L => 1 + 0.5 * ((L || 1) - 1);
    const bestLvl = (g, k) => Math.max(1, ...items(g).filter(x => x.k === k).map(x => x.lvl));
    const opt = (g, k) => !!g.opt?.[k];
    const DF = g => DIFFS[g.diff] || DIFFS.normal;
    const count = (g, k) => items(g).filter(x => x.k === k).length;
    const has = (g, k) => count(g, k) > 0;
    const alive = g => g.people.filter(p => p.hp > 0);
    function cap(g, r) {
        let c = r === 'eau' || r === 'eausale' ? BASE_CAP + 20 : BASE_CAP;
        items(g).forEach(({k, lvl}) => { const x = ITEMS[k]?.cap; if (!x) return; c += ((x.all || 0) + (x[r] || 0)) * lvK(lvl); });
        return c;
    }
    /** les effets des objets posés (un seul objet de chaque sorte compte pour un multiplicateur) */
    const kinds = g => [...new Set(items(g).map(x => x.k))];
    const mult = (g, prop) => kinds(g).reduce((m, k) => { const v = ITEMS[k]?.[prop]; if (!v) return m; const K = lvK(bestLvl(g, k)); return m * (v >= 1 ? 1 + (v - 1) * K : Math.pow(v, K)); }, 1);
    const sumOf = (g, prop) => items(g).reduce((n, {k, lvl}) => n + (ITEMS[k]?.[prop] || 0) * lvK(lvl), 0);
    const working = (g, k) => !ITEMS[k]?.power || g.power; // un objet électrique sans courant ne fait rien
    const junkCap = g => JUNK_CAP + sumOf(g, 'junkCap');
    const junkCount = g => Object.values(g.junk || {}).reduce((a, b) => a + b, 0);
    /** les seuils de l'autonomie : quand un habitant va de lui-même boire, manger, aux toilettes… */
    const AUTO = {prudent: {soif: 60, faim: 55, vessie: 50, hygiene: 45, sommeil: 40, nuit: 80}, normal: {soif: 35, faim: 35, vessie: 30, hygiene: 25, sommeil: 25, nuit: 70}, manuel: {soif: 10, faim: 10, vessie: 10, hygiene: 5, sommeil: 8, nuit: 20}};
    const rainPerHour = g => (1 + items(g).reduce((n, {k}) => n + (ITEMS[k]?.rain || 0), 0)) * (has(g, 'recuperateur') ? 3 : 1);
    const seasonOf = g => g.scen === 'hiver' ? 'hiver' : SEASONS[((Number(g.season0) || 0) + Math.floor((dayOf(g.t) - 1) / SEASON_DAYS)) % 4][0];
    const heir = (g, k) => (g.coffre || []).some(x => x.bonus === k);
    const atBase = g => alive(g).filter(p => p.where === 'base');
    /** la meilleure compétence parmi ceux qui sont au bunker (les bébés ne comptent pas) */
    const best = (g, k) => Math.max(1, ...atBase(g).filter(p => !p.baby && !p.ill).map(p => p.sk?.[k] || 1));
    const moodMult = p => ((p.mood ?? 70) >= 70 ? 1.1 : (p.mood ?? 70) < 20 ? 0.6 : 1);
    /** l'eau pour se laver ou arroser : l'eau de pluie d'abord, puis la potable */
    function takeWater(g, n) { if (g.res.eausale >= n) { g.res.eausale -= n; return true; } if (g.res.eausale + g.res.eau >= n) { const a = g.res.eausale; g.res.eausale = 0; g.res.eau -= n - a; return true; } return false; }
    function log(g, txt, kind = 'info') { g.log.unshift({t: g.t, txt, kind}); if (g.log.length > 250) g.log.length = 250; }
    /** un message de la radio : entendu tout de suite s'il y a de l'électricité, sinon gardé jusqu'au retour du courant */
    function radio(g, txt) { if (g.power || has(g, 'talkie')) log(g, txt, 'radio'); else g.radioQueue.push(txt); }
    function add(g, r, n) { const before = g.res[r]; g.res[r] = clamp(before + n, 0, cap(g, r)); return g.res[r] - before; }

    /* ═════════ Une nouvelle partie ═════════ */
    /**
     * opts : {seed, me: {pid, name, gender}, team: [{pid, name, gender}], city: {name, size: 'petite'|'moyenne'|'grande'}}
     */
    function newGame(opts = {}) {
        const seed = (Number(opts.seed) || Math.floor(Math.random() * 2 ** 31)) | 0;
        const g = {v: 1, seed, rng: seed, t: 6 * 60, speed: 1, over: false, power: true, powerOn: true, powerSrc: 'essence', weather: {rain: false, until: 0}, wind: false, log: [], radioQueue: [],
            res: {...Object.fromEntries(RES_KEYS.map(r => [r, 0])), eau: 24, eausale: 0, plantes: 1, nourriture: 16, essence: 20, bois: 14, metal: 6, pieces: 2, tissu: 3, medic: 1, clous: 4, colle: 1, corde: 1}, tools: [], plans: [...BASE_PLANS],
            junk: {radiocassee: 1, chaise: 1, palette: 1}, recy: [], autoRecy: false, auto: 'normal', batt: 0,
            floors: [{slots: ['radio', 'generateur', 'atelier', null, null, null]}], dig: {on: false, done: 0}, builds: [], people: [], city: null, nextId: 1,
            air: 100, filterUse: 0, filterClog: false, said: {}, cold: false, season0: clamp(Number(opts.season0) || 0, 0, 3), visit: null, preg: null, births: [], feud: null,
            coffre: [], extras: cleanExtras(opts.extras), lore: cleanLore(opts.lore), letters: cleanLetters(opts.letters), names: cleanNames(opts.names), ruins: cleanRuins(opts.ruins),
            opt: cleanOpt(opts.opt), diff: DIFFS[opts.diff] ? opts.diff : 'normal', scen: SCENARIOS[opts.scen] ? opts.scen : 'classique',
            broken: {}, lvl: {}, rel: {}, event: null, market: {d: 0, offers: [], deals: []},
            stats: {deaths: [], visits: {marchand: 0, voyageur: 0, pillards: 0}, raidsWon: 0, raidsLost: 0, stories: 0, found: [], trades: 0, repairs: 0, events: 0}};
        g.tuto = g.opt.tuto ? 0 : -1;
        if (!g.opt.chaines) g.plans = g.plans.filter(k => !ITEMS[k].chain);
        // les réserves de départ selon la difficulté et le scénario
        const sk = DF(g).start * (g.scen === 'penurie' ? 0.8 : 1);
        RES.slice(0, 10).forEach(([r]) => { g.res[r] = Math.round(g.res[r] * sk * 10) / 10; });
        if (g.scen === 'hiver') { g.res.bois += 10; g.res.charbon += 4; if (g.opt.chaines) g.res.vetements += 2; }
        if (g.scen === 'epidemie') g.res.medic += 3;
        if (g.scen === 'inondation') g.res.eausale += 15;
        if (g.scen === 'invasion') { g.res.metal += 4; g.res.clous += 4; }
        g.people.push(mkPerson(g, opts.me || {name: 'Moi'}, true));
        (opts.team || []).slice(0, 6).forEach(p => g.people.push(mkPerson(g, p, false)));
        // les liens de famille (parents, conjoints, frères et sœurs) entre ceux qui descendent : par numéro de fiche
        const byPid = new Map(g.people.filter(p => p.pid).map(p => [p.pid, p]));
        (opts.kin || []).forEach(([a, b, type]) => { const x = byPid.get(Number(a)), y = byPid.get(Number(b)); if (!x || !y || x === y) return; const k = type === 'conjoint' ? 'spouses' : 'kin';
            if (!x[k].includes(y.id)) x[k].push(y.id); if (!y[k].includes(x.id)) y[k].push(x.id); });
        // une vieille brouille, parfois, entre deux qui ne sont pas proches
        const pairs = []; g.people.forEach((a, i) => g.people.slice(i + 1).forEach(b => { if (!a.kin.includes(b.id) && !a.spouses.includes(b.id)) pairs.push([a.id, b.id]); }));
        if (pairs.length && g.people.length >= 3 && rnd(g) < 0.5) g.feud = pickOne(g, pairs);
        // le coffre de famille : 3 objets au plus
        g.coffre = (opts.coffre || []).slice(0, 3).map(o => { const t = `${o.title || ''} ${o.kind || ''} ${o.description || ''}`.toLowerCase(); return {title: String(o.title || 'Un objet de famille').slice(0, 80), bonus: HEIRLOOMS.find(([, re]) => re.test(t))[0]}; });
        if (heir(g, 'textile')) g.res.tissu += 3;
        if (heir(g, 'souvenir')) g.people.forEach(p => { p.mood = clamp(p.mood + 10, 0, 100); });
        g.city = makeCity(g, String(opts.city?.name || 'la ville').slice(0, 80), SIZES[opts.city?.size] ? opts.city.size : 'moyenne', opts.homes);
        log(g, `Jour 1. La trappe se referme au-dessus de vous : ${g.people.length > 1 ? `${g.people.length} dans le bunker` : 'seul·e dans le bunker'}, à ${g.city.name}.`, 'alerte');
        if (g.coffre.length) log(g, `🧳 Dans le coffre de famille : ${g.coffre.map(c => `« ${c.title} » (${HEIRLOOMS.find(h => h[0] === c.bonus)[2]})`).join(', ')}.`);
        if (g.feud) { const [a, b] = g.feud.map(id => g.people.find(p => p.id === id)); log(g, `⚡ ${a.name} et ${b.name} ne se parlent plus depuis longtemps… Il faudra faire avec.`); }
        if (g.scen !== 'classique') log(g, `${SCENARIOS[g.scen][0]} ${SCENARIOS[g.scen][1]} : ${SCENARIOS[g.scen][2]}`, 'alerte');
        marketDay(g);
        if (g.tuto === 0) log(g, `📘 Tutoriel — ${TUTO[0][0]}`, 'alerte');
        log(g, 'Pour commencer : construire des toilettes et un lit à l’atelier, creuser un étage, et envoyer quelqu’un chercher de quoi tenir. Le bric-à-brac (une vieille radio, une chaise…) se démonte pour en tirer des composants : onglet ♻️ Bric-à-brac.', 'info');
        return g;
    }
    /** un habitant : ses besoins, son moral, ses compétences (métier et époque), son caractère */
    function mkPerson(g, p, me, more = {}) {
        const {sk, era, from} = skillsOf(p.occ, p.by), t1 = pickOne(g, TRAIT_KEYS), t2 = rnd(g) < 0.3 ? pickOne(g, TRAIT_KEYS.filter(k => k !== t1 && !TRAIT_OPP[t1]?.includes(k))) : null;
        return {id: 'h' + g.nextId++, pid: Number(p.pid) || 0, name: String(p.name || 'Sans nom').slice(0, 80), gender: p.gender || '', me: !!me, hp: 100,
            needs: {soif: 85, faim: 80, sommeil: 90, hygiene: 85, vessie: 90}, where: 'base', act: null, job: 'libre', exp: null,
            mood: 70, sk, era, from, occ: String(p.occ || '').slice(0, 60), by: Number(p.by) || 0, ill: null, kin: [], spouses: [], baby: false, parents: [],
            traits: [t1, t2].filter(Boolean), xp: {}, diary: [], ...more};
    }
    const str = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
    const cleanExtras = l => (Array.isArray(l) ? l : []).slice(0, 20).map(p => ({pid: Number(p?.pid) || 0, name: str(p?.name, 80) || 'Un voyageur', gender: str(p?.gender, 10), occ: str(p?.occ, 60), by: Number(p?.by) || 0}));
    const cleanLore = l => (Array.isArray(l) ? l : []).slice(0, 40).map(x => ({kind: str(x?.kind, 12), title: str(x?.title, 80), text: str(x?.text, 200)})).filter(x => x.title);
    const cleanLetters = l => (Array.isArray(l) ? l : []).slice(0, 20).map(x => ({title: str(x?.title, 80), from: str(x?.from, 60), to: str(x?.to, 60)})).filter(x => x.title);
    /** les objets de famille qu'on peut retrouver dans les ruines (ceux de la base qui ne sont pas dans le coffre) */
    const cleanRuins = l => (Array.isArray(l) ? l : []).slice(0, 20).map(o => ({title: str(o?.title, 80), kind: str(o?.kind, 40), description: str(o?.description, 120)})).filter(o => o.title);
    /** les options des réglages : catastrophes, chaînes de fabrication, tutoriel (absentes = éteintes) */
    const cleanOpt = o => ({meteo: !!o?.meteo, chaines: !!o?.chaines, tuto: !!o?.tuto});
    const cleanNames = o => ({f: (Array.isArray(o?.f) ? o.f : []).slice(0, 60).map(x => str(x, 30)).filter(Boolean), m: (Array.isArray(o?.m) ? o.m : []).slice(0, 60).map(x => str(x, 30)).filter(Boolean)});
    function makeCity(g, name, size, homes = []) {
        const [n, nb] = SIZES[size], c = Math.floor(n / 2), places = [], used = new Set([`${c},${c}`]);
        const kinds = Object.keys(PLACE_KINDS), streets = [...STREETS];
        // au moins un de chaque sorte utile, puis au hasard
        const order = ['supermarche', 'station', 'quincaillerie', 'menuiserie', 'pharmacie', 'maison', 'garage', 'bibliotheque', ...(nb >= 16 ? ['decharge', 'electromenager', 'droguerie'] : []), ...(nb >= 26 ? ['usine', 'ferme', 'ecole', 'gare', 'port', 'hopital', 'eglise'] : [])];
        for (let i = 0; i < nb; i++) {
            const kind = i < order.length ? order[i] : pickOne(g, kinds);
            let x, y, tries = 0; do { x = rint(g, 0, n - 1); y = rint(g, 0, n - 1); tries++; } while ((used.has(`${x},${y}`) || Math.abs(x - c) + Math.abs(y - c) < 2) && tries < 200);
            used.add(`${x},${y}`);
            const [, label, res, tools, plans] = PLACE_KINDS[kind], {stock, max} = stockFor(g, res);
            const street = streets.length ? streets.splice(Math.floor(rnd(g) * streets.length), 1)[0] : `rue n° ${i + 1}`;
            places.push({id: 'l' + (i + 1), kind, name: `${label}, ${street}`, x, y, stock, max, tools: tools.filter(() => rnd(g) < 0.7), plans: plans ? 2 : (rnd(g) < 0.3 ? 1 : 0), visits: 0, seen: false, junk: junkFor(g, kind, rint(g, 1, 4))});
        }
        // la maison natale d'un ancêtre né dans cette ville (2 au plus)
        (Array.isArray(homes) ? homes : []).slice(0, 2).forEach((h, j) => {
            let x, y, tries = 0; do { x = rint(g, 0, n - 1); y = rint(g, 0, n - 1); tries++; } while ((used.has(`${x},${y}`) || Math.abs(x - c) + Math.abs(y - c) < 2) && tries < 200);
            if (used.has(`${x},${y}`)) return; used.add(`${x},${y}`);
            const {stock, max} = stockFor(g, PLACE_KINDS.maisonfam[2]);
            places.push({junk: junkFor(g, 'maisonfam', rint(g, 2, 4)), id: 'm' + (j + 1), kind: 'maisonfam', name: `Maison natale de ${str(h?.name, 60) || 'un ancêtre'}${Number(h?.by) ? ` (${Number(h.by)})` : ''}`, x, y, stock, max, tools: ['lampe'], plans: 1, visits: 0, seen: false, home: true});
        });
        return {name, size, n, base: [c, c], places};
    }
    /** ce qu'il y a dans un lieu : une partie seulement de ce qu'on peut y trouver (tiré au hasard, au moins une chose), en quantité au hasard */
    function stockFor(g, res) {
        const stock = {}, max = {};
        const keys = Object.keys(res).filter(r => opt(g, 'chaines') || !CHAIN_RES.includes(r)), poor = g.scen === 'penurie' ? 0.5 : 1;
        keys.forEach(r => { const [a, b] = res[r]; max[r] = b; stock[r] = b > 0 && rnd(g) < 0.6 ? Math.max(1, Math.round(rint(g, Math.max(1, a), b) * poor)) : 0; });
        if (keys.length && !keys.some(r => stock[r] > 0)) { const r = pickOne(g, keys.filter(x => max[x] > 0).length ? keys.filter(x => max[x] > 0) : keys); stock[r] = rint(g, Math.max(1, res[r][0]), Math.max(1, res[r][1])); }
        return {stock, max};
    }
    /** chaque matin, au hasard : ce qui revient (déposé, livré, trouvé par d'autres…) et ce que d'autres survivants ont emporté */
    function regen(g, pl) {
        const back = 0.4 * DF(g).regen * (g.scen === 'penurie' ? 0.5 : 1);
        Object.keys(pl.max).forEach(r => { const m = pl.max[r]; if (!m) return; const x = rnd(g);
            if (x < back) pl.stock[r] = Math.min(m, (pl.stock[r] || 0) + rint(g, 1, Math.max(1, Math.ceil(m / 2))));
            else if (x > 0.93 && pl.stock[r] > 0) pl.stock[r] = Math.floor(pl.stock[r] / 2); });
        if ((pl.junk || []).length < 4 && rnd(g) < 0.35) pl.junk = [...(pl.junk || []), ...junkFor(g, pl.kind, rint(g, 1, 2))];
    }
    /** du bric-à-brac tiré au hasard parmi ce qu'on trouve dans ce genre de lieu */
    function junkFor(g, kind, n) { const l = PLACE_KINDS[kind]?.[5] || []; return l.length ? Array.from({length: n}, () => pickOne(g, l)) : []; }
    /** minutes de marche d'un trajet (aller), 30 min par case ; la nuit ×1,5 sans lampe torche */
    function travel(g, place, t = g.t, from = null) { const [bx, by] = from ? [from.x, from.y] : g.city.base, d = Math.abs(place.x - bx) + Math.abs(place.y - by); return Math.max(10, Math.round(d * 30 * (isNight(t) && !g.tools.includes('lampe') ? 1.5 : 1) * (g.event?.k === 'tempete' ? 1.4 : 1) * mult(g, 'travelK'))); }

    /* ═════════ Les ordres du joueur ═════════ */
    /** construire : l'objet est commandé (ressources prises), un habitant « Construire » y travaille à l'atelier → {ok, err} */
    function orderBuild(g, k, fi, si) {
        const it = ITEMS[k]; if (!it || it.fixed) return {ok: false, err: 'Objet inconnu.'};
        if (!g.plans.includes(k)) return {ok: false, err: `Il faut d’abord trouver le plan « ${it.name} ».`};
        if (it.tool && !g.tools.includes(it.tool)) return {ok: false, err: `Il faut l’outil « ${TOOLS[it.tool][1]} ».`};
        if (it.chain && !opt(g, 'chaines')) return {ok: false, err: 'Les chaînes de fabrication sont désactivées (réglages).'};
        const f = g.floors[fi]; if (!f || si < 0 || si >= SLOTS || f.slots[si] || g.builds.some(b => b.fi === fi && b.si === si)) return {ok: false, err: 'Cette place est prise.'};
        const miss = Object.entries(it.cost || {}).filter(([r, n]) => (g.res[r] || 0) < n);
        if (miss.length) return {ok: false, err: `Il manque : ${miss.map(([r, n]) => `${n - (g.res[r] || 0)} ${RES.find(x => x[0] === r)[2].toLowerCase()}`).join(', ')}.`};
        Object.entries(it.cost || {}).forEach(([r, n]) => { g.res[r] -= n; });
        g.builds.push({k, fi, si, left: it.h, tot: it.h});
        needBuilder(g);
        log(g, `🛠️ ${it.name} commandé à l’atelier (étage ${fi === 0 ? '−1' : '−' + (fi + 1)}).`);
        return {ok: true};
    }
    function needBuilder(g) { if (!g.people.some(p => p.hp > 0 && p.where === 'base' && p.job === 'construire')) { const free = alive(g).find(p => p.where === 'base' && !p.baby && p.job === 'libre'); if (free) free.job = 'construire'; } }
    function cancelBuild(g, i) { const b = g.builds[i]; if (!b) return; Object.entries(b.cost || ITEMS[b.k].cost || {}).forEach(([r, n]) => add(g, r, n)); g.builds.splice(i, 1); }
    /* ═════════ 🔧 Pannes, réparations et améliorations ═════════ */
    /** une installation peut tomber en panne (pas la radio ni l'atelier ; le groupe électrogène, oui) */
    const breakable = k => !!ITEMS[k] && (!ITEMS[k].fixed || k === 'generateur');
    const slotKey = (fi, si) => `${fi},${si}`;
    /** ce que coûte une réparation : le quart de ce qu'a coûté l'objet (au moins 1 de chaque) */
    const repairCost = k => Object.fromEntries(Object.entries(ITEMS[k].cost || {metal: 4, pieces: 2}).map(([r, n]) => [r, Math.max(1, Math.ceil(n / 4))]));
    /** ce qu'apporte une amélioration (sinon, pas d'amélioration possible) */
    const UPGRADE_PROPS = ['cap', 'carry', 'fun', 'defense', 'prod', 'store', 'recyK', 'burnK', 'travelK', 'healK', 'airK', 'aura', 'junkCap', 'rain'];
    const upgradable = k => !!ITEMS[k] && !ITEMS[k].fixed && (['lit', 'filtre', 'potager'].includes(k) || UPGRADE_PROPS.some(x => ITEMS[k][x] != null));
    const upgradeCost = (k, L) => Object.fromEntries(Object.entries(ITEMS[k].cost || {}).map(([r, n]) => [r, Math.max(1, Math.ceil(n * (L === 2 ? 0.75 : 1.25)))]));
    function payOrErr(g, cost) {
        const miss = Object.entries(cost).filter(([r, n]) => (g.res[r] || 0) < n);
        if (miss.length) return `Il manque : ${miss.map(([r, n]) => `${Math.ceil(n - (g.res[r] || 0))} ${resLabel(r)}`).join(', ')}.`;
        Object.entries(cost).forEach(([r, n]) => { g.res[r] -= n; }); return '';
    }
    function breakItem(g, fi, si, why) {
        const k = g.floors[fi]?.slots[si]; if (!k || !breakable(k) || g.broken[slotKey(fi, si)]) return false;
        g.broken[slotKey(fi, si)] = true; g.people.forEach(p => { if (p.act?.at && p.act.at[0] === fi && p.act.at[1] === si) p.act = null; });
        log(g, `🔧 ${ITEMS[k].ico} ${ITEMS[k].name} ${why || 'tombe en panne'} : il faut le réparer (clique dessus) — ${Object.entries(repairCost(k)).map(([r, n]) => `${n} ${resLabel(r)}`).join(', ')}.`, 'alerte');
        return true;
    }
    /** réparer une installation en panne : les pièces tout de suite, puis un habitant « Construire » y passe la moitié du temps de construction → {ok, err} */
    function orderRepair(g, fi, si) {
        const k = g.floors[fi]?.slots[si]; if (!k || !g.broken[slotKey(fi, si)]) return {ok: false, err: 'Rien à réparer ici.'};
        if (g.builds.some(b => b.fi === fi && b.si === si)) return {ok: false, err: 'C’est déjà commandé.'};
        const cost = repairCost(k), err = payOrErr(g, cost); if (err) return {ok: false, err};
        const h = Math.max(1, Math.round((ITEMS[k].h || 4) / 2)); g.builds.push({k, fi, si, left: h, tot: h, rep: true, cost}); needBuilder(g);
        log(g, `🔧 Réparation de ${ITEMS[k].name} commandée.`); return {ok: true};
    }
    /** améliorer une installation (niveau 2 puis 3) : ses effets comptent ×1,5 puis ×2 → {ok, err} */
    function orderUpgrade(g, fi, si) {
        const k = g.floors[fi]?.slots[si], key = slotKey(fi, si), L = (g.lvl[key] || 1) + 1; if (!k || !upgradable(k)) return {ok: false, err: 'Cette installation ne s’améliore pas.'};
        if (L > 3) return {ok: false, err: 'Déjà au niveau le plus haut.'}; if (g.broken[key]) return {ok: false, err: 'Il faut d’abord la réparer.'};
        if (g.builds.some(b => b.fi === fi && b.si === si)) return {ok: false, err: 'C’est déjà commandé.'};
        const cost = upgradeCost(k, L), err = payOrErr(g, cost); if (err) return {ok: false, err};
        const h = Math.round((ITEMS[k].h || 3) * (L === 2 ? 1 : 1.5)); g.builds.push({k, fi, si, left: h, tot: h, up: L, cost}); needBuilder(g);
        log(g, `⬆️ ${ITEMS[k].name} : amélioration au niveau ${L} commandée.`); return {ok: true};
    }
    /** démonter un objet : on récupère la moitié de ce qu'il a coûté */
    function dismantle(g, fi, si) {
        const k = g.floors[fi]?.slots[si]; if (!k || ITEMS[k].fixed) return false;
        g.floors[fi].slots[si] = null; Object.entries(ITEMS[k].cost || {}).forEach(([r, n]) => add(g, r, Math.floor(n / (g.broken[slotKey(fi, si)] ? 3 : 2))));
        delete g.broken[slotKey(fi, si)]; delete g.lvl[slotKey(fi, si)]; g.builds = g.builds.filter(b => !(b.fi === fi && b.si === si && (b.rep || b.up)));
        g.people.forEach(p => { if (p.act?.at && p.act.at[0] === fi && p.act.at[1] === si) p.act = null; });
        log(g, `${ITEMS[k].name} démonté.`); return true;
    }
    const JOBS = ['libre', 'creuser', 'construire', 'recycler', 'pedaler', 'garde'];
    /** ⚙️ les réglages de la partie : options (météo, chaînes, tutoriel) et difficulté */
    function setOpt(g, k, on) {
        if (!['meteo', 'chaines', 'tuto'].includes(k)) return; g.opt[k] = !!on;
        if (k === 'meteo' && !on) g.event = null;
        if (k === 'chaines' && on) { BASE_PLANS.filter(x => ITEMS[x].chain && !g.plans.includes(x)).forEach(x => g.plans.push(x)); g.city.places.forEach(pl => { const res = PLACE_KINDS[pl.kind][2]; CHAIN_RES.forEach(r => { if (res[r] && pl.max[r] == null) { pl.max[r] = res[r][1]; pl.stock[r] = 0; } }); }); }
        if (k === 'tuto') { g.tuto = on ? 0 : -1; if (on) log(g, `📘 Tutoriel — ${TUTO[0][0]}`, 'alerte'); }
    }
    function setDiff(g, d) { if (DIFFS[d]) { g.diff = d; log(g, `🎚️ Difficulté : ${DIFFS[d].l}.`); } }
    /** ♻️ démonter un objet du bric-à-brac (il passe dans la file de l'établi) → {ok, err} */
    function recycle(g, k) {
        if (!JUNK[k] || !(g.junk[k] > 0)) return {ok: false, err: 'Rien à démonter.'};
        g.junk[k]--; if (!g.junk[k]) delete g.junk[k]; g.recy.push({k, left: JUNK[k][3]});
        if (!atBase(g).some(p => p.job === 'recycler')) { const free = atBase(g).find(p => !p.baby && p.job === 'libre'); if (free) { free.job = 'recycler'; log(g, `♻️ ${free.name} s’installe pour démonter.`); } }
        return {ok: true};
    }
    function recycled(g, r, p) {
        const got = {...JUNK[r.k][2]}, keys = Object.keys(got);
        // un établi et des mains habiles : une pièce de plus, parfois
        if (keys.length && (has(g, 'etabli') ? 0.35 : 0) + ((p.sk?.reparer || 1) > 1 ? 0.25 : 0) > rnd(g)) { const x = pickOne(g, keys); got[x]++; }
        const lost = [];
        Object.entries(got).forEach(([res, n]) => { const put = add(g, res, n); if (put < n) lost.push(`${n - put} ${resLabel(res)}`); });
        g.stats.recycled = (g.stats.recycled || 0) + 1;
        log(g, `♻️ ${p.name} a démonté ${JUNK[r.k][0]} ${JUNK[r.k][1].toLowerCase()} : ${Object.entries(got).map(([res, n]) => `${n} ${resLabel(res)}`).join(', ')}.${lost.length ? ` Plus de place pour ${lost.join(', ')}.` : ''}`);
    }
    /** l'autonomie de tout le monde (prudent, normal, manuel) ou d'un habitant ; et un ordre tout de suite (boire, manger…) */
    function setAuto(g, mode, id = null) { if (!AUTO[mode] && mode !== '') return; if (id) { const p = g.people.find(x => x.id === id); if (p) { if (mode) p.auto = mode; else delete p.auto; } } else if (mode) g.auto = mode; }
    function orderNeed(g, id, k) {
        const p = g.people.find(x => x.id === id); if (!p || p.hp <= 0 || p.where !== 'base') return {ok: false, err: 'Pas au bunker.'};
        if (!NEEDS.some(([n]) => n === k)) return {ok: false, err: 'Besoin inconnu.'};
        p.act = null; if (!start(g, p, k)) return {ok: false, err: k === 'soif' ? 'Plus d’eau.' : k === 'faim' ? 'Plus de nourriture.' : 'Impossible pour l’instant.'};
        return {ok: true};
    }
    function setJob(g, id, job) { const p = g.people.find(x => x.id === id); if (p && !p.baby && JOBS.includes(job)) { p.job = job; if (job === 'creuser') g.dig.on = true; } }
    /** envoyer un habitant en ville → {ok, err} */
    /** envoyer un habitant en ville : un lieu, ou un parcours de plusieurs lieux (jusqu'à 6) ; à chaque étape, ce qu'on rapporte
     *  (take : clés de ressources et « junk » pour le bric-à-brac ; vide = tout) → {ok, err} */
    function send(g, id, route, take = null) {
        const steps = (Array.isArray(route) ? route : [route]).slice(0, 6).map(st => (typeof st === 'string' ? {id: st, take} : {id: String(st?.id || ''), take: st?.take ?? take, qty: st?.qty}))
            .map(stepOf).filter(st => g.city.places.some(x => x.id === st.id));
        const p = g.people.find(x => x.id === id), pl = steps.length ? g.city.places.find(x => x.id === steps[0].id) : null;
        if (!p || p.hp <= 0) return {ok: false, err: 'Personne à envoyer.'}; if (p.baby) return {ok: false, err: `${p.name} est bien trop petit·e.`}; if (p.where !== 'base') return {ok: false, err: `${p.name} n’est pas au bunker.`}; if (!pl) return {ok: false, err: 'Lieu inconnu.'};
        if (p.act?.k === 'dormir') p.act = null;
        p.where = 'dehors'; p.act = null; p.exp = {route: steps, i: 0, place: pl.id, phase: 'aller', from: g.t, until: g.t + travel(g, pl), loot: {}, junk: [], found: []};
        const total = routeTime(g, steps);
        log(g, `🚶 ${p.name} part vers ${steps.length > 1 ? `${steps.length} lieux : ${steps.map(st => g.city.places.find(x => x.id === st.id).name).join(' → ')}` : pl.name} (${Math.round(total / 60 * 10) / 10} h de marche en tout, sans compter les fouilles).`);
        return {ok: true};
    }
    /** une étape propre : le lieu, ce qu'on rapporte (take : clés, vide = tout) et combien au plus de chaque (qty : {bois: 4}, absent = tout ce qu'il y a) */
    function stepOf(st) {
        const ok = r => RES_KEYS.includes(r) || r === 'junk', take = Array.isArray(st?.take) ? st.take.filter(ok) : [];
        const qty = Object.fromEntries(Object.entries(st?.qty && typeof st.qty === 'object' ? st.qty : {}).filter(([r, n]) => ok(r) && Number(n) > 0).map(([r, n]) => [r, clamp(Math.round(Number(n)), 1, 999)]));
        return {id: String(st?.id || '').slice(0, 12), take: take.length ? take : null, ...(Object.keys(qty).length ? {qty} : {})};
    }
    /** le temps de marche d'un parcours : du bunker au premier lieu, de lieu en lieu, puis le retour */
    function routeTime(g, steps) {
        const pls = steps.map(st => g.city.places.find(x => x.id === (st.id || st))).filter(Boolean); if (!pls.length) return 0;
        let t = travel(g, pls[0]); for (let i = 1; i < pls.length; i++) t += travel(g, pls[i], g.t, pls[i - 1]); return t + travel(g, pls[pls.length - 1]);
    }
    /** la place qu'un habitant a pour rapporter (le sac, son talent, la charrette) */
    const carryOf = (g, p) => Math.round((g.tools.includes('sac') ? 20 : 10) * (p.sk?.fouiller || 1)) + carryBonus(g);
    /** la place en plus grâce aux objets construits (la remorque ne sert qu'avec le vélo) */
    const carryBonus = g => { const ks = kinds(g); return items(g).reduce((n, {k, lvl}) => n + (ITEMS[k]?.carry && (!ITEMS[k].with || ks.includes(ITEMS[k].with)) ? Math.round(ITEMS[k].carry * lvK(lvl)) : 0), 0); };
    const loadOf = e => Object.values(e.loot).reduce((a, b) => a + b, 0) + 2 * (e.junk || []).length;
    /** rappeler par la radio (il faut de l'électricité) */
    function recall(g, id) {
        const p = g.people.find(x => x.id === id); if (!p || p.where !== 'dehors' || !p.exp || p.exp.phase === 'retour') return false;
        if (!g.power) return false;
        const pl = g.city.places.find(x => x.id === p.exp.place), prev = p.exp.i > 0 ? g.city.places.find(x => x.id === p.exp.route[p.exp.i - 1]?.id) : null;
        const back = p.exp.phase === 'aller' ? (prev ? travel(g, prev) : g.t - p.exp.from) : travel(g, pl);
        p.exp.phase = 'retour'; p.exp.until = g.t + Math.max(10, back);
        log(g, `📻 « ${p.name}, rentre ! » — « Bien reçu, je rentre. »`, 'radio'); return true;
    }

    /* ═════════ Les visiteurs à la trappe ═════════ */
    const resLabel = r => RES.find(x => x[0] === r)[2].toLowerCase();
    function newVisit(g) {
        const night = isNight(g.t), day = dayOf(g.t), opts = [['marchand', 0.4]];
        if (g.extras.length && g.people.length < 10) opts.push(['voyageur', 0.3]);
        if (day >= 3 || g.scen === 'invasion') opts.push(['pillards', (night ? 0.6 : 0.3) * (g.scen === 'invasion' ? 2.5 : 1)]);
        let r = rnd(g) * opts.reduce((a, o) => a + o[1], 0), k = opts[0][0]; for (const [kk, w] of opts) { if ((r -= w) <= 0) { k = kk; break; } }
        const v = {k, until: g.t + 120};
        if (k === 'marchand') { const goods = ['nourriture', 'eau', 'essence', 'medic', 'metal', 'pieces', 'bois', 'tissu', 'plantes']; const give = pickOne(g, goods); const want = pickOne(g, goods.filter(x => x !== give));
            v.give = {r: give, n: rint(g, 4, 10)}; v.want = {r: want, n: rint(g, 3, 8)}; log(g, `🔔 On frappe à la trappe : un marchand propose ${v.give.n} ${resLabel(give)} contre ${v.want.n} ${resLabel(want)}.`, 'visite'); }
        if (k === 'voyageur') { v.person = g.extras.shift(); log(g, `🔔 On frappe à la trappe : ${v.person.name}${v.person.occ ? `, ${v.person.occ.toLowerCase()}` : ''}, demande à entrer.`, 'visite'); }
        if (k === 'pillards') { v.demand = {}; ['nourriture', 'eau', 'essence'].forEach(r => { const n = Math.ceil((g.res[r] || 0) * 0.3); if (n) v.demand[r] = n; }); v.strength = Math.round((rint(g, 4, 9) + Math.floor(day / 5)) * DF(g).raid);
            atBase(g).filter(p => trait(p, 'peureux')).forEach(p => { p.mood = clamp((p.mood ?? 70) - 8, 0, 100); });
            log(g, `🔔 Des pillards tapent sur la trappe : ils veulent ${Object.entries(v.demand).map(([r, n]) => `${n} ${resLabel(r)}`).join(', ') || 'tout ce que vous avez'}.`, 'alerte'); }
        g.stats.visits[k]++; g.visit = v;
    }
    /** la force de défense du bunker : porte, pièges, et ceux qui sont là (le tour de garde compte double) */
    const defense = g => items(g).reduce((a, {k, lvl}) => a + (ITEMS[k]?.defense || 0) * lvK(lvl), 0) + atBase(g).filter(p => !p.baby).reduce((a, p) => a + (p.sk?.defendre || 1) * (p.job === 'garde' ? 2 : 1) * (p.ill ? 0.5 : 1) * (trait(p, 'courageux') ? 1.3 : trait(p, 'peureux') ? 0.7 : 1), 0);
    const trait = (p, k) => (p.traits || []).includes(k);
    function fight(g) {
        const v = g.visit, win = defense(g) + rint(g, 0, 4) >= v.strength;
        atBase(g).filter(p => !p.baby).forEach(p => gainXp(g, p, 'defendre', 2));
        if (win) { g.stats.raidsWon++; const drop = rint(g, 1, 3); add(g, 'metal', drop); log(g, `🛡️ Les pillards repartent bredouilles ! Ils ont laissé ${drop} métal en fuyant.`, 'alerte'); }
        else {
            g.stats.raidsLost++; const took = [];
            ['nourriture', 'eau', 'essence', 'medic'].forEach(r => { const n = Math.floor((g.res[r] || 0) * 0.4); if (n) { g.res[r] -= n; took.push(`${n} ${resLabel(r)}`); } });
            const vic = pickOne(g, atBase(g).filter(p => !p.baby)); if (vic) { hurt(g, vic, 15); if (vic.hp > 0) sicken(g, vic, 'blessure'); }
            atBase(g).forEach(p => { p.mood = clamp((p.mood ?? 70) - 10, 0, 100); });
            log(g, `💥 Les pillards forcent la trappe${took.length ? ` et emportent ${took.join(', ')}` : ''}${vic ? ` ; ${vic.name} est blessé·e` : ''}. Une porte renforcée et des pièges aideraient.`, 'alerte');
        }
        g.visit = null;
    }
    /** répondre à la trappe : 'oui' / 'non' (marchand, voyageur), 'donner' / 'resister' (pillards) → {ok, err} */
    function answerVisit(g, choice) {
        const v = g.visit; if (!v) return {ok: false, err: 'Personne à la trappe.'};
        if (v.k === 'marchand') {
            if (choice === 'oui') { if ((g.res[v.want.r] || 0) < v.want.n) return {ok: false, err: `Il manque ${v.want.n - Math.floor(g.res[v.want.r] || 0)} ${resLabel(v.want.r)}.`}; g.res[v.want.r] -= v.want.n; const put = add(g, v.give.r, v.give.n); g.stats.trades++; log(g, `🤝 Marché conclu : ${put} ${resLabel(v.give.r)} contre ${v.want.n} ${resLabel(v.want.r)}.`); }
            else log(g, '🚪 Le marchand repart.');
        } else if (v.k === 'voyageur') {
            if (choice === 'oui' && g.people.length < 10) { const p = mkPerson(g, v.person, false, {needs: {soif: 50, faim: 40, sommeil: 50, hygiene: 30, vessie: 80}, mood: 60}); g.people.push(p); log(g, `🤗 ${p.name} entre dans le bunker${p.from ? ` (${p.from})` : ''}. Une bouche de plus, mais aussi des bras.`, 'alerte'); }
            else log(g, `🚪 ${v.person.name} repart seul·e dans la nuit.`);
        } else if (v.k === 'pillards') {
            if (choice === 'donner') { Object.entries(v.demand).forEach(([r, n]) => { g.res[r] = Math.max(0, g.res[r] - n); }); log(g, '🫳 Vous donnez ce qu’ils demandent. Ils s’en vont… pour cette fois.'); g.visit = null; return {ok: true}; }
            fight(g); return {ok: true};
        }
        g.visit = null; return {ok: true};
    }

    /* ═════════ Les maladies ═════════ */
    function sicken(g, p, k) { if (p.ill && p.ill.k === k) return; p.ill = {k, left: k === 'fievre' ? 24 : 36, treated: false}; }

    /* ═════════ Le temps qui passe (un pas = 10 minutes) ═════════ */
    function step(g) {
        if (g.over) return g;
        const h = STEP / 60, prevHour = hourOf(g.t);
        g.t += STEP;
        const newHour = hourOf(g.t) !== prevHour, hr = hourOf(g.t), season = seasonOf(g);
        // ⚡ l'électricité : d'abord ce qui ne coûte rien (soleil, vent, pédales), puis l'essence (un bon réparateur la fait durer)
        const wasPower = g.power;
        const sun = g.scen === 'hiver' ? hr >= 11 && hr < 14 : hr >= 7 && hr < 19;
        const free = has(g, 'solaire') && sun && !g.weather.rain && g.event?.k !== 'tempete' ? 'soleil' : has(g, 'eolienne') && g.wind ? 'vent' : has(g, 'dynamo') && atBase(g).some(p => p.doing === 'pedaler') ? 'pedales' : '';
        const burn = (has(g, 'econome') ? 0.125 : 0.25) * mult(g, 'burnK') * h / best(g, 'reparer'), store = sumOf(g, 'store');
        g.batt = clamp(Number(g.batt) || 0, 0, store);
        if (free) { g.power = true; g.powerSrc = free; g.batt = Math.min(store, g.batt + h); }
        else if (g.powerOn && has(g, 'generateur') && g.res.essence >= burn) { g.res.essence = Math.max(0, g.res.essence - burn); g.power = true; g.powerSrc = 'essence'; g.batt = Math.min(store, g.batt + h * 0.5); }
        else if (g.powerOn && g.batt >= h) { g.batt -= h; g.power = true; g.powerSrc = 'batteries'; }
        else { g.power = false; g.powerSrc = ''; }
        if (wasPower && !g.power) log(g, g.powerOn && !has(g, 'generateur') ? '⚡ Le groupe électrogène est en panne : le bunker est dans le noir. Il faut le réparer.' : g.powerOn ? '⚡ Plus d’essence : le groupe électrogène s’arrête, le bunker est dans le noir.' : '⚡ Groupe électrogène éteint.', 'alerte');
        if (!wasPower && g.power) { log(g, '⚡ Le courant revient.'); g.radioQueue.splice(0).forEach(m => log(g, m + ' (message reçu en retard)', 'radio')); }
        if (newHour) hourly(g, hr, season);
        if (g.tuto >= 0 && g.tuto < TUTO.length && TUTO[g.tuto][1](g)) { g.tuto++; log(g, g.tuto < TUTO.length ? `📘 Bien joué ! Étape ${g.tuto + 1} / ${TUTO.length} — ${TUTO[g.tuto][0]}` : '📘 Tutoriel terminé : tu sais tout ce qu’il faut. Bonne chance !', 'alerte'); if (g.tuto >= TUTO.length) g.tuto = -1; }
        alive(g).filter(p => p.where === 'base').forEach(p => person(g, p, h));
        alive(g).filter(p => p.where === 'dehors').forEach(p => outside(g, p, h));
        if (g.dig.on && g.dig.done >= DIG_HOURS) {
            g.dig = {on: false, done: 0}; g.floors.push({slots: Array(SLOTS).fill(null)});
            g.people.forEach(p => { if (p.job === 'creuser') p.job = 'libre'; });
            log(g, `⛏️ Un nouvel étage est creusé : étage −${g.floors.length}.`, 'alerte');
        }
        const b = g.builds[0];
        if (b && b.left <= 0 && (b.rep || b.up)) {
            g.builds.shift(); const key = slotKey(b.fi, b.si);
            if (g.floors[b.fi]?.slots[b.si] === b.k) { if (b.rep) { delete g.broken[key]; g.stats.repairs = (g.stats.repairs || 0) + 1; log(g, `✅ ${ITEMS[b.k].name} est réparé.`, 'alerte'); } else { g.lvl[key] = b.up; log(g, `⬆️ ${ITEMS[b.k].name} passe au niveau ${b.up}.`, 'alerte'); } }
            if (!g.builds.length) g.people.forEach(p => { if (p.job === 'construire') p.job = 'libre'; });
        } else if (b && b.left <= 0) {
            g.builds.shift(); g.floors[b.fi].slots[b.si] = b.k; log(g, `✅ ${ITEMS[b.k].name} est prêt.`, 'alerte');
            if (ITEMS[b.k].map) { g.city.places.forEach(pl => { pl.seen = true; }); log(g, '🗺️ Tous les lieux de la ville sont marqués sur la carte.'); }
            if (!g.builds.length) g.people.forEach(p => { if (p.job === 'construire') p.job = 'libre'; });
        }
        if (!alive(g).length) { g.over = true; log(g, `☠️ Plus personne en vie. Le bunker a tenu ${dayOf(g.t) - 1 ? `${dayOf(g.t) - 1} jours` : 'moins d’un jour'}.`, 'alerte'); }
        return g;
    }
    /** ce qui se passe une fois par heure : météo, eau, air, potager, froid, histoires, visiteurs, naissances, la ville */
    function hourly(g, hr, season) {
        g.wind = rnd(g) < 0.4;
        // 🌧️ la pluie (plus au printemps, moins l'été) remplit l'eau à filtrer
        const rainK = season === 'printemps' ? 1.5 : season === 'ete' ? 0.5 : 1;
        if (g.weather.rain && g.t >= g.weather.until) { g.weather.rain = false; log(g, '🌤️ La pluie s’arrête.'); }
        else if (!g.weather.rain && rnd(g) < 0.06 * rainK * (g.scen === 'inondation' ? 3 : 1)) { g.weather = {rain: true, until: g.t + rint(g, 2, g.scen === 'inondation' ? 14 : 8) * 60}; log(g, `🌧️ Il pleut : ${has(g, 'cuve') ? 'les bidons du toit et les cuves' : 'les bidons du toit'} se remplissent (eau à filtrer).`); }
        if (g.weather.rain) add(g, 'eausale', rainPerHour(g));
        // ⚗️ le filtre : 3 L par heure et par filtre ; 1 tissu tous les 30 L pour le nettoyer
        const nf = items(g).filter(x => x.k === 'filtre').reduce((n, x) => n + lvK(x.lvl), 0);
        if (nf) {
            if (g.filterClog && g.res.tissu >= 1) { g.res.tissu -= 1; g.filterClog = false; g.filterUse = 0; log(g, '⚗️ Le filtre est nettoyé (1 tissu) : il marche de nouveau.'); }
            if (!g.filterClog) {
                const n = Math.max(0, Math.min(3 * nf, g.res.eausale, cap(g, 'eau') - g.res.eau));
                if (n > 0) { g.res.eausale -= n; g.res.eau += n; g.filterUse += n; }
                if (g.filterUse >= 30) { if (g.res.tissu >= 1) { g.res.tissu -= 1; g.filterUse = 0; } else { g.filterClog = true; log(g, '⚗️ Le filtre est encrassé : il faut 1 tissu pour le nettoyer.', 'alerte'); } }
            }
        }
        // 🌀 l'air : le conduit s'encrasse, plus vite quand on est nombreux
        g.air = clamp(g.air - (0.6 + 0.25 * atBase(g).length) * kinds(g).filter(k => working(g, k)).reduce((m, k) => m * (ITEMS[k].airK || 1), 1), 0, 100);
        if (g.air < 30 && !g.said.air) { g.said.air = true; log(g, '🌀 L’air devient lourd : le conduit d’aération est encrassé. Quelqu’un de libre ira le nettoyer.', 'alerte'); }
        // 🌱 le potager : des rations toutes les 8 h, des plantes à midi (deux fois plus avec un bon jardinier)
        const pots = items(g).filter(x => x.k === 'potager'), np = pots.reduce((n, x) => n + lvK(x.lvl), 0), green = best(g, 'cultiver') >= 1.5 ? 2 : 1;
        if (pots.length && hr % 8 === 0 && g.power) pots.forEach(x => { if (takeWater(g, 1)) add(g, 'nourriture', green * lvK(x.lvl)); });
        if (np && hr === 12) add(g, 'plantes', np * green);
        // 🏭 ce que fabriquent les objets (serre, clapier, alambic, laboratoire…) : leurs besoins d'abord, leur production ensuite
        produce(g, hr);
        // ❄️ l'hiver : le poêle brûle du bois (ou la chaudière du charbon), sinon on a froid
        g.cold = false; g.warm = opt(g, 'chaines') && g.res.vetements >= atBase(g).filter(p => !p.baby).length && atBase(g).length > 0;
        if (season === 'hiver' || g.event?.k === 'froid') {
            if (hr === 6 && opt(g, 'chaines') && g.res.vetements > 0) g.res.vetements = Math.max(0, g.res.vetements - 0.1 * atBase(g).length); // les vêtements s'usent
            if (has(g, 'poele') && g.res.bois >= 0.25) g.res.bois -= 0.25;
            else if (has(g, 'chaudiere') && g.res.charbon >= 0.25) g.res.charbon -= 0.25;
            else { g.cold = true; if (!g.said.cold) { g.said.cold = true; log(g, `❄️ Il fait froid dans le bunker${has(g, 'poele') ? ' : plus de bois pour le poêle' : ' : il faudrait un poêle à bois'}. On dort mal, le moral baisse.`, 'alerte'); } }
        } else g.said.cold = false;
        if (hr === 6 && dayOf(g.t) > 1 && (dayOf(g.t) - 1) % SEASON_DAYS === 0) { const S = SEASONS.find(x => x[0] === season); log(g, `${S[1]} C’est ${season === 'ete' ? 'l’été' : season === 'hiver' ? 'l’hiver' : season === 'automne' ? 'l’automne' : 'le printemps'}.${season === 'hiver' ? ' Pensez au bois pour le poêle.' : season === 'ete' ? ' Il pleuvra moins : gardez de l’eau.' : ''}`, 'alerte'); }
        // 📖 les histoires du soir
        if (hr === 20) evening(g);
        // 🔔 la trappe
        if (g.visit && g.t >= g.visit.until) { if (g.visit.k === 'pillards') fight(g); else { log(g, g.visit.k === 'marchand' ? '🚪 Personne n’a répondu : le marchand est reparti.' : `🚪 Personne n’a répondu : ${g.visit.person.name} est reparti·e.`); g.visit = null; } }
        else if (!g.visit && (dayOf(g.t) >= 2 || g.scen === 'invasion') && rnd(g) < 0.035) newVisit(g);
        // 👶 une naissance
        if (g.preg && g.t >= g.preg.due) birth(g);
        else if (hr === 22) family(g);
        // les lieux de la ville changent un peu chaque jour, à 6 h, au hasard
        if (hr === 6) g.city.places.forEach(pl => regen(g, pl));
        // 🌪️ les catastrophes (option), 🔧 l'usure, 📻 le commerce par radio, 🎭 l'entente et le journal, 🦠 l'épidémie
        if (opt(g, 'meteo')) weatherEvents(g, season); else if (g.event) g.event = null;
        wear(g);
        trading(g, hr);
        if (hr === 21) { relations(g); diaryDay(g); }
        if (g.scen === 'epidemie' && hr === 9 && rnd(g) < 0.12) { const v = pickOne(g, atBase(g).filter(p => !p.ill && !p.baby)); if (v) { sicken(g, v, 'fievre'); log(g, `🦠 ${v.name} a attrapé la fièvre qui court.`, 'alerte'); diary(g, v, 'J’ai de la fièvre. Pourvu que ce ne soit rien.'); } }
    }
    /* ═════════ 🌪️ Les catastrophes ═════════ */
    function weatherEvents(g, season) {
        if (g.event && g.t >= g.event.until) { log(g, `${EVENTS[g.event.k][0]} ${EVENTS[g.event.k][1]} : c’est fini.`); g.event = null; }
        if (g.event) { if (g.event.k === 'tempete') { g.air = clamp(g.air - 3, 0, 100); alive(g).filter(p => p.where === 'dehors').forEach(p => hurt(g, p, 1.5)); } return; }
        if (dayOf(g.t) < 2 || rnd(g) >= 0.01) return;
        const w = [['canicule', season === 'ete' ? 4 : 0.3], ['tempete', 1], ['inondation', (season === 'printemps' ? 1.5 : 0.6) * (g.scen === 'inondation' ? 4 : 1)], ['seisme', 0.5], ['orage', g.weather.rain ? 2 : 0.6], ['froid', season === 'hiver' ? 0 : season === 'automne' ? 1.5 : 0.5]];
        let r = rnd(g) * w.reduce((a, x) => a + x[1], 0), k = w[0][0]; for (const [kk, n] of w) { if ((r -= n) <= 0) { k = kk; break; } }
        startEvent(g, k);
    }
    function startEvent(g, k) {
        const E = EVENTS[k]; if (!E) return; g.stats.events = (g.stats.events || 0) + 1;
        log(g, `${E[0]} ${E[1]} ! ${E[2][0].toUpperCase()}${E[2].slice(1)}.`, 'alerte');
        const breakables = fl => items(g).filter(x => breakable(x.k) && (fl == null || x.fi === fl));
        if (['canicule', 'tempete', 'froid'].includes(k)) g.event = {k, until: g.t + rint(g, 8, 36) * 60};
        if (k === 'orage') { g.event = {k, until: g.t + rint(g, 3, 8) * 60}; const el = breakables().filter(x => ITEMS[x.k].power || ['generateur', 'solaire', 'eolienne', 'batteries', 'radio'].includes(x.k)); if (el.length) { const x = pickOne(g, el); breakItem(g, x.fi, x.si, 'est grillé par la foudre'); } }
        if (k === 'inondation') { add(g, 'eausale', 15); const l = breakables(g.floors.length - 1); if (l.length) { const x = pickOne(g, l); breakItem(g, x.fi, x.si, 'est noyé'); } }
        if (k === 'seisme') { for (let i = 0; i < rint(g, 1, 2); i++) { const l = breakables(); if (l.length) { const x = pickOne(g, l); breakItem(g, x.fi, x.si, 'est abîmé par la secousse'); } }
            g.dig.done = Math.max(0, g.dig.done - 3); if (rnd(g) < 0.4) { const v = pickOne(g, atBase(g).filter(p => !p.baby)); if (v) { hurt(g, v, 10); if (v.hp > 0) sicken(g, v, 'blessure'); log(g, `🩹 ${v.name} est blessé·e par une chute de gravats.`, 'alerte'); } } }
        atBase(g).forEach(p => diary(g, p, `${E[0]} ${E[1]} aujourd’hui. ${pickOne(g, ['J’ai eu peur.', 'On s’est serré les coudes.', 'Encore une épreuve.', 'Il faudra réparer.'])}`));
    }
    /** 🔧 l'usure : chaque installation peut tomber en panne (plus souvent les machines, et selon la difficulté) */
    function wear(g) {
        if (dayOf(g.t) < 2) return; const K = 0.0012 * DF(g).wear, low = g.floors.length - 1;
        items(g).forEach(x => { if (!breakable(x.k)) return; const e = ITEMS[x.k]; if (rnd(g) < K * (e.power || e.prod || x.k === 'generateur' ? 1.6 : 1) * (g.scen === 'inondation' && low > 0 && x.fi === low ? 2 : 1)) breakItem(g, x.fi, x.si); });
    }
    /* ═════════ 📻 Le commerce par radio ═════════ */
    function marketDay(g) {
        const m = g.market, goods = Object.keys(VALUE); m.d = dayOf(g.t); m.price = Object.fromEntries(goods.map(r => [r, Math.round((0.7 + rnd(g) * 0.7) * 100) / 100]));
        m.offers = Array.from({length: rint(g, 3, 5)}, (_, i) => { const give = pickOne(g, goods), want = pickOne(g, goods.filter(x => x !== give)), n = rint(g, 3, 10);
            return {id: `o${m.d}_${i}`, who: pickOne(g, TRADERS), give: {r: give, n}, want: {r: want, n: Math.max(1, Math.round(n * VALUE[give] * m.price[give] / (VALUE[want] * m.price[want]) * 1.15))}}; });
    }
    function trading(g, hr) {
        const m = g.market;
        if (has(g, 'radio') && hr === 7 && m.d !== dayOf(g.t)) { marketDay(g); if (g.power) log(g, `📻 Le marché de la radio : ${m.offers.length} offres aujourd’hui (onglet Radio).`); }
        m.deals.filter(d => g.t >= d.t).forEach(d => { if (d.ok) { const put = add(g, d.r, d.n); log(g, `🚚 Un messager de ${d.who} apporte ${put} ${resLabel(d.r)}.`, 'alerte'); } else log(g, `😠 Le messager de ${d.who} n’est jamais venu… On s’est fait avoir.`, 'alerte'); });
        m.deals = m.deals.filter(d => g.t < d.t);
    }
    /** accepter une offre du marché : on paie tout de suite, un messager apporte la marchandise quelques heures plus tard → {ok, err} */
    function trade(g, id) {
        if (!has(g, 'radio') || !g.power) return {ok: false, err: 'Il faut la radio et de l’électricité.'};
        const m = g.market, i = m.offers.findIndex(o => o.id === id); if (i < 0) return {ok: false, err: 'Cette offre n’existe plus.'};
        const o = m.offers[i]; if ((g.res[o.want.r] || 0) < o.want.n) return {ok: false, err: `Il manque ${Math.ceil(o.want.n - (g.res[o.want.r] || 0))} ${resLabel(o.want.r)}.`};
        g.res[o.want.r] -= o.want.n; m.offers.splice(i, 1); m.deals.push({t: g.t + rint(g, 3, 8) * 60, r: o.give.r, n: o.give.n, who: o.who, ok: rnd(g) > 0.05}); g.stats.trades++;
        log(g, `📻 Marché conclu avec ${o.who} : ${o.want.n} ${resLabel(o.want.r)} envoyés ; ${o.give.n} ${resLabel(o.give.r)} arriveront par messager.`); return {ok: true};
    }
    /* ═════════ 🎭 L'entente, 📈 les progrès, 📔 le journal ═════════ */
    const relKey = (a, b) => [a.id, b.id].sort().join('|');
    const relOf = (g, a, b) => g.rel?.[relKey(a, b)] || 0;
    function relations(g) {
        const here = atBase(g).filter(p => !p.baby);
        here.forEach((a, i) => here.slice(i + 1).forEach(b => {
            const k = relKey(a, b), before = g.rel[k] || 0;
            const d = rint(g, -2, 3) + 2 * (trait(a, 'sociable') + trait(b, 'sociable')) - (trait(a, 'ronchon') + trait(b, 'ronchon')) + (a.job === b.job && a.job !== 'libre' ? 1 : 0)
                - (g.feud && g.feud.includes(a.id) && g.feud.includes(b.id) ? 3 : 0) - ((trait(a, 'solitaire') || trait(b, 'solitaire')) && here.length > 4 ? 1 : 0);
            const now = clamp(before + d, -50, 50); g.rel[k] = now;
            if (before < 25 && now >= 25) { log(g, `🤝 ${a.name} et ${b.name} sont devenu·e·s ami·e·s.`, 'histoire'); diary(g, a, `${b.name} est devenu·e un·e vrai·e ami·e.`); diary(g, b, `${a.name} est devenu·e un·e vrai·e ami·e.`); }
            if (before > -25 && now <= -25) { log(g, `😠 ${a.name} et ${b.name} ne se supportent plus.`, 'alerte'); diary(g, a, `Je ne supporte plus ${b.name}.`); diary(g, b, `Je ne supporte plus ${a.name}.`); }
        }));
    }
    /** progresser en pratiquant : 12 h de travail pour passer de ×1 à ×1,1, un peu plus ensuite (jusqu'à ×2,5) */
    function gainXp(g, p, k, h) {
        if (!p || p.baby || !SKILL_KEYS.includes(k) || !(h > 0)) return; p.xp = p.xp || {}; p.xp[k] = (p.xp[k] || 0) + h;
        const cur = p.sk[k] || 1, need = 12 + 32 * (cur - 1);
        if (p.xp[k] >= need && cur < 2.5) { p.xp[k] -= need; p.sk[k] = Math.round(Math.min(2.5, cur + 0.1) * 100) / 100; const S = SKILLS.find(x => x[0] === k);
            log(g, `📈 ${p.name} progresse : ${S[1]} ${S[2].toLowerCase()} ×${p.sk[k].toFixed(1).replace('.', ',')}.`); diary(g, p, `J’ai fait des progrès pour ${S[2].toLowerCase()} : ça vient tout seul, maintenant.`); }
    }
    function diary(g, p, txt) { if (!p || p.baby) return; p.diary = Array.isArray(p.diary) ? p.diary : []; p.diary.unshift({d: dayOf(g.t), t: g.t, txt: String(txt).slice(0, 300)}); if (p.diary.length > 40) p.diary.length = 40; }
    /** une ligne par jour et par habitant : comment il se sent, ce qu'il a fait */
    function diaryDay(g) {
        atBase(g).filter(p => !p.baby).forEach(p => {
            const m = p.mood ?? 70;
            const feel = pickOne(g, m >= 75 ? ['Bonne journée.', 'Je me sens bien, malgré tout.', 'On rit encore, ici.'] : m >= 45 ? ['Une journée comme les autres.', 'On tient.', 'Le temps est long sous terre.'] : m >= 20 ? ['Dure journée.', 'J’ai le cafard.', 'Je pense à ceux d’en haut.'] : ['Je n’en peux plus.', 'Tout me pèse.', 'Je voudrais revoir le ciel.']);
            const did = {creuser: 'J’ai creusé toute la journée, j’ai mal au dos.', construire: 'J’ai travaillé à l’atelier.', recycler: 'J’ai démonté de vieux objets : on y trouve de tout.', garde: 'J’ai monté la garde près de la trappe.', pedaler: 'J’ai pédalé pour la lumière.'}[p.job] || '';
            const low = NEEDS.filter(([k]) => p.needs[k] < 20).map(([, , l]) => l.toLowerCase());
            const more = [g.cold ? (g.warm ? 'Il fait froid, heureusement il y a les vêtements chauds.' : 'Il fait si froid…') : '', p.ill ? 'Je suis malade.' : '', low.length ? `Ça ne va pas fort côté ${low.join(', ')}.` : ''];
            diary(g, p, [feel, did, ...more].filter(Boolean).join(' '));
        });
    }

    function produce(g, hr) {
        kinds(g).forEach(k => { const P = ITEMS[k].prod; if (!P || !working(g, k) || (P.every > 1 && hr % P.every !== 0) || (P.day && isNight(g.t))) return;
            if (ITEMS[k].chain && !opt(g, 'chaines')) return;
            const all = items(g).filter(x => x.k === k), ins = Object.entries(P.in || {}), k2 = P.skill && best(g, P.skill) >= 1.5 ? 2 : 1;
            for (const x of all) {
                if (!ins.every(([r, q]) => (g.res[r] || 0) >= q)) { if (!g.said['prod_' + k]) { g.said['prod_' + k] = true; log(g, `${ITEMS[k].ico} ${ITEMS[k].name} : il manque ${ins.filter(([r, q]) => (g.res[r] || 0) < q).map(([r]) => resLabel(r)).join(', ')} pour fonctionner.`); } return; }
                ins.forEach(([r, q]) => { g.res[r] -= q; }); Object.entries(P.out).forEach(([r, q]) => add(g, r, q * k2 * lvK(x.lvl))); g.said['prod_' + k] = false;
                if (P.skill) { const w = atBase(g).filter(o => !o.baby).sort((a, b) => (b.sk?.[P.skill] || 1) - (a.sk?.[P.skill] || 1))[0]; if (w) gainXp(g, w, P.skill, Math.min(P.every, 4)); }
            }
        });
    }
    /** le soir, quelqu'un raconte : un souvenir de la Mémoire familiale (recette, chanson…) ou une vieille histoire ; et la brouille ressort parfois */
    function evening(g) {
        const here = atBase(g), teller = here.filter(p => !p.baby).sort((a, b) => (b.sk?.raconter || 1) - (a.sk?.raconter || 1))[0];
        if (!teller) return;
        const lore = g.lore.length ? g.lore[g.stats.stories % g.lore.length] : null;
        const gain = 8 + ((teller.sk?.raconter || 1) > 1 ? 4 : 0) + (heir(g, 'livre') ? 3 : 0);
        here.forEach(p => { p.mood = clamp((p.mood ?? 70) + gain, 0, 100); });
        g.stats.stories++;
        const what = lore ? (lore.kind === 'recipe' ? `raconte la recette « ${lore.title} »` : lore.kind === 'song' ? `chante « ${lore.title} »` : `raconte le souvenir « ${lore.title} »`) : `raconte ${pickOne(g, TALES)}`;
        const quote = lore?.text ? ` : « ${lore.text.slice(0, 140)}${lore.text.length > 140 ? '…' : ''} »` : '';
        log(g, `📖 Le soir, ${teller.name} ${what}${quote}. Le moral remonte.`, 'histoire'); gainXp(g, teller, 'raconter', 1.5);
        // 👵 l'aîné·e apprend son métier aux autres
        const adults = here.filter(p => !p.baby), elder = adults.slice().sort((a, b) => (a.by || 9999) - (b.by || 9999))[0];
        const sk = elder && SKILL_KEYS.filter(k => (elder.sk?.[k] || 1) >= 1.5).sort((a, b) => elder.sk[b] - elder.sk[a])[0];
        const learner = sk && adults.filter(o => o !== elder && (o.sk?.[sk] || 1) < elder.sk[sk] - 0.2).sort((a, b) => (a.sk[sk] || 1) - (b.sk[sk] || 1))[0];
        if (learner) { gainXp(g, learner, sk, 2); log(g, `👵 ${elder.name} apprend à ${learner.name} à ${SKILLS.find(x => x[0] === sk)[2].toLowerCase()}.`); }
        adults.forEach((a, i) => adults.slice(i + 1).forEach(b => { if (relOf(g, a, b) <= -25 && rnd(g) < 0.3) { a.mood = clamp(a.mood - 5, 0, 100); b.mood = clamp(b.mood - 5, 0, 100); log(g, `💢 ${a.name} et ${b.name} se disputent à table.`); } }));
        if (g.feud) {
            const [a, b] = g.feud.map(id => g.people.find(p => p.id === id));
            if (a && b && a.hp > 0 && b.hp > 0 && a.where === 'base' && b.where === 'base' && rnd(g) < 0.25) { a.mood = clamp(a.mood - 6, 0, 100); b.mood = clamp(b.mood - 6, 0, 100); log(g, `⚡ ${a.name} et ${b.name} se disputent encore (de vieilles histoires de famille).`); }
        }
    }
    /** une naissance possible : un berceau, un couple au moral, qui ne sont pas parents de sang */
    function family(g) {
        if (g.preg || !has(g, 'berceau') || dayOf(g.t) < 5 || g.people.length >= 10) return;
        const ad = atBase(g).filter(p => !p.baby && !p.ill && (p.mood ?? 70) >= 60);
        const couples = [];
        ad.filter(p => p.gender === 'female').forEach(a => ad.filter(p => p.gender === 'male').forEach(b => { if (!a.kin.includes(b.id)) couples.push([a, b, (a.spouses || []).includes(b.id)]); }));
        if (!couples.length) return;
        const [m, f] = couples.find(c => c[2]) || pickOne(g, couples);
        if (rnd(g) < 0.06) { g.preg = {m: m.id, f: f.id, due: g.t + 6 * 1440}; log(g, `🤰 Une bonne nouvelle : ${m.name} attend un bébé de ${f.name}. Naissance dans six jours.`, 'alerte'); }
    }
    function birth(g) {
        const m = g.people.find(p => p.id === g.preg.m), f = g.people.find(p => p.id === g.preg.f); g.preg = null;
        if (!m || m.hp <= 0) return;
        const gender = rnd(g) < 0.5 ? 'female' : 'male', list = g.names[gender === 'female' ? 'f' : 'm'];
        const first = list.length ? pickOne(g, list) : (gender === 'female' ? 'Espérance' : 'Désiré');
        const last = (f?.name || m.name).split(/\s+/).filter(w => w.length > 1 && w === w.toUpperCase()).join(' ') || (f?.name || m.name).split(/\s+/).slice(-1)[0];
        const baby = mkPerson(g, {name: `${first} ${last}`, gender}, false, {baby: true, parents: [m.id, f?.id].filter(Boolean), needs: {soif: 90, faim: 90, sommeil: 90, hygiene: 90, vessie: 90}, mood: 90});
        baby.kin = [m.id, f?.id].filter(Boolean); [m, f].forEach(x => { if (x && !x.kin.includes(baby.id)) x.kin.push(baby.id); });
        g.people.push(baby); g.births.push({name: baby.name, m: m.name, f: f?.name || '', day: dayOf(g.t)}); [m, f].forEach(x => diary(g, x, `${baby.name} est né·e ! Le plus beau jour sous terre.`));
        atBase(g).forEach(p => { p.mood = clamp((p.mood ?? 70) + 15, 0, 100); });
        log(g, `👶 ${baby.name} est né·e au bunker ! ${m.name}${f ? ` et ${f.name}` : ''} sont aux anges.`, 'alerte');
    }
    function hurt(g, p, n) {
        const was = p.hp; p.hp = clamp(p.hp - n, 0, 100);
        if (p.hp <= 0 && was > 0) {
            p.act = null; p.ill = null; g.stats.deaths.push({name: p.name, day: dayOf(g.t)}); alive(g).forEach(o => diary(g, o, `${p.name} nous a quitté·e·s. Je n’arrive pas à y croire.`));
            alive(g).forEach(o => { o.mood = clamp((o.mood ?? 70) - 20, 0, 100); });
            log(g, p.where === 'dehors' ? `📻 Plus de nouvelles de ${p.name}…` : `☠️ ${p.name} est mort·e.`, 'alerte');
        }
    }
    /** la santé : chaque besoin à zéro fait mal ; tous les besoins au-dessus de 30 la font remonter ; une maladie la ronge jusqu'à la guérison */
    function health(g, p, h) {
        let loss = 0; NEEDS.forEach(([k]) => { if (p.needs[k] <= 0) loss += k === 'soif' ? 5 : k === 'faim' ? 3 : 2; });
        if (loss) hurt(g, p, loss * h);
        if (p.hp <= 0) return;
        if (p.ill) {
            hurt(g, p, (p.ill.k === 'fievre' ? 0.8 : 0.5) * h); if (p.hp <= 0) return;
            p.ill.left -= h * (p.where === 'base' ? best(g, 'soigner') * (has(g, 'infirmerie') ? 2 : 1) * mult(g, 'healK') : 0.7);
            if (p.ill.left <= 0) { log(g, `😌 ${p.name} est guéri·e ${p.ill.k === 'fievre' ? 'de sa fièvre' : 'de sa blessure'}.`); p.ill = null; }
            else if (p.where === 'base' && !p.ill.treated) treat(g, p);
        } else if (!loss && NEEDS.every(([k]) => p.needs[k] >= 30)) p.hp = clamp(p.hp + h * (p.where === 'base' && has(g, 'infirmerie') ? 2 : 1), 0, 100);
        if (p.hp > 0 && p.hp < 45 && p.where === 'base' && g.res.medic >= 1 && !p.act) { g.res.medic -= 1; p.hp = clamp(p.hp + 25, 0, 100); log(g, `💊 ${p.name} prend des médicaments.`); }
    }
    /** soigner une maladie : les médicaments d'abord, sinon un remède de grand-mère (les plantes, et une recette de la famille) */
    function treat(g, p) {
        const what = p.ill.k === 'fievre' ? 'sa fièvre' : 'sa blessure';
        if (g.res.medic >= 1) { g.res.medic -= 1; p.ill.left -= 12; p.ill.treated = true; log(g, `💊 ${p.name} prend des médicaments contre ${what}.`); return; }
        if (g.res.plantes >= 1) {
            const healer = atBase(g).filter(o => !o.baby && o !== p).sort((a, b) => (b.sk?.soigner || 1) - (a.sk?.soigner || 1))[0] || p;
            const rec = g.lore.filter(x => x.kind === 'recipe');
            g.res.plantes -= 1; p.ill.left -= 8 * (healer.sk?.soigner || 1); p.ill.treated = true; gainXp(g, healer, 'soigner', 3);
            log(g, `🌿 ${healer === p ? p.name : healer.name} prépare un remède de grand-mère${rec.length ? ` (d’après « ${pickOne(g, rec).title} »)` : ''} contre ${what}${healer === p ? '' : ` de ${p.name}`}.`);
        }
    }
    function decay(g, p, h, k = 1, sleeping = false) {
        const summer = seasonOf(g) === 'ete';
        const D = DF(g).decay, hot = g.event?.k === 'canicule' ? 1.6 : 1;
        NEEDS.forEach(([n]) => { if (sleeping && n === 'sommeil') return; const x = n === 'soif' && summer ? 1.3 : n === 'sommeil' && g.air < 30 ? 1.3 : 1;
            const t = n === 'soif' ? hot : n === 'faim' && trait(p, 'gourmand') ? 1.25 : n === 'sommeil' && trait(p, 'dormeur') ? 1.25 : 1;
            p.needs[n] = clamp(p.needs[n] - DECAY[n] * h * k * x * t * D * (sleeping ? 0.5 : 1), 0, 100); });
    }
    /** où se trouve un objet libre (pour le dessin et les lits) */
    function freeItem(g, k, p) {
        const busy = new Set(g.people.filter(x => x !== p && x.hp > 0 && x.where === 'base' && x.act?.at).map(x => x.act.at.join()));
        return items(g).find(x => x.k === k && (k !== 'lit' || !busy.has(`${x.fi},${x.si}`)));
    }
    const atOf = x => (x ? [x.fi, x.si] : null);
    /** le moral : il s'use doucement sous terre ; le froid, l'air lourd, la faim, la maladie l'usent plus ; la famille autour l'use moins */
    function mood(g, p, h) {
        const near = [...p.kin, ...(p.spouses || [])].some(id => { const o = g.people.find(x => x.id === id); return o && o.hp > 0 && o.where === 'base'; });
        let dm = -0.3 * (heir(g, 'bijou') ? 0.8 : 1) * (near ? 0.75 : 1);
        if (g.cold) dm -= g.warm ? 0.5 : 1.5; if (g.air < 30) dm -= 0.5; if (NEEDS.some(([k]) => p.needs[k] < 15)) dm -= 1; if (p.ill) dm -= 0.5;
        if (trait(p, 'propre') && p.needs.hygiene < 30) dm -= 0.5;
        if (trait(p, 'solitaire') && atBase(g).length > 4) dm -= 0.1;
        if (dm < 0) dm *= trait(p, 'optimiste') ? 0.5 : trait(p, 'ronchon') ? 1.4 : 1;
        // les amis autour remontent le moral, ceux qu'on ne supporte plus le minent
        if (p.where === 'base' && !p.baby) { const others = atBase(g).filter(o => o !== p && !o.baby); dm += 0.1 * Math.min(3, others.filter(o => relOf(g, p, o) >= 25).length) - 0.15 * others.filter(o => relOf(g, p, o) <= -25).length; }
        p.mood = clamp((p.mood ?? 70) + dm * h, 0, 100);
        if (p.mood <= 5 && !p.baby && g.res.nourriture >= 3 && rnd(g) < 0.04 * h) { g.res.nourriture -= 3; log(g, `😫 ${p.name} craque et renverse 3 rations. Il faudrait lui remonter le moral (jeux, musique, histoires).`, 'alerte'); }
    }
    function person(g, p, h) {
        const sleeping = p.act?.k === 'dormir';
        decay(g, p, h, p.baby ? 0.6 : 1, sleeping); mood(g, p, h);
        kinds(g).forEach(k => { const a = ITEMS[k].aura; if (!a || !working(g, k)) return; const K = lvK(bestLvl(g, k)); Object.entries(a).forEach(([n, v0]) => { const v = v0 * K; if (n === 'mood') p.mood = clamp((p.mood ?? 70) + v * h, 0, 100); else if (p.needs[n] != null) p.needs[n] = clamp(p.needs[n] + v * h, 0, 100); }); });
        if (sleeping) { p.needs.sommeil = clamp(p.needs.sommeil + (p.act.at ? 16 * lvK(g.lvl?.[p.act.at.join()]) : 8) * h * (g.cold && !g.warm ? 0.6 : 1) * (heir(g, 'textile') ? 1.1 : 1), 0, 100); if (p.needs.sommeil >= 100 && !isNight(g.t) || p.needs.soif < 12 || p.needs.vessie < 8) { p.act = null; } }
        health(g, p, h); if (p.hp <= 0) return;
        if (p.act && p.act.k !== 'dormir' && g.t >= p.act.until) { finish(g, p); p.act = null; }
        if (p.act) return;
        // le besoin le plus pressant d'abord
        const TH = AUTO[p.auto || g.auto] || AUTO.normal;
        const urgent = NEEDS.map(([k]) => k).filter(k => p.needs[k] < TH[k] || (k === 'sommeil' && isNight(g.t) && p.needs.sommeil < TH.nuit)).sort((a, b) => p.needs[a] - p.needs[b]);
        for (const k of urgent) if (start(g, p, k)) return;
        if (p.baby) { p.doing = ''; return; }
        // 🌀 le conduit d'aération : quelqu'un de libre s'en occupe (n'importe qui si l'air devient vraiment lourd)
        if (g.air < 60 && (p.job === 'libre' || g.air < 30) && !atBase(g).some(o => o.act?.k === 'aerer')) { p.act = {k: 'aerer', until: g.t + Math.round(30 / best(g, 'reparer')), at: null}; p.doing = ''; return; }
        // sans moral, on ne travaille plus
        if (p.mood < 20 && p.job !== 'libre') { if (!p.sulk) { p.sulk = true; log(g, `😞 ${p.name} n’a plus le moral et refuse de travailler.`, 'alerte'); } p.doing = ''; return; }
        if (p.mood >= 30) p.sulk = false;
        const mm = moodMult(p);
        if (p.job === 'creuser' && g.floors.length < MAX_FLOORS) { g.dig.on = true; g.dig.done += h * (g.tools.includes('pelle') ? 2 : 1) * (p.sk?.construire || 1) * mm; gainXp(g, p, 'construire', h * 0.5); p.act = null; p.doing = 'creuser'; return; }
        if (p.job === 'construire' && g.builds.length && g.power && has(g, 'atelier')) { const b0 = g.builds[0], sk0 = b0.rep ? 'reparer' : 'construire';
            b0.left -= h * (g.tools.includes('scie') ? 1.5 : 1) * Math.max(p.sk?.construire || 1, b0.rep ? p.sk?.reparer || 1 : 0) * (heir(g, 'outil') ? 1.2 : 1) * (trait(p, 'bricoleur') ? 1.2 : 1) * mm; gainXp(g, p, sk0, h); p.doing = 'construire'; return; }
        if (p.job === 'recycler') {
            if (!g.recy.length && g.autoRecy) { const k = JUNK_KEYS.find(x => (g.junk[x] || 0) > 0); if (k) recycle(g, k); }
            if (g.recy.length) { g.recy[0].left -= h * mult(g, 'recyK') * (p.sk?.reparer || 1) * (trait(p, 'bricoleur') ? 1.2 : 1) * mm; gainXp(g, p, 'reparer', h); p.doing = 'recycler'; if (g.recy[0].left <= 0) recycled(g, g.recy.shift(), p); return; }
        }
        if (p.job === 'pedaler' && has(g, 'dynamo')) { p.needs.sommeil = clamp(p.needs.sommeil - 2 * h, 0, 100); p.doing = 'pedaler'; return; }
        if (p.job === 'garde') { gainXp(g, p, 'defendre', h * 0.4); p.doing = 'garde'; return; }
        // 🎲 les loisirs, quand le moral n'est pas au mieux
        const fun = kinds(g).filter(k => ITEMS[k].fun && working(g, k)).sort((a, b) => ITEMS[b].fun - ITEMS[a].fun)[0];
        if (p.mood < 75 && fun) { p.act = {k: 'jouer', until: g.t + 60, at: atOf(freeItem(g, fun, p)), fun: ITEMS[fun].fun * lvK(bestLvl(g, fun)), music: fun === 'phono'}; p.doing = ''; return; }
        p.doing = '';
    }
    /** commencer à combler un besoin → vrai si c'est possible */
    function start(g, p, k) {
        if (k === 'soif') { if (g.res.eau >= 1) { p.act = {k: 'boire', until: g.t + 10, at: atOf(freeItem(g, 'gardemanger', p))}; return true; } if (g.res.eausale >= 1) { p.act = {k: 'boiresale', until: g.t + 10, at: null}; return true; } return false; }
        if (k === 'faim') { if (g.res.nourriture < 1) return false; p.act = {k: 'manger', until: g.t + 30, at: atOf(freeItem(g, 'gardemanger', p))}; return true; }
        if (k === 'vessie') { const t = freeItem(g, 'toilettes', p); p.act = {k: t ? 'toilettes' : 'coin', until: g.t + 10, at: atOf(t)}; return true; }
        if (k === 'hygiene') { const d = freeItem(g, 'douche', p), water = g.res.eausale + g.res.eau; if (d && g.power && water >= 3) { p.act = {k: 'douche', until: g.t + 20, at: atOf(d)}; return true; } if (water >= 1) { p.act = {k: 'gant', until: g.t + 20, at: null}; return true; } return false; }
        if (k === 'sommeil') { const l = freeItem(g, 'lit', p); p.act = {k: 'dormir', until: g.t + 360, at: atOf(l)}; return true; }
        return false;
    }
    function finish(g, p) {
        const a = p.act; if (!a) return;
        if (a.k === 'boire') { if (g.res.eau >= 1) { g.res.eau -= 1; p.needs.soif = clamp(p.needs.soif + 55, 0, 100); } }
        if (a.k === 'boiresale') { if (g.res.eausale >= 1) { g.res.eausale -= 1; p.needs.soif = clamp(p.needs.soif + 55, 0, 100); if (!p.ill && rnd(g) < 0.2) { sicken(g, p, 'fievre'); log(g, `🤒 ${p.name} a bu de l’eau de pluie sans la filtrer : la fièvre monte. (Un filtre à eau éviterait ça.)`, 'alerte'); } } }
        if (a.k === 'manger') { if (g.res.nourriture >= 1) { g.res.nourriture -= 1; if (trait(p, 'gourmand')) p.mood = clamp((p.mood ?? 70) + 3, 0, 100); p.needs.faim = clamp(p.needs.faim + 50 * best(g, 'cuisiner') * (heir(g, 'vaisselle') ? 1.2 : 1), 0, 100); } }
        if (a.k === 'toilettes') p.needs.vessie = 100;
        if (a.k === 'coin') { p.needs.vessie = 100; p.needs.hygiene = clamp(p.needs.hygiene - 15, 0, 100); p.mood = clamp((p.mood ?? 70) - 3, 0, 100); if (!g.said.coin) { g.said.coin = true; log(g, `🚽 Pas de toilettes : ${p.name} se soulage dans un coin… Il faudrait en construire.`); } }
        if (a.k === 'douche') { if (takeWater(g, 3)) p.needs.hygiene = 100; }
        if (a.k === 'gant') { if (takeWater(g, 1)) p.needs.hygiene = clamp(p.needs.hygiene + 30, 0, 100); }
        if (a.k === 'jouer') p.mood = clamp((p.mood ?? 70) + 15 * (a.fun || (a.music ? 5 / 3 : 1)), 0, 100);
        if (a.k === 'aerer') { g.air = 100; g.said.air = false; log(g, `🌀 ${p.name} nettoie le conduit d’aération : on respire mieux.`); }
    }
    /** dehors : marcher, fouiller, rentrer ; les nouvelles passent par la radio */
    function outside(g, p, h) {
        decay(g, p, h, 0.8); health(g, p, h); if (p.hp <= 0) { p.exp = null; return; }
        const e = p.exp; if (!e) { p.where = 'base'; return; }
        // de quoi tenir en route : il boit et mange ce qu'il a trouvé
        if (p.needs.soif < 25 && e.loot.eau >= 1) { e.loot.eau--; p.needs.soif = clamp(p.needs.soif + 55, 0, 100); }
        if (p.needs.faim < 25 && e.loot.nourriture >= 1) { e.loot.nourriture--; p.needs.faim = clamp(p.needs.faim + 50, 0, 100); }
        if (g.t < e.until) return;
        const pl = g.city.places.find(x => x.id === e.place);
        if (e.phase === 'aller') {
            e.phase = 'fouille'; e.until = g.t + 120; pl.seen = true;
            if (pl.home && !pl.visits) { p.mood = clamp((p.mood ?? 70) + 12, 0, 100); radio(g, `📻 ${p.name} : « Je suis devant ${pl.name.replace(/^Maison natale de/, 'la maison où est né·e')}. Les volets sont encore là… J’entre. »`); }
            else radio(g, `📻 ${p.name} : « Je suis à ${pl.name}, je fouille. »`);
            return;
        }
        if (e.phase === 'fouille') {
            pl.visits++;
            const st = e.route?.[e.i] || {}, stepTake = st.take || null, q = st.qty || {}, wants = r => !stepTake || stepTake.includes(r), got0 = {};
            const room = r => (q[r] == null || (got0[r] || 0) < q[r]);
            let left = carryOf(g, p) - loadOf(e);
            // le bric-à-brac d'abord s'il est demandé (2 places chacun), puis les ressources choisies, sans dépasser le nombre voulu
            if (wants('junk')) while (left >= 2 && (pl.junk || []).length && room('junk')) { e.junk.push(pl.junk.shift()); got0.junk = (got0.junk || 0) + 1; left -= 2; }
            const avail = Object.keys(pl.stock).filter(r => pl.stock[r] > 0 && wants(r)), can = () => avail.filter(x => pl.stock[x] > 0 && room(x));
            while (left > 0 && can().length) { const r = pickOne(g, can()); pl.stock[r]--; got0[r] = (got0[r] || 0) + 1; e.loot[r] = (e.loot[r] || 0) + 1; left--; }
            // ce qu'on a vu sur place (ce qui reste) : affiché sur la carte, jusqu'à ce que ça change
            pl.known = {d: dayOf(g.t), stock: Object.fromEntries(Object.entries(pl.stock).filter(([, n]) => n > 0)), junk: [...(pl.junk || [])]};
            const tool = pl.tools.find(x => !g.tools.includes(x));
            if (tool && rnd(g) < 0.5) { e.found.push('t:' + tool); pl.tools = pl.tools.filter(x => x !== tool); }
            const missing = FOUND_PLANS.filter(k => (opt(g, 'chaines') || !ITEMS[k].chain) && !g.plans.includes(k) && !g.people.some(o => o.exp?.found.includes('p:' + k)));
            if (pl.plans > 0 && missing.length && rnd(g) < 0.7) { e.found.push('p:' + pickOne(g, missing)); pl.plans--; }
            // ✉️ une lettre de la famille, retrouvée dans une maison ou une bibliothèque
            if (['maison', 'maisonfam', 'bibliotheque'].includes(pl.kind) && g.letters.length && rnd(g) < (pl.home ? 0.6 : 0.12)) e.letters = [...(e.letters || []), g.letters.shift()];
            // 🩹 une mauvaise chute, un chien errant… (moins souvent pour qui sait se défendre)
            if (rnd(g) < 0.08 / (p.sk?.defendre || 1) * (trait(p, 'courageux') ? 0.6 : trait(p, 'solitaire') ? 0.8 : 1) * (g.event?.k === 'tempete' ? 2 : 1)) e.hurt = true;
            // 🦠 l'épidémie : on peut l'attraper dehors
            if (g.scen === 'epidemie' && rnd(g) < 0.12) e.sick = true;
            // 🧳 un objet de famille retrouvé dans les ruines
            if (g.ruins.length && ['maison', 'maisonfam', 'eglise', 'bibliotheque', 'ecole', 'decharge', 'hopital'].includes(pl.kind) && rnd(g) < (pl.home ? 0.5 : 0.12)) e.heir = g.ruins.shift();
            gainXp(g, p, 'fouiller', 2);
            const got = [...Object.entries(e.loot).filter(([, n]) => n > 0).map(([r, n]) => `${n} ${resLabel(r)}`), ...(e.junk.length ? [`${e.junk.length} objet${e.junk.length > 1 ? 's' : ''} à démonter (${[...new Set(e.junk)].map(k => JUNK[k][1].toLowerCase()).join(', ')})`] : [])];
            const extra = [...e.found.map(f => f[0] === 't' ? `l’outil « ${TOOLS[f.slice(2)][1]} »` : `le plan « ${ITEMS[f.slice(2)].name} »`), ...(e.letters || []).map(() => 'une lettre de la famille'), ...(e.heir ? [`« ${e.heir.title} », un objet de la famille`] : [])];
            // l'étape suivante du parcours, s'il reste de la place (sinon on rentre)
            const next = e.route && e.i + 1 < e.route.length && carryOf(g, p) - loadOf(e) > 0 ? g.city.places.find(x => x.id === e.route[e.i + 1].id) : null;
            radio(g, `📻 ${p.name} : « ${got.length || extra.length ? `J’ai trouvé ${[...got, ...extra].join(', ')}` : 'Rien du tout, l’endroit est vide'}.${e.hurt ? ' Je me suis fait mal en route…' : ''} ${next ? `Je continue vers ${next.name}.` : e.route && e.i + 1 < e.route.length ? 'Mon sac est plein : je rentre.' : 'Je rentre.'} »`);
            if (next) { e.i++; e.place = next.id; e.phase = 'aller'; e.from = g.t; e.until = g.t + travel(g, next, g.t, pl); return; }
            e.phase = 'retour'; e.until = g.t + travel(g, pl); return;
        }
        // de retour
        const lost = [];
        Object.entries(e.loot).forEach(([r, n]) => { if (n <= 0) return; const put = add(g, r, n); if (put < n) lost.push(`${n - put} ${resLabel(r)}`); });
        (e.junk || []).forEach(k => { if (junkCount(g) < junkCap(g)) g.junk[k] = (g.junk[k] || 0) + 1; else lost.push(JUNK[k][1].toLowerCase()); });
        e.found.forEach(f => { if (f[0] === 't' && !g.tools.includes(f.slice(2))) g.tools.push(f.slice(2)); if (f[0] === 'p' && !g.plans.includes(f.slice(2))) g.plans.push(f.slice(2)); g.stats.found.push(f[0] === 't' ? TOOLS[f.slice(2)][1] : `plan « ${ITEMS[f.slice(2)].name} »`); });
        log(g, `🏠 ${p.name} est rentré·e.${(e.junk || []).length ? ` ♻️ ${e.junk.length} objet${e.junk.length > 1 ? 's' : ''} à démonter.` : ''}${e.found.length ? ` Nouveau : ${e.found.map(f => f[0] === 't' ? TOOLS[f.slice(2)][1] : 'plan « ' + ITEMS[f.slice(2)].name + ' »').join(', ')}.` : ''}${lost.length ? ` Plus de place pour ${lost.join(', ')} : laissé dehors (construis des étagères ou du stockage).` : ''}`, 'alerte');
        (e.letters || []).forEach(L => { atBase(g).forEach(o => { o.mood = clamp((o.mood ?? 70) + 8, 0, 100); }); g.stats.found.push(`lettre « ${L.title} »`); log(g, `✉️ ${p.name} rapporte une lettre retrouvée : « ${L.title} »${L.from ? `, de ${L.from}` : ''}${L.to ? ` à ${L.to}` : ''}. Tout le monde veut la voir.`, 'histoire'); });
        if (e.hurt) { sicken(g, p, 'blessure'); log(g, `🩹 ${p.name} est blessé·e : il faut la soigner (médicaments, ou plantes pour un remède).`, 'alerte'); }
        if (e.sick && !p.ill) { sicken(g, p, 'fievre'); log(g, `🦠 ${p.name} rentre avec la fièvre qui court en ville.`, 'alerte'); }
        if (e.heir) { const t = `${e.heir.title} ${e.heir.kind} ${e.heir.description}`.toLowerCase(), bonus = HEIRLOOMS.find(([, re]) => re.test(t))[0];
            if (g.coffre.length < 10) g.coffre.push({title: e.heir.title, bonus}); atBase(g).forEach(o => { o.mood = clamp((o.mood ?? 70) + 10, 0, 100); }); g.stats.found.push(`objet de famille « ${e.heir.title} »`);
            log(g, `🧳 ${p.name} rapporte « ${e.heir.title} », un objet de la famille retrouvé dans les ruines ! Il rejoint le coffre (${HEIRLOOMS.find(h => h[0] === bonus)[2]}).`, 'histoire'); }
        const names = (e.route || []).map(st => g.city.places.find(x => x.id === st.id)?.name).filter(Boolean);
        diary(g, p, `Je suis allé·e ${names.length ? `à ${names.join(', puis à ')}` : 'en ville'}. ${Object.keys(e.loot).some(r => e.loot[r] > 0) ? `J’ai rapporté ${Object.entries(e.loot).filter(([, n]) => n > 0).map(([r, n]) => `${n} ${resLabel(r)}`).join(', ')}.` : 'Rien de bien utile.'}${e.heir ? ` Et surtout : « ${e.heir.title} » !` : ''}${e.hurt ? ' Je me suis blessé·e.' : ''}`);
        p.where = 'base'; p.exp = null; p.act = null;
    }
    /** avancer de n minutes (par pas de 10) */
    function run(g, minutes) { for (let m = 0; m < minutes && !g.over; m += STEP) step(g); return g; }

    /** une partie lue d'un fichier : on garde ce qui a la bonne forme (un fichier abîmé ne casse pas le jeu) */
    function check(raw) {
        if (!raw || typeof raw !== 'object' || raw.v !== 1 || !Array.isArray(raw.people) || !Array.isArray(raw.floors) || !raw.city || !Array.isArray(raw.city.places)) throw new Error('Ce fichier n’est pas une partie du bunker.');
        const g = JSON.parse(JSON.stringify(raw)), num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
        g.t = Number(g.t) || 360; g.rng = Number(g.rng) | 0; g.log = Array.isArray(g.log) ? g.log.slice(0, 250).map(l => ({t: Number(l.t) || 0, txt: String(l.txt || '').slice(0, 400), kind: ['info', 'radio', 'alerte', 'histoire', 'visite'].includes(l.kind) ? l.kind : 'info'})) : [];
        g.radioQueue = Array.isArray(g.radioQueue) ? g.radioQueue.map(String).slice(0, 50) : [];
        g.res = Object.fromEntries(RES_KEYS.map(r => [r, Math.max(0, Number(g.res?.[r]) || 0)]));
        g.tools = (g.tools || []).filter(k => TOOLS[k]); g.plans = [...new Set([...BASE_PLANS, ...(g.plans || []).filter(k => ITEMS[k] && !ITEMS[k].fixed)])];
        g.floors = g.floors.slice(0, MAX_FLOORS).map(f => ({slots: Array.from({length: SLOTS}, (_, i) => (ITEMS[f?.slots?.[i]] ? f.slots[i] : null))}));
        if (!g.floors.length) g.floors = [{slots: ['radio', 'generateur', 'atelier', null, null, null]}];
        g.builds = (g.builds || []).filter(b => ITEMS[b.k] && g.floors[b.fi] && b.si >= 0 && b.si < SLOTS).map(b => ({k: b.k, fi: b.fi, si: b.si, left: Number(b.left) || 0, tot: Number(b.tot) || ITEMS[b.k].h,
            ...(b.rep ? {rep: true} : {}), ...([2, 3].includes(b.up) ? {up: b.up} : {}), ...(b.cost && typeof b.cost === 'object' ? {cost: Object.fromEntries(Object.entries(b.cost).filter(([r]) => RES_KEYS.includes(r)).map(([r, n]) => [r, clamp(num(n), 0, 99)]))} : {})}));
        const ids = l => (Array.isArray(l) ? l : []).map(x => String(x).slice(0, 12)).slice(0, 12);
        g.people = g.people.slice(0, 10).map((p, i) => {
            const sk = Object.fromEntries(SKILL_KEYS.map(k => [k, clamp(num(p.sk?.[k], 1), 0.5, 2.5)]));
            return {id: String(p.id || 'h' + (i + 1)).slice(0, 12), pid: Number(p.pid) || 0, name: String(p.name || 'Sans nom').slice(0, 80), gender: String(p.gender || '').slice(0, 10), me: !!p.me,
                hp: clamp(Number(p.hp) || 0, 0, 100), needs: Object.fromEntries(NEEDS.map(([k]) => [k, clamp(Number(p.needs?.[k]) || 0, 0, 100)])),
                where: p.where === 'dehors' && p.exp ? 'dehors' : 'base', act: p.act && typeof p.act === 'object' ? {k: String(p.act.k), until: Number(p.act.until) || 0, at: Array.isArray(p.act.at) ? p.act.at.map(Number) : null, ...(p.act.music ? {music: true} : {})} : null,
                job: JOBS.includes(p.job) ? p.job : 'libre', ...(AUTO[p.auto] ? {auto: p.auto} : {}), exp: p.where === 'dehors' && p.exp ? {route: (Array.isArray(p.exp.route) ? p.exp.route : [{id: p.exp.place}]).slice(0, 6).map(stepOf), i: clamp(Math.round(num(p.exp.i)), 0, 5), junk: (Array.isArray(p.exp.junk) ? p.exp.junk : []).filter(k => JUNK[k]).slice(0, 40), place: String(p.exp.place), phase: ['aller', 'fouille', 'retour'].includes(p.exp.phase) ? p.exp.phase : 'retour', from: Number(p.exp.from) || 0, until: Number(p.exp.until) || 0, loot: Object.fromEntries(Object.entries(p.exp.loot || {}).filter(([r]) => RES_KEYS.includes(r)).map(([r, n]) => [r, Math.max(0, Number(n) || 0)])), found: (p.exp.found || []).map(String).filter(f => (f[0] === 't' && TOOLS[f.slice(2)]) || (f[0] === 'p' && ITEMS[f.slice(2)])), letters: cleanLetters(p.exp.letters), ...(p.exp.hurt ? {hurt: true} : {})} : null,
                mood: clamp(num(p.mood, 70), 0, 100), sk, era: ['ancien', 'moderne'].includes(p.era) ? p.era : '', from: str(p.from, 80), occ: str(p.occ, 60), by: Number(p.by) || 0,
                ill: p.ill && ['fievre', 'blessure'].includes(p.ill.k) ? {k: p.ill.k, left: clamp(num(p.ill.left, 12), 0, 72), treated: !!p.ill.treated} : null,
                kin: ids(p.kin), spouses: ids(p.spouses), baby: !!p.baby, parents: ids(p.parents).slice(0, 2), sulk: !!p.sulk,
                traits: (Array.isArray(p.traits) ? p.traits : []).filter(k => TRAITS[k]).slice(0, 2), xp: Object.fromEntries(SKILL_KEYS.filter(k => num(p.xp?.[k]) > 0).map(k => [k, clamp(num(p.xp[k]), 0, 500)])),
                diary: (Array.isArray(p.diary) ? p.diary : []).slice(0, 40).map(x => ({d: Math.max(1, Math.round(num(x?.d, 1))), t: num(x?.t), txt: str(x?.txt, 300)})).filter(x => x.txt), doing: ['creuser', 'construire', 'recycler', 'pedaler', 'garde'].includes(p.doing) ? p.doing : ''};
        });
        if (!g.people.length) throw new Error('Cette partie n’a aucun habitant.');
        const pids = new Set(g.people.map(p => p.id));
        g.people.forEach(p => { p.kin = p.kin.filter(id => pids.has(id)); p.spouses = p.spouses.filter(id => pids.has(id)); });
        const c = g.city; c.n = clamp(Number(c.n) || 13, 5, 41); // lat, lng : le centre de la ville (plan en fond), ou rien
        { const la = Number(c.lat), lo = Number(c.lng); if (c.lat != null && c.lng != null && Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 85 && Math.abs(lo) <= 180) { c.lat = la; c.lng = lo; } else { delete c.lat; delete c.lng; } c.geo = c.geo === 'none' ? 'none' : undefined; if (c.geo === undefined) delete c.geo; }
        c.name = String(c.name || 'la ville').slice(0, 80); c.size = SIZES[c.size] ? c.size : 'moyenne'; c.base = [Math.floor(c.n / 2), Math.floor(c.n / 2)];
        c.places = c.places.slice(0, 60).filter(pl => PLACE_KINDS[pl.kind]).map((pl, i) => ({id: String(pl.id || 'l' + (i + 1)).slice(0, 12), kind: pl.kind, name: String(pl.name || PLACE_KINDS[pl.kind][1]).slice(0, 120), x: clamp(Number(pl.x) || 0, 0, c.n - 1), y: clamp(Number(pl.y) || 0, 0, c.n - 1),
            stock: Object.fromEntries(Object.entries(pl.stock || {}).filter(([r]) => RES_KEYS.includes(r)).map(([r, n]) => [r, Math.max(0, Number(n) || 0)])), max: Object.fromEntries(Object.entries(pl.max || {}).filter(([r]) => RES_KEYS.includes(r)).map(([r, n]) => [r, Math.max(0, Number(n) || 0)])),
            tools: (pl.tools || []).filter(k => TOOLS[k]), plans: Math.max(0, Number(pl.plans) || 0), visits: Number(pl.visits) || 0, seen: !!pl.seen, junk: (Array.isArray(pl.junk) ? pl.junk : []).filter(k => JUNK[k]).slice(0, 10), ...(pl.home ? {home: true} : {}),
            ...(pl.known && typeof pl.known === 'object' ? {known: {d: Math.max(1, Number(pl.known.d) || 1), stock: Object.fromEntries(Object.entries(pl.known.stock || {}).filter(([r]) => RES_KEYS.includes(r)).map(([r, n]) => [r, Math.max(0, Math.round(Number(n) || 0))])), junk: (Array.isArray(pl.known.junk) ? pl.known.junk : []).filter(k => JUNK[k]).slice(0, 10)}} : {})}));
        g.dig = {on: !!g.dig?.on, done: Math.max(0, Number(g.dig?.done) || 0)}; g.weather = {rain: !!g.weather?.rain, until: Number(g.weather?.until) || 0};
        g.power = !!g.power; g.powerOn = g.powerOn !== false; g.powerSrc = ['essence', 'soleil', 'vent', 'pedales', 'batteries'].includes(g.powerSrc) ? g.powerSrc : (g.power ? 'essence' : ''); g.wind = !!g.wind;
        g.over = !!g.over; g.speed = [0, 1, 2, 4].includes(g.speed) ? g.speed : 1; g.nextId = Math.max(Number(g.nextId) || 0, g.people.length + 1); g.seed = Number(g.seed) | 0;
        // ce qui est venu après la première version (une vieille partie reçoit les valeurs de départ)
        g.junk = Object.fromEntries(Object.entries(g.junk && typeof g.junk === 'object' ? g.junk : {}).filter(([k]) => JUNK[k]).map(([k, n]) => [k, clamp(Math.round(num(n)), 0, 99)]).filter(([, n]) => n > 0));
        g.recy = (Array.isArray(g.recy) ? g.recy : []).filter(r => JUNK[r?.k]).slice(0, 60).map(r => ({k: r.k, left: clamp(num(r.left), 0, 10)}));
        g.autoRecy = !!g.autoRecy; g.auto = AUTO[g.auto] ? g.auto : 'normal'; g.batt = clamp(num(g.batt), 0, 200);
        g.air = clamp(num(g.air, 100), 0, 100); g.filterUse = clamp(num(g.filterUse), 0, 100); g.filterClog = !!g.filterClog; g.cold = !!g.cold; g.season0 = clamp(Math.round(num(g.season0)), 0, 3);
        g.said = Object.fromEntries(['air', 'cold', 'coin', ...Object.keys(ITEMS).map(k => 'prod_' + k)].map(k => [k, !!g.said?.[k]])); if (g._coinSaid) g.said.coin = true; delete g._coinSaid;
        const V = g.visit;
        g.visit = V && ['marchand', 'voyageur', 'pillards'].includes(V.k) ? (V.k === 'marchand' && RES_KEYS.includes(V.give?.r) && RES_KEYS.includes(V.want?.r) ? {k: V.k, until: num(V.until), give: {r: V.give.r, n: clamp(num(V.give.n), 0, 50)}, want: {r: V.want.r, n: clamp(num(V.want.n), 0, 50)}}
            : V.k === 'voyageur' && V.person ? {k: V.k, until: num(V.until), person: cleanExtras([V.person])[0]}
            : V.k === 'pillards' ? {k: V.k, until: num(V.until), strength: clamp(num(V.strength, 6), 0, 50), demand: Object.fromEntries(Object.entries(V.demand || {}).filter(([r]) => RES_KEYS.includes(r)).map(([r, n]) => [r, clamp(num(n), 0, 999)]))} : null) : null;
        g.preg = g.preg && pids.has(String(g.preg.m)) ? {m: String(g.preg.m), f: String(g.preg.f || ''), due: num(g.preg.due)} : null;
        g.births = (Array.isArray(g.births) ? g.births : []).slice(0, 20).map(b => ({name: str(b?.name, 80), m: str(b?.m, 80), f: str(b?.f, 80), day: Number(b?.day) || 1}));
        g.feud = Array.isArray(g.feud) && g.feud.length === 2 && g.feud.every(id => pids.has(String(id))) ? g.feud.map(String) : null;
        g.coffre = (Array.isArray(g.coffre) ? g.coffre : []).slice(0, 10).map(x => ({title: str(x?.title, 80), bonus: HEIRLOOMS.some(h => h[0] === x?.bonus) ? x.bonus : 'souvenir'}));
        // les réglages et ce qui est venu avec : pannes, niveaux, entente, catastrophe en cours, marché, tutoriel, objets à retrouver
        g.opt = cleanOpt(g.opt); g.diff = DIFFS[g.diff] ? g.diff : 'normal'; g.scen = SCENARIOS[g.scen] ? g.scen : 'classique'; g.ruins = cleanRuins(g.ruins);
        const slotOk = key => { const m = /^(\d),(\d)$/.exec(key); return !!m && !!g.floors[+m[1]]?.slots[+m[2]]; };
        g.broken = Object.fromEntries(Object.keys(g.broken && typeof g.broken === 'object' ? g.broken : {}).filter(k => slotOk(k) && breakable(g.floors[+k[0]].slots[+k[2]])).map(k => [k, true]));
        g.lvl = Object.fromEntries(Object.entries(g.lvl && typeof g.lvl === 'object' ? g.lvl : {}).filter(([k]) => slotOk(k)).map(([k, v]) => [k, clamp(Math.round(num(v, 1)), 1, 3)]).filter(([, v]) => v > 1));
        g.rel = Object.fromEntries(Object.entries(g.rel && typeof g.rel === 'object' ? g.rel : {}).filter(([k]) => k.split('|').length === 2 && k.split('|').every(id => pids.has(id))).map(([k, v]) => [k, clamp(Math.round(num(v)), -50, 50)]));
        g.event = g.event && EVENTS[g.event.k] ? {k: g.event.k, until: num(g.event.until)} : null;
        g.tuto = Number.isInteger(g.tuto) && g.tuto >= 0 && g.tuto < TUTO.length ? g.tuto : -1;
        const M = g.market || {}, offer = o => o && RES_KEYS.includes(o.give?.r) && RES_KEYS.includes(o.want?.r);
        g.market = {d: Math.max(0, Math.round(num(M.d))), price: Object.fromEntries(Object.keys(VALUE).map(r => [r, clamp(num(M.price?.[r], 1), 0.5, 2)])),
            offers: (Array.isArray(M.offers) ? M.offers : []).filter(offer).slice(0, 6).map(o => ({id: str(o.id, 20), who: str(o.who, 60), give: {r: o.give.r, n: clamp(Math.round(num(o.give.n)), 1, 99)}, want: {r: o.want.r, n: clamp(Math.round(num(o.want.n)), 1, 99)}})),
            deals: (Array.isArray(M.deals) ? M.deals : []).filter(d => RES_KEYS.includes(d?.r)).slice(0, 10).map(d => ({t: num(d.t), r: d.r, n: clamp(Math.round(num(d.n)), 0, 99), who: str(d.who, 60), ok: d.ok !== false}))};
        g.extras = cleanExtras(g.extras); g.lore = cleanLore(g.lore); g.letters = cleanLetters(g.letters); g.names = cleanNames(g.names);
        const S = g.stats || {};
        g.stats = {deaths: (Array.isArray(S.deaths) ? S.deaths : []).slice(0, 20).map(d => ({name: str(d?.name, 80), day: Number(d?.day) || 1})), visits: Object.fromEntries(['marchand', 'voyageur', 'pillards'].map(k => [k, Math.max(0, num(S.visits?.[k]))])),
            recycled: Math.max(0, num(S.recycled)), repairs: Math.max(0, num(S.repairs)), events: Math.max(0, num(S.events)), raidsWon: Math.max(0, num(S.raidsWon)), raidsLost: Math.max(0, num(S.raidsLost)), stories: Math.max(0, num(S.stories)), trades: Math.max(0, num(S.trades)), found: (Array.isArray(S.found) ? S.found : []).slice(-40).map(x => str(x, 100))};
        return g;
    }

    root.LCNDA_BUNKER = {rainPerHour, SKILLS, SKILL_KEYS, skillsOf, SEASONS, SEASON_DAYS, seasonOf, HEIRLOOMS, JOBS, answerVisit, defense, NEEDS, DECAY, RES, RES_KEYS, ITEMS, TOOLS, PLACE_KINDS, SIZES, SLOTS, MAX_FLOORS, DIG_HOURS, BASE_PLANS, FOUND_PLANS,
        TRAITS, TRAIT_KEYS, DIFFS, SCENARIOS, EVENTS, TUTO, VALUE, CHAIN_RES, setOpt, setDiff, trade, marketDay, startEvent, breakItem, orderRepair, orderUpgrade, repairCost, upgradeCost, upgradable, breakable, gainXp, relOf, lvK, relations,
        JUNK, JUNK_KEYS, AUTO, stockFor, regen, stepOf, carryBonus, recycle, setAuto, orderNeed, routeTime, carryOf, junkCap, junkCount, mult, sumOf, working,
        newGame, step, run, orderBuild, cancelBuild, dismantle, setJob, send, recall, travel, check, cap, has, count, items, alive, hourOf, dayOf, isNight, clock};
})();
