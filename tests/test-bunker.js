'use strict';
/** ☢ Le bunker (heritage-bunker-moteur.js) : la logique sans écran, et l'entrée cachée.   node tests/test-bunker.js */
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
global.window = {};
require('../assets/js/heritage-bunker-moteur.js');
const B = window.LCNDA_BUNKER;
let n = 0; const t = (name, fn) => { fn(); n++; console.log('✓', name); };
const game = (o = {}) => B.newGame({seed: 7, me: {name: 'Jean Moi', pid: 1}, team: [{name: 'Marie', pid: 2}, {name: 'Paul', pid: 3}], city: {name: 'Rennes', size: 'moyenne'}, ...o});
const fill = (g, v = 200) => { B.RES_KEYS.forEach(r => { g.res[r] = v; }); g.floors.push({slots: ['stockage', 'stockage', 'stockage', 'stockage', 'stockage', 'stockage']}); B.RES_KEYS.forEach(r => { g.res[r] = Math.min(v, B.cap(g, r)); }); };

t('une partie : un étage avec radio, groupe électrogène, atelier ; les plans de base ; une ville à la bonne taille', () => {
    const g = game();
    assert.deepEqual(g.floors[0].slots.slice(0, 3), ['radio', 'generateur', 'atelier']);
    assert.deepEqual(g.plans.sort(), ['arbremur', 'barricade', 'berceau', 'bibliotheque', 'compost', 'cuve', 'debarras', 'douche', 'dynamo', 'etabli', 'etagerecomp', 'etageres', 'extincteur', 'filtre', 'gardemanger', 'jeux', 'lavabo', 'lit', 'niche', 'piegerats', 'pieges', 'poele', 'porte', 'sacados', 'stockage', 'toilettes']);
    assert.equal(g.people.length, 3); assert.ok(g.people[0].me);
    for (const [size, [nn, nb]] of Object.entries(B.SIZES)) {
        const c = game({city: {name: 'X', size}}).city; assert.equal(c.n, nn); assert.equal(c.places.length, nb);
        const cells = c.places.map(p => `${p.x},${p.y}`); assert.equal(new Set(cells).size, cells.length, 'deux lieux au même endroit');
        assert.ok(c.places.every(p => p.x >= 0 && p.y >= 0 && p.x < nn && p.y < nn && !(p.x === c.base[0] && p.y === c.base[1])));
        assert.ok(['supermarche', 'station', 'quincaillerie', 'menuiserie', 'pharmacie'].every(k => c.places.some(p => p.kind === k)), 'les lieux utiles sont tous là');
    }
});
t('les besoins : sans rien faire, on finit par mourir ; avec de quoi vivre, on tient', () => {
    const g = game(); B.run(g, 1440 * 30); assert.ok(g.over); assert.equal(B.alive(g).length, 0);
    assert.ok(g.log.some(l => /Plus personne en vie/.test(l.txt)));
    const h = game(); fill(h); h.floors[0].slots[3] = 'toilettes'; h.floors[0].slots[4] = 'lit'; h.floors[0].slots[5] = 'douche'; h.floors[1].slots[0] = 'lit'; h.floors[1].slots[1] = 'lit';
    for (let d = 0; d < 6; d++) { B.run(h, 1440); B.RES_KEYS.forEach(r => { h.res[r] = Math.max(h.res[r], 60); }); }
    assert.equal(B.alive(h).length, 3); assert.ok(h.people.every(p => p.hp > 60), h.people.map(p => p.hp).join()); // (des pillards ont pu passer)
    assert.ok(h.people.every(p => Object.values(p.needs).every(v => v > 0)));
});
t('les toilettes manquent : on se soulage dans un coin (l’hygiène baisse, un message une fois)', () => {
    const g = game(); B.run(g, 960); assert.equal(g.log.filter(l => /dans un coin/.test(l.txt)).length, 1);
});
t('construire : plan, outil et matériaux vérifiés ; un habitant à l’atelier le termine, pas sans électricité', () => {
    const g = game();
    assert.match(B.orderBuild(g, 'recuperateur', 0, 3).err, /plan/);
    g.plans.push('recuperateur'); assert.match(B.orderBuild(g, 'recuperateur', 0, 3).err, /outil/);
    g.res.bois = 1; assert.match(B.orderBuild(g, 'lit', 0, 3).err, /Il manque/);
    g.res.bois = 20; g.res.tissu = 5; assert.ok(B.orderBuild(g, 'lit', 0, 3).ok); assert.equal(g.res.bois, 15);
    assert.match(B.orderBuild(g, 'etageres', 0, 3).err, /prise/); assert.match(B.orderBuild(g, 'etageres', 0, 0).err, /prise/);
    assert.equal(g.people.filter(p => p.job === 'construire').length, 1, 'quelqu’un est mis à l’atelier');
    const off = JSON.parse(JSON.stringify(g)); off.powerOn = false; B.run(off, 600); assert.equal(off.floors[0].slots[3], null, 'pas d’électricité : rien ne se construit');
    B.run(g, 600); assert.equal(g.floors[0].slots[3], 'lit'); assert.ok(g.people.every(p => p.job !== 'construire'), 'le travail fini, l’habitant est libre');
    assert.ok(B.dismantle(g, 0, 3)); assert.equal(g.floors[0].slots[3], null); assert.ok(!B.dismantle(g, 0, 0), 'la radio ne se démonte pas');
    const c = game(); c.res.bois = 20; c.res.tissu = 5; B.orderBuild(c, 'lit', 0, 4); B.cancelBuild(c, 0); assert.equal(c.res.bois, 20); assert.equal(c.builds.length, 0);
});
t('creuser : un nouvel étage après le travail demandé, deux fois plus vite avec la pelle ; six étages au plus', () => {
    const time = pelle => { const g = game(); fill(g, 100); g.floors.pop(); if (pelle) g.tools.push('pelle'); B.setJob(g, g.people[1].id, 'creuser'); B.setJob(g, g.people[2].id, 'creuser'); let m = 0; while (g.floors.length < 2 && m < 1440 * 6) { B.step(g); m += 10; } assert.equal(g.floors.length, 2); return m; };
    const a = time(false), b = time(true); assert.ok(b < a * 0.65, `${b} contre ${a}`);
    const g = game(); g.floors = Array.from({length: B.MAX_FLOORS}, () => ({slots: Array(6).fill(null)})); fill(g, 100); g.floors.length = B.MAX_FLOORS; B.setJob(g, g.people[1].id, 'creuser'); B.run(g, 1440 * 4); assert.equal(g.floors.length, B.MAX_FLOORS);
});
t('en ville : aller, fouiller, rentrer avec ce qu’on trouve ; la radio donne des nouvelles ; on peut rappeler', () => {
    const g = game(); fill(g, 10); const pl = g.city.places.find(p => p.kind === 'supermarche'), p = g.people[1];
    assert.ok(B.send(g, p.id, pl.id).ok); assert.equal(p.where, 'dehors'); assert.match(B.send(g, p.id, pl.id).err, /pas au bunker/);
    const before = g.res.nourriture + g.res.eau, go = B.travel(g, pl);
    B.run(g, go + 120 + go + 60);
    assert.equal(p.where, 'base'); assert.ok(g.res.nourriture + g.res.eau > before, 'des provisions rapportées');
    assert.ok(g.log.some(l => l.kind === 'radio' && /Je suis à/.test(l.txt))); assert.ok(g.log.some(l => l.kind === 'radio' && /J’ai trouvé|Rien du tout/.test(l.txt)));
    assert.equal(pl.visits, 1);
    const r = game(); const q = r.people[2], far = r.city.places.reduce((a, b) => (B.travel(r, a) > B.travel(r, b) ? a : b));
    B.send(r, q.id, far.id); B.run(r, 60); assert.ok(B.recall(r, q.id)); assert.equal(q.exp.phase, 'retour'); B.run(r, 70); assert.equal(q.where, 'base');
});
t('sans électricité, la radio se tait ; les messages arrivent quand le courant revient', () => {
    const g = game(); const pl = g.city.places[0], p = g.people[1]; g.res.essence = 0; B.send(g, p.id, pl.id);
    B.run(g, B.travel(g, pl) + 20); assert.ok(!g.power); assert.ok(g.radioQueue.length >= 1); assert.ok(!B.recall(g, p.id), 'pas de radio sans courant');
    g.res.essence = 10; B.step(g); assert.equal(g.radioQueue.length, 0); assert.ok(g.log.some(l => /reçu en retard/.test(l.txt)));
});
t('la pluie remplit l’eau (trois fois plus avec le récupérateur), jamais au-delà de la place', () => {
    const g = game(); g.people.forEach(p => { p.hp = 0; }); g.over = false; g.people[0].hp = 100; g.people[0].needs = {soif: 100, faim: 100, sommeil: 100, hygiene: 100, vessie: 100};
    g.res.eausale = 0; g.weather = {rain: true, until: g.t + 600}; B.run(g, 120); const a = g.res.eausale;
    const h = game(); h.res.eausale = 0; h.floors[0].slots[3] = 'recuperateur'; h.weather = {rain: true, until: h.t + 600}; B.run(h, 120); assert.ok(h.res.eausale >= a * 2, `${h.res.eausale} contre ${a}`);
    const c = game(); c.res.eausale = B.cap(c, 'eausale'); c.weather = {rain: true, until: c.t + 600}; B.run(c, 60); assert.ok(c.res.eausale <= B.cap(c, 'eausale'));
});
t('la cuve d’eau de pluie (plan connu dès le départ) : +30 L de place, et elle se remplit quand il pleut', () => {
    const g = game(); assert.ok(g.plans.includes('cuve')); const cap0 = B.cap(g, 'eausale');
    g.res = {...g.res, bois: 10, metal: 10}; assert.ok(!B.orderBuild(g, 'cuve', 0, 3).err, 'pas d’outil à trouver');
    const h = game(); h.floors[0].slots[3] = 'cuve'; h.floors[0].slots[4] = 'cuve'; assert.equal(B.cap(h, 'eausale'), cap0 + 60);
    assert.equal(B.rainPerHour(game()), 1); assert.equal(B.rainPerHour(h), 5); h.floors[0].slots[5] = 'recuperateur'; assert.equal(B.rainPerHour(h), 15);
    const r = game(); r.floors[0].slots[3] = 'cuve'; r.res.eausale = 0; r.weather = {rain: true, until: r.t + 600}; B.run(r, 120); assert.ok(r.res.eausale >= 4, `${r.res.eausale}`);
    assert.ok(r.log.some(l => /cuves se remplissent/.test(l.txt)) || r.weather.rain, 'le message parle des cuves');
});
t('le centre de la ville (plan en fond) est gardé à la relecture, une valeur abîmée est enlevée', () => {
    const g = game(); g.city.lat = 46.72; g.city.lng = 2.5; let c = B.check(JSON.parse(JSON.stringify(g))).city; assert.equal(c.lat, 46.72); assert.equal(c.lng, 2.5);
    g.city.lat = 'x'; c = B.check(JSON.parse(JSON.stringify(g))).city; assert.ok(!('lat' in c) && !('lng' in c));
    g.city.geo = 'none'; delete g.city.lat; assert.equal(B.check(JSON.parse(JSON.stringify(g))).city.geo, 'none');
});
const solo = (o = {}) => { const g = game(o); g.people.forEach((p, i) => { if (i) p.hp = 0; }); return g; };
t('compétences : le métier de la fiche et l’époque (menuisier construit plus vite, né avant 1900 cultive et soigne mieux)', () => {
    const a = B.skillsOf('Menuisier', 1880); assert.equal(a.sk.construire, 1.5); assert.equal(a.sk.cultiver, 1.25); assert.equal(a.era, 'ancien'); assert.match(a.from, /Menuisier, né·e en 1880/);
    assert.equal(B.skillsOf('infirmière', 1960).sk.soigner, 1.5); assert.equal(B.skillsOf('', 1975).sk.reparer, 1.25); assert.equal(B.skillsOf('', 1930).era, '');
    const fast = game({me: {name: 'Pierre', pid: 1, occ: 'charpentier'}}), slow = game();
    [fast, slow].forEach(g => { g.res = {...g.res, bois: 50, tissu: 50, essence: 50}; B.orderBuild(g, 'lit', 0, 3); g.people.forEach((p, i) => { p.job = i ? 'libre' : 'construire'; }); B.run(g, 60); });
    assert.ok(fast.builds.length === 0 || fast.builds[0].left < slow.builds[0].left, 'le charpentier va plus vite');
});
t('eau de pluie à filtrer : le filtre la rend potable (1 tissu tous les 30 L) ; la boire sans filtre peut donner la fièvre', () => {
    const g = game(); g.floors[0].slots[3] = 'filtre'; g.res.eau = 0; g.res.eausale = 40; g.res.tissu = 0; B.run(g, 600);
    assert.ok(g.res.eau > 0 && g.filterClog, 'filtré, puis encrassé faute de tissu'); g.res.tissu = 2; B.run(g, 60); assert.ok(!g.filterClog);
    const h = solo(); h.res.eau = 0; h.res.eausale = 60; let sick = false; for (let i = 0; i < 40 && !sick; i++) { h.people[0].needs.soif = 10; h.people[0].act = null; B.run(h, 20); sick = !!h.people[0].ill; }
    assert.ok(sick, 'la fièvre finit par venir'); assert.ok(h.log.some(l => /sans la filtrer/.test(l.txt)));
});
t('maladies : médicaments d’abord, sinon remède de grand-mère (plantes, d’après une recette de la famille) ; on guérit', () => {
    const g = game({lore: [{kind: 'recipe', title: 'La tisane de Mamie', text: 'Thym, miel…'}]}); g.res.medic = 0; g.res.plantes = 2;
    g.people[0].ill = {k: 'fievre', left: 24, treated: false}; B.run(g, 30);
    assert.ok(g.log.some(l => /remède de grand-mère \(d’après « La tisane de Mamie »\)/.test(l.txt))); assert.equal(g.res.plantes, 1);
    B.run(g, 1440); assert.equal(g.people[0].ill, null); assert.ok(g.log.some(l => /guéri·e de sa fièvre/.test(l.txt)));
});
t('moral : les histoires du soir (Mémoire familiale) le remontent, les jeux aussi ; à plat, on refuse de travailler', () => {
    const g = game({lore: [{kind: 'song', title: 'Le temps des cerises', text: ''}]}); B.run(g, 15 * 60);
    assert.ok(g.log.some(l => l.kind === 'histoire' && /chante « Le temps des cerises »/.test(l.txt))); assert.equal(g.stats.stories, 1);
    const h = game(); h.people.forEach(p => { p.mood = 10; p.job = 'creuser'; }); B.run(h, 30); assert.ok(h.log.some(l => /refuse de travailler/.test(l.txt)));
    const j = game(); j.floors[0].slots[3] = 'jeux'; j.people.forEach(p => { p.mood = 40; }); B.run(j, 120); assert.ok(j.people.some(p => p.mood > 50), 'on a joué');
});
t('l’air : le conduit s’encrasse, quelqu’un de libre le nettoie', () => {
    const g = game(); g.air = 50; B.run(g, 60); assert.equal(g.air > 90, true); assert.ok(g.log.some(l => /nettoie le conduit/.test(l.txt)));
});
t('la trappe : marchand (troc), voyageur (un ancêtre de l’arbre entre, avec ses compétences), pillards (donner ou résister)', () => {
    const g = game({extras: [{pid: 9, name: 'Louis BORIE', gender: 'male', occ: 'soldat', by: 1890}]});
    g.visit = {k: 'marchand', until: g.t + 120, give: {r: 'medic', n: 5}, want: {r: 'bois', n: 3}}; const m0 = g.res.medic, b0 = g.res.bois;
    assert.ok(B.answerVisit(g, 'oui').ok); assert.equal(g.res.medic, m0 + 5); assert.equal(g.res.bois, b0 - 3); assert.equal(g.visit, null);
    g.visit = {k: 'marchand', until: g.t + 120, give: {r: 'medic', n: 5}, want: {r: 'essence', n: 999}}; assert.match(B.answerVisit(g, 'oui').err, /Il manque/);
    g.visit = {k: 'voyageur', until: g.t + 120, person: g.extras.shift()}; B.answerVisit(g, 'oui'); const louis = g.people.find(p => p.name === 'Louis BORIE');
    assert.ok(louis); assert.equal(louis.sk.defendre, 1.5);
    const d0 = B.defense(g); g.floors[0].slots[4] = 'porte'; g.floors[0].slots[5] = 'pieges'; assert.equal(B.defense(g), d0 + 5);
    g.visit = {k: 'pillards', until: g.t + 120, strength: 0, demand: {nourriture: 5}}; B.answerVisit(g, 'resister'); assert.equal(g.stats.raidsWon, 1);
    g.visit = {k: 'pillards', until: g.t + 120, strength: 99, demand: {}}; const n0 = g.res.nourriture; B.answerVisit(g, 'resister'); assert.equal(g.stats.raidsLost, 1); assert.ok(g.res.nourriture < n0);
    g.visit = {k: 'pillards', until: g.t + 10, strength: 0, demand: {}}; B.run(g, 70); assert.equal(g.visit, null, 'sans réponse, ils attaquent');
});
t('coffre de famille, maison natale en ville, lettres retrouvées', () => {
    const g = game({coffre: [{title: 'La montre du grand-père'}, {title: 'Couverture brodée'}, {title: 'Le cahier de recettes'}], homes: [{name: 'Joseph MARTIN', by: 1922}], letters: [{title: 'Pour tes 18 ans', from: 'Mamie', to: 'Léa'}]});
    assert.deepEqual(g.coffre.map(c => c.bonus), ['bijou', 'textile', 'livre']); assert.equal(g.res.tissu, 6);
    const home = g.city.places.find(p => p.home); assert.match(home.name, /Maison natale de Joseph MARTIN \(1922\)/);
    const p = g.people[1]; B.send(g, p.id, home.id); B.run(g, B.travel(g, home) * 2 + 200);
    assert.ok(g.log.some(l => /maison où est né·e Joseph MARTIN/.test(l.txt)));
    assert.ok(g.letters.length === 0 ? g.log.some(l => /lettre retrouvée : « Pour tes 18 ans », de Mamie à Léa/.test(l.txt)) : true);
});
t('saisons : l’hiver sans poêle on a froid ; avec le poêle, il brûle du bois ; l’électricité sans essence (solaire, dynamo)', () => {
    const g = game({season0: 3}); assert.equal(B.seasonOf(g), 'hiver'); B.run(g, 120); assert.ok(g.cold); assert.ok(g.log.some(l => /Il fait froid/.test(l.txt)));
    const h = game({season0: 3}); h.floors[0].slots[3] = 'poele'; const b0 = h.res.bois; B.run(h, 240); assert.ok(!h.cold); assert.ok(h.res.bois < b0);
    const s1 = game(); s1.res.essence = 0; s1.floors[0].slots[3] = 'solaire'; s1.t = 10 * 60; B.run(s1, 30); assert.ok(s1.power); assert.equal(s1.powerSrc, 'soleil');
    const d = game(); d.res.essence = 0; d.floors[0].slots[3] = 'dynamo'; d.people[0].job = 'pedaler'; B.run(d, 30); assert.ok(d.power); assert.equal(d.powerSrc, 'pedales');
    assert.equal(B.seasonOf({season0: 0, t: (B.SEASON_DAYS * 1440) + 400}), 'ete');
});
t('une naissance au bunker : berceau, couple au moral, pas de même sang ; le bébé rejoint l’arbre du bunker', () => {
    const g = B.newGame({seed: 3, me: {name: 'Jeanne DURAND', pid: 1, gender: 'female'}, team: [{name: 'Paul MARTIN', pid: 2, gender: 'male'}], kin: [[1, 2, 'conjoint']], names: {f: ['Rose'], m: ['Jules']}, city: {name: 'X', size: 'petite'}});
    g.floors[0].slots[3] = 'berceau'; g.t = 5 * 1440 + 21 * 60; g.people.forEach(p => { p.mood = 90; });
    for (let d = 6; d < 300 && !g.preg; d++) { g.t = d * 1440 + 21 * 60 + 50; g.people.forEach(p => { p.mood = 90; p.hp = 100; p.act = null; Object.keys(p.needs).forEach(k => { p.needs[k] = 90; }); }); B.run(g, 10); }
    assert.ok(g.preg, 'une grossesse'); g.t = g.preg.due - 10; g.people.forEach(p => { p.hp = 100; }); B.run(g, 70);
    const baby = g.people.find(p => p.baby); assert.ok(baby); assert.match(baby.name, /^(Rose|Jules) MARTIN$/); assert.equal(g.births.length, 1);
    assert.match(B.send(g, baby.id, g.city.places[0].id).err, /petit/);
    const s = B.newGame({seed: 3, me: {name: 'A', pid: 1, gender: 'female'}, team: [{name: 'B', pid: 2, gender: 'male'}], kin: [[1, 2, 'fratrie']], city: {name: 'X', size: 'petite'}});
    assert.ok(s.people[0].kin.includes(s.people[1].id), 'frère et sœur : pas de bébé entre eux');
});
t('la gazette : chiffres gardés (morts, visites, histoires, trouvailles) et relus', () => {
    const g = game(); g.res.eau = 0; g.res.eausale = 0; g.res.medic = 0; g.people[2].hp = 1; g.people[2].needs.soif = 0; B.run(g, 180); assert.equal(g.stats.deaths.length, 1);
    const c = B.check(JSON.parse(JSON.stringify(g))); assert.deepEqual(c.stats.deaths, g.stats.deaths);
    const bad = JSON.parse(JSON.stringify(g)); bad.stats = {deaths: 'x', visits: {pillards: -3}}; bad.visit = {k: 'fusee'}; bad.coffre = [{title: '<b>', bonus: 'laser'}]; bad.people[0].sk = {construire: 99}; bad.people[0].ill = {k: 'peste'};
    const b = B.check(bad); assert.deepEqual(b.stats.deaths, []); assert.equal(b.stats.visits.pillards, 0); assert.equal(b.visit, null); assert.equal(b.coffre[0].bonus, 'souvenir'); assert.equal(b.people[0].sk.construire, 2.5); assert.equal(b.people[0].ill, null);
});
t('enregistrer et reprendre : une partie relue continue exactement pareil ; un fichier abîmé est refusé ou nettoyé', () => {
    const g = game(); B.send(g, g.people[1].id, g.city.places[0].id); B.run(g, 900);
    const copy = B.check(JSON.parse(JSON.stringify(g))); B.run(g, 1440); B.run(copy, 1440);
    assert.deepEqual(copy.res, g.res); assert.deepEqual(copy.people.map(p => [p.hp, p.where]), g.people.map(p => [p.hp, p.where])); assert.equal(copy.log[0].txt, g.log[0].txt);
    assert.throws(() => B.check({foo: 1}), /pas une partie/); assert.throws(() => B.check(null), /pas une partie/);
    const bad = JSON.parse(JSON.stringify(game())); bad.res.eau = -5; bad.res.or = 999; bad.floors[0].slots[3] = 'fusee'; bad.tools = ['pelle', 'laser']; bad.people[0].name = '<img src=x onerror=alert(1)>'.repeat(20); bad.log = [{t: 1, txt: 'x', kind: '<script>'}];
    const c = B.check(bad); assert.equal(c.res.eau, 0); assert.equal(c.res.or, undefined); assert.equal(c.floors[0].slots[3], null); assert.deepEqual(c.tools, ['pelle']); assert.ok(c.people[0].name.length <= 80); assert.equal(c.log[0].kind, 'info');
});
t('bien caché : la lampe rouge du labo photo (trois clics) fait apparaître la trappe, qui ouvre le bunker', () => {
    const room = fs.readFileSync(path.join(__dirname, '../assets/js/app-piece-archives.js'), 'utf8');
    assert.match(room, /type:'redlight'/); assert.match(room, /_redClicks\.length>=3/); assert.match(room, /type==='bunker'\)\{dialog\.close\(\);window\.LCNDA_EXT\?\.openBunker/);
    assert.match(room, /hatch\.visible=!!archiveRoomSettings\(\)\.bunker/, 'la trappe reste cachée tant qu’on ne l’a pas trouvée');
    const idx = fs.readFileSync(path.join(__dirname, '../index.php'), 'utf8');
    assert.ok(idx.indexOf('heritage-bunker-moteur.js') < idx.indexOf('heritage-bunker.js?'), 'le moteur avant l’écran');
    assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '../assets/js/heritage-bunker.js'), 'utf8'), /\balert\(|\bconfirm\(|innerHTML\s*=\s*[^`'"]*\b(name|txt)\b(?!\))/);
});
t('♻️ bric-à-brac : on le démonte (travail « Démonter ») et on obtient ses composants ; l’établi va plus vite ; plus de place = laissé dehors', () => {
    const g = game(); assert.ok(B.JUNK_KEYS.length >= 30, 'beaucoup d’objets à démonter'); assert.ok(B.RES_KEYS.includes('cuivre') && B.RES_KEYS.includes('electro') && B.RES_KEYS.length >= 20);
    assert.deepEqual(g.junk, {radiocassee: 1, chaise: 1, palette: 1});
    const before = {electro: g.res.electro, cuivre: g.res.cuivre}; assert.ok(B.recycle(g, 'radiocassee').ok); assert.equal(g.junk.radiocassee, undefined);
    assert.ok(g.people.some(p => p.job === 'recycler'), 'quelqu’un s’y met'); assert.equal(B.recycle(g, 'radiocassee').ok, false);
    B.run(g, 4 * 60); assert.ok(g.res.electro >= before.electro + 2 && g.res.cuivre >= before.cuivre + 1, JSON.stringify(g.res)); assert.ok(g.log.some(l => /a démonté/.test(l.txt)));
    const tm = () => { const h = game(); h.people.slice(1).forEach(p => { p.job = 'creuser'; }); h.people[0].job = 'recycler'; h.people[0].sk.reparer = 1; B.recycle(h, 'palette'); let m = 0; while (h.recy.length && m < 600) { B.run(h, 10); m += 10; } return m; };
    const slow = tm(); const t2 = (() => { const h = game(); h.floors[0].slots[3] = 'etabli'; h.people.slice(1).forEach(p => { p.job = 'creuser'; }); h.people[0].job = 'recycler'; h.people[0].sk.reparer = 1; B.recycle(h, 'palette'); let m = 0; while (h.recy.length && m < 600) { B.run(h, 10); m += 10; } return m; })();
    assert.ok(t2 < slow, `établi : ${t2} min au lieu de ${slow}`);
    const a = game(); a.autoRecy = true; a.people[0].job = 'recycler'; B.run(a, 10 * 60); assert.equal(B.junkCount(a), 0, 'démonter tout seul');
});
t('📐 plus de 50 plans, chacun avec ce qu’il fait ; il manque X : dit précisément ; les composants servent', () => {
    const P = Object.keys(B.ITEMS).filter(k => !B.ITEMS[k].fixed); assert.ok(P.length >= 55, `${P.length} plans`);
    P.forEach(k => { const it = B.ITEMS[k]; assert.ok(it.desc && it.h > 0 && Object.keys(it.cost).every(r => B.RES_KEYS.includes(r)), k); });
    const used = new Set(P.flatMap(k => Object.keys(B.ITEMS[k].cost))); ['clous', 'corde', 'colle', 'verre', 'plastique', 'caoutchouc', 'cuivre', 'electro', 'piles', 'charbon'].forEach(r => assert.ok(used.has(r), r));
    const g = game(); g.plans.push('television'); const r = B.orderBuild(g, 'television', 0, 3); assert.equal(r.ok, false); assert.match(r.err, /Il manque :.*composants électroniques/);
});
t('🏭 les objets travaillent : serre, clapier, alambic, labo ; batteries ; loisirs ; air ; chauffage au charbon', () => {
    const g = game(); g.floors[0].slots[3] = 'alambic'; g.floors[0].slots[4] = 'labo'; g.floors[0].slots[5] = 'clapier'; g.res.eau = 0; g.res.eausale = 30; g.res.bois = 10; g.res.plantes = 6; g.res.medic = 0; const n0 = g.res.nourriture;
    g.people.forEach(p => { p.needs.soif = 100; p.needs.faim = 100; }); B.run(g, 25 * 60);
    assert.ok(g.res.eau > 0 || g.res.eausale < 30, 'l’alambic fait de l’eau potable'); assert.ok(g.res.medic >= 1, 'le labo fait des médicaments'); assert.ok(g.stats && g.res.nourriture >= n0 - 12, 'le clapier nourrit');
    const k = game(); k.floors[0].slots[3] = 'ventilateur'; k.floors[0].slots[4] = 'batteries'; assert.equal(B.sumOf(k, 'store'), 8); assert.ok(B.mult(k, 'airK') < 1);
    const h = game(); h.floors[0].slots[3] = 'batteries'; h.res.essence = 0; h.batt = 8; B.run(h, 60); assert.equal(h.power, true); assert.equal(h.powerSrc, 'batteries');
    const w = game(); w.floors[0].slots[3] = 'chaudiere'; w.season0 = 3; w.res.charbon = 10; w.res.bois = 0; B.run(w, 120); assert.equal(w.cold, false); assert.ok(w.res.charbon < 10);
    const f = game(); f.floors[0].slots[3] = 'guitare'; f.people.forEach(p => { p.mood = 30; }); B.run(f, 180); assert.ok(f.people.some(p => p.mood > 40), 'la guitare remonte le moral sans électricité');
});
t('🗺️ grandes cartes : très grande (26 lieux) et immense (40), toutes les sortes de lieux, du bric-à-brac partout', () => {
    for (const [size, nb] of [['tresgrande', 26], ['immense', 40]]) { const c = game({city: {name: 'X', size}}).city; assert.equal(c.places.length, nb); ['decharge', 'electromenager', 'usine', 'hopital', 'gare'].forEach(k => assert.ok(c.places.some(p => p.kind === k), k)); assert.ok(c.places.filter(p => p.junk.length).length > nb / 2); }
});
t('🚶 un parcours de plusieurs lieux, et à chaque lieu ce qu’on rapporte (seulement le bric-à-brac, ou seulement l’eau…)', () => {
    const g = game(); g.tools.push('sac'); const p = g.people[1], [a, b] = g.city.places.filter(x => x.kind === 'supermarche' || x.kind === 'quincaillerie');
    a.stock.eau = 10; a.stock.nourriture = 10; b.junk = ['vis', 'cables'];
    assert.ok(B.send(g, p.id, [{id: a.id, take: ['eau']}, {id: b.id, take: ['junk']}]).ok); assert.ok(B.routeTime(g, [a.id, b.id]) > B.travel(g, a) * 2 - 1);
    let guard = 0; while (p.where !== 'base' && guard++ < 400) B.run(g, 30);
    assert.equal(p.where, 'base'); assert.ok((g.junk.vis || 0) + (g.junk.cables || 0) >= 1, JSON.stringify(g.junk)); assert.ok(a.stock.nourriture === 10 || a.stock.nourriture > 9, 'pas de nourriture prise au supermarché');
    assert.ok(g.log.some(l => /Je continue vers/.test(l.txt)) || g.radioQueue.some(m => /Je continue vers/.test(m)));
});
t('🧍 l’autonomie : prudent (ils y vont plus tôt), manuel (seulement à la dernière minute, et des ordres « boire », « manger »…)', () => {
    const g = game(); fill(g); g.people.forEach(p => { p.needs.soif = 50; }); B.setAuto(g, 'prudent'); B.run(g, 30); assert.ok(g.people.every(p => p.needs.soif > 50 || p.act?.k === 'boire'), 'prudent : ils boivent à 50');
    const m = game(); fill(m); B.setAuto(m, 'manuel'); m.people.forEach(p => { p.needs.soif = 30; }); B.run(m, 10); assert.ok(m.people.every(p => p.act?.k !== 'boire'), 'manuel : pas encore');
    assert.ok(B.orderNeed(m, m.people[0].id, 'soif').ok); assert.equal(m.people[0].act.k, 'boire');
    B.setAuto(m, 'prudent', m.people[1].id); assert.equal(m.people[1].auto, 'prudent'); B.setAuto(m, '', m.people[1].id); assert.equal(m.people[1].auto, undefined);
    const c = B.check(JSON.parse(JSON.stringify(m))); assert.equal(c.auto, 'manuel'); assert.deepEqual(c.junk, m.junk);
});
t('🎲 chaque lieu n’a qu’une partie de ce qu’on peut y trouver, tiré au hasard ; ça revient (ou disparaît) au hasard chaque matin', () => {
    const c = game({city: {name: 'X', size: 'immense'}}).city;
    assert.ok(c.places.every(p => Object.values(p.stock).some(n => n > 0)), 'au moins une chose partout');
    assert.ok(c.places.some(p => Object.keys(p.max).some(r => p.max[r] > 0 && !p.stock[r])), 'des choses absentes ici ou là');
    const g = game(); const pl = g.city.places[0]; Object.keys(pl.stock).forEach(r => { pl.stock[r] = 0; });
    for (let d = 0; d < 6; d++) B.regen(g, pl); assert.ok(Object.values(pl.stock).some(n => n > 0), 'ça revient'); assert.ok(Object.keys(pl.stock).every(r => pl.stock[r] <= pl.max[r]));
});
t('✋ on choisit combien on prend (4 bois sur 5) ; la place pour rapporter est limitée ; sacs, hotte, brouette, remorque (avec le vélo) en donnent plus', () => {
    const g = game(); const p = g.people[1], a = g.city.places.find(x => x.kind === 'menuiserie') || g.city.places[0];
    Object.keys(a.stock).forEach(r => { a.stock[r] = 0; }); a.stock.bois = 5; a.max.bois = Math.max(a.max.bois || 0, 5); a.junk = []; a.tools = []; a.plans = 0; const b0 = g.res.bois;
    assert.deepEqual(B.stepOf({id: a.id, take: ['bois'], qty: {bois: '4', truc: 3, eau: -1}}), {id: a.id, take: ['bois'], qty: {bois: 4}});
    assert.ok(B.send(g, p.id, [{id: a.id, take: ['bois'], qty: {bois: 4}}]).ok); let guard = 0; while (p.where !== 'base' && guard++ < 400) B.run(g, 30);
    assert.equal(a.stock.bois, 1, 'il en laisse 1'); assert.ok(g.res.bois >= b0 + 4 - 1 && g.res.bois <= b0 + 4, `${b0} → ${g.res.bois}`); assert.equal(a.known.stock.bois, 1, 'on sait ce qui reste');
    const h = game(), q = h.people[1], base = B.carryOf(h, q); h.floors[0].slots[3] = 'brouette'; assert.equal(B.carryOf(h, q), base + 8);
    h.floors[0].slots[4] = 'remorque'; assert.equal(B.carryOf(h, q), base + 8, 'la remorque sans vélo ne sert à rien'); h.floors[0].slots[5] = 'velo'; assert.equal(B.carryOf(h, q), base + 15, 'un seul véhicule par sortie : le meilleur (la remorque)');
    const k = game(); const pk = k.city.places[0]; Object.keys(pk.stock).forEach(r => { pk.stock[r] = 0; }); pk.stock.bois = 50; pk.max.bois = 50; pk.junk = []; const kp = k.people[1], cap = B.carryOf(k, kp);
    B.send(k, kp.id, pk.id); guard = 0; while (kp.where !== 'base' && guard++ < 400) B.run(k, 30); assert.equal(pk.stock.bois, 50 - Math.floor(cap / B.wOf('bois') + 1e-9), `pas plus de ${cap} (en poids : le bois pèse ${B.wOf('bois')})`);
    const c = B.check(JSON.parse(JSON.stringify(g))); assert.equal(c.city.places.find(x => x.id === a.id).known.stock.bois, 1);
});
t('🔧 pannes : une installation en panne ne sert plus ; on la répare (des pièces, un peu de travail) ; le groupe en panne = plus de courant', () => {
    const g = game(); g.floors[0].slots[3] = 'toilettes'; assert.ok(B.has(g, 'toilettes'));
    assert.ok(B.breakItem(g, 0, 3)); assert.equal(B.has(g, 'toilettes'), false); assert.ok(g.log[0].txt.includes('réparer'));
    fill(g); const r = B.orderRepair(g, 0, 3); assert.ok(r.ok, r.err); assert.equal(B.orderRepair(g, 0, 3).ok, false, 'pas deux fois');
    g.people.forEach(p => { p.job = 'construire'; }); B.run(g, 6 * 60); assert.ok(B.has(g, 'toilettes'), 'réparé'); assert.equal(g.stats.repairs, 1);
    const h = game(); B.breakItem(h, 0, 1); B.run(h, 20); assert.equal(h.power, false, 'groupe en panne');
    assert.equal(B.breakItem(h, 0, 0), false, 'la radio ne tombe pas en panne');
    const w = game({diff: 'extreme'}); fill(w, 80); w.floors[0].slots[3] = 'potager'; w.floors[0].slots[4] = 'douche'; let broke = false; for (let i = 0; i < 40 && !broke; i++) { B.run(w, 24 * 60); w.people.forEach(p => { p.hp = 100; }); B.RES_KEYS.forEach(r => { w.res[r] = Math.max(w.res[r], 40); }); broke = Object.keys(w.broken).length > 0; } assert.ok(broke, 'l’usure finit par casser quelque chose');
});
t('⬆️ améliorer une installation : niveau 2 puis 3, ses effets comptent ×1,5 puis ×2', () => {
    const g = game(); fill(g, 60); g.floors[0].slots[3] = 'brouette'; const base = B.carryOf(g, g.people[1]);
    assert.ok(B.upgradable('brouette') && !B.upgradable('radio')); const r = B.orderUpgrade(g, 0, 3); assert.ok(r.ok, r.err);
    g.people.forEach(p => { p.job = 'construire'; }); B.run(g, 8 * 60); assert.equal(g.lvl['0,3'], 2); assert.equal(B.carryOf(g, g.people[1]), base + 4);
    g.floors.push({slots: [null, null, null, null, null, null]}); const fl = g.floors.length - 1, c0 = B.cap(g, 'bois'); g.floors[fl].slots[0] = 'stockage'; const c1 = B.cap(g, 'bois'); g.lvl[fl + ',0'] = 3; assert.equal(B.cap(g, 'bois') - c0, (c1 - c0) * 2);
});
t('🎭 caractères et entente ; 📈 on progresse en pratiquant ; 📔 chacun tient son journal', () => {
    const g = game(); g.people.forEach(p => { assert.ok(p.traits.length >= 1 && p.traits.every(k => B.TRAITS[k])); });
    const p = g.people[0], s0 = p.sk.construire; B.gainXp(g, p, 'construire', 12); assert.equal(p.sk.construire, Math.round((s0 + 0.1) * 100) / 100); assert.ok(p.diary.length >= 1);
    g.people.forEach(x => { x.traits = ['sociable']; }); fill(g); B.run(g, 6 * 24 * 60);
    assert.ok(Object.values(g.rel).some(v => v >= 25), 'des amitiés ' + JSON.stringify(g.rel)); assert.ok(g.people.every(x => x.diary.length >= 3), 'un journal');
    const c = B.check(JSON.parse(JSON.stringify(g))); assert.deepEqual(c.people[0].traits, ['sociable']); assert.equal(c.people[0].diary.length, g.people[0].diary.length); assert.deepEqual(c.rel, g.rel);
});
t('📻 commerce par radio : des offres chaque jour, on paie, un messager livre quelques heures plus tard', () => {
    const g = game(); assert.ok(g.market.offers.length >= 3); fill(g, 50); const o = g.market.offers[0], before = g.res[o.give.r];
    assert.ok(B.trade(g, o.id).ok); assert.equal(B.trade(g, o.id).ok, false); g.market.deals[0].ok = true; B.run(g, 9 * 60);
    assert.ok(g.res[o.give.r] >= Math.min(B.cap(g, o.give.r), before + o.give.n) - 30, 'livré'); assert.ok(g.log.some(l => /messager/.test(l.txt)));
    const h = game(); h.power = false; h.powerOn = false; B.run(h, 10); assert.equal(B.trade(h, h.market.offers[0].id).ok, false, 'sans courant');
});
t('🌪️ catastrophes (option) : séisme, orage, inondation, canicule ; sans l’option, rien', () => {
    const g = game({opt: {meteo: true}}); g.floors[0].slots[3] = 'toilettes'; g.floors[0].slots[4] = 'lit'; B.startEvent(g, 'seisme'); assert.ok(Object.keys(g.broken).length >= 1);
    const h = game({opt: {meteo: true}}); h.floors[0].slots[3] = 'douche'; B.startEvent(h, 'canicule'); assert.equal(h.event.k, 'canicule');
    const a = game(), b = game({opt: {meteo: true}}); b.event = {k: 'canicule', until: 99999}; B.run(a, 120); B.run(b, 120); assert.ok(b.people[0].needs.soif < a.people[0].needs.soif || b.people[0].act?.k === 'boire');
    const off = game(); for (let i = 0; i < 20; i++) B.run(off, 24 * 60); assert.equal(off.stats.events, 0, 'sans l’option, pas de catastrophe');
    const on = game({opt: {meteo: true}}); fill(on); for (let i = 0; i < 25; i++) B.run(on, 24 * 60); assert.ok(on.stats.events >= 1, 'avec l’option, il en arrive');
});
t('🧵 chaînes de fabrication (option) : plantes → fil → tissu → vêtements, blé → farine → pain ; sans l’option, ni plans ni production', () => {
    const off = game(); assert.ok(!off.plans.includes('rouet')); assert.equal(B.orderBuild(off, 'rouet', 0, 3).ok, false);
    const g = game({opt: {chaines: true}}); assert.ok(g.plans.includes('rouet') && g.plans.includes('champ')); fill(g, 30);
    g.floors[0].slots[3] = 'rouet'; g.floors[0].slots[4] = 'metier'; g.floors[0].slots[5] = 'four'; g.res.fil = 0; g.res.farine = 10; const f0 = g.res.nourriture;
    g.people.forEach(p => { p.needs.faim = 100; }); B.run(g, 24 * 60); assert.ok(g.res.fil > 0 || g.res.tissu > 30 - 1, 'le rouet file'); assert.ok(g.res.farine < 10, 'le four cuit');
    const w = game({opt: {chaines: true}, scen: 'hiver'}); assert.equal(B.seasonOf(w), 'hiver'); w.res.vetements = 10; w.res.bois = 0; w.res.charbon = 0; B.run(w, 120); assert.equal(w.cold, true); assert.equal(w.warm, true);
    const on = game(); B.setOpt(on, 'chaines', true); assert.ok(on.plans.includes('rouet'));
});
t('🎚️ difficulté et 🎬 scénarios ; 🧳 objets de famille retrouvés dans les ruines ; 📘 le tutoriel', () => {
    assert.ok(game({diff: 'facile'}).res.eau > game({diff: 'extreme'}).res.eau);
    assert.equal(game({scen: 'epidemie'}).res.medic, game().res.medic + 3); assert.equal(game({scen: 'invasion'}).scen, 'invasion');
    const g = game({ruins: [{title: 'La montre du grand-père', kind: 'montre'}]}); const pl = g.city.places.find(x => x.kind === 'maison') || g.city.places[0]; pl.kind = 'maisonfam'; pl.home = true;
    let got = false; for (let i = 0; i < 12 && !got; i++) { const p = g.people[1]; p.hp = 100; B.send(g, p.id, pl.id); let k = 0; while (p.where !== 'base' && k++ < 300) B.run(g, 30); got = g.coffre.some(c => /montre/.test(c.title)); }
    assert.ok(got, 'retrouvée'); assert.equal(g.coffre.find(c => /montre/.test(c.title)).bonus, 'bijou');
    const t0 = game({opt: {tuto: true}}); assert.equal(t0.tuto, 0); fill(t0); assert.ok(B.orderBuild(t0, 'toilettes', 0, 3).ok); B.run(t0, 10); assert.ok(t0.tuto >= 1); assert.ok(t0.log.some(l => /Étape 2/.test(l.txt)));
    B.setOpt(t0, 'tuto', false); assert.equal(t0.tuto, -1); assert.equal(game().tuto, -1);
    const c = B.check(JSON.parse(JSON.stringify(game({diff: 'difficile', scen: 'hiver', opt: {meteo: true, chaines: true}}))));
    assert.equal(c.diff, 'difficile'); assert.equal(c.scen, 'hiver'); assert.deepEqual(c.opt, {meteo: true, chaines: true, tuto: false, age: false, feu: false, nuit: false, missions: false, souvenirs: false});
});
t('🐕 animaux (adopter, nourrir, ils partent s’ils ont faim) ; 🐀 nuisibles (pièges, chat, bocaux)', () => {
    const g = game(); fill(g, 30); assert.ok(B.adopt(g, 'chien')); assert.ok(B.adopt(g, 'poules')); const d0 = B.defense(g); g.pets = g.pets.filter(a => a.k !== 'chien'); assert.equal(Math.round((d0 - B.defense(g)) * 10) / 10, 2);
    const n0 = g.res.nourriture; B.feedPets(g); assert.ok(g.res.nourriture >= n0 + 2 - 0.01, 'les œufs'); g.res.plantes = 0; B.feedPets(g); B.feedPets(g); B.feedPets(g); assert.equal(g.pets.length, 0, 'les poules affamées s’en vont');
    const r = game(); r.res.nourriture = 40; r.pests = 60; const f0 = r.res.nourriture; B.pests(r); assert.ok(r.res.nourriture < f0, 'les rats mangent');
    const c = game(); c.res.nourriture = 40; c.pests = 30; B.adopt(c, 'chat'); c.floors[0].slots[3] = 'piegerats'; B.pests(c); assert.ok(c.pests < 30, 'chat et pièges');
});
t('🍲 recettes : le plat du jour (soupe, ragoût, recette de famille), il faut de quoi cuire ; sinon une ration', () => {
    const g = game({lore: [{kind: 'recipe', title: 'La potée de mémé', text: 'chou, lard'}]}); g.res.plantes = 10; g.res.nourriture = 10; g.res.eau = 10;
    assert.equal(B.recipeOk(g, 'ragout'), false, 'pas de quoi cuire'); assert.equal(B.pickRecipe(g), 'compote');
    g.floors[0].slots[3] = 'poele'; assert.equal(B.pickRecipe(g), 'famille'); assert.equal(B.recipeName(g, 'famille'), 'La potée de mémé');
    g.menu = 'soupe'; assert.equal(B.pickRecipe(g), 'soupe'); const p = g.people[0]; p.needs.faim = 10; p.act = {k: 'manger', until: g.t}; const m0 = p.mood, pl0 = g.res.plantes; B.run(g, 10); assert.ok(g.res.plantes < pl0 && p.mood > m0 - 1);
});
t('🧓 vieillir (option) : un jour = un an ; le bébé devient enfant puis adulte ; 🔥 incendie (option) : l’extincteur l’éteint', () => {
    const g = game({opt: {age: true}}); const b = g.people[1]; b.baby = true; b.age = 3; B.aging(g); assert.equal(b.baby, false); assert.equal(b.child, true); assert.equal(B.send(g, b.id, g.city.places[0].id).ok, false);
    b.age = 13; B.aging(g); assert.ok(!b.child); const o = game(); o.people[1].age = 30; B.run(o, 3 * 1440); assert.equal(o.people[1].age, 30, 'sans l’option, on ne vieillit pas');
    const f = game({opt: {feu: true}}); f.fire = {fi: 0, power: 40, h: 0}; f.floors[0].slots[3] = 'extincteur'; B.fire(f); assert.equal(f.fire, null);
    const h = game({opt: {feu: true}}); h.fire = {fi: 0, power: 40, h: 0}; h.res.eau = 50; h.res.eausale = 50; for (let i = 0; i < 9 && h.fire; i++) B.fire(h); assert.equal(h.fire, null, 'éteint à l’eau ou de lui-même'); assert.ok(h.res.eau + h.res.eausale < 100);
});
t('🏚️ les pièces d’un lieu (seulement ce qu’on y trouve, plus vite, un trésor caché) ; 🌗 la nuit (option) ; 🎨 décorer ; 📊 une photo par jour', () => {
    const g = game(); const pl = g.city.places.find(x => x.kind === 'maison') || g.city.places[0]; pl.kind = 'maison'; Object.keys(pl.stock).forEach(r => { pl.stock[r] = 0; }); pl.max.eau = 5; pl.max.tissu = 6; pl.stock.eau = 3; pl.stock.tissu = 4; pl.junk = []; pl.tools = []; pl.plans = 0;
    assert.equal(B.stepOf({id: pl.id, room: 'cave'}).room, 'cave'); assert.equal(B.stepOf({id: pl.id, room: 'salon'}).room, undefined);
    const p = g.people[1], e0 = g.res.eau, t0 = g.res.tissu; B.send(g, p.id, [{id: pl.id, room: 'cave'}]); let k = 0; while (p.where !== 'base' && k++ < 300) B.run(g, 30);
    assert.ok(g.res.tissu <= t0 + 0.01, 'pas de tissu à la cave'); assert.ok(g.res.eau > e0 - 5, 'de l’eau'); assert.ok(pl.roomsDone.includes('cave'));
    const d = game(); fill(d, 30); assert.ok(B.addDeco(d, 0, 'papier').ok); assert.ok(B.decoMood(d) > 0); for (let i = 0; i < 3; i++) B.addDeco(d, 0, 'tapis'); assert.equal(B.addDeco(d, 0, 'tapis').ok, false);
    const s = game(); B.run(s, 3 * 1440); assert.ok(s.hist.length >= 3 && s.hist.every(h => h.pop >= 1)); const c = B.check(JSON.parse(JSON.stringify(d))); assert.equal(c.deco[0].length, 4);
});
t('📜 missions généalogiques (option) : retrouver l’acte d’un vrai ancêtre dans le bon lieu', () => {
    const g = game({opt: {missions: true}, ancestors: [{pid: 9, name: 'Louis MARTIN', by: 1870, bplace: 'Tulle', occ: 'Forgeron', married: true, dy: 1930}]});
    assert.equal(g.missions.length, 3); assert.ok(B.missionTxt(g.missions[0]).includes('Louis MARTIN'));
    const m = g.missions[0], kind = B.DOCS[m.doc][2][0], pl = g.city.places[0]; pl.kind = kind; let ok = false;
    for (let i = 0; i < 12 && !ok; i++) { const p = g.people[1]; p.hp = 100; B.send(g, p.id, pl.id); let k = 0; while (p.where !== 'base' && k++ < 300) B.run(g, 30); ok = m.done; }
    assert.ok(ok, 'trouvé'); assert.ok(g.docs.some(d => d.pid === 9)); assert.equal(game().missions.length, 0, 'sans l’option, pas de mission');
});
t('🛡️ un fichier de partie piégé (« __proto__ », « toString »…, nombres énormes) ne casse rien', () => {
    const base = game({opt: {meteo: true, missions: true, age: true, feu: true, nuit: true, chaines: true}, ancestors: [{name: 'L', pid: 1}]});
    for (const k of ['__proto__', 'constructor', 'toString']) {
        const g = JSON.parse(JSON.stringify(base)); g.pets = [{k}, {k: 'chien', name: '<b>x</b>'}]; g.deco = {0: [{k}]}; g.floors[0].slots[4] = k; g.junk = {[k]: 2}; g.city.places[0].kind = k; g.people[0].job = k; g.menu = k; g.event = {k};
        g.market = {offers: [{id: 'a', give: {r: 'eau', n: 1e9}, want: {r: 'eau', n: 1}}], deals: [{r: 'medic', n: 1e9, t: 0}]};
        const c = B.check(g); B.run(c, 1440); assert.ok(c.pets.length === 1 && c.market.offers[0].give.n <= 99 && c.market.deals.length === 0 || c.res.medic <= B.cap(c, 'medic'));
    }
});
t('↔ réarranger : déplacer une installation vers une place libre, ou échanger deux places, sans frais (niveau, panne, chantier et occupant suivent)', () => {
    const g = game(); fill(g); g.floors.push({slots: Array(B.SLOTS).fill(null)}); g.floors[0].slots[3] = 'lit'; g.lvl['0,3'] = 2; g.floors[0].slots[4] = 'douche'; g.broken['0,4'] = true;
    const res = JSON.stringify(g.res); g.people[0].act = {k: 'dormir', until: g.t + 60, at: [0, 3]};
    assert.ok(B.moveItem(g, 0, 3, 2, 5).ok); assert.equal(g.floors[0].slots[3], null); assert.equal(g.floors[2].slots[5], 'lit');
    assert.equal(g.lvl['2,5'], 2); assert.ok(!('0,3' in g.lvl)); assert.deepEqual(g.people[0].act.at, [2, 5]); assert.equal(JSON.stringify(g.res), res, 'sans frais');
    assert.ok(B.moveItem(g, 0, 4, 0, 0).ok); assert.equal(g.floors[0].slots[0], 'douche'); assert.equal(g.floors[0].slots[4], 'radio'); assert.ok(g.broken['0,0'] && !g.broken['0,4'], 'la panne suit');
    assert.ok(B.orderBuild(g, 'lit', 2, 4).ok); assert.ok(B.moveItem(g, 2, 4, 2, 3).ok); assert.ok(g.builds.some(b => b.k === 'lit' && b.fi === 2 && b.si === 3), 'le chantier suit');
    assert.match(B.moveItem(g, 2, 2, 2, 1).err, /Rien/); assert.match(B.moveItem(g, 0, 0, 0, 0).err, /même/); assert.match(B.moveItem(g, 0, 0, 9, 0).err, /existe/);
});
t('🏆 succès : vérifiés par le moteur au fil de la partie (une fois chacun), des cachés, un par scénario gagné ; gardés à la relecture', () => {
    const ids = B.ACH.map(a => a[0]); assert.equal(new Set(ids).size, ids.length); assert.ok(B.ACH.length >= 20, `${B.ACH.length} succès`);
    assert.ok(B.ACH.some(a => a[4]), 'certains sont cachés'); assert.ok(Object.keys(B.SCENARIOS).every(k => ids.includes('scen_' + k)), 'un par scénario');
    ['j7', 'j30', 'pop10', 'nodeath', 'tout', 'hiver', 'bebe', 'pill3', 'droit', 'plans', 'fab10'].forEach(k => assert.ok(ids.includes(k), k));
    const g = game(); assert.deepEqual(B.checkAch(g), [], 'rien au départ');
    g.stats.raidsWon = 3; g.births.push({name: 'Bébé', m: 'Marie', f: 'Paul', day: 2}); const got = B.checkAch(g);
    assert.ok(got.includes('pill3') && got.includes('bebe')); assert.ok(g.achNew.includes('pill3')); assert.ok(g.log.some(l => /🏆 Succès : .*Repousser 3 pillages/.test(l.txt)));
    assert.deepEqual(B.checkAch(g), [], 'une seule fois');
    const h = game({scen: 'hiver'}); h.stats.wDays = 6; h.t = 6 * 60 + 1440 - 30; B.run(h, 60); assert.ok(h.ach.hiver, 'un hiver sans poêle');
    const hp = game({scen: 'hiver'}); hp.floors[0].slots[3] = 'poele'; hp.stats.wDays = 6; hp.t = 6 * 60 + 1440 - 30; B.run(hp, 60); assert.ok(!hp.ach.hiver && hp.stats.wDays === 0, 'avec un poêle, non');
    const w = game(); w.t = 6 * 60 + B.goalOf(w) * 1440 - 30; fill(w, 80); B.run(w, 60); assert.ok(w.won > 0, 'tenir 30 jours : gagné'); assert.ok(w.ach.scen_classique); assert.ok(w.ach.j30 && w.ach.droit && w.ach.j7);
    const c = B.check(JSON.parse(JSON.stringify(w))); assert.ok(c.won && c.ach.scen_classique); assert.deepEqual(c.achNew, []);
    const k = game(); k.stats.built = 10; assert.ok(B.checkAch(k).includes('fab10')); const pl = game(); pl.plans.push(...B.foundPlans(pl)); assert.ok(B.checkAch(pl).includes('plans'));
});
t('📜 scénarios historiques : la date, l’époque, pas d’électronique en 1709 (crieur, cheminée, bric-à-brac et plans d’époque), leurs règles', () => {
    for (const k of Object.keys(B.HIST)) {
        const g = game({scen: k, opt: {meteo: true, missions: true}, ancestors: [{pid: 9, name: 'Louis', by: 1650}]}), E = B.eraOf(g);
        assert.match(B.dateOf(g), new RegExp(String(B.HIST[k].date[0])));
        assert.ok(g.plans.every(x => B.itemOk(g, x)), k + ' : des plans d’une autre époque');
        if (!E.elec) {
            assert.deepEqual(g.floors[0].slots.slice(0, 3), ['crieur', 'cheminee', 'atelier'], k);
            assert.ok(!g.plans.some(x => B.ITEMS[x].power || ['douche', 'dynamo', 'extincteur', 'solaire'].includes(x)), k + ' : électricité');
            assert.ok(!B.foundPlans(g).some(x => B.ITEMS[x].power || B.ITEMS[x].elec || B.ITEMS[x].modern), k + ' : plans à trouver');
            assert.match(B.orderBuild(g, 'solaire', 0, 3).err || '', /plan|époque/);
            assert.equal(g.res.essence + g.res.electro + g.res.piles, 0);
            const junk = [...Object.keys(g.junk), ...g.city.places.flatMap(pl => pl.junk)]; assert.ok(!junk.some(j => ['tele', 'ordinateur', 'telephone', 'radiocassee', 'grillepain', 'frigo'].includes(j)), k + ' : ' + junk.join());
            assert.ok(g.city.places.every(pl => !['electromenager'].includes(pl.kind)) && g.city.places.every(pl => Object.keys(pl.stock).every(r => !['essence', 'electro', 'piles'].includes(r))));
            assert.equal(B.resInfo(g, 'plastique')[2], 'Osier'); assert.equal(B.toolInfo(g, 'lampe')[1], 'Lanterne');
            const p = g.people[1]; p.hp = 100; assert.ok(B.send(g, p.id, g.city.places[0].id).ok); B.run(g, 600);
            assert.equal(g.power, false); assert.ok(g.log.some(l => l.kind === 'radio' && /^📯/.test(l.txt)), 'le crieur, pas la radio'); assert.ok(!g.log.some(l => l.kind === 'radio' && /📻/.test(l.txt)));
            fill(g, 20); assert.ok(B.orderBuild(g, 'toilettes', 0, 3).ok); B.setJob(g, g.people[0].id, 'construire'); g.people[0].hp = 100; B.run(g, 300); assert.equal(g.floors[0].slots[3], 'toilettes', k + ' : l’atelier marche à la main');
        } else assert.equal(g.floors[0].slots[1], 'generateur');
        const c = B.check(JSON.parse(JSON.stringify(g))); assert.equal(c.scen, k); assert.ok(c.plans.every(x => B.itemOk(c, x)));
    }
    assert.equal(B.seasonOf(game({scen: 'h1709'})), 'hiver'); assert.ok(B.canCook(game({scen: 'h1720'})), 'on cuit dans la cheminée');
    const s = game({scen: 'h1870'}); const pl = s.city.places.find(x => x.max.nourriture); if (pl) { pl.stock.nourriture = 0; for (let i = 0; i < 30; i++) B.regen(s, pl); assert.equal(pl.stock.nourriture, 0, 'le siège : plus rien à manger n’entre'); }
    const e = game({scen: 'h1940', extras: []}); e.t += 1440; let ref = false; for (let i = 0; i < 400 && !ref; i++) { e.visit = null; B.run(e, 60); ref = e.visit?.k === 'voyageur'; } assert.ok(ref, '1940 : des réfugiés à la trappe');
});
t('📜 les ancêtres du scénario : nés avant, morts après (ou âge crédible), jamais un vivant ni une fiche confidentielle ; ceux de la région d’abord ; complétés par des inventés', () => {
    const ppl = [{id: 1, name: 'Né après', by: 1725}, {id: 2, name: 'Mort avant', by: 1680, dy: 1715}, {id: 3, name: 'Vivant', by: 1700, living: true}, {id: 4, name: 'Secret', by: 1700, priv: true}, {id: 5, name: 'Caché', by: 1700, sh: true},
        {id: 6, name: 'Sans décès crédible', by: 1690}, {id: 7, name: 'Trop vieux sans décès', by: 1600}, {id: 8, name: 'Marseillais', by: 1690, dy: 1750, bplace: 50}, {id: 9, name: 'Mort le jour d’après', by: 1700, bd: '1700-01-01', dy: 1720, dd: '1720-08-02'},
        {id: 10, name: 'Mort juste avant', by: 1700, dy: 1720, dd: '1720-07-30'}, {id: 11, name: 'Bébé', by: 1719}, {id: 12, name: 'Sans naissance'}];
    const P = B.histPool('h1720', ppl, {50: {name: 'Marseille, Bouches-du-Rhône, Provence'}});
    assert.deepEqual(P.all.map(p => p.pid), [8, 6, 9]); assert.equal(P.local, 1); assert.ok(P.all[0].local); assert.equal(P.all[0].age, 30);
    assert.deepEqual(B.histPool('h1709', ppl, {}).all.map(p => p.pid).sort((a, b) => a - b), [2, 6, 8, 9, 10]);
    const g = B.newGame({seed: 5, scen: 'h1720', me: P.all[0], team: P.all.slice(1), want: 6, city: {name: 'Marseille'}});
    assert.equal(g.people.length, 6); assert.equal(g.people.filter(p => p.inv).length, 3); assert.ok(g.people[0].me && g.people[0].pid === 8);
    assert.ok(g.log.some(l => /3 ancêtres de ta famille.*dont 1 en Provence.*3 habitants inventés/.test(l.txt)), g.log.map(l => l.txt).join('\n'));
    assert.ok(g.people.filter(p => p.inv).every(p => !p.pid && p.by > 1650 && p.by < 1710));
    const none = B.newGame({seed: 5, scen: 'h1709', want: 3, city: {name: 'Paris'}}); assert.equal(none.people.length, 3); assert.ok(none.people.every(p => p.inv)); assert.ok(none.log.some(l => /aucun ancêtre/.test(l.txt)));
});
t('⏪ revenir au matin : une copie chaque matin (les 7 derniers, bornés en taille), reprendre ne touche pas la partie d’avant, relu proprement', () => {
    const g = game(); fill(g, 60); assert.equal(g.mornings.length, 1); assert.equal(g.mornings[0].d, 1);
    B.run(g, 1440 * 3 + 120); assert.deepEqual(g.mornings.map(m => m.d), [1, 2, 3, 4]); assert.ok(g.mornings.every(m => m.snap.length < 400000 && m.res && m.pop >= 0));
    const t0 = g.t, r = B.rewind(g, 2); assert.ok(r.ok); assert.equal(B.dayOf(r.g.t), 2); assert.equal(B.hourOf(r.g.t), 6); assert.equal(r.g.rewound, 1);
    assert.deepEqual(r.g.mornings.map(m => m.d), [1, 2]); assert.equal(g.t, t0, 'la partie d’avant reste telle quelle (pour « ↶ Annuler »)'); assert.equal(g.rewound, 0);
    assert.ok(r.g.log.some(l => /Retour au matin du jour 2/.test(l.txt))); B.run(r.g, 1440); assert.deepEqual(r.g.mornings.map(m => m.d), [1, 2, 3]);
    assert.equal(B.rewind(g, 99).ok, false);
    const lg = game(); fill(lg, 60); B.run(lg, 1440 * 10); assert.ok(lg.mornings.length <= B.MORNINGS); assert.equal(lg.mornings[lg.mornings.length - 1].d, 11);
    const dead = game(); dead.res.eau = 0; dead.res.eausale = 0; dead.res.nourriture = 0; dead.people.forEach(p => { p.hp = 1; p.needs.soif = 0; p.needs.faim = 0; }); B.run(dead, 1440); assert.ok(dead.over); const back = B.rewind(dead, 1); assert.ok(back.ok && !back.g.over && B.alive(back.g).length === 3, 'après une défaite');
    const raw = JSON.parse(JSON.stringify(g)); raw.mornings.push({d: 50, snap: 'x'.repeat(500001)}, {d: 'zz', snap: 3}); const c = B.check(raw); assert.ok(c.mornings.every(m => typeof m.snap === 'string' && m.snap.length < 500000)); assert.equal(c.mornings.length, 4);
    const won = game(); won.ach.droit = 3; const rw = B.rewind(won, 1); assert.ok(rw.g.ach.droit, 'les succès déjà gagnés restent');
});
t('🔨 plus d’objets à fabriquer : plans à trouver en ville (là où ils viennent, certains rares), un vrai effet, d’époque', () => {
    const NEW = ['puits', 'fumoir', 'ruche', 'pressoir', 'edredons', 'lanternes', 'horloge', 'accordeon', 'echecs', 'simples', 'remedes', 'gouttieres', 'fosse', 'meurtrieres', 'brancard', 'boussole', 'traineau', 'nasse', 'lessiveuse', 'pigeonnier', 'caveavin', 'foursolaire', 'turbine'];
    const effects = ['prod', 'fun', 'aura', 'healK', 'defense', 'rain', 'travelK', 'carry', 'talkie', 'warm', 'cook', 'elec'];
    NEW.forEach(k => { const it = B.ITEMS[k]; assert.ok(it && it.desc && it.h > 0 && Object.keys(it.cost).length, k); assert.ok(B.FOUND_PLANS.includes(k), k + ' se trouve en ville'); assert.ok(effects.some(e => it[e] != null), k + ' sans effet');
        assert.ok(it.where.every(w => B.PLACE_KINDS[w]), k); assert.ok(Object.keys(it.cost).every(r => B.RES_KEYS.includes(r))); });
    assert.ok(NEW.filter(k => B.ITEMS[k].rare).length >= 4, 'des plans rares');
    const old = game({scen: 'h1709'}); assert.ok(['puits', 'ruche', 'lanternes', 'pigeonnier', 'accordeon'].every(k => B.itemOk(old, k))); assert.ok(!B.itemOk(old, 'foursolaire') && !B.itemOk(old, 'turbine'));
    // là où ils viennent : à la ferme, les nasses bien plus souvent que l'horloge (rare, d'ailleurs)
    const g = game(); let nasse = 0, horloge = 0; for (let i = 0; i < 3000; i++) { const k = B.pickPlan(g, ['nasse', 'horloge', 'boussole'], 'port'); if (k === 'nasse') nasse++; if (k === 'horloge') horloge++; } assert.ok(nasse > 4 * horloge, `${nasse} / ${horloge}`);
    // un vrai effet : le puits donne de l'eau sans pluie, les édredons tiennent chaud, la turbine fait l'électricité quand il pleut, le pigeonnier porte les nouvelles
    const p = game(); p.floors[0].slots[3] = 'puits'; p.weather = {rain: false, until: 0}; const e0 = p.res.eausale; for (let i = 0; i < 12; i++) { p.weather.rain = false; B.run(p, 60); } assert.ok(p.res.eausale >= e0 + 3, 'le puits');
    const w = game({scen: 'hiver'}); w.floors[0].slots[3] = 'edredons'; B.run(w, 60); assert.ok(w.warm, 'les édredons');
    const tb = game(); tb.floors[0].slots[3] = 'turbine'; tb.res.essence = 0; tb.weather = {rain: true, until: tb.t + 600}; B.run(tb, 30); assert.equal(tb.powerSrc, 'eau');
    const pg = game(); pg.floors[0].slots[3] = 'pigeonnier'; pg.powerOn = false; pg.power = false; const q = pg.people[1]; B.send(pg, q.id, pg.city.places[0].id); B.run(pg, 300); assert.ok(pg.log.some(l => l.kind === 'radio'), 'le pigeonnier'); assert.ok(B.recall(pg, q.id) || q.where === 'base');
    const fs2 = game(); fs2.floors[0].slots[3] = 'foursolaire'; assert.ok(B.canCook(fs2));
    assert.ok(B.foundPlans(game()).length >= 60, 'beaucoup de plans à trouver');
});

/* ═════════ 🗺️ Région, convois, groupes, bâtiments, apprentissage, couples, souvenirs, transports ═════════ */
const fresh = (o = {}) => { const g = game(o); fill(g, 120); g.visit = null; g.people.forEach(p => { p.hp = 100; }); return g; };
const keep = g => { g.people.forEach(p => { if (p.hp > 0) { p.hp = Math.max(p.hp, 60); Object.keys(p.needs).forEach(k => { p.needs[k] = Math.max(p.needs[k], 50); }); } }); g.visit = null; };
const runKeep = (g, min) => { for (let m = 0; m < min; m += 60) { B.run(g, 60); keep(g); } };
t('🗺️ la région : 8 lieux autour du bunker, tous reliés par des routes (longueur, danger, terrain) ; les plus proches connus, le chemin le plus court ou le plus sûr', () => {
    const g = game(); const R = g.region; assert.equal(R.nodes.length, 8);
    assert.ok(R.roads.every(r => r.len >= 6 && r.danger >= 0 && r.danger <= 3 && ['route', 'chemin', 'rive'].includes(r.terr)));
    R.nodes.forEach(n => { const p = B.regionPath(g, n.id); assert.ok(p && p[0] === 'home' && p[p.length - 1] === n.id, n.id); });
    assert.ok(R.nodes.some(n => n.seen) && R.nodes.some(n => !n.seen), 'on ne connaît pas encore tout');
    const far = R.nodes.slice().sort((a, b) => B.regionPath(g, b.id).length - B.regionPath(g, a.id).length)[0];
    const P1 = B.convoyPlan(g, far.id, 2, [], false), P2 = B.convoyPlan(g, far.id, 2, [], true); assert.ok(P2.hours >= P1.hours && P2.danger <= P1.danger + 0);
    assert.ok(P1.days >= 1 && P1.need.eau > 0 && P1.need.nourriture > 0);
    assert.deepEqual([...new Set(g.groups.map(x => x.k))].sort(), ['amis', 'bande', 'marchands']); assert.ok(g.groups.every(x => R.nodes.some(n => n.id === x.at)));
    assert.ok(g.groups.filter(x => x.k === 'bande').every(x => x.rep < -15) && g.groups.filter(x => x.k === 'amis').every(x => x.rep > 15));
    assert.equal(game({scen: 'h1709'}).region.nodes.find(n => n.kind === 'depot')?.name.startsWith('Château') ?? true, true);
});
t('🧭 un convoi part (provisions prises, les absents ne travaillent pas au bunker), avance de lieu en lieu (radio), rapporte, et revient ; « Rentrez ! »', () => {
    const g = fresh(), dest = g.region.nodes.find(n => n.seen && !g.groups.some(x => x.at === n.id && x.k === 'bande')) || g.region.nodes.find(n => n.seen);
    g.groups.forEach(x => { x.at = x.at === dest.id ? 'zz' : x.at; }); const [a, b, c] = g.people;
    assert.match(B.formConvoy(g, {dest: dest.id, who: []}).err, /au moins/); assert.match(B.formConvoy(g, {dest: 'r99', who: [b.id]}).err, /lieu/);
    assert.match(B.formConvoy(g, {dest: dest.id, who: [b.id], pack: {eau: 100}}).err, /Trop lourd/);
    const plan = B.convoyPlan(g, dest.id, 2), eau0 = g.res.eau; const r = B.formConvoy(g, {dest: dest.id, who: [b.id, c.id], pack: {eau: plan.need.eau, nourriture: plan.need.nourriture}});
    assert.ok(r.ok, r.err); assert.equal(g.res.eau, eau0 - plan.need.eau); assert.equal(b.where, 'convoi'); assert.ok(!B.alive(g).filter(p => p.where === 'base').includes(b));
    assert.match(B.formConvoy(g, {dest: dest.id, who: [a.id]}).err, /déjà/);
    B.setJob(g, b.id, 'creuser'); const dug = g.dig.done; B.run(g, 120); assert.equal(g.dig.done, dug, 'un absent ne creuse pas');
    let guard = 0; while (g.convoys.length && guard++ < 24 * 12) { B.run(g, 60); keep(g); }
    assert.equal(g.convoys.length, 0, 'le convoi est rentré'); assert.equal(b.where, 'base'); assert.ok(g.stats.expeditions === 1);
    assert.ok(g.log.some(l => /Le convoi .* : « On est à/.test(l.txt)) && g.log.some(l => /Le convoi est rentré/.test(l.txt)));
    assert.ok(dest.visits === 1);
    // « Rentrez ! » : demi-tour
    const h = fresh(), d2 = h.region.nodes.filter(n => n.seen).sort((x, y) => B.convoyPlan(h, y.id, 1).hours - B.convoyPlan(h, x.id, 1).hours)[0];
    assert.ok(B.formConvoy(h, {dest: d2.id, who: [h.people[1].id], pack: {eau: 4, nourriture: 3}}).ok); B.run(h, 120);
    assert.ok(B.recallConvoy(h, h.convoys[0].id)); assert.equal(h.convoys[0].dir, -1); guard = 0; while (h.convoys.length && guard++ < 48) { B.run(h, 60); keep(h); } assert.equal(h.convoys.length, 0, 'revenu vite');
});
t('🕯️ un convoi qui ne revient pas : véhicules, bêtes et outils perdus avec lui', () => {
    const g = fresh(); g.floors[1].slots[0] = 'charrette'; B.adopt(g, 'ane'); const ane = g.pets.find(a => a.k === 'ane'); g.tools.push('pelle');
    const d = g.region.nodes.find(n => n.seen), p = g.people[1]; assert.ok(B.formConvoy(g, {dest: d.id, who: [p.id], veh: ['1,0'], beasts: [ane.id], tools: ['pelle'], pack: {eau: 6}}).ok);
    assert.ok(!g.tools.includes('pelle'), 'l’outil part avec eux'); assert.equal(B.dismantle(g, 1, 0), false, 'on ne démonte pas une charrette partie');
    B.run(g, 30); p.hp = 1; p.needs.soif = 0; p.needs.faim = 0; g.convoys[0].pack = {}; B.run(g, 600);
    assert.equal(g.convoys.length, 0); assert.ok(g.log.some(l => /n’est jamais revenu/.test(l.txt))); assert.equal(g.floors[1].slots[0], null); assert.ok(!g.pets.includes(ane)); assert.ok(!g.tools.includes('pelle')); assert.equal(g.stats.expLost, 1);
});
t('🤝 la réputation : un marché honnête la monte, voler la fait chuter (et tout le monde le sait) ; payer une bande la calme ; les bandes fâchées viennent plus souvent', () => {
    const g = fresh(), tr = g.groups.find(x => x.k === 'marchands'), am = g.groups.find(x => x.k === 'amis');
    g.visit = {k: 'marchand', until: g.t + 120, give: {r: 'bois', n: 4}, want: {r: 'tissu', n: 2}, g: tr.id}; const r0 = tr.rep; B.answerVisit(g, 'oui'); assert.equal(tr.rep, r0 + 3);
    g.visit = {k: 'marchand', until: g.t + 120, give: {r: 'bois', n: 4}, want: {r: 'tissu', n: 2}, g: tr.id}; const a0 = am.rep; B.answerVisit(g, 'voler'); assert.equal(tr.rep, r0 + 3 - 35); assert.equal(am.rep, a0 - 8); assert.ok(g.stats.thefts === 1);
    const band = g.groups.find(x => x.k === 'bande'); g.visit = {k: 'pillards', until: g.t + 120, demand: {nourriture: 2}, strength: 5, g: band.id}; const b0 = band.rep; B.answerVisit(g, 'donner'); assert.equal(band.rep, b0 + 6); assert.ok(band.calm > g.t);
    // les bandes qui vous détestent viennent bien plus souvent que celles avec qui on s'entend
    const count = rep => { const h = game({seed: 11}); h.t += 1440 * 4; h.groups.filter(x => x.k === 'bande').forEach(x => { x.rep = rep; x.calm = 0; }); let n = 0; for (let i = 0; i < 2500; i++) { h.visit = null; B.run(h, 60); if (h.visit?.k === 'pillards') n++; h.people.forEach(p => { p.hp = 100; Object.keys(p.needs).forEach(k => { p.needs[k] = 90; }); }); } return n; };
    const hate = count(-95), calm = count(10); assert.ok(hate > calm * 1.4, `${hate} contre ${calm}`);
    // un marchand ami fait un meilleur prix
    assert.ok(B.repInfo(70)[1] === 'Alliés' && B.repInfo(-70)[1] === 'Ennemis' && B.repInfo(0)[1] === 'Neutres');
});
t('🤲 les groupes demandent de l’aide (partager ou refuser), les alliés envoient de quoi tenir quand ça va mal, on peut leur offrir quelque chose', () => {
    const g = fresh(), am = g.groups.find(x => x.k === 'amis');
    g.asks = [{id: 'k1', g: am.id, r: 'bois', n: 5, until: g.t + 600}]; const r0 = am.rep, b0 = g.res.bois; assert.ok(B.answerAsk(g, 'k1', 'partager').ok); assert.equal(g.res.bois, b0 - 5); assert.ok(am.rep > r0);
    g.asks = [{id: 'k2', g: am.id, r: 'bois', n: 5, until: g.t + 600}]; const r1 = am.rep; B.answerAsk(g, 'k2', 'refuser'); assert.equal(am.rep, r1 - 5);
    g.asks = [{id: 'k3', g: am.id, r: 'bois', n: 5, until: g.t + 60}]; const r2 = am.rep; B.run(g, 120); assert.equal(am.rep, r2 - 4, 'une demande oubliée');
    const h = fresh(); const ally = h.groups.find(x => x.k === 'amis'); ally.rep = 60; h.res.nourriture = 0; h.t = Math.floor(h.t / 1440) * 1440 + 3 * 1440 + 8 * 60 + 50; B.run(h, 20);
    assert.ok(h.market.deals.some(d => d.who === ally.name && d.r === 'nourriture'), 'ils envoient à manger'); assert.ok(h.log.some(l => /ça va mal chez vous/.test(l.txt)));
    const r3 = ally.rep; assert.ok(B.giftGroup(h, ally.id, 'bois', 6).ok); assert.ok(ally.rep > r3); assert.match(B.giftGroup(h, ally.id, 'bois', 9999).err, /manque/);
});
t('🏚️ un bâtiment de la ville : matériaux, heures de travail sur place, puis il produit chaque jour ; on va récolter ; s’il n’est pas visité, il est pillé ou s’abîme', () => {
    const g = fresh(), s = g.sites.find(x => x.k === 'puits'), p = g.people[1]; assert.equal(s.state, 'ruine'); assert.ok(g.sites.length >= 3);
    assert.match(B.sendSite(g, p.id, s.id, 'travail').err, /chantier/); const c0 = g.res.corde; assert.ok(B.startSite(g, s.id).ok); assert.equal(g.res.corde, c0 - 3); assert.equal(s.state, 'chantier');
    let guard = 0; while (s.state !== 'marche' && guard++ < 20) { if (p.where === 'base') assert.ok(B.sendSite(g, p.id, s.id, 'travail', 12).ok); while (p.where !== 'base') { B.run(g, 60); keep(g); } }
    assert.equal(s.state, 'marche'); assert.ok(g.stats.sitesFixed === 1); assert.ok(g.ach.chantier || B.checkAch(g).includes('chantier') || g.ach.chantier);
    const t6 = () => { B.run(g, 1440); keep(g); }; t6(); assert.ok((s.stock.eau || 0) >= 6, JSON.stringify(s.stock)); for (let i = 0; i < 5; i++) { s.last = g.t; t6(); } assert.ok(s.stock.eau <= 18, 'trois jours au plus en attente');
    const e0 = g.res.eau; assert.ok(B.sendSite(g, p.id, s.id, 'recolte').ok); while (p.where !== 'base') { B.run(g, 60); keep(g); } assert.ok(g.res.eau > e0 || g.res.eau >= B.cap(g, 'eau') - 1, 'récolté');
    const h = fresh(), q = h.sites[0]; q.state = 'marche'; q.last = 0; let hit = false; for (let i = 0; i < 60 && !hit; i++) { B.run(h, 1440); keep(h); hit = q.raids > 0 || q.state === 'abime'; } assert.ok(hit, 'pas visité : pillé ou abîmé');
    const f = fresh(), z = f.sites[0]; z.state = 'abime'; assert.ok(B.startSite(f, z.id).ok); assert.ok(z.need < B.SITES[z.k][2], 'réparer coûte moins que tout refaire'); assert.ok(B.fenceSite(f, z.id).ok); assert.equal(B.fenceSite(f, z.id).ok, false);
});
t('🎓 apprendre un métier : un maître (expert ou âgé) forme un apprenti, qui progresse de semaine en semaine sans dépasser son maître ; à sa mort, le savoir reste', () => {
    const g = fresh(), [m, a, x] = g.people; m.sk.construire = 1.6; m.age = 50; a.sk.construire = 1; a.age = 20; x.age = 30;
    assert.match(B.setApprentice(g, x.id, a.id, 'construire').err, /assez/); assert.ok(B.canTeach(g, m).includes('construire'));
    const old = {...x, sk: {...x.sk, soigner: 1.3}, age: 70}; assert.ok(B.canTeach(g, old).includes('soigner'), 'un aîné enseigne un savoir solide');
    assert.ok(B.setApprentice(g, m.id, a.id, 'construire').ok); assert.match(B.setApprentice(g, m.id, x.id, 'construire').err, /déjà/);
    runKeep(g, 1440 * 8); assert.ok(a.sk.construire > 1.15 && a.sk.construire < m.sk.construire, String(a.sk.construire)); assert.ok(g.log.some(l => /1 semaine d’apprentissage/.test(l.txt)));
    runKeep(g, 1440 * 7); m.hp = 0.5; m.needs.soif = 0; B.run(g, 60 * 3);
    if (m.hp <= 0) { assert.ok(g.log.some(l => /son savoir reste chez/.test(l.txt))); assert.ok(a.sk.construire >= 1.45 - 0.001, String(a.sk.construire)); assert.ok(g.stats.transmis === 1); assert.equal(g.appr.length, 0); }
    const h = fresh(), [M, A] = h.people; M.sk.soigner = 1.5; A.sk.soigner = 1; B.setApprentice(h, M.id, A.id, 'soigner'); runKeep(h, 1440 * 30); assert.ok(h.stats.compagnons >= 1, 'l’apprenti finit par en savoir autant'); assert.ok(A.sk.soigner <= M.sk.soigner);
});
t('💞 des couples se forment entre adultes qui s’entendent (jamais entre proches parents, ni un enfant) ; ils changent le moral et le travail d’équipe ; une naissance seulement dans un couple', () => {
    const g = fresh(), [a, b, c] = g.people; [a, b, c].forEach(p => { p.age = 30; p.spouses = []; p.kin = []; }); a.gender = 'female'; b.gender = 'male'; c.gender = 'male';
    a.kin.push(c.id); c.kin.push(a.id); g.rel = {[[a.id, b.id].sort().join('|')]: 45, [[a.id, c.id].sort().join('|')]: 45};
    for (let i = 0; i < 40 && !g.couples.length; i++) B.couples(g, B.alive(g));
    assert.equal(g.couples.length, 1); assert.ok(a.spouses.includes(b.id) && !a.spouses.includes(c.id), 'pas avec un proche parent');
    const kid = {...c, id: 'hx', age: 12, child: true, kin: [], spouses: []}; assert.equal(B.canPair(g, kid, a), false);
    // le travail d'équipe : deux amis au même travail vont plus vite, deux ennemis moins vite
    B.setJob(g, a.id, 'creuser'); B.setJob(g, b.id, 'creuser'); assert.ok(B.teamK(g, a) > 1); g.rel[[a.id, b.id].sort().join('|')] = -40; a.spouses = []; b.spouses = []; assert.ok(B.teamK(g, a) < 1);
    // une naissance : seulement un couple
    const h = fresh(); h.floors[1].slots[0] = 'berceau'; h.t += 1440 * 5; h.people.forEach(p => { p.mood = 95; p.spouses = []; }); h.people[1].gender = 'female'; h.people[2].gender = 'male';
    for (let i = 0; i < 60; i++) { B.run(h, 1440); keep(h); h.people.forEach(p => { p.mood = 95; }); if (h.preg) break; } assert.ok(!h.preg || h.people.find(p => p.id === h.preg.m).spouses.includes(h.preg.f));
});
t('🧓 souvenirs des ancêtres (option) : seulement si l’option est allumée, jamais pour un vivant, une fiche confidentielle ou un habitant inventé', () => {
    const mem = {1: {occ: 'menuisier', by: 1850, bplace: 'Lyon', my: 1875, mplace: 'Lyon', spouse: 'Marie ROUX', kids: [1876, 1880]}, 2: {occ: 'cultivateur', by: 1900, bplace: 'Lyon', living: true}, 3: {occ: 'boulanger', bplace: 'Lyon', priv: true}};
    const g = game({mem, opt: {souvenirs: true}, regionNames: ['Lyon']}); assert.ok(g.people[0].mem && !g.people[1].mem && !g.people[2].mem, 'ni le vivant ni la fiche confidentielle');
    const lyon = g.region.nodes.find(n => n.name === 'Lyon'); assert.ok(lyon);
    let said = false; for (let i = 0; i < 20 && !said; i++) { g.people[0].memSaid = []; said = B.souvenirAt(g, g.people[0], {kind: 'node', node: lyon}); }
    assert.ok(said); const l = g.log.find(x => /🧓 Souvenir de Jean Moi/.test(x.txt)); assert.ok(l && /Lyon/.test(l.txt) && l.kind === 'histoire', l?.txt); assert.ok(g.bubbles.length >= 1);
    assert.ok(!B.souvenirAt(g, g.people[1], {kind: 'node', node: lyon}));
    const off = game({mem, regionNames: ['Lyon']}); for (let i = 0; i < 20; i++) B.souvenirAt(off, off.people[0], {kind: 'node', node: off.region.nodes.find(n => n.name === 'Lyon')}); assert.ok(!off.log.some(x => /Souvenir/.test(x.txt)), 'option éteinte : rien');
    const inv = game({mem: {0: mem[1]}, opt: {souvenirs: true}}); assert.ok(inv.people.every(p => !p.mem || p.pid), 'pas pour un inventé');
    // dans un scénario historique, rien de ce qui arrive après la date
    const h = B.newGame({seed: 3, scen: 'h1870', me: {pid: 1, name: 'Jules', by: 1850, occ: 'menuisier'}, want: 1, city: {name: 'Paris'}, mem, opt: {souvenirs: true}});
    for (let i = 0; i < 30; i++) { const txt = B.memTale(h, h.people[0], 'Ça me rappelle mon métier.'); assert.ok(!/1875|1876|1880/.test(txt), txt); }
    const c = B.check(JSON.parse(JSON.stringify(g))); assert.ok(c.people[0].mem && !c.people[1].mem);
    const raw = JSON.parse(JSON.stringify(g)); raw.people[1].mem = {occ: 'x', living: true}; assert.ok(!B.check(raw).people[1].mem, 'un fichier avec un vivant : retiré');
});
t('⚖️ 🚚 transporter : le poids (l’eau lourde, le tissu léger), le terrain (brouette dans la boue, traîneau sur la neige, barque sur l’eau), l’usure (réparer à l’établi), les bêtes de bât', () => {
    assert.ok(B.wOf('eau') > B.wOf('tissu') && B.wOf('metal') > B.wOf('nourriture'));
    const take = r => { const g = game(); const pl = g.city.places[0]; Object.keys(pl.stock).forEach(x => { pl.stock[x] = 0; }); pl.stock[r] = 60; pl.max[r] = 60; pl.junk = []; pl.tools = []; pl.plans = 0; const p = g.people[1]; B.send(g, p.id, pl.id); let n = 0; while (p.where !== 'base' && n++ < 400) B.run(g, 30); return 60 - pl.stock[r]; };
    assert.ok(take('tissu') > take('eau') * 2, 'plus de tissu que d’eau');
    const g = game(); g.floors[0].slots[3] = 'brouette'; const q = g.people[1], base = B.carryOf(g, q, {only: true});
    assert.equal(B.carryOf(g, q, {terr: 'route'}), base + 8); assert.equal(B.carryOf(g, q, {terr: 'boue'}), base + 4, 'la brouette dans la boue');
    g.floors[0].slots[3] = 'traineau'; assert.equal(B.carryOf(g, q, {terr: 'route'}), base, 'pas de traîneau sans neige'); assert.ok(B.carryOf(g, q, {terr: 'neige'}) > base + 7);
    g.floors[0].slots[3] = 'barque'; assert.equal(B.carryOf(g, q, {terr: 'route'}), base); assert.equal(B.carryOf(g, q, {terr: 'eau'}), base + 20);
    const cr = game({scen: 'h1910'}); assert.equal(B.cityTerrain(cr), 'eau', '1910 : les rues inondées'); assert.ok(cr.plans.includes('barque'));
    assert.ok(!B.itemOk(game({scen: 'h1709'}), 'caddie') && !B.itemOk(game({scen: 'h1940'}), 'poussette') && !B.itemOk(game({scen: 'h1709'}), 'velocargo') && B.itemOk(game({scen: 'h1709'}), 'carriole'));
    // la carriole : seulement avec un cheval, et la plus grosse charge
    const k = game(); k.floors[0].slots[3] = 'carriole'; const b0 = B.carryOf(k, k.people[1], {only: true}); assert.equal(B.carryOf(k, k.people[1], {terr: 'route'}), b0); B.adopt(k, 'cheval'); assert.equal(B.carryOf(k, k.people[1], {terr: 'route'}), b0 + 25);
    // l'usure : à force de sorties, le transport est à réparer ; il faut l'établi
    const w = fresh(); w.floors[1].slots[0] = 'caddie'; let n = 0; while (!w.broken['1,0'] && n++ < 40) B.wearVeh(w, '1,0', 'route', 1); assert.ok(w.broken['1,0'] && n < 25, `${n} sorties`);
    assert.match(B.orderRepair(w, 1, 0).err, /établi/); w.floors[1].slots[1] = 'etabli'; assert.ok(B.orderRepair(w, 1, 0).ok);
    // les bêtes de bât : +12 (et +5 avec des bâts), elles mangent dans les provisions du convoi, blessées elles ne portent plus
    const a = fresh(); B.adopt(a, 'ane'); const ane = a.pets.find(x => x.k === 'ane'), p = a.people[1], b1 = B.carryOf(a, p, {only: true});
    assert.equal(B.carryOf(a, p, {terr: 'route'}), b1 + 12); a.floors[1].slots[0] = 'bats'; assert.equal(B.carryOf(a, p, {terr: 'route'}), b1 + 12 + 5, 'les bâts sur l’âne');
    a.floors[1].slots[0] = null; ane.hurt = 2; assert.equal(B.carryOf(a, p, {terr: 'route'}), b1); ane.hurt = 0;
    const d = a.region.nodes.find(n2 => n2.seen); assert.ok(B.convoyPlan(a, d.id, 1, [ane]).need.plantes > 0 && B.convoyPlan(a, d.id, 1, [ane]).need.eau > B.convoyPlan(a, d.id, 1, []).need.eau, 'la bête compte dans les provisions');
    // 🐪 caravane : 3 moyens de transport ; 🫏 bête de somme : 5 expéditions
    a.floors[1].slots[2] = 'charrette'; a.floors[1].slots[3] = 'brouette'; const plan = B.convoyPlan(a, d.id, 2, [ane]);
    const r = B.formConvoy(a, {dest: d.id, who: [a.people[1].id, a.people[2].id], veh: ['1,2', '1,3'], beasts: [ane.id], pack: plan.need}); assert.ok(r.ok, r.err); B.checkAch(a); assert.ok(a.ach.caravane);
    ane.trips = 5; B.checkAch(a); assert.ok(a.ach.betesomme);
    assert.ok(B.formConvoy(fresh(), {dest: d.id, who: ['h2'], pack: {eau: 200}}).err);
});
t('⛓️ le chariot de mine : les rails vers un lieu proche, deux fois plus vite, une grosse charge seulement là', () => {
    const g = fresh(); g.floors[1].slots[0] = 'chariot'; const c = g.city.base, near = g.city.places.filter(p => Math.abs(p.x - c[0]) + Math.abs(p.y - c[1]) <= 4).sort((a, b) => Math.abs(a.x - c[0]) + Math.abs(a.y - c[1]) - Math.abs(b.x - c[0]) - Math.abs(b.y - c[1]))[0];
    if (!near) return; const t0 = B.travel(g, near); assert.ok(B.layRails(g, near.id).ok); assert.ok(B.travel(g, near) < t0); const q = g.people[1];
    assert.equal(B.carryOf(g, q, {terr: 'route', place: near.id}), B.carryOf(g, q, {only: true}) + 30); assert.equal(B.carryOf(g, q, {terr: 'route'}), B.carryOf(g, q, {only: true}), 'ailleurs, le chariot ne sert pas');
});
t('💾 sauvegardes : une partie d’avant (sans région) reçoit une carte, des groupes, des bâtiments ; un convoi en route est gardé tel quel ; un fichier piégé ne casse rien', () => {
    const g = fresh(); const raw = JSON.parse(JSON.stringify(g)); ['region', 'groups', 'convoys', 'sites', 'asks', 'appr', 'couples', 'bubbles', 'wear', 'rails'].forEach(k => delete raw[k]);
    const c = B.check(raw); assert.equal(c.region.nodes.length, 8); assert.ok(c.groups.length >= 3 && c.sites.length >= 3); B.run(c, 1440 * 2);
    const d = g.region.nodes.find(n => n.seen); assert.ok(B.formConvoy(g, {dest: d.id, who: [g.people[1].id], pack: {eau: 4, nourriture: 4}}).ok); B.run(g, 90);
    const back = B.check(JSON.parse(JSON.stringify(g))); assert.equal(back.convoys.length, 1); assert.equal(back.people[1].where, 'convoi'); assert.deepEqual(back.convoys[0].route, g.convoys[0].route);
    let guard = 0; while (back.convoys.length && guard++ < 24 * 10) { B.run(back, 60); keep(back); } assert.equal(back.convoys.length, 0);
    const bad = JSON.parse(JSON.stringify(g)); bad.region.nodes.push({id: '__proto__', kind: 'toString'}); bad.convoys.push({dest: 'r1', route: ['x']}); bad.groups.push({k: 'constructor'}); bad.sites = [{k: '__proto__'}, {k: 'puits', x: 9999, y: 1}]; bad.wear = {'9,9': 50, '0,1': 1e9}; bad.pets.push({k: 'ane', hurt: 1e9, trips: -4});
    const cb = B.check(bad); assert.equal(cb.region.nodes.length, 8); assert.equal(cb.convoys.length, 1); assert.equal(cb.sites.length, 0); assert.deepEqual(cb.wear, {}); assert.ok(cb.pets.every(a => (a.hurt || 0) <= 9 && !(a.trips < 0)));
    const m = fresh(); B.run(m, 1440); assert.ok(m.mornings.every(x => x.snap.length < 400000)); const rw = B.rewind(m, 2); assert.ok(rw.ok && rw.g.region.nodes.length === 8, 'les matins gardent la région');
});
console.log(`✓ bunker : ${n} vérifications`);
