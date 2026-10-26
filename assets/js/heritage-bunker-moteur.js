/* LCNDA — ☢ Le bunker : le moteur (sans écran, testable avec node : tests/test-bunker.js).
 * Le temps passe par pas de 10 minutes de jeu (step). Chaque habitant a 5 besoins (100 = comblé, 0 = au bout du rouleau) et une barre de vie ;
 * il va seul boire, manger, dormir, se laver, aux toilettes, puis reprend son travail (creuser un étage, construire à l'atelier).
 * Dehors : une ville tirée au hasard (lieux, ressources qui reviennent chaque jour, outils et plans à trouver) ; la radio donne les nouvelles
 * de ceux qui y sont partis, s'il y a de l'électricité (l'essence du groupe électrogène). Il pleut parfois : les bidons du toit se remplissent.
 */
(() => {
    'use strict';
    const root = typeof window !== 'undefined' ? window : globalThis;

    /* ═════════ Les données ═════════ */
    const NEEDS = [['soif', '💧', 'Soif'], ['faim', '🍞', 'Faim'], ['sommeil', '💤', 'Sommeil'], ['hygiene', '🧼', 'Hygiène'], ['vessie', '🚽', 'Toilettes']];
    /** ce qu'un besoin perd par heure de jeu (éveillé, au bunker) */
    const DECAY = {soif: 4.2, faim: 2.6, sommeil: 3.2, hygiene: 1.6, vessie: 6};
    const RES = [['eau', '💧', 'Eau', 'L'], ['nourriture', '🥫', 'Nourriture', 'rations'], ['essence', '⛽', 'Essence', 'L'], ['bois', '🪵', 'Bois', ''], ['metal', '🔩', 'Métal', ''], ['pieces', '⚙️', 'Pièces', ''], ['tissu', '🧵', 'Tissu', ''], ['medic', '💊', 'Médicaments', '']];
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
        citerne: {ico: '🛢️', name: 'Citerne', cost: {metal: 6, pieces: 1}, h: 4, tool: 'cle', cap: {eau: 60}, desc: '+60 L d’eau de place.'},
        recuperateur: {ico: '🌧️', name: 'Récupérateur de pluie', cost: {metal: 4, pieces: 2}, h: 4, tool: 'cle', desc: 'La pluie remplit l’eau trois fois plus vite.'},
        potager: {ico: '🌱', name: 'Potager sous lampe', cost: {bois: 4, pieces: 2}, h: 5, desc: 'Une ration toutes les 8 h, avec 1 L d’eau et de l’électricité.'},
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
        pharmacie: ['💊', 'Pharmacie', {medic: [3, 8], tissu: [1, 4]}, [], false],
        maison: ['🏚️', 'Maison abandonnée', {nourriture: [1, 6], tissu: [2, 6], bois: [1, 5], eau: [1, 5]}, ['sac', 'lampe'], true],
        garage: ['🚗', 'Garage', {essence: [4, 12], pieces: [2, 6], metal: [2, 6]}, ['cle', 'lampe'], false],
        bibliotheque: ['📚', 'Bibliothèque', {tissu: [0, 2], bois: [0, 3]}, [], true],
    };
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
        let c = r === 'eau' ? BASE_CAP + 20 : BASE_CAP;
        items(g).forEach(({k}) => { const x = ITEMS[k]?.cap; if (!x) return; c += (x.all || 0) + (x[r] || 0); });
        return c;
    }
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
        const g = {v: 1, seed, rng: seed, t: 6 * 60, speed: 1, over: false, power: true, powerOn: true, weather: {rain: false, until: 0}, log: [], radioQueue: [],
            res: {eau: 24, nourriture: 16, essence: 20, bois: 14, metal: 6, pieces: 2, tissu: 3, medic: 1}, tools: [], plans: [...BASE_PLANS],
            floors: [{slots: ['radio', 'generateur', 'atelier', null, null, null]}], dig: {on: false, done: 0}, builds: [], people: [], city: null, nextId: 1};
        const mk = (p, me) => ({id: 'h' + g.nextId++, pid: Number(p.pid) || 0, name: String(p.name || 'Sans nom').slice(0, 80), gender: p.gender || '', me: !!me, hp: 100,
            needs: {soif: 85, faim: 80, sommeil: 90, hygiene: 85, vessie: 90}, where: 'base', act: null, job: 'libre', exp: null});
        g.people.push(mk(opts.me || {name: 'Moi'}, true));
        (opts.team || []).slice(0, 6).forEach(p => g.people.push(mk(p, false)));
        g.city = makeCity(g, String(opts.city?.name || 'la ville').slice(0, 80), SIZES[opts.city?.size] ? opts.city.size : 'moyenne');
        log(g, `Jour 1. La trappe se referme au-dessus de vous : ${g.people.length > 1 ? `${g.people.length} dans le bunker` : 'seul·e dans le bunker'}, à ${g.city.name}.`, 'alerte');
        log(g, 'Pour commencer : construire des toilettes et un lit à l’atelier, creuser un étage, et envoyer quelqu’un chercher de quoi tenir.', 'info');
        return g;
    }
    function makeCity(g, name, size) {
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
    function setJob(g, id, job) { const p = g.people.find(x => x.id === id); if (p && ['libre', 'creuser', 'construire'].includes(job)) { p.job = job; if (job === 'creuser') g.dig.on = true; } }
    /** envoyer un habitant en ville → {ok, err} */
    function send(g, id, placeId) {
        const p = g.people.find(x => x.id === id), pl = g.city.places.find(x => x.id === placeId);
        if (!p || p.hp <= 0) return {ok: false, err: 'Personne à envoyer.'}; if (p.where !== 'base') return {ok: false, err: `${p.name} n’est pas au bunker.`}; if (!pl) return {ok: false, err: 'Lieu inconnu.'};
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

    /* ═════════ Le temps qui passe (un pas = 10 minutes) ═════════ */
    function step(g) {
        if (g.over) return g;
        const h = STEP / 60, prevHour = hourOf(g.t);
        g.t += STEP;
        const newHour = hourOf(g.t) !== prevHour;
        // ⚡ l'électricité
        const wasPower = g.power, burn = (has(g, 'econome') ? 0.125 : 0.25) * h;
        if (g.powerOn && g.res.essence >= burn) { g.res.essence = Math.max(0, g.res.essence - burn); g.power = true; } else g.power = false;
        if (wasPower && !g.power) log(g, g.powerOn ? '⚡ Plus d’essence : le groupe électrogène s’arrête, le bunker est dans le noir.' : '⚡ Groupe électrogène éteint.', 'alerte');
        if (!wasPower && g.power) { log(g, '⚡ Le courant revient.'); g.radioQueue.splice(0).forEach(m => log(g, m + ' (message reçu en retard)', 'radio')); }
        // 🌧️ la météo, chaque heure
        if (newHour) {
            if (g.weather.rain && g.t >= g.weather.until) { g.weather.rain = false; log(g, '🌤️ La pluie s’arrête.'); }
            else if (!g.weather.rain && rnd(g) < 0.06) { g.weather = {rain: true, until: g.t + rint(g, 2, 8) * 60}; log(g, '🌧️ Il pleut : les bidons du toit se remplissent.'); }
            if (g.weather.rain) add(g, 'eau', has(g, 'recuperateur') ? 3 : 1);
            // 🌱 potager, toutes les 8 h
            if (hourOf(g.t) % 8 === 0 && g.power) for (let i = 0; i < count(g, 'potager'); i++) if (g.res.eau >= 1) { g.res.eau -= 1; add(g, 'nourriture', 1); }
            // les lieux de la ville se remplissent un peu chaque jour, à 6 h
            if (hourOf(g.t) === 6) g.city.places.forEach(pl => Object.keys(pl.max).forEach(r => { pl.stock[r] = Math.min(pl.max[r], (pl.stock[r] || 0) + Math.ceil(pl.max[r] * (0.15 + rnd(g) * 0.2))); }));
        }
        // ⛏️ creuser et 🛠️ construire : chaque travailleur ajoute ses heures
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
    function hurt(g, p, n) {
        p.hp = clamp(p.hp - n, 0, 100);
        if (p.hp <= 0) { p.act = null; log(g, p.where === 'dehors' ? `📻 Plus de nouvelles de ${p.name}…` : `☠️ ${p.name} est mort·e.`, 'alerte'); }
    }
    /** la santé : chaque besoin à zéro fait mal ; tous les besoins au-dessus de 30 la font remonter */
    function health(g, p, h) {
        let loss = 0; NEEDS.forEach(([k]) => { if (p.needs[k] <= 0) loss += k === 'soif' ? 5 : k === 'faim' ? 3 : 2; });
        if (loss) hurt(g, p, loss * h);
        else if (NEEDS.every(([k]) => p.needs[k] >= 30)) p.hp = clamp(p.hp + h * (p.where === 'base' && has(g, 'infirmerie') ? 2 : 1), 0, 100);
        if (p.hp > 0 && p.hp < 45 && p.where === 'base' && g.res.medic >= 1 && !p.act) { g.res.medic -= 1; p.hp = clamp(p.hp + 25, 0, 100); log(g, `💊 ${p.name} prend des médicaments.`); }
    }
    function decay(p, h, k = 1, sleeping = false) {
        NEEDS.forEach(([n]) => { if (sleeping && n === 'sommeil') return; p.needs[n] = clamp(p.needs[n] - DECAY[n] * h * k * (sleeping ? 0.5 : 1), 0, 100); });
    }
    /** où se trouve un objet libre (pour le dessin et les lits) */
    function freeItem(g, k, p) {
        const busy = new Set(g.people.filter(x => x !== p && x.hp > 0 && x.where === 'base' && x.act?.at).map(x => x.act.at.join()));
        return items(g).find(x => x.k === k && (k !== 'lit' || !busy.has(`${x.fi},${x.si}`)));
    }
    function person(g, p, h) {
        const sleeping = p.act?.k === 'dormir';
        decay(p, h, 1, sleeping);
        if (sleeping) { p.needs.sommeil = clamp(p.needs.sommeil + (p.act.at ? 16 : 8) * h, 0, 100); if (p.needs.sommeil >= 100 && !isNight(g.t) || p.needs.soif < 12 || p.needs.vessie < 8) { p.act = null; } }
        health(g, p, h); if (p.hp <= 0) return;
        if (p.act && p.act.k !== 'dormir' && g.t >= p.act.until) { finish(g, p); p.act = null; }
        if (p.act) return;
        // le besoin le plus pressant d'abord
        const urgent = NEEDS.map(([k]) => k).filter(k => p.needs[k] < ({soif: 35, faim: 35, vessie: 30, hygiene: 25, sommeil: 25}[k]) || (k === 'sommeil' && isNight(g.t) && p.needs.sommeil < 70)).sort((a, b) => p.needs[a] - p.needs[b]);
        for (const k of urgent) if (start(g, p, k)) return;
        // sinon le travail
        if (p.job === 'creuser' && g.floors.length < MAX_FLOORS) { g.dig.on = true; g.dig.done += h * (g.tools.includes('pelle') ? 2 : 1); p.act = null; p.doing = 'creuser'; return; }
        if (p.job === 'construire' && g.builds.length && g.power && has(g, 'atelier')) { g.builds[0].left -= h * (g.tools.includes('scie') ? 1.5 : 1); p.doing = 'construire'; return; }
        p.doing = '';
    }
    /** commencer à combler un besoin → vrai si c'est possible */
    function start(g, p, k) {
        const at = x => (x ? [x.fi, x.si] : null);
        if (k === 'soif') { if (g.res.eau < 1) return false; p.act = {k: 'boire', until: g.t + 10, at: at(freeItem(g, 'gardemanger', p))}; return true; }
        if (k === 'faim') { if (g.res.nourriture < 1) return false; p.act = {k: 'manger', until: g.t + 30, at: at(freeItem(g, 'gardemanger', p))}; return true; }
        if (k === 'vessie') { const t = freeItem(g, 'toilettes', p); p.act = {k: t ? 'toilettes' : 'coin', until: g.t + 10, at: at(t)}; return true; }
        if (k === 'hygiene') { const d = freeItem(g, 'douche', p); if (d && g.power && g.res.eau >= 3) { p.act = {k: 'douche', until: g.t + 20, at: at(d)}; return true; } if (g.res.eau >= 1) { p.act = {k: 'gant', until: g.t + 20, at: null}; return true; } return false; }
        if (k === 'sommeil') { const l = freeItem(g, 'lit', p); p.act = {k: 'dormir', until: g.t + 360, at: at(l)}; return true; }
        return false;
    }
    function finish(g, p) {
        const a = p.act; if (!a) return;
        if (a.k === 'boire') { if (g.res.eau >= 1) { g.res.eau -= 1; p.needs.soif = clamp(p.needs.soif + 55, 0, 100); } }
        if (a.k === 'manger') { if (g.res.nourriture >= 1) { g.res.nourriture -= 1; p.needs.faim = clamp(p.needs.faim + 50, 0, 100); } }
        if (a.k === 'toilettes') p.needs.vessie = 100;
        if (a.k === 'coin') { p.needs.vessie = 100; p.needs.hygiene = clamp(p.needs.hygiene - 15, 0, 100); if (!g._coinSaid) { g._coinSaid = true; log(g, `🚽 Pas de toilettes : ${p.name} se soulage dans un coin… Il faudrait en construire.`); } }
        if (a.k === 'douche') { if (g.res.eau >= 3) { g.res.eau -= 3; p.needs.hygiene = 100; } }
        if (a.k === 'gant') { if (g.res.eau >= 1) { g.res.eau -= 1; p.needs.hygiene = clamp(p.needs.hygiene + 30, 0, 100); } }
    }
    /** dehors : marcher, fouiller, rentrer ; les nouvelles passent par la radio */
    function outside(g, p, h) {
        decay(p, h, 0.8); health(g, p, h); if (p.hp <= 0) { p.exp = null; return; }
        const e = p.exp; if (!e) { p.where = 'base'; return; }
        // de quoi tenir en route : il boit et mange ce qu'il a trouvé
        if (p.needs.soif < 25 && e.loot.eau >= 1) { e.loot.eau--; p.needs.soif = clamp(p.needs.soif + 55, 0, 100); }
        if (p.needs.faim < 25 && e.loot.nourriture >= 1) { e.loot.nourriture--; p.needs.faim = clamp(p.needs.faim + 50, 0, 100); }
        if (g.t < e.until) return;
        const pl = g.city.places.find(x => x.id === e.place);
        if (e.phase === 'aller') { e.phase = 'fouille'; e.until = g.t + 120; pl.seen = true; radio(g, `📻 ${p.name} : « Je suis à ${pl.name}, je fouille. »`); return; }
        if (e.phase === 'fouille') {
            pl.visits++;
            const room = g.tools.includes('sac') ? 20 : 10; let left = room;
            const avail = Object.keys(pl.stock).filter(r => pl.stock[r] > 0);
            while (left > 0 && avail.some(r => pl.stock[r] > 0)) { const r = pickOne(g, avail.filter(x => pl.stock[x] > 0)); pl.stock[r]--; e.loot[r] = (e.loot[r] || 0) + 1; left--; }
            const tool = pl.tools.find(x => !g.tools.includes(x));
            if (tool && rnd(g) < 0.5) { e.found.push('t:' + tool); pl.tools = pl.tools.filter(x => x !== tool); }
            const missing = FOUND_PLANS.filter(k => !g.plans.includes(k) && !g.people.some(o => o.exp?.found.includes('p:' + k)));
            if (pl.plans > 0 && missing.length && rnd(g) < 0.7) { e.found.push('p:' + pickOne(g, missing)); pl.plans--; }
            const got = Object.entries(e.loot).filter(([, n]) => n > 0).map(([r, n]) => `${n} ${RES.find(x => x[0] === r)[2].toLowerCase()}`);
            const extra = e.found.map(f => f[0] === 't' ? `l’outil « ${TOOLS[f.slice(2)][1]} »` : `le plan « ${ITEMS[f.slice(2)].name} »`);
            radio(g, `📻 ${p.name} : « ${got.length || extra.length ? `J’ai trouvé ${[...got, ...extra].join(', ')}` : 'Rien du tout, l’endroit est vide'}. Je rentre. »`);
            e.phase = 'retour'; e.until = g.t + travel(g, pl); return;
        }
        // de retour
        const lost = [];
        Object.entries(e.loot).forEach(([r, n]) => { if (n <= 0) return; const put = add(g, r, n); if (put < n) lost.push(`${n - put} ${RES.find(x => x[0] === r)[2].toLowerCase()}`); });
        e.found.forEach(f => { if (f[0] === 't' && !g.tools.includes(f.slice(2))) g.tools.push(f.slice(2)); if (f[0] === 'p' && !g.plans.includes(f.slice(2))) g.plans.push(f.slice(2)); });
        log(g, `🏠 ${p.name} est rentré·e.${e.found.length ? ` Nouveau : ${e.found.map(f => f[0] === 't' ? TOOLS[f.slice(2)][1] : 'plan « ' + ITEMS[f.slice(2)].name + ' »').join(', ')}.` : ''}${lost.length ? ` Plus de place pour ${lost.join(', ')} : laissé dehors (construis des étagères ou du stockage).` : ''}`, 'alerte');
        p.where = 'base'; p.exp = null; p.act = null;
    }
    /** avancer de n minutes (par pas de 10) */
    function run(g, minutes) { for (let m = 0; m < minutes && !g.over; m += STEP) step(g); return g; }

    /** une partie lue d'un fichier : on garde ce qui a la bonne forme (un fichier abîmé ne casse pas le jeu) */
    function check(raw) {
        if (!raw || typeof raw !== 'object' || raw.v !== 1 || !Array.isArray(raw.people) || !Array.isArray(raw.floors) || !raw.city || !Array.isArray(raw.city.places)) throw new Error('Ce fichier n’est pas une partie du bunker.');
        const g = JSON.parse(JSON.stringify(raw));
        g.t = Number(g.t) || 360; g.rng = Number(g.rng) | 0; g.log = Array.isArray(g.log) ? g.log.slice(0, 250).map(l => ({t: Number(l.t) || 0, txt: String(l.txt || '').slice(0, 400), kind: ['info', 'radio', 'alerte'].includes(l.kind) ? l.kind : 'info'})) : [];
        g.radioQueue = Array.isArray(g.radioQueue) ? g.radioQueue.map(String).slice(0, 50) : [];
        g.res = Object.fromEntries(RES_KEYS.map(r => [r, Math.max(0, Number(g.res?.[r]) || 0)]));
        g.tools = (g.tools || []).filter(k => TOOLS[k]); g.plans = [...new Set([...BASE_PLANS, ...(g.plans || []).filter(k => ITEMS[k] && !ITEMS[k].fixed)])];
        g.floors = g.floors.slice(0, MAX_FLOORS).map(f => ({slots: Array.from({length: SLOTS}, (_, i) => (ITEMS[f?.slots?.[i]] ? f.slots[i] : null))}));
        if (!g.floors.length) g.floors = [{slots: ['radio', 'generateur', 'atelier', null, null, null]}];
        g.builds = (g.builds || []).filter(b => ITEMS[b.k] && g.floors[b.fi] && b.si >= 0 && b.si < SLOTS).map(b => ({k: b.k, fi: b.fi, si: b.si, left: Number(b.left) || 0}));
        g.people = g.people.slice(0, 7).map((p, i) => ({id: String(p.id || 'h' + (i + 1)).slice(0, 12), pid: Number(p.pid) || 0, name: String(p.name || 'Sans nom').slice(0, 80), gender: String(p.gender || '').slice(0, 10), me: !!p.me,
            hp: clamp(Number(p.hp) || 0, 0, 100), needs: Object.fromEntries(NEEDS.map(([k]) => [k, clamp(Number(p.needs?.[k]) || 0, 0, 100)])),
            where: p.where === 'dehors' && p.exp ? 'dehors' : 'base', act: p.act && typeof p.act === 'object' ? {k: String(p.act.k), until: Number(p.act.until) || 0, at: Array.isArray(p.act.at) ? p.act.at.map(Number) : null} : null,
            job: ['libre', 'creuser', 'construire'].includes(p.job) ? p.job : 'libre', exp: p.where === 'dehors' && p.exp ? {place: String(p.exp.place), phase: ['aller', 'fouille', 'retour'].includes(p.exp.phase) ? p.exp.phase : 'retour', from: Number(p.exp.from) || 0, until: Number(p.exp.until) || 0, loot: Object.fromEntries(Object.entries(p.exp.loot || {}).filter(([r]) => RES_KEYS.includes(r)).map(([r, n]) => [r, Math.max(0, Number(n) || 0)])), found: (p.exp.found || []).map(String).filter(f => (f[0] === 't' && TOOLS[f.slice(2)]) || (f[0] === 'p' && ITEMS[f.slice(2)]))} : null}));
        if (!g.people.length) throw new Error('Cette partie n’a aucun habitant.');
        const c = g.city; c.n = clamp(Number(c.n) || 13, 5, 25); c.name = String(c.name || 'la ville').slice(0, 80); c.size = SIZES[c.size] ? c.size : 'moyenne'; c.base = [Math.floor(c.n / 2), Math.floor(c.n / 2)];
        c.places = c.places.slice(0, 30).filter(pl => PLACE_KINDS[pl.kind]).map((pl, i) => ({id: String(pl.id || 'l' + (i + 1)).slice(0, 12), kind: pl.kind, name: String(pl.name || PLACE_KINDS[pl.kind][1]).slice(0, 120), x: clamp(Number(pl.x) || 0, 0, c.n - 1), y: clamp(Number(pl.y) || 0, 0, c.n - 1),
            stock: Object.fromEntries(Object.entries(pl.stock || {}).filter(([r]) => RES_KEYS.includes(r)).map(([r, n]) => [r, Math.max(0, Number(n) || 0)])), max: Object.fromEntries(Object.entries(pl.max || {}).filter(([r]) => RES_KEYS.includes(r)).map(([r, n]) => [r, Math.max(0, Number(n) || 0)])),
            tools: (pl.tools || []).filter(k => TOOLS[k]), plans: Math.max(0, Number(pl.plans) || 0), visits: Number(pl.visits) || 0, seen: !!pl.seen}));
        g.dig = {on: !!g.dig?.on, done: Math.max(0, Number(g.dig?.done) || 0)}; g.weather = {rain: !!g.weather?.rain, until: Number(g.weather?.until) || 0};
        g.power = !!g.power; g.powerOn = g.powerOn !== false; g.over = !!g.over; g.speed = [0, 1, 2, 4].includes(g.speed) ? g.speed : 1; g.nextId = Number(g.nextId) || g.people.length + 1; g.seed = Number(g.seed) | 0;
        return g;
    }

    root.LCNDA_BUNKER = {NEEDS, DECAY, RES, RES_KEYS, ITEMS, TOOLS, PLACE_KINDS, SIZES, SLOTS, MAX_FLOORS, DIG_HOURS, BASE_PLANS, FOUND_PLANS,
        newGame, step, run, orderBuild, cancelBuild, dismantle, setJob, send, recall, travel, check, cap, has, count, items, alive, hourOf, dayOf, isNight, clock};
})();
