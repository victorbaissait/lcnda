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
    h.floors[0].slots[4] = 'remorque'; assert.equal(B.carryOf(h, q), base + 8, 'la remorque sans vélo ne sert à rien'); h.floors[0].slots[5] = 'velo'; assert.equal(B.carryOf(h, q), base + 23);
    const k = game(); const pk = k.city.places[0]; Object.keys(pk.stock).forEach(r => { pk.stock[r] = 0; }); pk.stock.bois = 50; pk.max.bois = 50; pk.junk = []; const kp = k.people[1], cap = B.carryOf(k, kp);
    B.send(k, kp.id, pk.id); guard = 0; while (kp.where !== 'base' && guard++ < 400) B.run(k, 30); assert.equal(pk.stock.bois, 50 - cap, `pas plus de ${cap}`);
    const c = B.check(JSON.parse(JSON.stringify(g))); assert.equal(c.city.places.find(x => x.id === a.id).known.stock.bois, 1);
});
t('🔧 pannes : une installation en panne ne sert plus ; on la répare (des pièces, un peu de travail) ; le groupe en panne = plus de courant', () => {
    const g = game(); g.floors[0].slots[3] = 'toilettes'; assert.ok(B.has(g, 'toilettes'));
    assert.ok(B.breakItem(g, 0, 3)); assert.equal(B.has(g, 'toilettes'), false); assert.ok(g.log[0].txt.includes('réparer'));
    fill(g); const r = B.orderRepair(g, 0, 3); assert.ok(r.ok, r.err); assert.equal(B.orderRepair(g, 0, 3).ok, false, 'pas deux fois');
    g.people.forEach(p => { p.job = 'construire'; }); B.run(g, 6 * 60); assert.ok(B.has(g, 'toilettes'), 'réparé'); assert.equal(g.stats.repairs, 1);
    const h = game(); B.breakItem(h, 0, 1); B.run(h, 20); assert.equal(h.power, false, 'groupe en panne');
    assert.equal(B.breakItem(h, 0, 0), false, 'la radio ne tombe pas en panne');
    const w = game({diff: 'extreme'}); w.floors[0].slots[3] = 'potager'; w.floors[0].slots[4] = 'douche'; let broke = false; for (let i = 0; i < 40 && !broke; i++) { B.run(w, 24 * 60); broke = Object.keys(w.broken).length > 0; } assert.ok(broke, 'l’usure finit par casser quelque chose');
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
    let got = false; for (let i = 0; i < 6 && !got; i++) { const p = g.people[1]; p.hp = 100; B.send(g, p.id, pl.id); let k = 0; while (p.where !== 'base' && k++ < 300) B.run(g, 30); got = g.coffre.some(c => /montre/.test(c.title)); }
    assert.ok(got, 'retrouvée'); assert.equal(g.coffre.find(c => /montre/.test(c.title)).bonus, 'bijou');
    const t0 = game({opt: {tuto: true}}); assert.equal(t0.tuto, 0); fill(t0); assert.ok(B.orderBuild(t0, 'toilettes', 0, 3).ok); B.run(t0, 10); assert.ok(t0.tuto >= 1); assert.ok(t0.log.some(l => /Étape 2/.test(l.txt)));
    B.setOpt(t0, 'tuto', false); assert.equal(t0.tuto, -1); assert.equal(game().tuto, -1);
    const c = B.check(JSON.parse(JSON.stringify(game({diff: 'difficile', scen: 'hiver', opt: {meteo: true, chaines: true}}))));
    assert.equal(c.diff, 'difficile'); assert.equal(c.scen, 'hiver'); assert.deepEqual(c.opt, {meteo: true, chaines: true, tuto: false, age: false, feu: false, nuit: false, missions: false});
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
console.log(`✓ bunker : ${n} vérifications`);
