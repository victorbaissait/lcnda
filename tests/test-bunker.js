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
    assert.deepEqual(g.plans.sort(), ['douche', 'etageres', 'gardemanger', 'lit', 'stockage', 'toilettes']);
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
    assert.equal(B.alive(h).length, 3); assert.ok(h.people.every(p => p.hp > 80), h.people.map(p => p.hp).join());
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
    g.res.eau = 0; g.weather = {rain: true, until: g.t + 600}; B.run(g, 120); const a = g.res.eau;
    const h = game(); h.res.eau = 0; h.floors[0].slots[3] = 'recuperateur'; h.weather = {rain: true, until: h.t + 600}; B.run(h, 120); assert.ok(h.res.eau >= a * 2, `${h.res.eau} contre ${a}`);
    const c = game(); c.res.eau = B.cap(c, 'eau'); c.weather = {rain: true, until: c.t + 600}; B.run(c, 60); assert.ok(c.res.eau <= B.cap(c, 'eau'));
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
console.log(`✓ bunker : ${n} vérifications`);
