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
    const RES = [['eau', '💧', 'Eau potable', 'L'], ['eausale', '🪣', 'Eau de pluie (à filtrer)', 'L'], ['plantes', '🌿', 'Plantes', ''], ['nourriture', '🥫', 'Nourriture', 'rations'], ['essence', '⛽', 'Essence', 'L'], ['bois', '🪵', 'Bois', ''], ['metal', '🔩', 'Métal', ''], ['pieces', '⚙️', 'Pièces', ''], ['tissu', '🧵', 'Tissu', ''], ['medic', '💊', 'Médicaments', '']];
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
        jeux: {ico: '🎲', name: 'Jeux de société', cost: {bois: 3, tissu: 1}, h: 2, base: true, desc: 'Quand on n’a rien à faire, on joue : le moral remonte.'},
        porte: {ico: '🚪', name: 'Porte renforcée', cost: {metal: 8, pieces: 2}, h: 5, base: true, defense: 3, desc: 'Les pillards ont bien plus de mal à entrer.'},
        pieges: {ico: '🪤', name: 'Pièges dans l’entrée', cost: {bois: 3, metal: 2}, h: 2, base: true, defense: 2, desc: 'Des surprises pour qui force la trappe.'},
        poele: {ico: '🔥', name: 'Poêle à bois', cost: {metal: 4, pieces: 1}, h: 3, base: true, desc: 'L’hiver, il chauffe le bunker (1 bois toutes les 4 heures). Sans lui, on a froid : on dort mal et le moral baisse.'},
        dynamo: {ico: '🚲', name: 'Dynamo à pédales', cost: {metal: 3, pieces: 2}, h: 3, base: true, desc: 'Quelqu’un pédale (travail « Pédaler ») : de l’électricité sans essence, mais on se fatigue.'},
        berceau: {ico: '👶', name: 'Berceau', cost: {bois: 4, tissu: 2}, h: 2, base: true, desc: 'Pour accueillir un bébé (sans berceau, pas de naissance au bunker).'},
        phono: {ico: '🎶', name: 'Tourne-disque', cost: {metal: 2, pieces: 2}, h: 3, desc: 'De la musique (il faut de l’électricité) : le moral remonte deux fois plus vite qu’avec les jeux.'},
        solaire: {ico: '☀️', name: 'Panneau solaire', cost: {metal: 4, pieces: 4}, h: 4, tool: 'cle', desc: 'De l’électricité le jour, quand il ne pleut pas.'},
        eolienne: {ico: '🌬️', name: 'Petite éolienne', cost: {metal: 6, pieces: 3}, h: 5, tool: 'cle', desc: 'De l’électricité quand il y a du vent.'},
        recuperateur: {ico: '🌧️', name: 'Récupérateur de pluie', cost: {metal: 4, pieces: 2}, h: 4, tool: 'cle', desc: 'La pluie remplit l’eau trois fois plus vite (bidons du toit et cuves).'},
        potager: {ico: '🌱', name: 'Potager sous lampe', cost: {bois: 4, pieces: 2}, h: 5, desc: 'Une ration toutes les 8 h (deux avec un bon jardinier), avec 1 L d’eau et de l’électricité ; et des plantes pour les remèdes.'},
        infirmerie: {ico: '🩺', name: 'Infirmerie', cost: {bois: 3, tissu: 4, medic: 2}, h: 4, desc: 'La santé remonte deux fois plus vite.'},
        econome: {ico: '🔋', name: 'Groupe économe', cost: {metal: 6, pieces: 4}, h: 6, tool: 'cle', desc: 'L’électricité coûte moitié moins d’essence.'},
    };
    const BASE_PLANS = Object.keys(ITEMS).filter(k => ITEMS[k].base);
    const FOUND_PLANS = Object.keys(ITEMS).filter(k => !ITEMS[k].base && !ITEMS[k].fixed);
    const TOOLS = {pelle: ['⛏️', 'Pelle', 'creuser deux fois plus vite'], scie: ['🪚', 'Scie', 'construire plus vite'], cle: ['🔧', 'Clé à molette', 'obligatoire pour certains plans'], sac: ['🎒', 'Grand sac', 'rapporter deux fois plus'], lampe: ['🔦', 'Lampe torche', 'marcher de nuit aussi vite que de jour']};
    /** les sortes de lieux : [icône, nom, ressources {clé: [min, max]}, outils qu'on peut y trouver, plans souvent] */
    const PLACE_KINDS = {
        supermarche: ['🛒', 'Supermarché', {nourriture: [8, 20], eau: [6, 16]}, [], false],
        station: ['⛽', 'Station-service', {essence: [8, 24], nourriture: [1, 4]}, [], false],
        quincaillerie: ['🔩', 'Quincaillerie', {metal: [4, 12], pieces: [1, 5]}, ['cle', 'scie', 'pelle'], false],
        menuiserie: ['🪵', 'Menuiserie', {bois: [8, 20]}, ['scie'], false],
        pharmacie: ['💊', 'Pharmacie', {medic: [3, 8], tissu: [1, 4], plantes: [0, 3]}, [], false],
        maison: ['🏚️', 'Maison abandonnée', {nourriture: [1, 6], tissu: [2, 6], bois: [1, 5], eau: [1, 5]}, ['sac', 'lampe'], true],
        garage: ['🚗', 'Garage', {essence: [4, 12], pieces: [2, 6], metal: [2, 6]}, ['cle', 'lampe'], false],
        bibliotheque: ['📚', 'Bibliothèque', {tissu: [0, 2], bois: [0, 3]}, [], true],
        maisonfam: ['🏡', 'Maison de famille', {nourriture: [2, 6], tissu: [2, 6], bois: [2, 6], medic: [0, 2], plantes: [1, 3]}, ['lampe', 'sac'], true],
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
    const SIZES = {petite: [9, 6, 'Petite'], moyenne: [13, 10, 'Moyenne'], grande: [17, 16, 'Grande']};
    const SLOTS = 6, MAX_FLOORS = 6, DIG_HOURS = 30, STEP = 10;
    const STREETS = ['rue de l’Église', 'place du Marché', 'rue Haute', 'chemin du Moulin', 'avenue de la Gare', 'rue des Écoles', 'route nationale', 'quai du Canal', 'rue Neuve', 'impasse des Tilleuls', 'boulevard du Nord', 'rue du Four', 'rue de la Poste', 'chemin des Vignes', 'rue du Lavoir', 'place de la Mairie'];

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
    const items = g => g.floors.flatMap((f, fi) => f.slots.map((k, si) => ({k, fi, si})).filter(x => x.k));
    const count = (g, k) => items(g).filter(x => x.k === k).length;
    const has = (g, k) => count(g, k) > 0;
    const alive = g => g.people.filter(p => p.hp > 0);
    function cap(g, r) {
        let c = r === 'eau' || r === 'eausale' ? BASE_CAP + 20 : BASE_CAP;
        items(g).forEach(({k}) => { const x = ITEMS[k]?.cap; if (!x) return; c += (x.all || 0) + (x[r] || 0); });
        return c;
    }
    const rainPerHour = g => (1 + items(g).reduce((n, {k}) => n + (ITEMS[k]?.rain || 0), 0)) * (has(g, 'recuperateur') ? 3 : 1);
    const seasonOf = g => SEASONS[((Number(g.season0) || 0) + Math.floor((dayOf(g.t) - 1) / SEASON_DAYS)) % 4][0];
    const heir = (g, k) => (g.coffre || []).some(x => x.bonus === k);
    const atBase = g => alive(g).filter(p => p.where === 'base');
    /** la meilleure compétence parmi ceux qui sont au bunker (les bébés ne comptent pas) */
    const best = (g, k) => Math.max(1, ...atBase(g).filter(p => !p.baby && !p.ill).map(p => p.sk?.[k] || 1));
    const moodMult = p => ((p.mood ?? 70) >= 70 ? 1.1 : (p.mood ?? 70) < 20 ? 0.6 : 1);
    /** l'eau pour se laver ou arroser : l'eau de pluie d'abord, puis la potable */
    function takeWater(g, n) { if (g.res.eausale >= n) { g.res.eausale -= n; return true; } if (g.res.eausale + g.res.eau >= n) { const a = g.res.eausale; g.res.eausale = 0; g.res.eau -= n - a; return true; } return false; }
    function log(g, txt, kind = 'info') { g.log.unshift({t: g.t, txt, kind}); if (g.log.length > 250) g.log.length = 250; }
    /** un message de la radio : entendu tout de suite s'il y a de l'électricité, sinon gardé jusqu'au retour du courant */
    function radio(g, txt) { if (g.power) log(g, txt, 'radio'); else g.radioQueue.push(txt); }
    function add(g, r, n) { const before = g.res[r]; g.res[r] = clamp(before + n, 0, cap(g, r)); return g.res[r] - before; }

    /* ═════════ Une nouvelle partie ═════════ */
    /**
     * opts : {seed, me: {pid, name, gender}, team: [{pid, name, gender}], city: {name, size: 'petite'|'moyenne'|'grande'}}
     */
    function newGame(opts = {}) {
        const seed = (Number(opts.seed) || Math.floor(Math.random() * 2 ** 31)) | 0;
        const g = {v: 1, seed, rng: seed, t: 6 * 60, speed: 1, over: false, power: true, powerOn: true, powerSrc: 'essence', weather: {rain: false, until: 0}, wind: false, log: [], radioQueue: [],
            res: {eau: 24, eausale: 0, plantes: 1, nourriture: 16, essence: 20, bois: 14, metal: 6, pieces: 2, tissu: 3, medic: 1}, tools: [], plans: [...BASE_PLANS],
            floors: [{slots: ['radio', 'generateur', 'atelier', null, null, null]}], dig: {on: false, done: 0}, builds: [], people: [], city: null, nextId: 1,
            air: 100, filterUse: 0, filterClog: false, said: {}, cold: false, season0: clamp(Number(opts.season0) || 0, 0, 3), visit: null, preg: null, births: [], feud: null,
            coffre: [], extras: cleanExtras(opts.extras), lore: cleanLore(opts.lore), letters: cleanLetters(opts.letters), names: cleanNames(opts.names),
            stats: {deaths: [], visits: {marchand: 0, voyageur: 0, pillards: 0}, raidsWon: 0, raidsLost: 0, stories: 0, found: [], trades: 0}};
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
        log(g, 'Pour commencer : construire des toilettes et un lit à l’atelier, creuser un étage, et envoyer quelqu’un chercher de quoi tenir.', 'info');
        return g;
    }
    /** un habitant : ses besoins, son moral, ses compétences (métier et époque) */
    function mkPerson(g, p, me, more = {}) {
        const {sk, era, from} = skillsOf(p.occ, p.by);
        return {id: 'h' + g.nextId++, pid: Number(p.pid) || 0, name: String(p.name || 'Sans nom').slice(0, 80), gender: p.gender || '', me: !!me, hp: 100,
            needs: {soif: 85, faim: 80, sommeil: 90, hygiene: 85, vessie: 90}, where: 'base', act: null, job: 'libre', exp: null,
            mood: 70, sk, era, from, occ: String(p.occ || '').slice(0, 60), by: Number(p.by) || 0, ill: null, kin: [], spouses: [], baby: false, parents: [], ...more};
    }
    const str = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
    const cleanExtras = l => (Array.isArray(l) ? l : []).slice(0, 20).map(p => ({pid: Number(p?.pid) || 0, name: str(p?.name, 80) || 'Un voyageur', gender: str(p?.gender, 10), occ: str(p?.occ, 60), by: Number(p?.by) || 0}));
    const cleanLore = l => (Array.isArray(l) ? l : []).slice(0, 40).map(x => ({kind: str(x?.kind, 12), title: str(x?.title, 80), text: str(x?.text, 200)})).filter(x => x.title);
    const cleanLetters = l => (Array.isArray(l) ? l : []).slice(0, 20).map(x => ({title: str(x?.title, 80), from: str(x?.from, 60), to: str(x?.to, 60)})).filter(x => x.title);
    const cleanNames = o => ({f: (Array.isArray(o?.f) ? o.f : []).slice(0, 60).map(x => str(x, 30)).filter(Boolean), m: (Array.isArray(o?.m) ? o.m : []).slice(0, 60).map(x => str(x, 30)).filter(Boolean)});
    function makeCity(g, name, size, homes = []) {
        const [n, nb] = SIZES[size], c = Math.floor(n / 2), places = [], used = new Set([`${c},${c}`]);
        const kinds = Object.keys(PLACE_KINDS), streets = [...STREETS];
        // au moins un de chaque sorte utile, puis au hasard
        const order = ['supermarche', 'station', 'quincaillerie', 'menuiserie', 'pharmacie', 'maison', 'garage', 'bibliotheque'];
        for (let i = 0; i < nb; i++) {
            const kind = i < order.length ? order[i] : pickOne(g, kinds);
            let x, y, tries = 0; do { x = rint(g, 0, n - 1); y = rint(g, 0, n - 1); tries++; } while ((used.has(`${x},${y}`) || Math.abs(x - c) + Math.abs(y - c) < 2) && tries < 200);
            used.add(`${x},${y}`);
            const [, label, res, tools, plans] = PLACE_KINDS[kind], stock = {}, max = {};
            Object.entries(res).forEach(([r, [a, b]]) => { max[r] = b; stock[r] = rint(g, a, b); });
            const street = streets.length ? streets.splice(Math.floor(rnd(g) * streets.length), 1)[0] : `rue n° ${i + 1}`;
            places.push({id: 'l' + (i + 1), kind, name: `${label}, ${street}`, x, y, stock, max, tools: tools.filter(() => rnd(g) < 0.7), plans: plans ? 2 : (rnd(g) < 0.3 ? 1 : 0), visits: 0, seen: false});
        }
        // la maison natale d'un ancêtre né dans cette ville (2 au plus)
        (Array.isArray(homes) ? homes : []).slice(0, 2).forEach((h, j) => {
            let x, y, tries = 0; do { x = rint(g, 0, n - 1); y = rint(g, 0, n - 1); tries++; } while ((used.has(`${x},${y}`) || Math.abs(x - c) + Math.abs(y - c) < 2) && tries < 200);
            if (used.has(`${x},${y}`)) return; used.add(`${x},${y}`);
            const res = PLACE_KINDS.maisonfam[2], stock = {}, max = {};
            Object.entries(res).forEach(([r, [a, b]]) => { max[r] = b; stock[r] = rint(g, a, b); });
            places.push({id: 'm' + (j + 1), kind: 'maisonfam', name: `Maison natale de ${str(h?.name, 60) || 'un ancêtre'}${Number(h?.by) ? ` (${Number(h.by)})` : ''}`, x, y, stock, max, tools: ['lampe'], plans: 1, visits: 0, seen: false, home: true});
        });
        return {name, size, n, base: [c, c], places};
    }
    /** minutes de marche d'un trajet (aller), 30 min par case ; la nuit ×1,5 sans lampe torche */
    function travel(g, place, t = g.t) { const [bx, by] = g.city.base, d = Math.abs(place.x - bx) + Math.abs(place.y - by); return Math.round(d * 30 * (isNight(t) && !g.tools.includes('lampe') ? 1.5 : 1)); }

    /* ═════════ Les ordres du joueur ═════════ */
    /** construire : l'objet est commandé (ressources prises), un habitant « Construire » y travaille à l'atelier → {ok, err} */
    function orderBuild(g, k, fi, si) {
        const it = ITEMS[k]; if (!it || it.fixed) return {ok: false, err: 'Objet inconnu.'};
        if (!g.plans.includes(k)) return {ok: false, err: `Il faut d’abord trouver le plan « ${it.name} ».`};
        if (it.tool && !g.tools.includes(it.tool)) return {ok: false, err: `Il faut l’outil « ${TOOLS[it.tool][1]} ».`};
        const f = g.floors[fi]; if (!f || si < 0 || si >= SLOTS || f.slots[si] || g.builds.some(b => b.fi === fi && b.si === si)) return {ok: false, err: 'Cette place est prise.'};
        const miss = Object.entries(it.cost || {}).filter(([r, n]) => (g.res[r] || 0) < n);
        if (miss.length) return {ok: false, err: `Il manque : ${miss.map(([r, n]) => `${n - (g.res[r] || 0)} ${RES.find(x => x[0] === r)[2].toLowerCase()}`).join(', ')}.`};
        Object.entries(it.cost || {}).forEach(([r, n]) => { g.res[r] -= n; });
        g.builds.push({k, fi, si, left: it.h});
        if (!g.people.some(p => p.hp > 0 && p.where === 'base' && p.job === 'construire')) { const free = alive(g).find(p => p.where === 'base' && p.job === 'libre'); if (free) free.job = 'construire'; }
        log(g, `🛠️ ${it.name} commandé à l’atelier (étage ${fi === 0 ? '−1' : '−' + (fi + 1)}).`);
        return {ok: true};
    }
    function cancelBuild(g, i) { const b = g.builds[i]; if (!b) return; Object.entries(ITEMS[b.k].cost || {}).forEach(([r, n]) => add(g, r, n)); g.builds.splice(i, 1); }
    /** démonter un objet : on récupère la moitié de ce qu'il a coûté */
    function dismantle(g, fi, si) {
        const k = g.floors[fi]?.slots[si]; if (!k || ITEMS[k].fixed) return false;
        g.floors[fi].slots[si] = null; Object.entries(ITEMS[k].cost || {}).forEach(([r, n]) => add(g, r, Math.floor(n / 2)));
        g.people.forEach(p => { if (p.act?.at && p.act.at[0] === fi && p.act.at[1] === si) p.act = null; });
        log(g, `${ITEMS[k].name} démonté.`); return true;
    }
    const JOBS = ['libre', 'creuser', 'construire', 'pedaler', 'garde'];
    function setJob(g, id, job) { const p = g.people.find(x => x.id === id); if (p && !p.baby && JOBS.includes(job)) { p.job = job; if (job === 'creuser') g.dig.on = true; } }
    /** envoyer un habitant en ville → {ok, err} */
    function send(g, id, placeId) {
        const p = g.people.find(x => x.id === id), pl = g.city.places.find(x => x.id === placeId);
        if (!p || p.hp <= 0) return {ok: false, err: 'Personne à envoyer.'}; if (p.baby) return {ok: false, err: `${p.name} est bien trop petit·e.`}; if (p.where !== 'base') return {ok: false, err: `${p.name} n’est pas au bunker.`}; if (!pl) return {ok: false, err: 'Lieu inconnu.'};
        if (p.act?.k === 'dormir') p.act = null;
        p.where = 'dehors'; p.act = null; p.exp = {place: pl.id, phase: 'aller', from: g.t, until: g.t + travel(g, pl), loot: {}, found: []};
        log(g, `🚶 ${p.name} part vers ${pl.name} (${Math.round(travel(g, pl) / 60 * 10) / 10} h de marche).`);
        return {ok: true};
    }
    /** rappeler par la radio (il faut de l'électricité) */
    function recall(g, id) {
        const p = g.people.find(x => x.id === id); if (!p || p.where !== 'dehors' || !p.exp || p.exp.phase === 'retour') return false;
        if (!g.power) return false;
        const pl = g.city.places.find(x => x.id === p.exp.place);
        const back = p.exp.phase === 'aller' ? g.t - p.exp.from : travel(g, pl);
        p.exp.phase = 'retour'; p.exp.until = g.t + Math.max(10, back);
        log(g, `📻 « ${p.name}, rentre ! » — « Bien reçu, je rentre. »`, 'radio'); return true;
    }

    /* ═════════ Les visiteurs à la trappe ═════════ */
    const resLabel = r => RES.find(x => x[0] === r)[2].toLowerCase();
    function newVisit(g) {
        const night = isNight(g.t), day = dayOf(g.t), opts = [['marchand', 0.4]];
        if (g.extras.length && g.people.length < 10) opts.push(['voyageur', 0.3]);
        if (day >= 3) opts.push(['pillards', night ? 0.6 : 0.3]);
        let r = rnd(g) * opts.reduce((a, o) => a + o[1], 0), k = opts[0][0]; for (const [kk, w] of opts) { if ((r -= w) <= 0) { k = kk; break; } }
        const v = {k, until: g.t + 120};
        if (k === 'marchand') { const goods = ['nourriture', 'eau', 'essence', 'medic', 'metal', 'pieces', 'bois', 'tissu', 'plantes']; const give = pickOne(g, goods); const want = pickOne(g, goods.filter(x => x !== give));
            v.give = {r: give, n: rint(g, 4, 10)}; v.want = {r: want, n: rint(g, 3, 8)}; log(g, `🔔 On frappe à la trappe : un marchand propose ${v.give.n} ${resLabel(give)} contre ${v.want.n} ${resLabel(want)}.`, 'visite'); }
        if (k === 'voyageur') { v.person = g.extras.shift(); log(g, `🔔 On frappe à la trappe : ${v.person.name}${v.person.occ ? `, ${v.person.occ.toLowerCase()}` : ''}, demande à entrer.`, 'visite'); }
        if (k === 'pillards') { v.demand = {}; ['nourriture', 'eau', 'essence'].forEach(r => { const n = Math.ceil((g.res[r] || 0) * 0.3); if (n) v.demand[r] = n; }); v.strength = rint(g, 4, 9) + Math.floor(day / 5);
            log(g, `🔔 Des pillards tapent sur la trappe : ils veulent ${Object.entries(v.demand).map(([r, n]) => `${n} ${resLabel(r)}`).join(', ') || 'tout ce que vous avez'}.`, 'alerte'); }
        g.stats.visits[k]++; g.visit = v;
    }
    /** la force de défense du bunker : porte, pièges, et ceux qui sont là (le tour de garde compte double) */
    const defense = g => items(g).reduce((a, {k}) => a + (ITEMS[k]?.defense || 0), 0) + atBase(g).filter(p => !p.baby).reduce((a, p) => a + (p.sk?.defendre || 1) * (p.job === 'garde' ? 2 : 1) * (p.ill ? 0.5 : 1), 0);
    function fight(g) {
        const v = g.visit, win = defense(g) + rint(g, 0, 4) >= v.strength;
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
        const free = has(g, 'solaire') && hr >= 7 && hr < 19 && !g.weather.rain ? 'soleil' : has(g, 'eolienne') && g.wind ? 'vent' : has(g, 'dynamo') && atBase(g).some(p => p.doing === 'pedaler') ? 'pedales' : '';
        const burn = (has(g, 'econome') ? 0.125 : 0.25) * h / best(g, 'reparer');
        if (free) { g.power = true; g.powerSrc = free; }
        else if (g.powerOn && g.res.essence >= burn) { g.res.essence = Math.max(0, g.res.essence - burn); g.power = true; g.powerSrc = 'essence'; }
        else { g.power = false; g.powerSrc = ''; }
        if (wasPower && !g.power) log(g, g.powerOn ? '⚡ Plus d’essence : le groupe électrogène s’arrête, le bunker est dans le noir.' : '⚡ Groupe électrogène éteint.', 'alerte');
        if (!wasPower && g.power) { log(g, '⚡ Le courant revient.'); g.radioQueue.splice(0).forEach(m => log(g, m + ' (message reçu en retard)', 'radio')); }
        if (newHour) hourly(g, hr, season);
        alive(g).filter(p => p.where === 'base').forEach(p => person(g, p, h));
        alive(g).filter(p => p.where === 'dehors').forEach(p => outside(g, p, h));
        if (g.dig.on && g.dig.done >= DIG_HOURS) {
            g.dig = {on: false, done: 0}; g.floors.push({slots: Array(SLOTS).fill(null)});
            g.people.forEach(p => { if (p.job === 'creuser') p.job = 'libre'; });
            log(g, `⛏️ Un nouvel étage est creusé : étage −${g.floors.length}.`, 'alerte');
        }
        const b = g.builds[0];
        if (b && b.left <= 0) {
            g.builds.shift(); g.floors[b.fi].slots[b.si] = b.k; log(g, `✅ ${ITEMS[b.k].name} est prêt.`, 'alerte');
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
        else if (!g.weather.rain && rnd(g) < 0.06 * rainK) { g.weather = {rain: true, until: g.t + rint(g, 2, 8) * 60}; log(g, `🌧️ Il pleut : ${has(g, 'cuve') ? 'les bidons du toit et les cuves' : 'les bidons du toit'} se remplissent (eau à filtrer).`); }
        if (g.weather.rain) add(g, 'eausale', rainPerHour(g));
        // ⚗️ le filtre : 3 L par heure et par filtre ; 1 tissu tous les 30 L pour le nettoyer
        const nf = count(g, 'filtre');
        if (nf) {
            if (g.filterClog && g.res.tissu >= 1) { g.res.tissu -= 1; g.filterClog = false; g.filterUse = 0; log(g, '⚗️ Le filtre est nettoyé (1 tissu) : il marche de nouveau.'); }
            if (!g.filterClog) {
                const n = Math.max(0, Math.min(3 * nf, g.res.eausale, cap(g, 'eau') - g.res.eau));
                if (n > 0) { g.res.eausale -= n; g.res.eau += n; g.filterUse += n; }
                if (g.filterUse >= 30) { if (g.res.tissu >= 1) { g.res.tissu -= 1; g.filterUse = 0; } else { g.filterClog = true; log(g, '⚗️ Le filtre est encrassé : il faut 1 tissu pour le nettoyer.', 'alerte'); } }
            }
        }
        // 🌀 l'air : le conduit s'encrasse, plus vite quand on est nombreux
        g.air = clamp(g.air - (0.6 + 0.25 * atBase(g).length), 0, 100);
        if (g.air < 30 && !g.said.air) { g.said.air = true; log(g, '🌀 L’air devient lourd : le conduit d’aération est encrassé. Quelqu’un de libre ira le nettoyer.', 'alerte'); }
        // 🌱 le potager : des rations toutes les 8 h, des plantes à midi (deux fois plus avec un bon jardinier)
        const np = count(g, 'potager'), green = best(g, 'cultiver') >= 1.5 ? 2 : 1;
        if (np && hr % 8 === 0 && g.power) for (let i = 0; i < np; i++) if (takeWater(g, 1)) add(g, 'nourriture', green);
        if (np && hr === 12) add(g, 'plantes', np * green);
        // ❄️ l'hiver : le poêle brûle du bois, sinon on a froid
        g.cold = false;
        if (season === 'hiver') {
            if (has(g, 'poele') && g.res.bois >= 0.25) g.res.bois -= 0.25;
            else { g.cold = true; if (!g.said.cold) { g.said.cold = true; log(g, `❄️ Il fait froid dans le bunker${has(g, 'poele') ? ' : plus de bois pour le poêle' : ' : il faudrait un poêle à bois'}. On dort mal, le moral baisse.`, 'alerte'); } }
        } else g.said.cold = false;
        if (hr === 6 && dayOf(g.t) > 1 && (dayOf(g.t) - 1) % SEASON_DAYS === 0) { const S = SEASONS.find(x => x[0] === season); log(g, `${S[1]} C’est ${season === 'ete' ? 'l’été' : season === 'hiver' ? 'l’hiver' : season === 'automne' ? 'l’automne' : 'le printemps'}.${season === 'hiver' ? ' Pensez au bois pour le poêle.' : season === 'ete' ? ' Il pleuvra moins : gardez de l’eau.' : ''}`, 'alerte'); }
        // 📖 les histoires du soir
        if (hr === 20) evening(g);
        // 🔔 la trappe
        if (g.visit && g.t >= g.visit.until) { if (g.visit.k === 'pillards') fight(g); else { log(g, g.visit.k === 'marchand' ? '🚪 Personne n’a répondu : le marchand est reparti.' : `🚪 Personne n’a répondu : ${g.visit.person.name} est reparti·e.`); g.visit = null; } }
        else if (!g.visit && dayOf(g.t) >= 2 && rnd(g) < 0.035) newVisit(g);
        // 👶 une naissance
        if (g.preg && g.t >= g.preg.due) birth(g);
        else if (hr === 22) family(g);
        // les lieux de la ville se remplissent un peu chaque jour, à 6 h
        if (hr === 6) g.city.places.forEach(pl => Object.keys(pl.max).forEach(r => { pl.stock[r] = Math.min(pl.max[r], (pl.stock[r] || 0) + Math.ceil(pl.max[r] * (0.15 + rnd(g) * 0.2))); }));
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
        log(g, `📖 Le soir, ${teller.name} ${what}${quote}. Le moral remonte.`, 'histoire');
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
        g.people.push(baby); g.births.push({name: baby.name, m: m.name, f: f?.name || '', day: dayOf(g.t)});
        atBase(g).forEach(p => { p.mood = clamp((p.mood ?? 70) + 15, 0, 100); });
        log(g, `👶 ${baby.name} est né·e au bunker ! ${m.name}${f ? ` et ${f.name}` : ''} sont aux anges.`, 'alerte');
    }
    function hurt(g, p, n) {
        const was = p.hp; p.hp = clamp(p.hp - n, 0, 100);
        if (p.hp <= 0 && was > 0) {
            p.act = null; p.ill = null; g.stats.deaths.push({name: p.name, day: dayOf(g.t)});
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
            p.ill.left -= h * (p.where === 'base' ? best(g, 'soigner') * (has(g, 'infirmerie') ? 2 : 1) : 0.7);
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
            g.res.plantes -= 1; p.ill.left -= 8 * (healer.sk?.soigner || 1); p.ill.treated = true;
            log(g, `🌿 ${healer === p ? p.name : healer.name} prépare un remède de grand-mère${rec.length ? ` (d’après « ${pickOne(g, rec).title} »)` : ''} contre ${what}${healer === p ? '' : ` de ${p.name}`}.`);
        }
    }
    function decay(g, p, h, k = 1, sleeping = false) {
        const summer = seasonOf(g) === 'ete';
        NEEDS.forEach(([n]) => { if (sleeping && n === 'sommeil') return; const x = n === 'soif' && summer ? 1.3 : n === 'sommeil' && g.air < 30 ? 1.3 : 1; p.needs[n] = clamp(p.needs[n] - DECAY[n] * h * k * x * (sleeping ? 0.5 : 1), 0, 100); });
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
        if (g.cold) dm -= 1.5; if (g.air < 30) dm -= 0.5; if (NEEDS.some(([k]) => p.needs[k] < 15)) dm -= 1; if (p.ill) dm -= 0.5;
        p.mood = clamp((p.mood ?? 70) + dm * h, 0, 100);
        if (p.mood <= 5 && !p.baby && g.res.nourriture >= 3 && rnd(g) < 0.04 * h) { g.res.nourriture -= 3; log(g, `😫 ${p.name} craque et renverse 3 rations. Il faudrait lui remonter le moral (jeux, musique, histoires).`, 'alerte'); }
    }
    function person(g, p, h) {
        const sleeping = p.act?.k === 'dormir';
        decay(g, p, h, p.baby ? 0.6 : 1, sleeping); mood(g, p, h);
        if (sleeping) { p.needs.sommeil = clamp(p.needs.sommeil + (p.act.at ? 16 : 8) * h * (g.cold ? 0.6 : 1) * (heir(g, 'textile') ? 1.1 : 1), 0, 100); if (p.needs.sommeil >= 100 && !isNight(g.t) || p.needs.soif < 12 || p.needs.vessie < 8) { p.act = null; } }
        health(g, p, h); if (p.hp <= 0) return;
        if (p.act && p.act.k !== 'dormir' && g.t >= p.act.until) { finish(g, p); p.act = null; }
        if (p.act) return;
        // le besoin le plus pressant d'abord
        const urgent = NEEDS.map(([k]) => k).filter(k => p.needs[k] < ({soif: 35, faim: 35, vessie: 30, hygiene: 25, sommeil: 25}[k]) || (k === 'sommeil' && isNight(g.t) && p.needs.sommeil < 70)).sort((a, b) => p.needs[a] - p.needs[b]);
        for (const k of urgent) if (start(g, p, k)) return;
        if (p.baby) { p.doing = ''; return; }
        // 🌀 le conduit d'aération : quelqu'un de libre s'en occupe (n'importe qui si l'air devient vraiment lourd)
        if (g.air < 60 && (p.job === 'libre' || g.air < 30) && !atBase(g).some(o => o.act?.k === 'aerer')) { p.act = {k: 'aerer', until: g.t + Math.round(30 / best(g, 'reparer')), at: null}; p.doing = ''; return; }
        // sans moral, on ne travaille plus
        if (p.mood < 20 && p.job !== 'libre') { if (!p.sulk) { p.sulk = true; log(g, `😞 ${p.name} n’a plus le moral et refuse de travailler.`, 'alerte'); } p.doing = ''; return; }
        if (p.mood >= 30) p.sulk = false;
        const mm = moodMult(p);
        if (p.job === 'creuser' && g.floors.length < MAX_FLOORS) { g.dig.on = true; g.dig.done += h * (g.tools.includes('pelle') ? 2 : 1) * (p.sk?.construire || 1) * mm; p.act = null; p.doing = 'creuser'; return; }
        if (p.job === 'construire' && g.builds.length && g.power && has(g, 'atelier')) { g.builds[0].left -= h * (g.tools.includes('scie') ? 1.5 : 1) * (p.sk?.construire || 1) * (heir(g, 'outil') ? 1.2 : 1) * mm; p.doing = 'construire'; return; }
        if (p.job === 'pedaler' && has(g, 'dynamo')) { p.needs.sommeil = clamp(p.needs.sommeil - 2 * h, 0, 100); p.doing = 'pedaler'; return; }
        if (p.job === 'garde') { p.doing = 'garde'; return; }
        // 🎲 les loisirs, quand le moral n'est pas au mieux
        const music = has(g, 'phono') && g.power;
        if (p.mood < 75 && (music || has(g, 'jeux'))) { p.act = {k: 'jouer', until: g.t + 60, at: atOf(freeItem(g, music ? 'phono' : 'jeux', p)), music}; p.doing = ''; return; }
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
        if (a.k === 'manger') { if (g.res.nourriture >= 1) { g.res.nourriture -= 1; p.needs.faim = clamp(p.needs.faim + 50 * best(g, 'cuisiner') * (heir(g, 'vaisselle') ? 1.2 : 1), 0, 100); } }
        if (a.k === 'toilettes') p.needs.vessie = 100;
        if (a.k === 'coin') { p.needs.vessie = 100; p.needs.hygiene = clamp(p.needs.hygiene - 15, 0, 100); p.mood = clamp((p.mood ?? 70) - 3, 0, 100); if (!g.said.coin) { g.said.coin = true; log(g, `🚽 Pas de toilettes : ${p.name} se soulage dans un coin… Il faudrait en construire.`); } }
        if (a.k === 'douche') { if (takeWater(g, 3)) p.needs.hygiene = 100; }
        if (a.k === 'gant') { if (takeWater(g, 1)) p.needs.hygiene = clamp(p.needs.hygiene + 30, 0, 100); }
        if (a.k === 'jouer') p.mood = clamp((p.mood ?? 70) + (a.music ? 25 : 15), 0, 100);
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
            const room = Math.round((g.tools.includes('sac') ? 20 : 10) * (p.sk?.fouiller || 1)); let left = room;
            const avail = Object.keys(pl.stock).filter(r => pl.stock[r] > 0);
            while (left > 0 && avail.some(r => pl.stock[r] > 0)) { const r = pickOne(g, avail.filter(x => pl.stock[x] > 0)); pl.stock[r]--; e.loot[r] = (e.loot[r] || 0) + 1; left--; }
            const tool = pl.tools.find(x => !g.tools.includes(x));
            if (tool && rnd(g) < 0.5) { e.found.push('t:' + tool); pl.tools = pl.tools.filter(x => x !== tool); }
            const missing = FOUND_PLANS.filter(k => !g.plans.includes(k) && !g.people.some(o => o.exp?.found.includes('p:' + k)));
            if (pl.plans > 0 && missing.length && rnd(g) < 0.7) { e.found.push('p:' + pickOne(g, missing)); pl.plans--; }
            // ✉️ une lettre de la famille, retrouvée dans une maison ou une bibliothèque
            if (['maison', 'maisonfam', 'bibliotheque'].includes(pl.kind) && g.letters.length && rnd(g) < (pl.home ? 0.6 : 0.12)) e.letters = [...(e.letters || []), g.letters.shift()];
            // 🩹 une mauvaise chute, un chien errant… (moins souvent pour qui sait se défendre)
            if (rnd(g) < 0.08 / (p.sk?.defendre || 1)) e.hurt = true;
            const got = Object.entries(e.loot).filter(([, n]) => n > 0).map(([r, n]) => `${n} ${resLabel(r)}`);
            const extra = [...e.found.map(f => f[0] === 't' ? `l’outil « ${TOOLS[f.slice(2)][1]} »` : `le plan « ${ITEMS[f.slice(2)].name} »`), ...(e.letters || []).map(() => 'une lettre de la famille')];
            radio(g, `📻 ${p.name} : « ${got.length || extra.length ? `J’ai trouvé ${[...got, ...extra].join(', ')}` : 'Rien du tout, l’endroit est vide'}.${e.hurt ? ' Je me suis fait mal en route…' : ''} Je rentre. »`);
            e.phase = 'retour'; e.until = g.t + travel(g, pl); return;
        }
        // de retour
        const lost = [];
        Object.entries(e.loot).forEach(([r, n]) => { if (n <= 0) return; const put = add(g, r, n); if (put < n) lost.push(`${n - put} ${resLabel(r)}`); });
        e.found.forEach(f => { if (f[0] === 't' && !g.tools.includes(f.slice(2))) g.tools.push(f.slice(2)); if (f[0] === 'p' && !g.plans.includes(f.slice(2))) g.plans.push(f.slice(2)); g.stats.found.push(f[0] === 't' ? TOOLS[f.slice(2)][1] : `plan « ${ITEMS[f.slice(2)].name} »`); });
        log(g, `🏠 ${p.name} est rentré·e.${e.found.length ? ` Nouveau : ${e.found.map(f => f[0] === 't' ? TOOLS[f.slice(2)][1] : 'plan « ' + ITEMS[f.slice(2)].name + ' »').join(', ')}.` : ''}${lost.length ? ` Plus de place pour ${lost.join(', ')} : laissé dehors (construis des étagères ou du stockage).` : ''}`, 'alerte');
        (e.letters || []).forEach(L => { atBase(g).forEach(o => { o.mood = clamp((o.mood ?? 70) + 8, 0, 100); }); g.stats.found.push(`lettre « ${L.title} »`); log(g, `✉️ ${p.name} rapporte une lettre retrouvée : « ${L.title} »${L.from ? `, de ${L.from}` : ''}${L.to ? ` à ${L.to}` : ''}. Tout le monde veut la voir.`, 'histoire'); });
        if (e.hurt) { sicken(g, p, 'blessure'); log(g, `🩹 ${p.name} est blessé·e : il faut la soigner (médicaments, ou plantes pour un remède).`, 'alerte'); }
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
        g.builds = (g.builds || []).filter(b => ITEMS[b.k] && g.floors[b.fi] && b.si >= 0 && b.si < SLOTS).map(b => ({k: b.k, fi: b.fi, si: b.si, left: Number(b.left) || 0}));
        const ids = l => (Array.isArray(l) ? l : []).map(x => String(x).slice(0, 12)).slice(0, 12);
        g.people = g.people.slice(0, 10).map((p, i) => {
            const sk = Object.fromEntries(SKILL_KEYS.map(k => [k, clamp(num(p.sk?.[k], 1), 0.5, 2.5)]));
            return {id: String(p.id || 'h' + (i + 1)).slice(0, 12), pid: Number(p.pid) || 0, name: String(p.name || 'Sans nom').slice(0, 80), gender: String(p.gender || '').slice(0, 10), me: !!p.me,
                hp: clamp(Number(p.hp) || 0, 0, 100), needs: Object.fromEntries(NEEDS.map(([k]) => [k, clamp(Number(p.needs?.[k]) || 0, 0, 100)])),
                where: p.where === 'dehors' && p.exp ? 'dehors' : 'base', act: p.act && typeof p.act === 'object' ? {k: String(p.act.k), until: Number(p.act.until) || 0, at: Array.isArray(p.act.at) ? p.act.at.map(Number) : null, ...(p.act.music ? {music: true} : {})} : null,
                job: JOBS.includes(p.job) ? p.job : 'libre', exp: p.where === 'dehors' && p.exp ? {place: String(p.exp.place), phase: ['aller', 'fouille', 'retour'].includes(p.exp.phase) ? p.exp.phase : 'retour', from: Number(p.exp.from) || 0, until: Number(p.exp.until) || 0, loot: Object.fromEntries(Object.entries(p.exp.loot || {}).filter(([r]) => RES_KEYS.includes(r)).map(([r, n]) => [r, Math.max(0, Number(n) || 0)])), found: (p.exp.found || []).map(String).filter(f => (f[0] === 't' && TOOLS[f.slice(2)]) || (f[0] === 'p' && ITEMS[f.slice(2)])), letters: cleanLetters(p.exp.letters), ...(p.exp.hurt ? {hurt: true} : {})} : null,
                mood: clamp(num(p.mood, 70), 0, 100), sk, era: ['ancien', 'moderne'].includes(p.era) ? p.era : '', from: str(p.from, 80), occ: str(p.occ, 60), by: Number(p.by) || 0,
                ill: p.ill && ['fievre', 'blessure'].includes(p.ill.k) ? {k: p.ill.k, left: clamp(num(p.ill.left, 12), 0, 72), treated: !!p.ill.treated} : null,
                kin: ids(p.kin), spouses: ids(p.spouses), baby: !!p.baby, parents: ids(p.parents).slice(0, 2), sulk: !!p.sulk, doing: ['creuser', 'construire', 'pedaler', 'garde'].includes(p.doing) ? p.doing : ''};
        });
        if (!g.people.length) throw new Error('Cette partie n’a aucun habitant.');
        const pids = new Set(g.people.map(p => p.id));
        g.people.forEach(p => { p.kin = p.kin.filter(id => pids.has(id)); p.spouses = p.spouses.filter(id => pids.has(id)); });
        const c = g.city; c.n = clamp(Number(c.n) || 13, 5, 25); // lat, lng : le centre de la ville (plan en fond), ou rien
        { const la = Number(c.lat), lo = Number(c.lng); if (c.lat != null && c.lng != null && Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 85 && Math.abs(lo) <= 180) { c.lat = la; c.lng = lo; } else { delete c.lat; delete c.lng; } c.geo = c.geo === 'none' ? 'none' : undefined; if (c.geo === undefined) delete c.geo; }
        c.name = String(c.name || 'la ville').slice(0, 80); c.size = SIZES[c.size] ? c.size : 'moyenne'; c.base = [Math.floor(c.n / 2), Math.floor(c.n / 2)];
        c.places = c.places.slice(0, 32).filter(pl => PLACE_KINDS[pl.kind]).map((pl, i) => ({id: String(pl.id || 'l' + (i + 1)).slice(0, 12), kind: pl.kind, name: String(pl.name || PLACE_KINDS[pl.kind][1]).slice(0, 120), x: clamp(Number(pl.x) || 0, 0, c.n - 1), y: clamp(Number(pl.y) || 0, 0, c.n - 1),
            stock: Object.fromEntries(Object.entries(pl.stock || {}).filter(([r]) => RES_KEYS.includes(r)).map(([r, n]) => [r, Math.max(0, Number(n) || 0)])), max: Object.fromEntries(Object.entries(pl.max || {}).filter(([r]) => RES_KEYS.includes(r)).map(([r, n]) => [r, Math.max(0, Number(n) || 0)])),
            tools: (pl.tools || []).filter(k => TOOLS[k]), plans: Math.max(0, Number(pl.plans) || 0), visits: Number(pl.visits) || 0, seen: !!pl.seen, ...(pl.home ? {home: true} : {})}));
        g.dig = {on: !!g.dig?.on, done: Math.max(0, Number(g.dig?.done) || 0)}; g.weather = {rain: !!g.weather?.rain, until: Number(g.weather?.until) || 0};
        g.power = !!g.power; g.powerOn = g.powerOn !== false; g.powerSrc = ['essence', 'soleil', 'vent', 'pedales'].includes(g.powerSrc) ? g.powerSrc : (g.power ? 'essence' : ''); g.wind = !!g.wind;
        g.over = !!g.over; g.speed = [0, 1, 2, 4].includes(g.speed) ? g.speed : 1; g.nextId = Math.max(Number(g.nextId) || 0, g.people.length + 1); g.seed = Number(g.seed) | 0;
        // ce qui est venu après la première version (une vieille partie reçoit les valeurs de départ)
        g.air = clamp(num(g.air, 100), 0, 100); g.filterUse = clamp(num(g.filterUse), 0, 100); g.filterClog = !!g.filterClog; g.cold = !!g.cold; g.season0 = clamp(Math.round(num(g.season0)), 0, 3);
        g.said = Object.fromEntries(['air', 'cold', 'coin'].map(k => [k, !!g.said?.[k]])); if (g._coinSaid) g.said.coin = true; delete g._coinSaid;
        const V = g.visit;
        g.visit = V && ['marchand', 'voyageur', 'pillards'].includes(V.k) ? (V.k === 'marchand' && RES_KEYS.includes(V.give?.r) && RES_KEYS.includes(V.want?.r) ? {k: V.k, until: num(V.until), give: {r: V.give.r, n: clamp(num(V.give.n), 0, 50)}, want: {r: V.want.r, n: clamp(num(V.want.n), 0, 50)}}
            : V.k === 'voyageur' && V.person ? {k: V.k, until: num(V.until), person: cleanExtras([V.person])[0]}
            : V.k === 'pillards' ? {k: V.k, until: num(V.until), strength: clamp(num(V.strength, 6), 0, 50), demand: Object.fromEntries(Object.entries(V.demand || {}).filter(([r]) => RES_KEYS.includes(r)).map(([r, n]) => [r, clamp(num(n), 0, 999)]))} : null) : null;
        g.preg = g.preg && pids.has(String(g.preg.m)) ? {m: String(g.preg.m), f: String(g.preg.f || ''), due: num(g.preg.due)} : null;
        g.births = (Array.isArray(g.births) ? g.births : []).slice(0, 20).map(b => ({name: str(b?.name, 80), m: str(b?.m, 80), f: str(b?.f, 80), day: Number(b?.day) || 1}));
        g.feud = Array.isArray(g.feud) && g.feud.length === 2 && g.feud.every(id => pids.has(String(id))) ? g.feud.map(String) : null;
        g.coffre = (Array.isArray(g.coffre) ? g.coffre : []).slice(0, 3).map(x => ({title: str(x?.title, 80), bonus: HEIRLOOMS.some(h => h[0] === x?.bonus) ? x.bonus : 'souvenir'}));
        g.extras = cleanExtras(g.extras); g.lore = cleanLore(g.lore); g.letters = cleanLetters(g.letters); g.names = cleanNames(g.names);
        const S = g.stats || {};
        g.stats = {deaths: (Array.isArray(S.deaths) ? S.deaths : []).slice(0, 20).map(d => ({name: str(d?.name, 80), day: Number(d?.day) || 1})), visits: Object.fromEntries(['marchand', 'voyageur', 'pillards'].map(k => [k, Math.max(0, num(S.visits?.[k]))])),
            raidsWon: Math.max(0, num(S.raidsWon)), raidsLost: Math.max(0, num(S.raidsLost)), stories: Math.max(0, num(S.stories)), trades: Math.max(0, num(S.trades)), found: (Array.isArray(S.found) ? S.found : []).slice(-40).map(x => str(x, 100))};
        return g;
    }

    root.LCNDA_BUNKER = {rainPerHour, SKILLS, SKILL_KEYS, skillsOf, SEASONS, SEASON_DAYS, seasonOf, HEIRLOOMS, JOBS, answerVisit, defense, NEEDS, DECAY, RES, RES_KEYS, ITEMS, TOOLS, PLACE_KINDS, SIZES, SLOTS, MAX_FLOORS, DIG_HOURS, BASE_PLANS, FOUND_PLANS,
        newGame, step, run, orderBuild, cancelBuild, dismantle, setJob, send, recall, travel, check, cap, has, count, items, alive, hourOf, dayOf, isNight, clock};
})();
